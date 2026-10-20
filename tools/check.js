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
  for (let y = by; y < by + bh && !door; y++) for (let x = bx; x < bx + bw && !door; x++) { const w = mapMod.tileAt(x, y).n; if (w && w.kind === "door" && !w.broken) door = w; }
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
      if (!(p.container || stationsMod.stationOf(p) || getDef(p.sprite).sleep)) continue;
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

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(`${results.length - failed} of ${results.length} pass`);
process.exit(failed ? 1 : 0);
