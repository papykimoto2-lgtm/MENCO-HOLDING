/* Foncier rural — pièces jointes de fiche : joindre, modifier, remplacer, supprimer (motif). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

test('pièces de fiche : cycle complet', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    var T = [], o = {};
    window.toast = function (m) { T.push(m); }; window.fcDroitEcriture = function () { return true; };
    window.fcDb = async function () { return true; }; window.logAction = function () {}; window._fonJournal = async function () {}; window.fonRuralRender = function () {};
    window.fcLireFichier = async function (f) { return { nom: f.name, type: 'application/pdf', taille: 10, contenu: 'data:application/pdf;base64,JVBERi0=' }; };
    window.fcValiderFichier = function () { return ''; };
    DATA.pieces_foncieres = []; DATA.enquetes_fonciers = [{ id: 'e1', reference: 'ENQ-1', dossier_id: 'd1', parcelle_id: 'p1', statut: 'ouverte' }];
    DATA.dossiers_fonciers = [{ id: 'd1', reference: 'DF-1', parcelle_id: 'p1', statut: 'en_cours', etapes: [] }];
    fonFicheOuvrir('enquetes', 'e1');
    o.formulaire = !!document.getElementById('fonf-fichier');
    /* joindre : le champ fichier est un <input file> : on simule via DataTransfer */
    var dt = new DataTransfer(); dt.items.add(new File(['%PDF-'], 'pv.pdf', { type: 'application/pdf' }));
    document.getElementById('fonf-fichier').files = dt.files; document.getElementById('fonf-note').value = 'PV signé';
    await fonFicheJoindre();
    var l = fonFichePieces('enquetes', 'e1'); o.apresAjout = l.length; o.dossier = l[0] && l[0].dossier_id; o.code = l[0] && l[0].etape_code;
    window.prompt = function (m, v) { return /Nom/.test(m) ? 'PV enquête signé' : 'note 2'; };
    await fonFicheModifier(l[0].id); o.nom = fcPiece(l[0].id).nom;
    window.prompt = function () { return ''; };
    await fonFicheRetirer(l[0].id); o.sansMotif = fonFichePieces('enquetes', 'e1').length;
    window.prompt = function () { return 'Doublon'; };
    await fonFicheRetirer(l[0].id); o.apresSuppression = fonFichePieces('enquetes', 'e1').length; o.conservee = fonFichePieces('enquetes', 'e1', true).length;
    o.bouton = _fonBtnsMoteur('enquetes', { id: 'e1' }).indexOf('fonFicheOuvrir') >= 0;
    return o;
  });
  assert.equal(r.formulaire, true); assert.equal(r.apresAjout, 1); assert.equal(r.dossier, 'd1'); assert.equal(r.code, 'fiche:enquetes:e1');
  assert.equal(r.nom, 'PV enquête signé'); assert.equal(r.sansMotif, 1); assert.equal(r.apresSuppression, 0); assert.equal(r.conservee, 1); assert.equal(r.bouton, true);
});
