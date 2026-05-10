import { type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/server/session";
import { createRelinkOtp } from "@/lib/server/relinkChallenge";
import { sendTelegramMessage, escapeHtml } from "@/lib/server/telegramSend";
import { forbidden, json, tooManyRequests, requestContext } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

// 3 sends per user per 10-minute OTP window — enough for a resend or two
const USER_LIMIT = 3;
const USER_WINDOW_MS = 10 * 60 * 1000;

// 10 sends per IP per hour — defence in depth for shared/proxied IPs
const IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return forbidden();

  const { user } = session;
  const ctx = requestContext(req);

  const [byUser, byIp] = await Promise.all([
    rateLimit(`rl:relink:user:${user.id}`, USER_LIMIT, USER_WINDOW_MS),
    rateLimit(`rl:relink:ip:${ctx.ip || "unknown"}`, IP_LIMIT, IP_WINDOW_MS),
  ]);

  if (!byUser.success) {
    return tooManyRequests("Too many code requests. Wait a few minutes before trying again.");
  }
  if (!byIp.success) {
    return tooManyRequests("Too many requests from this network. Try again later.");
  }

  if (!user.telegramId) {
    return json({ error: "no_telegram_linked" }, 400);
  }

  const code = await createRelinkOtp(user.id);

  await sendTelegramMessage({
    chatId: user.telegramId,
    text: `<b>Telegram relink requested</b>\n\nEnter this code on the website to confirm you own this account:\n\n<code>${escapeHtml(code)}</code>\n\nValid for 10 minutes. If you did not request this, ignore it.`,
  });

  return json({ ok: true });
}
