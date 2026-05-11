import { createHmac, timingSafeEqual } from "crypto";

export type BottleneckAuthClientOptions = {
  issuer: string;
  clientId?: string;
  clientSecret?: string;
};

export class BottleneckAuthClient {
  private issuer: string;
  private clientId?: string;
  private clientSecret?: string;

  constructor(options: BottleneckAuthClientOptions) {
    this.issuer = options.issuer.replace(/\/+$/, "");
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
  }

  async userinfo(accessToken: string) {
    const response = await fetch(`${this.issuer}/api/oauth/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`userinfo failed: ${response.status}`);
    }
    return response.json();
  }

  async introspect(token: string) {
    const body = new URLSearchParams({ token });
    const response = await fetch(`${this.issuer}/api/oauth/introspect`, {
      method: "POST",
      headers: this.clientAuthHeaders(),
      body,
    });
    if (!response.ok) {
      throw new Error(`introspection failed: ${response.status}`);
    }
    return response.json();
  }

  private clientAuthHeaders(): Record<string, string> {
    if (!this.clientId || !this.clientSecret) {
      return {};
    }
    const value = Buffer.from(`${encodeURIComponent(this.clientId)}:${encodeURIComponent(this.clientSecret)}`).toString("base64");
    return {
      authorization: `Basic ${value}`,
      "content-type": "application/x-www-form-urlencoded",
    };
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
