/**
 * Tiny Telegram Bot API helper — no SDK needed, it's just a POST to
 * Telegram's HTTP API.
 *
 * Setup (do this once):
 *   1. Message @BotFather on Telegram, send `/newbot`, follow the prompts.
 *      It gives you a bot token — that's TELEGRAM_BOT_TOKEN.
 *   2. Message your new bot anything (e.g. "hi") to start a chat with it.
 *   3. Visit https://api.telegram.org/bot<TOKEN>/getUpdates in a browser —
 *      find "chat":{"id": ...} in the response. That number is
 *      TELEGRAM_CHAT_ID.
 *   4. Set both as env vars in Netlify (Site configuration → Environment
 *      variables), then redeploy.
 *
 * Without both vars set, alerts are just logged instead of sent.
 */

/** `html: true` lets the caller use a small set of Telegram-supported
 *  tags (<b>, <i>, <code>, ...) — most usefully <code>, which renders as
 *  monospace and is tap-to-copy in the Telegram app. Callers building
 *  HTML must escape any user-supplied text themselves (see escapeHtml
 *  below) — this function doesn't do it for them, since plain-text
 *  callers would otherwise get stray entities in normal messages. */
export async function sendTelegramMessage(chatId, text, { html = false } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId) {
    console.log(`[TELEGRAM SCAFFOLD] Would send to ${chatId}:\n${text}`);
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...(html ? { parse_mode: "HTML" } : {}) }),
  });

  if (!res.ok) {
    console.error(`Telegram send failed: ${res.status} ${await res.text()}`);
  }
}

/** Escapes text that will be interpolated into an HTML-mode message —
 *  Telegram's HTML parser only needs these three characters escaped. */
export function escapeHtml(s) {
  return String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
}

/** Convenience wrapper for one-way alerts to the configured admin chat. */
export async function sendAdminAlert(text, options) {
  return sendTelegramMessage(process.env.TELEGRAM_CHAT_ID, text, options);
}

/** Sends a file (e.g. a CSV export) as a Telegram document. */
export async function sendTelegramDocument(chatId, filename, content, mimeType = "text/csv") {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId) {
    console.log(`[TELEGRAM SCAFFOLD] Would send document "${filename}" to ${chatId}`);
    return;
  }

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([content], { type: mimeType }), filename);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    console.error(`Telegram document send failed: ${res.status} ${await res.text()}`);
  }
}
