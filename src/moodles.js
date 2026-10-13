// Copied from cozy-zombie-game src/moodles.js on 2026-10-10. Since: the infection and bleed moodles read from
// infection.js and bleed.js (docs/02 question 29b, 2026-10-12).
// Moodles: pictorial status icons for slow needs. Pure logic, no DOM.
// The rule: if you react to it within a second it is a bar; if you plan around
// it, it is a moodle (docs/00, pillar 7; docs/10).

import { stageOf as infectionStage } from "./infection.js";
import { stacks as bleedStacks } from "./bleed.js";

// Inline SVG placeholder glyphs, drawn in a 16×16 box with currentColor.
const GLYPHS = {
  // A bowl with a spoon.
  hunger: `<path d="M2 8h12a6 6 0 0 1-12 0z" fill="currentColor"/><path d="M10 7l3-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  // A virus: a ball with spikes (the infection marker, docs/02 question 29b).
  infection: `<circle cx="8" cy="8" r="3.6" fill="currentColor"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1M12.6 3.4l-2.1 2.1M5.5 10.5l-2.1 2.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  // A droplet.
  thirst: `<path d="M8 1.5c2.6 3.4 4.5 5.8 4.5 8.2a4.5 4.5 0 0 1-9 0c0-2.4 1.9-4.8 4.5-8.2z" fill="currentColor"/>`,
};

// Order here is display order. `stageOf` returns 0 (hidden) to stages.length.
export const MOODLES = [
  {
    id: "bleed",
    glyph: GLYPHS.thirst, // a drop, for now
    stages: [
      { name: "Bleeding", text: "A wound is open. A bandage will close it." },
      { name: "Bleeding badly", text: "Two wounds. It will not stop by itself soon." },
      { name: "Bleeding heavily", text: "Three. Your hands are slick. Bandage it." },
      { name: "Bleeding out", text: "You are losing blood fast. Bandage it now." },
    ],
    stageOf: (player) => Math.min(4, bleedStacks(player)),
  },
  {
    id: "infection",
    glyph: GLYPHS.infection,
    stages: [
      { name: "Bitten", text: "The bite broke the skin. You feel fine. Watch it." },
      { name: "Fevered", text: "A chill and a headache. It is spreading." },
      { name: "Sick", text: "Your hands shake. There is not much time." },
      { name: "Turning", text: "It has taken hold. (Nothing happens yet: a marker.)" },
    ],
    stageOf: (player) => infectionStage(player),
  },
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
// Every moodle, always (Michael, 2026-10-12: all showing, green when nothing is
// wrong); stage 0 is "fine" with the moodle's own name.
const FINE = { bleed: ["Not bleeding", "No open wound."], infection: ["Not bitten", "Nothing in your blood."], hunger: ["Fed", "You are not hungry."], thirst: ["Watered", "You are not thirsty."] };
export function activeMoodles(player) {
  const out = [];
  for (const m of MOODLES) {
    const stage = Math.min(m.stages.length, m.stageOf(player));
    if (stage <= 0) {
      const [name, text] = FINE[m.id] || [m.id, ""];
      out.push({ id: m.id, glyph: m.glyph, stage: 0, name, text });
    } else out.push({ id: m.id, glyph: m.glyph, stage, ...m.stages[stage - 1] });
  }
  return out;
}
