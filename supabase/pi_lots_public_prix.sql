-- ═══════════════════════════════════════════════════════════════════════════
-- Vue publique des lots : ne plus exposer le PRIX des lots réservés ou vendus
--
-- Le portail public affiche volontairement les lots vendus et réservés (carte, plan 3D :
-- « voir qu'un programme se remplit rassure ») : on les GARDE, mais le prix n'est plus
-- visible que pour les lots disponibles. Le portail gère un prix absent (aucun affichage
-- de prix, ni de prix au m²) : aucune modification du site nécessaire.
--
-- Méthode (sans avoir à réécrire la définition d'origine) :
--   1. la vue actuelle est renommée pi_lots_public_base et fermée au public ;
--   2. pi_lots_public est recréée par-dessus : mêmes colonnes, même ordre, mêmes types,
--      prix remplacé par NULL hors lots « disponible ».
-- Idempotent. À jouer sur le projet Menco (confirmer organisation ET nom).
--
-- PRÉALABLE — dépendances (aucune ligne attendue ; sinon STOP et me les envoyer) :
--   select distinct c.relname from pg_depend d
--     join pg_rewrite r on r.oid = d.objid join pg_class c on c.oid = r.ev_class
--    where d.refobjid = 'public.pi_lots_public'::regclass and c.oid <> 'public.pi_lots_public'::regclass;
-- Colonnes actuelles attendues (mesurées le 09/11/2026) :
--   id, numero, ilot, statut, type, nature, prix, superficie, lat, lng,
--   position_estimee, programme_id, geo_polygon, pieces, nb_bornes
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regclass('public.pi_lots_public_base') is null then
    alter view public.pi_lots_public rename to pi_lots_public_base;
  end if;
end$$;

-- La vue de base ne doit plus être lisible par le public (elle porte tous les prix).
revoke all on table public.pi_lots_public_base from public, anon, authenticated;

create or replace view public.pi_lots_public as
select id, numero, ilot, statut, type, nature,
       case when statut = 'disponible' then prix end as prix,
       superficie, lat, lng, position_estimee, programme_id, geo_polygon, pieces, nb_bornes
from public.pi_lots_public_base;

grant select on table public.pi_lots_public to anon, authenticated;

commit;
notify pgrst, 'reload schema';

-- ── VÉRIFICATIONS ───────────────────────────────────────────────────────────
-- a) Prix exposés par statut (attendu : prix présent seulement pour « disponible ») :
--      select statut, count(*) as lots, count(prix) as avec_prix from public.pi_lots_public group by statut order by statut;
-- b) La base n'est plus lisible par le public (attendu : false, false) :
--      select has_table_privilege('anon','public.pi_lots_public_base','select'),
--             has_table_privilege('authenticated','public.pi_lots_public_base','select');
-- c) La vue publique reste lisible (attendu : true) :
--      select has_table_privilege('anon','public.pi_lots_public','select');
-- Puis ouvrir le portail public : la carte garde les lots vendus/réservés, sans prix.

-- ── RETOUR ARRIÈRE ──────────────────────────────────────────────────────────
--   begin;
--   drop view public.pi_lots_public;
--   alter view public.pi_lots_public_base rename to pi_lots_public;
--   grant select on table public.pi_lots_public to anon, authenticated;
--   commit;
--   notify pgrst, 'reload schema';
