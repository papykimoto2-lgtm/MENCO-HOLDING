// api/fne-proxy.js
//
// Passerelle serveur (Vercel Serverless Function) vers l'API FNE de la DGI
// (Côte d'Ivoire). Objectif : l'ERP (servi en HTTPS) ne peut généralement
// pas appeler directement le serveur de test DGI (accessible en simple HTTP,
// sans en-têtes CORS pensés pour un navigateur) — le navigateur bloque ce
// type d'appel ("contenu mixte" / CORS). Cette fonction tourne côté serveur,
// où ces restrictions ne s'appliquent pas, et relaie fidèlement la requête.
//
// Appelée par l'ERP sur : /api/fne-proxy?env=test&path=/external/invoices/sign
//   - env  : "test" (par défaut) ou "production"
//   - path : chemin de l'endpoint FNE (doit commencer par /external/invoices/)
// L'en-tête Authorization (Bearer <clé API>) envoyé par l'ERP est transmis
// tel quel à la plateforme FNE ; cette fonction ne stocke aucune clé.
//
// Déploiement : placez ce fichier à la racine du dépôt sous api/fne-proxy.js
// (déjà le cas ici) et poussez sur la branche "main" — Vercel le détecte et
// le déploie automatiquement, aucune configuration supplémentaire requise.
//
// Variable d'environnement à définir dans Vercel (Project Settings →
// Environment Variables) une fois l'URL de production communiquée par la
// DGI (support.fne@dgi.gouv.ci) :
//   FNE_URL_PROD = https://... (URL de production transmise par la DGI)

const FNE_HOSTS = {
  test: 'http://54.247.95.108/ws',
  production: process.env.FNE_URL_PROD || ''
};

const CHEMIN_AUTORISE = /^\/external\/invoices\//;

module.exports = async (req, res) => {
  // Same-origin depuis l'ERP (même domaine Vercel) : ces en-têtes CORS ne
  // sont pas indispensables mais ne coûtent rien et facilitent les tests
  // depuis un autre outil (Postman, etc.) si besoin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed', message: 'Seul POST est supporté.' }); return; }

  const env = String(req.query.env || 'test');
  const chemin = String(req.query.path || '');
  const base = FNE_HOSTS[env];

  if (!base) {
    res.status(400).json({ error: 'bad_request', message: env === 'production'
      ? 'URL de production non configurée côté serveur (variable d\'environnement FNE_URL_PROD manquante sur Vercel).'
      : 'Environnement FNE inconnu : ' + env });
    return;
  }
  if (!CHEMIN_AUTORISE.test(chemin)) {
    res.status(400).json({ error: 'bad_request', message: 'Chemin non autorisé : ' + chemin });
    return;
  }

  try {
    const upstream = await fetch(base + chemin, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': req.headers['authorization'] || ''
      },
      body: JSON.stringify(req.body || {})
    });
    const texte = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(texte);
  } catch (e) {
    res.status(502).json({ error: 'bad_gateway', message: 'Impossible de joindre la plateforme FNE (' + env + ') : ' + (e && e.message ? e.message : String(e)) });
  }
};
