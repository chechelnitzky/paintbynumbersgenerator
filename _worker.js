const COOKIE_NAME = "__Host-pbn_session";
const DEFAULT_SESSION_HOURS = 12;

function textEncoder() {
  return new TextEncoder();
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder().encode(value)));
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder().encode(value)));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function safeSecretEqual(a, b) {
  const [aHash, bHash] = await Promise.all([sha256(a), sha256(b)]);
  return constantTimeEqual(aHash, bHash);
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

async function createSession(username, secret, hours) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    u: username,
    iat: now,
    exp: now + hours * 60 * 60,
  };
  const payloadPart = base64UrlEncode(textEncoder().encode(JSON.stringify(payload)));
  const signaturePart = base64UrlEncode(await hmac(payloadPart, secret));
  return `${payloadPart}.${signaturePart}`;
}

async function verifySession(token, secret, username) {
  try {
    if (!token || token.length > 2048) return false;
    const [payloadPart, signaturePart, extra] = token.split(".");
    if (!payloadPart || !signaturePart || extra) return false;

    const expectedSignature = await hmac(payloadPart, secret);
    const suppliedSignature = base64UrlDecode(signaturePart);
    if (!constantTimeEqual(expectedSignature, suppliedSignature)) return false;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)));
    const now = Math.floor(Date.now() / 1000);
    return payload?.v === 1 && payload?.u === username && Number.isInteger(payload?.exp) && payload.exp > now;
  } catch {
    return false;
  }
}

function securityHeaders(headers = new Headers()) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://i.imgur.com; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests");
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  return headers;
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeNext(value) {
  if (!value || typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/_pbn/login") || value.startsWith("/_pbn/logout")) return "/";
  return value.slice(0, 1024);
}

function loginPage(error = "", next = "/") {
  const errorHtml = error ? `<div class="error">${htmlEscape(error)}</div>` : "";
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Acceso privado · Paint by Number</title>
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f4f2; color: #171717; padding: 24px; }
    .card { width: min(420px, 100%); background: #fff; border: 1px solid #deded8; border-radius: 18px; padding: 32px; box-shadow: 0 18px 60px rgba(0,0,0,.08); }
    .eyebrow { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #6b6b65; margin-bottom: 8px; }
    h1 { margin: 0 0 8px; font-size: 26px; line-height: 1.2; }
    p { margin: 0 0 24px; color: #64645f; line-height: 1.5; }
    label { display: block; font-size: 13px; font-weight: 650; margin: 16px 0 7px; }
    input { width: 100%; border: 1px solid #cfcfc8; border-radius: 10px; padding: 12px 13px; font: inherit; background: #fff; outline: none; }
    input:focus { border-color: #171717; box-shadow: 0 0 0 3px rgba(23,23,23,.08); }
    button { width: 100%; margin-top: 22px; border: 0; border-radius: 10px; padding: 13px 16px; background: #171717; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    button:hover { background: #2c2c2c; }
    .error { padding: 10px 12px; border-radius: 9px; background: #fff0f0; color: #9b1c1c; font-size: 13px; margin-bottom: 14px; }
    .fine { margin-top: 18px; font-size: 12px; color: #85857f; }
  </style>
</head>
<body>
  <main class="card">
    <div class="eyebrow">PaintByNumber.cl</div>
    <h1>Generador privado</h1>
    <p>Ingresa tu usuario y contraseña para continuar.</p>
    ${errorHtml}
    <form method="post" action="/_pbn/login" autocomplete="on">
      <input type="hidden" name="next" value="${htmlEscape(next)}">
      <label for="username">Usuario</label>
      <input id="username" name="username" type="text" autocomplete="username" maxlength="128" required autofocus>
      <label for="password">Contraseña</label>
      <input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required>
      <button type="submit">Entrar</button>
    </form>
    <div class="fine">La sesión se guarda únicamente en este dispositivo mediante una cookie segura.</div>
  </main>
</body>
</html>`;
}

function responseHtml(html, status = 200) {
  const headers = securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" }));
  return new Response(html, { status, headers });
}

function redirect(location, extraHeaders = {}) {
  const headers = securityHeaders(new Headers({ Location: location, ...extraHeaders }));
  return new Response(null, { status: 303, headers });
}

function configReady(env) {
  return Boolean(env.PBN_USERNAME && env.PBN_PASSWORD && env.PBN_SESSION_SECRET && env.PBN_SESSION_SECRET.length >= 32);
}

function sessionHours(env) {
  const parsed = Number.parseInt(env.PBN_SESSION_HOURS || "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SESSION_HOURS;
  return Math.max(1, Math.min(parsed, 168));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Fail closed: a deployment without secrets must never expose static assets.
    if (!configReady(env)) {
      return responseHtml("<!doctype html><meta charset=utf-8><title>Configuración pendiente</title><h1>Acceso no configurado</h1><p>Faltan secretos de autenticación en Cloudflare.</p>", 503);
    }

    const sessionToken = getCookie(request, COOKIE_NAME);
    const authenticated = await verifySession(sessionToken, env.PBN_SESSION_SECRET, env.PBN_USERNAME);

    if (url.pathname === "/_pbn/login" && request.method === "GET") {
      if (authenticated) return redirect(normalizeNext(url.searchParams.get("next")));
      return responseHtml(loginPage("", normalizeNext(url.searchParams.get("next"))));
    }

    if (url.pathname === "/_pbn/login" && request.method === "POST") {
      const origin = request.headers.get("Origin");
      if (!origin || origin !== url.origin) return responseHtml("Acceso rechazado.", 403);

      const contentLength = Number.parseInt(request.headers.get("Content-Length") || "0", 10);
      if (contentLength > 4096) return responseHtml("Solicitud demasiado grande.", 413);

      const contentType = request.headers.get("Content-Type") || "";
      if (!contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
        return responseHtml("Solicitud inválida.", 415);
      }

      const form = await request.formData();
      const username = String(form.get("username") || "").slice(0, 128);
      const password = String(form.get("password") || "").slice(0, 256);
      const next = normalizeNext(String(form.get("next") || "/"));

      const [userOk, passwordOk] = await Promise.all([
        safeSecretEqual(username, env.PBN_USERNAME),
        safeSecretEqual(password, env.PBN_PASSWORD),
      ]);

      if (!userOk || !passwordOk) {
        return responseHtml(loginPage("Usuario o contraseña incorrectos.", next), 401);
      }

      const hours = sessionHours(env);
      const token = await createSession(env.PBN_USERNAME, env.PBN_SESSION_SECRET, hours);
      const cookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${hours * 3600}`;
      return redirect(next, { "Set-Cookie": cookie });
    }

    if (url.pathname === "/_pbn/logout") {
      return redirect("/_pbn/login", {
        "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      });
    }

    if (!authenticated) {
      const next = normalizeNext(url.pathname + url.search);
      return redirect(`/_pbn/login?next=${encodeURIComponent(next)}`);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: securityHeaders(new Headers({ Allow: "GET, HEAD" })),
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = securityHeaders(new Headers(assetResponse.headers));
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  },
};
