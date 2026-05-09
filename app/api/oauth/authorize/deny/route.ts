import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/apiAuth";
import { badRequest } from "@/lib/server/http";
import {
  denyOAuthAuthorization,
  OAuthError,
} from "@/lib/server/services/oauth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const form = await req.formData();
    const body: Record<string, unknown> = Object.fromEntries(form.entries());
    const target = await denyOAuthAuthorization(body, auth.session.user, req);
    return NextResponse.redirect(target);
  } catch (err) {
    if (err instanceof OAuthError) {
      return badRequest(`${err.code}: ${err.message}`);
    }
    return badRequest(err instanceof Error ? err.message : "authorization failed");
  }
}
