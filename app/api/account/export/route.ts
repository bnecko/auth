import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/server/session";
import { listSessionsForUser } from "@/lib/server/repositories/sessions";
import { recentEventsForUser } from "@/lib/server/repositories/securityEvents";
import { listSubscriptionsForUser } from "@/lib/server/repositories/subscriptions";
import { listAuthorizationsForUser } from "@/lib/server/repositories/authorizations";
import { findTonWallet } from "@/lib/server/repositories/tonWallets";
import { listDonationsForUser } from "@/lib/server/repositories/tonDonations";

export const runtime = "nodejs";

// A user's own account data as a downloadable JSON. Reads only what the user
// already sees in the app; never exposes password or token hashes.
export async function GET() {
  const current = await getCurrentSession();
  if (!current) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  const u = current.user;

  const [sessions, securityEvents, subscriptions, connectedApps, tonWallet, donations] = await Promise.all([
    listSessionsForUser(u.id),
    recentEventsForUser(u.id, 100),
    listSubscriptionsForUser(u.id),
    listAuthorizationsForUser(u.id),
    findTonWallet(u.id),
    listDonationsForUser(u.id),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    profile: {
      publicId: u.publicId,
      firstName: u.firstName,
      username: u.username,
      bio: u.bio,
      email: u.email,
      emailVerifiedAt: u.emailVerifiedAt,
      dob: u.dob,
      telegramId: u.telegramId,
      telegramUsername: u.telegramUsername,
      telegramVerifiedAt: u.telegramVerifiedAt,
      avatarPreset: u.avatarPreset,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      donorSince: u.donorSince,
    },
    preferences: {
      notifySecurityReceipts: u.notifySecurityReceipts,
      notifySigninAlerts: u.notifySigninAlerts,
      profilePublic: u.profilePublic,
      discoverableByUsername: u.discoverableByUsername,
      publicShowTelegram: u.publicShowTelegram,
      publicShowDonor: u.publicShowDonor,
    },
    sessions: sessions.map(s => ({
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
    })),
    securityEvents: securityEvents.map(e => ({
      eventType: e.event_type,
      result: e.result,
      ip: e.ip,
      createdAt: e.created_at,
    })),
    subscriptions,
    connectedApps,
    tonWallet: tonWallet && {
      address: tonWallet.address,
      walletVersion: tonWallet.walletVersion,
      verifiedAt: tonWallet.verifiedAt,
      display: tonWallet.display,
      displayDomain: tonWallet.displayDomain,
    },
    donations,
  };

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="bottleneck-account-${u.username}.json"`,
      "cache-control": "no-store",
    },
  });
}
