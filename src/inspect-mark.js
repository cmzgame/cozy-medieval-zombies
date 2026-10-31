// The tile an Inspect marks (Michael, 2026-10-19): a crop's patch outlined on the ground while its card shows (ui/inspect-card.js), so the patch spoken of is
// plain among its neighbours. This client's view alone, as the message it goes with: never the world's, never sent, never saved. Its
// time is the page's clock (performance.now), since it only fades a picture; nothing in the step reads it.

const SHOW_MS = 6000; // a mark with no card's time

let current = null; // { tiles, until, layer }

// `ms` how long it shows: the Inspect card's (ui/inspect-card.js) is Infinity, until the card is closed (clear). `layer` the storey the marked
// thing stands on: the mark is drawn on that floor (docs/53 step 4's leftover, 2026-10-31), the ground's by default.
export function mark(tiles, ms = SHOW_MS, layer = 0) {
  current = { tiles: tiles.map(([x, y]) => [x, y]), until: performance.now() + ms, layer };
}

// The marked tiles, their storey, and how much of the mark is left (1 to 0, fading over its last second), or null.
export function marked(now = performance.now()) {
  if (!current || now >= current.until) {
    current = null;
    return null;
  }
  return { tiles: current.tiles, layer: current.layer || 0, alpha: Math.min(1, (current.until - now) / 1000) };
}

export function clear() {
  current = null;
}
