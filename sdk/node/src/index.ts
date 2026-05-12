import { createHmac, timingSafeEqual } from "crypto";
import { throwFromResponse } from "./errors";
import {
  cancelActivationRequest,
  createActivationRequest,
  getActivationStatus,
} from "./activation";
import { buildAuthorizationUrl, generatePkcePair } from "./pkce";
import type {
  ActivationRequestResponse,
  ActivationStatusResponse,
  AuthorizationUrlInput,
  CancelActivationResponse,
  CreateActivationRequestInput,
  IntrospectResponse,
  PkcePair,
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
};

export class BottleneckAuthClient {
  private readonly issuer: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;

  constructor(options: BottleneckAuthClientOptions) {
    this.issuer = options.issuer.replace(/\/+$/, "");
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
  }

  buildAuthorizationUrl(input: AuthorizationUrlInput) {
    return buildAuthorizationUrl(this.issuer, input);
  }

  generatePkcePair(): PkcePair {
    return generatePkcePair();
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<TokenResponse> {
    return this.postToken({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    });
  }

  async refreshToken(input: { refreshToken: string }): Promise<TokenResponse> {
    return this.postToken({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    });
  }

  async userinfo(accessToken: string): Promise<UserInfoResponse> {
    const response = await fetch(`${this.issuer}/api/oauth/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      await throwFromResponse(response);
    }
    return (await response.json()) as UserInfoResponse;
  }

  async introspect(token: string): Promise<IntrospectResponse> {
    const body = new URLSearchParams({ token });
    const response = await fetch(`${this.issuer}/api/oauth/introspect`, {
      method: "POST",
      headers: this.clientAuthHeaders(),
      body,
    });
    if (!response.ok) {
      await throwFromResponse(response);
    }
    return (await response.json()) as IntrospectResponse;
  }

  createActivationRequest(
    input: CreateActivationRequestInput,
  ): Promise<ActivationRequestResponse> {
    return createActivationRequest(this.issuer, input);
  }

  getActivationStatus(input: {
    apiKey: string;
    id: string;
  }): Promise<ActivationStatusResponse> {
    return getActivationStatus(this.issuer, input);
  }

  cancelActivationRequest(input: {
    apiKey: string;
    id: string;
  }): Promise<CancelActivationResponse> {
    return cancelActivationRequest(this.issuer, input);
  }

  private async postToken(form: Record<string, string>): Promise<TokenResponse> {
    if (!this.clientId) {
      throw new Error("clientId is required for token exchange");
    }
    const body = new URLSearchParams(form);
    // Public clients (no secret) must still send client_id in the body
    // per RFC 6749 section 3.2.1. Confidential clients send Basic auth
    // when a secret is configured.
    if (!this.clientSecret) {
      body.set("client_id", this.clientId);
    }
    const response = await fetch(`${this.issuer}/api/oauth/token`, {
      method: "POST",
      headers: this.clientAuthHeaders(),
      body,
    });
    if (!response.ok) {
      await throwFromResponse(response);
    }
    return (await response.json()) as TokenResponse;
  }

  private clientAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
    };
    if (this.clientId && this.clientSecret) {
      const value = Buffer.from(
        `${encodeURIComponent(this.clientId)}:${encodeURIComponent(this.clientSecret)}`,
      ).toString("base64");
      headers.authorization = `Basic ${value}`;
    }
    return headers;
  }
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
}) {
  const expected = createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(input.signature);
  return expectedBuffer.length === actualBuffer.length
    && timingSafeEqual(expectedBuffer, actualBuffer);
}
