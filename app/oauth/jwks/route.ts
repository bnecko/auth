import { json } from "@/lib/server/http";
import { oauthJwks } from "@/lib/server/services/oauth";

export const runtime = "nodejs";

export async function GET() {
  return json(oauthJwks());
}
