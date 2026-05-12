# OAuth/OIDC Integration

Bottleneck Auth supports OAuth Authorization Code with PKCE and OpenID Connect.
Access tokens are short-lived RS256 JWTs signed with the server OIDC private key
and stored server-side by hash for revocation. Refresh tokens are opaque random
strings stored by SHA-256 hash. ID tokens are RS256 JWTs.

Base URL:

```text
https://auth.bottleneck.cc
```

Discovery:

```http
GET /.well-known/oauth-authorization-server
GET /.well-known/openid-configuration
```

## Client Credentials

Each OAuth client is an `external_apps` row.

- `client_id`: `external_apps.public_id`
- `client_secret`: the issued OAuth client secret, for confidential clients
- Redirect URIs: exact URL matches from `external_apps.allowed_redirect_urls`

PKCE S256 is required for all authorization-code exchanges.
Client policy is enforced per app: grant types, scopes, token endpoint auth
method, and refresh-token issuance are configured on the `external_apps` row.

## Client authentication methods

The token endpoint accepts four `token_endpoint_auth_method` values per client:

- `client_secret_post` (default) — `client_id` + `client_secret` in the form body
- `client_secret_basic` — HTTP Basic header
- `private_key_jwt` — RFC 7523 client assertion signed with the client's
  private key. The matching public key is registered as either an inline
  `jwks` object on the client or a fetchable `jwks_uri`. Send
  `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`
  and `client_assertion=<JWT>` in the form body. The assertion must:
  - sign with RS256
  - set `iss` and `sub` to the `client_id`
  - include the token endpoint URL in `aud`
  - have an `exp` no more than 5 minutes in the future
  - include a unique `jti` (replays are rejected with `invalid_client`)
- `none` — public clients only; no secret. PKCE remains mandatory.

Choose the method at client creation time (DCR `token_endpoint_auth_method`
or admin assignment). Once set it does not change without operator action.

## OAuth Profile Versions

The profile version is a forward-compatibility tag stored per client. It does
not change behaviour today — every client receives the same security policy
regardless of which version is set:

- strict client policy (PKCE S256 required, exact redirect_uri match)
- short-lived RS256 JWT access tokens
- refresh-token rotation with reuse detection (presenting a rotated token
  revokes all tokens issued for that client + user)
- one-time DCR secret reveal

Supported tags:

- `bn-oauth-2026-05` — current default
- `bn-oauth-2026-01` — legacy tag, same behaviour as current

The field is reserved for a future divergence (e.g. a `bn-oauth-2026-09`
profile that mandates DPoP). New clients should stay on `bn-oauth-2026-05`.
Do not rely on the legacy tag to opt out of any current security behaviour;
the code does not branch on it.

## Dynamic Client Registration

`POST /api/oauth/register` is restricted. Set
`OAUTH_DYNAMIC_REGISTRATION_TOKEN` and send it as:

```http
Authorization: Bearer <registration-token>
```

Untrusted public registration is disabled when the token is not configured.
Accepted requests are queued for admin review. The response is `202` with
`registration_client_uri`, `registration_access_token`, and
`registration_status=pending_review`. Poll the registration URI with the
registration access token. Once an admin approves the request, the response
returns the client metadata and reveals `client_secret` once for confidential
clients.

Supported request fields:

- `client_name` — required
- `redirect_uris` — required, HTTPS (or localhost in development)
- `post_logout_redirect_uris` — optional, used by the RP-Initiated Logout
  endpoint to validate the post-logout target
- `grant_types`, `scope`, `token_endpoint_auth_method`, `oauth_profile_version`
- `jwks_uri` or `jwks` — required when `token_endpoint_auth_method` is
  `private_key_jwt`

OIDC requires:

- `OIDC_PRIVATE_KEY_PEM`: RSA private key in PEM format
- `OIDC_KEY_ID`: key id published in JWKS
- `OIDC_SIGNING_KEYS_JSON`: optional key set for rotation. Entries use `kid`,
  `privateKeyPem`, and `status` of `active`, `retired`, or `revoked`.

## Authorization Request

Redirect the user to:

```http
GET /oauth/authorize?response_type=code&client_id=<client_id>&redirect_uri=<redirect_uri>&scope=openid%20profile%20email&state=<state>&nonce=<nonce>&code_challenge=<challenge>&code_challenge_method=S256
```

Supported scopes:

- `openid`
- `profile`
- `email`
- `birthdate`
- `profile:read`
- `email:read`
- `dob:read`
- `subscription:read`

On approval, the browser redirects to:

```text
<redirect_uri>?code=<authorization_code>&state=<state>
```

On denial, the browser redirects with `error=access_denied`.

## Token Exchange

```http
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
client_id=<client_id>&
client_secret=<client_secret>&
code=<authorization_code>&
redirect_uri=<redirect_uri>&
code_verifier=<verifier>
```

Public clients can omit `client_secret`, but must still use PKCE.

Response:

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "opaque-refresh-token",
  "oauth_profile_version": "bn-oauth-2026-05",
  "scope": "openid profile email",
  "id_token": "signed-jwt"
}
```

`id_token` is returned when the approved scope includes `openid`.
The default access-token lifetime is 15 minutes and can be changed with
`OAUTH_ACCESS_TOKEN_TTL_SECONDS`.

## Client Credentials

Client-credentials access tokens use the app public ID as `sub`. They do not
represent the app owner or any other user, and they are not accepted at
`userinfo`.

## Refresh

Refresh tokens are rotated. The replacement carries the original `auth_time`
forward, so ID tokens issued from a refresh report the moment of the original
first-factor authentication, not the moment of the rotation. Refresh-token
reuse — presenting a rotated token — revokes all tokens issued to the
(client, user) pair.

```http
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
client_id=<client_id>&
client_secret=<client_secret>&
refresh_token=<refresh_token>
```

## Userinfo

```http
GET /api/oauth/userinfo
Authorization: Bearer <access_token>
```

Response fields depend on granted scopes:

```json
{
  "sub": "usr_xxx",
  "id": "usr_xxx",
  "username": "alex",
  "preferred_username": "alex",
  "name": "Alex",
  "firstName": "Alex",
  "bio": null,
  "email": "alex@example.com",
  "email_verified": true,
  "birthdate": "2004-10-29"
}
```

## JWKS

```http
GET /oauth/jwks
```

The JWKS response publishes active and retired RSA public keys for token
verification. Revoked keys are removed from JWKS immediately; remove a key or
mark it `revoked` in `OIDC_SIGNING_KEYS_JSON` for emergency revocation.

## Introspection

```http
POST /api/oauth/introspect
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

token=<access_token>
```

Response:

```json
{
  "active": true,
  "client_id": "app_xxx",
  "sub": "usr_xxx",
  "scope": "profile:read email:read",
  "exp": 1778342184
}
```

## Revocation

```http
POST /api/oauth/revoke
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

token=<access_or_refresh_token>&token_type_hint=refresh_token
```

Revocation returns `200` for valid and unknown tokens.
