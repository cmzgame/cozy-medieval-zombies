// The maps the game ships (Michael, 2026-10-28: "a map loader from the website interface"): data/maps.json lists them, each with the display
// name its map file carries (`tools/validate-data.py` holds the two equal), whether it is for play or a tool for the work, and a line
// about it. The page reads ONE map, at boot, from `?map=<id>` (main.js); this module is the list the interface offers (the new-world
// step's choice, the Worlds screen's names, the pause menu's line) and the one place that builds the address a map change goes to.
// A map change is a reload onto `?map=<id>`: the map is read at boot, so a reload is the honest mechanism. What the reload is to do on
// arrival (play a world, make one, join one) is a hand-off, below.

let list = [];

// The data/maps.json object: { id: { name, kind: "play" | "test", blurb } }, in the order the file lists them.
export function load(json) {
  list = Object.entries(json || {}).map(([id, m]) => ({ id, name: String(m.name || id), kind: m.kind === "test" ? "test" : "play", blurb: String(m.blurb || "") }));
}

// Every map: the maps for play first, then the test maps, each group in the file's order.
export function all() {
  return [...list.filter((m) => m.kind === "play"), ...list.filter((m) => m.kind === "test")];
}

export function get(id) {
  return list.find((m) => m.id === id) || null;
}

// A map's name for the interface: its display name, else the id (a world saved on a map this build lacks).
export function nameOf(id) {
  const m = get(id);
  return m ? m.name : String(id || "");
}

// Whether `id` is a map this build ships (a plain id, never a path).
export function exists(id) {
  return /^[a-z][a-z0-9_-]{0,31}$/.test(String(id)) && !!get(id);
}

// The address of this page on another map: the same page and the same query (the test switches `nosave`, `mute`, `relay`, ... stay), with `map`
// set, the old hand-off marks cleared, and the new one added. `handoff`: { world: id } plays that world on arrival (the id is no secret),
// or { make: 1 } / { rejoin: 1 } name a hand-off the page kept in sessionStorage (main.js `HANDOFF_KEY`), for what holds a choice and a secret.
export function addressFor(location, id, handoff = {}) {
  const q = new URLSearchParams(location.search);
  for (const k of ["world", "make", "rejoin", "jumped"]) q.delete(k);
  q.set("map", id);
  for (const [k, v] of Object.entries(handoff)) q.set(k, String(v));
  return `${location.pathname}?${q.toString()}${location.hash || ""}`;
}
