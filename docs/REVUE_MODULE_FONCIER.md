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
