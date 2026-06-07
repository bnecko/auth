// Plain-CommonJS twin of lib/server/log.ts for the worker, which runs in its
// own Docker stage with no TypeScript toolchain and cannot import the app's
// lib/server/*.ts. Keep the two in sync: same levels, same JSON-line shape,
// same secret-key redaction.

const SECRET_KEY = /pass|token|secret|key|auth|credential|cipher|hmac/i;
const MAX_DEPTH = 6;

function redact(value, depth = 0) {
  if (value == null || depth > MAX_DEPTH) return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level, message, metadata) {
  const record = { ts: new Date().toISOString(), level, msg: message };
  if (metadata) {
    const safe = redact(metadata);
    for (const [k, v] of Object.entries(safe)) {
      if (k !== "ts" && k !== "level" && k !== "msg") record[k] = v;
    }
  }
  const line = JSON.stringify(record) + "\n";
  if (level === "warn" || level === "error") process.stderr.write(line);
  else process.stdout.write(line);
}

module.exports = {
  debug: (message, metadata) => emit("debug", message, metadata),
  info: (message, metadata) => emit("info", message, metadata),
  warn: (message, metadata) => emit("warn", message, metadata),
  error: (message, metadata) => emit("error", message, metadata),
};
