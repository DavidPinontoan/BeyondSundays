/**
 * Role-based access for the Telegram bot. Three roles:
 *
 *   owner   - everything, including managing other admins/viewers.
 *             Always exactly the TELEGRAM_CHAT_ID env var — hardcoded
 *             rather than stored, so you can never lock yourself out.
 *   admin   - everything except managing other admins (/search,
 *             /attend, /teacher, /export, plus everything viewer has).
 *   viewer  - read-only aggregate views only: /today, /week, /stats,
 *             /topics. No /search (exposes phone numbers), no
 *             /attend, /teacher, /export (all mutate or export data).
 *
 * Additional admins/viewers are stored in Netlify Blobs, keyed by their
 * Telegram chat ID (found the same way TELEGRAM_CHAT_ID was: message the
 * bot, then read the chat ID off a getUpdates call, or just have the
 * owner run /addadmin once they know it).
 */

import { getStore } from "@netlify/blobs";

function store() {
  return getStore("admins");
}

export async function getRole(chatId) {
  const id = String(chatId);
  if (process.env.TELEGRAM_CHAT_ID && id === process.env.TELEGRAM_CHAT_ID) return "owner";
  const record = await store().get(id, { type: "json" });
  return record?.role || null;
}

export async function addAdmin(chatId, role, label) {
  if (role !== "admin" && role !== "viewer") {
    throw new Error('Role must be "admin" or "viewer"');
  }
  await store().setJSON(String(chatId), { role, label: label || "", addedAt: new Date().toISOString() });
}

export async function removeAdmin(chatId) {
  await store().delete(String(chatId));
}

export async function listAdmins() {
  const { blobs } = await store().list();
  return Promise.all(
    blobs.map(async (b) => ({ chatId: b.key, ...(await store().get(b.key, { type: "json" })) }))
  );
}
