/**
 * Single shared load of topics-schedule.json. Every function that needs
 * topic titles/days/Zoom links imports TOPICS from here instead of doing
 * its own readFileSync — when multiple files each computed this same
 * file's path via a different relative-depth expression (some "./",
 * lib/reports.mjs needing "../"), Netlify's function bundler apparently
 * got confused about which directory structure to preserve in the
 * deployed bundle, and one of the copies 404'd at runtime (ENOENT) even
 * though everything resolved correctly locally. One canonical import
 * site avoids that ambiguity entirely.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TOPICS = JSON.parse(
  readFileSync(fileURLToPath(new URL("../topics-schedule.json", import.meta.url)), "utf8")
);
