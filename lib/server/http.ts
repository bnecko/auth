import { NextResponse, type NextRequest } from "next/server";

export type RequestContext = {
  ip: string;
  userAgent: string;
  country: string;
};

export function requestContext(req: NextRequest): RequestContext {
  return {
    ip:
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "",
    userAgent: req.headers.get("user-agent") || "",
    country:
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      "",
  };
}

export async function requestBody(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await req.json()) as Record<string, unknown>;
  }

  if (contentType.includes("form")) {
    const form = await req.formData();
    return Object.fromEntries(form.entries());
  }

  return {};
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function badRequest(message: string) {
  return json({ error: message }, 400);
}

export function unauthorized(message = "unauthorized") {
  return json({ error: message }, 401);
}

export function forbidden(message = "forbidden") {
  return json({ error: message }, 403);
}
