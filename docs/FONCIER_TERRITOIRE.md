# Foncier — Territoire : couches officielles et contrôle territorial (lot L18)

Briques 1 et 2 de « MENKO Territorial Intelligence ». Écran : Foncier › **Territoire**. Tables cloud : `pi_couches_territoriales`, `pi_zones_territoriales` (`supabase/foncier_territoire_l18.sql`).

## 1. Principe

> Une donnée officielle reste identifiable comme telle : **source, date, version, statut juridique**.
> Le contrôle **alerte**, il n'autorise jamais. Une analyse n'est pas une autorisation administrative.

## 2. Brique 1 — référentiel territorial

| Élément | Détail |
|---|---|
| Couche | nom, type (SDUGA, PUd, ZAD, zone protégée / forêt classée / domaine public, utilité publique, hydrologie, infrastructure, autre), **source**, **date de la source**, **version**, **statut** (officiel, indicatif, en projet, obsolète), périmètre couvert |
| Zone | appartient à une couche ; nom, catégorie (inconstructible, sous condition, à surveiller, information), contours WGS84 |
| Catégorie par défaut | protégée et utilité publique → inconstructible ; ZAD et hydrologie → sous condition ; infrastructure → à surveiller ; SDUGA, PUd, autre → information. Surchargeable par la propriété `categorie` du fichier |
| Import | **GeoJSON**, **KML** ou **KMZ** (Polygon, MultiPolygon, Placemark, MultiGeometry). Anneau extérieur seulement ; points et lignes ignorés et comptés ; contours simplifiés à 800 points maximum ; **1 500 zones maximum** par couche. Voir §2 bis |
| Ré-import | remplace les zones de la couche, après confirmation |
| Provenance | **source, date et version obligatoires avant tout import** ; une couche sans provenance n'est jamais contrôlée |
| Activation | une couche s'active à l'import (si non obsolète) ; **Désactiver / Activer** la retire ou la remet au contrôle |
| Suppression | une couche ne se supprime que vide ; vider les zones : administrateur, motif de 10 caractères |

Les couches **obsolètes** ou désactivées ne sont jamais contrôlées.

## 2 bis. Guide d'import des couches

**Couches types** : le bouton « Couches types » crée sept couches **inactives** à compléter (SDUGA, PUd, ZAD, utilité publique, zones protégées, zones humides et inondables, infrastructures). Elles ne servent au contrôle qu'une fois la provenance renseignée et un fichier importé.

**Formats acceptés** : `.geojson` / `.json`, `.kml`, `.kmz`.

| Vous avez | Faire |
|---|---|
| GeoJSON en WGS84 | importer tel quel |
| KML ou KMZ (Google Earth, QGIS) | importer tel quel |
| GeoJSON en coordonnées projetées (UTM) | importer : l'ERP demande la **zone UTM nord** (30 pour Abidjan et le centre, 29 pour l'ouest) et convertit |
| Shapefile (.shp) | ouvrir dans QGIS › Exporter › GeoJSON, SCR **EPSG:4326** |
| DWG / DXF | ouvrir dans QGIS (ou convertir en DXF), définir le SCR d'origine, exporter en GeoJSON EPSG:4326 |
| Carte en PDF ou image | **inutilisable en l'état** : à géoréférencer par un géomètre ou un SIG avant import |

**Contrôles avant import** (affichés à la confirmation) : nombre de zones et de points, zones ignorées, **zones situées hors de la Côte d'Ivoire** (signe d'un mauvais système de coordonnées ou de latitude et longitude inversées), conversion UTM appliquée, zones actuelles qui seront remplacées.

**Datum** : la conversion UTM suppose le datum **WGS84**. Une source établie dans un autre système (par exemple Abidjan 87) peut décaler les contours de quelques dizaines de mètres : à **confirmer auprès de la source**, et à vérifier sur une parcelle connue avant tout usage.

**Fiche de qualification d'une couche** (à remplir avant « officiel »)

| Question | Réponse attendue |
|---|---|
| Qui l'a émise ? | organisme, service |
| Sur quel texte repose-t-elle ? | décret, arrêté, numéro, date de publication |
| Quelle date et quelle version ? | date de la source, numéro de version |
| Quelle emprise couvre-t-elle ? | communes, secteurs |
| Quelle précision ? | échelle, qualité du géoréférencement |
| Quel statut juridique ? | officiel opposable, indicatif, en projet |
| Qui l'a validée chez MENKO ? | nom du juriste, date |

Tant que la réponse n'est pas claire, la couche reste « indicative » ou « en projet ».

## 3. Brique 2 — contrôle territorial de l'audit pré-acquisition

Dans l'audit : bouton **Lancer le contrôle territorial**. La parcelle liée à l'audit est croisée avec toutes les couches actives.

- Résultat : zone, couche (version, statut), catégorie, **part de la parcelle concernée**, point d'audit concerné.
- Niveaux : **critique** (zone inconstructible ≥ 1 % de la parcelle), **majeur** (inconstructible < 1 %, sous condition, à surveiller ≥ 5 %), **information**.
- Points d'audit liés : zone protégée et utilité publique → `AUD-JUR-03` ; SDUGA, PUd, ZAD → `AUD-TECH-03` ; hydrologie → `AUD-TECH-04` ; infrastructure → `AUD-TECH-05`.
- **Consigner** : écrit le constat dans l'observation du point, **sans jamais changer son statut**. Seul l'auditeur valide un point.
- Le contrôle est enregistré sur l'audit (date, auteur, couches et versions utilisées) et figé quand l'audit est décidé.
- **GO** : si des couches sont actives et qu'aucun contrôle n'a été lancé, confirmation demandée. Si un croisement **critique** existe, le GO exige **un administrateur et un motif** (dérogation consignée sur l'audit).
- **Absence de croisement ≠ conformité** : seules les couches chargées sont contrôlées. L'écran le rappelle.

## 4. Limites connues

- La surface commune est estimée par échantillonnage du contour : marge de quelques pour cent. À confirmer par le géomètre avant toute décision.
- Anneaux intérieurs (trous) non pris en compte.
- Parcelle sans contour (moins de 3 bornes) : aucun contrôle possible, signalé.
- L'impression de l'audit ne reprend pas encore le panneau territorial.
- Pas de carte interactive : aperçu vectoriel par couche. Une carte avec les parcelles est une suite possible.

## 5. Sécurité et confidentialité

- Données **stratégiques** (secteurs cibles, périmètres, réserves) : une fuite fait monter les prix. Table en RLS forcé, aucun accès anonyme.
- **Jamais** dans le portail souscripteur ni dans le dépôt GitHub (public) : les fichiers GeoJSON se chargent depuis l'ERP, pas depuis le dépôt.
- Accès par le module Foncier ; réserver Foncier › Territoire à la direction et au service foncier par les rôles.
- Retour arrière : `drop table public.pi_zones_territoriales, public.pi_couches_territoriales;`

## 6. Mise en service

1. Exécuter `supabase/foncier_territoire_l18.sql` sur le projet.
2. Obtenir les couches officielles (urbanisme, BNETD, décrets) ; **faire valider** juridiquement chaque couche avant de la passer en « officiel ».
3. Créer la couche (source, date, version, statut), importer le GeoJSON.
4. Tester sur une parcelle connue avant de s'en servir pour une décision.

## 6 bis. Suites prévues (briques 3 à 5)

Carte d'alertes et suivi de secteurs (Ahoué, Brofodoumé, Aghien-Télégraphe, Bingerville–Adjin) ; scénarios d'aménagement et rentabilité ; rapport pour la direction générale.
