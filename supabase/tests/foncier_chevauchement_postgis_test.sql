-- Tests de la garde serveur de chevauchement (supabase/foncier_chevauchement_postgis.sql) sur un PostgreSQL de test avec PostGIS.
-- Usage : psql -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/foncier_chevauchement_postgis_test.sql   (depuis la racine du dépôt)
-- Prérequis : paquet postgresql-XX-postgis-3 installé. Simule Supabase : schéma auth, rôles, table pi_parcelles.
\set ON_ERROR_STOP on
drop table if exists public.pi_parcelles, public.pi_parcelles_geom cascade;
drop schema if exists auth cascade;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table public.pi_parcelles (id text primary key, data jsonb not null default '{}', updated_at timestamptz default now(), scope_id text);
-- Un recouvrement préexistant (avant la garde) : ne doit jamais bloquer un enregistrement sans rapport avec la géométrie.
create function pg_temp.sq(x numeric, y numeric, c numeric) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('x',x,'y',y),jsonb_build_object('x',x+c,'y',y),jsonb_build_object('x',x+c,'y',y+c),jsonb_build_object('x',x,'y',y+c)) $$;
insert into public.pi_parcelles values ('OLD1', jsonb_build_object('ref','OLD-1','utm_zone',30,'bornes',pg_temp.sq(410000,610000,100))), ('OLD2', jsonb_build_object('ref','OLD-2','utm_zone',30,'bornes',pg_temp.sq(410050,610050,100)));
\i supabase/foncier_chevauchement_postgis.sql

create function pg_temp.refus(p_id text, p_data jsonb) returns boolean language plpgsql as $$
begin
  insert into public.pi_parcelles(id, data) values (p_id, p_data) on conflict (id) do update set data = excluded.data;
  return false;
exception when sqlstate '23514' then return true;
end$$;
create function pg_temp.maj(p_id text, p_patch jsonb, p_retire text default null) returns boolean language plpgsql as $$
begin
  update public.pi_parcelles set data = (case when p_retire is null then data else data - p_retire end) || p_patch where id = p_id;
  return false;
exception when sqlstate '23514' then return true;
end$$;
create function pg_temp.verifie(p_nom text, p_ok boolean) returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'ÉCHEC : %', p_nom; end if; raise notice 'ok  — %', p_nom; end$$;
create function pg_temp.p(ref text, bornes jsonb, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('ref', ref, 'utm_zone', 30, 'bornes', bornes) || extra $$;
create function pg_temp.deroge(motif text, avec text[]) returns jsonb language sql as $$
  select jsonb_build_object('derogation_chevauchement', jsonb_build_object('motif', motif, 'par', 'Admin', 'avec', to_jsonb(avec))) $$;
create function pg_temp.latlng(x numeric, y numeric, c numeric) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_array(extensions.st_y(t.g), extensions.st_x(t.g)) order by t.o)
    from (values (1, x, y), (2, x + c, y), (3, x + c, y + c), (4, x, y + c)) v(o, px, py),
         lateral (select v.o as o, extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(v.px, v.py), 32630), 4326) as g) t $$;

do $$
declare r boolean;
begin
  perform pg_temp.verifie('rattrapage : les 2 contours existants sont calculés, leur recouvrement est signalé par l''audit',
    (select count(*) from public.pi_parcelles_geom) = 2 and (select count(*) from public.fonc_audit_chevauchements()) = 1);
  perform pg_temp.verifie('enregistrement sans rapport avec la géométrie sur une parcelle qui en recouvre une autre : accepté',
    not pg_temp.maj('OLD1', '{"nom":"renommée"}'));

  r := pg_temp.refus('A', pg_temp.p('PARC-A', pg_temp.sq(400000, 600000, 100)));
  perform pg_temp.verifie('A (carré de 100 m) accepté, contour créé', not r and exists (select 1 from public.pi_parcelles_geom where parcelle_id = 'A'));
  perform pg_temp.verifie('aire du contour de A ≈ 10 000 m²', (select abs(extensions.st_area(geom::extensions.geography) - 10000) < 50 from public.pi_parcelles_geom where parcelle_id = 'A'));
  r := pg_temp.refus('B', pg_temp.p('B', pg_temp.sq(400050, 600050, 100)));
  perform pg_temp.verifie('recouvrement de 50 m : refusé', r);
  perform pg_temp.verifie('parcelle refusée : aucune ligne ni contour créés', not exists (select 1 from public.pi_parcelles where id = 'B') and not exists (select 1 from public.pi_parcelles_geom where parcelle_id = 'B'));
  perform pg_temp.verifie('parcelle contiguë (bord commun) : acceptée', not pg_temp.refus('C', pg_temp.p('C', pg_temp.sq(400100, 600000, 100))));
  perform pg_temp.verifie('recouvrement de 0,3 m (bruit de levé) : toléré', not pg_temp.refus('D', pg_temp.p('D', pg_temp.sq(400000, 599900.3, 100))));
  perform pg_temp.verifie('recouvrement de 5 m : refusé', pg_temp.refus('E', pg_temp.p('E', pg_temp.sq(400000, 600095, 100))));
  perform pg_temp.verifie('parcelle entièrement contenue dans A : refusée', pg_temp.refus('F', pg_temp.p('F', pg_temp.sq(400020, 600020, 50))));
  perform pg_temp.verifie('dérogation sans motif : refusée', pg_temp.refus('F', pg_temp.p('F', pg_temp.sq(400020, 600020, 50), pg_temp.deroge('', array['A']))));
  perform pg_temp.verifie('dérogation motivée couvrant A : acceptée', not pg_temp.refus('F', pg_temp.p('F', pg_temp.sq(400020, 600020, 50), pg_temp.deroge('décision du sous-préfet', array['A']))));
  perform pg_temp.verifie('G recouvre A et C : dérogation qui ne couvre que A refusée', pg_temp.refus('G', pg_temp.p('G', pg_temp.sq(400050, 600020, 100), pg_temp.deroge('x', array['A']))));
  perform pg_temp.verifie('G : dérogation couvrant A, C et F acceptée', not pg_temp.refus('G', pg_temp.p('G', pg_temp.sq(400050, 600020, 100), pg_temp.deroge('x', array['A', 'C', 'F']))));
  perform pg_temp.verifie('F recouvre déjà A : changement de nom accepté (géométrie inchangée)', not pg_temp.maj('F', '{"nom":"x"}'));
  perform pg_temp.verifie('F : dérogation retirée, autre champ modifié : accepté (géométrie inchangée)', not pg_temp.maj('F', '{"notes":"y"}', 'derogation_chevauchement'));
  perform pg_temp.verifie('F : déplacement des bornes dans A sans dérogation : refusé', pg_temp.maj('F', jsonb_build_object('bornes', pg_temp.sq(400021, 600020, 50))));
  perform pg_temp.verifie('A déplacée sur C : refusé', pg_temp.maj('A', jsonb_build_object('bornes', pg_temp.sq(400100, 600000, 100))));
  r := pg_temp.maj('A', jsonb_build_object('bornes', pg_temp.sq(402000, 600000, 100)));
  perform pg_temp.verifie('A déplacée à l''écart : acceptée, contour mis à jour',
    not r and (select extensions.st_x(extensions.st_centroid(extensions.st_transform(geom, 32630))) > 402000 from public.pi_parcelles_geom where parcelle_id = 'A'));
  perform pg_temp.verifie('l''audit liste les couples qui se recouvrent encore (F↔G, F↔… et OLD1↔OLD2)', (select count(*) from public.fonc_audit_chevauchements()) >= 2);

  r := pg_temp.refus('H', pg_temp.p('H', pg_temp.sq(400100, 600000, 100), '{"decoupee_dans":"C"}'));
  perform pg_temp.verifie('parcelle découpée : ignorée, aucun contour', not r and not exists (select 1 from public.pi_parcelles_geom where parcelle_id = 'H'));
  r := pg_temp.maj('D', '{"fusionnee_dans":"C"}');
  perform pg_temp.verifie('parcelle devenue fusionnée : contour retiré', not r and not exists (select 1 from public.pi_parcelles_geom where parcelle_id = 'D'));
  r := pg_temp.refus('I', pg_temp.p('I', '[{"x":0,"y":0},{"x":"abc","y":"def"},{"x":1,"y":1}]'::jsonb));
  perform pg_temp.verifie('moins de 3 bornes exploitables (zéros et texte ignorés) : acceptée, sans contour',
    not r and not exists (select 1 from public.pi_parcelles_geom where parcelle_id = 'I'));
  r := pg_temp.refus('J', pg_temp.p('J', '[{"x":405000,"y":605000},{"x":405100,"y":605100},{"x":405100,"y":605000},{"x":405000,"y":605100}]'::jsonb));
  perform pg_temp.verifie('polygone en nœud papillon : réparé, contour valide', not r
    and (select extensions.st_isvalid(geom) and extensions.st_area(geom) > 0 from public.pi_parcelles_geom where parcelle_id = 'J'));

  perform pg_temp.verifie('contour en latitude/longitude (geo_polygon) accepté', not pg_temp.refus('K', jsonb_build_object('ref', 'K', 'geo_polygon', pg_temp.latlng(406000, 606000, 100))));
  perform pg_temp.verifie('geo_polygon décalé de 50 m : refusé', pg_temp.refus('L', jsonb_build_object('ref', 'L', 'geo_polygon', pg_temp.latlng(406050, 606050, 100))));
  perform pg_temp.verifie('bornes UTM recouvrant un geo_polygon : refusé (les deux formats se comparent)', pg_temp.refus('M', pg_temp.p('M', pg_temp.sq(406050, 606050, 100))));

  perform pg_temp.verifie('zone 29 (Ouest) : contour accepté', not pg_temp.refus('Z1', jsonb_build_object('ref', 'Z1', 'utm_zone', 29, 'bornes', pg_temp.sq(700000, 800000, 100))));
  perform pg_temp.verifie('zone 29 : recouvrement refusé', pg_temp.refus('Z2', jsonb_build_object('ref', 'Z2', 'utm_zone', 29, 'bornes', pg_temp.sq(700050, 800050, 100))));

  delete from public.pi_parcelles where id = 'Z1';
  perform pg_temp.verifie('suppression d''une parcelle : contour retiré', not exists (select 1 from public.pi_parcelles_geom where parcelle_id = 'Z1'));
  perform pg_temp.verifie('après suppression, l''emplacement est de nouveau libre', not pg_temp.refus('Z3', jsonb_build_object('ref', 'Z3', 'utm_zone', 29, 'bornes', pg_temp.sq(700050, 800050, 100))));

  perform pg_temp.verifie('anon : aucun droit sur la table des contours', not has_table_privilege('anon', 'public.pi_parcelles_geom', 'select'));
  perform pg_temp.verifie('authenticated : lecture seule (ni insert, ni update, ni delete)', has_table_privilege('authenticated', 'public.pi_parcelles_geom', 'select')
    and not has_table_privilege('authenticated', 'public.pi_parcelles_geom', 'insert') and not has_table_privilege('authenticated', 'public.pi_parcelles_geom', 'update') and not has_table_privilege('authenticated', 'public.pi_parcelles_geom', 'delete'));
  perform pg_temp.verifie('la fonction du trigger n''est exécutable par aucun client', not has_function_privilege('authenticated', 'public.fonc_parcelles_geom_garde()', 'execute') and not has_function_privilege('anon', 'public.fonc_parcelles_geom_garde()', 'execute'));
end $$;

-- Idempotence : le script se rejoue sans erreur ni doublon.
\i supabase/foncier_chevauchement_postgis.sql
do $$ begin
  if (select count(*) from public.pi_parcelles_geom) <> (select count(distinct parcelle_id) from public.pi_parcelles_geom) then raise exception 'ÉCHEC : doublons après rejeu'; end if;
  raise notice 'ok  — script rejouable';
end $$;
\echo TOUS LES TESTS SONT PASSÉS
