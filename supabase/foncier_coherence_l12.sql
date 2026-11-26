-- ═══════════════════════════════════════════════════════════════════════════
-- Foncier — registre des constats d'incohérence (lot L12)
-- À exécuter sur CHAQUE projet Supabase après foncier_connect.sql. Idempotent.
-- Format ERP : id / data jsonb / updated_at / scope_id. Aucun accès anon.
-- Règles tenues côté serveur : statut connu ; décision (corrigé, maintenu, contesté) ⇒ motif d'au moins 10 caractères ;
-- maintenu / contesté ⇒ décideur et date ; observations = tableau.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare t text := 'pi_constats_coherence_fonciers';
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

alter table public.pi_constats_coherence_fonciers drop constraint if exists pi_constats_coherence_chk;
alter table public.pi_constats_coherence_fonciers add constraint pi_constats_coherence_chk check (
  length(trim(coalesce(data ->> 'cle', ''))) > 0 and length(trim(coalesce(data ->> 'code', ''))) > 0
  and coalesce(data ->> 'parcelle_id', '') <> ''
  and data ->> 'niveau' in ('critique', 'majeur', 'info')
  and data ->> 'statut' in ('ouvert', 'corrige', 'resolu_auto', 'maintenu', 'faux_positif')
  and (data -> 'observations' is null or jsonb_typeof(data -> 'observations') = 'array')
  and (data ->> 'statut' not in ('corrige', 'maintenu', 'faux_positif')
       or length(trim(coalesce(data #>> '{decision,texte}', ''))) >= 10)
  and (data ->> 'statut' not in ('maintenu', 'faux_positif')
       or (length(trim(coalesce(data #>> '{decision,par}', ''))) > 0 and coalesce(data #>> '{decision,le}', '') <> '')));

create unique index if not exists pi_coh_cle_ouvert on public.pi_constats_coherence_fonciers ((data ->> 'cle')) where data ->> 'statut' = 'ouvert';
create index if not exists pi_coh_parcelle on public.pi_constats_coherence_fonciers ((data ->> 'parcelle_id'), (data ->> 'statut'));

do $$ begin
  begin alter publication supabase_realtime add table public.pi_constats_coherence_fonciers; exception when duplicate_object then null; end;
end$$;

select c.relname, c.relrowsecurity as rls_active,
       (select count(*) from information_schema.role_table_grants g where g.table_name = c.relname and g.grantee = 'anon') as anon_grants
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'pi_constats_coherence_fonciers';

-- ── RECETTE ────────────────────────────────────────────────────────────────
--  1. Statut « maintenu » sans motif (≥ 10 car.) → refus (23514). Statut inconnu → refus.
--  2. Deux constats ouverts de même clé → refus (index unique partiel) ; un constat corrigé puis rouvert reste possible.
--  3. Clé anon seule : lecture/écriture refusées.
-- ── RETOUR ARRIÈRE : drop table public.pi_constats_coherence_fonciers;
