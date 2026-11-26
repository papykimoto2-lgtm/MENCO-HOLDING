# Revue experte — Module Foncier (urbain et rural)

Date : 2026-11-26. Périmètre : lots L1–L11. Méthode : parcours d'une terre de l'identification à la remise des titres, contrôle des règles métier côté client et serveur.

## Verdict

| Axe | Avis | Détail |
|---|---|---|
| Couverture de la chaîne foncière | ✅ | 9 étapes outillées : identifier, auditer, purger, publicité, titre, lotir, vendre, titrer, remettre |
| Sécurité juridique | ✅ | Audit 19 points (13 bloquants) ; protocole signé non modifiable ; opposition active suspend la certification ; charge bloquante interdit la cession |
| Intégrité des données | ✅ | Contraintes SQL + triggers (quotes-parts ≤ 100 %, surfaces exploitées, chevauchement PostGIS) ; RLS staff, aucun accès anon |
| Comptabilité SYSCOHADA | ✅ avec réserve | Immobilisation 22x / stock, sortie VNC 81x ; sous-comptes à valider avec l'expert-comptable |
| Guidage utilisateur | ✅ (L11) | Parcours, bandeau d'étape, précédent / suivant, sous-menu regroupé par étape |
| Traçabilité du calcul | ✅ (L11) | Note de calcul par onglet, exemple sur données réelles, note complète imprimable |
| Interconnexions | ✅ (L11) | 26 liens documentés et cliquables ; fiche parcelle 360° |

## Écarts connus (à décider)

1. **Zahara** : mêmes scripts SQL à exécuter sur le second projet Supabase.
2. **4 chevauchements existants** sur MENCO HOLDING : régulariser le contour ou poser une dérogation motivée.
3. Non automatisé : blocage caisse des décaissements au-delà des frais de levé ; écritures comptables des redevances ; notifications WhatsApp ; tuiles vectorielles au-delà de 10 000 parcelles.
4. Textes des modèles Word (protocole, PV) : validation par un juriste.

## Ce que L11 change pour l'utilisateur

- **Où j'en suis** : écran « 🧭 Parcours foncier » (entonnoir, à faire maintenant, toutes les terres).
- **Que faire ensuite** : chaque ligne propose le bon écran en un clic.
- **Pourquoi ce chiffre** : volet « 📘 Note de calcul » en tête de chaque onglet.
- **Que sait l'ERP de cette terre** : la référence de parcelle ouvre la fiche 360° dans toutes les listes 2.6.
- **Qui alimente qui** : « 🔗 Carte des interconnexions ».

Référence détaillée : `docs/NOTE_DE_CALCUL_FONCIER.md` (générée par `node tools/gen_note_calcul_foncier.js`).

## Revue générale du 2026-11-26 (4 agents : sécurité SQL, code, métier SYSCOHADA, UX) — suite donnée

**Corrigé (lot L15)** : voir « L15 — Correctifs de la revue générale » du manuel. Script serveur : `supabase/foncier_correctifs_l15.sql` (+ rejouer `foncier_echeances_serveur.sql` et `foncier_audit_l8.sql`).

**Préparé, non exécuté (décision requise)**
- `supabase/securite_acces_anon_a_valider.sql` : garde inconditionnel dans `pull_incremental`, droits retirés à anon sur la v1 et `pull_documents_meta` (critique, base en ligne) — **préparé, non exécuté**, préalables et recette dans le fichier.
- 161 tables legacy avec politiques `*_open_rollback` et droits anon complets : à arbitrer.

**Reporté (non traité dans L15)**
- Règles « administrateur » appliquées seulement par l'ERP (la RLS accepte tout rôle applicatif) ; dépôt de fichiers du portail : métadonnées non vérifiées ; souscripteur pouvant réécrire sa demande ; consultation de pièce portail non journalisée.
- Effets de bord écrits avant l'enregistrement du document (signature d'un protocole ou d'un PV, transfert de propriété) : atomicité à revoir.
- Plafond de décompression avant contrôle dans le lecteur .xlsx ; ids dans les attributs `onclick` (non exploitable avec des ids locaux).
- Comptabilité : coût d'acquisition sans purge ni droits du titre ; un seul compte de contrepartie (401 / 481) ; taux fiscaux partagés par année.
- Procédure : deux bornages « contradictoires » (enquête, cadastre) à distinguer ; définition unique d'ADU.
- Ergonomie : saisies par `prompt()` natif, titres h1 à h3 des volets, doublons de libellés (« Pilotage », « Titres »), cartes empilées sur mobile (les tableaux défilent).
