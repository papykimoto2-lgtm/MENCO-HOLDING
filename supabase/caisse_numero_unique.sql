-- Numéro de bon de caisse unique par caisse (garantie côté base).
-- Complète caisseProchainNumero (contrôle cloud limité à 1,2 s) : ce sont les doublons de numéros
-- (23 cas, ~539 000 F de solde faussé) qui ont motivé cet index.
-- ORDRE : 1) déployer le code qui gère le refus (_caisseResoudreNumeroPris : le bon reçoit le numéro suivant)
--         2) ne jouer ce script qu'APRÈS la publication, une fois les doublons existants corrigés
--            (Caisses > Audit des doublons, ou « Réparer les numéros dupliqués »).
-- Pré-contrôle : cette requête doit renvoyer 0 ligne.
--   select data->>'caisse_id', data->>'numero', count(*) from public.pi_caisse_mouvements
--    where coalesce(data->>'numero','') <> '' group by 1,2 having count(*) > 1;
create unique index if not exists uq_pi_caisse_mouvements_numero
  on public.pi_caisse_mouvements ((data->>'caisse_id'), (data->>'numero'))
  where coalesce(data->>'numero', '') <> '';
-- Retour arrière : drop index public.uq_pi_caisse_mouvements_numero;
