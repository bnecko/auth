export class BottleneckAuthError extends Error {
  // 0 when the request never produced an HTTP response (network failure,
  // timeout); the HTTP status otherwise.
  readonly status: number;
  readonly code: string;
  readonly responseBody: unknown;
  // Parsed from the Retry-After header on 429 responses, in seconds.
  readonly retryAfterSeconds?: number;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    responseBody?: unknown;
    retryAfterSeconds?: number;
    cause?: unknown;
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "BottleneckAuthError";
    this.status = input.status;
    this.code = input.code;
    this.responseBody = input.responseBody;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

export async function throwFromResponse(response: Response): Promise<never> {
  let body: unknown = null;
  let code = "request_failed";
  let message = `${response.status} ${response.statusText}`;

  try {
    body = await response.json();
  } catch {
    // Body wasn't JSON; keep the default message.
  }

  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    // Two envelopes share the `error` key with opposite meanings. The
    // activation API returns { error: <human message>, code: <stable code> };
    // OAuth endpoints return { error: <stable code>, error_description:
    // <human message> }. The stable code is what callers branch on.
    if (typeof obj.code === "string") {
      code = obj.code;
      if (typeof obj.error === "string") {
        message = obj.error;
      }
    } else if (typeof obj.error === "string") {
      code = obj.error;
      message = typeof obj.error_description === "string"
        ? obj.error_description
        : obj.error;
    }
  }

  const retryAfter = response.headers.get("retry-after");

  throw new BottleneckAuthError({
    status: response.status,
    code,
    message,
    responseBody: body,
    retryAfterSeconds:
      retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined,
  });
}
