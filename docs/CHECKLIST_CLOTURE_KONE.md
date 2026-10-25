# Checklist de clôture année par année — pour Koné

**Objet** : clôturer les exercices de MENCO IMMO dans l'ordre, sans doublon ni écart, avec un point de décision préalable.
**Base des chiffres** : relevé de la base de production le 25/10/2026 (lecture seule). Les montants sont des soldes provisoires issus des écritures, à valider.
**Référentiel** : plan SYSCOHADA révisé (1 827 comptes). Le résultat de l'exercice est porté sur 131 (bénéfice) / 139 (perte).

---

## 0. Décision à prendre AVANT de clôturer quoi que ce soit

Deux jeux de données se contredisent :

| | Historique 2020-2025 (import) | Bilan d'ouverture 2026 (`BO-2026`, 32 lignes, équilibré) |
|---|---|---|
| Trésorerie (classe 5) | +595,6 M | +145,3 M |
| Tiers (classe 4) | −659,0 M | −1 872,4 M |
| Immobilisations (classe 2) | +40,0 M | +655,2 M |
| Stocks (classe 3) | — | +897,6 M |

L'historique n'est **pas** compris dans le bilan d'ouverture (les chiffres ne se recoupent pas). Depuis la mise à jour d'octobre 2026, les Bilans 2026 et suivants repartent **uniquement** du bilan d'ouverture.

**Choix à faire (Koné) :**

- **Option A — le bilan d'ouverture 2026 est la référence** (reprise comptable au 01/01/2026). Les années 2020-2025 restent un historique de gestion, **non clôturé** dans l'ERP. La clôture légale commence avec **2026** (à-nouveaux 2027). *Recommandée si le bilan d'ouverture a été établi et validé de votre côté.*
- **Option B — l'historique est la référence.** On clôture **2020 puis 2021 … jusqu'à 2025**, dans l'ordre, puis on **supprime** `BO-2026` (Comptabilité › Bilan d'ouverture) avant de clôturer 2025, pour que les à-nouveaux de la clôture le remplacent. À choisir seulement si l'historique est complet **et** que le bilan d'ouverture est faux.

> **Garde-fou de l'ERP** : la clôture de 2025 est **refusée** tant que `BO-2026` existe (sinon l'ouverture 2026 serait comptée deux fois).

Réponse de Koné : ☐ Option A   ☐ Option B   Date : ____ / ____ / ______   Signature : ____________

---

## 1. Préparation commune (une seule fois)

- [ ] **Sauvegarde** de la base (export Supabase) et **export FEC** de chaque année existante avant la première clôture. *Une clôture verrouille l'exercice.*
- [ ] **Comptes hors plan** : `2812` (amortissements bâtiments) et `890` (compte de liaison technique des à-nouveaux) sont utilisés en 2026 mais absents du plan. Les créer (Paramètres › Plan comptable) : 890 = « Compte de liaison à-nouveaux (technique) ».
- [ ] **154 versements sans écriture comptable** : *Comptabilité › Versements › 🧾 Générer écritures manquantes*. **Avant de générer, vérifier qu'ils ne figurent pas déjà dans l'import** (risque de doublon), puis contrôler l'impact sur les soldes des années concernées.
- [ ] **Ventes** : *Comptabilité › Versements › 🏠 Comptabiliser ventes logements* et *🗺️ Comptabiliser ventes terrains*. Les années 2021 à 2024 n'ont **aucun produit** : confirmer que c'est normal (pas de vente reconnue) ou rattraper les ventes.
- [ ] **Tiers** : les lignes de comptes clients/fournisseurs importées n'ont pas de compte auxiliaire (7 années, 1 872 lignes). L'ERP retrouve le tiers des versements, ventes, résiliations et cessions par leur identifiant ; pour le reste, lettrer par compte et expliquer les postes ouverts.
- [ ] **Caisses** : 2 sessions de caisse sont **encore ouvertes** → les clôturer (comptage), faire viser les bons soumis au circuit (visa du Gérant), ventiler (*Caisse › Ventilation*).
- [ ] **Plan et référentiel** : valider le plan SYSCOHADA importé (66 personnel, 64 impôts, 67 financier, 81-89 HAO, 131/139 résultat). L'ERP l'a reconnu automatiquement.

---

## 2. Modèle de checklist — à répéter pour chaque exercice à clôturer

Ordre obligatoire : du plus ancien au plus récent. Ne jamais sauter une année.

**A. Données**
- [ ] Toutes les opérations de l'année sont saisies (versements, ventes, cessions, commissions, paie, achats, banque, caisse).
- [ ] Aucune pièce à date erronée (année hors plage) — contrôle : Journal filtré sur l'année.
- [ ] Paie des 12 mois comptabilisée **et réglée** (*Paie › Journal de paie*).
- [ ] Commissions : annulées ou payées, aucune « à payer » oubliée.

**B. Trésorerie**
- [ ] Caisses de l'année clôturées, ventilées, écarts expliqués (*Caisse › Brouillards*).
- [ ] Banque rapprochée jusqu'au 31/12 (*Comptabilité › Rapprochement*).
- [ ] Solde banque/caisse du Bilan = relevé / comptage au 31/12.

**C. Tiers**
- [ ] Lettrage de l'exercice lancé (*Comptabilité › Tiers*), postes ouverts expliqués (échéance, litige, avance).
- [ ] Aucun solde client créditeur inexpliqué (avances à justifier), aucun fournisseur débiteur inexpliqué.

**D. Immobilisations**
- [ ] Immobilisations de l'année enregistrées (5 immobilisations + 1 bien amorti à ce jour).
- [ ] **Dotations de l'année comptabilisées** (*Comptabilité › Amortissements › Comptabiliser dotations 681*). Le calcul est au prorata du mois de mise en service.

**E. TVA et impôts**
- [ ] Déclarations de TVA de l'année passées (*Comptabilité › États › TVA*).
- [ ] Impôt sur les sociétés : comptabilisé au compte 89 (sinon l'ERP l'estime à 25 %, sans l'écrire).

**F. Contrôles de cohérence**
- [ ] **Balance équilibrée** (Comptabilité › Balance) ; sinon *Diagnostiquer l'écart*.
- [ ] **Aucun compte hors plan** (alerte Balance).
- [ ] **Bilan équilibré** (Comptabilité › États › Bilan : « ✔ Bilan équilibré »).
- [ ] Compte de résultat revu rubrique par rubrique, soldes intermédiaires cohérents.

**G. Visa**
- [ ] **Toutes les pièces de l'exercice visées** (*Comptabilité › Visa*, par année, puis par journal). Une pièce au brouillard **bloque** la clôture.
- [ ] Anomalies du visa traitées (compte absent, regroupement, déséquilibre, visa du Gérant manquant).

**H. Validation et clôture (administrateur)**
- [ ] Bilan, compte de résultat, balance et FEC de l'année validés par Koné.
- [ ] **Clôturer** (*Comptabilité › Clôture › Clôture & FEC*, année, division « toutes divisions »). Double confirmation.
- [ ] Message de réussite : résultat, comptes soldés, nombre d'à-nouveaux.

**I. Après la clôture**
- [ ] Le **Bilan de l'année suivante** s'ouvre sur les à-nouveaux (Actif = Passif, aucun doublon).
- [ ] Soldes par tiers repris (postes ouverts : chaque souscripteur retrouve son solde).
- [ ] **FEC de l'année exporté** et archivé (*Clôture & FEC › Exporter le FEC*) ; toutes les pièces portent une date de validation.
- [ ] Sauvegarde de la base après clôture.

Signatures : préparé par ______________   validé par ______________   date ____ / ____ / ______

---

## 3. Fiche par année (chiffres au 25/10/2026)

| Année | Pièces | Au brouillard | Produits | Charges | À vérifier en priorité |
|---|---|---|---|---|---|
| 2020 | 115 | 115 | 11 000 000 | 4 631 500 | Première année : y a-t-il une activité antérieure ? Si oui, un bilan d'ouverture 2020 est nécessaire |
| 2021 | 119 | 119 | 0 | 11 819 702 | Aucun produit : ventes non reconnues ? |
| 2022 | 169 | 169 | 0 | 6 192 952 | Idem |
| 2023 | 354 | 354 | 0 | 16 282 000 | Idem ; année la plus chargée de l'historique |
| 2024 | 201 | 201 | 0 | 9 310 250 | Idem |
| 2025 | 226 | 226 | 22 500 000 | 8 670 350 | **Conflit avec `BO-2026`** (voir décision, point 0). Résultat provisoire : bénéfice 13,8 M |
| 2026 | 1 822 | 1 769 (53 visées) | 23 686 867 | 66 909 348 | Perte provisoire de 43,2 M ; comptes hors plan 2812 et 890 ; 154 versements sans écriture ; 2 caisses ouvertes ; dotations 2026 à passer. **Clôture après le 31/12/2026** |

Aucune pièce déséquilibrée n'a été relevée sur aucune année. Aucun exercice n'est clôturé à ce jour.

**Option A** : on ne clôture pas 2020-2025 ; on prépare 2026 (sections 1 et 2), clôture début 2027.
**Option B** : sections 1 puis 2 pour 2020, 2021, 2022, 2023, 2024, 2025 (suppression de `BO-2026` juste avant la clôture de 2025), puis 2026.

---

## 4. Si l'ERP refuse ou affiche un écart

| Message | Cause | Action |
|---|---|---|
| « Clôture impossible : … pièce(s) au brouillard » | Pièces non visées | Comptabilité › Visa, puis relancer |
| « … écriture(s) déséquilibrée(s) » | Pièce importée ou saisie fausse | Balance › Diagnostiquer l'écart ; corriger par contre-passation |
| « Un bilan d'ouverture BO-… existe déjà » | Ouverture déjà saisie pour l'année suivante | Voir décision du point 0 |
| « L'exercice … est déjà clôturé » | Seconde clôture | Rien à faire |
| « Pièces de caisse sans visa du Gérant » | Circuit de visas | Caisse › Visas Gérant |
| « Réouverture refusée » | L'exercice suivant est clos | Rouvrir d'abord le plus récent |
| Bilan en écart | Écriture déséquilibrée ou compte de liaison 890 | Balance › Diagnostiquer ; ligne « Écart de reprise 890 » au Bilan |
| Pièce visée à corriger | Intangible | Contre-passer, puis ressaisir |

**Réouverture** (exceptionnelle, administrateur) : du plus récent au plus ancien ; supprime la pièce de clôture et les à-nouveaux ; clôturer de nouveau aussitôt après correction.
