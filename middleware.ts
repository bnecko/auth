import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

// Security headers applied to every response. Notes:
//
// - frame-ancestors / X-Frame-Options: none of the auth pages should be
//   framed. The activate approve/deny screen is a particularly attractive
//   click-jacking target, so we deny framing globally.
// - script-src allows Cloudflare Turnstile (bot protection) and Telegram's
//   widget script. Production script execution is nonce based.
// - style-src and font-src cover the Google Fonts stylesheet referenced
//   from app/layout.tsx. If/when fonts are self-hosted these can drop to
//   'self'.
// - HSTS is only emitted in production to avoid breaking local http dev.
function nonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function contentSecurityPolicy(scriptNonce: string) {
  const scriptSources = [
    "'self'",
    "https://challenges.cloudflare.com",
    "https://telegram.org",
  ];
  const styleSources = [
    "'self'",
    "https://fonts.googleapis.com",
  ];

  if (process.env.NODE_ENV !== "production") {
    scriptSources.push("'unsafe-inline'");
    scriptSources.push("'unsafe-eval'");
    styleSources.push("'unsafe-inline'");
  } else {
    scriptSources.push(`'nonce-${scriptNonce}'`);
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: https://t.me",
    `script-src ${scriptSources.join(" ")}`,
    "frame-src 'self' https://challenges.cloudflare.com https://telegram.org https://oauth.telegram.org",
    `style-src ${styleSources.join(" ")}`,
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://oauth.telegram.org",
    "object-src 'none'",
  ].join("; ");
}

async function sendTelegramAnalytics(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ANALYTICS_CHAT_ID;
  const threadId = process.env.TELEGRAM_ANALYTICS_THREAD_ID;
  const internalSecret = process.env.INTERNAL_ANALYTICS_SECRET;

  if (!token || !chatId) return;
  if (process.env.NODE_ENV === "production" && !internalSecret) return;

  const path = req.nextUrl.pathname;
  if (
    path.startsWith("/_next/") || 
    path === "/favicon.ico" || 
    path.startsWith("/images/") ||
    path.startsWith("/api/")
  ) {
    return;
  }

  const country = req.headers.get("cf-ipcountry") || "N/A";

  const text = `bottleneck.cc analytics
when: ${new Date().toISOString()}
type: page
status: N/A
path: ${path}
country: ${country}`;

  const body: Record<string, any> = {
    chat_id: chatId,
    text,
  };
  if (threadId) {
    body.message_thread_id = Number(threadId);
  }

  // Use internal API to push to BullMQ
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (internalSecret) {
    headers["x-bottleneck-internal-secret"] = internalSecret;
  }

  await fetch(`${req.nextUrl.origin}/api/internal/analytics`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }).catch(err => console.error("Analytics error:", err.message));
}

export function middleware(req: NextRequest, event: NextFetchEvent) {
  const scriptNonce = nonce();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", scriptNonce);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  res.headers.set("x-pathname", req.nextUrl.pathname);
  res.headers.set("x-nonce", scriptNonce);
  res.headers.set("Content-Security-Policy", contentSecurityPolicy(scriptNonce));
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

  event.waitUntil(sendTelegramAnalytics(req));

  return res;
}

export const config = {
  // Apply to all paths except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
