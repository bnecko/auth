import { NextResponse } from "next/server";
import { oauthServerMetadata } from "@/lib/server/services/oauth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(oauthServerMetadata(), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
