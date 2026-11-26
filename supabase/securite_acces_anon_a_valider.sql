-- ═══════════════════════════════════════════════════════════════════════════
-- Fermeture de l'accès anonyme aux fonctions de synchronisation — SCRIPT À VALIDER AVANT EXÉCUTION (non exécuté).
--
-- CONSTAT (revue L15)
--   pull_incremental_v1(jsonb), pull_incremental(jsonb), pull_documents_meta(text) sont SECURITY DEFINER (propriétaire postgres, RLS contournée).
--   Un appel avec la clé publique peut lire des tables entières (clients, utilisateurs, pièces, dossiers). Advisor Supabase 0028.
--   Trois failles distinctes :
--     1. pull_incremental_v1 est appelable directement : elle ne porte aucun garde, et rls_04_pull_restreint.sql l'ouvre même à « authenticated »
--        (donc à tout jeton portail), en contournant le garde du wrapper.
--     2. Le garde du wrapper pull_incremental() dépendait d'un drapeau (attestation_garde.config.pull_restreint, faux par défaut) ET la version
--        « mode léger » de supabase/pi_documents_meta.sql (étape 5) n'avait aucun garde : rejouée, elle l'effaçait.
--     3. pull_documents_meta(text) : aucun garde ; sa définition n'est pas dans le dépôt (voir l'étape 0).
--   Les jetons du portail (souscripteur, intervenant, notaire…) portent `kind` et JAMAIS `app_role` (functions/staff-login/CONTRAT.md) :
--   seul le personnel (app_role) et service_role doivent pouvoir synchroniser. L'ERP appelle déjà pull_incremental avec un jeton du personnel
--   (IMMO_SYNC_ANON_FALLBACK = false) ; aucune page du dépôt n'appelle pull_documents_meta.
--
-- PRÉALABLES (à vérifier AVANT d'exécuter — sinon la synchronisation descendante s'arrête)
--   a. Chaque poste de l'ERP est connecté avec un jeton du personnel (staff-login) ; IMMO_SYNC_ANON_FALLBACK = false est déployé.
--   b. Aucun portail ni page non connectée n'appelle ces fonctions : relever les appels réels sur 7 jours
--        select funcname, calls from pg_stat_user_functions where schemaname = 'public' and funcname like 'pull\_%' escape '\';
--      (nécessite track_functions = 'all'). Sinon, tester d'abord sur un projet de recette.
--   c. Le propriétaire de pull_incremental est postgres (SECURITY DEFINER) : il appelle pull_incremental_v1 sans droit explicite.
--        select proname, pg_get_userbyid(proowner) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'pull\_%' escape '\';
--
-- Idempotent. Retour arrière en bas de fichier.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. État avant (à conserver dans la recette) ─────────────────────────────
select proname, pg_get_function_identity_arguments(oid) as args, pg_get_userbyid(proowner) as proprietaire, prosecdef as definer,
       has_function_privilege('anon', oid, 'execute') as anon, has_function_privilege('authenticated', oid, 'execute') as authenticated
  from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('pull_incremental', 'pull_incremental_v1', 'pull_documents_meta', '_docs_meta_sync', '_pi_documents_meta_sync');
-- La définition de pull_documents_meta n'est pas versionnée : la relever pour la recette
--   select pg_get_functiondef('public.pull_documents_meta(text)'::regprocedure);

-- ── 1. pull_incremental() : garde inconditionnel (personnel ou service_role), mode léger conservé ──
-- Remplace les deux versions du dépôt (pull_incremental_complet.sql et pi_documents_meta.sql étape 5) par une seule, qui porte le garde dans
-- tous les cas. pull_incremental_v1 est supposée présente (créée par pull_incremental_complet.sql) ; sans elle, rien n'est modifié.
do $m$
begin
  if to_regprocedure('public.pull_incremental_v1(jsonb)') is null then
    raise warning 'pull_incremental_v1 absente : pull_incremental non modifiée (rejouer pull_incremental_complet.sql d''abord)';
    return;
  end if;
  execute $f$
    create or replace function public.pull_incremental(cursors jsonb default '{}'::jsonb)
    returns jsonb
    language plpgsql
    security definer
    set search_path to 'public'
    as $b$
    declare
      result jsonb;
      t text;
      cur text;
      rows jsonb;
      leger boolean := coalesce(cursors ->> '_docs_legers', '') = 'oui';
    begin
      -- Garde inconditionnel : personnel (app_role), service_role ou administration directe de la base. Jeton portail et anon : refus.
      if not ( coalesce(auth.jwt() ->> 'role', '') = 'service_role'
            or coalesce(auth.jwt() ->> 'app_role', '') <> ''
            or session_user in ('postgres', 'supabase_admin') ) then
        raise exception 'pull_incremental réservé au personnel connecté' using errcode = '42501';
      end if;
      if leger and to_regclass('public.pi_documents_meta') is not null then
        result := public.pull_incremental_v1(
          jsonb_set(coalesce(cursors, '{}'::jsonb), '{pi_documents}', '"9999-12-31T00:00:00Z"'::jsonb));
        cur := cursors ->> 'pi_documents';
        select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'data', m.data, 'updated_at', m.updated_at)), '[]'::jsonb)
          into rows
          from public.pi_documents_meta m
          where cur is null or cur = '' or m.updated_at > cur::timestamptz;
        result := (result - 'pi_documents') || jsonb_build_object('pi_documents', rows);
      else
        result := public.pull_incremental_v1(cursors);
      end if;

      for t in select jsonb_object_keys(coalesce(cursors, '{}'::jsonb)) loop
        continue when result ? t;
        continue when t !~ '^pi_[a-z0-9_]+$';
        continue when (select count(*) from information_schema.columns
                       where table_schema = 'public' and table_name = t
                         and column_name in ('id','data','updated_at')) < 3;
        cur := cursors ->> t;
        if cur is null or cur = '' then
          execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''data'', data, ''updated_at'', updated_at)), ''[]''::jsonb) from public.%I', t)
            into rows;
        else
          execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''data'', data, ''updated_at'', updated_at)), ''[]''::jsonb) from public.%I where updated_at > $1::timestamptz', t)
            into rows using cur;
        end if;
        result := result || jsonb_build_object(t, rows);
      end loop;
      return result;
    end;
    $b$
  $f$;
end
$m$;

-- ── 2. Droits d'exécution ───────────────────────────────────────────────────
-- pull_incremental : plus d'anon (refus net par l'API) ; authenticated reste, le garde ci-dessus écarte les jetons portail.
-- pull_incremental_v1 et pull_documents_meta : plus d'accès direct pour personne sauf service_role (le wrapper, propriétaire postgres, y accède).
-- Fonctions de déclencheur : jamais appelables par l'API.
do $$
begin
  if to_regprocedure('public.pull_incremental(jsonb)') is not null then
    revoke execute on function public.pull_incremental(jsonb) from public, anon;
    grant  execute on function public.pull_incremental(jsonb) to authenticated, service_role;
  end if;
  if to_regprocedure('public.pull_incremental_v1(jsonb)') is not null then
    revoke execute on function public.pull_incremental_v1(jsonb) from public, anon, authenticated;
    grant  execute on function public.pull_incremental_v1(jsonb) to service_role;
  end if;
  if to_regprocedure('public.pull_documents_meta(text)') is not null then
    revoke execute on function public.pull_documents_meta(text) from public, anon, authenticated;
    grant  execute on function public.pull_documents_meta(text) to service_role;
  end if;
  if to_regprocedure('public._docs_meta_sync()') is not null then
    revoke execute on function public._docs_meta_sync() from public, anon, authenticated;
  end if;
  if to_regprocedure('public._pi_documents_meta_sync()') is not null then
    revoke execute on function public._pi_documents_meta_sync() from public, anon, authenticated;
  end if;
end $$;
notify pgrst, 'reload schema';

-- ── 3. Vérifications (à exécuter et à joindre à la recette) ─────────────────
--  a. Droits : anon doit valoir false partout ; authenticated true seulement pour pull_incremental
--       select proname, has_function_privilege('anon', oid, 'execute') as anon, has_function_privilege('authenticated', oid, 'execute') as auth
--         from pg_proc where pronamespace = 'public'::regnamespace and proname in ('pull_incremental','pull_incremental_v1','pull_documents_meta');
--  b. Clé publique : refus (HTTP 401/403 « permission denied »)
--       curl -s -X POST "$URL/rest/v1/rpc/pull_incremental" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -d '{"cursors":{}}'
--  c. Jeton du portail (kind, sans app_role) : refus 42501 « réservé au personnel connecté »
--       curl … -H "Authorization: Bearer $JETON_PORTAIL" …
--  d. Appel direct de la v1 avec n'importe quel jeton : refus (droit retiré)
--       curl -s -X POST "$URL/rest/v1/rpc/pull_incremental_v1" -H "apikey: $ANON" -H "Authorization: Bearer $JETON_PERSONNEL" -H "Content-Type: application/json" -d '{}'
--  e. Jeton du personnel : réponse complète ; poste ERP : synchronisation descendante normale, mode léger (_docs_legers = 'oui') compris.
--
-- ── RETOUR ARRIÈRE (si un poste cesse de se synchroniser) ───────────────────
--   grant execute on function public.pull_incremental(jsonb)    to anon;
--   grant execute on function public.pull_incremental_v1(jsonb) to anon, authenticated;
--   grant execute on function public.pull_documents_meta(text)  to anon, authenticated;
--   (le garde dans pull_incremental() peut rester : il ne bloque que les jetons sans app_role.)
--
-- ── NON TRAITÉ ICI ─────────────────────────────────────────────────────────
--   · Liste blanche de tables pour la partie « complément » de pull_incremental : la liste de pull_incremental_v1 (générée) n'est pas dans le
--     dépôt ; la relever (pg_get_functiondef) puis y borner le complément. Aujourd'hui : motif ^pi_… + colonnes id/data/updated_at, réservé au personnel.
--   · 161 tables legacy avec politiques « *_open_rollback » (using true) et droits anon complets (schéma rls_fermeture) : arbitrage séparé
--     (supabase/RLS_RECETTE_FERMETURE.md).
