/**
 * Editable per-person record store, backed by Netlify Blobs — the piece
 * Netlify Forms can't provide on its own, since form submissions are
 * append-only (no update endpoint). This is the foundation the rest of
 * the bot spec (attendance, teacher assignment, search, stats) builds on.
 *
 * One record per phone number (used as the key, E.164-ish with spaces
 * stripped). Re-RSVPing updates the existing record's topic/session
 * rather than creating a duplicate — `joinedAt` stays fixed at their
 * first-ever signup.
 */

import { getStore } from "@netlify/blobs";

function keyOf(phone) {
  return phone.replace(/\s/g, "");
}

function store() {
  return getStore("people");
}

export async function upsertPerson({ name, phone, topicSlug, topicTitle, session }) {
  const key = keyOf(phone);
  const existing = await store().get(key, { type: "json" });

  const record = {
    name,
    phone,
    joinedAt: existing?.joinedAt || new Date().toISOString(),
    topicSlug,
    topicTitle,
    session,
    attended: existing?.attended ?? null,
    teacherAssigned: existing?.teacherAssigned ?? null,
    interested: existing?.interested ?? null,
    picked: existing?.picked ?? null,
  };

  await store().setJSON(key, record);
  return record;
}

export async function getPersonByPhone(phone) {
  return store().get(keyOf(phone), { type: "json" });
}

export async function getAllPeople() {
  const { blobs } = await store().list();
  const people = await Promise.all(blobs.map((b) => store().get(b.key, { type: "json" })));
  return people.filter(Boolean);
}

/** Enrollment count per topic, based on each person's most recent
 *  topicSlug — used by /topics. */
export async function getTopicCounts() {
  const all = await getAllPeople();
  const counts = {};
  for (const p of all) {
    const key = p.topicSlug || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function digitsOnly(s) {
  return (s || "").replace(/\D/g, "");
}

/** Last 9 digits — the actual mobile number, ignoring whether it's
 *  written as "04XX XXX XXX" (local) or "+61 4XX XXX XXX" (international),
 *  since both end in the same 9 digits. */
function mobileCore(s) {
  return digitsOnly(s).slice(-9);
}

/** Search by phone number — accepts either local (04XX XXX XXX) or
 *  international (+61 4XX XXX XXX) format, with or without spaces. An
 *  exact 9-digit-core match is preferred; a partial query (e.g. just the
 *  last few digits) falls back to a substring match so long as it's at
 *  least 4 digits, to avoid matching everyone on a too-short query. */
export async function searchPeopleByPhone(query) {
  const queryDigits = digitsOnly(query);
  if (queryDigits.length < 4) return [];

  const all = await getAllPeople();
  const queryCore = mobileCore(query);
  const exact = all.filter((p) => mobileCore(p.phone) === queryCore);
  if (exact.length > 0) return exact;

  return all.filter((p) => digitsOnly(p.phone).includes(queryDigits));
}

export async function markAttendance(phone, attended) {
  const key = keyOf(phone);
  const record = await store().get(key, { type: "json" });
  if (!record) return null;
  record.attended = attended;
  await store().setJSON(key, record);
  return record;
}

export async function assignTeacher(phone, teacherName) {
  const key = keyOf(phone);
  const record = await store().get(key, { type: "json" });
  if (!record) return null;
  record.teacherAssigned = teacherName;
  await store().setJSON(key, record);
  return record;
}

/** Whether this person, after meeting their assigned teacher in person,
 *  agreed to keep studying — a separate outcome from just being assigned
 *  a teacher in the first place. */
export async function markPicked(phone, picked) {
  const key = keyOf(phone);
  const record = await store().get(key, { type: "json" });
  if (!record) return null;
  record.picked = picked;
  await store().setJSON(key, record);
  return record;
}
