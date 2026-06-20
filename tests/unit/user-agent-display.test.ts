import { describe, it, expect } from "vitest";
import { parseUserAgent } from "@/lib/userAgentDisplay";

describe("parseUserAgent", () => {
  it("labels iPhone Safari", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(r.deviceType).toBe("mobile");
    expect(r.osName).toBe("iOS");
    expect(r.browserName).toBe("Safari");
    expect(r.label).toBe("Safari on iOS");
  });

  it("labels iPad as tablet", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(r.deviceType).toBe("tablet");
    expect(r.osName).toBe("iPadOS");
  });

  it("labels Android Chrome phone", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    );
    expect(r.deviceType).toBe("mobile");
    expect(r.osName).toBe("Android");
    expect(r.browserName).toBe("Chrome");
  });

  it("labels Android tablet (no Mobile token)", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(r.deviceType).toBe("tablet");
    expect(r.osName).toBe("Android");
  });

  it("labels Windows Chrome desktop", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(r.deviceType).toBe("desktop");
    expect(r.osName).toBe("Windows");
    expect(r.browserName).toBe("Chrome");
  });

  it("labels macOS Safari (not Chrome)", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    );
    expect(r.osName).toBe("macOS");
    expect(r.browserName).toBe("Safari");
  });

  it("detects Edge before Chrome", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    );
    expect(r.browserName).toBe("Edge");
  });

  it("detects Firefox", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
    );
    expect(r.osName).toBe("Linux");
    expect(r.browserName).toBe("Firefox");
  });

  it("falls back to Unknown for empty/null", () => {
    for (const v of ["", null, undefined]) {
      const r = parseUserAgent(v);
      expect(r.deviceType).toBe("unknown");
      expect(r.label).toBe("Unknown device");
    }
  });
});
