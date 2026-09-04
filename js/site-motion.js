/**
 * Site-wide scroll motion, built on GSAP + ScrollTrigger + SplitText
 * (100% free as of Webflow's 2025 GSAP acquisition) with Lenis driving
 * the smooth-scroll feel underneath. Self-initializes against whichever
 * elements exist on the current page — no per-page wiring needed beyond
 * including the script tags.
 *
 * Respects prefers-reduced-motion: Lenis/ScrollTrigger never spin up and
 * every element is set straight to its resting, fully-visible state.
 */

(function () {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  gsap.registerPlugin(ScrollTrigger, SplitText);

  if (!reduced) {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    window.lenis = lenis;
  }

  // ---------- Hero: split-letter title fall ----------
  const heroTitle = document.getElementById("heroTitle");
  const hero = document.getElementById("hero");
  if (heroTitle && hero) {
    if (reduced) {
      heroTitle.style.opacity = "1";
    } else {
      const split = new SplitText(heroTitle, { type: "words,chars" });
      gsap.set(split.chars, { transformOrigin: "50% 100%" });
      gsap.to(split.chars, {
        yPercent: 140,
        opacity: 0,
        scaleY: 0.55,
        stagger: { each: 0.028, from: "start" },
        ease: "power1.in",
        scrollTrigger: {
          trigger: hero,
          start: "top top",
          end: "+=55%",
          scrub: 0.6,
        },
      });
    }
  }

  // ---------- Generic reveal-on-scroll (cards, panels, stage panel) ----------
  function initReveals(selector, { fromVars = {}, stagger = 0.07 } = {}) {
    const els = gsap.utils.toArray(selector);
    if (!els.length) return;

    if (reduced) {
      els.forEach((el) => gsap.set(el, { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }));
      return;
    }

    els.forEach((el, i) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 26, scale: 0.96, filter: "blur(14px)", ...fromVars },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.9,
          ease: "power3.out",
          delay: (i % 6) * stagger,
          scrollTrigger: { trigger: el, start: "top 88%" },
        }
      );
    });
  }

  initReveals(".reveal");
  initReveals(".stage-panel", { fromVars: { y: 56, filter: "blur(0px)" }, stagger: 0 });

  // ---------- Story page: clean scroll-scrubbed fade + drift ----------
  // Deliberately flat — no rotation or perspective, just opacity and a
  // gentle vertical settle as each scene nears the center of the viewport.
  const storyScenes = gsap.utils.toArray(".scene");
  const storyDots = gsap.utils.toArray(".story-rail button");
  if (storyScenes.length) {
    if (reduced) {
      storyScenes.forEach((s) => gsap.set(s, { opacity: 1, y: 0 }));
      if (storyDots[0]) storyDots[0].classList.add("is-active");
    } else {
      const focusByIndex = new Array(storyScenes.length).fill(0);

      storyScenes.forEach((scene, i) => {
        ScrollTrigger.create({
          trigger: scene,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
          onUpdate: (self) => {
            const focus = gsap.utils.clamp(0, 1, 1 - Math.abs(self.progress - 0.5) * 2.2);
            const isAbove = self.progress > 0.5;
            gsap.set(scene, {
              opacity: 0.15 + focus * 0.85,
              y: (1 - focus) * (isAbove ? -24 : 24),
            });
            focusByIndex[i] = focus;
          },
        });
      });

      ScrollTrigger.create({
        trigger: document.body,
        start: "top top",
        end: "bottom bottom",
        onUpdate: () => {
          let bestIndex = 0;
          let bestFocus = -1;
          focusByIndex.forEach((f, i) => {
            if (f > bestFocus) {
              bestFocus = f;
              bestIndex = i;
            }
          });
          storyDots.forEach((d, i) => d.classList.toggle("is-active", i === bestIndex));
        },
      });
    }
  }
})();
