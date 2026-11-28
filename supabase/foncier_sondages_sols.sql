-- Foncier — sondages géotechniques géolocalisés (points affichés sur la carte du Territoire).
-- À exécuter sur CHAQUE projet Supabase utilisant le module Territoire (après foncier_territoire_l18.sql). Idempotent.
-- Format ERP : id / data jsonb / updated_at / scope_id. Aucun accès anon : données techniques internes, jamais publiées.
-- Sondage : nom, parcelle, lat/lng WGS84, nature du sol, profondeur, contrainte admissible (MPa), nappe, essai, bureau d'études.
do $$
declare t text := 'pi_sondages_sols';
begin
  execute format($f$create table if not exists public.%I (
    id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), scope_id text)$f$, t);
  execute format('alter table public.%I enable row level security', t);
  execute format('alter table public.%I force row level security', t);
  execute format('revoke all on table public.%I from anon', t);
  execute format('revoke all on table public.%I from public', t);
  execute format('drop policy if exists %I on public.%I', t || '_staff', t);
  execute format('create policy %I on public.%I for all to authenticated using ((auth.jwt() ->> ''app_role'') is not null) with check ((auth.jwt() ->> ''app_role'') is not null)', t || '_staff', t);
  execute format('revoke all on table public.%I from authenticated', t);
  execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
  execute format('create trigger %I before update on public.%I for each row execute function public.pi_foncier_touch()', t || '_touch', t);
end$$;


alter table public.pi_sondages_sols drop constraint if exists pi_sondages_sols_pos_chk;
alter table public.pi_sondages_sols add constraint pi_sondages_sols_pos_chk check (
  jsonb_typeof(data -> 'lat') = 'number' and jsonb_typeof(data -> 'lng') = 'number'
  and (data ->> 'lat')::numeric between 4 and 11 and (data ->> 'lng')::numeric between -9 and -2);
alter table public.pi_sondages_sols drop constraint if exists pi_sondages_sols_nom_chk;
alter table public.pi_sondages_sols add constraint pi_sondages_sols_nom_chk check (length(trim(coalesce(data ->> 'nom', ''))) > 0);
create index if not exists pi_sondages_sols_parcelle on public.pi_sondages_sols ((data ->> 'parcelle_id'));

-- Vérification : 1 ligne, rls_active = true, anon_grants = 0
select c.relname, c.relrowsecurity as rls_active, c.relforcerowsecurity as rls_forcee,
       (select count(*) from information_schema.role_table_grants g where g.table_name = c.relname and g.grantee = 'anon') as anon_grants
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'pi_sondages_sols';
-- RETOUR ARRIÈRE : drop table public.pi_sondages_sols;
