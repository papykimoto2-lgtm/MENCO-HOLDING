// ═══════════════════════════════════════════════════════════════════════
// portal-login — module d'authentification unifié pour les 7 kinds
// ImmoSuite ERP — Sanix Africa
//
// À intégrer dans l'Edge Function portal-login existante. Remplace les
// implémentations par kind par un résolveur unique piloté par table.
//
// DEUX PROBLÈMES CORRIGÉS ICI
//
// 1. L'identifiant de connexion diffère d'un acteur à l'autre : n° de dossier
//    pour les souscripteurs et acquéreurs fonciers, email pour les apporteurs
//    et copropriétaires, téléphone pour les mandants et partenaires. Un
//    acquéreur qui saisit son téléphone échoue alors que son numéro figure
//    bien dans sa fiche. On accepte désormais TOUS les identifiants présents
//    sur la fiche, quel que soit le kind.
//
// 2. Les numéros ivoiriens sont saisis de façons variables : « 07 79 18 10 75 »,
//    « +22507791075 », « 0779181075 ». Sans normalisation, un acteur qui ne
//    reproduit pas exactement la saisie d'origine ne se connecte jamais.
//
// VÉRIFIÉ CONTRE L'ERP : hashPassword(code, salt) = SHA-256(code + salt),
// sans itérations, sel de 32 octets en hexadécimal. hashCode() ci-dessous en
// est la réplique exacte. Si hashPassword change côté ERP, changer ici aussi.
// ═══════════════════════════════════════════════════════════════════════

async function hashCode(code: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(code + salt);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Comparaison à temps constant : évite de laisser fuiter la validité d'un
// préfixe de hash par la durée de la réponse.
function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Normalise un identifiant pour la comparaison. Les emails passent en
// minuscules ; les téléphones perdent l'indicatif pays et la mise en forme.
//
// L'indicatif est retiré EXPLICITEMENT plutôt qu'en gardant les 10 derniers
// chiffres : la Côte d'Ivoire a migré de 8 à 10 chiffres, et les deux formats
// coexistent dans les fiches anciennes. Sur un ancien numéro préfixé
// (+225 07 79 10 75), un découpage aveugle des 10 derniers chiffres emporte
// une partie de l'indicatif et produit un identifiant qui ne correspond plus
// à rien.
function normIdent(s: unknown): string {
  const v = String(s ?? "").trim().toLowerCase();
  if (!v) return "";
  if (v.includes("@")) return v;

  // Ressemble-t-il à un téléphone (chiffres et ponctuation de mise en forme) ?
  if (!/^[\d\s+().-]+$/.test(v)) return v.replace(/[\s-]/g, "");

  let digits = v.replace(/\D/g, "");
  if (digits.length < 6) return digits;   // trop court : n° de dossier numérique

  // Retirer l'indicatif ivoirien s'il précède un numéro de longueur plausible
  if (digits.startsWith("225") && digits.length > 10) digits = digits.slice(3);
  // Autres indicatifs (diaspora : 33 France, 1 USA/Canada, 44 UK…) : on ne
  // devine pas, on garde les 10 derniers chiffres si c'est manifestement long.
  else if (digits.length > 11) digits = digits.slice(-10);

  return digits;
}

// ── Carte des kinds ────────────────────────────────────────────────────────
// Pour chaque kind : la table, les champs pouvant servir d'identifiant, et si
// les acteurs sont imbriqués dans un tableau JSON plutôt qu'en lignes.
// Les champs d'identifiant reprennent EXACTEMENT ceux des générateurs de code
// de l'ERP — vérifiés un par un.
const KINDS: Record<string, {
  table: string;
  identFields: string[];
  nested?: string;      // clé du tableau imbriqué (propriétaires terriens)
  idClaim: string;      // nom du claim porté par le JWT
}> = {
  souscripteur: {
    table: "pi_clients",
    identFields: ["dossier", "tel", "email"],
    idClaim: "client_id",
  },
  apporteur: {
    table: "pi_apporteurs",
    identFields: ["email", "tel"],
    idClaim: "apporteur_id",
  },
  foncier: {
    table: "pi_cessions_foncieres",
    identFields: ["dossier", "tel", "email"],
    idClaim: "cession_id",
  },
  mandant: {
    table: "pi_proprietaires_bailleurs",
    identFields: ["tel", "email"],
    idClaim: "proprietaire_id",
  },
  coproprietaire: {
    table: "pi_lots_copro",
    identFields: ["proprietaire_email", "proprietaire_tel"],
    idClaim: "lot_id",
  },
  partenaire_lot: {
    table: "pi_partenaires_lot",
    identFields: ["tel", "email"],
    idClaim: "partenaire_id",
  },
  proprio_foncier: {
    table: "pi_af_operations",
    identFields: ["contact"],
    nested: "proprietaires",
    idClaim: "prop_id",
  },
  amenageur: {
    table: "pi_amenageurs",
    identFields: ["tel", "email"],
    idClaim: "amenageur_id",
  },
};

// ── Résolveur unique ──────────────────────────────────────────────────────
export async function resolvePortalLogin(
  supabaseAdmin: any,
  kind: string,
  ident: string,
  code: string,
) {
  const cfg = KINDS[kind];
  if (!cfg) throw new Error("auth");

  const cible = normIdent(ident);
  if (!cible || !code) throw new Error("auth");

  const { data: rows, error } = await supabaseAdmin
    .from(cfg.table)
    .select("id,data");
  if (error) throw new Error("auth");

  for (const row of rows || []) {
    const base = row.data || {};

    // Cas imbriqué : les propriétaires terriens vivent dans un tableau JSON
    // à l'intérieur de l'opération, pas en lignes de table.
    const candidats = cfg.nested
      ? (base[cfg.nested] || []).map((p: any) => ({ rec: p, parentId: row.id }))
      : [{ rec: base, parentId: row.id }];

    for (const { rec, parentId } of candidats) {
      if (!rec?.code_acces_hash || !rec?.code_acces_salt) continue;

      // On accepte n'importe lequel des identifiants présents sur la fiche :
      // l'acteur ne sait pas lequel on attend de lui.
      const matches = cfg.identFields.some(
        (f) => rec[f] && normIdent(rec[f]) === cible,
      );
      if (!matches) continue;

      const h = await hashCode(code, rec.code_acces_salt);
      if (!safeEqual(h, rec.code_acces_hash)) continue;

      return {
        kind,
        id: cfg.nested ? (rec.id ?? parentId) : parentId,
        parent_id: parentId,
        idClaim: cfg.idClaim,
        nom: rec.nom ?? rec.raison_sociale ?? rec.proprietaire_nom ?? rec.acquereur ?? "",
      };
    }
  }
  throw new Error("auth");
}

// ═══════════════════════════════════════════════════════════════════════
// CÂBLAGE dans le handler
//
//   const res = await resolvePortalLogin(supabaseAdmin, kind, ident, code);
//   const claims: Record<string, string> = {
//     role: "authenticated",
//     portal_kind: res.kind,
//     [res.idClaim]: String(res.id),
//   };
//   // prop_id et partenaire_id sont attendus par les vues RLS
//   if (res.kind === "proprio_foncier") claims.prop_id = String(res.id);
//   if (res.kind === "partenaire_lot")  claims.partenaire_id = String(res.id);
//   if (res.kind === "amenageur")       claims.amenageur_id = String(res.id);
//   const token = await signPortalJWT(claims);
//   return json({ access_token: token, kind: res.kind, id: res.id, nom: res.nom });
//
// ── RATE LIMITING : NE PAS RETIRER ────────────────────────────────────────
// Un code à 6 chiffres = 10^6 combinaisons, cassables en quelques minutes par
// script. Le compteur de 5 tentatives du portail vit dans le localStorage du
// navigateur : il ne protège rien contre un appel direct à cette fonction.
// La limitation serveur (HTTP 429) est la SEULE protection réelle. Limiter par
// couple (ident, IP), pas par ident seul, et conserver un délai croissant.
//
// ── PERFORMANCE ───────────────────────────────────────────────────────────
// Ce résolveur fait un SELECT complet de la table puis filtre en mémoire, car
// les identifiants vivent dans des colonnes JSON non indexées. Acceptable au
// volume actuel. Au-delà de quelques milliers de lignes par table, ajouter un
// index d'expression, par exemple :
//   CREATE INDEX idx_clients_dossier ON pi_clients ((data->>'dossier'));
// et filtrer côté SQL avant la boucle.
// ═══════════════════════════════════════════════════════════════════════
