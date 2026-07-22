// Edge Middleware — estate door-lock (RDS OS Stage 2b, 2026-07-22).
// This app previously served fully open to the internet. This gate mirrors
// the client-ops model exactly so nothing changes for the team:
//   1. rda1.* device token (90-day, HMAC-SHA256 with the shared SSO_SECRET) —
//      arrives via ?auth= from the dashboard's /go/lodge handoff (Google
//      sign-in) or is minted here on a correct PIN entry. Stored as an
//      httpOnly cookie; every request re-verifies it.
//   2. PIN fallback (PORTAL_PIN env, default 7402) — same shared door-lock
//      the team already uses on client-ops. Retires at final switchover.
//   3. Automation bypass — Bearer/x-cron-secret/?secret= carrying SSO_SECRET
//      (Vercel crons send Bearer CRON_SECRET natively), plus explicit path
//      bypasses for OAuth callbacks and cron endpoints.
// No changes to any existing page or API file — this single file is the gate.

export const config = { matcher: "/(.*)" };

const BYPASS_PREFIXES = ["/api/gmail-callback", "/api/gmail-auth", "/api/poll-gmail", "/api/cron-reparse"];
const DASHBOARD_GO = "https://rds-dashboard-drab.vercel.app/go/lodge";
const COOKIE = "rds_sso";
const NINETY_D = 90 * 86400;

const enc = new TextEncoder();
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
async function verifyToken(tok, secret) {
  try {
    if (!tok || !tok.startsWith("rda1.")) return false;
    const parts = tok.split(".");
    if (parts.length !== 3) return false;
    if ((await hmac(secret, parts[1])) !== parts[2]) return false;
    const pad = parts[1].length % 4 ? "=".repeat(4 - (parts[1].length % 4)) : "";
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad));
    return payload.x > Date.now();
  } catch { return false; }
}
async function mintToken(secret, email) {
  const payload = b64url(enc.encode(JSON.stringify({ e: email, x: Date.now() + NINETY_D * 1000 })));
  return `rda1.${payload}.${await hmac(secret, payload)}`;
}
function getCookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function setCookieHeader(tok) {
  return `${COOKIE}=${encodeURIComponent(tok)}; Path=/; Max-Age=${NINETY_D}; HttpOnly; Secure; SameSite=Lax`;
}

const LOCK_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RDS — sign in</title><style>
body{font-family:-apple-system,system-ui,sans-serif;background:#FAFAF8;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#fff;border:1px solid #e5e2dc;border-radius:12px;padding:28px 24px;width:300px;text-align:center}
h1{font-size:17px;margin:0 0 4px}p{color:#8a857c;font-size:13px;margin:0 0 18px}
input{width:100%;box-sizing:border-box;font-size:18px;text-align:center;padding:10px;border:1px solid #d8d4cc;border-radius:8px;letter-spacing:4px}
button{width:100%;margin-top:10px;padding:11px;font-size:15px;border:0;border-radius:8px;background:#1a1a1a;color:#fff;cursor:pointer}
a.sso{display:block;margin-top:14px;font-size:13px;color:#4a6741;text-decoration:none}
.err{color:#b0413e;font-size:12px;min-height:16px;margin-top:8px}
</style></head><body><div class="card"><h1>RDS Lodge Bookings</h1><p>Enter the portal PIN, or use one sign-in.</p>
<form id="f"><input id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN">
<button>Unlock</button><div class="err" id="e"></div></form>
<a class="sso" href="${DASHBOARD_GO}">Sign in with Google via RDS Dashboard →</a></div>
<script>
document.getElementById('f').onsubmit=function(ev){ev.preventDefault();
fetch('/sso/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:document.getElementById('pin').value.trim()})})
.then(r=>r.json()).then(d=>{if(d.ok){location.reload()}else{document.getElementById('e').textContent='Wrong PIN'}})
.catch(()=>{document.getElementById('e').textContent='Error — try again'})};
</script></body></html>`;

export default async function middleware(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const secret = process.env.SSO_SECRET;
  if (!secret) return; // gate inert without its secret — never brick the app

  // 1. Path bypass (OAuth callbacks, crons)
  if (BYPASS_PREFIXES.some((p) => path.startsWith(p))) return;

  // 2. Automation secret (Vercel crons send Bearer CRON_SECRET natively)
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (bearer === secret || req.headers.get("x-cron-secret") === secret ||
      url.searchParams.get("secret") === secret) return;

  // 3. PIN endpoint (handled entirely in-middleware)
  if (path === "/sso/pin" && req.method === "POST") {
    let body = {};
    try { body = await req.json(); } catch {}
    const pin = (body.pin || "").toString().trim();
    if (pin && pin === (process.env.PORTAL_PIN || "7402")) {
      const tok = await mintToken(secret, "pin-device");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": setCookieHeader(tok) },
      });
    }
    return new Response(JSON.stringify({ ok: false }), {
      status: 401, headers: { "content-type": "application/json" } });
  }

  // 4. Existing device cookie
  if (await verifyToken(getCookie(req, COOKIE), secret)) return;

  // 5. ?auth= capture (dashboard /go handoff) → set cookie, clean URL
  const tok = url.searchParams.get("auth");
  if (await verifyToken(tok, secret)) {
    url.searchParams.delete("auth");
    return new Response(null, {
      status: 302,
      headers: { location: url.toString(), "set-cookie": setCookieHeader(tok) },
    });
  }

  // 6. Deny: APIs get 401 JSON, pages get the lock screen
  if (path.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" } });
  }
  return new Response(LOCK_HTML, {
    status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
}
