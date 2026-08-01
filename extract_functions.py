import re, json

with open("/home/claude/w/menko-immo-13-68.html", "r", encoding="utf-8", errors="replace") as f:
    html = f.read()

def extract_function(name, src):
    pat = re.compile(r'(?:async\s+)?function\s+' + re.escape(name) + r'\s*\(')
    m = pat.search(src)
    if not m:
        raise ValueError("not found: " + name)
    start = m.start()
    brace_start = src.index('{', m.end())
    depth = 0
    i = brace_start
    while i < len(src):
        if src[i] == '{': depth += 1
        elif src[i] == '}':
            depth -= 1
            if depth == 0:
                return src[start:i+1]
        i += 1
    raise ValueError("unbalanced: " + name)

m = re.search(r"var CHAMPS_SENSIBLES = \{.*?\n\};", html, re.S)
champs_sensibles_src = m.group(0)

names = [
    "today", "uid", "genererCodeDossier",
    "totalPayePrix", "_versementSurPrix", "majStatutLotClient",
    "logAudit", "auditHistorique", "saveClient",
    "ecrLignes", "_getExerciceCoutGestion", "saveExerciceCoutGestion",
    "_appliquerSnapshotCoutGestion", "calculerCoutGestionLots", "figerExerciceCoutGestion",
    "updateLotsByProgramme",
]

out = []
for n in names:
    out.append(extract_function(n, html))

with open("/home/claude/w/tests/extracted_functions.js", "w", encoding="utf-8") as f:
    f.write("// Fonctions EXTRAITES TELLES QUELLES de menko-immo-13-68.html (aucune réécriture)\n")
    f.write("// Régénéré par extract_functions.py — ne pas éditer à la main.\n\n")
    f.write(champs_sensibles_src)
    f.write("\n\n")
    f.write("\n\n".join(out))
    f.write("\n\nmodule.exports = { today, uid, genererCodeDossier, totalPayePrix, _versementSurPrix, majStatutLotClient, logAudit, auditHistorique, saveClient, ecrLignes, _getExerciceCoutGestion, saveExerciceCoutGestion, _appliquerSnapshotCoutGestion, calculerCoutGestionLots, figerExerciceCoutGestion, updateLotsByProgramme };\n")

print("OK — %d fonctions extraites" % len(names))
