import { requestJson, type Transport } from "./transport";
import type {
  ActivationRequestResponse,
  ActivationStatusResponse,
  AppConfigResponse,
  CancelActivationResponse,
  CreateActivationRequestInput,
  ListActivationRequestsResponse,
  ListAuthorizationsResponse,
  RequestOptions,
  RevokeActivationResponse,
} from "./types";

function bearer(apiKey: string) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

export async function createActivationRequest(
  transport: Transport,
  input: CreateActivationRequestInput,
  options?: RequestOptions,
): Promise<ActivationRequestResponse> {
  const headers: Record<string, string> = bearer(input.apiKey);
  if (input.idempotencyKey) {
    // The server treats keys outside this range as absent rather than
    // rejecting them, which would silently drop the retry protection the
    // caller opted into.
    if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 255) {
      throw new Error("idempotencyKey must be 8-255 characters");
    }
    headers["idempotency-key"] = input.idempotencyKey;
  }
  return requestJson<ActivationRequestResponse>(
    transport,
    "/api/activation-requests",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestedSubject: input.requestedSubject,
        scopes: input.scopes,
        returnUrl: input.returnUrl,
        callbackUrl: input.callbackUrl,
      }),
    },
    options,
  );
}

export async function getActivationStatus(
  transport: Transport,
  input: { apiKey: string; id: string },
  options?: RequestOptions,
): Promise<ActivationStatusResponse> {
  return requestJson<ActivationStatusResponse>(
    transport,
    `/api/activation-requests/${encodeURIComponent(input.id)}`,
    { headers: { authorization: `Bearer ${input.apiKey}` } },
    options,
  );
}

export async function cancelActivationRequest(
  transport: Transport,
  input: { apiKey: string; id: string },
  options?: RequestOptions,
): Promise<CancelActivationResponse> {
  return requestJson<CancelActivationResponse>(
    transport,
    `/api/activation-requests/${encodeURIComponent(input.id)}/cancel`,
    { method: "POST", headers: bearer(input.apiKey) },
    options,
  );
}

export async function revokeActivation(
  transport: Transport,
  input: { apiKey: string; id: string },
  options?: RequestOptions,
): Promise<RevokeActivationResponse> {
  return requestJson<RevokeActivationResponse>(
    transport,
    `/api/activation-requests/${encodeURIComponent(input.id)}/revoke`,
    { method: "POST", headers: bearer(input.apiKey) },
    options,
  );
}

export async function getAppConfig(
  transport: Transport,
  input: { apiKey: string },
  options?: RequestOptions,
): Promise<AppConfigResponse> {
  return requestJson<AppConfigResponse>(
    transport,
    "/api/apps/me",
    { headers: { authorization: `Bearer ${input.apiKey}` } },
    options,
  );
}

export async function listActivationRequests(
  transport: Transport,
  input: { apiKey: string; subject?: string; status?: string },
  options?: RequestOptions,
): Promise<ListActivationRequestsResponse> {
  const params = new URLSearchParams();
  if (input.subject) {
    params.set("subject", input.subject);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  const qs = params.toString();
  const query = qs ? `?${qs}` : "";
  return requestJson<ListActivationRequestsResponse>(
    transport,
    `/api/activation-requests${query}`,
    { headers: { authorization: `Bearer ${input.apiKey}` } },
    options,
  );
}

export async function listAuthorizations(
  transport: Transport,
  input: { apiKey: string },
  options?: RequestOptions,
): Promise<ListAuthorizationsResponse> {
  return requestJson<ListAuthorizationsResponse>(
    transport,
    "/api/authorizations",
    { headers: { authorization: `Bearer ${input.apiKey}` } },
    options,
  );
}
