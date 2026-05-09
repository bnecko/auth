# OAuth Integration

Bottleneck Auth supports OAuth Authorization Code with PKCE. Tokens are opaque
server-side tokens, not JWTs.

Base URL:

```text
https://auth.bottleneck.cc
```

Discovery:

```http
GET /.well-known/oauth-authorization-server
```

## Client Credentials

Each OAuth client is an `external_apps` row.

- `client_id`: `external_apps.public_id`
- `client_secret`: the issued app API key, for confidential clients
- Redirect URIs: exact URL matches from `external_apps.allowed_redirect_urls`

PKCE S256 is required for all authorization-code exchanges.

## Authorization Request

Redirect the user to:

```http
GET /oauth/authorize?response_type=code&client_id=<client_id>&redirect_uri=<redirect_uri>&scope=profile:read%20email:read&state=<state>&code_challenge=<challenge>&code_challenge_method=S256
```

Supported scopes:

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
  "access_token": "opaque-token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "opaque-refresh-token",
  "scope": "profile:read email:read"
}
```

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
  "firstName": "Alex",
  "bio": null,
  "email": "alex@example.com",
  "birthdate": "2004-10-29"
}
```

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
