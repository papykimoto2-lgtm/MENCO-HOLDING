# -*- coding: utf-8 -*-
"""Reduit le poids d'un PDF de presentation sans toucher au texte.

Le texte reste vectoriel — net a tout zoom, selectionnable, indexable. Seules
les images bitmap sont reechantillonnees a la resolution utile pour la page,
puis recompressees en JPEG progressif.

TRANSPARENCE — le piege de ce document, et la raison du code qui suit. Ses
photos lourdes portent leur canal alpha dans un objet PDF distinct (SMask), et
Page.replace_image() ecrit un objet neuf : la cle /SMask est perdue au passage,
sans erreur. Resultat des essais precedents : la zone transparente ressortait
en noir, ou aplatie sur un rectangle teinte. Le masque est donc simplement
rattache a la main apres remplacement — il pese 12 a 123 Ko, le recompresser
n'apporterait rien, et le lecteur le met a l'echelle de la base (PDF 32000-1,
8.9.6.4), leurs dimensions n'ont pas a coincider.

CONTROLE — compresser-verifier.py compare page par page le rendu avant/apres
(ecart RMS). Il ne remplace pas un coup d'oeil, mais il attrape ce genre de
degat silencieux.
"""
import io, os, sys, pymupdf
from PIL import Image

SRC, DST = sys.argv[1], sys.argv[2]
QUALITE  = int(sys.argv[3]) if len(sys.argv) > 3 else 72
FACTEUR  = float(sys.argv[4]) if len(sys.argv) > 4 else 1.5   # densite d'ecran visee
SEUIL_KO = 40                                                  # sous ce poids, on ne touche pas

d = pymupdf.open(SRC)

# Largeur d'affichage maximale de chaque image, et une page ou elle apparait.
cible, page_de = {}, {}
for page in d:
    for info in page.get_image_info(xrefs=True):
        x = info.get('xref')
        if not x:
            continue
        larg = (info['bbox'][2] - info['bbox'][0]) * FACTEUR
        if larg > cible.get(x, 0):
            cible[x], page_de[x] = larg, page.number

gagne = remplaces = rattaches = 0
for xref, larg in sorted(cible.items()):
    try:
        brut = d.extract_image(xref)
    except Exception:
        continue
    poids = len(brut['image'])
    if poids < SEUIL_KO * 1024:
        continue
    try:
        im = Image.open(io.BytesIO(brut['image']))
    except Exception:
        continue
    if im.mode in ('P', 'RGBA', 'LA'):
        continue                       # alpha dans le flux meme : on ne prend pas le risque

    if larg > 8 and im.width > larg:
        h = max(1, round(im.height * larg / im.width))
        im = im.resize((round(larg), h), Image.LANCZOS)
    t = io.BytesIO()
    im.convert('RGB').save(t, 'JPEG', quality=QUALITE, optimize=True, progressive=True)
    neuf = t.getvalue()
    if len(neuf) >= poids:
        continue                       # jamais alourdir

    masque = d.xref_get_key(xref, 'SMask')     # a relever AVANT le remplacement
    try:
        d[page_de[xref]].replace_image(xref, stream=neuf)
    except Exception as e:
        print('  ! xref %d non remplace : %s' % (xref, e))
        continue
    if masque and masque[0] == 'xref':
        d.xref_set_key(xref, 'SMask', masque[1])
        if d.xref_get_key(xref, 'SMask')[0] != 'xref':
            raise SystemExit('ARRET : masque %s non rattache a l image %d.' % (masque[1], xref))
        rattaches += 1
    gagne += poids - len(neuf)
    remplaces += 1

d.save(DST, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, clean=True)
print('%d image(s) recompressee(s), dont %d masque(s) rattache(s) — %.1f Mo gagnes' % (remplaces, rattaches, gagne / 1048576))
print('avant : %.2f Mo   apres : %.2f Mo (%.0f %% du poids d origine)'
      % (os.path.getsize(SRC) / 1048576, os.path.getsize(DST) / 1048576,
         100.0 * os.path.getsize(DST) / os.path.getsize(SRC)))
