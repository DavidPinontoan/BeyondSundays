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
5. Fill in real Zoom links in `netlify/functions/topics-schedule.json`
   (currently placeholders).

`send-reminders.mjs`, `send-confirmation.mjs`, and `sms-reply.mjs` were all
written against Netlify's and Twilio's documented APIs but **have not been
run** — there's no Node.js available in the environment they were built in.
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
netlify/functions/send-confirmation.mjs      Fired on RSVP submit: instant "you're confirmed" text
netlify/functions/sms-reply.mjs               Twilio inbound webhook: records Y/N replies
netlify/functions/topics-schedule.json       day/title/Zoom link per topic, read by the functions above
```

## Still to fill in

- Final topic descriptions (`js/data.js`, `description`/`title` fields — currently placeholders)
- Real Zoom links (`netlify/functions/topics-schedule.json`, `zoomLink` fields)
- Hero tagline copy (`index.html`, `.hero__tagline`)
- Netlify + Twilio environment variables, incl. `ORGANIZER_PHONE` (see Deploying to Netlify above)
- Twilio's inbound-SMS webhook pointed at `sms-reply.mjs` (see Deploying to Netlify above) — without this, Y/N replies are received by Twilio but never recorded
- Story scene images — set the `image` field on a scene in `js/story-data.js` once you have one; until then it shows the dark placeholder with a soft glow (topic posters are already filled in under `assets/posters/`)
