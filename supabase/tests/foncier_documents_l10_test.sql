-- Tests des règles des modèles de documents (supabase/foncier_documents_l10.sql) sur un PostgreSQL de test.
-- Usage : psql -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/foncier_documents_l10_test.sql   (depuis la racine du dépôt)
\set ON_ERROR_STOP on
drop table if exists public.pi_protocoles_purge_fonciers, public.pi_pv_remises_fonciers, public.pi_audits_fonciers, public.pi_programmes cascade;
drop schema if exists auth cascade;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create function public.pi_foncier_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end$$;
create table public.pi_audits_fonciers (id text primary key, data jsonb not null default '{}', updated_at timestamptz default now(), scope_id text);
create table public.pi_programmes (id text primary key, data jsonb not null default '{}', updated_at timestamptz default now(), scope_id text);
insert into public.pi_programmes values ('prog1', '{"ref_import":"OP-BING-01"}');
insert into public.pi_audits_fonciers values ('aud1', '{"decision":"go","code_projet":"OP-BING-01"}'), ('aud2', '{"decision":"go","operation_id":"OPAF1"}'), ('aud3', '{"decision":"en_attente","operation_id":"OPAF9"}'), ('aud4', '{"decision":"go","parcelle_id":"PAR1"}');
\i supabase/foncier_documents_l10.sql

create function pg_temp.base(extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('reference','PRT-PURGE-2026-001','statut','brouillon','village_id','v1','chef_nom','Chef','famille','Famille K','montant',50000000,'superficie_m2',125000,
    'tranche1_pct',30,'tranche2_pct',40,'tranche3_pct',30,'quote_part_village_pct',35,'programme_id','prog1') || extra $$;
create function pg_temp.annexes() returns jsonb language sql as $$ select '{"annexe1":"oui","annexe2":"oui","annexe3":"oui","annexe4":"oui","annexe5":"oui","date_signature":"2026-06-01"}'::jsonb $$;
create function pg_temp.ins(t text, p_id text, p_data jsonb) returns boolean language plpgsql as $$
begin execute format('insert into public.%I(id, data) values ($1, $2)', t) using p_id, p_data; return false;
exception when sqlstate '23514' then return true; end$$;
create function pg_temp.maj(t text, p_id text, p_patch jsonb) returns boolean language plpgsql as $$
begin execute format('update public.%I set data = data || $2 where id = $1', t) using p_id, p_patch; return false;
exception when sqlstate '23514' then return true; end$$;
create function pg_temp.verifie(p_nom text, p_ok boolean) returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'ÉCHEC : %', p_nom; end if; raise notice 'ok  — %', p_nom; end$$;
do $$
declare P text := 'pi_protocoles_purge_fonciers'; V text := 'pi_pv_remises_fonciers';
begin
  perform pg_temp.verifie('protocole brouillon accepté', not pg_temp.ins(P, 'p1', pg_temp.base()));
  perform pg_temp.verifie('tranches ≠ 100 % refusées', pg_temp.ins(P, 'x1', pg_temp.base('{"tranche3_pct":20}')));
  perform pg_temp.verifie('montant nul refusé', pg_temp.ins(P, 'x2', pg_temp.base('{"montant":0}')));
  perform pg_temp.verifie('part villageoise > 100 % refusée', pg_temp.ins(P, 'x3', pg_temp.base('{"quote_part_village_pct":120}')));
  perform pg_temp.verifie('part villageoise absente refusée', pg_temp.ins(P, 'x4', pg_temp.base() - 'quote_part_village_pct'));
  perform pg_temp.verifie('signé sans les 5 annexes refusé', pg_temp.maj(P, 'p1', '{"statut":"signe","date_signature":"2026-06-01","annexe1":"oui"}'));
  perform pg_temp.verifie('signé avec annexes mais sans date refusé', pg_temp.maj(P, 'p1', '{"statut":"signe","annexe1":"oui","annexe2":"oui","annexe3":"oui","annexe4":"oui","annexe5":"oui"}'));
  perform pg_temp.verifie('signé : audit GO du programme importé (code projet) → accepté', not pg_temp.maj(P, 'p1', pg_temp.annexes() || '{"statut":"signe"}'));
  perform pg_temp.verifie('signé : modification d''un montant refusée', pg_temp.maj(P, 'p1', '{"montant":1}'));
  perform pg_temp.verifie('réitéré sans acte notarié refusé', pg_temp.maj(P, 'p1', '{"statut":"reitere"}'));
  perform pg_temp.verifie('réitéré avec acte notarié accepté (seule évolution permise)', not pg_temp.maj(P, 'p1', '{"statut":"reitere","acte_notarie":"Minute 245","date_reiteration":"2026-07-01"}'));
  perform pg_temp.verifie('réitéré : plus aucune modification', pg_temp.maj(P, 'p1', '{"notaire":"X"}'));
  perform pg_temp.verifie('retour en brouillon d''un protocole signé refusé', pg_temp.maj(P, 'p1', '{"statut":"brouillon"}'));
  perform pg_temp.verifie('signé par l''opération du pipeline (audit GO) accepté', not pg_temp.ins(P, 'p2', pg_temp.base('{"programme_id":"","operation_id":"OPAF1","statut":"signe"}') || pg_temp.annexes()));
  perform pg_temp.verifie('signé sans audit GO (audit en attente) refusé', pg_temp.ins(P, 'p3', pg_temp.base('{"programme_id":"","operation_id":"OPAF9","statut":"signe"}') || pg_temp.annexes()));
  perform pg_temp.verifie('signé sans aucun audit refusé', pg_temp.ins(P, 'p4', pg_temp.base('{"programme_id":"","statut":"signe"}') || pg_temp.annexes()));
  perform pg_temp.verifie('signé sans audit mais avec dérogation motivée accepté', not pg_temp.ins(P, 'p5', pg_temp.base('{"programme_id":"","statut":"signe","derogation_audit":"Décision DG du 12/06"}') || pg_temp.annexes()));
  perform pg_temp.verifie('signé : lien parcelle ↔ audit GO accepté', not pg_temp.ins(P, 'p6', pg_temp.base('{"programme_id":"","parcelle_id":"PAR1","statut":"signe"}') || pg_temp.annexes()));

  perform pg_temp.verifie('PV de remise de lot brouillon accepté', not pg_temp.ins(V, 'v1', '{"type":"lot","statut":"brouillon","lot_id":"L1","client_id":"C1","reference":"PVL-2026-001"}'));
  perform pg_temp.verifie('PV sans souscripteur refusé', pg_temp.ins(V, 'v2', '{"type":"lot","statut":"brouillon","lot_id":"L1"}'));
  perform pg_temp.verifie('PV de type inconnu refusé', pg_temp.ins(V, 'v3', '{"type":"x","statut":"brouillon","lot_id":"L1","client_id":"C1"}'));
  perform pg_temp.verifie('PV signé sans date de signature refusé', pg_temp.maj(V, 'v1', '{"statut":"signe"}'));
  perform pg_temp.verifie('PV signé avec date accepté', not pg_temp.maj(V, 'v1', '{"statut":"signe","date_signature":"2026-06-02"}'));
  perform pg_temp.verifie('PV signé : plus modifiable', pg_temp.maj(V, 'v1', '{"observations":"x"}'));
  perform pg_temp.verifie('PV d''ACD sans pièce remise refusé', pg_temp.ins(V, 'a1', '{"type":"acd","statut":"brouillon","lot_id":"L1","client_id":"C1"}'));
  perform pg_temp.verifie('PV d''ACD : pièce cochée sans référence refusée', pg_temp.ins(V, 'a2', '{"type":"acd","statut":"brouillon","lot_id":"L1","client_id":"C1","p1_remis":"oui","p1_ref":""}'));
  perform pg_temp.verifie('PV d''ACD avec une pièce référencée accepté', not pg_temp.ins(V, 'a3', '{"type":"acd","statut":"brouillon","lot_id":"L1","client_id":"C1","p2_remis":"oui","p2_ref":"TF-218904"}'));
  perform pg_temp.verifie('anon : aucun droit', not has_table_privilege('anon', 'public.pi_protocoles_purge_fonciers', 'select') and not has_table_privilege('anon', 'public.pi_pv_remises_fonciers', 'select'));
end $$;
\i supabase/foncier_documents_l10.sql
\echo TOUS LES TESTS SONT PASSÉS
