/**
 * Synchronous Netlify Function — called directly by topic.html's RSVP form
 * right after a Netlify Forms submission succeeds. Three things happen
 * from here, independently (one failing doesn't block the others):
 *
 *   1. Texts the person an immediate "you're confirmed" message, so they
 *      get feedback beyond the on-page UI (which disappears if they
 *      navigate away).
 *   2. Alerts the admin via Telegram that a new signup came in.
 *   3. Upserts an editable per-person record (lib/people-store.mjs) —
 *      the foundation for /search, attendance tracking, and teacher
 *      assignment, none of which Netlify Forms' read-only submissions
 *      can support on their own.
 *
 * Before any of that: an IP rate limit (max 5 calls per 10 minutes) and a
 * per-phone cooldown (5 minutes) guard against someone spamming the RSVP
 * form — each call here fires a paid Twilio SMS, so this is where abuse
 * actually costs money, even though the underlying Netlify Forms
 * submission itself can't be blocked from here. A blocked call just
 * quietly returns 200 with none of the three effects above — no error
 * surfaced to the client either way, since the on-page confirmation is
 * independent client-side state.
 *
 * NOT TESTED — no Node.js runtime in the environment this was built in.
 * Check this function's logs in the Netlify dashboard after your first
 * real RSVP.
 *
 * Requires the same Twilio env vars as send-reminders.mjs
 * (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER) plus
 * TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (see lib/telegram.mjs for setup).
 * Without them, sends are just logged.
 */

import twilio from "twilio";
import { sendAdminAlert, escapeHtml } from "./lib/telegram.mjs";
import { upsertPerson } from "./lib/people-store.mjs";
import { getClientIp, checkAndBumpRate, checkAndBumpCooldown } from "./lib/rate-limit.mjs";
import { toLocalPhone } from "./lib/phone.mjs";
import { TOPICS } from "./lib/topics.mjs";

const IP_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
const PHONE_COOLDOWN_MS = 5 * 60 * 1000;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { name, phone, topicSlug, session } = body;
  const topic = TOPICS[topicSlug];
  if (!name || !phone || !topic || (session !== "7pm" && session !== "9pm")) {
    return new Response("Missing or invalid fields", { status: 400 });
  }

  const ip = getClientIp(req);
  const ipOk = await checkAndBumpRate("rsvp-ip-limit", ip, IP_LIMIT);
  const phoneOk = await checkAndBumpCooldown("rsvp-phone-cooldown", phone.replace(/\s/g, ""), PHONE_COOLDOWN_MS);
  if (!ipOk || !phoneOk) {
    console.warn(`Rate-limited RSVP: ip=${ip} phone=${phone} ipOk=${ipOk} phoneOk=${phoneOk}`);
    return new Response("OK", { status: 200 });
  }

  const sessionLabel = session === "7pm" ? "7:00 PM" : "9:00 PM";
  const message = `Hey ${name}! You're confirmed for "${topic.title}" this ${topic.day} at ${sessionLabel} — so glad you're joining us 🎬 We'll text the Zoom link before it starts, and check in with you an hour beforehand to confirm you're still coming.`;

  const client =
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
      ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      : null;

  const to = phone.replace(/\s/g, "");
  try {
    if (client && process.env.TWILIO_FROM_NUMBER) {
      await client.messages.create({ body: message, from: process.env.TWILIO_FROM_NUMBER, to });
    } else {
      console.log(`[SMS SCAFFOLD] Would text ${to}: ${message}`);
    }
  } catch (err) {
    console.error("Confirmation SMS failed:", err);
  }

  try {
    await sendAdminAlert(
      `<b>New Signup</b>\n<b>${escapeHtml(name)}</b>\n<code>${escapeHtml(toLocalPhone(phone))}</code>\n\n${escapeHtml(topic.title)} — ${escapeHtml(topic.day)} ${sessionLabel}`,
      { html: true }
    );
  } catch (err) {
    console.error("Telegram alert failed:", err);
  }

  try {
    await upsertPerson({ name, phone, topicSlug, topicTitle: topic.title, session });
  } catch (err) {
    console.error("People-store upsert failed:", err);
  }

  return new Response("OK", { status: 200 });
};
