-- ═══════════════════════════════════════════════════════════════════════════
-- menko_hub_users + menko_hub_audit — fermeture ciblée (script PRÉPARÉ, NON APPLIQUÉ)
--
-- Constat (02/11/2026, projet MENCO HOLDING)
--   · menko_hub_users_all   ALL    / anon / using true         → comptes du hub (password_hash, salt) lisibles et modifiables
--   · menko_hub_audit_sel   SELECT / anon / using true         → journal du hub lisible
--   · menko_hub_audit_ins   INSERT / anon / with check (true)  → journal falsifiable
--   15 comptes actifs (8 admins), tous avec mot de passe serveur ; dernière connexion serveur le 30/10.
--
-- Pourquoi c'est sans danger pour les applications
--   Le hub (index.html), Menko Agro (menko-agro.html) et Menko Immo (outil de diagnostic) n'accèdent plus à
--   ces tables qu'à travers l'Edge Function hub-sync (clé de service, qui contourne le RLS). Aucune requête
--   REST directe vers menko_hub_users / menko_hub_audit n'existe dans le code (vérifié par recherche).
--   Seules d'anciennes versions mises en cache dans un navigateur pourraient encore les appeler : elles
--   échoueraient, et le hub retombe alors sur la connexion locale.
--
-- Après ce script : RLS actif et AUCUNE politique → anon et authenticated n'ont plus aucun accès ;
-- service_role (hub-sync) garde tout.
--
-- ORDRE : 1) lire ce fichier  2) vérifier que le hub se connecte (jeton serveur) avec un compte admin
--         3) jouer ce script  4) tester : connexion hub, création d'un utilisateur, connexion Agro.
-- Confirmer l'organisation ET le nom du projet avant d'écrire.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create schema if not exists rls_fermeture;
create table if not exists rls_fermeture.politiques_sauvegarde_hub as
  select now() as sauvegarde_le, p.* from pg_policies p
  where p.schemaname = 'public' and p.tablename in ('menko_hub_users', 'menko_hub_audit');

drop policy if exists menko_hub_users_all on public.menko_hub_users;
drop policy if exists menko_hub_audit_sel on public.menko_hub_audit;
drop policy if exists menko_hub_audit_ins on public.menko_hub_audit;

alter table public.menko_hub_users enable row level security;
alter table public.menko_hub_audit enable row level security;

-- Plus aucun droit de table pour les rôles publics (service_role n'est pas concerné).
revoke all on public.menko_hub_users from anon, authenticated;
revoke all on public.menko_hub_audit from anon, authenticated;

commit;

-- Vérifications attendues (clé publique) : SELECT/INSERT/UPDATE/DELETE sur les deux tables = refusés (HTTP 401/403).
-- Contrôle : select tablename, policyname from pg_policies where tablename in ('menko_hub_users','menko_hub_audit');  → aucune ligne

-- ─── ROLLBACK (à jouer seul en cas de problème) ────────────────────────────
-- begin;
--   grant all on public.menko_hub_users to anon, authenticated;
--   grant all on public.menko_hub_audit to anon, authenticated;
--   create policy menko_hub_users_all on public.menko_hub_users for all to anon using (true) with check (true);
--   create policy menko_hub_audit_sel on public.menko_hub_audit for select to anon using (true);
--   create policy menko_hub_audit_ins on public.menko_hub_audit for insert to anon with check (true);
-- commit;
