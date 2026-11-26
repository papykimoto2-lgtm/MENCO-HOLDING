-- ═══════════════════════════════════════════════════════════════════════════
-- Revue de sécurité (L15) — accès anonyme : SCRIPT À VALIDER AVANT EXÉCUTION. Ne fait partie d'aucun lot, n'a PAS été exécuté.
-- Constat : pull_incremental(jsonb), pull_incremental_v1(jsonb), pull_documents_meta(text), _docs_meta_sync() et _pi_documents_meta_sync()
-- sont SECURITY DEFINER (propriétaire postgres, RLS contournée) et exécutables par anon / PUBLIC. Un appel anonyme peut lire des tables entières
-- (clients, utilisateurs, pièces, dossiers). L'advisor Supabase 0028 le signale.
-- Avant d'exécuter : vérifier que ni le portail public ni une page non connectée n'appelle ces fonctions sans jeton (sinon elles cesseront de répondre).
--   select proname, has_function_privilege('anon', oid, 'execute') as anon from pg_proc where pronamespace = 'public'::regnamespace
--    and proname in ('pull_incremental','pull_incremental_v1','pull_documents_meta','_docs_meta_sync','_pi_documents_meta_sync');
-- ═══════════════════════════════════════════════════════════════════════════
revoke execute on function public.pull_incremental(jsonb)      from public, anon;
revoke execute on function public.pull_incremental_v1(jsonb)   from public, anon;
revoke execute on function public.pull_documents_meta(text)    from public, anon;
revoke execute on function public._docs_meta_sync()            from public, anon;
revoke execute on function public._pi_documents_meta_sync()    from public, anon;
-- Pour authenticated (les jetons du portail souscripteur / intervenant / notaire le sont aussi) : ajouter en tête des fonctions
--   if (auth.jwt() ->> 'app_role') is null then raise exception 'Accès refusé' using errcode = '42501'; end if;
-- et remplacer la regex de noms de tables de pull_incremental par une liste blanche.
-- ── RETOUR ARRIÈRE : grant execute on function public.pull_incremental(jsonb), public.pull_incremental_v1(jsonb), public.pull_documents_meta(text) to anon;
-- ── À ARBITRER SÉPARÉMENT : 161 tables legacy avec politiques « *_open_rollback » (using true) et droits anon complets (schéma rls_fermeture).
