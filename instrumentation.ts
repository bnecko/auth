import type { Instrumentation } from "next";
import { validateConfig } from "@/lib/server/config";

// Runs once per server process before it serves traffic. Guarded to the
// Node.js runtime: Next also loads this hook in the edge runtime, where
// these secrets are neither present nor used.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateConfig();
  }
}

// Every error thrown out of a route handler, server action or render reaches
// this hook. Without it those errors are swallowed by Next's default handler
// and the only trace is a stack on stdout with no request context.
//
// Deliberately omitted: request headers (cookies and the bot secret live
// there) and the query string, which carries the OAuth state, PKCE challenge
// and the Telegram login payload. `digest` is the reference the error page
// shows the user, so a support report can be matched to this line.
// The logger is imported lazily because Next loads this module in the edge
// runtime too, where its process.stdout/stderr writes are unsupported and
// would be bundled in for nothing.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("@/lib/server/log");

  log.error("request_error", {
    error,
    digest: (error as { digest?: string } | null)?.digest,
    requestId: request.headers["x-request-id"],
    method: request.method,
    path: request.path.split("?", 1)[0],
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
  });
};
