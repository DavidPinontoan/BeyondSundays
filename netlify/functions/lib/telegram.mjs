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

export async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId) {
    console.log(`[TELEGRAM SCAFFOLD] Would send to ${chatId}:\n${text}`);
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!res.ok) {
    console.error(`Telegram send failed: ${res.status} ${await res.text()}`);
  }
}

/** Convenience wrapper for one-way alerts to the configured admin chat. */
export async function sendAdminAlert(text) {
  return sendTelegramMessage(process.env.TELEGRAM_CHAT_ID, text);
}
