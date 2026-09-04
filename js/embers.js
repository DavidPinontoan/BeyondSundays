/**
 * Ambient drifting embers — a canvas layer standing in for the "flickering
 * candle glow" ambiance from the original brief. Sparse, soft, additive
 * (mix-blend-mode: screen), and paused while the tab is hidden.
 */

(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.id = "embers-canvas";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let w, h, particles;

  // Mostly warm gold, with a few soft sage-green particles mixed in —
  // sunlight-through-leaves rather than pure candlelight.
  const COLORS = ["230, 184, 86", "230, 184, 86", "230, 184, 86", "156, 187, 142"];

  function makeParticle() {
    return {
      x: Math.random() * w,
      y: h + Math.random() * 100,
      r: 1 + Math.random() * 2.2,
      speed: 0.15 + Math.random() * 0.35,
      drift: (Math.random() - 0.5) * 0.3,
      alpha: 0.15 + Math.random() * 0.35,
      flicker: Math.random() * Math.PI * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  }

  function init() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    const count = Math.min(26, Math.floor((w * h) / 60000));
    particles = Array.from({ length: count }, makeParticle);
  }

  function tick() {
    if (!document.hidden) {
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => {
        p.y -= p.speed;
        p.x += p.drift;
        p.flicker += 0.02;
        if (p.y < -10) Object.assign(p, makeParticle(), { y: h + 10 });

        const a = p.alpha * (0.6 + 0.4 * Math.sin(p.flicker));
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        gradient.addColorStop(0, `rgba(${p.color}, ${a})`);
        gradient.addColorStop(1, `rgba(${p.color}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", init, { passive: true });
  init();
  requestAnimationFrame(tick);
})();
