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
 * On phones, the video is swapped out entirely for a full-resolution still
 * frame (SITE_BACKGROUND_STILL_MOBILE) instead of a smaller video file —
 * some mobile browsers (notably iOS Safari, on cellular or Low Power Mode)
 * refuse to autoplay even a muted/playsinline video and show a tap-to-play
 * control instead, which a background layer can't offer. A still avoids
 * that entirely while looking identical to a paused frame of the video.
 */

const SITE_BACKGROUND_IMAGE = "assets/backgrounds/landscape.mp4";
const SITE_BACKGROUND_STILL_MOBILE = "assets/backgrounds/landscape-still.jpg";
const MOBILE_BREAKPOINT = "(max-width: 768px)";

function renderSiteBackgrounds(path) {
  const container = document.getElementById("siteBg");
  if (!container) return;

  const src = path || SITE_BACKGROUND_IMAGE;
  const isVideo = /\.(mp4|mov|webm)$/i.test(src || "");
  const isMobile = window.matchMedia(MOBILE_BREAKPOINT).matches;

  let visual;
  if (isVideo && src === SITE_BACKGROUND_IMAGE && isMobile) {
    visual = `<img src="${SITE_BACKGROUND_STILL_MOBILE}" alt="" />`;
  } else if (isVideo) {
    // No `poster` — it would be a lower-resolution still shown while the
    // video loads, undercutting the sharpness we're trying to preserve.
    // preload="auto" + autoplay means the first real frame arrives fast.
    visual = `
      <video autoplay muted loop playsinline preload="auto">
        <source src="${src}" />
      </video>
    `;
  } else if (src) {
    visual = `<img src="${src}" alt="" />`;
  } else {
    visual = `<div class="media__glow"><span></span><span></span><span></span></div>`;
  }

  container.innerHTML = `<div class="site-bg__layer media is-active">${visual}</div>`;

  const video = container.querySelector("video");
  if (video) {
    // Pause while the tab is hidden — no point decoding frames no one sees.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) video.pause();
      else video.play().catch(() => {});
    });
  }
}
