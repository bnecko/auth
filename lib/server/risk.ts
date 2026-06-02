import type { RequestContext } from "./http";
import {
  countRecentEventsByIp,
  countRecentEventsForUser,
  recentCountriesForUser,
  recentUserAgentsForUser,
  recordSecurityEvent,
} from "./repositories/securityEvents";

type RiskInput = {
  userId?: number | null;
  eventType: string;
  context: RequestContext;
  metadata?: Record<string, unknown>;
};

export type RiskResult = "low" | "medium" | "high";

// Signals gathered from the security-event history, separated from the
// scoring so the weighting rules can be exercised without a database.
export type RiskSignals = {
  ipFailures: number;
  userFailures: number;
  knownCountries: string[];
  currentCountry: string | null;
  knownUserAgents: string[];
  currentUserAgent: string | null;
  isClientRegistration: boolean;
};

export function scoreRisk(signals: RiskSignals): {
  score: number;
  result: RiskResult;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  if (signals.ipFailures >= 10) {
    score += 35;
    reasons.push("many_recent_ip_failures");
  } else if (signals.ipFailures >= 3) {
    score += 15;
    reasons.push("recent_ip_failures");
  }

  if (signals.userFailures >= 5) {
    score += 25;
    reasons.push("many_recent_user_failures");
  }

  if (
    signals.currentCountry &&
    signals.knownCountries.length > 0 &&
    !signals.knownCountries.includes(signals.currentCountry)
  ) {
    score += 25;
    reasons.push("new_country");
  }

  if (
    signals.currentUserAgent &&
    signals.knownUserAgents.length > 0 &&
    !signals.knownUserAgents.includes(signals.currentUserAgent)
  ) {
    score += 15;
    reasons.push("new_user_agent");
  }

  if (signals.isClientRegistration) {
    score += 20;
    reasons.push("oauth_client_registration");
  }

  const result: RiskResult = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { score, result, reasons };
}

export async function assessRequestRisk(input: RiskInput) {
  const ipFailures = input.context.ip
    ? await countRecentEventsByIp(input.context.ip, "login_failure", 15)
    : 0;

  let userFailures = 0;
  let knownCountries: string[] = [];
  let knownUserAgents: string[] = [];
  if (input.userId) {
    userFailures = await countRecentEventsForUser(input.userId, "login_failure", 15);
    if (input.context.country) {
      knownCountries = await recentCountriesForUser(input.userId);
    }
    if (input.context.userAgent) {
      knownUserAgents = await recentUserAgentsForUser(input.userId);
    }
  }

  const { score, result, reasons } = scoreRisk({
    ipFailures,
    userFailures,
    knownCountries,
    currentCountry: input.context.country || null,
    knownUserAgents,
    currentUserAgent: input.context.userAgent || null,
    isClientRegistration: input.eventType === "oauth_client_registration",
  });

  if (score >= 30) {
    await recordSecurityEvent({
      userId: input.userId,
      eventType: "risk_assessment",
      result,
      context: input.context,
      metadata: {
        eventType: input.eventType,
        score,
        reasons,
        ...(input.metadata || {}),
      },
    });
  }

  return { score, result, reasons };
}
