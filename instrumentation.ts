import { validateConfig } from "@/lib/server/config";

// Runs once per server process before it serves traffic. Guarded to the
// Node.js runtime: Next also loads this hook in the edge runtime, where
// these secrets are neither present nor used.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateConfig();
  }
}
