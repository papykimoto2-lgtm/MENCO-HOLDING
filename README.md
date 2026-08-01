# Tests unitaires ImmoSuite — coeur métier

Extrait et teste le CODE RÉEL de menko-immo (pas de réimplémentation).

## Utilisation
1. Placer menko-immo-XX.html dans le dossier parent.
2. npm install jsdom
3. python3 extract_functions.py   (régénère extracted_functions.js depuis le HTML)
4. cd tests && node --test test_coeur_metier.js

## Portée actuelle (30 tests)
- majStatutLotClient : seuils, historique_statuts, date_reservation, exclusion frais_souscription
- logAudit / auditHistorique : diff sélectif, anti-bruit, snapshot delete
- calculerCoutGestionLots / figerExerciceCoutGestion : répartition prorata, exclusion 629,
  exclusion hors-exercice, figeage idempotent, traçabilité du figeage

## Étendre
Ajouter le nom de la fonction dans extract_functions.py (names=[...]),
ré-extraire, écrire les cas dans test_*.js. Toute fonction DOM-lourde
(saveClient, updateLotsByProgramme) nécessite un mock de formulaire jsdom
plus complet — non couvert ici, prochaine étape naturelle.

## Fichiers de test
- test_coeur_metier.js — majStatutLotClient, logAudit/auditHistorique, coût de gestion (16 tests)
- test_saveclient.js — saveClient() complet avec formulaire jsdom, verrou anti-double-réservation §4.1 (7 tests)

## Bugs réels trouvés par cette suite
- CHAMPS_SENSIBLES manquait 'cout_gestion_exercices' → figeage jamais audité (corrigé v13.68)
- test_updatelots.js — updateLotsByProgramme() : filtrage select (vendus/réservés-autrui exclus), tri numérique, diagnostics (7 tests)

## Périmètre désormais couvert (audit §4.1 complet)
Les deux moitiés du verrou anti-double-réservation sont testées : le filtrage
du <select> (updateLotsByProgramme) ET la vérification serveur indépendante
au clic Enregistrer (saveClient), qui protège même si le DOM est contourné.
