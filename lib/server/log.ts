// Dependency-free structured logger: one JSON line per event to stdout
// (debug/info) or stderr (warn/error). Keys whose name looks secret-ish are
// redacted recursively so a stray token in metadata never reaches the logs.
// Keep the surface tiny: log.<level>(message, metadata?).

type Level = "debug" | "info" | "warn" | "error";

const SECRET_KEY = /pass|token|secret|key|auth|credential|cipher|hmac/i;
const MAX_DEPTH = 6;

function redact(value: unknown, depth = 0): unknown {
  if (value == null || depth > MAX_DEPTH) return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, message: string, metadata?: Record<string, unknown>) {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };
  if (metadata) {
    const safe = redact(metadata) as Record<string, unknown>;
    for (const [k, v] of Object.entries(safe)) {
      if (k !== "ts" && k !== "level" && k !== "msg") record[k] = v;
    }
  }
  const line = JSON.stringify(record) + "\n";
  if (level === "warn" || level === "error") process.stderr.write(line);
  else process.stdout.write(line);
}

export const log = {
  debug: (message: string, metadata?: Record<string, unknown>) => emit("debug", message, metadata),
  info: (message: string, metadata?: Record<string, unknown>) => emit("info", message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>) => emit("warn", message, metadata),
  error: (message: string, metadata?: Record<string, unknown>) => emit("error", message, metadata),
};

// Exposed for unit tests of the redaction logic.
export const _redactForTests = redact;
