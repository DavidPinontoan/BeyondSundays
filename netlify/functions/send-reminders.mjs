/**
 * Scheduled Netlify Function — runs every 15 minutes. For whichever topic
 * airs today (matched by weekday against topics-schedule.json), and for
 * each of its two showings (7:00 PM and 9:00 PM Sydney time):
 *
 *   - One hour before that showing: texts everyone who RSVP'd for it
 *     asking "are you still coming? reply Y or N" (see sms-reply.mjs for
 *     the reply handler) and records each as a pending confirmation.
 *   - At showtime: texts the Zoom link to everyone who RSVP'd for it (as
 *     before), then tallies how the hour-before confirmations came in
 *     (yes / no / no reply) and texts that tally to ORGANIZER_PHONE.
 *   - One hour after that showing starts: sends YOU (the admin) a
 *     Telegram message listing everyone who RSVP'd for it, so you can
 *     mark attendance with /attend <number> yes|no per person. This is
 *     Telegram, not SMS — Telegram already works today, unlike Twilio,
 *     which is still blocked on a trial-account restriction (see below).
 *
 * NOT TESTED — written to Netlify's and Twilio's documented APIs, but
 * there's no Node.js runtime in the environment this was built in, so
 * this has never actually executed. Check the function's logs in the
 * Netlify dashboard after your first deploy and after the first showtime
 * rolls around; ping back with the exact error if something's off.
 *
 * Required environment variables (Site configuration → Environment
 * variables):
 *
 *   NETLIFY_SITE_ID       Site configuration → General → Site details → Site ID.
 *   NETLIFY_ACCESS_TOKEN  Personal Access Token (User settings → Applications)
 *                         — needed to read Netlify Forms submissions via the API.
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER
 *   ORGANIZER_PHONE       Your own mobile (+61 format) — receives the
 *                         showtime confirmation tally. Without it, the
 *                         tally is just logged instead of texted.
 *
 * Without the Twilio vars set, all sends are just logged (visible in the
 * function's logs).
 */

import { getStore } from "@netlify/blobs";
import twilio from "twilio";
import { sendAdminAlert, escapeHtml } from "./lib/telegram.mjs";
import { toLocalPhone } from "./lib/phone.mjs";
import { TOPICS } from "./lib/topics.mjs";

const TIMEZONE = "Australia/Sydney";
const WINDOW_MINUTES = 15; // act once within the first 15 min after the top of the hour
const SESSIONS = [
  { key: "7pm", hour: 19, label: "7:00 PM" },
  { key: "9pm", hour: 21, label: "9:00 PM" },
];

function twilioClient() {
  return process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;
}

async function sendSms(client, to, body) {
  if (client && process.env.TWILIO_FROM_NUMBER) {
    await client.messages.create({ body, from: process.env.TWILIO_FROM_NUMBER, to });
  } else {
    console.log(`[SMS SCAFFOLD] Would text ${to}: ${body}`);
  }
}

export default async () => {
  const now = new Date();
  const { weekday, hour, minute } = sydneyParts(now);

  if (minute >= WINDOW_MINUTES) {
    return new Response("Not in a trigger window.", { status: 200 });
  }

  const slug = Object.keys(TOPICS).find((s) => TOPICS[s].day === weekday);
  if (!slug) {
    return new Response(`No topic scheduled for ${weekday}.`, { status: 200 });
  }
  const topic = TOPICS[slug];
  const weekKey = isoWeekKey(now);

  const results = [];
  for (const session of SESSIONS) {
    if (hour === session.hour - 1) {
      results.push(await sendConfirmPrompts(slug, topic, session, weekKey));
    } else if (hour === session.hour) {
      results.push(await sendZoomLinksAndTally(slug, topic, session, weekKey));
    } else if (hour === session.hour + 1) {
      results.push(await sendAttendancePrompts(slug, topic, session, weekKey));
    }
  }

  if (results.length === 0) {
    return new Response("Nothing scheduled for this window.", { status: 200 });
  }
  return new Response(results.join(" | "), { status: 200 });
};

/** One hour before a showing: ask everyone who RSVP'd whether they're still coming. */
async function sendConfirmPrompts(slug, topic, session, weekKey) {
  const submissions = await fetchRsvpSubmissions(slug, session.key);

  const dedupStore = getStore("confirm-dedup");
  const dedupKey = `${slug}-${session.key}-${weekKey}`;
  const alreadySent = (await dedupStore.get(dedupKey, { type: "json" })) || [];
  const toPrompt = submissions.filter((s) => !alreadySent.includes(s.phone));

  if (toPrompt.length === 0) {
    return `No new ${session.label} confirmation prompts for ${topic.title}.`;
  }

  const client = twilioClient();
  const pendingStore = getStore("confirm-pending");

  for (const { name, phone } of toPrompt) {
    const to = phone.replace(/\s/g, "");
    const body = `Hi ${name}! Quick check — are you still coming to "${topic.title}" tonight at ${session.label}? Reply Y or N.`;
    await sendSms(client, to, body);
    await pendingStore.setJSON(to, {
      slug, session: session.key, sessionLabel: session.label, name, confirmed: null, weekKey,
    });
  }

  await dedupStore.setJSON(dedupKey, [...alreadySent, ...toPrompt.map((s) => s.phone)]);
  return `Sent ${toPrompt.length} confirmation prompt(s) for ${topic.title} ${session.label}.`;
}

/** One hour after a showing starts: nudge the admin via Telegram to mark
 *  attendance for everyone who RSVP'd, rather than texting each
 *  participant (Telegram works today; Twilio doesn't, see the trial-
 *  account note in README.md). */
async function sendAttendancePrompts(slug, topic, session, weekKey) {
  const submissions = await fetchRsvpSubmissions(slug, session.key);
  if (submissions.length === 0) {
    return `No RSVPs to check attendance for on ${topic.title} ${session.label}.`;
  }

  const dedupStore = getStore("attend-nudge-dedup");
  const dedupKey = `${slug}-${session.key}-${weekKey}`;
  const alreadySent = await dedupStore.get(dedupKey, { type: "json" });
  if (alreadySent) {
    return `Already sent the attendance nudge for ${topic.title} ${session.label}.`;
  }

  const lines = [
    `<b>${escapeHtml(topic.title)} — ${session.label}</b> just finished. Mark attendance:`,
    "",
    ...submissions.map((s, i) => `${i + 1}. <b>${escapeHtml(s.name)}</b>\n   <code>${escapeHtml(toLocalPhone(s.phone))}</code>`),
    "",
    "Tap a number to copy it, then: /attend &lt;number&gt; yes|no",
  ];
  await sendAdminAlert(lines.join("\n"), { html: true });
  await dedupStore.setJSON(dedupKey, true);

  return `Sent attendance nudge for ${topic.title} ${session.label} (${submissions.length} people).`;
}

/** At showtime: text the Zoom link, then tally how the confirmations came in. */
async function sendZoomLinksAndTally(slug, topic, session, weekKey) {
  const submissions = await fetchRsvpSubmissions(slug, session.key);
  const client = twilioClient();

  const reminderStore = getStore("reminder-dedup");
  const reminderKey = `${slug}-${session.key}-${weekKey}`;
  const alreadyReminded = (await reminderStore.get(reminderKey, { type: "json" })) || [];
  const toRemind = submissions.filter((s) => !alreadyReminded.includes(s.phone));

  for (const { name, phone } of toRemind) {
    const to = phone.replace(/\s/g, "");
    const body = `Hi ${name}, Beyond Sundays: "${topic.title}" is starting soon. Join here: ${topic.zoomLink}`;
    await sendSms(client, to, body);
  }
  if (toRemind.length > 0) {
    await reminderStore.setJSON(reminderKey, [...alreadyReminded, ...toRemind.map((s) => s.phone)]);
  }

  const summaryStore = getStore("summary-dedup");
  const summaryKey = `${slug}-${session.key}-${weekKey}`;
  const alreadySummarized = await summaryStore.get(summaryKey, { type: "json" });

  let tallyMsg = "";
  if (!alreadySummarized && submissions.length > 0) {
    const pendingStore = getStore("confirm-pending");
    let yes = 0, no = 0, noReply = 0;
    for (const { phone } of submissions) {
      const record = await pendingStore.get(phone.replace(/\s/g, ""), { type: "json" });
      if (record?.confirmed === true) yes++;
      else if (record?.confirmed === false) no++;
      else noReply++;
    }

    const summary = `${topic.title} ${session.label}: ${yes} confirmed, ${no} declined, ${noReply} didn't reply (of ${submissions.length} RSVPs).`;
    if (process.env.ORGANIZER_PHONE) {
      await sendSms(client, process.env.ORGANIZER_PHONE.replace(/\s/g, ""), summary);
    } else {
      console.log(`[ORGANIZER SUMMARY SCAFFOLD] ${summary}`);
    }
    await summaryStore.setJSON(summaryKey, true);
    tallyMsg = ` Tally: ${summary}`;
  }

  return `Sent ${toRemind.length} Zoom link(s) for ${topic.title} ${session.label}.${tallyMsg}`;
}

/** Pulls this topic+session's RSVP submissions from the Netlify Forms API. */
async function fetchRsvpSubmissions(slug, sessionKey) {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_ACCESS_TOKEN;
  if (!siteId || !token) {
    console.warn("NETLIFY_SITE_ID / NETLIFY_ACCESS_TOKEN not set — can't fetch RSVP submissions.");
    return [];
  }

  const headers = { Authorization: `Bearer ${token}` };

  const formsRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/forms`, { headers });
  if (!formsRes.ok) throw new Error(`Failed to list forms: ${formsRes.status}`);
  const forms = await formsRes.json();
  const rsvpForm = forms.find((f) => f.name === "rsvp");
  if (!rsvpForm) return [];

  const submissionsRes = await fetch(
    `https://api.netlify.com/api/v1/forms/${rsvpForm.id}/submissions`,
    { headers }
  );
  if (!submissionsRes.ok) throw new Error(`Failed to list submissions: ${submissionsRes.status}`);
  const submissions = await submissionsRes.json();

  return submissions
    .filter((s) => s.data && s.data.topic === slug && s.data.session === sessionKey && s.data.phone)
    .map((s) => ({ name: s.data.name, phone: s.data.phone }));
}

function sydneyParts(date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: TIMEZONE, weekday: "long", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { weekday: get("weekday"), hour: Number(get("hour")), minute: Number(get("minute")) };
}

/** "2026-W37"-style key so the dedup stores naturally reset each week. */
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

export const config = {
  schedule: "*/15 * * * *",
};
