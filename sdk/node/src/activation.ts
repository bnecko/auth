import { throwFromResponse } from "./errors";
import type {
  ActivationRequestResponse,
  ActivationStatusResponse,
  CancelActivationResponse,
  CreateActivationRequestInput,
} from "./types";

function bearer(apiKey: string) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

export async function createActivationRequest(
  issuer: string,
  input: CreateActivationRequestInput,
): Promise<ActivationRequestResponse> {
  const response = await fetch(`${issuer}/api/activation-requests`, {
    method: "POST",
    headers: bearer(input.apiKey),
    body: JSON.stringify({
      requestedSubject: input.requestedSubject,
      scopes: input.scopes,
      returnUrl: input.returnUrl,
      callbackUrl: input.callbackUrl,
    }),
  });
  if (!response.ok) {
    await throwFromResponse(response);
  }
  return (await response.json()) as ActivationRequestResponse;
}

export async function getActivationStatus(
  issuer: string,
  input: { apiKey: string; id: string },
): Promise<ActivationStatusResponse> {
  const response = await fetch(
    `${issuer}/api/activation-requests/${encodeURIComponent(input.id)}`,
    { headers: { authorization: `Bearer ${input.apiKey}` } },
  );
  if (!response.ok) {
    await throwFromResponse(response);
  }
  return (await response.json()) as ActivationStatusResponse;
}

export async function cancelActivationRequest(
  issuer: string,
  input: { apiKey: string; id: string },
): Promise<CancelActivationResponse> {
  const response = await fetch(
    `${issuer}/api/activation-requests/${encodeURIComponent(input.id)}/cancel`,
    { method: "POST", headers: bearer(input.apiKey) },
  );
  if (!response.ok) {
    await throwFromResponse(response);
  }
  return (await response.json()) as CancelActivationResponse;
}
