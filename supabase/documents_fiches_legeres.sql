-- ═══════════════════════════════════════════════════════════════════════════
-- Documents scannés « allégés » : la synchro ne transporte que la FICHE du document.
--
-- Problème (23/10/2026) : pi_documents stocke les scans en base64 dans data (plusieurs Mo par ligne,
-- 1,2 Go au total). La récupération groupée pull_incremental() les renvoyait en un seul jsonb :
-- « total size of jsonb array elements exceeds the maximum of 268435455 bytes » et « statement timeout »
-- (~50 % des récupérations en échec, tous les postes privés de toutes les tables, scans invisibles).
--
-- Solution : table pi_documents_meta (fiche sans le fichier : data - 'blob', marquée _sans_contenu) tenue à jour
-- par déclencheur ; pull_incremental() la sert aux postes qui envoient _docs_legers = 'oui' ; les anciens postes
-- continuent de recevoir des lots bornés (~30 Mo) de documents complets. Le fichier se télécharge à l'ouverture
-- (docAssurerContenu dans l'ERP). pull_documents_meta(cursor) sert le repli par table.
--
-- Appliqué sur le projet Menco le 23/10/2026. À exécuter sur tout autre projet qui a pull_incremental
-- (ex. Zahara). Prérequis : pull_incremental_complet.sql (pull_incremental_v1 + wrapper).
--
-- ⚠️ Exécuter ÉTAPE PAR ÉTAPE (SQL Editor) : « drop trigger » prend un verrou exclusif sur pi_documents et peut attendre
-- longtemps ; l'ancien script supabase/pull_documents_par_lots.sql est remplacé par l'étape 5.
-- Idempotent sauf indication.
-- ═══════════════════════════════════════════════════════════════════════════

-- Étape 1 — table des fiches (aucun accès direct : lecture par les fonctions security definer uniquement)
create table if not exists public.pi_documents_meta (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists pi_documents_meta_updated_idx on public.pi_documents_meta (updated_at);
alter table public.pi_documents_meta enable row level security;
revoke all on public.pi_documents_meta from anon, authenticated;

-- Étape 2 — déclencheur de synchronisation fiche ↔ document
create or replace function public._docs_meta_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.pi_documents_meta where id = old.id;
    return old;
  end if;
  insert into public.pi_documents_meta (id, data, updated_at)
  values (new.id, (new.data - 'blob') || '{"_sans_contenu": true}'::jsonb, new.updated_at)
  on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;
  return new;
end
$function$;

-- Étape 3 — créer le déclencheur (sans « drop trigger if exists » : verrou exclusif)
-- create trigger trg_zz_docs_meta after insert or update or delete on public.pi_documents
--   for each row execute function public._docs_meta_sync();

-- Étape 4 — reprise des documents existants, PAR LOTS (relancer en changeant « offset » de 40 en 40 jusqu'à couvrir la table)
-- insert into public.pi_documents_meta (id, data, updated_at)
-- select id, (data - 'blob') || '{"_sans_contenu": true}'::jsonb, updated_at
-- from public.pi_documents
-- where id in (select id from public.pi_documents order by id offset 0 limit 40)
-- on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;

-- Étape 5 — fonctions de lecture
create or replace function public.pull_documents_meta(cursor_ts text default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'updated_at', updated_at) order by updated_at, id), '[]'::jsonb)
  from public.pi_documents_meta
  where coalesce(cursor_ts, '') = '' or updated_at > cursor_ts::timestamptz
$function$;
grant execute on function public.pull_documents_meta(text) to anon, authenticated, service_role;

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
  docs_legers boolean := coalesce(cursors, '{}'::jsonb)->>'_docs_legers' = 'oui';
  lot_octets constant bigint := 30 * 1024 * 1024;
  borne timestamptz;
begin
  result := public.pull_incremental_v1(c || jsonb_build_object('pi_documents', '9999-12-31T00:00:00Z'));

  if docs_legers then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'updated_at', updated_at) order by updated_at, id), '[]'::jsonb)
      into rows
    from public.pi_documents_meta
    where cur_docs is null or updated_at > cur_docs::timestamptz;
  else
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

-- Vérification (doit renvoyer le même nombre de lignes dans les deux tables) :
-- select (select count(*) from public.pi_documents) documents, (select count(*) from public.pi_documents_meta) fiches;
