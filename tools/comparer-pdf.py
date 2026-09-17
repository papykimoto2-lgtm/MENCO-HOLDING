# -*- coding: utf-8 -*-
"""Compare page a page le rendu de deux PDF. Sort en erreur si l'ecart derape."""
import io, math, sys, pymupdf
from PIL import Image, ImageChops

A, B = sys.argv[1], sys.argv[2]
SEUIL = float(sys.argv[3]) if len(sys.argv) > 3 else 8.0

a, b = pymupdf.open(A), pymupdf.open(B)
if a.page_count != b.page_count:
    raise SystemExit('ARRET : %d pages contre %d.' % (a.page_count, b.page_count))

ecarts = []
for i in range(a.page_count):
    ia = Image.open(io.BytesIO(a[i].get_pixmap(dpi=72).tobytes('png'))).convert('RGB')
    ib = Image.open(io.BytesIO(b[i].get_pixmap(dpi=72).tobytes('png'))).convert('RGB')
    if ia.size != ib.size:
        raise SystemExit('ARRET : page %d de taille differente.' % (i + 1))
    h = ImageChops.difference(ia, ib).convert('L').histogram()
    n = sum(h)
    ecarts.append((math.sqrt(sum(v * k * k for k, v in enumerate(h)) / n), i + 1))

ecarts.sort(reverse=True)
print('texte : %d caracteres avant, %d apres'
      % (sum(len(p.get_text()) for p in a), sum(len(p.get_text()) for p in b)))
print('ecart RMS (0 = rendu identique) — 5 pires pages : %s'
      % ', '.join('p%d %.1f' % (p, e) for e, p in ecarts[:5]))
depasse = [p for e, p in ecarts if e > SEUIL]
if depasse:
    print('ATTENTION : au-dela du seuil %.1f sur les pages %s — a controler a l oeil.' % (SEUIL, depasse))
    return_code = 1
else:
    print('OK : aucune page au-dela du seuil %.1f.' % SEUIL)
    return_code = 0
sys.exit(return_code)
