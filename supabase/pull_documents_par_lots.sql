-- ═══════════════════════════════════════════════════════════════════════════
-- Correctif synchronisation : pi_documents sorti de l'appel groupé pull_incremental()
--
-- Symptôme : les documents scannés téléversés depuis un poste n'apparaissent pas
-- sur les autres postes, et ~50 % des récupérations groupées échouent (500 / 52x).
-- Cause : pi_documents stocke les scans en base64 dans data (plusieurs Mo par ligne).
-- La récupération groupée renvoyait toutes les lignes en un seul jsonb :
--   · « total size of jsonb array elements exceeds the maximum of 268435455 bytes »
--     (poste neuf ou curseur vide : la table dépasse 256 Mo) ;
--   · « canceling statement due to statement timeout » (8 s pour authenticated).
-- Un seul échec privait le poste de TOUTES les tables, pas seulement des documents.
--
-- Correctif : pull_incremental_v1 reçoit un curseur « futur » pour pi_documents (donc le
-- laisse vide, sans lire les fichiers) ; la fonction ajoute ensuite un lot BORNÉ (~30 Mo)
-- de documents, dans l'ordre de updated_at. Le poste avance son curseur jusqu'au dernier
-- updated_at reçu et récupère la suite au cycle suivant. Les lignes de même updated_at
-- que la borne sont toutes incluses (aucun document sauté) ; au moins une ligne est
-- toujours renvoyée. Un poste neuf rattrape donc l'historique en plusieurs cycles.
--
-- Appliqué sur le projet Menco le 23/10/2026 (migration pull_incremental_documents_par_lots).
-- À exécuter TEL QUEL sur tout autre projet Supabase qui a la fonction pull_incremental
-- de pull_incremental_complet.sql (ex. Zahara). Idempotent.
-- Correction durable prévue : ne transférer que la fiche du document et télécharger le
-- fichier à l'ouverture (ou stocker les scans dans un bucket de fichiers).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.pull_incremental(cursors jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  result jsonb;
  t text;
  cur text;
  rows jsonb;
  c jsonb := coalesce(cursors, '{}'::jsonb);
  cur_docs text := nullif(coalesce(cursors, '{}'::jsonb)->>'pi_documents', '');
  lot_octets constant bigint := 30 * 1024 * 1024;
  borne timestamptz;
begin
  result := public.pull_incremental_v1(c || jsonb_build_object('pi_documents', '9999-12-31T00:00:00Z'));

  select max(updated_at) into borne
  from (
    select updated_at,
           sum(pg_column_size(data)) over (order by updated_at, id) - pg_column_size(data) as avant
    from public.pi_documents
    where cur_docs is null or updated_at > cur_docs::timestamptz
  ) s
  where avant < lot_octets;

  if borne is null then
    rows := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'updated_at', updated_at) order by updated_at, id), '[]'::jsonb)
      into rows
    from public.pi_documents
    where (cur_docs is null or updated_at > cur_docs::timestamptz) and updated_at <= borne;
  end if;
  result := result || jsonb_build_object('pi_documents', rows);

  for t in select jsonb_object_keys(c) loop
    continue when result ? t;
    continue when t !~ '^pi_[a-z0-9_]+$';
    continue when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = t
                     and column_name in ('id','data','updated_at')) < 3;
    cur := c->>t;
    if cur is null or cur = '' then
      execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''data'', data, ''updated_at'', updated_at)), ''[]''::jsonb) from public.%I', t)
        into rows;
    else
      execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''data'', data, ''updated_at'', updated_at)), ''[]''::jsonb) from public.%I where updated_at > $1::timestamptz', t)
        into rows using cur;
    end if;
    result := result || jsonb_build_object(t, rows);
  end loop;
  return result;
end;
$function$;

grant execute on function public.pull_incremental(jsonb) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
