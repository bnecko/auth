import { NextResponse, type NextRequest } from "next/server";
import { clearUserSession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  await clearUserSession(req, res);
  return res;
}
