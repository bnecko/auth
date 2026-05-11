import { NextResponse, type NextRequest } from "next/server";
import { searchSecurityEvents } from "@/lib/server/repositories/securityEvents";
import { getSessionFromRequest } from "@/lib/server/session";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const current = await getSessionFromRequest(req);
  if (!current || current.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const events = await searchSecurityEvents({
    eventType: req.nextUrl.searchParams.get("event") || "",
    result: req.nextUrl.searchParams.get("result") || "",
    username: req.nextUrl.searchParams.get("user") || "",
    ip: req.nextUrl.searchParams.get("ip") || "",
    limit: Number(req.nextUrl.searchParams.get("limit") || 1000),
  });

  const lines = [
    ["created_at", "event_type", "result", "username", "ip", "country", "user_agent", "metadata"]
      .map(csvCell)
      .join(","),
    ...events.map(event => [
      event.created_at,
      event.event_type,
      event.result,
      event.username || "",
      event.ip || "",
      event.country || "",
      event.user_agent || "",
      JSON.stringify(event.metadata || {}),
    ].map(csvCell).join(",")),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="security-events.csv"',
    },
  });
}
