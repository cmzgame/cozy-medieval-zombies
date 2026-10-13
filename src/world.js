// The world's own fields (docs/30 step 2; docs/31/08, habits 1, 2, and 6): the
// time scale the loop reads to decide how many fixed steps to run per real
// second (1 awake, more while someone sleeps, 0 will be pause), and the counter
// every prop and item entry takes its instance id from. Nothing here belongs to
// one player; a client's own state (a ghost, a draw) lives elsewhere.

import { emit } from "./events.js";

export const world = {
  timeScale: 1,
};

let counter = 0;

// A new instance id: "p12" for a prop, "e340" for an item entry. Per world,
// so a map saved and loaded continues its count (the save carries it).
export function nextId(prefix = "i") {
  return `${prefix}${++counter}`;
}

export function idCounter() {
  return counter;
}

export function setTimeScale(k) {
  if (world.timeScale === k) return;
  world.timeScale = k;
  emit("timeScale", { scale: k });
}

// A map loaded afresh: the counter continues from what it carries (0 for a fresh map).
export function reset(from = 0) {
  counter = from;
  world.timeScale = 1;
}
