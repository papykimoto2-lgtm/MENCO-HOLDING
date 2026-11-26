/* Génère docs/NOTE_DE_CALCUL_FONCIER.md depuis le registre FON_NOTES de l'ERP (source unique). Usage : node tools/gen_note_calcul_foncier.js */
const fs = require('fs'), path = require('path');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
(async () => {
  const app = await ouvrirApp();
  const d = await app.page.evaluate(() => ({ notes: FON_NOTES, liens: FON_LIENS, etapes: FON_ETAPES.map(e => ({ n: e.n, titre: e.titre, but: e.but })) }));
  await app.fermer(); await fermerNavigateur();
  const L = a => a.length ? a.map(x => '- ' + x).join('\n') : '- —';
  let o = '# Note de calcul — Module Foncier\n\n> Généré depuis le registre de l\'ERP (`FON_NOTES`). Ne pas modifier à la main : relancer `node tools/gen_note_calcul_foncier.js`.\n\n## Chaîne logistique foncière (9 étapes)\n\n| N° | Étape | But |\n|---|---|---|\n' + d.etapes.map(e => `| ${e.n} | ${e.titre} | ${e.but} |`).join('\n') + '\n';
  for (const k of Object.keys(d.notes)) {
    const n = d.notes[k];
    o += `\n## ${n.t}  \`${k}\`\n\n**À quoi ça sert.** ${n.but}\n\n**Comment faire**\n\n${n.how.map((x, i) => (i + 1) + '. ' + x).join('\n') || '—'}\n`;
    if (n.calculs.length) o += '\n**Calculs**\n\n| Calcul | Formule |\n|---|---|\n' + n.calculs.map(c => `| ${c[0]} | ${c[1]} |`).join('\n') + '\n';
    o += `\n**Règles appliquées**\n\n${L(n.regles)}\n\n**Reçoit de** : ${n.amont.join(' ; ') || '—'}\n\n**Alimente** : ${n.aval.join(' ; ') || '—'}\n`;
  }
  o += '\n## Carte des interconnexions\n\n| De | Vers | Ce qui circule |\n|---|---|---|\n' + d.liens.map(l => `| ${l[0]} | ${l[1]} | ${l[2]} |`).join('\n') + '\n';
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'NOTE_DE_CALCUL_FONCIER.md'), o);
  console.log('docs/NOTE_DE_CALCUL_FONCIER.md', o.length, 'octets');
})();
