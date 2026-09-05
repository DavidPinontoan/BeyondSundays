/**
 * Shared helper — fetches every RSVP submission (all topics, all
 * sessions) from the Netlify Forms API, paginating as needed. Used by
 * anything that needs to look across all signups rather than one
 * topic+session at a time (unlike send-reminders.mjs's own narrower
 * fetch, which filters by slug+session directly in its query).
 */

export async function fetchAllRsvpSubmissions() {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_ACCESS_TOKEN;
  if (!siteId || !token) {
    console.warn("NETLIFY_SITE_ID / NETLIFY_ACCESS_TOKEN not set — can't fetch RSVP submissions.");
    return [];
  }

  const headers = { Authorization: `Bearer ${token}` };

  const formsRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/forms`, { headers });
  if (!formsRes.ok) throw new Error(`Failed to list forms: ${formsRes.status}`);
  const forms = await formsRes.json();
  const rsvpForm = forms.find((f) => f.name === "rsvp");
  if (!rsvpForm) return [];

  const perPage = 100;
  const all = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.netlify.com/api/v1/forms/${rsvpForm.id}/submissions?page=${page}&per_page=${perPage}`,
      { headers }
    );
    if (!res.ok) throw new Error(`Failed to list submissions: ${res.status}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < perPage) break;
  }

  // TEMPORARY DEBUG — remove once the /today date-boundary issue is
  // diagnosed. Logs the raw created_at string Netlify's API actually
  // returns, since new Date(s.created_at) could be parsing it wrong
  // (e.g. as local time instead of UTC) if it lacks a clear timezone
  // marker, which would shift some submissions across a day boundary.
  console.log(
    "DEBUG raw submissions:",
    JSON.stringify(all.map((s) => ({ name: s.data?.name, created_at: s.created_at, parsed: new Date(s.created_at).toISOString() })))
  );

  return all
    .filter((s) => s.data && s.data.name && s.data.phone && s.created_at)
    .map((s) => ({
      name: s.data.name,
      phone: s.data.phone,
      topicSlug: s.data.topic,
      session: s.data.session,
      createdAt: new Date(s.created_at),
    }));
}
