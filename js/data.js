/**
 * Beyond Sundays — topic catalog.
 * Single source of truth for the browse grid and detail pages.
 * Swap in real copy, dates, and Zoom links whenever ready.
 *
 * `image`: path to a poster image once you have one (e.g. "assets/posters/value-of-the-bible.jpg").
 * Leave it null and the card shows a dark placeholder with a soft glow instead.
 */

const TOPICS = [
  {
    slug: "value-of-the-bible",
    day: "Monday",
    title: "Value of the Bible",
    tagline: "Why this book, and why now.",
    question: "Why does this book matter?",
    questions: [
      "What is God's plan for salvation?",
      "What makes the Bible different from any other book?",
      "How do we know it can be trusted?",
    ],
    description:
      "A short study on why the Bible matters, how it came together, and what it means to actually treat it as valuable rather than just familiar.",
    status: "now-showing",
    date: "2026-09-10T19:30:00",
    runtime: "30–45 min",
    genre: "Foundations",
    image: "assets/posters/value-of-the-bible.jpg",
  },
  {
    slug: "wise-investment",
    day: "Tuesday",
    title: "Wise Investment",
    tagline: "What you spend your life on.",
    question: "What are you spending your life on?",
    questions: [
      "Of the 24 hours in a day, how many am I giving to God?",
      "What does it mean to invest wisely, not just financially?",
      "What lasts, and what doesn't?",
    ],
    description:
      "A study on stewardship, priorities, and investing time, attention, and resources in what actually lasts.",
    status: "coming-soon",
    date: "2026-09-17T19:30:00",
    runtime: "30–45 min",
    genre: "Discipleship",
    image: "assets/posters/wise-investment.jpg",
  },
  {
    slug: "good-and-evil",
    day: "Wednesday",
    title: "Good and Evil",
    tagline: "The knowledge that changed everything.",
    question: "Where did good and evil begin?",
    questions: [
      "Did God create evil?",
      "Where did evil begin?",
      "How can I discern the two spirits?",
    ],
    description:
      "Tracing the idea of good and evil from the garden forward, and what it means for how we live now.",
    status: "coming-soon",
    date: "2026-09-24T19:30:00",
    runtime: "30–45 min",
    genre: "Origins",
    image: "assets/posters/good-and-evil.jpg",
  },
  {
    slug: "old-covenant",
    day: "Thursday",
    title: "Old Covenant",
    tagline: "The agreement that came first.",
    question: "What was the old covenant, really?",
    questions: [
      "How come the people didn't keep the covenant?",
      "How can I keep the covenant today?",
      "What did it prepare the way for?",
    ],
    description:
      "What the old covenant actually was, who it was for, and why it mattered enough to need a new one.",
    status: "coming-soon",
    date: "2026-10-01T19:30:00",
    runtime: "30–45 min",
    genre: "Covenant",
    image: "assets/posters/old-covenant.jpg",
  },
  {
    slug: "new-covenant",
    day: "Friday",
    title: "New Covenant",
    tagline: "But what is this new covenant?",
    question: "What is this new covenant, exactly?",
    questions: [
      "What changed at that last meal?",
      "How is this covenant different from the one before it?",
      "What does it ask of us now?",
    ],
    description:
      "The covenant established at the Last Supper, what changed, and what it asks of us now.",
    status: "coming-soon",
    date: "2026-10-08T19:30:00",
    runtime: "30–45 min",
    genre: "Covenant",
    image: "assets/posters/new-covenant.jpg",
  },
  {
    slug: "what-kind-of-era",
    day: "Saturday",
    title: "What Kind of Era Are We In?",
    tagline: "Reading the moment we're living in.",
    question: "What kind of era are we living in?",
    questions: [
      "How do I know when something has been fulfilled?",
      "What signs are worth paying attention to?",
      "Where might we sit in the larger story?",
    ],
    description:
      "A study on discerning the times, and where we might sit in the larger story still being told.",
    status: "coming-soon",
    date: "2026-10-15T19:30:00",
    runtime: "30–45 min",
    genre: "Discernment",
    image: "assets/posters/what-kind-of-era.jpg",
  },
];

function getTopicBySlug(slug) {
  return TOPICS.find((t) => t.slug === slug) || null;
}

function formatShowtime(isoString) {
  const d = new Date(isoString);
  const dateStr = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateStr} · ${timeStr}`;
}

function statusLabel(topic) {
  if (topic.status === "now-showing") return "Now Showing";
  return formatShowtime(topic.date);
}
