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

export async function searchPeopleByName(query) {
  const all = await getAllPeople();
  const needle = query.trim().toLowerCase();
  return all.filter((p) => p.name.toLowerCase().includes(needle));
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
