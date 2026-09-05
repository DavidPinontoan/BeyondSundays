/**
 * Shared report-building + Sydney-calendar helpers, used by both the
 * on-demand /today and /week bot commands (telegram-bot.mjs) and the
 * automatic Saturday-night digest (weekly-digest.mjs) — kept in one
 * place so the two don't drift out of sync with each other.
 */

import { fetchAllRsvpSubmissions } from "./netlify-forms.mjs";

export const TIMEZONE = "Australia/Sydney";
export const WEEK_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function buildTodayReport() {
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

export async function buildWeekReport() {
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

/** "2026-W37"-style key so weekly dedup stores naturally reset each week. */
export function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}
