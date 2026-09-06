import { diagnose, formatStatus, gatherStatus, isStatusCommand, mayRequestStatus } from "./status.js";

const botToken = required("TELEGRAM_BOT_TOKEN");
const webhookSecret = required("TELEGRAM_BOT_WEBHOOK_SECRET");
const authBaseUrl = process.env.AUTH_INTERNAL_URL || "http://localhost:3000";
const bearerAdminTelegramId = required("BEARER_ADMIN_TELEGRAM_ID");
const analyticsChatId = process.env.TELEGRAM_ANALYTICS_CHAT_ID;
const analyticsThreadId = process.env.TELEGRAM_ANALYTICS_THREAD_ID;
const alertChatId = process.env.ALERT_TELEGRAM_CHAT_ID;
const monitorStatusUrl = process.env.MONITOR_STATUS_URL || "";
const tunnelReadyUrl = process.env.CLOUDFLARED_READY_URL || "";
const apiBase = `https://api.telegram.org/bot${botToken}`;

const longPollSeconds = 30;
let offset = 0;

// Dead-man's switch: ping HEARTBEAT_URL once a minute, but only while the
// long-poll keeps succeeding. A poll is healthy even when it returns no
// updates; what matters is that Telegram answered. No URL, no pings.
const heartbeatUrl = process.env.HEARTBEAT_URL || "";
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const POLL_STALE_MS = 2 * (longPollSeconds + 5) * 1000;
let lastPollOkAt = 0;

function pollIsFresh() {
  return Date.now() - lastPollOkAt < POLL_STALE_MS;
}

async function pingHeartbeat() {
  if (!heartbeatUrl) return;
  if (!pollIsFresh()) {
    logEvent("warn", "heartbeat_withheld", { lastPollAgeMs: lastPollOkAt ? Date.now() - lastPollOkAt : null });
    return;
  }
  try {
    const res = await fetch(heartbeatUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) logEvent("warn", "heartbeat_ping_rejected", { status: res.status });
  } catch (err) {
    logEvent("warn", "heartbeat_ping_failed", { error: err });
  }
}

// Structured logging, inlined because the bot image ships only index.js and
// cannot import the worker's logger. Same JSON-line shape as worker-log.js so
// one log pipeline reads every process.
function logEvent(level, msg, metadata) {
  const record = { ts: new Date().toISOString(), level, msg };
  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      record[k] = v instanceof Error
        ? { name: v.name, message: v.message, stack: v.stack }
        : v;
    }
  }
  const line = JSON.stringify(record) + "\n";
  if (level === "warn" || level === "error") process.stderr.write(line);
  else process.stdout.write(line);
}

// main() is a floating promise: a throw from the startup status monitor used
// to surface as an unstructured unhandled rejection. `--status` prints the
// breakdown the /status command sends and exits without ever polling, so it
// can run beside the live bot from a shell on the host.
if (process.argv.includes("--status")) {
  statusReport(false).then(
    text => {
      process.stdout.write(text + "\n");
      process.exit(0);
    },
    err => {
      logEvent("error", "status_failed", { error: err });
      process.exit(1);
    },
  );
} else {
  main().catch(err => {
    logEvent("error", "bot_crashed", { error: err });
    process.exit(1);
  });
}

process.on("unhandledRejection", err => {
  logEvent("error", "unhandled_rejection", { error: err });
  process.exit(1);
});
process.on("uncaughtException", err => {
  logEvent("error", "uncaught_exception", { error: err });
  process.exit(1);
});

async function startStatusMonitor() {
  if (!analyticsChatId) return;

  const startTime = new Date().toISOString();
  const text = `server status: UP\nStarted at: ${startTime}`;
  
  const msgResponse = await fetch(`${apiBase}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: analyticsChatId,
      message_thread_id: analyticsThreadId ? Number(analyticsThreadId) : undefined,
      text,
    }),
  });
  
  const msgData = await safeJson(msgResponse);
  if (!msgData || !msgData.ok) {
    logEvent("warn", "status_message_failed", { description: msgData?.description });
    return;
  }

  const messageId = msgData.result.message_id;

  await fetch(`${apiBase}/pinChatMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ 
      chat_id: analyticsChatId, 
      message_id: messageId,
      disable_notification: true
    }),
  }).catch(err => logEvent("warn", "pin_status_failed", { error: err }));

  setInterval(async () => {
    // The pinned message used to say UP unconditionally; now it reflects
    // whether the long-poll is actually succeeding.
    const state = pollIsFresh()
      ? "UP"
      : `DEGRADED (last successful poll ${lastPollOkAt ? Math.round((Date.now() - lastPollOkAt) / 1000) + "s ago" : "never"})`;
    const updatedText = `server status: ${state}\nStarted at: ${startTime}\nLast checked: ${new Date().toISOString()}`;
    await editMessage(analyticsChatId, messageId, updatedText);
  }, 10 * 60 * 1000);
}

async function main() {
  if (heartbeatUrl) setInterval(pingHeartbeat, HEARTBEAT_INTERVAL_MS);
  await startStatusMonitor();
  while (true) {
    const updates = await getUpdates();
    for (const update of updates) {
      // Process the update before advancing the offset so that a crash
      // in handleUpdate doesn't acknowledge the update to Telegram and
      // drop it. Re-processing on restart is safe: /start only re-sends an
      // approval prompt (no state change until the user taps a button), and
      // decisions are scoped to a single pending request server-side.
      try {
        await handleUpdate(update);
      } catch (err) {
        logEvent("error", "handle_update_error", { error: err });
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
      logEvent("warn", "get_updates_failed", { description: data.description });
      await sleep(1000);
      return [];
    }
    lastPollOkAt = Date.now();
    return data.result;
  } catch (err) {
    logEvent("warn", "get_updates_error", { error: err });
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

  if (isStatusCommand(message.text)) {
    if (mayRequestStatus(message, { alertChatId, adminTelegramId: bearerAdminTelegramId })) {
      const threadId = message.is_topic_message ? message.message_thread_id : undefined;
      await reply(message.chat.id, await statusReport(), threadId);
    }
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

// Inline-button presses arrive as callback_query updates: the login/relink/
// registration approve-deny prompts and the bearer admin approve/reject.
// Telegram requires us to answerCallbackQuery within ~30s to dismiss the
// loading spinner; we always answer, even on failure paths.
async function handleCallbackQuery(query) {
  const data = query.data || "";
  const fromId = query.from && query.from.id ? String(query.from.id) : "";

  // login_/relink_/reg_/profile_ (approve|deny) - the user confirming a
  // sign-in, a Telegram link, or an account change. The decision is scoped
  // server-side to the Telegram account the prompt belongs to, so we forward
  // the tapping user's identity.
  const confirmMatch = data.match(
    /^(login|relink|reg|profile|bearer_revoke|account_delete)_(approve|deny):(\S+)$/,
  );
  if (confirmMatch) {
    const kind = confirmMatch[1] === "reg" ? "registration" : confirmMatch[1];
    const decision = confirmMatch[2];
    const id = confirmMatch[3];
    const result = await callConfirmDecision(kind, id, decision, query.from);
    if (!result.ok) {
      await answerCallback(query.id, result.message || "Could not record your decision.", true);
      return;
    }
    const verb = decision === "approve" ? "Approved" : "Denied";
    await answerCallback(query.id, verb);
    if (query.message) {
      const original = query.message.text || "";
      await editMessage(
        query.message.chat.id,
        query.message.message_id,
        `${original}\n\n- ${verb}`,
      );
    }
    return;
  }

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
    const updated = `${original}\n\n- ${verb}${suffix}`;
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

async function callConfirmDecision(kind, id, decision, from) {
  try {
    const response = await fetch(`${authBaseUrl}/api/telegram/confirm/decision`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bottleneck-bot-secret": webhookSecret,
      },
      body: JSON.stringify({
        kind,
        id,
        decision,
        telegramId: from && from.id ? String(from.id) : "",
        telegramFirstName: (from && from.first_name) || "",
        telegramUsername: (from && from.username) || null,
      }),
    });
    if (!response.ok) {
      const data = await safeJson(response);
      return { ok: false, message: data?.error || `http ${response.status}` };
    }
    return { ok: true };
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
  }).catch(err => logEvent("warn", "answer_callback_error", { error: err }));
}

async function editMessage(chatId, messageId, text) {
  await fetch(`${apiBase}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
    }),
  }).catch(err => logEvent("warn", "edit_message_error", { error: err }));
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
    const data = await safeJson(response);
    const pending =
      data &&
      (data.kind === "login_pending" ||
        data.kind === "relink_pending" ||
        data.kind === "registration_pending");
    if (pending) {
      return {
        message:
          "We sent you an approval request above. Tap Approve to continue, or Deny if this wasn't you.",
      };
    }
    return { message: "Verified. Return to the browser to finish signing in." };
  }

  if (response.status === 400) {
    const data = await safeJson(response);
    return { message: data?.error || "This verification link is invalid or expired." };
  }

  logEvent("error", "verify_webhook_failed", { status: response.status });
  return { message: "Verification service is unavailable. Try again in a moment." };
}

async function statusReport(viaTelegram = true) {
  const report = await gatherStatus({ appUrl: authBaseUrl, tunnelReadyUrl, monitorStatusUrl });
  return formatStatus(report, diagnose(report), { viaTelegram });
}

async function reply(chatId, text, threadId) {
  await fetch(`${apiBase}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_thread_id: threadId, text }),
  }).catch(err => logEvent("warn", "send_message_error", { error: err }));
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
