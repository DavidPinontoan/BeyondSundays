/**
 * Full-page background — one photo behind the entire scroll, no dark tint
 * (legibility comes from text-shadow on the copy, see css/style.css).
 */

const SITE_BACKGROUND_IMAGE = "assets/backgrounds/field.jpg";

function renderSiteBackgrounds(path) {
  const container = document.getElementById("siteBg");
  if (!container) return;

  const src = path || SITE_BACKGROUND_IMAGE;
  const visual = src
    ? `<img src="${src}" alt="" />`
    : `<div class="media__glow"><span></span><span></span><span></span></div>`;

  container.innerHTML = `<div class="site-bg__layer media is-active">${visual}</div>`;
}
