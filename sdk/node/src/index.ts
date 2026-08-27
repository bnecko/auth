import { createHmac, timingSafeEqual } from "crypto";
import * as activation from "./activation";
import { buildAuthorizationUrl, generatePkcePair } from "./pkce";
import { DEFAULT_TIMEOUT_MS, requestJson, requestVoid, type Transport } from "./transport";
import type {
  ActivationRequestResponse,
  ActivationStatusResponse,
  AppConfigResponse,
  AuthorizationUrlInput,
  CancelActivationResponse,
  CreateActivationRequestInput,
  IntrospectResponse,
  ListActivationRequestsResponse,
  ListAuthorizationsResponse,
  PkcePair,
  RequestOptions,
  RevokeActivationResponse,
  TokenEndpointAuthMethod,
  TokenResponse,
  UserInfoResponse,
} from "./types";

export * from "./types";
export { BottleneckAuthError } from "./errors";
export { generatePkcePair, buildAuthorizationUrl } from "./pkce";

export type BottleneckAuthClientOptions = {
  issuer: string;
  clientId?: string;
  clientSecret?: string;
  // Defaults to client_secret_post when a secret is configured (the method
  // self-service apps are registered with) and none otherwise. Must match
  // the app's registered method or the server rejects with invalid_client.
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
  // Substitute fetch implementation, e.g. for tests or an instrumented
  // client. Defaults to the global fetch.
  fetch?: typeof fetch;
  // Default per-request timeout in milliseconds; 0 disables. Overridable
  // per call via RequestOptions.
  timeoutMs?: number;
};

export class BottleneckAuthClient {
  private readonly transport: Transport;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly tokenEndpointAuthMethod: TokenEndpointAuthMethod;

  constructor(options: BottleneckAuthClientOptions) {
    // Wrapped in an arrow so the transport never invokes an injected fetch
    // as a method of the transport object: this-sensitive implementations
    // (an unbound browser fetch, an instrumented client's method) throw
    // Illegal invocation when called with a foreign receiver.
    const fetchImpl = options.fetch;
    this.transport = {
      issuer: options.issuer.replace(/\/+$/, ""),
      fetch: fetchImpl
        ? (input, init) => fetchImpl(input, init)
        : (input, init) => fetch(input, init),
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.tokenEndpointAuthMethod =
      options.tokenEndpointAuthMethod ??
      (options.clientSecret ? "client_secret_post" : "none");

    if (this.tokenEndpointAuthMethod === "none" && this.clientSecret) {
      throw new Error(
        "clientSecret must not be set when tokenEndpointAuthMethod is none",
      );
    }
    if (this.tokenEndpointAuthMethod !== "none" && !this.clientSecret) {
      throw new Error(
        `clientSecret is required for ${this.tokenEndpointAuthMethod}`,
      );
    }
    if (this.tokenEndpointAuthMethod !== "none" && !this.clientId) {
      throw new Error(
        `clientId is required for ${this.tokenEndpointAuthMethod}`,
      );
    }
  }

  buildAuthorizationUrl(input: AuthorizationUrlInput) {
    return buildAuthorizationUrl(this.transport.issuer, input);
  }

  generatePkcePair(): PkcePair {
    return generatePkcePair();
  }

  async exchangeCode(
    input: { code: string; redirectUri: string; codeVerifier: string },
    options?: RequestOptions,
  ): Promise<TokenResponse> {
    return this.postToken(
      {
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      },
      options,
    );
  }

  async refreshToken(
    input: { refreshToken: string },
    options?: RequestOptions,
  ): Promise<TokenResponse> {
    return this.postToken(
      { grant_type: "refresh_token", refresh_token: input.refreshToken },
      options,
    );
  }

  async clientCredentialsGrant(
    input: { scope?: string } = {},
    options?: RequestOptions,
  ): Promise<TokenResponse> {
    const form: Record<string, string> = { grant_type: "client_credentials" };
    if (input.scope) {
      form.scope = input.scope;
    }
    return this.postToken(form, options);
  }

  userinfo(
    accessToken: string,
    options?: RequestOptions,
  ): Promise<UserInfoResponse> {
    return requestJson<UserInfoResponse>(
      this.transport,
      "/api/oauth/userinfo",
      { headers: { authorization: `Bearer ${accessToken}` } },
      options,
    );
  }

  introspect(
    token: string,
    options?: RequestOptions,
  ): Promise<IntrospectResponse> {
    return this.postClientAuthenticated<IntrospectResponse>(
      "/api/oauth/introspect",
      new URLSearchParams({ token }),
      options,
    );
  }

  // RFC 7009 revocation. Revoking a refresh token also revokes the access
  // tokens issued from it. Resolves on 200; the endpoint has no body.
  async revokeToken(
    input: { token: string; tokenTypeHint?: "access_token" | "refresh_token" },
    options?: RequestOptions,
  ): Promise<void> {
    const body = new URLSearchParams({ token: input.token });
    if (input.tokenTypeHint) {
      body.set("token_type_hint", input.tokenTypeHint);
    }
    const headers = this.clientAuthHeaders("/api/oauth/revoke", body);
    await requestVoid(
      this.transport,
      "/api/oauth/revoke",
      { method: "POST", headers, body },
      options,
    );
  }

  createActivationRequest(
    input: CreateActivationRequestInput,
    options?: RequestOptions,
  ): Promise<ActivationRequestResponse> {
    return activation.createActivationRequest(this.transport, input, options);
  }

  getActivationStatus(
    input: { apiKey: string; id: string },
    options?: RequestOptions,
  ): Promise<ActivationStatusResponse> {
    return activation.getActivationStatus(this.transport, input, options);
  }

  cancelActivationRequest(
    input: { apiKey: string; id: string },
    options?: RequestOptions,
  ): Promise<CancelActivationResponse> {
    return activation.cancelActivationRequest(this.transport, input, options);
  }

  // Revokes the standing grant behind an approved activation. The status
  // endpoint then reports revoked: true and stops returning the profile.
  revokeActivation(
    input: { apiKey: string; id: string },
    options?: RequestOptions,
  ): Promise<RevokeActivationResponse> {
    return activation.revokeActivation(this.transport, input, options);
  }

  getAppConfig(
    input: { apiKey: string },
    options?: RequestOptions,
  ): Promise<AppConfigResponse> {
    return activation.getAppConfig(this.transport, input, options);
  }

  listActivationRequests(
    input: { apiKey: string; subject?: string; status?: string },
    options?: RequestOptions,
  ): Promise<ListActivationRequestsResponse> {
    return activation.listActivationRequests(this.transport, input, options);
  }

  listAuthorizations(
    input: { apiKey: string },
    options?: RequestOptions,
  ): Promise<ListAuthorizationsResponse> {
    return activation.listAuthorizations(this.transport, input, options);
  }

  private postToken(
    form: Record<string, string>,
    options?: RequestOptions,
  ): Promise<TokenResponse> {
    return this.postClientAuthenticated<TokenResponse>(
      "/api/oauth/token",
      new URLSearchParams(form),
      options,
    );
  }

  private postClientAuthenticated<T>(
    path: string,
    body: URLSearchParams,
    options?: RequestOptions,
  ): Promise<T> {
    const headers = this.clientAuthHeaders(path, body);
    return requestJson<T>(
      this.transport,
      path,
      { method: "POST", headers, body },
      options,
    );
  }

  // Adds the configured client authentication to a form-encoded request:
  // Basic header, or credentials in the body. Mutates body for the post and
  // none methods.
  private clientAuthHeaders(
    path: string,
    body: URLSearchParams,
  ): Record<string, string> {
    if (!this.clientId) {
      throw new Error(`clientId is required for ${path}`);
    }
    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
    };
    switch (this.tokenEndpointAuthMethod) {
      case "client_secret_basic": {
        const value = Buffer.from(
          `${encodeURIComponent(this.clientId)}:${encodeURIComponent(this.clientSecret as string)}`,
        ).toString("base64");
        headers.authorization = `Basic ${value}`;
        break;
      }
      case "client_secret_post":
        body.set("client_id", this.clientId);
        body.set("client_secret", this.clientSecret as string);
        break;
      case "none":
        // Public clients still send client_id in the body per RFC 6749
        // section 3.2.1.
        body.set("client_id", this.clientId);
        break;
    }
    return headers;
  }
}

export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

// Verifies both authenticity (HMAC over `<timestamp>.<body>`) and freshness:
// a valid signature over a stale timestamp is exactly what a replayed
// delivery looks like. The tolerance bounds skew in both directions, so a
// slightly-ahead server clock still verifies but a captured delivery cannot
// be replayed later. For dedup within the tolerance window, track the
// X-Bottleneck-Delivery id.
export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  toleranceSeconds?: number;
}) {
  // Header values arrive from untrusted requests, so a missing or non-string
  // signature must fail verification rather than throw from Buffer.from; the
  // timestamp regex already fails closed the same way.
  if (typeof input.signature !== "string") {
    return false;
  }
  if (!/^\d+$/.test(input.timestamp)) {
    return false;
  }
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp)) {
    return false;
  }
  const tolerance = input.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > tolerance) {
    return false;
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(input.signature);
  return expectedBuffer.length === actualBuffer.length
    && timingSafeEqual(expectedBuffer, actualBuffer);
}
