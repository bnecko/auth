import { NextResponse, type NextRequest } from "next/server";
import { clearUserSession } from "@/lib/server/session";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const res = json({ ok: true });
  await clearUserSession(req, res);
  return res;
}
