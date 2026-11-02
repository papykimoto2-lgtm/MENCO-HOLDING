-- ═══════════════════════════════════════════════════════════════════════════
-- pi_portail_analytics — fermeture ciblée (script PRÉPARÉ, NON APPLIQUÉ)
--
-- Constat (02/11/2026, projet MENCO HOLDING) : la table porte
--   · personnel_tout            (authenticated, portail_rls.est_personnel())
--   · pi_portail_analytics_open_rollback  ALL / anon+authenticated / using true  ← à retirer
--   · portail_analytics_ins     INSERT / anon+authenticated / with check (true)   ← à resserrer
-- Aujourd'hui n'importe quel visiteur peut LIRE, MODIFIER et SUPPRIMER tout le journal.
--
-- Après ce script
--   · le portail (anon) peut seulement INSÉRER des événements valides ;
--   · le personnel (jeton staff-login, claim app_role) garde tout accès ;
--   · le hub lit via l'action hub-sync « portail_stats » (déployer hub-sync AVANT) ;
--   · Menko Immo (sbFetch) lit avec le jeton du personnel : à vérifier en recette.
--
-- ORDRE : 1) déployer hub-sync  2) jouer sur une BRANCHE Supabase  3) tester le portail
-- (une visite doit toujours s'enregistrer) et les statistiques  4) seulement alors la prod.
-- Confirmer l'organisation ET le nom du projet avant d'écrire (voir rls_02_pilote.sql).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- Sauvegarde des politiques actuelles (restauration : bloc ROLLBACK en bas)
create schema if not exists rls_fermeture;
create table if not exists rls_fermeture.politiques_sauvegarde_portail_analytics as
  select now() as sauvegarde_le, p.* from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'pi_portail_analytics';

-- Garde : le personnel doit garder son accès, sinon on s'arrête.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pi_portail_analytics' and policyname='personnel_tout') then
    raise exception 'personnel_tout absente : fermeture refusée';
  end if;
end $$;

drop policy if exists pi_portail_analytics_open_rollback on public.pi_portail_analytics;
drop policy if exists portail_analytics_ins on public.pi_portail_analytics;

-- Insertion anonyme bornée : types d'événements connus, longueurs limitées, durée plausible.
create policy portail_analytics_ins on public.pi_portail_analytics
  for insert to anon, authenticated
  with check (
    event_type in ('session_start','tab_view','session_end')
    and coalesce(length(session_id), 0) between 8 and 64
    and coalesce(length(onglet), 0) <= 60
    and coalesce(length(timezone), 0) <= 60
    and coalesce(length(langue), 0) <= 20
    and coalesce(length(referrer_domaine), 0) <= 120
    and (appareil is null or appareil in ('mobile','tablette','desktop'))
    and (duree_ms is null or duree_ms between 0 and 86400000)
  );

-- Droits de table : le rôle anon n'a besoin que d'insérer.
revoke select, update, delete on public.pi_portail_analytics from anon;

commit;

-- Vérifications attendues (en anon) : INSERT valide = 201 ; SELECT = [] ; DELETE/PATCH = aucune ligne touchée.
-- Contrôle : select policyname, cmd, roles from pg_policies where tablename='pi_portail_analytics';

-- ─── ROLLBACK (à jouer seul en cas de problème) ────────────────────────────
-- begin;
--   drop policy if exists portail_analytics_ins on public.pi_portail_analytics;
--   create policy portail_analytics_ins on public.pi_portail_analytics for insert to anon, authenticated with check (true);
--   create policy pi_portail_analytics_open_rollback on public.pi_portail_analytics for all to anon, authenticated using (true) with check (true);
--   grant select, update, delete on public.pi_portail_analytics to anon;
-- commit;
