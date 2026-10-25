// Headless checks of the pure modules (docs/23a, section H), under plain Node:
//   node tools/check.js
// What needs the browser (the map, the rooms, the renderer) is checked in the
// pane from tools/checks/ through window.__game.check(name).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const results = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail ?? "" });
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const rng = await import("../src/rng.js");
const clock = await import("../src/clock.js");
const bleed = await import("../src/bleed.js");
const infection = await import("../src/infection.js");
const items = await import("../src/items.js");
const pathfind = await import("../src/pathfind.js");

check("rng: the same seed gives the same sequence", () => {
  rng.seed(7);
  const a = Array.from({ length: 1000 }, () => rng.float());
  rng.seed(7);
  const b = Array.from({ length: 1000 }, () => rng.float());
  assert(a.every((v, i) => v === b[i]), "sequences differ");
  rng.seed(8);
  const c = Array.from({ length: 1000 }, () => rng.float());
  assert(a.some((v, i) => v !== c[i]), "two seeds gave one sequence");
  assert(a.every((v) => v >= 0 && v < 1), "a float outside 0..1");
  for (let i = 0; i < 1000; i++) {
    const n = rng.int(6);
    assert(n >= 0 && n < 6 && Number.isInteger(n), `int(6) gave ${n}`);
  }
  return `1000 floats, mean ${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(3)}`;
});

check("clock: an hour set is the hour read", () => {
  clock.reset();
  for (const h of [0, 6.5, 12, 23]) {
    clock.setHour(h);
    assert(Math.abs(clock.getHour() - h) < 1e-6, `set ${h}, read ${clock.getHour()}`);
  }
  assert(clock.getBrightness() > 0 && clock.getBrightness() <= 1, "brightness outside 0..1");
});

check("bleed and infection: a bite rolls against its chance, nothing on zero damage", () => {
  const combat = read("data/combat.json");
  if (combat.bleed) bleed.setBleedData(combat.bleed);
  if (combat.infection) infection.setInfectionData(combat.infection);
  const fresh = () => ({ hp: 100, dead: false, infection: null, bleed: null });
  assert(bleed.onBite(fresh(), 0, 0) === false, "a bite of zero damage bled");
  assert(bleed.onBite(fresh(), 8, 0) === true, "a roll of 0 did not bleed");
  assert(bleed.onBite(fresh(), 8, 0.999) === false, "a roll of 0.999 bled");
  assert(infection.onBite(fresh(), 8, 0) === true, "a roll of 0 did not infect");
  assert(infection.onBite(fresh(), 8, 0.999) === false, "a roll of 0.999 infected");
});

check("loot: a table rolled under one seed is the same table rolled again", () => {
  items.loadItems(read("data/items.json"));
  items.loadLoot(read("data/loot.json"));
  rng.seed(3);
  const a = JSON.stringify(Array.from({ length: 20 }, () => items.rollLoot("chest")));
  rng.seed(3);
  const b = JSON.stringify(Array.from({ length: 20 }, () => items.rollLoot("chest")));
  assert(a === b, "two rolls under one seed differ");
  rng.seed(4);
  const c = JSON.stringify(Array.from({ length: 20 }, () => items.rollLoot("chest")));
  assert(a !== c, "two seeds rolled the same chests");
  return `${JSON.parse(a).flat().length} items over 20 chests`;
});

check("pathfind: a path round a wall, none through it", () => {
  // A wall along x = 5 from y = 0 to 8 with a gap at y = 9; canStep refuses crossing it.
  const canStep = (x, y, nx, ny) => {
    if (nx < 0 || ny < 0 || nx > 12 || ny > 12) return false;
    if ((x < 5 && nx >= 5) || (x >= 5 && nx < 5)) return Math.max(y, ny) >= 9 && Math.min(y, ny) >= 9;
    return true;
  };
  const path = pathfind.findPath([2, 2], [9, 2], canStep, 1500);
  assert(path && path.length, "no path found");
  assert(path.some(([, y]) => y >= 9), "the path went through the wall");
  const none = pathfind.findPath([2, 2], [9, 2], (x, y, nx, ny) => nx !== 5 && ny >= 0 && nx >= 0, 200);
  assert(!none || none.length === 0, "a path was found where none exists");
  return `${path.length} tiles round the wall`;
});

check("a bite lands with no page behind the world (the host's rules in the world; item 5's first step)", () => {
  const out = execFileSync(process.execPath, [path.join(root, "tools/world.js"), "valley", "600", "--bite"], { encoding: "utf8" });
  const m = out.match(/bite: hp ([\d.]+) to ([\d.]+)/);
  assert(m, `no bite line in: ${out.slice(-200)}`);
  assert(Number(m[2]) < Number(m[1]), `health ${m[1]} to ${m[2]}: no bite landed`);
  return `health ${m[1]} to ${m[2]} in 600 steps`;
});

check("a save from its cache is the world made afresh, character for character (2026-10-15, a save that costs what changed)", () => {
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(root, "tools/savecache.js")], { encoding: "utf8" });
  } catch (err) {
    throw new Error(((err.stdout || "") + (err.stderr || "")).trim().split(/\r?\n/).slice(-3).join(" ") || err.message);
  }
  const m = out.match(/savecache: (\d+) kinds of change, (\d+) comparisons/);
  const t = out.match(/afresh ([\d.]+) ms, cached text ([\d.]+) ms/);
  assert(m && t, `no result line in: ${out.slice(-200)}`);
  return `${m[1]} kinds of change, a change with no mark caught; afresh ${t[1]} ms, cached ${t[2]} ms`;
});

const save = await import("../src/save.js");
const rulesMod = await import("../src/rules.js");
check("the save's version is 3 and a version-1 save is upgraded with the rules and an empty chart (item 5's second step; #203)", () => {
  assert(save.VERSION === 3, `VERSION ${save.VERSION}`);
  const up = save.upgrade({ version: 1, map: {}, characters: {} });
  assert(up && up.version === 3 && up.rules && up.chart && up.chart.chunks.length === 0, "a version-1 save was not upgraded");
  for (const k of Object.keys(rulesMod.rules)) assert(up.rules[k] === rulesMod.DEFAULTS[k], `${k} not the default`);
  assert(save.upgrade({ version: 4, map: {}, characters: {} }) === null, "a newer save was not refused");
  assert(save.upgrade({ map: {} }) === null, "a save with no version was not refused");
  const kept = save.upgrade({ version: 2, map: {}, characters: {}, rules: { survival: true } });
  assert(kept.rules.survival === true, "a version-2 save's rules were touched");
  return `multiHit ${up.rules.multiHit}, survival ${up.rules.survival}; a newer or unversioned save refused`;
});

// The doors of every authored map stand clear (#134): the dead who want a room go for its door and must be able to stand
// beside it, so no prop stands on either tile of a door (a chair just past a partition door once left a window the only
// way in, and a window is never one). The generator (tools/mapgen/valley.py) keeps to it; this is the proof.
const { bootData } = await import("../server/boot.js");
await import("../src/net.js");
const mapMod = await import("../src/map.js");
const gameMod = await import("../src/game.js");
const kitModule = await import("../src/kit.js");
const worldMod = await import("../src/world.js");
const chartModule = await import("../src/chart.js");
const floatersMod = await import("../src/floaters.js");
const itemInfoMod = await import("../src/item-info.js");
const smallTextMod = await import("../src/ui/small-text.js");
const rugsImport = await import("../src/rugs.js");
const woodsImport = await import("../src/woods.js");
const placementImport = await import("../src/placement.js");
const rulesImport = await import("../src/rules.js");
const inventoryMod = await import("../src/inventory.js");
const itemsMod = await import("../src/items.js");
const playerMod = await import("../src/entities/player.js");
const verbsMod = await import("../src/verbs.js");
const netsmoothTool = await import("./netsmooth.js");
const { lineOfSight } = await import("../src/visibility.js");
const { getDef } = await import("../src/assets.js");
const stationsMod = await import("../src/stations.js");
await bootData(root);
// The sync hash (game.syncParts) and what the wire promises: a board struck short of a break changes nothing a guest sees, so the map
// part must not move; a board broken is carried (the chunk is touched), so it must (the review of #185, #189).
check("sync: a board struck short of a break leaves the map hash, a broken one moves it", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const j = read("data/maps/valley.json");
  const [bx, by, bw, bh] = j.bounds;
  const C = mapMod.CHUNK;
  for (let cy = Math.floor(by / C); cy <= Math.floor((by + bh) / C); cy++) for (let cx = Math.floor(bx / C); cx <= Math.floor((bx + bw) / C); cx++) mapMod.getChunk(cx, cy, true);
  let door = null;
  for (let y = by; y < by + bh && !door; y++) for (let x = bx; x < bx + bw && !door; x++) { const w = mapMod.tileAt(x, y).n; if (w && w.kind === "door" && !w.broken && !mapMod.isFence(w)) door = w; } // a house door: a gate takes no boards (2026-10-24)
  assert(door, "no door in the valley");
  mapMod.addBoard(door, 1);
  const map0 = gameMod.syncParts().map;
  mapMod.damageOpening(door, 1, 1);
  const struck = gameMod.syncParts().map;
  assert(struck === map0, "a board struck short of a break moved the map hash");
  let broke = null;
  for (let i = 0; i < 100 && !broke; i++) broke = mapMod.damageOpening(door, 1, 10);
  assert(broke === "board", `the board did not break (${broke})`);
  assert(gameMod.syncParts().map !== map0, "a broken board did not move the map hash");
  return "struck: same; broken: moved";
});
// The starting kit (#136) against the real grid, not the validator's area count: the default kit fits the sack and the Developer Bag
// by placement, and asking leaves the id counter where it was (the world's count is part of its hash).
check("kit: the default kit fits the sack and the dev bag by placement, and asking moves no id", () => {
  const kitMod = kitModule;
  const before = worldMod.idCounter();
  const sack = kitMod.problem("");
  const dev = kitMod.problem("", true);
  assert(sack === "" && dev === "", `the default kit does not fit: sack "${sack}", dev bag "${dev}"`);
  assert(worldMod.idCounter() === before, "kit.problem moved the id counter");
  assert(kitMod.problem("apple 1e1") !== "" && kitMod.problem("apple 0x10") !== "", "a count of 1e1 or 0x10 was taken");
  return "sack and dev bag fit; no id taken";
});
// Remote bodies on a guest move evenly whatever the frames' arrival (#248): steady, alternating early and late, random, and a long stall, each against the old smoothing.
check("net: a remote body is drawn evenly between the host's frames whatever their arrival (no stopped steps, a spread under 0.2 a step)", () => {
  const m = netsmoothTool.measure();
  const lines = [];
  for (const [p, r] of Object.entries(m)) {
    assert(r.now.still === 0 && r.now.move.sd < 0.2, `${p}: stood still ${r.now.still} steps, spread ${r.now.move.sd.toFixed(2)}`);
    lines.push(`${p.slice(0, 14)} ${r.old.still} stopped steps to ${r.now.still}`);
  }
  assert(m["alternating 2 and 4 steps apart"].old.still > 50, "the old smoothing no longer stops on a late frame: the measurement is not measuring it");
  return lines.join("; ");
});
// The dead and the villagers come as a delta, a record only when it changed: a body that stops is drawn where it stopped and one that sets off from a rest moves at once
// (#249's review: it was drawn up to two steps past its stop for good, and set off after a rest in a lurch).
check("net: a body that walks, stands, and walks again (a record only when it moved) is drawn on its truth at rest and sets off evenly", () => {
  const d = netsmoothTool.measureDelta(true);
  const without = netsmoothTool.measureDelta(false);
  assert(d.restOffset < 1e-9, `a standing body is drawn ${d.restOffset.toFixed(3)} tiles off the host's truth`);
  assert(d.start.slice(0, 6).every((x) => x > 0.9 && x < 1.1), `it set off ${d.start.slice(0, 6).map((x) => x.toFixed(2)).join(" ")} (1 is steady)`);
  assert(without.restOffset > 0.05, "without hold the offset at rest is gone: the measurement is not measuring it");
  return `at rest 0 off (0.10 without hold); the first steps ${d.start.slice(0, 4).map((x) => x.toFixed(2)).join(" ")}`;
});
// Rugs (#327): a rug laid from the bag is a prop in the tile's own rug slot (never blocking, furniture over it), in the chunk's record and the sync hash, restored from a record, and Pick up
// gives the item back; refused over another rug and under furniture. (The drawing, the ghost, and the guest's two tabs are `check("decor")`'s, in the pane.)
check("rugs: laid from the bag into the rug slot, in the record and the sync hash, restored; refused over a rug and under furniture; picked up", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  const rugsMod = rugsImport;
  const bag = inventoryMod.bagOf(me);
  bag.items.length = 0;
  const e = itemsMod.makeEntry("rug_bearskin", 1);
  inventoryMod.stow(me, e);
  let at = null;
  mapMod.ensureAround(me.gx, me.gy, 3);
  for (let dy = -12; dy <= 12 && !at; dy++) for (let dx = -12; dx <= 12 && !at; dx++) {
    const x = Math.round(me.gx) + dx;
    const y = Math.round(me.gy) + dy;
    let ok = true;
    for (let ay = -1; ay < 5 && ok; ay++) for (let ax = -1; ax < 4 && ok; ax++) { const t = mapMod.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.rug && !t.n && !t.w; }
    if (ok) at = [x, y];
  }
  assert(at, "no bare grass");
  const [x, y] = at;
  me.gx = x + 1;
  me.gy = y + 1;
  const before = gameMod.syncParts().map;
  assert(rugsMod.placeRug(me, e.uid, x, y, "y"), "the rug was not laid");
  const rug = mapMod.peekTile(x, y).rug;
  assert(rug && rug.solid === false && rug.tiles.length === 6 && rug.rugItem === "rug_bearskin" && !mapMod.peekTile(x, y).prop && bag.items.length === 0, "the laid rug is not a rug in the rug slot, or the item stayed in the bag");
  assert(mapMod.isWalkableTile(x, y), "the rug blocks a step");
  assert(gameMod.syncParts().map !== before, "a laid rug did not move the sync hash");
  assert(rugsMod.fitProblem("rug_bearskin", "y", x + 1, y + 1) === "A rug is already there", "a rug was allowed over another");
  const chest = mapMod.createProp({ sprite: "chest", tile: [x, y] });
  mapMod.placeProp(chest, x, y);
  assert(mapMod.peekTile(x, y).rug === rug && mapMod.peekTile(x, y).prop === chest, "furniture did not stand on the rug");
  assert(rugsMod.pickUpProblem(rug) === "Move the chest off it first." && rugsMod.pickUp(me, rug) === false && mapMod.peekTile(x, y).rug === rug, "Pick up was not refused under furniture");
  mapMod.removeProp(chest);
  const C = mapMod.CHUNK;
  const rec = JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(Math.floor(x / C), Math.floor(y / C), false))));
  assert(rec.props.some((p) => p.sprite === "rug_bearskin" && p.rugItem === "rug_bearskin" && p.solid === false), "the chunk's record does not carry the rug");
  mapMod.installChunk(rec);
  for (const p of rec.props) mapMod.installProp(p);
  const back = mapMod.peekTile(x, y).rug;
  assert(back && back.rugItem === "rug_bearskin" && back.tiles.every(([tx, ty]) => mapMod.peekTile(tx, ty).rug === back), "the rug did not come back from its record");
  assert(rugsMod.pickUp(me, back) === true && !mapMod.peekTile(x, y).rug && bag.items.some((q) => q.id === "rug_bearskin"), "Pick up did not give the item back");
  return "laid, in the record and the hash, over by a chest, restored, picked up";
});
// Paintings (#326): a painting hung from the bag is state on a wall segment (a wide one a holder and a cover), in the chunk's record and the sync hash, restored from a record; Pick up
// gives the item back (from either segment of a wide one, once); refused on a door, a window, a hung segment, past a post, off the end of a wall; a wall taken down or a door built over it drops
// the painting as an item, whole. (The drawing, the ghost, and the guest's two tabs are `check("paintings")`'s, in the pane.)
const paintingsImport = await import("../src/paintings.js");
check("paintings: hung from the bag onto a wall's face, in the record and the sync hash, restored; refused on openings and past a post; taken down; dropped with their wall", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  const P = paintingsImport;
  const bag = inventoryMod.bagOf(me);
  bag.items.length = 0;
  mapMod.ensureAround(me.gx, me.gy, 3);
  let at = null;
  for (let dy = -14; dy <= 14 && !at; dy++) for (let dx = -14; dx <= 14 && !at; dx++) {
    const x = Math.round(me.gx) + dx;
    const y = Math.round(me.gy) + dy;
    let ok = true;
    for (let ay = -2; ay < 4 && ok; ay++) for (let ax = -1; ax < 12 && ok; ax++) { const t = mapMod.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.rug && !t.n && !t.w; }
    if (ok) at = [x, y];
  }
  assert(at, "no bare grass");
  const [x, y] = at;
  for (let i = 0; i < 10; i++) mapMod.buildWall(x + i, y, "n", "wall"); // a run of ten; a west wall and a window are put in below
  me.gx = x + 2;
  me.gy = y + 1;
  const add = (id) => { const e = itemsMod.makeEntry(id, 1); assert(inventoryMod.stow(me, e), `${id} did not fit the bag`); return e; };
  const hangings = (tx, edge = "n") => mapMod.peekTile(tx, y)[edge].hangings || null;
  const sync0 = gameMod.syncParts().map;
  const small = add("painting_small_oak");
  assert(P.hang(me, small.uid, x + 1, y, "n") === true && !bag.items.includes(small), `the small painting was not hung from the bag (fit "${P.fitProblem("painting_small_oak", x + 1, y, "n")}", reach "${P.reachFor(me, "painting_small_oak", x + 1, y, "n")}")`);
  assert(JSON.stringify(hangings(x + 1)) === JSON.stringify([{ item: "painting_small_oak", slot: "top", span: 1 }]), `the segment's record is ${JSON.stringify(hangings(x + 1))}`);
  assert(gameMod.syncParts().map !== sync0, "a hung painting did not move the sync hash");
  assert(P.fitProblem("painting_small_deer", x + 1, y, "n") === "Something already hangs there", "a second painting was allowed on a hung segment");
  const wide = add("painting_wide_lake");
  assert(P.hang(me, wide.uid, x + 2, y, "n") === true, "the wide painting was not hung");
  assert(hangings(x + 2)[0].span === 2 && JSON.stringify(hangings(x + 3)) === JSON.stringify([{ cover: [x + 2, y], slot: "top" }]), "a wide painting is not a holder and a cover");
  assert(P.holderOf(x + 3, y, "n").tx === x + 2, "the cover does not name its holder");
  // The record and back.
  const C = mapMod.CHUNK;
  const rec = JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(Math.floor(x / C), Math.floor(y / C), false))));
  assert(JSON.stringify(rec.walls || rec).includes("painting_wide_lake") && JSON.stringify(rec.walls || rec).includes("painting_small_oak"), "the chunk's record does not carry the paintings");
  mapMod.installChunk(rec);
  assert(hangings(x + 2) && hangings(x + 2)[0].item === "painting_wide_lake" && hangings(x + 3)[0].cover[0] === x + 2, "the paintings did not come back from the record");
  // Refusals: a post, a door, a window, the end of the wall, too far, a wall between.
  mapMod.buildWall(x + 8, y, "w", "wall"); // meets the joint between the segments at x + 7 and x + 8, on the camera's side
  assert(P.fitProblem("painting_wide_lake", x + 7, y, "n") === "A post is in the way", `a wide painting over a post: "${P.fitProblem("painting_wide_lake", x + 7, y, "n")}"`);
  assert(P.fitProblem("painting_small_oak", x + 8, y, "n") === "A corner is in the way" && P.fitProblem("painting_small_oak", x + 7, y, "n") === "A corner is in the way", "a painting was allowed at a corner, where the wall meeting the run hides it");
  assert(P.fitProblem("painting_wide_lake", x + 8, y, "n") === "A corner is in the way" && P.fitProblem("painting_small_oak", x + 6, y, "n") === "", "a corner refusal reached the wrong segments");
  mapMod.buildWall(x + 6, y, "n", "window");
  assert(P.fitProblem("painting_small_oak", x + 6, y, "n") === "Nothing to hang it on", "a painting was allowed on a window");
  assert(P.fitProblem("painting_wide_lake", x + 9, y, "n") === "Too wide for the wall", `at the end of a wall: "${P.fitProblem("painting_wide_lake", x + 9, y, "n")}"`);
  assert(P.fitProblem("painting_small_oak", x, y + 3, "n") === "No wall to hang it on", "a painting was allowed on no wall");
  me.gx = x + 2;
  me.gy = y + 8;
  assert(P.reachFor(me, "painting_small_oak", x + 4, y, "n") === "Too far", "reach was not refused from afar");
  me.gx = x + 1;
  me.gy = y - 1; // the far side of the wall
  assert(P.reachFor(me, "painting_small_oak", x + 4, y, "n") !== "", "reach was allowed through the wall");
  const far = add("painting_small_deer");
  assert(P.hang(me, far.uid, x + 4, y, "n") === false && bag.items.includes(far), "a hang through the wall was not refused, or the item left the bag");
  // Pick up: from the second segment of the wide one, once.
  me.gx = x + 3;
  me.gy = y + 1;
  const n0 = bag.items.length;
  assert(P.takeDown(me, x + 3, y, "n") === true && bag.items.some((q) => q.id === "painting_wide_lake") && bag.items.length === n0 + 1, "Pick up from the cover did not give the wide painting back");
  assert(!hangings(x + 2) && !hangings(x + 3), "the holder or the cover still has its record");
  assert(P.takeDown(me, x + 2, y, "n") === false && bag.items.length === n0 + 1, "a second pick-up gave a second painting");
  // A wall taken down drops what hangs on it; a door built over it too.
  const tall = add("painting_tall_pines");
  assert(P.hang(me, tall.uid, x + 2, y, "n") === true && hangings(x + 2)[0].slot === "both", "the tall painting was not hung with both slots");
  mapMod.destroyWall(x + 2, y, "n");
  assert(mapMod.itemsAt(x + 2, y).some((q) => q.id === "painting_tall_pines"), "the tall painting did not fall to the floor with its wall");
  assert(mapMod.buildWall(x + 1, y, "n", "door") && !mapMod.peekTile(x + 1, y).n.hangings && mapMod.itemsAt(x + 1, y).some((q) => q.id === "painting_small_oak"), "a door built over a painted wall did not drop the painting");
  const wide2 = add("painting_wide_sunset");
  assert(P.hang(me, wide2.uid, x + 3, y, "n") === true, "the wide painting was not hung again");
  mapMod.destroyWall(x + 4, y, "n"); // the cover's wall: the one painting falls, and its holder is clear
  assert(mapMod.itemsAt(x + 3, y).filter((q) => q.id === "painting_wide_sunset").length === 1 && !hangings(x + 3), "taking down a wide painting's second wall did not drop it once and clear the holder");
  return "hung, in the record and the hash, restored; refused on a post, a window, the wall's end, afar, through a wall; taken down from either segment, once; dropped with the wall or a door";
});
// The woods as wall types (#334, PR 1): oak (`wall_wood`), spruce, mahogany, Winter Pine, Bloodbark, and daub are each a drawn wall of their own, built from the delivered files with the
// oak set's anchors, each with its post and its leaves' sheet (daub's are oak's); the valley is built in oak, spruce, mahogany, and daub, mixed, and never in the regions' two woods.
check("woods: six drawn wall types with their posts and leaves, anchors the oak set's; the valley mixes oak, spruce, mahogany, and daub and has no Winter Pine or Bloodbark", () => {
  const defs = {};
  for (const w of ["wall_wood", "wall_spruce", "wall_mahogany", "wall_winterpine", "wall_bloodbark", "wall_daub"]) defs[w] = read(`data/sprites/${w}.json`);
  const oak = defs.wall_wood;
  for (const [w, d] of Object.entries(defs)) {
    assert(d.wall && d.wall.height === 80 && d.wall.material === "wood" && /^#[0-9a-f]{6}$/i.test(d.wall.color), `${w}: not a wood wall block`);
    assert(JSON.stringify(Object.keys(d.images)) === JSON.stringify(Object.keys(oak.images)), `${w}: its variants are not the oak set's`);
    assert(JSON.stringify(d.anchors) === JSON.stringify(oak.anchors), `${w}: its anchors are not the oak set's`);
    for (const f of Object.values(d.images)) assert(fs.existsSync(path.join(root, f)), `${w}: ${f} is missing`);
    assert(fs.existsSync(path.join(root, `data/sprites/${d.wall.post}.json`)) && fs.existsSync(path.join(root, `data/sprites/${d.wall.parts}.json`)), `${w}: its post or its leaves' sheet is missing`);
    if (w === "wall_daub") assert(d.wall.parts === "wall_parts_wood", "daub's leaves are not oak's");
    else assert(d.wall.parts === (w === "wall_wood" ? "wall_parts_wood" : `wall_parts_${w.slice(5)}`), `${w}: its leaves are another wood's`);
  }
  const partsOak = read("data/sprites/wall_parts_wood.json");
  for (const w of ["spruce", "mahogany", "winterpine", "bloodbark"]) {
    const p = read(`data/sprites/wall_parts_${w}.json`);
    assert(JSON.stringify(Object.keys(p.images)) === JSON.stringify(Object.keys(partsOak.images)) && JSON.stringify(p.anchors) === JSON.stringify(partsOak.anchors), `wall_parts_${w}: not the oak leaves' names and anchors`);
    assert(Object.values(p.images).every((f) => f.includes(`_${w}_`) && fs.existsSync(path.join(root, f))), `wall_parts_${w}: a leaf is missing or another wood's`);
  }
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const j = read("data/maps/valley.json");
  const [bx, by, bw, bh] = j.bounds;
  const C = mapMod.CHUNK;
  for (let cy = Math.floor(by / C); cy <= Math.floor((by + bh) / C); cy++) for (let cx = Math.floor(bx / C); cx <= Math.floor((bx + bw) / C); cx++) mapMod.getChunk(cx, cy, true);
  const seen = {};
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) for (const e of ["n", "w"]) { const w = mapMod.tileAt(x, y)[e]; if (w) seen[w.sprite] = (seen[w.sprite] || 0) + 1; }
  for (const w of ["wall_wood", "wall_spruce", "wall_mahogany", "wall_daub"]) assert(seen[w] > 20, `the valley has ${seen[w] || 0} ${w} segments`);
  assert(!seen.wall_winterpine && !seen.wall_bloodbark, "the valley holds a region's wood");
  return Object.entries(seen).map(([k, v]) => `${k.slice(5)} ${v}`).join(", ");
});
// A door or a window in another wood than its wall (#334, PR 2): the leaf is the wood's wall sprite, stored only when it differs from the wall's own (a daub wall's own is oak's), carried in the chunk's
// record and the sync hash, restored; the regions' two woods only while Free building is on; refused in a log or stone wall and for an unknown wood; a guest's `build` command meets the same rules.
check("woods: a door or a window of another wood than its wall: the leaf rules, the record and the hash, restore, and a guest's build command", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  const W = woodsImport;
  const placementMod = placementImport;
  assert(JSON.stringify(W.leafChoices(false)) === JSON.stringify(["wall_wood", "wall_spruce", "wall_mahogany"]) && JSON.stringify(W.leafChoices(true)) === JSON.stringify(["wall_wood", "wall_spruce", "wall_mahogany", "wall_winterpine", "wall_bloodbark"]), "the leaf woods are not oak, spruce, mahogany, and then the regions' two");
  assert(W.ownLeaf("wall_daub") === "wall_wood" && W.ownLeaf("wall_spruce") === "wall_spruce" && W.ownLeaf("wall_log") === null && W.ownLeaf("wall_stone") === null, "a wall's own leaf wood is wrong (daub's are oak's, a log wall has none)");
  assert(W.leafProblem("wall_log", "wall_spruce", true) !== "" && W.leafProblem("wall_mahogany", "wall_daub", true) !== "" && W.leafProblem("wall_mahogany", "wall_nothing", true) !== "" && W.leafProblem("wall_mahogany", "wall_winterpine", false) !== "" && W.leafProblem("wall_mahogany", "wall_winterpine", true) === "" && W.leafProblem("wall_log", "", false) === "", "a leaf rule is wrong");
  assert(W.storedLeaf("wall_mahogany", "wall_mahogany", true) === null && W.storedLeaf("wall_daub", "wall_wood", true) === null && W.storedLeaf("wall_daub", "wall_spruce", true) === "wall_spruce", "a leaf that is the wall's own is stored");
  mapMod.ensureAround(me.gx, me.gy, 3);
  let at = null;
  for (let dy = -14; dy <= 14 && !at; dy++) for (let dx = -14; dx <= 14 && !at; dx++) {
    const x = Math.round(me.gx) + dx;
    const y = Math.round(me.gy) + dy;
    let ok = true;
    for (let ay = -2; ay < 4 && ok; ay++) for (let ax = -1; ax < 8 && ok; ax++) { const t = mapMod.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.rug && !t.n && !t.w && mapMod.isWalkableTile(x + ax, y + ay); }
    if (ok) at = [x, y];
  }
  assert(at, "no bare grass");
  const [x, y] = at;
  mapMod.buildWall(x, y, "n", "wall", "wall_mahogany");
  mapMod.buildWall(x + 1, y, "n", "wall", "wall_daub");
  mapMod.buildWall(x + 2, y, "n", "wall", "wall_log");
  mapMod.buildWall(x + 3, y, "n", "wall", "wall_mahogany");
  mapMod.buildWall(x + 4, y, "n", "wall", "wall_mahogany");
  me.gx = x + 2;
  me.gy = y + 1.6;
  const free0 = rulesImport.rules.freeBuilding;
  const doorAt = (tx, edge = "n") => mapMod.peekTile(tx, y)[edge];
  const build = (what, tx, leaf) => { me.gx = tx; me.gy = y + 1.2; return placementMod.performPlacement(me, { kind: "build", what, tx, ty: y, edge: "n", ...(leaf ? { leaf } : {}) }); };
  try {
    rulesImport.rules.freeBuilding = true;
    const before = gameMod.syncParts().map;
    build("door", x, "wall_winterpine");
    const d = doorAt(x);
    assert(d.kind === "door" && d.sprite === "wall_mahogany" && d.leaf === "wall_winterpine", `the door is ${JSON.stringify(d && { k: d.kind, s: d.sprite, l: d.leaf })}`);
    assert(gameMod.syncParts().map !== before, "a door of another wood did not move the sync hash");
    build("window", x + 1, "wall_spruce");
    build("door", x + 3, "wall_mahogany");
    build("door", x + 4);
    assert(doorAt(x + 1).kind === "window" && doorAt(x + 1).leaf === "wall_spruce", "a spruce window in a daub wall was not built");
    assert(doorAt(x + 3).kind === "door" && !("leaf" in doorAt(x + 3)), "a door of the wall's own wood stored a leaf");
    assert(doorAt(x + 4).kind === "door" && !("leaf" in doorAt(x + 4)), "a door with no choice stored a leaf");
    // The record and back.
    const C = mapMod.CHUNK;
    const rec = JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(Math.floor(x / C), Math.floor(y / C), false))));
    assert(rec.walls.some((w) => w[3] && w[3].leaf === "wall_winterpine") && rec.walls.some((w) => w[3] && w[3].leaf === "wall_spruce"), "the chunk's record does not carry the leaf");
    mapMod.installChunk(rec);
    assert(doorAt(x).leaf === "wall_winterpine" && doorAt(x + 1).leaf === "wall_spruce", "the leaf did not come back from the record");
    // Over a broken door the default leaf is the old one's wood (a new door, never a repair); a region's wood is refused for it with Free building off as for a chosen one.
    const brokeOld = doorAt(x);
    brokeOld.broken = true; brokeOld.open = true; brokeOld.hp = 0;
    mapMod.touch(x, y);
    build("door", x);
    assert(doorAt(x) !== brokeOld && !doorAt(x).broken && doorAt(x).leaf === "wall_winterpine", "a door built over a broken Winter Pine one did not default to its wood, or was a repair");
    rulesImport.rules.freeBuilding = false;
    const brokeAgain = doorAt(x);
    brokeAgain.broken = true; brokeAgain.hp = 0;
    build("door", x);
    assert(doorAt(x) === brokeAgain, "a Winter Pine door was rebuilt by default with Free building off");
    brokeAgain.broken = false; brokeAgain.hp = 100;
    assert(W.leafProblem("wall_log", "wall_spruce", true, "window") === "Only a wood wall takes a spruce window · R to change", `the refusal reads "${W.leafProblem("wall_log", "wall_spruce", true, "window")}"`);
    rulesImport.rules.freeBuilding = true;
    // Refusals, with Free building off: a region's wood, a log wall, an unknown wood, a fence's gate.
    rulesImport.rules.freeBuilding = false;
    const refused = (tx, what, leaf) => {
      const had = doorAt(tx) ? doorAt(tx).kind + doorAt(tx).sprite : "";
      build(what, tx, leaf);
      return (doorAt(tx) ? doorAt(tx).kind + doorAt(tx).sprite : "") === had;
    };
    mapMod.destroyWall(x + 4, y, "n");
    mapMod.buildWall(x + 4, y, "n", "wall", "wall_mahogany");
    assert(refused(x + 4, "door", "wall_winterpine"), "a Winter Pine door was built with Free building off");
    assert(refused(x + 4, "door", "wall_nothing"), "a door of an unknown wood was built");
    assert(refused(x + 2, "door", "wall_spruce"), "a spruce door was built in a log wall");
    assert(refused(x + 6, "wall_winterpine", ""), "a Winter Pine wall was built with Free building off");
    assert(placementMod.paletteKinds().every((k) => !k.region) && placementMod.buildKinds().some((k) => k.region), "the palette offers a region's wood with Free building off");
    rulesImport.rules.freeBuilding = true;
    assert(placementMod.paletteKinds().some((k) => k.id === "wall_bloodbark"), "the palette hides a region's wood with Free building on");
    build("wall_bloodbark", x + 6);
    assert(doorAt(x + 6) && doorAt(x + 6).kind === "wall" && doorAt(x + 6).sprite === "wall_bloodbark", "a Bloodbark wall was not built with Free building on");
  } finally {
    rulesImport.rules.freeBuilding = free0;
  }
  return "leaf rules; a Winter Pine door in a mahogany wall and a spruce window in a daub one, in the record and the hash and restored; the wall's own wood stores nothing; refusals";
});
// Small text (#321): text at or under the threshold (ui/small-text.js, 15 UI px) is set in the clear sans-serif (`--font-small`), so a new small rule cannot slip in pixel-only.
// `scanSmallText` reads style.css for every rule whose size is at or under the threshold, in any form the stylesheet could write it: `font-size` in px or rem (a rem is 16 px), a
// percentage or an em or `smaller` (relative to the parent), the keywords (xx-small 9 px, x-small 10, small 13), and the `font:` shorthand with a style, variant, or weight before the
// size (`font: bold 12px ...`); and it reads every script under src/ for text sized from script: `style.fontSize`, an inline `font-size:`, `font:`, and `ctx.font` or `.font =` anywhere,
// each LINE needing the small font within two lines of it (a file that names --font-small once does not excuse a second size). Monospace (the debug corner, codes) and the Pirata One
// titles are left as they are; a rule above the threshold names its own pixel font so it does not inherit a small container's.
// Its limit: a relative size (an em, a percent, `smaller`) under 1 counts as small whatever its parent is (a 0.9em inside a 20 px heading is 18 px and would be asked for the
// small font anyway); the page's computed fonts are what `check("smalltext")` reads, in the pane. The stylesheet is checked as text, not computed.
const KEYWORD_PX = { "xx-small": 9, "x-small": 10, small: 13, medium: 16, large: 18, "x-large": 24, "xx-large": 32 };
const SIZE_WORD = "(?:[\\d.]+(?:px|rem|em|%)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)";
function sizeOf(value, max) {
  // "small", "big" (an absolute size over the threshold, which must name its own face), "bigRel" (a relative or fluid size over it), or null (not a size).
  const v = value.trim().toLowerCase();
  const m = v.match(/^([\d.]+)(px|rem|em|%)/);
  if (m) {
    const n = Number(m[1]);
    if (m[2] === "px") return n <= max ? "small" : "big";
    if (m[2] === "rem") return n * 16 <= max ? "small" : "big";
    return (m[2] === "%" ? n / 100 : n) < 1 ? "small" : "bigRel"; // relative to the parent: a big one inherits the parent's face, which is the parent's to name
  }
  if (v.startsWith("clamp(")) return "bigRel";
  if (v === "smaller") return "small";
  if (v === "larger") return "bigRel";
  if (v in KEYWORD_PX) return KEYWORD_PX[v] <= max ? "small" : "big";
  return null;
}
function scanSmallText(cssText, files, max) {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const bad = [];
  const bigNoFace = [];
  let small = 0;
  const shorthand = new RegExp("(?:^|[;\\s])font\\s*:\\s*(?:(?:italic|oblique|normal|bold|bolder|lighter|small-caps|\\d{3})\\s+)*(" + SIZE_WORD + ")(?![\\w-])");
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().replace(/\s+/g, " ");
    const body = m[2];
    if (/monospace|Pirata/.test(body)) continue;
    const decl = body.match(/(?:^|[;\s])font-size\s*:\s*([^;}]+)/);
    const sh = body.match(shorthand);
    const kind = decl ? sizeOf(decl[1], max) : sh ? sizeOf(sh[1], max) : null;
    if (kind === "small") {
      small++;
      if (!body.includes("var(--font-small)")) bad.push(sel);
    } else if (kind === "big" && !/font-family/.test(body) && !(sh && !decl)) {
      bigNoFace.push(sel); // a big size with no family of its own (a shorthand carries its family)
    }
  }
  // Scripts: each sizing line needs the small font on it or within two lines of it; a monospace family is exempt.
  const badJs = [];
  const SIZING = /\.style\.fontSize\s*=|font-size\s*:\s*[\d.$]|\bfont\s*[:=]\s*[`"']?\s*(?:(?:italic|bold|normal|\d{3})\s+)*\$?\{?\d|\.font\s*=/;
  const OK = /font-small|SMALL_FONT_VAR|smallFamily|monospace|Consolas/;
  for (const [name, text] of files) {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (!SIZING.test(line)) return;
      const near = lines.slice(Math.max(0, i - 2), i + 3).join("\n");
      if (!OK.test(near)) badJs.push(`${name}:${i + 1}`);
    });
  }
  return { small, bad, bigNoFace, badJs };
}
const walkJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkJs(path.join(dir, e.name)) : e.name.endsWith(".js") && e.name !== "small-text.js" ? [path.join(dir, e.name)] : []));
check("small text: every size at or under the threshold is set in --font-small, in the stylesheet and in the scripts; the scan itself catches each form", () => {
  const { SMALL_TEXT_MAX_PX: MAX } = smallTextMod;
  const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
  assert(/--font-small:\s*system-ui/.test(css), ":root has no --font-small");
  // Pixel puts small text back in the interface's font, and (since every digit took the clear face, 2026-10-20) the interface's and the
  // titles' digits back in the pixel font: the old look exactly.
  const pixel = (css.match(/:root\.small-pixel\s*\{([^}]*)\}/) || [])[1] || "";
  assert(/--font-small:\s*var\(--font-ui\)/.test(pixel) && /--font-ui:\s*var\(--font-pixel\)/.test(pixel), "the Pixel setting's override is missing");
  assert(/font-family:\s*"CMZ Digits"[\s\S]*?unicode-range:\s*U\+0030-0039/.test(css) && /--font-ui:\s*"CMZ Digits"/.test(css), "every digit is not in the clear face (CMZ Digits first in --font-ui)");
  const files = walkJs(path.join(root, "src")).map((f) => [path.relative(root, f).replace(/\\/g, "/"), fs.readFileSync(f, "utf8")]);
  const real = scanSmallText(css, files, MAX);
  assert(real.bad.length === 0, `${real.bad.length} small rules are not in --font-small: ${real.bad.slice(0, 6).join(" | ")}`);
  assert(real.bigNoFace.length === 0, `${real.bigNoFace.length} rules above the threshold name no font-family (they would inherit a small container's): ${real.bigNoFace.slice(0, 6).join(" | ")}`);
  assert(real.badJs.length === 0, `text sized from script without the small font: ${real.badJs.join(", ")}`);
  // The scan catches each form: a planted bad rule or line for every one, and a clean one for each that must pass.
  const planted = (c, f = []) => scanSmallText(c, f, MAX);
  const mustCatch = {
    "a px size": [".x { font-size: 12px; }", "bad"],
    "the shorthand": [".x { font: 12px \"Pixelify Sans\", sans-serif; }", "bad"],
    "the shorthand with a weight": [".x { font: bold 12px \"Pixelify Sans\", sans-serif; }", "bad"],
    "the shorthand with a style and a weight": [".x { font: italic 700 12px serif; }", "bad"],
    "a rem size": [".x { font-size: 0.8rem; }", "bad"],
    "a percentage": [".x { font-size: 80%; }", "bad"],
    "an em under 1": [".x { font-size: 0.9em; }", "bad"],
    "smaller": [".x { font-size: smaller; }", "bad"],
    "a keyword": [".x { font-size: small; }", "bad"],
    "a big px rule with no family": [".x { font-size: 18px; }", "bigNoFace"],
    "a big rem rule with no family": [".x { font-size: 1.5rem; }", "bigNoFace"],
  };
  for (const [what, [rule, list]] of Object.entries(mustCatch)) assert(planted(rule)[list].length === 1, `the scan missed ${what}: ${rule}`);
  const mustPass = [".x { font-size: 12px; font-family: var(--font-small); }", ".x { font: bold 12px var(--font-small); }", ".x { font-size: 12px; font-family: monospace; }", ".x { font-size: 18px; font-family: var(--font-ui); }", ".x { font: 18px var(--font-ui); }", ".x { font-size: 18px; font-family: var(--font-ui); } /* a comment { font-size: 9px; } */", ".x { font-size: 1.3em; }"];
  for (const rule of mustPass) {
    const r = planted(rule);
    assert(r.bad.length === 0 && r.bigNoFace.length === 0, `the scan flagged a clean rule: ${rule}`);
  }
  const jsBad = {
    "a second style.fontSize in a file that already names --font-small": [["a.js", "const f = 'var(--font-small)';\n" + "x;\n".repeat(8) + "el.style.fontSize = `${n}px`;\n"]],
    "ctx.font in a file outside src/ui": [["src/map.js", "ctx.font = \"11px sans-serif\";\n"]],
    "an inline font-size in a template": [["b.js", "el.innerHTML = `<b style=\"font-size:12px\">x</b>`;\n"]],
    "a font shorthand assignment": [["c.js", "ctx.font = `bold 12px ${family}`;\n"]],
  };
  for (const [what, f] of Object.entries(jsBad)) assert(planted("", f).badJs.length >= 1, `the scan missed ${what}`);
  const jsGood = [["d.js", "el.style.fontSize = `${n}px`;\nel.style.fontFamily = SMALL_FONT_VAR;\n"], ["e.js", "ctx.font = `11px ${smallFamily()}`;\n"], ["f.js", "ctx.font = \"bold 9px Consolas, monospace\";\n"]];
  assert(planted("", jsGood).badJs.length === 0, "the scan flagged a clean script line");
  return `${real.small} small rules in style.css, every one in --font-small; ${files.length} scripts scanned line by line; ${Object.keys(mustCatch).length + Object.keys(jsBad).length} planted bad forms all caught (threshold ${MAX} UI px)`;
});
// The hover card (#262): every item's card says its own full name and a kind, no two read alike though six are drawn "Seed", food says what eating heals and fills,
// and the word Use is its own segment. (The card on the page, its place and its look, is `check("hovercard")`'s, in the pane.)
check("hover card: every item's card has its own full name, a kind, and what it does, read from the data", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const defs = itemsMod.allItems();
  const names = new Map();
  let food = 0;
  for (const d of defs) {
    const c = itemInfoMod.cardFor(itemsMod.makeEntry(d.id));
    assert(c.name === d.name && c.kind, `${d.id}: the card said ${JSON.stringify(c.name)} / ${JSON.stringify(c.kind)}`);
    names.set(c.name, (names.get(c.name) || 0) + 1);
    if (d.kind === "food") {
      food++;
      assert(c.lines.some((l) => l[0].t === "Eat" && l.map((s) => s.t).join("").startsWith("Eat: heals")), `${d.id}: no Eat line`);
    }
    for (const s of c.lines.flat()) assert(s.k !== "use" || s.t === "Use", `${d.id}: the word Use was written ${s.t}`);
  }
  const dup = [...names].filter(([, n]) => n > 1).map(([k]) => k);
  assert(dup.length === 0, `two items share a card name: ${dup.join(", ")}`);
  const tb = itemInfoMod.cardFor(itemsMod.makeEntry("tinderbox"));
  assert(tb.lines.flat().some((s) => s.k === "use" && s.t === "Use"), "the tinderbox's card has no Use");
  return `${defs.length} items, ${food} foods, every name its own`;
});
// Floating numbers over heads (#294): the world records a hit, a heal, and a gather where they happen, regeneration records nothing, a guest records none of its own, and the
// frame's small arrays are what a guest draws. (The drawing, the colours, and the setting are `check("floaters")`'s, in the pane.)
check("floaters: a hit, a heal, and a gather are recorded where they happen; regeneration is not; a guest records none; the frame's arrays round-trip", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  floatersMod.reset();
  const { damagePlayer, eat } = playerMod;
  damagePlayer(me, 7);
  me.hp = me.maxHp - 30;
  const hp1 = me.hp;
  eat(me, { hunger: 10, heal: 4 });
  verbsMod.run("nothing", null, me, {}); // a verb that does not exist makes nothing
  floatersMod.verbDone("mine", me, { ok: true, mined: 2 });
  floatersMod.verbDone("fish", me, { ok: true, caught: "trout" }); // a fish caught counts one
  floatersMod.verbDone("fish", me, { ok: true, caught: null }); // nothing bit: nothing floats
  floatersMod.verbDone("sleep", me, { ok: true }); // not a gather
  const wire = floatersMod.takeForFrame();
  assert(JSON.stringify(wire) === JSON.stringify([[0, me.id, 7], [1, me.id, Math.round(me.hp - hp1)], [2, me.id, 2, "mining"], [2, me.id, 1, "fishing"]]), `the frame's arrays were ${JSON.stringify(wire)}`);
  assert(floatersMod.takeForFrame().length === 0, "a second take was not empty");
  me.hp = me.maxHp - 20;
  for (let i = 0; i < 600; i++) gameMod.step(1 / 60);
  assert(floatersMod.takeForFrame().length === 0, "natural regeneration made a number");
  // A guest records none of its own, and draws what it is sent.
  floatersMod.takeForDraw(); // (the host's own, drawn already)
  floatersMod.setGuestCheck(() => true);
  floatersMod.damage(me, 5);
  assert(floatersMod.takeForFrame().length === 0, "a guest recorded its own number");
  floatersMod.receive(JSON.parse(JSON.stringify(wire)).concat([["x"], [9, me.id, 3], [0, me.id, 0], [2, me.id, 3, "<b>"], [2, me.id, 3]])); // the last five are nonsense (a skill that is not one of the fourteen, or none): ignored
  const drawn = floatersMod.takeForDraw();
  floatersMod.setGuestCheck(() => false);
  const want = wire.map((e) => `${e[0] === 0 ? "-" : "+"}${e[2]}`).join(" ");
  assert(drawn.length === 4 && drawn.map((e) => floatersMod.textOf(e)).join(" ") === want, `a guest drew ${drawn.map((e) => floatersMod.textOf(e)).join(" ")}, the frame said ${want}`);
  floatersMod.reset();
  return `${wire.length} events in the frame; regeneration none; a guest draws what it is sent`;
});
// The chart's frame carries only the changed cells (#237): what a host takes after a reveal, applied to an empty replica, makes the same chart; and a second take is empty.
check("chart: the changed cells a frame carries rebuild the chart on an empty replica", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  const chartMod = chartModule;
  S.player.gx = 104;
  S.player.gy = 205;
  chartMod.takeChanged();
  mapMod.ensureAround(104, 205, 4);
  gameMod.begin(1 / 60);
  gameMod.begin(1 / 60);
  const taken = chartMod.takeChanged();
  const host = chartMod.hashText();
  const again = chartMod.takeChanged();
  chartMod.restore({ chunks: [] });
  chartMod.apply(JSON.parse(JSON.stringify(taken))); // as it crosses the wire
  assert(taken.length > 0 && chartMod.hashText() === host, "the replica built from the changed cells is not the host's chart");
  assert(again.length === 0, "a second take with nothing changed was not empty");
  const cells = taken.reduce((n, r) => n + r[2].length / 2, 0);
  return `${taken.length} chunks, ${cells} cells, the replica matches; nothing the second time`;
});
for (const file of fs.readdirSync(path.join(root, "data", "maps")).filter((f) => f.endsWith(".json"))) {
  check(`maps: no prop stands on a door's tiles (${file})`, () => {
    const json = read(`data/maps/${file}`);
    gameMod.create({ json, rules: { zombieAggro: false } });
    const [bx, by, bw, bh] = json.bounds;
    const C = mapMod.CHUNK;
    for (let cy = Math.floor(by / C); cy <= Math.floor((by + bh) / C); cy++) for (let cx = Math.floor(bx / C); cx <= Math.floor((bx + bw) / C); cx++) mapMod.getChunk(cx, cy, true);
    let doors = 0;
    const bad = [];
    for (let y = by - 1; y <= by + bh; y++) {
      for (let x = bx - 1; x <= bx + bw; x++) {
        for (const edge of ["n", "w"]) {
          const w = mapMod.tileAt(x, y)[edge];
          if (!w || w.kind !== "door") continue;
          doors++;
          for (const [tx, ty] of mapMod.edgeTiles(x, y, edge)) {
            const prop = mapMod.tileAt(tx, ty).prop;
            if (prop) bad.push(`${prop.sprite} at ${tx},${ty} by the door at ${x},${y}${edge}`);
          }
        }
      }
    }
    assert(!bad.length, `${bad.length} on a door's tiles: ${bad.slice(0, 4).join("; ")}`);
    return `${doors} doors, every tile beside one clear`;
  });
  // Every container, station, and bed can be reached: a walkable tile beside it (within the interact range) with a clear line, or the reach test
  // (#208) leaves it dead loot (a chest boxed in by a hearth, a table, and two walls was exactly that, #227).
  check(`maps: every container, station, and bed has a walkable tile in range with a clear line (${file})`, () => {
    const json = read(`data/maps/${file}`);
    gameMod.create({ json, rules: { zombieAggro: false } });
    const [bx, by, bw, bh] = json.bounds;
    const C = mapMod.CHUNK;
    for (let cy = Math.floor(by / C); cy <= Math.floor((by + bh) / C); cy++) for (let cx = Math.floor(bx / C); cx <= Math.floor((bx + bw) / C); cx++) mapMod.getChunk(cx, cy, true);
    const RANGE = 1.15; // interact.js INTERACT_RANGE
    let n = 0;
    const dead = [];
    for (const p of mapMod.allProps()) {
      const [tx0, ty0] = p.tile;
      if (tx0 < bx || ty0 < by || tx0 >= bx + bw || ty0 >= by + bh) continue;
      if (!(p.container || stationsMod.stationOf(p).length || getDef(p.sprite).sleep)) continue;
      n++;
      let ok = false;
      for (const [tx, ty] of p.tiles) {
        for (let dy = -2; dy <= 2 && !ok; dy++) for (let dx = -2; dx <= 2 && !ok; dx++) {
          if (Math.hypot(dx, dy) > RANGE || !mapMod.isWalkableTile(tx + dx, ty + dy)) continue;
          if (lineOfSight(tx + dx, ty + dy, tx, ty)) ok = true;
        }
      }
      if (!ok) dead.push(`${p.sprite} at ${tx0},${ty0}`);
    }
    assert(!dead.length, `${dead.length} cannot be reached from any tile: ${dead.slice(0, 6).join("; ")}`);
    return `${n} containers, stations, and beds, each with a tile to stand on`;
  });
  // And both tiles of every door can be walked to: flooded from the spawn with every door and gate open (windows and
  // walls shut), a door whose tile is walled in by furniture is one the dead cannot stand at, and the window beside it is
  // a safe spot again (a chair off the tile but a table and a chest round it did that to six partition doors).
  check(`maps: both tiles of every door can be walked to from the spawn (${file})`, () => {
    const json = read(`data/maps/${file}`);
    const [bx, by, bw, bh] = json.bounds;
    const seen = new Set();
    const key = (x, y) => `${x},${y}`;
    const walk = (x, y) => x >= bx - 2 && y >= by - 2 && x <= bx + bw + 2 && y <= by + bh + 2 && mapMod.isWalkableTile(x, y);
    let start = [json.spawn[0], json.spawn[1]];
    if (!walk(start[0], start[1])) start = mapMod.nearestWalkable(start[0], start[1]) || start;
    const queue = [start];
    seen.add(key(start[0], start[1]));
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (seen.has(key(nx, ny)) || !walk(nx, ny)) continue;
        const wall = mapMod.wallBetween(x, y, nx, ny);
        if (wall && wall.kind !== "door") continue; // a wall, a window, a fence: shut; a door or a gate: open
        seen.add(key(nx, ny));
        queue.push([nx, ny]);
      }
    }
    let doors = 0;
    const cut = [];
    for (let y = by - 1; y <= by + bh; y++) {
      for (let x = bx - 1; x <= bx + bw; x++) {
        for (const edge of ["n", "w"]) {
          const w = mapMod.tileAt(x, y)[edge];
          if (!w || w.kind !== "door") continue;
          doors++;
          for (const [tx, ty] of mapMod.edgeTiles(x, y, edge)) if (!seen.has(key(tx, ty))) cut.push(`${tx},${ty} by the door at ${x},${y}${edge}`);
        }
      }
    }
    assert(!cut.length, `${cut.length} door tiles cannot be walked to: ${cut.slice(0, 6).join("; ")}`);
    return `${doors} doors, every tile beside one reached from ${start[0]},${start[1]} (${seen.size} tiles)`;
  });
}

// Trees off leaves the mushrooms where they were (#142): the forage is placed against where the trees would have stood, so a
// world of the same seed has the same ones with or without trees, inside the bounds and in the wild beyond.
check("trees off: the mushrooms stand where they stand with trees (the valley, inside the bounds and beyond)", () => {
  const json = read("data/maps/valley.json");
  const spots = [[104, 216], [60, 150], [-40, 120], [300, 100], [128, 300]]; // the spawn, the village, the wild beyond each side
  const grab = (trees) => {
    gameMod.create({ json, rules: { zombieAggro: false, trees } });
    for (const [x, y] of spots) mapMod.ensureAround(x, y, 5);
    const found = mapMod.allProps().filter((p) => String(p.sprite).startsWith("mushroom")).map((p) => `${p.sprite}@${p.tile[0]},${p.tile[1]}`).sort();
    const trunks = mapMod.allProps().filter((p) => String(p.sprite).startsWith("tree_")).length;
    return { found, trunks };
  };
  const on = grab(true);
  const off = grab(false);
  assert(on.trunks > 0 && off.trunks === 0, `trees ${on.trunks} on, ${off.trunks} off`);
  assert(on.found.length > 0, "no mushrooms at all");
  assert(on.found.length === off.found.length && on.found.every((k, i) => k === off.found[i]), `${on.found.length} mushrooms with trees, ${off.found.length} without`);
  return `${on.found.length} mushrooms in the same places, ${on.trunks} trees on and none off`;
});

// Natural resources (docs/46, step 1): each kind's count in its area is its lever with Trees on and off (the stone made up at the load by the
// comeback's rule, in the same places either way); a take inside an area queues one debt, one in the wild none; past its day a node of the
// kind stands at a new spot in the area, never the tile it was taken from, a rock with its sim-clock stamp and a mushroom without; the debts
// ride in the save and come back with it, and are not a sync part. The pane's check("resources") has every row of section 7, and the guest.
const resourcesMod = await import("../src/resources.js");
const RESOURCES = (await import("../src/tuning.js")).resources;
check("natural resources: counts kept per area, a debt per take, a comeback elsewhere in the area, the wild owing nothing, the debts in the save", () => {
  const json = read("data/maps/valley.json");
  const at = {};
  for (const trees of [true, false]) {
    gameMod.create({ json, rules: { zombieAggro: false, trees } });
    const got = mapMod.resourceKinds().map((k) => [k.name, mapMod.resourceCensus(k), k.count]);
    for (const [name, n, lever] of got) assert(n === lever, `trees ${trees}: ${name} ${n} standing, lever ${lever}`);
    at[trees] = mapMod.allProps().filter((p) => p.sprite.startsWith("rock_")).map((p) => p.tile.join(",")).sort().join(" ");
  }
  assert(at[true] === at[false], "the stone made up at the load stands elsewhere with Trees off");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const ore = mapMod.resourceKind("ore");
  const mush = mapMod.resourceKind("mushrooms");
  const rock = mapMod.allProps().find((p) => p.sprite === "ore_rock");
  mapMod.growTile(rock.tile[0], rock.tile[1]);
  assert(resourcesMod.taken({ sprite: "rock_0", tile: [-30, 40] }) === null && resourcesMod.owed("stone").length === 0, "a rock taken in the wild left a debt");
  const debt = resourcesMod.taken(rock);
  mapMod.removeProp(rock);
  const shroom = mapMod.allProps().find((p) => mush.sprites[p.sprite] !== undefined && mapMod.inResourceArea(mush, p.tile[0], p.tile[1]));
  mapMod.growTile(shroom.tile[0], shroom.tile[1]);
  resourcesMod.taken(shroom);
  mapMod.removeProp(shroom);
  assert(debt && resourcesMod.owed("ore").length === 1 && mapMod.resourceCensus(ore) === ore.count - 1, "an ore rock taken did not leave one debt and one fewer standing");
  const save = JSON.parse(JSON.stringify(gameMod.serialize()));
  assert(save.resources.debts.ore.length === 1 && !Object.keys(gameMod.syncParts()).some((k) => /resource|debt/.test(k)), "the debts are not in the save, or are a sync part");
  gameMod.restore(save, json);
  assert(resourcesMod.owed("ore").length === 1 && resourcesMod.owed("ore")[0].due === debt.due && resourcesMod.owed("mushrooms").length === 1, "the debts did not come back with the save");
  const ids = new Set(mapMod.allProps().map((p) => p.id));
  const due = Math.max(...["ore", "mushrooms"].flatMap((n) => resourcesMod.owed(n).map((d) => d.due)));
  clock.setElapsed(due + 1);
  let looks = 0;
  for (; looks < 40 && (resourcesMod.owed("ore").length || resourcesMod.owed("mushrooms").length); looks++) {
    gameMod.begin(0);
    clock.setElapsed(clock.getElapsed() + RESOURCES.checkSeconds);
  }
  const fresh = (kind) => mapMod.allProps().find((p) => !ids.has(p.id) && kind.sprites[p.sprite] !== undefined && mapMod.inResourceArea(kind, p.tile[0], p.tile[1]));
  const newOre = fresh(ore);
  const newShroom = fresh(mush);
  assert(newOre && (newOre.tile[0] !== debt.at[0] || newOre.tile[1] !== debt.at[1]), `no new ore rock elsewhere in its area after ${looks} looks`);
  // The rule itself: the taken tile, now free, as a one-tile area refuses the debt's replacement and grows one without the debt's tile.
  const [tx, ty] = debt.at;
  const one = { ...ore, rects: [[tx, ty, 1, 1]] };
  assert(mapMod.resourceSpotProblem(ore, tx, ty) === null, `the taken tile is not free: ${mapMod.resourceSpotProblem(ore, tx, ty)}`);
  assert(mapMod.resourceSpotProblem(ore, tx, ty, { not: [tx, ty] }) === "where the last one stood" && resourcesMod.grow(one, [], [tx, ty]) === null, "a replacement could grow where its node was taken");
  const again = resourcesMod.grow(one, []);
  assert(again && again.tile[0] === tx && again.tile[1] === ty, "the one-tile area grew nothing without the debt's tile");
  mapMod.removeProp(again);
  assert(Number.isFinite(newOre.risenAt) && resourcesMod.riseOf(newOre, 40, newOre.risenAt) === 40 && resourcesMod.riseOf(newOre, 40, newOre.risenAt + RESOURCES.riseSeconds) === 0, "the new ore rock has no stamp to rise from");
  assert(newShroom && newShroom.risenAt === undefined && mapMod.resourceCensus(mush) === mush.count && mapMod.resourceCensus(ore) === ore.count, "the mushroom did not come back, or the counts are not their levers");
  return `stone 40, ore 6, mushrooms 774 with Trees on and off; ore back at ${newOre.tile.join(",")} (taken at ${debt.at.join(",")}) and a mushroom at ${newShroom.tile.join(",")} after ${looks} looks`;
});

// The dye vat (docs/43 section 8, #412): the three vats in the weaver's yard are stations that open the picker (on a guest's player, the word to
// that guest); the `dye` verb, by the vat's id and the entry's uid, dyes a worn or carried garment a palette's colour or a scheme whole, and
// refuses what the item does not allow, an item that is not dyeable or not carried, and a vat out of reach; its own colours undye it; the
// colours are on the entry in the sync hash and the save; a guest's command (host.js's hook) is the same verb; the card says what it can be
// dyed and what it is. (The picker on the page, the figure's recolouring, and two tabs are `check("dye")`'s and `check("layers")`', in the pane.)
const dyeMod = await import("../src/dye.js");
const hostMod = await import("../src/host.js");
const eventsMod = await import("../src/events.js");
const interactMod = await import("../src/interact.js");
check("dye vat: three vats open the picker; the verb dyes by uid, refuses what it should, undyes, and is in the sync hash, the save, a guest's command, and the card", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  const W = worldMod.world;
  const wea = json.sets.find((q) => q.name === "the weaver");
  assert(wea, "no weaver in the valley");
  const at = wea.props.filter((q) => q.sprite === "dyevat").map((q) => [wea.rect[0] + q.tile[0], wea.rect[1] + q.tile[1]]);
  assert(at.length === 3, `${at.length} vats in the weaver's yard`);
  mapMod.ensureAround(at[1][0], at[1][1], 2);
  const vats = at.map(([x, y]) => mapMod.peekTile(x, y) && mapMod.peekTile(x, y).prop).filter((q) => q && q.sprite === "dyevat");
  assert(vats.length === 3 && vats.every((v) => stationsMod.stationOf(v).includes("dyevat")), "the three vats are not dye vat stations");
  const vat = vats[1];
  let stand = null;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 1], [-1, 1], [0, 2]]) if (!stand && mapMod.isWalkableTile(vat.tile[0] + dx, vat.tile[1] + dy)) stand = [vat.tile[0] + dx, vat.tile[1] + dy];
  assert(stand, "nowhere to stand by the vat");
  me.gx = stand[0];
  me.gy = stand[1];
  // The menu's entry, as a guest's label runs it on the host: the word goes to the player who used it.
  let told = null;
  const hear = (e) => { told = e; };
  eventsMod.on("dyeOpened", hear);
  const labels = interactMod.actionsForTarget({ kind: "prop", id: vat.id }, me).map((a) => a.label);
  assert(labels.includes("Use the dye vat"), `the vat's menu: ${labels.join(", ")}`);
  interactMod.performByLabel(me, { kind: "prop", id: vat.id }, "Use the dye vat");
  eventsMod.off("dyeOpened", hear);
  assert(told && told.prop === vat && told.player === me, "using the vat did not say so for the player who used it");
  const tunic = me.worn.chest;
  assert(tunic && tunic.id === "tunic", "no tunic worn");
  const run = (uid, colours, prop = vat) => verbsMod.run("dye", W, me, { prop: prop.id }, { uid, colours });
  const sync0 = gameMod.syncParts().players;
  let r = run(tunic.uid, ["#3e5e90"]);
  assert(r.ok && tunic.colours && tunic.colours[0] === "#3e5e90", `the tunic was not dyed woad: ${r.reason || JSON.stringify(tunic.colours)}`);
  assert(gameMod.syncParts().players !== sync0, "a dyed tunic did not move the players' sync hash");
  const card = itemInfoMod.textOf(itemInfoMod.cardFor(tunic));
  assert(card.some((l) => l.includes("Woad blue")) && card.some((l) => l.includes("Can be dyed at a dye vat: 16 colours.")), `the tunic's card: ${card.join(" | ")}`);
  // Refusals, each with its word.
  assert(run(tunic.uid, ["#123456"]).reason === "The vat has no such colour for it.", "a colour off the palette was allowed");
  assert(run(tunic.uid, ["#3e5e90", "#3e5e90"]).reason === "That is not a colouring for it.", "two colours for a one-region tunic were allowed");
  assert(run(tunic.uid, ["#c8a040"]).reason === "The vat has no such colour for it.", "brass, not a cloth colour, was allowed on the tunic");
  const bread = itemsMod.makeEntry("bread", 1);
  inventoryMod.stow(me, bread);
  assert(run(bread.uid, ["#3e5e90"]).reason === "That can't be dyed.", "bread was dyed");
  assert(run("e-nothing", ["#3e5e90"]).reason === "You don't have that with you.", "an entry not carried was dyed");
  const notVat = mapMod.allProps().find((q) => q.sprite === "loom");
  if (notVat) assert(run(tunic.uid, ["#a63a2c"], notVat).reason === "That is not a dye vat.", "the loom dyed");
  me.gx = stand[0] + 12;
  assert(run(tunic.uid, ["#a63a2c"]).reason === "Too far from the vat.", "a vat twelve tiles off dyed");
  me.gx = stand[0];
  // A two-region item with schemes takes one whole, and not a mix; a free two-region item takes each region from its own palette.
  const belt = itemsMod.makeEntry("good_belt", 1);
  inventoryMod.stow(me, belt);
  assert(run(belt.uid, ["#2a2428", "#8c8c94"]).ok && belt.colours.join() === "#2a2428,#8c8c94", "the leather belt did not take black and iron");
  assert(run(belt.uid, ["#8c8c94", "#2a2428"]).reason === "The vat has no such scheme for it.", "the belt took iron and black, no scheme");
  assert(run(belt.uid, ["#a63a2c", "#c8a040"]).reason === "The vat has no such scheme for it.", "the belt took madder, no scheme");
  assert(itemInfoMod.textOf(itemInfoMod.cardFor(belt)).some((l) => l.includes("6 schemes")) && itemInfoMod.textOf(itemInfoMod.cardFor(belt)).some((l) => l.includes("Black and iron")), `the belt's card: ${itemInfoMod.textOf(itemInfoMod.cardFor(belt)).join(" | ")}`);
  const satchel = itemsMod.makeEntry("satchel", 1);
  inventoryMod.stow(me, satchel);
  assert(run(satchel.uid, ["#3e6a38", "#5c2020"]).ok && satchel.colours.join() === "#3e6a38,#5c2020", "the satchel did not take green cloth and an oxblood strap");
  assert(run(satchel.uid, ["#5c2020", "#3e6a38"]).reason === "The vat has no such colour for it.", "the satchel took oxblood cloth and a green strap");
  assert(run(satchel.uid, ["#c8b890", "#5c2020"]).ok && satchel.colours.join() === "#c8b890,#5c2020", "the satchel's own cloth with a dyed strap was refused");
  // A wardrobe's single colour (a hood from the dead) is replaced, and an item's own colours undye it.
  const hood = itemsMod.makeEntry("hood", 1, { colour: "#705848" });
  inventoryMod.stow(me, hood);
  assert(run(hood.uid, ["#6a3c72"]).ok && !hood.colour && hood.colours.join() === "#6a3c72", "a wardrobe-dyed hood did not take orchil");
  assert(run(hood.uid, ["#5f8a3a"]).ok && !hood.colours && !hood.colour, "the hood's own green did not undye it");
  // The cost hook costs nothing: no dye names a cost.
  assert(dyeMod.costOf(itemsMod.getItem("tunic"), ["#3e5e90"]).length === 0, "a dye costs something before #288");
  // A guest's command: the host's hook runs the same verb as that player.
  hostMod.netHooks().dye(me, { propId: vat.id, uid: tunic.uid, colours: ["#a63a2c"] });
  assert(tunic.colours.join() === "#a63a2c", "the guest's command did not dye the tunic madder");
  hostMod.netHooks().dye(me, { propId: vat.id, uid: tunic.uid, colours: ["#ffffff"] });
  assert(tunic.colours.join() === "#a63a2c", "the guest's command dyed a colour off the palette");
  // The save keeps it.
  const saved = JSON.parse(JSON.stringify(gameMod.serialize()));
  gameMod.restore(saved, json);
  const back = gameMod.state.player;
  const sat = inventoryMod.bagOf(back).items.find((q) => q.id === "satchel");
  assert(back.worn.chest.colours.join() === "#a63a2c" && sat && sat.colours.join() === "#c8b890,#5c2020", "the save lost a dye");
  return "three vats, a tunic woad then madder, the belt's scheme, the satchel's two regions, refusals worded, undyed, the hash, the save, a guest's command, the cards";
});

// Water (docs/44, #418): no fixed source is clean, mixing taints, the kit's skin starts clean, the auto-sip skips a tainted skin; `boil` at a lit cooking
// fire by Use, by the skin's menu (bag and belt), and by the fire's menu, each greyed with why, each a timed bar by the fire's id and the skin's uid, the
// fill kept, and a guest's command the same path; a tainted drink's one roll, from a source and from a skin, two floats of the generator and none for a
// clean sip; Sick's stacks and time, its effects, its card, its end; the infection's third stage named Queasy; `clean` and `sick` in the sync parts and
// the save. (The page, the drop on the icon, the card read over the bag, and two tabs are `check("boil")`'s, `check("food")`'s, and `check("debuffs")`', in the pane.)
const waterMod = await import("../src/water.js");
const sickMod = await import("../src/sick.js");
const debuffsMod = await import("../src/debuffs.js");
const moodlesMod = await import("../src/moodles.js");
const useMod = await import("../src/use.js");
const invActionsMod = await import("../src/ui/inventory-actions.js");
const tuningMod = await import("../src/tuning.js");
check("water: tainted and clean, boiling by Use and both menus, Sick and its rolls, Queasy, the sync parts and the save", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false, survival: true } });
  const S = gameMod.state;
  const me = S.player;
  const W = tuningMod.water;
  const bag = inventoryMod.bagOf(me);
  // The kit's skin is full of clean water.
  const kitSkin = bag.items.find((e) => e.id === "waterskin");
  assert(kitSkin && kitSkin.fill === 100 && kitSkin.clean === true, `the kit's skin: ${JSON.stringify(kitSkin)}`);
  assert(itemInfoMod.textOf(itemInfoMod.cardFor(kitSkin)).includes("Clean water."), `the kit skin's card: ${itemInfoMod.textOf(itemInfoMod.cardFor(kitSkin)).join(" | ")}`);
  assert(W.clean.length === 0, "a fixed source is clean");
  // Open ground with a water tile near it.
  let wet = null;
  const [bx, by, bw, bh] = json.bounds;
  for (let y = by; y < by + bh && !wet; y += 1) for (let x = bx; x < bx + bw && !wet; x += 1) {
    mapMod.ensureAround(x, y, 0);
    if (!mapMod.drinkableAt(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!wet && mapMod.isWalkableTile(x + dx, y + dy) && !mapMod.drinkableAt(x + dx, y + dy) && !mapMod.tileAt(x + dx, y + dy).prop) wet = { water: [x, y], stand: [x + dx, y + dy] };
  }
  assert(wet, "no water with a bank in the valley");
  me.gx = wet.stand[0];
  me.gy = wet.stand[1];
  mapMod.ensureAround(me.gx, me.gy, 2);
  const finish = () => { for (let i = 0; i < 600 && me.action; i++) interactMod.updateAction(me, 0.1); };
  // The auto-sip takes only clean water.
  me.thirst = 20;
  const tainted = itemsMod.makeEntry("waterskin", 1, { fill: 60 });
  kitSkin.fill = 0;
  inventoryMod.stow(me, tainted);
  assert(playerMod.autoDrink(me) === null && tainted.fill === 60, "the auto-sip drank tainted water");
  kitSkin.fill = 80;
  assert(playerMod.autoDrink(me) === kitSkin && kitSkin.fill < 80, "the auto-sip did not drink the clean skin");
  // Mixing taints: the clean skin topped up at the water is tainted all through; the bucket too.
  const tile = { kind: "tile", tile: wet.water };
  const fillLabel = interactMod.actionsForTarget(tile, me).map((a) => a.label).find((l) => l.startsWith("Fill waterskins"));
  const drinkLabel = interactMod.actionsForTarget(tile, me).map((a) => a.label).find((l) => l.startsWith("Drink from"));
  assert(drinkLabel === "Drink from the water (tainted)", `the water's Drink: ${drinkLabel}`);
  interactMod.performByLabel(me, tile, fillLabel);
  finish();
  assert(kitSkin.fill === 100 && !kitSkin.clean && tainted.fill === 100, `filling at the water did not taint the clean skin: ${JSON.stringify(kitSkin)}`);
  assert(itemInfoMod.textOf(itemInfoMod.cardFor(kitSkin)).includes("Tainted water: drinking it may make you Sick."), "the tainted skin's card");
  assert(interactMod.itemMenu(me, kitSkin, bag, null).some((m) => m.label === "Drink (tainted, 100%)"), "Drink lost its (tainted)");
  const bucket = itemsMod.makeEntry("bucket", 1, { fill: 0, clean: true });
  inventoryMod.stow(me, bucket);
  const r0 = verbsMod.run("fill", worldMod.world, me, { tile: wet.water, entry: bucket.uid });
  assert(r0.ok && bucket.fill === 100 && !bucket.clean, `the bucket filled at the water stayed clean: ${r0.reason || JSON.stringify(bucket)}`);
  assert(itemInfoMod.textOf(itemInfoMod.cardFor(bucket)).includes("Tainted water."), "the bucket's card");
  inventoryMod.detach(me, bucket);
  // A source's Drink and a skin's each roll twice; a clean sip not at all.
  const rolls = (fn) => { rng.seed(11); fn(); const next = rng.float(); rng.seed(11); const seq = [rng.float(), rng.float(), rng.float()]; return seq.indexOf(next); };
  me.sick = null;
  assert(rolls(() => { me.thirst = 10; interactMod.performByLabel(me, tile, drinkLabel); finish(); }) === 2, "a source's tainted Drink did not roll twice");
  me.sick = null;
  me.thirst = 10;
  assert(rolls(() => playerMod.drink(me, tainted)) === 2, "a skin's tainted sip did not roll twice");
  const clean = itemsMod.makeEntry("waterskin", 1, { fill: 100, clean: true });
  me.thirst = 10;
  assert(rolls(() => playerMod.drink(me, clean)) === 0, "a clean sip rolled");
  // The rolls: Sick at sickChance, then a stack and its time a drink, up to three, the time capped; the infection at its chance.
  me.sick = null;
  me.infection = null;
  const day = W.sickDays * clock.DAY_LENGTH;
  assert(sickMod.taintedDrink(me, W.sickChance + 0.01, 0.5).sick === false && !me.sick, "a roll over the chance made you Sick");
  assert(sickMod.taintedDrink(me, 0, 0.5).sick === true && me.sick.stacks === 1 && me.sick.left === day, `Sick began: ${JSON.stringify(me.sick)}`);
  me.sick.left -= 10;
  assert(sickMod.taintedDrink(me, 0.99, 0.5).worse === true && me.sick.stacks === 2 && me.sick.left === 2 * day - 10, `a second drink: ${JSON.stringify(me.sick)}`);
  sickMod.taintedDrink(me, 0.99, 0.5);
  sickMod.taintedDrink(me, 0.99, 0.5);
  assert(me.sick.stacks === 3 && me.sick.left === 3 * day, `three stacks and a day and a half at most: ${JSON.stringify(me.sick)}`);
  assert(!me.infection && sickMod.taintedDrink(me, 0.99, W.infectionChance + 0.001).infected === false && !me.infection, "a roll over the infection's chance infected");
  assert(sickMod.taintedDrink(me, 0.99, 0).infected === true && !!me.infection, "a roll of 0 did not infect");
  me.infection = null;
  // Over many drinks, about a fifth make you Sick and about one in a hundred infect.
  rng.seed(5);
  let nSick = 0;
  let nInf = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const p = { sick: null, infection: null, dead: false };
    const r = sickMod.taintedDrink(p);
    if (r.sick) nSick++;
    if (r.infected) nInf++;
  }
  assert(Math.abs(nSick / N - W.sickChance) < 0.015 && Math.abs(nInf / N - W.infectionChance) < 0.004, `Sick ${nSick / N}, infection ${nInf / N}`);
  // The effects: tiredness 1.5 times as fast, food 0.75 of its heal; the stacks do not grow them.
  me.sick = { stacks: 1, left: 100 };
  assert(sickMod.tiredMult(me) === W.sickTiredMult && sickMod.healMult(me) === W.sickHealMult, "Sick's effects");
  me.sick = { stacks: 3, left: 100 };
  assert(sickMod.tiredMult(me) === W.sickTiredMult, "the stacks grew the effects");
  me.hp = 50;
  playerMod.eat(me, { heal: 4 });
  assert(Math.abs(me.hp - (50 + 4 * W.sickHealMult)) < 1e-9, `food healed ${me.hp - 50} Sick`);
  me.tired = 50;
  me.sleeping = null;
  const t0 = me.tired;
  playerMod.updatePlayer(me, 1);
  const drainSick = t0 - me.tired;
  me.sick = null;
  me.tired = 50;
  playerMod.updatePlayer(me, 1);
  const drainWell = 50 - me.tired;
  assert(Math.abs(drainSick - drainWell * W.sickTiredMult) < 1e-9, `tiredness ${drainSick} Sick against ${drainWell} well`);
  // The debuff: its row, its card, its stacks, and its end in the host's step.
  me.sick = { stacks: 2, left: 400 };
  const d = debuffsMod.activeDebuffs(me).find((q) => q.id === "sick");
  assert(d && d.stacks === 2 && d.time === "7m" && d.name === "Sick", `the row: ${JSON.stringify(d)}`);
  const card = debuffsMod.cardOf(d);
  const cardText = card.lines.map((l) => l.map((s) => s.t).join("")).join(" ");
  assert(card.kind === "Debuff" && /×2/.test(card.state) && /7m left/.test(card.state) && /Tiredness builds 50% faster\./.test(cardText) && /Food heals 25% less\./.test(cardText), `the card: ${card.state} | ${cardText}`);
  me.sick = { stacks: 1, left: 0.5 };
  for (let i = 0; i < 60; i++) gameMod.step(1 / 60, null);
  assert(me.sick === null, `Sick did not end in the host's step: ${JSON.stringify(me.sick)}`);
  // The infection's third stage is Queasy, not Sick.
  const inf = moodlesMod.MOODLES.find((m) => m.id === "infection");
  assert(inf.stages[2].name === "Queasy" && !inf.stages.some((s) => s.name === "Sick"), `the stages: ${inf.stages.map((s) => s.name).join(", ")}`);
  // Boiling: a lit campfire beside the player on open ground.
  let spot = null;
  const [sx0, sy0] = S.info.spawn;
  for (let y = sy0 - 40; y < sy0 + 40 && !spot; y += 2) for (let x = sx0 - 40; x < sx0 + 40 && !spot; x += 2) {
    mapMod.ensureAround(x, y, 1);
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 2 && ok; dx++) ok = mapMod.isWalkableTile(x + dx, y + dy) && !mapMod.tileAt(x + dx, y + dy).prop && mapMod.tileAt(x + dx, y + dy).room === 0 && !mapMod.drinkableAt(x + dx, y + dy);
    if (ok) spot = [x, y];
  }
  assert(spot, "no open ground in the valley");
  me.gx = spot[0];
  me.gy = spot[1];
  const fire = mapMod.createProp({ sprite: "campfire", tile: [spot[0] + 1, spot[1]], fuel: 3, lit: true });
  mapMod.placeProp(fire, spot[0] + 1, spot[1]);
  assert(fire.fire.cooks && fire.fire.lit, "the campfire is not a lit cooking fire");
  for (const e of [...bag.items]) if (e.id === "waterskin") inventoryMod.detach(me, e);
  const skinA = itemsMod.makeEntry("waterskin", 1, { fill: 40 });
  const skinB = itemsMod.makeEntry("waterskin", 1, { fill: 90 });
  inventoryMod.stow(me, skinA);
  inventoryMod.stow(me, skinB);
  const onFire = { kind: "prop", id: fire.id };
  const fireLabels = () => interactMod.actionsForTarget(onFire, me).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}`);
  // The skin's menu: Boil water, which starts the bar; the fill is kept and the entry is clean at its end.
  const boilOf = (e) => interactMod.itemMenu(me, e, bag, null).find((m) => m.label.startsWith("Boil water"));
  assert(boilOf(skinA) && boilOf(skinA).enabled && boilOf(skinA).label === "Boil water", `the skin's menu: ${boilOf(skinA) && boilOf(skinA).label}`);
  boilOf(skinA).onSelect();
  assert(me.action && me.action.action.duration === W.boilSeconds && me.action.action.label === "Boil water", "the skin's menu did not start a bar of boilSeconds");
  const sync0 = gameMod.syncParts().players;
  finish();
  assert(skinA.clean === true && skinA.fill === 40, `the skin's menu did not boil it: ${JSON.stringify(skinA)}`);
  assert(gameMod.syncParts().players !== sync0, "a boiled skin did not move the players' sync part");
  assert(!boilOf(skinA), "a clean skin still offers Boil water");
  // The fire's menu: the fullest tainted skin first.
  assert(fireLabels().includes("Boil water"), `the fire's menu: ${fireLabels().join(", ")}`);
  interactMod.performByLabel(me, onFire, "Boil water");
  assert(me.action && me.action.action.duration === W.boilSeconds, "the fire's menu did not start the bar");
  finish();
  assert(skinB.clean === true && skinB.fill === 90, `the fire's menu did not boil the fullest skin: ${JSON.stringify(skinB)}`);
  assert(fireLabels().includes("Boil water (no tainted water carried) [off]"), `greyed with why: ${fireLabels().join(", ")}`);
  // Use: the skin on the fire, the same bar.
  const skinC = itemsMod.makeEntry("waterskin", 1, { fill: 70 });
  inventoryMod.stow(me, skinC);
  useMod.applyWith(skinC, { kind: "prop", prop: fire }, me);
  assert(me.action && me.action.action.duration === W.boilSeconds, "Use on the fire did not start the bar");
  finish();
  assert(skinC.clean === true && skinC.fill === 70, `Use did not boil it: ${JSON.stringify(skinC)}`);
  // A guest's way: the menu's label by uid, and the Use command by the fire's id.
  const skinD = itemsMod.makeEntry("waterskin", 1, { fill: 50 });
  inventoryMod.stow(me, skinD);
  assert(invActionsMod.performItemCommand(me, { op: "menu", label: "Boil water", uid: skinD.uid, src: { kind: "bag", bag: { mine: true } } }) === true && me.action, "a guest's menu command did not start the bar");
  finish();
  assert(skinD.clean === true, "a guest's menu command did not boil it");
  const skinE = itemsMod.makeEntry("waterskin", 1, { fill: 30 });
  inventoryMod.stow(me, skinE);
  assert(invActionsMod.performUseCommand(me, { uid: skinE.uid, src: { kind: "bag", bag: { mine: true } }, target: { kind: "prop", id: fire.id } }, null) === true && me.action, "a guest's Use command did not start the bar");
  finish();
  assert(skinE.clean === true, "a guest's Use command did not boil it");
  // The belt's menu.
  const belt = inventoryMod.beltOf(me);
  const slot = belt.findIndex((e) => !e);
  assert(slot >= 0, "no free belt slot");
  const skinF = itemsMod.makeEntry("waterskin", 1, { fill: 20 });
  belt[slot] = skinF;
  const beltBoil = interactMod.slotMenu(me, `belt:${slot}`).find((m) => m.label.startsWith("Boil water"));
  assert(beltBoil && beltBoil.enabled, "the belt's skin offers no Boil water");
  beltBoil.onSelect();
  finish();
  assert(skinF.clean === true && skinF.fill === 20, "the belt's Boil water did not boil it");
  belt[slot] = null;
  // Greyed with why, and the refusals: no lit fire in reach, an empty skin, too far, the fire out mid-bar.
  const skinG = itemsMod.makeEntry("waterskin", 1, { fill: 60 });
  inventoryMod.stow(me, skinG);
  me.gx = spot[0] - 6;
  assert(boilOf(skinG).label === "Boil water (no lit fire in reach)" && !boilOf(skinG).enabled, `greyed: ${boilOf(skinG).label}`);
  const far = verbsMod.run("boil", worldMod.world, me, { prop: fire.id, entry: skinG.uid }, { timed: true });
  assert(!far.ok && far.reason === "Too far away.", `too far: ${far.reason}`);
  me.gx = spot[0];
  const empty = itemsMod.makeEntry("waterskin", 1, { fill: 0 });
  inventoryMod.stow(me, empty);
  assert(!boilOf(empty), "an empty skin offers Boil water");
  const r1 = verbsMod.run("boil", worldMod.world, me, { prop: fire.id, entry: empty.uid }, { timed: true });
  assert(!r1.ok && r1.reason === "The waterskin is empty.", `empty: ${r1.reason}`);
  boilOf(skinG).onSelect();
  mapMod.setFireLit(fire, false); // a campfire is no switch: put it out by hand as the putout verb does
  finish();
  assert(!skinG.clean, "a skin boiled though the fire went out mid-bar");
  assert(!fireLabels().some((l) => l.startsWith("Boil water")), "an unlit fire offers Boil water");
  const r2 = verbsMod.run("boil", worldMod.world, me, { prop: fire.id, entry: skinG.uid }, { timed: true });
  assert(!r2.ok && r2.reason === "The fire is out.", `out: ${r2.reason}`);
  // The sync parts carry `sick`; the save keeps `clean` and `sick`.
  me.sick = null;
  const p0 = gameMod.syncParts().players;
  me.sick = { stacks: 2, left: 300 };
  assert(gameMod.syncParts().players !== p0, "Sick did not move the players' sync part");
  const saved = JSON.parse(JSON.stringify(gameMod.serialize()));
  gameMod.restore(saved, json);
  const back = gameMod.state.player;
  const bb = inventoryMod.bagOf(back).items.filter((e) => e.id === "waterskin");
  assert(back.sick && back.sick.stacks === 2 && back.sick.left === 300 && bb.some((e) => e.clean && e.fill === 90) && bb.some((e) => !e.clean && e.fill === 60), `the save: ${JSON.stringify(back.sick)} ${JSON.stringify(bb.map((e) => [e.fill, !!e.clean]))}`);
  return `Sick ${(nSick / N * 100).toFixed(1)}%, infection ${(nInf / N * 100).toFixed(2)}% over ${N} drinks; boiled by the skin's menu, the fire's, Use, a guest's two commands, the belt; greyed and refused with why; the sync parts; the save`;
});

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(`${results.length - failed} of ${results.length} pass`);
process.exit(failed ? 1 : 0);
