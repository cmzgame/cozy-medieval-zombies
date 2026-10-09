// Copied from cozy-zombie-game src/moodles.js on 2026-10-10. Unchanged.
// Moodles: pictorial status icons for slow needs. Pure logic, no DOM.
// The rule: if you react to it within a second it is a bar; if you plan around
// it, it is a moodle (docs/00, pillar 7; docs/10).

// Inline SVG placeholder glyphs, drawn in a 16×16 box with currentColor.
const GLYPHS = {
  // A bowl with a spoon.
  hunger: `<path d="M2 8h12a6 6 0 0 1-12 0z" fill="currentColor"/><path d="M10 7l3-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  // A droplet.
  thirst: `<path d="M8 1.5c2.6 3.4 4.5 5.8 4.5 8.2a4.5 4.5 0 0 1-9 0c0-2.4 1.9-4.8 4.5-8.2z" fill="currentColor"/>`,
};

// Order here is display order. `stageOf` returns 0 (hidden) to stages.length.
export const MOODLES = [
  {
    id: "hunger",
    glyph: GLYPHS.hunger,
    stages: [
      { name: "Peckish", text: "Could eat." },
      { name: "Hungry", text: "Your stomach is making itself heard." },
      { name: "Very hungry", text: "Hard to think about anything but food." },
      { name: "Starving", text: "You are wasting away. Eat something." },
    ],
    stageOf(player) {
      if (player.hunger <= 0) return 4;
      if (player.hunger < 15) return 3;
      if (player.hunger < 35) return 2;
      if (player.hunger < 60) return 1;
      return 0;
    },
  },
  {
    id: "thirst",
    glyph: GLYPHS.thirst,
    stages: [
      { name: "Slightly thirsty", text: "A drink would be nice." },
      { name: "Thirsty", text: "Your mouth is dry." },
      { name: "Parched", text: "Hard to catch your breath. Stamina recovers slowly." },
      { name: "Dying of thirst", text: "You will not last long without water." },
    ],
    stageOf(player) {
      if (player.thirst <= 0) return 4;
      if (player.thirst < 15) return 3;
      if (player.thirst < 35) return 2;
      if (player.thirst < 60) return 1;
      return 0;
    },
  },
];

// [{ id, glyph, stage, name, text }] for every moodle currently showing.
export function activeMoodles(player) {
  const out = [];
  for (const m of MOODLES) {
    const stage = Math.min(m.stages.length, m.stageOf(player));
    if (stage <= 0) continue;
    out.push({ id: m.id, glyph: m.glyph, stage, ...m.stages[stage - 1] });
  }
  return out;
}
