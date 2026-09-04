/**
 * Shared behavior: nav rendering + mobile toggle, poster card markup.
 * Loaded on every page after data.js.
 */

/** Real image if the given topic/scene has one, otherwise the dark
 *  placeholder-with-glow. Shared by poster cards, the topic detail
 *  poster, and The Story's scene visuals — anything with a `title`
 *  and an `image` field. */
function mediaHTML(topic) {
  if (topic.image) {
    return `<img src="${topic.image}" alt="${topic.title}" loading="lazy" />`;
  }
  return `<div class="media__glow"><span></span><span></span><span></span></div>`;
}

/**
 * Validates an Australian mobile number and normalizes it to
 * "+61 4XX XXX XXX". Accepts local "04XX XXX XXX" or international
 * "+61 4XX XXX XXX" input (any spacing/punctuation); rejects everything
 * else (landlines, other country codes, wrong length). Returns the
 * normalized string, or null if the input isn't a valid AU mobile.
 */
function normalizeAuMobile(raw) {
  const cleaned = (raw || "").trim().replace(/[^\d+]/g, "");

  // "+61 4XX XXX XXX" (with or without the leading +)
  let match = cleaned.match(/^\+?61(4\d{8})$/);
  // Local "04XX XXX XXX" — the leading 0 is required, not optional,
  // so a bare 9-digit number (ambiguous, possibly mistyped) is rejected.
  if (!match) match = cleaned.match(/^0(4\d{8})$/);
  if (!match) return null;

  const nine = match[1];
  return `+61 ${nine.slice(0, 3)} ${nine.slice(3, 6)} ${nine.slice(6, 9)}`;
}

function renderNav(activePage) {
  const links = [
    { href: "index.html", label: "Home", key: "home" },
    { href: "index.html#explore-topics", label: "Explore Topics", key: "explore-topics" },
    // "The Story" removed from nav for now — story.html and its assets are
    // untouched, just not linked. Add the line back above to restore it.
  ];

  const linksHTML = links
    .map(
      (l) =>
        `<a href="${l.href}" class="${l.key === activePage ? "is-active" : ""}">${l.label}</a>`
    )
    .join("");

  return `
    <nav class="nav">
      <a href="index.html" class="nav__brand">Beyond Sundays <span>Bible Study</span></a>
      <div class="nav__links" id="navLinks">${linksHTML}</div>
      <button class="nav__toggle" id="navToggle" aria-label="Toggle menu">☰</button>
    </nav>
  `;
}

function mountNav(activePage) {
  const el = document.getElementById("nav");
  if (!el) return;
  el.innerHTML = renderNav(activePage);
  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");
  toggle.addEventListener("click", () => links.classList.toggle("is-open"));
}

function posterCardHTML(topic) {
  return `
    <a class="poster-card reveal" href="topic.html?slug=${topic.slug}">
      <div class="poster-card__art media">
        ${mediaHTML(topic)}
        <div class="poster-card__badge"><span class="badge badge--day">${topic.day}</span></div>
      </div>
      <div class="poster-card__body">
        <div class="poster-card__title">${topic.title}</div>
        <div class="poster-card__meta">${topic.genre} · ${topic.runtime}</div>
        <p class="poster-card__desc">${topic.description}</p>
        <span class="btn btn--gold poster-card__cta">View Showtime →</span>
      </div>
    </a>
  `;
}
