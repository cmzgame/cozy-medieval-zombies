// The debuffs' icons (#308): placeholder dev art in the skill icons' style (16 by 16, a few shapes and a dark outline), drawn once at first use with Canvas 2D like the rest of the
// placeholder art, so a delivered picture can replace each through the same interface later. Bleeding is a red drop, Sick a green face.

import { iconURL, SIZE } from "./skill-icons.js";

const DRAW = {
  bleed(b) {
    const red = "#c8283c";
    b.rect(8, 2, 8, 3, red); // the point of the drop
    b.rect(7, 4, 9, 5, red);
    b.rect(6, 6, 10, 7, red);
    b.disc(8, 10, 4, red); // the body
    b.put(6, 9, "#ff9aa6"); // the light on it
    b.put(6, 10, "#ff9aa6");
    b.put(7, 8, "#ff9aa6");
    b.put(10, 12, "#8a1428"); // the shade
    b.put(9, 13, "#8a1428");
  },
  sick(b) {
    const green = "#8fb04a"; // a queasy green face, its mouth a wave (docs/44: Sick, from tainted water)
    b.disc(8, 8, 6, green);
    b.put(5, 5, "#c4dc84"); // the light on it
    b.put(6, 4, "#c4dc84");
    b.rect(5, 6, 6, 7, "#2a3418"); // the eyes, screwed up
    b.rect(10, 6, 11, 7, "#2a3418");
    b.put(5, 11, "#2a3418"); // the mouth's wave
    b.put(6, 10, "#2a3418");
    b.put(7, 11, "#2a3418");
    b.put(8, 10, "#2a3418");
    b.put(9, 11, "#2a3418");
    b.put(10, 10, "#2a3418");
    b.put(11, 11, "#2a3418");
    b.put(12, 12, "#5a7428"); // the shade
    b.put(11, 13, "#5a7428");
  },
};

export const ICON_SIZE = SIZE;
export const debuffIds = () => Object.keys(DRAW);
export function debuffIconURL(id) {
  return iconURL(`debuff:${id}`, DRAW[id]);
}
