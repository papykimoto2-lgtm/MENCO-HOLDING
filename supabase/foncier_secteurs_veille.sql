-- Foncier — veille de secteurs (secteurs dessinés sur la carte du Territoire, analyse des couches, alertes de changement).
-- À exécuter sur CHAQUE projet Supabase utilisant le module Territoire (après foncier_territoire_l18.sql). Idempotent.
-- Format ERP : id / data jsonb / updated_at / scope_id. Aucun accès anon : DONNÉES STRATÉGIQUES (secteurs que MENKO cible), jamais publiées.
-- Secteur : nom, priorité, actif, anneau [[lat, lng], …], dernière analyse, alertes de changement.
do $$
declare t text := 'pi_secteurs_veille';
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

alter table public.pi_secteurs_veille drop constraint if exists pi_secteurs_veille_nom_chk;
alter table public.pi_secteurs_veille add constraint pi_secteurs_veille_nom_chk check (length(trim(coalesce(data ->> 'nom', ''))) > 0);
alter table public.pi_secteurs_veille drop constraint if exists pi_secteurs_veille_prio_chk;
alter table public.pi_secteurs_veille add constraint pi_secteurs_veille_prio_chk check (coalesce(data ->> 'priorite', 'normale') in ('normale', 'haute'));

-- Vérification : 1 ligne, rls_active = true, anon_grants = 0
select c.relname, c.relrowsecurity as rls_active, c.relforcerowsecurity as rls_forcee,
       (select count(*) from information_schema.role_table_grants g where g.table_name = c.relname and g.grantee = 'anon') as anon_grants
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'pi_secteurs_veille';
-- RETOUR ARRIÈRE : drop table public.pi_secteurs_veille;
