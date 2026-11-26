-- ═══════════════════════════════════════════════════════════════════════════
-- Foncier — garde serveur contre le chevauchement des contours de parcelles (PostGIS)
-- Réf. : docs/CAHIER_DES_CHARGES_FONCIER_URBAIN_RURAL.md (FUR-007). Double le contrôle du client (fonGeoChevauchements) :
-- il tient même si le poste est en cache, hors ligne puis resynchronisé, ou contourné.
--
-- À exécuter sur CHAQUE projet Supabase, SQL Editor ▸ Run, APRÈS foncier_urbain_rural_l1.sql. Idempotent.
-- PostGIS est installé dans le schéma « extensions » (convention Supabase).
--
-- Règles (identiques au client) :
--   · contour = polygone issu de data.geo_polygon ([[lat,lng],…]) sinon de data.bornes (x,y en UTM, data.utm_zone 29 ou 30) ;
--   · recouvrement mesuré en mètres, bande de tolérance de 0,5 m le long des bords (bruit de levé, bornes voisines) ;
--   · parcelles fusionnées ou découpées ignorées ; le contrôle ne se déclenche que si le contour (ou son statut) change :
--     un enregistrement sans rapport avec la géométrie n'est jamais bloqué par un ancien recouvrement ;
--   · dérogation : data.derogation_chevauchement = { motif, par, avec:[ids] } couvrant TOUTES les parcelles recouvertes.
--     Le rôle n'est pas vérifié ici (la dérogation est réservée aux administrateurs côté application et journalisée).
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ── 1. Table des contours (maintenue par trigger, lecture seule pour les clients) ──
create table if not exists public.pi_parcelles_geom (
  parcelle_id text primary key,
  geom        extensions.geometry(Polygon, 4326) not null,
  updated_at  timestamptz not null default now()
);
create index if not exists pi_parcelles_geom_gix on public.pi_parcelles_geom using gist (geom);
alter table public.pi_parcelles_geom enable row level security;
alter table public.pi_parcelles_geom force row level security;
revoke all on table public.pi_parcelles_geom from anon, public, authenticated;
grant select on table public.pi_parcelles_geom to authenticated;
drop policy if exists pi_parcelles_geom_staff on public.pi_parcelles_geom;
create policy pi_parcelles_geom_staff on public.pi_parcelles_geom for select to authenticated
  using ((auth.jwt() ->> 'app_role') is not null);

-- ── 2. Contour d'une parcelle (data jsonb → polygone WGS84, ou null) ───────
create or replace function public.fonc_parcelle_geom(d jsonb)
returns extensions.geometry language plpgsql stable set search_path = public, extensions, pg_temp as $$
declare
  pts geometry[]; zone int; g geometry; best geometry; r record;
begin
  if jsonb_typeof(d -> 'geo_polygon') = 'array' and jsonb_array_length(d -> 'geo_polygon') >= 3 then
    select array_agg(st_setsrid(st_makepoint((e ->> 1)::float8, (e ->> 0)::float8), 4326) order by o)
      into pts from jsonb_array_elements(d -> 'geo_polygon') with ordinality t(e, o)
     where e ->> 0 ~ '^-?[0-9]+(\.[0-9]+)?$' and e ->> 1 ~ '^-?[0-9]+(\.[0-9]+)?$';
    zone := null;
  elsif jsonb_typeof(d -> 'bornes') = 'array' then
    zone := case when d ->> 'utm_zone' = '29' then 29 else 30 end;
    select array_agg(st_setsrid(st_makepoint((b ->> 'x')::float8, (b ->> 'y')::float8), 32600 + zone) order by o)
      into pts from jsonb_array_elements(d -> 'bornes') with ordinality t(b, o)
     where b ->> 'x' ~ '^-?[0-9]+(\.[0-9]+)?$' and b ->> 'y' ~ '^-?[0-9]+(\.[0-9]+)?$'
       and (b ->> 'x')::float8 <> 0 and (b ->> 'y')::float8 <> 0;
  end if;
  if pts is null or array_length(pts, 1) < 3 then return null; end if;
  g := st_makepolygon(st_makeline(pts || pts[1]));
  g := st_makevalid(g);
  if zone is not null then g := st_transform(g, 4326); end if;
  if st_geometrytype(g) = 'ST_Polygon' then return g; end if;
  best := null;                                  -- MakeValid peut rendre plusieurs morceaux : on garde le plus grand polygone
  for r in select (st_dump(st_collectionextract(g, 3))).geom as p loop
    if best is null or st_area(r.p::geography) > st_area(best::geography) then best := r.p; end if;
  end loop;
  return best;
end$$;

-- ── 3. Parcelles dont le contour en recouvre un autre (en mètres, bords tolérés) ──
create or replace function public.fonc_parcelles_chevauchantes(p_id text, p_geom extensions.geometry, p_tol numeric default 0.5)
returns table (parcelle_id text, aire_m2 numeric) language sql stable set search_path = public, extensions, pg_temp as $$
  with ref as (select case when st_x(st_centroid(p_geom)) < -6 then 32629 else 32630 end as srid)
  select g.parcelle_id,
         round(st_area(st_intersection(st_buffer(st_transform(p_geom, ref.srid), -p_tol), st_buffer(st_transform(g.geom, ref.srid), -p_tol)))::numeric, 1)
    from public.pi_parcelles_geom g, ref
   where g.parcelle_id <> p_id and g.geom && p_geom and st_intersects(g.geom, p_geom)
     and st_area(st_intersection(st_buffer(st_transform(p_geom, ref.srid), -p_tol), st_buffer(st_transform(g.geom, ref.srid), -p_tol))) > 0
$$;

-- ── 4. Trigger sur les parcelles ───────────────────────────────────────────
create or replace function public.fonc_parcelles_geom_garde()
returns trigger language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  actif boolean; g geometry; chev record; ids text[] := '{}'; txt text := ''; deroge boolean;
begin
  actif := coalesce(new.data ->> 'fusionnee_dans', '') = '' and coalesce(new.data ->> 'decoupee_dans', '') = '';
  if tg_op = 'UPDATE'
     and new.data -> 'bornes' is not distinct from old.data -> 'bornes'
     and new.data -> 'geo_polygon' is not distinct from old.data -> 'geo_polygon'
     and new.data -> 'utm_zone' is not distinct from old.data -> 'utm_zone'
     and actif = (coalesce(old.data ->> 'fusionnee_dans', '') = '' and coalesce(old.data ->> 'decoupee_dans', '') = '') then
    return new;                                   -- géométrie inchangée : aucun contrôle
  end if;
  g := case when actif then public.fonc_parcelle_geom(new.data) else null end;
  if g is null then
    delete from public.pi_parcelles_geom where parcelle_id = new.id;
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('parcelles_geom'));
  for chev in select * from public.fonc_parcelles_chevauchantes(new.id, g) loop
    ids := ids || chev.parcelle_id;
    txt := txt || case when txt = '' then '' else ', ' end
           || coalesce((select p.data ->> 'ref' from public.pi_parcelles p where p.id = chev.parcelle_id), chev.parcelle_id) || ' (≈ ' || chev.aire_m2 || ' m²)';
  end loop;
  if array_length(ids, 1) > 0 then
    deroge := length(trim(coalesce(new.data -> 'derogation_chevauchement' ->> 'motif', ''))) > 0
              and not exists (select 1 from unnest(ids) i
                               where not (coalesce(new.data -> 'derogation_chevauchement' -> 'avec', '[]'::jsonb) ? i));
    if not deroge then
      raise exception 'Chevauchement de contour avec : %. Corrigez les bornes ou renseignez une dérogation motivée.', txt using errcode = '23514';
    end if;
  end if;
  insert into public.pi_parcelles_geom (parcelle_id, geom) values (new.id, g)
  on conflict (parcelle_id) do update set geom = excluded.geom, updated_at = now();
  return new;
end$$;
revoke all on function public.fonc_parcelles_geom_garde() from public, anon, authenticated;
-- Nom en « zz_ » : les triggers BEFORE s'exécutent par ordre alphabétique. Celui-ci doit passer APRÈS le garde « dernier écrit gagne »
-- (trg_lww) : une écriture périmée refusée par ce garde ne doit ni modifier la table des contours ni lever d'erreur de chevauchement.
drop trigger if exists pi_parcelles_geom_garde on public.pi_parcelles;
drop trigger if exists zz_pi_parcelles_geom_garde on public.pi_parcelles;
create trigger zz_pi_parcelles_geom_garde before insert or update on public.pi_parcelles
  for each row execute function public.fonc_parcelles_geom_garde();

create or replace function public.fonc_parcelles_geom_suppr()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin delete from public.pi_parcelles_geom where parcelle_id = old.id; return old; end$$;
revoke all on function public.fonc_parcelles_geom_suppr() from public, anon, authenticated;
drop trigger if exists pi_parcelles_geom_suppr on public.pi_parcelles;
create trigger pi_parcelles_geom_suppr after delete on public.pi_parcelles
  for each row execute function public.fonc_parcelles_geom_suppr();

-- ── 5. Rattrapage : contours des parcelles existantes (sans refuser les recouvrements déjà présents) ──
insert into public.pi_parcelles_geom (parcelle_id, geom)
select p.id, public.fonc_parcelle_geom(p.data)
  from public.pi_parcelles p
 where coalesce(p.data ->> 'fusionnee_dans', '') = '' and coalesce(p.data ->> 'decoupee_dans', '') = ''
   and public.fonc_parcelle_geom(p.data) is not null
on conflict (parcelle_id) do update set geom = excluded.geom, updated_at = now();

-- ── 6. Audit : couples de parcelles qui se recouvrent aujourd'hui (à traiter ou à déroger) ──
create or replace function public.fonc_audit_chevauchements()
returns table (parcelle_a text, ref_a text, parcelle_b text, ref_b text, aire_m2 numeric)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  select a.parcelle_id, pa.data ->> 'ref', c.parcelle_id, pb.data ->> 'ref', c.aire_m2
    from public.pi_parcelles_geom a
    cross join lateral public.fonc_parcelles_chevauchantes(a.parcelle_id, a.geom) c
    join public.pi_parcelles pa on pa.id = a.parcelle_id
    join public.pi_parcelles pb on pb.id = c.parcelle_id
   where a.parcelle_id < c.parcelle_id
   order by c.aire_m2 desc
$$;
revoke all on function public.fonc_audit_chevauchements() from public, anon;
grant execute on function public.fonc_audit_chevauchements() to authenticated;
revoke all on function public.fonc_parcelle_geom(jsonb) from public, anon;
revoke all on function public.fonc_parcelles_chevauchantes(text, extensions.geometry, numeric) from public, anon;
grant execute on function public.fonc_parcelle_geom(jsonb) to authenticated;
grant execute on function public.fonc_parcelles_chevauchantes(text, extensions.geometry, numeric) to authenticated;

-- ── Vérification ───────────────────────────────────────────────────────────
-- Contours calculés / parcelles actives ; recouvrements existants à traiter :
select (select count(*) from public.pi_parcelles_geom) as contours,
       (select count(*) from public.pi_parcelles where coalesce(data ->> 'fusionnee_dans', '') = '' and coalesce(data ->> 'decoupee_dans', '') = '') as parcelles_actives,
       (select count(*) from public.fonc_audit_chevauchements()) as couples_qui_se_recouvrent;

-- ── RECETTE ────────────────────────────────────────────────────────────────
--  1. Parcelle dont les bornes recouvrent une autre → refus (23514) avec la référence et l'aire.
--  2. Parcelles contiguës (bord commun) ou recouvrement < 0,5 m → acceptées.
--  3. Avec data.derogation_chevauchement {motif, avec:[ids recouverts]} → acceptée.
--  4. Modifier le nom d'une parcelle qui recouvre déjà une voisine → acceptée (géométrie inchangée).
--  5. select * from fonc_audit_chevauchements();  → liste des couples à régulariser.
--
-- ── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
--  drop trigger zz_pi_parcelles_geom_garde on public.pi_parcelles; drop trigger pi_parcelles_geom_suppr on public.pi_parcelles;
--  drop table public.pi_parcelles_geom; drop function public.fonc_parcelles_geom_garde(), public.fonc_parcelles_geom_suppr(),
--    public.fonc_audit_chevauchements(), public.fonc_parcelles_chevauchantes(text, extensions.geometry, numeric), public.fonc_parcelle_geom(jsonb);
