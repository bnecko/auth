import { NextResponse, type NextRequest } from "next/server";
import { env, isProduction } from "./config";

export type RequestContext = {
  ip: string;
  userAgent: string;
  country: string;
};

// Returns the client IP, trusting proxy headers only when configured.
//
// Untrusted client-supplied X-Forwarded-For / X-Real-IP would let any
// caller spoof their IP for per-IP rate limiting and security event
// logging. In production we require an explicit TRUSTED_PROXY value to
// opt in to a specific proxy's header. Outside production the headers
// are still read so local development behind a reverse proxy works.
// Resolves the client IP from proxy headers, trusting them only when
// TRUSTED_PROXY opts in to a specific proxy. Takes a header getter so the
// same gate applies to both NextRequest handlers and server actions (which
// read headers via next/headers) — otherwise server actions would trust
// spoofable headers that the request path correctly ignores.
function resolveClientIp(get: (name: string) => string | null | undefined): string {
  const trusted = env("TRUSTED_PROXY").toLowerCase();

  if (trusted === "cf" || (!isProduction() && trusted === "")) {
    const cf = get("cf-connecting-ip");
    if (cf) return cf;
  }

  if (trusted === "xff" || (!isProduction() && trusted === "")) {
    const real = get("x-real-ip");
    if (real) return real;
    const fwd = get("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
  }

  // No trusted header available: surface an empty string so callers can
  // decide whether to skip per-IP rate limiting rather than bucketing every
  // visitor under a shared empty key.
  return "";
}

function clientIp(req: NextRequest): string {
  return resolveClientIp(name => req.headers.get(name));
}

// Correlation id set by proxy.ts; empty string when absent (e.g. a request
// that did not pass through the middleware). Useful in log lines.
export function requestId(req: NextRequest): string {
  return req.headers.get("x-request-id") || "";
}

export function requestContext(req: NextRequest): RequestContext {
  return {
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent") || "",
    country:
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      "",
  };
}

// Server actions don't have a NextRequest, so they read the same proxy
// headers via Next.js headers() instead.
export function requestContextFromHeaders(
  h: Awaited<ReturnType<typeof import("next/headers").headers>>,
): RequestContext {
  return {
    ip: resolveClientIp(name => h.get(name)),
    userAgent: h.get("user-agent") || "",
    country: h.get("cf-ipcountry") || h.get("x-vercel-ip-country") || "",
  };
}

export async function requestBody(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await req.json()) as Record<string, unknown>;
  }

  if (contentType.includes("form")) {
    const form = await req.formData();
    return Object.fromEntries(form.entries());
  }

  return {};
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function badRequest(message: string) {
  return json({ error: message }, 400);
}

// Error envelope for the external integrator API: a human-readable `error`
// string plus a stable machine-readable `code`, so clients can branch on the
// code instead of string-matching English.
export function apiError(message: string, code: string, status = 400) {
  return json({ error: message, code }, status);
}

export function unauthorized(message = "unauthorized") {
  return json({ error: message }, 401);
}

export function forbidden(message = "forbidden") {
  return json({ error: message }, 403);
}

export function tooManyRequests(message = "too many requests") {
  return json({ error: message }, 429);
}

// 429 with a Retry-After (seconds) the client can honor, plus the coded
// envelope. resetMs is the epoch-ms when the current window clears.
export function rateLimited(resetMs: number) {
  const retryAfter = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
  return NextResponse.json(
    { error: "rate limited", code: "rate_limited" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "RateLimit-Reset": String(retryAfter),
        "Cache-Control": "no-store",
      },
    },
  );
}
