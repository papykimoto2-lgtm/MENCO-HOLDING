# Foncier — Référentiel des personnes et familles (lots L16 et L17)

Une personne, une famille, une chefferie, une société ou l'État = **une seule fiche**, réutilisée partout.
Écran : Foncier 2.6 › **Personnes (référentiel)**. Table cloud : `pi_personnes_fonciers` (`supabase/foncier_personnes_l17.sql`).

## 1. Modèle

| Élément | Détail |
|---|---|
| Fiche | `personnes_fonciers` : nom, nature (personne, famille, chefferie, société, État, collectivité), village, contact, CNI / passeport / RCCM, observations, `historique`, `historique_modifs`, `fusionnee_dans` |
| Lien | `liens_personnes[champ] = personne_id`, posé sur la saisie d'origine. Les anciens champs texte restent affichés : rien n'est réécrit par le rapprochement |
| Exclusion | `liens_exclus[champ] = [personne_id]` : mémorise « pas cette personne » après un *Délier* |
| Saisies reliées | opérations d'acquisition (propriétaires), Foncier › Propriétaires, Ayants droit, protocoles de purge (famille, représentant, chef, président CVGF), villages (chef), parcelles (vendeur, cédant), intervenants et souscripteurs (**lecture seule**) |

## 2. Usage

1. **Saisie assistée** : dans tout champ « personne », la liste propose d'abord les noms connus de la parcelle (propriétaires actuels, ayants droit, opération liée), puis le référentiel. Nom connu → lien automatique. Nom nouveau → fiche créée puis liée. Un doublon manuel est refusé.
2. **Rapprochement des doublons** (écran Personnes) : regroupe les saisies de même nom (casse, accents, ordre, civilités ignorés). *Tout créer et lier* traite les groupes sûrs ; les autres restent à la main.
3. **Aperçu CSV** : une ligne par groupe, à relire avant toute validation. Aucune écriture.
4. **Fusionner** deux fiches : les saisies reliées passent à la fiche de destination ; la fiche source est conservée (`fusionnee_dans`).
5. **Liens / Délier** : liste des saisies reliées à une fiche ; *Délier* retire le lien et l'exclut du rapprochement.
6. **Fiche** : identité, parcelles concernées, saisies reliées, état du portail, **historique**, impression.
7. **Correction répercutée** : modifier nom, contact, CNI, village ou nature propose de répercuter sur les saisies reliées, après confirmation.
8. **Opération → chaîne de propriété** : bouton « Créer la chaîne de propriété » sur l'opération (quotes-parts à parts égales, modifiables, plafond 100 %).

## 3. Règles de sécurité et de réversibilité

- **Documents signés ou réitérés** (protocoles, PV) : jamais modifiés par une répercussion.
- **Droits** : écrire dans Acquisition, Parcelles ou Souscripteurs exige le droit « modifier » sur ce module. Sans droit, le lien n'est pas posé et rien de partiel ne reste.
- **Suppression** d'une fiche : administrateur, motif de 10 caractères, **refusée** tant que des saisies lui sont reliées ou qu'une fiche y est fusionnée.
- **Souscripteurs et intervenants** : reliés sans jamais modifier leur nom ; jamais créés en masse par défaut (bouton distinct).
- **Traçabilité** : chaque création, rapprochement, fusion, délier, répercussion et génération de code est écrit sur l'historique de la fiche et au journal d'actions.
- **Réversibilité** : *Délier* annule un lien ; une fusion se corrige en recréant la fiche et en déliant les saisies concernées. Retour arrière base : `drop table public.pi_personnes_fonciers;` (les liens restent inertes dans les saisies).

## 4. Migration des saisies existantes, pas à pas

1. Foncier 2.6 › Personnes › **Rapprochement des doublons**.
2. **Aperçu CSV** : relire les groupes, les noms proches (⚠) et les homonymes possibles.
3. **Tout créer et lier** : traite les groupes sûrs (hors noms proches, hors homonymes, hors souscripteurs et intervenants).
4. Traiter les lignes ⚠ une par une : *Créer et lier*, ou *Fusionner* si deux fiches désignent la même personne.
5. Facultatif : *Relier aussi les souscripteurs et intervenants*.
6. Contrôle : le badge de l'onglet Personnes tombe à 0 ; l'état des incohérences n'affiche plus « personne non reliée ».

## 5. Audit L16 – L17

| Sujet | Constat | Traitement |
|---|---|---|
| Intégrité | Une fiche du référentiel pouvait être supprimée alors que des saisies lui étaient reliées | Suppression refusée tant que des liens ou des fusions existent |
| Droits | Le lien pouvait écrire dans Acquisition, Parcelles ou Souscripteurs sans le droit du module | Contrôle de droit par store ; échec sans lien partiel, message explicite |
| Performance | Rapprochement de 700 personnes : 1,5 s (comparaison en O(n²), clés recalculées) | Clés calculées une fois, distance d'édition à abandon précoce : **0,3 s** ; liste 35 ms |
| Traçabilité | Aucun historique propre aux fiches du référentiel | Journal par fiche + historique des modifications affiché |
| XSS | Tout texte injecté dans l'interface passe par `escHtml` ; les messages utilisent `textContent` | Aucun défaut |
| Injection CSV | Aperçu CSV et exports | Neutralisation `=`, `+`, `@`, `-` en tête de cellule (déjà en place) |
| Base | Table en RLS forcé, aucun accès anonyme, contraintes sur nom et nature | Conforme |
| Documents signés | Risque de modification par répercussion | Exclus par construction, comptés et signalés |

### Portail propriétaire : lot sécurité (traité)

| Constat | Traitement |
|---|---|
| Le portail externe (`portail-unique.html`) lisait **toute** la table des opérations puis filtrait dans le navigateur : propriétaires voisins, empreintes de codes, financiers, prix, budgets | Fonction serveur **`fc_vue_proprietaire()`** (`supabase/foncier_portail_proprietaire.sql`) : identité lue dans le jeton (claim `prop_id`), aucun paramètre, ne renvoie que l'écran du propriétaire (budgets exclus : l'avancement pondéré est calculé côté serveur). Le portail n'a plus aucun repli sur la table : panne = « service indisponible » |
| La politique `portail_operations` donnait la ligne entière au propriétaire concerné | Retirée pour les propriétaires (accès financier et cession conservés) |
| ERP, ancien portail propriétaire : session = `{contact}` dans le `localStorage` : **n'importe qui pouvait s'y introduire** en posant cette valeur | Session dans `sessionStorage`, **preuve** dérivée des codes actuels (régénérer un code coupe la session), durée 8 h, ancienne session effacée |
| Même portail : aucune limite d'essais | 5 échecs par identifiant et par jour, comme le portail acquéreur |
| Panne du service comptée comme un échec de connexion | Non comptée |
| Défaut trouvé par les tests : les postes de travaux n'auraient pas été affichés avec la nouvelle vue | Corrigé |

**Mise en service** : exécuter `supabase/foncier_portail_proprietaire.sql` (idempotent, additif ; retour arrière en fin de fichier), puis déployer le portail. Ordre sans risque : la fonction d'abord.

**Reste ouvert (hors de ce lot)**
- La base MENCO porte encore **162 politiques ouvertes `*_open_rollback`** (dont `pi_af_operations`) : la clé publique peut lire et écrire ces tables. Le plan de fermeture par vagues est préparé et non appliqué (`supabase/RLS_RECETTE_FERMETURE.md`). Ce lot rend le portail propriétaire indépendant de cette fermeture, il ne la remplace pas.
- Limite d'essais du serveur de connexion (`portal-login`) : en mémoire d'instance, remise à zéro au recyclage. Une table Postgres serait plus robuste.
- Code à 6 chiffres hachés en SHA-256 simple : à renforcer (hachage lent) avec un plan de migration des codes existants.
- Un propriétaire présent dans plusieurs opérations sous des fiches distinctes ne voit que celles de la fiche qui a ouvert la session.

## 6. Note de conception — portail « par personne » (non réalisé)

Faire dépendre le portail de la fiche du référentiel exposerait CNI et contacts de toutes les personnes au même canal. À ne pas faire en l'état. Conception recommandée :

1. **Vérification côté serveur** : une fonction SQL `security definer` (ou Edge Function) reçoit contact + code, compare l'empreinte et ne renvoie que les parcelles et étapes de la personne. Aucune lecture directe de la table des personnes par le portail.
2. Empreinte (hash + sel) et compteur de tentatives portés par la fiche, avec limitation des essais et verrouillage temporaire.
3. Le portail affiche les parcelles reliées à la personne par la chaîne de propriété et les ayants droit, plus seulement celles d'une opération.
4. Migration : les codes existants posés sur les opérations restent valides pendant la transition.

Ce chantier touche le portail, la base et la sécurité : à planifier comme un lot à part, avec recette.
