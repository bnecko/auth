import { NextResponse } from "next/server";
import { authBaseUrl, cryptoEnabled } from "@/lib/server/config";

export const runtime = "nodejs";

// TON Connect wallets fetch this before showing a connect prompt, and the host
// in `url` is both what they display to the user and what they sign into the
// proof as its domain. It is derived from the same config the proof verifier
// compares against, so the two cannot drift apart and leave every proof
// failing on a domain mismatch.
export async function GET() {
  if (!cryptoEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });

  const base = authBaseUrl().replace(/\/+$/, "");

  return NextResponse.json(
    {
      url: base,
      name: "Bottleneck",
      iconUrl: `${base}/ton-connect-icon.png`,
    },
    {
      headers: {
        // Wallets and their bridges fetch this from their own origins.
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
