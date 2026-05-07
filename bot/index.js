const botToken = required("TELEGRAM_BOT_TOKEN");
const webhookSecret = required("TELEGRAM_BOT_WEBHOOK_SECRET");
const authBaseUrl = process.env.AUTH_INTERNAL_URL || "http://localhost:3000";
const bearerAdminTelegramId = process.env.BEARER_ADMIN_TELEGRAM_ID || "BEARER_ADMIN_TG_ID";
const apiBase = `https://api.telegram.org/bot${botToken}`;

const longPollSeconds = 30;
let offset = 0;

main();

async function main() {
  while (true) {
    const updates = await getUpdates();
    for (const update of updates) {
      // Process the update before advancing the offset so that a crash
      // in handleUpdate doesn't acknowledge the update to Telegram and
      // drop it. Re-processing on restart is safe: registrationRequests
      // verifyRegistrationRequest only marks a pending request once,
      // and replies are idempotent at the user-facing layer.
      try {
        await handleUpdate(update);
      } catch (err) {
        console.error("handleUpdate error:", err && err.message);
        // Stop advancing past a failing update so it's retried on the
        // next poll. Telegram caps retention at ~24h.
        break;
      }
      offset = Math.max(offset, update.update_id + 1);
    }
  }
}

async function getUpdates() {
  const allowed = encodeURIComponent(JSON.stringify(["message", "callback_query"]));
  const url = `${apiBase}/getUpdates?timeout=${longPollSeconds}&offset=${offset}&allowed_updates=${allowed}`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout((longPollSeconds + 5) * 1000),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error("getUpdates failed:", data.description);
      await sleep(1000);
      return [];
    }
    return data.result;
  } catch (err) {
    console.error("getUpdates error:", err.message);
    await sleep(1000);
    return [];
  }
}

async function handleUpdate(update) {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message || !message.text) {
    return;
  }

  const match = message.text.match(/^\/start(?:\s+(\S+))?/);
  if (!match) {
    return;
  }

  const startToken = match[1];
  if (!startToken) {
    await reply(message.chat.id, "Open the registration page and use the link there to verify.");
    return;
  }

  const result = await callVerify(startToken, message.from);
  await reply(message.chat.id, result.message);
}

// Inline-button presses arrive as callback_query updates. We handle the
// bearer_approve / bearer_reject callbacks here. Telegram requires us
// to answerCallbackQuery within ~30s to dismiss the loading spinner; we
// always answer, even on failure paths.
async function handleCallbackQuery(query) {
  const data = query.data || "";
  const fromId = query.from && query.from.id ? String(query.from.id) : "";

  const bearerMatch = data.match(/^bearer_(approve|reject):(\S+)$/);
  if (!bearerMatch) {
    await answerCallback(query.id, "");
    return;
  }

  const decision = bearerMatch[1];
  const requestId = bearerMatch[2];

  if (fromId !== bearerAdminTelegramId) {
    await answerCallback(query.id, "Not authorized.", true);
    return;
  }

  const result = await callBearerDecision(requestId, decision, fromId);
  if (!result.ok) {
    await answerCallback(query.id, result.message || "Decision failed.", true);
    return;
  }

  const verb = decision === "approve" ? "Approved" : "Rejected";
  const suffix = result.alreadyDecided ? " (already decided)" : "";
  await answerCallback(query.id, `${verb}${suffix}`);

  // Edit the original message so the buttons are replaced with a
  // status footer. If the edit fails we still acknowledged the click,
  // so the admin sees a toast either way.
  if (query.message) {
    const original = query.message.text || "";
    const updated = `${original}\n\n— ${verb}${suffix}`;
    await editMessage(
      query.message.chat.id,
      query.message.message_id,
      updated,
    );
  }
}

async function callBearerDecision(requestId, decision, fromId) {
  try {
    const response = await fetch(
      `${authBaseUrl}/api/telegram/bearer/decision`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bottleneck-bot-secret": webhookSecret,
        },
        body: JSON.stringify({
          id: requestId,
          decision,
          adminTelegramId: fromId,
        }),
      },
    );

    if (!response.ok) {
      const data = await safeJson(response);
      return { ok: false, message: data?.error || `http ${response.status}` };
    }

    const data = await safeJson(response);
    return {
      ok: true,
      alreadyDecided: !!(data && data.alreadyDecided),
      status: data && data.status,
    };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function answerCallback(callbackQueryId, text, alert) {
  await fetch(`${apiBase}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || undefined,
      show_alert: !!alert,
    }),
  }).catch(err => console.error("answerCallbackQuery error:", err.message));
}

async function editMessage(chatId, messageId, text) {
  await fetch(`${apiBase}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    }),
  }).catch(err => console.error("editMessageText error:", err.message));
}

async function callVerify(startToken, from) {
  const response = await fetch(`${authBaseUrl}/api/telegram/bot/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bottleneck-bot-secret": webhookSecret,
    },
    body: JSON.stringify({
      startToken,
      telegram_id: String(from.id),
      telegram_first_name: from.first_name || "",
      telegram_username: from.username || null,
    }),
  });

  if (response.ok) {
    return { message: "Verified. Return to the browser to finish signing in." };
  }

  if (response.status === 400) {
    const data = await safeJson(response);
    return { message: data?.error || "This verification link is invalid or expired." };
  }

  console.error("verify webhook failed:", response.status);
  return { message: "Verification service is unavailable. Try again in a moment." };
}

async function reply(chatId, text) {
  await fetch(`${apiBase}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(err => console.error("sendMessage error:", err.message));
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
