// Harness de test — injecte les globals nécessaires (DATA, APP, dbPut, DOM…)
// dans le scope global AVANT de charger extracted_functions.js, qui contient
// le code RÉEL extrait de menko-immo-13-68.html (pas de réimplémentation).
const { JSDOM } = require('jsdom');

function freshHarness() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="cmz-cout-gestion-note"></div>
    <input id="c-nom"><input id="c-tel"><input id="c-prenoms"><input id="c-ddn">
    <input id="c-nationalite"><input id="c-matrimonial"><input id="c-profession">
    <input id="c-email"><input id="c-adresse"><input id="c-piece-type"><input id="c-piece-num">
    <select id="c-programme"><option value="">--</option><option value="prog1">Programme 1</option><option value="p1">Programme P1</option></select>
    <select id="c-lot"><option value="">--</option><option value="l1">Lot 1</option><option value="l2">Lot 2</option></select>
    <input id="c-type-logement"><select id="c-mode-livraison"><option value="gros_oeuvre">Gros œuvre</option></select>
    <select id="c-standing"><option value="moyen">Moyen</option></select>
    <input id="c-montant-total" value="0"><input id="c-apport" value="0"><input id="c-duree" value="60">
    <input id="c-date-debut">
    <select id="c-commercial"><option value="">--</option><option value="comm1">Jean Dupont</option></select>
    <select id="c-apporteur"><option value="">--</option></select>
  </body></html>`);
  global.document = dom.window.document;
  global.window = dom.window;
  global.crypto = dom.window.crypto;

  const calls = { dbPut: [], syncToSupabase: [], toast: [], comptaVente: [], comptaSuppr: [], closeModal: [], renderClients: 0, refreshDashboard: 0 };

  global.DATA = { clients: [], lots: [], versements: [], programmes: [], apporteurs: [], params: {}, audit_log: [], cout_gestion_exercices: [], ecritures: [] };
  global.APP = { currentUser: { nom: 'Test User' }, editingId: null, _savingClient: false, _clientBaseModifie: null };

  global.dbPut = async (store, obj) => { calls.dbPut.push({ store, obj: JSON.parse(JSON.stringify(obj)) }); return obj; };
  global.syncToSupabase = (table, obj) => { calls.syncToSupabase.push({ table, obj }); };
  global.toast = (msg, type) => { calls.toast.push({ msg, type }); };
  global.confirm = () => true;
  global.fmtF = (n) => new Intl.NumberFormat('fr-FR').format(n || 0);
  global.renderMargeLots = () => {};
  global.comptabiliserVenteTerrain = async (lot) => { calls.comptaVente.push(lot.id); };
  global.supprimerVenteTerrain = async (lotId) => { calls.comptaSuppr.push(lotId); };
  global.closeModal = (id) => { calls.closeModal.push(id); };
  global.renderClients = () => { calls.renderClients++; };
  global.refreshDashboard = () => { calls.refreshDashboard++; };

  // Recharge le module à chaque test pour repartir d'un scope propre
  delete require.cache[require.resolve('./extracted_functions.js')];
  const fns = require('./extracted_functions.js');
  return { fns, calls, dom };
}

// Helper : remplit le formulaire souscripteur pour les tests de saveClient()
function remplirFormClient(dom, values) {
  const d = dom.window.document;
  Object.keys(values).forEach((id) => {
    const el = d.getElementById(id);
    if (el) el.value = values[id];
  });
}

module.exports = { freshHarness, remplirFormClient };
