/* Menko Holding — service worker.
   Deux applications installables partagent cette origine :
     · /index.html          → pilotage du groupe (Immo, Agro, Digitech)
     · /portail-unique.html → espace client (souscripteurs, apporteurs…)
   Un service worker ne vit qu'une fois par portée ; celui-ci sert donc les
   deux coquilles, et choisit la bonne en repli hors ligne selon la page
   demandée. Sans cela, un souscripteur hors réseau se retrouvait sur la page
   du holding.

   [CORRECTIF — DONNÉES PÉRIMÉES SERVIES AUX SOUSCRIPTEURS]
   La version précédente mettait en cache TOUTE réponse GET, y compris les
   appels REST à Supabase, puis les resservait au moindre échec réseau. Un
   souscripteur pouvait donc voir un solde, un échéancier ou une liste de
   versements figés à une consultation antérieure, sans le moindre indice que
   la donnée n'était plus à jour — inacceptable sur des montants. Seule la
   coquille statique listée ci-dessous est désormais interceptée ; tout le
   reste (Supabase, API, polices, images distantes) passe au réseau sans
   jamais transiter par le cache.

   [CORRECTIF — COQUILLE JAMAIS MISE EN CACHE]
   La liste précédente référençait ./icon-192.png, fichier absent du dépôt.
   cache.addAll() rejette en bloc dès qu'UNE entrée échoue, et l'erreur était
   avalée par un .catch() vide : en pratique RIEN n'était précaché, et
   l'installabilité reposait sur le seul manifeste. Les entrées sont désormais
   ajoutées une par une, pour qu'un fichier manquant n'emporte plus les autres,
   et la console nomme celui qui manque. */

var CACHE = 'menko-holding-v2';

/* Coquille commune aux deux applications. Chemins absolus : le service worker
   est servi depuis la racine, les chemins relatifs y résolvent donc déjà
   correctement, mais l'absolu évite toute ambiguïté à la comparaison avec
   url.pathname dans le gestionnaire fetch. */
var SHELL = [
  '/index.html',
  '/portail-unique.html',
  '/manifest.json',
  '/manifest-portail.json',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png'
];

/* Repli hors ligne : la coquille de l'application dont relève la requête. */
function coquilleDeRepli(pathname) {
  return pathname.indexOf('/portail-unique') === 0 ? '/portail-unique.html' : '/index.html';
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* Une entrée par requête : un 404 sur un seul fichier ne doit pas
         empêcher la mise en cache de tous les autres. */
      return Promise.all(SHELL.map(function (url) {
        return c.add(url).catch(function () {
          console.warn('[sw] coquille — fichier introuvable, ignoré :', url);
        });
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                             .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* Hors de cette origine (Supabase, CDN, polices) : aucune interception. */
  if (url.origin !== self.location.origin) return;

  var estCoquille = SHELL.indexOf(url.pathname) !== -1 || url.pathname === '/';

  /* Navigation vers une page de l'application : réseau d'abord, repli sur la
     coquille correspondante si le réseau manque. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        if (estCoquille && res && res.ok) {
          var copie = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copie); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        /* ignoreSearch : la coquille est mise en cache sous /portail-unique.html,
           mais l'application installee demarre sur /portail-unique.html?pwa=1.
           Sans cette option, l'entree exacte est manquee a chaque lancement
           hors ligne et l'on passe par le repli, plus lent. */
        return caches.match(req, { ignoreSearch: true }).then(function (cached) {
          return cached || caches.match(coquilleDeRepli(url.pathname));
        });
      })
    );
    return;
  }

  /* Tout ce qui n'est pas la coquille statique (donc les données) passe au
     réseau sans cache : mieux vaut une erreur franche qu'un chiffre périmé. */
  if (!estCoquille) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copie = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copie); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(req);
    })
  );
});
