# Changelog

Notable changes to the Bottleneck Auth service, for people who deploy it and
people who integrate with it. The Node SDK keeps its own changelog in
`sdk/node/CHANGELOG.md`.

Versions follow semantic versioning. What counts as the public contract is the
OAuth and OIDC surface, the activation API, the billing API, webhook payloads,
and the environment a deployment has to provide.

## [1.0.0] - 2026-09-21

The first tagged release. The service has run in production for some months;
this is the point where it gets a version, after a security review of the
payment paths and of findings that had been deferred earlier.

### Action needed when upgrading a deployment

- **Crypto features are off unless asked for.** TON wallet linking, donations,
  the btGRAM ledger, the public pool, withdrawals and identity verification now
  sit behind `CRYPTO_ENABLED`. Only the exact value `true` turns them on. A
  deployment that uses them must set it before upgrading, or those pages and
  APIs answer 404 until it does. See "Crypto features" in `docs/deployment.md`.
- **The env file is split.** One `prod.env` becomes `core.env`, `telegram.env`,
  `crypto.env` and `ops.env`, loaded together through a comma-separated
  `COMPOSE_ENV_FILES`. `node scripts/split-env.mjs <file> --write` migrates an
  existing file without printing a value. Re-run `scripts/install-backup.sh`
  afterwards so backups pick up every file.
- **`INTERNAL_BILLING_SECRET` is required for deposits to be credited.** Set it
  in `core.env` (`openssl rand -hex 32`) and recreate `app` and `worker`
  together. It replaces `INTERNAL_ANALYTICS_SECRET` on the routes that write to
  the ledger, and the two must differ.
- Admins who are in the panel during the upgrade are asked to step up once more.

### Changed for integrators

- `POST /api/billing/charge` limits one app to 25 GRAM from one user in any 24
  hours. Past that it answers `403` with `code: "daily_limit_exceeded"`,
  `limitNano` and `remainingNano`. A retry of a key that already charged is
  answered as before.
- The same endpoint requires the user's live authorization to include
  `billing:charge`, not only the token. A user who consents again without it,
  or revokes the app, stops the charges at once with `403 insufficient_scope`.
  `amountNano` is limited to 30 digits.
- `billing:charge` can no longer be requested through the device flow. The
  device code endpoint answers `invalid_scope`. Ask through the authorization
  code flow.
- Consenting to an app again with fewer scopes revokes the tokens issued under
  the wider grant.
- `ton:read` gives `ton_address: null` while the user keeps their wallet
  hidden, as the documentation already said it did.
- `ton:read` and `billing:charge` are advertised in discovery only on a server
  running with crypto features on.
- `POST /api/auth/register` no longer accepts a `telegram` payload and always
  answers 202.

### Security

- A transfer comment containing a NUL byte stalled deposit crediting and payout
  confirmation until the cursor was edited by hand. Anyone with a TON wallet
  could send one.
- The device approval page acted on a session captured when it rendered, showed
  raw scope identifiers, and recorded no grant the user could revoke.
- Linking or unlinking the wallet that withdrawals are paid to, and adding a
  passkey, now ask for the account password. A password reset removes passkeys.
- The admin step-up is tied to the session that earned it. One admin session no
  longer inherits a step-up completed in another.
- The webhook worker read a whole response body before truncating it, so an
  endpoint could exhaust its memory. It now stops at what it keeps.
- The routes that write to the ledger have their own secret and refuse requests
  that arrived through the tunnel.
- A registration path that skipped the Telegram ban check and email
  verification is removed.
- The post-login redirect is resolved the way a browser reads it, so a crafted
  `next` value can no longer lead off the site.

### Added

- QR codes are drawn in a rounded style, and the billing page is laid out as a
  wallet: balance first, deposits beside withdrawals, history as a ledger.
- The operator's withdrawal queue warns when the destination wallet was linked
  less than a day before the request.

### Known limitations

None of these has a known way to take over an account or move money. They are
listed so a deployer can weigh them.

- A charge above the daily limit is refused. Asking the user to approve a larger
  one is planned and is not in this release.
- Webhook URLs are checked against private address ranges when resolved, but the
  connection is not pinned to the address that was checked. The request is
  blind, HTTPS only, and nothing of the response is shown to the developer.
- Deactivating an account signs it out but leaves OAuth tokens it had issued in
  place until they expire. Banning, restricting and deleting revoke them.
- Token exchange and userinfo re-check whether a user is banned, but not whether
  they were restricted or scheduled for deletion since consenting.
- Cookie-authenticated API routes rely on `SameSite=Lax` and have no separate
  origin check. Server Actions keep Next.js's own.
- The identity provider's webhook is authenticated by its signature; the
  freshness check reads a header the signature does not cover, and a result is
  matched to a user by the reference the provider echoes back.
- A signing key whose `status` in `OIDC_SIGNING_KEYS_JSON` is misspelt is
  treated as active. Check the spelling when retiring a key.
- Registration tells a caller whether a username or email is taken. It is rate
  limited and behind Turnstile.
- A webhook delivery that crashes the worker mid-flight does not count as an
  attempt.
- Passkey sign-in does not ask for the Telegram step.

Running this safely also depends on the host: encrypt the disk, keep backups
somewhere other than the machine they describe, keep the backup decryption key
off that machine, and do not publish unrelated services on its interfaces.
