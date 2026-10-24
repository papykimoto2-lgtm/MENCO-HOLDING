# Tests de non-régression — module Comptabilité

Chaque test charge la **vraie page de l'ERP** dans Chromium (aucune fonction réimplémentée), coupe le réseau,
et **garde le vrai `dbPut` / IndexedDB** : les verrous de visa et d'exercice clos sont ceux de la production.

| Fichier | Règles couvertes |
|---|---|
| `bilan.test.js` | Bilan équilibré par construction (ventes/charges, TVA récupérable 4452, amortissements 28, virement interne 585, classe 8, reprises 79, résultat 131 déjà porté, avances clients) ; signe du résultat ; non-compensation des tiers ; état imprimé = écran |
| `resultat.test.js` | Compte de résultat en soldes nets (vente contre-passée, charge extournée) ; résultat = celui du Bilan, comptes hors rubriques compris ; tableau de bord net |
| `cloture.test.js` | À-nouveaux par tiers, résultat sur 121/131, pièces de clôture visées, Bilan N+1 équilibré et sans double comptage ; clôture refusée (brouillard, déséquilibre, déjà close) ; réouverture dans l'ordre inverse |
| `verrous.test.js` | Visa d'une écriture automatique jamais écrasé ; exercice clos : écriture conservée en mémoire ; versement non modifiable / non supprimable si écriture visée ou exercice clos ; dévalidation tracée ; contre-passation sur exercice clos, une seule fois |
| `lettrage-fec.test.js` | Aucun lettrage entre souscripteurs différents ; tiers porté par les écritures de versement et de vente ; lettre portée par la ligne ; FEC (pièce, journal, tiers auxiliaire, lettre par ligne) |
| `saisie.test.js` | Colonne « Tiers » sur compte de tiers ; confirmation si tiers absent ; modification qui conserve référence, tiers, source ; écriture lettrée non modifiable |

Lancer : `npm run test:compta` (ou `npm test` pour caisse + comptabilité).
Variables : `PLAYWRIGHT_PATH` (module playwright), `CHROMIUM_PATH` (navigateur), `ERP_PAGE` (autre page à tester).
Prérequis : Node 20+, `playwright` et un Chromium installés.

Note : le filtre d'exercice (`#filter-annee-compta`) n'est rempli qu'à l'ouverture du module ; le harnais fournit `annee(2025)`
qui ajoute l'option avant de la sélectionner (sans cela la valeur reste vide et l'écran retombe sur l'année courante).
