// ═══════════════════════════════════════════════════════════════════════
// PATCH à intégrer dans l'Edge Function existante : portal-login
// Ajoute le support de kind = 'proprio_foncier'
//
// Particularité de ce kind : les propriétaires terriens ne sont PAS dans une
// table dédiée. Ils vivent dans pi_af_operations.data.proprietaires[] — un
// tableau JSON imbriqué. Il faut donc parcourir les opérations et chercher
// dans chaque tableau, là où les autres kinds font un simple SELECT ... WHERE.
//
// Le code d'accès est un code à 6 chiffres stocké hashé côté ERP :
//   code_acces_hash = SHA-256(code + salt)  |  code_acces_salt
// La fonction hashPassword de l'ERP doit être répliquée à l'identique ici,
// sinon aucun code généré depuis l'ERP ne sera reconnu. VÉRIFIER le nombre
// d'itérations utilisé par hashPassword() dans menko-immo.html avant de
// déployer — le stub ci-dessous suppose un SHA-256 simple sur (code + salt).
// ═══════════════════════════════════════════════════════════════════════

// ── Helper de hash : DOIT correspondre exactement à hashPassword() de l'ERP ──
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
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Normalise un contact pour la comparaison : les numéros ivoiriens sont saisis
// tantôt "07 79 18 10 75", tantôt "+22507791075", tantôt "0779181075".
// Sans normalisation, un propriétaire saisissant son numéro autrement qu'à la
// création ne se connecterait jamais.
function normContact(s: string): string {
  const v = String(s || "").trim().toLowerCase();
  if (v.includes("@")) return v;
  const digits = v.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// ── Bloc à insérer dans le switch/if principal de portal-login ──────────────
export async function loginProprioFoncier(
  supabaseAdmin: any,
  ident: string,
  code: string,
) {
  const cible = normContact(ident);
  if (!cible || !code) throw new Error("auth");

  // On ne peut pas filtrer côté SQL sur un tableau JSON imbriqué de façon
  // fiable et indexée : on récupère les opérations avec au moins un
  // propriétaire porteur d'un code, puis on filtre en mémoire.
  const { data: ops, error } = await supabaseAdmin
    .from("pi_af_operations")
    .select("id,data");
  if (error) throw new Error("auth");

  for (const op of ops || []) {
    const props = (op.data && op.data.proprietaires) || [];
    for (const p of props) {
      if (!p.code_acces_hash || !p.code_acces_salt) continue;
      if (normContact(p.contact) !== cible) continue;
      const h = await hashCode(code, p.code_acces_salt);
      if (!safeEqual(h, p.code_acces_hash)) continue;

      // Succès : on émet le JWT portail avec le claim du kind, comme pour
      // les autres espaces. prop_id sert au filtrage côté client ET aux
      // policies RLS ci-dessous.
      return {
        kind: "proprio_foncier",
        id: p.id,
        prop_id: p.id,
        operation_id: op.id,
        nom: p.nom || "",
      };
    }
  }
  throw new Error("auth");
}

// ═══════════════════════════════════════════════════════════════════════
// INTÉGRATION dans le handler existant — exemple de câblage
//
//   if (kind === "proprio_foncier") {
//     const res = await loginProprioFoncier(supabaseAdmin, ident, code);
//     const token = await signPortalJWT({
//       role: "authenticated",
//       portal_kind: "proprio_foncier",
//       prop_id: res.prop_id,
//     });
//     return json({ access_token: token, ...res });
//   }
//
// Conserver le rate-limiting déjà en place (HTTP 429) : cet espace utilise un
// code à 6 chiffres, soit 10^6 combinaisons — sans limitation serveur, le
// garde-fou de 5 tentatives côté navigateur ne protège rien du tout puisqu'il
// vit dans le localStorage du client.
// ═══════════════════════════════════════════════════════════════════════
