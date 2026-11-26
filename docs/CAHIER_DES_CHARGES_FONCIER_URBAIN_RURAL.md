# Cahier des charges — Module Foncier urbain et rural

Version 1.0 — 26/11/2026 — ERP Sanix Africa / MENCO-HOLDING
Statut : à valider par la direction, un juriste foncier et un géomètre-expert.
Réf. de l'existant : `MANUEL_FONCIER.md`, `MANUEL_PROCEDURES_FONCIER.md`, `MANUEL_PORTEFEUILLE_FONCIER.md`, `supabase/FONCIER_CONNECT_PHASE1.md`.

---

## 1. Objet

Gérer de bout en bout le patrimoine et la sécurisation foncière en **deux régimes distincts**, dans un seul module :

| | Foncier urbain | Foncier rural |
|---|---|---|
| Statut du sol | Domaine urbain (communes, périmètres urbains) | Domaine foncier rural (villages, terroirs) |
| Droits de départ | Lettre d'attribution, droits coutumiers purgés, titre mère | Droits coutumiers constatés (certificat foncier) |
| Titre final | ACD ou approbation de lotissement, titre foncier (TF), titres individuels | Certificat foncier (CF) puis TF / contrat de concession |
| Acteurs clés | Conservation foncière, DUAD/DTC, ADU, notaire, géomètre | Sous-préfet, comité villageois, commissaire enquêteur, AFOR, agriculture |
| Spécificité | Lotissement, cession de lots, souscripteurs | Enquête villageoise, bornage contradictoire, usage agricole |

**Règle fondatrice** : l'ERP suit et coordonne les démarches. « Terminé » ne vaut jamais « accordé par l'administration ». Aucune règle juridique n'est codée en dur sans possibilité de paramétrage.

## 2. Périmètre

**Dans le périmètre** : registre des parcelles, dossiers de sécurisation (procédures urbaine et rurale), intervenants et missions, pièces, frais et refacturation, mutations, cessions, financeurs, comptabilité SYSCOHADA, cartographie, portail acteurs, pilotage.

**Hors périmètre** : délivrance des titres (administration), conseil juridique, signature électronique à valeur légale (phase ultérieure).

## 3. Acteurs et rôles

| Rôle | Droits |
|---|---|
| Agent foncier | Saisit, joint les pièces, prépare les courriers |
| Responsable de dossier | Conduit, valide, publie au souscripteur, dérogation motivée |
| Comptabilité | Comptabilise frais, cessions, encaissements |
| Direction | Modèles, paramètres, rapports, arbitrages |
| Administrateur | Utilisateurs, accès portail, réglages |
| Géomètre, notaire, avocat | Portail : missions, livrables, dépôt de pièces |
| Chef de village / mandataire coutumier | Portail restreint : pièces coutumières, PV (rural) |
| Souscripteur / propriétaire | Portail : avancement, pièces, paiements |
| Auditeur | Lecture seule + journal |

## 4. Exigences fonctionnelles

Légende : **E** existant · **A** à adapter · **N** nouveau. Priorité : P1 indispensable, P2 important, P3 confort.

### 4.1 Registre des parcelles (commun)

| Id | Exigence | État | Prio |
|---|---|---|---|
| FUR-001 | Champ **régime** obligatoire : `urbain` / `rural` (pilote la procédure, les écrans et les contrôles) | N | P1 |
| FUR-002 | Référence interne unique (PARC-AAAA-NNN) | E | P1 |
| FUR-003 | Localisation : région, département, sous-préfecture, commune, village/quartier, îlot, lot | A | P1 |
| FUR-004 | Superficies : totale, constructible/exploitable, cédée, restante (m² et ha) | A | P1 |
| FUR-005 | Situation du titre : sans titre, attestation coutumière, lettre d'attribution, CF, ACD, TF provisoire, TF définitif | A | P1 |
| FUR-006 | Coordonnées polygonales (WGS84 + projection locale UTM 29N), import GeoJSON/KML/CSV | A | P1 |
| FUR-007 | Contrôle de chevauchement entre parcelles (PostGIS) avec alerte bloquante | E (client L2 + serveur PostGIS) | P1 |
| FUR-008 | Indivision et quote-part promoteur | E | P2 |
| FUR-009 | Historique des propriétaires (chaîne de propriété datée) | E (L5) | P2 |
| FUR-010 | Charges et servitudes (hypothèque, litige, servitude, emprise voirie) | E (L5) | P2 |
| FUR-011 | Coût total et valeur patrimoniale calculés automatiquement | E | P1 |

### 4.2 Procédure urbaine

| Id | Exigence | État | Prio |
|---|---|---|---|
| FUR-101 | Procédure en 2 phases : coutumière/technique (bloquante) puis administrative | E | P1 |
| FUR-102 | Choix de la voie **ACD** ou **approbation de lotissement**, modifiable tant qu'aucune étape de la voie n'est engagée | E | P1 |
| FUR-103 | Purge des droits coutumiers : PV de famille, attestations, indemnisations, convention notariée | E | P1 |
| FUR-104 | Dossier technique : levé, parcellaire, polygonale, plan d'aménagement | E | P1 |
| FUR-105 | Suivi des avis administratifs (guichet unique, DTC, DUAD, commodo et incommodo) avec dates et pièces | E | P1 |
| FUR-106 | Lotissement : création des lots depuis le plan, numérotation, superficies, prix, statut (libre, réservé, vendu, titré) | E | P1 |
| FUR-107 | Titre mère puis **titres individuels** par lot, ouverture automatique au solde du souscripteur | E | P1 |
| FUR-108 | Mutation lot par lot, par souscripteur, par groupe | E | P1 |
| FUR-109 | Génération du dossier de transmission au notaire | E | P2 |

### 4.3 Procédure rurale

| Id | Exigence | État | Prio |
|---|---|---|---|
| FUR-201 | Procédure rurale distincte, 3+ phases : recherche et délimitation, enquête foncière et accord des propriétaires terriens, enquête officielle et certification | E | P1 |
| FUR-202 | Registre des **ayants droit coutumiers** : famille, chef de terre, héritiers, tuteurs ; lien parcelle ↔ ayants droit avec part | E (L5) | P1 |
| FUR-203 | Fiche **village** : chef, comité villageois de gestion foncière (membres, mandat, PV) | E (L3) | P1 |
| FUR-204 | **Enquête officielle** : nomination du commissaire enquêteur, ouverture, durée (1 mois par défaut, paramétrable), compte à rebours, clôture, observations et oppositions | E (L3) | P1 |
| FUR-205 | **Oppositions et litiges** : enregistrement, partie adverse, médiation, issue ; suspend la phase suivante | E (L3) | P1 |
| FUR-206 | Bornage contradictoire : convocation des riverains, PV signé, présences, PV | E (L3) | P1 |
| FUR-207 | Réunion de validation (sous-préfet) : date, PV, décision, pièces | E | P1 |
| FUR-208 | Suivi du **certificat foncier** : n°, date, titulaire, validité ; passage CF → TF | A | P1 |
| FUR-209 | Usage et mise en valeur : culture, superficie plantée, exploitant, bail/contrat (métayage, location, concession) | N | P2 |
| FUR-210 | Contrats ruraux : cession coutumière, bail, promesse, avec échéancier de redevances | N | P2 |
| FUR-211 | Reclassement domaine rural → urbain (extension de périmètre) : bascule de régime avec historique, sans perte de pièces | N | P2 |

### 4.4 Fonctions communes

| Id | Exigence | État | Prio |
|---|---|---|---|
| FUR-301 | Modèles de procédure paramétrables par la direction (étapes, ordre, délais, obligatoire/facultatif, justificatifs) | E | P1 |
| FUR-302 | Étapes bloquantes ; dérogation par administrateur, motivée et journalisée | E | P1 |
| FUR-303 | « Ma journée », Kanban, calendrier + export ICS | E | P1 |
| FUR-304 | Score de risque par dossier | E | P2 |
| FUR-305 | Pièces : stockage privé, contrôle (accepté/refusé + motif), versionnage, empreinte SHA-256, URL signées à durée courte | A | P1 |
| FUR-306 | Missions et intervenants avec accès portail limité à leurs dossiers | E | P1 |
| FUR-307 | Frais du titre, budget prévisionnel, refacturation au souscripteur | E | P1 |
| FUR-308 | Notifications (e-mail, in-app, WhatsApp via passerelle) : échéances, retards, pièces, opposition | A | P2 |
| FUR-309 | Historique en **ajout seul** ; journal d'audit des actions sensibles | E | P1 |
| FUR-310 | Archivage annuel des dossiers clos, conservation des pièces ≥ 30 ans | A | P2 |
| FUR-311 | Recherche multicritère : référence, TF, CF, ACD, localité, propriétaire, statut, régime | A | P1 |
| FUR-312 | Exports PDF et Excel (portefeuille, dossier, tableau de bord) | E | P1 |
| FUR-313 | Mode hors-ligne pour la saisie terrain rural (PWA, synchronisation différée, résolution de conflits) | E (existant : file d'envoi ; L6 : état affiché) | P2 |
| FUR-314 | Saisie mobile terrain : photo géolocalisée, point GPS, PV signé au doigt | E (L6) | P2 |
| FUR-315 | **Audit foncier pré-acquisition** (protocole AUD-FON-MENKO-02, 19 points Go / No-Go, verdict automatique, comité à 3 visas, décision définitive) ; sortie de l'étape « Négociation » conditionnée au GO | E (L8) | P1 |
| FUR-316 | **Import Excel** du modèle MENKO V2 (opérations, lots, suivi des dossiers) : analyse avant écriture, rapport, idempotent, ventes à rattacher | E (L9) | P1 |
| FUR-317 | **Modèles de documents** : protocole de purge des droits coutumiers (conditionné à l'audit GO), PV de remise de lot (conditionné au solde), PV de remise d'ACD | E (L10) | P1 |
| FUR-318 | **Contrôle de cohérence** : le logiciel détecte les incohérences, établit l'état, propose la correction (appuyée sur les pièces) ; l'utilisateur décide ; corrections, observations, motifs et historique enregistrés (registre synchronisé, décisions respectées, constat corrigé réapparu = rouvert) | E (L12) | P1 |
| FUR-319 | **Moteur d'impression, de modification et de suppression** sur tous les écrans fonciers : fiche et liste imprimables, export CSV, historique des modifications (avant/après/motif), enregistrement clos modifiable par administrateur avec motif, suppression contrôlée (administrateur, motif, règles par type, trace, garde-fou serveur) | E (L13) | P1 |

### 4.5 Cartographie

| Id | Exigence | État | Prio |
|---|---|---|---|
| FUR-401 | Carte des parcelles colorée par statut du titre et par régime | E | P1 |
| FUR-402 | Couches : limites de village, sous-préfecture, voirie, parcelles voisines, lots | N | P2 |
| FUR-403 | Mesure de distance et de surface, export du plan | N | P3 |
| FUR-404 | Plan 3D du lotissement sur le portail | E | P3 |

### 4.6 Comptabilité SYSCOHADA

| Id | Exigence | État | Prio |
|---|---|---|---|
| FUR-501 | Acquisition : terrain en **immobilisation** (compte 22) ou **stock** de terrains à lotir (compte 31 / 38 selon politique) ; frais d'acquisition rattachés au coût | A | P1 |
| FUR-502 | Frais de purge coutumière, bornage, notaire, droits d'enregistrement et conservation foncière incorporés au coût de revient | A | P1 |
| FUR-503 | Cession : écriture automatique tiers / produit de cession (classe 7) / sortie de stock ou VNC, marge calculée | E | P1 |
| FUR-504 | Refacturation des frais du titre : débours en compte de tiers, jamais en produit | E | P1 |
| FUR-505 | Échéancier acquéreur, encaissements, relances par niveaux | E | P1 |
| FUR-506 | Comptes par défaut paramétrables ; écriture bloquée si compte manquant | E | P1 |
| FUR-507 | Pas de suppression d'écriture validée ; contre-passation uniquement | E | P1 |
| FUR-508 | Taux fiscaux paramétrables par année (enregistrement 4 %, conservation 0,4 %, etc.) à faire valider par l'expert-comptable | E | P1 |

> Les numéros de comptes et la politique stock/immobilisation sont à confirmer avec l'expert-comptable avant mise en production.

## 5. Modèle de données (cible)

**Convention retenue (lot L1)** : format uniforme de l'ERP `pi_*` (`id text`, `data jsonb`, `updated_at`, `scope_id`), une base par client, pas d'`organisation_id`. Les noms ci-dessous sont logiques ; tables réelles : `pi_villages_fonciers`, `pi_ayants_droit_fonciers` (lien parcelles dans `data.parcelles`), `pi_titres_fonciers`. Les tables typées (PostGIS) arrivent au lot L2.

| Table | Rôle |
|---|---|
| `foncier_parcelles` (+ `regime`, `geom geometry(MultiPolygon,4326)`, `village_id`) | Registre |
| `foncier_villages` | Village, sous-préfecture, chef, coordonnées |
| `foncier_comites_villageois` + `_membres` | CVGFR |
| `foncier_ayants_droit` | Personnes ou familles coutumières |
| `foncier_parcelle_ayants_droit` | Lien + quote-part |
| `foncier_oppositions` | Litiges et oppositions, statut, issue |
| `foncier_enquetes` | Enquêtes officielles : dates, commissaire, statut |
| `foncier_bornages` + `_presences` | Bornage contradictoire |
| `foncier_titres` | CF, ACD, TF : n°, type, date, parent_id |
| `foncier_exploitations` | Usage agricole, contrats ruraux |
| `foncier_charges` | Servitudes, hypothèques |
| `foncier_chaine_propriete` | Historique propriétaires |
| `foncier_dossiers`, `_etapes`, `_pieces`, `_events` | Existants, ajouter `regime` |

Contraintes : FK partout, `check` sur statuts et régimes, index GiST sur `geom`, index btree sur référence/TF/CF, trigger de chevauchement (`ST_Overlaps` hors tolérance 0,5 m²).

## 6. Sécurité

- RLS activée sur toutes les tables ; isolation par `organisation_id` ; moindre privilège par rôle.
- Aucun accès anonyme. Intervenants et chefs de village : vue limitée à leurs dossiers via fonctions `security definer` à `search_path` fixé.
- Pièces en bucket privé ; URL signées ≤ 5 min ; blocage MIME (PDF, JPG, PNG, DOCX, GeoJSON) ; taille max 20 Mo ; antivirus côté Edge Function.
- Aperçu des documents en iframe sandbox ; sanitisation de toute saisie ; CSP stricte.
- Journal d'audit en ajout seul : qui, quoi, avant/après, IP, date.
- Données personnelles (identités, pièces d'identité) chiffrées ; conformité loi ivoirienne 2013-450 sur les données personnelles.
- Aucun secret côté client.
- Limitation des tentatives de connexion ; MFA pour admin et direction.
- Protection IDOR : toute lecture/écriture vérifiée côté serveur.

## 7. Exigences non fonctionnelles

| Critère | Cible |
|---|---|
| Chargement initial | < 2 s sur 4G |
| Listes | Pagination serveur, 50 lignes par défaut, virtualisation > 500 |
| Carte | 10 000 parcelles fluides (clustering, tuiles vectorielles) |
| Disponibilité | 99,5 % |
| Sauvegarde | Quotidienne, rétention 30 j, test de restauration trimestriel |
| Hors-ligne | Saisie rural 7 jours sans réseau |
| Accessibilité | Tactile, contraste AA, français (langues locales : phase ultérieure) |
| Compatibilité | Android 9+, Chrome, Safari, Firefox ; PWA installable |
| Traçabilité | 100 % des actions sensibles journalisées |

## 8. Indicateurs de pilotage

- Parcelles et superficie par régime et par statut de titre.
- Délai moyen par étape et par procédure ; dossiers en retard.
- Dossiers urbains : ACD obtenus, TF délivrés, titres individuels remis.
- Dossiers ruraux : enquêtes ouvertes/closes, oppositions actives, CF obtenus.
- Coût de titre moyen par lot et par hectare.
- Créances acquéreurs et niveaux de relance.
- Parcelles à risque élevé ou critique.

## 9. Livrables

1. Migrations SQL (schéma, RLS, index, fonctions, triggers de chevauchement).
2. Écrans : sélecteur de régime, fiche parcelle, fiche village/CVGFR, ayants droit, enquêtes, oppositions, bornage, titres.
3. Modèles de procédure urbaine et rurale (paramétrables).
4. Portail : vues chef de village, géomètre, notaire, souscripteur.
5. Exports PDF/Excel, états de pilotage.
6. Tests automatisés (cœur métier, RLS, chevauchement).
7. Manuel utilisateur et manuel de procédures mis à jour.

## 10. Plan de réalisation

| Lot | Contenu | Prio |
|---|---|---|
| L1 | Champ `regime`, villages, ayants droit, titres (CF/ACD/TF), migration de l'existant | P1 |
| L2 | Géométrie PostGIS, import, contrôle de chevauchement, carte par régime | P1 |
| L3 | Enquête officielle, oppositions, bornage contradictoire, CVGFR | P1 |
| L4 | Comptabilité : stock/immobilisation, incorporation des frais | P1 |
| L5 | Exploitation et contrats ruraux, chaîne de propriété, charges | P2 |
| L6 | Mode hors-ligne et saisie mobile terrain | P2 |
| L7 | Portail chef de village, notifications WhatsApp | P2 |

## 11. Critères de recette

- Parcelle sans `regime` : enregistrement refusé.
- Deux polygones qui se chevauchent : alerte bloquante.
- Dossier rural avec opposition ouverte : phase de certification bloquée.
- Enquête de 1 mois : clôture impossible avant échéance sans dérogation motivée.
- Intervenant A ne lit jamais le dossier de l'intervenant B (test RLS).
- Cession : écriture équilibrée, marge exacte, bloquée si compte manquant.
- Suppression d'une pièce : impossible ; archivage seul, trace conservée.
- Saisie hors-ligne 24 h puis synchronisation sans perte.
- Chargement fiche parcelle < 2 s avec 10 000 parcelles.

## 12. Risques

| Risque | Mesure |
|---|---|
| Textes et procédures évolutifs | Modèles paramétrables, revue juridique annuelle |
| Données coutumières contestées | Oppositions tracées, pièces signées, pas de suppression |
| Qualité des coordonnées | Contrôles de chevauchement et de cohérence, validation géomètre |
| Réseau faible en zone rurale | PWA hors-ligne |
| Confusion urbain/rural | Régime obligatoire, couleurs distinctes (rouge urbain, bleu rural) |

## 13. Points à valider avant développement

1. Liste exacte des étapes et pièces de la procédure rurale (31 étapes actuelles à confirmer avec l'AFOR et le service agriculture).
2. Textes de référence applicables (domaine foncier rural, acquisition de la propriété des terrains urbains, purge des droits coutumiers) : version à jour, par un juriste.
3. Politique comptable stock vs immobilisation.
4. Périmètre géographique initial (ex. Grand-Lahou).
5. Besoin de langues locales sur le portail.
6. Passerelle WhatsApp retenue.
