import { getTelegramQueue } from "./queue";
import { findUserById } from "./repositories/users";
import { recordSecurityEvent } from "./repositories/securityEvents";

export type UserNotification =
  | { type: "password_changed" }
  | { type: "password_reset_completed" }
  | { type: "login_failure_threshold" }
  | { type: "ton_wallet_linked" }
  | { type: "ton_wallet_unlinked" }
  | { type: "ton_wallet_claimed_elsewhere" }
  | { type: "signin_alert"; method: string; ip?: string }
  | { type: "withdrawal_paid"; amount: string }
  | { type: "withdrawal_declined"; amount: string; reason: string | null };

export function notificationMessage(input: UserNotification): string {
  switch (input.type) {
    case "password_changed":
      return "Password changed\n\nYour Bottleneck account password was just changed. If this was not you, reset your password and contact support immediately.";
    case "password_reset_completed":
      return "Password reset\n\nYour Bottleneck account password was reset. If this was not you, contact support immediately.";
    case "login_failure_threshold":
      return "Unusual sign-in activity\n\nToo many failed sign-in attempts were detected on your Bottleneck account, so sign-in is temporarily paused. If this was not you, your password may be targeted.";
    case "ton_wallet_linked":
      return "TON wallet linked\n\nA TON wallet was just verified on your Bottleneck account. If this was not you, unlink it in Settings and change your password.";
    case "ton_wallet_unlinked":
      return "TON wallet unlinked\n\nThe TON wallet on your Bottleneck account was just removed. If this was not you, change your password and review your sessions.";
    case "ton_wallet_claimed_elsewhere":
      return "TON wallet moved\n\nThe TON wallet linked to your Bottleneck account was just verified on a different account, so it is no longer shown on yours. Whoever did this signed with that wallet's key. If you still hold the key, link it again in Settings to take it back.";
    case "signin_alert": {
      const lines = [
        "New sign-in",
        "",
        `Your Bottleneck account was just accessed with your ${input.method}.`,
      ];
      if (input.ip) lines.push(`IP: ${input.ip}`);
      lines.push("", "If this was not you, change your password and review your sessions.");
      return lines.join("\n");
    }
    case "withdrawal_paid":
      return `Withdrawal paid\n\n${input.amount} GRAM was sent to your verified wallet. The transaction is on your Billing page.`;
    case "withdrawal_declined": {
      const lines = [
        "Withdrawal declined",
        "",
        `Your request for ${input.amount} GRAM was declined, and the amount is back in your balance.`,
      ];
      if (input.reason) lines.push("", `Reason: ${input.reason}`);
      return lines.join("\n");
    }
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

// Which preference flag governs each notification. Auth-critical messages
// (2FA prompts, codes, reset links) never route through here, so every type
// below is genuinely user-optional.
export function isAllowedByPrefs(
  user: { notifySecurityReceipts: boolean; notifySigninAlerts: boolean },
  type: UserNotification["type"],
): boolean {
  return type === "signin_alert"
    ? user.notifySigninAlerts
    : user.notifySecurityReceipts;
}

// Best-effort, non-blocking user notification over Telegram. No-ops when
// the user has no linked Telegram. Work is handed to the shared
// telegram-notifications queue (the worker forwards job.data straight to
// sendMessage), so a slow or failing Telegram API never blocks or fails
// the calling request. An enqueue failure is recorded, not thrown.
export async function notifyUser(userId: number, input: UserNotification): Promise<void> {
  try {
    const user = await findUserById(userId);
    if (!user || !user.telegramId) {
      return;
    }
    if (!isAllowedByPrefs(user, input.type)) {
      return;
    }
    await getTelegramQueue().add("send", {
      chat_id: user.telegramId,
      text: notificationMessage(input),
    });
  } catch (err) {
    await recordSecurityEvent({
      userId,
      eventType: "notification_enqueue_failed",
      result: err instanceof Error ? err.message : "unknown",
      context: { ip: "", userAgent: "notifications", country: "" },
      metadata: { type: input.type },
    }).catch(() => {});
  }
}
