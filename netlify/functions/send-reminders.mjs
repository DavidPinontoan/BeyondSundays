/**
 * Scheduled Netlify Function — checks every 15 minutes whether it's
 * showtime for that day's topic (7:00 PM in TIMEZONE below, matching the
 * "Every {day} · 7:00 PM and 9:00 PM" line on each topic page) and, if so,
 * texts the Zoom link to everyone who RSVP'd for it via Netlify Forms.
 *
 * NOT TESTED — written to Netlify's and Twilio's documented APIs, but
 * there's no Node.js runtime in the environment this was built in, so
 * this has never actually executed. Check the function's logs in the
 * Netlify dashboard after your first deploy and after the first showtime
 * rolls around; ping back with the exact error if something's off.
 *
 * Required environment variables (set in Netlify's dashboard under
 * Site configuration → Environment variables):
 *
 *   NETLIFY_SITE_ID       Your site's API ID (Site configuration → General
 *                         → Site details → Site ID).
 *   NETLIFY_ACCESS_TOKEN  A Personal Access Token (User settings →
 *                         Applications → New access token) — needed to
 *                         read Netlify Forms submissions via their API.
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER
 *
 * Without the Twilio vars set, sends are just logged (visible in the
 * function's logs), same placeholder behavior as server/sms.py had.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getStore } from "@netlify/blobs";
import twilio from "twilio";

const TOPICS = JSON.parse(
  readFileSync(fileURLToPath(new URL("./topics-schedule.json", import.meta.url)), "utf8")
);

// Change to your actual timezone if this isn't it.
const TIMEZONE = "Australia/Sydney";
const START_HOUR = 19; // 7:00 PM
const WINDOW_MINUTES = 15; // fire once within the first 15 min after start

export default async () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: TIMEZONE,
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  if (hour !== START_HOUR || minute >= WINDOW_MINUTES) {
    return new Response("Not showtime.", { status: 200 });
  }

  const slug = Object.keys(TOPICS).find((s) => TOPICS[s].day === weekday);
  if (!slug) {
    return new Response(`No topic scheduled for ${weekday}.`, { status: 200 });
  }

  const topic = TOPICS[slug];

  // Dedup so a function that fires more than once inside the 15-minute
  // window doesn't text everyone twice.
  const dedupStore = getStore("reminder-dedup");
  const dedupKey = `${slug}-${isoWeekKey(now)}`;
  const alreadySent = (await dedupStore.get(dedupKey, { type: "json" })) || [];

  const submissions = await fetchRsvpSubmissions(slug);
  const toSend = submissions.filter((s) => !alreadySent.includes(s.phone));

  if (toSend.length === 0) {
    return new Response(`No new reservations for ${topic.title}.`, { status: 200 });
  }

  const client =
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
      ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      : null;

  const sentTo = [];
  for (const { name, phone } of toSend) {
    const body = `Hi ${name}, Beyond Sundays: "${topic.title}" is starting soon. Join here: ${topic.zoomLink}`;
    const to = phone.replace(/\s/g, ""); // Twilio wants E.164 with no spaces

    if (client && process.env.TWILIO_FROM_NUMBER) {
      await client.messages.create({ body, from: process.env.TWILIO_FROM_NUMBER, to });
    } else {
      console.log(`[SMS SCAFFOLD] Would text ${to}: ${body}`);
    }
    sentTo.push(phone);
  }

  await dedupStore.setJSON(dedupKey, [...alreadySent, ...sentTo]);

  return new Response(`Sent ${sentTo.length} reminder(s) for ${topic.title}.`, { status: 200 });
};

/** Pulls this topic's RSVP submissions from the Netlify Forms API. */
async function fetchRsvpSubmissions(slug) {
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
    .filter((s) => s.data && s.data.topic === slug && s.data.phone)
    .map((s) => ({ name: s.data.name, phone: s.data.phone }));
}

/** "2026-W37"-style key so the dedup store naturally resets each week. */
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
