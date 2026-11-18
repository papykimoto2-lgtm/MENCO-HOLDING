# Manuel de procédures — Gestion des flux de la caisse souscripteurs

**Objet** : décrire tous les flux d'argent qui entrent, sortent et circulent dans la **Caisse centrale souscripteurs** (compte 57110002, division MENKO HOLDING) : d'où ils viennent, qui les valide, où ils sont enregistrés et comment on les contrôle.
**Principe directeur** : un versement de souscripteur n'existe que s'il a un **reçu**, une **écriture comptable** et, en espèces, un **bon d'entrée en caisse** créé automatiquement. L'argent n'est réputé entré ou sorti qu'une fois le mouvement **validé** par une autre personne.

> Ce manuel complète les manuels **Caisse**, **Paiements** et **Enregistrement d'un souscripteur**. Les noms de boutons et de champs sont ceux de l'ERP.

---

## 1. Vue d'ensemble des flux

| Réf. | Flux | Sens | Point de départ | Preuve |
|---|---|---|---|---|
| FLX-01 | Versement en **espèces** d'un souscripteur | Entrée | Module Paiements | Reçu VRS-AAAA-NNNN + bon d'entrée |
| FLX-02 | Versement **hors espèces** (virement, chèque, Mobile Money) | Aucun (ne passe pas par le tiroir) | Module Paiements | Reçu + référence |
| FLX-03 | Entrée diverse (hors souscripteur) | Entrée | Caisse › Bon d'entrée | Bon + pièce |
| FLX-04 | Sortie (décaissement, achat, avance) | Sortie | Caisse › Bon de sortie | Bon + pièce + justificatifs |
| FLX-05 | Remise en banque ou à la direction | Sortie | Caisse › Remise | Bordereau ou reçu signé + preuve de réception |
| FLX-06 | Transfert ou provisionnement entre caisses | Sortie + entrée | Caisse › Transfert de fonds | Deux bons liés (compte 585) |
| FLX-07 | Correction ou suppression d'un versement | Entrée annulée ou corrigée | Module Paiements | Écriture contre-passée ou bon régularisé |
| FLX-08 | Ventilation comptable | Aucun (classement) | Caisse › Ventilation | Écriture générée |
| FLX-09 | Clôture et écart | Contrôle | Caisse › Clôturer | Comptage, écart expliqué |

**Circuit de l'espèce d'un souscripteur**

1. Paiements : le versement est enregistré, la caisse qui reçoit est choisie.
2. L'ERP crée l'écriture comptable et le **bon d'entrée** dans la session ouverte.
3. Le validateur approuve le bon : le montant entre dans le solde.
4. L'espèce est ensuite remise en banque ou à la direction (FLX-05), ou transférée à une autre caisse (FLX-06).
5. Le comptable ventile (FLX-08), la caissière clôture (FLX-09), le comptable rapproche.

---

## 2. Rôles

| Rôle | Responsabilités sur les flux |
|---|---|
| **Comptabilité / caisse** | Enregistre les versements, remet les reçus, rapproche Mobile Money et paiements en ligne |
| **Caissière** | Tient la session de la caisse : bons, remises, transferts, comptage, clôture |
| **Validateur** | Approuve ou rejette les bons ; confirme la réception d'une remise ; ne valide jamais sa propre demande |
| **Comptable** | Ventile, contrôle le brouillard et le rapprochement |
| **Administrateur / manager** | Paramètre la caisse, corrige, supprime un mouvement non figé |

---

## 3. Règles d'or

1. **Une caisse, une session ouverte, une personne.**
2. **Aucune entrée ni sortie ne compte avant validation.**
3. **On ne valide jamais sa propre demande.**
4. **Les espèces d'un souscripteur se saisissent dans Paiements, jamais en caisse** : le bon d'entrée est créé automatiquement. Les ressaisir crée un doublon.
5. **Aucune espèce ne quitte le tiroir sans bon**, avec pièce pour toute remise.
6. **Une pièce visée ou placée dans un bordereau est figée.** Seule la contre-passation corrige.
7. **Tout écart se compte, s'explique et se trace.**

---

## 4. Procédures

### FLX-01 — Encaisser un versement en espèces

**Qui** : comptabilité, caisse. **Où** : Paiements › **+ Enregistrer un versement**.

1. Choisir le souscripteur, le montant, la date, le type et le mode **Espèces**.
2. Choisir la **caisse** : obligatoire en espèces. La session de cette caisse doit être ouverte à la date du versement.
3. Enregistrer. La référence **VRS-AAAA-NNNN** est attribuée automatiquement.
4. L'ERP génère l'écriture (débit trésorerie, crédit client lots ; crédit produit pour les frais de souscription), le **bon d'entrée** et les commissions.
5. Remettre le **reçu** au souscripteur.
6. Faire valider le bon d'entrée (FLX-03/CAI-04) : tant qu'il est en attente, le solde de la caisse ne bouge pas.

**[bloquant]** Souscripteur, montant, date ou type absents ; souscripteur gelé ; compte comptable par défaut manquant ; caisse absente ; session de caisse indisponible à la date.
**[confirmation]** Frais de souscription supérieurs aux frais prévus ; versement similaire (même client, même montant, ±2 jours) ; mouvement de caisse équivalent au même nom.

### FLX-02 — Encaisser hors espèces

Virement, chèque et Mobile Money s'enregistrent dans Paiements avec leur **référence** (n° de chèque, virement ou transaction). Aucune caisse n'est requise et aucun bon d'entrée n'est créé : ces flux n'alimentent pas le tiroir. Le Mobile Money se rapproche ligne par ligne (**Encaisser**) ou en bloc (**Encaisser tous**) ; une référence déjà encaissée est refusée.

### FLX-03 — Enregistrer une entrée ou une sortie diverse

**Qui** : caissière, sur sa session ouverte. **Où** : **Bon d'entrée** ou **Bon de sortie**.

| Champ | Règle |
|---|---|
| **Montant** | Supérieur à zéro |
| **Motif** | Obligatoire |
| **Déposant** (entrée) ou **Bénéficiaire** (sortie) | Obligatoire |
| **Pièce** | N° de pièce ; obligatoire pour une remise |
| **Justificatifs** | Documents joints |

- Le numéro du bon est attribué automatiquement. Le bon est créé **en attente de validation**.
- Une **sortie supérieure au solde** demande une confirmation explicite.
- Une **entrée** qui ressemble à un versement souscripteur récent déclenche un avertissement : vérifier le doublon avec Paiements.
- Un **bon identique** saisi depuis moins de 10 minutes déclenche un avertissement.

### FLX-04 — Valider ou rejeter

**Qui** : validateur avec plafond suffisant. Valider ajoute le montant au solde (entrée) ou le retire (sortie). Rejeter exige un motif ; le bon reste tracé sans effet sur le solde. Un bon validé après la clôture de sa session recalcule le solde et l'écart de cette session.

**[bloquant]** Validation de sa propre demande ; plafond inférieur au montant.

### FLX-05 — Remettre les espèces en banque ou à la direction

1. **Saisie** (caissière) : **Remise en banque** ou **Remise à la direction**, avec la **pièce obligatoire** (n° du bordereau de versement ou du reçu signé).
2. **Validation** du bon par un validateur.
3. **Confirmation de réception** par une **autre personne** que celle qui a saisi, avec la **référence de la preuve** (reçu bancaire, accusé signé).
4. Tant que la réception n'est pas confirmée, la bannière « Remises à confirmer » reste affichée.

**[bloquant]** Pièce absente ; confirmation par l'auteur de la saisie ; preuve absente.

### FLX-06 — Transférer entre caisses

1. Choisir la caisse de destination (différente de la source), le montant, la date et le motif.
2. L'ERP crée une sortie sur la source et une entrée sur la destination, ventilées sur le compte relais **585 « Virement interne »**. Un transfert n'est jamais une charge ni un produit.
3. Les **deux bons** sont validés. On ne rejette pas un bon dont le jumeau est déjà validé.

**[bloquant]** Compte 585 non paramétré ; destination identique à la source ; session source ou destinataire clôturée ; caisse source tenue par une autre personne.

### FLX-07 — Corriger ou supprimer un versement

**Corriger** (Paiements › modifier) : l'ERP réimpacte les commissions et réécrit l'écriture. Passage en espèces : choisir la caisse pour créer le bon ; sortie des espèces : le bon est supprimé.
**Supprimer** (droit de suppression) : supprime l'écriture, le bon de caisse rattaché et les commissions non payées. Une commission déjà payée reste, à traiter manuellement. Un paiement en ligne lié est rouvert.

**[bloquant]** Bon d'une session **clôturée** (régulariser par un bon en caisse) ; écriture **visée** ou exercice **clos** (contre-passer dans Comptabilité › Journal, puis saisir le versement correct).

### FLX-08 — Ventiler

Le comptable choisit le **compte de contrepartie** de chaque mouvement « à ventiler ». L'ERP génère l'écriture. Une règle de ventilation automatique (mot-clé et compte) peut être créée pour les motifs répétitifs. Un mouvement non ventilé est absent du compte de résultat.

### FLX-09 — Clôturer et traiter les écarts

1. Compter le tiroir et saisir le **montant réellement compté** (jamais négatif).
2. Comparer au **solde théorique** : fond d'ouverture + entrées validées − sorties validées.
3. Mentionner les **mouvements en attente** de validation.
4. **Expliquer l'écart** s'il n'est pas nul.
5. Confirmer : la session est clôturée et l'état journalier part à la hiérarchie si l'envoi automatique est activé.

**Qualifier un écart avant toute écriture**

| Nature | Traitement |
|---|---|
| Mouvement manquant ou en trop (écart « rond ») | Saisir le bon manquant à sa vraie date, avec sa pièce, ou supprimer le doublon |
| Écart technique (défaut logiciel corrigé) | **Technique** : cause et référence du correctif, sans écriture |
| Écart réel | **Régulariser** : manquant en charge 658, excédent en produit 758 |

**[bloquant]** Comptage absent ou négatif ; mouvements en attente non mentionnés ; écart non expliqué ; clôture par un tiers ou après 24 h sans motif ; session déjà clôturée sur le cloud.

---

## 5. Contrôle des flux

| Contrôle | Fréquence | Responsable |
|---|---|---|
| Aucun bon en attente de validation | Quotidien | Validateur |
| Aucune remise à confirmer | Quotidien | Validateur |
| Aucun versement espèces sans bon d'entrée, ni bon sans versement | Quotidien | Comptabilité |
| Session de plus de 24 h clôturée | Quotidien | Caissière |
| **Rapprochement** : fond initial + entrées validées − sorties validées = solde attendu, comparé au dernier comptage ; ruptures de chaîne expliquées | Mensuel au minimum | Comptable |
| Mouvements à ventiler soldés | Mensuel | Comptable |
| État mensuel transmis | Mensuel | Caissière |

---

## 6. Traçabilité

| Événement | Conservé dans |
|---|---|
| Versement : référence, auteur, mode, caisse | Versement et écriture comptable |
| Bon : numéro, auteur, validateur, motif de rejet | Mouvement de caisse |
| Remise : preuve et confirmateur | Mouvement de caisse |
| Transfert : deux bons liés | Mouvements des deux caisses, compte 585 |
| Clôture : comptage, écart, explication | Session de caisse |
| Écart régularisé ou technique | Session de caisse et écriture d'écart |

---

## 7. Erreurs fréquentes

| Symptôme | Cause probable | Action |
|---|---|---|
| Le solde ne bouge pas après un versement espèces | Bon d'entrée en attente | Faire valider le bon |
| Doublon d'un versement en caisse | Espèces ressaisies en caisse | Supprimer le bon en double (administrateur) |
| Versement en espèces refusé | Caisse non choisie ou session fermée | Ouvrir la session, choisir la caisse |
| Écart « rond » à la clôture | Remise ou avance sans bon | Saisir le bon manquant avec sa pièce |
| Transfert impossible | Compte 585 non paramétré ou session clôturée | Paramétrer, ouvrir les deux caisses |
| Versement non modifiable | Session clôturée, écriture visée ou exercice clos | Régulariser par un bon ou contre-passer |

---

## 8. Suivi des révisions

| Version | Date | Auteur | Objet |
|---|---|---|---|
| 1.0 | Novembre 2026 | | Création |
