-- ═══════════════════════════════════════════════════════════════════════════
-- Foncier — modèles de documents MENKO (protocole de purge, PV de remise de lot et d'ACD) — lot L10
-- À exécuter sur CHAQUE projet Supabase APRÈS foncier_connect.sql et foncier_audit_l8.sql (le protocole se rattache à l'audit). Idempotent.
-- Format ERP : id / data jsonb / updated_at / scope_id. Aucun accès anon.
-- Règles tenues côté serveur :
--   · protocole : montant et superficie > 0 ; tranches = 100 % ; part villageoise 0-100 % ; signé ⇒ date de signature, 5 annexes jointes
--     et audit foncier décidé GO (sauf dérogation motivée) ; réitéré ⇒ référence de l'acte notarié ; un document signé n'est plus modifiable ;
--   · PV de remise de lot / d'ACD : lot et souscripteur obligatoires ; signé ⇒ date de signature ; ACD ⇒ au moins une pièce remise avec sa référence.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array['pi_protocoles_purge_fonciers', 'pi_pv_remises_fonciers']
  loop
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

-- ── Protocole de purge ─────────────────────────────────────────────────────
alter table public.pi_protocoles_purge_fonciers drop constraint if exists pi_protocoles_chk;
alter table public.pi_protocoles_purge_fonciers add constraint pi_protocoles_chk check (
  data ->> 'statut' in ('brouillon', 'signe', 'reitere')
  and coalesce(data ->> 'village_id', '') <> '' and length(trim(coalesce(data ->> 'chef_nom', ''))) > 0 and length(trim(coalesce(data ->> 'famille', ''))) > 0
  and coalesce((data ->> 'montant')::numeric, 0) > 0 and coalesce((data ->> 'superficie_m2')::numeric, 0) > 0
  and abs(coalesce((data ->> 'tranche1_pct')::numeric, 0) + coalesce((data ->> 'tranche2_pct')::numeric, 0) + coalesce((data ->> 'tranche3_pct')::numeric, 0) - 100) < 0.01
  and coalesce((data ->> 'quote_part_village_pct')::numeric, -1) between 0 and 100
  and (data ->> 'statut' = 'brouillon' or (
        coalesce(data ->> 'date_signature', '') <> ''
        and coalesce(data ->> 'annexe1', '') = 'oui' and coalesce(data ->> 'annexe2', '') = 'oui' and coalesce(data ->> 'annexe3', '') = 'oui'
        and coalesce(data ->> 'annexe4', '') = 'oui' and coalesce(data ->> 'annexe5', '') = 'oui'))
  and (data ->> 'statut' <> 'reitere' or length(trim(coalesce(data ->> 'acte_notarie', ''))) > 0));

create or replace function public.fonc_protocole_garde() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare ok boolean;
begin
  if tg_op = 'UPDATE' and old.data ->> 'statut' in ('signe', 'reitere') then
    -- Après signature : seule la réitération notariée (statut, acte, date) peut évoluer.
    if (new.data - 'statut' - 'acte_notarie' - 'date_reiteration') is distinct from (old.data - 'statut' - 'acte_notarie' - 'date_reiteration')
       or (old.data ->> 'statut' = 'reitere' and new.data is distinct from old.data)
       or (new.data ->> 'statut' not in (old.data ->> 'statut', 'reitere')) then
      raise exception 'Protocole signé (%) : non modifiable', old.data ->> 'reference' using errcode = '23514';
    end if;
  end if;
  if new.data ->> 'statut' in ('signe', 'reitere') and length(trim(coalesce(new.data ->> 'derogation_audit', ''))) = 0
     and (tg_op = 'INSERT' or old.data ->> 'statut' = 'brouillon') then
    select exists (
      select 1 from public.pi_audits_fonciers a
       where a.data ->> 'decision' = 'go'
         and ( (coalesce(new.data ->> 'operation_id', '') <> '' and a.data ->> 'operation_id' = new.data ->> 'operation_id')
            or (coalesce(new.data ->> 'parcelle_id', '') <> '' and a.data ->> 'parcelle_id' = new.data ->> 'parcelle_id')
            or exists (select 1 from public.pi_programmes p where p.id = new.data ->> 'programme_id'
                          and coalesce(p.data ->> 'ref_import', '') <> '' and a.data ->> 'code_projet' = p.data ->> 'ref_import') )
    ) into ok;
    if not ok then raise exception 'Protocole : audit foncier pré-acquisition décidé GO requis (ou dérogation motivée)' using errcode = '23514'; end if;
  end if;
  return new;
end$$;
revoke all on function public.fonc_protocole_garde() from public, anon, authenticated;
drop trigger if exists pi_protocoles_garde on public.pi_protocoles_purge_fonciers;
create trigger pi_protocoles_garde before insert or update on public.pi_protocoles_purge_fonciers
  for each row execute function public.fonc_protocole_garde();

-- ── PV de remise de lot et d'ACD ───────────────────────────────────────────
alter table public.pi_pv_remises_fonciers drop constraint if exists pi_pv_chk;
alter table public.pi_pv_remises_fonciers add constraint pi_pv_chk check (
  data ->> 'type' in ('lot', 'acd') and data ->> 'statut' in ('brouillon', 'signe')
  and coalesce(data ->> 'lot_id', '') <> '' and coalesce(data ->> 'client_id', '') <> ''
  and (data ->> 'statut' = 'brouillon' or coalesce(data ->> 'date_signature', '') <> '')
  and (data ->> 'type' <> 'acd' or
       ((data ->> 'p1_remis' = 'oui' and length(trim(coalesce(data ->> 'p1_ref', ''))) > 0) or (data ->> 'p2_remis' = 'oui' and length(trim(coalesce(data ->> 'p2_ref', ''))) > 0)
     or (data ->> 'p3_remis' = 'oui' and length(trim(coalesce(data ->> 'p3_ref', ''))) > 0) or (data ->> 'p4_remis' = 'oui' and length(trim(coalesce(data ->> 'p4_ref', ''))) > 0))));

create or replace function public.fonc_pv_garde() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.data ->> 'statut' = 'signe' and new.data is distinct from old.data then
    raise exception 'PV signé (%) : non modifiable', old.data ->> 'reference' using errcode = '23514';
  end if;
  return new;
end$$;
drop trigger if exists pi_pv_garde on public.pi_pv_remises_fonciers;
create trigger pi_pv_garde before update on public.pi_pv_remises_fonciers for each row execute function public.fonc_pv_garde();

create index if not exists pi_prt_programme on public.pi_protocoles_purge_fonciers ((data ->> 'programme_id'));
create index if not exists pi_prt_operation on public.pi_protocoles_purge_fonciers ((data ->> 'operation_id'));
create index if not exists pi_pv_lot on public.pi_pv_remises_fonciers ((data ->> 'lot_id'), (data ->> 'type'));

do $$
declare t text;
begin
  foreach t in array array['pi_protocoles_purge_fonciers', 'pi_pv_remises_fonciers'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t); exception when duplicate_object then null; end;
  end loop;
end$$;

select c.relname, c.relrowsecurity as rls_active,
       (select count(*) from information_schema.role_table_grants g where g.table_name = c.relname and g.grantee = 'anon') as anon_grants
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('pi_protocoles_purge_fonciers', 'pi_pv_remises_fonciers') order by 1;

-- ── RECETTE ────────────────────────────────────────────────────────────────
--  1. Protocole : tranches ≠ 100 %, montant 0, part villageoise > 100 → refus (23514).
--  2. Protocole signé sans les 5 annexes, sans audit GO (ni dérogation motivée) → refus. Réitéré sans acte notarié → refus.
--  3. Protocole signé : toute modification refusée, sauf la réitération notariée.
--  4. PV d'ACD sans pièce remise avec référence → refus. PV signé sans date → refus ; PV signé non modifiable.
-- ── RETOUR ARRIÈRE : drop table public.pi_protocoles_purge_fonciers, public.pi_pv_remises_fonciers;
--                      drop function public.fonc_protocole_garde(), public.fonc_pv_garde();
