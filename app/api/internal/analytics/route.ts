import { NextResponse } from "next/server";
import { getTelegramQueue } from "@/lib/server/queue";

export async function POST(req: Request) {
  const body = await req.json();
  await getTelegramQueue().add("send", body);
  return NextResponse.json({ ok: true });
}
