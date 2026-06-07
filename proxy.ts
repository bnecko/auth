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
export function nonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // String.fromCharCode(...bytes) round-trips through UTF-16 and can produce
  // invalid surrogate pairs for arbitrary byte sequences. Build the binary
  // string char-by-char then base64-encode it.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function contentSecurityPolicy(scriptNonce: string) {
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
    // 'strict-dynamic' trusts scripts loaded by nonced scripts, covering
    // Next.js's dynamically imported chunks without needing per-chunk nonces.
    scriptSources.push("'strict-dynamic'");
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

  const text = `bneck.com analytics
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

const LEGACY_DOMAIN = "auth.bottleneck.cc";
const NEW_DOMAIN = "https://auth.bneck.com";

// API clients on the old origin must get a machine-readable error, not the
// HTML notice: an HTML 200 passes their `response.ok` check and then throws
// on `response.json()`, surfacing as a generic failure with no signal. Return
// 410 Gone with the new location and RFC 8594 deprecation headers so the
// integrator can detect the move in code.
function legacyApiResponse(req: NextRequest): Response {
  const path = req.nextUrl.pathname + req.nextUrl.search;
  return new Response(
    JSON.stringify({
      error: "this api moved to auth.bneck.com",
      code: "origin_moved",
      location: `${NEW_DOMAIN}${path}`,
    }),
    {
      status: 410,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Deprecation: "true",
        Sunset: "Wed, 31 Dec 2025 23:59:59 GMT",
        Link: `<${NEW_DOMAIN}${path}>; rel="successor-version"`,
      },
    },
  );
}

// When the old domain still reaches the app (via a second tunnel route),
// intercept every request and serve a self-contained migration notice
// rather than normal auth pages. The page preserves the path so the
// button can deep-link to the equivalent URL on the new domain.
function legacyDomainResponse(req: NextRequest): Response {
  const path = req.nextUrl.pathname + req.nextUrl.search;
  const targetUrl = `${NEW_DOMAIN}${path}`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Moved — Bottleneck Auth</title>
  <meta name="robots" content="noindex, nofollow">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { color-scheme: dark; }
    body {
      background: #0a0a0a;
      color: #f0f0f0;
      font-family: ui-monospace, 'JetBrains Mono', SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 14px;
      line-height: 1.6;
      min-height: 100svh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 480px;
      border-top: 1px solid #ffb000;
      padding-top: 40px;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffb000;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin-bottom: 16px;
      line-height: 1.3;
    }
    p {
      color: #9a9a9a;
      margin-bottom: 8px;
      max-width: 400px;
    }
    p + p { margin-top: 0; margin-bottom: 32px; }
    strong { color: #f0f0f0; font-weight: 600; }
    .btn {
      display: inline-block;
      background: #ffb000;
      color: #0a0a0a;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      padding: 10px 24px;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: background 0.1s;
    }
    .btn:hover { background: #ffd050; }
    .note {
      margin-top: 40px;
      font-size: 11px;
      color: #5e5e5e;
      border-top: 1px solid #262626;
      padding-top: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">NOTICE</div>
    <h1>bottleneck.cc is now used<br>for backend services only</h1>
    <p>Authentication has moved to <strong>auth.bneck.com</strong>.</p>
    <p>Please update any bookmarks or saved links.</p>
    <a class="btn" id="go" href="${targetUrl}">Go to auth.bneck.com &rarr;</a>
    <div class="note">
      If an app redirected you here, ask the developer to update their integration URL.
    </div>
  </div>
  <script>
    // Preserve path + query on the new domain for deep links.
    try {
      var t = ${JSON.stringify(NEW_DOMAIN)} + location.pathname + location.search;
      document.getElementById("go").href = t;
    } catch(e) {}
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function proxy(req: NextRequest, event: NextFetchEvent) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  if (host === LEGACY_DOMAIN) {
    return req.nextUrl.pathname.startsWith("/api/")
      ? legacyApiResponse(req)
      : legacyDomainResponse(req);
  }

  const scriptNonce = nonce();
  // Correlation id for tracing one request across logs and security events.
  // Honor an inbound id only if it is well-formed (so a spoofed/oversized
  // header cannot pollute logs); otherwise mint a fresh one.
  const inboundRequestId = req.headers.get("x-request-id");
  const requestId =
    inboundRequestId && /^[A-Za-z0-9_-]{1,64}$/.test(inboundRequestId)
      ? inboundRequestId
      : `req_${nonce().replace(/[^a-z0-9]/gi, "").slice(0, 16)}`;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", scriptNonce);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  requestHeaders.set("x-request-id", requestId);
  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  res.headers.set("x-pathname", req.nextUrl.pathname);
  res.headers.set("x-nonce", scriptNonce);
  res.headers.set("x-request-id", requestId);
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
