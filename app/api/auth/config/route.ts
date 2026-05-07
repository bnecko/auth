import { env } from "@/lib/server/config";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";

export function GET() {
  return json({
    turnstileSiteKey: env("TURNSTILE_SITE_KEY") || env("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
  });
}
