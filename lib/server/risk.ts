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

export async function assessRequestRisk(input: RiskInput) {
  let score = 0;
  const reasons: string[] = [];

  if (input.context.ip) {
    const ipFailures = await countRecentEventsByIp(input.context.ip, "login_failure", 15);
    if (ipFailures >= 10) {
      score += 35;
      reasons.push("many_recent_ip_failures");
    } else if (ipFailures >= 3) {
      score += 15;
      reasons.push("recent_ip_failures");
    }
  }

  if (input.userId) {
    const userFailures = await countRecentEventsForUser(input.userId, "login_failure", 15);
    if (userFailures >= 5) {
      score += 25;
      reasons.push("many_recent_user_failures");
    }

    if (input.context.country) {
      const countries = await recentCountriesForUser(input.userId);
      if (countries.length > 0 && !countries.includes(input.context.country)) {
        score += 25;
        reasons.push("new_country");
      }
    }

    if (input.context.userAgent) {
      const userAgents = await recentUserAgentsForUser(input.userId);
      if (userAgents.length > 0 && !userAgents.includes(input.context.userAgent)) {
        score += 15;
        reasons.push("new_user_agent");
      }
    }
  }

  if (input.eventType === "oauth_client_registration") {
    score += 20;
    reasons.push("oauth_client_registration");
  }

  const result = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
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
