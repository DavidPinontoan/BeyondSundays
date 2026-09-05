/**
 * Scheduled Netlify Function — runs every 15 minutes, and once a week (at
 * 9:00 PM Saturday, Sydney time — this project's "week" runs Monday
 * through Saturday, matching the six weekday topics, no Sunday one)
 * automatically sends the same report /week produces, so nobody has to
 * remember to ask for it.
 *
 * Runs on a 15-minute schedule (rather than a once-a-week cron pinned to
 * an exact UTC time) for the same reason send-reminders.mjs does: Sydney
 * shifts between UTC+10 and UTC+11 across daylight saving, so a fixed
 * UTC cron time would drift an hour off twice a year. Checking Sydney
 * local time on every run avoids that entirely.
 *
 * NOT TESTED — no Node.js runtime available in the environment this was
 * built in. Check this function's logs in the Netlify dashboard on a
 * Saturday night.
 */

import { getStore } from "@netlify/blobs";
import { sendAdminAlert, sendTelegramDocument } from "./lib/telegram.mjs";
import { TIMEZONE, buildWeekReport, isoWeekKey, customDateCode, sydneyTodayCalendarProxy } from "./lib/reports.mjs";
import { toCsv } from "./lib/csv.mjs";

const DIGEST_HOUR = 21; // 9:00 PM
const WINDOW_MINUTES = 15;

export default async () => {
  const now = new Date();
  const { weekday, hour, minute } = sydneyParts(now);

  if (weekday !== "Saturday" || hour !== DIGEST_HOUR || minute >= WINDOW_MINUTES) {
    return new Response("Not the weekly digest window.", { status: 200 });
  }

  const dedupStore = getStore("weekly-digest-dedup");
  const key = isoWeekKey(now);
  const alreadySent = await dedupStore.get(key, { type: "json" });
  if (alreadySent) {
    return new Response("Already sent this week.", { status: 200 });
  }

  const { text, csvRows } = await buildWeekReport();
  await sendAdminAlert(`${text}\n\n(automatic Saturday night report)`, { html: true });
  if (csvRows.length > 1) {
    const filename = `beyond-sundays-week-${customDateCode(sydneyTodayCalendarProxy())}.csv`;
    await sendTelegramDocument(process.env.TELEGRAM_CHAT_ID, filename, toCsv(csvRows));
  }
  await dedupStore.setJSON(key, true);

  return new Response("Weekly digest sent.", { status: 200 });
};

function sydneyParts(date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: TIMEZONE, weekday: "long", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { weekday: get("weekday"), hour: Number(get("hour")), minute: Number(get("minute")) };
}

export const config = {
  schedule: "*/15 * * * *",
};
