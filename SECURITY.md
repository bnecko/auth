# Security

## Reporting a vulnerability

Email m@bottleneck.cc with details and reproduction steps. Do not open a
public issue for a suspected vulnerability. You will get an acknowledgement
within a few days.

## Cryptographic choices

- **Passwords** are hashed with scrypt (N=16384, r=8, p=1, 64-byte output,
  per-password 16-byte salt). The stored format is
  `scrypt$N$r$p$salt$hash`. Verification is constant-time. Unknown-identifier
  logins still run a verify against a fixed dummy hash so login timing does
  not reveal whether an account exists.
- **Bearer API keys** are high-entropy random tokens. Only their SHA-256
  hash is stored (`external_apps.api_key_hash`). SHA-256 without a per-key
  salt is acceptable here because the keys are long random strings, not
  user-chosen secrets, so they are not subject to dictionary attack.
- **OAuth client secrets** are stored separately from bearer keys, also as
  SHA-256 hashes, with a rotation table that keeps a previous secret valid
  until an explicit expiry.
- **Access tokens and ID tokens** are RS256 JWTs signed with the OIDC private
  key. The public keys are published at `/oauth/jwks`. Signing keys carry an
  `active` / `retired` / `revoked` status so a key can be rotated while
  tokens it already signed remain verifiable.
- **Authorization codes, refresh tokens, and session tokens** are random and
  stored only as SHA-256 hashes. None of them are recoverable from the
  database.

## Tokens and sessions

- Authorization codes are single-use, expire after 10 minutes, and are bound
  to the client and the exact `redirect_uri`. PKCE with `S256` is required;
  `plain` is rejected.
- Access tokens expire after 15 minutes. Refresh tokens rotate on every use.
  Presenting an already-rotated refresh token is treated as a compromise and
  revokes every token for that (user, app) pair.
- Sessions are server-side records keyed by a hashed random token. The cookie
  is `HttpOnly`, `Secure` in production, `SameSite=Lax`, scoped to `/`.
  Default lifetime is 30 days, or 12 hours for non-remembered logins. Logout
  revokes the session server-side, not just the cookie.
- `private_key_jwt` client assertions are single-use (jti replay is
  rejected), must target the token endpoint as `aud`, and may not be dated
  more than 5 minutes ahead.

## Abuse and transport

- Rate limiting is Redis-backed and per-IP on registration, login, the token
  endpoint, password reset, and device polling. A separate hard per-IP limit
  blocks login brute force even if the CAPTCHA layer is bypassed. Client IP is
  only read from proxy headers when `TRUSTED_PROXY` is set.
- Cloudflare Turnstile gates registration and login. In production a missing
  Turnstile secret fails closed rather than silently disabling the check.
- WebAuthn (passkeys) is supported as a second factor. Challenges are
  single-use with a 5-minute TTL, the signature counter is checked for
  replay, and origin and RP ID are verified.
- Outbound fetches to client-supplied URLs (JWKS resolution and webhook
  delivery) are guarded against SSRF: private, loopback, link-local, and
  cloud-metadata addresses are refused, responses are size-capped, and
  redirects are not followed.
- Every response carries a Content-Security-Policy (nonce plus
  `strict-dynamic` in production), HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and a restrictive
  `Permissions-Policy`.

## Known limitations

These are deliberate or not-yet-done, and are written down so a reader does
not have to discover them.

- Webhook signing secrets are stored in plaintext so the delivery worker can
  sign each request. The trust boundary is the database; secrets are rotated
  by re-registering the endpoint.
- The OAuth profile versions (`bn-oauth-2026-05`, `bn-oauth-2026-01`) are a
  forward-compatibility tag. Both behave identically today; the field exists
  so a future profile can diverge without breaking existing clients.
- Tokens are signed with RS256 only. ES256 and DPoP are not implemented.
- The OpenID Foundation conformance suite has not been run against this
  deployment. See `docs/conformance.md` for a self-assessment.
