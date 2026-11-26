-- Tests du registre des constats d'incohérence (supabase/foncier_coherence_l12.sql) sur un PostgreSQL de test.
-- Usage : psql -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/foncier_coherence_l12_test.sql   (depuis la racine du dépôt)
\set ON_ERROR_STOP on
drop table if exists public.pi_constats_coherence_fonciers cascade;
drop schema if exists auth cascade;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function public.pi_foncier_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end$$;
\i supabase/foncier_coherence_l12.sql

create function pg_temp.base(extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('cle','doublon|a+b','code','doublon','parcelle_id','a','niveau','majeur','statut','ouvert','observations','[]'::jsonb) || extra $$;
create function pg_temp.ins(p_id text, p_data jsonb) returns boolean language plpgsql as $$
begin insert into public.pi_constats_coherence_fonciers(id, data) values (p_id, p_data); return false;
exception when sqlstate '23514' or sqlstate '23505' then return true; end$$;
create function pg_temp.verifie(p_nom text, p_ok boolean) returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'ÉCHEC : %', p_nom; end if; raise notice 'ok  — %', p_nom; end$$;
do $$
begin
  perform pg_temp.verifie('constat ouvert valide', not pg_temp.ins('c1', pg_temp.base()));
  perform pg_temp.verifie('statut inconnu refusé', pg_temp.ins('c2', pg_temp.base('{"cle":"x","statut":"archive"}')));
  perform pg_temp.verifie('niveau inconnu refusé', pg_temp.ins('c3', pg_temp.base('{"cle":"y","niveau":"grave"}')));
  perform pg_temp.verifie('même clé ouverte deux fois refusée', pg_temp.ins('c4', pg_temp.base()));
  perform pg_temp.verifie('maintenu sans motif refusé', pg_temp.ins('c5', pg_temp.base('{"cle":"z","statut":"maintenu","decision":{"par":"K","le":"2026-11-26"}}')));
  perform pg_temp.verifie('maintenu avec motif court refusé', pg_temp.ins('c6', pg_temp.base('{"cle":"z","statut":"maintenu","decision":{"texte":"court","par":"K","le":"2026-11-26"}}')));
  perform pg_temp.verifie('maintenu motivé accepté', not pg_temp.ins('c7', pg_temp.base('{"cle":"z","statut":"maintenu","decision":{"texte":"Deux phases distinctes du même site","par":"K","le":"2026-11-26"}}')));
  perform pg_temp.verifie('maintenu sans décideur refusé', pg_temp.ins('c8', pg_temp.base('{"cle":"w","statut":"faux_positif","decision":{"texte":"Détection erronée, contour validé","le":"2026-11-26"}}')));
  perform pg_temp.verifie('corrigé sans motif refusé', pg_temp.ins('c9', pg_temp.base('{"cle":"v","statut":"corrige"}')));
  perform pg_temp.verifie('observations non tableau refusé', pg_temp.ins('c10', pg_temp.base('{"cle":"u","observations":"texte"}')));
  perform pg_temp.verifie('constat clos puis nouveau constat ouvert de même clé accepté', not pg_temp.ins('c11', pg_temp.base('{"cle":"z"}')));
  perform pg_temp.verifie('anon : aucun droit', not has_table_privilege('anon', 'public.pi_constats_coherence_fonciers', 'select'));
  perform pg_temp.verifie('RLS active', (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.pi_constats_coherence_fonciers'::regclass));
end $$;
drop table public.pi_constats_coherence_fonciers cascade;
