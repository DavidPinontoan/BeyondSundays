/**
 * Twilio inbound-SMS webhook — receives replies to whichever Y/N question
 * send-reminders.mjs most recently sent that phone number: the "are you
 * still coming?" prompt an hour before a showing, or the "did you
 * attend?" prompt an hour after one (see the `confirm-pending` Blobs
 * store, written by send-reminders.mjs — its `kind` field, "pre" or
 * "post", says which question is open). A "post" reply is written
 * straight to that person's attendance field in the people-store, same
 * as the admin's manual /attend bot command would do.
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
import { markAttendance } from "./lib/people-store.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const params = new URLSearchParams(await req.text());
  const from = (params.get("From") || "").replace(/\s/g, "");
  const body = (params.get("Body") || "").trim().toLowerCase();

  const pendingStore = getStore("confirm-pending");
  const record = from ? await pendingStore.get(from, { type: "json" }) : null;

  const isYes = /^y(es)?$/.test(body);
  const isNo = /^n(o)?$/.test(body);
  const isAttendanceCheck = record?.kind === "post";

  let reply;
  if (!record) {
    reply = "Thanks for your text! We don't have an open question for this number right now.";
  } else if (record.confirmed !== null) {
    reply = "Got it — we already have your reply for this one, thanks!";
  } else if (isYes || isNo) {
    record.confirmed = isYes;
    await pendingStore.setJSON(from, record);

    if (isAttendanceCheck) {
      await markAttendance(from, isYes);
      reply = isYes ? "Great, glad you made it! 🎬" : "Thanks for letting us know — hope to see you next time!";
    } else {
      reply = isYes ? `Great, see you at ${record.sessionLabel}! 🎬` : "No worries, thanks for letting us know — hope to see you next time!";
    }
  } else {
    reply = isAttendanceCheck
      ? "Just reply Y or N to let us know if you attended tonight."
      : "Just reply Y or N to let us know if you're still coming tonight.";
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`;
  return new Response(twiml, { status: 200, headers: { "Content-Type": "text/xml" } });
};

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}
