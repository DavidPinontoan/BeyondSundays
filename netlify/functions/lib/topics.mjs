/**
 * Server-side mirror of js/data.js's day/title fields, plus real Zoom
 * links — used by send-confirmation.mjs, send-reminders.mjs,
 * telegram-bot.mjs, and lib/reports.mjs to know which topic airs when
 * and what link to text out. Keep the slugs and days in sync with
 * js/data.js if you change the lineup, and fill in the real Zoom links
 * below (currently placeholders).
 *
 * This used to be a separate topics-schedule.json read via
 * readFileSync + import.meta.url, but that broke: Netlify's function
 * bundler inlines every local lib/ import into each function's single
 * deployed file, and does NOT preserve the original per-file
 * import.meta.url once inlined — the code ends up executing as if it
 * were still at its pre-bundle relative depth, so "../topics-schedule
 * .json" resolved one directory too high once this stopped being a
 * top-level file. A plain exported JS object sidesteps the problem
 * entirely — no runtime file read, so no path to get wrong.
 */

export const TOPICS = {
  "value-of-the-bible": { title: "Value of the Bible", day: "Monday", zoomLink: "https://zoom.us/j/PLACEHOLDER1" },
  "wise-investment": { title: "Wise Investment", day: "Tuesday", zoomLink: "https://zoom.us/j/PLACEHOLDER2" },
  "good-and-evil": { title: "Good and Evil", day: "Wednesday", zoomLink: "https://zoom.us/j/PLACEHOLDER3" },
  "old-covenant": { title: "Old Covenant", day: "Thursday", zoomLink: "https://zoom.us/j/PLACEHOLDER4" },
  "new-covenant": { title: "New Covenant", day: "Friday", zoomLink: "https://zoom.us/j/PLACEHOLDER5" },
  "what-kind-of-era": { title: "What Kind of Era Are We In?", day: "Saturday", zoomLink: "https://zoom.us/j/PLACEHOLDER6" },
};
