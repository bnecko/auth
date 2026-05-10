import { NextResponse } from "next/server";

export const runtime = "edge";

const baseUrl = "https://auth.bottleneck.cc";

export async function GET() {
  return NextResponse.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    userinfo_endpoint: `${baseUrl}/api/oauth/userinfo`,
    jwks_uri: `${baseUrl}/oauth/jwks`,
    registration_endpoint: `${baseUrl}/api/oauth/register`,
    revocation_endpoint: `${baseUrl}/api/oauth/revoke`,
    introspection_endpoint: `${baseUrl}/api/oauth/introspect`,
    pushed_authorization_request_endpoint: `${baseUrl}/api/oauth/par`,
    device_authorization_endpoint: `${baseUrl}/api/oauth/device/code`,
    scopes_supported: [
      "openid",
      "profile",
      "email",
      "birthdate",
      "subscription:read"
    ],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
      "client_credentials",
      "urn:ietf:params:oauth:grant-type:device_code"
    ],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
    claims_supported: [
      "sub",
      "iss",
      "aud",
      "exp",
      "iat",
      "name",
      "preferred_username",
      "email",
      "email_verified",
      "birthdate"
    ],
    code_challenge_methods_supported: ["S256"],
    require_pushed_authorization_requests: false
  }, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
