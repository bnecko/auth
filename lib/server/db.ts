import { Pool, type QueryResultRow } from "pg";
import { requireEnv } from "./config";
import { log } from "./log";

let pool: Pool | undefined;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: requireEnv("DATABASE_URL"),
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      // Cap how long a connection sits idle in the pool, how long a
      // checkout waits when the pool is exhausted, and how long any
      // single statement can run. Without these a slow query holds a
      // connection forever and starves every other request.
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 30_000,
    });

    // An idle client dropped by Postgres (restart, failover, idle timeout on
    // the server side) emits 'error' on the pool. With no listener node
    // treats it as an unhandled 'error' event and kills the process, so the
    // listener is what lets the pool quietly discard the client instead.
    pool.on("error", err => log.error("db_pool_error", { error: err }));
  }

  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

// Readiness probe: true when a trivial query round-trips, false on any error.
// Never throws. Bounded by an explicit race (shorter than the pool's 5s
// connectionTimeoutMillis) so the readiness route stays well inside the
// healthcheck's 5s budget even when the pool is slow to hand out a connection.
export async function dbHealthy(timeoutMs = 3000): Promise<boolean> {
  try {
    const probe = getPool().query("select 1").then(() => true).catch(() => false);
    const timeout = new Promise<boolean>(resolve => setTimeout(() => resolve(false), timeoutMs));
    return await Promise.race([probe, timeout]);
  } catch {
    return false;
  }
}
