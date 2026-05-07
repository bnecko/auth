import { listRecentActivationsForUser } from "../repositories/activationRequests";
import {
  countAuthorizations,
  listAuthorizationsForUser,
} from "../repositories/authorizations";
import { listBearerRequestsForUser } from "../repositories/bearerRequests";
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
    bearers,
    activeSubscriptionCount,
    appCount,
  ] = await Promise.all([
    listSubscriptionsForUser(user.id),
    listAuthorizationsForUser(user.id),
    listSessionsForUser(user.id),
    recentEventsForUser(user.id),
    listRecentActivationsForUser(user.id),
    listBearerRequestsForUser(user.id),
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
    bearers,
  };
}
