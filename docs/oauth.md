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

## Dynamic Client Registration

`POST /api/oauth/register` is restricted. Set
`OAUTH_DYNAMIC_REGISTRATION_TOKEN` and send it as:

```http
Authorization: Bearer <registration-token>
```

Untrusted public registration is disabled when the token is not configured.

OIDC requires:

- `OIDC_PRIVATE_KEY_PEM`: RSA private key in PEM format
- `OIDC_KEY_ID`: key id published in JWKS

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

Refresh tokens are rotated.

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

The JWKS response publishes the RSA public key for ID token verification.

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
