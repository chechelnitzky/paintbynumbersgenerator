# Cloudflare deployment — Paint by Number private generator

## Pages project

- Production branch: `cloudflare-private-access`
- Framework preset: None
- Build command: `bash scripts/cloudflare-build.sh`
- Build output directory: `cf-dist`
- Root directory: repository root / leave blank

The build copies only the files needed by the web generator into `cf-dist`. Source code and repository metadata outside that set are not published as static assets.

## Required secrets

Configure these in Cloudflare Pages > Settings > Variables and Secrets for Production:

- `PBN_USERNAME` — login username
- `PBN_PASSWORD` — login password
- `PBN_SESSION_SECRET` — a random secret of at least 32 characters, different from the login password

Optional:

- `PBN_SESSION_HOURS` — session lifetime in hours. Default: 12. Maximum accepted by the Worker: 168.

Do not commit any of these values to GitHub.

The Worker fails closed with HTTP 503 if the required secrets are missing.

## Custom domain

Use `generador.paintbynumber.cl` as the production custom domain.

The `*.pages.dev` hostname is also protected by the same server-side login, so it is not an authentication bypass.

## Brute-force protection

Create a Cloudflare rate limiting rule for the path `/_pbn/login`. A conservative starting point is 5 requests per 10 seconds per IP, with a temporary block after the threshold. Adjust only if legitimate use is affected.

## Authentication design

- Username/password verification happens inside the Cloudflare Worker.
- Credentials are Cloudflare secrets and are never sent to or stored in GitHub.
- Successful login creates an HMAC-SHA256 signed session token.
- Session cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, host-only, and time-limited.
- Login POSTs require a same-origin `Origin` header.
- All static assets are served only after session verification.
- Responses use restrictive security, anti-indexing, framing, referrer and cache headers.
- Authentication configuration fails closed.

## Cutover

1. Deploy and test the protected Cloudflare URL.
2. Add and test `generador.paintbynumber.cl`.
3. Confirm an incognito/private window cannot reach any generator asset without logging in.
4. Merge this branch into `master`.
5. Change the GitHub repository visibility to Private.
6. Confirm Cloudflare continues deploying from the private repository.
