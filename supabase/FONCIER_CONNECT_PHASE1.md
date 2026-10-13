# Foncier Connect — phase 1 (dossiers fonciers) — état au 13/10/2026

Cahier des charges : « ImmoSuite Foncier Connect » v1.0 du 13/10/2026. Cette phase réalise le noyau côté application ; la base de données vient après.

## Ce qui est livré (branche de travail, non publié sur `main`)
- Onglet **Foncier › Sécurisation du titre › Dossiers fonciers** : indicateurs, ouverture d'un dossier à partir d'une parcelle, liste, détail par étape, historique.
- Stores locaux `dossiers_fonciers` et `evenements_fonciers` (DB locale v155, migration additive). Déclarés dans `SANIX_STORES_LOCAL_UNIQUEMENT` : **aucune synchronisation cloud, aucune table Supabase** à ce stade (aucun appel à `syncToSupabase`, vérifié par test).
- Rattachement aux droits existants : `STORE_MODULE` = « Foncier », comme `parcelles`.
- Workflow de référence en 28 étapes (phases A à E), filtré selon la procédure (ACD, régularisation, dossier avec ACD, titre foncier, mutation, morcellement, fusion, autre) : 28 étapes pour un ACD, 24 pour un morcellement.

## Règles métier appliquées (cahier §20)
| Règle | Implémentation |
|---|---|
| RM-01 | Référence `DF-AAAA-NNN` unique ; second dossier ouvert de même procédure sur la même parcelle : refus, sauf confirmation |
| RM-02 | Chaque changement de statut produit un événement (ancien, nouveau, motif, acteur, date) |
| RM-03 | Une étape à justificatif ne se termine pas sans justificatif ; dérogation possible avec motif, journalisée à part |
| RM-04 | Un dossier exige un responsable ; un statut actif exige un responsable d'étape ou de dossier |
| RM-07 | « Terminé » n'est jamais une décision : l'issue (favorable/défavorable) est distincte et exige un document officiel reçu et contrôlé |
| RM-08 | Chaque justificatif porte une source obligatoire (promoteur, prestataire, administration déclarée, document officiel contrôlé) |
| RM-09 | Une étape terminée n'est plus modifiable directement ; correction par fonction dédiée, motif obligatoire, ancienne valeur conservée |
| RM-11 | Dépassement d'échéance : « retard interne » et « délai administratif dépassé » sont distingués ; ni l'un ni l'autre n'est un rejet |
| RM-13 | La clôture est refusée tant que des étapes restent ouvertes ; dérogation motivée possible |
| §14 | Journal en ajout seul : aucune fonction de modification ou de suppression d'événement |

## Non réalisé à ce stade
Portail souscripteur, portail des intervenants, notifications, gestion documentaire (fichiers), cartographie liée, tableaux de bord avancés, intégrations. Le champ `visibilite` de chaque étape est déjà enregistré en vue du portail souscripteur.

## Phase base de données (après la fermeture de l'accès anonyme)
Conserver la convention du dépôt : tables `pi_dossiers_fonciers` et `pi_evenements_fonciers` au format `id / data jsonb / updated_at / scope_id`, **sans `organization_id`** (une base par client), **créées sans aucun accès `anon`** et avec les règles personnel / souscripteur / intervenant écrites avec la table. Journal : politique d'insertion seule, ni UPDATE ni DELETE. Puis ajouter les deux stores à `SUPA_STORE_MAP` et les retirer de `SANIX_STORES_LOCAL_UNIQUEMENT`.

Tests : `tests-caisse/foncier-connect.test.js` (14 tests).
