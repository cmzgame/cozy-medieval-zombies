// The debuffs' icons (#308): placeholder dev art in the skill icons' style (16 by 16, a few shapes and a dark outline), drawn once at first use with Canvas 2D like the rest of the
// placeholder art, so a delivered picture can replace each through the same interface later. Bleeding is a red drop.

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
};

export const ICON_SIZE = SIZE;
export const debuffIds = () => Object.keys(DRAW);
export function debuffIconURL(id) {
  return iconURL(`debuff:${id}`, DRAW[id]);
}
