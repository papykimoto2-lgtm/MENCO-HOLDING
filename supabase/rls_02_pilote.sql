-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — ÉTAPE 2 : PILOTE SUR UNE SEULE TABLE
--
-- ⛔ ÉTAT AU 17/09/2026 : CE PILOTE N'EST APPLIQUÉ SUR AUCUNE DES DEUX
--    INSTANCES. Il a été appliqué sur Zahara, puis RETIRÉ le lendemain.
--    Ne pas le rejouer sans avoir levé le blocage décrit ci-dessous.
--
-- HISTORIQUE VÉRIFIÉ dans supabase_migrations.schema_migrations, pas déduit :
--
--   · Zahara (ilvusckdanwrckxqvhmr)
--       20260914210216  rls_pilote_demandes_reappro
--                       → pilote appliqué le 14/09/2026 à 21:02
--       20260915143625  align_pi_demandes_reappro_grants_with_generic_sync
--                       → pilote RETIRÉ le 15/09/2026 à 14:36 :
--                         drop policy pi_demandes_reappro_staff,
--                         grant select/insert/update/delete à anon,
--                         recréation des politiques permissives anon_all
--                         et auth_all.
--     État constaté aujourd'hui : anon_all + auth_all (using true),
--     anon conserve SELECT/INSERT/UPDATE/DELETE.
--
--   · Menco (pxwgefdxgrskusjbzrxz)
--     Jamais appliqué. État constaté aujourd'hui : politique unique
--     pi_demandes_reappro_all [anon, authenticated] using true, anon avec
--     tous les privilèges, RLS active, 1 ligne (« DEMANDE REAPPRO TEST »,
--     REAP-2026-0001).
--
-- ⚠️ POURQUOI LE PILOTE A ÉTÉ RETIRÉ — ET POURQUOI LE REJOUER TEL QUEL
--    CASSERAIT LE MODULE
--
-- Le nom de la migration de retrait dit la cause : « align … with generic
-- sync ». Le circuit de synchronisation de l'ERP n'utilise PAS toujours le
-- jeton du personnel :
--
--   · sbFetch() envoie sbAuth(), qui renvoie STAFF.token seulement s'il
--     existe et n'est pas expiré — sinon la clé anon. Le pull initial,
--     l'outbox et toute requête émise avant l'ouverture de session partent
--     donc sous anon.
--   · Le client Realtime est créé avec la clé anon (point connu du
--     chantier) et ne porte jamais le jeton du personnel.
--
-- `revoke all … from anon` coupe ces chemins. C'est exactement l'échec que
-- la recette ci-dessous anticipe à son point 1 (« si le toast est ROUGE …
-- ARRÊTER et faire le retour arrière ») : le retour arrière a eu lieu, et il
-- a été fait sur Zahara moins de 18 heures après l'application.
--
-- Le blocage est structurel, pas transitoire : il ne se lèvera pas en
-- redéployant staff-login. Trois préalables, dans cet ordre :
--   1. Le Realtime doit porter le jeton du personnel (aujourd'hui créé sous
--      anon) — sinon aucune table ne peut fermer anon sans perdre le
--      temps réel.
--   2. Le pull initial et l'outbox doivent attendre l'ouverture de session,
--      ou rejouer sous le jeton dès qu'il est disponible.
--   3. Seulement alors, rejouer ce pilote — sur UNE instance à la fois.
--
-- ⚠️ PRÉREQUIS SPÉCIFIQUE À MENCO, non satisfait
-- Sur Zahara, 115 connexions serveur réussies sont journalisées : la chaîne
-- staff-login → jeton → PostgREST y est prouvée. Sur Menco, 0 — sur 3 890
-- lignes de journal, toutes écrites par le navigateur. Ce zéro n'est pas
-- concluant : staff-login v4, encore déployée sur ce projet, insère ses
-- journaux dans des colonnes plates absentes du schéma jsonb, donc une
-- connexion serveur réussie ne laisse aucune trace. Il reste que rien ne
-- prouve aujourd'hui qu'un jeton app_role atteigne PostgREST sur Menco.
-- À lever en déployant staff-login v7 (le dépôt est à jour, pas la
-- production) puis en revérifiant ce compteur.
--
-- ✅ CE QUI EST DÉJÀ VÉRIFIÉ — la condition elle-même est bonne
-- Testée sur Menco le 17/09/2026 avec de vrais jeux de claims :
--      jeton personnel (app_role=admin)     → autorisé
--      jeton personnel (app_role=caissiere) → autorisé
--      jeton portail souscripteur           → refusé
--      jeton portail apporteur              → refusé
--      clé anon                             → refusé
-- La condition distingue donc correctement le personnel du portail. Ce n'est
-- pas elle qui bloque : c'est le `revoke` sur anon, dont le circuit de
-- synchronisation dépend encore.
--
-- HISTORIQUE DE LA CONFUSION DE COMPTE (pour ne pas la reproduire)
-- Le 15/09/2026, une vérification via le connecteur Supabase a semblé montrer
-- que ce pilote n'avait jamais été appliqué sur Zahara. Le connecteur était
-- alors relié à un AUTRE compte, portant les mêmes noms de tables pi_* mais
-- des données sans rapport, et le pilote y a été appliqué par erreur avant
-- d'être retiré. Le 17/09/2026, le connecteur a été recontrôlé : organisation
-- « immosuite », projets « MENCO HOLDING » (pxwgefdxgrskusjbzrxz) et
-- « Zahara Multi service » (ilvusckdanwrckxqvhmr) tous deux présents — le bon
-- compte. Leçon : une référence de projet ne suffit pas à s'identifier,
-- confirmer l'organisation ET le nom du projet avant d'écrire.
-- ═══════════════════════════════════════════════════════════════════════════

-- Table pilote : pi_demandes_reappro — choisie parce qu'elle ne contient
-- AUCUNE donnée de production (module livré mais pas encore utilisé), qu'elle
-- est interne (le portail n'y touche pas) et que l'ERP y écrit avec un retour
-- visible : en cas de refus, la génération d'une demande affiche « NON
-- confirmé dans le cloud » au lieu d'échouer en silence. Un pilote raté ne
-- coûte donc rien et se voit immédiatement.
--
-- Le but n'est pas de sécuriser cette table — c'est de prouver la chaîne
-- complète sur un périmètre sans conséquence : le jeton du personnel passe,
-- la clé anon est refusée, le Realtime continue de délivrer.
--
-- ⚠️ CE PILOTE EST INDISPENSABLE. L'inspection a montré que le mécanisme
--    n'est aujourd'hui éprouvé NULLE PART : les 162 tables des deux instances
--    ont une politique anon sans condition. Rien ne prouve encore qu'une
--    politique exigeant le jeton du personnel laisse réellement passer l'ERP.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La condition, vérifiée ─────────────────────────────────────────────────
-- Le jeton émis par staff-login porte le claim `app_role` (rôle métier de
-- l'utilisateur). Les jetons du portail portent `kind` / `portal_kind` et
-- JAMAIS `app_role` : exiger sa présence distingue donc un membre du
-- personnel d'un souscripteur connecté au portail.
--
-- Vérifié sur les sources déployées des deux instances — voir
-- functions/staff-login/CONTRAT.md §1.

do $$
declare
  cond constant text := $c$ (auth.jwt() ->> 'app_role') is not null $c$;
begin
  -- La politique permissive actuelle est retirée et remplacée dans la même
  -- transaction : la table n'est jamais laissée sans politique.
  execute 'drop policy if exists pi_demandes_reappro_all on public.pi_demandes_reappro';
  execute format(
    'create policy pi_demandes_reappro_staff on public.pi_demandes_reappro '
    'for all to authenticated using (%s) with check (%s)', cond, cond);

  -- anon perd l'accès en lecture comme en écriture : c'est précisément ce que
  -- le pilote doit démontrer.
  execute 'revoke all on table public.pi_demandes_reappro from anon';

  raise notice 'Pilote appliqué sur pi_demandes_reappro.';
end$$;

-- ── VÉRIFICATION ───────────────────────────────────────────────────────────
select policyname, roles::text, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'pi_demandes_reappro';

-- ── RECETTE À FAIRE DANS L'ERP, dans cet ordre ─────────────────────────────
--  1. Session du personnel ouverte : créer une demande de réapprovisionnement.
--     → doit afficher le toast VERT de confirmation cloud.
--     → si le toast est ROUGE (« NON confirmé dans le cloud »), le jeton du
--       personnel n'atteint pas PostgREST : ARRÊTER et faire le retour arrière.
--  2. Se déconnecter (sbAuth() retombe sur la clé anon) puis recharger : les
--     demandes doivent disparaître ou remonter en erreur — comportement
--     ATTENDU, il prouve que anon est bloqué.
--  3. Se reconnecter : les demandes doivent réapparaître.
--  4. Sur un second poste connecté, vérifier qu'une nouvelle demande apparaît
--     sans rechargement — sinon le Realtime ne porte pas le jeton (point connu
--     du chantier, index.html:78505, client créé avec la clé anon).
--
-- Tant que les points 1 et 3 ne passent pas, NE PAS étendre à d'autres tables.

-- ═══════════════════════════════════════════════════════════════════════════
-- ── RETOUR ARRIÈRE (à garder sous la main pendant toute la recette) ────────
-- Restaure l'état permissif d'origine.
-- ⚠️ DÉJÀ UTILISÉ : c'est la substance de la migration
--    20260915143625 align_pi_demandes_reappro_grants_with_generic_sync,
--    jouée sur Zahara le 15/09/2026. Elle a recréé deux politiques séparées
--    (anon_all et auth_all) plutôt que la politique unique d'origine
--    pi_demandes_reappro_all — c'est pourquoi les deux instances ne portent
--    plus aujourd'hui les mêmes noms de politiques sur cette table.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  drop policy if exists pi_demandes_reappro_staff on public.pi_demandes_reappro;
--  grant all on table public.pi_demandes_reappro to anon, authenticated;
--  create policy pi_demandes_reappro_all on public.pi_demandes_reappro
--    for all to anon, authenticated using (true) with check (true);
