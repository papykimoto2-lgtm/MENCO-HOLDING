-- Tests du garde-fou de suppression (supabase/foncier_suppression_l13.sql) sur un PostgreSQL de test.
-- Usage : psql -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/foncier_suppression_l13_test.sql   (depuis la racine du dépôt)
\set ON_ERROR_STOP on
do $$ declare t text; begin
  foreach t in array array['pi_protocoles_purge_fonciers','pi_pv_remises_fonciers','pi_enquetes_fonciers','pi_oppositions_fonciers','pi_bornages_fonciers','pi_charges_fonciers','pi_proprietaires_fonciers','pi_audits_fonciers','pi_contrats_fonciers','pi_constats_coherence_fonciers']
  loop execute format('drop table if exists public.%I cascade', t); execute format('create table public.%I (id text primary key, data jsonb not null default ''{}'')', t); end loop;
end $$;
\i supabase/foncier_suppression_l13.sql

create function pg_temp.verifie(p_nom text, p_ok boolean) returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'ÉCHEC : %', p_nom; end if; raise notice 'ok  — %', p_nom; end$$;
-- Chaque contrôle prépare la ligne sans trigger, réactive la garde, puis tente la suppression.
create function pg_temp.refuse(t text, p_data jsonb) returns boolean language plpgsql as $$
begin
  execute format('alter table public.%I disable trigger user', t); execute format('delete from public.%I', t); execute format('insert into public.%I(id, data) values (''x'', $1)', t) using p_data; execute format('alter table public.%I enable trigger user', t);
  begin execute format('delete from public.%I where id = ''x''', t); return false; exception when sqlstate '23514' then return true; end;
end$$;
create function pg_temp.accepte(t text, p_data jsonb) returns boolean language plpgsql as $$
begin
  execute format('alter table public.%I disable trigger user', t); execute format('delete from public.%I', t); execute format('insert into public.%I(id, data) values (''x'', $1)', t) using p_data; execute format('alter table public.%I enable trigger user', t);
  execute format('delete from public.%I where id = ''x''', t); return true;
exception when sqlstate '23514' then return false; end$$;
do $$
begin
  perform pg_temp.verifie('protocole signé : refus', pg_temp.refuse('pi_protocoles_purge_fonciers', '{"statut":"signe","reference":"PRT-1"}'));
  perform pg_temp.verifie('protocole réitéré : refus', pg_temp.refuse('pi_protocoles_purge_fonciers', '{"statut":"reitere"}'));
  perform pg_temp.verifie('protocole brouillon : accepté', pg_temp.accepte('pi_protocoles_purge_fonciers', '{"statut":"brouillon"}'));
  perform pg_temp.verifie('PV signé : refus', pg_temp.refuse('pi_pv_remises_fonciers', '{"statut":"signe"}'));
  perform pg_temp.verifie('PV brouillon : accepté', pg_temp.accepte('pi_pv_remises_fonciers', '{"statut":"brouillon"}'));
  perform pg_temp.verifie('enquête clôturée : refus', pg_temp.refuse('pi_enquetes_fonciers', '{"statut":"cloturee"}'));
  perform pg_temp.verifie('enquête planifiée : accepté', pg_temp.accepte('pi_enquetes_fonciers', '{"statut":"planifiee"}'));
  perform pg_temp.verifie('opposition levée : refus', pg_temp.refuse('pi_oppositions_fonciers', '{"statut":"levee"}'));
  perform pg_temp.verifie('opposition jugée : refus', pg_temp.refuse('pi_oppositions_fonciers', '{"statut":"jugee"}'));
  perform pg_temp.verifie('opposition ouverte : accepté', pg_temp.accepte('pi_oppositions_fonciers', '{"statut":"ouverte"}'));
  perform pg_temp.verifie('bornage réalisé : refus', pg_temp.refuse('pi_bornages_fonciers', '{"statut":"realise"}'));
  perform pg_temp.verifie('bornage convoqué : accepté', pg_temp.accepte('pi_bornages_fonciers', '{"statut":"convoque"}'));
  perform pg_temp.verifie('charge levée : refus', pg_temp.refuse('pi_charges_fonciers', '{"statut":"levee"}'));
  perform pg_temp.verifie('charge active : accepté', pg_temp.accepte('pi_charges_fonciers', '{"statut":"active"}'));
  perform pg_temp.verifie('propriétaire sorti : refus', pg_temp.refuse('pi_proprietaires_fonciers', '{"date_fin":"2024-01-01"}'));
  perform pg_temp.verifie('propriétaire actuel : accepté', pg_temp.accepte('pi_proprietaires_fonciers', '{"quote_part":100}'));
  perform pg_temp.verifie('audit décidé : refus', pg_temp.refuse('pi_audits_fonciers', '{"decision":"go"}'));
  perform pg_temp.verifie('audit en attente : accepté', pg_temp.accepte('pi_audits_fonciers', '{"decision":"en_attente"}'));
  perform pg_temp.verifie('contrat résilié : refus', pg_temp.refuse('pi_contrats_fonciers', '{"statut":"resilie"}'));
  perform pg_temp.verifie('contrat encaissé : refus', pg_temp.refuse('pi_contrats_fonciers', '{"statut":"actif","echeances":[{"statut":"paye"}]}'));
  perform pg_temp.verifie('contrat sans paiement : accepté', pg_temp.accepte('pi_contrats_fonciers', '{"statut":"actif","echeances":[{"statut":"a_payer"}]}'));
  perform pg_temp.verifie('constat de cohérence : toujours refus', pg_temp.refuse('pi_constats_coherence_fonciers', '{"statut":"ouvert"}'));
end $$;
do $$ declare t text; begin
  foreach t in array array['pi_protocoles_purge_fonciers','pi_pv_remises_fonciers','pi_enquetes_fonciers','pi_oppositions_fonciers','pi_bornages_fonciers','pi_charges_fonciers','pi_proprietaires_fonciers','pi_audits_fonciers','pi_contrats_fonciers','pi_constats_coherence_fonciers']
  loop execute format('drop table public.%I cascade', t); end loop; end $$;
