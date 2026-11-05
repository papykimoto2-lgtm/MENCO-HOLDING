-- Documents joints (pi_documents) — fermeture de l'accès public
--
-- À LIRE D'ABORD : supabase/RLS_RECETTE_FERMETURE.md. La politique ouverte
--   pi_documents_open_rollback  FOR ALL  TO anon, authenticated  USING (true) WITH CHECK (true)
-- n'est pas isolée : 162 tables pi_* portent la même politique « *_open_rollback » (état mesuré le 31/10/2026), et la
-- fonction pull_incremental (SECURITY DEFINER) est exécutable par anon. La fermeture est PRÉPARÉE, NON APPLIQUÉE, et se fait
-- par vagues avec recette (pi_documents est en vague C, une table à la fois).
--
-- Ce fichier ne sert donc qu'à cette dernière étape pour pi_documents : NE PAS L'EXÉCUTER SEUL ni avant les vagues A et B
-- et leur recette. Tant que la politique est ouverte, la clé publique peut lire, modifier ou supprimer tous les documents
-- (pièces d'identité des souscripteurs). Le mode « documents légers » (liste seule synchronisée) réduit la charge, pas l'exposition.
--
-- Avant de l'appliquer : vérifier sur un poste du personnel connecté et sur chaque portail externe (souscripteur, apporteur,
-- mandant, financier…) que la lecture et l'envoi des documents fonctionnent avec les seules politiques « personnel_tout » et
-- « portail_* ». Prévoir la politique inverse (retour arrière) ci-dessous.

-- Application
drop policy if exists pi_documents_open_rollback on public.pi_documents;

-- Retour arrière (à garder sous la main)
-- create policy pi_documents_open_rollback on public.pi_documents for all to anon, authenticated using (true) with check (true);

-- Vérification
-- select policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename = 'pi_documents';
