import { json } from "@/lib/server/http";

export const runtime = "nodejs";

export function GET() {
  return json({ ok: true });
}
