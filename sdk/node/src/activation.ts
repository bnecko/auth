import { request, type Transport } from "./transport";
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
    headers["idempotency-key"] = input.idempotencyKey;
  }
  const response = await request(
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
  return (await response.json()) as ActivationRequestResponse;
}

export async function getActivationStatus(
  transport: Transport,
  input: { apiKey: string; id: string },
  options?: RequestOptions,
): Promise<ActivationStatusResponse> {
  const response = await request(
    transport,
    `/api/activation-requests/${encodeURIComponent(input.id)}`,
    { headers: { authorization: `Bearer ${input.apiKey}` } },
    options,
  );
  return (await response.json()) as ActivationStatusResponse;
}

export async function cancelActivationRequest(
  transport: Transport,
  input: { apiKey: string; id: string },
  options?: RequestOptions,
): Promise<CancelActivationResponse> {
  const response = await request(
    transport,
    `/api/activation-requests/${encodeURIComponent(input.id)}/cancel`,
    { method: "POST", headers: bearer(input.apiKey) },
    options,
  );
  return (await response.json()) as CancelActivationResponse;
}

export async function revokeActivation(
  transport: Transport,
  input: { apiKey: string; id: string },
  options?: RequestOptions,
): Promise<RevokeActivationResponse> {
  const response = await request(
    transport,
    `/api/activation-requests/${encodeURIComponent(input.id)}/revoke`,
    { method: "POST", headers: bearer(input.apiKey) },
    options,
  );
  return (await response.json()) as RevokeActivationResponse;
}

export async function getAppConfig(
  transport: Transport,
  input: { apiKey: string },
  options?: RequestOptions,
): Promise<AppConfigResponse> {
  const response = await request(
    transport,
    "/api/apps/me",
    { headers: { authorization: `Bearer ${input.apiKey}` } },
    options,
  );
  return (await response.json()) as AppConfigResponse;
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
  const response = await request(
    transport,
    `/api/activation-requests${query}`,
    { headers: { authorization: `Bearer ${input.apiKey}` } },
    options,
  );
  return (await response.json()) as ListActivationRequestsResponse;
}

export async function listAuthorizations(
  transport: Transport,
  input: { apiKey: string },
  options?: RequestOptions,
): Promise<ListAuthorizationsResponse> {
  const response = await request(
    transport,
    "/api/authorizations",
    { headers: { authorization: `Bearer ${input.apiKey}` } },
    options,
  );
  return (await response.json()) as ListAuthorizationsResponse;
}
