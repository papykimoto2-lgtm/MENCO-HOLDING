-- Tests des correctifs serveur L15 (supabase/foncier_correctifs_l15.sql) sur un PostgreSQL de test avec PostGIS.
-- Usage : psql -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/foncier_correctifs_l15_test.sql   (depuis la racine du dépôt)
\set ON_ERROR_STOP on
drop table if exists public.pi_parcelles, public.pi_parcelles_geom, public.pi_audits_fonciers, public.pi_programmes, public.pi_enquetes_fonciers, public.pi_oppositions_fonciers, public.pi_bornages_fonciers,
  public.pi_proprietaires_fonciers, public.pi_charges_fonciers, public.pi_exploitations_fonciers, public.pi_contrats_fonciers, public.pi_protocoles_purge_fonciers, public.pi_pv_remises_fonciers, public.pi_constats_coherence_fonciers cascade;
drop schema if exists auth cascade;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function public.pi_foncier_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end$$;
create table public.pi_parcelles (id text primary key, data jsonb not null default '{}', updated_at timestamptz default now(), scope_id text);
create table public.pi_audits_fonciers (id text primary key, data jsonb not null default '{}', updated_at timestamptz default now(), scope_id text);
create table public.pi_programmes (id text primary key, data jsonb not null default '{}', updated_at timestamptz default now(), scope_id text);
\i supabase/foncier_urbain_rural_l3.sql
\i supabase/foncier_urbain_rural_l5.sql
\i supabase/foncier_documents_l10.sql
\i supabase/foncier_coherence_l12.sql
\i supabase/foncier_chevauchement_postgis.sql
\i supabase/foncier_suppression_l13.sql
-- Garde « dernier écrit gagne » simulé (en prod : trg_lww) : une écriture dont _modifie n'avance pas est ignorée sans erreur.
create or replace function public.t_lww() returns trigger language plpgsql as $$ begin
  if coalesce(new.data ->> '_modifie', '') <= coalesce(old.data ->> '_modifie', '') then return old; end if; return new; end$$;
create trigger trg_lww before update on public.pi_parcelles for each row execute function public.t_lww();
create or replace function public.pi_parcelles_regime_garde() returns trigger language plpgsql as $$ begin return new; end$$;   -- version L1 simplifiée, remplacée par L15
create trigger pi_parcelles_regime_garde before insert or update on public.pi_parcelles for each row execute function public.pi_parcelles_regime_garde();
\i supabase/foncier_correctifs_l15.sql

create function pg_temp.verifie(p_nom text, p_ok boolean) returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'ÉCHEC : %', p_nom; end if; raise notice 'ok  — %', p_nom; end$$;
create function pg_temp.ins(t text, p_id text, p_data jsonb) returns boolean language plpgsql as $$
begin execute format('insert into public.%I(id, data) values ($1, $2)', t) using p_id, p_data; return false;
exception when sqlstate '23514' then return true; end$$;
create function pg_temp.maj(t text, p_id text, p_patch jsonb, p_retire text default null) returns boolean language plpgsql as $$
begin execute format('update public.%I set data = (case when $3 is null then data else data - $3 end) || $2 where id = $1', t) using p_id, p_patch, p_retire; return false;
exception when sqlstate '23514' then return true; end$$;
create function pg_temp.sq(x numeric, y numeric, c numeric) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('x',x,'y',y),jsonb_build_object('x',x+c,'y',y),jsonb_build_object('x',x+c,'y',y+c),jsonb_build_object('x',x,'y',y+c)) $$;
do $$
declare ok boolean; g1 text; g2 text; r text;
begin
  -- A. champs obligatoires
  perform pg_temp.verifie('A charge sans statut refusée', pg_temp.ins('pi_charges_fonciers', 'c0', '{"parcelle_id":"p","type":"servitude"}'));
  perform pg_temp.verifie('A charge sans type refusée', pg_temp.ins('pi_charges_fonciers', 'c0', '{"parcelle_id":"p","statut":"active"}'));
  perform pg_temp.verifie('A contrat sans statut refusé', pg_temp.ins('pi_contrats_fonciers', 'k0', '{"parcelle_id":"p","type":"bail","periodicite":"unique","redevance":0}'));
  perform pg_temp.verifie('A enquête sans statut refusée', pg_temp.ins('pi_enquetes_fonciers', 'e0', '{"parcelle_id":"p"}'));
  perform pg_temp.verifie('A opposition sans statut refusée', pg_temp.ins('pi_oppositions_fonciers', 'o0', '{"parcelle_id":"p","motif":"m"}'));
  perform pg_temp.verifie('A constat sans niveau refusé', pg_temp.ins('pi_constats_coherence_fonciers', 'z0', '{"cle":"a","code":"a","parcelle_id":"p","statut":"ouvert"}'));
  perform pg_temp.verifie('A charge complète acceptée', not pg_temp.ins('pi_charges_fonciers', 'c1', '{"parcelle_id":"p","type":"servitude","statut":"active"}'));
  -- B. protocole signé sans clé statut
  insert into public.pi_audits_fonciers values ('au1', '{"decision":"go","operation_id":"OP1"}');
  perform pg_temp.verifie('B protocole brouillon accepté', not pg_temp.ins('pi_protocoles_purge_fonciers', 'pr1', jsonb_build_object('reference','PRT-1','statut','brouillon','village_id','v1','chef_nom','Chef','famille','K','montant',100,'superficie_m2',100,'tranche1_pct',30,'tranche2_pct',40,'tranche3_pct',30,'quote_part_village_pct',35,'operation_id','OP1')));
  perform pg_temp.verifie('B signature acceptée (audit GO)', not pg_temp.maj('pi_protocoles_purge_fonciers', 'pr1', '{"statut":"signe","date_signature":"2026-06-01","annexe1":"oui","annexe2":"oui","annexe3":"oui","annexe4":"oui","annexe5":"oui"}'));
  perform pg_temp.verifie('B suppression de la clé statut d''un protocole signé : refusée', pg_temp.maj('pi_protocoles_purge_fonciers', 'pr1', '{}', 'statut'));
  perform pg_temp.verifie('B insertion d''un protocole sans statut refusée', pg_temp.ins('pi_protocoles_purge_fonciers', 'pr2', '{"reference":"PRT-2","village_id":"v1"}'));
  -- C. retours en arrière
  insert into public.pi_charges_fonciers values ('c2', '{"parcelle_id":"p","type":"servitude","statut":"levee","mainlevee_ref":"ML1"}');
  perform pg_temp.verifie('C charge levée → active refusée', pg_temp.maj('pi_charges_fonciers', 'c2', '{"statut":"active"}'));
  insert into public.pi_enquetes_fonciers values ('e1', '{"parcelle_id":"p","statut":"cloturee","date_ouverture":"2026-01-01","date_fin_prevue":"2026-01-31","date_cloture":"2026-02-01"}');
  perform pg_temp.verifie('C enquête clôturée → ouverte refusée', pg_temp.maj('pi_enquetes_fonciers', 'e1', '{"statut":"ouverte"}'));
  perform pg_temp.verifie('C enquête clôturée : autre champ modifiable', not pg_temp.maj('pi_enquetes_fonciers', 'e1', '{"commissaire":"M. X"}'));
  insert into public.pi_oppositions_fonciers values ('o1', '{"parcelle_id":"p","motif":"m","statut":"levee","issue":"accord"}');
  perform pg_temp.verifie('C opposition levée → ouverte refusée', pg_temp.maj('pi_oppositions_fonciers', 'o1', '{"statut":"ouverte"}'));
  insert into public.pi_bornages_fonciers values ('b1', '{"parcelle_id":"p","statut":"realise","pv_ref":"PV","convocations":[{"present":"true"}]}');
  perform pg_temp.verifie('C bornage réalisé → convoqué refusé', pg_temp.maj('pi_bornages_fonciers', 'b1', '{"statut":"convoque"}'));
  insert into public.pi_proprietaires_fonciers values ('pp1', '{"parcelle_id":"p","proprietaire":"X","quote_part":100,"date_debut":"2020-01-01","date_fin":"2024-01-01"}');
  perform pg_temp.verifie('C propriétaire sorti : date_fin supprimée refusée', pg_temp.maj('pi_proprietaires_fonciers', 'pp1', '{}', 'date_fin'));
  insert into public.pi_contrats_fonciers values ('k1', '{"parcelle_id":"p","type":"bail","statut":"actif","periodicite":"annuelle","redevance":100,"date_fin":"2027-01-01","echeances":[{"statut":"paye"},{"statut":"a_payer"}]}');
  perform pg_temp.verifie('C échéance payée → à payer refusée', pg_temp.maj('pi_contrats_fonciers', 'k1', '{"echeances":[{"statut":"a_payer"},{"statut":"a_payer"}]}'));
  perform pg_temp.verifie('C échéance restante modifiable', not pg_temp.maj('pi_contrats_fonciers', 'k1', '{"echeances":[{"statut":"paye"},{"statut":"paye"}]}'));
  insert into public.pi_contrats_fonciers values ('k2', '{"parcelle_id":"p","type":"bail","statut":"resilie","periodicite":"unique","redevance":0,"motif_resiliation":"fin"}');
  perform pg_temp.verifie('C contrat résilié → actif refusé', pg_temp.maj('pi_contrats_fonciers', 'k2', '{"statut":"actif"}'));
  insert into public.pi_constats_coherence_fonciers values ('z1', '{"cle":"a|b","code":"a","parcelle_id":"p","niveau":"majeur","statut":"maintenu","observations":[],"decision":{"texte":"Deux phases distinctes du même site","par":"K","le":"2026-11-26"}}');
  perform pg_temp.verifie('C décision d''un constat maintenu non réécrite', pg_temp.maj('pi_constats_coherence_fonciers', 'z1', '{"decision":{"texte":"Autre motif tout aussi long","par":"K","le":"2026-11-27"}}'));
  perform pg_temp.verifie('C constat maintenu : rouvrir autorisé', not pg_temp.maj('pi_constats_coherence_fonciers', 'z1', '{"statut":"ouvert"}'));
  -- D. régime conservé sur upsert sans champ
  insert into public.pi_parcelles(id, data) values ('r1', '{"ref":"R1","regime":"rural","_modifie":"2026-01-01T00:00:00.000Z"}');
  insert into public.pi_parcelles(id, data) values ('r1', '{"ref":"R1","_modifie":"2026-02-01T00:00:00.000Z"}') on conflict (id) do update set data = excluded.data;
  perform pg_temp.verifie('D régime rural conservé après un upsert sans régime', (select data ->> 'regime' from public.pi_parcelles where id = 'r1') = 'rural');
  insert into public.pi_parcelles(id, data) values ('n1', '{"ref":"N1"}');
  perform pg_temp.verifie('D parcelle neuve sans régime : urbain', (select data ->> 'regime' from public.pi_parcelles where id = 'n1') = 'urbain');
  -- E. upsert périmé : la table des contours ne bouge pas
  insert into public.pi_parcelles(id, data) values ('g1', jsonb_build_object('ref','G1','regime','urbain','utm_zone',30,'bornes',pg_temp.sq(410000,610000,100),'_modifie','2026-05-01T00:00:00.000Z'));
  select extensions.st_astext(geom) into g1 from public.pi_parcelles_geom where parcelle_id = 'g1';
  insert into public.pi_parcelles(id, data) values ('g1', jsonb_build_object('ref','G1','regime','urbain','utm_zone',30,'bornes',pg_temp.sq(420000,620000,100),'_modifie','2026-01-01T00:00:00.000Z'))
    on conflict (id) do update set data = excluded.data;     -- périmé : ignoré par trg_lww
  select extensions.st_astext(geom) into g2 from public.pi_parcelles_geom where parcelle_id = 'g1';
  perform pg_temp.verifie('E upsert périmé : contour de la table inchangé', g1 = g2);
  perform pg_temp.verifie('E upsert périmé : parcelle inchangée', (select data -> 'bornes' -> 0 ->> 'x' from public.pi_parcelles where id = 'g1') = '410000');
  insert into public.pi_parcelles(id, data) values ('g1', jsonb_build_object('ref','G1','regime','urbain','utm_zone',30,'bornes',pg_temp.sq(430000,630000,100),'_modifie','2026-09-01T00:00:00.000Z'))
    on conflict (id) do update set data = excluded.data;     -- plus récent : accepté et contour mis à jour
  select extensions.st_astext(geom) into g2 from public.pi_parcelles_geom where parcelle_id = 'g1';
  perform pg_temp.verifie('E upsert récent : contour mis à jour', g1 <> g2);
end $$;
-- Rejeu
\i supabase/foncier_correctifs_l15.sql
drop table public.pi_parcelles, public.pi_parcelles_geom, public.pi_audits_fonciers, public.pi_programmes, public.pi_enquetes_fonciers, public.pi_oppositions_fonciers, public.pi_bornages_fonciers,
  public.pi_proprietaires_fonciers, public.pi_charges_fonciers, public.pi_exploitations_fonciers, public.pi_contrats_fonciers, public.pi_protocoles_purge_fonciers, public.pi_pv_remises_fonciers, public.pi_constats_coherence_fonciers cascade;
drop function if exists public.t_lww();
\echo TOUS LES TESTS SONT PASSÉS
