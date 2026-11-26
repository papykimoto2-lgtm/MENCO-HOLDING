-- ═══════════════════════════════════════════════════════════════════════════
-- Foncier — audit pré-acquisition (protocole AUD-FON-MENKO-02, 19 points Go / No-Go) — lot L8
-- À exécuter sur CHAQUE projet Supabase après foncier_connect.sql. Idempotent.
-- Format ERP : id / data jsonb / updated_at / scope_id. Aucun accès anon.
-- Règles de décision tenues côté serveur (même si le client est contourné) :
--   · statuts de point : a_verifier, conforme, non_conforme, en_regularisation, non_applicable ;
--   · « conforme » exige la référence de la pièce justificative ;  « non_conforme » et « non_applicable » exigent un motif ;
--   · décision GO : les 19 points évalués, tous les points BLOQUANTS conformes ou non applicables, les 3 visas nommés ;
--   · décision NO-GO : motif obligatoire ; toute décision est définitive (aucun retour en « en_attente »).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t constant text := 'pi_audits_fonciers';
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

-- Points BLOQUANTS (NO-GO) du protocole.
create or replace function public.fonc_audit_points_bloquants() returns text[]
language sql immutable set search_path = '' as $$
  select array['AUD-COUT-01','AUD-COUT-02','AUD-COUT-03','AUD-COUT-04','AUD-JUR-01','AUD-JUR-02','AUD-JUR-03','AUD-JUR-04','AUD-JUR-05',
               'AUD-TECH-01','AUD-TECH-02','AUD-FIN-01','AUD-FIN-03']::text[]
$$;
create or replace function public.fonc_audit_points() returns text[]
language sql immutable set search_path = '' as $$
  select array['AUD-COUT-01','AUD-COUT-02','AUD-COUT-03','AUD-COUT-04','AUD-COUT-05','AUD-JUR-01','AUD-JUR-02','AUD-JUR-03','AUD-JUR-04','AUD-JUR-05',
               'AUD-TECH-01','AUD-TECH-02','AUD-TECH-03','AUD-TECH-04','AUD-TECH-05','AUD-FIN-01','AUD-FIN-02','AUD-FIN-03','AUD-FIN-04']::text[]
$$;

-- Cohérence d'un audit (vrai = enregistrement admis).
create or replace function public.fonc_audit_valide(d jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; p jsonb; s text; bloq text[] := public.fonc_audit_points_bloquants();
begin
  if coalesce(d ->> 'decision', 'en_attente') not in ('en_attente', 'go', 'no_go') then return false; end if;
  if d ->> 'zone' not in ('urbain', 'periurbain', 'rural') then return false; end if;
  if jsonb_typeof(coalesce(d -> 'points', '{}'::jsonb)) <> 'object' then return false; end if;
  for k, p in select * from jsonb_each(coalesce(d -> 'points', '{}'::jsonb)) loop
    if not (k = any (public.fonc_audit_points())) then return false; end if;
    s := coalesce(p ->> 'statut', 'a_verifier');
    if s not in ('a_verifier', 'conforme', 'non_conforme', 'en_regularisation', 'non_applicable') then return false; end if;
    if s = 'conforme' and length(trim(coalesce(p ->> 'piece_ref', ''))) = 0 then return false; end if;
    if s in ('non_conforme', 'non_applicable') and length(trim(coalesce(p ->> 'observation', ''))) = 0 then return false; end if;
  end loop;
  if d ->> 'decision' = 'no_go' and length(trim(coalesce(d ->> 'decision_motif', ''))) = 0 then return false; end if;
  if d ->> 'decision' = 'go' then
    foreach k in array public.fonc_audit_points() loop                       -- les 19 points évalués
      s := coalesce(d -> 'points' -> k ->> 'statut', 'a_verifier');
      if s = 'a_verifier' then return false; end if;
      if k = any (bloq) and s not in ('conforme', 'non_applicable') then return false; end if;   -- bloquant : conforme ou non applicable
    end loop;
    foreach k in array array['suivi', 'juridique', 'dg'] loop                -- 3 visas nommés
      if length(trim(coalesce(d -> 'visas' -> k ->> 'nom', ''))) = 0 then return false; end if;
    end loop;
  end if;
  return true;
end$$;

alter table public.pi_audits_fonciers drop constraint if exists pi_audits_chk;
alter table public.pi_audits_fonciers add constraint pi_audits_chk check (public.fonc_audit_valide(data));

-- Une décision est définitive : ni retour en attente, ni changement de décision, ni modification des points ensuite.
create or replace function public.fonc_audit_decision_definitive() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(old.data ->> 'decision', 'en_attente') <> 'en_attente' then
    if new.data ->> 'decision' is distinct from old.data ->> 'decision' or new.data -> 'points' is distinct from old.data -> 'points'
       or new.data -> 'visas' is distinct from old.data -> 'visas' then
      raise exception 'Audit foncier décidé (%) : non modifiable', old.data ->> 'decision' using errcode = '23514';
    end if;
  end if;
  return new;
end$$;
drop trigger if exists pi_audits_decision_definitive on public.pi_audits_fonciers;
create trigger pi_audits_decision_definitive before update on public.pi_audits_fonciers
  for each row execute function public.fonc_audit_decision_definitive();

create unique index if not exists pi_audits_operation_actif on public.pi_audits_fonciers ((data ->> 'operation_id'))
  where coalesce(data ->> 'operation_id', '') <> '' and data ->> 'decision' <> 'no_go';
create index if not exists pi_audits_parcelle on public.pi_audits_fonciers ((data ->> 'parcelle_id'));

do $$ begin
  begin alter publication supabase_realtime add table public.pi_audits_fonciers;
  exception when duplicate_object then null; end;
end$$;

-- ── Vérification : 1 ligne, rls_active = true, anon_grants = 0 ─────────────
select c.relname, c.relrowsecurity as rls_active,
       (select count(*) from information_schema.role_table_grants g where g.table_name = c.relname and g.grantee = 'anon') as anon_grants
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'pi_audits_fonciers';

-- ── RECETTE ────────────────────────────────────────────────────────────────
--  1. Point « conforme » sans référence de pièce → refus (23514). « Non conforme » ou « non applicable » sans motif → refus.
--  2. Décision GO avec un point à vérifier, un bloquant non conforme ou en régularisation, ou un visa manquant → refus.
--  3. Décision NO-GO sans motif → refus.
--  4. Après décision : modifier un point, un visa ou la décision → refus.
--  5. Deux audits actifs pour la même opération → refus (un nouvel audit n'est possible qu'après un NO-GO).
-- ── RETOUR ARRIÈRE : drop table public.pi_audits_fonciers;
--     drop function public.fonc_audit_valide(jsonb), public.fonc_audit_decision_definitive(), public.fonc_audit_points(), public.fonc_audit_points_bloquants();
