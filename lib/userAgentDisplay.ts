// Lightweight, dependency-free user-agent parsing for the session list. We
// deliberately avoid an npm UA parser to keep the dependency footprint minimal
// (same posture as lib/supportDisplay.ts). This is heuristic and best-effort:
// it labels common browsers/OSes and falls back to "Unknown" rather than
// guessing. Order matters - Chrome/Edge UAs also contain "Safari", and Edge/
// Opera UAs also contain "Chrome", so the more specific token is checked first.

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export type ParsedUserAgent = {
  deviceType: DeviceType;
  osName: string;
  browserName: string;
  label: string;
};

function detectOs(ua: string): { osName: string; deviceType: DeviceType } {
  if (/iPad/.test(ua)) return { osName: "iPadOS", deviceType: "tablet" };
  if (/iPhone|iPod/.test(ua)) return { osName: "iOS", deviceType: "mobile" };
  if (/Android/.test(ua)) {
    // Phones include "Mobile"; tablets omit it.
    return { osName: "Android", deviceType: /Mobile/.test(ua) ? "mobile" : "tablet" };
  }
  if (/Windows NT/.test(ua)) return { osName: "Windows", deviceType: "desktop" };
  if (/CrOS/.test(ua)) return { osName: "ChromeOS", deviceType: "desktop" };
  if (/Mac OS X|Macintosh/.test(ua)) return { osName: "macOS", deviceType: "desktop" };
  if (/Linux/.test(ua)) return { osName: "Linux", deviceType: "desktop" };
  return { osName: "Unknown", deviceType: "unknown" };
}

function detectBrowser(ua: string): string {
  if (/Edg(?:e|A|iOS)?\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox\/|FxiOS\//.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Unknown";
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const value = (ua || "").trim();
  if (!value) {
    return {
      deviceType: "unknown",
      osName: "Unknown",
      browserName: "Unknown",
      label: "Unknown device",
    };
  }

  const { osName, deviceType } = detectOs(value);
  const browserName = detectBrowser(value);

  let label: string;
  if (browserName !== "Unknown" && osName !== "Unknown") {
    label = `${browserName} on ${osName}`;
  } else if (browserName !== "Unknown") {
    label = browserName;
  } else if (osName !== "Unknown") {
    label = osName;
  } else {
    label = "Unknown device";
  }

  return { deviceType, osName, browserName, label };
}
