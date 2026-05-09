import { type NextRequest } from "next/server";
import { bearerToken } from "@/lib/server/apiAuth";
import { json, unauthorized } from "@/lib/server/http";
import { oauthUserInfo } from "@/lib/server/services/oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return unauthorized("missing bearer token");
  }

  const profile = await oauthUserInfo(token);
  if (!profile) {
    return unauthorized("invalid bearer token");
  }

  return json(profile);
}
