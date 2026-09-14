// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ SOURCE RÉCUPÉRÉE DEPUIS LE PROJET SUPABASE DE MENCO (version 4, déployée)
//
// Ce fichier est la copie fidèle de ce qui tourne réellement sur
// pxwgefdxgrskusjbzrxz. Il est CONSERVÉ TEL QUEL pour servir de référence.
//
// DEUX DÉFAUTS Y ONT ÉTÉ CONSTATÉS, corrigés depuis dans la version Zahara
// (v6) mais PAS ici. Vérifié contre le schéma réel de la base : la table
// pi_logs_connexion porte les colonnes { id, data jsonb, updated_at, scope_id }
// et AUCUNE colonne plate login / success / date.
//
//   1. Le compteur anti-force-brute filtre sur .eq("login"), .eq("success")
//      et .gte("date") — trois colonnes qui n'existent pas. La requête échoue,
//      `count` reste nul, et le verrou ne se déclenche donc JAMAIS. La
//      protection contre la force brute est inopérante.
//   2. Pour la même raison, les insertions dans pi_logs_connexion échouent :
//      aucune trace serveur des connexions, réussies ou non. L'audit est vide.
//
// La version Zahara lit et écrit ces champs sous data->>… et fonctionne. La
// corriger ici suppose d'adapter les requêtes au schéma jsonb ET de conserver
// l'origine CORS propre à Menco (https://erp-menko-holding.com), différente de
// celle de Zahara. Voir functions/staff-login/CONTRAT.md.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Edge Function : staff-login
// Authentification du personnel MENKO-IMMO côté serveur.
// - Le hash password n'est JAMAIS renvoyé au client.
// - Vérification SHA-256+sel (compatible existant) + upgrade PBKDF2 transparent.
// - Anti-brute-force réel : compte les échecs en base sur 24 h (pas localStorage).
//
// [FIX 2026-08-18] Le jeton émis auparavant (base64url(payload).hexsig, signé
// avec un secret maison STAFF_JWT_SECRET) n'était PAS un JWT valide au sens
// Supabase : format à 2 segments (pas 3), secret différent du secret réel du
// projet, champ "exp" en millisecondes au lieu de secondes. PostgREST ne
// pouvait donc JAMAIS le reconnaître comme authentifié — toute requête
// retombait en rôle "anon", quel que soit le succès de la connexion. Toute
// table dont la politique RLS exige explicitement le rôle "authenticated"
// (ex. pi_factures_fournisseur_attente) rejetait alors systématiquement les
// écritures avec une erreur 42501, même avec des identifiants corrects.
// Cette version signe un vrai JWT HS256 à 3 segments avec le secret réel du
// projet (Legacy JWT Secret, encore utilisé par Supabase pour VÉRIFIER les
// jetons), avec role="authenticated" — reconnu nativement par auth.jwt().
//
// [FIX 2026-08-18 bis] Deuxième bug trouvé en testant en conditions réelles :
// le client historique envoie { login, motdepasse } (français) alors que
// cette fonction attendait { login, password } (anglais) depuis TOUJOURS —
// bug présent dès la version d'origine, jamais remarqué car l'erreur 400
// générique masquait la vraie cause. Résultat concret : staff-login échouait
// systématiquement pour TOUT LE MONDE, indépendamment du mot de passe saisi.
// Déploiement : supabase functions deploy staff-login --no-verify-jwt
// Secrets requis : SERVICE_ROLE_KEY, SB_PROJECT_JWT_SECRET (Legacy JWT Secret
//                  du projet — Project Settings → JWT Keys → Legacy JWT Secret)
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SB_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROJECT_JWT_SECRET = Deno.env.get("SB_PROJECT_JWT_SECRET")!;
const MAX_ATTEMPTS = 5;                 // par login / 24 h
const TOKEN_TTL_SEC = 8 * 3600;         // 8 h — en SECONDES (norme JWT "exp")
const PBKDF2_ITER  = 210000;            // OWASP 2024 (SHA-256)

const CORS = {
  "Access-Control-Allow-Origin": "https://erp-menko-holding.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

// SHA-256(password + salt) — identique à hashPassword() côté client (rétro-compat)
async function sha256Salt(pwd: string, salt: string) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(pwd + salt)));
}
// PBKDF2-HMAC-SHA256 (nouveau standard)
async function pbkdf2(pwd: string, salt: string, iter: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pwd), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: iter }, key, 256);
  return toHex(bits);
}

// ── Émission d'un vrai JWT Supabase (HS256, 3 segments base64url) ───────────
function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function signSupabaseJwt(payload: Record<string, unknown>): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(PROJECT_JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

// Comparaison temps-constant
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let login = "", password = "";
  try {
    const body = await req.json();
    login = body.login || "";
    /* [FIX] Le client historique envoie "motdepasse" (français), pas "password"
       — incompatibilité présente dès la version d'origine de cette fonction,
       jamais remarquée car l'erreur 400 générique masquait la vraie cause.
       On accepte les deux noms, sans casser aucun appelant existant. */
    password = body.password || body.motdepasse || "";
  } catch { return json({ ok: false, error: "payload" }, 400); }
  login = (login || "").trim();
  if (!login || !password) return json({ ok: false, error: "champs" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // ── Anti-brute-force serveur : échecs sur 24 h ─────────────────────────────
  // ⚠️ INOPÉRANT : login / success / date ne sont pas des colonnes de cette
  //    table (schéma { id, data jsonb, updated_at, scope_id }). Voir l'en-tête.
  const { count } = await db.from("pi_logs_connexion")
    .select("id", { count: "exact", head: true })
    .eq("login", login).eq("success", false).gte("date", since);
  if ((count ?? 0) >= MAX_ATTEMPTS)
    return json({ ok: false, error: "bloque", message: "Trop de tentatives. Réessayez demain." }, 429);

  const logFail = (detail: string) =>
    db.from("pi_logs_connexion").insert({
      id: crypto.randomUUID(), login, success: false, date: new Date().toISOString(),
      detail, userAgent: (req.headers.get("user-agent") || "").slice(0, 120), ip_hint: "",
    });

  // ── Recherche utilisateur ──────────────────────────────────────────────────
  const { data: user } = await db.from("pi_users").select("*").eq("login", login).maybeSingle();
  if (!user) { await logFail("Identifiant introuvable"); return json({ ok: false, error: "invalide" }, 401); }
  if (user.statut && user.statut !== "actif") {
    await logFail("Compte inactif"); return json({ ok: false, error: "inactif" }, 403);
  }

  // ── Vérification mot de passe (PBKDF2 ou SHA-256 legacy) ────────────────────
  let valid = false, upgrade = false;
  if (user.pwd_algo === "pbkdf2" && user.password_hash && user.salt) {
    valid = safeEq(await pbkdf2(password, user.salt, user.pwd_iter || PBKDF2_ITER), user.password_hash);
  } else if (user.password_hash && user.salt) {
    valid = safeEq(await sha256Salt(password, user.salt), user.password_hash);
    upgrade = valid;                                   // migrer vers PBKDF2 à la volée
  } else if (user.password) {
    valid = safeEq(user.password, password); upgrade = valid;
  }
  if (!valid) { await logFail("Mot de passe incorrect"); return json({ ok: false, error: "invalide" }, 401); }

  // ── Upgrade transparent vers PBKDF2 ────────────────────────────────────────
  if (upgrade) {
    const newHash = await pbkdf2(password, user.salt, PBKDF2_ITER);
    await db.from("pi_users").update({
      password_hash: newHash, pwd_algo: "pbkdf2", pwd_iter: PBKDF2_ITER, password: null,
    }).eq("id", user.id);
  }

  await db.from("pi_logs_connexion").insert({
    id: crypto.randomUUID(), login, success: true, date: new Date().toISOString(),
    detail: "Connexion réussie (serveur)", userAgent: (req.headers.get("user-agent") || "").slice(0, 120), ip_hint: "",
  });

  // ── Profil SANS secret + vrai JWT Supabase signé (role=authenticated) ──────
  const nowSec = Math.floor(Date.now() / 1000);
  const token = await signSupabaseJwt({
    aud: "authenticated",
    role: "authenticated",     // ← reconnu nativement par PostgREST/auth.jwt()->>'role'
    app_role: user.role,       // ← rôle métier (admin/manager/caissiere/...), consommé par certaines policies existantes
    sub: user.id,
    login: user.login,
    iat: nowSec,
    exp: nowSec + TOKEN_TTL_SEC,
  });

  return json({
    ok: true, token, expires_in: TOKEN_TTL_SEC,
    user: {
      id: user.id, login: user.login, nom: user.nom, role: user.role,
      email: user.email, tel: user.tel, statut: user.statut,
      must_change: !!user.must_change,
    },
  });
});
