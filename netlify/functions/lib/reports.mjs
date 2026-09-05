/**
 * Shared report-building + Sydney-calendar helpers, used by both the
 * on-demand /today and /week bot commands (telegram-bot.mjs) and the
 * automatic Saturday-night digest (weekly-digest.mjs) — kept in one
 * place so the two don't drift out of sync with each other.
 *
 * /today and /week both cross-reference the people-store (attendance,
 * teacher, picked) against Netlify Forms submissions (accurate signup
 * timing/events), and return { text, csvRows } — `text` for the chat
 * message, `csvRows` (a 2D array, pass to lib/csv.mjs's toCsv) for the
 * attached file. A person with a field not yet set by an admin shows as
 * "TBC" rather than a hard Y/N (see lib/phone.mjs's statusLabel).
 */

import { fetchAllRsvpSubmissions } from "./netlify-forms.mjs";
import { escapeHtml } from "./telegram.mjs";
import { getPersonByPhone } from "./people-store.mjs";
import { toLocalPhone, statusLabel } from "./phone.mjs";
import { TOPICS } from "./topics.mjs";

export const TIMEZONE = "Australia/Sydney";
export const WEEK_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function topicTitleForDay(dayFullName) {
  const slug = Object.keys(TOPICS).find((s) => TOPICS[s].day === dayFullName);
  return slug ? TOPICS[slug].title : null;
}

/** Cross-references each Forms submission against its people-store
 *  record, returning plain data (not formatted strings) so both the
 *  chat text and the CSV can build off the same rows. */
async function buildPersonRows(submissions) {
  const rows = [];
  for (const s of submissions) {
    const person = await getPersonByPhone(s.phone);
    rows.push({
      name: s.name,
      phone: s.phone,
      createdAt: s.createdAt,
      topicSlug: s.topicSlug,
      topicTitle: TOPICS[s.topicSlug]?.title || s.topicSlug || "",
      session: s.session,
      attended: statusLabel(person?.attended ?? null),
      teacher: statusLabel(person?.teacherAssigned ? true : null),
      teacherName: person?.teacherAssigned || null,
      picked: statusLabel(person?.picked ?? null),
    });
  }
  return rows;
}

export async function buildTodayReport() {
  const submissions = await fetchAllRsvpSubmissions();
  const todayProxy = sydneyTodayCalendarProxy();
  const todayKey = sydneyDateKey(todayProxy);
  const monday = mondayOf(todayProxy);
  const monthStart = new Date(Date.UTC(todayProxy.getUTCFullYear(), todayProxy.getUTCMonth(), 1, 12));
  const weekKey = sydneyDateKey(monday);
  const monthKey = sydneyDateKey(monthStart);

  const todaySubmissions = submissions
    .filter((s) => sydneyDateKey(s.createdAt) === todayKey)
    .sort((a, b) => a.createdAt - b.createdAt);
  const weekCount = submissions.filter((s) => inRange(s.createdAt, weekKey, todayKey)).length;
  const monthCount = submissions.filter((s) => inRange(s.createdAt, monthKey, todayKey)).length;

  const weekdayName = new Intl.DateTimeFormat("en-AU", { timeZone: TIMEZONE, weekday: "long" }).format(todayProxy);
  const dateLabel = `${customDateCode(todayProxy)} (${weekdayName})`;
  const topicTitle = topicTitleForDay(weekdayName) || "No topic today";

  const rows = await buildPersonRows(todaySubmissions);

  const personLines = rows.map((r, i) => {
    const teacherSuffix = r.teacherName ? ` (${escapeHtml(r.teacherName)})` : "";
    return [
      `${i + 1}. <code>${escapeHtml(toLocalPhone(r.phone))}</code> <b>${escapeHtml(r.name)}</b>`,
      `   Attended: ${r.attended} · Teacher: ${r.teacher}${teacherSuffix} · Picked: ${r.picked}`,
    ].join("\n");
  });

  const text = [
    `<b>Today: ${escapeHtml(topicTitle)}</b> (${rows.length}) — ${dateLabel}`,
    ...(personLines.length > 0 ? ["", ...personLines] : ["", "No signups today."]),
    "",
    `This week: ${weekCount} · This month: ${monthCount}`,
  ].join("\n");

  const csvRows = [
    ["Name", "Number", "Topic", "Signed up", "Attended", "Teacher", "Picked"],
    ...rows.map((r) => [
      r.name,
      toLocalPhone(r.phone),
      r.topicTitle,
      sydneyTimeLabel(r.createdAt),
      r.attended,
      r.teacherName || r.teacher,
      r.picked,
    ]),
  ];

  return { text, csvRows, dateLabel };
}

export async function buildWeekReport() {
  const submissions = await fetchAllRsvpSubmissions();
  const todayProxy = sydneyTodayCalendarProxy();
  const monday = mondayOf(todayProxy);

  const dayKeys = WEEK_DAY_LABELS.map((_, i) => sydneyDateKey(addDays(monday, i)));
  const daySubmissions = dayKeys.map((key) =>
    submissions.filter((s) => sydneyDateKey(s.createdAt) === key).sort((a, b) => a.createdAt - b.createdAt)
  );
  const counts = daySubmissions.map((arr) => arr.length);
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

  const text = [
    "<b>Beyond Sundays — Weekly Report</b>",
    "",
    ...WEEK_DAY_LABELS.map((label, i) => {
      const title = topicTitleForDay(WEEK_DAY_FULL[i]) || "—";
      return `${label} ${escapeHtml(title)}: ${counts[i]}`;
    }),
    `Total: ${total} signups`,
    growthLine,
  ].join("\n");

  const csvRows = [["Day", "Topic", "Name", "Number", "Signed up", "Attended", "Teacher", "Picked"]];
  for (let i = 0; i < WEEK_DAY_FULL.length; i++) {
    const rows = await buildPersonRows(daySubmissions[i]);
    for (const r of rows) {
      csvRows.push([
        WEEK_DAY_FULL[i],
        r.topicTitle,
        r.name,
        toLocalPhone(r.phone),
        sydneyTimeLabel(r.createdAt),
        r.attended,
        r.teacherName || r.teacher,
        r.picked,
      ]);
    }
  }

  return { text, csvRows };
}

export function inRange(date, startKey, endKey) {
  const key = sydneyDateKey(date);
  return key >= startKey && key <= endKey;
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

/** Monday of the same week as `proxy` (both as noon-UTC calendar proxies). */
export function mondayOf(proxy) {
  const isoDow = (proxy.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  return addDays(proxy, -isoDow);
}

export function sydneyDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date);
}

export function sydneyTimeLabel(date) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(date);
}

/** Today's Sydney calendar date, encoded as a noon-UTC Date so whole-day
 *  arithmetic (+/- N days) can't drift across a DST boundary into the
 *  wrong calendar day. */
export function sydneyTodayCalendarProxy() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 12));
}

/** Custom compact date code: a "year 43 = 2026" epoch (so it ticks up by
 *  1 each real year) followed by month and day, e.g. 5 Sept 2026 -> the
 *  year part is 2026 - 1983 = 43, giving "430905". Used for CSV filenames
 *  and report date labels instead of the real calendar year. */
export function customDateCode(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  const customYear = String(Number(get("year")) - 1983).padStart(2, "0");
  return `${customYear}${get("month")}${get("day")}`;
}

/** "2026-W37"-style key so weekly dedup stores naturally reset each week. */
export function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}
