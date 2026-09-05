/**
 * Simple abuse guards, backed by Netlify Blobs — cheap protection against
 * someone spamming the RSVP form (which fires a paid Twilio SMS and a
 * Telegram alert per submission) with fake or repeated numbers.
 *
 * Not a CAPTCHA — that needs a third-party account (reCAPTCHA/hCaptcha)
 * only you can set up. The nearest thing available without a new signup
 * is Netlify's own built-in Forms spam filter: Site configuration →
 * Forms → Spam filters, toggle on Akismet or reCAPTCHA 2. Worth enabling
 * that too, alongside these.
 */

import { getStore } from "@netlify/blobs";

/** Client IP as Netlify reports it to a Function. */
export function getClientIp(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

/** Sliding-window-ish counter: allows `max` hits per `windowMs` per key.
 *  Fails open (returns true) if there's no key to check against, since a
 *  missing IP shouldn't block a real submission. */
export async function checkAndBumpRate(storeName, key, { max, windowMs }) {
  if (!key) return true;

  const store = getStore(storeName);
  const now = Date.now();
  const record = (await store.get(key, { type: "json" })) || { count: 0, windowStart: now };

  if (now - record.windowStart > windowMs) {
    record.count = 0;
    record.windowStart = now;
  }
  record.count += 1;
  await store.setJSON(key, record);

  return record.count <= max;
}

/** One-shot cooldown: true (and resets the clock) the first time a key is
 *  seen within `cooldownMs`, false on every repeat until it elapses. */
export async function checkAndBumpCooldown(storeName, key, cooldownMs) {
  const store = getStore(storeName);
  const now = Date.now();
  const last = await store.get(key, { type: "json" });

  if (last && now - last < cooldownMs) return false;

  await store.setJSON(key, now);
  return true;
}
