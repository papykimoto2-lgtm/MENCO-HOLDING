-- Foncier — référentiel unique des personnes et familles foncières (lot L17)
-- À exécuter sur CHAQUE projet Supabase après foncier_connect.sql. Idempotent.
-- Format ERP : id / data jsonb / updated_at / scope_id. Aucun accès anon.
-- Les saisies existantes (propriétaires, ayants droit, protocoles, villages, parcelles, opérations) portent
-- data.liens_personnes = { champ: personne_id } ; rien n'est supprimé.
do $$
declare t text := 'pi_personnes_fonciers';
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

alter table public.pi_personnes_fonciers drop constraint if exists pi_personnes_fonciers_nom_chk;
alter table public.pi_personnes_fonciers add constraint pi_personnes_fonciers_nom_chk
  check (length(trim(coalesce(data ->> 'nom', ''))) > 0);
alter table public.pi_personnes_fonciers drop constraint if exists pi_personnes_fonciers_nature_chk;
alter table public.pi_personnes_fonciers add constraint pi_personnes_fonciers_nature_chk
  check (coalesce(data ->> 'nature', 'personne') in ('personne','famille','chefferie','societe','etat','collectivite'));

create index if not exists pi_pers_nom on public.pi_personnes_fonciers ((lower(data ->> 'nom')));
create index if not exists pi_pers_village on public.pi_personnes_fonciers ((data ->> 'village_id'));
create index if not exists pi_pers_fusion on public.pi_personnes_fonciers ((data ->> 'fusionnee_dans'));

do $$ begin
  begin alter publication supabase_realtime add table public.pi_personnes_fonciers; exception when duplicate_object then null; end;
end$$;

-- Vérification : 1 ligne, rls_active = true, anon_grants = 0
select c.relname, c.relrowsecurity as rls_active,
       (select count(*) from information_schema.role_table_grants g where g.table_name = c.relname and g.grantee = 'anon') as anon_grants
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'pi_personnes_fonciers';
-- RETOUR ARRIÈRE : drop table public.pi_personnes_fonciers;
