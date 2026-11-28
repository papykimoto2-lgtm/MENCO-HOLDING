-- Foncier — référentiel territorial (lot L18) : couches officielles et zones.
-- À exécuter sur CHAQUE projet Supabase après foncier_connect.sql. Idempotent.
-- Format ERP : id / data jsonb / updated_at / scope_id. Aucun accès anon : DONNÉES STRATÉGIQUES (secteurs cibles, périmètres), jamais publiées.
-- Couche : nom, type, source, date_source, version, statut (officiel | indicatif | projet | obsolete). Zone : couche_id, catégorie, contours WGS84.
do $$
declare t text;
begin
  foreach t in array array['pi_couches_territoriales','pi_zones_territoriales'] loop
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
  end loop;
end$$;

alter table public.pi_couches_territoriales drop constraint if exists pi_couches_territoriales_nom_chk;
alter table public.pi_couches_territoriales add constraint pi_couches_territoriales_nom_chk check (length(trim(coalesce(data ->> 'nom', ''))) > 0);
alter table public.pi_couches_territoriales drop constraint if exists pi_couches_territoriales_statut_chk;
alter table public.pi_couches_territoriales add constraint pi_couches_territoriales_statut_chk check (coalesce(data ->> 'statut', 'indicatif') in ('officiel','indicatif','projet','obsolete'));
alter table public.pi_couches_territoriales drop constraint if exists pi_couches_territoriales_type_chk;
alter table public.pi_couches_territoriales add constraint pi_couches_territoriales_type_chk check (coalesce(data ->> 'type', 'autre') in ('sduga','pud','zad','protegee','dup','hydrologie','infrastructure','autre'));
alter table public.pi_zones_territoriales drop constraint if exists pi_zones_territoriales_cat_chk;
alter table public.pi_zones_territoriales add constraint pi_zones_territoriales_cat_chk check (coalesce(data ->> 'categorie', 'info') in ('interdit','sous_condition','alerte','info'));

create index if not exists pi_ct_statut on public.pi_couches_territoriales ((data ->> 'statut'));
create index if not exists pi_zt_couche on public.pi_zones_territoriales ((data ->> 'couche_id'));

-- Vérification : 2 lignes, rls_active = true, anon_grants = 0
select c.relname, c.relrowsecurity as rls_active,
       (select count(*) from information_schema.role_table_grants g where g.table_name = c.relname and g.grantee = 'anon') as anon_grants
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('pi_couches_territoriales','pi_zones_territoriales') order by 1;
-- RETOUR ARRIÈRE : drop table public.pi_zones_territoriales, public.pi_couches_territoriales;
