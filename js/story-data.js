/**
 * "The Story" — scrollytelling scenes.
 * Captions are original paraphrase, not scripture text. Citations are
 * referenced by number only, per copyright guidance — swap in final
 * teaching copy whenever ready.
 *
 * `image`: path to a real image once you have one (e.g. "assets/story/fall.jpg").
 * Leave it null and the scene shows a dark placeholder with a soft glow instead.
 */

const STORY_SCENES = [
  {
    id: "fall",
    era: "In the Beginning",
    title: "The Fall",
    image: null,
    caption:
      "In a garden with nothing missing, the first two people are given one boundary — and reach past it anyway. Innocence gives way to knowledge of good and evil, and the story of everything after begins here.",
    citation: "Genesis 3",
  },
  {
    id: "abraham",
    era: "A Promise Made",
    title: "The Time of Abraham",
    image: null,
    caption:
      "Centuries later, an old man is told to leave everything familiar and go — with only a promise to travel on. A covenant is cut under a night sky, and a family becomes the seed of something much larger.",
    citation: "Genesis 12; Genesis 15",
  },
  {
    id: "moses",
    era: "A People Set Free",
    title: "The Time of Moses",
    image: null,
    caption:
      "Generations on, Abraham's descendants are slaves in a foreign land. A reluctant shepherd is sent to confront an empire, and the sea itself opens a path out of bondage and into the wilderness.",
    citation: "Exodus 14",
  },
  {
    id: "canaan",
    era: "A Land Promised",
    title: "Entering Canaan",
    image: null,
    caption:
      "After forty years of wandering, a new generation stands at the edge of the land they were promised. Joshua and Caleb, the last of the faithful spies, lead the people across the threshold.",
    citation: "Joshua 1; Joshua 3",
  },
  {
    id: "solomon",
    era: "A Kingdom Divided",
    title: "Solomon's Fall",
    image: null,
    caption:
      "The wisest king Israel ever had turns, late in life, to the gods of the nations around him. The cracks he leaves behind will split the kingdom in two and open the door to the age of the prophets.",
    citation: "1 Kings 11",
  },
  {
    id: "prophets",
    era: "A Word Foretold",
    title: "The Prophets & Messianic Prophecy",
    image: null,
    caption:
      "Across centuries of division and exile, the prophets keep pointing forward — to a new thing coming, and to a child who will not be born the way anyone expects.",
    verses: [
      { ref: "Jeremiah 31:22", note: "A “new thing” is promised — a people formed not by ordinary bloodline, but by a spiritual seed." },
      { ref: "Isaiah 7:14", note: "A sign is given: the coming child will be born of a virgin." },
      { ref: "Matthew 1:18–23", note: "The prophecy is fulfilled — Jesus is born of Mary." },
    ],
  },
  {
    id: "ministry",
    era: "A Ministry Begins",
    title: "The Ministry of Jesus",
    image: null,
    caption:
      "The promised child grows up and steps into public life, calling ordinary people away from their nets and their tables to follow him. Twelve of them become his closest students.",
    citation: "Matthew 4:18–22; Luke 6:12–16",
  },
  {
    id: "persecution",
    era: "A Growing Threat",
    title: "Persecution & Crucifixion",
    image: null,
    caption:
      "As his teaching draws crowds, it also draws opposition — the religious leaders of the day see him as a threat to be dealt with. Their pressure ends in a trial, and a cross.",
    citation: "Matthew 26–27; John 19",
  },
  {
    id: "new-covenant",
    era: "A New Agreement",
    title: "The New Covenant",
    image: null,
    caption:
      "At a final meal with his closest friends, Jesus takes bread and wine and reframes them entirely — no longer just a meal, but the sign of an agreement that replaces everything that came before.",
    citation: "Luke 22:14–20",
    teaser: {
      text: "But what is this new covenant, exactly?",
      href: "topic.html?slug=new-covenant",
      label: "Explore the study →",
    },
  },
  {
    id: "revelation",
    era: "What's Still to Come",
    title: "Mysteries of Revelation",
    image: null,
    caption:
      "The story doesn't end at the cross. Centuries later, a vision on a small island describes symbols still being unpacked today — stars, trumpets, and a mystery yet to be finished.",
    verses: [
      { ref: "Revelation 1:20", note: "The mystery of the seven stars and the seven golden lampstands." },
      { ref: "Revelation 10:7", note: "A mystery said to be finished at the sound of the seventh trumpet." },
      { ref: "Revelation 17:5–7", note: "The mystery of Babylon, and the beast with seven heads and ten horns." },
    ],
  },
];
