import { env } from "./config";

// Minimal client for sending outgoing Telegram messages from the auth
// backend. The dedicated bot in /bot handles long-polling for incoming
// updates; this module is used in places where the backend itself
// originates a message (e.g. notifying the bearer admin that a new
// request needs review).

export type InlineButton = {
  text: string;
  callbackData: string;
};

type SendMessageInput = {
  chatId: string | number;
  text: string;
  inlineButtons?: InlineButton[][];
};

const apiBase = () => `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}`;

export async function sendTelegramMessage(input: SendMessageInput) {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) {
    // Outside production we silently no-op so local development without
    // a configured bot doesn't fail every bearer request submission.
    if (process.env.NODE_ENV === "production") {
      throw new Error("TELEGRAM_BOT_TOKEN is required");
    }
    return { ok: false, skipped: true };
  }

  // Plain text only: no parse_mode, so there is no markup to render and no
  // escaping needed; a stray character in a username or title can never break
  // a message.
  const body: Record<string, unknown> = {
    chat_id: input.chatId,
    text: input.text,
  };

  if (input.inlineButtons && input.inlineButtons.length > 0) {
    body.reply_markup = {
      inline_keyboard: input.inlineButtons.map(row =>
        row.map(btn => ({
          text: btn.text,
          callback_data: btn.callbackData,
        })),
      ),
    };
  }

  const response = await fetch(`${apiBase()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`telegram sendMessage failed: ${response.status} ${text}`);
  }

  return { ok: true };
}
