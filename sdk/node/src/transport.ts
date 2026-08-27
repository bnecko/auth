import { BottleneckAuthError, throwFromResponse } from "./errors";
import type { RequestOptions } from "./types";

export type Transport = {
  issuer: string;
  fetch: typeof fetch;
  timeoutMs: number;
};

export const DEFAULT_TIMEOUT_MS = 30_000;

// Runs one HTTP request with the client's fetch, a timeout, and an optional
// caller AbortSignal. The body is read to completion inside the same guarded
// window as the fetch itself: a server that returns headers and then stalls
// the body would otherwise hang past timeoutMs and outlive the caller's
// signal. Caller-initiated aborts rethrow the caller's own abort reason so
// their AbortError handling keeps working; timeouts and transport failures
// (DNS, refused connection, a connection dropped mid-body) become
// BottleneckAuthError so every SDK-originated failure is one instanceof
// check away. Non-2xx responses throw via throwFromResponse.
async function send(
  transport: Transport,
  path: string,
  init: RequestInit,
  options?: RequestOptions,
): Promise<{ status: number; bodyText: string }> {
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
  try {
    const response = await transport.fetch(url, { ...init, signal: controller.signal });
    const bodyText = await readBody(response, controller.signal);
    if (!response.ok) {
      throwFromResponse(response, bodyText);
    }
    return { status: response.status, bodyText };
  } catch (err) {
    if (err instanceof BottleneckAuthError) {
      throw err;
    }
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
}

// Real fetch rejects an in-progress body read when the request's signal
// aborts, but an injected fetch may hand back a Response with no tie to the
// signal at all. Racing the read against the abort keeps the timeout and
// caller-abort guarantees unconditional; a read the implementation cannot
// cancel is simply abandoned.
function readBody(response: Response, signal: AbortSignal): Promise<string> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return Promise.race([
    response.text(),
    new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  ]);
}

export async function requestJson<T>(
  transport: Transport,
  path: string,
  init: RequestInit,
  options?: RequestOptions,
): Promise<T> {
  const { status, bodyText } = await send(transport, path, init, options);
  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new BottleneckAuthError({
      status,
      code: "invalid_response",
      message: `expected a JSON body from ${path}, got ${bodyText === "" ? "an empty response" : "non-JSON content"}`,
    });
  }
}

// For endpoints that succeed with an empty body (RFC 7009 revocation).
export async function requestVoid(
  transport: Transport,
  path: string,
  init: RequestInit,
  options?: RequestOptions,
): Promise<void> {
  await send(transport, path, init, options);
}
