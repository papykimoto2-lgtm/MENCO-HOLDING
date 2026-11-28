-- Foncier — croisement territorial EXACT côté serveur (PostGIS) : fc_territoire_croisement(contour).
-- À exécuter sur CHAQUE projet Supabase utilisant le module Territoire, après foncier_territoire_l18.sql et
-- foncier_chevauchement_postgis.sql (qui installe PostGIS dans le schéma « extensions »). Idempotent.
--
-- Pourquoi : le contrôle de l'ERP estime la surface commune par échantillonnage (marge de quelques pour cent, bande de
-- tolérance de 0,5 m le long des bords). Cette fonction calcule l'intersection géométrique réelle (ST_Intersection, aire géodésique).
-- Elle CONFIRME le contrôle ; elle ne le remplace pas et n'enregistre rien.
--
-- Règles reprises du client : couches actives, non obsolètes, à provenance complète (source, date, version) ; zones non supprimées ;
-- seuil de prise en compte max(5 m², 0,1 % de la parcelle) ; niveaux critique / majeur / information identiques à l'ERP.
-- Différence assumée : pas de bande de tolérance le long des bords (c'est l'intersection brute).
--
-- Sécurité : SECURITY INVOKER (la RLS des tables s'applique) + contrôle explicite du jeton du personnel ; aucun accès anonyme ni portail.
-- Retour arrière : voir la fin du fichier.

-- Polygone(s) d'une zone : anneaux [[lat, lng], …] → multipolygone WGS84 valide (anneau extérieur seulement, comme à l'import).
create or replace function public.fc_zone_geom(p_anneaux jsonb)
returns extensions.geometry
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $f$
declare
  v_ring jsonb; v_pts geometry[]; v_g geometry; v_out geometry;
begin
  if jsonb_typeof(p_anneaux) <> 'array' then return null; end if;
  for v_ring in select e from jsonb_array_elements(p_anneaux) e loop
    if jsonb_typeof(v_ring) <> 'array' then continue; end if;
    select array_agg(st_setsrid(st_makepoint((p ->> 1)::float8, (p ->> 0)::float8), 4326) order by o)
      into v_pts
      from jsonb_array_elements(v_ring) with ordinality t(p, o)
     where p ->> 0 ~ '^-?[0-9]+(\.[0-9]+)?$' and p ->> 1 ~ '^-?[0-9]+(\.[0-9]+)?$';
    if v_pts is null or array_length(v_pts, 1) < 3 then continue; end if;
    v_g := st_collectionextract(st_makevalid(st_makepolygon(st_makeline(v_pts || v_pts[1]))), 3);
    if v_g is null or st_isempty(v_g) then continue; end if;
    v_out := case when v_out is null then v_g else st_union(v_out, v_g) end;
  end loop;
  return v_out;
end
$f$;
revoke all on function public.fc_zone_geom(jsonb) from public, anon;

create or replace function public.fc_territoire_croisement(p_contour jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $f$
declare
  v_pts geometry[]; v_parc geometry; v_aire numeric; v_bb float8[];
  r record; v_zg geometry; v_inter geometry; v_m2 numeric; v_pct numeric; v_niv text; v_cat text;
  v_out jsonb := '[]'::jsonb; v_n int := 0;
begin
  if coalesce(auth.jwt() ->> 'app_role', '') = '' then return jsonb_build_object('erreur', 'acces_personnel_requis'); end if;
  if jsonb_typeof(p_contour) <> 'array' then return jsonb_build_object('erreur', 'contour_invalide'); end if;
  select array_agg(st_setsrid(st_makepoint((p ->> 1)::float8, (p ->> 0)::float8), 4326) order by o)
    into v_pts from jsonb_array_elements(p_contour) with ordinality t(p, o)
   where p ->> 0 ~ '^-?[0-9]+(\.[0-9]+)?$' and p ->> 1 ~ '^-?[0-9]+(\.[0-9]+)?$';
  if v_pts is null or array_length(v_pts, 1) < 3 or array_length(v_pts, 1) > 2000 then return jsonb_build_object('erreur', 'contour_invalide'); end if;
  v_parc := st_collectionextract(st_makevalid(st_makepolygon(st_makeline(v_pts || v_pts[1]))), 3);
  if v_parc is null or st_isempty(v_parc) then return jsonb_build_object('erreur', 'contour_invalide'); end if;
  v_aire := st_area(v_parc::geography);
  if v_aire <= 0 then return jsonb_build_object('erreur', 'contour_invalide'); end if;
  v_bb := array[st_ymin(v_parc), st_xmin(v_parc), st_ymax(v_parc), st_xmax(v_parc)];   -- lat min, lng min, lat max, lng max

  for r in
    select c.id as couche_id, c.data as cd, z.id as zone_id, z.data as zd
      from public.pi_couches_territoriales c
      join public.pi_zones_territoriales z on z.data ->> 'couche_id' = c.id
     where coalesce(c.data ->> 'actif', '') <> 'false' and coalesce(c.data ->> 'statut', '') <> 'obsolete'
       and coalesce(nullif(trim(c.data ->> 'source'), ''), 'À renseigner') <> 'À renseigner'
       and coalesce(c.data ->> 'date_source', '') <> '' and coalesce(trim(c.data ->> 'version'), '') <> ''
       and coalesce(c.data ->> '_deleted', '') <> 'true' and coalesce(z.data ->> '_deleted', '') <> 'true'
       and not exists (select 1 from public.pi_suppressions s where s.id = 'ts::zones_territoriales::' || z.id)
       and (jsonb_typeof(z.data -> 'bbox') <> 'array' or jsonb_array_length(z.data -> 'bbox') <> 4
            or not ((z.data -> 'bbox' ->> 2)::float8 < v_bb[1] or (z.data -> 'bbox' ->> 0)::float8 > v_bb[3]
                 or (z.data -> 'bbox' ->> 3)::float8 < v_bb[2] or (z.data -> 'bbox' ->> 1)::float8 > v_bb[4]))
     limit 3000
  loop
    v_n := v_n + 1; v_zg := public.fc_zone_geom(r.zd -> 'anneaux'); if v_zg is null then continue; end if;
    if not st_intersects(v_parc, v_zg) then continue; end if;
    v_inter := st_intersection(v_parc, v_zg); if v_inter is null or st_isempty(v_inter) then continue; end if;
    v_m2 := st_area(v_inter::geography); if v_m2 < greatest(5, v_aire * 0.001) then continue; end if;
    v_pct := least(100, round(v_m2 / v_aire * 100, 1)); v_cat := coalesce(r.zd ->> 'categorie', 'info');
    v_niv := case when v_cat = 'interdit' then (case when v_pct >= 1 then 'critique' else 'majeur' end)
                  when v_cat = 'sous_condition' then 'majeur'
                  when v_cat = 'alerte' then (case when v_pct >= 5 then 'majeur' else 'info' end) else 'info' end;
    v_out := v_out || jsonb_build_object('zone_id', r.zone_id, 'zone_nom', r.zd ->> 'nom', 'couche_id', r.couche_id, 'couche_nom', r.cd ->> 'nom', 'version', r.cd ->> 'version',
                                         'categorie', v_cat, 'm2', round(v_m2), 'pct', v_pct, 'niveau', v_niv);
  end loop;
  return jsonb_build_object('aire_m2', round(v_aire), 'zones_examinees', v_n, 'calcule_par', 'PostGIS ' || postgis_lib_version(),
    'croisements', coalesce((select jsonb_agg(x order by (x ->> 'pct')::numeric desc) from jsonb_array_elements(v_out) x), '[]'::jsonb));
end
$f$;
revoke all on function public.fc_territoire_croisement(jsonb) from public, anon;
grant execute on function public.fc_territoire_croisement(jsonb) to authenticated;

-- ── Retour arrière ─────────────────────────────────────────────────────────
-- drop function if exists public.fc_territoire_croisement(jsonb);
-- drop function if exists public.fc_zone_geom(jsonb);
