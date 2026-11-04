-- Documents joints (pi_documents) — fermeture de l'accès public
--
-- CONSTAT (2026-11-04) : la table pi_documents (≈ 2,6 Go, pièces d'identité des souscripteurs) porte, en plus des politiques
-- « personnel_tout » et « portail_documents_fin », une politique ouverte laissée en place après un retour arrière de la
-- fermeture des accès (rls_03_fermeture.sql) :
--   pi_documents_open_rollback  FOR ALL  TO anon, authenticated  USING (true) WITH CHECK (true)
-- Avec cette politique, toute personne disposant de la clé publique peut lire, modifier ou supprimer tous les documents.
--
-- NE PAS APPLIQUER avant d'avoir vérifié, sur un poste du personnel connecté et sur chaque portail externe (souscripteur,
-- apporteur, mandant, financier…), que la lecture et l'envoi des documents fonctionnent avec les seules politiques
-- « personnel_tout » et « portail_* ». Prévoir la politique inverse (rollback) ci-dessous.

-- Application
drop policy if exists pi_documents_open_rollback on public.pi_documents;

-- Retour arrière (à garder sous la main)
-- create policy pi_documents_open_rollback on public.pi_documents for all to anon, authenticated using (true) with check (true);

-- Vérification
-- select policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename = 'pi_documents';
