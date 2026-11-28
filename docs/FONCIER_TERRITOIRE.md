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

**Couches types** : le bouton « Couches types » crée dix couches **inactives** à compléter : 4 couches SDUGA 2040, PUd, ZAD, utilité publique, zones protégées, zones humides et inondables, infrastructures.

| Couche SDUGA 2040 | Catégorie par défaut |
|---|---|
| Pôles urbains (Bingerville, Anyama…) | à surveiller |
| Transports et mobilité | à surveiller |
| Protection environnementale (zones humides, forêts, eau) | inconstructible |
| Maîtrise foncière (ZAD et encadrement) | sous condition |

La catégorie par défaut s'applique à l'import ; la propriété `categorie` d'une zone du fichier la remplace. Aucun contour n'est fourni : chaque couche reste vide et inactive tant que le fichier officiel n'est pas importé. Elles ne servent au contrôle qu'une fois la provenance renseignée et un fichier importé.

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

## 2 ter. Versions d'une couche et audits touchés

À chaque import d'une couche, l'ERP garde dans la couche un **historique des versions** (20 au plus) : date, auteur, version avant et après, zones **ajoutées**, **retirées**, **modifiées** (même nom, contour différent), nombre d'inchangées.

Il recalcule aussi le croisement avec **cette couche** de chaque audit qui a un contrôle territorial, et signale les audits dont le résultat change : nouveau croisement, croisement levé, niveau modifié. Un avertissement s'affiche à l'import (« n audit(s) touché(s) »), le détail est dans **Historique des versions** (clic sur la couche).

- Les audits **décidés restent figés** : ils sont signalés, jamais modifiés. Les réexaminer avec le géomètre et la direction.
- La comparaison suppose que la **version de la fiche est mise à jour avant le réimport** ; la version précédente est celle du dernier import.
- Appariement des zones par nom normalisé et par emprise : deux zones renommées apparaissent comme une retirée et une ajoutée.
- L'historique n'est pas rétroactif : il commence au premier import fait après cette fonction.

## 2 quater. Veille de secteurs

Écran : Foncier › Territoire › **🔭 Secteurs surveillés** (au-dessus des couches). Table cloud : `pi_secteurs_veille` (`supabase/foncier_secteurs_veille.sql`).

Un **secteur** est un polygone que MENKO surveille (Ahoué, Brofodoumé, Aghien-Télégraphe, Bingerville–Adjin…).

| Élément | Détail |
|---|---|
| Création | **✏ Dessiner un secteur** (clic sur les sommets, 3 au moins, **✔ Terminer**, nom de 3 caractères au moins, Échap pour annuler) ou **📥 Importer** un GeoJSON, KML ou KMZ (un secteur par polygone, 50 au plus, refus hors de la Côte d'Ivoire) |
| Analyse | surface ; **zones des couches actives** qui recouvrent le secteur (part du secteur, catégorie) ; **cumul** inconstructible / sous condition (plafonné à 100 % : des zones de couches différentes peuvent se superposer) ; **parcelles** dont le centre est dans le secteur, dont celles en alerte |
| Veille | à **chaque import** et à **chaque activation ou désactivation** d'une couche, les secteurs actifs sont ré-analysés et comparés à l'analyse précédente |
| Alerte | zones **nouvelles**, **disparues**, **modifiées** (écart d'au moins 5 points), **version de couche** changée ou couche ajoutée/retirée du contrôle, variation des **parcelles en alerte**. Le secteur passe « ⚠ à examiner », avec le motif et la date ; **Marquer comme examiné** |
| Carte | secteurs en pointillé violet (rouge si à examiner) ; clic = résumé et détail ; bouton **🔭 Secteurs** pour les masquer |
| Suspension | ▶ / ⏸ : un secteur suspendu n'est plus analysé |
| Suppression | administrateur, motif de 10 caractères |
| Rapport | la section « Secteurs surveillés » figure dans **📄 Rapport** |

**Limites** : l'analyse porte sur les couches **chargées et actives** (sans couche, elle est vide et ne vaut pas conformité). La part des zones est estimée par échantillonnage. Aucune notification hors de l'écran : le badge « à examiner » et la ligne en rouge. Le suivi démarre à la création du secteur (état de départ) : il ne remonte pas dans le passé.

## 3. Brique 2 — contrôle territorial de l'audit pré-acquisition

Dans l'audit : bouton **Lancer le contrôle territorial**. La parcelle liée à l'audit est croisée avec toutes les couches actives.

- Résultat : zone, couche (version, statut), catégorie, **part de la parcelle concernée**, point d'audit concerné.
- Niveaux : **critique** (zone inconstructible ≥ 1 % de la parcelle), **majeur** (inconstructible < 1 %, sous condition, à surveiller ≥ 5 %), **information**.
- Points d'audit liés : zone protégée et utilité publique → `AUD-JUR-03` ; SDUGA, PUd, ZAD → `AUD-TECH-03` ; hydrologie → `AUD-TECH-04` ; infrastructure → `AUD-TECH-05`.
- **Consigner** : écrit le constat dans l'observation du point, **sans jamais changer son statut**. Seul l'auditeur valide un point.
- Le contrôle est enregistré sur l'audit (date, auteur, couches et versions utilisées) et figé quand l'audit est décidé.
- **GO** : si des couches sont actives et qu'aucun contrôle n'a été lancé, confirmation demandée. Si un croisement **critique** existe, le GO exige **un administrateur et un motif** (dérogation consignée sur l'audit).
- **Absence de croisement ≠ conformité** : seules les couches chargées sont contrôlées. L'écran le rappelle.

## 3 bis. Rapport territorial imprimable (PDF)

- **Dans l'audit** : l'impression de l'audit contient maintenant la section « Contrôle territorial » (couches et versions, croisements, point d'audit, dérogation éventuelle, mentions). Un audit sans contrôle l'indique : « non lancé, ne vaut pas conformité ».
- **Pour la direction** : bouton **📄 Rapport** de l'onglet Territoire. Il utilise l'analyse en cours (la lance si besoin) et produit : couches contrôlées avec source, date, version ; synthèse par niveau ; parcelles en alerte avec le détail des croisements (critiques d'abord) ; parcelles sans croisement et **sans contour** ; suites à donner ; cadre « établi par / validé par ». L'action est journalisée (`FONCIER_TERRITOIRE_RAPPORT`). Rien n'est enregistré dans les audits.
- Le PDF s'obtient par l'impression du navigateur (« Enregistrer au format PDF »). Document interne : données stratégiques.

## 3 ter. Alerte précoce sur les parcelles

- **Colonne 🌍 Territoire** dans Foncier › Portefeuille Foncier (tableau et grille) : ⛔ Critique, 🔶 Majeur, ℹ️ Information, ○ Aucun croisement, ? Contour à saisir (moins de 3 bornes), · Pas de couche (aucune couche active). Même contrôle que l'audit.
- Le badge se calcule **par petits lots** après l'affichage (témoin « … » d'abord) et reste en **cache** tant que le contour et les couches ne changent pas ; il se recalcule après un import, une activation ou une désactivation de couche. Au clic, la carte s'ouvre sur la parcelle.
- **À l'enregistrement d'une parcelle** avec contour : si le croisement est **critique ou majeur**, un avertissement indique la zone, la couche et la part de la parcelle, et l'action est journalisée (`FONCIER_ALERTE_TERRITORIALE`). L'enregistrement n'est **jamais bloqué**.
- Toujours indicatif : « Aucun croisement » ne vaut pas conformité ; la décision passe par l'audit pré-acquisition.
- Correctif au passage : le tableau des parcelles échappe désormais la référence, la localisation, la commune, le n° de titre, le type de titre, le programme et le statut (ils venaient aussi d'imports Excel).

## 3 quater. Risque territorial dans le rapport à la direction

Le **rapport stratégique du portefeuille foncier** (Foncier › Portefeuille Foncier › « 🗺️ Rapport », aussi envoyé à la direction par la messagerie) contient maintenant :
- une section **▸ RISQUE TERRITORIAL (indicatif)** : couches contrôlées, parcelles analysées, répartition critique / majeur / information / aucun croisement, parcelles sans contour, secteurs surveillés dont ceux à examiner ;
- des **actions proposées**, classées avec les autres par priorité : **Lever les croisements territoriaux critiques** (96, avant les titres manquants), **Examiner les secteurs surveillés où une couche a changé** (82), **Examiner les croisements territoriaux majeurs** (75), **Charger les couches territoriales** (50, seulement s'il existe des parcelles à contour et aucune couche active).

Même contrôle que l'audit et le badge 🌍 (cache partagé). Indicatif : il alerte, il n'autorise rien ; l'absence de croisement ne vaut pas conformité.

## 3 quinquies. Calcul exact côté serveur (PostGIS)

Le contrôle de l'ERP **estime** la surface commune par échantillonnage (marge de quelques pour cent). Le bouton **🎯 Calcul exact (serveur)** la **confirme** par l'intersection géométrique réelle (PostGIS, aire géodésique).

| Où | Comportement |
|---|---|
| Audit › Contrôle territorial | compare, zone par zone, **estimé** et **exact** (écart en points, niveau estimé et niveau exact, « le niveau change »). Sur un audit **en cours**, le résultat est **enregistré** (`controle_territorial.exact`, historique de l'audit) et repris à l'impression ; sur un audit **décidé** (contrôle figé) ou sans droit d'écriture, il est **affiché sans être enregistré** |
| Carte › Contrôle de la parcelle | même tableau dans le panneau |

- Fonction `fc_territoire_croisement(contour)` (`supabase/foncier_territoire_exact.sql`) : jeton du personnel obligatoire, SECURITY INVOKER (la RLS s'applique), aucun accès anonyme ni portail, **n'enregistre rien**.
- Mêmes règles que l'ERP : couches actives, non obsolètes, à provenance complète ; seuil max(5 m², 0,1 % de la parcelle) ; niveaux critique (inconstructible ≥ 1 %), majeur, information.
- **Différence assumée** : pas de bande de tolérance de 0,5 m le long des bords (intersection brute) ; deux zones adjacentes peuvent donc se distinguer légèrement de l'estimation.
- Messages clairs : fonction absente (exécuter le SQL), session du personnel requise, contour invalide, serveur injoignable, délai de 25 s.
- Il confirme, il n'autorise rien : le géomètre fait foi.

## 4. Limites connues

- La surface commune est estimée par échantillonnage du contour : marge de quelques pour cent. À confirmer par le calcul exact (§ 3 quinquies) puis par le géomètre avant toute décision.
- Anneaux intérieurs (trous) non pris en compte.
- Parcelle sans contour (moins de 3 bornes) : aucun contrôle possible, signalé.
- Carte : pas de bâtiments ni de relief hors ligne ; pas d'étiquettes de texte sur la carte (noms au clic).

## 4 bis. Carte 3D

Foncier › Territoire : carte sombre en 3D (MapLibre GL 4.7.1), inclinable, avec panneau de couches à droite et barre d'outils en bas.

| Élément | Détail |
|---|---|
| Couches | zones de chaque couche, colorées par catégorie ; cases à cocher par couche ; une couche inactive est dessinée en pointillé et signalée « non contrôlée » |
| Parcelles | contours des parcelles de l'ERP ; clic = bouton « Contrôler cette parcelle » |
| Contrôle | résultat dans le panneau (zone, couche, version, part de la parcelle) ; mêmes niveaux et mêmes mises en garde que dans l'audit |
| Analyser les parcelles | contrôle de toutes les parcelles à contour : parcelles colorées par niveau (critique, majeur, information, aucun croisement, non contrôlable) et liste des parcelles en alerte. **Rien n'est enregistré** |
| Barre d'outils | vue d'ensemble, 3D / 2D, relief, bâtiments, volumes, parcelles, fond (sombre, plan, satellite), choix d'une parcelle |
| Depuis l'audit | bouton « 🗺 Voir sur la carte » : ouvre la carte centrée sur la parcelle de l'audit |

**Courbes de niveau** (bouton « 〰 Courbes ») : tracées dans le navigateur, dans un web worker, à partir des tuiles de relief AWS, par la bibliothèque `maplibre-contour` 0.1.0 (chargée depuis jsDelivr **à la première activation seulement**). Équidistance selon le zoom [courante, maîtresse] : zoom 11 : 100 / 500 m ; 12 : 50 / 200 ; 13 : 20 / 100 ; 14 : 10 / 50 ; 15 : 5 / 25 ; 16 : 2 / 10 ; 17 : 1 / 5. Couleur selon le fond (doré sur Sombre, brun sur Plan, jaune clair sur Satellite) ; courbes maîtresses plus épaisses. Les cotes (altitude des courbes maîtresses) s'affichent dès le zoom 13. **Altitudes issues d'un modèle mondial, précision de l'ordre de la dizaine de mètres : indicatives, pas un levé de géomètre.** Pour une parcelle, seul un levé topographique fait foi.

**Plein écran** : « ⛶ Plein écran » (plein écran du navigateur ; cadre fixe sur iPhone et iPad). Échap pour quitter. « ☰ Panneau » masque ou affiche le panneau des couches pour agrandir la carte.

**Performance**
- Contours des zones renvoyés à la carte **seulement s'ils changent** (import, activation, suppression) ; la carte n'est plus recalculée à chaque rafraîchissement de l'écran.
- Calcul des zones actives fait une fois (au lieu d'une fois par zone) : 1 500 zones de 400 points construites en moins de 0,4 s.
- Relief, bâtiments et courbes ne sont **demandés au réseau que s'ils sont activés** ; bâtiments à partir du zoom 14.
- **Appareil modeste** (4 cœurs ou moins, ou 4 Go ou moins) : relief et bâtiments désactivés au départ, sans anticrénelage, sans fondu, bâtiments sans transparence (passe de rendu en moins). Bouton « ⚡ Léger » : coupe relief, bâtiments, volumes, courbes, remet la carte à plat et ramène la résolution à 1 (connexion lente ou batterie).
- Redimensionnement automatique de la carte (plein écran, panneau, rotation d'écran).

**Outils de carte**
- **📏 Mesurer** : clic sur les points de la carte. **📏 Distance** : longueur cumulée (géodésique, en m ou km). **📐 Surface** : surface (en m², ha, km²) et périmètre, 3 points au moins. Résultat dans un cadre sur la carte, **↩ Point** pour retirer le dernier point, **✖ Fin** ou Échap pour terminer. Pendant la mesure, les clics n'ouvrent aucune fenêtre de zone ou de parcelle. Mesures **indicatives** : un levé de géomètre fait foi.
- **Échelle** métrique en haut à droite de la carte.
- **📸 Exporter** : image PNG avec cartouche (titre, date, auteur, fond, centre, zoom), **échelle**, **légende** des catégories, **couches contrôlées avec source, date et version**, mentions (indicatif, hauteurs symboliques) et **sources des fonds de carte**. Fichier `carte-territoire-AAAA-MM-JJ.png`. Action journalisée (`FONCIER_TERRITOIRE_EXPORT_CARTE`). Document interne : données stratégiques.
- Mesure et dessin de secteur sont exclusifs : démarrer l'un termine l'autre.

**Volumes** : les hauteurs des zones et des parcelles sont **symboliques** (lecture de la catégorie ou du niveau d'alerte). Ce ne sont pas des hauteurs réelles.

**Bâtiments et relief** : bâtiments d'OpenStreetMap (service OpenFreeMap) et relief AWS Terrain Tiles, tels qu'ils existent. Ils montrent le terrain actuel, **pas un plan directeur ni des constructions futures**.

**Confidentialité** : les couches et les parcelles se dessinent dans le navigateur, elles ne quittent pas l'ERP. En revanche, le fond de carte, le relief et les bâtiments sont demandés à des serveurs publics (Esri / OpenStreetMap, AWS, OpenFreeMap) : **ces serveurs voient la zone affichée** (adresse IP et dalles demandées). Pour un secteur sensible, utiliser le fond « Sombre » à un zoom large (Esri Dark Gray, sans clé ; zoom natif jusqu'à 16, au-delà l'image est agrandie), ou un serveur de tuiles interne.

**Test du rendu** : `npm i --no-save maplibre-gl@4.7.1 maplibre-contour@0.1.0` puis `node tests-caisse/foncier-territoire-carte.test.js` (rendu WebGL réel hors ligne ; ignoré si le paquet est absent). Capture : variable `CARTE_CAPTURE=chemin.png`.

**Prérequis** : navigateur avec WebGL. Sinon, la carte affiche un message et les couches restent consultables dans la liste. Hors ligne : même comportement.

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

## 3 sexies. Terrain : « Où suis-je ? » (hors ligne)

Écran **Foncier › Terrain** : bouton **🧭 Où suis-je ? (zones)**. Le GPS du téléphone est croisé avec les couches **actives** déjà chargées dans l'appareil : aucun appel réseau.
- Affiche les zones qui contiennent la position, et celles à moins de 500 m (avec la distance).
- Affiche aussi le badge territorial de la parcelle choisie.
- **Alerte indicative** : n'autorise rien ; absence de croisement ≠ conformité. Sans couche active : « contrôle impossible ».
- La précision GPS est rappelée ; au-delà, sortir à découvert avant de conclure.

## 3 septies. Fond de carte hébergé

Carte Territoire › bouton **⚙** (administrateur) : saisir l'URL des tuiles raster de l'entreprise, ex. `https://tuiles.exemple.ci/abidjan/{z}/{x}/{y}.png`.
- Règles : **https** obligatoire, `{z}` `{x}` `{y}` requis, pas d'identifiants dans l'URL ; sinon refus.
- Le fond « Hébergé (entreprise) » apparaît dans le sélecteur. Vide = retiré, retour au fond sombre.
- Réglage **propre à l'appareil** (stocké dans le navigateur) ; l'action est journalisée (`FONCIER_FOND_HEBERGE`).
- Le serveur de tuiles doit autoriser le site en CORS (`Access-Control-Allow-Origin`).
