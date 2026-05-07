import { listRecentActivationsForUser } from "../repositories/activationRequests";
import {
  countAuthorizations,
  listAuthorizationsForUser,
} from "../repositories/authorizations";
import { recentEventsForUser } from "../repositories/securityEvents";
import { listSessionsForUser } from "../repositories/sessions";
import {
  countActiveSubscriptions,
  listSubscriptionsForUser,
} from "../repositories/subscriptions";
import type { User } from "../types";

export async function getDashboard(user: User) {
  const [
    subscriptions,
    apps,
    sessions,
    events,
    activations,
    activeSubscriptionCount,
    appCount,
  ] = await Promise.all([
    listSubscriptionsForUser(user.id),
    listAuthorizationsForUser(user.id),
    listSessionsForUser(user.id),
    recentEventsForUser(user.id),
    listRecentActivationsForUser(user.id),
    countActiveSubscriptions(user.id),
    countAuthorizations(user.id),
  ]);

  return {
    account: user,
    stats: {
      subscriptions: activeSubscriptionCount,
      apps: appCount,
      sessions: sessions.length,
      activations: activations.length,
    },
    subscriptions,
    apps,
    sessions,
    events,
  };
}
