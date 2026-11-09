-- ═══════════════════════════════════════════════════════════════════════════
-- Documents joints : LISTE sans contenu (pi_documents_meta) + mode léger de pull_incremental
--
-- Contexte : pi_documents stocke les fichiers en base64 DANS la colonne data (jsonb) :
-- plusieurs Go. Depuis v14.198, l'ERP (postes du personnel) ne synchronise que la
-- liste des documents ; le contenu est récupéré à la demande. Le client suppose :
--   (1) la vue/table  pi_documents_meta  existe : mêmes colonnes que pi_documents
--       (id, data, updated_at) mais data SANS fichier et avec "_sans_contenu": true ;
--   (2) pull_incremental() renvoie la liste légère sous la clé "pi_documents"
--       quand le client envoie  cursors._docs_legers = 'oui'.
-- Aucun script du dépôt ne les créait. Sans eux, le poste télécharge les fichiers
-- complets (JSON de plusieurs centaines de Mo) → plantage mémoire sur téléphone.
--
-- Conception : une VRAIE table légère tenue à jour par déclencheur (et non une vue
-- calculée à la volée) — lire une vue obligerait PostgreSQL à désérialiser (detoast)
-- tous les fichiers à chaque synchronisation, même pour ne renvoyer que leurs noms.
--
-- ORDRE D'EXÉCUTION (Supabase ▸ SQL Editor, projet Menco — confirmer organisation ET nom)
--   0. Sauvegarde fraîche. Lire la définition en production AVANT de remplacer :
--        select pg_get_functiondef('public.pull_incremental(jsonb)'::regprocedure);
--        select pg_get_functiondef('public.pull_incremental_v1(jsonb)'::regprocedure);
--      (ce script réécrit pull_incremental() à partir de supabase/pull_incremental_complet.sql ;
--       si la production diffère, reporter les écarts avant de lancer l'ÉTAPE 5.)
--   1-4. Exécuter les ÉTAPES 1 à 4 (création, déclencheurs, droits) : sans effet sur l'ERP.
--   Rattrapage : appeler pi_documents_meta_rattrapage() en boucle jusqu'à « 0 restant ».
--   5. ÉTAPE 5 (nouvelle pull_incremental) : seulement APRÈS le rattrapage complet.
--   6. Vérifications, puis retour arrière documenté en fin de fichier.
-- Idempotent : relançable sans dommage.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 — copie légère d'un document ────────────────────────────────────
-- Retire le contenu (blob, data) et toute valeur texte > 20 000 caractères
-- (filet contre une miniature ou un OCR embarqué), ajoute _sans_contenu = true.
create or replace function public._doc_leger(d jsonb)
returns jsonb
language sql immutable parallel safe
set search_path = public
as $$
  select coalesce(
           jsonb_object_agg(e.k, e.v) filter (
             where e.k not in ('blob', 'data')
               and not (jsonb_typeof(e.v) = 'string' and length(e.v #>> '{}') > 20000)),
           '{}'::jsonb)
         || '{"_sans_contenu": true}'::jsonb
  from jsonb_each(coalesce(d, '{}'::jsonb)) as e(k, v)
$$;

-- ── ÉTAPE 2 — table de la liste légère ──────────────────────────────────────
create table if not exists public.pi_documents_meta (
  id         text        primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists pi_documents_meta_updated_idx on public.pi_documents_meta (updated_at);

-- ── ÉTAPE 3 — déclencheurs : la liste suit pi_documents ─────────────────────
create or replace function public._pi_documents_meta_sync()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.pi_documents_meta where id = old.id;
    return old;
  end if;
  insert into public.pi_documents_meta (id, data, updated_at)
  values (new.id, public._doc_leger(new.data), coalesce(new.updated_at, now()))
  on conflict (id) do update
    set data = excluded.data, updated_at = excluded.updated_at;
  return new;
end
$$;

drop trigger if exists trg_pi_documents_meta_sync on public.pi_documents;
create trigger trg_pi_documents_meta_sync
  after insert or update or delete on public.pi_documents
  for each row execute function public._pi_documents_meta_sync();

-- Rattrapage par lots (reprenable, évite le délai d'expiration de l'éditeur SQL) :
-- copie les documents absents de la liste ou plus récents qu'elle. Lit les fichiers
-- UNE fois (côté base, rien n'est envoyé). Relancer jusqu'à « 0 restant ».
--   select * from public.pi_documents_meta_rattrapage();          -- lots de 200
--   select * from public.pi_documents_meta_rattrapage(50);        -- fichiers très lourds
create or replace function public.pi_documents_meta_rattrapage(p_lot integer default 200)
returns table(traites integer, restants bigint)
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  with a_faire as (
    select d.id, d.data, d.updated_at
    from public.pi_documents d
    left join public.pi_documents_meta m on m.id = d.id
    where m.id is null or m.updated_at < coalesce(d.updated_at, now())
    order by d.id
    limit greatest(p_lot, 1)
  ), ins as (
    insert into public.pi_documents_meta (id, data, updated_at)
    select id, public._doc_leger(data), coalesce(updated_at, now()) from a_faire
    on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at
    returning 1
  )
  select count(*) into n from ins;
  traites := n;
  select count(*) into restants
  from public.pi_documents d
  left join public.pi_documents_meta m on m.id = d.id
  where m.id is null or m.updated_at < coalesce(d.updated_at, now());
  return next;
end
$$;
revoke all on function public.pi_documents_meta_rattrapage(integer) from public, anon, authenticated;

-- ── ÉTAPE 4 — droits : personnel seulement ──────────────────────────────────
-- Les sessions des portails externes gardent la synchronisation complète (elles ne
-- lisent jamais la liste légère). Écriture : uniquement par le déclencheur.
alter table public.pi_documents_meta enable row level security;
drop policy if exists personnel_tout on public.pi_documents_meta;
create policy personnel_tout on public.pi_documents_meta
  for select to authenticated
  using ((auth.jwt() ->> 'app_role') is not null);
revoke all on table public.pi_documents_meta from anon, authenticated;
grant select on table public.pi_documents_meta to authenticated;

-- ── ÉTAPE 5 — pull_incremental() : mode léger ───────────────────────────────
-- Identique à supabase/pull_incremental_complet.sql, plus :
--   · cursors._docs_legers = 'oui' → pi_documents est servie depuis pi_documents_meta
--     (jamais lue dans pi_documents : aucun fichier n'est désérialisé ni envoyé) ;
--   · pull_incremental_v1 reçoit alors un curseur « dans le futur » pour pi_documents,
--     afin qu'elle ne sérialise pas les fichiers qu'elle ignorerait de toute façon.
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
  leger boolean := coalesce(cursors ->> '_docs_legers', '') = 'oui';
begin
  if leger then
    result := public.pull_incremental_v1(
      jsonb_set(coalesce(cursors, '{}'::jsonb), '{pi_documents}', '"9999-12-31T00:00:00Z"'::jsonb));
    cur := cursors ->> 'pi_documents';
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'data', m.data, 'updated_at', m.updated_at)), '[]'::jsonb)
      into rows
      from public.pi_documents_meta m
      where cur is null or cur = '' or m.updated_at > cur::timestamptz;
    result := (result - 'pi_documents') || jsonb_build_object('pi_documents', rows);
  else
    result := public.pull_incremental_v1(cursors);
  end if;

  for t in select jsonb_object_keys(coalesce(cursors, '{}'::jsonb)) loop
    continue when result ? t;
    continue when t !~ '^pi_[a-z0-9_]+$';
    continue when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = t
                     and column_name in ('id','data','updated_at')) < 3;
    cur := cursors ->> t;
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

-- ── ÉTAPE 6 — VÉRIFICATIONS ─────────────────────────────────────────────────
-- a) La liste est complète (0 attendu) :
--      select count(*) from public.pi_documents d left join public.pi_documents_meta m on m.id = d.id where m.id is null;
-- b) Aucun fichier dans la liste (0 attendu) :
--      select count(*) from public.pi_documents_meta where data ? 'blob' or data ? 'data';
-- c) Taille de la réponse légère (quelques centaines de Ko attendus, jamais des Mo/Go) :
--      select pg_size_pretty(length((public.pull_incremental('{"pi_documents":"","_docs_legers":"oui"}'::jsonb) -> 'pi_documents')::text)::bigint);
-- d) Mode complet des portails inchangé :
--      select jsonb_array_length(public.pull_incremental('{"pi_documents":"","_docs_legers":"non"}'::jsonb) -> 'pi_documents');
-- e) Poids comparé :
--      select pg_size_pretty(pg_total_relation_size('public.pi_documents')) as fichiers,
--             pg_size_pretty(pg_total_relation_size('public.pi_documents_meta')) as liste;

-- ── RETOUR ARRIÈRE ──────────────────────────────────────────────────────────
--   1. Rejouer supabase/pull_incremental_complet.sql (restaure pull_incremental sans mode léger).
--   2. drop trigger if exists trg_pi_documents_meta_sync on public.pi_documents;
--   3. (optionnel) drop table public.pi_documents_meta; drop function public._pi_documents_meta_sync(), public._doc_leger(jsonb),
--      public.pi_documents_meta_rattrapage(integer);
