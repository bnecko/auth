import { NextResponse } from "next/server";
import { telegramQueue } from "@/lib/server/queue";

export async function POST(req: Request) {
  const body = await req.json();
  await telegramQueue.add("send", body);
  return NextResponse.json({ ok: true });
}
