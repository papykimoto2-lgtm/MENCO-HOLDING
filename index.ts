// ═══════════════════════════════════════════════════════════════════════════
// Supabase Edge Function : portal-login  (Partner Immo CI)
// Authentifie SOUSCRIPTEUR (pi_clients) ou APPORTEUR (pi_apporteurs) côté serveur
// et renvoie un JWT scoped. Le hash du code ne quitte JAMAIS le serveur.
//
//   supabase functions deploy portal-login --no-verify-jwt
//   supabase secrets set SB_URL=https://izgpvhwhbrgeagjfhfli.supabase.co
//   supabase secrets set SB_SERVICE_ROLE=<service_role_key>
//   supabase secrets set SB_JWT_SECRET=<Settings ▸ API ▸ JWT secret>
// ═══════════════════════════════════════════════════════════════════════════
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const SB_URL = Deno.env.get("SB_URL")!;
const SB_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE")!;
const SB_JWT_SECRET = Deno.env.get("SB_JWT_SECRET")!;

const CORS = {
  "Access-Control-Allow-Origin": "*", // ⚠️ restreindre au domaine du portail en prod
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
};

const ATTEMPTS = new Map<string, { n: number; t: number }>();
const WINDOW_MS = 10 * 60 * 1000, MAX_TRY = 5;
function blocked(k: string) {
  const e = ATTEMPTS.get(k), now = Date.now();
  if (!e || now - e.t > WINDOW_MS) { ATTEMPTS.set(k, { n: 0, t: now }); return false; }
  return e.n >= MAX_TRY;
}
function fail(k: string) {
  const e = ATTEMPTS.get(k), now = Date.now();
  if (!e || now - e.t > WINDOW_MS) ATTEMPTS.set(k, { n: 1, t: now }); else e.n++;
}

async function sha256Hex(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function verifyCode(obj: any, code: string): Promise<boolean> {
  if (!obj || !code) return false;
  if (obj.code_acces_hash && obj.code_acces_salt)
    return (await sha256Hex(code + obj.code_acces_salt)) === obj.code_acces_hash;
  // ⚠️ fallback clair : à supprimer après migration de tous les codes en hash
  if (obj.code_acces) return String(obj.code_acces) === code;
  if (obj.mot_de_passe) return String(obj.mot_de_passe) === code;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: { kind?: string; ident?: string; code?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const kind = body.kind === "apporteur" ? "apporteur" : (body.kind === "foncier" ? "foncier" : "souscripteur");
  const ident = (body.ident || "").trim();
  const code = (body.code || "").trim();
  if (!ident || !code) return json({ error: "missing" }, 400);

  const ip = req.headers.get("x-forwarded-for") || "0.0.0.0";
  const rlKey = kind + "|" + ip + "|" + ident.toLowerCase();
  if (blocked(rlKey)) return json({ error: "rate_limited" }, 429);

  const table = kind === "apporteur" ? "pi_apporteurs"
              : kind === "foncier"   ? "pi_cessions_foncieres"
              : "pi_clients";
  const resp = await fetch(`${SB_URL}/rest/v1/${table}?select=id,data&limit=5000`, {
    headers: { apikey: SB_SERVICE_ROLE, Authorization: `Bearer ${SB_SERVICE_ROLE}` },
  });
  if (!resp.ok) return json({ error: "server" }, 500);
  const rows: Array<{ id: string; data: any }> = await resp.json();

  const idn = ident.replace(/\s/g, "").toLowerCase();
  const cand = rows.find((r) => {
    const d = r.data || {}, a = d.acheteur || {};
    const tel = (d.tel || a.tel || "").replace(/\s/g, "").toLowerCase();
    const email = (d.email || a.email || "").toLowerCase();
    const dossier = (d.dossier || "").toLowerCase();
    return dossier === ident.toLowerCase() || email === ident.toLowerCase() || tel === idn;
  });

  if (!cand || !(await verifyCode(cand.data, code))) { fail(rlKey); return json({ error: "invalid_credentials" }, 401); }

  const exp = kind === "apporteur" ? cand.data.date_expiration : cand.data.code_expiration;
  if (exp && new Date(exp) < new Date()) return json({ error: "expired" }, 403);

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SB_JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const token = await create({ alg: "HS256", typ: "JWT" }, {
    aud: "authenticated", role: "authenticated", sub: cand.id,
    kind, scope_id: cand.id, exp: getNumericDate(2 * 60 * 60),
  }, key);

  return json({ access_token: token, expires_in: 7200, kind, id: cand.id });
});

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });
}
