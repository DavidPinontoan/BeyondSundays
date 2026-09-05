# Beyond Sundays

An online Bible study site, browsed like a streaming service. Guests browse
topics as "showings," reserve a spot with their name and an Australian mobile
number (validated and normalized to +61 on the client), and get texted
the Zoom link before class starts.

## Stack

Plain HTML/CSS/vanilla JS on the frontend (no build step, no Node required
to just view the site). RSVP capture and SMS reminders run on **Netlify**:
Netlify Forms captures each RSVP (name + phone show up in your Netlify
dashboard, no database to run), and a Netlify scheduled Function
(`netlify/functions/send-reminders.mjs`) checks every 15 minutes whether
it's showtime and texts the Zoom link via Twilio to everyone who RSVP'd.

Scroll animation runs on real, self-hosted libraries rather than hand-rolled
JS — no CDN dependency, no npm install needed to view the site:

- **[GSAP](https://gsap.com/) + ScrollTrigger + SplitText** (`js/vendor/`) — 100% free since Webflow's 2025 acquisition, including the plugins that used to require a paid Club GreenSock membership.
- **[Lenis](https://lenis.dev/)** (`js/vendor/lenis.min.js`) — smooth-scroll layer, MIT licensed.

All four files were downloaded once and committed under `js/vendor/`; there's
nothing to `npm install` for the frontend. `js/site-motion.js` wires them up
and self-inits against whatever elements exist on the current page (hero
title fall, staggered card reveals, the Story page's scroll-scrubbed fade +
drift). Everything respects `prefers-reduced-motion` — Lenis/ScrollTrigger
never spin up and elements snap straight to their resting, fully-visible
state.

Deliberately kept flat rather than 3D — no rotation, no perspective tricks.
Every poster card and each Story scene share one placeholder look (`.media`
/ `.media__glow` in `css/style.css`): a dark grey panel with a few soft
drifting glow spots, standing in until you add a real image via the `image`
field on that topic/scene (see `js/data.js` and `js/story-data.js`).

`index.html` also has one full-page background (`js/backgrounds-data.js`,
`.site-bg` in `css/style.css`) behind the entire scroll — no dark tint over
it; legibility comes from text-shadow on the copy instead. The nav bar and
topic cards are ghost/transparent so it shows through everywhere. It's
currently a looping video (muted, autoplay, loops via the `loop` attribute,
pauses when the tab is hidden), served responsively:
`assets/backgrounds/landscape.mp4` (2160×1188, ~29MB) on desktop,
`assets/backgrounds/landscape-mobile.mp4` (1280×704, ~16MB) on phones —
the browser picks via a `<source media="(max-width: 768px)">`, so phones
never download the desktop file. Set `SITE_BACKGROUND_IMAGE` /
`SITE_BACKGROUND_VIDEO_MOBILE` in `js/backgrounds-data.js` to swap either
one — a path ending in `.mp4`/`.mov`/`.webm` renders as video, anything
else as an `<img>`. Video must be H.264 (or VP9/WebM) — HEVC/H.265 won't
play in Chrome or Firefox, only Safari, so re-export any HEVC source
first; both files here were transcoded from an HEVC source with macOS's
built-in `avconvert` (`PresetHighestQuality` for desktop — preserves the
source resolution instead of downscaling, which is what fixed an earlier
blurry pass — and `Preset1280x720` for the mobile file). No `poster`
attribute is set on the `<video>` — a poster image would otherwise flash
a lower-resolution still before the first real frame decodes.

## Running it locally

**Quick look (no RSVP capture):**

```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Then open http://localhost:5000. This just serves the static files — it's
enough to check layout, copy, and animation, but the RSVP form has nowhere
real to submit to (Netlify Forms only exists once deployed to Netlify), so
submitting shows a local-only confirmation instead of actually saving
anything. You can also skip Flask entirely and open `index.html` directly
in a browser for the same reason.

**Full local test (RSVP + reminder function, via Netlify's own emulator):**

```bash
npm install -g netlify-cli
netlify dev
```

`netlify dev` serves the static site *and* emulates Netlify Forms and
Functions locally, so you can test a real end-to-end RSVP submission and
manually invoke `send-reminders.mjs` before deploying. Requires Node.js.

## Deploying to Netlify

1. Push this repo to GitHub/GitLab/Bitbucket (or run `netlify deploy` from
   the CLI) and connect it as a new Netlify site. `netlify.toml` already
   points Netlify at the right publish directory (`.`) and functions
   directory (`netlify/functions`) — no build command needed.
2. In the Netlify dashboard, go to **Site configuration → Environment
   variables** and set:
   - `NETLIFY_SITE_ID` — Site configuration → General → Site details → Site ID
   - `NETLIFY_ACCESS_TOKEN` — a Personal Access Token from User settings → Applications → New access token (needed so the functions can read Forms submissions via the API)
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — from your Twilio console
   - `ORGANIZER_PHONE` — your own mobile, `+61` format — receives the showtime "X confirmed, Y declined, Z no reply" tally text
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — see `netlify/functions/lib/telegram.mjs` for how to get these (create a bot via @BotFather, message it once, then read your chat ID off `getUpdates`)
3. Point Twilio's inbound-SMS webhook at `sms-reply.mjs` so replies to the
   "are you still coming? Y or N" text actually get recorded: in the
   Twilio console, **Phone Numbers → Manage → Active Numbers**, open your
   number, and under **Messaging Configuration** set "A message comes in"
   to a webhook, HTTP POST, pointing at
   `https://<your-site>.netlify.app/.netlify/functions/sms-reply`.
4. Deploy. Once a real RSVP comes in, it'll appear under the site's
   **Forms → rsvp** tab in the dashboard.
5. Register the Telegram bot's webhook so `/today` and `/week` work: visit
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-site>.netlify.app/.netlify/functions/telegram-bot`
   once in a browser (fill in your real token and site URL). After this,
   `getUpdates` stops returning anything — that's expected, not an error.
6. Fill in real Zoom links in `netlify/functions/lib/topics.mjs`
   (currently placeholders).

`send-reminders.mjs`, `send-confirmation.mjs`, `sms-reply.mjs`, and
`telegram-bot.mjs` were all written against Netlify's, Twilio's, and
Telegram's documented APIs but **have not been run** — there's no Node.js
available in the environment they were built in.
Check each function's logs in the Netlify dashboard (Functions tab) after
your first deploy, after a real RSVP, and after the first showtime rolls
around; without the Twilio env vars set, sends are just logged rather than
erroring.

**Confirmed by live testing**: a Twilio **trial** account cannot send any
of these messages at all — trial accounts are restricted to a small set of
Twilio's own fixed template messages and reject any custom message body
with `"Invalid template name. Trial accounts can only use predefined SMS
templates."` Every text in this project (confirmation, Y/N check-in, Zoom
link, organizer tally) is custom text, so **the Twilio account needs to be
upgraded to a paid, pay-as-you-go account** (adding a payment method and
some credit — not a subscription) before any of it can actually send.
Telegram alerts are unaffected by this and work regardless.

### Abuse protection

- **`send-confirmation.mjs`** (fires per RSVP, each call costs a Twilio
  SMS once that's upgraded) is rate-limited: max 5 calls per IP per 10
  minutes, and a 5-minute cooldown per phone number. A blocked call just
  quietly returns 200 with none of its three effects (SMS, Telegram
  alert, people-store upsert) — no error surfaces to the submitter either
  way, since the on-page confirmation is independent client-side state.
  Backed by `lib/rate-limit.mjs`.
- **`sms-reply.mjs`** verifies Twilio's `X-Twilio-Signature` header on
  every request before touching anything — without this, its public URL
  would let anyone forge a fake `{From, Body}` and manipulate someone
  else's attendance/confirmation record. If genuine replies start getting
  rejected (check the function's logs — a rejection logs the URL it
  validated against), set `TWILIO_SKIP_SIGNATURE_CHECK=true` as a
  stopgap and let me know, since that usually means the URL Twilio
  signed against doesn't exactly match what the function sees (a known
  risk behind some proxies/CDNs), not that requests are actually forged.
- **Not implemented, needs your own account**: a real CAPTCHA
  (reCAPTCHA/hCaptcha) on the RSVP form itself — the nearest thing
  available without a new third-party signup is Netlify's own built-in
  Forms spam filter (**Site configuration → Forms → Spam filters** →
  enable Akismet or reCAPTCHA 2), worth turning on alongside the above.
  The honeypot field (already in place) and the rate limits above are
  the practical protection for now; nothing can block the underlying
  Netlify Forms submission itself from function code, only the paid
  side effects that follow it.

### How the SMS flow works

1. **On RSVP** — `send-confirmation.mjs` fires immediately (called directly
   from `topic.html`, not on a schedule) and texts a warm "you're
   confirmed for X" message naming the topic and the showing they picked.
2. **One hour before their showing** — `send-reminders.mjs` (on its
   15-minute schedule) texts "are you still coming? Reply Y or N" and
   records the reply via `sms-reply.mjs` against a Netlify Blobs store
   keyed by phone number.
3. **At showtime** — `send-reminders.mjs` texts the Zoom link to everyone
   who RSVP'd for that showing (regardless of how/whether they replied to
   the Y/N text — that reply is purely a headcount signal for you, not a
   gate on getting the link), then texts `ORGANIZER_PHONE` one summary
   line with the confirmed/declined/no-reply tally.
4. **One hour after their showing starts** — `send-reminders.mjs` sends
   *you* (the admin) a Telegram message listing everyone who RSVP'd for
   that showing, so you can mark attendance with `/attend <number>
   yes|no` per person. This one's Telegram, not SMS — Telegram already
   works today, unlike Twilio, which is still blocked on the trial-account
   restriction below.

### Telegram admin bot

Every RSVP sends a "New Signup" alert to your Telegram chat (via
`send-confirmation.mjs`), independent of whether Twilio is working. You
can also message the bot directly:

- `/today` — everyone who signed up today (for whatever topic they
  picked — not just whatever airs today, since the RSVP form works on
  any topic's page at any time), each numbered with name, mobile number
  (tap to copy), their topic, and attended/teacher/picked status, plus
  totals (signups, meeting-with-teacher, picked)
- `/week` — the same per-person detail, grouped under each of the six
  days (Mon–Sat) with that day's topic, plus totals and growth % vs.
  the previous week
- `/search <number>` — find someone by mobile number (local `04XX XXX
  XXX` or international `+61 4XX XXX XXX`, spaces optional); shows join
  date, topic, and attended/teacher/picked status
- `/attend <number> yes|no` — mark whether they attended (an automatic
  Telegram nudge with the RSVP list arrives an hour after each showing —
  see "How the SMS flow works" above)
- `/teacher <number> <teacher name>` — assign a teacher to follow up with them
- `/picked <number> yes|no` — after they've met their assigned teacher in
  person, did they agree to keep studying? (a separate outcome from just
  being assigned one)
- `/export week|month|year` — sends a CSV of that period's signups (name,
  number, signed-up date, topic, attended, teacher, picked); one row per
  person even if they RSVP'd more than once in the period
- `/myrole` — shows your own access level

**`/today` and `/week` never auto-generate a file** — repeatedly checking
either one would otherwise spam the chat with a fresh duplicate CSV every
time. `/export` is the one deliberate place a file gets created, only
when someone actually asks for it. If a day/week ever has more people
than fit in one Telegram message, the list truncates itself with a
"…and N more — use /export week" note rather than silently cutting off
or failing to send. The automatic Saturday-night digest is the one
exception — since that's a single scheduled send rather than something
a person can spam, it still attaches a CSV alongside the text.

**Attended/teacher/picked show as `TBC`** (to be confirmed) rather than a
hard Y/N until an admin actually sets them via `/attend`, `/teacher`, or
`/picked` — an unmanaged person isn't a "no", just not looked at yet.

**Phone numbers always display in local format** (`04XX XXX XXX`) in every
Telegram message and CSV — regardless of the `+61 4XX XXX XXX` format
they're actually stored/keyed internally under (needed for Twilio's `to`
field once SMS sending works). See `lib/phone.mjs`.

**Access levels** (`netlify/functions/lib/admins.mjs`): **owner** (always
`TELEGRAM_CHAT_ID` — hardcoded, not stored, so you can't lock yourself
out) can do everything, including managing other admins; **admin** can
do everything except that; **viewer** is read-only (`/today`/`/week`
only — no `/search`, since that exposes phone numbers, and no
`/attend`/`/teacher`/`/export`, since those mutate or export data).
Anyone with no role at all is silently ignored — the bot gives no sign
it has data to give up.

Owner-only commands to manage access:
- `/listadmins` — list everyone with access and their role
- `/addadmin <chat_id> admin|viewer [label]` — grant access (find their
  chat ID the same way you found your own: have them message the bot
  anything, then check **Functions → telegram-bot → logs** — every
  message from a not-yet-granted chat is logged with its chat ID before
  being silently ignored)
- `/removeadmin <chat_id>` — revoke access

**Date format**: reports and CSV filenames use a custom compact date
code instead of the real calendar year — the year is offset so 2026
reads as "43" (i.e. real year minus 1983), ticking up by 1 each year,
followed by month and day. 5 September 2026 is `430905`.

Every RSVP now also writes an editable per-person record to Netlify Blobs
(`netlify/functions/lib/people-store.mjs`), keyed by phone number —
Netlify Forms submissions are append-only with no update endpoint, so
this store is what makes `/search`, and later attendance tracking and
teacher assignment, possible at all. Re-RSVPing updates the same record
(topic/session) rather than creating a duplicate; `joinedAt` stays fixed
at their first-ever signup.

An automatic weekly digest (`weekly-digest.mjs`, same report as `/week`)
also fires on its own every Saturday night at 9:00 PM Sydney time —
nobody has to remember to ask. Still left for a later pass: `/yesterday`
`/month` `/all` with pagination, inline buttons on the signup alert and
reports, and missed-class re-engagement.

**Two separate data sources, by design**: `/today` and `/week` read real
Netlify Forms submissions (an event log — every submission, including
repeats); `/stats`, `/topics`, and `/search` read the people-store (one
current snapshot per phone number). In normal use these stay in sync,
since a real RSVP creates both at once. They can only drift apart from
testing that calls `send-confirmation.mjs` directly instead of through
the real form (which only touches the people-store) — not something
that happens from the live site itself.

## Project layout

```
index.html          Landing hero + "Explore the Topics" 2x3 grid (all 6 topics, day-of-week badges)
topic.html           Topic detail page: title → Featured question + RSVP → Explore (3 discussion questions)
story.html            "The Story" scrollytelling scripture timeline
css/style.css          Design system (candlelight + sage palette, components)
css/story.css          The Story page styling
js/data.js              Topic catalog — edit this to change what's showing
js/story-data.js         The Story scene captions + citations
js/backgrounds-data.js    index.html's full-page background video/image
js/site-motion.js          GSAP + ScrollTrigger + Lenis scroll animation, self-initializing
js/vendor/                  Self-hosted GSAP/ScrollTrigger/SplitText/Lenis (see Stack above)
js/embers.js                Ambient candle-ember canvas overlay
server/app.py              Flask static-file server for local preview only (see Running it locally)
netlify.toml               Netlify build config: publish "." and the functions directory
netlify/functions/send-reminders.mjs        Scheduled (15-min) function: 1hr-before Y/N prompts, Zoom links at showtime, organizer tally
netlify/functions/send-confirmation.mjs      Fired on RSVP submit: instant "you're confirmed" text, Telegram alert, people-store upsert
netlify/functions/sms-reply.mjs               Twilio inbound webhook: records Y/N replies
netlify/functions/telegram-bot.mjs             Telegram webhook: /today, /week, /stats, /topics, /search, /attend, /teacher, /export, admin management
netlify/functions/weekly-digest.mjs             Scheduled (15-min) function: automatic /week report every Saturday 9pm
netlify/functions/lib/telegram.mjs              Telegram Bot API helper (setup instructions inline)
netlify/functions/lib/netlify-forms.mjs          Fetches all RSVP submissions across topics, paginated
netlify/functions/lib/people-store.mjs           Editable per-person records in Netlify Blobs (attendance, teacher)
netlify/functions/lib/reports.mjs                Shared /today + /week report builders, used by the bot and the digest
netlify/functions/lib/admins.mjs                 Role lookup/management (owner/admin/viewer) for the bot
netlify/functions/lib/rate-limit.mjs              IP rate limit + phone cooldown helpers (see Abuse protection)
netlify/functions/lib/phone.mjs                   Local "04XX XXX XXX" display formatting + Y/N/TBC labels
netlify/functions/lib/csv.mjs                      Tiny 2D-array-to-CSV-string helper, shared by /today, /week, /export
netlify/functions/lib/topics.mjs       day/title/Zoom link per topic, read by the functions above
```

## Still to fill in

- Final topic descriptions (`js/data.js`, `description`/`title` fields — currently placeholders)
- Real Zoom links (`netlify/functions/lib/topics.mjs`, `zoomLink` fields)
- Hero tagline copy (`index.html`, `.hero__tagline`)
- Netlify + Twilio environment variables, incl. `ORGANIZER_PHONE` (see Deploying to Netlify above)
- Twilio's inbound-SMS webhook pointed at `sms-reply.mjs` (see Deploying to Netlify above) — without this, Y/N replies are received by Twilio but never recorded
- Story scene images — set the `image` field on a scene in `js/story-data.js` once you have one; until then it shows the dark placeholder with a soft glow (topic posters are already filled in under `assets/posters/`)
