-- Tests des règles de décision de l'audit foncier (supabase/foncier_audit_l8.sql) sur un PostgreSQL de test.
-- Usage : psql -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/foncier_audit_l8_test.sql   (depuis la racine du dépôt)
\set ON_ERROR_STOP on
drop table if exists public.pi_audits_fonciers cascade;
drop schema if exists auth cascade;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
do $$ begin if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if; end $$;
create or replace function public.pi_foncier_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end$$;
\i supabase/foncier_audit_l8.sql

create function pg_temp.pts(statut text default 'conforme') returns jsonb language sql as $$
  select jsonb_object_agg(k, jsonb_build_object('statut', statut, 'piece_ref', 'REF-1', 'observation', 'ok')) from unnest(public.fonc_audit_points()) k $$;
create function pg_temp.visas() returns jsonb language sql as $$ select '{"suivi":{"nom":"A"},"juridique":{"nom":"B"},"dg":{"nom":"C"}}'::jsonb $$;
-- ins / maj renvoient vrai si la base REFUSE (23514 ou 23505).
create function pg_temp.ins(p_id text, p_data jsonb) returns boolean language plpgsql as $$
begin insert into public.pi_audits_fonciers(id, data) values (p_id, p_data); return false;
exception when sqlstate '23514' or sqlstate '23505' then return true; end$$;
create function pg_temp.maj(p_id text, p_patch jsonb) returns boolean language plpgsql as $$
begin update public.pi_audits_fonciers set data = data || p_patch where id = p_id; return false;
exception when sqlstate '23514' then return true; end$$;
create function pg_temp.verifie(p_nom text, p_ok boolean) returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'ÉCHEC : %', p_nom; end if; raise notice 'ok  — %', p_nom; end$$;

do $$
declare vierge jsonb := (select jsonb_object_agg(k, '{"statut":"a_verifier"}'::jsonb) from unnest(public.fonc_audit_points()) k);
begin
  perform pg_temp.verifie('19 points, dont 13 bloquants', array_length(public.fonc_audit_points(), 1) = 19 and array_length(public.fonc_audit_points_bloquants(), 1) = 13);
  perform pg_temp.verifie('audit vierge accepté', not pg_temp.ins('a1', jsonb_build_object('zone','urbain','operation_id','OP1','points',vierge,'decision','en_attente')));
  perform pg_temp.verifie('2e audit actif sur la même opération refusé', pg_temp.ins('a2', jsonb_build_object('zone','urbain','operation_id','OP1','decision','en_attente')));
  perform pg_temp.verifie('« conforme » sans référence de pièce refusé', pg_temp.ins('a3', '{"zone":"urbain","points":{"AUD-JUR-01":{"statut":"conforme"}}}'));
  perform pg_temp.verifie('« non conforme » sans motif refusé', pg_temp.ins('a4', '{"zone":"urbain","points":{"AUD-JUR-01":{"statut":"non_conforme"}}}'));
  perform pg_temp.verifie('« non applicable » sans motif refusé', pg_temp.ins('a5', '{"zone":"urbain","points":{"AUD-JUR-05":{"statut":"non_applicable"}}}'));
  perform pg_temp.verifie('code de point inconnu refusé', pg_temp.ins('a6', '{"zone":"urbain","points":{"AUD-XXX-01":{"statut":"conforme","piece_ref":"x"}}}'));
  perform pg_temp.verifie('statut inconnu refusé', pg_temp.ins('a7', '{"zone":"urbain","points":{"AUD-JUR-01":{"statut":"ok"}}}'));
  perform pg_temp.verifie('zone inconnue refusée', pg_temp.ins('a8', '{"zone":"lune","points":{}}'));
  perform pg_temp.verifie('GO avec 19 points à vérifier refusé', pg_temp.ins('g1', jsonb_build_object('zone','urbain','decision','go','points',vierge,'visas',pg_temp.visas())));
  perform pg_temp.verifie('GO sans le visa de la direction générale refusé', pg_temp.ins('g2', jsonb_build_object('zone','urbain','decision','go','points',pg_temp.pts(),'visas','{"suivi":{"nom":"A"},"juridique":{"nom":"B"}}'::jsonb)));
  perform pg_temp.verifie('GO avec un bloquant « en régularisation » refusé', pg_temp.ins('g4', jsonb_build_object('zone','urbain','decision','go','points',pg_temp.pts() || '{"AUD-JUR-01":{"statut":"en_regularisation"}}'::jsonb,'visas',pg_temp.visas())));
  perform pg_temp.verifie('GO avec un bloquant non conforme refusé', pg_temp.ins('g5', jsonb_build_object('zone','urbain','decision','go','points',pg_temp.pts() || '{"AUD-JUR-01":{"statut":"non_conforme","observation":"hypothèque"}}'::jsonb,'visas',pg_temp.visas())));
  perform pg_temp.verifie('GO complet (19 conformes, 3 visas) accepté', not pg_temp.ins('g3', jsonb_build_object('zone','urbain','operation_id','OP3','decision','go','points',pg_temp.pts(),'visas',pg_temp.visas())));
  perform pg_temp.verifie('GO avec réserves (un majeur non conforme motivé) accepté', not pg_temp.ins('g6', jsonb_build_object('zone','urbain','decision','go','points',pg_temp.pts() || '{"AUD-TECH-04":{"statut":"non_conforme","observation":"bas-fond"}}'::jsonb,'visas',pg_temp.visas())));
  perform pg_temp.verifie('GO avec JUR-05 « non applicable » motivé (zone urbaine) accepté', not pg_temp.ins('g7', jsonb_build_object('zone','urbain','decision','go','points',pg_temp.pts() || '{"AUD-JUR-05":{"statut":"non_applicable","observation":"urbain"}}'::jsonb,'visas',pg_temp.visas())));
  perform pg_temp.verifie('NO-GO sans motif refusé', pg_temp.ins('n1', '{"zone":"urbain","decision":"no_go","points":{}}'));
  perform pg_temp.verifie('NO-GO motivé accepté', not pg_temp.ins('n2', '{"zone":"urbain","operation_id":"OP1","decision":"no_go","decision_motif":"TF existant","points":{}}'));
  perform pg_temp.verifie('audit décidé : modification d''un point refusée', pg_temp.maj('g3', '{"points":{"AUD-JUR-01":{"statut":"non_conforme","observation":"x"}}}'));
  perform pg_temp.verifie('audit décidé : retour en attente refusé', pg_temp.maj('g3', '{"decision":"en_attente"}'));
  perform pg_temp.verifie('audit décidé : modification d''un visa refusée', pg_temp.maj('g3', '{"visas":{"dg":{"nom":"Z"}}}'));
  perform pg_temp.verifie('audit décidé : champ sans rapport accepté', not pg_temp.maj('g3', '{"note":"archivé"}'));
  perform pg_temp.verifie('audit en cours : NO-GO motivé accepté', not pg_temp.maj('a1', '{"decision":"no_go","decision_motif":"litige"}'));
  perform pg_temp.verifie('nouvel audit sur l''opération après un NO-GO accepté', not pg_temp.ins('a9', '{"zone":"urbain","operation_id":"OP1","decision":"en_attente"}'));
  perform pg_temp.verifie('anon : aucun droit', not has_table_privilege('anon', 'public.pi_audits_fonciers', 'select'));
end $$;
\i supabase/foncier_audit_l8.sql
\echo TOUS LES TESTS SONT PASSÉS
