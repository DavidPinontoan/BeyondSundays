/**
 * "The Story" — renders scenes from STORY_SCENES and wires up the
 * progress-rail dots. The scroll reveal itself is set up by
 * js/site-motion.js (GSAP + ScrollTrigger) once these elements exist —
 * see the .scene ScrollTrigger block there.
 */

function sceneHTML(scene, index) {
  const verses = scene.verses
    ? `<ul class="scene__verses">${scene.verses
        .map((v) => `<li><strong>${v.ref}</strong><p>${v.note}</p></li>`)
        .join("")}</ul>`
    : `<p class="scene__citation">${scene.citation}</p>`;

  const teaser = scene.teaser
    ? `<div class="scene__teaser">
         <p>${scene.teaser.text}</p>
         <a href="${scene.teaser.href}" class="btn btn--gold">${scene.teaser.label}</a>
       </div>`
    : "";

  return `
    <section class="scene" id="scene-${scene.id}" data-index="${index}">
      <span class="scene__era">${scene.era}</span>
      <div class="scene__visual media">${mediaHTML(scene)}</div>
      <h2 class="scene__title">${scene.title}</h2>
      <p class="scene__caption">${scene.caption}</p>
      ${verses}
      ${teaser}
    </section>
  `;
}

function renderStory() {
  const book = document.getElementById("book");
  book.innerHTML = STORY_SCENES.map(sceneHTML).join("");

  const rail = document.getElementById("storyRail");
  rail.innerHTML = STORY_SCENES.map(
    (scene, i) =>
      `<button data-index="${i}" title="${scene.title}" aria-label="Jump to ${scene.title}"></button>`
  ).join("");

  const scenes = Array.from(document.querySelectorAll(".scene"));
  const dots = Array.from(rail.querySelectorAll("button"));

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const target = scenes[Number(dot.dataset.index)];
      if (window.lenis) {
        window.lenis.scrollTo(target, { offset: -40 });
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  });
}
