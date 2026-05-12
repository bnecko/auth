export class BottleneckAuthError extends Error {
  readonly status: number;
  readonly code: string;
  readonly responseBody: unknown;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    responseBody?: unknown;
  }) {
    super(input.message);
    this.name = "BottleneckAuthError";
    this.status = input.status;
    this.code = input.code;
    this.responseBody = input.responseBody;
  }
}

export async function throwFromResponse(response: Response): Promise<never> {
  let body: unknown = null;
  let code = "request_failed";
  let message = `${response.status} ${response.statusText}`;

  try {
    body = await response.json();
    if (body && typeof body === "object") {
      const obj = body as Record<string, unknown>;
      if (typeof obj.error === "string") {
        code = obj.error;
        message = typeof obj.error_description === "string"
          ? obj.error_description
          : obj.error;
      }
    }
  } catch {
    // Body wasn't JSON; keep the default message.
  }

  throw new BottleneckAuthError({
    status: response.status,
    code,
    message,
    responseBody: body,
  });
}
