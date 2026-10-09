// ═════════════════════════════════════════════════════════════════
// Edge Function : hub-sync — MENKO HOLDING (BROUILLON, NON DÉPLOYÉ)
//
// Remplace l'accès direct (clé anon) du hub et de Menko Agro aux tables
// menko_hub_users et menko_hub_audit. Ces tables seront fermées à anon et
// authenticated : seule cette fonction (clé de service) y accède.
// Le hash et le sel ne sortent JAMAIS vers le navigateur.
//
// Actions (POST JSON { action, ... }) :
//   ping            ()                           → { ok, has_users }
//   bootstrap       { user:{id?,nom,login,password} } → premier admin seulement (403 si des comptes existent)
//   login           { login, password }          → { ok, token, user }
//   list            (jeton admin)                → { ok, users[] }   sans hash
//   upsert          (jeton admin) { user:{id?,nom,login,role,actif,password?} }
//   change_password (jeton valide) { old, new }
//   delete          (jeton admin) { id }         → suppression douce
//   audit           { actor, event, detail }     → journal (limité, taille bornée)
//   audit_list      (jeton admin)                → { ok, rows[] }
//
// Secrets requis (mêmes que staff-login) : SB_URL, SERVICE_ROLE_KEY,
// SB_PROJECT_JWT_SECRET. Origine CORS : https://erp-menko-holding.com
// Compatibilité : mots de passe stockés en SHA-256(mdp+sel), comme aujourd'hui
// (migration PBKDF2 possible ensuite, comme staff-login).
// ═════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SB_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("SB_PROJECT_JWT_SECRET")!;
const MAX_ATTEMPTS = 10, WINDOW_MIN = 15, TOKEN_TTL = 8 * 3600;
const ROLES = ["admin", "gestionnaire", "immo", "agro", "digitech"];

const CORS = {
  "Access-Control-Allow-Origin": "https://erp-menko-holding.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const enc = new TextEncoder();
const toHex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256Salt = async (p: string, s: string) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(p + s)));
const b64u = (bytes: Uint8Array) => {
  let bin = ""; for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const hmacKey = () => crypto.subtle.importKey("raw", enc.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
async function sign(payload: Record<string, unknown>) {
  const h = b64u(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(new Uint8Array(sig))}`;
}
async function verify(token: string): Promise<Record<string, any> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(`${parts[0]}.${parts[1]}`));
  if (b64u(new Uint8Array(sig)) !== parts[2]) return null;
  try {
    const pl = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!pl.exp || pl.exp < Math.floor(Date.now() / 1000) || !pl.hub) return null;
    return pl;
  } catch { return null; }
}
const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const randSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
const publicUser = (u: any) => ({ id: u.id, nom: u.nom, login: u.login, role: u.role, actif: u.actif !== false,
  last_login: u.last_login, created_at: u.created_at, updated_at: u.updated_at, deleted: !!u.deleted });

// Le jeton est signé avec le secret du projet : il NE DOIT PAS être de rôle « authenticated » avec un
// claim app_role, sinon PostgREST le traiterait comme du personnel ERP (accès à toutes les tables pi_*).
// Rôle « anon » + claims propres au hub : inutilisable pour lire des données, utile seulement ici.
const issue = async (u: any) => {
  const now = Math.floor(Date.now() / 1000);
  return sign({ role: "anon", aud: "authenticated", sub: u.id, iat: now, exp: now + TOKEN_TTL, hub: true, hub_role: u.role });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ ok: false, error: "payload" }, 400); }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const tk = bearer ? await verify(bearer) : null;
  const isAdmin = !!tk && tk.hub_role === "admin";
  const audit = (actor: string, action: string, detail: string) =>
    db.from("menko_hub_audit").insert({ actor: clip(actor, 80), action: clip(action, 80), detail: clip(detail, 500) });

  switch (b.action) {
    case "login": {
      const login = clip(b.login, 80).trim(), password = clip(b.password, 200);
      if (!login || !password) return json({ ok: false, error: "champs" }, 400);
      const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
      const { count } = await db.from("menko_hub_audit").select("id", { count: "exact", head: true })
        .eq("action", "login_echec_srv").eq("actor", login.toLowerCase()).gte("ts", since);
      if ((count ?? 0) >= MAX_ATTEMPTS) return json({ ok: false, error: "verrou" }, 429);
      const esc = login.replace(/[\\%_]/g, "\\$&");
      const { data: rows } = await db.from("menko_hub_users").select("*").ilike("login", esc).eq("deleted", false);
      let found: any = null;
      for (const u of (rows ?? []).filter((x: any) => x.actif !== false)) {
        if (u.password_hash && u.salt && (await sha256Salt(password, u.salt)) === u.password_hash) { found = u; break; }
      }
      if (!found) { await audit(login.toLowerCase(), "login_echec_srv", "échec"); return json({ ok: false, error: "identifiants" }, 401); }
      await db.from("menko_hub_users").update({ last_login: new Date().toISOString() }).eq("id", found.id);
      const token = await issue(found);
      await audit(found.login, "login_ok_srv", "connexion");
      return json({ ok: true, token, user: publicUser(found) });
    }
    case "ping": {
      const { count } = await db.from("menko_hub_users").select("id", { count: "exact", head: true }).eq("deleted", false);
      return json({ ok: true, has_users: (count ?? 0) > 0 });
    }
    case "bootstrap": {
      // Création du TOUT PREMIER administrateur : refusée dès qu'un compte existe.
      const { count } = await db.from("menko_hub_users").select("id", { count: "exact", head: true }).eq("deleted", false);
      if ((count ?? 0) > 0) return json({ ok: false, error: "deja_initialise" }, 403);
      const u = b.user || {};
      if (!clip(u.login, 80).trim() || !clip(u.nom, 120).trim() || String(u.password || "").length < 8) return json({ ok: false, error: "champs" }, 400);
      const salt = randSalt();
      const row = { id: clip(u.id, 60) || crypto.randomUUID(), nom: clip(u.nom, 120), login: clip(u.login, 80).trim(), role: "admin",
        actif: true, deleted: false, salt, password_hash: await sha256Salt(String(u.password), salt) };
      const { error } = await db.from("menko_hub_users").insert(row);
      if (error) return json({ ok: false, error: "base" }, 500);
      await audit(row.login, "user_create", "admin initial");
      return json({ ok: true, token: await issue(row), user: publicUser(row) });
    }
    case "audit": {
      const since = new Date(Date.now() - 60000).toISOString();
      const { count } = await db.from("menko_hub_audit").select("id", { count: "exact", head: true }).gte("ts", since);
      if (!tk && (count ?? 0) > 60) return json({ ok: false, error: "limite" }, 429);
      await audit(b.actor, b.event, b.detail);
      return json({ ok: true });
    }
    case "change_password": {
      if (!tk) return json({ ok: false, error: "auth" }, 401);
      const { data: u } = await db.from("menko_hub_users").select("*").eq("id", tk.sub).maybeSingle();
      if (!u || (await sha256Salt(clip(b.old, 200), u.salt)) !== u.password_hash) return json({ ok: false, error: "identifiants" }, 401);
      const np = clip(b.new, 200); if (np.length < 8) return json({ ok: false, error: "trop_court" }, 400);
      const salt = randSalt();
      await db.from("menko_hub_users").update({ salt, password_hash: await sha256Salt(np, salt), updated_at: new Date().toISOString() }).eq("id", u.id);
      await audit(u.login, "mdp_change", "mot de passe modifié");
      return json({ ok: true });
    }
  }
  if (!isAdmin) return json({ ok: false, error: "interdit" }, 403);
  switch (b.action) {
    case "list": {
      const { data } = await db.from("menko_hub_users").select("*").order("nom");
      return json({ ok: true, users: (data ?? []).map(publicUser) });
    }
    case "upsert": {
      const u = b.user || {}; const role = clip(u.role, 30);
      if (!ROLES.includes(role) || !clip(u.login, 80).trim() || !clip(u.nom, 120).trim()) return json({ ok: false, error: "champs" }, 400);
      const id = clip(u.id, 60) || crypto.randomUUID();
      const row: Record<string, unknown> = { id, nom: clip(u.nom, 120), login: clip(u.login, 80).trim(), role,
        actif: u.actif !== false, deleted: false, updated_at: new Date().toISOString() };
      if (u.password) {
        if (String(u.password).length < 8) return json({ ok: false, error: "trop_court" }, 400);
        const salt = randSalt(); row.salt = salt; row.password_hash = await sha256Salt(String(u.password), salt);
      }
      const { error } = await db.from("menko_hub_users").upsert(row, { onConflict: "id" });
      if (error) return json({ ok: false, error: "base" }, 500);
      await audit(String(tk!.sub), "user_upsert", `${row.login} (${role})`);
      return json({ ok: true, id });
    }
    case "delete": {
      const id = clip(b.id, 60);
      if (id === tk!.sub) return json({ ok: false, error: "soi_meme" }, 400);
      await db.from("menko_hub_users").update({ deleted: true, updated_at: new Date().toISOString() }).eq("id", id);
      await audit(String(tk!.sub), "user_delete", id);
      return json({ ok: true });
    }
    case "audit_list": {
      const { data } = await db.from("menko_hub_audit").select("*").order("ts", { ascending: false }).limit(500);
      return json({ ok: true, rows: data ?? [] });
    }
  }
  return json({ ok: false, error: "action" }, 400);
});
