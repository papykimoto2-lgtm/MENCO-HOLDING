-- ═══════════════════════════════════════════════════════════════════════════
-- SMQ : FERMETURE DES RÈGLES D'ACCÈS (12 tables pi_smq_*)
--
-- Problème : supabase/pi_smq.sql crée chaque table avec une politique
-- « pi_smq_<t>_all » (anon + authenticated, using true). La clé anon étant
-- publique (elle est dans le HTML de l'ERP), n'importe qui peut lire, modifier
-- ou supprimer audits, non-conformités, réclamations, risques, politiques…
--
-- Ces tables sont INTERNES : le portail n'y touche pas → vague A de
-- supabase/rls_03_fermeture.sql. Ce script s'y raccorde, sans réinventer le
-- mécanisme (sauvegarde des politiques retirées + restaurer()).
--
-- ORDRE
--   0. Préalables : supabase/RLS_RECETTE_FERMETURE.md §3 (sauvegarde, bon projet
--      — organisation ET nom —, copie de test, IMMO_SYNC_ANON_FALLBACK = false,
--      jeton du personnel actif). Ne PAS fermer avant qu'ils soient cochés.
--   1. supabase/pi_smq.sql déjà exécuté (les 12 tables existent).
--   2. ÉTAPE 1 ci-dessous : ajoute la règle du personnel. Aucun accès retiré,
--      sans danger, idempotente.
--   3. rls_03_fermeture.sql exécuté (crée le schéma rls_fermeture).
--   4. ÉTAPE 2 : simulation, puis fermeture réelle, puis recette.
--   5. Retour arrière immédiat si la recette échoue : ÉTAPE 4.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 — règle « personnel_tout » (ajout seul, rien n'est retiré) ──────
-- Même condition que le pilote (rls_02_pilote.sql) : le jeton émis par
-- staff-login porte le claim app_role ; les jetons du portail ne l'ont jamais.
do $$
declare
  t text;
  tables constant text[] := array[
    'pi_smq_documents','pi_smq_nc','pi_smq_reclamations','pi_smq_satisfaction',
    'pi_smq_audits','pi_smq_revues','pi_smq_politiques','pi_smq_objectifs',
    'pi_smq_risques','pi_smq_evaluations','pi_smq_enjeux','pi_smq_parties'];
  cond constant text := '(auth.jwt() ->> ''app_role'') is not null';
begin
  foreach t in array tables loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      raise exception 'Table % absente : exécuter supabase/pi_smq.sql d''abord.', t;
    end if;
    execute format('drop policy if exists personnel_tout on public.%I', t);
    execute format(
      'create policy personnel_tout on public.%I for all to authenticated using (%s) with check (%s)',
      t, cond, cond);
  end loop;
  raise notice 'personnel_tout posée sur % tables SMQ.', array_length(tables, 1);
end$$;

-- Contrôle : 12 lignes attendues.
select tablename, policyname, roles::text
from pg_policies
where schemaname = 'public' and tablename like 'pi_smq\_%' and policyname = 'personnel_tout'
order by tablename;

-- ── ÉTAPE 2 — fermeture (nécessite rls_03_fermeture.sql) ────────────────────
-- 2a. SIMULATION (par défaut : ne retire rien). Attendu : 12 lignes
--     « SIMULATION : serait retirée » (politiques pi_smq_<t>_all).
--
--   select * from rls_fermeture.fermer(
--     array['pi_smq_documents','pi_smq_nc','pi_smq_reclamations','pi_smq_satisfaction',
--           'pi_smq_audits','pi_smq_revues','pi_smq_politiques','pi_smq_objectifs',
--           'pi_smq_risques','pi_smq_evaluations','pi_smq_enjeux','pi_smq_parties'],
--     'SMQ');
--
-- 2b. FERMETURE RÉELLE (sauvegarde puis retrait des politiques ouvertes) :
--
--   select * from rls_fermeture.fermer(
--     array['pi_smq_documents','pi_smq_nc','pi_smq_reclamations','pi_smq_satisfaction',
--           'pi_smq_audits','pi_smq_revues','pi_smq_politiques','pi_smq_objectifs',
--           'pi_smq_risques','pi_smq_evaluations','pi_smq_enjeux','pi_smq_parties'],
--     'SMQ', false);
--
--   Le droit de table reste accordé à anon (grant all) mais sans politique
--   applicable : RLS le refuse. Pour une défense en profondeur, retirer aussi
--   le droit (réversible, voir ÉTAPE 4) :
--
--   revoke all on table public.pi_smq_documents, public.pi_smq_nc, public.pi_smq_reclamations,
--     public.pi_smq_satisfaction, public.pi_smq_audits, public.pi_smq_revues,
--     public.pi_smq_politiques, public.pi_smq_objectifs, public.pi_smq_risques,
--     public.pi_smq_evaluations, public.pi_smq_enjeux, public.pi_smq_parties from anon;

-- ── ÉTAPE 3 — RECETTE (dans l'ERP, session du personnel ouverte) ────────────
--  1. Paramètres ▸ Qualité (SMQ) : créer puis modifier une non-conformité, un
--     risque, un enjeu → plus aucun 404 ; l'enregistrement est confirmé cloud.
--  2. Second poste connecté : la modification apparaît sans rechargement.
--  3. Sonde anon (tools/rls_sonde_anon.js) : lecture ET écriture des tables
--     pi_smq_* refusées (0 ligne / 401-403) ; aucune autre table n'a changé.
--  4. Déconnexion puis rechargement : les écrans SMQ se vident ou signalent une
--     erreur — comportement ATTENDU (anon bloqué). Reconnexion : les données reviennent.
--  Échec à l'un de ces points → ÉTAPE 4 sans attendre.

-- ── ÉTAPE 4 — RETOUR ARRIÈRE ────────────────────────────────────────────────
--   select rls_fermeture.restaurer('SMQ');   -- recrée les politiques pi_smq_<t>_all à l'identique
--   grant all on table public.pi_smq_documents, public.pi_smq_nc, public.pi_smq_reclamations,
--     public.pi_smq_satisfaction, public.pi_smq_audits, public.pi_smq_revues,
--     public.pi_smq_politiques, public.pi_smq_objectifs, public.pi_smq_risques,
--     public.pi_smq_evaluations, public.pi_smq_enjeux, public.pi_smq_parties to anon;
