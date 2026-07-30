// ═══════════════════════════════════════════════════════════════════════
// PATCH à intégrer dans l'Edge Function portal-login
// Ajoute le support de kind = 'partenaire_lot'
//
// Plus simple que proprio_foncier : les partenaires vivent dans leur propre
// table (pi_partenaires_lot), pas dans un tableau JSON imbriqué. On peut donc
// filtrer côté SQL.
//
// Le code d'accès suit le même schéma que le foncier :
//   code_acces_hash = hash(code + salt)  |  code_acces_salt
// Réutiliser EXACTEMENT le même hashCode() que pour proprio_foncier, et
// vérifier qu'il correspond à hashPassword() de l'ERP avant de déployer.
// ═══════════════════════════════════════════════════════════════════════

async function hashCode(code: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(code + salt);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Numéros ivoiriens saisis de façons variables : "07 79 18 10 75",
// "+22507791075", "0779181075" doivent tous matcher.
function normContact(s: string): string {
  const v = String(s || "").trim().toLowerCase();
  if (v.includes("@")) return v;
  const digits = v.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export async function loginPartenaireLot(
  supabaseAdmin: any,
  ident: string,
  code: string,
) {
  const cible = normContact(ident);
  if (!cible || !code) throw new Error("auth");

  const { data: rows, error } = await supabaseAdmin
    .from("pi_partenaires_lot")
    .select("id,data");
  if (error) throw new Error("auth");

  for (const row of rows || []) {
    const p = row.data || {};
    if (!p.code_acces_hash || !p.code_acces_salt) continue;
    // Le contact peut être un email OU un téléphone, et l'ERP autorise les
    // deux dans le même champ : on teste les deux formes normalisées.
    const contacts = [p.contact, p.email, p.telephone].filter(Boolean);
    if (!contacts.some((cc: string) => normContact(cc) === cible)) continue;
    const h = await hashCode(code, p.code_acces_salt);
    if (!safeEqual(h, p.code_acces_hash)) continue;

    return {
      kind: "partenaire_lot",
      id: row.id,
      partenaire_id: row.id,
      nom: p.nom || "",
    };
  }
  throw new Error("auth");
}

// ═══════════════════════════════════════════════════════════════════════
// CÂBLAGE dans le handler existant
//
//   if (kind === "partenaire_lot") {
//     const res = await loginPartenaireLot(supabaseAdmin, ident, code);
//     const token = await signPortalJWT({
//       role: "authenticated",
//       portal_kind: "partenaire_lot",
//       partenaire_id: res.partenaire_id,
//     });
//     return json({ access_token: token, ...res });
//   }
//
// Conserver le rate-limiting (HTTP 429) : un code à 6 chiffres = 10^6
// combinaisons. Le compteur de 5 tentatives du portail vit dans le
// localStorage du navigateur — il ne protège rien contre un script.
// ═══════════════════════════════════════════════════════════════════════
