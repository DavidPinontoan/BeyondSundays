/**
 * Phone display helpers. Numbers are stored/keyed internally as
 * "+61 4XX XXX XXX" (required for Twilio's `to` field once SMS sending
 * works) but everywhere a human actually looks at a number — Telegram
 * messages, CSV exports — it's shown in local "04XX XXX XXX" format
 * instead, since that's what admins actually recognise and dial.
 */

/** Converts any AU mobile (local or international, spaced or not) to
 *  local "04XX XXX XXX" display format. */
export function toLocalPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const core = digits.slice(-9);
  if (core.length < 9) return phone || "";
  const local = "0" + core;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7, 10)}`;
}

/** true/false/null -> "Y"/"N"/"TBC" — an admin hasn't managed this
 *  person yet if it's still null, so it reads as "to be confirmed"
 *  rather than a hard "no". */
export function statusLabel(value) {
  return value === true ? "Y" : value === false ? "N" : "TBC";
}
