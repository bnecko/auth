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
function clientIp(req: NextRequest): string {
  const trusted = env("TRUSTED_PROXY").toLowerCase();

  if (trusted === "cf" || (!isProduction() && trusted === "")) {
    const cf = req.headers.get("cf-connecting-ip");
    if (cf) return cf;
  }

  if (trusted === "xff" || (!isProduction() && trusted === "")) {
    const real = req.headers.get("x-real-ip");
    if (real) return real;
    const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
  }

  // Next.js does not expose req.ip on NextRequest in all runtimes; if no
  // trusted header is available we surface an empty string so callers can
  // decide whether to skip per-IP rate limiting rather than rate-limiting
  // every visitor under a shared empty key.
  return "";
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

export function unauthorized(message = "unauthorized") {
  return json({ error: message }, 401);
}

export function forbidden(message = "forbidden") {
  return json({ error: message }, 403);
}
