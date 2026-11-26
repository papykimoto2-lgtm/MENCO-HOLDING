# Note de calcul — Module Foncier

> Généré depuis le registre de l'ERP (`FON_NOTES`). Ne pas modifier à la main : relancer `node tools/gen_note_calcul_foncier.js`.

## Chaîne logistique foncière (9 étapes)

| N° | Étape | But |
|---|---|---|
| 1 | Identifier la terre | Savoir exactement ce que l'on achète : parcelle, superficie, contour, village, ayants droit. |
| 2 | Auditer avant d'engager | 19 points Go / No-Go. Aucun protocole définitif, aucun acompte au-delà des frais de levé sans décision GO. |
| 3 | Purger les droits coutumiers | Protocole signé avec la chefferie et la famille, annexes jointes, ADU, réitération chez le notaire. |
| 4 | Enquête, bornage, oppositions | Constater les limites contradictoirement et purger toute opposition avant de certifier. |
| 5 | Sécuriser le titre | Certificat foncier (rural) puis titre foncier ; ACD et TF mère (urbain). |
| 6 | Lotir et préparer les lots | Programme de lotissement, plan, lots, lots villageois et réserves. |
| 7 | Commercialiser et encaisser | Souscripteurs, versements, cessions, recouvrement des retards. |
| 8 | Titres individuels et mutations | Un dossier de titre par lot soldé ; chaîne de propriété à jour. |
| 9 | Remettre et clôturer | Procès-verbal de remise du lot, procès-verbal de remise de l'ACD, clôture du dossier. |

## Parcelles  `tab:parcelles`

**À quoi ça sert.** Registre des terres : acquises, en négociation, en portefeuille. Point de départ de toute la chaîne foncière.

**Comment faire**

1. Créer la parcelle : référence, localisation, superficie, prix et frais.
2. Saisir les bornes UTM (au moins 3) : le contour est contrôlé contre les parcelles voisines.
3. Choisir le traitement comptable (immobilisation, stock ou aucun).
4. Ouvrir la fiche 360° pour voir toute la vie de la terre.

**Calculs**

| Calcul | Formule |
|---|---|
| Coût d'acquisition | prix d'acquisition + frais de mutation + frais de bornage + frais notariaux |
| Coût à l'hectare | coût d'acquisition ÷ (superficie m² ÷ 10 000) |
| Superficie en hectares | m² ÷ 10 000 (1 ha = 10 000 m²) |

**Règles appliquées**

- Contour : tolérance de chevauchement 0,5 m ; recouvrement refusé (dérogation administrateur motivée possible).
- Un contour de moins de 3 bornes n'est pas contrôlé.
- Régime rural ou urbain déduit du statut du titre et de la localisation.

**Reçoit de** : Import Excel (opération → parcelle mère) ; Négociation (Acquisition & Aménagement Foncier)

**Alimente** : Comptabilité (immobilisation 22x / stock) ; Cartographie ; Audit, enquêtes, protocoles ; Programmes et lots

## Situation des titres  `tab:titres`

**À quoi ça sert.** Quel titre détient chaque parcelle aujourd'hui : lettre d'attribution, ACP, ACD, titre foncier.

**Comment faire**

1. Repérer les parcelles sans titre ou avec titre provisoire.
2. Ouvrir un dossier foncier pour avancer vers le titre définitif.

**Calculs**

| Calcul | Formule |
|---|---|
| Taux de titrage | parcelles avec titre foncier définitif ÷ parcelles actives × 100 |

**Règles appliquées**

- Un titre foncier définitif clôt l'étape « Sécuriser le titre » du parcours.

**Reçoit de** : Parcelles

**Alimente** : Dossiers fonciers ; Jalons du titre ; Cessions (titre exigé)

## Dossiers fonciers  `tab:dossiers`

**À quoi ça sert.** Un dossier par procédure de titre : étapes, responsables, justificatifs, délais, historique.

**Comment faire**

1. Ouvrir le dossier depuis un modèle (délais et responsables préremplis).
2. Faire avancer chaque étape avec ses justificatifs.
3. Suivre les frais et les débours refacturés.

**Calculs**

| Calcul | Formule |
|---|---|
| Retard d'une étape | aujourd'hui − échéance prévue (jours, si étape non terminée) |
| Avancement du dossier | étapes terminées ÷ étapes totales × 100 |

**Règles appliquées**

- Dossier individuel de titre : un par lot soldé.
- Les frais alimentent la comptabilité en brouillard.

**Reçoit de** : Modèles de dossier ; Lots soldés

**Alimente** : Souscripteurs (information) ; Comptabilité ; PV de remise d'ACD

## Modèles de dossier  `tab:modeles`

**À quoi ça sert.** Définir une fois les étapes, délais et responsables par défaut de chaque type de dossier.

**Comment faire**

1. Choisir le type de procédure.
2. Ordonner les étapes et fixer les délais.

**Calculs**

| Calcul | Formule |
|---|---|
| Échéance d'une étape | date d'ouverture + somme des délais des étapes précédentes |

**Règles appliquées**

- Modifier un modèle n'altère pas les dossiers déjà ouverts.

**Reçoit de** : —

**Alimente** : Dossiers fonciers

## Intervenants et missions  `tab:intervenants`

**À quoi ça sert.** Répertoire : notaire, géomètre, conservateur, avocat, et missions confiées avec honoraires.

**Comment faire**

1. Créer l'intervenant.
2. Lui confier une mission rattachée à un dossier.

**Calculs**

| Calcul | Formule |
|---|---|
| Honoraires restant dus | honoraires convenus − règlements effectués |

**Règles appliquées**

- Les honoraires versés passent par la caisse ou la banque, jamais en espèces hors plafond.

**Reçoit de** : Dossiers fonciers

**Alimente** : Caisse / Trésorerie ; Comptabilité

## Jalons du titre  `tab:workflow`

**À quoi ça sert.** Vue synthétique par parcelle : attribution → ACP → ACD → TF → mutation.

**Comment faire**

1. Repérer la parcelle bloquée.
2. Ouvrir son dossier.

**Calculs**

| Calcul | Formule |
|---|---|
| Position du jalon | dernier jalon atteint ÷ nombre de jalons du parcours |

**Règles appliquées**

- Un jalon ne se coche qu'avec sa pièce.

**Reçoit de** : Dossiers fonciers

**Alimente** : Parcours foncier

## Information des souscripteurs  `tab:souscripteurs`

**À quoi ça sert.** Ce que le souscripteur voit de l'avancement de son titre.

**Comment faire**

1. Publier un point d'avancement.
2. Répondre aux demandes reçues.

**Règles appliquées**

- Seules les informations validées sont publiées au portail.

**Reçoit de** : Dossiers fonciers

**Alimente** : Portail souscripteur ; Notifications

## Partenaires financiers  `tab:financiers`

**À quoi ça sert.** Co-investisseurs sur les opérations foncières.

**Comment faire**

1. Créer le partenaire.
2. Lier sa participation à un programme.

**Calculs**

| Calcul | Formule |
|---|---|
| Quote-part | apport du partenaire ÷ apport total × 100 |

**Règles appliquées**

- La somme des quotes-parts d'une opération ne dépasse pas 100 %.

**Reçoit de** : Programmes

**Alimente** : Comptabilité

## Candidatures de financement  `tab:candidatures-fin`

**À quoi ça sert.** Demandes reçues de partenaires souhaitant co-financer.

**Comment faire**

1. Examiner la candidature.
2. Accepter ou refuser avec motif.

**Règles appliquées**

- Décision tracée dans le journal.

**Reçoit de** : Portail

**Alimente** : Financiers

## Fiscalité immobilière  `tab:fisc`

**À quoi ça sert.** Taxes applicables à une mutation ou une cession.

**Comment faire**

1. Saisir la valeur.
2. Lire les droits et taxes calculés.

**Calculs**

| Calcul | Formule |
|---|---|
| Droits d'enregistrement | valeur × 4 % |
| Droits de conservation foncière | valeur × 0,4 % |

**Règles appliquées**

- Taux modifiables dans les paramètres selon la loi de finances en vigueur.

**Reçoit de** : Parcelles ; Cessions

**Alimente** : Frais de mutation

## Mutations  `tab:mutations`

**À quoi ça sert.** Changements de propriétaire et morcellements.

**Comment faire**

1. Choisir la parcelle.
2. Saisir le nouvel acquéreur et la date.

**Calculs**

| Calcul | Formule |
|---|---|
| Parcelles filles | superficie mère = somme des superficies des filles |

**Règles appliquées**

- Transfert : l'ancien propriétaire est clos à la date de l'acte, le nouveau ouvert le même jour.

**Reçoit de** : Cessions ; Propriétaires

**Alimente** : Parcelles ; Fiscalité

## Cessions  `tab:cessions`

**À quoi ça sert.** Ventes de parcelles : prix, échéancier, encaissements, comptabilisation.

**Comment faire**

1. Créer la cession depuis la parcelle.
2. Saisir l'échéancier.
3. Enregistrer chaque encaissement.

**Calculs**

| Calcul | Formule |
|---|---|
| Marge de cession | prix de cession − coût de revient de la parcelle |
| Sortie comptable | valeur nette comptable × superficie cédée ÷ superficie totale |
| Reste à encaisser | prix de cession − montant encaissé |

**Règles appliquées**

- Charge bloquante active (hypothèque, saisie) : cession refusée sauf dérogation administrateur motivée.
- Écritures : D tiers / C produit de cession ; sortie VNC en 81x.

**Reçoit de** : Parcelles ; Charges

**Alimente** : Comptabilité ; Recouvrement ; Mutations

## Recouvrement  `tab:recouvrement`

**À quoi ça sert.** Relancer les versements de cession impayés.

**Comment faire**

1. Lire les niveaux de relance proposés.
2. Envoyer la relance.

**Calculs**

| Calcul | Formule |
|---|---|
| Niveau de relance | retard < 2 mois : 0 · 2 mois : 1 · 3 mois : 2 · ≥ 6 mois : 3 |

**Règles appliquées**

- Chaque relance est journalisée.

**Reçoit de** : Cessions

**Alimente** : Notifications ; Contentieux

## Pilotage foncier  `tab:pilotage`

**À quoi ça sert.** Tableaux de bord promoteur, responsable, intervenants et direction.

**Comment faire**

1. Choisir le profil.
2. Cliquer un indicateur pour ouvrir la liste correspondante.

**Calculs**

| Calcul | Formule |
|---|---|
| Score de risque | note de 0 à 100 ; élevé ≥ 45, critique ≥ 70 |

**Règles appliquées**

- Les indicateurs lisent les mêmes données que les écrans : aucune saisie ici.

**Reçoit de** : Tous les onglets

**Alimente** : Ma journée

## Ma journée  `tab:journee`

**À quoi ça sert.** Ce qui demande une action aujourd'hui, avec l'action en un clic.

**Comment faire**

1. Traiter de haut en bas.

**Règles appliquées**

- Classement par urgence : retards, échéances, relances.

**Reçoit de** : Dossiers ; Enquêtes ; Contrats

**Alimente** : —

## Notifications  `tab:notifications`

**À quoi ça sert.** Alertes et échéances.

**Comment faire**

1. Ouvrir l'alerte pour aller au dossier.

**Règles appliquées**

- —

**Reçoit de** : Pilotage ; Recouvrement

**Alimente** : —

## Recherche  `tab:recherche`

**À quoi ça sert.** Retrouver un dossier, un souscripteur, un intervenant, un document.

**Comment faire**

1. Saisir quelques lettres.

**Règles appliquées**

- —

**Reçoit de** : —

**Alimente** : —

## Kanban  `tab:kanban`

**À quoi ça sert.** Étape courante de chaque dossier.

**Comment faire**

1. Glisser la carte pour changer d'étape.

**Règles appliquées**

- Changer d'étape exige les justificatifs.

**Reçoit de** : Dossiers

**Alimente** : —

## Calendrier  `tab:calendrier`

**À quoi ça sert.** Échéances du mois, export vers l'agenda.

**Comment faire**

1. Naviguer par mois.

**Règles appliquées**

- —

**Reçoit de** : Dossiers ; Enquêtes

**Alimente** : —

## Documents  `tab:documents`

**À quoi ça sert.** Classement, versions et expiration des pièces.

**Comment faire**

1. Déposer la pièce.
2. Surveiller les expirations.

**Calculs**

| Calcul | Formule |
|---|---|
| Jours avant expiration | date d'expiration − aujourd'hui |

**Règles appliquées**

- Pièce expirée : alerte.

**Reçoit de** : —

**Alimente** : Dossiers

## Pilotage et alertes rurales  `rural:pilotage`

**À quoi ça sert.** Tout ce qui est en retard ou bloqué sur les terres rurales.

**Comment faire**

1. Traiter les alertes rouges en premier.

**Calculs**

| Calcul | Formule |
|---|---|
| Délai d'enquête restant | date de fin prévue − aujourd'hui |

**Règles appliquées**

- Opposition ouverte, charge bloquante, redevance impayée, mandat de comité échu : alertes.

**Reçoit de** : Enquêtes ; Oppositions ; Charges ; Contrats

**Alimente** : Ma journée

## Terrain (téléphone)  `rural:terrain`

**À quoi ça sert.** Collecter sur site : point GPS, photo, signature.

**Comment faire**

1. Prendre le point GPS.
2. Photographier.
3. Rattacher à la parcelle ou au bornage.

**Calculs**

| Calcul | Formule |
|---|---|
| Conversion GPS → UTM | WGS84 (lat, lon) projeté en UTM fuseau local |

**Règles appliquées**

- Précision du GPS affichée ; au-delà de 10 m, le point est signalé.

**Reçoit de** : —

**Alimente** : Parcelles (bornes) ; Bornages

## Audit pré-acquisition  `rural:audits`

**À quoi ça sert.** 19 points juridiques et techniques avant d'engager le moindre franc.

**Comment faire**

1. Ouvrir l'audit de la terre.
2. Renseigner chaque point : conforme, non conforme, en régularisation.
3. Décider GO / NO-GO.

**Calculs**

| Calcul | Formule |
|---|---|
| Verdict | un bloquant non conforme → NO-GO ; un bloquant ouvert → en cours ; un point majeur à régulariser → GO avec réserves ; sinon GO |
| Conformité | points conformes ÷ 19 |

**Règles appliquées**

- 13 points bloquants sur 19.
- Sans GO : pas de protocole signé, pas de sortie de négociation.
- Dérogation : administrateur, motif écrit.

**Reçoit de** : Parcelles ; Ayants droit

**Alimente** : Protocoles de purge ; Acquisition & Aménagement Foncier

## Enquêtes officielles  `rural:enquetes`

**À quoi ça sert.** Période de publicité légale avant bornage et certification.

**Comment faire**

1. Planifier.
2. Ouvrir : la date de fin se calcule.
3. Clôturer à l'échéance.

**Calculs**

| Calcul | Formule |
|---|---|
| Date de fin prévue | date d'ouverture + durée en jours |

**Règles appliquées**

- Clôture avant échéance : motif de dérogation obligatoire.
- Bornage réalisé, PV et riverain présent exigés pour clôturer.

**Reçoit de** : Bornages

**Alimente** : Dossiers fonciers ; Parcours (étape 4)

## Oppositions  `rural:oppositions`

**À quoi ça sert.** Consigner et purger les contestations.

**Comment faire**

1. Saisir motif et opposant.
2. Médiation puis issue.

**Règles appliquées**

- Opposition ouverte ou en médiation : réunion de validation et certificat foncier suspendus.
- Levée, rejet ou jugement : issue obligatoire.

**Reçoit de** : Enquêtes

**Alimente** : Parcours (blocage étape 4)

## Bornages contradictoires  `rural:bornages`

**À quoi ça sert.** Fixer les limites en présence des riverains.

**Comment faire**

1. Convoquer les riverains.
2. Marquer les présents.
3. Joindre le procès-verbal.

**Règles appliquées**

- Réalisé : PV et au moins un riverain présent.

**Reçoit de** : Parcelles

**Alimente** : Enquêtes

## Villages et comités  `rural:villages`

**À quoi ça sert.** Chefferie et comité villageois de gestion foncière (CVGF).

**Comment faire**

1. Créer le village.
2. Saisir le comité, son mandat et ses PV.

**Calculs**

| Calcul | Formule |
|---|---|
| Mandat restant | fin de mandat − aujourd'hui |

**Règles appliquées**

- Mandat échu : alerte.

**Reçoit de** : —

**Alimente** : Protocoles de purge ; Ayants droit

## Ayants droit  `rural:ayants_droit`

**À quoi ça sert.** Titulaires de droits coutumiers sur la terre.

**Comment faire**

1. Créer l'ayant droit.
2. Indiquer sa part par parcelle.

**Calculs**

| Calcul | Formule |
|---|---|
| Part des ayants droit | somme des parts par parcelle ≤ 100 % |

**Règles appliquées**

- Terre rurale sans ayant droit : parcours bloqué à l'étape 1.

**Reçoit de** : Villages

**Alimente** : Protocoles de purge

## Titres  `rural:titres`

**À quoi ça sert.** Certificats fonciers, titres fonciers, ACD par parcelle.

**Comment faire**

1. Saisir type, numéro, date.

**Règles appliquées**

- Numéro unique par type.

**Reçoit de** : Dossiers

**Alimente** : Parcelles ; Parcours (étape 5)

## Propriétaires  `rural:proprietaires`

**À quoi ça sert.** Chaîne de propriété datée.

**Comment faire**

1. Ajouter le propriétaire avec sa date de début.
2. Clôturer l'ancien en cas de transfert.

**Calculs**

| Calcul | Formule |
|---|---|
| Quotes-parts actuelles | somme des quotes-parts des propriétaires sans date de fin ≤ 100 % |

**Règles appliquées**

- Dépassement de 100 % refusé par la base de données.

**Reçoit de** : Mutations

**Alimente** : Cessions

## Charges et servitudes  `rural:charges`

**À quoi ça sert.** Hypothèques, saisies, servitudes, emprises de voirie.

**Comment faire**

1. Saisir la charge.
2. Lever avec référence de mainlevée.

**Règles appliquées**

- Hypothèque et saisie : référence obligatoire.
- Charge bloquante active : cession interdite.

**Reçoit de** : —

**Alimente** : Cessions ; Parcours

## Exploitations  `rural:exploitations`

**À quoi ça sert.** Cultures et exploitants sur la terre.

**Comment faire**

1. Saisir l'exploitant, la culture, la surface.

**Calculs**

| Calcul | Formule |
|---|---|
| Surface exploitée | somme des exploitations en cours (ha) ≤ superficie de la parcelle |

**Règles appliquées**

- Dépassement refusé.

**Reçoit de** : Parcelles

**Alimente** : Contrats

## Contrats  `rural:contrats`

**À quoi ça sert.** Baux, métayages, promesses, concessions.

**Comment faire**

1. Saisir type, redevance, périodicité.
2. Suivre les échéances.

**Calculs**

| Calcul | Formule |
|---|---|
| Échéancier | redevance par période de la date de début à la date de fin |
| Impayés | échéances non payées dont la date est passée |

**Règles appliquées**

- Redevance périodique : date de fin obligatoire.
- Résiliation : motif obligatoire.

**Reçoit de** : Exploitations

**Alimente** : Pilotage et alertes

## Import Excel  `rural:import`

**À quoi ça sert.** Charger le modèle MENKO : opérations, lots, suivi.

**Comment faire**

1. Choisir le fichier.
2. Lire l'analyse (aucune écriture).
3. Appliquer.

**Règles appliquées**

- Analyse d'abord, écriture ensuite ; doublons ignorés.

**Reçoit de** : Fichier .xlsx

**Alimente** : Programmes ; Lots ; Parcelles

## Protocoles de purge  `rural:protocoles`

**À quoi ça sert.** Accord avec la chefferie et la famille pour purger les droits coutumiers.

**Comment faire**

1. Rédiger depuis un audit GO.
2. Joindre les 5 annexes.
3. Signer, puis réitérer chez le notaire.

**Calculs**

| Calcul | Formule |
|---|---|
| Tranche i | montant × % de la tranche (la dernière prend le reste) |
| Part villageoise | quote-part en lots ou numéraire, 0 à 100 % |

**Règles appliquées**

- Tranches = 100 %.
- Signé : date et 5 annexes.
- Réitéré : acte notarié.
- Signé : non modifiable, sauf réitération.

**Reçoit de** : Audit ; Villages

**Alimente** : Programmes ; Acquisition

## PV de remise de lot  `rural:pv_lot`

**À quoi ça sert.** Remise physique du lot au souscripteur.

**Comment faire**

1. Choisir le lot soldé.
2. Signer.

**Règles appliquées**

- Solde acquitté exigé.
- Signé : non modifiable.

**Reçoit de** : Souscripteurs

**Alimente** : Parcours (étape 9)

## PV de remise d'ACD  `rural:pv_acd`

**À quoi ça sert.** Remise de l'arrêté de concession définitive.

**Comment faire**

1. Cocher les pièces remises avec référence.
2. Signer.

**Règles appliquées**

- Au moins une pièce remise avec référence.

**Reçoit de** : Dossiers individuels

**Alimente** : Clôture du dossier

## Parcours foncier  `page:parcours`

**À quoi ça sert.** Suivre chaque terre de l'identification à la remise des titres.

**Comment faire**

1. Lire le compteur de chaque étape.
2. Ouvrir « À faire maintenant ».

**Calculs**

| Calcul | Formule |
|---|---|
| Avancement | étapes faites ÷ étapes applicables × 100 |

**Règles appliquées**

- Étape « Bloquée » : cause affichée.
- Une étape non applicable est exclue du calcul.

**Reçoit de** : Tous les onglets

**Alimente** : Fiche 360°

## Carte des interconnexions

| De | Vers | Ce qui circule |
|---|---|---|
| Parcelles | Comptabilité | Coût d'acquisition → écriture d'immobilisation (22x) ou de stock ; sortie à la cession au prorata de la superficie |
| Parcelles | Cartographie (SIG) | Contour des bornes UTM → carte colorée par régime ; contrôle de chevauchement (client + serveur PostGIS) |
| Villages & comités | Protocoles de purge | Chef, président du CVGF : préremplis dans le protocole |
| Ayants droit | Parcours foncier | Terre rurale sans ayant droit : étape 1 incomplète |
| Audit pré-acquisition | Acquisition & Aménagement Foncier | Sortie de l'étape « Négociation » d'une opération = audit GO obligatoire |
| Audit pré-acquisition | Protocoles de purge | Signature du protocole = audit GO (ou dérogation administrateur motivée) |
| Protocoles de purge | Acquisition & Aménagement Foncier | Signature → statut de négociation de l'opération et statut de purge de la parcelle |
| Protocoles de purge | Programmes | Part villageoise (%) = clé de répartition numéraire / lots du programme |
| Enquêtes | Dossiers fonciers | Ouvrir / clôturer l'enquête conditionne les étapes de la procédure rurale (délai, bornage) |
| Oppositions | Dossiers fonciers | Opposition active = réunion de validation et certificat foncier suspendus |
| Bornages | Enquêtes | Bornage réalisé + PV + riverain présent = condition de clôture de l'enquête |
| Titres | Parcelles | Statut de la parcelle et jalons du titre |
| Dossiers fonciers | Souscripteurs / Portail | Avancement publié au souscripteur ; titre individuel ouvert au solde |
| Dossiers fonciers | Comptabilité | Frais du titre → écritures en brouillard ; notes de débours refacturées |
| Import Excel | Programmes, Lots, Parcelles | Opération → programme + parcelle mère + titre mère ; lot → lot ; suivi → fiche de suivi du titre |
| Programmes / Lots | Souscripteurs | Un lot vendu vient des versements du souscripteur (jamais saisi à la main) |
| Souscripteurs | Caisse / Trésorerie | Versements → encaissements, relances, attestation de solde |
| Cessions | Comptabilité | Vente (D tiers / C produit), sortie VNC ou stock, encaissement ; contre-passation à la résiliation |
| Charges (hypothèque, saisie) | Cessions | Charge active = cession bloquée (dérogation administrateur motivée) |
| Propriétaires | Mutations | Chaîne de propriété datée ; transfert = clôture de l'ancien, ouverture du nouveau |
| Exploitations | Parcelles | Surface exploitée cumulée ≤ superficie de la parcelle |
| Contrats | Pilotage & alertes | Redevances impayées et contrats échus → pilotage et badge de l'onglet |
| PV de remise de lot | Souscripteurs | Solde acquitté exigé ; attestation de solde reprise |
| PV de remise d'ACD | Dossiers fonciers | Remise signée → décharge du dossier de titre individuel |
| Pilotage & alertes | Ma journée / Notifications | Échéances d'enquête, mandats, impayés, charges → à traiter |
| Terrain (téléphone) | Parcelles / Cartographie | Point GPS → borne UTM ; photos et signatures rattachées à la parcelle ou au bornage |
