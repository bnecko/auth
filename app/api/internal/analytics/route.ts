import { NextResponse } from "next/server";
import { env, isProduction } from "@/lib/server/config";
import { getTelegramQueue } from "@/lib/server/queue";

export async function POST(req: Request) {
  const secret = env("INTERNAL_ANALYTICS_SECRET");
  if (secret) {
    if (req.headers.get("x-bottleneck-internal-secret") !== secret) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else if (isProduction()) {
    return NextResponse.json({ error: "analytics not configured" }, { status: 404 });
  }

  const body = await req.json();
  await getTelegramQueue().add("send", body);
  return NextResponse.json({ ok: true });
}
