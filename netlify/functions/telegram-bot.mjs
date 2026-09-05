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

import { sendTelegramMessage, sendTelegramDocument } from "./lib/telegram.mjs";
import { searchPeopleByPhone, markAttendance, assignTeacher, getAllPeople } from "./lib/people-store.mjs";
import { TIMEZONE, buildTodayReport, buildWeekReport } from "./lib/reports.mjs";

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
  } else if (text === "/export") {
    await handleExportCommand(chatId);
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
        "/export - download all signups as a CSV file",
      ].join("\n")
    );
  }

  return new Response("OK", { status: 200 });
};

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

async function handleExportCommand(chatId) {
  const people = await getAllPeople();
  if (people.length === 0) {
    await sendTelegramMessage(chatId, "No signups to export yet.");
    return;
  }

  const rows = [["Name", "Number", "Joined", "Topic", "Attended", "Teacher"]];
  for (const p of people) {
    const joined = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date(p.joinedAt));
    const attended = p.attended === true ? "Yes" : p.attended === false ? "No" : "";
    rows.push([p.name, p.phone, joined, p.topicTitle || p.topicSlug || "", attended, p.teacherAssigned || ""]);
  }

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const filename = `beyond-sundays-signups-${new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date())}.csv`;

  await sendTelegramDocument(chatId, filename, csv);
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
