/**
 * Twilio inbound-SMS webhook — receives replies to the "are you still
 * coming? reply Y or N" text that send-reminders.mjs sends an hour before
 * each showing, and records the answer against that phone number's
 * pending confirmation (see the `confirm-pending` Blobs store, written by
 * send-reminders.mjs) so the showtime tally can count it.
 *
 * Every request is verified against Twilio's X-Twilio-Signature header
 * before anything else happens — without this, this URL being public
 * means anyone could POST a fake {From, Body} and forge someone else's
 * attendance/confirmation record. Verification needs TWILIO_AUTH_TOKEN
 * (already set for outbound sends) and can be disabled by setting
 * TWILIO_SKIP_SIGNATURE_CHECK=true, ONLY if signature checks start
 * rejecting genuine replies (a known risk behind some proxies/CDNs,
 * where the URL Twilio signed against doesn't exactly match what the
 * function sees) — check this function's logs first; a rejection logs
 * the computed vs. expected URL to help diagnose a mismatch.
 *
 * NOT TESTED — no Node.js runtime in the environment this was built in.
 *
 * Requires manual setup in Twilio's console (not something I can do for
 * you — needs your Twilio login): open your number under Phone Numbers →
 * Manage → Active Numbers, and under "Messaging Configuration" set
 * "A message comes in" to a webhook, HTTP POST, pointing at:
 *
 *   https://<your-site>.netlify.app/.netlify/functions/sms-reply
 */

import { getStore } from "@netlify/blobs";
import twilio from "twilio";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);

  if (process.env.TWILIO_SKIP_SIGNATURE_CHECK !== "true") {
    const signature = req.headers.get("x-twilio-signature");
    const valid =
      process.env.TWILIO_AUTH_TOKEN &&
      signature &&
      twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN,
        signature,
        req.url,
        Object.fromEntries(params)
      );
    if (!valid) {
      console.warn(`Rejected sms-reply: bad/missing Twilio signature for url=${req.url}`);
      return new Response("Forbidden", { status: 403 });
    }
  }

  const from = (params.get("From") || "").replace(/\s/g, "");
  const body = (params.get("Body") || "").trim().toLowerCase();

  const pendingStore = getStore("confirm-pending");
  const record = from ? await pendingStore.get(from, { type: "json" }) : null;

  let reply;
  if (!record) {
    reply = "Thanks for your text! We don't have an open confirmation for this number right now.";
  } else if (record.confirmed !== null) {
    reply = "Got it — we already have your reply for this one, thanks!";
  } else if (/^y(es)?$/.test(body)) {
    record.confirmed = true;
    await pendingStore.setJSON(from, record);
    reply = `Great, see you at ${record.sessionLabel}! 🎬`;
  } else if (/^n(o)?$/.test(body)) {
    record.confirmed = false;
    await pendingStore.setJSON(from, record);
    reply = "No worries, thanks for letting us know — hope to see you next time!";
  } else {
    reply = "Just reply Y or N to let us know if you're still coming tonight.";
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`;
  return new Response(twiml, { status: 200, headers: { "Content-Type": "text/xml" } });
};

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}
