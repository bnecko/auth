// Postgres renders `timestamptz::text` as "2026-06-05 19:52:40.384+00". V8's
// Date parses it, but many other languages' JSON/date parsers reject the space
// and "+00" offset. Normalize every integrator-facing timestamp to RFC 3339 /
// ISO 8601 ("2026-06-05T19:52:40.384Z") at the response boundary.
export function toIso(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
