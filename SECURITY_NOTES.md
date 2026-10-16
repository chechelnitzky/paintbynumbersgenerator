# Private generator security notes

The Cloudflare deployment is designed so authentication is enforced before static assets are returned. The login password must remain only in Cloudflare Variables and Secrets and must never be committed to this repository.

Recommended operational practices:

- Use a unique password of at least 16 characters.
- Use a separate random `PBN_SESSION_SECRET` of at least 32 characters.
- Keep GitHub and Cloudflare accounts protected with MFA.
- Keep the Cloudflare login rate-limit rule enabled.
- Rotate the login password if it is shared or suspected to be exposed.
- Test from a private/incognito browser after deployment changes to verify unauthenticated requests remain blocked.
