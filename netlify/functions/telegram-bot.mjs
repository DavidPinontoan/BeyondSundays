/**
 * Telegram bot webhook — handles admin commands typed directly into the
 * Telegram chat with the bot: /today, /week, /search, /attend, /teacher,
 * /picked, /export, plus admin management (/addadmin, /removeadmin,
 * /listadmins, /myrole).
 *
 * /today and /week fold in what /stats and /topics used to show
 * separately (totals, per-topic breakdown) — see lib/reports.mjs.
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
 * Three roles (see lib/admins.mjs): owner (always TELEGRAM_CHAT_ID —
 * hardcoded, not stored, so you can't lock yourself out), admin (full
 * access except managing other admins), and viewer (read-only: /today,
 * /week — no /search, /attend, /teacher, /export).
 * Anyone with no role at all is silently ignored, so a stranger can't
 * even tell the bot has data to give up.
 *
 * NOT TESTED — no Node.js runtime available in the environment this was
 * built in. Check this function's logs in the Netlify dashboard after
 * registering the webhook and sending /today.
 */

import { sendTelegramMessage, sendTelegramDocument, escapeHtml } from "./lib/telegram.mjs";
import {
  searchPeopleByPhone, markAttendance, assignTeacher, markPicked, getPersonByPhone,
} from "./lib/people-store.mjs";
import { fetchAllRsvpSubmissions } from "./lib/netlify-forms.mjs";
import {
  TIMEZONE, buildTodayReport, buildWeekReport, customDateCode,
  sydneyDateKey, sydneyTodayCalendarProxy, mondayOf, inRange,
} from "./lib/reports.mjs";
import { getRole, addAdmin, removeAdmin, listAdmins } from "./lib/admins.mjs";
import { toLocalPhone, statusLabel } from "./lib/phone.mjs";
import { toCsv } from "./lib/csv.mjs";
import { TOPICS } from "./lib/topics.mjs";

const ALL_ROLES = ["owner", "admin", "viewer"];
const MANAGE_ROLES = ["owner", "admin"];

/** Each command's key, matcher, allowed roles, and handler. `direct`
 *  commands send their own reply (e.g. a document) instead of returning
 *  text for the dispatcher to send. */
const COMMANDS = [
  { key: "/today", match: (t) => t === "/today", roles: ALL_ROLES, direct: true, run: (_t, ctx) => handleTodayCommand(ctx.chatId) },
  { key: "/week", match: (t) => t === "/week", roles: ALL_ROLES, direct: true, run: (_t, ctx) => handleWeekCommand(ctx.chatId) },
  { key: "/myrole", match: (t) => t === "/myrole", roles: ALL_ROLES, run: (_t, ctx) => `Your role: ${ctx.role}` },
  {
    key: "/search", match: (t) => t.startsWith("/search"), roles: MANAGE_ROLES, html: true,
    run: (t) => buildSearchReport(t.slice("/search".length).trim()),
  },
  {
    key: "/attend", match: (t) => t.startsWith("/attend"), roles: MANAGE_ROLES,
    run: (t) => handleAttendCommand(t.slice("/attend".length).trim()),
  },
  {
    key: "/teacher", match: (t) => t.startsWith("/teacher"), roles: MANAGE_ROLES,
    run: (t) => handleTeacherCommand(t.slice("/teacher".length).trim()),
  },
  {
    key: "/picked", match: (t) => t.startsWith("/picked"), roles: MANAGE_ROLES,
    run: (t) => handlePickedCommand(t.slice("/picked".length).trim()),
  },
  {
    key: "/export", match: (t) => t.startsWith("/export"), roles: MANAGE_ROLES, direct: true,
    run: (t, ctx) => handleExportCommand(ctx.chatId, t.slice("/export".length).trim().toLowerCase()),
  },
  { key: "/listadmins", match: (t) => t === "/listadmins", roles: ["owner"], html: true, run: () => buildListAdminsReport() },
  {
    key: "/addadmin", match: (t) => t.startsWith("/addadmin"), roles: ["owner"],
    run: (t) => handleAddAdminCommand(t.slice("/addadmin".length).trim()),
  },
  {
    key: "/removeadmin", match: (t) => t.startsWith("/removeadmin"), roles: ["owner"],
    run: (t) => handleRemoveAdminCommand(t.slice("/removeadmin".length).trim()),
  },
];

const HELP_TEXT = [
  "<b>Beyond Sundays</b>",
  "",
  "<b>Reports</b>",
  "/today — today's signups: name, number, topic, attended/teacher/picked, plus a CSV",
  "/week — every signup this week, by day, with totals; plus a full CSV",
  "",
  "<b>Manage a person</b> (find their number with /today or /search first)",
  "/search <code>&lt;number&gt;</code> — find someone, e.g. /search 0412 345 678",
  "/attend <code>&lt;number&gt; yes|no</code> — mark whether they attended",
  "/teacher <code>&lt;number&gt; &lt;name&gt;</code> — assign a teacher, e.g. /teacher 0455 987 654 Mr Lee",
  "/picked <code>&lt;number&gt; yes|no</code> — agreed to keep studying after meeting their teacher?",
  "",
  "<i>Attend/teacher/picked show as TBC until an admin sets them.</i>",
  "",
  "<b>Export</b>",
  "/export <code>week|month|year</code> — download that period as a CSV file",
  "",
  "/myrole — show your own access level",
].join("\n");

const OWNER_HELP_TEXT = [
  HELP_TEXT,
  "",
  "<b>Owner-only</b>",
  "/listadmins — list all admins/viewers",
  "/addadmin <code>&lt;chat_id&gt; admin|viewer [label]</code> — grant access",
  "/removeadmin <code>&lt;chat_id&gt;</code> — revoke access",
].join("\n");

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

  if (!chatId) {
    return new Response("OK", { status: 200 });
  }

  const role = await getRole(chatId);
  if (!role) {
    console.warn(`Ignored Telegram message from unauthorized chat: ${chatId}`);
    return new Response("OK", { status: 200 });
  }

  const command = COMMANDS.find((c) => c.match(text));
  if (!command) {
    await sendTelegramMessage(chatId, role === "owner" ? OWNER_HELP_TEXT : HELP_TEXT, { html: true });
    return new Response("OK", { status: 200 });
  }

  if (!command.roles.includes(role)) {
    await sendTelegramMessage(chatId, "You don't have permission for that command.");
    return new Response("OK", { status: 200 });
  }

  const ctx = { chatId, role };
  if (command.direct) {
    await command.run(text, ctx);
  } else {
    await sendTelegramMessage(chatId, await command.run(text, ctx), { html: !!command.html });
  }

  return new Response("OK", { status: 200 });
};

// /today and /week are text-only — no auto-generated CSV. /export is
// the one deliberate place a file gets created, only when someone
// actually asks for one, so repeatedly checking /today or /week never
// spams the chat with fresh duplicate files. If a day/week has more
// people than fit in one Telegram message, buildTodayReport/
// buildWeekReport truncate the list themselves and point at /export.
async function handleTodayCommand(chatId) {
  const { text } = await buildTodayReport();
  await sendTelegramMessage(chatId, text, { html: true });
}

async function handleWeekCommand(chatId) {
  const { text } = await buildWeekReport();
  await sendTelegramMessage(chatId, text, { html: true });
}

async function buildListAdminsReport() {
  const entries = await listAdmins();
  const lines = [
    `owner: <code>${escapeHtml(process.env.TELEGRAM_CHAT_ID)}</code>`,
    ...entries.map(
      (e) => `${escapeHtml(e.role)}: <code>${escapeHtml(e.chatId)}</code>${e.label ? ` (${escapeHtml(e.label)})` : ""}`
    ),
  ];
  return ["<b>Beyond Sundays — Admins</b>", "", ...lines].join("\n");
}

async function handleAddAdminCommand(args) {
  const [chatIdArg, roleArg, ...labelParts] = args.split(/\s+/);
  if (!chatIdArg || !roleArg) return "Usage: /addadmin <chat_id> admin|viewer [label]";
  const role = roleArg.toLowerCase();
  if (role !== "admin" && role !== "viewer") return "Role must be admin or viewer.";
  await addAdmin(chatIdArg, role, labelParts.join(" "));
  return `Added chat ${chatIdArg} as ${role}.`;
}

async function handleRemoveAdminCommand(args) {
  const chatIdArg = args.trim();
  if (!chatIdArg) return "Usage: /removeadmin <chat_id>";
  await removeAdmin(chatIdArg);
  return `Removed chat ${chatIdArg}.`;
}

const MAX_SEARCH_RESULTS = 10;

async function buildSearchReport(query) {
  if (!query) return "Usage: /search <number>, e.g. /search 0455 987 654";

  const matches = await searchPeopleByPhone(query);
  if (matches.length === 0) return `No one found matching "${query}".`;

  const blocks = matches.slice(0, MAX_SEARCH_RESULTS).map((p) => {
    const joined = new Intl.DateTimeFormat("en-AU", {
      timeZone: TIMEZONE, day: "numeric", month: "long", year: "numeric",
    }).format(new Date(p.joinedAt));
    const teacherSuffix = p.teacherAssigned ? ` (${escapeHtml(p.teacherAssigned)})` : "";
    return [
      `<b>${escapeHtml(p.name)}</b>`,
      `<code>${escapeHtml(toLocalPhone(p.phone))}</code>`,
      `Joined: ${joined} · Topic: ${escapeHtml(p.topicTitle || p.topicSlug)}`,
      `Attended: ${statusLabel(p.attended)} · Teacher: ${statusLabel(p.teacherAssigned ? true : null)}${teacherSuffix} · Picked: ${statusLabel(p.picked)}`,
    ].join("\n");
  });

  const header = `Found <b>${matches.length}</b> match${matches.length === 1 ? "" : "es"}${matches.length > MAX_SEARCH_RESULTS ? ` (showing first ${MAX_SEARCH_RESULTS})` : ""}:`;
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

async function handlePickedCommand(args) {
  const [numberArg, statusArg] = args.split(/\s+/);
  if (!numberArg || !statusArg) return "Usage: /picked <number> yes|no";
  const status = statusArg.toLowerCase();
  if (status !== "yes" && status !== "no") return "Usage: /picked <number> yes|no";

  const { person, error } = await resolveOnePerson(numberArg);
  if (error) return error;

  const record = await markPicked(person.phone, status === "yes");
  return `Marked ${record.name} as ${status === "yes" ? "picked (agreed to keep studying)" : "not picked"}.`;
}

const EXPORT_PERIODS = ["week", "month", "year"];

async function handleExportCommand(chatId, period) {
  if (!EXPORT_PERIODS.includes(period)) {
    await sendTelegramMessage(chatId, "Usage: /export week|month|year");
    return;
  }

  const todayProxy = sydneyTodayCalendarProxy();
  const todayKey = sydneyDateKey(todayProxy);
  let startProxy;
  if (period === "week") {
    startProxy = mondayOf(todayProxy);
  } else if (period === "month") {
    startProxy = new Date(Date.UTC(todayProxy.getUTCFullYear(), todayProxy.getUTCMonth(), 1, 12));
  } else {
    startProxy = new Date(Date.UTC(todayProxy.getUTCFullYear(), 0, 1, 12));
  }
  const startKey = sydneyDateKey(startProxy);

  const submissions = (await fetchAllRsvpSubmissions()).filter((s) => inRange(s.createdAt, startKey, todayKey));
  if (submissions.length === 0) {
    await sendTelegramMessage(chatId, `No signups this ${period}.`);
    return;
  }

  // A person may have RSVP'd more than once in the period — one CSV row
  // per person, keeping their most recent signup in it.
  const latestByPhone = new Map();
  for (const s of submissions.sort((a, b) => a.createdAt - b.createdAt)) {
    latestByPhone.set(s.phone.replace(/\s/g, ""), s);
  }

  const rows = [["Name", "Number", "Signed up", "Topic", "Attended", "Teacher", "Picked"]];
  for (const s of latestByPhone.values()) {
    const person = await getPersonByPhone(s.phone);
    const signedUp = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(s.createdAt);
    const topicTitle = TOPICS[s.topicSlug]?.title || s.topicSlug || "";
    rows.push([
      s.name,
      toLocalPhone(s.phone),
      signedUp,
      topicTitle,
      statusLabel(person?.attended ?? null),
      person?.teacherAssigned || statusLabel(null),
      statusLabel(person?.picked ?? null),
    ]);
  }

  const filename = `beyond-sundays-${period}-${customDateCode(todayProxy)}.csv`;
  await sendTelegramDocument(chatId, filename, toCsv(rows));
}
