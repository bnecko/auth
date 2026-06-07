import { json } from "@/lib/server/http";
import { dbHealthy } from "@/lib/server/db";
import { redisHealthy } from "@/lib/server/redis";

export const runtime = "nodejs";

// Readiness: 200 only when both Postgres and Redis are reachable, 503 (naming
// the failed dependency) otherwise, so the orchestrator stops routing traffic
// to an instance that cannot serve. Liveness lives at /api/health and does no
// I/O. Both checks are bounded so this stays within the 5s healthcheck budget.
export async function GET() {
  const [postgres, redis] = await Promise.all([dbHealthy(), redisHealthy()]);
  const ready = postgres && redis;
  if (ready) {
    return json({ ok: true, checks: { postgres, redis } });
  }
  return json(
    {
      ok: false,
      checks: { postgres, redis },
      failed: Object.entries({ postgres, redis })
        .filter(([, up]) => !up)
        .map(([name]) => name),
    },
    503,
  );
}
