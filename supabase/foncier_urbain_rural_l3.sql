-- ═══════════════════════════════════════════════════════════════════════════
-- Foncier rural — lot L3 (enquête officielle, oppositions, bornage contradictoire)
-- Réf. : docs/CAHIER_DES_CHARGES_FONCIER_URBAIN_RURAL.md (FUR-204, 205, 206)
-- À exécuter sur CHAQUE projet Supabase après foncier_urbain_rural_l1.sql et foncier_connect.sql. Idempotent.
-- Format ERP : id / data jsonb / updated_at / scope_id. Aucun accès anon. Le comité villageois (CVGFR) vit dans
-- pi_villages_fonciers.data.comite (membres, mandat, PV) : aucune table supplémentaire.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array['pi_enquetes_fonciers','pi_oppositions_fonciers','pi_bornages_fonciers']
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

-- ── Contraintes métier (valables même si le client est contourné) ──────────
-- Enquête : parcelle obligatoire ; ouverte/clôturée ⇒ dates ; durée > 0 ;
-- clôture avant l'échéance ⇒ motif de dérogation.
alter table public.pi_enquetes_fonciers drop constraint if exists pi_enquetes_chk;
alter table public.pi_enquetes_fonciers add constraint pi_enquetes_chk check (
  coalesce(data ->> 'parcelle_id', '') <> ''
  and data ->> 'statut' in ('planifiee', 'ouverte', 'cloturee')
  and (data ->> 'duree_jours' is null or (data ->> 'duree_jours')::numeric > 0)
  and (data ->> 'statut' = 'planifiee' or (coalesce(data ->> 'date_ouverture', '') <> '' and coalesce(data ->> 'date_fin_prevue', '') <> ''))
  and (data ->> 'statut' <> 'cloturee'
       or coalesce(data ->> 'date_cloture', '') >= coalesce(data ->> 'date_fin_prevue', '')
       or length(trim(coalesce(data ->> 'derogation_motif', ''))) > 0)
);

-- Opposition : motif obligatoire ; clôturée (levée, rejetée, jugée) ⇒ issue renseignée.
alter table public.pi_oppositions_fonciers drop constraint if exists pi_oppositions_chk;
alter table public.pi_oppositions_fonciers add constraint pi_oppositions_chk check (
  coalesce(data ->> 'parcelle_id', '') <> ''
  and length(trim(coalesce(data ->> 'motif', ''))) > 0
  and data ->> 'statut' in ('ouverte', 'en_mediation', 'levee', 'rejetee', 'jugee')
  and (data ->> 'statut' in ('ouverte', 'en_mediation') or length(trim(coalesce(data ->> 'issue', ''))) > 0)
);

-- Bornage : réalisé ⇒ procès-verbal + au moins un riverain présent (contradictoire).
create or replace function public.pi_bornage_riverain_present(p_convocations jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_convocations) = 'array' then p_convocations else '[]'::jsonb end) c
                  where c ->> 'present' = 'true')
$$;
alter table public.pi_bornages_fonciers drop constraint if exists pi_bornages_chk;
alter table public.pi_bornages_fonciers add constraint pi_bornages_chk check (
  coalesce(data ->> 'parcelle_id', '') <> ''
  and data ->> 'statut' in ('convoque', 'realise', 'annule')
  and (data ->> 'statut' <> 'realise'
       or (length(trim(coalesce(data ->> 'pv_ref', ''))) > 0
           and public.pi_bornage_riverain_present(data -> 'convocations')))
);

-- ── Index ──────────────────────────────────────────────────────────────────
create index if not exists pi_enq_parcelle on public.pi_enquetes_fonciers    ((data ->> 'parcelle_id'));
create index if not exists pi_enq_dossier  on public.pi_enquetes_fonciers    ((data ->> 'dossier_id'));
create index if not exists pi_enq_statut   on public.pi_enquetes_fonciers    ((data ->> 'statut'), (data ->> 'date_fin_prevue'));
create index if not exists pi_opp_parcelle on public.pi_oppositions_fonciers ((data ->> 'parcelle_id'), (data ->> 'statut'));
create index if not exists pi_opp_dossier  on public.pi_oppositions_fonciers ((data ->> 'dossier_id'));
create index if not exists pi_brn_parcelle on public.pi_bornages_fonciers    ((data ->> 'parcelle_id'));
create index if not exists pi_brn_dossier  on public.pi_bornages_fonciers    ((data ->> 'dossier_id'));

-- ── Realtime ───────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['pi_enquetes_fonciers','pi_oppositions_fonciers','pi_bornages_fonciers']
  loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end$$;

-- ── Vérification : 3 lignes, rls_active = true, anon_grants = 0 ────────────
select c.relname, c.relrowsecurity as rls_active,
       (select count(*) from information_schema.role_table_grants g where g.table_name = c.relname and g.grantee = 'anon') as anon_grants
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('pi_enquetes_fonciers','pi_oppositions_fonciers','pi_bornages_fonciers') order by 1;

-- ── RECETTE ────────────────────────────────────────────────────────────────
--  1. Enquête clôturée avant l'échéance sans derogation_motif → refus (23514).
--  2. Opposition levée sans issue → refus. Opposition sans motif → refus.
--  3. Bornage réalisé sans PV, ou sans riverain présent → refus.
--  4. Clé anon seule : lecture/écriture refusées.
-- ── RETOUR ARRIÈRE : drop table public.pi_enquetes_fonciers, public.pi_oppositions_fonciers, public.pi_bornages_fonciers;
--                      drop function public.pi_bornage_riverain_present(jsonb);
