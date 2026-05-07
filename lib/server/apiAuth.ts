import type { NextRequest } from "next/server";
import { unauthorized } from "./http";
import { getSessionFromRequest } from "./session";

export function bearerToken(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

export async function requireUser(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.user.status === "banned") {
    return { response: unauthorized(), session: null };
  }

  return { response: null, session };
}
