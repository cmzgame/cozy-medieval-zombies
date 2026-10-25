// The wobble (docs/02, "The wobble written in stone", 2026-10-12): a click on
// an interactable within reach stamps it, the renderer reads the stamp on the
// same clock and leans the thing for 560 ms, and anyone walking through a crop
// or a mushroom stamps it too, one round at a time. Written after a clock
// mismatch between the stamp (sim time) and the renderer (wall time) had
// switched every wobble off without any check noticing.
// From the console: await __game.check("sway")
// It pauses the loop, moves the player to a crop or a mushroom, and puts them back; a last row pokes at sim time 0 (the clock set by hand
// and put back), which is a stamp like any other.

import { swayOf, WIGGLE_MS } from "../../src/render/props.js";

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const px0 = G.player.gx;
  const py0 = G.player.gy;
  G.loop.setPaused(true);
  // A crop or a mushroom in a loaded chunk: interactable and walked through.
  let found = null;
  for (let r = 0; r < 40 && !found; r++) {
    for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = Math.round(px0) + dx;
      const y = Math.round(py0) + dy;
      const p = G.map.peekTile(x, y)?.prop;
      if (p && p.interactable && !p.solid && p.tile[0] === x && p.tile[1] === y && !G.assets.getDef(p.sprite).clickAnim) found = { p, x, y };
    }
  }
  if (!found) {
    G.loop.setPaused(wasPaused);
    return { rows: [{ check: "setup", result: "FAIL", detail: "no walk-through interactable within 40 tiles" }] };
  }
  const { p, x, y } = found;
  const step = () => G.loop.advance(1 / 60);
  const sim = () => G.loop.simTime() * 1000;
  try {
    // 1. The click. The player two tiles off, within reach; the screen point found by the same
    // pixel test a click uses, tried a few pixels up the picture.
    G.teleport(x, y + 2);
    step();
    p.pokedAt = undefined;
    const s = G.iso.toScreen(x, y);
    let hit = null;
    for (const up of [0, 4, 8, 12, 16, 20]) if (G.interact.interactableAt(s.x, s.y - up) === p) { hit = up; break; }
    row("the click finds the thing by its pixels", hit !== null, `${p.sprite} at ${x},${y}, hit ${hit} px above its tile centre`);
    if (hit !== null) {
      G.interact.pokeAt(s.x, s.y - hit, G.player);
      const stamped = p.pokedAt !== undefined && Math.abs(sim() - p.pokedAt) < 100;
      row("the click stamps it on the sim clock", stamped, `pokedAt ${p.pokedAt == null ? "unset" : Math.round(p.pokedAt)}, sim ${Math.round(sim())}`);
      // 2. The renderer leans it: nonzero inside the sway, zero after.
      let lean = 0;
      for (let i = 0; i < 12; i++) { step(); lean = Math.max(lean, Math.abs(swayOf(p, 40))); }
      row("the renderer leans it within the sway", lean > 0, `max lean ${lean} px in the first 200 ms (a clock mismatch gives 0)`);
      for (let i = 0; i < 40; i++) step();
      row("the lean is over after the sway", swayOf(p, 40) === 0, `lean ${swayOf(p, 40)} at ${Math.round(sim() - p.pokedAt)} ms, sway ${WIGGLE_MS}`);
      // 3. A second click inside the rest does not restamp.
      const first = p.pokedAt;
      G.interact.pokeAt(s.x, s.y - hit, G.player);
      step();
      G.interact.pokeAt(s.x, s.y - hit, G.player);
      row("a click while it rests does not restart it", p.pokedAt === first || p.pokedAt - first >= 560, `first ${Math.round(first)}, now ${Math.round(p.pokedAt)}`);
    }
    // 4. Walking through: a crossing stamps it once, standing still adds none, a slow
    // walk over it restamps only after a round.
    for (let i = 0; i < 40; i++) step();
    p.pokedAt = undefined;
    const stamps = [];
    const watch = () => { if (p.pokedAt != null && stamps[stamps.length - 1] !== p.pokedAt) stamps.push(p.pokedAt); };
    G.teleport(x - 1.2, y);
    step();
    for (let i = 0; i < 60; i++) { G.player.gx = x - 1.2 + i * (3 / 60); G.player.gy = y; step(); watch(); }
    row("walking through stamps it once", stamps.length === 1, `${stamps.length} stamps across the tile at 3 tiles a second`);
    const before = stamps.length;
    for (let i = 0; i < 60; i++) { step(); watch(); }
    row("standing still adds none", stamps.length === before, `${stamps.length - before} new stamps in a second`);
    G.player.gx = x - 0.45;
    step();
    for (let i = 0; i < 150; i++) { G.player.gx = x - 0.45 + i * (0.5 / 60); G.player.gy = y; step(); watch(); }
    const gaps = stamps.slice(1).map((v, i) => Math.round(v - stamps[i]));
    row("a slow walk restamps only after a round", gaps.length >= 1 && gaps.every((g) => g >= WIGGLE_MS), `gaps ${JSON.stringify(gaps)} ms at half a tile a second`);
  } finally {
    p.pokedAt = undefined;
    G.teleport(px0, py0);
    G.loop.setPaused(wasPaused);
  }
  // The beehive (#333): a drawn, solid skep that is interactable with no clickAnim, so a click sways it (it cannot be walked through, so only the click is tried).
  try {
    G.loop.setPaused(true);
    const hive = [...G.map.allProps()].find((q) => q.sprite === "beehive");
    if (!hive) rows.push({ check: "the beehive sways when clicked", result: "FAIL", detail: "no beehive on the map" });
    else {
      const [hx, hy] = hive.tile;
      G.teleport(hx, hy + 2);
      G.map.ensureAround(hx, hy, 3);
      G.loop.advance(1 / 60);
      hive.pokedAt = undefined;
      const def = G.assets.getDef("beehive");
      row("the beehive is interactable, has no clickAnim, and is a drawn sprite (not the dev box)", !!hive.interactable && !def.clickAnim && !def.placeholder, `interactable ${hive.interactable}, clickAnim ${def.clickAnim ? "yes" : "no"}, ${def.placeholder ? "dev box" : "drawn"}`);
      const s = G.iso.toScreen(hx, hy);
      let up = null;
      for (const u of [0, 4, 8, 12, 16, 20, 26]) if (G.interact.interactableAt(s.x, s.y - u) === hive) { up = u; break; }
      row("a click finds the hive by its pixels", up !== null, `${up} px above its tile`);
      if (up !== null) {
        G.interact.pokeAt(s.x, s.y - up, G.player);
        let lean = 0;
        for (let i = 0; i < 12; i++) { G.loop.advance(1 / 60); lean = Math.max(lean, Math.abs(swayOf(hive, 30))); }
        row("the click sways the hive, and it settles", hive.pokedAt !== undefined && lean > 0, `max lean ${lean} px, pokedAt ${hive.pokedAt == null ? "unset" : Math.round(hive.pokedAt)}`);
        for (let i = 0; i < 40; i++) G.loop.advance(1 / 60);
        row("the sway is over after its round", swayOf(hive, 30) === 0, `lean ${swayOf(hive, 30)}`);
      }
      hive.pokedAt = undefined;
    }
  } finally {
    G.teleport(px0, py0);
    G.loop.setPaused(wasPaused);
  }
  // A poke at sim time 0 (a never-stepped world): the stamp is 0, and it is a stamp: the thing sways and the rest holds (read as
  // `!pokedAt`, as until this check's row, it was none). The clock is set by hand, never stepped, and put back.
  const sim0 = G.loop.simTime();
  try {
    G.loop.setPaused(true);
    G.teleport(x, y + 2);
    G.loop.setSimTime(0);
    p.pokedAt = undefined;
    const took = G.interact.stampFromGuest(G.player, p.id, 0);
    const at = p.pokedAt;
    let lean = 0;
    for (let i = 1; i <= 12; i++) { G.loop.setSimTime(i / 60); lean = Math.max(lean, Math.abs(swayOf(p, 40))); }
    G.loop.setSimTime(0.25);
    G.interact.stampFromGuest(G.player, p.id, 0);
    const held = p.pokedAt === 0;
    row("a poke at sim time 0 is stamped 0, sways, and a second poke inside its rest does not restamp it", took && at === 0 && lean > 0 && held, `took ${took}, pokedAt ${at}, max lean ${lean} px, after the second poke ${p.pokedAt}`);
  } finally {
    p.pokedAt = undefined;
    G.loop.setSimTime(sim0);
    G.teleport(px0, py0);
    G.loop.setPaused(wasPaused);
  }
  const failed = rows.filter((r) => r.result === "FAIL").length;
  console.table(rows);
  return { rows, pass: rows.length - failed, fail: failed };
}
