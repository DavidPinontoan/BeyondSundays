/**
 * Telegram bot webhook — handles admin commands typed directly into the
 * Telegram chat with the bot: /today, /week, /search, /attend, /teacher.
 *
 * One-time setup, after TELEGRAM_BOT_TOKEN is set in Netlify and deployed:
 * visit this URL once in a browser (replace both placeholders):
 *
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-site>.netlify.app/.netlify/functions/telegram-bot
 *
 * This registers the function above as the bot's webhook — Telegram will
 * call it directly whenever someone messages the bot. `getUpdates` (used
 * during initial setup to find your chat ID) stops returning anything
 * once a webhook is registered — that's expected, not an error.
 *
 * Only messages from TELEGRAM_CHAT_ID get a reply — anyone else who finds
 * the bot is silently ignored, so a stranger can't pull signup data just
 * by messaging it.
 *
 * NOT TESTED — no Node.js runtime available in the environment this was
 * built in. Check this function's logs in the Netlify dashboard after
 * registering the webhook and sending /today.
 */

import { fetchAllRsvpSubmissions } from "./lib/netlify-forms.mjs";
import { sendTelegramMessage } from "./lib/telegram.mjs";
import { searchPeopleByPhone, markAttendance, assignTeacher } from "./lib/people-store.mjs";

const TIMEZONE = "Australia/Sydney";
const WEEK_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let update;
  try {
    update = await req.json();
  } catch {
    return new Response("OK", { status: 200 });
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const text = (message?.text || "").trim();

  if (!chatId || String(chatId) !== process.env.TELEGRAM_CHAT_ID) {
    console.warn(`Ignored Telegram message from unauthorized chat: ${chatId}`);
    return new Response("OK", { status: 200 });
  }

  if (text === "/today") {
    await sendTelegramMessage(chatId, await buildTodayReport());
  } else if (text === "/week") {
    await sendTelegramMessage(chatId, await buildWeekReport());
  } else if (text.startsWith("/search")) {
    await sendTelegramMessage(chatId, await buildSearchReport(text.slice("/search".length).trim()));
  } else if (text.startsWith("/attend")) {
    await sendTelegramMessage(chatId, await handleAttendCommand(text.slice("/attend".length).trim()));
  } else if (text.startsWith("/teacher")) {
    await sendTelegramMessage(chatId, await handleTeacherCommand(text.slice("/teacher".length).trim()));
  } else {
    await sendTelegramMessage(
      chatId,
      [
        "Commands:",
        "/today - today's signups",
        "/week - this week's signups by day",
        "/search <number> - find someone by mobile number, e.g. /search 0402248977",
        "/attend <number> yes|no - mark whether they attended",
        "/teacher <number> <teacher name> - assign a teacher",
      ].join("\n")
    );
  }

  return new Response("OK", { status: 200 });
};

async function buildTodayReport() {
  const submissions = await fetchAllRsvpSubmissions();
  const todayProxy = sydneyTodayCalendarProxy();
  const todayKey = sydneyDateKey(todayProxy);
  const monday = mondayOf(todayProxy);
  const monthStart = new Date(Date.UTC(todayProxy.getUTCFullYear(), todayProxy.getUTCMonth(), 1, 12));
  const weekKey = sydneyDateKey(monday);
  const monthKey = sydneyDateKey(monthStart);

  const todays = submissions
    .filter((s) => sydneyDateKey(s.createdAt) === todayKey)
    .sort((a, b) => a.createdAt - b.createdAt);
  const weekCount = submissions.filter((s) => inRange(s.createdAt, weekKey, todayKey)).length;
  const monthCount = submissions.filter((s) => inRange(s.createdAt, monthKey, todayKey)).length;

  const dateLabel = new Intl.DateTimeFormat("en-AU", {
    timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(todayProxy);

  return [
    `Beyond Sundays - Today (${dateLabel})`,
    "",
    `New signups: ${todays.length}`,
    ...todays.map((s) => `${s.name} - ${sydneyTimeLabel(s.createdAt)}`),
    "",
    `Today: ${todays.length}`,
    `This week: ${weekCount}`,
    `This month: ${monthCount}`,
  ].join("\n");
}

async function buildWeekReport() {
  const submissions = await fetchAllRsvpSubmissions();
  const todayProxy = sydneyTodayCalendarProxy();
  const monday = mondayOf(todayProxy);

  const dayKeys = WEEK_DAY_LABELS.map((_, i) => sydneyDateKey(addDays(monday, i)));
  const counts = dayKeys.map((key) => submissions.filter((s) => sydneyDateKey(s.createdAt) === key).length);
  const total = counts.reduce((a, b) => a + b, 0);

  const lastMonday = addDays(monday, -7);
  const lastSaturday = addDays(monday, -2);
  const lastWeekTotal = submissions.filter((s) =>
    inRange(s.createdAt, sydneyDateKey(lastMonday), sydneyDateKey(lastSaturday))
  ).length;

  const growthLine =
    lastWeekTotal > 0
      ? `${total >= lastWeekTotal ? "+" : ""}${Math.round(((total - lastWeekTotal) / lastWeekTotal) * 100)}% compared with last week`
      : "No data from last week to compare";

  return [
    "Beyond Sundays - Weekly Report",
    "",
    ...WEEK_DAY_LABELS.map((label, i) => `${label}: ${counts[i]}`),
    `Total: ${total} signups`,
    growthLine,
  ].join("\n");
}

const MAX_SEARCH_RESULTS = 10;

async function buildSearchReport(query) {
  if (!query) return "Usage: /search <number>, e.g. /search 0402248977";

  const matches = await searchPeopleByPhone(query);
  if (matches.length === 0) return `No one found matching "${query}".`;

  const blocks = matches.slice(0, MAX_SEARCH_RESULTS).map((p) => {
    const joined = new Intl.DateTimeFormat("en-AU", {
      timeZone: TIMEZONE, day: "numeric", month: "long", year: "numeric",
    }).format(new Date(p.joinedAt));
    const attended = p.attended === true ? "Yes" : p.attended === false ? "No" : "Not yet recorded";
    const teacher = p.teacherAssigned || "Not assigned";
    return [
      p.name,
      p.phone,
      `Joined: ${joined}`,
      `Topic: ${p.topicTitle || p.topicSlug}`,
      `Attended: ${attended}`,
      `Teacher: ${teacher}`,
    ].join("\n");
  });

  const header = `Found ${matches.length} match${matches.length === 1 ? "" : "es"}${matches.length > MAX_SEARCH_RESULTS ? ` (showing first ${MAX_SEARCH_RESULTS})` : ""}:`;
  return [header, "", blocks.join("\n\n")].join("\n");
}

/** Resolves a user-typed number to exactly one stored record, or returns
 *  a message explaining why it couldn't (used by /attend and /teacher,
 *  which both need to land on a single unambiguous person). */
async function resolveOnePerson(numberArg) {
  const matches = await searchPeopleByPhone(numberArg);
  if (matches.length === 0) return { error: `No one found matching "${numberArg}".` };
  if (matches.length > 1) return { error: `Multiple matches for "${numberArg}" — be more specific.` };
  return { person: matches[0] };
}

async function handleAttendCommand(args) {
  const [numberArg, statusArg] = args.split(/\s+/);
  if (!numberArg || !statusArg) return "Usage: /attend <number> yes|no";
  const status = statusArg.toLowerCase();
  if (status !== "yes" && status !== "no") return "Usage: /attend <number> yes|no";

  const { person, error } = await resolveOnePerson(numberArg);
  if (error) return error;

  const record = await markAttendance(person.phone, status === "yes");
  return `Marked ${record.name} as ${status === "yes" ? "attended" : "not attended"}.`;
}

async function handleTeacherCommand(args) {
  const spaceIdx = args.indexOf(" ");
  const numberArg = spaceIdx === -1 ? args : args.slice(0, spaceIdx);
  const teacherName = spaceIdx === -1 ? "" : args.slice(spaceIdx + 1).trim();
  if (!numberArg || !teacherName) return "Usage: /teacher <number> <teacher name>";

  const { person, error } = await resolveOnePerson(numberArg);
  if (error) return error;

  const record = await assignTeacher(person.phone, teacherName);
  return `Assigned ${teacherName} as ${record.name}'s teacher.`;
}

function inRange(date, startKey, endKey) {
  const key = sydneyDateKey(date);
  return key >= startKey && key <= endKey;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

/** Monday of the same week as `proxy` (both as noon-UTC calendar proxies). */
function mondayOf(proxy) {
  const isoDow = (proxy.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  return addDays(proxy, -isoDow);
}

function sydneyDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date);
}

function sydneyTimeLabel(date) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(date);
}

/** Today's Sydney calendar date, encoded as a noon-UTC Date so whole-day
 *  arithmetic (+/- N days) can't drift across a DST boundary into the
 *  wrong calendar day. */
function sydneyTodayCalendarProxy() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 12));
}
