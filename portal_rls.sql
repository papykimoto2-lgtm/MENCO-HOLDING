-- ═══════════════════════════════════════════════════════════════════════════
-- Partner Immo CI — RLS du portail (souscripteur + apporteur)
-- Lignes { id text pk, data jsonb }. JWT scoped émis par l'Edge Function portal-login :
--   claims => role 'authenticated', kind 'souscripteur'|'apporteur', scope_id <id>
-- Le rôle anon ne lit RIEN d'autre que le contenu public marketing.
--   ⚠️ TESTER EN PRÉPROD. Activer la RLS coupe l'accès anon permissif actuel :
--   l'app STAFF doit passer par service_role (Edge Functions) ou un rôle authentifié dédié.
-- ═══════════════════════════════════════════════════════════════════════════

-- Helpers de lisibilité
--   auth.jwt()->>'kind'      : 'souscripteur' | 'apporteur'
--   auth.jwt()->>'scope_id'  : id du client / de l'apporteur connecté

-- ─────────────────────────────────────────────────────────────────────────
-- 1) SOUSCRIPTEUR
-- ─────────────────────────────────────────────────────────────────────────
alter table pi_clients enable row level security;

drop policy if exists cli_self on pi_clients;
create policy cli_self on pi_clients for select to authenticated
  using (
    (auth.jwt()->>'kind') = 'souscripteur' and id = (auth.jwt()->>'scope_id')
    or
    -- l'apporteur voit les clients qu'il a apportés (lecture)
    (auth.jwt()->>'kind') = 'apporteur' and (data->>'apporteur_id') = (auth.jwt()->>'scope_id')
  );

alter table pi_versements enable row level security;
drop policy if exists vers_self on pi_versements;
create policy vers_self on pi_versements for select to authenticated
  using ( (auth.jwt()->>'kind') = 'souscripteur'
          and (data->>'client_id') = (auth.jwt()->>'scope_id') );

alter table pi_conventions enable row level security;
drop policy if exists conv_self on pi_conventions;
create policy conv_self on pi_conventions for select to authenticated
  using ( (data->>'client_id') = (auth.jwt()->>'scope_id') );

alter table pi_receptions_dossiers enable row level security;
drop policy if exists recep_self on pi_receptions_dossiers;
create policy recep_self on pi_receptions_dossiers for select to authenticated
  using ( (data->>'client_id') = (auth.jwt()->>'scope_id') );

-- ─────────────────────────────────────────────────────────────────────────
-- 2) APPORTEUR
-- ─────────────────────────────────────────────────────────────────────────
alter table pi_apporteurs enable row level security;
drop policy if exists app_self on pi_apporteurs;
create policy app_self on pi_apporteurs for select to authenticated
  using ( (auth.jwt()->>'kind') = 'apporteur' and id = (auth.jwt()->>'scope_id') );

alter table pi_commissions enable row level security;
drop policy if exists comm_self on pi_commissions;
create policy comm_self on pi_commissions for select to authenticated
  using ( (data->>'beneficiaire_id') = (auth.jwt()->>'scope_id') );

-- ─────────────────────────────────────────────────────────────────────────
-- 2bis) ACQUÉREUR FONCIER
-- ─────────────────────────────────────────────────────────────────────────
alter table pi_cessions_foncieres enable row level security;
drop policy if exists cess_fon_self on pi_cessions_foncieres;
create policy cess_fon_self on pi_cessions_foncieres for select to authenticated
  using ( (auth.jwt()->>'kind') = 'foncier' and id = (auth.jwt()->>'scope_id') );

alter table pi_declarations_versement_foncier enable row level security;
drop policy if exists decl_fon_sel on pi_declarations_versement_foncier;
create policy decl_fon_sel on pi_declarations_versement_foncier for select to authenticated
  using ( (auth.jwt()->>'kind') = 'foncier'
          and (data->>'cession_id') = (auth.jwt()->>'scope_id') );
drop policy if exists decl_fon_ins on pi_declarations_versement_foncier;
create policy decl_fon_ins on pi_declarations_versement_foncier for insert to authenticated
  with check ( (auth.jwt()->>'kind') = 'foncier'
               and (data->>'cession_id') = (auth.jwt()->>'scope_id')
               and (data->>'statut') = 'en_attente'
               and (data->>'canal')  = 'portail' );
-- (pas d'update/delete portail : la déclaration ne peut plus être modifiée)

-- ─────────────────────────────────────────────────────────────────────────
-- 3) CONTENU PARTAGÉ (lecture pour tout portail authentifié)
--    Programmes / lots / rapports de chantier = catalogue non nominatif.
-- ─────────────────────────────────────────────────────────────────────────
alter table pi_programmes enable row level security;
drop policy if exists prog_auth on pi_programmes;
create policy prog_auth on pi_programmes for select to authenticated using ( true );

alter table pi_lots enable row level security;
drop policy if exists lots_auth on pi_lots;
create policy lots_auth on pi_lots for select to authenticated using ( true );

alter table pi_rapports_chantier enable row level security;
drop policy if exists rap_auth on pi_rapports_chantier;
create policy rap_auth on pi_rapports_chantier for select to authenticated using ( true );

-- ─────────────────────────────────────────────────────────────────────────
-- 4) CONTENU PUBLIC MARKETING (lecture anon, avant connexion)
--    Médias visibles + paramètres du portail (bandeau, villas…).
-- ─────────────────────────────────────────────────────────────────────────
alter table pi_portail_medias enable row level security;
drop policy if exists media_pub on pi_portail_medias;
create policy media_pub on pi_portail_medias for select to anon, authenticated
  using ( coalesce((data->>'visible'), 'true') <> 'false' );

alter table pi_params enable row level security;
drop policy if exists params_portail_pub on pi_params;
create policy params_portail_pub on pi_params for select to anon, authenticated
  using ( id = 'portail' );   -- n'exposer QUE la ligne portail, pas les params internes

-- ─────────────────────────────────────────────────────────────────────────
-- 5) MESSAGERIE PORTAIL (lire + écrire ses propres fils)
-- ─────────────────────────────────────────────────────────────────────────
alter table pi_portail_messages enable row level security;
drop policy if exists msg_self_sel on pi_portail_messages;
create policy msg_self_sel on pi_portail_messages for select to authenticated
  using ( (data->>'interlocuteur_type') = (auth.jwt()->>'kind')
          and (data->>'interlocuteur_id') = (auth.jwt()->>'scope_id') );
drop policy if exists msg_self_ins on pi_portail_messages;
create policy msg_self_ins on pi_portail_messages for insert to authenticated
  with check ( (data->>'interlocuteur_type') = (auth.jwt()->>'kind')
               and (data->>'interlocuteur_id') = (auth.jwt()->>'scope_id') );
drop policy if exists msg_self_upd on pi_portail_messages;  -- marquer "lu" seulement les siens
create policy msg_self_upd on pi_portail_messages for update to authenticated
  using ( (data->>'interlocuteur_id') = (auth.jwt()->>'scope_id') )
  with check ( (data->>'interlocuteur_id') = (auth.jwt()->>'scope_id') );

-- ─────────────────────────────────────────────────────────────────────────
-- 6) FORMULAIRE PUBLIC → LEADS (insertion anon uniquement, aucune lecture)
-- ─────────────────────────────────────────────────────────────────────────
alter table pi_leads enable row level security;
drop policy if exists leads_pub_ins on pi_leads;
create policy leads_pub_ins on pi_leads for insert to anon, authenticated
  with check ( (data->>'source') in ('site_web','portail') );
-- pas de policy select => personne ne lit les leads via l'API publique.

-- ─────────────────────────────────────────────────────────────────────────
-- 7) LOGS DE CONNEXION (insertion seule, jamais lisibles côté portail)
-- ─────────────────────────────────────────────────────────────────────────
alter table pi_logs_connexion enable row level security;
drop policy if exists logs_ins on pi_logs_connexion;
create policy logs_ins on pi_logs_connexion for insert to anon, authenticated with check ( true );

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) TABLES SENSIBLES — AUCUN ACCÈS PORTAIL
--    Le portail NE DOIT PLUS lire pi_users / pi_employes (fuite staff/admin).
--    RLS activée sans policy pour anon/authenticated => tout est bloqué.
--    (Le staff y accède via service_role / rôle staff dédié, hors portail.)
-- ═══════════════════════════════════════════════════════════════════════════
alter table pi_users enable row level security;
alter table pi_employes enable row level security;
-- (ne créer aucune policy anon/authenticated ici)

-- ═══════════════════════════════════════════════════════════════════════════
-- RAPPEL : après activation, l'app STAFF perd l'accès anon. Prévoir sa bascule
-- (Edge Functions service_role, ou JWT staff + policies 'staff=true') AVANT prod.
-- ═══════════════════════════════════════════════════════════════════════════
