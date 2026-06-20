import { lookup } from "dns/promises";
import { isIP } from "net";

// Pre-fetch guard against SSRF: resolves the hostname and rejects URLs
// that point at loopback, private RFC1918, link-local, or cloud metadata
// addresses. Does NOT fully defeat DNS rebinding - that requires hooking
// the socket connect, which we can revisit if/when undici exposes a
// stable API for it. For the auth service's surface area (JWKS fetch
// and outbound webhook delivery) the resolve-then-fetch race window is
// small and bounded by the connection timeout, so this guard plus a
// short timeout is a meaningful uplift over no check at all.

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "ip6-localhost",
  "ip6-loopback",
]);

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    return isBlockedIpv4(lower.slice("::ffff:".length));
  }
  return false;
}

export async function assertSafeUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("url is invalid");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("url protocol is not supported");
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("url hostname is not allowed");
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    if (isBlockedIpv4(hostname)) throw new Error("url ip is not allowed");
    return url;
  }
  if (ipVersion === 6) {
    if (isBlockedIpv6(hostname)) throw new Error("url ip is not allowed");
    return url;
  }

  const records = await lookup(hostname, { all: true });
  for (const record of records) {
    const blocked = record.family === 6 ? isBlockedIpv6(record.address) : isBlockedIpv4(record.address);
    if (blocked) {
      throw new Error("url resolves to a blocked address");
    }
  }

  return url;
}

export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { maxResponseBytes?: number; timeoutMs?: number } = {},
): Promise<{ status: number; bodyText: string; ok: boolean }> {
  const { maxResponseBytes = 1024 * 1024, timeoutMs = 5000, ...fetchInit } = init;
  await assertSafeUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(rawUrl, {
      ...fetchInit,
      signal: controller.signal,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error(`unexpected redirect: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return { status: response.status, bodyText: "", ok: response.ok };
    }

    const decoder = new TextDecoder("utf-8", { fatal: false });
    let total = 0;
    let bodyText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxResponseBytes) {
        await reader.cancel();
        throw new Error("response exceeded size limit");
      }
      bodyText += decoder.decode(value, { stream: true });
    }
    bodyText += decoder.decode();

    return { status: response.status, bodyText, ok: response.ok };
  } finally {
    clearTimeout(timer);
  }
}
