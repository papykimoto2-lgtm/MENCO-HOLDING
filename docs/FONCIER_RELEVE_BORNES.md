# Foncier — import de relevé de bornes (géomètre)

Écran : Foncier › Portefeuille Foncier › **📥 Relevé de bornes**. Aucun SQL (les bornes sont déjà portées par la parcelle).

## Principe

Le relevé d'un géomètre arrive en tableau (CSV ou Excel) pour plusieurs parcelles. L'ERP le **lit, le contrôle et l'affiche en aperçu** avant toute écriture. Il **remplace les bornes de parcelles existantes** ; il ne **crée jamais** de parcelle.

## Format

| Colonne | Rôle | En-têtes reconnus |
|---|---|---|
| parcelle | référence de la parcelle (obligatoire) | parcelle, ref, référence, n° parcelle… |
| borne | nom de la borne (B1, B2… si absent) | borne, point, sommet, nom… |
| x, y | UTM en mètres (est, nord) | x / y, e / n, est / nord, easting / northing |
| lat, lng | ou WGS84 en degrés | lat / latitude, lng / lon / longitude |
| z | altitude (facultatif) | z, altitude, cote |
| zone | fuseau UTM 29 ou 30 (facultatif ; sinon la zone choisie à l'écran, 30 par défaut) | zone, fuseau |

Fichiers : CSV (séparateur `;`, `,` ou tabulation, BOM accepté, guillemets, virgule décimale), TXT, Excel `.xlsx` (première feuille). Le bouton **⬇ Modèle CSV** fournit un exemple. Les bornes d'une parcelle se suivent dans l'ordre du contour.

## Contrôles (par parcelle)

| Contrôle | Résultat |
|---|---|
| Parcelle absente du portefeuille, fusionnée ou découpée | ⛔ refusée |
| Coordonnée illisible | ⛔ refusée (numéro de ligne) |
| Moins de 3 bornes | ⛔ refusée |
| Point hors de la Côte d'Ivoire | ⛔ refusée ; **x et y semblent inversés** est signalé quand l'inversion corrige le problème |
| Contour croisé (ordre des bornes) | ⛔ refusée |
| Chevauchement avec une autre parcelle | ⛔ refusée pour un utilisateur ordinaire ; pour un **administrateur** : ⚠ et **motif de 10 caractères** demandé à l'application |
| Point de fermeture identique au premier | retiré, ⚠ |
| Noms de bornes en double, bornes confondues (< 5 cm) | ⚠ |
| Écart de surface > 10 % avec la surface enregistrée | ⚠ |
| Niveau territorial du nouveau contour (🌍) | affiché dans l'aperçu (critique, majeur…) ; indicatif |

## Application

- Nouvelles bornes (x, y, z), zone UTM, contour WGS84 et système géodésique (« relevé importé »).
- **Ancien contour conservé** dans l'historique de la parcelle (5 versions) ; ligne d'historique ; journal `FONCIER_RELEVE_BORNES`.
- Option : **mettre à jour la superficie** avec la surface calculée (décochée par défaut).
- Droits : module Foncier en écriture et « modifier » sur les parcelles.
- Le badge 🌍 Territoire du portefeuille est recalculé.

## Limites

- Les coordonnées sont supposées en **WGS84 / UTM** : un levé en Abidjan 87 peut décaler les points de quelques dizaines de mètres (voir FONCIER_TERRITOIRE.md, datum).
- Une seule zone UTM par parcelle ; 30 Nord ou 29 Nord seulement.
- Le relevé indique la géométrie, pas la propriété : il ne remplace ni le bornage contradictoire ni le titre foncier.
