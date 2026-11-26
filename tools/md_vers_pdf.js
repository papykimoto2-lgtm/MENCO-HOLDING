/* Markdown → PDF (pandoc + Chromium). Usage : node tools/md_vers_pdf.js docs/X.md "Titre" */
const { execFileSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
(async () => {
  const [md, titre] = process.argv.slice(2), out = md.replace(/\.md$/, '.pdf');
  const corps = execFileSync('pandoc', ['-f', 'gfm', '-t', 'html5', md], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const css = 'body{font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#111}h1{font-size:19pt;border-bottom:2px solid #8a5a1c;padding-bottom:4px}h2{font-size:14pt;color:#8a5a1c;margin-top:18px;page-break-after:avoid}h3{font-size:11.5pt}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:9.5pt}th,td{border:1px solid #bbb;padding:3px 6px;vertical-align:top}th{background:#f3ece0}code{background:#f4f4f4;padding:0 3px}tr{page-break-inside:avoid}';
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + titre + '</title><style>' + css + '</style></head><body>' + corps + '</body></html>';
  const tmp = path.join(os.tmpdir(), 'mdpdf-' + process.pid + '.html'); fs.writeFileSync(tmp, html);
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto('file://' + tmp); await p.pdf({ path: out, format: 'A4', margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }, printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#666;">' + titre + ' — <span class="pageNumber"></span>/<span class="totalPages"></span></div>' });
  await b.close(); fs.unlinkSync(tmp); console.log(out);
})();
