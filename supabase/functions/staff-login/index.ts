// ═══════════════════════════════════════════════════════════════════════════
// Edge Function : staff-login — MENKO HOLDING (v6)
//
// [FIX v6 — IDENTIFIANT SENSIBLE À LA CASSE]
// .eq("login", login) est une égalité stricte Postgres : un compte enregistré
// en minuscules (cas normal côté client — voir createUserFromModal) refusait
// toute saisie avec une majuscule, pourtant le réflexe naturel pour taper un
// prénom ("Patrice"). Incident réel côté Zahara (même code partagé) : mot de
// passe réinitialisé par un administrateur, test de connexion immédiat avec
// le nouveau mot de passe échoué — l'identifiant tapé avec une majuscule ne
// correspondait à aucune ligne ("Identifiant introuvable"), sans rapport
// avec le mot de passe. Normalisé ici en minuscules, comme côté client
// (doLogin, fetchUserFromCloud, createUserFromModal).
//
// [FIX v5 — ANTI-FORCE-BRUTE INOPÉRANT + AUDIT VIDE + DOUBLONS DE LOGIN]
// Porte ici les correctifs déjà validés côté Zahara (v6/v7, même schéma de
// base), adaptés à l'origine CORS et au projet Supabase propres à Menco.
// Voir functions/staff-login/CONTRAT.md pour le détail de l'investigation.
//
//   1. Le compteur anti-force-brute et les journaux d'audit filtraient sur
//      .eq("login"), .eq("success"), .gte("date") — trois colonnes qui
//      n'existent PAS sur pi_logs_connexion (schéma réel vérifié :
//      { id, data jsonb, updated_at, scope_id }). Chaque requête échouait
//      silencieusement : `count` restait nul (verrou jamais déclenché) et
//      chaque insertion échouait (aucune trace serveur, succès ou échec).
//      Corrigé en lisant/écrivant ces champs sous data->>…, comme Zahara.
//   2. Seuls les échecs VÉRIFIÉS ICI sont désormais comptés (marqueur
//      data.src="srv") pour éviter qu'un employé qui se trompe plusieurs
//      fois via le client (hors ligne compris) ne sature le verrou serveur
//      pour tout le monde — incident déjà rencontré côté Zahara.
//      Fenêtre glissante de 15 minutes, plafond porté à 10 (au lieu de
//      5 échecs / 24 h, bien plus punitif pour une simple faute de frappe).
//   3. .maybeSingle() cassait toute authentification dès qu'un login
//      existait en double dans pi_users (erreur PGRST116 jamais vérifiée,
//      silencieusement traitée comme "introuvable"). On récupère désormais
//      toutes les lignes partageant ce login et on essaie le mot de passe
//      contre chacune (comptes actifs en priorité) jusqu'à trouver la
//      correspondance.
//
// Historique conservé (corrections précédentes, toujours valables) :
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
//
// Déploiement : supabase functions deploy staff-login --no-verify-jwt
// Secrets requis : SERVICE_ROLE_KEY, SB_PROJECT_JWT_SECRET (Legacy JWT Secret
//                  du projet Menco — Project Settings → JWT Keys → Legacy JWT Secret)
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SB_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROJECT_JWT_SECRET = Deno.env.get("SB_PROJECT_JWT_SECRET")!;
const MAX_ATTEMPTS = 10;                 // échecs vérifiés serveur, par identifiant
const ATTEMPT_WINDOW_MIN = 15;           // fenêtre glissante
const TOKEN_TTL_SEC = 8 * 3600;          // 8 h — en SECONDES (norme JWT "exp")
const PBKDF2_ITER  = 210000;             // OWASP 2024 (SHA-256)

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
    /* Le client historique envoie "motdepasse" (français), pas "password" —
       on accepte les deux noms, sans casser aucun appelant existant. */
    password = body.password || body.motdepasse || "";
  } catch { return json({ ok: false, error: "payload" }, 400); }
  login = (login || "").trim().toLowerCase();
  if (!login || !password) return json({ ok: false, error: "champs" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MIN * 60 * 1000).toISOString();

  // ── Anti-brute-force : uniquement les échecs vérifiés par CETTE fonction ──
  const { count } = await db.from("pi_logs_connexion")
    .select("id", { count: "exact", head: true })
    .eq("data->>login", login)
    .eq("data->>success", "false")
    .eq("data->>src", "srv")
    .gte("data->>date", since);
  if ((count ?? 0) >= MAX_ATTEMPTS)
    return json({ ok: false, error: "bloque",
                  message: `Trop de tentatives. Réessayez dans ${ATTEMPT_WINDOW_MIN} minutes.` }, 429);

  const logFail = (detail: string) =>
    db.from("pi_logs_connexion").insert({
      id: crypto.randomUUID(),
      data: {
        login, success: false, date: new Date().toISOString(), detail, src: "srv",
        userAgent: (req.headers.get("user-agent") || "").slice(0, 120), ip_hint: "",
      },
      updated_at: new Date().toISOString(),
    });

  // Toutes les lignes partageant ce login — le mot de passe est essayé
  // contre chacune (comptes actifs d'abord) pour rester robuste aux doublons.
  const { data: candidats } = await db.from("pi_users").select("*").eq("login", login);
  if (!candidats || candidats.length === 0) {
    await logFail("Identifiant introuvable");
    return json({ ok: false, error: "invalide" }, 401);
  }
  const ordonnes = [...candidats].sort((a, b) => {
    const aActif = !a.statut || a.statut === "actif" ? 0 : 1;
    const bActif = !b.statut || b.statut === "actif" ? 0 : 1;
    return aActif - bActif;
  });

  let user: any = null, upgrade = false;
  for (const candidat of ordonnes) {
    if (candidat.statut && candidat.statut !== "actif") continue;
    let valid = false, candUpgrade = false;
    if (candidat.pwd_algo === "pbkdf2" && candidat.password_hash && candidat.salt) {
      valid = safeEq(await pbkdf2(password, candidat.salt, candidat.pwd_iter || PBKDF2_ITER), candidat.password_hash);
    } else if (candidat.password_hash && candidat.salt) {
      valid = safeEq(await sha256Salt(password, candidat.salt), candidat.password_hash);
      candUpgrade = valid;
    } else if (candidat.password) {
      valid = safeEq(candidat.password, password);
      candUpgrade = valid;
    }
    if (valid) { user = candidat; upgrade = candUpgrade; break; }
  }

  if (!user) {
    // Compte(s) trouvé(s) mais tous inactifs, ou mot de passe incorrect partout.
    const tousInactifs = ordonnes.every((c) => c.statut && c.statut !== "actif");
    if (tousInactifs) { await logFail("Compte inactif"); return json({ ok: false, error: "inactif" }, 403); }
    await logFail("Mot de passe incorrect");
    return json({ ok: false, error: "invalide" }, 401);
  }

  // ── Upgrade transparent vers PBKDF2 ────────────────────────────────────────
  if (upgrade) {
    const newHash = await pbkdf2(password, user.salt, PBKDF2_ITER);
    await db.from("pi_users").update({
      password_hash: newHash, pwd_algo: "pbkdf2", pwd_iter: PBKDF2_ITER, password: null,
    }).eq("id", user.id);
  }

  await db.from("pi_logs_connexion").insert({
    id: crypto.randomUUID(),
    data: {
      login, success: true, date: new Date().toISOString(),
      detail: "Connexion réussie (serveur)", src: "srv",
      userAgent: (req.headers.get("user-agent") || "").slice(0, 120), ip_hint: "",
    },
    updated_at: new Date().toISOString(),
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
