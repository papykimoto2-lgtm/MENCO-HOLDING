-- ═══════════════════════════════════════════════════════════════════════════
-- Foncier urbain et rural — lot L1 (régime, villages, ayants droit, titres)
-- Réf. : docs/CAHIER_DES_CHARGES_FONCIER_URBAIN_RURAL.md (FUR-001, 003, 005, 202, 203, 208)
--
-- À exécuter sur CHAQUE projet Supabase, SQL Editor ▸ Run. Idempotent.
-- PRÉREQUIS : foncier_connect.sql (fonction pi_foncier_touch), staff-login (claim app_role),
--             table pi_parcelles existante.
-- Format uniforme de l'ERP : id / data jsonb / updated_at / scope_id. Aucun accès anon.
--
-- Tables :
--   pi_villages_fonciers       village, sous-préfecture, chef, comité villageois
--   pi_ayants_droit_fonciers   personnes/familles coutumières ; data.parcelles = [{parcelle_id, part}]
--   pi_titres_fonciers         CF, ACD, TF… ; data.parent_id = titre mère
-- Parcelles : data.regime ∈ {urbain, rural}, obligatoire (garde par trigger après rattrapage).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tables ──────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['pi_villages_fonciers','pi_ayants_droit_fonciers','pi_titres_fonciers']
  loop
    execute format($f$
      create table if not exists public.%I (
        id         text        primary key,
        data       jsonb       not null default '{}'::jsonb,
        updated_at timestamptz not null default now(),
        scope_id   text
      )$f$, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke all on table public.%I from public', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((auth.jwt() ->> ''app_role'') is not null) with check ((auth.jwt() ->> ''app_role'') is not null)',
      t || '_staff', t);
    execute format('revoke all on table public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.pi_foncier_touch()',
      t || '_touch', t);
  end loop;
end$$;

-- ── 2. Contraintes de forme ────────────────────────────────────────────────
-- Types de titre admis ; numéro unique par type quand il est renseigné.
alter table public.pi_titres_fonciers drop constraint if exists pi_titres_fonciers_type_chk;
alter table public.pi_titres_fonciers add constraint pi_titres_fonciers_type_chk
  check (data ->> 'type' in ('attestation_coutumiere','lettre_attribution','certificat_foncier',
                             'acd','arrete_concession','tf_provisoire','tf_definitif','bail','contrat_concession'));
alter table public.pi_titres_fonciers drop constraint if exists pi_titres_fonciers_regime_chk;
alter table public.pi_titres_fonciers add constraint pi_titres_fonciers_regime_chk
  check (data ->> 'regime' in ('urbain','rural'));

alter table public.pi_villages_fonciers drop constraint if exists pi_villages_fonciers_nom_chk;
alter table public.pi_villages_fonciers add constraint pi_villages_fonciers_nom_chk
  check (length(trim(coalesce(data ->> 'nom', ''))) > 0);

alter table public.pi_ayants_droit_fonciers drop constraint if exists pi_ayants_droit_fonciers_nom_chk;
alter table public.pi_ayants_droit_fonciers add constraint pi_ayants_droit_fonciers_nom_chk
  check (length(trim(coalesce(data ->> 'nom', ''))) > 0);

-- ── 3. Index ───────────────────────────────────────────────────────────────
create index if not exists pi_vf_nom      on public.pi_villages_fonciers     ((lower(data ->> 'nom')));
create index if not exists pi_vf_sp       on public.pi_villages_fonciers     ((lower(data ->> 'sous_prefecture')));
create index if not exists pi_adf_nom     on public.pi_ayants_droit_fonciers ((lower(data ->> 'nom')));
create index if not exists pi_adf_village on public.pi_ayants_droit_fonciers ((data ->> 'village_id'));
create index if not exists pi_adf_parcs   on public.pi_ayants_droit_fonciers using gin ((data -> 'parcelles') jsonb_path_ops);
create index if not exists pi_tf_parcelle on public.pi_titres_fonciers       ((data ->> 'parcelle_id'));
create index if not exists pi_tf_numero   on public.pi_titres_fonciers       ((data ->> 'type'), (data ->> 'numero'));
create index if not exists pi_tf_parent   on public.pi_titres_fonciers       ((data ->> 'parent_id'));
create index if not exists pi_parcelles_regime on public.pi_parcelles        ((data ->> 'regime'));

-- Un même numéro de titre ne peut exister qu'une fois par type.
create unique index if not exists pi_tf_numero_unique
  on public.pi_titres_fonciers ((data ->> 'type'), (lower(trim(data ->> 'numero'))))
  where coalesce(trim(data ->> 'numero'), '') <> '';

-- ── 4. Rattrapage du régime des parcelles existantes ───────────────────────
-- Rural : parcelle portant au moins un dossier de procédure rurale. Sinon urbain.
update public.pi_parcelles p
   set data = p.data || jsonb_build_object('regime',
         case when exists (select 1 from public.pi_dossiers_fonciers d
                            where d.data ->> 'parcelle_id' = p.id
                              and d.data ->> 'type_procedure' = 'immatriculation_rurale')
              then 'rural' else 'urbain' end)
 where coalesce(p.data ->> 'regime', '') not in ('urbain', 'rural');

-- Obligation : régime toujours valide. Un poste en cache (ancienne version, sans le champ) ne doit pas
-- voir sa synchronisation refusée : régime absent → valeur déjà en base, sinon 'urbain'. Valeur invalide → refus.
create or replace function public.pi_parcelles_regime_garde()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(new.data ->> 'regime', '') = '' then
    new.data := new.data || jsonb_build_object('regime',
      case when tg_op = 'UPDATE' and old.data ->> 'regime' in ('urbain','rural')
           then old.data ->> 'regime' else 'urbain' end);
  elsif new.data ->> 'regime' not in ('urbain','rural') then
    raise exception 'Régime foncier invalide : % (urbain ou rural)', new.data ->> 'regime' using errcode = '23514';
  end if;
  return new;
end$$;
drop trigger if exists pi_parcelles_regime_garde on public.pi_parcelles;
create trigger pi_parcelles_regime_garde before insert or update on public.pi_parcelles
  for each row execute function public.pi_parcelles_regime_garde();

-- ── 5. Rattrapage des titres depuis les champs de la parcelle ──────────────
-- Un titre par parcelle ayant type_titre + num_titre. Table ancienne conservée (aucune donnée supprimée).
insert into public.pi_titres_fonciers (id, data)
select 'TIT-' || p.id,
       jsonb_strip_nulls(jsonb_build_object(
         'parcelle_id', p.id,
         'regime',      p.data ->> 'regime',
         'type',        case p.data ->> 'type_titre'
                          when 'droit_coutumier' then 'attestation_coutumiere'
                          when 'ar'              then 'arrete_concession'
                          when 'acd'             then 'acd'
                          when 'tf_provisoire'   then 'tf_provisoire'
                          when 'tf_definitif'    then 'tf_definitif'
                          when 'bail'            then 'bail'
                        end,
         'numero',      nullif(trim(p.data ->> 'num_titre'), ''),
         'date',        nullif(p.data ->> 'date_titre', ''),
         'source',      'migration_l1'))
  from public.pi_parcelles p
 where coalesce(trim(p.data ->> 'num_titre'), '') <> ''
   and p.data ->> 'type_titre' in ('droit_coutumier','ar','acd','tf_provisoire','tf_definitif','bail')
on conflict (id) do nothing;
-- Les numéros en double (même type, même numéro) sont ignorés par l'index unique : le second reste dans la parcelle.

-- ── 6. Realtime ────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['pi_villages_fonciers','pi_ayants_droit_fonciers','pi_titres_fonciers']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end$$;

-- ── 7. Vérification ────────────────────────────────────────────────────────
-- 3 lignes attendues : rls_active = true, anon_grants = 0.
select c.relname, c.relrowsecurity as rls_active,
       (select count(*) from information_schema.role_table_grants g
         where g.table_name = c.relname and g.grantee = 'anon') as anon_grants
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('pi_villages_fonciers','pi_ayants_droit_fonciers','pi_titres_fonciers')
 order by 1;
-- Parcelles sans régime : 0 attendu.
select count(*) as parcelles_sans_regime from public.pi_parcelles
 where coalesce(data ->> 'regime', '') not in ('urbain','rural');

-- ── RECETTE ────────────────────────────────────────────────────────────────
--  1. insert parcelle sans régime → créée en 'urbain' ; régime 'xyz' → refus (23514).
--  2. Clé anon seule : lecture/écriture des 3 tables refusées.
--  3. Deux titres de même type et même numéro → le second est refusé (23505).
--  4. Type de titre inconnu → refus (23514).
--
-- ── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
--  drop trigger pi_parcelles_regime_garde on public.pi_parcelles;
--  drop table public.pi_titres_fonciers, public.pi_ayants_droit_fonciers, public.pi_villages_fonciers;
--  (le champ data.regime des parcelles est inoffensif et peut rester)
