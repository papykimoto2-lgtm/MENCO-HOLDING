-- Sous-comptes de caisse (correction du partage des comptes 571 / 572)
-- Appliqué le 07/10/2026 sur la base MENCO HOLDING. Ce fichier documente
-- l'opération et sa marche arrière ; il n'est pas à rejouer tel quel.
--
-- Avant : 3 caisses sur 571 (Principale, Souscripteurs, Digitech) et 2 sur 572
-- (Agro, Building) -> le grand livre mélangeait les caisses.
-- Après : un sous-compte par caisse, rattaché à 571 / 572 par préfixe de code.
--
--   57110001  CAISSE PRINCIPALE            (division MENKO HOLDING)
--   57110002  CAISSE CENTRALE SOUSCRIPTEURS (division MENKO HOLDING)
--   57110003  CAISSE DIGITECH               (division MENKO DIGITECH)
--   57210001  CAISSE AGRO                   (division MENKO AGRO)
--   57210002  CAISSE BUILDING               (division MENKO BUILDING)
--
-- Règles appliquées
--  * Seules les écritures LIÉES à un mouvement de caisse sont reclassées
--    (id = mouvement.ecriture_id, ou ecr_cse_<id mouvement>), plus les 3
--    écritures d'écart de caisse « CAISSE PRINCIPALE » (ecr_ecart_*).
--  * Les pièces déjà VISÉES (valide_le) ne sont pas touchées : elles sont
--    intangibles, la seule correction admise est la contre-passation.
--  * Les flux qui n'ont jamais transité par une caisse (versements en espèces,
--    cessions, parc auto, bilans d'ouverture) restent sur 571 / 572.
--  * Chaque écriture reclassée garde l'ancien compte dans compte_caisse_avant
--    et porte migration_sous_compte ; chaque caisse garde compte_avant.
--  * _modifie DOIT avancer : le déclencheur pi_lww_guard ignore silencieusement
--    toute mise à jour dont _modifie n'est pas plus récent.
--  * Le plan est étendu via pi_params.plan_comptable_custom (le déclencheur
--    normaliser_plan_comptable retire tout code déjà présent dans le socle).

-- 1) Plan comptable + comptes des caisses
with nouveaux(code,label,classe,nature) as (values
 ('57110001','CAISSE PRINCIPALE — MENKO HOLDING','5','tresorerie'),
 ('57110002','CAISSE CENTRALE SOUSCRIPTEURS — MENKO HOLDING','5','tresorerie'),
 ('57110003','CAISSE DIGITECH — MENKO DIGITECH','5','tresorerie'),
 ('57210001','CAISSE AGRO — MENKO AGRO','5','tresorerie'),
 ('57210002','CAISSE BUILDING — MENKO BUILDING','5','tresorerie')),
upd_plan as (
 update pi_params p set data = jsonb_set(p.data, '{plan_comptable_custom}',
   coalesce(p.data->'plan_comptable_custom','[]'::jsonb) ||
   coalesce((select jsonb_agg(jsonb_build_object('code',n.code,'label',n.label,'classe',n.classe,'nature',n.nature))
             from nouveaux n
             where not exists (select 1 from jsonb_array_elements(coalesce(p.data->'plan_comptable_custom','[]'::jsonb)) c where c->>'code'=n.code)
               and not exists (select 1 from jsonb_array_elements(p.data->'plan_comptable_base') b where b->>'code'=n.code)), '[]'::jsonb))
 where p.id='main' returning 1),
map(caisse_id, old, nw) as (values
 ('mrdfjgcuf3y0t','571','57110001'),('mtv1uwba53uek','571','57110002'),('mrtfb2wn2ck97','571','57110003'),
 ('mrnlovm41ua1g','572','57210001'),('mrkl3q34ihybc','572','57210002'))
update pi_caisses c set data = c.data || jsonb_build_object('compte', m.nw, 'compte_avant', m.old)
from map m where c.id=m.caisse_id and c.data->>'compte'=m.old;

-- 2) Reclassement des écritures liées aux caisses (non visées)
with map(caisse_id, old, nw) as (values
 ('mrdfjgcuf3y0t','571','57110001'),('mtv1uwba53uek','571','57110002'),('mrtfb2wn2ck97','571','57110003'),
 ('mrnlovm41ua1g','572','57210001'),('mrkl3q34ihybc','572','57210002')),
cible as (
 select distinct e.id, mp.old, mp.nw from pi_caisse_mouvements m join map mp on mp.caisse_id=m.data->>'caisse_id'
 join pi_ecritures e on e.id = coalesce(m.data->>'ecriture_id','ecr_cse_'||m.id)
 union
 select e.id, '571','57110001' from pi_ecritures e where e.id like 'ecr_ecart_%' and e.data->>'libelle' ilike '%CAISSE PRINCIPALE%')
update pi_ecritures e set data = e.data
   || jsonb_build_object('_modifie', to_char((now() at time zone 'utc'),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'compte_caisse_avant', c.old, 'migration_sous_compte', '2026-10-07')
   || (case when e.data->>'compte'=c.old then jsonb_build_object('compte', c.nw) else '{}'::jsonb end)
   || (case when e.data->>'compte_debit'=c.old then jsonb_build_object('compte_debit', c.nw) else '{}'::jsonb end)
   || (case when e.data->>'compte_credit'=c.old then jsonb_build_object('compte_credit', c.nw) else '{}'::jsonb end)
from cible c
where e.id=c.id and not (e.data ? 'valide_le') and coalesce(e.data->>'statut_ecr','')<>'valide' and coalesce(e.data->>'_deleted','')<>'true';

-- 3) Écritures sur 571 qui ne passent par aucun mouvement de caisse -> CAISSE PRINCIPALE
--    (décision du 07/10/2026 : 629 versements en espèces, 33 bons de caisse sans
--    mouvement, 17 écritures du parc auto, 8 cessions = 687 écritures).
--    Laissés sur 571 : les 3 bilans d'ouverture (ecr_bo_*), soldes de départ par
--    division et non des flux, et les 52 pièces visées d'Agro / Building.
update pi_ecritures e set data = e.data
   || jsonb_build_object('_modifie', to_char((now() at time zone 'utc'),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'compte_caisse_avant', '571', 'migration_sous_compte', '2026-10-07-hors-caisse')
   || (case when e.data->>'compte'='571' then jsonb_build_object('compte','57110001') else '{}'::jsonb end)
   || (case when e.data->>'compte_debit'='571' then jsonb_build_object('compte_debit','57110001') else '{}'::jsonb end)
   || (case when e.data->>'compte_credit'='571' then jsonb_build_object('compte_credit','57110001') else '{}'::jsonb end)
 where (e.data->>'compte_debit'='571' or e.data->>'compte_credit'='571' or e.data->>'compte'='571')
   and e.id not like 'ecr_bo_%'
   and not exists (select 1 from pi_caisse_mouvements m where e.id = coalesce(m.data->>'ecriture_id','ecr_cse_'||m.id))
   and not (e.data ? 'valide_le') and coalesce(e.data->>'statut_ecr','')<>'valide' and coalesce(e.data->>'_deleted','')<>'true';
-- (la marche arrière a) ci-dessous couvre aussi cette étape : elle restaure
-- compte_caisse_avant sur toute écriture marquée migration_sous_compte.)

-- ─────────────────────────────────────────────────────────────────────────
-- MARCHE ARRIÈRE (non exécutée) — à lancer dans cet ordre
-- ─────────────────────────────────────────────────────────────────────────
-- a) écritures
-- update pi_ecritures e set data = (e.data - 'migration_sous_compte' - 'compte_caisse_avant')
--   || jsonb_build_object('_modifie', to_char((now() at time zone 'utc'),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
--   || (case when e.data->>'compte'        in ('57110001','57110002','57110003','57210001','57210002') then jsonb_build_object('compte',        e.data->>'compte_caisse_avant') else '{}'::jsonb end)
--   || (case when e.data->>'compte_debit'  in ('57110001','57110002','57110003','57210001','57210002') then jsonb_build_object('compte_debit',  e.data->>'compte_caisse_avant') else '{}'::jsonb end)
--   || (case when e.data->>'compte_credit' in ('57110001','57110002','57110003','57210001','57210002') then jsonb_build_object('compte_credit', e.data->>'compte_caisse_avant') else '{}'::jsonb end)
-- where e.data ? 'migration_sous_compte';
-- b) caisses
-- update pi_caisses set data = (data - 'compte_avant') || jsonb_build_object('compte', data->>'compte_avant') where data ? 'compte_avant';
-- c) plan : retirer les 5 codes de pi_params.plan_comptable_custom
