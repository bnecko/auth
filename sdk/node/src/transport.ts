import { BottleneckAuthError, throwFromResponse } from "./errors";
import type { RequestOptions } from "./types";

export type Transport = {
  issuer: string;
  fetch: typeof fetch;
  timeoutMs: number;
};

export const DEFAULT_TIMEOUT_MS = 30_000;

// Runs one HTTP request with the client's fetch, a timeout, and an optional
// caller AbortSignal. Caller-initiated aborts rethrow the caller's own abort
// reason so their AbortError handling keeps working; timeouts and transport
// failures (DNS, refused connection) become BottleneckAuthError so every
// SDK-originated failure is one instanceof check away. Non-2xx responses
// throw via throwFromResponse.
export async function request(
  transport: Transport,
  path: string,
  init: RequestInit,
  options?: RequestOptions,
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? transport.timeoutMs;
  const controller = new AbortController();
  const onAbort = () => controller.abort(options?.signal?.reason);
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  if (options?.signal) {
    if (options.signal.aborted) {
      onAbort();
    } else {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
  }
  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  const url = `${transport.issuer}${path}`;
  let response: Response;
  try {
    response = await transport.fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (options?.signal?.aborted) {
      throw err;
    }
    if (timedOut) {
      throw new BottleneckAuthError({
        status: 0,
        code: "timeout",
        message: `request to ${url} timed out after ${timeoutMs}ms`,
      });
    }
    throw new BottleneckAuthError({
      status: 0,
      code: "network_error",
      message: `request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
      cause: err,
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    options?.signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    await throwFromResponse(response);
  }
  return response;
}
