/**
 * Tiny Telegram Bot API helper — no SDK needed, it's just a POST to
 * Telegram's HTTP API. Shared by any function that needs to alert the
 * admin (new signups now; follow-ups/attendance later).
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

export async function sendTelegramAlert(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log(`[TELEGRAM SCAFFOLD] Would send:\n${text}`);
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!res.ok) {
    console.error(`Telegram alert failed: ${res.status} ${await res.text()}`);
  }
}
