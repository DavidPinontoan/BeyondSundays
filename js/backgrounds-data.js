/**
 * Full-page background — one photo or video behind the entire scroll, no
 * dark tint (legibility comes from text-shadow on the copy, see
 * css/style.css).
 *
 * `SITE_BACKGROUND_IMAGE` is the default (used by index.html). Pass a
 * different path to renderSiteBackgrounds() to use another one on a
 * different page (e.g. topic.html uses its own). A path ending in a video
 * extension (.mp4/.mov/.webm) renders as a muted, looping background video
 * instead of an image.
 *
 * Video is served responsively: phones get `SITE_BACKGROUND_VIDEO_MOBILE`
 * (smaller file, lower resolution) via a media-query <source>, everything
 * else gets the full file. The browser picks whichever <source> matches
 * before downloading anything, so phones never fetch the desktop file.
 */

const SITE_BACKGROUND_IMAGE = "assets/backgrounds/landscape.mp4";
const SITE_BACKGROUND_VIDEO_MOBILE = "assets/backgrounds/landscape-mobile.mp4";

function renderSiteBackgrounds(path) {
  const container = document.getElementById("siteBg");
  if (!container) return;

  const src = path || SITE_BACKGROUND_IMAGE;
  const isVideo = /\.(mp4|mov|webm)$/i.test(src || "");

  let visual;
  if (isVideo) {
    // No `poster` — it would be a lower-resolution still shown while the
    // video loads, undercutting the sharpness we're trying to preserve.
    // preload="auto" + autoplay means the first real frame arrives fast.
    const mobileSrc = src === SITE_BACKGROUND_IMAGE ? SITE_BACKGROUND_VIDEO_MOBILE : null;
    const mobileSource = mobileSrc
      ? `<source src="${mobileSrc}" media="(max-width: 768px)" />`
      : "";
    visual = `
      <video autoplay muted loop playsinline preload="auto">
        ${mobileSource}
        <source src="${src}" />
      </video>
    `;
  } else if (src) {
    visual = `<img src="${src}" alt="" />`;
  } else {
    visual = `<div class="media__glow"><span></span><span></span><span></span></div>`;
  }

  container.innerHTML = `<div class="site-bg__layer media is-active">${visual}</div>`;

  if (isVideo) {
    const video = container.querySelector("video");
    // Pause while the tab is hidden — no point decoding frames no one sees.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) video.pause();
      else video.play().catch(() => {});
    });
  }
}
