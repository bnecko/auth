# OAuth 2.0 and OIDC conformance

This is a self-assessment of what the service implements against RFC 6749,
the PKCE/PAR/device extensions, and OpenID Connect Core. It has not been run
through the OpenID Foundation conformance suite; gaps are listed at the end.

## Discovery

- `GET /.well-known/openid-configuration`
- `GET /.well-known/oauth-authorization-server`
- `GET /oauth/jwks`

The metadata advertises only what is actually supported, so a client that
reads discovery will not be told about a grant or auth method that is not
wired up.

## Endpoints

| Purpose | Method | Path |
| --- | --- | --- |
| Authorization | GET | `/oauth/authorize` |
| Token | POST | `/api/oauth/token` |
| UserInfo | GET | `/api/oauth/userinfo` |
| Introspection (RFC 7662) | POST | `/api/oauth/introspect` |
| Revocation (RFC 7009) | POST | `/api/oauth/revoke` |
| Pushed Authorization Request (RFC 9126) | POST | `/api/oauth/par` |
| Device Authorization (RFC 8628) | POST | `/api/oauth/device/code` |
| Dynamic Client Registration (RFC 7591) | POST | `/api/oauth/register` |
| RP-initiated logout | GET | `/api/oauth/logout` |

## Grant types

- `authorization_code`
- `refresh_token`
- `client_credentials`
- `urn:ietf:params:oauth:grant-type:device_code`

`response_type` is `code` only. `response_mode` is `query` only. Implicit and
hybrid flows are not supported and are not advertised.

## PKCE

PKCE is required for the authorization code flow. Only `S256` is accepted;
`plain` is rejected at both the authorize and token steps. The same exact
`redirect_uri` must be presented at authorize and at token exchange, and the
authorization code is single-use with a 10-minute lifetime.

## Token formats

- **Access token**: RS256 JWT, 15-minute lifetime, also stored by hash so it
  can be revoked and introspected.
- **ID token**: RS256 JWT. Carries `auth_time` and `nonce` when applicable.
- **Refresh token**: opaque random string, stored by hash, rotated on every
  use with reuse detection.

## Client authentication

- `client_secret_basic`
- `client_secret_post`
- `private_key_jwt` (RFC 7523, RS256, single-use jti, 5-minute max assertion
  lifetime, `aud` must be the token endpoint)
- `none` (public clients, PKCE required)

Dynamic client registration requires `OAUTH_DYNAMIC_REGISTRATION_TOKEN` and
admin approval before the client becomes active. A registered-but-unapproved
client cannot complete a flow.

## Scopes and claims

Scopes: `openid`, `profile`, `email`, `birthdate`, and the read-aliases
`profile:read`, `email:read`, `dob:read`, `subscription:read`.

Claims released, gated by scope: `iss`, `aud`, `exp`, `iat`, `sub`,
`auth_time`, `nonce`, `name`, `preferred_username`, `email`,
`email_verified`, `birthdate`.

`sub` is the stable public user id. Subject type is `public`.

## Not implemented

- RS256 is the only signing algorithm. No ES256, no EdDSA.
- No DPoP or mTLS-bound tokens.
- No request object (JAR) signing or encryption beyond PAR.
- `prompt` supports `none`, `login`, and `consent`; `select_account` is
  parsed but there is no multi-account picker behind it.
- The `bn-oauth-2026-05` and `bn-oauth-2026-01` profiles are a
  forward-compatibility tag and behave identically today. The field is
  reserved for a future profile that mandates something new (for example
  DPoP). Do not rely on the legacy tag to opt out of current behavior.
- No OpenID Foundation conformance suite run has been published.
