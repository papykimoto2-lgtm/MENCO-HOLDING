const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshHarness } = require('./harness');

describe('majStatutLotClient — seuil d\'immobilisation & historique (§4.2 / §4.5)', () => {
  test('reste "reserve" sous le seuil (70% par défaut)', async () => {
    const { fns } = freshHarness();
    fns.DATA = global.DATA;
    global.DATA.clients = [{ id: 'c1', lot_id: 'l1', montant_total: 100000 }];
    global.DATA.lots = [{ id: 'l1', statut: 'disponible' }];
    global.DATA.versements = [{ client_id: 'c1', montant: 50000, type: 'principal' }]; // 50%

    const res = await fns.majStatutLotClient('c1');
    assert.equal(res, 'reserve');
    assert.equal(global.DATA.lots[0].statut, 'reserve');
    assert.equal(global.DATA.lots[0].client_id, 'c1');
  });

  test('passe "vendu" au-delà du seuil', async () => {
    const { fns } = freshHarness();
    global.DATA.clients = [{ id: 'c1', lot_id: 'l1', montant_total: 100000 }];
    global.DATA.lots = [{ id: 'l1', statut: 'reserve', client_id: 'c1' }];
    global.DATA.versements = [{ client_id: 'c1', montant: 75000, type: 'principal' }]; // 75%

    const res = await fns.majStatutLotClient('c1');
    assert.equal(res, 'vendu');
    assert.equal(global.DATA.lots[0].statut, 'vendu');
  });

  test('respecte un seuil personnalisé (paramètre)', async () => {
    const { fns } = freshHarness();
    global.DATA.params = { seuil_immobilisation_pct: 50 };
    global.DATA.clients = [{ id: 'c1', lot_id: 'l1', montant_total: 100000 }];
    global.DATA.lots = [{ id: 'l1', statut: 'disponible' }];
    global.DATA.versements = [{ client_id: 'c1', montant: 55000, type: 'principal' }]; // 55%

    const res = await fns.majStatutLotClient('c1');
    assert.equal(res, 'vendu'); // 55% >= seuil 50% → vendu
  });

  test('exclut les frais de souscription du calcul du seuil (régression connue)', async () => {
    const { fns } = freshHarness();
    global.DATA.clients = [{ id: 'c1', lot_id: 'l1', montant_total: 100000 }];
    global.DATA.lots = [{ id: 'l1', statut: 'disponible' }];
    global.DATA.versements = [
      { client_id: 'c1', montant: 20000, type: 'frais_souscription' }, // ne compte pas
      { client_id: 'c1', montant: 40000, type: 'principal' }           // 40% seul compte
    ];

    const res = await fns.majStatutLotClient('c1');
    assert.equal(res, 'reserve'); // 40% < 70%, malgré 60000 encaissé au total
  });

  test('§4.5 — écrit historique_statuts à chaque changement, avec avant/après/user', async () => {
    const { fns } = freshHarness();
    global.DATA.clients = [{ id: 'c1', lot_id: 'l1', montant_total: 100000 }];
    global.DATA.lots = [{ id: 'l1', statut: 'disponible' }];
    global.DATA.versements = [{ client_id: 'c1', montant: 50000, type: 'principal' }];

    await fns.majStatutLotClient('c1');
    const lot = global.DATA.lots[0];
    assert.equal(lot.historique_statuts.length, 1);
    assert.equal(lot.historique_statuts[0].ancien, 'disponible');
    assert.equal(lot.historique_statuts[0].nouveau, 'reserve');
    assert.equal(lot.historique_statuts[0].client_id, 'c1');
    assert.equal(lot.historique_statuts[0].user, 'Test User');

    // Un second versement fait franchir le seuil → 2e entrée d'historique
    global.DATA.versements.push({ client_id: 'c1', montant: 30000, type: 'principal' }); // total 80%
    await fns.majStatutLotClient('c1');
    assert.equal(lot.historique_statuts.length, 2);
    assert.equal(lot.historique_statuts[1].ancien, 'reserve');
    assert.equal(lot.historique_statuts[1].nouveau, 'vendu');
  });

  test('§4.2 — date_reservation posée une seule fois, pas réécrasée sur relance du même client', async () => {
    const { fns } = freshHarness();
    global.DATA.clients = [{ id: 'c1', lot_id: 'l1', montant_total: 100000 }];
    global.DATA.lots = [{ id: 'l1', statut: 'disponible' }];
    global.DATA.versements = [{ client_id: 'c1', montant: 10000, type: 'principal' }];
    await fns.majStatutLotClient('c1');
    const dateInitiale = global.DATA.lots[0].date_reservation;
    assert.ok(dateInitiale);

    // Deuxième appel, toujours "reserve", même client → statut inchangé → pas de nouvelle entrée d'historique
    await fns.majStatutLotClient('c1');
    assert.equal(global.DATA.lots[0].historique_statuts.length, 1, 'aucun changement réel = pas de bruit dans l\'historique');
  });

  test('pas d\'action si le client n\'a pas de lot rattaché', async () => {
    const { fns } = freshHarness();
    global.DATA.clients = [{ id: 'c1', lot_id: null, montant_total: 100000 }];
    const res = await fns.majStatutLotClient('c1');
    assert.equal(res, undefined);
  });
});

describe('logAudit / auditHistorique — traçabilité clients & versements', () => {
  test('action "create" journalisée sans diff de champs', async () => {
    const { fns } = freshHarness();
    await fns.logAudit('clients', 'c1', 'create', null, { id: 'c1', statut: 'actif' });
    assert.equal(global.DATA.audit_log.length, 1);
    assert.equal(global.DATA.audit_log[0].action, 'create');
    assert.equal(global.DATA.audit_log[0].modifs.length, 0);
  });

  test('"update" ne journalise QUE les champs sensibles réellement modifiés', async () => {
    const { fns } = freshHarness();
    const avant = { statut: 'actif', lot_id: 'l1', montant_total: 100000, profession: 'Ingénieur' };
    const apres = { statut: 'actif', lot_id: 'l2', montant_total: 100000, profession: 'Médecin' };
    await fns.logAudit('clients', 'c1', 'update', avant, apres);
    assert.equal(global.DATA.audit_log.length, 1);
    const modifs = global.DATA.audit_log[0].modifs;
    assert.equal(modifs.length, 1, 'seul lot_id est un champ sensible ET a changé — profession n\'est pas surveillé');
    assert.equal(modifs[0].champ, 'lot_id');
    assert.equal(modifs[0].avant, 'l1');
    assert.equal(modifs[0].apres, 'l2');
  });

  test('"update" sans changement sensible ne crée AUCUNE entrée (anti-bruit)', async () => {
    const { fns } = freshHarness();
    const avant = { statut: 'actif', lot_id: 'l1', profession: 'Ingénieur' };
    const apres = { statut: 'actif', lot_id: 'l1', profession: 'Médecin' }; // seul un champ non-sensible change
    await fns.logAudit('clients', 'c1', 'update', avant, apres);
    assert.equal(global.DATA.audit_log.length, 0);
  });

  test('"delete" conserve un snapshot complet', async () => {
    const { fns } = freshHarness();
    const snap = { id: 'v1', montant: 50000, client_id: 'c1' };
    await fns.logAudit('versements', 'v1', 'delete', snap, null);
    assert.deepEqual(global.DATA.audit_log[0].snapshot, snap);
  });

  test('auditHistorique filtre par entité+id et trie du plus récent au plus ancien', async () => {
    const { fns } = freshHarness();
    global.DATA.audit_log = [
      { entite: 'clients', entite_id: 'c1', date: '2026-01-01T00:00:00Z' },
      { entite: 'clients', entite_id: 'c1', date: '2026-06-01T00:00:00Z' },
      { entite: 'clients', entite_id: 'c2', date: '2026-03-01T00:00:00Z' },
    ];
    const hist = fns.auditHistorique('clients', 'c1');
    assert.equal(hist.length, 2);
    assert.equal(hist[0].date, '2026-06-01T00:00:00Z'); // le plus récent en premier
  });
});

describe('Coût de gestion analytique — répartition & figeage par exercice', () => {
  function ecrituresExemple(year) {
    return [
      // Frais fonctionnels : compte 64 (personnel siège) = 1 000 000 débit
      { date: `${year}-02-01`, lignes: [{ compte: '641', sens: 'D', montant: 1000000 }, { compte: '521', sens: 'C', montant: 1000000 }] },
      // Compte 62 (services extérieurs) = 500 000 débit
      { date: `${year}-03-01`, lignes: [{ compte: '622', sens: 'D', montant: 500000 }, { compte: '521', sens: 'C', montant: 500000 }] },
      // Commission directe 629 — DOIT être exclue du calcul
      { date: `${year}-04-01`, lignes: [{ compte: '629', sens: 'D', montant: 300000 }, { compte: '521', sens: 'C', montant: 300000 }] },
      // Hors exercice — DOIT être exclue
      { date: `${year - 1}-12-01`, lignes: [{ compte: '641', sens: 'D', montant: 999999 }, { compte: '521', sens: 'C', montant: 999999 }] },
    ];
  }

  test('répartit au prorata surface, exclut 629 et les écritures hors exercice', () => {
    const { fns } = freshHarness();
    const year = new Date().getFullYear();
    global.DATA.ecritures = ecrituresExemple(year);
    global.DATA.lots = [
      { id: 'l1', statut: 'disponible', surface: 300, cout_revient: 10000000 },
      { id: 'l2', statut: 'reserve', surface: 200, cout_revient: 8000000 },
      { id: 'l3', statut: 'vendu', surface: 0, cout_revient: 5000000 }, // surface nulle
    ];

    fns.calculerCoutGestionLots();

    // Total frais fonctionnels attendu : 1 000 000 + 500 000 = 1 500 000 (629 et N-1 exclus)
    const totalAttendu = 1500000;
    const sumSurf = 500; // 300+200+0
    const l1 = global.DATA.lots[0], l2 = global.DATA.lots[1], l3 = global.DATA.lots[2];

    assert.equal(l1._coutGestionIndirect, Math.round(totalAttendu * 300 / sumSurf));
    assert.equal(l2._coutGestionIndirect, Math.round(totalAttendu * 200 / sumSurf));
    assert.equal(l1._coutGestionComplet, l1.cout_revient + l1._coutGestionIndirect);

    // Snapshot brouillon persisté, non figé
    const exo = fns._getExerciceCoutGestion(year);
    assert.ok(exo);
    assert.equal(exo.fige, false);
    assert.equal(exo.total_frais_fonctionnels, totalAttendu);
  });

  test('figerExerciceCoutGestion verrouille et logAudit trace le figeage', async () => {
    const { fns } = freshHarness();
    const year = new Date().getFullYear();
    global.DATA.ecritures = ecrituresExemple(year);
    global.DATA.lots = [{ id: 'l1', statut: 'disponible', surface: 100, cout_revient: 1000000 }];

    fns.calculerCoutGestionLots();
    await fns.figerExerciceCoutGestion();

    const exo = fns._getExerciceCoutGestion(year);
    assert.equal(exo.fige, true);
    assert.ok(exo.date_figeage);
    assert.equal(global.DATA.audit_log.some(e => e.entite === 'cout_gestion_exercices'), true);
  });

  test('figer deux fois de suite ne double-figé pas (idempotent, avertit simplement)', async () => {
    const { fns } = freshHarness();
    const year = new Date().getFullYear();
    global.DATA.ecritures = ecrituresExemple(year);
    global.DATA.lots = [{ id: 'l1', statut: 'disponible', surface: 100, cout_revient: 1000000 }];

    fns.calculerCoutGestionLots();
    await fns.figerExerciceCoutGestion();
    const dateFigeage1 = fns._getExerciceCoutGestion(year).date_figeage;

    await fns.figerExerciceCoutGestion(); // second appel — doit no-op (déjà figé)
    const dateFigeage2 = fns._getExerciceCoutGestion(year).date_figeage;
    assert.equal(dateFigeage1, dateFigeage2, 'le second figeage ne doit pas écraser le premier');
  });

  test('_appliquerSnapshotCoutGestion réinjecte les valeurs figées sur les lots', () => {
    const { fns } = freshHarness();
    const year = new Date().getFullYear();
    const exo = {
      annee: year, fige: true, date_figeage: new Date().toISOString(), user_figeage: 'Test',
      total_frais_fonctionnels: 1500000,
      details: [{ lot_id: 'lX', surface: 100, quote_part: 12345, cout_gestion_complet: 999999 }]
    };
    global.DATA.lots = [{ id: 'lX', cout_revient: 800000 }];
    fns._appliquerSnapshotCoutGestion(exo);
    assert.equal(global.DATA.lots[0]._coutGestionIndirect, 12345);
    assert.equal(global.DATA.lots[0]._coutGestionComplet, 999999);
  });
});
