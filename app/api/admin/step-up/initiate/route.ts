import { type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/server/session";
import { createStepUpOtp } from "@/lib/server/adminStepUp";
import { sendTelegramMessage, escapeHtml } from "@/lib/server/telegramSend";
import { json, tooManyRequests } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.user.role !== "admin") {
    return json({ error: "forbidden" }, 403);
  }

  const { user } = session;

  if (!user.telegramId) {
    return json({ error: "no_telegram" }, 400);
  }

  const rl = await rateLimit(`rl:admin_stepup:${user.id}`, 5, 10 * 60 * 1000);
  if (!rl.success) {
    return tooManyRequests("Too many code requests. Wait a few minutes.");
  }

  const code = await createStepUpOtp(user.id);

  await sendTelegramMessage({
    chatId: user.telegramId,
    text: `<b>Admin step-up verification</b>\n\nYour one-time code for admin access:\n\n<code>${escapeHtml(code)}</code>\n\nValid for 5 minutes. If you did not request this, someone has your password.`,
  });

  return json({ ok: true });
}
