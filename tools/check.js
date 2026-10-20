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
