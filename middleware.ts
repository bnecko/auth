import { NextResponse, type NextRequest } from "next/server";

// Security headers applied to every response. Notes:
//
// - frame-ancestors / X-Frame-Options: none of the auth pages should be
//   framed. The activate approve/deny screen is a particularly attractive
//   click-jacking target, so we deny framing globally.
// - script-src allows Cloudflare Turnstile (bot protection) which is loaded
//   on the login and register pages.
// - style-src and font-src cover the Google Fonts stylesheet referenced
//   from app/layout.tsx. If/when fonts are self-hosted these can drop to
//   'self'.
// - HSTS is only emitted in production to avoid breaking local http dev.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "frame-src https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://cloudflareinsights.com",
  "object-src 'none'",
].join("; ");

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "geolocation=(), camera=(), microphone=()");

  if (process.env.NODE_ENV === "production") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return res;
}

export const config = {
  // Apply to all paths except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
