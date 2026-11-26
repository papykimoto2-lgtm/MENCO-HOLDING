-- ═══════════════════════════════════════════════════════════════════════════
-- Foncier urbain et rural — lot L5 (chaîne de propriété, charges, exploitations, contrats)
-- Réf. : docs/CAHIER_DES_CHARGES_FONCIER_URBAIN_RURAL.md (FUR-009, 010, 209, 210)
-- À exécuter sur CHAQUE projet Supabase après foncier_connect.sql et foncier_urbain_rural_l1.sql. Idempotent.
-- Format ERP : id / data jsonb / updated_at / scope_id. Aucun accès anon.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array['pi_proprietaires_fonciers','pi_charges_fonciers','pi_exploitations_fonciers','pi_contrats_fonciers']
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
    execute format('create trigger %I before update on public.%I for each row execute function public.pi_foncier_touch()', t || '_touch', t);
  end loop;
end$$;

-- ── Contraintes de forme ───────────────────────────────────────────────────
alter table public.pi_proprietaires_fonciers drop constraint if exists pi_proprietaires_chk;
alter table public.pi_proprietaires_fonciers add constraint pi_proprietaires_chk check (
  coalesce(data ->> 'parcelle_id', '') <> '' and length(trim(coalesce(data ->> 'proprietaire', ''))) > 0
  and coalesce(data ->> 'date_debut', '') <> ''
  and (data ->> 'quote_part')::numeric > 0 and (data ->> 'quote_part')::numeric <= 100
  and (coalesce(data ->> 'date_fin', '') = '' or data ->> 'date_fin' >= data ->> 'date_debut'));

alter table public.pi_charges_fonciers drop constraint if exists pi_charges_chk;
alter table public.pi_charges_fonciers add constraint pi_charges_chk check (
  coalesce(data ->> 'parcelle_id', '') <> ''
  and data ->> 'type' in ('hypotheque', 'servitude', 'emprise_voirie', 'saisie', 'litige', 'bail', 'autre')
  and data ->> 'statut' in ('active', 'levee')
  and (data ->> 'type' not in ('hypotheque', 'saisie') or length(trim(coalesce(data ->> 'reference', ''))) > 0)
  and (data ->> 'statut' <> 'levee' or length(trim(coalesce(data ->> 'mainlevee_ref', ''))) > 0)
  and (coalesce(data ->> 'date_fin', '') = '' or coalesce(data ->> 'date_debut', '') = '' or data ->> 'date_fin' >= data ->> 'date_debut'));

alter table public.pi_exploitations_fonciers drop constraint if exists pi_exploitations_chk;
alter table public.pi_exploitations_fonciers add constraint pi_exploitations_chk check (
  coalesce(data ->> 'parcelle_id', '') <> ''
  and length(trim(coalesce(data ->> 'exploitant', ''))) > 0 and length(trim(coalesce(data ->> 'culture', ''))) > 0
  and (data ->> 'superficie_ha')::numeric > 0
  and data ->> 'statut' in ('en_cours', 'terminee')
  and (coalesce(data ->> 'date_fin', '') = '' or coalesce(data ->> 'date_debut', '') = '' or data ->> 'date_fin' >= data ->> 'date_debut'));

alter table public.pi_contrats_fonciers drop constraint if exists pi_contrats_chk;
alter table public.pi_contrats_fonciers add constraint pi_contrats_chk check (
  coalesce(data ->> 'parcelle_id', '') <> ''
  and data ->> 'type' in ('cession_coutumiere', 'bail', 'promesse', 'metayage', 'concession')
  and data ->> 'statut' in ('brouillon', 'actif', 'resilie')
  and data ->> 'periodicite' in ('unique', 'mensuelle', 'trimestrielle', 'annuelle')
  and coalesce((data ->> 'redevance')::numeric, 0) >= 0
  and (coalesce((data ->> 'redevance')::numeric, 0) = 0 or data ->> 'periodicite' = 'unique' or coalesce(data ->> 'date_fin', '') <> '')
  and (data ->> 'statut' <> 'resilie' or length(trim(coalesce(data ->> 'motif_resiliation', ''))) > 0)
  and (coalesce(data ->> 'date_fin', '') = '' or data ->> 'date_fin' >= coalesce(data ->> 'date_debut', '')));

-- ── Règles inter-lignes (triggers) ─────────────────────────────────────────
-- Propriétaires actuels d'une parcelle : somme des quotes-parts ≤ 100 %.
create or replace function public.pi_proprietaires_quote_garde()
returns trigger language plpgsql set search_path = '' as $$
declare total numeric;
begin
  if coalesce(new.data ->> 'date_fin', '') <> '' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('prop:' || (new.data ->> 'parcelle_id')));
  select coalesce(sum((p.data ->> 'quote_part')::numeric), 0) into total
    from public.pi_proprietaires_fonciers p
   where p.data ->> 'parcelle_id' = new.data ->> 'parcelle_id' and coalesce(p.data ->> 'date_fin', '') = '' and p.id <> new.id;
  if total + (new.data ->> 'quote_part')::numeric > 100.0001 then
    raise exception 'Quotes-parts des propriétaires actuels : % %% (maximum 100 %%)', total + (new.data ->> 'quote_part')::numeric using errcode = '23514';
  end if;
  return new;
end$$;
drop trigger if exists pi_proprietaires_quote_garde on public.pi_proprietaires_fonciers;
create trigger pi_proprietaires_quote_garde before insert or update on public.pi_proprietaires_fonciers
  for each row execute function public.pi_proprietaires_quote_garde();

-- Exploitations en cours : surfaces cumulées ≤ superficie de la parcelle (si elle est connue).
create or replace function public.pi_exploitations_surface_garde()
returns trigger language plpgsql set search_path = '' as $$
declare cap numeric; total numeric;
begin
  if new.data ->> 'statut' <> 'en_cours' then return new; end if;
  select coalesce((p.data ->> 'superficie')::numeric, 0) / 10000 into cap from public.pi_parcelles p where p.id = new.data ->> 'parcelle_id';
  if coalesce(cap, 0) <= 0 then return new; end if;
  perform pg_advisory_xact_lock(hashtext('expl:' || (new.data ->> 'parcelle_id')));
  select coalesce(sum((e.data ->> 'superficie_ha')::numeric), 0) into total
    from public.pi_exploitations_fonciers e
   where e.data ->> 'parcelle_id' = new.data ->> 'parcelle_id' and e.data ->> 'statut' = 'en_cours' and e.id <> new.id;
  if total + (new.data ->> 'superficie_ha')::numeric > cap + 0.0001 then
    raise exception 'Surfaces exploitées : % ha pour une parcelle de % ha', total + (new.data ->> 'superficie_ha')::numeric, cap using errcode = '23514';
  end if;
  return new;
end$$;
drop trigger if exists pi_exploitations_surface_garde on public.pi_exploitations_fonciers;
create trigger pi_exploitations_surface_garde before insert or update on public.pi_exploitations_fonciers
  for each row execute function public.pi_exploitations_surface_garde();

-- ── Index ──────────────────────────────────────────────────────────────────
create index if not exists pi_prop_parcelle on public.pi_proprietaires_fonciers ((data ->> 'parcelle_id'), (data ->> 'date_fin'));
create index if not exists pi_chg_parcelle  on public.pi_charges_fonciers       ((data ->> 'parcelle_id'), (data ->> 'statut'));
create index if not exists pi_exp_parcelle  on public.pi_exploitations_fonciers ((data ->> 'parcelle_id'), (data ->> 'statut'));
create index if not exists pi_ctr_parcelle  on public.pi_contrats_fonciers      ((data ->> 'parcelle_id'), (data ->> 'statut'));

-- ── Realtime ───────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['pi_proprietaires_fonciers','pi_charges_fonciers','pi_exploitations_fonciers','pi_contrats_fonciers']
  loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end$$;

-- ── Vérification : 4 lignes, rls_active = true, anon_grants = 0 ────────────
select c.relname, c.relrowsecurity as rls_active,
       (select count(*) from information_schema.role_table_grants g where g.table_name = c.relname and g.grantee = 'anon') as anon_grants
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('pi_proprietaires_fonciers','pi_charges_fonciers','pi_exploitations_fonciers','pi_contrats_fonciers') order by 1;

-- ── RECETTE ────────────────────────────────────────────────────────────────
--  1. Deux propriétaires actuels à 60 % + 60 % sur la même parcelle → refus (23514).
--  2. Hypothèque sans référence → refus. Charge levée sans mainlevée → refus.
--  3. Exploitations en cours au-delà de la superficie → refus.
--  4. Contrat à redevance annuelle sans date de fin → refus. Contrat résilié sans motif → refus.
-- ── RETOUR ARRIÈRE : drop table public.pi_proprietaires_fonciers, public.pi_charges_fonciers, public.pi_exploitations_fonciers, public.pi_contrats_fonciers;
--                      drop function public.pi_proprietaires_quote_garde(), public.pi_exploitations_surface_garde();
