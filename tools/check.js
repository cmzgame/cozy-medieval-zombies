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
const cutawayMod = await import("../src/render/cutaway.js"); // the cutaway's geometry (Michael, 2026-10-30), pure
const plansMod = await import("../src/plans.js"); // the Planning tool's rulers (Michael, 2026-10-30)
const pathfind = await import("../src/pathfind.js");
const oldPathfinder = await import("./pathbench.js"); // the old pathfinder, kept there as it was (#124); importing it runs no bench

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

check("pathfind: the memory kept between searches leaves no trace, grows, and survives a search inside a search (#124)", () => {
  const canStep = (x, y, nx, ny) => {
    if (nx < 0 || ny < 0 || nx > 12 || ny > 12) return false;
    if ((x < 5 && nx >= 5) || (x >= 5 && nx < 5)) return Math.max(y, ny) >= 9 && Math.min(y, ny) >= 9;
    return true;
  };
  // A search that outgrows the workspace partway and still finds its way: a wall along x = 5 from y = -60 to 60, the gap at its end. The
  // arrays double mid-search (more nodes touched than there was room for when it began) and the path is the old pathfinder's, tile for tile.
  const cap0 = pathfind.workspaceStats().capacity;
  const walled = (x, y, nx, ny) => !((x < 5) !== (nx < 5) && Math.min(y, ny) < 60) && Math.abs(nx) <= 200 && Math.abs(ny) <= 200;
  const grownPath = pathfind.findPath([0, 0], [10, 0], walled, 100000);
  const grownNodes = pathfind.workspaceStats().lastNodes;
  assert(grownPath && grownPath.length > 100, `the search round the wall found ${grownPath ? grownPath.length + " tiles" : "nothing"}`);
  assert(grownNodes > cap0 && pathfind.workspaceStats().capacity > cap0, `the search touched ${grownNodes} nodes with room for ${cap0}: it never grew mid-search`);
  assert(JSON.stringify(grownPath) === JSON.stringify(oldPathfinder.oldFindPath([0, 0], [10, 0], walled, 100000)), "the path found while growing is not the old pathfinder's");
  const first = JSON.stringify(pathfind.findPath([2, 2], [9, 2], canStep, 1500));
  const firstNodes = pathfind.workspaceStats().lastNodes;
  // A failed search fills the arrays; the same search again is the same path.
  pathfind.findPath([2, 2], [9, 2], (x, y, nx, ny) => nx !== 5 && ny >= 0 && nx >= 0 && ny <= 12 && nx <= 12, 1500);
  assert(JSON.stringify(pathfind.findPath([2, 2], [9, 2], canStep, 1500)) === first, "a search after another found another path");
  // An open field far out in the wild (every tile walkable): the path is straight.
  const open = () => true;
  const far = pathfind.findPath([-3000, 7000], [-2900, 7060], open, 20000);
  assert(far && far.length === 100, `the long open path is ${far && far.length} tiles, not 100`);
  const wide = pathfind.findPath([0, 0], [400, 400], (x, y, nx, ny) => Math.abs(nx) < 200, 6000);
  assert(wide === null, "a search past its bound found a path");
  const cap = pathfind.workspaceStats().capacity;
  assert(cap >= 6000, `the workspace holds ${cap} nodes after a search of 6000 expansions`);
  assert(JSON.stringify(pathfind.findPath([2, 2], [9, 2], canStep, 1500)) === first, "the grown workspace found another path");
  // A canStep that searches: the inner search has its own memory, and both answer as alone.
  let inner = null;
  const nesting = (x, y, nx, ny) => {
    if (!inner) inner = JSON.stringify(pathfind.findPath([2, 2], [9, 2], canStep, 1500));
    return canStep(x, y, nx, ny);
  };
  assert(JSON.stringify(pathfind.findPath([2, 2], [9, 2], nesting, 1500)) === first, "the outer search changed with a search inside it");
  assert(inner === first, "the inner search found another path");
  // A canStep that throws leaves the shared memory free: the next search runs in it (its node count is the shared workspace's, as the
  // same search's was before), not in a workspace of its own as a search inside a search would.
  let threw = false;
  try { pathfind.findPath([2, 2], [9, 2], () => { throw new Error("x"); }, 1500); } catch { threw = true; }
  assert(threw && !pathfind.workspaceStats().busy, "the shared workspace is still held after a canStep threw");
  const thrownNodes = pathfind.workspaceStats().lastNodes;
  assert(thrownNodes !== firstNodes, `the thrown search left ${thrownNodes} nodes, as many as the search after it will: the next row proves nothing`);
  assert(JSON.stringify(pathfind.findPath([2, 2], [9, 2], canStep, 1500)) === first, "a search after a throw found another path");
  assert(pathfind.workspaceStats().lastNodes === firstNodes, `the search after a throw did not run in the shared workspace (it holds ${pathfind.workspaceStats().lastNodes} nodes, the search touches ${firstNodes})`);
  return `grew from ${cap0} to room for ${pathfind.workspaceStats().capacity} nodes mid-search (${grownNodes} touched, ${grownPath.length} tiles round a wall, the old pathfinder's path); freed after a throw`;
});

check("pathfind: the reused memory finds the old pathfinder's paths on the valley, tile for tile (#124, tools/pathbench.js)", () => {
  const out = execFileSync(process.execPath, [path.join(root, "tools/pathbench.js"), "400", "--quiet"], { encoding: "utf8" });
  const line = out.trim().split("\n").pop();
  assert(/paths identical/.test(line), line);
  return line.replace(/^pathbench: /, "");
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
check("the save's version is 4 (docs/49 step 1, the map in layers) and every world saved before it is refused, as worlds are expendable (2026-10-17)", () => {
  assert(save.VERSION === 4, `VERSION ${save.VERSION}`);
  for (const v of [1, 2, 3]) assert(save.upgrade({ version: v, map: {}, characters: {} }) === null, `a version-${v} save was not refused`);
  const now = save.upgrade({ version: 4, map: {}, characters: {}, rules: { survival: true } });
  assert(now && now.version === 4 && now.rules.survival === true, "a version-4 save was not taken as it is");
  assert(save.upgrade({ version: 5, map: {}, characters: {} }) === null, "a newer save was not refused");
  assert(save.upgrade({ map: {} }) === null, "a save with no version was not refused");
  return "versions 1 to 3 refused (no migration), 4 taken, a newer or unversioned save refused";
});

// The doors of every authored map stand clear (#134): the dead who want a room go for its door and must be able to stand
// beside it, so no prop stands on either tile of a door (a chair just past a partition door once left a window the only
// way in, and a window is never one). The generator (tools/mapgen/valley.py) keeps to it; this is the proof.
const { bootData } = await import("../server/boot.js");
const netMod = await import("../src/net.js");
const loopMod = await import("../src/loop.js");
const mapMod = await import("../src/map.js");
const gameMod = await import("../src/game.js");
const kitModule = await import("../src/kit.js");
const worldMod = await import("../src/world.js");
const chartModule = await import("../src/chart.js");
const floatersMod = await import("../src/floaters.js");
const itemInfoMod = await import("../src/item-info.js");
const smallTextMod = await import("../src/ui/small-text.js");
const smallTextScan = await import("./small-text-scan.js"); // the scan the "small text" row runs (#321, #324)
const rugsImport = await import("../src/rugs.js");
const woodsImport = await import("../src/woods.js");
const placementImport = await import("../src/placement.js");
const rulesImport = await import("../src/rules.js");
const inventoryMod = await import("../src/inventory.js");
const itemsMod = await import("../src/items.js");
const playerMod = await import("../src/entities/player.js");
const characterMod = await import("../src/entities/character.js");
const paintingsMod = await import("../src/paintings.js");
const setdownMod = await import("../src/setdown.js");
const campfireMod = await import("../src/campfire.js");
const verbsMod = await import("../src/verbs.js");
const netsmoothTool = await import("./netsmooth.js");
const archeryMod = await import("../src/archery.js");
const visibilityMod = await import("../src/visibility.js");
const { lineOfSight } = visibilityMod;
const { getDef } = await import("../src/assets.js");
const stationsMod = await import("../src/stations.js");
const clientMod = await import("../src/client.js"); // the client's own side, which a world made headless still feeds by its picks (#102)
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
// The duplication count (#101): every item in the world counted, a move between a bag and the floor changing no count, an entry held in
// two places caught with both places named, one gone moving the items part, and the two places that are one thing by design (a
// two-handed thing in both hands, a searched body's grid and its worn slots) counted once; the parts fit the host's cap on a report.
check("sync: the item census counts every item once, keeps a move, and catches an entry held twice or gone (#101)", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const S = gameMod.state;
  const a = S.player;
  const b = gameMod.addPlayer(a.gx + 5, a.gy, {});
  const c0 = gameMod.itemCensus();
  assert(c0.dups.length === 0, `a fresh world holds ${c0.dups.length} entries twice: ${JSON.stringify(c0.dups.slice(0, 3))}`);
  assert(c0.entries > 0 && c0.units >= c0.entries, `the census found ${c0.entries} entries, ${c0.units} units`);
  const p0 = gameMod.syncParts();
  assert(p0.items === gameMod.hashOf(c0.text) && p0.living === gameMod.hashOf(c0.livingText) && /0 too deep, 0 held twice$/.test(p0.census), `the parts are ${p0.items} / ${p0.living} / ${p0.census}`);
  const keys = Object.keys(p0);
  assert(keys.length <= 16 && keys.every((k) => String(p0[k]).length <= 200), `a guest's report would be cut: ${keys.length} parts, longest ${Math.max(...keys.map((k) => String(p0[k]).length))}`);
  // A move: an entry from a's bag to the floor, then back into b's bag. No count changes and nothing is held twice.
  const bagA = inventoryMod.bagOf(a);
  const bagB = inventoryMod.bagOf(b);
  const e = bagA.items[0];
  bagA.items.splice(0, 1);
  const lying = mapMod.dropItem(Math.round(a.gx), Math.round(a.gy), e);
  const c1 = gameMod.itemCensus();
  assert(c1.text === c0.text && c1.dups.length === 0, `a move to the floor changed the census: ${c1.summary}`);
  const t = mapMod.tileAt(Math.round(a.gx), Math.round(a.gy));
  t.items.splice(t.items.indexOf(lying), 1);
  bagB.items.push({ ...lying });
  const c2 = gameMod.itemCensus();
  assert(c2.text === c0.text && c2.dups.length === 0, `a move into another bag changed the census: ${c2.summary}`);
  // A copy left behind: the same uid in two bags is caught, with both places.
  bagA.items.push({ ...lying });
  const c3 = gameMod.itemCensus();
  assert(c3.dups.length === 1 && c3.dups[0].uid === lying.uid && c3.dups[0].places.length === 2, `a duplicated entry was not caught: ${c3.summary}`);
  assert(c3.dups[0].places.some((w) => w.includes(a.id)) && c3.dups[0].places.some((w) => w.includes(b.id)), `the places are ${c3.dups[0].places.join(" / ")}`);
  assert(/1 held twice: /.test(gameMod.syncParts().census) && c3.text !== c0.text, `the census part says ${gameMod.syncParts().census}`);
  bagA.items.pop();
  // One gone: the items part moves.
  const gone = bagB.items.pop();
  assert(gameMod.syncParts().items !== p0.items, "an entry gone did not move the items part");
  bagB.items.push(gone);
  assert(gameMod.syncParts().items === p0.items, "the entry back did not bring the items part back");
  // A two-handed thing in both hands: counted once, as one object (the host's) or as one uid in two objects (a replica's); a one-handed
  // thing's uid in both hands is two places.
  const hands0 = { ...b.hands };
  b.hands.main = null;
  b.hands.off = null;
  const before = gameMod.itemCensus();
  const halberd = itemsMod.makeEntry("halberd", 1);
  assert(itemsMod.handFor("halberd") === "both", "the halberd is not two-handed");
  b.hands.main = halberd;
  b.hands.off = halberd;
  const both = gameMod.itemCensus();
  assert(both.dups.length === 0 && both.units === before.units + 1, `a two-handed thing counted ${both.units - before.units} times, ${both.dups.length} held twice`);
  b.hands.off = { ...halberd }; // the replica's copy: two objects, one uid
  const replica = gameMod.itemCensus();
  assert(replica.units === before.units + 1 && replica.dups.length === 0, "a replica's two-handed thing counted twice");
  const plank = itemsMod.makeEntry("plank", 1);
  b.hands.main = plank;
  b.hands.off = { ...plank };
  const oneHanded = gameMod.itemCensus();
  assert(oneHanded.dups.length === 1 && oneHanded.dups[0].uid === plank.uid, `a one-handed thing's uid in both hands was not caught: ${oneHanded.summary}`);
  b.hands.main = hands0.main;
  b.hands.off = hands0.off;
  // A searched body: its grid holds what it wore, and its worn slots still point at those entries (and at what is taken from it). The
  // living's garments are their own part, so the whole count is compared here.
  const all = (c) => [...c.totals].sort((p, q) => (p[0] < q[0] ? -1 : 1)).join(";");
  const z = S.zombies.find((q) => Object.values(q.worn).some(Boolean));
  assert(z, "none of the dead wears anything");
  z.lootTable = null; // no roll: the search lays out only what it has
  const unsearched = gameMod.itemCensus();
  const grid = characterMod.lootOf(z);
  const searched = gameMod.itemCensus();
  assert(all(searched) === all(unsearched) && searched.dups.length === 0, `a search changed the census: ${unsearched.summary} to ${searched.summary}`);
  const taken = grid.items.find((q) => q.uid);
  grid.items.splice(grid.items.indexOf(taken), 1);
  bagB.items.push(taken);
  const moved = gameMod.itemCensus();
  assert(all(moved) === all(unsearched) && moved.dups.length === 0, `a garment taken from a body changed the census: ${moved.summary}`);
  assert(moved.text !== unsearched.text && moved.livingText !== unsearched.livingText, "a garment from the living into a bag moved neither the held count nor the living's");
  // What stands or hangs as an item: a rug laid, a painting hung, a torch put on a wall with its bracket (#523), a torch post, a snare, and a campfire
  // set down, each by its own verb from a's bag, keep every count (each one unit of its item, held by "placed"); picked up again, the same.
  a.worn.back = itemsMod.makeEntry("dev_bag", 1); // room for a 5 by 5 campfire beside the rest
  mapMod.ensureAround(a.gx, a.gy, 3);
  let at = null;
  for (let dy = -36; dy <= 36 && !at; dy++) for (let dx = -36; dx <= 36 && !at; dx++) {
    const x = Math.round(a.gx) + dx;
    const y = Math.round(a.gy) + dy;
    let ok = true;
    for (let ay = -2; ay < 10 && ok; ay++) for (let ax = -1; ax < 13 && ok; ax++) { const tt = mapMod.peekTile(x + ax, y + ay); ok = !!tt && tt.floor === "floor_grass" && !tt.prop && !tt.rug && !tt.n && !tt.w && !(tt.items && tt.items.length); }
    if (ok) at = [x, y];
  }
  assert(at, "no bare grass for the placed things");
  const [x, y] = at;
  for (let i = 0; i < 10; i++) mapMod.buildWall(x + i, y, "n", "wall");
  const stow = (id) => { const en = itemsMod.makeEntry(id, 1); assert(inventoryMod.stow(a, en), `${id} did not fit the bag`); return en; };
  const standAt = (gx, gy) => { a.gx = gx; a.gy = gy; };
  const ids = ["rug_bearskin", "painting_small_oak", "torch", "torch_post", "snare", "campfire"];
  const ents = Object.fromEntries(ids.map((id) => [id, stow(id)]));
  const count = (c, id) => (c.totals.get(id) || 0);
  const held0 = gameMod.itemCensus();
  const check0 = (what) => {
    const c = gameMod.itemCensus();
    const moved = ids.filter((id) => count(c, id) !== count(held0, id)).map((id) => `${id} ${count(held0, id)} to ${count(c, id)}`);
    assert(c.text === held0.text && c.dups.length === 0, `${what} changed the count: ${moved.join(", ") || c.summary}`);
    return c;
  };
  standAt(x + 2, y + 1);
  assert(paintingsMod.hang(a, ents.painting_small_oak.uid, x + 1, y, "n") === true, "the painting was not hung");
  check0("a painting hung");
  standAt(x + 5, y + 1);
  assert(setdownMod.mountTorch(a, ents.torch.uid, x + 5, y, "n") === true, "the torch was not put on the wall");
  check0("a torch put on a wall with its bracket (#523)");
  const br = mapMod.peekTile(x + 5, y).n.bracket;
  assert(br && br.made && br.torch && br.uid === ents.torch.uid && !inventoryMod.carriedEntry(a, ents.torch.uid), `the torch on the wall did not keep its entry's uid: ${JSON.stringify(br)}`);
  standAt(x + 2, y + 4);
  assert(rugsImport.placeRug(a, ents.rug_bearskin.uid, x + 1, y + 3, "y") === true, "the rug was not laid");
  check0("a rug laid");
  standAt(x + 8, y + 4);
  assert(setdownMod.place(a, ents.torch_post.uid, x + 8, y + 3) === true, "the torch post was not set down");
  check0("a torch post set down");
  standAt(x + 10, y + 4);
  assert(setdownMod.place(a, ents.snare.uid, x + 10, y + 3) === true, "the snare was not set down");
  const placedCensus = check0("a snare set down");
  standAt(x + 8, y + 7);
  assert(campfireMod.place(a, ents.campfire.uid, x + 8, y + 6) === true, "the campfire was not set down");
  const lastPlaced = check0("a campfire set down");
  assert(ids.every((id) => (lastPlaced.groups.placed.get(id) || 0) === (held0.groups.placed.get(id) || 0) + 1), `the placed hold ${JSON.stringify([...lastPlaced.groups.placed])}, before ${JSON.stringify([...held0.groups.placed])}`);
  standAt(x + 10, y + 4);
  assert(setdownMod.pickUp(a, mapMod.peekTile(x + 10, y + 3).prop) === true, "the snare was not picked up");
  check0("a snare picked up");
  standAt(x + 5, y + 1);
  const mounted = [...mapMod.brackets()].find((b) => b.wall === mapMod.peekTile(x + 5, y).n);
  assert(setdownMod.pickUpTorch(a, mounted) === true, "the torch on the wall was not picked up");
  check0("the torch on the wall picked up");
  const back = inventoryMod.carriedEntry(a, ents.torch.uid);
  assert(back && back.id === "torch" && !back.lit && !mapMod.peekTile(x + 5, y).n.bracket && ![...mapMod.brackets()].some((b) => b.wall === mapMod.peekTile(x + 5, y).n), "the torch did not come back as itself, or its bracket stayed");
  assert(placedCensus.dups.length === 0, "the placed things were held twice");
  return `${c0.summary.replace(/, 0 too deep, 0 held twice$/, "")}; a move kept, a copy caught at ${c3.dups[0].places.join(" and ")}, one gone moved the part, a two-handed thing and a body counted once, a one-handed uid in both hands caught, six placed things kept and two picked up (the torch on the wall back with its own uid, its bracket gone)`;
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
// The dev chest (Michael, 2026-10-26, the demo pass): grid.fill drops what does not fit, so the whole fixed list is proved to fit its grid by placement.
const devGridMod = await import("../src/grid.js");
check("dev chest: every thing in the Developer Chest's list fits its grid by placement", () => {
  const [c, r] = itemsMod.containerGrid("dev_kit");
  const bag = inventoryMod.createBag(c, r, "chest");
  const loose = itemsMod.rollLoot("dev_kit");
  const left = loose.filter(({ id, count, ...props }) => devGridMod.add(bag, id, count, props) !== (count || 1)).map((e) => e.id); // a stack only part placed is a miss
  assert(left.length === 0, `${left.length} things do not fit the ${c} by ${r} grid: ${left.join(", ")}`);
  const cells = bag.items.reduce((n, e) => n + itemsMod.getItem(e.id).size[0] * itemsMod.getItem(e.id).size[1], 0);
  return `${bag.items.length} entries in ${cells} of ${c * r} cells`;
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
// Arrows on a guest (#250): each flight's launch sent once and stepped there every step, not drawn where each frame (every third step) put it.
check("net: a guest's arrow moves every step whatever the frames' arrival (no stopped steps, a spread under 0.2 a step), first drawn within a step of the bow", () => {
  const lines = [];
  for (const p of netsmoothTool.PATTERNS) {
    const r = netsmoothTool.measureArrows(p, archeryMod);
    assert(r.now.still === 0 && r.now.move.sd < 0.2 && Math.abs(r.now.move.mean - 1) < 0.02, `${p}: stood still ${r.now.still} steps, spread ${r.now.move.sd.toFixed(2)}, mean ${r.now.move.mean.toFixed(2)}`);
    assert(r.now.flights === r.flights, `${p}: ${r.now.flights} of ${r.flights} flights drawn`);
    assert(r.old.still > r.old.steps / 2, `${p}: the old way stood still only ${r.old.still} of ${r.old.steps} steps: the measurement is not measuring it`);
    lines.push(`${p.slice(0, 14)} ${r.old.still} of ${r.old.steps} stopped steps to ${r.now.still}`);
  }
  const steady = netsmoothTool.measureArrows("steady", archeryMod);
  assert(steady.now.first.max <= 1 + 1e-9, `first drawn ${steady.now.first.max.toFixed(2)} steps' flight from the bow on a steady wire`);
  return lines.join("; ");
});
// A guest's flight is the host's: stepped from its launch record with the host's own pose, it is where the host's flight is at every age (to a
// thousandth of a tile, the record's rounding), its picture's angle the same, and it ends at the host's end; a fireball that bursts on one of the
// dead ends at the host's age and point and leaves its flare there; a landing point that drifted is eased onto (#250).
check("net: a flight replayed from its launch record is the host's step for step, ends where the host's did, and a fireball's flare is made there", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  const STEP = 1 / 60;
  // A way out across open ground from the spawn: the first of eight directions an arrow of 14 tiles flies down unstopped.
  const dir = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]].find((d) => { archeryMod.reset(); const t = archeryMod.shoot(me, d, 14, 1); return t.stopD == null && t.s > 10; });
  assert(!!dir, "no open ground round the spawn for 14 tiles");
  const flyAndReplay = (shoot) => {
    archeryMod.reset();
    const a = shoot();
    const host = []; // [age, gx, gy, z, frame] after each step
    for (let i = 0; i < 600 && !a.done; i++) {
      archeryMod.update(STEP);
      if (!a.done) host.push([a.t, a.gx, a.gy, a.z, a.frame]);
    }
    assert(a.done && host.length > 3, "the flight never came down");
    const h0 = 100; // any host clock: the frame after the first step
    const store = archeryMod.flightStore();
    archeryMod.applyFlights(store, { go: [archeryMod.launchRecord(a, host[0][0])] }, h0);
    let err = 0;
    let frames = 0;
    let shown = 0;
    for (let k = 0; k < host.length; k++) {
      archeryMod.stepFlights(store, h0 + (host[k][0] - host[0][0]));
      const g = store.shown[0];
      if (!g) continue;
      shown++;
      err = Math.max(err, Math.hypot(g.gx - host[k][1], g.gy - host[k][2]), Math.abs(g.z - host[k][3]) / 100);
      if (g.frame !== host[k][4]) frames++;
    }
    const endAt = h0 + (a.t - host[0][0]);
    archeryMod.applyFlights(store, { end: [archeryMod.endRecord(a)] }, endAt);
    archeryMod.stepFlights(store, endAt);
    return { a, host, store, err, frames, shown, gone: store.shown.length === 0 && store.byId.size === 0 };
  };
  const arrow = flyAndReplay(() => archeryMod.shoot(me, dir, 14, 1));
  assert(arrow.shown === arrow.host.length && arrow.err < 2e-3 && arrow.frames === 0, `the arrow: drawn ${arrow.shown} of ${arrow.host.length} steps, off by ${arrow.err.toFixed(4)} tiles at most, ${arrow.frames} steps with another angle`);
  assert(arrow.gone, "the arrow is still drawn after its end");
  // A fireball that meets one of the dead short of its landing: the guest's flight ends at the host's age, its flare at the host's point.
  const spell = itemsMod.getItem("book_of_fire").book.spell;
  const z = S.zombies.find((q) => !q.dead);
  assert(!!z, "none of the dead in the valley");
  const z0 = [z.gx, z.gy, z.hp];
  const n = Math.hypot(dir[0], dir[1]);
  z.gx = me.gx + (dir[0] / n) * 3;
  z.gy = me.gy + (dir[1] / n) * 3;
  const fire = flyAndReplay(() => archeryMod.shoot(me, dir, 8, 1, { projectile: "fireball", speed: spell.speed, flat: true, vanish: true, z0: spell.z0, contact: spell.contact, landRadius: spell.landRadius, damage: 1, knockback: 0 }));
  [z.gx, z.gy, z.hp] = z0;
  const burst = fire.a.t < fire.a.T - 1e-9;
  const flare = fire.store.flares[0];
  assert(burst, `the fireball did not burst on the one of the dead in its path (age ${fire.a.t.toFixed(3)} of ${fire.a.T.toFixed(3)})`);
  assert(fire.err < 2e-3 && fire.gone, `the fireball: off by ${fire.err.toFixed(4)}, ${fire.gone ? "gone" : "still drawn"} at the host's end`);
  assert(!!flare && Math.hypot(flare.gx - fire.a.landAt[0], flare.gy - fire.a.landAt[1]) < 1e-3, `the guest's flare ${flare ? `${flare.gx.toFixed(3)},${flare.gy.toFixed(3)}` : "none"} against the host's landing ${fire.a.landAt.map((v) => v.toFixed(3)).join(",")}`);
  // A landing point 0.3 tiles off what the guest's own numbers give: eased onto by the end, no step more than twice the flight's own.
  archeryMod.reset();
  const b = archeryMod.shoot(me, dir, 14, 1);
  for (let i = 0; i < 600 && !b.done; i++) archeryMod.update(STEP);
  const store = archeryMod.flightStore();
  archeryMod.applyFlights(store, { go: [archeryMod.launchRecord(b, 0)] }, 0);
  archeryMod.stepFlights(store, 0.1);
  const off = archeryMod.endRecord(b);
  off[2] += 0.3;
  archeryMod.applyFlights(store, { end: [off] }, 0.2);
  let last = null;
  let worst = 0;
  for (let R = 0.1 + STEP; R < b.t - 1e-9; R += STEP) {
    archeryMod.stepFlights(store, R);
    const g = store.shown[0];
    if (!g) break;
    if (last) worst = Math.max(worst, Math.hypot(g.gx - last[0], g.gy - last[1]) / (b.speed * STEP));
    last = [g.gx, g.gy];
  }
  const miss = last ? Math.hypot(last[0] - off[2], last[1] - off[3]) : Infinity;
  assert(miss < b.speed * STEP * 1.5 && worst < 2, `a drifted flight ends ${miss.toFixed(3)} tiles from the host's point, its biggest step ${worst.toFixed(2)} of its own`);
  archeryMod.reset();
  return `the arrow on the host's path to ${arrow.err.toExponential(1)} tiles over ${arrow.shown} steps; the fireball burst at ${fire.a.t.toFixed(3)} s, its flare at the host's point; a 0.3-tile drift eased in, ${miss.toFixed(3)} off at the last step`;
});
// The host's half of #250 on the wire (the review): the frames themselves, built by hostAfterStep for a guest that never speaks (net.testHost).
check("net: the frames carry each flight's launch once and its end once, and nothing when nothing flies; a fireball down in its cast step still goes, flare and all; a join sends what is in the air again", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  const STEP = 1 / 60;
  const dir = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]].find((d) => { archeryMod.reset(); const t = archeryMod.shoot(me, d, 14, 1); return t.stopD == null && t.s > 10; });
  assert(!!dir, "no open ground round the spawn for 14 tiles");
  archeryMod.reset();
  const frames = [];
  const host = netMod.testHost((m) => { if (m.type === "frame") frames.push(JSON.parse(JSON.stringify(m))); });
  const z = S.zombies.find((q) => !q.dead);
  const z0 = z ? [z.gx, z.gy, z.hp] : null;
  try {
    const step = (fn) => { loopMod.setSimTime(loopMod.simTime() + STEP); if (fn) fn(); archeryMod.update(STEP); netMod.hostAfterStep(); };
    const goes = (id) => frames.flatMap((f) => (f.arrows && f.arrows.go) || []).filter((r) => r.id === id);
    const ends = (id) => frames.flatMap((f) => (f.arrows && f.arrows.end) || []).filter((e) => e[0] === id);
    for (let i = 0; i < 9; i++) step();
    assert(frames.length >= 3 && frames.every((f) => !("arrows" in f) && !("flares" in f)), `with nothing in the air a frame still carries ${frames.find((f) => "arrows" in f || "flares" in f) ? "arrows or flares" : "nothing"}, ${frames.length} frames`);
    // An arrow: its launch in the first frame after it is loosed, its end in the first after it lands, nothing between.
    frames.length = 0;
    let a = null;
    step(() => { a = archeryMod.shoot(me, dir, 10, 1); });
    for (let i = 0; i < 300 && !a.done; i++) step();
    for (let i = 0; i < 3; i++) step();
    const carrying = frames.filter((f) => f.arrows).length;
    assert(goes(a.id).length === 1 && ends(a.id).length === 1 && carrying === 2, `the arrow: ${goes(a.id).length} launches, ${ends(a.id).length} ends, ${carrying} of ${frames.length} frames carrying flights`);
    const bytes = frames.filter((f) => f.arrows).reduce((n, f) => n + JSON.stringify(f.arrows).length, 0);
    // A fireball cast point-blank at one of the dead bursts in its cast step: its launch and its end in the same frame, and a guest makes its flare.
    assert(!!z, "none of the dead in the valley");
    const n = Math.hypot(dir[0], dir[1]);
    z.gx = me.gx + (dir[0] / n) * 0.55;
    z.gy = me.gy + (dir[1] / n) * 0.55;
    frames.length = 0;
    const spell = itemsMod.getItem("book_of_fire").book.spell;
    let b = null;
    step(() => { b = archeryMod.shoot(me, dir, 8, 1, { projectile: "fireball", speed: spell.speed, flat: true, vanish: true, z0: spell.z0, contact: spell.contact, landRadius: spell.landRadius, damage: 1, knockback: 0 }); });
    assert(b.done, "the fireball cast point-blank did not burst in its cast step");
    for (let i = 0; i < 3; i++) step();
    const fFrame = frames.find((f) => f.arrows && (f.arrows.go || []).some((r) => r.id === b.id));
    assert(goes(b.id).length === 1 && ends(b.id).length === 1 && !!fFrame && (fFrame.arrows.end || []).some((e) => e[0] === b.id), `the point-blank fireball: ${goes(b.id).length} launches, ${ends(b.id).length} ends${fFrame ? "" : ", in no frame"}`);
    const store = archeryMod.flightStore();
    for (const f of frames) archeryMod.applyFlights(store, f.arrows || null, f.simTime);
    for (let R = fFrame.simTime - 4 * STEP; R < fFrame.simTime + 30 * STEP && !store.flares.length; R += STEP) archeryMod.stepFlights(store, R);
    const fl = store.flares[0];
    assert(!!fl && Math.hypot(fl.gx - b.landAt[0], fl.gy - b.landAt[1]) < 1e-3, `the guest's flare ${fl ? `${fl.gx.toFixed(3)},${fl.gy.toFixed(3)}` : "none"} against the host's ${b.landAt.map((v) => v.toFixed(3)).join(",")}`);
    // A join: what is in the air goes again, once, and a guest that knew it keeps its own.
    frames.length = 0;
    let c = null;
    step(() => { c = archeryMod.shoot(me, dir, 14, 1); });
    for (let i = 0; i < 3; i++) step();
    host.joined();
    for (let i = 0; i < 3; i++) step();
    const again = archeryMod.flightStore();
    for (const f of frames) archeryMod.applyFlights(again, f.arrows || null, f.simTime);
    assert(goes(c.id).length === 2 && again.stats.go === 1 && again.stats.again === 1, `after a join the flight in the air went ${goes(c.id).length} times; the guest took ${again.stats.go} and knew ${again.stats.again}`);
    const born = goes(c.id).map((r) => frames.find((f) => f.arrows && (f.arrows.go || []).includes(r)).simTime - r.t);
    assert(Math.abs(born[0] - born[1]) < 1e-6, `the two launches give births ${born.map((x) => x.toFixed(4)).join(" and ")}`);
    return `nothing in an empty frame; the arrow's launch and end in 2 frames (${bytes} bytes); the point-blank fireball's both in its first frame, the flare at the host's point; a join's resend the same birth, known once`;
  } finally {
    host.done();
    archeryMod.reset();
    if (z) [z.gx, z.gy, z.hp] = z0;
  }
});
// Across a stall in the host's sim (a hit-stop, a slow frame: no frames come while the guest steps on), the guest's flights stay with the host's word.
check("net: across a 15- and a 30-step stall of the host's sim a guest draws every flight, starts each near the bow, never steps one back, never more than two steps past the host's word, and holds none after the stall", () => {
  const lines = [];
  for (const n of [15, 30]) {
    const o = netsmoothTool.measureArrowStall(n, archeryMod);
    assert(o.lost === 0 && o.firstMax <= 2 && o.backward === 0 && o.aheadMax <= 2 + 1e-3 && o.burstOver <= 1e-3 && o.stillAfter === 0, `${n} steps: ${o.lost} never drawn, first drawn ${o.firstMax.toFixed(2)} steps out, ${o.backward} backward, ${o.aheadMax.toFixed(2)} steps past the host's word, ${o.burstOver.toFixed(2)} past a burst, ${o.stillAfter} held after the stall`);
    lines.push(`${n} steps: first drawn at most ${o.firstMax.toFixed(2)} steps out, at most ${o.aheadMax.toFixed(2)} past the host's word, ${o.stillAfter} held after`);
  }
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
// A multi-tile prop across a chunk's edge (#341): recorded whole with its anchor's chunk, its tiles on the neighbour named in the neighbour's record (`parts`), so that
// chunk installed alone (a guest's frame) holds them, the sync check's map part sees a tile that lost one, the anchor's chunk installed again lets its old copy go, and
// the neighbour is marked by the placement, so it is never evicted and grown again without them.
const promptImport = await import("../src/ui/prompt.js");
const interactImport = await import("../src/interact.js");
const C341 = 16;
// A spot near (gx, gy) whose anchor is on the last column of a chunk, the w by h footprint and a ring round it bare walkable ground with no prop, rug, or wall.
function edgeSpot(gx, gy, w, h, span = 24) {
  for (let dy = -span; dy <= span; dy++) for (let dx = -span; dx <= span; dx++) {
    const x = Math.round(gx) + dx;
    const y = Math.round(gy) + dy;
    if (((x % C341) + C341) % C341 !== C341 - 1) continue;
    let ok = true;
    for (let ay = -1; ay <= h && ok; ay++) for (let ax = -1; ax <= w && ok; ax++) { const t = mapMod.peekTile(x + ax, y + ay); ok = !!t && !t.prop && !t.rug && !t.n && !t.w && mapMod.isWalkableTile(x + ax, y + ay); }
    if (ok) return [x, y];
  }
  return null;
}
const chunkOfTile = (x, y) => mapMod.getChunk(Math.floor(x / C341), Math.floor(y / C341), false);
const recOf = (x, y) => JSON.parse(JSON.stringify(mapMod.serializeChunk(chunkOfTile(x, y))));
check("chunk edge (#341): a bed and a rug across a chunk's edge: the neighbour's record names its tiles, installed alone it holds them, the sync hash sees a lost one, the anchor's chunk again lets its old copy go", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  mapMod.ensureAround(me.gx, me.gy, 3);
  const out = [];
  for (const kind of ["bed", "rug"]) {
    const at = edgeSpot(me.gx, me.gy, 2, kind === "rug" ? 3 : 1);
    assert(at, `no bare ground across a chunk's edge for the ${kind}`);
    const [x, y] = at;
    mapMod.takeTouched();
    let prop;
    if (kind === "bed") {
      prop = mapMod.createProp({ sprite: "bed", tile: [x, y], footprint: [2, 1], facing: "x" });
      mapMod.placeProp(prop, x, y);
    } else {
      const bag = inventoryMod.bagOf(me);
      bag.items.length = 0;
      const e = itemsMod.makeEntry("rug_regal_red", 1);
      inventoryMod.stow(me, e);
      me.gx = x + 0.5;
      me.gy = y + 3.6;
      const facing = rugsImport.facingsOf("rug_regal_red").find((f) => rugsImport.footprintFor("rug_regal_red", f)[0] === 2);
      assert(facing && rugsImport.placeRug(me, e.uid, x, y, facing), `the rug was not laid across the edge ("${rugsImport.reachFor(me, "rug_regal_red", facing, x, y) || rugsImport.fitProblem("rug_regal_red", facing, x, y)}")`);
      prop = mapMod.peekTile(x, y).rug;
    }
    const slot = kind === "rug" ? "rug" : "prop";
    const holds = () => prop.tiles.every(([tx, ty]) => mapMod.peekTile(tx, ty)[slot] === prop);
    const foreign = prop.tiles.filter(([tx]) => tx === x + 1);
    assert(prop && prop.tiles.length >= 2 && foreign.length >= 1 && holds(), `the ${kind} does not stand on both sides of the edge`);
    const A = chunkOfTile(x, y);
    const B = chunkOfTile(x + 1, y);
    assert(A !== B, "the spot does not cross an edge");
    // The placement marks the neighbour: it goes to a guest, and it is play-changed, never evicted.
    const touched = mapMod.takeTouched().map(([cx, cy]) => `${cx},${cy}`);
    assert(B.dirty && touched.includes(`${B.cx},${B.cy}`) && touched.includes(`${A.cx},${A.cy}`), `the neighbour was not marked (dirty ${B.dirty}, touched ${touched.join(" ")})`);
    // The records: the prop whole in its anchor's; its tiles named by id in the neighbour's.
    const recA = recOf(x, y);
    const recB = recOf(x + 1, y);
    assert(recA.props.some((p) => p.id === prop.id) && !recB.props.some((p) => p.id === prop.id), "the prop is not recorded with its anchor's chunk alone");
    assert(recB.parts && foreign.every(([tx, ty]) => recB.parts.some(([lx, ly, id]) => lx === tx - B.cx * C341 && ly === ty - B.cy * C341 && id === prop.id)), `the neighbour's record does not name the prop's tiles there: ${JSON.stringify(recB.parts)}`);
    // The neighbour installed alone, as a guest's frame that carries only it: every tile still holds the prop.
    mapMod.installChunk(recB);
    for (const p of recB.props) mapMod.installProp(p);
    assert(holds(), `the neighbour installed alone lost the ${kind}'s tiles`);
    // The sync check's map part sees a tile that lost it (main's could not: the neighbour's record named nothing).
    const sync0 = gameMod.syncParts().map;
    const [fx, fy] = foreign[0];
    mapMod.peekTile(fx, fy)[slot] = null;
    const sync1 = gameMod.syncParts().map;
    mapMod.peekTile(fx, fy)[slot] = prop;
    assert(sync1 !== sync0 && gameMod.syncParts().map === sync0, "the sync check's map part did not see a tile that lost the prop");
    // The anchor's chunk installed again (a guest's frame): its old copy leaves the neighbour's tiles and the record's own copy stands on all of them.
    const reinstall = (rec) => { mapMod.installChunk(rec); let mine = null; for (const p of rec.props) { const q = mapMod.installProp(p); if (q.id === prop.id) mine = q; } return mine; };
    const fresh = reinstall(recA);
    assert(fresh && fresh !== prop && mapMod.propById(prop.id) === fresh && fresh.tiles.every(([tx, ty]) => mapMod.peekTile(tx, ty)[slot] === fresh), "the anchor's chunk installed again left the old copy on the neighbour, or the new one off it");
    // The other order of one frame: the neighbour first (it stands the registry's copy), then the anchor's (it lets that copy go and stands its own).
    mapMod.installChunk(recB);
    assert(foreign.every(([tx, ty]) => mapMod.peekTile(tx, ty)[slot] === fresh), "the neighbour installed first did not stand the registry's copy");
    const again = reinstall(recA);
    assert(again && again !== fresh && again.tiles.every(([tx, ty]) => mapMod.peekTile(tx, ty)[slot] === again), "a frame with the neighbour before the anchor left a stale copy");
    // The prop taken away and its anchor's chunk sent alone: the neighbour's tile is clear on the replica too.
    const recGone = (() => { const r = recOf(x, y); r.props = r.props.filter((p) => p.id !== prop.id); return r; })();
    mapMod.installChunk(recGone);
    assert(foreign.every(([tx, ty]) => !mapMod.peekTile(tx, ty)[slot]) && !mapMod.propById(prop.id), "the anchor's chunk without the prop left its part on the neighbour");
    // And put back (the record again), so the world is as it was for the next.
    reinstall(recA);
    out.push(`${kind} ${prop.tiles.length} tiles, ${foreign.length} on ${B.cx},${B.cy}`);
  }
  return out.join("; ");
});
check("chunk edge (#341): a bed across the edge of a wild chunk: the neighbour is kept by eviction and the world's save and a dropped anchor's chunk let it go whole", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const [bx, by, bw, bh] = json.bounds;
  const gx = bx + bw + 48;
  const gy = by + Math.floor(bh / 2);
  mapMod.ensureAround(gx, gy, 2);
  const at = edgeSpot(gx, gy, 2, 1, 30);
  assert(at, "no bare wild ground across a chunk's edge");
  const [x, y] = at;
  const A = chunkOfTile(x, y);
  const B = chunkOfTile(x + 1, y);
  assert(A.wild && B.wild && !B.dirty, `the spot is not in two unchanged wild chunks (A wild ${A.wild}, B wild ${B.wild} dirty ${B.dirty})`);
  // A control: an unchanged wild chunk beside them, which the same eviction drops.
  let ctl = null;
  for (const c of mapMod.loadedChunks()) if (c.wild && !c.dirty && c !== A && c !== B && Math.abs(c.cx - A.cx) <= 2 && Math.abs(c.cy - A.cy) <= 2) { ctl = c; break; }
  assert(ctl, "no unchanged wild chunk to drop beside them");
  const bed = mapMod.createProp({ sprite: "bed", tile: [x, y], footprint: [2, 1], facing: "x" });
  mapMod.placeProp(bed, x, y);
  assert(A.dirty && B.dirty, "the placement did not mark both chunks");
  // Eviction from far away, free to drop these three alone: the control goes, the bed's two stay.
  const keys = new Set([A, B, ctl].map((c) => `${c.cx},${c.cy}`));
  const dropped = mapMod.evictFar(gx + 4000, gy, 8, (cx, cy) => !keys.has(`${cx},${cy}`)).map(([, cx, cy]) => `${cx},${cy}`);
  assert(dropped.length === 1 && dropped[0] === `${ctl.cx},${ctl.cy}`, `the eviction dropped ${dropped.join(" ") || "nothing"} (the control is ${ctl.cx},${ctl.cy})`);
  mapMod.takeEvicted();
  // Grown again (the control), the bed still stands on both of its tiles.
  mapMod.getChunk(ctl.cx, ctl.cy, true);
  assert(mapMod.peekTile(x, y).prop === bed && mapMod.peekTile(x + 1, y).prop === bed && mapMod.growTile(x + 1, y).prop === bed, "the bed lost a tile through the eviction and the regrowth");
  // The world's save and back: both tiles.
  const save = JSON.parse(JSON.stringify(gameMod.serialize()));
  assert(save.map.chunks.some((c) => c.cx === B.cx && c.cy === B.cy && c.dirty && (c.parts || []).some((p) => p[2] === bed.id)), "the save's neighbour does not name the bed's tile, or is not dirty");
  gameMod.restore(save, json);
  const back = mapMod.propById(bed.id);
  assert(back && mapMod.peekTile(x, y).prop === back && mapMod.peekTile(x + 1, y).prop === back, "the bed did not come back whole from the save");
  // A guest told the anchor's chunk was dropped: the neighbour's tile lets it go too (no part of a prop nothing answers to).
  mapMod.dropChunk(A.cx, A.cy);
  assert(!mapMod.propById(bed.id) && !mapMod.peekTile(x + 1, y).prop, "a dropped anchor's chunk left the bed's tile on the neighbour");
  return `bed at ${x},${y} across ${A.cx},${A.cy} and ${B.cx},${B.cy}; the control ${ctl.cx},${ctl.cy} dropped and grown again`;
});
check("chunk edge (#341): an authored prop across an edge comes back whole from a save that holds only one of its chunks, and from one where it was lifted", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const key = (x, y) => `${Math.floor(x / C341)},${Math.floor(y / C341)}`;
  // One beyond the spawn's ring (four chunks), so a restore does not grow its chunks round the player (the home's coop crosses an edge by the spawn).
  const sp = gameMod.state.info.spawn;
  const crossing = mapMod.allProps().filter((p) => p.tiles && new Set(p.tiles.map(([x, y]) => key(x, y))).size > 1 && !p.rugItem && Math.max(Math.abs(p.tile[0] - sp[0]), Math.abs(p.tile[1] - sp[1])) > 6 * C341);
  assert(crossing.length, "no authored prop beyond the spawn's ring crosses a chunk's edge in the valley");
  const P = crossing[0];
  const anchorKey = key(P.tile[0], P.tile[1]);
  const other = P.tiles.find(([x, y]) => key(x, y) !== anchorKey);
  const otherKey = key(other[0], other[1]);
  const grow = (k) => { const [cx, cy] = k.split(",").map(Number); return mapMod.getChunk(cx, cy, true); };
  const saveWithout = (k, lift = false) => {
    gameMod.create({ json, rules: { zombieAggro: false } });
    grow(anchorKey);
    grow(otherKey);
    if (lift) mapMod.removeProp(mapMod.propById(P.id));
    const save = JSON.parse(JSON.stringify(gameMod.serialize({ fresh: true })));
    save.map.chunks = save.map.chunks.filter((c) => `${c.cx},${c.cy}` !== k);
    gameMod.restore(save, json);
  };
  const whole = () => { const q = mapMod.propById(P.id); return !!q && q.tiles.every(([x, y]) => mapMod.tileAt(x, y).prop === q); };
  // The neighbour saved, the anchor's chunk not (the ring is four chunks): the neighbour's tile and the registry keep it, and the anchor grown again matches.
  saveWithout(anchorKey);
  const onOther = mapMod.peekTile(other[0], other[1]);
  assert(onOther && onOther.prop && onOther.prop.id === P.id && mapMod.propById(P.id) === onOther.prop, `a save without the anchor's chunk lost the ${P.sprite}'s tile on the neighbour or its registry entry`);
  grow(anchorKey);
  assert(whole(), `the ${P.sprite}'s anchor grown again does not match its neighbour`);
  // The anchor's chunk saved, the neighbour not: grown again, the neighbour's tile holds the restored prop, not the authored one.
  saveWithout(otherKey);
  assert(!mapMod.peekTile(other[0], other[1]), "the neighbour is loaded");
  grow(otherKey);
  assert(whole(), `the neighbour grown after the restore holds another copy of the ${P.sprite} than the registry's`);
  // Lifted before the save, the neighbour not saved: grown again, its tile is clear (no authored ghost).
  saveWithout(otherKey, true);
  grow(otherKey);
  assert(!mapMod.propById(P.id) && !mapMod.tileAt(other[0], other[1]).prop, `the lifted ${P.sprite} came back on the neighbour as a ghost`);
  return `${P.sprite} ${P.id} at ${P.tile} across ${anchorKey} and ${otherKey} (${crossing.length} authored props cross an edge)`;
});
check("chunk edge (#341): a prop lifted by a neighbour that alone is grown leaves no ghost when its own, still-ungrown anchor chunk grows (#582)", () => {
  const json = read("data/maps/valley.json");
  const key = (x, y) => `${Math.floor(x / C341)},${Math.floor(y / C341)}`;
  gameMod.create({ json, rules: { zombieAggro: false } });
  const sp = gameMod.state.info.spawn;
  const crossing = mapMod.allProps().filter((p) => p.tiles && new Set(p.tiles.map(([x, y]) => key(x, y))).size > 1 && !p.rugItem && Math.max(Math.abs(p.tile[0] - sp[0]), Math.abs(p.tile[1] - sp[1])) > 6 * C341);
  assert(crossing.length, "no authored prop beyond the spawn's ring crosses a chunk's edge in the valley");
  const P = crossing[0];
  const anchorKey = key(P.tile[0], P.tile[1]);
  const other = P.tiles.find(([x, y]) => key(x, y) !== anchorKey);
  const otherKey = key(other[0], other[1]);
  // A fresh world, the neighbour's chunk grown alone: the prop is already in the registry (every authored prop is,
  // from load), but its own anchor chunk has never been grown when it is lifted.
  gameMod.create({ json, rules: { zombieAggro: false } });
  const [ocx, ocy] = otherKey.split(",").map(Number);
  mapMod.getChunk(ocx, ocy, true);
  assert(!mapMod.peekTile(P.tile[0], P.tile[1]), `the anchor ${anchorKey} is already grown by the neighbour's own growth`);
  mapMod.removeProp(mapMod.propById(P.id));
  assert(!mapMod.propById(P.id), "the lifted prop is still in the registry");
  // Grown after the lift: the anchor's own authored tile must not stand the prop again as a ghost (#582).
  const [acx, acy] = anchorKey.split(",").map(Number);
  mapMod.getChunk(acx, acy, true);
  assert(!mapMod.tileAt(P.tile[0], P.tile[1]).prop, `the lifted ${P.sprite} stood again on its own ungrown anchor once it grew`);
  return `${P.sprite} ${P.id} lifted with its anchor ${anchorKey} ungrown; grown after, its tile is clear`;
});
check("chunk edge (#341): two players lift one chest: the second lift meets it gone and gets nothing, with a word", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const a = gameMod.state.player;
  mapMod.ensureAround(a.gx, a.gy, 3);
  const at = edgeSpot(a.gx, a.gy, 1, 1);
  assert(at, "no bare ground");
  const [x, y] = at;
  const chest = mapMod.createProp({ sprite: "chest", tile: [x, y] });
  mapMod.placeProp(chest, x, y);
  const b = gameMod.addPlayer(x + 0.5, y + 1, {});
  a.gx = x - 0.5;
  a.gy = y + 1;
  for (const p of [a, b]) { p.hands.main = null; p.hands.off = null; p.carrying = null; }
  const carry = (p) => interactImport.actionsForTarget({ kind: "prop", id: chest.id }, p).find((q) => q.kind === "carry");
  const ca = carry(a);
  const cb = carry(b); // both found it standing, as two walks to it do
  assert(ca && cb && ca.enabled && cb.enabled, "a player was not offered Pick up chest");
  const said = [];
  promptImport.setMessageSink((text) => (said.push(text), true));
  try {
    assert(ca.perform() === true && a.carrying === chest && !mapMod.peekTile(x, y).prop, "the first lift did not take the chest");
    assert(cb.perform() === false && !b.carrying, "the second lift took the same chest");
    assert(said.includes("The chest is not there any more."), `the second lifter was told ${JSON.stringify(said)}`);
    // Set down a tile on, the stale action still lifts nothing (the chest is not where its walk went); a fresh one, found where it stands now, lifts it.
    mapMod.placeProp(a.carrying, x, y + 1);
    a.carrying = null;
    assert(cb.perform() === false && !b.carrying && mapMod.peekTile(x, y + 1).prop === chest, "the stale lift took a chest set down elsewhere");
    const fresh = carry(b);
    assert(fresh && fresh.perform() === true && b.carrying === chest, "a fresh lift of the chest set down was refused");
  } finally {
    promptImport.setMessageSink(null);
  }
  return `the first lift took ${chest.id}; the second told "${said[0]}"`;
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
    assert(d.wall && d.wall.height === 96 && d.wall.material === "wood" && /^#[0-9a-f]{6}$/i.test(d.wall.color), `${w}: not a wood wall block`);
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
// Walls 96 px tall (docs/52, Michael 2026-10-26): every wall material's definition 96 (a fence 36), the openings' constants, the bow's fallback, the
// spear's arc over a wall; a flight is stopped by a wall below that wall's own height (a fence at its 36, a house wall at its 96), read from its
// definition headless as on a server world, and an open door and window let it through between their own heights.
const placeholdersMod = await import("../src/placeholders.js");
check("walls 96: every material 96 and a fence 36, the openings 64 and 24 to 64, a flight stopped by each wall at its own height, the spear's arc over a wall", () => {
  const P = placeholdersMod;
  for (const w of ["wall_wood", "wall_spruce", "wall_mahogany", "wall_winterpine", "wall_bloodbark", "wall_daub", "wall_log", "wall_stone"]) assert(read(`data/sprites/${w}.json`).wall.height === 96, `${w} is not 96 px tall`);
  assert(read("data/sprites/wall_fence.json").wall.height === 36, "the fence is not 36 px");
  assert(P.DOOR_TOP === 64 && P.WINDOW_TOP === 64 && P.WINDOW_SILL === 24 && P.BRACKET_UP === 48, `the openings: door ${P.DOOR_TOP}, window ${P.WINDOW_SILL} to ${P.WINDOW_TOP}, bracket ${P.BRACKET_UP}`);
  assert(read("data/combat.json").bow.wallHeight === 96 && archeryMod.tunables.wallHeight === 96, `the bow's wallHeight is ${archeryMod.tunables.wallHeight}`);
  const crate = read("data/sprites/crate.json").placeholder;
  assert(crate.kind === "box" && crate.height === 32 && !crate.inset && crate.label && crate.outline === true && 3 * crate.height === 96 && 2 * crate.height === P.DOOR_TOP, "the dev crate is not a labelled, outlined one-tile cube 32 px tall (three to the cap, two to the door's top)");
  const spear = itemsMod.getItem("spear").thrown;
  const peak = (t) => { let m = 0; for (let u = 0; u <= 1; u += 0.01) m = Math.max(m, t.z0 * (1 - u) + 4 * t.arcMax * u * (1 - u)); return m; };
  assert(spear.arcMax === 80 && peak(spear) > 96, `the spear's full-range throw peaks at ${peak(spear).toFixed(1)} px, under a wall`);
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const j = read("data/maps/valley.json");
  const [bx, by, bw, bh] = j.bounds;
  const C = mapMod.CHUNK;
  for (let cy = Math.floor(by / C); cy <= Math.floor((by + bh) / C); cy++) for (let cx = Math.floor(bx / C); cx <= Math.floor((bx + bw) / C); cx++) mapMod.getChunk(cx, cy, true);
  const find = (test) => { for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) for (const e of ["n", "w"]) { const w = mapMod.tileAt(x, y)[e]; if (w && test(w)) return w; } return null; };
  const fence = find((w) => w.kind === "wall" && mapMod.isFence(w) && !mapMod.boarded(w));
  const wall = find((w) => w.kind === "wall" && !mapMod.isFence(w) && w.sprite !== "wall_fence");
  const door = find((w) => w.kind === "door" && !mapMod.isFence(w) && !mapMod.boarded(w) && !w.broken);
  const win = find((w) => w.kind === "window" && !mapMod.boarded(w) && !w.broken);
  assert(fence && wall && door && win, "the valley has no fence, house wall, house door, or window to test");
  const S = archeryMod.wallStops;
  assert(archeryMod.heightOfWall(fence) === 36 && S(fence, 35) && !S(fence, 36) && !S(fence, 50), "a fence does not stop a flight at its own 36 px (under it stopped, over it free)");
  assert(archeryMod.heightOfWall(wall) === 96 && S(wall, 95) && !S(wall, 96) && S(wall, 80), `a ${wall.sprite} does not stop a flight below its 96 px`);
  const keep = { open: door.open, shutter: win.shutter };
  try {
    door.open = true;
    assert(!S(door, 0) && !S(door, 63) && S(door, 64) && S(door, 90), "an open door does not pass a flight under its 64 px lintel and stop one over it");
    door.open = false;
    assert(S(door, 30), "a shut door lets a flight through");
    win.shutter = "open";
    assert(S(win, 23) && !S(win, 24) && !S(win, 63) && S(win, 64), "an open window does not pass a flight between its sill 24 and its top 64");
    win.shutter = "closed";
    assert(S(win, 40), "a shut window lets a flight through");
  } finally {
    door.open = keep.open;
    win.shutter = keep.shutter;
  }
  assert(archeryMod.heightOfWall({ sprite: "no_such_wall" }) === 96, "a wall with no definition does not fall back to the bow's wallHeight");
  return `walls 96, fence 36; door 64, window 24 to 64, bracket 48; the spear peaks at ${peak(spear).toFixed(1)}; a fence stops under 36, a wall under 96, an open door under 64, an open window outside 24 to 64`;
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
// No browser dialog (Michael, 2026-10-26): the game never asks through window.alert, confirm, or prompt. A browser can be told to stop
// showing them, and the desktop app's pane answers confirm false with no dialog, so a question asked that way can vanish for good; every
// question is the game's own, asked on the page (ui/screens.js `ask`). The scan reads every script under src/ and the pages at the root.
check("no browser dialog: no script calls window.alert, confirm, or prompt; every question is asked on the page", () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : []));
  const files = walk(path.join(root, "src")).concat(fs.readdirSync(root).filter((f) => f.endsWith(".html")).map((f) => path.join(root, f)));
  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    for (const m of text.matchAll(/(?<![\w.$])(?<!function\s+)(?:window\.|globalThis\.|self\.)?(alert|confirm|prompt)\s*\(/g)) hits.push(`${path.relative(root, f).split(path.sep).join("/")}: ${m[0]}`);
  }
  assert(hits.length === 0, `browser dialogs: ${hits.join(" | ")}`);
  const planted = "x.onclick = () => { if (window.confirm('Delete?')) go(); }; alert('hi'); placement.prompt(); export function prompt() {}";
  const caught = [...planted.matchAll(/(?<![\w.$])(?<!function\s+)(?:window\.|globalThis\.|self\.)?(alert|confirm|prompt)\s*\(/g)].length;
  assert(caught === 2, `the scan caught ${caught} of the planted two (a method named prompt must not count)`);
  return `${files.length} files, none calls one; the scan catches a planted confirm and alert and passes a method or a function named prompt`;
});
// Small text (#321, #324): text at or under the threshold (ui/small-text.js, 15 UI px) is set in the clear sans-serif (`--font-small`), so a new small rule cannot slip in pixel-only.
// The scan is tools/small-text-scan.js (its head says what it reads and how): every rule of style.css by its own size and its own family, every place a script under
// src/ writes a font size, and a failure for any size it cannot classify. Below, it runs on the real files, then on planted snippets, each of which must pass or fail as named.
// The page's computed fonts are what `check("smalltext")` reads, in the pane.
const walkJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkJs(path.join(dir, e.name)) : e.name.endsWith(".js") && e.name !== "small-text.js" ? [path.join(dir, e.name)] : []));
check("small text: every size at or under the threshold is set in --font-small, in the stylesheet and in the scripts, and every size is classified; the scan itself catches each form", () => {
  const rowStart = performance.now();
  const { SMALL_TEXT_MAX_PX: MAX } = smallTextMod;
  const { scanSmallText } = smallTextScan;
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
  assert(real.unknown.length === 0, `font sizes the scan cannot classify (teach it the form, or write the size plainly): ${real.unknown.join(", ")}`);
  assert(real.sites >= 4, `the scan found only ${real.sites} places a script sizes text (floaters, the drag ghost, the map's names, the placeholders' codes)`);
  const planted = (c, f = []) => scanSmallText(c, f, MAX);
  const LISTS = ["bad", "bigNoFace", "unknown", "badJs"];
  const only = (r, list) => LISTS.every((l) => r[l].length === (l === list ? 1 : 0));
  // The stylesheet: each planted rule lands in exactly the one list named, and nowhere else.
  const cssCatch = {
    "a px size": [".x { font-size: 12px; }", "bad"],
    "the shorthand": [".x { font: 12px \"Pixelify Sans\", sans-serif; }", "bad"],
    "the shorthand with a weight": [".x { font: bold 12px \"Pixelify Sans\", sans-serif; }", "bad"],
    "the shorthand with a style and a weight": [".x { font: italic 700 12px serif; }", "bad"],
    "the shorthand with a stretch keyword": [".x { font: condensed 12px serif; }", "bad"],
    "the shorthand with a line height": [".x { font: 600 italic 11px/1.2 serif; }", "bad"],
    "the shorthand with oblique and small-caps": [".x { font: oblique small-caps 12px serif; }", "bad"],
    "a rem size": [".x { font-size: 0.8rem; }", "bad"],
    "a rem size in capitals": [".x { font-size: 0.75REM; }", "bad"],
    "a rule with no spaces and no last semicolon": [".p{font-size:12px}", "bad"],
    "a pt size": [".x { font-size: 9pt; font-family: var(--font-ui); }", "bad"],
    "a percentage": [".x { font-size: 80%; }", "bad"],
    "an em under 1": [".x { font-size: 0.9em; }", "bad"],
    "smaller": [".x { font-size: smaller; }", "bad"],
    "a keyword": [".x { font-size: small; }", "bad"],
    "a rule inside @media": ["@media (max-width: 600px) { .x { font-size: 12px; } }", "bad"],
    "calc()": [".x { font-size: calc(10px + 2px); font-family: var(--font-ui); }", "bad"],
    "min() with a small bound": [".x { font-size: min(12px, 2vw); font-family: var(--font-ui); }", "bad"],
    "an all-small clamp()": [".x { font-size: clamp(8px, 1vw, 12px); font-family: var(--font-ui); }", "bad"],
    "var() of a small size": [":root { --tiny: 10px; } .x { font-size: var(--tiny); font-family: var(--font-ui); }", "bad"],
    "a second font-size, the small one last": [".x { font-size: 18px; font-size: 12px; font-family: var(--font-ui); }", "bad"],
    "the small font named only in a custom property": [".x { font-size: 12px; font-family: var(--font-ui); --y: var(--font-small); }", "bad"],
    "monospace named only in content:": [".x { font-size: 12px; content: \"monospace\"; }", "bad"],
    "a later family overriding the small one": [".x { font-size: 12px; font-family: var(--font-small); font-family: var(--font-ui); }", "bad"],
    "a closing brace in content: hiding the rest of the rule": [".x { content: \"}\"; font-size: 12px; }", "bad"],
    "a rule nested inside another (native CSS nesting)": [".a { color: red; .b { font-size: 12px; font-family: var(--font-small); } }", "unknown"],
    "a parent's own size beside a nested rule": [".a { font-size: 12px; font-family: var(--font-small); .b { color: red; } }", "unknown"],
    "an empty family": [".x { font-family: ; font-size: 12px; }", "bad"],
    "a comment opened inside content: hiding the next rule": [".x { content: \"/*\"; }\n.y { font-size: 12px; }\n/* a comment */\n", "bad"],
    "an unclosed quote": [".x { background: url(it's.png); font-size: 12px; }", "unknown"],
    "a size so deep it throws (a failure named, never a crash)": [".x { font-size: calc(" + "(".repeat(5000) + "1px" + ")".repeat(5000) + "); }", "unknown"],
    "a big px rule with no family": [".x { font-size: 18px; }", "bigNoFace"],
    "a big rem rule with no family": [".x { font-size: 1.5rem; }", "bigNoFace"],
    "a big keyword with no family": [".x { font-size: large; }", "bigNoFace"],
    "a big size after font: inherit": [".x { font: inherit; font-size: 20px; }", "bigNoFace"],
    "a big calc() with no family": [".x { font-size: calc(10px + 10px); }", "bigNoFace"],
    "a vw size": [".x { font-size: 1vw; font-family: var(--font-small); }", "unknown"],
    "a clamp() across the threshold": [".x { font-size: clamp(10px, 2vw, 30px); font-family: var(--font-small); }", "unknown"],
    "calc() of an em": [".x { font-size: calc(1em + 2px); font-family: var(--font-small); }", "unknown"],
    "var() the stylesheet never declares": [".x { font-size: var(--nowhere); font-family: var(--font-small); }", "unknown"],
    "a system font in the shorthand": [".x { font: menu; }", "unknown"],
    "an unclassifiable first font-size before a classified one": [".x { font-size: 2vw; font-size: 12px; font-family: var(--font-small); }", "unknown"],
  };
  for (const [what, [rule, list]] of Object.entries(cssCatch)) {
    const r = planted(rule);
    assert(only(r, list), `the scan read ${what} wrong (wanted one in ${list}): ${rule} -> ${JSON.stringify(r)}`);
  }
  const cssPass = [
    ".x { font-size: 12px; font-family: var(--font-small); }", ".x { font: bold 12px var(--font-small); }", ".x { font: condensed bold 12px var(--font-small); }",
    ".x { font-size: 12px; font-family: monospace; }", ".x { font: 12px/1.4 Consolas, monospace; }", ".x { font-size: 0.95em; font-family: ui-monospace, Consolas, monospace; }",
    ".x { font-size: 12px; font-family: var(--font-title); }", ".x { font-size: 12px; font-family: \"Pirata One\"; }",
    ".x { font-size: 18px; font-family: var(--font-ui); }", ".x { font: 18px var(--font-ui); }", ".x { font-size: 12pt; font-family: var(--font-ui); }",
    ".x { font-size: 18px; font-family: var(--font-ui); } /* a comment { font-size: 9px; } */", ".x { font-size: 1.3em; }", ".x { font-size: inherit; }", ".x { font: inherit; }",
    ".x { font-size: clamp(24px, 4.6vw, 50px); }", ".x { font-size: max(20px, 2vw); }", ".x { font-size: min(12px, 2vw); font-family: var(--font-small); }",
    ".x { font-size: 12px; font-size: 18px; font-family: var(--font-ui); }", ".x { font-size: 12px !important; font-family: var(--font-small); }",
    ".x { font-size: 12px; font-family: var(--font-small) !important; font-family: var(--font-ui); }",
    ":root { --tiny: 10px; } .x { font-size: var(--tiny); font-family: var(--font-small); }", ".x { font-size: var(--big, 20px); font-family: var(--font-ui); }",
    ".x { font-size: 0; }", ".x { font-size: 0px; }", "@supports (display: grid) { .x { font-size: 12px; font-family: var(--font-small); } }",
    ".x { background: url(\"data:image/svg+xml;utf8,<svg></svg>\"); font-size: 12px; font-family: var(--font-small); }",
  ];
  for (const rule of cssPass) {
    const r = planted(rule);
    assert(LISTS.every((l) => r[l].length === 0), `the scan flagged a clean rule: ${rule} -> ${JSON.stringify(r)}`);
  }
  const at = planted(".a { color: red; }\n\n.b {\n  color: red;\n  font-size: 11px;\n}\n").bad[0] || "";
  assert(at.startsWith("style.css:5 .b"), `a flagged rule is not named by its line: ${at}`);
  // The scripts: each planted file lands in the one list named.
  const js = (text) => [["src/x.js", text]];
  const jsCatch = {
    "a second style.fontSize in a file that already names --font-small": ["const f = 'var(--font-small)';\n" + "x;\n".repeat(8) + "el.style.fontSize = `${n}px`;\n", "badJs"],
    "ctx.font with a pixel face": ["ctx.font = \"11px sans-serif\";\n", "badJs"],
    "an inline font-size in a template": ["el.innerHTML = `<b style=\"font-size:12px\">x</b>`;\n", "badJs"],
    "a font shorthand assignment": ["ctx.font = `bold 12px ${family}`;\n", "badJs"],
    "ctx.font from a variable": ["ctx.font = f;\n", "badJs"],
    "another element's monospace the line before": ["a.style.fontFamily = 'monospace';\nb.style.fontSize = '10px';\n", "badJs"],
    "another element's small family": ["a.style.fontFamily = SMALL_FONT_VAR;\nb.style.fontSize = n + 'px';\n", "badJs"],
    "a comment naming the small font": ["b.style.fontSize = '10px'; // not --font-small\n", "badJs"],
    "a block comment naming smallFamily()": ["b.style.fontSize = '10px'; /* b.style.fontFamily = smallFamily() */\n", "badJs"],
    "a string naming it two lines below": ["b.style.fontSize = '10px';\nx;\nconst s = 'see font-small';\n", "badJs"],
    "monospace on the next line, the same element": ["b.style.fontSize = '10px';\nb.style.fontFamily = 'monospace';\n", "badJs"],
    "Object.assign onto a style": ["Object.assign(el.style, { fontSize: '10px', color: 'red' });\n", "badJs"],
    "style.setProperty('font-size')": ["el.style.setProperty('font-size', '10px');\n", "badJs"],
    "a bracketed style key": ["el.style['font-size'] = `${n}px`;\n", "badJs"],
    "cssText": ["el.style.cssText = 'font-size: 10px; color: red';\n", "badJs"],
    "a quoted font-size key in a style object": ["const st = { \"font-size\": \"10px\" };\n", "badJs"],
    "an inline font shorthand": ["el.innerHTML = '<i style=\"font: 11px serif\">x</i>';\n", "badJs"],
    "style.font": ["el.style.font = '12px serif';\n", "badJs"],
    "two style attributes, the small family only in the second": ["el.innerHTML = `<b style=\"font-size:12px\">a</b><i style=\"font-size:12px; font-family: var(--font-small)\">b</i>`;\n", "badJs"],
    "the small family in another attribute": ["el.innerHTML = `<b style=\"font-size:12px\" data-x=\"font-family: var(--font-small)\">x</b>`;\n", "badJs"],
    "monospace in the text, not the style": ["el.innerHTML = `<b style=\"font-size:12px\">monospace</b>`;\n", "badJs"],
    "a canvas given SMALL_FONT_VAR": ["ctx.font = '11px ' + SMALL_FONT_VAR;\n", "badJs"],
    "a canvas given var(--font-small)": ["ctx.font = `11px var(--font-small)`;\n", "badJs"],
    "a numeric fontSize key": ["const t = { fontSize: 16 };\n", "unknown"],
    "a script size so deep it throws (a failure named, never a crash)": ["el.style.fontSize = 'calc(" + "(".repeat(5000) + "1px" + ")".repeat(5000) + ")';\n", "unknown"],
    "a style attribute whose ${} holds an object, the small family in another element": ["el.innerHTML = `<b style=\"color:${o({ a: 1 }).b ? \"r\" : \"b\"}; font-size:12px\">x</b><i style=\"font-family: var(--font-small)\">y</i>`;\n", "badJs"],
    "a style alias": ["const s = el.style;\ns.fontSize = '10px';\n", "unknown"],
    "a size the scan cannot classify": ["el.style.fontSize = '1vw';\n", "unknown"],
    "an inline size it cannot classify": ["el.innerHTML = '<b style=\"font-size: 2vw\">x</b>';\n", "unknown"],
  };
  for (const [what, [text, list]] of Object.entries(jsCatch)) {
    const r = planted("", js(text));
    assert(only(r, list), `the scan read ${what} wrong (wanted one in ${list}): ${JSON.stringify(text)} -> ${JSON.stringify(r)}`);
  }
  const jsPass = [
    "el.style.fontSize = `${n}px`;\nel.style.fontFamily = SMALL_FONT_VAR;\n", "el.style.fontSize = `${T.fontPx}px`;\nif (T.fontPx <= MAX) el.style.fontFamily = SMALL_FONT_VAR;\n",
    "ctx.font = `11px ${smallFamily()}`;\n", "ctx.font = \"bold 9px Consolas, monospace\";\n", "ctx.font = \"28px serif\";\n",
    "h.style.fontSize = '28px';\n", "h.style.fontSize = `28px`;\n", "h.style.fontSize = '1.2em';\n",
    "b.style.fontSize = '10px'; b.style.fontFamily = 'monospace';\n",
    "Object.assign(el.style, { fontSize: `${n}px`, fontFamily: SMALL_FONT_VAR });\n", "Object.assign(el.style, { fontSize: '10px' });\nel.style.fontFamily = 'var(--font-small)';\n",
    "el.style.setProperty('font-size', `${n}px`);\nel.style.setProperty('font-family', 'var(--font-small)');\n",
    "el.innerHTML = `<b style=\"font-size:12px; font-family:${SMALL_FONT_VAR}\">x</b>`;\n", "el.style.cssText = 'font-size: 10px; font-family: var(--font-small)';\n",
    "el.innerHTML = '<b style=\"font-size: 20px\">x</b>';\n", "el.innerHTML = '<code style=\"font: 12px Consolas, monospace\">x</code>';\n",
    "const px = parseFloat(getComputedStyle(el).fontSize);\nconst v = cs.getPropertyValue('font-size');\nif (a.fontSize === b.fontSize) x();\n",
    "const re = /'/; const u = \"http://x\";\nel.style.fontSize = '10px'; el.style.fontFamily = SMALL_FONT_VAR;\n",
    "const r = `${(w.in / 1024).toFixed(1)} KB/s`; // a property named in, then a division\nel.style.fontSize = '10px';\nel.style.fontFamily = SMALL_FONT_VAR;\n",
    "el.style.fontSize = '';\nel.style.fontSize = null;\nel.style.setProperty('font-size', '');\nel.style.font = '';\n",
    "const { fontSize: fs } = getComputedStyle(el);\nconst { fontSize = 12 } = opts;\n", "const f = big ? font : other;\nconst g = big ? fontSize : 0;\n",
    "const st = { fontSize: '10px', label: '}', fontFamily: SMALL_FONT_VAR };\n", "el.style.font = `11px ${SMALL_FONT_VAR}`;\n",
    "el.innerHTML = `<b style=\"font-size:12px; font-family: ${SMALL_FONT_VAR}\">a</b><i style=\"font-size: 20px\">b</i>`;\n",
    "el.innerHTML = `<code style=\"font-size: 11px; font-family: ui-monospace, monospace\">x</code>`;\n", "el.innerHTML = '<b style=\"font-size: 0\">x</b>';\n",
    "el.innerHTML = `<code style=\"font-size:12px; font-family: 'Courier New', monospace\">x</code>`;\n", "el.innerHTML = `<b style=\"font-family: 'Pixelify Sans'; font-size: 20px\">x</b>`;\n",
    "el.innerHTML = `<code style=\"font: 12px 'Courier New', monospace\">x</code>`;\n", "el.innerHTML = '<code style=\"font: 12px \\'Courier New\\', monospace\">x</code>';\n",
    "const st = { fontSize: '10px', re: /\\}/, fontFamily: SMALL_FONT_VAR };\n", "const { a: { fontSize: fs } } = o;\n",
  ];
  for (const text of jsPass) {
    const r = planted("", js(text));
    assert(LISTS.every((l) => r[l].length === 0), `the scan flagged a clean script: ${JSON.stringify(text)} -> ${JSON.stringify(r)}`);
  }
  const jsAt = planted("", js("x;\n\nb.style.fontSize = '10px';\n")).badJs[0] || "";
  assert(jsAt.startsWith("src/x.js:3 "), `a flagged script line is not named by its file and line: ${jsAt}`);
  // A style key at the top of a big data object is found in one walk each way (it was quadratic: 61 s for this one, #472's review).
  const table = "const T = {\n  fontSize: `${n}px`, fontFamily: SMALL_FONT_VAR,\n" + Array.from({ length: 6000 }, (_, i) => `  k${i}: { label: "row ${i}", n: ${i} },\n`).join("") + "};\n";
  const t0 = performance.now();
  const big = planted("", js(table));
  const took = performance.now() - t0;
  assert(LISTS.every((l) => big[l].length === 0) && took < 2000, `a ${Math.round(table.length / 1024)} KB object took ${Math.round(took)} ms, or was flagged: ${JSON.stringify(big)}`);
  const n = Object.keys(cssCatch).length + Object.keys(jsCatch).length, m = cssPass.length + jsPass.length;
  return `${real.small} small rules in style.css, each in --font-small (or monospace, or the titles' face), every size classified; ${files.length} scripts, ${real.sites} places that size text, each with its small font; ${n} planted bad forms caught and ${m} clean ones passed; a ${Math.round(table.length / 1024)} KB object in ${Math.round(took)} ms; the row in ${Math.round(performance.now() - rowStart)} ms (threshold ${MAX} UI px)`;
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
// The hover card's thrown, shot, and cast lines (#317), and a recipe's own verb: each item's card says what it does, its numbers read from the
// data here as the card reads them (the damage by the draw from archery.shotDamage at `minDraw`, the burn from data/combat.json); and the bow
// takes its arrows in its data's `ammo` order, a fire arrow's `ignite` setting what it hits alight.
const burnMod = await import("../src/burn.js");
check("hover card: the spear, the bow, the arrows, the Book and Staff of Fire, the halberd, the throwing knife and axe, the garments, and the rag say what they do (#317)", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const I = (id) => itemsMod.getItem(id);
  const card = (id) => itemInfoMod.textOf(itemInfoMod.cardFor(itemsMod.makeEntry(id, 1)));
  const has = (id, s) => assert(card(id).includes(s), `${id}: wanted "${s}"; the card: ${card(id).join(" | ")}`);
  const T = archeryMod.tunables;
  const by = (d) => `${archeryMod.shotDamage(d, T.minDraw)} to ${d} damage by the draw`;
  const B = burnMod.BURN;
  const burnt = `Sets the dead it hits alight: ${Math.round(Math.min(B.cap, B.dps * B.duration))} damage over ${B.duration} seconds.`;
  const sp = I("spear").thrown;
  has("spear", `Throw (middle button or Q): ${by(sp.damage)}, up to ${sp.range} tiles.`);
  has("spear", `It lands to be picked up again, or stays in the body it hits; it may break (${Math.round(sp.breakChance * 100)}%).`);
  const bow = I("bow");
  has("bow", `Draw and release (left button): ${by(bow.bow.damage)}, up to ${T.range} tiles.`);
  has("bow", `Needs arrows carried, fire arrows first, then strongly poisoned arrows, then poisoned arrows; good for about ${bow.shots} shots.`); // the order (docs/47 section 6)
  has("arrow", `Shot from a hunting bow (${by(bow.bow.damage)}), when no fire arrows, strongly poisoned arrows or poisoned arrows are carried.`);
  has("fire_arrow", `Shot from a hunting bow (${by(bow.bow.damage)}), before any strongly poisoned arrows, poisoned arrows or arrows.`);
  has("poison_arrow", `Shot from a hunting bow (${by(bow.bow.damage)}), after any fire arrows or strongly poisoned arrows and before any arrows.`);
  has("poison_arrow", "Made from arrows: Use poison on them (coat).");
  has("strong_poison_arrow", "Made from arrows: Use strong poison on them (coat).");
  has("fire_arrow", burnt);
  has("fire_arrow", "Made from arrows: Use them on fire (dip).");
  assert(itemInfoMod.cardFor(itemsMod.makeEntry("fire_arrow")).lines.flat().some((g) => g.k === "use" && g.t === "Use"), "the fire arrow's Use is not its own segment");
  assert(!card("arrow").includes(burnt), "a plain arrow says it burns");
  const fb = I("book_of_fire").book.spell;
  has("book_of_fire", `Cast ${fb.name} (left button, a staff in the other hand): ${by(fb.damage)}, up to ${fb.range} tiles.`);
  has("book_of_fire", `Costs ${fb.mana} mana a cast, spent when it is released.`); // docs/47 section 5
  has("book_of_fire", `${fb.name} bursts on the first of the dead or wild game it meets, or within ${fb.landRadius} tile${fb.landRadius === 1 ? "" : "s"} of where it lands; it passes tame animals by.`);
  has("book_of_fire", burnt);
  // The draw's scale written out (docs/20, 0.4 + 0.6 c at minDraw 0.15), so a wrong formula fails here and not only in step with the card:
  // shotDamage literally, and the cards' literal text while the data holds today's numbers (a tuned number skips the card literal, not the formula).
  assert(archeryMod.shotDamage(38, 0.15) === 19 && archeryMod.shotDamage(150, 0.15) === 74 && archeryMod.shotDamage(45, 0.15) === 22 && archeryMod.shotDamage(38, 1) === 38, `shotDamage: ${archeryMod.shotDamage(38, 0.15)}, ${archeryMod.shotDamage(150, 0.15)}, ${archeryMod.shotDamage(45, 0.15)}, ${archeryMod.shotDamage(38, 1)}`);
  if (T.minDraw === 0.15) {
    if (bow.bow.damage === 38) has("bow", "Draw and release (left button): 19 to 38 damage by the draw, up to 22 tiles.");
    if (sp.damage === 150) has("spear", "Throw (middle button or Q): 74 to 150 damage by the draw, up to 6.5 tiles.");
    if (fb.damage === 45) has("book_of_fire", "Cast Fireball (left button, a staff in the other hand): 22 to 45 damage by the draw, up to 18 tiles.");
  }
  has("staff_of_fire", `Cast (left button, a spellbook in the other hand): ${fb.name} with the Book of Fire.`);
  const th = I("halberd").weapon.alt;
  has("halberd", `Thrust (middle button or Q): ${th.damage} damage, reach ${th.range}; ${th.stamina} stamina.`);
  // The throwing knife and axe (docs/24 section 1): thrown on the left button, their damage, range, stagger, knockdown, and break from the data.
  for (const id of ["throwing_knife", "throwing_axe"]) {
    const t = I(id).thrown;
    has(id, `Throw (left button, from the main hand): ${by(t.damage)}, up to ${t.range} tiles.`);
    has(id, `It lands to be picked up again, or stays in the body it hits; it may break (${Math.round(t.breakChance * 100)}%).`);
    has(id, t.staggerChance >= 1 ? "Every hit staggers the dead." : `A hit staggers the dead ${Math.round(t.staggerChance * 100)}% of the time.`);
    assert(!card(id).some((l) => l.startsWith("To come")), `${id} still says it is to come: ${card(id).join(" | ")}`);
  }
  has("throwing_axe", `A hit knocks the dead down ${Math.round(I("throwing_axe").thrown.knockdown * 100)}% of the time.`);
  assert(!card("throwing_knife").some((l) => /knocks/.test(l)), "the throwing knife says it knocks down");
  assert(card("spear").some((l) => l.startsWith("Throw (middle button or Q)")), "the spear, which also stabs, no longer throws on the other mode");
  for (const id of ["cap", "hood", "tunic", "gloves", "breeches", "boots"]) {
    has(id, "Tear into 2 rags at the workbench, a dirk carried.");
    assert(!card(id).some((l) => /^Goes into:.*\brag\b/.test(l)), `${id}: the rag is in its Goes into as well`);
  }
  assert(!card("belt").some((l) => l.startsWith("Tear")), "the rope belt says it tears");
  has("rag", "Tear clothing into rags (2 each) at the workbench, a dirk carried: linen cap, onion-head hat, linen tunic and more.");
  assert(!card("rag").some((l) => l.startsWith("Made at")), `the rag still says Made at: ${card("rag").join(" | ")}`);
  // The bow takes its data's `ammo` in order: plain arrows alone, then fire arrows first, which burn.
  const me = gameMod.state.player;
  const main0 = me.hands.main;
  const bag = inventoryMod.bagOf(me);
  const belt = inventoryMod.beltOf(me);
  const bag0 = bag ? bag.items.slice() : null;
  const belt0 = belt ? belt.slice() : null;
  try {
    if (bag) bag.items.length = 0;
    if (belt) belt.fill(null);
    me.hands.main = itemsMod.makeEntry("bow", 1);
    assert(inventoryMod.stow(me, itemsMod.makeEntry("arrow", 5)), "the arrows did not fit");
    const plain = archeryMod.launcherOf(me);
    assert(plain && plain.ammo === "arrow" && plain.projectile === "arrow" && plain.ignite === false, `plain arrows: ${plain && plain.ammo} ignite ${plain && plain.ignite}`);
    assert(inventoryMod.stow(me, itemsMod.makeEntry("fire_arrow", 2)), "the fire arrows did not fit");
    const fire = archeryMod.launcherOf(me);
    assert(fire && fire.ammo === "fire_arrow" && fire.projectile === "fire_arrow" && fire.ignite === true, `fire arrows: ${fire && fire.ammo} ignite ${fire && fire.ignite}`);
    if (bag) bag.items.length = 0;
    if (belt) belt.fill(null);
    const none = archeryMod.launcherOf(me);
    assert(none && none.ammo === "arrow" && none.ignite === false, `none carried: ${none && none.ammo}`);
  } finally {
    me.hands.main = main0;
    if (bag) bag.items.splice(0, bag.items.length, ...bag0);
    if (belt) for (let i = 0; i < belt.length; i++) belt[i] = belt0[i];
  }
  return `${card("book_of_fire")[2]} || ${card("bow")[2]} || ${card("cap").find((l) => l.startsWith("Tear"))}`;
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
  const spots = [[104, 216], [60, 150], [-40, 120], [300, 100], [128, 300]]; // your cottage, the village, the wild beyond each side
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

// The rise's shudder (Michael, 2026-10-25: "a little shudder as they rise from the ground"): a rising rock is jolted sideways in whole pixels,
// at most 2, a few times over its rise, easing to still (none in its last quarter), none before its stamp, once risen, or on a prop that never
// rose; the same for the same id and time (what a guest draws from the host's `risenAt`), and not one shake for every id.
check("the rise's shudder: whole pixels, at most 2, a few jolts easing to still, none once risen, the same for the same id and time", () => {
  const T = RESOURCES.riseSeconds;
  const rock = { id: "res_stone_7", risenAt: 100 };
  const at = (p, k) => resourcesMod.shudderOf(p, p.risenAt + k * T);
  const samples = Array.from({ length: 101 }, (_, i) => at(rock, i / 100));
  assert(samples.every(Number.isInteger) && samples.every((v) => Math.abs(v) <= 2 && !Object.is(v, -0)), `not whole pixels within 2: ${samples.join(" ")}`);
  const jolts = samples.filter((v, i) => v !== 0 && v !== samples[i - 1]).length;
  assert(jolts >= 3, `fewer than three jolts over the rise: ${samples.join(" ")}`);
  assert(samples.slice(75).every((v) => v === 0) && samples.slice(40).every((v) => Math.abs(v) <= 1), `it does not ease to still: ${samples.join(" ")}`);
  assert(at(rock, -0.1) === 0 && at(rock, 1) === 0 && at(rock, 5) === 0 && resourcesMod.shudderOf({ id: "rock_a" }, 100.3) === 0, "a shudder before the stamp, once risen, or on a prop that never rose");
  const copy = { id: "res_stone_7", risenAt: 100 }; // the guest's record of the same rock
  assert(samples.every((v, i) => at(copy, i / 100) === v && at(rock, i / 100) === v), "the same id and time shook differently");
  const other = Array.from({ length: 101 }, (_, i) => at({ id: "res_ore_3", risenAt: 100 }, i / 100));
  assert(other.some((v, i) => v !== samples[i]), "every id shakes the same");
  return `${jolts} jolts over ${T} s, at most ${Math.max(...samples.map(Math.abs))} px, still from ${(samples.findLastIndex((v) => v !== 0) + 1) / 100} of the rise: ${samples.filter((v, i) => i % 5 === 0).join(" ")}`;
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
  // A card counts as the picker shows: a palette colour equal to the item's own is its Undyed swatch (the breeches' Walnut brown, the boots' Dark brown).
  for (const [id, n] of [["breeches", 15], ["boots", 6], ["gloves", 7]]) {
    const t = itemInfoMod.textOf(itemInfoMod.cardFor(itemsMod.makeEntry(id, 1)));
    assert(t.some((l) => l.includes(`Can be dyed at a dye vat: ${n} colours.`)), `the ${id}' card: ${t.join(" | ")}`);
  }
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
  // The belt's own buckle is the Brass dye's hex: black with its own buckle is "Black and brass", never "undyed" (docs/bugs.md, fixed).
  assert(run(belt.uid, ["#2a2428", "#c8a040"]).ok && dyeMod.colourWords(belt) === "Black and brass", `the belt black with its own brass buckle reads ${dyeMod.colourWords(belt)}`);
  const satchel = itemsMod.makeEntry("satchel", 1);
  inventoryMod.stow(me, satchel);
  assert(run(satchel.uid, ["#3e6a38", "#5c2020"]).ok && satchel.colours.join() === "#3e6a38,#5c2020", "the satchel did not take green cloth and an oxblood strap");
  assert(run(satchel.uid, ["#5c2020", "#3e6a38"]).reason === "The vat has no such colour for it.", "the satchel took oxblood cloth and a green strap");
  assert(run(satchel.uid, ["#c8b890", "#5c2020"]).ok && satchel.colours.join() === "#c8b890,#5c2020", "the satchel's own cloth with a dyed strap was refused");
  assert(dyeMod.colourWords(satchel) === "Cloth undyed, strap oxblood", `the satchel's own cloth, no vat's colour, reads ${dyeMod.colourWords(satchel)}`);
  // A wardrobe's single colour (a hood from the dead) is replaced, and an item's own colours undye it.
  const hood = itemsMod.makeEntry("hood", 1, { colour: "#705848" });
  inventoryMod.stow(me, hood);
  assert(run(hood.uid, ["#6a3c72"]).ok && !hood.colour && hood.colours.join() === "#6a3c72", "a wardrobe-dyed hood did not take orchil");
  assert(run(hood.uid, ["#5f8a3a"]).ok && !hood.colours && !hood.colour, "the hood's own green did not undye it");
  // The picker lists everything carried the verb can take (docs/bugs.md, fixed): the satchel in the worn bag, and a garment on a worn belt's slot,
  // dyed by its uid as a guest's command names it.
  const beltWorn = itemsMod.makeEntry("good_belt", 1);
  const waist0 = me.worn.waist;
  me.worn.waist = beltWorn;
  const onBelt = itemsMod.makeEntry("gloves", 1);
  inventoryMod.ensureSlots(beltWorn)[0] = onBelt;
  const listed = dyeMod.dyeables(me).map((d) => d.entry);
  assert(listed.includes(satchel) && listed.includes(onBelt) && listed.includes(beltWorn), `the picker's list: ${listed.map((e) => e.id).join(", ")}`);
  hostMod.netHooks().dye(me, { propId: vat.id, uid: onBelt.uid, colours: ["#5c2020"] });
  assert(onBelt.colours && onBelt.colours.join() === "#5c2020", "gloves on the belt's slot were not dyed by the guest's command");
  // A bag inside a bag, and what it holds (no bag holding things goes into a bag today, inventory.canStoreIn; the walk is the guard).
  const inner = itemsMod.makeEntry("satchel", 1);
  const innerCap = itemsMod.makeEntry("cap", 1);
  inventoryMod.ensureBag(inner).items.push(innerCap);
  inventoryMod.bagOf(me).items.push(inner);
  assert(dyeMod.dyeables(me).some((d) => d.entry === innerCap) && run(innerCap.uid, ["#3e5e90"]).ok && innerCap.colours.join() === "#3e5e90", "a cap in a satchel in the bag was not listed and dyed");
  inventoryMod.bagOf(me).items.splice(inventoryMod.bagOf(me).items.indexOf(inner), 1);
  me.worn.waist = waist0;
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
const promptWater = await import("../src/ui/prompt.js"); // the file's promptMod is imported further down
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
  // Fill waterskins at tainted water skips a skin holding clean water and fills a tainted one (Michael, 2026-10-26); with only clean skins to
  // fill it says why. An empty skin marked clean fills and is tainted (mixing taints).
  const tile = { kind: "tile", tile: wet.water };
  const fillLabel = interactMod.actionsForTarget(tile, me).map((a) => a.label).find((l) => l.startsWith("Fill waterskins"));
  const drinkLabel = interactMod.actionsForTarget(tile, me).map((a) => a.label).find((l) => l.startsWith("Drink from"));
  assert(drinkLabel === "Drink from the water (tainted)", `the water's Drink: ${drinkLabel}`);
  const kit0 = kitSkin.fill;
  tainted.fill = 60;
  interactMod.performByLabel(me, tile, fillLabel);
  finish();
  assert(kitSkin.fill === kit0 && kitSkin.clean === true && tainted.fill === 100, `the fill at tainted water: kit ${JSON.stringify(kitSkin)}, tainted ${tainted.fill}`);
  const cleanLabel = interactMod.actionsForTarget(tile, me).map((a) => a.label).find((l) => l.startsWith("Fill waterskins"));
  const said = [];
  promptWater.setMessageSink((t) => { said.push(t); return true; });
  const keptOk = interactMod.performByLabel(me, tile, cleanLabel);
  finish();
  promptWater.setMessageSink(null);
  assert(cleanLabel === "Fill waterskins (they hold clean water)" && kitSkin.fill === kit0 && kitSkin.clean && said.includes("Your waterskins hold clean water: they won't be filled from tainted water."), `only a clean skin to fill: ${cleanLabel}; ${keptOk}; ${said.join(" / ")}`);
  const emptyClean = itemsMod.makeEntry("waterskin", 1, { fill: 0, clean: true });
  inventoryMod.stow(me, emptyClean);
  interactMod.performByLabel(me, tile, "Fill waterskins");
  finish();
  assert(emptyClean.fill === 100 && !emptyClean.clean && kitSkin.fill === kit0 && kitSkin.clean, `an empty clean-marked skin: ${JSON.stringify(emptyClean)}`);
  inventoryMod.detach(me, emptyClean);
  assert(itemInfoMod.textOf(itemInfoMod.cardFor(tainted)).includes("Tainted water: drinking it may make you Sick."), "the tainted skin's card");
  assert(interactMod.itemMenu(me, tainted, bag, null).some((m) => m.label === "Drink (tainted, 100%)"), "Drink lost its (tainted)");
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

const fruitArt = await import("../src/fruit-art.js");
check("fruit art: apples painted on a crown's leaves only, spread, the same every time, the source untouched (#422)", () => {
  // A crown of leaf green inside a dark outline, a brown trunk below it, as the round tree is drawn.
  const w = 60;
  const h = 70;
  const px = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, [r, g, b]) => { const i = (y * w + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - 30, y - 26);
    if (d < 24) put(x, y, (x + y) % 5 ? [88, 134, 70] : [56, 90, 50]);
    else if (d < 25.5) put(x, y, [26, 38, 28]);
    else if (y >= 50 && x >= 26 && x < 34) put(x, y, [104, 72, 48]);
  }
  const before = new Uint8ClampedArray(px);
  const def = JSON.parse(fs.readFileSync(path.join(root, "data/sprites/tree_apple.json"), "utf8"));
  const spec = def.fruit;
  assert(spec && spec.count > 0 && Array.isArray(spec.shape) && spec.shape.every((r) => [...r].every((c) => c === "." || spec.colours[c])), "tree_apple's fruit block: a count, a shape, a colour for each letter");
  const a = fruitArt.paintFruit(px, w, h, spec);
  const b = fruitArt.paintFruit(px, w, h, spec);
  assert(px.every((v, i) => v === before[i]), "painting wrote into the source picture");
  assert(a.spots.length === spec.count, `${a.spots.length} apples of ${spec.count}`);
  assert(JSON.stringify(a.spots) === JSON.stringify(b.spots) && a.px.every((v, i) => v === b.px[i]), "two paintings differ");
  const sw = Math.max(...spec.shape.map((r) => r.length));
  const sh = spec.shape.length;
  let changed = 0;
  for (let i = 0; i < a.px.length; i += 4) {
    if (a.px[i] === px[i] && a.px[i + 1] === px[i + 1] && a.px[i + 2] === px[i + 2] && a.px[i + 3] === px[i + 3]) continue;
    changed++;
    assert(fruitArt.isLeaf(px, i), `a fruit pixel at ${(i / 4) % w},${Math.floor(i / 4 / w)} is not on a leaf`);
  }
  const cells = spec.shape.join("").replace(/\./g, "").length;
  assert(changed <= spec.count * cells && changed > 0, `${changed} pixels changed for ${spec.count} apples of ${cells}`);
  for (const [x, y] of a.spots) for (const [ox, oy] of a.spots) if (x !== ox || y !== oy) assert(Math.abs(x - ox) >= sw + (spec.gap ?? 2) || Math.abs(y - oy) >= sh + (spec.gap ?? 2), `apples at ${x},${y} and ${ox},${oy} too close`);
  // Spread: apples in every quarter of the crown.
  const quarters = new Set(a.spots.map(([x, y]) => `${x + sw / 2 < 30 ? "w" : "e"}${y + sh / 2 < 26 ? "n" : "s"}`));
  assert(quarters.size === 4, `apples in ${[...quarters].join(", ")} only`);
  const bare = JSON.parse(fs.readFileSync(path.join(root, "data/sprites/tree_apple_bare.json"), "utf8"));
  assert(bare.image === def.image && !bare.fruit && JSON.stringify(bare.frames) === JSON.stringify(def.frames) && JSON.stringify(bare.anchor) === JSON.stringify(def.anchor), "the bare tree is the same picture, frames, and anchor with no fruit");
  const oak = JSON.parse(fs.readFileSync(path.join(root, "data/sprites/tree_oak_m.json"), "utf8"));
  assert(def.image === oak.image && JSON.stringify(def.anchor) === JSON.stringify(oak.anchor) && JSON.stringify(def.bounds) === JSON.stringify(oak.bounds) && JSON.stringify(def.collide) === JSON.stringify(oak.collide), "the apple tree is the round tree's picture, anchor, bounds, and trunk (tree_oak_m)");
  return `${a.spots.length} apples, ${changed} pixels, all on leaves, in all four quarters; the bare tree and the round tree agree`;
});

const beesMod = await import("../src/render/bees.js");
check("bees: three to six drawn bees (stripes dark, gold, dark, a head, wings folding every step, facing their way), in loops above and beside a hive's crown by day, none from dusk to dawn, whole pixels, livelier when honey is taken (#441)", () => {
  const hives = Array.from({ length: 20 }, (_, i) => ({ id: `p_${100 + i * 7}` }));
  const counts = new Set();
  for (const hv of hives) {
    const n = beesMod.beesAt(hv, 123.4, "day").length;
    assert(n >= 3 && n <= 6, `${hv.id}: ${n} bees by day`);
    counts.add(n);
    for (const phase of ["dusk", "night", "dawn"]) assert(beesMod.beesAt(hv, 123.4, phase).length === 0, `${hv.id}: bees at ${phase}`);
  }
  assert(counts.size >= 2, `every hive has the same number of bees (${[...counts]})`);
  const hv = hives[0];
  let seen = 0;
  let behind = 0;
  let widest = 0;
  for (let t = 0; t < 60; t += 0.37) {
    for (const b of beesMod.beesAt(hv, t, "day", t % 3 / 3)) {
      assert(Number.isInteger(b.x) && Number.isInteger(b.y), `a bee at ${b.x},${b.y}`);
      for (const [fx, fy] of beesMod.figureOf(b)) assert(Math.abs(b.x + fx) <= 45 && b.y + fy >= -34 && b.y + fy <= 9, `a bee's figure strayed to ${b.x + fx},${b.y + fy} from the crown`);
      assert(b.dx === 1 || b.dx === -1, `a bee's way ${b.dx}`);
    }
    for (const b of beesMod.beesAt(hv, t, "day")) {
      assert(b.y <= 1, `a calm bee at ${b.y} px from the cloud's anchor sits on the crown, not above it`);
      seen++;
      if (b.back) behind++;
      widest = Math.max(widest, Math.abs(b.x));
    }
  }
  assert(behind / seen < 0.35, `${behind} of ${seen} bees behind the hive: most should be in front`);
  assert(widest >= 12, `the calm cloud spans only ${widest} px either side of the crown`);
  const { BEES } = beesMod;
  assert(BEES.gold === "#e0b03a" && BEES.dark === "#2b2522" && BEES.wing === "#e8e4d0" && BEES.rx[0] >= 10 && BEES.rx[1] <= 18, `the bee's colours and loops: ${JSON.stringify(BEES)}`);
  // The figure's pixels: facing right, wings up, a body of three stripes (dark, gold, dark) three tall, a dark head pixel at the right, two wing pixels
  // above; the next step one wing pixel; facing left the same mirrored.
  const grid = (bee) => {
    const px = beesMod.figureOf(bee);
    const xs = px.map((p) => p[0]);
    const ys = px.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const at = (x, y) => (px.find((p) => p[0] === x + x0 && p[1] === y + y0) || [0, 0, "."])[2];
    return { w: Math.max(...xs) - x0 + 1, h: Math.max(...ys) - y0 + 1, at, n: px.length, x0 };
  };
  const D = BEES.dark;
  const Gd = BEES.gold;
  const Wg = BEES.wing;
  const right = grid({ dx: 1, wing: true });
  assert(right.w === 4 && right.h === 4 && right.n === 12, `the figure is ${right.w} by ${right.h} with ${right.n} pixels, not 4 by 4 (in a 5 by 4 frame) with 12`);
  for (let y = 1; y <= 3; y++) assert(right.at(0, y) === D && right.at(1, y) === Gd && right.at(2, y) === D, `body row ${y} is not dark, gold, dark: ${right.at(0, y)} ${right.at(1, y)} ${right.at(2, y)}`);
  assert(right.at(3, 2) === D && right.at(3, 1) === "." && right.at(3, 3) === ".", "no dark head pixel at the right, mid-body");
  assert(right.at(0, 0) === Wg && right.at(1, 0) === Wg && right.at(2, 0) === "." && right.at(3, 0) === ".", "the wings up are not two pale pixels above the body");
  const folded = beesMod.figureOf({ dx: 1, wing: false }).filter((p) => p[2] === Wg);
  assert(folded.length === 1, `folded, ${folded.length} wing pixels, not one`);
  const left = grid({ dx: -1, wing: true });
  assert(left.at(0, 2) === D && left.at(1, 1) === D && left.at(2, 1) === Gd && left.at(3, 1) === D && left.at(2, 0) === Wg && left.at(3, 0) === Wg, "facing left is not the figure mirrored");
  const centreR = beesMod.figureOf({ dx: 1, wing: true });
  const centreL = beesMod.figureOf({ dx: -1, wing: true });
  assert(centreR.some((p) => p[0] === 0 && p[1] === 0 && p[2] === Gd) && centreL.some((p) => p[0] === 0 && p[1] === 0 && p[2] === Gd), "the bee's position is not its gold middle, both ways");
  // The wing's beat on every step, with the sim time summed in sixtieths as the loop sums it (not k / 60, which rounds kindly).
  let simT = 0;
  let lastWing = null;
  let flips = 0;
  for (let k = 0; k < 3600; k++) {
    simT += 1 / 60;
    const wing = beesMod.beesAt(hv, simT, "day")[0].wing;
    if (lastWing !== null && wing !== lastWing) flips++;
    lastWing = wing;
  }
  assert(flips === 3599, `the wing flickered on ${flips} of 3599 steps, not every one`);
  assert(JSON.stringify(beesMod.beesAt(hv, 50, "day")) === JSON.stringify(beesMod.beesAt(hv, 50, "day")), "the same moment drew two ways");
  assert(JSON.stringify(beesMod.beesAt(hv, 50, "day")) !== JSON.stringify(beesMod.beesAt(hv, 50.5, "day")), "the bees did not move in half a second");
  // A step of the clock moves a bee a few pixels, not across its loop (calm, and while the stir fades).
  for (const s of [0, 0.5]) {
    const p = beesMod.beesAt(hv, 80, "day", s);
    const q = beesMod.beesAt(hv, 80 + 1 / 60, "day", s);
    p.forEach((b, i) => assert(Math.abs(b.x - q[i].x) <= 4 && Math.abs(b.y - q[i].y) <= 4, `a bee jumped ${b.x},${b.y} to ${q[i].x},${q[i].y} in a step (stir ${s})`));
  }
  const calm = hives.find((x) => beesMod.countOf(x) < 6);
  assert(beesMod.beesAt(calm, 10, "day", 1).length === 6, "a stirred hive has six bees");
  const spread = (list) => Math.max(...list.map((b) => Math.abs(b.x)));
  let wider = 0;
  for (let t = 0; t < 20; t += 0.5) if (spread(beesMod.beesAt(calm, t, "day", 1)) >= spread(beesMod.beesAt(calm, t, "day", 0))) wider++;
  assert(wider >= 30, `a stirred hive's bees fly wider only ${wider} of 40 times`);
  // The stir read off the prop: honeyAt is the clock at the take plus the days.
  const tuningJson = read("data/tuning.json");
  const day = clock.DAY_LENGTH * tuningJson.work.honey.days;
  const taken = { id: "p_9", honeyAt: 5000 + day };
  assert(beesMod.stirOf({ id: "p_9" }, 5000) === 0, "a hive never taken from is stirred");
  assert(beesMod.stirOf(taken, 5000) === 1 && beesMod.stirOf(taken, 5000 + beesMod.BEES.stirSeconds / 2) === 0.5 && beesMod.stirOf(taken, 5000 + beesMod.BEES.stirSeconds) === 0 && beesMod.stirOf(taken, 5000 + 100) === 0, "the stir does not fade from 1 to 0 over its seconds");
  return `${[...counts].sort().join(", ")} bees by hive, none from dusk to dawn; six and wider when stirred, for ${beesMod.BEES.stirSeconds} s of the clock`;
});

// Herbs, clay, and salt (docs/46 step 2, #448): each herb kind placed to its count on its ground (mageroot by water, nightshade and
// wolfsbane by trees, the graveyard's inside its wall), clay banks by the river, salt rocks in the ore area; gathered by the verb and by the
// menu's label a guest sends (the herb to the bag, the node gone, a debt), a mushroom foraged, the graveyard's by day (no plant is night's alone: Michael, 2026-10-25), clay dug only
// with a shovel carried, salt mined with a pickaxe; a full bag drops it at the feet; past their days each comes back elsewhere in its area
// by day, the graveyard's too, and salt rising; the cards say the name, the kind, and no use that is not built; the dev art is outlined
// all the way round and fits its icon. (The pictures on the page, every card read over the bag, and two tabs are `check("herbs")`'s.)
const gatherArt = await import("../src/gather-art.js");
await import("../src/gather.js");
check("herbs, clay, and salt: placed to their counts on their ground, gathered by the verb and a guest's label at any hour, the tool, the comeback, the cards, the art", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  const bag = inventoryMod.bagOf(me);
  const HERBS = ["sage", "nettle", "feverfew", "yarrow", "woad", "madder", "weld", "mana_herb", "nightshade", "wolfsbane", "grave_moss"];
  const kinds = Object.fromEntries([...HERBS, "clay", "salt", "mushrooms"].map((n) => [n, mapMod.resourceKind(n)]));
  for (const [n, k] of Object.entries(kinds)) assert(k, `no resource kind ${n}`);
  const nodesOf = (k) => mapMod.allProps().filter((p) => k.sprites[p.sprite] !== undefined && mapMod.inResourceArea(k, p.tile[0], p.tile[1]));
  // The counts: 120 herbs, split by kind, each its lever; clay 8; salt 4.
  const herbTotal = HERBS.reduce((s, n) => s + kinds[n].count, 0);
  assert(herbTotal === 120, `the herbs' levers add to ${herbTotal}, not 120`);
  for (const n of [...HERBS, "clay", "salt"]) assert(mapMod.resourceCensus(kinds[n]) === kinds[n].count, `${n}: ${mapMod.resourceCensus(kinds[n])} standing, lever ${kinds[n].count}`);
  assert(kinds.clay.count === 8 && kinds.salt.count === 4, `clay ${kinds.clay.count}, salt ${kinds.salt.count}`);
  // Their ground.
  const treeNear = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const t = mapMod.tileAt(x + dx, y + dy); if ((dx || dy) && t.prop && getDef(t.prop.sprite).canopy) return true; } return false; };
  for (const p of nodesOf(kinds.mana_herb)) assert(mapMod.waterNear(p.tile[0], p.tile[1], 2), `a mageroot at ${p.tile} is not by water`);
  for (const p of nodesOf(kinds.clay)) assert(mapMod.waterNear(p.tile[0], p.tile[1], 2, "river"), `a clay bank at ${p.tile} is not by the river`);
  for (const n of ["nightshade", "wolfsbane"]) for (const p of nodesOf(kinds[n])) { mapMod.ensureAround(p.tile[0], p.tile[1], 1); assert(treeNear(p.tile[0], p.tile[1], 2), `${n} at ${p.tile} has no tree near`); }
  const gy = json.resources.grave_moss.rects[0];
  for (const p of nodesOf(kinds.grave_moss)) assert(p.tile[0] >= gy[0] && p.tile[1] >= gy[1] && p.tile[0] < gy[0] + gy[2] && p.tile[1] < gy[1] + gy[3], `grave moss at ${p.tile} outside the graveyard`);
  const fence = json.features.find((f) => f.kind === "fence" && f.rect[0] === gy[0] && f.rect[1] === gy[1]);
  assert(fence && kinds.grave_moss.own && Object.values(json.resources).every((k) => k.night === undefined) && getDef("herb_grave_moss").gather.night === undefined, "the graveyard's herbs are not its own place's, or a kind still waits for night");
  for (const p of nodesOf(kinds.salt)) assert(mapMod.inResourceArea(mapMod.resourceKind("ore"), p.tile[0], p.tile[1]), `a salt rock at ${p.tile} outside the ore area`);
  // Every node: a gatherable, the herbs and mushrooms walked through, the clay bank and salt rock solid.
  for (const n of [...HERBS, "clay", "salt"]) {
    const p = nodesOf(kinds[n])[0];
    const solid = n === "clay" || n === "salt";
    assert(p.interactable && p.solid === solid, `${n}: interactable ${p.interactable}, solid ${p.solid}`);
  }
  // The sway (the gatherables law): a body walking through an herb stamps its sway, as through a crop; through a clay bank, solid, it does not.
  {
    const herb = nodesOf(kinds.weld)[0];
    const bank0 = nodesOf(kinds.clay)[0];
    for (const p of [herb, bank0]) { mapMod.ensureAround(p.tile[0], p.tile[1], 0); p.pokedAt = undefined; }
    const walker = { gx: herb.tile[0], gy: herb.tile[1] };
    interactMod.brushThrough(walker);
    const walker2 = { gx: bank0.tile[0], gy: bank0.tile[1] };
    interactMod.brushThrough(walker2);
    assert(Number.isFinite(herb.pokedAt) && bank0.pokedAt === undefined, `walked through: the weld's pokedAt ${herb.pokedAt}, the clay bank's ${bank0.pokedAt}`);
    herb.pokedAt = undefined;
  }
  // Gathering: stand by a node, the verb by its id.
  const finish = () => { for (let i = 0; i < 600 && me.action; i++) interactMod.updateAction(me, 0.1); };
  const standBy = (p) => { mapMod.ensureAround(p.tile[0], p.tile[1], 1); me.gx = p.tile[0] + 0.9; me.gy = p.tile[1] + 0.3; me.moving = false; };
  const count = (id) => bag.items.filter((e) => e.id === id).reduce((s, e) => s + e.count, 0);
  for (const e of [...bag.items]) if (!["waterskin"].includes(e.id)) inventoryMod.detach(me, e);
  clock.setHour(12);
  const sage = nodesOf(kinds.sage)[0];
  standBy(sage);
  const o0 = resourcesMod.owed("sage").length;
  const g1 = verbsMod.run("gather", S, me, { prop: sage.id });
  assert(g1.ok && g1.gathered === 1 && count("sage") === 1 && !mapMod.propById(sage.id) && resourcesMod.owed("sage").length === o0 + 1, `gather sage: ${JSON.stringify(g1)}, ${count("sage")} in the bag, owed ${resourcesMod.owed("sage").length}`);
  assert(mapMod.resourceCensus(kinds.sage) === kinds.sage.count - 1, "the sage count did not fall by one");
  // A guest's way: the menu's label on the node's address, run as the host runs it (net.js `act`), the bar of its seconds, then the verb.
  const labels = (p) => interactMod.actionsForTarget({ kind: "prop", id: p.id }, me).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}`);
  const nettle = nodesOf(kinds.nettle)[0];
  standBy(nettle);
  assert(labels(nettle).includes("Gather nettle"), `the nettle's menu: ${labels(nettle).join(", ")}`);
  interactMod.performByLabel(me, { kind: "prop", id: nettle.id }, "Gather nettle");
  assert(me.action && me.action.action.duration === getDef(nettle.sprite).gather.seconds, "the label did not start the gathering's bar");
  finish();
  assert(count("nettle") === 1 && !mapMod.propById(nettle.id) && resourcesMod.owed("nettle").length === 1, "the label's bar did not gather the nettle");
  // A mushroom foraged by its label (Herbalism 3): the mushroom to the bag, a debt on the mushrooms' record.
  const shroom = nodesOf(kinds.mushrooms)[0];
  standBy(shroom);
  interactMod.performByLabel(me, { kind: "prop", id: shroom.id }, "Forage mushroom");
  finish();
  assert(count("mushroom") === 1 && !mapMod.propById(shroom.id) && resourcesMod.owed("mushrooms").length === 1, `forage: ${count("mushroom")} mushrooms, owed ${resourcesMod.owed("mushrooms").length}; menu ${labels(shroom).join(", ")}`);
  // The graveyard's: gathered by day, as every herb is (Michael, 2026-10-25: "I don't want any 'only at night' plants").
  const moss = nodesOf(kinds.grave_moss)[0];
  standBy(moss);
  clock.setHour(12);
  assert(labels(moss).includes("Gather grave moss") && !labels(moss).some((l) => /night/.test(l)), `by day the menu: ${labels(moss).join(", ")}`);
  const day = verbsMod.run("gather", S, me, { prop: moss.id });
  assert(day.ok && count("grave_moss") === 1 && resourcesMod.owed("grave_moss").length === 1, `by day: ${JSON.stringify(day)}`);
  // Clay: no shovel, refused and greyed; a shovel in the bag (carried, the tool rule), dug for two.
  const bank = nodesOf(kinds.clay)[0];
  standBy(bank);
  const noTool = verbsMod.run("dig", S, me, { prop: bank.id });
  assert(!noTool.ok && noTool.reason === "You need a shovel." && labels(bank).includes("Dig clay (need a shovel) [off]"), `no shovel: ${JSON.stringify(noTool)}; menu ${labels(bank).join(", ")}`);
  inventoryMod.stow(me, itemsMod.makeEntry("shovel", 1));
  interactMod.performByLabel(me, { kind: "prop", id: bank.id }, "Dig clay");
  finish();
  assert(count("clay") === 2 && !mapMod.propById(bank.id) && resourcesMod.owed("clay").length === 1, `dig: ${count("clay")} clay, owed ${resourcesMod.owed("clay").length}`);
  // Salt: mined with a pickaxe in hand (mining.js), two salt, a debt.
  const salt = nodesOf(kinds.salt)[0];
  standBy(salt);
  assert(!verbsMod.run("mine", S, me, { prop: salt.id }).ok, "salt mined with no pickaxe");
  me.hands.main = itemsMod.makeEntry("pickaxe", 1);
  const ms = verbsMod.run("mine", S, me, { prop: salt.id });
  me.hands.main = null;
  assert(ms.ok && count("salt") === 2 && resourcesMod.owed("salt").length === 1, `mine salt: ${JSON.stringify(ms)}`);
  // A full bag: the herb falls at the feet.
  const yarrow = nodesOf(kinds.yarrow)[0];
  standBy(yarrow);
  const fillers = [];
  for (let i = 0; i < 200; i++) { const e = itemsMod.makeEntry("stone", 1); if (!inventoryMod.addItem(bag, "stone", 1)) break; fillers.push(e); }
  const g2 = verbsMod.run("gather", S, me, { prop: yarrow.id });
  const feet = mapMod.itemsAt(Math.round(me.gx), Math.round(me.gy));
  assert(g2.ok && count("yarrow") === 0 && feet.some((e) => e.id === "yarrow") && /at your feet/.test(g2.message), `a full bag: ${JSON.stringify(g2)}, at the feet ${feet.map((e) => e.id)}`);
  for (const e of [...bag.items]) if (e.id === "stone") inventoryMod.detach(me, e);
  // The comeback: past the days, by day, every kind grows elsewhere in its area, the graveyard's too (no kind waits for night).
  const ids = new Set(mapMod.allProps().map((p) => p.id));
  const taken = { sage: sage.tile, nettle: nettle.tile, grave_moss: moss.tile, clay: bank.tile, salt: salt.tile, yarrow: yarrow.tile };
  const due = Math.max(...Object.keys(taken).map((n) => Math.max(...resourcesMod.owed(n).map((d) => d.due))));
  clock.setElapsed(Math.ceil(due / clock.DAY_LENGTH) * clock.DAY_LENGTH + clock.DAY_LENGTH * (12 / 24)); // noon of the day after the last falls due
  let looks = 0;
  const others = Object.keys(taken);
  // A look an hour of the clock; past 20:00 the clock goes on to the next noon, so every look is by day.
  const dayLook = () => { gameMod.begin(0); clock.setElapsed(clock.getElapsed() + RESOURCES.checkSeconds); if (clock.getHour() >= 20 || clock.getHour() < 8) clock.setElapsed(Math.ceil(clock.getElapsed() / clock.DAY_LENGTH) * clock.DAY_LENGTH + clock.DAY_LENGTH / 2); };
  for (; looks < 12 && others.some((n) => resourcesMod.owed(n).length); looks++) { dayLook(); assert(clock.getPhase() === "day", `a daytime look at ${clock.getHour().toFixed(1)}`); }
  assert(!others.some((n) => resourcesMod.owed(n).length), `by day after ${looks} looks still owed: ${others.filter((n) => resourcesMod.owed(n).length).join(", ")}`);
  const back = (n) => mapMod.allProps().find((p) => !ids.has(p.id) && kinds[n].sprites[p.sprite] !== undefined && mapMod.inResourceArea(kinds[n], p.tile[0], p.tile[1]));
  for (const n of others) {
    const p = back(n);
    assert(p && (p.tile[0] !== taken[n][0] || p.tile[1] !== taken[n][1]) && mapMod.resourceCensus(kinds[n]) === kinds[n].count, `${n} did not come back elsewhere in its area`);
  }
  assert(Number.isFinite(back("salt").risenAt) && back("sage").risenAt === undefined && mapMod.waterNear(back("clay").tile[0], back("clay").tile[1], 2, "river"), "salt does not rise, an herb rises, or the clay bank is not by the river");
  // What a guest gets: the herb in the player's record moves the players' sync part, the node gone moves the map's.
  const parts0 = gameMod.syncParts();
  const fever = nodesOf(kinds.feverfew)[0];
  standBy(fever);
  assert(verbsMod.run("gather", S, me, { prop: fever.id }).ok, "the feverfew was not gathered");
  const parts1 = gameMod.syncParts();
  assert(parts1.players !== parts0.players && parts1.map !== parts0.map, `a gather did not move the players' part (${parts1.players !== parts0.players}) or the map's (${parts1.map !== parts0.map})`);
  // The cards: the full name, the kind, where it is gathered (read from its nodes and their kinds' `where`), and no use that is not built.
  const SOURCE = { sage: "Grows wild in the valley; gathered by hand.", nettle: "Grows wild in the valley; gathered by hand.", feverfew: "Grows wild in the valley; gathered by hand.", yarrow: "Grows wild in the valley; gathered by hand.", woad: "Grows wild in the valley; gathered by hand.", madder: "Grows wild in the valley; gathered by hand.", weld: "Grows wild in the valley; gathered by hand.", mana_herb: "Grows wild near water; gathered by hand.", nightshade: "Grows wild near trees; gathered by hand.", wolfsbane: "Grows wild near trees; gathered by hand.", grave_moss: "Grows wild in the graveyard; gathered by hand.", mushroom: "Forage under trees.", clay: "Dug from the clay banks by the river, a shovel carried.", salt: "Mined from salt rocks at the iron workings, a pickaxe in hand." };
  const KIND = { sage: "Herb", nettle: "Herb", feverfew: "Herb", yarrow: "Herb", mana_herb: "Herb", nightshade: "Herb", wolfsbane: "Herb", grave_moss: "Herb", woad: "Dye plant", madder: "Dye plant", weld: "Dye plant", mushroom: "Forage", clay: "Material", salt: "Material" };
  // What a gathered thing goes into once its use is built (the potions and the vials of docs/47, #481), said before where it is gathered.
  const GOES = { sage: "Goes into: healing potion.", yarrow: "Goes into: healing potion.", nettle: "Goes into: stamina potion.", mana_herb: "Goes into: mana potion.", mushroom: "Goes into: mana potion.", nightshade: "Goes into: poison.", wolfsbane: "Goes into: strong poison.", grave_moss: "Goes into: poison, strong poison.", clay: "Goes into: unfired vial, unfired jar." };
  for (const [id, kind] of Object.entries(KIND)) {
    const c = itemInfoMod.cardFor(itemsMod.makeEntry(id));
    const lines = c.lines.map((l) => l.map((g) => g.t).join(""));
    const want = GOES[id] ? [GOES[id], SOURCE[id]] : [SOURCE[id]];
    assert(c.name === itemsMod.getItem(id).name && c.kind === kind && lines.join(" | ") === want.join(" | "), `${id}'s card: ${itemInfoMod.textOf(c).join(" | ")}`);
  }
  assert(itemInfoMod.gatheredFrom(itemsMod.getItem("stone")).length === 0 && itemInfoMod.gatheredFrom(itemsMod.getItem("iron_ore")).length === 0, "stone or iron ore gained a source line (their kinds have no where)");
  assert(itemsMod.getItem("mana_herb").name === "Mageroot" && itemsMod.getItem("grave_moss").name === "Grave moss", "the names Michael gave moved (Mageroot, grave moss; 2026-10-25)");
  // The art: every design outlined all the way round, its icon fitting 19 by 19, the herbs' icons their nodes' pictures.
  const designs = itemsMod.allItems().filter((d) => d.icon && d.icon.placeholder).map((d) => [d.id, typeof d.icon.placeholder === "string" ? getDef(d.icon.placeholder).placeholder : d.icon.placeholder]);
  for (const sid of ["clay_bank", "salt_rock", ...HERBS.map((n) => `herb_${n}`)]) if (getDef(sid).placeholder) designs.push([sid, getDef(sid).placeholder]); // a drawn node (art round 5) is checked for its outline when it is wired
  for (const [id, d] of designs) {
    const p = gatherArt.pixelsOf(d);
    const at = new Map(p.px.map(([x, y, c]) => [`${x},${y}`, c]));
    const open = p.px.filter(([x, y, c]) => c !== gatherArt.OUTLINE && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !at.has(`${x + dx},${y + dy}`)));
    assert(open.length === 0 && at.get(`${p.ax},${p.ay}`) && at.get(`${p.ax},${p.ay}`) !== gatherArt.OUTLINE, `${id}: ${open.length} pixels with no outline beside them, or no foot`);
    if (itemsMod.hasItemDef(id)) assert(gatherArt.iconPixelsOf(d, [19, 19]).fits, `${id}'s icon does not fit 19 by 19 (${p.w} by ${p.h})`);
  }
  return `${HERBS.length} herb kinds, ${herbTotal} herbs, clay ${kinds.clay.count}, salt ${kinds.salt.count}; gathered by verb and label, foraged, the graveyard's by day, clay with a shovel, salt with a pickaxe; back after ${looks} looks by day, the graveyard's too; ${designs.length} designs outlined`;
});

// Saplings and sticks (docs/46 step 3, #449): felling drops a sapling at its chance (seeded, the sim's generator), and always at 1 and never at
// 0; the sapling planted from the bag by the host's own call and by a guest's `setdown` command on open grass, refused indoors, on a road, on
// tilled soil, and against a wall; it grows through its stages to the round oak over its days, keeping its id, the tree solid and choppable;
// it waits while a body stands on it (the stamp marks its chunk); Gather sticks by the label a guest sends, after its bar, once a game day,
// greyed and refused after, again the next day, never on a stump, kept from E by a laden apple tree's Pick apples; the stamps in the save and
// the sync hash; the cards. (The page, the pictures, and two tabs are `check("saplings")`'s, in the pane.)
const treesMod = await import("../src/trees.js"); // setdownMod is the file's own, above
check("saplings and sticks: dropped at their chance, planted by the host and a guest on open grass only, grown to an oak over their days, waiting while stood on; sticks once a day", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  const T = tuningMod.trees;
  const DAY = clock.DAY_LENGTH;
  const bag = inventoryMod.bagOf(me);
  for (const e of [...bag.items]) inventoryMod.detach(me, e);
  // The data.
  assert(T.sapling.chance > 0 && T.sapling.chance < 1 && T.sapling.days === 5 && T.sapling.grows === "tree_oak_m" && getDef("tree_oak_m").canopy && T.sapling.stages.every((s) => getDef(s).sapling && getDef(s).interactable && getDef(s).item === "sapling"), `the tuning: ${JSON.stringify(T)}`);
  const sapDef = itemsMod.getItem("sapling");
  assert(sapDef.place === T.sapling.stages[0] && sapDef.stand === "natural" && T.sticks.item === "stick" && read("data/tuning.json").floaters.gathers.sticks, "the sapling item or the sticks' floater");
  // The chance, seeded: the share of a thousand rolls near the lever, the same for the same seed.
  const rolls = (seed) => { rng.seed(seed); let n = 0; const [x, y] = [0, 0]; for (let i = 0; i < 1000; i++) { mapMod.growTile(x, y); if (treesMod.fellDrop(x, y)) n++; } for (const e of [...mapMod.itemsAt(x, y)]) mapMod.takeItem(x, y, e); return n; };
  const n1 = rolls(5);
  assert(Math.abs(n1 / 1000 - T.sapling.chance) < 0.05 && rolls(5) === n1, `${n1} saplings in 1000 fellings at ${T.sapling.chance}`);
  // Felling by the verb: at chance 1 a sapling falls on the stump's tile, at 0 none.
  const chance0 = T.sapling.chance;
  const fellOne = (chance) => {
    const tree = mapMod.allProps().find((p) => treesMod.isStandingTree(p) && !p.sprite.startsWith("tree_apple") && Math.hypot(p.tile[0] - me.gx, p.tile[1] - me.gy) < 30);
    mapMod.growTile(tree.tile[0], tree.tile[1]);
    me.gx = tree.tile[0] + 1; me.gy = tree.tile[1] + 0.2;
    me.hands.main = itemsMod.makeEntry("hatchet", 1);
    T.sapling.chance = chance;
    const r = verbsMod.run("chop", S, me, { prop: tree.id });
    T.sapling.chance = chance0;
    me.hands.main = null;
    const fell = mapMod.itemsAt(tree.tile[0], tree.tile[1]).filter((e) => e.id === "sapling").length;
    return { r, fell, tile: tree.tile };
  };
  const always = fellOne(1);
  const never = fellOne(0);
  assert(always.r.ok && always.r.sapling === true && always.fell === 1, `at chance 1: ${JSON.stringify(always.r)}, ${always.fell} on the tile`);
  assert(never.r.ok && never.r.sapling === false && never.fell === 0, `at chance 0: ${JSON.stringify(never.r)}, ${never.fell} on the tile`);
  // Where it may be planted: open grass outdoors, never indoors, on a road, on tilled soil, or against a wall.
  const near = (test, r = 30) => { for (let d = 1; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = Math.round(me.gx) + dx; const y = Math.round(me.gy) + dy; mapMod.growTile(x, y); if (test(x, y)) return [x, y]; } return null; };
  mapMod.ensureAround(me.gx, me.gy, 3);
  const open = near((x, y) => treesMod.standProblem(x, y) === "" && treesMod.standProblem(x + 1, y) === "" && mapMod.isWalkableTile(x + 1, y));
  const indoors = near((x, y) => mapMod.roomAt(x, y) > 0 && !mapMod.tileAt(x, y).prop && !mapMod.tileAt(x, y).rug, 60);
  const road = near((x, y) => ["floor_cobble", "floor_dirt"].includes(mapMod.tileAt(x, y).floor) && !mapMod.tileAt(x, y).prop && mapMod.roomAt(x, y) <= 0, 60);
  const walled = near((x, y) => { const t = mapMod.tileAt(x, y); return t.floor === mapMod.baseFloor() && !t.prop && mapMod.roomAt(x, y) <= 0 && (t.n || t.w); }, 60);
  assert(open && indoors && road && walled, `tiles to try: open ${open}, indoors ${indoors}, road ${road}, against a wall ${walled}`);
  const tilled = [open[0] + 1, open[1]];
  mapMod.setFloor(tilled[0], tilled[1], "floor_farm");
  const why = { indoors: setdownMod.standProblem("natural", ...indoors), road: setdownMod.standProblem("natural", ...road), tilled: setdownMod.standProblem("natural", ...tilled), walled: setdownMod.standProblem("natural", ...walled), open: setdownMod.standProblem("natural", ...open) };
  assert(why.open === "" && why.indoors === "Outdoors only" && why.road === "Open grass only" && why.tilled === "Open grass only" && why.walled === "Not against a wall", `the stand rule: ${JSON.stringify(why)}`);
  mapMod.setFloor(tilled[0], tilled[1], mapMod.baseFloor());
  // Refused by place itself, reach aside: stand beside each.
  const sap = () => { const e = itemsMod.makeEntry("sapling", 1); inventoryMod.stow(me, e); return e; };
  const tryAt = (at) => { me.gx = at[0] + 1; me.gy = at[1]; const e = sap(); const ok = setdownMod.place(me, e.uid, at[0], at[1]); if (!ok) inventoryMod.detach(me, e); return ok; };
  assert(!tryAt(road) && !tryAt(walled) && !mapMod.tileAt(road[0], road[1]).prop, "a sapling was planted on a road or against a wall");
  // The host's own planting.
  const now0 = clock.getElapsed();
  me.gx = open[0] + 1; me.gy = open[1] + 0.3;
  const e1 = sap();
  assert(setdownMod.place(me, e1.uid, open[0], open[1]), "the sapling was not planted on open grass");
  const s1 = mapMod.tileAt(open[0], open[1]).prop;
  assert(s1 && s1.sprite === T.sapling.stages[0] && s1.solid === false && s1.sapling && s1.sapling.at === now0 && !s1.made && inventoryMod.countAll(me, "sapling") === 0, `planted: ${s1 && JSON.stringify(mapMod.serializeProp(s1))}`);
  // A guest's way: the setdown command by the entry's uid and the tile, through the one path (placement.performPlacement).
  const spot2 = near((x, y) => treesMod.standProblem(x, y) === "" && Math.hypot(x - open[0], y - open[1]) > 3);
  me.gx = spot2[0] + 1; me.gy = spot2[1] + 0.3;
  const e2 = sap();
  placementImport.performPlacement(me, { kind: "setdown", uid: e2.uid, tx: spot2[0], ty: spot2[1] });
  const s2 = mapMod.tileAt(spot2[0], spot2[1]).prop;
  assert(s2 && s2.sapling && s2.sprite === T.sapling.stages[0] && inventoryMod.countAll(me, "sapling") === 0, "a guest's setdown command planted nothing");
  // Its menu: Inspect (the client's own) and Pick up; no Take apart.
  const labels = (p) => interactMod.actionsForTarget({ kind: "prop", id: p.id }, me).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}${a.local ? " [local]" : ""}`);
  const sl = labels(s2);
  assert(sl.includes("Inspect [local]") && sl.includes("Pick up sapling") && !sl.some((l) => /Take apart|Gather sticks/.test(l)), `the sapling's menu: ${sl.join(", ")}`);
  assert(/an oak in about 5 days/.test(treesMod.report(s2)), treesMod.report(s2));
  // Growing: the looks once a checkSeconds, the stages, then the oak. Nobody stands on the first; the player stands on the second.
  me.gx = s2.tile[0]; me.gy = s2.tile[1];
  const look = () => { gameMod.begin(0); clock.setElapsed(clock.getElapsed() + T.checkSeconds); };
  const lookUntil = (t) => { while (clock.getElapsed() < t) look(); look(); };
  const parts0 = gameMod.syncParts().map;
  lookUntil(now0 + 0.6 * T.sapling.days * DAY);
  assert(s1.sprite === T.sapling.stages[1] && mapMod.propById(s1.id) === s1, `past half its days the first is ${s1.sprite}`);
  assert(s2.sprite === T.sapling.stages[0] && s2.sapling.waited > 0.5 * T.sapling.days * DAY && gameMod.syncParts().map !== parts0, `stood on, the second is ${s2.sprite}, waited ${s2.sapling.waited}`);
  lookUntil(now0 + T.sapling.days * DAY + 60);
  const oak = mapMod.tileAt(open[0], open[1]).prop;
  assert(oak && oak.id === s1.id && oak.sprite === T.sapling.grows && oak.solid === true && oak.wood === getDef(T.sapling.grows).wood && !oak.sapling && !oak.made && mapMod.propById(s1.id) === oak, `grown: ${oak && JSON.stringify(mapMod.serializeProp(oak))}`);
  assert(mapMod.tileAt(spot2[0], spot2[1]).prop === s2 && s2.sapling, "the one stood on grew all the same");
  // Stepped off, it grows on from where it waited.
  me.gx = open[0] + 2; me.gy = open[1] + 2;
  const left = treesMod.daysLeft(s2);
  lookUntil(clock.getElapsed() + left * DAY + 60);
  const oak2 = mapMod.tileAt(spot2[0], spot2[1]).prop;
  assert(oak2 && oak2.sprite === T.sapling.grows && oak2.id === s2.id, `stepped off, after ${left.toFixed(2)} days it is ${oak2 && oak2.sprite}`);
  // A tree grown is a tree: chopped for its logs, and a stump.
  me.gx = open[0] + 1; me.gy = open[1] + 0.2;
  me.hands.main = itemsMod.makeEntry("hatchet", 1);
  const felled = verbsMod.run("chop", S, me, { prop: oak.id });
  me.hands.main = null;
  assert(felled.ok && felled.logs === oak.wood && mapMod.tileAt(open[0], open[1]).prop.sprite === "stump", `the grown oak chopped: ${JSON.stringify(felled)}`);
  // Sticks: under a standing tree by the label a guest sends, after the bar; once a day; again the next.
  const finish = () => { for (let i = 0; i < 600 && me.action; i++) interactMod.updateAction(me, 0.1); };
  const tree = mapMod.allProps().find((p) => treesMod.isStandingTree(p) && !p.sprite.startsWith("tree_apple") && Math.hypot(p.tile[0] - me.gx, p.tile[1] - me.gy) < 30);
  me.gx = tree.tile[0] + 0.9; me.gy = tree.tile[1] + 0.3; me.moving = false;
  const before = labels(tree);
  const sticksAct = interactMod.actionsForTarget({ kind: "prop", id: tree.id }, me).find((a) => a.label === "Gather sticks");
  assert(before.includes("Gather sticks") && sticksAct.simple === false && sticksAct.duration === T.sticks.seconds, `a tree's menu: ${before.join(", ")}`);
  const eNear = interactMod.nearestSimpleAction(me);
  assert(!eNear || eNear.kind !== "sticks", `E beside a plain tree took ${eNear && eNear.label}`); // menu-only: E opens doors (Primary on #461)
  const m0 = gameMod.syncParts().map;
  assert(interactMod.performByLabel(me, { kind: "prop", id: tree.id }, "Gather sticks") && me.action, "the label started no bar");
  finish();
  const got = inventoryMod.countAll(me, "stick");
  const day = Math.floor(clock.getElapsed() / DAY);
  assert(got >= T.sticks.count[0] && got <= T.sticks.count[1] && tree.sticksAt === (day + 1) * DAY && gameMod.syncParts().map !== m0, `gathered ${got}, sticksAt ${tree.sticksAt} (day ${day})`);
  const again = verbsMod.run("sticks", S, me, { prop: tree.id });
  assert(!again.ok && again.reason === treesMod.NONE_TODAY && labels(tree).includes("Gather sticks (none until tomorrow) [off]"), `the same day: ${JSON.stringify(again)}; ${labels(tree).join(", ")}`);
  clock.setElapsed((day + 1) * DAY + 1);
  assert(labels(tree).includes("Gather sticks") && verbsMod.run("sticks", S, me, { prop: tree.id }).ok, "the next day the tree had no sticks");
  // Never on a stump; never E's, on an apple tree too (where Pick apples stays E's).
  const stump = mapMod.tileAt(open[0], open[1]).prop;
  assert(!labels(stump).some((l) => /sticks/.test(l)), `a stump offers sticks: ${labels(stump).join(", ")}`);
  const apple = mapMod.allProps().find((p) => p.sprite === "tree_apple");
  mapMod.growTile(apple.tile[0], apple.tile[1]);
  const appleActs = interactMod.actionsForTarget({ kind: "prop", id: apple.id }, me);
  const appleSticks = appleActs.find((a) => a.label === "Gather sticks");
  assert(appleSticks && appleSticks.simple === false && appleActs.find((a) => /^Pick/.test(a.label)).simple === true, `the apple tree: ${appleActs.map((a) => `${a.label}${a.simple ? " (E)" : ""}`).join(", ")}`);
  // An apple tree's sapling grows an apple tree (the review of #461, a default): the entry carries it, through the card, the planting, a
  // pick-up, and the growing; any other tree's carries nothing (the round oak).
  const ax = near((x, y) => treesMod.standProblem(x, y) === "" && mapMod.canBuildWall(x, y, "n") && Math.hypot(x - spot2[0], y - spot2[1]) > 3 && Math.hypot(x - open[0], y - open[1]) > 3);
  T.sapling.chance = 1;
  const fromApple = treesMod.fellDrop(ax[0], ax[1], "tree_apple");
  const fromOak = treesMod.fellDrop(ax[0], ax[1], "tree_oak_l");
  T.sapling.chance = chance0;
  assert(fromApple && fromApple.tree === "tree_apple" && fromOak && fromOak.tree === undefined && treesMod.growsFrom("tree_apple_bare") === "tree_apple", `the felled trees' saplings: ${JSON.stringify(fromApple)}, ${JSON.stringify(fromOak)}`);
  mapMod.takeItem(ax[0], ax[1], fromApple);
  mapMod.takeItem(ax[0], ax[1], fromOak);
  const appleSap = itemsMod.makeEntry("sapling", 1, { tree: "tree_apple" });
  const appleCard = itemInfoMod.textOf(itemInfoMod.cardFor(appleSap));
  assert(appleCard.includes("Grows into an apple tree in about 5 game days; it waits while anyone stands on it."), appleCard.join(" | "));
  inventoryMod.stow(me, appleSap);
  me.gx = ax[0] + 1; me.gy = ax[1] + 0.3;
  assert(setdownMod.place(me, appleSap.uid, ax[0], ax[1]), "the apple sapling was not planted");
  const ap1 = mapMod.tileAt(ax[0], ax[1]).prop;
  assert(ap1.sapling.tree === "tree_apple" && /an apple tree in about 5 days/.test(treesMod.report(ap1)), `planted: ${JSON.stringify(ap1.sapling)}; ${treesMod.report(ap1)}`);
  assert(setdownMod.pickUp(me, ap1), "the apple sapling was not picked up");
  const appleBack = inventoryMod.bagOf(me).items.find((e) => e.id === "sapling" && e.tree === "tree_apple");
  assert(appleBack && setdownMod.place(me, appleBack.uid, ax[0], ax[1]), "picked up, the apple sapling lost its tree, or was not planted again");
  const ap = mapMod.tileAt(ax[0], ax[1]).prop;
  // A wall on its edge since it was planted: its Inspect says the stand rule's reason, and it does not grow into its tree; the wall gone, it does.
  mapMod.buildWall(ax[0], ax[1], "n", "wall");
  const blocked = treesMod.report(ap);
  me.gx = ax[0] + 3; me.gy = ax[1] + 3;
  lookUntil(ap.sapling.at + T.sapling.days * DAY + 60);
  assert(/^A sapling that cannot grow into an apple tree here: not against a wall\./.test(blocked) && mapMod.tileAt(ax[0], ax[1]).prop === ap && ap.sapling && /cannot grow/.test(treesMod.report(ap)), `with a wall on its edge: "${blocked}"; ${mapMod.tileAt(ax[0], ax[1]).prop.sprite}`);
  mapMod.destroyWall(ax[0], ax[1], "n");
  look();
  look();
  const appleTree = mapMod.tileAt(ax[0], ax[1]).prop;
  assert(appleTree && appleTree.sprite === "tree_apple" && appleTree.id === ap.id && !appleTree.sapling, `the wall gone: ${appleTree && appleTree.sprite}`);
  // The stamps in the save: a sapling's growing and a tree's sticks day.
  const spot3 = near((x, y) => treesMod.standProblem(x, y) === "");
  me.gx = spot3[0] + 1; me.gy = spot3[1];
  const e3 = sap();
  setdownMod.place(me, e3.uid, spot3[0], spot3[1]);
  const s3 = mapMod.tileAt(spot3[0], spot3[1]).prop;
  s3.sapling.waited = 77;
  mapMod.touch(spot3[0], spot3[1]);
  const saved = JSON.parse(JSON.stringify(gameMod.serialize()));
  gameMod.restore(saved, json);
  const s3b = mapMod.propById(s3.id);
  const treeB = mapMod.propById(tree.id);
  assert(s3b && s3b.sapling && s3b.sapling.at === s3.sapling.at && s3b.sapling.waited === 77 && treeB && treeB.sticksAt === tree.sticksAt, `after the save: ${s3b && JSON.stringify(s3b.sapling)}, sticksAt ${treeB && treeB.sticksAt}`);
  // The cards.
  const card = (id) => itemInfoMod.textOf(itemInfoMod.cardFor(itemsMod.makeEntry(id, 1))).join(" | ");
  assert(card("sapling") === "Sapling | Seedling | Place: plant on open grass outdoors. | Grows into an oak in about 5 game days; it waits while anyone stands on it. | Sometimes dropped by a felled tree (about 1 in 3). | Right-click for actions.", card("sapling"));
  assert(card("stick").includes("Gathered under any standing tree, 1 to 2 a day from each tree."), card("stick"));
  return `${n1} saplings in 1000 fellings at ${chance0}; planted by the host and a guest's command; refused indoors, on a road, tilled soil, and against a wall; an oak after ${T.sapling.days} days, the one stood on after ${left.toFixed(2)} more; an apple tree's sapling an apple tree, kept through a pick-up, held back by a wall with its reason said; sticks ${got} once a day; the stamps saved; the cards`;
});

// A repair place's one greyed line (docs/43 section 6; docs/bugs.md, fixed): with nothing worn carried it says what the place does; with
// everything worn already at or above the place's ceiling for it, "nothing it can better". The menu is built as a guest's replica builds it.
check("repairs: a grindstone or an anvil with nothing to better says so, not that nothing worn is carried", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  mapMod.ensureAround(101, 188, 3); // the smithy
  const stone = mapMod.allProps().find((q) => q.sprite === "grindstone");
  const anvil = mapMod.allProps().find((q) => q.sprite === "anvil");
  assert(stone && anvil, "no grindstone or anvil at the smithy");
  const acts = (prop) => interactMod.actionsForTarget({ kind: "prop", id: prop.id }, me);
  const labels = (prop) => acts(prop).filter((a) => a.kind === "sharpen" || a.kind === "repair").map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}`); // the anvil is a station too
  const standBy = (prop) => { const t = interactMod.approachTile(acts(prop)[0], me); if (t) { me.gx = t[0]; me.gy = t[1]; } };
  inventoryMod.bagOf(me).items.length = 0;
  (inventoryMod.beltOf(me) || []).fill(null);
  me.hands.main = null;
  me.hands.off = null;
  standBy(stone);
  assert(JSON.stringify(labels(stone)) === JSON.stringify(["Sharpen (no dull blade carried) [off]"]), `nothing carried: ${labels(stone).join(" | ")}`);
  // A sword at 70% with one repair behind it: the stone's next rung is 40%, the anvil's 80%.
  me.hands.main = itemsMod.makeEntry("sword", 1, { wear: 0.3, repairs: 1 });
  assert(JSON.stringify(labels(stone)) === JSON.stringify(["Sharpen (nothing it can better) [off]"]), `a sword above the stone's rung: ${labels(stone).join(" | ")}`);
  me.hands.main.wear = 0.1; // 90%, above the anvil's 80%
  standBy(anvil);
  assert(JSON.stringify(labels(anvil)) === JSON.stringify(["Repair (nothing it can better) [off]"]), `a sword above the anvil's rung: ${labels(anvil).join(" | ")}`);
  me.hands.main = null;
  assert(JSON.stringify(labels(anvil)) === JSON.stringify(["Repair (nothing worn carried) [off]"]), `nothing carried at the anvil: ${labels(anvil).join(" | ")}`);
  return "nothing carried, and a sword above each place's rung, each its one greyed line";
});

// The sawpit's words (docs/43 section 6; docs/bugs.md, fixed): one plank that does not fit "falls" at your feet, more "fall".
check("sawpit: what does not fit falls at your feet, in the right number", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  const W = worldMod.world;
  mapMod.ensureAround(74, 192, 3); // the joiner's yard
  const pit = mapMod.allProps().find((q) => q.sprite === "sawpit");
  assert(pit, "no sawpit in the joiner's yard");
  const act = interactMod.actionsForTarget({ kind: "prop", id: pit.id }, me)[0];
  const t = interactMod.approachTile(act, me);
  if (t) { me.gx = t[0]; me.gy = t[1]; }
  const sack = itemsMod.makeEntry("small_sack", 1);
  me.worn.back = sack;
  me.hands.main = null;
  me.hands.off = null;
  (inventoryMod.beltOf(me) || []).fill(null);
  // A bag two planks wide: the log sawn from it leaves room for two, and one falls.
  sack.bag = inventoryMod.createBag(2, 3);
  assert(inventoryMod.stow(me, itemsMod.makeEntry("log", 1)) === "bag", "the log did not go in the bag");
  const one = verbsMod.run("saw", W, me, { prop: pit.id });
  assert(one.ok && /; 1 falls at your feet\.$/.test(one.message), `one over: ${one.message || one.reason}`);
  // A bag one plank wide, the log in a hand: two fall.
  sack.bag = inventoryMod.createBag(1, 3);
  me.hands.main = itemsMod.makeEntry("log", 1);
  const two = verbsMod.run("saw", W, me, { prop: pit.id });
  assert(two.ok && /; 2 fall at your feet\.$/.test(two.message), `two over: ${two.message || two.reason}`);
  return `${one.message} / ${two.message}`;
});

// Talk while an immune villager cowers or runs (docs/43 section 7; docs/bugs.md, fixed): not answered, as a poke is not, and the flight goes on;
// once it stands wary, Talk is answered. Run as the host runs a guest's Talk, on the authority.
const villagerMod = await import("../src/entities/villager.js");
check("villagers: Talk is not answered while an immune villager cowers or runs", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  const v = villagerMod.createVillager(me.gx + 1, me.gy, { id: "vt_talk", name: "Timid", immune: true, talk: "neighbour" });
  gameMod.state.villagers.push(v);
  let started = 0;
  const hear = () => { started++; };
  eventsMod.on("talkStarted", hear);
  try {
    for (const state of ["cower", "flee"]) {
      v.state = state;
      const ok = villagerMod.startTalk(v, me);
      assert(ok === false && v.state === state && v.talkingWith.length === 0 && started === 0, `Talk while it ${state}s: began ${ok}, now ${v.state}, talking with ${v.talkingWith.join(",")}`);
    }
    v.state = "wary";
    assert(villagerMod.startTalk(v, me) === true && v.state === "talk" && started === 1, `Talk once it stands wary: ${v.state}, ${started} started`);
  } finally {
    eventsMod.off("talkStarted", hear);
    gameMod.state.villagers.splice(gameMod.state.villagers.indexOf(v), 1);
  }
  return "refused cowering and running, answered wary";
});

// Every villager is immune to the dead (Michael, 2026-10-28, docs/02), by data: the map's flag, true unless an entry says `immune: false`,
// and no world rule over it. A save from before holds `immune: false` on some villagers and a `zombiesAttackVillagers` rule: restored, the
// villagers the map placed are immune again (the map's word, not the save's) and the rule is dropped. The mortal path is kept: a map entry
// with `immune: false` makes a mortal villager (check("immune") has the dead hunt one).
check("villagers: every one immune by the map's data; an older save's mortal villagers and rule do not come back", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  assert(S.villagers.length > 0 && S.villagers.every((v) => v.immune), `not every villager immune: ${S.villagers.filter((v) => !v.immune).map((v) => v.name).join(", ")}`);
  assert(!("zombiesAttackVillagers" in rulesMod.rules), "the world still has a villagers rule");
  const save = JSON.parse(JSON.stringify(gameMod.serialize()));
  for (const v of save.characters.villagers) v.immune = false; // as a save from before the ruling held the at-risk ones
  save.rules = { ...save.rules, zombiesAttackVillagers: true };
  gameMod.restore(save, json);
  assert(gameMod.state.villagers.every((v) => v.immune), `restored mortal: ${gameMod.state.villagers.filter((v) => !v.immune).map((v) => v.name).join(", ")}`);
  assert(!("zombiesAttackVillagers" in rulesMod.rules), "an older save's villagers rule came back");
  const mortalJson = JSON.parse(JSON.stringify(json));
  mortalJson.villagers[1].immune = false; // the kept path: a later ruling flips this data, not code
  gameMod.create({ json: mortalJson, rules: { zombieAggro: false } });
  const flipped = gameMod.state.villagers.filter((v) => !v.immune).map((v) => v.name);
  assert(flipped.length === 1 && flipped[0] === mortalJson.villagers[1].name, `the map's immune false did not make one mortal: ${flipped.join(", ")}`);
  const kept = JSON.parse(JSON.stringify(gameMod.serialize()));
  gameMod.restore(kept, mortalJson);
  assert(gameMod.state.villagers.filter((v) => !v.immune).length === 1, "a mortal villager's flag did not survive its own map's restore");
  return `${S.villagers.length} immune; an older save's ${save.characters.villagers.length} immune again; a map's immune false makes ${flipped[0]} mortal`;
});

// Burn corpse's done line (docs/43 section 7; docs/bugs.md, fixed): the hours read from `work.burnCorpse.hours`, as the card reads them.
check("burn corpse: the done line says the hours the data gives", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  const W = worldMod.world;
  const WB = tuningMod.work.burnCorpse;
  const h0 = WB.hours;
  const said = [];
  try {
    for (const h of [h0, 2]) {
      const z = gameMod.state.zombies.find((q) => !q.dead && !q.corpse);
      assert(z, "none of the dead to lay down");
      Object.assign(z, { dead: true, corpse: true, gx: me.gx + 1, gy: me.gy, cremate: false, burning: false });
      me.hands.main = itemsMod.makeEntry(WB.flame, 1); // a tinderbox alone: nothing is spent (Michael, 2026-10-26)
      me.hands.off = null;
      WB.hours = h;
      const r = verbsMod.run("burncorpse", W, me, { ch: z });
      const want = `The body catches. It will burn for about ${h === 1 ? "an hour" : `${h} hours`}, and nothing in it will be left.`;
      assert(r.ok && r.message === want, `with ${h} hours: ${r.message || r.reason}`);
      said.push(r.message);
    }
  } finally {
    WB.hours = h0;
  }
  return said.join(" / ");
});

const placementMod = await import("../src/placement.js");
const propNamesMod = await import("../src/prop-names.js"); // a prop's name in words, the one helper
const woodsMod = await import("../src/woods.js");
// The hover card's plurals and lower-cased names (docs/bugs.md: not reproduced, guarded): "Splits into 3 planks" and the sawpit's line add an "s"
// to the item split into, and "Goes into" and "Builds" lower-case a recipe's or a build kind's name. No name that reaches those lines today has a
// plural that is not "+s" or a capital past its first letter; this fails the day one does, and the fix then is a `plural` (and a kept case) in the data.
check("hover card: every name that reaches a plural or a lower-cased line reads rightly (+s, no capital past the first letter)", () => {
  const itemsJson = read("data/items.json");
  const recipes = read("data/recipes.json").rows;
  const byId = new Map(itemsJson.map((d) => [d.id, d]));
  const bad = [];
  const irregular = /(s|x|z|ch|sh|[^aeiou]y|[^f]f|fe|man|foot|tooth|mouse|sheep|deer|fish|child)$/i;
  for (const d of itemsJson) {
    if (!d.splitsInto) continue;
    const into = byId.get(d.splitsInto.id);
    const name = into.name;
    if (irregular.test(name) && !into.plural && !into.noun) bad.push(`${d.id} splits into "${name}", whose plural is not +s (give it a \`plural\` or a \`noun\`)`);
    if (/[A-Z]/.test(name.slice(1))) bad.push(`${d.id} splits into "${name}", which keeps a capital`);
  }
  for (const r of recipes) {
    const o = r.out || {};
    const name = o.id ? byId.get(o.id).name : r.label || (o.prop ? propNamesMod.propName(o.prop) : r.id);
    if (/[A-Z]/.test(name.slice(1))) bad.push(`recipe ${r.id}'s "${name}" is lower-cased on a card's Goes into line`);
  }
  for (const k of placementMod.buildKinds()) {
    if (!k.cost || k.region || (woodsMod.isWoodWall(k.sprite) && k.kind === "wall")) continue; // as the card: a wood's walls are one "wood wall", a region's wood never shown
    const name = k.label || k.id;
    if (/[A-Z]/.test(name.slice(1))) bad.push(`build kind ${k.id}'s "${name}" is lower-cased on a card's Builds line`);
  }
  assert(!bad.length, bad.join("; "));
  const lines = itemsJson.flatMap((d) => itemInfoMod.textOf(itemInfoMod.cardFor(itemsMod.makeEntry(d.id, 1))).filter((l) => /^(Splits into|A sawpit|Goes into|Builds)/.test(l)));
  return `every name regular; ${lines.length} such lines on the cards today`;
});

// One of the dead saved at a door (`breach`, which the record drops) comes back in the chase, and the world steps on: a world saved with
// one of them mid-breach threw on its first step after the load (found by check("all")'s sweep, 2026-10-25).
check("save: one of the dead saved mid-breach takes up the chase on its first step, and the world steps on", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: true } });
  const S = gameMod.state;
  const me = S.player;
  const z = S.zombies[0];
  Object.assign(z, { gx: me.gx + 3, gy: me.gy, state: "breach", aggro: true, breach: { tx: Math.round(me.gx), ty: Math.round(me.gy), edge: "n", stand: [me.gx, me.gy], into: [me.gx, me.gy] } });
  gameMod.restore(JSON.parse(JSON.stringify(gameMod.serialize())), json);
  const back = S.zombies.find((q) => q.id === z.id);
  // The record keeps the state and drops the opening (CH_DROPPED): restored as it was saved, as a guest's replica takes it too.
  assert(back && back.state === "breach" && back.breach === null, `restored as ${back && back.state}, breach ${back && JSON.stringify(back.breach)}`);
  gameMod.step(1 / 60, null); // zombie.js: a breach with no opening goes back to the chase, as breachHit and press do
  assert(back.state === "chase", `after its first step it is in ${back.state}`);
  for (let i = 0; i < 120; i++) gameMod.step(1 / 60, null);
  return `restored in breach with no opening, in the chase after its first step; stepped 120 more, now ${back.state}`;
});

// Throwing knives and axes (docs/24 section 1, #489): a throw from a stack takes one as an entry with a uid of its own and the hand empties
// with the last; the axe's knockdown rides the shot to its landing and floors some of the dead, the knife's never; and after the throws the
// item census holds no uid twice. The pane's check("throwing") draws, spins, lodges, breaks, and sweeps them up.
const zombieMod = await import("../src/entities/zombie.js");
const rngMod = await import("../src/rng.js");
check("throwing: one from the stack with its own uid, the axe's knockdown rolled where it lands, and no uid held twice", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  S.zombies.length = 0;
  S.villagers.length = 0;
  rngMod.seed(4242);
  // Open ground: three tiles east of the player with nothing on them and no wall across them (the spawn has a wall just east).
  const open = (x0, y0) => { for (let dx = -1; dx <= 3; dx++) for (let dy = -1; dy <= 1; dy++) { const x = x0 + dx, y = y0 + dy; if (!mapMod.isWalkableTile(x, y) || mapMod.tileAt(x, y).prop || mapMod.wallBetween(x, y, x + 1, y) || mapMod.wallBetween(x, y, x, y + 1)) return false; } return true; };
  const ox = Math.round(me.gx), oy = Math.round(me.gy);
  let spot = null;
  for (let r = 0; r <= 30 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) if ((Math.abs(dx) === r || Math.abs(dy) === r) && open(ox + dx, oy + dy)) spot = [ox + dx, oy + dy];
  assert(spot, "no open ground near the spawn");
  me.gx = spot[0];
  me.gy = spot[1];
  const throwAt = (x, y) => { me.recover = 0; me.draw = { t: 1, c: 1, source: "script" }; me.aimOverride = [x, y]; const f = archeryMod.releaseDraw(me, {}); me.aimOverride = null; for (let i = 0; i < 120 && archeryMod.arrowsInFlight().length; i++) gameMod.step(1 / 60, null); return f; };
  const stack = itemsMod.makeEntry("throwing_knife", 2);
  me.hands.main = stack;
  me.hands.off = null;
  const f = throwAt(me.gx + 1.5, me.gy);
  assert(f && f.item && f.item.uid !== stack.uid && f.item.count === 1 && stack.count === 1 && me.hands.main === stack, `the first throw: ${f && f.item ? `${f.item.uid} ×${f.item.count}` : "nothing"} from ${stack.uid}, ${stack.count} left`);
  throwAt(me.gx + 1.5, me.gy);
  assert(me.hands.main === null, "the hand still holds the stack after its last knife");
  const tally = (id) => {
    let hit = 0;
    let down = 0;
    for (let i = 0; i < 30; i++) {
      const z = zombieMod.createZombie(me.gx + 1.5, me.gy, { hp: 1000 });
      S.zombies.push(z);
      me.hands.main = itemsMod.makeEntry(id, 1);
      throwAt(z.gx, z.gy);
      if (z.hp < 1000) hit++;
      if (z.state === "down") down++;
      S.zombies.splice(S.zombies.indexOf(z), 1);
    }
    return { hit, down };
  };
  const ax = tally("throwing_axe");
  const kn = tally("throwing_knife");
  assert(ax.hit === 30 && ax.down > 0 && ax.down < ax.hit, `the axe: ${ax.hit} hits, ${ax.down} down`);
  assert(kn.hit === 30 && kn.down === 0, `the knife: ${kn.hit} hits, ${kn.down} down`);
  const c = gameMod.itemCensus();
  assert(c.dups.length === 0, `after the throws: ${c.summary}`);
  return `one from a stack of 2 with its own uid, the hand empty after the last; the axe floored ${ax.down} of ${ax.hit}, the knife ${kn.down} of ${kn.hit}; no uid twice`;
});

// Sight-pull (docs/48, #492): one of the dead struck by a player calls, on its next step, the dead within the radius that see it, and they
// join the hunt with its memory; one beyond stays; a killing blow calls no one; a joined one never calls; the marks are saved. The headless
// hash runs with Zombie aggro off, so it never sees the pull: this row and the pane's check("pull") are its proof.
check("sight-pull: a blow it lives through calls the dead near it that see it, once, and a killing blow calls no one", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: true } });
  const S = gameMod.state;
  const me = S.player;
  S.zombies.length = 0;
  S.villagers.length = 0;
  rngMod.seed(4242);
  // Open ground 12 by 5 tiles near the spawn, and the player well away from it (beyond the dead's sight).
  const open = (x0, y0) => { for (let dx = -1; dx <= 11; dx++) for (let dy = -2; dy <= 2; dy++) { const x = x0 + dx, y = y0 + dy; if (!mapMod.isWalkableTile(x, y) || mapMod.tileAt(x, y).prop || mapMod.wallBetween(x, y, x + 1, y) || mapMod.wallBetween(x, y, x, y + 1)) return false; } return true; };
  const ox = Math.round(me.gx), oy = Math.round(me.gy);
  let spot = null;
  for (let r = 0; r <= 40 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) if ((Math.abs(dx) === r || Math.abs(dy) === r) && open(ox + dx, oy + dy)) spot = [ox + dx, oy + dy];
  assert(spot, "no open ground near the spawn");
  const [sx, sy] = spot;
  me.gx = sx + 30;
  me.gy = sy;
  const add = (x, y) => { const z = zombieMod.createZombie(x, y); z.sightTimer = 1e9; z.idleTimer = 1e9; S.zombies.push(z); return z; };
  const step = (n) => { for (let i = 0; i < n; i++) gameMod.step(1 / 60, null); };
  const caller = add(sx + 3, sy);
  const near = [add(sx + 4, sy), add(sx + 3, sy + 1)];
  const far = add(sx + 11, sy);
  assert(!caller.huntsPlayer && !caller.pullDue, "a new dead one starts hunting a player");
  zombieMod.damageZombie(caller, 1, { from: [me.gx, me.gy] });
  assert(caller.huntsPlayer && caller.pullDue && !near.some((z) => z.huntsPlayer), "the blow did not set the marks, or the call came before the struck one's step");
  step(1);
  assert(!caller.pullDue && near.every((z) => z.huntsPlayer && z.aggro && z.lastSeen && z.lastSeen[0] === caller.lastSeen[0]) && !far.huntsPlayer, `after its step: near ${near.map((z) => z.huntsPlayer)}, far ${far.huntsPlayer}`);
  // The marks ride the save (docs/48: kept with the dead one's record, as aggro and lastSeen are).
  const back = JSON.parse(JSON.stringify(gameMod.serialize())).characters.zombies.find((z) => z.id === near[0].id);
  assert(back && back.huntsPlayer === true, `the save's record of a drawn-in one: huntsPlayer ${back && back.huntsPlayer}`);
  // A killing blow calls no one.
  const victim = add(sx + 8, sy + 2);
  const by = add(sx + 9, sy + 2);
  zombieMod.damageZombie(victim, 100000, { from: [me.gx, me.gy] });
  step(2);
  assert(victim.dead && !by.huntsPlayer, `a killing blow: dead ${victim.dead}, its neighbour hunts ${by.huntsPlayer}`);
  return `the struck one called ${near.length} near it on its next step, the one 8 tiles off stayed; the marks are saved; a killing blow called no one`;
});

// An item's name counted in a sentence (src/items.js countName; docs/bugs.md, the butcher's "3 raw venisons"): a definition's `noun` "mass"
// reads "some lard" and "3 raw venison", "pair" reads "shears", and anything else "a"/"an" and +s. Every yield and product an animal gives is
// read in the skin, butcher, milk, and shear lines this way.
check("item names counted: mass nouns, pairs, and +s (the butcher's and the shears' words)", () => {
  const cn = itemsMod.countName;
  const want = [["venison_raw", 3, "3 raw venison"], ["bacon", 2, "2 bacon"], ["lard", 1, "some lard"], ["wool", 2, "2 wool"], ["feather", 4, "4 feathers"], ["hide", 1, "a hide"], ["egg", 1, "an egg"], ["milk", 1, "a jug of milk"], ["milk", 2, "2 jugs of milk"], ["bread", 2, "2 loaves of bread"], ["honey", 3, "3 jars of honey"], ["charcoal", 1, "some charcoal"], ["charcoal", 6, "6 charcoal"], ["shears", 1, "shears"], ["shears", 2, "2 shears"], ["gloves", 1, "work gloves"], ["hammer", 1, "a smith's hammer"]];
  const bad = want.filter(([id, n, s]) => cn(id, n) !== s).map(([id, n, s]) => `${id} x${n}: "${cn(id, n)}", not "${s}"`);
  const animals = read("data/animals.json").species;
  for (const [sp, d] of Object.entries(animals)) {
    const ids = [...Object.values(d.yields || {}).flat().map((y) => y.id), ...(d.produce ? [d.produce.item] : [])];
    for (const id of ids) if (/(ss|[^aeiou]y|[^s]s)$/.test(itemsMod.nounName(id)) && !itemsMod.getItem(id).noun && !itemsMod.getItem(id).plural) bad.push(`${sp}'s ${id} has a name that will not take +s`);
  }
  // A name of more than one word joined by "of" or "and" ("Jug of milk", "Eggs and bacon") never takes +s at its end ("2 jug of milks"):
  // every such item, wherever it is counted, names its plural or its noun.
  for (const d of read("data/items.json")) if (/ (of|and) /i.test(d.name) && !d.noun && !d.plural) bad.push(`${d.id} ("${d.name}") wants a \`plural\` or a \`noun\``);
  assert(!bad.length, bad.join("; "));
  return want.map(([id, n]) => cn(id, n)).join(", ");
});

// Milking asks for an empty bucket (docs/45 section 3; docs/bugs.md): a bucket of water in a hand must not hide an empty one in the bag, as
// carriedTool's first bucket, the hand's, once did. The verb runs on the host for a guest's label alike.
const animalMod = await import("../src/entities/animal.js");
const gridMod = await import("../src/grid.js");
check("milking: a bucket of water in hand and an empty one in the bag milks; the water stays; one of water alone is refused", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  const cow = animalMod.createAnimal("cow", me.gx, me.gy, { home: [me.gx, me.gy] });
  S.animals.push(cow);
  cow.fedDay = animalMod.today();
  cow.takenDay = -1;
  const bag = inventoryMod.bagOf(me);
  bag.items = [];
  const main0 = me.hands.main;
  const off0 = me.hands.off;
  try {
    me.hands.main = null;
    me.hands.off = null;
    const none = animalMod.produceProblem(me, cow);
    const wet = itemsMod.makeEntry("bucket", 1, { fill: 50 });
    me.hands.main = wet;
    const wetOnly = animalMod.produceProblem(me, cow);
    const dry = itemsMod.makeEntry("bucket", 1);
    gridMod.insert(bag, dry);
    const both = animalMod.produceProblem(me, cow);
    const r = verbsMod.run("milk", worldMod.world, me, { character: cow.id });
    assert(none === "You need a bucket.", `no bucket: "${none}"`);
    assert(wetOnly === "Empty the bucket first.", `a bucket of water alone: "${wetOnly}"`);
    assert(both === "", `a bucket of water in hand and an empty one in the bag: "${both}"`);
    assert(r.ok && inventoryMod.countItem(bag, "milk") >= 1 && wet.fill === 50, `milked: ${JSON.stringify(r)}, milk ${inventoryMod.countItem(bag, "milk")}, the hand's water ${wet.fill}`);
    return `${none} / ${wetOnly} / milked: ${r.message}`;
  } finally {
    me.hands.main = main0;
    me.hands.off = off0;
    S.animals.splice(S.animals.indexOf(cow), 1);
  }
});

// A made prop lands on tiles that are all free (docs/bugs.md: check("craft") run twice): a counter, three tiles, made at the joiner's
// workbench once stood over the bench's own tiles and took the bench off the map, its record kept.
check("crafting: a made counter lands on free tiles, never over the workbench that made it", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  const benches = mapMod.allProps().filter((q) => q.sprite === "workbench" && mapMod.peekTile(q.tile[0], q.tile[1]).prop === q);
  assert(benches.length, "no workbench in the loaded chunks");
  const said = [];
  for (const bench of benches) {
    // The tile below the bench taken (a chest the check sets there, as the pane check's own chests are), so the nearest anchor is one a
    // tile up and to the left, from which a three-tile counter reaches over the bench.
    const [bx0, by0] = [bench.tile[0], bench.tile[1] + 1];
    let blocker = null;
    if (mapMod.isWalkableTile(bx0, by0) && !mapMod.tileAt(bx0, by0).prop) {
      blocker = mapMod.createProp({ sprite: "chest", tile: [bx0, by0] });
      mapMod.placeProp(blocker, bx0, by0);
      // A bench whose one way out is that tile (a market stall's) is shut in by it: the chest comes away again.
      if (stationsMod.roomProblem(bench, stationsMod.recipe("counter"))) { mapMod.removeProp(blocker); blocker = null; }
    }
    const stand = mapMod.nearestWalkable(bench.tile[0], bench.tile[1] + 1, (x, y) => !!mapMod.tileAt(x, y).prop || !bench.tiles.some(([bx, by]) => lineOfSight(x, y, bx, by)));
    me.gx = stand[0];
    me.gy = stand[1];
    const bag = inventoryMod.bagOf(me);
    bag.items = [];
    inventoryMod.addItem(bag, "plank", 8);
    me.hands.main = itemsMod.makeEntry("hammer", 1); // the tool rule (#215): carried
    const before = new Set(mapMod.allProps().map((q) => q.id));
    const r = verbsMod.run("craft", worldMod.world, me, { prop: bench.id }, { recipe: "counter", count: 1 });
    if (!r.ok && r.reason === "There is no room beside it for a counter.") {
      // A bench in a room too full for a counter (the market's p890: the old search put it outside the wall) is refused, not crowded.
      if (blocker) mapMod.removeProp(blocker);
      said.push(`${bench.id}: no room in its own room, refused`);
      continue;
    }
    assert(r.ok, `the craft at ${bench.id}: ${r.reason}`);
    for (let i = 0; i < 60 * 12 && bench.queue && bench.queue.length; i++) stationsMod.update(1 / 60);
    const counter = mapMod.allProps().find((q) => !before.has(q.id) && q.sprite === "counter");
    assert(counter, `no counter landed at ${bench.id}`);
    const held = bench.tiles.every(([x, y]) => mapMod.peekTile(x, y).prop === bench);
    const own = counter.tiles.every(([x, y]) => mapMod.peekTile(x, y).prop === counter);
    if (blocker) mapMod.removeProp(blocker);
    assert(held && own, `${bench.id}: the bench on its tiles ${held}, the counter on all of its ${own} (${counter.tiles.join(" ")})`);
    const onMe = counter.tiles.some(([x, y]) => Math.hypot(me.gx - x, me.gy - y) < 0.7);
    const room0 = mapMod.tileAt(stand[0], stand[1]).room;
    const sameRoom = counter.tiles.every(([x, y]) => mapMod.tileAt(x, y).room === room0);
    assert(!onMe && sameRoom, `${bench.id}: the counter ${onMe ? "stands on the crafter" : ""}${sameRoom ? "" : " is in another room than the crafter's"} (${counter.tiles.join(" ")}, the crafter at ${stand})`);
    said.push(`${bench.id} at ${bench.tiles.join(" ")}, its counter at ${counter.tiles.join(" ")}`);
    mapMod.removeProp(counter);
  }
  return said.join("; ");
});

// A made prop with no room beside its station is never lost (the review of #466): the craft is refused before anything is spent, with a
// line saying why; a job whose room filled after it began waits at the head of the queue and lands once there is room.
check("crafting: no room beside the station refuses the make before it spends anything, and a job that lost its room waits for it", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  const bench = mapMod.allProps().find((q) => q.sprite === "workbench" && mapMod.peekTile(q.tile[0], q.tile[1]).prop === q);
  assert(bench, "no workbench in the loaded chunks");
  const stand = mapMod.nearestWalkable(bench.tile[0], bench.tile[1] + 1, (x, y) => !!mapMod.tileAt(x, y).prop || !bench.tiles.some(([bx, by]) => lineOfSight(x, y, bx, by)));
  me.gx = stand[0];
  me.gy = stand[1];
  const bag = inventoryMod.bagOf(me);
  bag.items = [];
  inventoryMod.addItem(bag, "plank", 8);
  me.hands.main = itemsMod.makeEntry("hammer", 1);
  // Every tile a body could walk to from beside the bench, within the search's reach and a margin: a chest on each.
  const reached = [];
  const seen = new Set(bench.tiles.map(([x, y]) => `${x},${y}`));
  let ring = bench.tiles.slice();
  for (let step = 0; step < 16 && ring.length; step++) {
    const next = [];
    for (const [x, y] of ring) for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (seen.has(k) || !mapMod.canStep(x, y, x + dx, y + dy)) continue;
      seen.add(k);
      next.push([x + dx, y + dy]);
    }
    reached.push(...next);
    ring = next;
  }
  const fill = (tiles) => tiles.filter(([x, y]) => !mapMod.tileAt(x, y).prop).map(([x, y]) => { const c = mapMod.createProp({ sprite: "chest", tile: [x, y] }); mapMod.placeProp(c, x, y); return c; });
  let chests = fill(reached);
  const planks0 = inventoryMod.countItem(bag, "plank");
  const refused = verbsMod.run("craft", worldMod.world, me, { prop: bench.id }, { recipe: "counter", count: 1 });
  const kept = inventoryMod.countItem(bag, "plank") === planks0;
  for (const c of chests) mapMod.removeProp(c);
  assert(!refused.ok && refused.reason === "There is no room beside it for a counter." && kept, `with no room: ${JSON.stringify(refused)}, planks kept ${kept}`);
  // Begun with room, the room filled before it is done: no counter and no word yet, the job kept; the room freed, it lands.
  let done = null;
  const hear = (e) => { done = e; };
  eventsMod.on("craftDone", hear);
  try {
    const r = verbsMod.run("craft", worldMod.world, me, { prop: bench.id }, { recipe: "counter", count: 1 });
    assert(r.ok, `with room: ${r.reason}`);
    chests = fill(reached);
    for (let i = 0; i < 60 * 12; i++) stationsMod.update(1 / 60);
    const waiting = !done && bench.queue && bench.queue.length === 1 && !mapMod.allProps().some((q) => q.sprite === "counter" && q.made);
    for (const c of chests) mapMod.removeProp(c);
    for (let i = 0; i < 90 && bench.queue && bench.queue.length; i++) stationsMod.update(1 / 60);
    const landed = mapMod.allProps().find((q) => q.sprite === "counter" && q.made);
    assert(waiting && landed && done && stationsMod.doneLine(done.out) === "Made a counter.", `waiting ${waiting}; landed ${landed ? landed.tiles.join(" ") : "no"}; the line ${done ? stationsMod.doneLine(done.out) : "none"}`);
    if (landed) mapMod.removeProp(landed);
  } finally {
    eventsMod.off && eventsMod.off("craftDone", hear);
  }
  const arrows = stationsMod.doneLine({ id: "arrow", count: 5 });
  assert(arrows === "Made 5 arrows.", `the arrows' line: "${arrows}"`);
  return `refused: "${refused.reason}"; ${reached.length} tiles filled; the job waited and landed; "${arrows}"`;
});

// A made prop's name (docs/bugs.md, 2026-10-25: "Made a pumpkin.", "Made a dyevat.", "Made a millstones.", a busy vat's "Pick up dyevat"):
// every line that names a prop reads src/prop-names.js, the recipe's label first, then the definition's `name`, counted by its `noun` and
// `article`. The done line and the no-room refusal for four made props, and a busy station's Pick up and its Use, by their own words.
check("prop names: a made prop's done line and refusal, and a busy station's Pick up, name it in words (the jack-o'-lantern, the dye vat, the millstones)", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false, villageStations: true } });
  const S = gameMod.state;
  const me = S.player;
  const bench = mapMod.allProps().find((q) => q.sprite === "workbench" && mapMod.peekTile(q.tile[0], q.tile[1]).prop === q);
  assert(bench, "no workbench in the loaded chunks");
  const stand = mapMod.nearestWalkable(bench.tile[0], bench.tile[1] + 1, (x, y) => !!mapMod.tileAt(x, y).prop || !bench.tiles.some(([bx, by]) => lineOfSight(x, y, bx, by)));
  me.gx = stand[0];
  me.gy = stand[1];
  const want = {
    jack_o_lantern: "a jack-o'-lantern",
    dyevat: "a dye vat",
    millstones: "a pair of millstones",
    counter: "a counter",
  };
  const bad = [];
  for (const [id, words] of Object.entries(want)) {
    const r = stationsMod.recipe(id);
    if (!r) { bad.push(`no recipe ${id}`); continue; }
    const line = stationsMod.doneLine(r.out);
    if (line !== `Made ${words}.`) bad.push(`${id}'s done line "${line}"`);
  }
  // No room beside the bench (every tile a body could walk to from it, a chest on each): each recipe's refusal names its prop the same way.
  const reached = [];
  const seen = new Set(bench.tiles.map(([x, y]) => `${x},${y}`));
  let ring = bench.tiles.slice();
  for (let step = 0; step < 18 && ring.length; step++) {
    const next = [];
    for (const [x, y] of ring) for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (seen.has(k) || !mapMod.canStep(x, y, x + dx, y + dy)) continue;
      seen.add(k);
      next.push([x + dx, y + dy]);
    }
    reached.push(...next);
    ring = next;
  }
  const chests = reached.filter(([x, y]) => !mapMod.tileAt(x, y).prop).map(([x, y]) => { const c = mapMod.createProp({ sprite: "chest", tile: [x, y] }); mapMod.placeProp(c, x, y); return c; });
  const refusals = [];
  try {
    for (const [id, words] of Object.entries(want)) {
      const why = stationsMod.roomProblem(bench, stationsMod.recipe(id));
      refusals.push(why);
      if (why !== `There is no room beside it for ${words}.`) bad.push(`${id}'s refusal "${why}"`);
    }
  } finally {
    for (const c of chests) mapMod.removeProp(c);
  }
  // A busy station's Pick up (the village's stations movable by the world's rule): a dye vat, and the millstones, which are a plural.
  assert(rulesMod.rules.villageStations, "the world was not made with the village's stations movable");
  me.hands.main = null; // Pick up needs both hands empty
  me.hands.off = null;
  const made = [];
  const at = (sprite) => {
    const t = mapMod.nearestWalkable(Math.round(me.gx) + 2, Math.round(me.gy), (x, y) => !!mapMod.tileAt(x, y).prop || mapMod.besideDoor(x, y));
    const p = mapMod.createProp({ sprite, tile: t });
    mapMod.placeProp(p, t[0], t[1]);
    made.push(p);
    return p;
  };
  const labels = {};
  try {
    const vat = at("dyevat");
    const stones = at("millstones");
    const wheel = at("spinningwheel");
    const read = (p) => interactMod.actionsForTarget({ kind: "prop", id: p.id }, me).map((a) => a.label);
    labels.idle = read(vat);
    vat.queue = [{ recipe: "none" }];
    stones.queue = [{ recipe: "flour" }];
    labels.vat = read(vat);
    labels.stones = read(stones);
    labels.wheel = read(wheel);
    labels.heldVat = placementMod.holdsProblem(vat); // Take apart's refusal, which agrees with the plural as Pick up does
    labels.heldStones = placementMod.holdsProblem(stones);
    vat.queue = [];
    stones.queue = [];
  } finally {
    for (const p of made) mapMod.removeProp(p);
  }
  const has = (list, label) => { if (!(list || []).includes(label)) bad.push(`no "${label}" in ${JSON.stringify(list)}`); };
  has(labels.idle, "Pick up dye vat");
  has(labels.idle, "Use the dye vat");
  has(labels.vat, "Pick up dye vat (it is still making something)");
  has(labels.stones, "Pick up millstones (they are still making something)");
  has(labels.stones, "Use the millstones");
  has(labels.wheel, "Use the spinning wheel");
  if (labels.heldVat !== "It is still making something.") bad.push(`a busy vat's Take apart refusal "${labels.heldVat}"`);
  if (labels.heldStones !== "They are still making something.") bad.push(`the busy millstones' Take apart refusal "${labels.heldStones}"`);
  // The hover card's Use rows (item-info.usesOf) name a prop target by the same helper: the tinderbox and the torch light the jack-o'-lantern,
  // never "pumpkin" (the card shows the first three targets; the list behind it is read whole).
  for (const id of ["tinderbox", "torch"]) {
    const on = itemInfoMod.usesOf(itemsMod.getItem(id)).flatMap((u) => u.on);
    if (on.includes("pumpkin") || !on.includes("jack-o'-lantern")) bad.push(`the ${id}'s Use targets: ${on.join(", ")}`);
  }
  const fire = mapMod.fireName({ sprite: "pumpkin" });
  if (fire !== "jack-o'-lantern") bad.push(`the jack-o'-lantern's fire is called "${fire}"`);
  assert(!bad.length, bad.join("; "));
  return `${Object.values(want).map((w) => `"Made ${w}."`).join(", ")}; ${refusals.length} refusals alike; "${labels.vat.find((l) => l.startsWith("Pick up"))}", "${labels.stones.find((l) => l.startsWith("Pick up"))}"`;
});

// A colour no dye gives, on a garment from the dead (docs/bugs.md: a looted hood's card read "#705848"): a plain word, read from the colour;
// a dye's own hex keeps its name and an item's own colour reads Undyed. Every wardrobe colour reads as a word.
check("dye words: a wardrobe's colour no vat gives reads a plain word on the card, never its hex", () => {
  const hood = itemsMod.makeEntry("hood", 1, { colour: "#705848" });
  const state = itemInfoMod.cardFor(hood).state;
  assert(/Brownish/.test(state) && !/#/.test(state), `the hood's card: "${state}"`);
  assert(dyeMod.regionWord("#3e5e90", "#000000") === "Woad blue" && dyeMod.regionWord("#5f8a3a", "#5f8a3a") === "Undyed", "a dye's hex or an own colour lost its word");
  // A vivid colour keeps its hue: a red and a gold no dye gives are not "brownish" (the review of #466).
  assert(dyeMod.colourFamily("#c03030") === "reddish" && dyeMod.colourFamily("#c8a020") === "yellowish", `a red reads ${dyeMod.colourFamily("#c03030")}, a gold ${dyeMod.colourFamily("#c8a020")}`);
  const hexes = new Set();
  const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "colour" && typeof v === "string") hexes.add(v); if (k === "colours" && Array.isArray(v)) v.forEach((x) => typeof x === "string" && hexes.add(x)); walk(v); } };
  walk(read("data/wardrobes.json"));
  const bad = [...hexes].filter((h) => /#/.test(dyeMod.regionWord(h, "#000001")));
  assert(!bad.length, `read as a hex: ${bad.join(", ")}`);
  return `${state}; ${hexes.size} wardrobe colours, each a word`;
});

// A fallen host's screen stays its body when a friend joins (the review of #465, #102): a world whose only player has fallen is
// restored with no pick of its own, and the friend who joins it (addPlayer, or putPlayer for one back from dormancy) becomes the
// world's pick, never the client's: the host's camera, HUD, ear, host.self(), and stepping away stay with the body (src/client.js).
check("client: a dead host's client.me stays its body when a guest joins the world played again (#102)", () => {
  const { client, setMe } = clientMod;
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  const mine = S.player;
  assert(client.me === mine, `after the create client.me is ${client.me ? client.me.id : "none"}, not ${mine.id}`);
  mine.hp = 0;
  for (let i = 0; i < 1200 && !S.corpses.some((c) => c.id === mine.id); i++) gameMod.step(1 / 60);
  assert(S.corpses.some((c) => c.id === mine.id) && !S.players.length, `my player did not become a body (${S.players.length} players)`);
  gameMod.restore(gameMod.serialize(), json); // played again: the save's players are none
  const body = S.corpses.find((c) => c.id === mine.id);
  assert(body && !S.player, `after the restore the world's pick is ${S.player ? S.player.id : "none"}, my body ${body ? "there" : "missing"}`);
  setMe(body); // main.js playWorld, mine fallen
  const back = gameMod.putPlayer(characterMod.serializeCharacter(playerMod.createPlayer(body.gx + 2, body.gy, { id: "Pback" })));
  assert(client.me === body && S.player === back, `a friend back from dormancy took client.me (${client.me ? client.me.id : "none"}); the world's pick ${S.player ? S.player.id : "none"}`);
  gameMod.removePlayer(back.id);
  S.player = null; // the world with nobody again, for the other way in
  const joined = gameMod.addPlayer(body.gx + 3, body.gy, {});
  assert(client.me === body && S.player === joined, `a joining friend took client.me (${client.me ? client.me.id : "none"}); the world's pick ${S.player ? S.player.id : "none"}`);
  gameMod.pickPlayer(joined); // the client's own pick still moves it (a new character, main.js)
  assert(client.me === joined, "pickPlayer no longer moves client.me");
  return `the body ${body.id} kept through a putPlayer and an addPlayer; the world's pick the friend's; a pick moves it`;
});

// The belt's roles (Michael, 2026-10-25): the rope belt's main-hand, off-hand, and utility slots and the leather belt's second main and off;
// a hand slot's key draws into its hand (both hands for a two-hander in a main-hand slot) and swaps, else eats, else says why; an empty slot's
// key does nothing and says nothing; the utility slot eats and stores anything in one cell, never equipping; a two-hander refused in an
// off-hand slot; a skin never drunk by a tap; the key order a client setting turned into the role before the snapshot; no choice on the
// player, in the save, or in the sync part; a guest's key by role and its slot command; the cards.
const promptMod = await import("../src/ui/prompt.js");
check("belt: the slots' roles, each key by role and item, the refusals in words, the utility slot's storage, the key orders, a guest's key and command, the cards", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  let me = S.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  try {
    const mk = (id, props) => itemsMod.makeEntry(id, 1, props);
    const fresh = (p, beltId = "good_belt") => {
      p.worn.waist = mk(beltId);
      p.worn.back = mk("small_sack");
      p.hands.main = null;
      p.hands.off = null;
      p.offMemory = null;
      return inventoryMod.beltOf(p);
    };
    const key = (p, i) => interactMod.beltPress(p, i);
    const last = () => said[said.length - 1] || "";
    const id = (e) => (e ? e.id : "-");
    const held = (p) => `main ${id(p.hands.main)}, off ${id(p.hands.off)}`;
    // The roles and the counts.
    let belt = fresh(me, "belt");
    assert(belt.length === 3 && [0, 1, 2].map(inventoryMod.beltRole).join(",") === "main,off,utility", `the rope belt: ${belt.length} slots`);
    belt = fresh(me);
    assert(belt.length === 5 && [0, 1, 2, 3, 4].map(inventoryMod.beltRole).join(",") === "main,off,utility,main,off", `the leather belt: ${belt.length} slots`);
    // The key orders: the number to the slot index, on both belts; the default is Sequential.
    const keys = (order, n) => [1, 2, 3, 4, 5].map((k) => inventoryMod.beltKeyIndex(order, n, k)).map((i) => (i == null ? "-" : i)).join("");
    assert(keys("sequential", 3) === "012--" && keys("sequential", 5) === "01234", `sequential: rope ${keys("sequential", 3)}, leather ${keys("sequential", 5)}`);
    assert(keys("grouped", 3) === "0-1-2" && keys("grouped", 5) === "03142", `grouped: rope ${keys("grouped", 3)}, leather ${keys("grouped", 5)}`);
    assert(inventoryMod.beltPositions("grouped", 3).filter((p) => p.index == null).map((p) => p.key).join(",") === "2,4", "the rope belt's grouped places 2 and 4 are not the locked ones");
    const settingsSrc = fs.readFileSync(path.join(root, "src/settings.js"), "utf8");
    assert(/beltOrder: "sequential"/.test(settingsSrc) && /label: "Belt slot order"/.test(settingsSrc) && /\["grouped", "Hands grouped"\]/.test(settingsSrc), "the setting Belt slot order, Sequential by default, is not in settings.js");
    // The role travels, never the number: the snapshot's filter keeps the role's events and drops the old numbers.
    const clean = netMod.cleanSnap({ keys: { beltMain1: true, beltOff1: true, beltUtility: true, beltMain2: true, beltOff2: true, belt2: true } }).keys || {};
    assert(Object.keys(clean).sort().join(",") === [...inventoryMod.BELT_EVENTS].sort().join(","), `the snapshot's belt keys: ${Object.keys(clean).join(",")}`);
    assert(netMod.PROTOCOL >= 17, `PROTOCOL ${netMod.PROTOCOL}`); // 17 the belt's roles; a later step's bump keeps it

    // ---- a main-hand slot (index 0) ----
    belt = fresh(me);
    belt[0] = mk("sword");
    me.hands.main = mk("mace");
    const mace = me.hands.main;
    assert(key(me, 0) === "drawn" && id(me.hands.main) === "sword" && belt[0] === mace, `the sword's draw did not swap with the mace: ${held(me)}, slot ${id(belt[0])}`);
    // An empty hand slot: nothing at all, and no line (a stray key never disarms you).
    belt[0] = null;
    said.length = 0;
    assert(key(me, 0) === "nothing" && id(me.hands.main) === "sword" && !belt[0] && said.length === 0, `an empty main-hand slot's key: ${held(me)}, said ${said.join(" / ")}`);
    belt[1] = null;
    me.hands.off = mk("shield");
    assert(key(me, 1) === "nothing" && id(me.hands.off) === "shield" && said.length === 0, "an empty off-hand slot's key moved the shield or spoke");
    // A wrong-hand thing rides the slot as storage; its key says why.
    belt = fresh(me);
    const h = invActionsMod.createInventoryActions(() => me);
    assert(h.canPlace(mk("shield"), "belt:0") && h.canPlace(mk("spear"), "belt:1"), "a wrong-hand thing was refused as storage");
    belt[0] = mk("shield");
    said.length = 0;
    assert(key(me, 0) === "none" && id(belt[0]) === "shield" && !me.hands.main && last() === "The wooden shield can't be held in your main hand.", `the shield's key in a main-hand slot: ${last()}`);
    // Food eaten, a skin never drunk by a tap, the tinderbox left with a word, a torch drawn.
    belt[0] = mk("bread");
    me.hunger = 10;
    assert(key(me, 0) === "eaten" && !belt[0] && me.hunger > 10, "the bread in a main-hand slot was not eaten");
    belt[0] = mk("waterskin", { fill: 80, clean: true });
    said.length = 0;
    assert(key(me, 0) === "none" && belt[0].fill === 80 && last() === "Your waterskin drinks by itself from your belt.", `the skin's tap: fill ${belt[0].fill}, ${last()}`);
    assert(inventoryMod.skinsOf(me).includes(belt[0]), "a skin on the belt is no longer among the skins that sip by themselves");
    belt[0] = mk("tinderbox");
    assert(key(me, 0) === "none" && id(belt[0]) === "tinderbox" && /not held in a hand/.test(last()), `the tinderbox: ${last()}`);
    belt[0] = mk("torch");
    assert(key(me, 0) === "drawn" && id(me.hands.main) === "torch", "the torch was not drawn into the main hand");
    // A two-hander from a main-hand slot: both hands; the main hand's to the slot, the off hand's to an empty off-hand slot.
    belt = fresh(me);
    belt[0] = mk("halberd");
    me.hands.main = mk("sword");
    me.hands.off = mk("shield");
    const shield = me.hands.off;
    assert(key(me, 0) === "drawn" && id(me.hands.main) === "halberd" && me.hands.off === me.hands.main && id(belt[0]) === "sword" && belt[1] === shield, `the halberd's draw: ${held(me)}; slots ${belt.map(id).join(" ")}`);
    // The sword back: the halberd to its slot, the shield it pushed out back in the off hand (docs/21).
    assert(key(me, 0) === "drawn" && id(me.hands.main) === "sword" && me.hands.off === shield && id(belt[0]) === "halberd" && !belt[1], `the sword back: ${held(me)}; slots ${belt.map(id).join(" ")}`);
    // No empty off-hand slot: the shield goes to the bag; no bag either: to the feet.
    belt[1] = mk("book_of_fire");
    belt[4] = mk("book_of_fire");
    belt[3] = mk("bow");
    assert(key(me, 3) === "drawn" && id(me.hands.main) === "bow" && id(belt[3]) === "sword" && inventoryMod.bagOf(me).items.includes(shield), `the bow with the off-hand slots full: ${held(me)}; shield in the bag ${inventoryMod.bagOf(me).items.includes(shield)}`);
    gridMod.remove(inventoryMod.bagOf(me), shield);
    me.worn.back = null;
    itemsMod.release(me.hands, me.hands.main);
    me.hands.main = mk("mace");
    me.hands.off = shield;
    belt[0] = mk("halberd");
    const tx = Math.round(me.gx), ty = Math.round(me.gy);
    // No off-hand slot and no bag: the empty utility slot before the feet (the review of #478, S1).
    assert(key(me, 0) === "drawn" && id(me.hands.main) === "halberd" && belt[2] === shield && !mapMod.itemsAt(tx, ty).some((e) => e.uid === shield.uid), `the halberd with no off-hand slot or bag for the shield: ${held(me)}; utility ${id(belt[2])}`);
    assert(key(me, 0) === "drawn" && id(me.hands.main) === "mace" && me.hands.off === shield && !belt[2] && id(belt[0]) === "halberd", `the mace back, the shield back from the utility slot: ${held(me)}; slots ${belt.map(id).join(" ")}`);
    belt[2] = mk("bread"); // the utility slot full too: to the feet
    assert(key(me, 0) === "drawn" && id(me.hands.main) === "halberd" && mapMod.itemsAt(tx, ty).some((e) => e.uid === shield.uid), `the halberd with nowhere for the shield: ${held(me)}; at the feet ${mapMod.itemsAt(tx, ty).map(id).join(",")}`);
    mapMod.itemsAt(tx, ty).splice(mapMod.itemsAt(tx, ty).findIndex((e) => e.uid === shield.uid), 1); // dropItem lays a copy, by its uid
    // The spear's dual rule: refused in words, everything as it was.
    belt = fresh(me);
    me.hands.off = mk("sword");
    belt[0] = mk("spear");
    said.length = 0;
    assert(key(me, 0) === "refused" && id(belt[0]) === "spear" && id(me.hands.off) === "sword" && !me.hands.main && last() === "The throwing spear can't be held beside the arming sword: it is never dual wielded.", `the spear beside a sword: ${held(me)}; ${last()}`);

    // ---- an off-hand slot (index 1) ----
    belt = fresh(me);
    me.hands.main = mk("sword");
    belt[1] = mk("book_of_fire");
    assert(key(me, 1) === "drawn" && id(me.hands.off) === "book_of_fire" && id(me.hands.main) === "sword" && !belt[1], `the book's draw: ${held(me)}`);
    belt[1] = mk("shield");
    const book = me.hands.off;
    assert(key(me, 1) === "drawn" && id(me.hands.off) === "shield" && belt[1] === book, "the shield did not swap with the book in the off hand");
    belt[1] = mk("spear");
    assert(key(me, 1) === "none" && id(belt[1]) === "spear" && last() === "The throwing spear can't be held in your off hand.", `the spear in an off-hand slot: ${last()}`);
    // A two-hander refused at placement in every off-hand slot, a guest's slot command too, with the line.
    const bow = mk("bow");
    assert(!h.canPlace(bow, "belt:1") && !h.canPlace(bow, "belt:4") && h.canPlace(bow, "belt:0") && h.canPlace(bow, "belt:2") && h.canPlace(bow, "belt:3"), "the bow's placement by role");
    belt[4] = null;
    me.worn.back = mk("small_sack");
    gridMod.insert(inventoryMod.bagOf(me), bow);
    said.length = 0;
    const ranBow = invActionsMod.performItemCommand(me, { op: "slot", uid: bow.uid, src: { kind: "bag", bag: { mine: true } }, slot: "belt:4" });
    assert(ranBow === false && !belt[4] && inventoryMod.bagOf(me).items.includes(bow) && last() === "The hunting bow needs both hands: it goes in a main-hand slot or the utility slot.", `a guest's bow onto an off-hand slot: ran ${ranBow}; ${last()}`);
    said.length = 0;
    h.slotRefused(bow, "belt:1");
    assert(last() === "The hunting bow needs both hands: it goes in a main-hand slot or the utility slot.", `a drag's word: ${last()}`);
    // An off-hand draw with a two-hander held: the two-hander to an empty main-hand slot, the slot left empty.
    belt = fresh(me);
    const halberd = mk("halberd");
    me.hands.main = halberd;
    me.hands.off = halberd;
    belt[1] = mk("shield");
    assert(key(me, 1) === "drawn" && id(me.hands.off) === "shield" && !me.hands.main && !belt[1] && (belt[0] === halberd || belt[3] === halberd), `the shield with the halberd held: ${held(me)}; slots ${belt.map(id).join(" ")}`);
    // Both main-hand slots full and no bag: the bow pushed out by a draw into the off hand goes to the empty utility slot, never the floor (S1).
    belt = fresh(me);
    me.worn.back = null;
    const heldBow = mk("bow");
    me.hands.main = heldBow;
    me.hands.off = heldBow;
    belt[0] = mk("sword");
    belt[3] = mk("mace");
    belt[1] = mk("torch");
    const fx = Math.round(me.gx), fy = Math.round(me.gy);
    assert(key(me, 1) === "drawn" && id(me.hands.off) === "torch" && !me.hands.main && belt[2] === heldBow && !mapMod.itemsAt(fx, fy).some((e) => e.uid === heldBow.uid), `the torch drawn with the bow held and the main-hand slots full: ${held(me)}; slots ${belt.map(id).join(" ")}`);
    me.worn.back = mk("small_sack");

    // ---- the utility slot (index 2) ----
    belt = fresh(me);
    assert(h.canPlace(halberd, "belt:2"), "the utility slot refused the halberd");
    belt[2] = halberd; // one cell, whatever its bag shape (1 by 5)
    said.length = 0;
    assert(key(me, 2) === "none" && belt[2] === halberd && !me.hands.main && last() === "You can't equip a weapon from the utility slot.", `the halberd's key in the utility slot: ${last()}`);
    belt[2] = mk("sword");
    assert(key(me, 2) === "none" && id(belt[2]) === "sword" && last() === "You can't equip a weapon from the utility slot.", "the sword in the utility slot");
    belt[2] = mk("torch", { lit: true });
    assert(key(me, 2) === "none" && id(belt[2]) === "torch" && last() === "You can't equip the torch from the utility slot." && itemsMod.isLit(belt[2]), `the torch in the utility slot: ${last()}`);
    belt[2] = mk("book_of_fire");
    assert(key(me, 2) === "none" && last() === "You can't equip the book of fire from the utility slot.", `the book in the utility slot: ${last()}`);
    belt[2] = mk("bread");
    me.hunger = 10;
    assert(key(me, 2) === "eaten" && !belt[2], "the bread in the utility slot was not eaten");
    belt[2] = mk("waterskin", { fill: 50, clean: true });
    assert(key(me, 2) === "none" && belt[2].fill === 50 && last() === "Your waterskin drinks by itself from your belt.", "the skin's tap in the utility slot");
    belt[2] = null;
    said.length = 0;
    assert(key(me, 2) === "nothing" && said.length === 0, "an empty utility slot spoke");
    // stow with no bag: a two-hander to a main-hand or the utility slot, never an off-hand one.
    belt = fresh(me);
    me.worn.back = null;
    belt[0] = mk("sword");
    const bow2 = mk("bow");
    assert(inventoryMod.stow(me, bow2) === "belt" && belt[2] === bow2 && !belt[1], `stow put the bow at ${belt.indexOf(bow2)}`);
    // A one-handed weapon put away with no bag: the main-hand slots, then the utility slot, never an off-hand slot (so a swap never dual-wields).
    belt = fresh(me);
    me.worn.back = null;
    const sw1 = mk("sword");
    const sw2 = mk("mace");
    const sw3 = mk("hatchet");
    const sw4 = mk("knife");
    assert(inventoryMod.stow(me, sw1) === "belt" && belt[0] === sw1 && inventoryMod.stow(me, sw2) === "belt" && belt[3] === sw2 && inventoryMod.stow(me, sw3) === "belt" && belt[2] === sw3, `stow's one-handers: slots ${belt.map(id).join(" ")}`);
    assert(inventoryMod.stow(me, sw4) === null && !belt[1] && !belt[4], `a fourth one-hander went to an off-hand slot: slots ${belt.map(id).join(" ")}`);
    assert(inventoryMod.stow(me, mk("book_of_fire")) === "belt" && id(belt[1]) === "book_of_fire", `a book did not go to the free off-hand slot: slots ${belt.map(id).join(" ")}`);
    me.worn.back = mk("small_sack");
    // Take All with the bag full: a bow tries every empty belt slot its role allows, the utility slot past the off-hand one (S2).
    belt = fresh(me, "belt");
    belt[0] = mk("sword");
    const full = inventoryMod.bagOf(me);
    for (let n = 0; n < 60 && gridMod.insert(full, mk("hatchet")); n++);
    const chestBag = inventoryMod.createBag(3, 3, "chest");
    const takeBow = mk("bow");
    gridMod.insert(chestBag, takeBow);
    const took = invActionsMod.takeAllFrom(me, chestBag, h);
    assert(took.moved === 1 && took.left === 0 && belt[2] === takeBow && !belt[1] && chestBag.items.length === 0, `Take All's bow with the bag full: ${JSON.stringify(took)}; slots ${belt.map(id).join(" ")}`);
    me.worn.back = mk("small_sack");

    // ---- the slot's menu and the double-click ----
    belt = fresh(me);
    belt[0] = mk("sword");
    belt[2] = mk("mace");
    const labels = (i) => interactMod.slotMenu(me, `belt:${i}`).map((m) => m.label).join(",");
    assert(labels(0).startsWith("Use,Equip,Put in bag") && !/Equip to/.test(labels(0)) && !interactMod.slotMenu(me, "belt:0").some((m) => "checked" in m), `the sword's slot menu: ${labels(0)}`);
    // The utility slot's menu equips into the item's own hand, as from the bag; only its key (and the double-click, the key's path) never does (S3).
    assert(labels(2) === "Use,Equip (main hand),Equip (off hand),Put in bag,Drop", `the utility slot's mace menu: ${labels(2)}`);
    said.length = 0;
    assert(h.useSlot("belt:2") === false && id(belt[2]) === "mace" && last() === "You can't equip a weapon from the utility slot.", `the utility slot's double-click: ${last()}`);
    const uMace = belt[2];
    interactMod.slotMenu(me, "belt:2").find((m) => m.label === "Equip (off hand)").onSelect();
    assert(me.hands.off === uMace && !belt[2], `the utility slot's Equip (off hand): ${held(me)}; slots ${belt.map(id).join(" ")}`);
    me.hands.off = null;
    belt[2] = mk("halberd");
    assert(labels(2) === "Use,Equip (both hands),Put in bag,Drop", `the utility slot's halberd menu: ${labels(2)}`);
    belt[3] = mk("shield");
    assert(labels(3) === "Use,Equip (off hand),Put in bag,Drop", `a shield's menu in a main-hand slot: ${labels(3)}`);
    // A guest's way: the same label as a menu command, run on the host.
    const uHal = belt[2];
    assert(invActionsMod.performItemCommand(me, { op: "menu", label: "Equip (both hands)", src: { kind: "slot", id: "belt:2" } }) === true && me.hands.main === uHal && me.hands.off === uHal && !belt[2], `a guest's Equip (both hands) from the utility slot: ${held(me)}`);
    itemsMod.release(me.hands, uHal);
    belt[3] = null;
    assert(h.useSlot("belt:0") === true && id(me.hands.main) === "sword", "the main-hand slot's double-click did not draw the sword");
    belt[1] = mk("waterskin", { fill: 60, clean: true });
    assert(h.useSlot("belt:1") === false && belt[1].fill === 60 && last() === "Your waterskin drinks by itself from your belt.", "a belt skin's double-click drank");

    // ---- no choice on the player: not in the save, not in the sync part; an old save's dropped ----
    assert(!("beltHands" in me), "a player still carries beltHands");
    assert(!/beltHands/.test(gameMod.syncParts().players) && !/beltHands/.test(JSON.stringify(gameMod.serialize())), "beltHands is still in the sync part or the save");
    const saved = JSON.parse(JSON.stringify(gameMod.serialize()));
    const rec = saved.characters.players.find((p) => p.id === me.id);
    rec.beltHands = [{ id: "sword", hand: "off" }];
    gameMod.restore(saved, json);
    me = S.player;
    assert(!("beltHands" in me), "an old save's beltHands was restored onto the player");
    // An old world's rope belt of two grows to three.
    const old = mk("belt");
    old.slots = [null, null];
    assert(inventoryMod.ensureSlots(old).length === 3, "an old rope belt of two did not grow to three");

    // ---- a guest: its key by role in its snapshot, run by the host's step ----
    const g = gameMod.addPlayer(me.gx + 1, me.gy, {});
    const gb = fresh(g, "belt");
    gb[1] = mk("book_of_fire");
    gb[0] = mk("sword");
    const idle = { axis: { x: 0, y: 0 }, sprint: false, aim: null, aimAt: null, clicked: false, clickSpent: false, leftDown: false, altPressed: false };
    gameMod.step(1 / 60, { [g.id]: netMod.cleanSnap({ ...idle, keys: { beltOff1: true } }) });
    assert(id(g.hands.off) === "book_of_fire" && !gb[1] && !g.hands.main, `a guest's off-hand key: ${held(g)}`);
    gameMod.step(1 / 60, { [g.id]: netMod.cleanSnap({ ...idle, keys: { beltMain1: true } }) });
    assert(id(g.hands.main) === "sword" && id(g.hands.off) === "book_of_fire", `a guest's main-hand key: ${held(g)}`);
    gameMod.removePlayer(g.id);

    // ---- the cards ----
    const card = (e, role) => itemInfoMod.textOf(itemInfoMod.cardFor(e, role ? { beltRole: role } : {}));
    const has = (e, role, text) => card(e, role).includes(text);
    assert(has(mk("sword"), "main", "From this main-hand slot: drawn into your main hand."), card(mk("sword"), "main").join(" | "));
    assert(has(mk("book_of_fire"), "off", "From this off-hand slot: drawn into your off hand."), card(mk("book_of_fire"), "off").join(" | "));
    assert(has(mk("halberd"), "main", "From this main-hand slot: drawn into both hands."), card(mk("halberd"), "main").join(" | "));
    assert(has(mk("halberd"), "utility", "From the utility slot: stored. You can't equip a weapon from the utility slot. Its menu equips it."), card(mk("halberd"), "utility").join(" | "));
    assert(has(mk("shield"), "main", "From this main-hand slot: stored. The wooden shield can't be held in your main hand. Its menu equips it."), card(mk("shield"), "main").join(" | "));
    assert(has(mk("bread"), "utility", "From the utility slot: eaten."), card(mk("bread"), "utility").join(" | "));
    assert(card(mk("torch"), "off")[2] === "From this off-hand slot: drawn into your off hand. Lit, it gives its light from the belt.", card(mk("torch"), "off").join(" | "));
    assert(has(mk("halberd"), null, "Equip: both hands; on the belt, a main-hand slot or the utility slot.") && has(mk("sword"), null, "Equip: main or off hand.") && !card(mk("sword")).some((l) => /from the belt|this slot/.test(l)), `${card(mk("halberd")).join(" | ")} || ${card(mk("sword")).join(" | ")}`);
    const empty = (role) => itemInfoMod.textOf(itemInfoMod.cardForBeltSlot(role, 1)).join(" | ");
    assert(/This is a main-hand slot\. Its key draws what's here into your main hand/.test(empty("main")) && /two-handed/i.test(empty("main")), empty("main"));
    assert(/This is an off-hand slot\. Its key draws what's here into your off hand/.test(empty("off")) && /Two-handed items can't go here/.test(empty("off")), empty("off"));
    assert(/This is the utility slot\. Its key eats what's here if it is food, and never equips anything/.test(empty("utility")) && /one cell whatever its size/.test(empty("utility")), empty("utility"));
    return "the roles on both belts; both key orders on both belts and the role in the snapshot (PROTOCOL 17 or later); each role's key for a weapon, a shield, a torch, food, a skin, the tinderbox, a two-hander, and an empty slot; the swap and the off hand's thing sent to a slot, the bag, or the feet; the spear's dual rule; a two-hander refused in an off-hand slot by the slot check, a guest's command, and a drag, each in words; the utility slot's halberd in one cell; stow by role; the menu and the double-click; no choice in the save or the sync part; a guest's keys; the cards";
  } finally {
    promptMod.setMessageSink(null);
  }
});

// Michael's playtest checklist, 2026-10-26 (docs/bugs.md, Fixed): the throwing knife's and axe's stacks taken by every hand slot and hand
// belt slot; a swap from the belt sending what the hand held to the slot just freed, by the key, a drag either way, and the slot menu's Equip,
// the feet last with a line; the swing's outline and its hit agreeing at the wedge's edges; Take apart's word for a lit fire that only burns
// down. What needs the page (the map's aim and its marker, the real drags, two tabs) is check("playtest1").
const combatPt = await import("../src/combat.js"); // the file's combatMod and isoMod are imported further down
const isoPt = await import("../src/iso.js");
check("playtest 2026-10-26: throwables' stacks in the hand slots, the belt's swap into the freed slot and the feet's line, the swing's outline at its edges, a lit cauldron's Take apart", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  try {
    const mk = (id, n = 1) => itemsMod.makeEntry(id, n);
    const id = (e) => (e ? e.id : "-");
    const last = () => said[said.length - 1] || "";
    me.worn.waist = mk("good_belt");
    me.worn.back = mk("small_sack");
    const belt = inventoryMod.beltOf(me);
    const bag = () => inventoryMod.bagOf(me);
    const reset = () => { for (let i = 0; i < belt.length; i++) belt[i] = null; me.hands.main = null; me.hands.off = null; me.offMemory = null; bag().items.length = 0; };
    const h = invActionsMod.createInventoryActions(() => me);
    const where = () => `main ${id(me.hands.main)}, off ${id(me.hands.off)}; belt ${belt.map(id).join(" ")}; bag ${(bag() && bag().items.map(id).join(",")) || "-"}`;
    // 1. The stacks: 20 knives and 10 axes go in every hand belt slot, the utility slot, and both hands; one past the stack, or two swords, do not.
    reset();
    for (const [item, n] of [["throwing_knife", 20], ["throwing_axe", 10]]) {
      const s = mk(item, n);
      const slots = ["belt:0", "belt:1", "belt:2", "belt:3", "belt:4", "hand:main", "hand:off"];
      assert(slots.every((q) => h.canPlace(s, q)), `${item} x${n} refused at ${slots.filter((q) => !h.canPlace(s, q)).join(",")}`);
      assert(!h.canPlace(mk(item, n + 1), "belt:0") && !h.canPlace(mk(item, n + 1), "hand:main"), `${item} x${n + 1} taken`);
    }
    assert(!h.canPlace(mk("sword", 2), "belt:0") && !h.canPlace(mk("sword", 2), "hand:main"), "two swords as one entry taken");
    gridMod.insert(bag(), mk("throwing_knife", 20)); // a stack goes in as a new entry (grid.insert), so it is read back from the bag
    const knives = bag().items.find((e) => e.id === "throwing_knife");
    assert(invActionsMod.performItemCommand(me, { op: "slot", uid: knives.uid, src: { kind: "bag", bag: { mine: true } }, slot: "belt:1" }) === true && belt[1] === knives && knives.count === 20, `a guest's knives onto an off-hand slot: ${where()}`);
    assert(interactMod.beltPress(me, 1) === "drawn" && me.hands.off === knives && !belt[1], `the off-hand slot's key with the knives: ${where()}`);
    gridMod.insert(bag(), mk("throwing_axe", 10));
    const axes = bag().items.find((e) => e.id === "throwing_axe");
    assert(invActionsMod.performItemCommand(me, { op: "slot", uid: axes.uid, src: { kind: "bag", bag: { mine: true } }, slot: "hand:main" }) === true && me.hands.main === axes && axes.count === 10, `a guest's axes onto the main hand: ${where()}`);
    // 2. The swap: Michael's own case, a bow held, a sword on the main-hand slot and a shield on the off-hand slot; key 1.
    reset();
    let bow = mk("bow");
    me.hands.main = bow;
    me.hands.off = bow;
    belt[0] = mk("sword");
    belt[1] = mk("shield");
    assert(interactMod.beltPress(me, 0) === "drawn" && id(me.hands.main) === "sword" && belt[0] === bow && id(belt[1]) === "shield" && !bag().items.includes(bow), `key 1 with the bow held: ${where()}`);
    // The same by a drag from the slot onto the main hand (it once went through equip's stow, bag first).
    reset();
    bow = mk("bow");
    me.hands.main = bow;
    me.hands.off = bow;
    belt[0] = mk("sword");
    h.placeInSlot(belt[0], { kind: "slot", id: "belt:0" }, "hand:main");
    assert(id(me.hands.main) === "sword" && belt[0] === bow && !bag().items.includes(bow), `a drag from the slot onto the main hand: ${where()}`);
    // And from the hand onto the occupied slot: a swap, the slot's thing into that hand.
    reset();
    const mace = mk("mace");
    me.hands.main = mace;
    belt[0] = mk("sword");
    h.placeInSlot(mace, { kind: "slot", id: "hand:main" }, "belt:0");
    assert(id(me.hands.main) === "sword" && belt[0] === mace && !bag().items.length, `a drag from the hand onto an occupied slot: ${where()}`);
    // And a shield dragged from the off hand onto a main-hand slot holding a sword: the sword into the off hand, the shield onto that slot,
    // where it was dragged, though that slot's key would not draw it.
    reset();
    const sh0 = mk("shield");
    me.hands.off = sh0;
    belt[0] = mk("sword");
    h.placeInSlot(sh0, { kind: "slot", id: "hand:off" }, "belt:0");
    assert(id(me.hands.off) === "sword" && belt[0] === sh0 && !bag().items.length, `a shield dragged onto an occupied main-hand slot: ${where()}`);
    // A sword dragged from the main-hand slot onto the off hand: the shield is no main-hand slot's to draw back, so it goes to an empty
    // off-hand slot, not the freed main-hand one (the review of #501).
    reset();
    const shield = mk("shield");
    me.hands.main = mk("mace");
    me.hands.off = shield;
    belt[0] = mk("sword");
    h.placeInSlot(belt[0], { kind: "slot", id: "belt:0" }, "hand:off");
    assert(id(me.hands.off) === "sword" && belt[1] === shield && !belt[0] && id(me.hands.main) === "mace", `a sword from the main-hand slot onto the off hand: ${where()}`);
    // With both off-hand slots and the bag and the utility slot full, the freed main-hand slot holds it as storage, never the feet.
    reset();
    me.worn.back = null;
    const sh1 = mk("shield");
    me.hands.main = mk("mace");
    me.hands.off = sh1;
    belt[0] = mk("sword");
    belt[1] = mk("book_of_fire");
    belt[2] = mk("bread");
    belt[4] = mk("book_of_fire");
    h.placeInSlot(belt[0], { kind: "slot", id: "belt:0" }, "hand:off");
    assert(id(me.hands.off) === "sword" && belt[0] === sh1, `the shield with nowhere but the freed slot: ${where()}`);
    me.worn.back = mk("small_sack");
    // The slot menu's Equip into a hand from the utility slot: the utility slot's key draws nothing, so what that hand held goes to an
    // empty slot of its own role.
    reset();
    me.hands.main = mk("mace");
    const sh2 = mk("shield");
    me.hands.off = sh2;
    belt[2] = mk("sword");
    interactMod.slotMenu(me, "belt:2").find((q) => q.label === "Equip (off hand)").onSelect();
    assert(id(me.hands.off) === "sword" && belt[1] === sh2 && !belt[2] && !bag().items.length, `the utility slot's Equip (off hand): ${where()}`);
    // An off-hand draw from a main-hand slot with the bow held: the bow takes the freed main-hand slot, not the first empty one.
    reset();
    bow = mk("bow");
    me.hands.main = bow;
    me.hands.off = bow;
    belt[3] = mk("shield");
    interactMod.slotMenu(me, "belt:3").find((q) => q.label === "Equip (off hand)").onSelect();
    assert(id(me.hands.off) === "shield" && belt[3] === bow && !belt[0], `the shield from the second main-hand slot with the bow held: ${where()}`);
    // A two-hander never takes a freed off-hand slot: drawn into the off hand from there, the bow goes to an empty main-hand slot.
    reset();
    bow = mk("bow");
    me.hands.main = bow;
    me.hands.off = bow;
    belt[1] = mk("shield");
    assert(interactMod.beltPress(me, 1) === "drawn" && id(me.hands.off) === "shield" && !belt[1] && belt[0] === bow, `key 2 with the bow held: ${where()}`);
    // Nowhere at all: the feet, with its line.
    reset();
    me.worn.back = null;
    me.hands.main = mk("mace");
    const sh3 = mk("shield");
    me.hands.off = sh3;
    belt[0] = mk("halberd");
    belt[1] = mk("book_of_fire");
    belt[2] = mk("bread");
    belt[4] = mk("book_of_fire");
    const tx = Math.round(me.gx), ty = Math.round(me.gy);
    said.length = 0;
    assert(interactMod.beltPress(me, 0) === "drawn" && id(me.hands.main) === "halberd" && id(belt[0]) === "mace" && mapMod.itemsAt(tx, ty).some((e) => e.uid === sh3.uid) && last() === "Nowhere to put the wooden shield: it is at your feet.", `the halberd with nowhere for the shield: ${where()}; "${last()}"`);
    mapMod.itemsAt(tx, ty).splice(mapMod.itemsAt(tx, ty).findIndex((e) => e.uid === sh3.uid), 1);
    me.worn.back = mk("small_sack");
    // 3. The swing's outline is the swing's hit at the edges of its wedge: one of the dead just inside and just outside the reach and each
    //    edge of the arc, and point blank behind; the outline (swingTargets) and the swing (tryAttack) name the same bodies.
    reset();
    me.hands.main = mk("sword");
    const sw = combatPt.weaponOf(me);
    const a = isoPt.gridDirToScreen(1, 0);
    me.aim = { sx: a.sx, sy: a.sy };
    const rows = [];
    for (const [r, deg] of [[sw.range - 0.05, 0], [sw.range + 0.3, 0], [1, sw.arc / 2 - 4], [1, sw.arc / 2 + 30], [1, -(sw.arc / 2) + 4], [1, -(sw.arc / 2) - 30], [0.4, 180]]) {
      const z = zombieMod.createZombie(me.gx + r * Math.cos((deg * Math.PI) / 180), me.gy + r * Math.sin((deg * Math.PI) / 180));
      const lit = combatPt.swingTargets(me, [z]).includes(z);
      me.attackCooldown = 0;
      me.shoveCooldown = 0;
      me.stamina = 100;
      const hit = (combatPt.tryAttack(me, [z]) || []).includes(z);
      rows.push(`${r.toFixed(2)}@${Math.round(deg)}: ${lit ? "lit" : "-"}/${hit ? "hit" : "-"}`);
      assert(lit === hit, `the outline and the swing disagree: ${rows.join(", ")}`);
    }
    // 4. Take apart's word for a lit fire: a campfire is put out by hand, a cauldron's fire only burns down.
    const cauldron = mapMod.createProp({ sprite: "cauldron", tile: [tx + 2, ty] });
    cauldron.fire.lit = true;
    cauldron.fire.fuel = 1;
    const camp = mapMod.createProp({ sprite: "campfire", tile: [tx + 3, ty] });
    camp.fire.lit = true;
    assert(placementMod.holdsProblem(cauldron) === "Let it burn down first." && placementMod.holdsProblem(camp) === "Put it out first.", `${placementMod.holdsProblem(cauldron)} / ${placementMod.holdsProblem(camp)}`);
    return `knives and axes in every hand slot as stacks, a guest's commands too; the swap into the freed slot by the key, both drags, and the menu; a two-hander never in a freed off-hand slot; the feet's line; the sword's outline ${rows.join(", ")}; a lit cauldron "Let it burn down first."`;
  } finally {
    promptMod.setMessageSink(null);
  }
});

// Michael's second playtest batch, 2026-10-26 (docs/bugs.md, Fixed): the shovel beside the spear refused in the spear's words, never "No room
// to swap."; the bucket's Use on a plot the map grew (wet until first looked at) watering it as the menu's Water does; each vessel its own
// entry over a crop, the bucket first; the line when every skin is tainted, once a Thirsty stage; the knife's 18; the Inspect card's words.
// What needs the page (the Worlds screen's Delete, the cooking list's scroll, the Use mode's outline, the right click, the card on screen,
// the hover card's red, two tabs) is check("playtest2").
const farmingPt2 = await import("../src/farming.js");
const bucketPt2 = await import("../src/bucket.js");
const inspectCardPt2 = await import("../src/ui/inspect-card.js");
check("playtest 2026-10-26 (2): the spear's dual rule in its own words, the bucket's Use on any crop and each vessel its own Water, the tainted-only line, the knife's 18, the Inspect card's words", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false, survival: true } });
  const me = gameMod.state.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  const notes = [];
  const off = eventsMod.on("taintedOnly", ({ who }) => notes.push(who));
  try {
    const mk = (id, n = 1, props = {}) => itemsMod.makeEntry(id, n, props);
    const id = (e) => (e ? e.id : "-");
    const last = () => said[said.length - 1] || "";
    me.worn.back = mk("small_sack");
    const bag = () => inventoryMod.bagOf(me);
    const h = invActionsMod.createInventoryActions(() => me);
    // 1. The shovel beside the spear: refused by the spear's rule, in its words, with the bag half empty; nothing moved.
    me.hands.main = mk("spear");
    me.hands.off = null;
    bag().items.length = 0;
    gridMod.insert(bag(), mk("shovel"));
    const shovel = bag().items.find((e) => e.id === "shovel");
    const word = "The throwing spear can't be held beside the shovel: it is never dual wielded.";
    assert(inventoryMod.equipProblem(me, shovel, "off") === word, `equipProblem: ${inventoryMod.equipProblem(me, shovel, "off")}`);
    said.length = 0;
    h.placeInSlot(shovel, { kind: "bag", bag: bag() }, "hand:off");
    assert(!me.hands.off && bag().items.includes(shovel) && last() === word && !said.includes("No room to swap."), `the drag: off ${id(me.hands.off)}; "${last()}"`);
    said.length = 0;
    assert(invActionsMod.performItemCommand(me, { op: "slot", uid: shovel.uid, src: { kind: "bag", bag: { mine: true } }, slot: "hand:off" }) !== undefined && !me.hands.off && last() === word, `a guest's slot command: "${last()}"`);
    // A refused equip moves nothing: the spear in the main hand, a torch in the off hand, the shovel dragged onto the off hand; the torch
    // is still held (equip once stowed it before the rule refused, the review of #507).
    const torch = mk("torch");
    me.hands.off = torch;
    said.length = 0;
    h.placeInSlot(shovel, { kind: "bag", bag: bag() }, "hand:off");
    assert(me.hands.off === torch && bag().items.includes(shovel) && !bag().items.includes(torch) && last() === word, `the torch held: off ${id(me.hands.off)}; bag ${bag().items.map(id).join(",")}; "${last()}"`);
    me.hands.off = null;
    // The same shovel from a belt slot, by its key and by a drag: the same words (beltDraw's refusal is items.dualWord's).
    me.worn.waist = mk("good_belt");
    const beltP = inventoryMod.beltOf(me);
    gridMod.remove(bag(), shovel);
    beltP[1] = shovel;
    said.length = 0;
    const keyed = interactMod.beltPress(me, 1);
    assert(keyed === "refused" && beltP[1] === shovel && !me.hands.off && last() === word, `the shovel's off-hand slot key: ${keyed}; "${last()}"`);
    said.length = 0;
    h.placeInSlot(shovel, { kind: "slot", id: "belt:1" }, "hand:off");
    assert(beltP[1] === shovel && !me.hands.off && last() === word, `the shovel dragged from its belt slot: "${last()}"`);
    beltP[1] = null;
    me.worn.waist = null;
    gridMod.insert(bag(), shovel);
    // A torch and a shield are no weapons by the rule; and a full bag with a sword in the off hand is still the spear's word, not room's.
    assert(!inventoryMod.equipProblem(me, mk("shield"), "off") && !inventoryMod.equipProblem(me, mk("torch"), "off"), "a shield or a torch beside the spear refused");
    me.hands.main = mk("sword");
    me.hands.off = mk("mace");
    assert(inventoryMod.equipProblem(me, mk("spear"), "main") === "The throwing spear can't be held beside the flanged mace: it is never dual wielded.", `the spear onto the main hand beside a mace: ${inventoryMod.equipProblem(me, mk("spear"), "main")}`);
    me.hands.main = null;
    me.hands.off = null;
    // "No room to swap." only when what the hand held has nowhere to go: a sword held, no belt and the bag full, a mace dragged onto the hand.
    bag().items.length = 0;
    me.worn.waist = null;
    gridMod.insert(bag(), mk("mace"));
    const mace = bag().items.find((e) => e.id === "mace");
    while (gridMod.insert(bag(), mk("stone")));
    me.hands.main = mk("sword");
    said.length = 0;
    h.placeInSlot(mace, { kind: "bag", bag: bag() }, "hand:main");
    assert(id(me.hands.main) === "sword" && bag().items.includes(mace) && last() === "No room to swap.", `a full bag: main ${id(me.hands.main)}; "${last()}"`);
    me.hands.main = null;
    // 2. The bucket on a crop the map grew (wet until first looked at): the Use mode waters it as the menu's Water does.
    bag().items.length = 0;
    const authored = mapMod.allProps().find((p) => p.crop && p.crop.at === undefined);
    assert(authored, "no authored crop on the valley");
    const [cx, cy] = authored.tile;
    gameMod.teleportPlayer ? gameMod.teleportPlayer(me, cx + 0.5, cy + 0.6) : (me.gx = cx + 0.5, me.gy = cy + 0.6);
    mapMod.ensureAround(me.gx, me.gy, 2);
    const bucket = mk("bucket", 1, { fill: itemsMod.getItem("bucket").vessel.capacity });
    gridMod.insert(bag(), bucket);
    const b = bag().items.find((e) => e.id === "bucket");
    const r = verbsMod.run("pour", null, me, { kind: "prop", prop: authored, entry: b.uid, item: "bucket" });
    assert(r.ok && b.fill === 0 && farmingPt2.isWet(authored) && authored.crop.at !== undefined, `the Use on an authored crop: ${r.reason || r.message}; fill ${b.fill}`);
    // A crop already wet: watered again (its soil wet from now), as the skin's Water is; nothing planted near says so.
    b.fill = itemsMod.getItem("bucket").vessel.capacity;
    const r2 = verbsMod.run("pour", null, me, { kind: "prop", prop: authored, entry: b.uid, item: "bucket" });
    assert(r2.ok, `the Use on a wet crop: ${r2.reason}`);
    // 3. Each vessel its own Water over a crop, the bucket first; each by its label takes its own vessel.
    b.fill = itemsMod.getItem("bucket").vessel.capacity;
    gridMod.insert(bag(), mk("waterskin", 1, { fill: 100, clean: true }));
    const skin = bag().items.find((e) => e.id === "waterskin");
    const labels = interactMod.actionsForTarget({ kind: "prop", id: authored.id }, me).map((a) => a.label);
    const iB = labels.indexOf(bucketPt2.POUR_LABEL);
    const iS = labels.indexOf("Water with the waterskin");
    assert(iB >= 0 && iS > iB && !labels.includes("Water"), `the crop's menu: ${labels.join(", ")}`);
    assert(interactMod.performByLabel(me, { kind: "prop", id: authored.id }, "Water with the waterskin") === true, "Water with the waterskin by its label");
    for (let i = 0; i < 100 && me.action; i++) interactMod.updateAction(me, 0.1);
    assert(skin.fill === 100 - farmingPt2.get().soil.fillCost && b.fill === itemsMod.getItem("bucket").vessel.capacity, `the skin's label used the skin alone: skin ${skin.fill}, bucket ${b.fill}`);
    assert(interactMod.performByLabel(me, { kind: "prop", id: authored.id }, bucketPt2.POUR_LABEL) === true, "Water with the bucket by its label");
    for (let i = 0; i < 100 && me.action; i++) interactMod.updateAction(me, 0.1);
    assert(b.fill === 0 && skin.fill === 100 - farmingPt2.get().soil.fillCost, `the bucket's label used the bucket alone: skin ${skin.fill}, bucket ${b.fill}`);
    // With no water carried at all, one greyed Water says so.
    skin.fill = 0;
    const dry = interactMod.actionsForTarget({ kind: "prop", id: authored.id }, me).filter((a) => /^Water/.test(a.label));
    assert(dry.length === 1 && dry[0].label === `${bucketPt2.POUR_LABEL} (empty)` && !dry[0].enabled, `nothing to water with: ${dry.map((a) => a.label).join(", ")}`);
    bag().items.length = 0;
    const none = interactMod.actionsForTarget({ kind: "prop", id: authored.id }, me).filter((a) => /^Water/.test(a.label));
    assert(none.length === 1 && none[0].label === "Water (no water carried)" && !none[0].enabled, `no vessel: ${none.map((a) => a.label).join(", ")}`);
    // 4. Thirsty with only tainted water: the line once a stage, none with a clean skin, none with no water; again after a drink.
    const tainted = mk("waterskin", 1, { fill: 100 });
    gridMod.insert(bag(), tainted);
    me.thirst = 30; // Thirsty, the auto-sip's stage
    const noteNow = () => { notes.length = 0; for (let i = 0; i < 3; i++) gameMod.step(1 / 60); return notes.filter((w) => w === me.id).length; };
    const at2 = noteNow();
    const again2 = noteNow();
    me.thirst = 10; // the next stage
    const at3 = noteNow();
    me.thirst = 80; // watered
    noteNow();
    me.thirst = 30;
    const back2 = noteNow();
    tainted.clean = true; // a clean skin: the auto-sip drinks, no line
    const clean2 = (me.taintNoted = 0, noteNow());
    assert(at2 === 1 && again2 === 0 && at3 === 1 && back2 === 1 && clean2 === 0 && playerMod.TAINTED_ONLY === "Your waterskins hold only tainted water: boil it at a lit fire.", `at Thirsty ${at2}, again ${again2}, the next stage ${at3}, after a drink ${back2}, a clean skin ${clean2}`);
    // 5. The knife's 18, and its card.
    const kt = itemsMod.getItem("throwing_knife").thrown;
    assert(kt.damage === 18, `the knife's damage ${kt.damage}`);
    assert(itemInfoMod.textOf(itemInfoMod.cardFor(mk("throwing_knife", 5))).some((l) => /: 9 to 18 damage by the draw|18 damage/.test(l)), `the knife's card: ${itemInfoMod.textOf(itemInfoMod.cardFor(mk("throwing_knife", 5))).join(" / ")}`);
    // 6. The tainted line first on the card, a warning's segments; the Inspect card's words from Inspect's sentence.
    const tc = itemInfoMod.cardFor(mk("waterskin", 1, { fill: 50 }));
    assert(tc.lines[0][0].k === "warn" && itemInfoMod.textOf(tc).includes("Tainted water: drinking it may make you Sick."), `the tainted skin's card: ${JSON.stringify(tc.lines[0])}`);
    const ic = inspectCardPt2.cardOf("Potatoes: ready in about 2 days; watered; not fertilized; harvest with a shovel.");
    assert(ic.name === "Potatoes" && ic.lines.join("|") === "Ready in about 2 days|Watered|Not fertilized|Harvest with a shovel", JSON.stringify(ic));
    const sc = inspectCardPt2.cardOf("A sapling that cannot grow into an oak here: there is a wall in the way. It waits until that changes.", "Sapling");
    assert(sc.name === "Sapling" && sc.lines.length === 1 && sc.lines[0] === "A sapling that cannot grow into an oak here: there is a wall in the way. It waits until that changes.", `a sapling's card: ${JSON.stringify(sc)}`);
    return `"${word}" by the drag and a guest's command, the bag half empty; the bucket's Use on an authored crop and a wet one; ${labels.filter((l) => /^Water/.test(l)).join(", ")} in that order, each its own vessel; the tainted-only line at Thirsty once, at the next stage once, again after a drink, none with a clean skin; the knife 18; the tainted line first; the Inspect card ${ic.name} with ${ic.lines.length} lines`;
  } finally {
    off && off();
    promptMod.setMessageSink(null);
  }
});

// Handedness (Michael, 2026-10-25): right- or left-handed, chosen on the identity screen, stamped on the character, a label for
// the main and off hands and the arm the main hand's thing is drawn in; never ambidextrous, right by default. The sim never
// reads it. What needs the page (the screen's choice, the labels, the baked sheets, two tabs) is check("handed").
const handedMod = await import("../src/handed.js");
const rigMod = await import("../src/figure/rig.js");
const wardrobeMod = await import("../src/figure/wardrobe.js");
check("handedness: right by default, left only when chosen; the helper, the save, the sync part, the join, and the figure's arms mirrored", () => {
  const H = handedMod;
  // The helper: never ambidextrous, right unless it says left.
  for (const v of [undefined, null, "", "both", "ambidextrous", "Left", 7]) assert(H.handedOf(v) === "right", `handedOf(${JSON.stringify(v)}) is ${H.handedOf(v)}`);
  assert(H.handedOf("left") === "left" && H.HANDED.join() === "right,left", "left, and the two choices");
  assert(H.handSideOf({ handed: "right" }, "main") === "right" && H.handSideOf({ handed: "right" }, "off") === "left", "a right-handed main hand is the right");
  assert(H.handSideOf({ handed: "left" }, "main") === "left" && H.handSideOf({ handed: "left" }, "off") === "right", "a left-handed main hand is the left");
  assert(H.handSideOf({}, "main") === "right" && H.handSideOf("left", "off") === "right", "a character with no field is right-handed; a handedness itself is read too");
  assert(H.handLabel({}, "main") === "Main hand (right)" && H.handLabel({}, "off") === "Off-hand (left)" && H.handLabel({ handed: "left" }, "main") === "Main hand (left)" && H.handLabel({ handed: "left" }, "off") === "Off-hand (right)", "the labels");
  // The world: a player is right-handed by default and left-handed when its identity says so, through the save, and in the players' sync part.
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  assert(S.player.handed === "right", `a world's first player is ${S.player.handed}`);
  const plain = gameMod.addPlayer(S.player.gx + 1, S.player.gy, {});
  assert(plain.handed === "right", "a second player with no identity's choice is right-handed");
  gameMod.removePlayer(plain.id);
  const hash0 = gameMod.hashText();
  gameMod.create({ json, rules: { zombieAggro: false }, handed: "left" });
  assert(S.player.handed === "left", "the identity's left hand did not reach the world's first player");
  assert(gameMod.hashText() === hash0, "handedness moved the world's determinism text (the sim never reads it)");
  const lefty = gameMod.addPlayer(S.player.gx + 1, S.player.gy, { handed: "left", name: "Lefty" });
  assert(lefty.handed === "left", "addPlayer's left hand");
  const parts0 = gameMod.syncParts().players;
  lefty.handed = "right";
  assert(gameMod.syncParts().players !== parts0, "handedness is not in the players' sync part");
  lefty.handed = "left";
  assert(gameMod.syncParts().players === parts0, "the sync part did not come back");
  const save = JSON.parse(JSON.stringify(gameMod.serialize()));
  assert(save.characters.players.every((p) => p.handed === "left"), `the save's players: ${save.characters.players.map((p) => p.handed).join()}`);
  gameMod.restore(save, json);
  assert(S.players.length === 2 && S.players.every((p) => p.handed === "left"), `restored: ${S.players.map((p) => p.handed).join()}`);
  // An old save's player, with no field, comes back right-handed.
  const old = JSON.parse(JSON.stringify(save));
  for (const p of old.characters.players) delete p.handed;
  gameMod.restore(old, json);
  assert(S.players.every((p) => p.handed === "right"), "an old save's players are not right-handed");
  // The join: the host keeps a guest's left hand and makes anything else right; the record changed shape, so PROTOCOL moved.
  assert(hostMod.clampIdentity({ name: "L", look: {}, handed: "left" }).handed === "left" && hostMod.clampIdentity({ name: "R", look: {}, handed: "both" }).handed === "right" && hostMod.clampIdentity({ name: "N", look: {} }).handed === "right", "clampIdentity's handedness");
  assert(netMod.PROTOCOL >= 16, `PROTOCOL is ${netMod.PROTOCOL}`); // 16 the handedness; a later step's bump keeps it
  assert(/const HEAVY = new Set\(\[[^\]]*"handed"/.test(fs.readFileSync(path.join(root, "src/net.js"), "utf8")), "handed is not a heavy field of the player's record (sent once, not each frame)");
  // The figure: a left-handed pose is the right-handed one with the arms turned round, the main arm the left, in body space (l negated).
  const M = (pt) => [-pt[0], pt[1], pt[2]];
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  const holdingSets = [{ main: true, off: false }, { main: true, off: true }, { main: true, off: false, mainPose: "present" }, { main: true, off: true, mainPose: "bow_rest" }, { main: false, off: false }];
  let compared = 0;
  for (const holding of holdingSets) {
    for (const [anim, style, frames] of [["idle", null, 2], ["attack", "one_handed", 4], ["attack", "bow", 4], ["attack", "throw", 4], ["attack_alt", "thrust", 4], ["attack_off", "one_handed", 4], ["present", null, 1], ["wave", null, 2], ["shove", null, 3], ["hurt", null, 2], ["carry_idle", null, 2]]) {
      for (let i = 0; i < frames; i++) {
        const R = rigMod.joints(rigMod.pose("player", anim, i, holding, style));
        const L = rigMod.joints(rigMod.pose("player", anim, i, holding, style, true));
        assert(near(L.handL, M(R.handR)) && near(L.handR, M(R.handL)) && near(L.elbowL, M(R.elbowR)) && near(L.elbowR, M(R.elbowL)), `${anim} ${i} (${JSON.stringify(holding)}): the left-handed arms are not the right-handed ones mirrored`);
        assert(near(L.footL, R.footL) && near(L.footR, R.footR) && near(L.head, R.head), `${anim} ${i}: the legs or the head moved`);
        compared++;
      }
    }
    // The walk: the arm swing goes with the legs (by side), so only the holding arm is mirrored; the swinging one keeps its side.
    for (let i = 0; i < 4; i++) {
      const R = rigMod.pose("player", "walk", i, holding);
      const L = rigMod.pose("player", "walk", i, holding, null, true);
      if (holding.main && !holding.mainPose) assert(L.armPitch[0] === R.armPitch[1] && L.armOut[0] === R.armOut[1], `walk ${i}: the left-handed main arm does not hold as the right-handed one does`);
      if (!holding.main && !holding.off) assert(L.armPitch.join() === R.armPitch.join(), `walk ${i}: an empty-handed walk changed with the hand`);
      if (holding.main && !holding.off && !holding.mainPose) assert(L.armPitch[1] === rigMod.pose("player", "walk", i, { main: false, off: false }).armPitch[1], `walk ${i}: the left-handed swinging arm is not the right arm's own swing`);
      assert(L.stride.join() === R.stride.join(), `walk ${i}: the stride moved`);
    }
  }
  // The dead are never left-handed; the default is the pose it always was.
  assert(JSON.stringify(rigMod.pose("zombie", "attack", 1, { main: false, off: false }, "zombie", true)) === JSON.stringify(rigMod.pose("zombie", "attack", 1, { main: false, off: false }, "zombie")), "a dead one's pose took the left hand");
  assert(JSON.stringify(rigMod.pose("player", "attack", 1, { main: true, off: true }, "one_handed", false)) === JSON.stringify(rigMod.pose("player", "attack", 1, { main: true, off: true }, "one_handed")), "the right-handed pose is not the pose as it was");
  // The sheet's key: a left-handed figure's differs; a right-handed one's is the key it always was (no new entry), and a villager's and the dead's never take it.
  const artOf = () => null;
  const ch = { kind: "player", look: { hairStyle: "short" }, worn: {}, hands: { main: { id: "sword" }, off: null } };
  const keyOf = (c) => wardrobeMod.specKey(wardrobeMod.characterSpec(wardrobeMod.characterInputs(c, artOf)));
  const kR = keyOf(ch);
  const kL = keyOf({ ...ch, handed: "left" });
  assert(kR !== kL && kL.endsWith(',"left"]') && keyOf({ ...ch, handed: "right" }) === kR && JSON.parse(kR).length === 11, `the keys: ${kR.slice(-30)} / ${kL.slice(-30)}`);
  assert(keyOf({ ...ch, kind: "villager", handed: "left" }) === keyOf({ ...ch, kind: "villager" }) && keyOf({ ...ch, kind: "zombie", handed: "left" }) === keyOf({ ...ch, kind: "zombie" }), "a villager's or the dead's key took the left hand");
  return `the helper and labels; right by default and through an old save; left through create, addPlayer, the save, the sync part, and the join's clamp; PROTOCOL 16 or later, handed heavy; ${compared} frames mirrored arm for arm, the legs and head kept; the walk; the sheet's key`;
});

const manaMod = await import("../src/mana.js");
const controllerMod = await import("../src/player-controller.js");
check("mana: the bar and its regeneration in the host's step alone; the Fireball's 20 refused before the draw and spent on the release, never on a cancel or a dry draw; a guest's prediction; the altar's Pray; the save, the sync part, the wire, the card", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  const last = () => said[said.length - 1] || "";
  try {
    const T = tuningMod.player;
    assert(T.mana === 100 && Math.abs(T.manaRegen - 0.667) < 1e-9 && tuningMod.potions.praySeconds === 3, `the levers: mana ${T.mana}, regen ${T.manaRegen}, pray ${tuningMod.potions.praySeconds}`);
    assert(me.mana === 100 && me.maxMana === 100 && me.manaFlash === 0, `a new player's bar: ${me.mana}/${me.maxMana}, flash ${me.manaFlash}`);
    // Regeneration: the host's step, a point every three seconds; never updatePlayer, which a guest's prediction runs; never past the top.
    me.mana = 50;
    playerMod.updatePlayer(me, 1);
    assert(me.mana === 50, `updatePlayer regenerated mana (a guest's prediction would): ${me.mana}`);
    for (let i = 0; i < 1800; i++) gameMod.step(1 / 60, null);
    assert(Math.abs(me.mana - (50 + 30 * T.manaRegen)) < 1e-6, `30 s of the host's step from 50: ${me.mana}`);
    me.mana = 99.9;
    for (let i = 0; i < 120; i++) gameMod.step(1 / 60, null);
    assert(me.mana === 100, `regeneration passed the top: ${me.mana}`);
    // The cost, on the spell in the data.
    me.hands.main = itemsMod.makeEntry("staff_of_fire");
    me.hands.off = itemsMod.makeEntry("book_of_fire");
    const L = archeryMod.launcherOf(me);
    const cost = itemsMod.getItem("book_of_fire").book.spell.mana;
    assert(L && L.kind === "spell" && cost === 20 && manaMod.costOf(L) === 20, `the Fireball's cost: ${cost}, the launcher's ${manaMod.costOf(L)}`);
    assert(manaMod.costOf({ kind: "bow", mana: 5 }) === 0 && manaMod.costOf(null) === 0, "a bow costs mana");
    // Refused before the draw: the line, the flash, no draw, nothing spent.
    me.recover = 0;
    me.mana = 19.9;
    said.length = 0;
    assert(archeryMod.beginDraw(me, L, "script") === false && !me.draw && me.mana === 19.9, `a cast the bar cannot pay for drew: draw ${!!me.draw}, mana ${me.mana}`);
    assert(last() === "Not enough mana." && me.manaFlash === manaMod.FLASH_SECONDS, `the refusal: "${last()}", flash ${me.manaFlash}`);
    manaMod.update(me, 1);
    assert(me.manaFlash === 0, `the flash did not run down in the host's step: ${me.manaFlash}`);
    // The host's own click through the controller: refused the same way.
    me.mana = 5;
    said.length = 0;
    controllerMod.controlPlayer(me, S.zombies, 1 / 60, { clicked: true, leftDown: true, aimAt: [me.gx + 4, me.gy] });
    assert(!me.draw && last() === "Not enough mana." && me.manaFlash > 0 && me.mana === 5, `the controller's click: draw ${!!me.draw}, "${last()}", flash ${me.manaFlash}`);
    // A guest's prediction: no draw and no line of its own (the host's comes back), but its own bar flashes at once.
    me.manaFlash = 0;
    said.length = 0;
    controllerMod.controlPlayer(me, S.zombies, 1 / 60, { clicked: true, leftDown: true, aimAt: [me.gx + 4, me.gy] }, true);
    assert(!me.draw && said.length === 0 && me.manaFlash === manaMod.FLASH_SECONDS && me.mana === 5, `the prediction: draw ${!!me.draw}, said ${said.join("/")}, flash ${me.manaFlash}`);
    me.manaFlash = 0;
    me.mana = 30;
    controllerMod.controlPlayer(me, S.zombies, 1 / 60, { clicked: true, leftDown: true, aimAt: [me.gx + 4, me.gy] }, true);
    assert(!me.draw && me.manaFlash === 0, `a prediction the bar can pay for flashed or drew: flash ${me.manaFlash}, draw ${!!me.draw}`);
    // Paid: nothing at the draw's start, nothing on a cancel, nothing on a dry release; the cost on a release that flies.
    assert(archeryMod.beginDraw(me, L, "script") === true && me.mana === 30, `the draw started with ${me.mana}`);
    archeryMod.cancelDraw(me);
    assert(me.mana === 30, `a cancelled draw spent mana: ${me.mana}`);
    archeryMod.beginDraw(me, L, "script");
    me.draw.c = archeryMod.tunables.minDraw / 2;
    assert(archeryMod.releaseDraw(me, { aimAt: [me.gx + 5, me.gy] }) === null && me.mana === 30, `a dry release spent mana: ${me.mana}`);
    archeryMod.beginDraw(me, L, "script");
    me.draw.c = 1;
    const flew = archeryMod.releaseDraw(me, { aimAt: [me.gx + 5, me.gy] });
    assert(flew && flew.projectile === "fireball" && me.mana === 10, `the release: ${flew ? flew.projectile : "nothing"}, mana ${me.mana}`);
    me.recover = 0;
    said.length = 0;
    assert(archeryMod.beginDraw(me, L, "script") === false && last() === "Not enough mana.", "the second cast at 10 was not refused");
    archeryMod.reset();
    me.hands.main = null;
    me.hands.off = null;
    // The altar's Pray: the chapel's altar, its menu's bar of praySeconds, the verb's `timed`, a guest's label, refused far and on another prop.
    const [bx, by, bw, bh] = json.bounds;
    for (let y = by; y < by + bh; y += 16) for (let x = bx; x < bx + bw; x += 16) mapMod.ensureAround(x, y, 0);
    const altar = [...mapMod.allProps()].find((p) => p.sprite === "altar");
    assert(altar && manaMod.isAltar(altar), "no altar in the valley");
    let stand = null;
    for (let r = 1; r <= 2 && !stand; r++) for (const [x, y] of altar.tiles) for (let dy = -r; dy <= r && !stand; dy++) for (let dx = -r; dx <= r && !stand; dx++) {
      const t = mapMod.tileAt(x + dx, y + dy);
      if (t && !t.prop && mapMod.isWalkableTile(x + dx, y + dy)) { me.gx = x + dx; me.gy = y + dy; if (verbsMod.get("pray").validate(worldMod.world, me, { prop: altar.id }) === true) stand = [x + dx, y + dy]; }
    }
    assert(stand, `nowhere to stand in reach of the altar at ${altar.tile}`);
    const finish = () => { for (let i = 0; i < 600 && me.action; i++) interactMod.updateAction(me, 0.1); };
    const onAltar = { kind: "prop", id: altar.id };
    const labels = interactMod.actionsForTarget(onAltar, me).map((a) => a.label);
    assert(labels.includes("Pray"), `the altar's menu: ${labels.join(", ")}`);
    me.mana = 0;
    me.stamina = 0;
    me.winded = true;
    said.length = 0;
    assert(interactMod.performByLabel(me, onAltar, "Pray") === true && me.action && me.action.action.kind === "pray" && me.action.action.duration === tuningMod.potions.praySeconds, "a guest's label did not start the bar of praySeconds");
    interactMod.updateAction(me, 1);
    assert(me.mana === 0 && me.stamina === 0, `the bars filled before the prayer's end: ${me.mana}, ${me.stamina}`);
    finish();
    assert(me.mana === 100 && me.stamina === me.maxStamina && !me.winded && said.includes(manaMod.PRAYED), `the prayer: mana ${me.mana}, stamina ${me.stamina}, winded ${me.winded}, "${said.join(" / ")}"`);
    me.mana = 3;
    const t1 = verbsMod.run("pray", worldMod.world, me, { prop: altar.id }, { timed: true });
    assert(t1.ok && t1.started && me.action && me.action.action.kind === "pray", `the verb's timed: ${t1.reason || ""}`);
    finish();
    assert(me.mana === 100, `the verb's bar did not fill mana: ${me.mana}`);
    me.gx = stand[0] + 8;
    const far = verbsMod.run("pray", worldMod.world, me, { prop: altar.id }, { timed: true });
    assert(!far.ok && /far/i.test(far.reason || ""), `prayed from eight tiles: ${far.reason}`);
    me.gx = stand[0];
    const other = [...mapMod.allProps()].find((p) => p.sprite !== "altar" && !manaMod.isAltar(p));
    const no = verbsMod.run("pray", worldMod.world, me, { prop: other.id });
    assert(!no.ok && no.reason === "There is no altar there.", `prayed at a ${other.sprite}: ${no.reason}`);
    // The save, the sync part, and the wire.
    me.mana = 42.5;
    const p0 = gameMod.syncParts().players;
    me.mana = 42.51;
    assert(gameMod.syncParts().players !== p0, "mana did not move the players' sync part");
    me.mana = 42.511;
    const p1 = gameMod.syncParts().players;
    me.mana = 42.512;
    assert(gameMod.syncParts().players === p1, "the sync part compared mana past two decimals (the wire's rounding)");
    me.mana = 42.5;
    const saved = JSON.parse(JSON.stringify(gameMod.serialize()));
    gameMod.restore(saved, json);
    const back = gameMod.state.player;
    assert(back.mana === 42.5 && back.maxMana === 100, `the save: ${back.mana}/${back.maxMana}`);
    const old = JSON.parse(JSON.stringify(saved));
    for (const p of old.characters.players) { delete p.mana; delete p.maxMana; delete p.manaFlash; }
    gameMod.restore(old, json);
    assert(gameMod.state.player.mana === 100 && gameMod.state.player.maxMana === 100, "a save from before mana did not come back full");
    const netSrc = fs.readFileSync(path.join(root, "src/net.js"), "utf8");
    assert(netMod.PROTOCOL >= 18 && /const HEAVY = new Set\(\[[^\]]*"maxMana"/.test(netSrc) && !/const HEAVY = new Set\(\[[^\]]*"mana"/.test(netSrc), `the wire: PROTOCOL ${netMod.PROTOCOL}; maxMana heavy, mana light`);
    // The card.
    const card = itemInfoMod.textOf(itemInfoMod.cardFor(itemsMod.makeEntry("book_of_fire")));
    assert(card.includes(`Costs ${cost} mana a cast, spent when it is released.`), `the book's card: ${card.join(" | ")}`);
    return `100 a bar, ${T.manaRegen} a second in the host's step alone; ${cost} a Fireball, refused at 19.9 and 10 with the line and the flash, spent once on the release and never on a cancel or a dry one; a guest's prediction flashes and draws nothing; Pray by a label and by the verb, ${tuningMod.potions.praySeconds} s, refused far and elsewhere; the save, an old save, the sync part to two decimals, PROTOCOL 18 or later; the card`;
  } finally {
    promptMod.setMessageSink(null);
  }
});

const settingsMod = await import("../src/settings.js");
check("unlimited mana (a dev rule beside Free building, Michael 2026-10-28): off by default and a registry rule; on, a cast is never refused and spends nothing and the bar reads full; off again, 'Not enough mana.'; a guest's prediction reads the same rule; the rule rides in the save and the world's rules, and an owner of a server world may set it", () => {
  
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  const last = () => said[said.length - 1] || "";
  try {
    const entry = settingsMod.REGISTRY.find((e) => e.key === "unlimitedMana");
    assert(entry && entry.group === "rules" && entry.label === "Unlimited mana" && entry.help && settingsMod.isSwitch(entry), "the registry's row");
    assert(settingsMod.REGISTRY.findIndex((e) => e.key === "freeBuilding") < settingsMod.REGISTRY.indexOf(entry), "Unlimited mana is not after Free building");
    assert(rulesImport.DEFAULTS.unlimitedMana === false && rulesImport.rules.unlimitedMana === false && !rulesImport.FIXED.includes("unlimitedMana"), "off by default, and changeable in play");
    assert(/RULE_KEYS = \[[^\]]*"unlimitedMana"/.test(fs.readFileSync(path.join(root, "server/relay.js"), "utf8")), "a server world's owner cannot set it");
    me.hands.main = itemsMod.makeEntry("staff_of_fire");
    me.hands.off = itemsMod.makeEntry("book_of_fire");
    const L = archeryMod.launcherOf(me);
    const cost = manaMod.costOf(L);
    assert(cost === 20, `the Fireball costs ${cost}`);
    // Off: refused at 0, as ever.
    me.recover = 0;
    me.mana = 0;
    said.length = 0;
    assert(archeryMod.beginDraw(me, L, "script") === false && last() === "Not enough mana.", "off: a cast at 0 was not refused");
    // On: the cast is paid at 0 and spends nothing; the bar reads full after the host's step.
    rulesImport.rules.unlimitedMana = true;
    me.recover = 0;
    me.mana = 0;
    said.length = 0;
    assert(manaMod.canPay(me, cost) && manaMod.spend(me, cost) && me.mana === 0, `on: canPay/spend at 0 (mana ${me.mana})`);
    assert(archeryMod.beginDraw(me, L, "script") === true && me.mana === 0 && !said.includes("Not enough mana."), `on: the draw at 0 mana: said ${said.join("/")}`);
    me.draw.c = 1;
    const flew = archeryMod.releaseDraw(me, { aimAt: [me.gx + 5, me.gy] });
    assert(flew && flew.projectile === "fireball" && me.mana === 0, `on: the release spent mana: ${me.mana}`);
    for (let i = 0; i < 3; i++) gameMod.step(1 / 60, null);
    assert(me.mana === me.maxMana, `on: the bar reads ${me.mana}, not full`);
    // A guest's prediction (controller `predict`) flashes nothing while it is on, and flashes at 0 when it is off.
    me.recover = 0;
    me.mana = 0;
    me.manaFlash = 0;
    controllerMod.controlPlayer(me, S.zombies, 1 / 60, { clicked: true, leftDown: true, aimAt: [me.gx + 4, me.gy] }, true);
    assert(me.manaFlash === 0, `on: a guest's prediction flashed the bar (${me.manaFlash})`);
    // The rule rides in the save, and a restored world has it.
    const saved = JSON.parse(JSON.stringify(gameMod.serialize()));
    assert(saved.rules && saved.rules.unlimitedMana === true, "the save does not carry the rule");
    rulesImport.rules.unlimitedMana = false;
    gameMod.restore(saved, json);
    assert(rulesImport.rules.unlimitedMana === true, "the restored world lost the rule");
    // Off again: refused, the line, the flash; and a save from before the rule restores it off.
    rulesImport.rules.unlimitedMana = false;
    const me2 = gameMod.state.player;
    me2.hands.main = itemsMod.makeEntry("staff_of_fire");
    me2.hands.off = itemsMod.makeEntry("book_of_fire");
    me2.recover = 0;
    me2.mana = 0;
    said.length = 0;
    assert(archeryMod.beginDraw(me2, archeryMod.launcherOf(me2), "script") === false && last() === "Not enough mana." && me2.manaFlash > 0, "off again: the cast at 0 was not refused");
    const old = JSON.parse(JSON.stringify(saved));
    delete old.rules.unlimitedMana;
    gameMod.restore(old, json);
    assert(rulesImport.rules.unlimitedMana === false, "a save from before the rule came back with it on");
    return "off by default; on at 0 mana the cast is paid, nothing spent, the bar full, a guest's prediction quiet; off again refused; in the save and the owner's keys";
  } finally {
    rulesImport.rules.unlimitedMana = false;
    archeryMod.reset();
    promptMod.setMessageSink(null);
  }
});

// ---- the maps the game ships and the map picker (Michael, 2026-10-28) ----
const mapsMod = await import("../src/maps.js");
check("the maps list builds from the data: data/maps.json names every map file and only those, each by its file's own name, the plays first and the test maps after; an address for a map change keeps the page's test switches and clears the old hand-off", () => {
  const list = read("data/maps.json");
  const files = fs.readdirSync(path.join(root, "data/maps")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  assert(Object.keys(list).sort().join() === files.join(), `listed ${Object.keys(list)}, on disk ${files}`);
  for (const id of files) assert(list[id].name === read(`data/maps/${id}.json`).name && ["play", "test"].includes(list[id].kind) && list[id].blurb, `${id}'s entry`);
  mapsMod.load(list);
  const all = mapsMod.all();
  assert(all[0].id === "valley" && all[1].id === "flat" && all.slice(0, 2).every((m) => m.kind === "play") && all.slice(2).map((m) => m.id).join() === "square,staging", `the order: ${all.map((m) => m.id)}`);
  assert(mapsMod.nameOf("flat") === "Flat grass" && mapsMod.nameOf("valley") === "The valley" && mapsMod.nameOf("gone") === "gone" && mapsMod.exists("staging") && !mapsMod.exists("../x") && !mapsMod.exists("gone"), "names and existence");
  const here = { pathname: "/index.html", search: "?nosave&mute&relay=none&map=valley&world=old&jumped=1", hash: "" };
  const to = mapsMod.addressFor(here, "flat", { world: "w1" });
  const q = new URLSearchParams(to.slice(to.indexOf("?")));
  assert(to.startsWith("/index.html?") && q.get("map") === "flat" && q.get("world") === "w1" && q.has("nosave") && q.has("mute") && q.get("relay") === "none" && !q.has("jumped"), `the address: ${to}`);
  const again = new URLSearchParams(mapsMod.addressFor(here, "square").split("?")[1]);
  assert(again.get("map") === "square" && !again.has("world"), "an old world mark survived a change with none");
  return `${all.length} maps: ${all.map((m) => m.id).join(", ")}; ${to}`;
});
check("the flat map is all plain grass: a generated file with nothing in it but a dev chest and the guide at the spawn, no zones, scatter, wild, forage, resources, or dead; the grown ground round the spawn and far from it is grass with no prop; a world on it saves small and comes back", () => {
  const j = read("data/maps/flat.json");
  assert(j.name === "Flat grass" && j.floor === "floor_grass" && j.bounds[2] >= 256 && j.bounds[3] >= 256, `${j.name} ${j.bounds}`);
  assert(!j.features.length && !j.sets.length && !j.scatter.length && !Object.keys(j.zones).length && !j.wild && !j.forage && !j.resources && !(j.reserve || []).length && !j.zombies.length && !(j.animals || []).length, "the file holds more than grass");
  assert(j.props.length === 1 && j.props[0].sprite === "dev_chest" && j.villagers.length === 1 && j.villagers[0].guide === true, "the file's props or villagers");
  const [sx, sy] = j.spawn;
  assert(sx === j.bounds[2] / 2 && sy === j.bounds[3] / 2 && Math.hypot(j.villagers[0].tile[0] - sx, j.villagers[0].tile[1] - sy) <= 3 && Math.abs(j.props[0].tile[0] - sx) <= 3, "the spawn, the guide, and the chest are not together in the middle");
  gameMod.create({ json: j, rules: { zombieAggro: false } });
  const S = gameMod.state;
  assert(S.zombies.length === 0 && S.villagers.length === 1 && S.info.name === "Flat grass", `${S.zombies.length} dead, ${S.villagers.length} villagers`);
  const props = [...mapMod.allProps()];
  assert(props.length === 1 && props[0].sprite === "dev_chest", `props: ${props.map((p) => p.sprite)}`);
  const M = mapMod;
  M.ensureAround(sx, sy, 6);
  M.ensureAround(sx + 200, sy - 200, 2);
  M.ensureAround(2, 2, 2); // the corner of the bounds
  M.ensureAround(j.bounds[2] + 80, j.bounds[3] + 80, 2); // and beyond them
  let tiles = 0;
  const bad = [];
  for (const [cx, cy] of [[sx, sy], [sx + 200, sy - 200], [2, 2], [j.bounds[2] + 80, j.bounds[3] + 80]]) {
    for (let y = cy - 20; y <= cy + 20; y++) for (let x = cx - 20; x <= cx + 20; x++) {
      const t = M.peekTile(x, y);
      tiles++;
      if (!t || t.floor !== "floor_grass" || (t.prop && t.prop.sprite !== "dev_chest") || t.n || t.w) bad.push(`${x},${y}`);
    }
  }
  assert(!bad.length, `not plain grass: ${bad.slice(0, 5)}`);
  assert(M.isWalkableTile(sx, sy), "the spawn is not walkable");
  const text = JSON.stringify(gameMod.serialize());
  const back = JSON.parse(text);
  gameMod.restore(back, j);
  assert(gameMod.state.players.length === 1 && gameMod.state.villagers.length === 1, "the restored flat world");
  return `${tiles} tiles read at the spawn, 200 tiles off, the corner, and 80 beyond the bounds: all grass; ${j.bounds[2]} by ${j.bounds[3]} tiles; a world with ${M.chunkCount()} chunks saves in ${(text.length / 1024).toFixed(0)} KB`;
});
check("a chunk record from before the pink's rename (floor_nospawn) comes back as floor_randomspawn, drawn and walked, never as nothing", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const M = mapMod;
  const C = M.CHUNK;
  const X = 40 * C + 3;
  const Y = 40 * C + 3;
  M.ensureAround(X, Y, 1);
  const c = M.getChunk(Math.floor(X / C), Math.floor(Y / C), false, 0);
  const rec = JSON.parse(JSON.stringify(M.serializeChunk(c)));
  assert(rec.floors.length >= 1, "no floors in the record");
  rec.floors = [["floor_nospawn", 5], ...rec.floors.map(([f, n]) => [f, n]).slice(0, 1).map(([f, n]) => [f, n - 5 > 0 ? n - 5 : n])];
  const total = rec.floors.reduce((s, [, n]) => s + n, 0);
  if (total !== C * C) rec.floors = [["floor_nospawn", 5], ["floor_grass", C * C - 5]];
  M.installChunk(rec);
  const t = M.peekTile(Math.floor(X / C) * C + 2, Math.floor(Y / C) * C);
  assert(t.floor === "floor_randomspawn" && M.isWalkableTile(Math.floor(X / C) * C + 2, Math.floor(Y / C) * C), `the old id came back as ${t.floor}`);
  const ground = read("data/ground.json");
  assert(ground.floors.floor_randomspawn === "laid" && !("floor_nospawn" in ground.floors), "ground.json names the new id only");
  return "a stored floor_nospawn is a floor_randomspawn on install (map.js RENAMED_FLOORS), walkable";
});

// Potions, step 2 (docs/47 sections 2 to 4, 8 and 9, #481): the vials made (one clay into two unfired vials at the workbench, one fired into a
// clay vial at an oven), the witch's cauldron on the map (carried by no one, not a village station, its recipes open with Village stations off,
// a fire that burns logs and cooks nothing), your own made at the anvil with a smith's hammer carried, set down by the host's call and a
// guest's command, picked up only out and empty; the five brews over the lit fire alone, each taking a draught of clean water from carried
// skins (refused without it, "Potions need clean water.", and never from a tainted skin), twenty seconds a potion; the three potions drunk by
// a belt key, the bag's menu, the slot's menu, a double-click, and a guest's commands, ten seconds between, the vial back in its place, else
// the bag, else the feet with its line; the stamina buff in the row, run down by the host's step; the mana potion against `player.mana`
// (#480's bar) and refused while there is none; the poisons never drunk, their line in every slot; the cards; the save and the sync part.
// (The page, the art, the cards read over the bag, and two tabs are check("potions")'s, in the pane.)
const potionsMod = await import("../src/potions.js");
check("potions: the vials, the cauldron (the witch's and your own), the brews with clean water, drinking every way, the buff, the poisons, the cards, the save and the sync part", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false, survival: true, villageStations: false } });
  const S = gameMod.state;
  const me = S.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  const last = () => said[said.length - 1] || "";
  const P = tuningMod.potions;
  try {
    const mk = (id, n = 1, props = {}) => itemsMod.makeEntry(id, n, props);
    const card = (id, e = mk(id)) => itemInfoMod.textOf(itemInfoMod.cardFor(e));
    const has = (id, text) => card(id).includes(text);
    const bag = inventoryMod.bagOf(me);
    const clear = () => { bag.items.length = 0; const b = inventoryMod.beltOf(me); if (b) b.fill(null); me.hands.main = null; me.hands.off = null; };
    // The levers.
    assert(P.heal === 40 && P.mana === 50 && P.staminaMult === 2 && P.staminaSeconds === 30 && P.between === 10, `tuning.potions: ${JSON.stringify(P)}`);
    // The items: stacks, the belt, the cards from the data.
    for (const id of ["healing_potion", "stamina_potion", "mana_potion", "poison", "strong_poison"]) assert(itemsMod.getItem(id).stack === 5 && itemsMod.getItem(id).belt === true, `${id}: stack ${itemsMod.getItem(id).stack}`);
    assert(itemsMod.getItem("clay_vial").stack === 10 && itemsMod.getItem("unfired_vial").stack === 10, "the vials stack 10");
    assert(has("healing_potion", "Drink: heals 40 at once.") && has("healing_potion", "10 seconds between one potion and the next; the empty vial is kept.") && has("healing_potion", "Made at the cauldron.") && itemInfoMod.cardFor(mk("healing_potion")).kind === "Potion", card("healing_potion").join(" | "));
    assert(has("stamina_potion", "Drink: fills your stamina, and it comes back twice as fast for 30 seconds.") && has("mana_potion", "Drink: restores 50 mana at once."), `${card("stamina_potion").join(" | ")} || ${card("mana_potion").join(" | ")}`);
    assert(has("poison", "Use on a blade or arrows: coat.") && card("poison").filter((l) => /^Use/.test(l)).length === 1 && has("poison", "Ordinary poison: never drunk.") && has("strong_poison", "Strong poison: never drunk.") && !card("poison").some((l) => /^Drink/.test(l)) && itemInfoMod.cardFor(mk("poison")).kind === "Poison", `${card("poison").join(" | ")} || ${card("strong_poison").join(" | ")}`);
    const useSeg = itemInfoMod.cardFor(mk("poison")).lines.flat().find((s) => s.t === "Use");
    assert(useSeg && useSeg.k === "use", "the poison's Use is not its own gold segment");
    assert(has("unfired_vial", "Made at the workbench.") && has("unfired_vial", "Goes into: clay vial.") && has("clay_vial", "Made at the oven.") && card("clay_vial").some((l) => /^Goes into: healing potion, stamina potion, mana potion, poison and more\.$/.test(l)), `${card("unfired_vial").join(" | ")} || ${card("clay_vial").join(" | ")}`);
    assert(has("cauldron", "Place: set down on the floor.") && has("cauldron", "Set down, it is a station: 5 recipes, over a fire of logs; picked up again while out and empty.") && has("cauldron", "Made at the anvil."), card("cauldron").join(" | "));
    assert(itemsMod.countName("poison", 1) === "a vial of poison" && itemsMod.countName("strong_poison", 2) === "2 vials of strong poison" && stationsMod.doneLine({ id: "healing_potion", count: 1 }) === "Made a healing potion.", `${itemsMod.countName("poison", 1)}; ${itemsMod.countName("strong_poison", 2)}`);
    // The witch's cauldron: on the map, carried by no one, no village station, a fire that burns and cooks nothing, its rows open with Village stations off.
    const witch = mapMod.propById("cauldron_witch");
    assert(witch && witch.sprite === "cauldron" && witch.fire && witch.fire.burns && !witch.fire.cooks && !witch.fire.lit && witch.fire.maxFuel === 3 && witch.fire.hoursPerUnit === 2, `the witch's cauldron: ${JSON.stringify(witch && witch.fire)}`);
    assert(!placementMod.canCarry(witch) && !getDef("cauldron").villageStation && stationsMod.stationOf(witch).join(",") === "cauldron", `carry ${placementMod.canCarry(witch)}, stations ${stationsMod.stationOf(witch)}`);
    assert(stationsMod.recipesFor("cauldron").map((r) => r.id).join(",") === "healing_potion,stamina_potion,mana_potion,poison,strong_poison", `the cauldron's rows with Village stations off: ${stationsMod.recipesFor("cauldron").map((r) => r.id)}`);
    assert(Math.abs(witch.tile[0] - 80) <= 3 && witch.tile[1] >= 17 && witch.tile[1] <= 21, `the witch's cauldron at ${witch.tile} (the lane to the mere ends at 80,18)`);
    // Stand beside it.
    const standBy = (prop) => {
      const at = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [prop.tile[0] + dx, prop.tile[1] + dy]).find(([x, y]) => mapMod.isWalkableTile(x, y) && !mapMod.tileAt(x, y).prop);
      me.gx = at[0];
      me.gy = at[1];
      mapMod.ensureAround(me.gx, me.gy, 2);
    };
    mapMod.ensureAround(witch.tile[0], witch.tile[1], 2);
    standBy(witch);
    const labels = (prop) => interactMod.actionsForTarget({ kind: "prop", id: prop.id }, me).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}`);
    assert(labels(witch).includes("Use the cauldron") && !labels(witch).some((l) => /^Pick up|^Take apart|^Carry|^Boil|^Cook/.test(l)) && labels(witch).some((l) => /^Light the cauldron/.test(l)), `the witch's cauldron's menu: ${labels(witch).join(", ")}`);
    // A brew: the fire, the water, the ingredients, twenty seconds, the potion in its output.
    clear();
    me.hp = 50;
    // Into the bag; a stackable goes in as a new entry of the grid's own (grid.insert merges and makes), so the entry in the bag is returned.
    const give = (id, n = 1, props = {}) => {
      if (itemsMod.getItem(id).stack) { const before = new Set(bag.items); gridMod.add(bag, id, n, props); return bag.items.find((e) => e.id === id && !before.has(e)) || bag.items.filter((e) => e.id === id).pop(); }
      const e = mk(id, n, props);
      inventoryMod.stow(me, e);
      return e;
    };
    for (const [id, n] of [["yarrow", 2], ["sage", 1], ["clay_vial", 1]]) give(id, n);
    const tainted = give("waterskin", 1, { fill: 100 });
    const heal = stationsMod.recipe("healing_potion");
    assert(heal.water === 10 && heal.seconds === 20 && heal.fire === true && heal.out.count === 1, JSON.stringify(heal));
    assert(stationsMod.canMake(me, witch, heal) === "The fire is out.", `out: ${stationsMod.canMake(me, witch, heal)}`);
    give("log", 2);
    give("tinderbox", 1);
    const light = interactMod.actionsForTarget({ kind: "prop", id: witch.id }, me).find((a) => /^Light the cauldron/.test(a.label));
    interactMod.performByLabel(me, { kind: "prop", id: witch.id }, light.label);
    assert(witch.fire.lit && witch.fire.fuel === 1, `lit by its menu with a flame and a log: ${JSON.stringify(witch.fire)}`);
    assert(stationsMod.canMake(me, witch, heal) === stationsMod.NO_WATER && stationsMod.NO_WATER === "Potions need clean water.", `a tainted skin only: ${stationsMod.canMake(me, witch, heal)}`);
    const r0 = verbsMod.run("craft", worldMod.world, me, { prop: witch.id }, { recipe: "healing_potion" });
    assert(!r0.ok && r0.reason === "Potions need clean water.", `the craft verb with no clean water: ${JSON.stringify(r0)}`);
    tainted.fill = 100;
    const clean = give("waterskin", 1, { fill: 15, clean: true });
    const cleanBelt = mk("waterskin", 1, { fill: 4, clean: true });
    inventoryMod.beltOf(me)[2] = cleanBelt;
    assert(stationsMod.waterHave(me) === 19, `clean water carried: ${stationsMod.waterHave(me)}`);
    const r1 = verbsMod.run("craft", worldMod.world, me, { prop: witch.id }, { recipe: "healing_potion" });
    assert(r1.ok && cleanBelt.fill === 0 && clean.fill === 9 && tainted.fill === 100, `the draught from the clean skins, emptiest first, never the tainted one: ${JSON.stringify(r1)} belt ${cleanBelt.fill}, bag ${clean.fill}, tainted ${tainted.fill}`);
    assert(inventoryMod.countAll(me, "yarrow") === 0 && inventoryMod.countAll(me, "sage") === 0 && inventoryMod.countAll(me, "clay_vial") === 0, "the ingredients were not taken");
    for (let i = 0; i < 60 * 10; i++) stationsMod.update(1 / 60);
    mapMod.setFireLit(witch, false);
    for (let i = 0; i < 60 * 30; i++) stationsMod.update(1 / 60);
    assert(witch.queue && witch.queue.length === 1 && !(witch.output && witch.output.items.length), "the brew went on with the fire out");
    interactMod.performByLabel(me, { kind: "prop", id: witch.id }, interactMod.actionsForTarget({ kind: "prop", id: witch.id }, me).find((a) => /^Light the cauldron/.test(a.label)).label); // lit again by its menu, a second log
    assert(witch.fire.lit, "the cauldron was not lit again");
    for (let i = 0; i < 60 * 11; i++) stationsMod.update(1 / 60);
    const brewed = witch.output && witch.output.items.find((e) => e.id === "healing_potion");
    assert(brewed && brewed.count === 1 && !(witch.queue && witch.queue.length), `twenty seconds of a lit fire made one: ${JSON.stringify(witch.output && witch.output.items)}`);
    // The vials: the workbench's row and the oven's.
    const uv = stationsMod.recipe("unfired_vial");
    const cv = stationsMod.recipe("clay_vial");
    assert(uv.station === "workbench" && uv.in[0].id === "clay" && uv.in[0].count === 1 && uv.out.count === 2 && cv.station === "oven" && cv.fire && cv.in[0].id === "unfired_vial" && cv.out.id === "clay_vial", `${JSON.stringify(uv)} ${JSON.stringify(cv)}`);
    // Drinking: the utility slot's key, the vial back in its slot; ten seconds between, refused with the line. (From step 4, #483: a main or
    // an off-hand slot's key draws a potion into that hand instead of drinking it, check("splash")'s.)
    clear();
    const belt = inventoryMod.beltOf(me);
    belt[2] = mk("healing_potion");
    me.hp = 50;
    loopMod.setSimTime(1000);
    me.potionAt = null;
    assert(interactMod.beltPress(me, 2) === "drunk" && me.hp === 90 && me.potionAt === 1000 && belt[2] && belt[2].id === "clay_vial", `the utility slot's key: ${me.hp}, ${belt[2] && belt[2].id}`);
    belt[2] = mk("healing_potion");
    loopMod.setSimTime(1009.9);
    assert(interactMod.beltPress(me, 2) === "refused" && last() === "You can't drink another potion yet." && me.hp === 90 && belt[2].id === "healing_potion", `within ten seconds: ${last()}`);
    loopMod.setSimTime(1010);
    me.hp = 30;
    assert(interactMod.beltPress(me, 2) === "drunk" && me.hp === 70 && belt[2].id === "clay_vial", `the utility slot's key after ten seconds: ${me.hp}`);
    // Its card, on the utility slot, says so.
    const leather = mk("good_belt");
    const wasBelt = me.worn.waist;
    me.worn.waist = leather;
    const lb = inventoryMod.beltOf(me);
    lb[2] = mk("healing_potion");
    assert(itemInfoMod.textOf(itemInfoMod.cardFor(lb[2], { beltRole: "utility" }))[2] === "From the utility slot: drunk.", itemInfoMod.textOf(itemInfoMod.cardFor(lb[2], { beltRole: "utility" })).join(" | "));
    me.worn.waist = wasBelt;
    // The slot's menu and a double-click on it: the utility slot's still, since a main or an off-hand slot's now reads Equip (step 4, check("splash")'s).
    belt[2] = mk("stamina_potion");
    loopMod.setSimTime(3000);
    me.stamina = 5;
    const menu = interactMod.slotMenu(me, "belt:2").map((m) => m.label);
    assert(menu.includes("Drink") && !menu.some((l) => l.startsWith("Equip")), `the slot's menu: ${menu.join(", ")}`);
    const acts = invActionsMod.createInventoryActions(() => me);
    assert(acts.useSlot("belt:2") === true && me.stamina === me.maxStamina && potionsMod.staminaBuffed(me) && me.buffs.stamina.left === 30 && belt[2].id === "clay_vial", `the double-click on the slot: ${me.stamina}, ${JSON.stringify(me.buffs)}`);
    // The buff: regeneration doubled, in the row in gold, run down by the host's step.
    const base = (() => { const b = me.buffs; me.buffs = null; const k = playerMod.staminaRegenMult(me); me.buffs = b; return k; })();
    assert(playerMod.staminaRegenMult(me) === base * 2, `regeneration ${playerMod.staminaRegenMult(me)} against ${base}`);
    const row = debuffsMod.activeDebuffs(me).find((d) => d.id === "stamina");
    assert(row && row.buff === true && row.time === "30s" && debuffsMod.cardOf(row).kind === "Buff" && /twice as fast/.test(debuffsMod.cardOf(row).lines.flat().map((s) => s.t).join(" ")), `the row: ${JSON.stringify(row)}`);
    const parts0 = gameMod.syncParts();
    for (let i = 0; i < 60 * 10; i++) gameMod.step(1 / 60, null);
    assert(me.buffs && Math.abs(me.buffs.stamina.left - 20) < 0.05 && gameMod.syncParts().players !== parts0.players, `ten seconds later: ${JSON.stringify(me.buffs)}`);
    for (let i = 0; i < 60 * 21; i++) gameMod.step(1 / 60, null);
    assert(me.buffs === null && !potionsMod.staminaBuffed(me) && !debuffsMod.activeDebuffs(me).some((d) => d.id === "stamina"), `after thirty seconds: ${JSON.stringify(me.buffs)}`);
    // The bag: its menu's Drink and a double-click, the vial back in the cell; from a stack, the vial into the bag; a full bag, the feet.
    clear();
    const one = give("healing_potion", 1);
    const [cx, cy] = [one.x, one.y];
    loopMod.setSimTime(4000);
    me.hp = 20;
    interactMod.itemMenu(me, one, bag, null).find((m) => m.label === "Drink").onSelect();
    const v1 = bag.items.find((e) => e.id === "clay_vial");
    assert(me.hp === 60 && !bag.items.includes(one) && v1 && v1.x === cx && v1.y === cy, `the bag's Drink: hp ${me.hp}, the vial at ${v1 && [v1.x, v1.y]} (the potion's ${[cx, cy]})`);
    const stack = give("healing_potion", 3);
    loopMod.setSimTime(4020);
    assert(acts.use(stack, bag) === true && stack.count === 2 && inventoryMod.countAll(me, "clay_vial") === 2 && bag.items.filter((e) => e.id === "clay_vial").length === 1, `a double-click on a stack: ${stack.count} left, ${inventoryMod.countAll(me, "clay_vial")} vials`);
    // A guest's two commands (the double-click and the menu, by uid), run here as the host runs them.
    loopMod.setSimTime(4040);
    me.hp = 10;
    invActionsMod.performItemCommand(me, { op: "dbl", uid: stack.uid, src: { kind: "bag", bag: { mine: true } } });
    loopMod.setSimTime(4060);
    invActionsMod.performItemCommand(me, { op: "menu", label: "Drink", uid: stack.uid, src: { kind: "bag", bag: { mine: true } } });
    assert(me.hp === 90 && !bag.items.includes(stack) && inventoryMod.countAll(me, "clay_vial") === 4, `a guest's dbl and menu commands: hp ${me.hp}, vials ${inventoryMod.countAll(me, "clay_vial")}`);
    // A full bag: the last of a stack leaves its cell to its vial; a stack's vial with no room goes to the feet, with its line.
    clear();
    const full = give("healing_potion", 2);
    while (gridMod.add(bag, "stone", 1) === 1);
    loopMod.setSimTime(5000);
    const floor0 = (mapMod.tileAt(Math.round(me.gx), Math.round(me.gy)).items || []).filter((e) => e.id === "clay_vial").length;
    potionsMod.drinkFrom(me, full, { kind: "bag", bag });
    const floor1 = (mapMod.tileAt(Math.round(me.gx), Math.round(me.gy)).items || []).filter((e) => e.id === "clay_vial").length;
    assert(full.count === 1 && floor1 === floor0 + 1 && said.includes("Your bag is full: the vial is at your feet."), `a full bag: ${floor0} to ${floor1} vials at the feet; "${last()}"`);
    loopMod.setSimTime(5020);
    potionsMod.drinkFrom(me, full, { kind: "bag", bag });
    assert(!bag.items.includes(full) && bag.items.some((e) => e.id === "clay_vial" && e.x === full.x && e.y === full.y), "the last of a stack's vial took its cell in a full bag");
    // Mana: 50 on the bar of #480 (`player.mana`), up to the player's own most (`maxMana`).
    clear();
    const mana = give("mana_potion", 1);
    const mana0 = me.mana;
    loopMod.setSimTime(6000);
    me.mana = 30;
    assert(potionsMod.drinkFrom(me, mana, { kind: "bag", bag }) && me.mana === 80, `mana from 30: ${me.mana}`);
    loopMod.setSimTime(6020);
    const mana2 = give("mana_potion", 1);
    me.mana = me.maxMana - 10;
    potionsMod.drinkFrom(me, mana2, { kind: "bag", bag });
    assert(me.mana === me.maxMana && me.maxMana === tuningMod.player.mana, `mana capped: ${me.mana} of ${me.maxMana}`);
    me.mana = mana0;
    // The poisons: never drunk, the utility slot's key and card say so (step 4, #483: a main or an off-hand slot's key now draws one into
    // that hand instead, check("splash")'s), no Drink in a menu.
    clear();
    belt[2] = mk("poison");
    const pw = "Poison isn't for drinking. Use it on a blade or on arrows.";
    said.length = 0;
    assert(interactMod.beltPress(me, 2) === "none" && last() === pw && belt[2].id === "poison", `the poison's key: ${last()}`);
    said.length = 0;
    belt[2] = mk("strong_poison");
    assert(interactMod.beltPress(me, 2) === "none" && last() === pw && belt[2].id === "strong_poison", `the strong poison's key: ${last()}`);
    const pz = give("poison", 1);
    assert(!interactMod.itemMenu(me, pz, bag, null).some((m) => m.label.startsWith("Drink")) && !interactMod.slotMenu(me, "belt:2").some((m) => m.label.startsWith("Drink")), "a poison has a Drink");
    said.length = 0;
    assert(acts.use(pz, bag) === true && last() === pw && bag.items.includes(pz), `the poison's double-click: "${last()}"`);
    const pcard = itemInfoMod.textOf(itemInfoMod.cardFor(belt[2], { beltRole: "utility" }));
    assert(pcard[2] === `From the utility slot: stored. ${pw} Its menu equips it.` && pcard.filter((l) => /on a blade or arrows/.test(l)).length === 1 && pcard.filter((l) => /never drunk/.test(l)).length === 1, `the poison's card on a slot says Use and never drunk once: ${pcard.join(" | ")}`);
    // A double-click on a potion in a chest's grid drinks nothing (only your own bag, belt, and hands); drinkFrom refuses a place that does not hold it.
    const chestBag = inventoryMod.createBag(3, 2, "chest");
    const inChest = mk("healing_potion");
    gridMod.insert(chestBag, inChest);
    const inC = chestBag.items[0];
    loopMod.setSimTime(7000);
    me.hp = 20;
    assert(acts.use(inC, chestBag) === false && me.hp === 20 && !potionsMod.drinkFrom(me, inC, { kind: "bag", bag: chestBag }) && !potionsMod.drinkFrom(me, inC, { kind: "belt", index: 0 }) && me.hp === 20 && inC.count === 1, `a potion in a chest was drunk: hp ${me.hp}`);
    // Your own cauldron: made at the anvil with a smith's hammer carried (into the output, an item), set down from the bag, picked up out and empty.
    clear();
    const anvil = [...mapMod.allProps()].find((p) => p.sprite === "anvil");
    mapMod.ensureAround(anvil.tile[0], anvil.tile[1], 2);
    standBy(anvil);
    const cr = stationsMod.recipe("cauldron");
    assert(cr && cr.station === "anvil" && !cr.rule && cr.uses === "smith" && cr.in.length === 1 && cr.in[0].id === "iron_bar" && cr.in[0].count === 3 && cr.out.id === "cauldron", JSON.stringify(cr));
    give("iron_bar", 3);
    assert(stationsMod.canMake(me, anvil, cr) === "You need a smith's hammer.", `no hammer: ${stationsMod.canMake(me, anvil, cr)}`);
    give("hammer", 1);
    assert(verbsMod.run("craft", worldMod.world, me, { prop: anvil.id }, { recipe: "cauldron" }).ok, "the anvil would not make it with a hammer in the bag");
    for (let i = 0; i < 60 * (cr.seconds + 1); i++) stationsMod.update(1 / 60);
    const made = anvil.output.items.find((e) => e.id === "cauldron");
    assert(made, "no Cauldron item in the anvil's output");
    gridMod.remove(anvil.output, made);
    assert(gridMod.insert(bag, made), "the Cauldron would not go in the bag");
    let spot = null;
    for (let r = 1; r < 30 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (const dy of [-r, r]) {
      const x = Math.round(me.gx) + dx;
      const y = Math.round(me.gy) + dy;
      if (!spot && !setdownMod.standProblem("ground", x, y) && !setdownMod.standProblem("ground", x, y + 1) && mapMod.isWalkableTile(x, y + 1)) spot = [x, y];
    }
    assert(spot, "no floor near the anvil");
    me.gx = spot[0];
    me.gy = spot[1] + 1;
    const uid = bag.items.find((e) => e.id === "cauldron").uid;
    assert(setdownMod.place(me, uid, spot[0], spot[1]), `set down: ${last()}`);
    const own = mapMod.tileAt(spot[0], spot[1]).prop;
    assert(own && own.sprite === "cauldron" && own.made && !own.fire.lit && own.fire.fuel === 0 && !bag.items.some((e) => e.id === "cauldron"), `your cauldron: ${own && own.sprite}`);
    assert(stationsMod.stationOf(own).join(",") === "cauldron" && labels(own).includes("Use the cauldron") && labels(own).includes("Pick up cauldron"), `its menu: ${labels(own).join(", ")}`);
    give("log", 1);
    give("tinderbox", 1);
    interactMod.performByLabel(me, { kind: "prop", id: own.id }, interactMod.actionsForTarget({ kind: "prop", id: own.id }, me).find((a) => /^Light the cauldron/.test(a.label)).label);
    assert(own.fire.lit && setdownMod.pickUpProblem(own) === "Its fire is still burning; let it burn down." && labels(own).includes("Pick up cauldron (its fire is still burning; let it burn down) [off]"), `lit: ${labels(own).join(", ")}`);
    mapMod.setFireLit(own, false);
    own.fire.fuel = 0;
    own.queue = [{ recipe: "healing_potion", left: 5, count: 1, by: me.id }];
    assert(setdownMod.pickUpProblem(own) === "It is still making something.", setdownMod.pickUpProblem(own));
    own.queue = [];
    stationsMod.outputOf(own).items.push(mk("healing_potion", 1, { x: 0, y: 0 }));
    assert(setdownMod.pickUpProblem(own) === "Empty it first.", setdownMod.pickUpProblem(own));
    own.output.items.length = 0;
    assert(setdownMod.pickUp(me, own) && !mapMod.propById(own.id) && bag.items.some((e) => e.id === "cauldron"), `picked up: ${last()}`);
    // A guest's set-down command (placement.performPlacement's `setdown`, by the entry's uid): the same rule.
    const uid2 = bag.items.find((e) => e.id === "cauldron").uid;
    placementMod.performPlacement(me, { kind: "setdown", uid: uid2, tx: spot[0], ty: spot[1] });
    const own2 = mapMod.tileAt(spot[0], spot[1]).prop;
    assert(own2 && own2.sprite === "cauldron" && own2.made, "a guest's setdown command did not set the cauldron down");
    assert(setdownMod.pickUp(me, own2), "picked up again");
    // The save and the sync part: the potion's time and the buff.
    me.potionAt = 123.456;
    me.buffs = { stamina: { left: 12.3456 } };
    const text = gameMod.syncParts().players;
    me.buffs = { stamina: { left: 12.3 } };
    assert(gameMod.syncParts().players !== text, "the buff is not in the sync part");
    const saved = gameMod.serialize();
    const back = saved.characters.players.find((p) => p.id === me.id);
    assert(back && back.potionAt === 123.456 && back.buffs && back.buffs.stamina.left === 12.3, `the save: ${JSON.stringify(back && { potionAt: back.potionAt, buffs: back.buffs })}`);
    return `the levers; the vials 1 clay to 2, fired at an oven; the witch's cauldron at ${witch.tile} (no carry, no village station, cooks nothing, its 5 rows open); a brew over a lit fire only, its draught from clean skins (refused "${stationsMod.NO_WATER}"), 20 s; drunk by 5 slots' keys, the slot's menu, double-clicks, the bag's Drink, a guest's two commands; 10 s between; the vial back, into the bag, at the feet; the buff doubled and gone in 30 s; mana against #480's bar; the poisons' line; your own cauldron made, set down by the host and a guest, picked up out and empty; the cards; the save and the sync part`;
  } finally {
    promptMod.setMessageSink(null);
  }
});

// Honey in clay jars (docs/02, 2026-10-26, Honey goes into a clay jar; #500): taking honey needs an empty clay jar carried, refused "You
// need a clay jar to take honey." without one; it fills the jar in its own place exactly as a drunk potion empties its vial there
// (potions.placeOf, potions.vacate); the jar is made like a vial (one clay to one unfired jar at the workbench, bigger than the vial's
// two-to-one; fired in an oven), stacks 10; eating the Jar of honey, or spending it in a recipe (pemmican's binder, the stamina potion's
// secondary), leaves the empty jar behind the same way (interact.js's `eatOne`, stations.js's `take`, both off the filled item's own `jar`
// field); the cottage's chest starts with two.
const hivesMod = await import("../src/hives.js");
check("honey: a clay jar made like a vial, taking honey needing one carried with its line, eating and a recipe both leaving the jar, the cottage's two", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false, survival: true, villageStations: false } });
  const S = gameMod.state;
  const me = S.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  try {
    const mk = (id, n = 1, props = {}) => itemsMod.makeEntry(id, n, props);
    const bag = inventoryMod.bagOf(me);
    const clear = () => { bag.items.length = 0; const b = inventoryMod.beltOf(me); if (b) b.fill(null); me.hands.main = null; me.hands.off = null; };
    const give = (id, n = 1, props = {}) => { assert(gridMod.add(bag, id, n, props) === n, `${id} did not fit the bag`); return bag.items.filter((e) => e.id === id).pop(); };
    const count = (id) => inventoryMod.countAll(me, id);
    // Made like a vial: one clay to one unfired jar (bigger than the vial's two), fired in an oven; stacks 10; the filled item's own `jar`.
    const uj = stationsMod.recipe("unfired_jar");
    const cj = stationsMod.recipe("clay_jar");
    assert(uj.station === "workbench" && uj.in[0].id === "clay" && uj.in[0].count === 1 && uj.out.count === 1 && cj.station === "oven" && cj.fire && cj.in[0].id === "unfired_jar" && cj.out.id === "clay_jar", `${JSON.stringify(uj)} ${JSON.stringify(cj)}`);
    assert(itemsMod.getItem("clay_jar").stack === 10 && itemsMod.getItem("unfired_jar").stack === 10, "the jars stack 10");
    assert(itemsMod.getItem("honey").jar === "clay_jar" && itemsMod.getItem("honey").name === "Jar of honey", `the filled item: ${JSON.stringify(itemsMod.getItem("honey"))}`);
    // A hive, stood beside.
    const hive = mapMod.allProps().find((p) => hivesMod.isHive(p));
    assert(hive, "no hive in the valley");
    mapMod.ensureAround(hive.tile[0], hive.tile[1], 2);
    const standAt = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [hive.tile[0] + dx, hive.tile[1] + dy]).find(([x, y]) => mapMod.isWalkableTile(x, y) && !mapMod.tileAt(x, y).prop);
    me.gx = standAt[0];
    me.gy = standAt[1];
    mapMod.ensureAround(me.gx, me.gy, 2);
    // Refused with no jar, the exact line (Michael: "It should also refuse to take honey if no container.").
    clear();
    hive.honeyAt = null;
    const r0 = verbsMod.run("honey", worldMod.world, me, { prop: hive.id });
    assert(!r0.ok && r0.reason === hivesMod.NEED_JAR && hivesMod.NEED_JAR === "You need a clay jar to take honey.", `no jar: ${JSON.stringify(r0)}`);
    const atChest = hivesMod.propActions(hive, me, (a) => a, worldMod.world)[0];
    assert(atChest.label === "Take honey" && atChest.enabled !== false, `the menu's entry while a jar is missing: ${JSON.stringify(atChest)}`);
    said.length = 0;
    atChest.perform();
    assert(said[said.length - 1] === hivesMod.NEED_JAR, `the menu's own refusal: ${said[said.length - 1]}`);
    // Carried, it fills: one jar used, a Jar of honey in the jar's own place; the hive's next day moved on.
    const jar = give("clay_jar", 1);
    const [jx, jy] = [jar.x, jar.y];
    const before = clock.getElapsed();
    const r1 = verbsMod.run("honey", worldMod.world, me, { prop: hive.id });
    assert(r1.ok && r1.message === "You take a jar of honey from the hive.", `with a jar: ${JSON.stringify(r1)}`);
    const honeyEntry = bag.items.find((e) => e.id === "honey");
    assert(honeyEntry && honeyEntry.x === jx && honeyEntry.y === jy && count("clay_jar") === 0 && count("honey") === 1, `the jar filled in its own cell: ${JSON.stringify(honeyEntry)}`);
    assert(Math.abs(hive.honeyAt - (before + tuningMod.work.honey.days * clock.DAY_LENGTH)) < 1e-6, `the hive's next day: ${hive.honeyAt}`);
    // Refused again with the jar now full of honey and none left empty.
    hive.honeyAt = null; // as if three days had passed, to isolate the jar check from the day check
    const r2 = verbsMod.run("honey", worldMod.world, me, { prop: hive.id });
    assert(!r2.ok && r2.reason === hivesMod.NEED_JAR, `again with no empty jar: ${JSON.stringify(r2)}`);
    // Eating it leaves the empty jar behind, in the honey's own cell, as drinking a potion leaves its vial.
    me.hunger = 50;
    const eat = interactMod.itemMenu(me, honeyEntry, bag, null).find((m) => m.label === "Eat");
    assert(eat, "the Jar of honey has no Eat");
    eat.onSelect();
    const backJar = bag.items.find((e) => e.id === "clay_jar");
    assert(backJar && backJar.x === jx && backJar.y === jy && !bag.items.some((e) => e.id === "honey") && me.hunger === 70, `eating left the jar behind: ${JSON.stringify(backJar)}, hunger ${me.hunger}`);
    // Spent in a recipe (the stamina potion's secondary) leaves the jar too, at the witch's cauldron.
    clear();
    const witch = mapMod.propById("cauldron_witch");
    assert(witch, "no witch's cauldron");
    mapMod.ensureAround(witch.tile[0], witch.tile[1], 2);
    const standByWitch = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [witch.tile[0] + dx, witch.tile[1] + dy]).find(([x, y]) => mapMod.isWalkableTile(x, y) && !mapMod.tileAt(x, y).prop);
    me.gx = standByWitch[0];
    me.gy = standByWitch[1];
    give("nettle", 2);
    give("honey", 1);
    give("clay_vial", 1);
    give("waterskin", 1, { fill: 100, clean: true });
    give("log", 2);
    give("tinderbox", 1);
    const light = interactMod.actionsForTarget({ kind: "prop", id: witch.id }, me).find((a) => /^Light the cauldron/.test(a.label));
    interactMod.performByLabel(me, { kind: "prop", id: witch.id }, light.label);
    assert(witch.fire.lit, "the witch's cauldron was not lit");
    const stam = stationsMod.recipe("stamina_potion");
    assert(verbsMod.run("craft", worldMod.world, me, { prop: witch.id }, { recipe: "stamina_potion" }).ok, "the stamina potion would not start");
    assert(count("honey") === 0 && count("clay_jar") === 1, `the honey spent, its jar back at once: honey ${count("honey")}, jars ${count("clay_jar")}`);
    for (let i = 0; i < 60 * (stam.seconds + 1); i++) stationsMod.update(1 / 60);
    const brewed = witch.output && witch.output.items.find((e) => e.id === "stamina_potion");
    assert(brewed, `no stamina potion in the output: ${JSON.stringify(witch.output && witch.output.items)}`);
    assert(count("clay_jar") === 1, `the jar stayed through the brew: ${count("clay_jar")}`);
    // The cottage's chest starts with two.
    const homeChest = mapMod.allProps().find((p) => p.container && p.container.loot === "home_chest");
    assert(homeChest, "no cottage chest with the home_chest table");
    const hbag = interactMod.propBag(homeChest);
    if (!homeChest.searched) {
      homeChest.searched = true;
      if (!hbag.items.length) gridMod.fill(hbag, itemsMod.rollLoot(homeChest.container.loot));
    }
    const jars = hbag.items.filter((e) => e.id === "clay_jar").reduce((n, e) => n + (e.count || 1), 0);
    assert(jars === 2, `the cottage's chest: ${jars} clay jars (${JSON.stringify(hbag.items.map((e) => [e.id, e.count]))})`);
    return "the jar made like a vial, 1 clay to 1, stacking 10; taking honey refused \"" + hivesMod.NEED_JAR + "\" with no jar, and filled in the jar's own cell with one carried; eating it and spending it in the stamina potion both leave the empty jar behind; the cottage's chest holds two";
  } finally {
    promptMod.setMessageSink(null);
  }
});

// Poisons, step 3 (docs/47 section 6 and section 9's poison lines, #482): the levers equal to data/combat.json `poison`; the `blade` tag on
// exactly the edged weapons; Use rows by the host's applyWith and a guest's command by uid: a poison on a blade coats it (ten hits, the vial
// back), a strong one replaces it, a non-blade, the poisonous herbs, a fire arrow, and a poisoned arrow on a fire are "Nothing interesting
// happens."; a poison on arrows makes five from a bigger stack and the whole of a smaller one; the bow's order; a landed swing spends one
// hit and poisons every body it strikes, a miss none; a thrown spear's landing hit spends one and lodges with the rest, a miss lands whole;
// a poisoned arrow's hit; the status (a stack a hit up to three, the timer refreshed, the ticks a second as floating numbers, the strong
// tier lifting and kept), never a player or a villager, beside a burn, on wild game (a carcass keeping the poisoning weapon's class); the
// world's step drains it; the cards; the save; the sync parts; the frames' `po`.
const poisonMod = await import("../src/poison.js");
const combatMod = await import("../src/combat.js"); // zombieMod is the file's own, above
const interactionsMod = await import("../src/interactions.js");
const isoMod = await import("../src/iso.js");
const logMod = await import("../src/ui/log.js");
check("poison: the blade tag, a coat and poisoned arrows by Use (a guest's command too), the coat spent by landed hits, the bow's order, the status on the dead and game, never a player, the cards, the save, the sync parts, the frames", () => {
  const combatJson = read("data/combat.json");
  const P = poisonMod.POISON;
  for (const k of Object.keys(P)) assert(JSON.stringify(P[k]) === JSON.stringify(combatJson.poison[k]), `poison.js's ${k} ${JSON.stringify(P[k])} is not data/combat.json's ${JSON.stringify(combatJson.poison[k])}`);
  poisonMod.setPoisonData(combatJson.poison);
  assert(P.hits === 10 && P.arrows === 5 && P.max === 3 && P.duration === 10 && P.dpsByStacks.ordinary.join() === "1,2,3" && P.dpsByStacks.strong.join() === "2,4,6", `the levers: ${JSON.stringify(P)}`);
  const blades = itemsMod.allItems().filter((d) => d.tags && d.tags.includes("blade")).map((d) => d.id).sort().join(",");
  const edged = itemsMod.allItems().filter((d) => d.repair && d.repair.edged).map((d) => d.id).sort().join(",");
  assert(blades === edged && blades === "hatchet,knife,scythe,spear,sword", `blades ${blades}; edged ${edged}`);
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false, multiHit: true } });
  const S = gameMod.state;
  const me = S.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  logMod.setSink((t) => { said.push(t); return true; });
  const last = () => said[said.length - 1] || "";
  const frames = [];
  let host = null;
  try {
    const mk = (id, n = 1, props = {}) => itemsMod.makeEntry(id, n, props);
    const card = (e) => itemInfoMod.textOf(itemInfoMod.cardFor(e));
    const bag = inventoryMod.bagOf(me);
    const clear = () => { bag.items.length = 0; const b = inventoryMod.beltOf(me); if (b) b.fill(null); me.hands.main = null; me.hands.off = null; };
    const give = (id, n = 1, props = {}) => { assert(gridMod.add(bag, id, n, props) === n, `${id} did not fit the bag`); return bag.items.filter((e) => e.id === id).pop(); };
    const count = (id) => inventoryMod.countAll(me, id);
    // Open ground east of the spawn, nothing on it, outdoors.
    const open = mapMod.nearestWalkable(Math.round(me.gx) + 4, Math.round(me.gy), (x, y) => {
      for (let dx = -1; dx <= 8; dx++) for (let dy = -2; dy <= 2; dy++) { const t = mapMod.peekTile(x + dx, y + dy); if (!t || mapMod.roomAt(x + dx, y + dy) !== 0 || t.prop || !mapMod.isWalkableTile(x + dx, y + dy)) return true; }
      return false;
    });
    me.gx = open[0];
    me.gy = open[1];
    S.zombies.length = 0; // the dead of this check alone
    const bring = (dx, dy = 0) => { const z = zombieMod.createZombie(me.gx + dx, me.gy + dy); S.zombies.push(z); return z; };
    const face = (z) => { const s = isoMod.toScreen(z.gx, z.gy); const o = isoMod.toScreen(me.gx, me.gy); const n = isoMod.normalize(s.x - o.x, s.y - o.y - 0.001); me.aim = { ...me.aim, sx: n.x, sy: n.y }; };
    clear();
    // ---- the Use rows ----
    const sword = mk("sword");
    me.hands.main = sword;
    const vial = give("poison", 2);
    const rowOf = (e, t) => interactionsMod.resolve(e, t);
    assert(rowOf(vial, { kind: "item", entry: sword }).action === "coat" && !rowOf(mk("nightshade"), { kind: "item", entry: sword }) && !rowOf(vial, { kind: "item", entry: mk("bow") }) && !rowOf(vial, { kind: "item", entry: mk("fire_arrow", 5) }), "the rows: a poison on a blade, never the herbs tagged poison, a bow, or a fire arrow");
    const fireProp = [...mapMod.fires()].find((f) => f.fire && f.fire.burns);
    assert(!rowOf(mk("poison_arrow", 5), { kind: "prop", prop: fireProp }) && !rowOf(mk("strong_poison_arrow", 5), { kind: "prop", prop: fireProp }) && rowOf(mk("arrow", 5), { kind: "prop", prop: fireProp }).action === "dip", "a poisoned arrow on a fire has a row");
    useMod.applyWith(vial, { kind: "item", entry: sword, slot: "hand:main" }, me);
    assert(sword.poison && sword.poison.tier === 1 && sword.poison.hits === 10 && vial.count === 1 && count("clay_vial") === 1 && last() === "You coat the arming sword with poison.", `coated: ${JSON.stringify(sword.poison)}; vials ${vial.count}, clay ${count("clay_vial")}; "${last()}"`);
    assert(card(sword).includes("Poisoned: 10 hits left."), card(sword).join(" | "));
    useMod.applyWith(vial, { kind: "item", entry: mk("fire_arrow", 5) }, me);
    assert(last() === interactionsMod.NOTHING && vial.count === 1, `a poison on a fire arrow: "${last()}"`);
    // A guest's Use (inventory-actions' command by uid): the strong poison on the sword, from the bag onto the hand's slot; the new coat replaces the old.
    const strong = give("strong_poison", 1);
    assert(invActionsMod.performUseCommand(me, { uid: strong.uid, src: { kind: "bag", bag: { mine: true } }, target: { kind: "item", uid: sword.uid, slot: "hand:main" } }, null), "the guest's use command was not run");
    assert(sword.poison.tier === 2 && sword.poison.hits === 10 && !bag.items.includes(strong) && count("strong_poison") === 0 && count("clay_vial") === 2 && card(sword).includes("Strongly poisoned: 10 hits left."), `strong: ${JSON.stringify(sword.poison)}; ${card(sword).join(" | ")}`);
    // Arrows: five from a stack of twelve, the rest kept; the whole of a stack of three, in place.
    const arrows = give("arrow", 12);
    useMod.applyWith(vial, { kind: "item", entry: arrows }, me);
    assert(arrows.id === "arrow" && arrows.count === 7 && count("poison_arrow") === 5 && count("poison") === 0 && count("clay_vial") === 3 && last() === "You coat 5 arrows with poison.", `arrows: ${arrows.count} left, ${count("poison_arrow")} poisoned; "${last()}"`);
    inventoryMod.takeAll(me, "arrow", 99);
    const few2 = give("arrow", 3);
    const sv = give("strong_poison", 1);
    useMod.applyWith(sv, { kind: "item", entry: few2 }, me);
    assert(few2.id === "strong_poison_arrow" && few2.count === 3 && count("strong_poison") === 0, `three arrows: ${few2.id} x${few2.count}`);
    // A full bag: the five new arrows at the feet, with their line, as the vial's.
    const bag0 = bag.items.slice();
    const held = mk("arrow", 12);
    me.hands.off = held;
    const fv = give("poison", 1);
    bag.items = bag.items.filter((e) => e.id !== "poison_arrow"); // no stack of them to top up
    while (gridMod.add(bag, "clay_vial", 1) === 1); // every cell taken, the vials' stacks full
    const tile = [Math.round(me.gx), Math.round(me.gy)];
    const floor0 = mapMod.itemsAt(tile[0], tile[1]).filter((e) => e.id === "poison_arrow").reduce((n, e) => n + e.count, 0);
    said.length = 0;
    useMod.applyWith(fv, { kind: "item", entry: held, slot: "hand:off" }, me);
    const floor1 = mapMod.itemsAt(tile[0], tile[1]).filter((e) => e.id === "poison_arrow").reduce((n, e) => n + e.count, 0);
    assert(held.count === 7 && floor1 - floor0 === P.arrows && said.includes(poisonMod.ARROWS_AT_FEET), `a full bag: ${held.count} kept, ${floor1 - floor0} at the feet; said ${said.join(" / ")}`);
    for (const e of mapMod.itemsAt(tile[0], tile[1]).filter((q) => q.id === "poison_arrow" || q.id === "clay_vial")) mapMod.takeItem(tile[0], tile[1], e);
    bag.items.splice(0, bag.items.length, ...bag0);
    me.hands.off = null;
    // The bow's order: fire, strong, ordinary, plain.
    me.hands.main = mk("bow");
    give("fire_arrow", 2);
    const L = () => archeryMod.launcherOf(me);
    const order = [];
    for (const id of ["fire_arrow", "strong_poison_arrow", "poison_arrow", "arrow"]) { order.push(`${L().ammo}:${L().poison}`); inventoryMod.takeAll(me, id, 99); }
    assert(order.join(" ") === "fire_arrow:0 strong_poison_arrow:2 poison_arrow:1 arrow:0", `the bow's order: ${order.join(" ")}`);
    // ---- a swing: one hit spent however many it strikes, every body poisoned; a miss none ----
    me.hands.main = sword;
    sword.poison = { tier: 1, hits: 10 };
    const z1 = bring(0.9, 0);
    const z2 = bring(0.9, 0.35);
    face(z1);
    me.stamina = me.maxStamina;
    me.attackCooldown = 0;
    const hit = combatMod.tryAttack(me, S.zombies, "main");
    assert(hit && hit.length === 2 && z1.poison && z2.poison && z1.poison.stacks === 1 && sword.poison.hits === 9, `the swing struck ${hit && hit.length}; poisoned ${!!z1.poison}, ${!!z2.poison}; ${sword.poison.hits} hits left`);
    z1.gx = me.gx - 5; z2.gx = me.gx - 5;
    me.attackCooldown = 0;
    me.shoveCooldown = 0;
    const miss = combatMod.tryAttack(me, S.zombies, "main");
    assert(miss && miss.length === 0 && sword.poison.hits === 9, `a miss spent ${10 - sword.poison.hits - 1}`);
    sword.poison.hits = 1;
    z1.gx = me.gx + 0.9; z1.gy = me.gy; face(z1);
    me.attackCooldown = 0;
    combatMod.tryAttack(me, S.zombies, "main");
    assert(!sword.poison && z1.poison.stacks === 2 && !card(sword).some((l) => /oisoned/.test(l)), `the last hit: ${JSON.stringify(sword.poison)}`);
    // ---- the status ----
    S.zombies.length = 0;
    const z = bring(3, 0);
    z.hp = 150;
    floatersMod.takeForFrame();
    poisonMod.apply(z, 1);
    for (let i = 0; i < 600; i++) poisonMod.update(S.zombies, 1 / 60);
    const ticks = floatersMod.takeForFrame().filter((e) => e[1] === z.id);
    assert(!z.poison && Math.abs(150 - z.hp - 10) < 1e-6 && ticks.length === 10 && ticks.every((e) => e[0] === floatersMod.DAMAGE && e[2] === 1), `one stack for its timer: lost ${150 - z.hp}, ${ticks.length} ticks`);
    z.hp = 150;
    poisonMod.apply(z, 1);
    poisonMod.apply(z, 1);
    poisonMod.apply(z, 1);
    poisonMod.apply(z, 1);
    assert(z.poison.stacks === 3 && z.poison.tier === 1, `four hits: ${JSON.stringify(z.poison)}`);
    for (let i = 0; i < 330; i++) poisonMod.update(S.zombies, 1 / 60); // 5.5 s
    poisonMod.apply(z, 2); // a strong hit at 5.5 s: strong, the timer back to 10, the next tick still at 6
    assert(z.poison.tier === 2 && z.poison.stacks === 3 && Math.abs(z.poison.left - 10) < 1e-6, `a strong hit: ${JSON.stringify(z.poison)}`);
    poisonMod.apply(z, 1);
    assert(z.poison.tier === 2, "an ordinary hit on a strong status made it ordinary");
    for (let i = 0; i < 700; i++) poisonMod.update(S.zombies, 1 / 60);
    assert(!z.poison && Math.abs(150 - z.hp - (5 * 3 + 10 * 6)) < 1e-6, `three stacks 5 s, then strong for 10: lost ${150 - z.hp} (wanted ${5 * 3 + 10 * 6})`);
    // Never a player, a villager, or the dead already dead; it kills; it stands beside a burn; the world's step drains it.
    assert(!poisonMod.apply(me, 2) && !me.poison && (!S.villagers[0] || (!poisonMod.apply(S.villagers[0], 2) && !S.villagers[0].poison)), "a player or a villager was poisoned");
    z.hp = 2;
    poisonMod.apply(z, 2);
    for (let i = 0; i < 61; i++) poisonMod.update(S.zombies, 1 / 60);
    assert(z.dead && !z.poison && !poisonMod.apply(z, 1), `a tick kills: dead ${z.dead}`);
    S.zombies.length = 0;
    const zb = bring(3, 1);
    zb.hp = 150;
    burnMod.ignite(zb);
    poisonMod.apply(zb, 1);
    for (let i = 0; i < 120; i++) gameMod.step(1 / 60, null);
    assert(zb.burning && zb.poison && zb.poison.stacks === 1 && Math.abs(150 - zb.hp - (2 * 1 + 2 * burnMod.BURN.dps)) < 0.05, `beside a burn, by the world's step: lost ${(150 - zb.hp).toFixed(2)}, burning ${zb.burning}, poison ${JSON.stringify(zb.poison)}`);
    // The save keeps the status and the coat; the sync parts compare the tier and stacks, and the coat in the entry text.
    me.hands.main = sword;
    sword.poison = { tier: 2, hits: 7 };
    const saved = JSON.parse(JSON.stringify(gameMod.serialize()));
    const zs = saved.characters.zombies.find((q) => q.id === zb.id);
    const ps = saved.characters.players.find((q) => q.id === me.id);
    assert(zs && zs.poison && zs.poison.stacks === 1 && ps && ps.hands.main.poison && ps.hands.main.poison.hits === 7, `the save: ${JSON.stringify(zs && zs.poison)}; ${JSON.stringify(ps && ps.hands.main && ps.hands.main.poison)}`);
    const parts0 = gameMod.syncParts();
    sword.poison.hits = 6;
    poisonMod.apply(zb, 1);
    const parts1 = gameMod.syncParts();
    assert(parts0.players !== parts1.players && parts0.dead !== parts1.dead, "the coat or the stacks are not in the sync parts");
    zb.poison.left = 3.21;
    assert(gameMod.syncParts().dead === parts1.dead, "the poison's timer (the host's) is in the dead part");
    // Wild game: poisoned by an arrow's landing hit, a carcass keeping the bow's class; a tame animal only struck as the blow rules allow.
    const deer = S.animals.find((a) => animalMod.isWild(a) && !a.dead);
    assert(!!deer, "no wild animal in the valley");
    const deer0 = { gx: deer.gx, gy: deer.gy, hp: deer.hp };
    deer.gx = me.gx + 5; deer.gy = me.gy;
    deer.hp = 3;
    archeryMod.reset();
    archeryMod.shoot(me, [1, 0], 5, 1, { damage: 1, projectile: "poison_arrow", poison: 2 });
    for (let i = 0; i < 120 && archeryMod.arrowsInFlight().length; i++) archeryMod.update(1 / 60);
    assert(deer.poison && deer.poison.tier === 2 && deer.poison.cls === "bow", `the arrow's hit on the deer: ${JSON.stringify(deer.poison)}`);
    const animalsPart = gameMod.syncParts().animals;
    for (let i = 0; i < 61; i++) poisonMod.update(S.animals, 1 / 60);
    assert(deer.dead && deer.killedBy === "bow" && !deer.poison && gameMod.syncParts().animals !== animalsPart, `the deer by the poison: dead ${deer.dead}, ${deer.killedBy}`);
    // A thrown spear's landing hit: one hit of its coat spent, the rest lodged with it; a miss lands with the coat whole.
    const zs2 = bring(5, 0);
    zs2.hp = 150;
    const spear = mk("spear", 1, { poison: { tier: 1, hits: 4 } });
    archeryMod.shoot(me, [1, 0], 5, 1, { damage: 1, projectile: "spear", item: { ...spear } });
    for (let i = 0; i < 120 && archeryMod.arrowsInFlight().length; i++) archeryMod.update(1 / 60);
    const lodged = (zs2.lodgedItems || []).find((e) => e.uid === spear.uid);
    assert(zs2.poison && lodged && lodged.poison && lodged.poison.hits === 3, `the spear's hit: ${JSON.stringify(zs2.poison)}, lodged ${JSON.stringify(lodged && lodged.poison)}`);
    const spear2 = mk("spear", 1, { poison: { tier: 1, hits: 4 } });
    const a = archeryMod.shoot(me, [0, 1], 3, 1, { damage: 1, projectile: "spear", item: { ...spear2 } });
    for (let i = 0; i < 120 && archeryMod.arrowsInFlight().length; i++) archeryMod.update(1 / 60);
    const fell = mapMod.itemsAt(Math.round(a.landAt[0]), Math.round(a.landAt[1])).find((e) => e.uid === spear2.uid);
    assert(fell && fell.poison && fell.poison.hits === 4, `a missed throw: ${JSON.stringify(fell && fell.poison)}`);
    Object.assign(deer, deer0);
    // The frames: the dead's record carries `po` while poisoned and none after; PROTOCOL 20.
    assert(netMod.PROTOCOL >= 20, `PROTOCOL ${netMod.PROTOCOL}`);
    host = netMod.testHost((m) => { if (m.type === "frame") frames.push(JSON.parse(JSON.stringify(m))); });
    host.joined();
    const tickFrame = () => { loopMod.setSimTime(loopMod.simTime() + 1 / 60); netMod.hostAfterStep(); };
    zs2.poison = null;
    poisonMod.apply(zs2, 2);
    for (let i = 0; i < 6; i++) tickFrame();
    const withPo = frames.flatMap((f) => f.zombies || []).filter((r) => r.id === zs2.id && (r.po || (r.full && r.poison)));
    frames.length = 0;
    delete zs2.poison;
    for (let i = 0; i < 6; i++) tickFrame();
    const after = frames.flatMap((f) => f.zombies || []).filter((r) => r.id === zs2.id);
    assert(withPo.length > 0 && after.length > 0 && after.every((r) => !r.po), `the frames: ${JSON.stringify(withPo.slice(-1))}; after ${JSON.stringify(after.map((r) => r.po))}`);
    // The cards: the poisons say Use once, from the rows; the arrows say what they do.
    const pc = card(mk("poison"));
    assert(pc.filter((l) => l.startsWith("Use")).length === 1 && pc.includes("Use on a blade or arrows: coat.") && pc.includes(poisonMod.effectWords(1)) && card(mk("strong_poison")).includes(poisonMod.effectWords(2)), pc.join(" | "));
    assert(card(mk("poison_arrow")).includes(poisonMod.effectWords(1)) && card(mk("strong_poison_arrow")).includes(poisonMod.effectWords(2)) && card(mk("nightshade")).every((l) => !l.startsWith("Use")), `${card(mk("poison_arrow")).join(" | ")} || ${card(mk("nightshade")).join(" | ")}`);
    return `the levers; blades ${blades}; coated by Use and a guest's command, replaced by the strong; 5 arrows of 12, 3 of 3; the bow fire, strong, poisoned, plain; a swing on two spending one, a miss none; 10 ticks of 1, then 3 stacks lifted to strong (75 lost); never a player; beside a burn in the world's step; the save, the sync parts; a deer's carcass by the bow's class; a spear's coat spent on a hit and kept on a miss; the frames' po; the cards`;
  } finally {
    if (host) host.done();
    promptMod.setMessageSink(null);
    logMod.setSink(null);
  }
});

// Throwing potions, step 4 (docs/47 section 7, #483): every potion and poison `hands: "either"` with a `thrown` block (`button: "alt"`, the
// main hand's other mode, as the spear's; a left click swings nothing, not even fists, combat.weaponOf's null); a hand slot's key draws it,
// the utility slot's still drinks it or says the poison's line; it shatters on landing (the vial never lands, never lodges) with an effect
// `splash.radius` tiles across: healing and mana help every player and villager it reaches (a villager has no mana to restore), stamina only
// a player; poison stacks on every one of the dead and every wild animal it reaches, never a player, a villager, or a tame animal; a splash
// counts as a drink, potions.waitLeft's rule, per player independently; the cards; a guest's replica draws the burst and the stain from the
// landed flight's projectile name alone, nothing new on the wire.
const villagerMod2 = villagerMod; // the file's own, above (poison's check)
check("splash: potions and poisons held and thrown, the shatter, the splash healing, restoring, and filling the right players and villagers, poison on the dead and wild game, never a player, a villager, or a tame animal, a splash as a drink per player, the vial never returned, the cards, a guest's replica", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false, survival: true } });
  const S = gameMod.state;
  const me = S.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  const last = () => said[said.length - 1] || "";
  try {
    const mk = (id, n = 1, props = {}) => itemsMod.makeEntry(id, n, props);
    const card = (id, e = mk(id)) => itemInfoMod.textOf(itemInfoMod.cardFor(e));
    const has = (id, text) => card(id).includes(text);
    const bag = inventoryMod.bagOf(me);
    const belt = inventoryMod.beltOf(me);
    const clear = () => { bag.items.length = 0; belt.fill(null); me.hands.main = null; me.hands.off = null; };

    // The data: holdable, the other mode, the splash's reach, on every potion and poison.
    for (const id of ["healing_potion", "stamina_potion", "mana_potion", "poison", "strong_poison"]) {
      const d = itemsMod.getItem(id);
      assert(d.hands === "either" && d.thrown && d.thrown.button === "alt" && d.thrown.splash && d.thrown.splash.radius === 0.75, `${id}: ${JSON.stringify(d.thrown)}`);
    }

    // Holdable: a hand slot's key draws it into that hand, as any held thing's; the utility slot's still drinks or says the poison's line.
    clear();
    belt[0] = mk("healing_potion"); // a main-hand slot
    assert(interactMod.beltPress(me, 0) === "drawn" && me.hands.main && me.hands.main.id === "healing_potion" && !belt[0], `the main-hand slot's key: ${me.hands.main && me.hands.main.id}`);
    belt[1] = mk("poison"); // an off-hand slot
    assert(interactMod.beltPress(me, 1) === "drawn" && me.hands.off && me.hands.off.id === "poison" && !belt[1], `the off-hand slot's key: ${me.hands.off && me.hands.off.id}`);
    // A left click swings nothing with a potion in the main hand: no weapon, not even fists.
    me.attackCooldown = 0;
    me.stamina = me.maxStamina;
    assert(combatMod.weaponOf(me) === null && combatMod.swingFromLeft(me, S.zombies) === null && me.attackCooldown === 0 && me.stamina === me.maxStamina, "a potion in the main hand swung");
    belt[2] = mk("poison"); // the utility slot
    said.length = 0;
    assert(interactMod.beltPress(me, 2) === "none" && last() === potionsMod.POISON_WORD, `the utility slot's key still says the line: ${last()}`);
    clear();

    // Open ground east of the spawn, nothing on it, outdoors.
    const open = mapMod.nearestWalkable(Math.round(me.gx) + 4, Math.round(me.gy), (x, y) => {
      for (let dx = -2; dx <= 8; dx++) for (let dy = -3; dy <= 3; dy++) { const t = mapMod.peekTile(x + dx, y + dy); if (!t || mapMod.roomAt(x + dx, y + dy) !== 0 || t.prop || !mapMod.isWalkableTile(x + dx, y + dy)) return true; }
      return false;
    });
    me.gx = open[0];
    me.gy = open[1];
    S.zombies.length = 0;
    S.animals.length = 0;
    const throwAt = (shooter, x, y, c) => { shooter.recover = 0; shooter.draw = { t: 1, c, source: "script" }; shooter.aimOverride = [x, y]; const f = archeryMod.releaseDraw(shooter, {}); shooter.aimOverride = null; for (let i = 0; i < 180 && archeryMod.arrowsInFlight().length; i++) gameMod.step(1 / 60, null); return f; };
    const approx = (a, b, e = 0.05) => Math.abs(a - b) < e; // a few steps of the world's own passive regen between the throw and the read

    // A fresh helped player, one out of reach, and a villager, around where a soft toss (just above the minimum draw) lands, under a tile
    // from the thrower, the thrower's own splash too.
    const near = gameMod.addPlayer(me.gx + 0.6, me.gy, {});
    const far = gameMod.addPlayer(me.gx + 2, me.gy, {});
    const villager = villagerMod2.createVillager(me.gx + 0.5, me.gy + 0.3, { id: "splash_test_v" });
    S.villagers.push(villager);

    // ---- the heal splash: every player and villager it reaches, the thrower too, never one past its radius ----
    me.hands.main = mk("healing_potion");
    me.hp = 10;
    near.hp = 10;
    far.hp = 10;
    villager.hp = 10;
    const f1 = throwAt(me, me.gx + 1, me.gy, 0.2); // a soft toss: it lands under a tile away, within the thrower's own splash
    assert(f1 && f1.landAt && Math.hypot(f1.landAt[0] - me.gx, f1.landAt[1] - me.gy) < 0.75, `the soft throw did not land within the thrower's own splash: ${JSON.stringify(f1 && f1.landAt)}`);
    assert(me.hands.main === null, "the hand did not empty");
    const tile = [Math.round(f1.landAt[0]), Math.round(f1.landAt[1])];
    assert(!mapMod.itemsAt(tile[0], tile[1]).some((e) => e.id === "healing_potion" || e.id === "clay_vial"), "the thrown potion left an item where it shattered");
    const landTime = loopMod.simTime();
    assert(approx(me.hp, 50) && me.potionAt === landTime && approx(near.hp, 50) && near.potionAt === landTime && approx(villager.hp, 50) && villager.potionAt == null, `the splash: me ${me.hp}/${me.potionAt}, near ${near.hp}/${near.potionAt}, villager ${villager.hp}/${villager.potionAt}`);
    assert(approx(far.hp, 10) && far.potionAt == null, `past the radius: ${far.hp}/${far.potionAt}`);
    // A splash counts as a drink, per player independently: one within the cooldown gets nothing and keeps its old stamp; a fresh player still does.
    me.hands.main = mk("healing_potion");
    me.hp = 10;
    near.hp = 10;
    const fresh = gameMod.addPlayer(me.gx + 0.6, me.gy, {});
    fresh.hp = 10;
    throwAt(me, me.gx + 1, me.gy, 0.2);
    const landTime2 = loopMod.simTime();
    assert(approx(me.hp, 10) && me.potionAt === landTime, `the thrower's own cooldown was no way round the rule: hp ${me.hp}, stamp ${me.potionAt} (was ${landTime})`);
    assert(approx(near.hp, 10) && near.potionAt === landTime, `one within the cooldown got a splash: hp ${near.hp}, stamp ${near.potionAt} (was ${landTime})`);
    assert(approx(fresh.hp, 50) && fresh.potionAt === landTime2, `a fresh player did not: hp ${fresh.hp}`);

    // ---- stamina: a player only, filled and buffed; a villager untouched (it has no stamina) ----
    loopMod.setSimTime(loopMod.simTime() + 15); // past everyone's ten seconds
    me.hands.main = mk("stamina_potion");
    me.stamina = 5;
    near.stamina = 5;
    throwAt(me, me.gx + 1, me.gy, 0.2);
    assert(me.stamina === me.maxStamina && potionsMod.staminaBuffed(me) && near.stamina === near.maxStamina && potionsMod.staminaBuffed(near), `the stamina splash: me ${me.stamina}, near ${near.stamina}`);
    assert(typeof villager.stamina === "undefined" && !villager.buffs, "a stamina splash touched a villager, which has none");

    // ---- mana: a player's bar, and a villager's too by the doc's words, which has none to restore ----
    loopMod.setSimTime(loopMod.simTime() + 15);
    me.hands.main = mk("mana_potion");
    me.mana = 10;
    near.mana = 10;
    throwAt(me, me.gx + 1, me.gy, 0.2);
    assert(Math.abs(me.mana - 60) < 0.2 && Math.abs(near.mana - 60) < 0.2, `the mana splash: me ${me.mana}, near ${near.mana}`); // 10 + 50, a little regen drift allowed
    assert(typeof villager.mana === "undefined", "a mana splash invented a mana field on a villager");

    // ---- poison: the dead and wild game it reaches, never a player, a villager, or a tame animal ----
    loopMod.setSimTime(loopMod.simTime() + 15);
    const zNear = zombieMod.createZombie(me.gx + 0.6, me.gy - 0.2);
    const zFar = zombieMod.createZombie(me.gx + 2, me.gy);
    S.zombies.push(zNear, zFar);
    const deer = animalMod.createAnimal("deer", me.gx + 0.6, me.gy, { home: [me.gx, me.gy] }); // wild
    const cow = animalMod.createAnimal("cow", me.gx + 0.5, me.gy + 0.3, { home: [me.gx, me.gy] }); // tame
    S.animals.push(deer, cow);
    assert(animalMod.isWild(deer) && !animalMod.isWild(cow), "the deer and the cow are not wild and tame as this test needs");
    me.hands.main = mk("strong_poison");
    throwAt(me, me.gx + 1, me.gy, 0.2);
    assert(zNear.poison && zNear.poison.tier === 2 && zNear.poison.stacks === 1, `the near one of the dead: ${JSON.stringify(zNear.poison)}`);
    assert(!zFar.poison, "the far one of the dead was poisoned");
    assert(deer.poison && deer.poison.tier === 2 && deer.poison.cls === "thrown", `the wild deer: ${JSON.stringify(deer.poison)}`);
    assert(!cow.poison, "the tame cow was poisoned");
    assert(!me.poison && !near.poison && !villager.poison, "a player or a villager was poisoned");

    // The save and the sync part already carry a potion's effect (potionAt, mana, stamina, hp) and a poison's (the dead's and the animals'
    // own records), which this step changes nothing about: proved once, lightly.
    const parts0 = gameMod.syncParts();
    loopMod.setSimTime(loopMod.simTime() + 15);
    me.hands.main = mk("healing_potion");
    me.hp = 10;
    throwAt(me, me.gx + 1, me.gy, 0.2);
    const parts1 = gameMod.syncParts();
    assert(parts0.players !== parts1.players, "the splash's heal and potionAt are not in the sync part");

    // The cards.
    assert(has("healing_potion", "Throw (middle button or Q): shatters where it lands, up to 9 tiles, splashing 1.5 tiles across.") && has("healing_potion", "Heals 40 at once in every player and villager it splashes.") && has("healing_potion", "A splash counts as a drink: a player within 10 seconds of one gets nothing from it."), card("healing_potion").join(" | "));
    assert(has("stamina_potion", "Fills stamina in every player it splashes, coming back twice as fast for 30 seconds."), card("stamina_potion").join(" | "));
    assert(has("mana_potion", "Restores 50 mana at once in every player and villager it splashes."), card("mana_potion").join(" | "));
    assert(has("poison", "Splashes every one of the dead and every wild animal within reach; never a player, a villager, or a tame animal."), card("poison").join(" | "));

    // A guest's replica (headless, no browser needed, archery.flightStore/applyFlights/stepFlights taking their own store): the burst and the
    // stain come from the landed flight's own launch record alone, with nothing new added to it (no PROTOCOL bump: the splash's effect is
    // the host's, reaching a guest through the player's, the dead's, and the animals' records it already carries).
    archeryMod.reset();
    const a = archeryMod.shoot(me, [1, 0], 1, 1, { projectile: "healing_potion", item: { ...mk("healing_potion"), uid: "guest_replica_test" } });
    const launch = archeryMod.launchRecord(a, 0);
    assert(Object.keys(launch).every((k) => ["id", "l", "p", "x", "y", "dx", "dy", "s", "T", "H", "z0", "v", "f", "e", "t"].includes(k)), `the launch record grew a field: ${Object.keys(launch).join(",")}`);
    while (!a.done) archeryMod.update(1 / 60);
    const end = archeryMod.endRecord(a);
    const store = archeryMod.flightStore();
    archeryMod.applyFlights(store, { go: [launch] }, 0);
    archeryMod.stepFlights(store, 0);
    assert(store.shown.length === 1, "the guest's replica did not see the flight launched");
    archeryMod.applyFlights(store, { end: [end] }, 0);
    archeryMod.stepFlights(store, end[1] + 1);
    assert(store.splashes.length === 1 && store.splashes[0].color === itemsMod.getItem("healing_potion").color, `the guest's replica splash: ${JSON.stringify(store.splashes)}, wanted ${itemsMod.getItem("healing_potion").color}`);

    return `the data on all five; a hand slot draws, the utility slot drinks or says the line, a left click swings nothing; a soft throw lands under the thrower, the vial never lying there; heals and restores mana in every player and villager it splashes, fills stamina in every player alone; a splash as a drink per player, the thrower's own cooldown no exception; poison on the dead and the wild deer, never the far one, the tame cow, a player, or a villager; the sync part; the cards; a guest's replica from the launch record alone`;
  } finally {
    promptMod.setMessageSink(null);
  }
});

// The playtest's features, first batch (#506; docs/02, 2026-10-26, The playtest's rulings): a bucket of tainted water boiled at a lit cooking fire by
// its menus, the fire's menu, Use, and a guest's commands, its bar `bucketBoilSeconds`, and poured into skins by Use (clean into clean, tainted into
// tainted or empty, tainted into clean refused in Michael's words); Burn corpse for a tinderbox alone, nothing spent, and a lit torch Used on a body;
// sleep's speed 20; a belt on the ground and a satchel in a chest, a belt on a body, opened where they lie with Take All, by their addresses as a
// guest's commands name them, the belt's view emptying the belt itself and taking nothing in; a stack dropped on a matching stack in a hand, a belt
// slot, and a bag cell filling it to the limit, the rest staying, an entry with its own state never merging, a guest's commands the same.
// The page's half (the cards read on the page, the fade, the "Zz", two tabs) is check("features1").
const inputMod = await import("../src/input.js"); // a key tapped for one step, as the keyboard does (waking early)
check("playtest features (#506): the bucket boiled and poured, Burn corpse by a tinderbox or a lit torch, sleep at 20, container items opened where they lie, stacks filling stacks", () => {
  const json = read("data/maps/valley.json");
  gameMod.create({ json, rules: { zombieAggro: false, survival: true } });
  const S = gameMod.state;
  const me = S.player;
  const W = tuningMod.water;
  const bag = inventoryMod.bagOf(me);
  const belt = inventoryMod.beltOf(me);
  const mk = (id, n = 1, p = {}) => itemsMod.makeEntry(id, n, p);
  const finish = () => { for (let i = 0; i < 1200 && me.action; i++) interactMod.updateAction(me, 0.1); };
  const said = [];
  const logged = [];
  const opened = [];
  const onOpen = (e) => opened.push(e);
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  logMod.setSink((t) => { logged.push(t); return true; });
  eventsMod.on("containerOpened", onOpen);
  const card = (e) => itemInfoMod.textOf(itemInfoMod.cardFor(e));
  try {
    // Open ground with a lit campfire beside it.
    let spot = null;
    const [bx, by, bw, bh] = json.bounds;
    for (let y = by + 20; y < by + bh && !spot; y += 3) for (let x = bx + 20; x < bx + bw && !spot; x += 3) {
      mapMod.ensureAround(x, y, 1);
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 2 && ok; dx++) ok = mapMod.isWalkableTile(x + dx, y + dy) && !mapMod.tileAt(x + dx, y + dy).prop && mapMod.tileAt(x + dx, y + dy).room === 0 && !mapMod.drinkableAt(x + dx, y + dy) && !mapMod.itemsAt(x + dx, y + dy).length;
      if (ok) spot = [x, y];
    }
    assert(spot, "no open ground in the valley");
    me.gx = spot[0];
    me.gy = spot[1];
    const fire = mapMod.createProp({ sprite: "campfire", tile: [spot[0] + 1, spot[1]], fuel: 3, lit: true });
    mapMod.placeProp(fire, spot[0] + 1, spot[1]);
    bag.items.length = 0;
    belt.fill(null);
    me.hands.main = null;
    me.hands.off = null;
    const onFire = { kind: "prop", id: fire.id };
    const fireLabels = () => interactMod.actionsForTarget(onFire, me).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}`);
    const cap = itemsMod.getItem("bucket").vessel.capacity;

    // ---- 1. a bucket boiled: its menu, the fire's, Use, a guest's two commands, the belt and the hand ----
    assert(W.bucketBoilSeconds === 60 && W.boilSeconds === 30, `the levers: ${W.bucketBoilSeconds}, ${W.boilSeconds}`);
    const b1 = mk("bucket", 1, { fill: cap });
    gridMod.insert(bag, b1);
    const boilOf = (e) => interactMod.itemMenu(me, e, bag, null).find((m) => m.label.startsWith("Boil water"));
    assert(boilOf(b1) && boilOf(b1).enabled && boilOf(b1).label === "Boil water", `the bucket's menu: ${boilOf(b1) && boilOf(b1).label}`);
    assert(fireLabels().includes(waterMod.BOIL_BUCKET) && !fireLabels().some((l) => l.startsWith("Boil water (")), `the fire's menu with a tainted bucket and no tainted skin: ${fireLabels().join(", ")}`);
    boilOf(b1).onSelect();
    assert(me.action && me.action.action.duration === W.bucketBoilSeconds, `the bucket's menu bar: ${me.action && me.action.action.duration}`);
    finish();
    assert(b1.clean === true && b1.fill === cap && !boilOf(b1), `the bucket's menu did not boil it: ${JSON.stringify(b1)}`);
    assert(card(b1).includes("Clean water.") && fireLabels().includes(`${waterMod.BOIL_BUCKET} (no tainted water in it) [off]`), `clean: ${card(b1).join(" | ")}; ${fireLabels().join(", ")}`);
    const b2 = mk("bucket", 1, { fill: 50 });
    gridMod.insert(bag, b2);
    interactMod.performByLabel(me, onFire, waterMod.BOIL_BUCKET);
    assert(me.action && me.action.action.duration === W.bucketBoilSeconds && me.action.action.label === waterMod.BOIL_BUCKET, "the fire's menu did not start the bucket's bar");
    finish();
    assert(b2.clean === true && b2.fill === 50, `the fire's menu did not boil the bucket: ${JSON.stringify(b2)}`);
    const b3 = mk("bucket", 1, { fill: cap });
    gridMod.insert(bag, b3);
    useMod.applyWith(b3, { kind: "prop", prop: fire }, me);
    assert(me.action && me.action.action.duration === W.bucketBoilSeconds, "Use on the fire did not start the bucket's bar");
    finish();
    assert(b3.clean === true, "Use did not boil the bucket");
    gridMod.remove(bag, b1); gridMod.remove(bag, b2); gridMod.remove(bag, b3);
    const b4 = mk("bucket", 1, { fill: cap });
    gridMod.insert(bag, b4);
    assert(invActionsMod.performUseCommand(me, { uid: b4.uid, src: { kind: "bag", bag: { mine: true } }, target: { kind: "prop", id: fire.id } }, null) && me.action, "a guest's Use command did not start the bar");
    finish();
    const b5 = mk("bucket", 1, { fill: cap });
    gridMod.insert(bag, b5);
    assert(invActionsMod.performItemCommand(me, { op: "menu", label: "Boil water", uid: b5.uid, src: { kind: "bag", bag: { mine: true } } }) && me.action, "a guest's menu command did not start the bar");
    finish();
    assert(b4.clean && b5.clean, "a guest's commands did not boil the buckets");
    gridMod.remove(bag, b4); gridMod.remove(bag, b5);
    belt[2] = mk("bucket", 1, { fill: 30 });
    const beltBoil = interactMod.slotMenu(me, "belt:2").find((m) => m.label === "Boil water");
    me.hands.main = mk("bucket", 1, { fill: 30 });
    const handBoil = interactMod.slotMenu(me, "hand:main").find((m) => m.label === "Boil water");
    assert(beltBoil && handBoil, `the belt's and the hand's Boil water: ${!!beltBoil}, ${!!handBoil}`);
    handBoil.onSelect();
    finish();
    assert(me.hands.main.clean === true, "the hand's Boil water did not boil the bucket");
    belt[2] = null;
    me.hands.main = null;
    me.hands.off = null;

    // ---- 2. a bucket poured into a skin ----
    const pour = (b, s) => { logged.length = 0; useMod.applyWith(b, { kind: "item", entry: s }, me); return logged.join(" / "); };
    const clean = mk("bucket", 1, { fill: cap, clean: true });
    const empty = mk("waterskin", 1, { fill: 0 });
    gridMod.insert(bag, clean);
    gridMod.insert(bag, empty);
    const l1 = pour(clean, empty);
    assert(empty.fill === 100 && empty.clean === true && clean.fill === 0, `clean into an empty skin: ${JSON.stringify(empty)}, bucket ${clean.fill}; "${l1}"`);
    const tainted = mk("bucket", 1, { fill: cap });
    gridMod.insert(bag, tainted);
    empty.fill = 40;
    const l2 = pour(tainted, empty);
    assert(l2 === waterMod.WOULD_TAINT && empty.fill === 40 && empty.clean === true && tainted.fill === cap, `tainted into clean: "${l2}", skin ${JSON.stringify(empty)}`);
    const tSkin = mk("waterskin", 1, { fill: 30 });
    gridMod.insert(bag, tSkin);
    pour(tainted, tSkin);
    assert(tSkin.fill === 100 && !tSkin.clean && tainted.fill === cap - 70, `tainted into tainted: ${JSON.stringify(tSkin)}, bucket ${tainted.fill}`);
    const eSkin = mk("waterskin", 1, { fill: 0, clean: true });
    gridMod.insert(bag, eSkin);
    pour(tainted, eSkin);
    assert(eSkin.fill === 30 && !eSkin.clean && tainted.fill === 0, `tainted into an empty skin: ${JSON.stringify(eSkin)}, bucket ${tainted.fill}`);
    const l3 = pour(tainted, eSkin);
    assert(l3 === "The bucket is empty.", `an empty bucket: "${l3}"`);
    clean.fill = cap;
    clean.clean = true;
    tSkin.fill = 20;
    pour(clean, tSkin);
    assert(tSkin.fill === 100 && !tSkin.clean, `clean into a tainted skin stays tainted: ${JSON.stringify(tSkin)}`);
    // A guest's Use command by the two uids; a skin in a chest is not carried.
    clean.fill = cap;
    clean.clean = true;
    const gSkin = mk("waterskin", 1, { fill: 10, clean: true });
    belt[2] = gSkin;
    assert(invActionsMod.performUseCommand(me, { uid: clean.uid, src: { kind: "bag", bag: { mine: true } }, target: { kind: "item", uid: gSkin.uid, slot: "belt:2" } }, null) && gSkin.fill === 100 && gSkin.clean === true && clean.fill === 10, `a guest's pour into a belt skin: ${JSON.stringify(gSkin)}, bucket ${clean.fill}`);
    belt[2] = null;
    const bc = card(clean).join(" | ");
    assert(/Use on [^|]*waterskin[^|]*: pour\./.test(bc) && /Use on fire[^|]*: boil\./.test(bc) && card(gSkin).some((l) => l.includes("fill it at water, or from a bucket.")), `the cards: ${bc} || ${card(gSkin).join(" | ")}`);
    bag.items.length = 0;

    // ---- 3. Burn corpse for a tinderbox alone, and a lit torch Used on a body ----
    const WB = tuningMod.work.burnCorpse;
    assert(WB.fuel === undefined, `the data still names a fuel: ${WB.fuel}`);
    const lay = (dx) => { const z = S.zombies.find((q) => !q.dead && !q.corpse); Object.assign(z, { dead: true, corpse: true, gx: me.gx + dx, gy: me.gy + 0.5, cremate: false, burning: false }); return z; };
    const z1 = lay(1);
    const label = () => interactMod.actionsForTarget({ kind: "character", id: z1.id }, me).map((a) => a.label).find((l) => l.startsWith("Burn corpse"));
    const lNone = label();
    me.hands.main = mk("tinderbox");
    const lReady = label();
    const r1 = verbsMod.run("burncorpse", worldMod.world, me, { character: z1.id });
    assert(lNone === "Burn corpse (need a tinderbox or a lit torch)" && lReady === "Burn corpse" && r1.ok && z1.cremate && inventoryMod.countAll(me, "tinderbox") === 1 && inventoryMod.countAll(me, "log") === 0, `${lNone}; ${lReady}; ${r1.reason || r1.message}; tinderboxes ${inventoryMod.countAll(me, "tinderbox")}`);
    me.hands.main = mk("torch");
    const z2 = lay(-1);
    logged.length = 0;
    useMod.applyWith(me.hands.main, { kind: "character", ch: z2 }, me);
    const unlit = logged.join(" / ");
    me.hands.main.lit = true;
    useMod.applyWith(me.hands.main, { kind: "character", ch: z2 }, me);
    assert(unlit === "The torch is not lit." && z2.cremate && z2.burning && me.hands.main.lit === true && me.hands.main.id === "torch", `a torch on a body: unlit "${unlit}", then cremate ${z2.cremate}`);
    const z3 = lay(1.5);
    const find = (id) => S.corpses.find((c) => c.id === id) || S.zombies.find((c) => c.id === id) || null;
    assert(invActionsMod.performUseCommand(me, { uid: me.hands.main.uid, src: { kind: "slot", id: "hand:main" }, target: { kind: "character", id: z3.id } }, find) && z3.cremate, "a guest's Use of a lit torch on a body did not burn it");
    const bcard = burnMod.burnCard(me).lines.map((l) => l.map((s) => s.t).join("")).join(" | ");
    assert(bcard.includes("Needs a tinderbox carried or a lit torch in hand; nothing is spent.") && bcard.includes("Use a lit torch on the body to burn it too.") && card(me.hands.main).some((l) => l === "Use on a body of the dead: burn."), `the cards: ${bcard} || ${card(me.hands.main).join(" | ")}`);
    // The menu's Burn corpse with a lit torch in hand and no tinderbox (Michael, 2026-10-26), greyed with neither.
    const z4 = lay(-1.5);
    const torch4 = me.hands.main;
    const l4 = () => interactMod.actionsForTarget({ kind: "character", id: z4.id }, me).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}`).find((l) => l.startsWith("Burn corpse"));
    torch4.lit = false;
    const lNeither = l4();
    torch4.lit = true;
    const lTorch = l4();
    const r4 = verbsMod.run("burncorpse", worldMod.world, me, { character: z4.id });
    assert(inventoryMod.countAll(me, "tinderbox") === 0 && lNeither === "Burn corpse (need a tinderbox or a lit torch) [off]" && lTorch === "Burn corpse" && r4.ok && z4.cremate && torch4.lit, `the menu with a torch: ${lNeither}; ${lTorch}; ${r4.reason || r4.message}`);
    for (const z of [z1, z2, z3, z4]) Object.assign(z, { cremate: false, burning: false });
    me.hands.main = null;

    // ---- 4. sleep's speed, and waking early ----
    assert(tuningMod.player.sleepTimeScale === 20 && tuningMod.feel.sleepFadeSeconds === 1, `the levers: ${tuningMod.player.sleepTimeScale}, ${tuningMod.feel.sleepFadeSeconds}`);
    me.sleeping = { bed: "none", since: loopMod.simTime(), hour: 22 };
    const scale = gameMod.timeScaleNow();
    me.sleeping = null;
    assert(scale === 20 && gameMod.timeScaleNow() === 1, `asleep the world runs at ${scale}`);
    // Any key or click wakes a sleeper early (Michael, 2026-10-26): `wakeEvents` makes the snapshot's `wake` once the client has seen its player
    // asleep a step, and the world's step (updateInteract) gets it up, the press doing nothing else.
    const bedProp = [...mapMod.allProps()].find((p) => getDef(p.sprite).sleep);
    playerMod.startSleep(me, bedProp);
    inputMod.tap("KeyX");
    const firstStep = interactMod.wakeEvents(me);
    inputMod.endStep();
    const quiet = interactMod.wakeEvents(me);
    inputMod.tap("KeyX");
    const pressed = interactMod.wakeEvents(me);
    inputMod.endStep();
    interactMod.updateInteract(me, 1 / 60, pressed);
    assert(firstStep === null && quiet === null && pressed && pressed.wake === true && !me.sleeping && gameMod.timeScaleNow() === 1 && interactMod.wakeEvents(me) === null, `waking early: first step ${JSON.stringify(firstStep)}, quiet ${JSON.stringify(quiet)}, pressed ${JSON.stringify(pressed)}, asleep ${!!me.sleeping}`);
    const netText = fs.readFileSync(new URL("../src/net.js", import.meta.url), "utf8");
    assert(/const KEY_EVENTS = \[[^\]]*"wake"/.test(netText), "the host's filter drops a guest's wake");

    // ---- 5. container items opened where they lie ----
    const [tx, ty] = [Math.round(me.gx), Math.round(me.gy)];
    const gBelt = mk("good_belt");
    inventoryMod.ensureSlots(gBelt);
    const sword = mk("sword");
    const pem = mk("pemmican", 5);
    gBelt.slots[0] = sword;
    gBelt.slots[2] = pem;
    mapMod.dropItem(tx, ty, gBelt);
    const onBelt = { kind: "item", tile: [tx, ty], uid: gBelt.uid };
    const beltName = itemsMod.getItem("good_belt").name.toLowerCase();
    const bl = interactMod.actionsForTarget(onBelt, me);
    const openA = bl.find((a) => a.label === `Open ${beltName}`);
    assert(openA && openA.simple && bl.some((a) => a.label.startsWith("Pick up") && a.enabled === false), `the belt's menu: ${bl.map((a) => `${a.label}${a.simple ? " (E)" : ""}`).join(", ")}`);
    opened.length = 0;
    interactMod.performByLabel(me, onBelt, `Open ${beltName}`);
    finish();
    const ev = opened[0];
    assert(ev && ev.bag && ev.bag.takeOnly && ev.bag.items.length === 2 && ev.address && ev.address.entryUid === gBelt.uid && interactMod.containerAt(me, ev.address).bag === ev.bag, `the belt's view: ${ev ? JSON.stringify({ n: ev.bag.items.length, a: ev.address }) : "nothing opened"}`);
    assert(!gridMod.fits(ev.bag, "bread", 3, 0) && gridMod.add(ev.bag, "pemmican", 3) === 0 && pem.count === 5, "the belt's view took something in");
    const outputs0 = [...mapMod.allProps()].filter((p) => p.output).length;
    assert(interactMod.addressOfBag(me, ev.bag) && interactMod.addressOfBag(me, ev.bag).entryUid === gBelt.uid, "the view's address not found again");
    assert([...mapMod.allProps()].filter((p) => p.output).length === outputs0, "addressOfBag made a prop's output bag (a hit test must change nothing)");
    // A partial take (the review of #508): the sword alone by a guest's grid command from the view's address. An entry's place in the view is its
    // slot's alone, so the belt sent to a guest and laid out afresh there puts the pemmican where the host's view has it, and the map agrees.
    const col = Math.max(...itemsMod.allItems().filter((d) => d.hands || d.kind === "food" || d.capacity || d.belt === true).map((d) => (d.size || [1, 1])[0]));
    const sSpot = gridMod.findSpot(bag, "sword");
    assert(invActionsMod.performItemCommand(me, { op: "grid", uid: sword.uid, src: { kind: "bag", bag: ev.address }, bag: { mine: true }, x: sSpot.x, y: sSpot.y, rot: sSpot.rot }) && !gBelt.slots[0] && gBelt.slots[2] === pem && bag.items.includes(sword), `the partial take: slots ${JSON.stringify(gBelt.slots.map((s) => s && s.id))}`);
    interactMod.containerAt(me, ev.address); // the host's panel finds it again, as it does every step
    const sent = JSON.parse(JSON.stringify(gBelt)); // the belt as its chunk carries it to a guest
    inventoryMod.slotsView(sent); // the guest's panel lays its own copy out
    assert(pem.x === 2 * col && sent.slots[2].x === pem.x && JSON.stringify(sent) === JSON.stringify(gBelt), `the replica's layout after a partial take: host x ${pem.x}, guest x ${sent.slots[2].x} (a column ${col})`);
    // Take All by its address, as a guest's command names it: the belt itself emptied, nothing doubled.
    const tookBelt = invActionsMod.performItemCommand(me, { op: "takeall", bag: ev.address });
    const census = gameMod.itemCensus();
    assert(tookBelt && gBelt.slots.every((s) => !s) && inventoryMod.countAll(me, "pemmican") === 5 && inventoryMod.countAll(me, "sword") === 1 && census.dups.length === 0, `Take All from the belt: slots ${JSON.stringify(gBelt.slots.map((s) => s && s.id))}; dups ${census.dups.length}`);
    assert(interactMod.actionsForTarget(onBelt, me).some((a) => a.label.startsWith("Pick up") && a.enabled !== false && a.simple), "the emptied belt is not picked up by E");
    mapMod.takeItem(tx, ty, gBelt);
    bag.items.length = 0;
    belt.fill(null);
    // A satchel holding something in a chest: Open on its menu there, by a guest's menu command, its Take All by the nested address.
    const chest = mapMod.createProp({ sprite: "chest", tile: [spot[0], spot[1] + 1] });
    mapMod.placeProp(chest, spot[0], spot[1] + 1);
    const cBag = interactMod.propBag(chest);
    chest.searched = true;
    cBag.items.length = 0;
    const sat = mk("satchel");
    inventoryMod.ensureBag(sat);
    gridMod.insert(sat.bag, mk("bread"));
    gridMod.insert(sat.bag, mk("apple"));
    gridMod.insert(cBag, sat);
    const satName = itemsMod.getItem("satchel").name.toLowerCase();
    const sMenu = interactMod.itemMenu(me, sat, cBag, bag).map((m) => m.label);
    assert(sMenu.includes(`Open ${satName}`) && !interactMod.itemMenu(me, mk("satchel"), bag, null).some((m) => m.label.startsWith("Open")), `the satchel's menu in the chest: ${sMenu.join(", ")}`);
    opened.length = 0;
    assert(invActionsMod.performItemCommand(me, { op: "menu", label: `Open ${satName}`, uid: sat.uid, src: { kind: "bag", bag: { propId: chest.id } } }), "a guest's Open command did not run");
    const ev2 = opened[0];
    assert(ev2 && ev2.bag.takeOnly && ev2.bag.items === sat.bag.items && ev2.within && ev2.within.propId === chest.id && ev2.address.entryUid === sat.uid && interactMod.containerAt(me, ev2.address).bag === ev2.bag, `the satchel opened: ${ev2 ? JSON.stringify(ev2.address) : "nothing"}`);
    // Take-only, a bag opened inside another (Primary's reading on the review of #508): a guest's grid command putting bread into it is refused,
    // and nothing in it offers Open, so nothing opens two levels deep.
    const bread2 = mk("bread");
    gridMod.insert(bag, bread2);
    invActionsMod.performItemCommand(me, { op: "grid", uid: bread2.uid, src: { kind: "bag", bag: { mine: true } }, bag: ev2.address, x: 4, y: 3, rot: false });
    assert(bag.items.includes(bread2) && sat.bag.items.length === 2 && !interactMod.itemMenu(me, mk("small_sack"), ev2.bag, bag).some((m) => /^Open/.test(m.label)), `into the nested satchel: bread in my bag ${bag.items.includes(bread2)}, the satchel holds ${sat.bag.items.length}`);
    gridMod.remove(bag, bread2);
    invActionsMod.performItemCommand(me, { op: "takeall", bag: ev2.address });
    assert(sat.bag.items.length === 0 && inventoryMod.countAll(me, "bread") === 1 && inventoryMod.countAll(me, "apple") === 1 && cBag.items.includes(sat), `Take All from the satchel in the chest: left ${sat.bag.items.length}`);
    mapMod.removeProp(chest);
    bag.items.length = 0;
    // Never a container inside my own bag (the review of #508: a crafted command filled one): the nested address within { mine } finds nothing.
    const mySat = mk("satchel");
    inventoryMod.ensureBag(mySat);
    gridMod.insert(bag, mySat);
    const bread3 = mk("bread");
    gridMod.insert(bag, bread3);
    const ranMine = invActionsMod.performItemCommand(me, { op: "grid", uid: bread3.uid, src: { kind: "bag", bag: { mine: true } }, bag: { entryUid: mySat.uid, within: { mine: true } }, x: 0, y: 0, rot: false });
    assert(!ranMine && mySat.bag.items.length === 0 && interactMod.containerAt(me, { entryUid: mySat.uid, within: { mine: true } }) === null, `a satchel in my own bag filled: ran ${ranMine}, holds ${mySat.bag.items.length}`);
    bag.items.length = 0;
    // A belt on a body of the dead: Open on its menu in the body's grid, its view by the body's address.
    const zb = lay(1);
    zb.cremate = false;
    const loot = characterMod.lootOf(zb);
    const bBelt = mk("belt");
    inventoryMod.ensureSlots(bBelt);
    bBelt.slots[1] = mk("knife");
    gridMod.insert(loot, bBelt);
    opened.length = 0;
    const bOpen = interactMod.itemMenu(me, bBelt, loot, bag).find((m) => m.label === `Open ${itemsMod.getItem("belt").name.toLowerCase()}`);
    if (bOpen) bOpen.onSelect();
    const ev3 = opened[0];
    assert(ev3 && ev3.within && ev3.within.characterId === zb.id && ev3.bag.items.length === 1, `a belt on a body: ${ev3 ? JSON.stringify(ev3.address) : "nothing"}`);
    invActionsMod.performItemCommand(me, { op: "takeall", bag: ev3.address });
    assert(bBelt.slots.every((s) => !s) && inventoryMod.countAll(me, "knife") === 1, "Take All from the body's belt");
    bag.items.length = 0;
    belt.fill(null);

    // ---- 6. a stack dropped on a matching stack fills it ----
    const h = invActionsMod.createInventoryActions(() => me);
    const a15 = mk("arrow", 15);
    const a10 = mk("arrow", 10);
    const put = (e) => { Object.assign(e, gridMod.findSpot(bag, e.id)); bag.items.push(e); }; // placed apart as they are (grid.insert would top one up)
    put(a15);
    put(a10);
    assert(a15.count === 15 && a10.count === 10 && bag.items.length === 2, "the arrows are not two stacks in the bag");
    const moved = gridMod.moveEntry(bag, bag, a10, a15.x, a15.y, false);
    assert(moved === "partial" && a15.count === 20 && a10.count === 5 && bag.items.includes(a10), `bag cell onto bag cell: ${moved}, ${a15.count} and ${a10.count}`);
    bag.items.length = 0;
    me.hands.main = mk("throwing_knife", 12);
    const k15 = mk("throwing_knife", 15);
    put(k15);
    h.placeInSlot(k15, { kind: "bag", bag }, "hand:main");
    assert(me.hands.main.count === 20 && k15.count === 7 && bag.items.includes(k15), `bag onto a hand: hand ${me.hands.main.count}, bag ${k15.count}`);
    said.length = 0;
    h.placeInSlot(k15, { kind: "bag", bag }, "hand:main");
    assert(said.includes(invActionsMod.STACK_FULL) && me.hands.main.count === 20 && k15.count === 7, `onto a full stack: "${said.join(" / ")}"`);
    belt[2] = mk("pemmican", 12);
    const p15 = mk("pemmican", 15);
    bag.items.length = 0;
    put(p15);
    assert(invActionsMod.performItemCommand(me, { op: "slot", uid: p15.uid, src: { kind: "bag", bag: { mine: true } }, slot: "belt:2" }) && belt[2].count === 20 && p15.count === 7, `a guest's slot command onto a belt stack: ${belt[2].count}, ${p15.count}`);
    belt[2].count = 8;
    p15.count = 15;
    assert(invActionsMod.performItemCommand(me, { op: "grid", uid: belt[2].uid, src: { kind: "slot", id: "belt:2" }, bag: { mine: true }, x: p15.x, y: p15.y, rot: false }) && p15.count === 20 && belt[2] && belt[2].count === 3, `a guest's grid command from a slot onto a bag stack: bag ${p15.count}, slot ${belt[2] && belt[2].count}`);
    h.placeInGrid(belt[2], { kind: "slot", id: "belt:2" }, bag, p15.x, p15.y, false);
    assert(belt[2] && belt[2].count === 3 && p15.count === 20, "a slot onto a full bag stack moved something");
    p15.count = 10;
    h.placeInGrid(belt[2], { kind: "slot", id: "belt:2" }, bag, p15.x, p15.y, false);
    assert(!belt[2] && p15.count === 13, `the whole of a slot's stack poured in empties the slot: ${belt[2] && belt[2].count}, ${p15.count}`);
    // An entry with its own state never merges: a coated stack of knives onto a plain one swaps, both whole, the coat kept; in the grid it is refused.
    bag.items.length = 0;
    me.hands.main = mk("throwing_knife", 5);
    const coated = mk("throwing_knife", 6, { poison: { tier: 1, hits: 4 } });
    gridMod.insert(bag, coated);
    h.placeInSlot(coated, { kind: "bag", bag }, "hand:main");
    assert(me.hands.main === coated && coated.count === 6 && coated.poison && bag.items.some((e) => e.id === "throwing_knife" && e.count === 5 && !e.poison), `a coated stack onto a plain one: hand ${me.hands.main.count} ${!!me.hands.main.poison}; bag ${bag.items.map((e) => `${e.id}x${e.count}${e.poison ? "p" : ""}`).join(",")}`);
    const plain = bag.items.find((e) => e.id === "throwing_knife");
    me.hands.main = null;
    gridMod.insert(bag, coated);
    assert(coated.count === 6 && plain.count === 5 && bag.items.includes(coated), "grid.insert poured a coated stack into a plain one");
    assert(gridMod.moveEntry(bag, bag, coated, plain.x, plain.y, false) === null && coated.count === 6 && plain.count === 5, "a coated stack merged in the grid");
    assert(itemsMod.hasOwnState({ id: "arrow", fill: 0 }) && !itemsMod.hasOwnState({ id: "arrow", count: 3, x: 1, y: 2, rot: false, uid: "e1" }) && !itemsMod.canMerge(mk("waterskin"), mk("waterskin")), "the own-state rule");
    bag.items.length = 0;
    belt.fill(null);
    return `a bucket boiled in ${W.bucketBoilSeconds} s by its menu, the fire's, Use, a guest's two commands, the belt and the hand; poured clean into clean, tainted into tainted and empty, refused "${waterMod.WOULD_TAINT}", by a guest's Use too; Burn corpse with a tinderbox alone, a lit torch's Use, a guest's; sleep at 20; a belt on the ground, a satchel in a chest, a belt on a body opened and emptied by their addresses; stacks filled in a bag, a hand, a belt slot, by a guest's commands, the rest kept, a coated stack never merged`;
  } finally {
    promptMod.setMessageSink(null);
    logMod.setSink(null);
    eventsMod.off("containerOpened", onOpen);
  }
});

// The fires (Michael, 2026-10-26, the fire rulings under Round rooms: a spec; 2026-10-27, the build menu holds only what cannot be carried):
// the Fireplace is the palette's in place of the hearth, two tiles along a flat wall indoors, its facing from the wall it backs onto, built
// through the one path a guest's command takes (placement.performPlacement), a switch out when built, cooking, never carried, taken apart only
// out for half its stone; its record in the chunk and back.
check("the fires: the Fireplace built along a wall by a guest's command, its facing from the wall, a switch that cooks, taken apart only out", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  const free0 = rulesMod.rules.freeBuilding;
  try {
    rulesMod.rules.freeBuilding = false;
    const entry = placementMod.buildKinds().find((k) => k.id === "fireplace");
    assert(entry && entry.kind === "prop" && entry.sprite === "fireplace" && entry.stand === "wall" && entry.cost.stone === 6, `the palette's fireplace: ${JSON.stringify(entry)}`);
    assert(!placementMod.buildKinds().some((k) => k.id === "hearth" || k.sprite === "hearth"), "the hearth is still in the palette");
    mapMod.ensureAround(me.gx, me.gy, 3);
    // An anchor in the cottage's room for each facing: a west wall (y) and a north wall (x).
    const fits = {};
    const x0 = Math.round(me.gx);
    const y0 = Math.round(me.gy);
    for (let dy = -12; dy <= 12; dy++) for (let dx = -14; dx <= 14; dx++) {
      const f = setdownMod.fitAt("wall", "fireplace", x0 + dx, y0 + dy);
      if (!f.problem && !fits[f.facing]) fits[f.facing] = f;
    }
    assert(fits.y && fits.x, `no wall for both facings near the spawn: ${Object.keys(fits).join(",") || "none"}`);
    assert(JSON.stringify(fits.y.footprint) === "[1,2]" && JSON.stringify(fits.x.footprint) === "[2,1]", `the footprints: ${JSON.stringify(fits.y.footprint)}, ${JSON.stringify(fits.x.footprint)}`);
    const tY = mapMod.peekTile(fits.y.tx, fits.y.ty);
    const tX = mapMod.peekTile(fits.x.tx, fits.x.ty);
    assert(tY.w && tY.w.kind === "wall" && tX.n && tX.n.kind === "wall", "a facing does not back onto its wall");
    // Refusals: outdoors, and in the open of a room.
    let outdoors = null;
    let open = null;
    for (let dy = -14; dy <= 14 && !(outdoors && open); dy++) for (let dx = -16; dx <= 16 && !(outdoors && open); dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      const t = mapMod.peekTile(x, y);
      if (!t) continue;
      const p = setdownMod.fitAt("wall", "fireplace", x, y).problem;
      if (!outdoors && !(t.room > 0) && p === "Indoors only") outdoors = [x, y];
      if (!open && t.room > 0 && p === "Against a wall") open = [x, y];
    }
    assert(outdoors && open, `the refusals: outdoors ${outdoors}, the open floor ${open}`);
    // The ghost's search finds a fit from either of its tiles: the second tile of the west-wall fit points back at the same anchor.
    const via2 = setdownMod.fitFor("wall", "fireplace", fits.y.tx, fits.y.ty + 1);
    assert(!via2.problem && via2.ty === fits.y.ty && via2.tx === fits.y.tx, `the ghost from the second tile: ${JSON.stringify(via2)}`);
    // Built by a guest's command (the anchor alone), paid in stone, with no fuel: a switch, out, made, cooking.
    const bag = inventoryMod.bagOf(me);
    bag.items.length = 0;
    me.worn.back = itemsMod.makeEntry("rucksack", 1);
    const bag2 = inventoryMod.bagOf(me);
    inventoryMod.addItem(bag2, "stone", 6);
    const built = [];
    for (const facing of ["y", "x"]) {
      const f = fits[facing];
      me.gx = f.tx + (facing === "x" ? 0.5 : 0.85); // clear of its tiles: a body over one would be trapped (fix/overlap-traps)
      me.gy = f.ty + (facing === "x" ? 1.2 : 0.5);
      inventoryMod.addItem(bag2, "stone", facing === "y" ? 0 : 6);
      const before = gameMod.syncParts().map;
      placementMod.performPlacement(me, { kind: "build", what: "fireplace", tx: f.tx, ty: f.ty });
      const p = mapMod.peekTile(f.tx, f.ty).prop;
      assert(p && p.sprite === "fireplace", `nothing built facing ${facing}: "${said[said.length - 1]}"`);
      built.push(p);
      assert(p.facing === facing && JSON.stringify(p.footprint) === JSON.stringify(f.footprint) && p.tiles.length === 2 && p.tiles.every(([x, y]) => mapMod.peekTile(x, y).prop === p), `facing ${facing}: ${p.facing} ${JSON.stringify(p.footprint)}`);
      assert(p.made === true && p.fire.switch && p.fire.room && p.fire.cooks && !p.fire.lit && stationsMod.stationOf(p).length > 0 && !placementMod.canCarry(p), `facing ${facing}: made ${p.made}, lit ${p.fire.lit}, a station ${stationsMod.stationOf(p).length}, carried ${placementMod.canCarry(p)}`);
      assert(inventoryMod.countAll(me, "stone") === 0, `the six stone not paid: ${inventoryMod.countAll(me, "stone")} left`);
      assert(gameMod.syncParts().map !== before, "the build did not move the map's sync part");
    }
    // Its record carries the footprint (the facing when it is not the one the footprint gives), and each comes back from it as it stood.
    const C = mapMod.CHUNK;
    for (let i = 0; i < built.length; i++) {
      const p = built[i];
      const rec = JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(Math.floor(p.tile[0] / C), Math.floor(p.tile[1] / C), false))));
      const pr = rec.props.find((q) => q.id === p.id);
      assert(pr && JSON.stringify(pr.footprint) === JSON.stringify(p.footprint) && pr.made === true, `the record: ${JSON.stringify(pr)}`);
      mapMod.installChunk(rec);
      for (const q of rec.props) mapMod.installProp(q); // as a restore and a guest's frame do (map.restoreMap)
      const back = mapMod.propById(p.id);
      assert(back && back.facing === p.facing && JSON.stringify(back.tiles) === JSON.stringify(p.tiles) && back.fire.switch, `back from the record: ${back && back.facing} ${JSON.stringify(back && back.tiles)}`);
    }
    const p0 = mapMod.propById(built[0].id); // the one standing now (both may be on one chunk, installed twice)
    // Lit with a tinderbox (a switch: no fuel), refused Take apart while lit, put out with nothing, taken apart for three stone.
    const box = itemsMod.makeEntry("tinderbox", 1);
    gridMod.insert(bag2, box);
    me.gx = p0.tile[0] + 0.6;
    me.gy = p0.tile[1] + 0.5;
    const lit = verbsMod.run("light", worldMod.world, me, { prop: p0.id });
    assert(lit.ok && p0.fire.lit && p0.fire.fuel === 0, `lit: ${JSON.stringify(lit)}, fuel ${p0.fire.fuel}`);
    assert(placementMod.holdsProblem(p0) === "Put it out first.", `a lit fireplace's Take apart: "${placementMod.holdsProblem(p0)}"`);
    placementMod.performPlacement(me, { kind: "remove", target: { type: "prop", id: p0.id } });
    assert(mapMod.propById(p0.id) === p0, "a lit fireplace was taken apart");
    const out = verbsMod.run("putout", worldMod.world, me, { prop: p0.id });
    assert(out.ok && !p0.fire.lit, `put out: ${JSON.stringify(out)}`);
    placementMod.performPlacement(me, { kind: "remove", target: { type: "prop", id: p0.id } });
    assert(!mapMod.propById(p0.id) && inventoryMod.countAll(me, "stone") === 3, `taken apart: ${!mapMod.propById(p0.id)}, ${inventoryMod.countAll(me, "stone")} stone`);
    return `the west wall's fireplace at ${fits.y.tx},${fits.y.ty} facing y, the north wall's at ${fits.x.tx},${fits.x.ty} facing x; refused outdoors and on open floor; built by the command, six stone, a switch out, a cooking station; lit, refused apart, put out, three stone back`;
  } finally {
    rulesMod.rules.freeBuilding = free0;
    promptMod.setMessageSink(null);
  }
});

// The engine's cut of a 2 by 2 picture into three screen columns (the fire pit, whose art comes separately), proved on a dev picture of
// the check's own: every pixel coloured by its column, each slice holding its own column alone, the back tile none, each slice's anchor
// moved by its tile's offset so it lands where the whole would, the flame's tile from `at`; and the two-tile cut as it always was.
const assetsMod = await import("../src/assets.js");
const lightMod = await import("../src/light.js");
check("the fires: a 2 by 2 picture cut into three screen columns, each sorted by its own tile, the flame on the slice that holds it; two-tile pieces cut as before", () => {
  const W = 128;
  const H = 116;
  const a = [64, 64]; // the back tile's centre, as the fire pit's picture has it
  const fp = [2, 2];
  const col = (u) => (u < a[0] - 32 ? 2 : u >= a[0] + 32 ? 1 : 3); // the expected owner, written out: the lines at the side tiles' centres
  const pic = new Uint8ClampedArray(W * H * 4);
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) { const k = (v * W + u) * 4; pic[k] = col(u) * 60; pic[k + 3] = 255; }
  const shown = [];
  for (let i = 0; i < 4; i++) {
    const d = assetsMod.maskSlice(pic.slice(), W, H, a, fp, i);
    let n = 0;
    let wrong = 0;
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) { const k = (v * W + u) * 4; if (d[k + 3]) { n++; if (d[k] !== i * 60) wrong++; } }
    assert(!wrong, `slice ${i} holds ${wrong} pixels of another column`);
    shown.push(n);
  }
  assert(shown[0] === 0 && shown[1] === (W - 96) * H && shown[2] === 32 * H && shown[3] === (96 - 32) * H, `the columns' pixels: ${shown.join(", ")}`);
  // Drawn at its own tile, each slice lands where the whole picture would at the anchor tile.
  const [tx, ty] = [40, 50];
  const at0 = isoMod.toScreen(tx, ty);
  for (let i = 1; i < 4; i++) {
    const [dx, dy] = [i % 2, Math.floor(i / 2)];
    const p = isoMod.toScreen(tx + dx, ty + dy);
    const o = assetsMod.sliceOffset(i, fp);
    assert(p.x - (a[0] + o[0]) === at0.x - a[0] && p.y - (a[1] + o[1]) === at0.y - a[1], `slice ${i} lands ${p.x - (a[0] + o[0]) - (at0.x - a[0])}, ${p.y - (a[1] + o[1]) - (at0.y - a[1])} off`);
  }
  assert(assetsMod.sliceTileAt(64, a, fp) === 3 && assetsMod.sliceTileAt(20, a, fp) === 2 && assetsMod.sliceTileAt(100, a, fp) === 1, "the flame's tile from `at`");
  // The drawn fire pit's layout (art round 6: 114 px wide, its anchor's top vertex at (58, 19)): the lines at x 26 and 90, its flames (`at` x 57)
  // in the middle column, its posts (x 10..16, 99..105) in the outer ones.
  const art = [58, 19 + 16];
  assert([25, 26, 89, 90, 57, 13, 102].map((u) => assetsMod.sliceTileAt(u, art, fp)).join("") === "2331321", "the drawn fire pit's columns");
  // The fire pit's own picture is cut so: its definition's footprint and facing.
  const def = getDef("fire_pit");
  assert(JSON.stringify(assetsMod.footprintOf(def)) === "[2,2]" && (def.placeholder ? def.placeholder.kind === "fire_pit" : !!(def.drawings && def.drawings.y)) && def.fire.radius === 5 && def.fire.room && def.fire.cooks && def.fire.switch && def.fire.maxFuel === 6 && def.fire.hoursPerUnit === 3 && def.fire.flicker.amp === 0.24 && def.carry === false, `the fire pit's definition: ${JSON.stringify(def.fire)}`);
  // Two tiles: the old rule, a column at the second tile's centre moved 9 px toward the first.
  for (const [f2, cut, second] of [[[1, 2], a[0] - 32 + 9, (u, c) => u < c], [[2, 1], a[0] + 32 - 9, (u, c) => u >= c]]) {
    for (let u = 0; u < W; u++) assert(assetsMod.sliceTileAt(u, a, f2) === (second(u, cut) ? 1 : 0), `the two-tile cut ${JSON.stringify(f2)} at ${u}`);
    assert(JSON.stringify(assetsMod.sliceOffset(1, f2)) === JSON.stringify(f2[1] === 2 ? [-32, 16] : [32, 16]), "a two-tile offset moved");
  }
  return `slices of ${shown.join(", ")} pixels (the back tile none), each landing in place; the flame on the middle column's; two-tile cuts unchanged`;
});

// The fire pit (the fire rulings, 2026-10-26): built from the palette 2 by 2 on open ground, indoors or out, by a guest's command; refused on
// water and where something stands, a road fine; a switch out when built, cooking, its light radius 5 outdoors and its room lit indoors;
// taken apart only out, half its stone.
check("the fires: the fire pit built by a guest's command indoors and out, refused on water, lighting at radius 5 outdoors and its room indoors, taken apart only out", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  const free0 = rulesMod.rules.freeBuilding;
  try {
    rulesMod.rules.freeBuilding = false;
    const entry = placementMod.buildKinds().find((k) => k.id === "fire_pit");
    assert(entry && entry.kind === "prop" && entry.sprite === "fire_pit" && entry.stand === "ground" && entry.cost.stone === 8, `the palette's fire pit: ${JSON.stringify(entry)}`);
    const x0 = Math.round(me.gx);
    const y0 = Math.round(me.gy);
    mapMod.ensureAround(me.gx, me.gy, 4);
    let out = null;
    let inside = null;
    let road = null;
    let water = null;
    for (let r = 0; r < 40 && !(out && inside && road && water); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx;
      const y = y0 + dy;
      const t = mapMod.peekTile(x, y);
      if (!t) continue;
      const p = setdownMod.fitAt("ground", "fire_pit", x, y).problem || (stationsMod.bodyOnTiles([[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) ? "body" : ""); // off the guide and any body (a build never covers one)
      const tiles = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].map(([a, b]) => mapMod.peekTile(a, b));
      if (!p && !out && tiles.every((q) => q && !(q.room > 0) && q.floor === "floor_grass")) out = [x, y];
      if (!p && !inside && t.room > 0) inside = [x, y];
      if (!p && !road && tiles.every((q) => q && /cobble|road|dirt/.test(q.floor))) road = [x, y];
      if (!water && p === "Not on water") water = [x, y];
    }
    assert(out && inside && water, `no spot: outdoors ${out}, indoors ${inside}, water ${water}`);
    assert(road, "no road wide enough for a fire pit near the spawn");
    // The ghost's fit is centred on the cursor, as a carried prop's: the footprint's middle the cursor's point (here its back tile, rounded so).
    const centred = setdownMod.fitFor("ground", "fire_pit", out[0], out[1]);
    assert(centred.tx === out[0] && centred.ty === out[1] && !centred.problem && JSON.stringify(centred.footprint) === "[2,2]", `the ghost's fit ${JSON.stringify(centred)}`);
    me.worn.back = itemsMod.makeEntry("rucksack", 1);
    const bag = inventoryMod.bagOf(me);
    bag.items.length = 0;
    const box = itemsMod.makeEntry("tinderbox", 1);
    gridMod.insert(bag, box);
    const buildAt = ([x, y]) => {
      inventoryMod.addItem(bag, "stone", 8);
      me.gx = x - 1.2;
      me.gy = y + 0.5;
      const before = gameMod.syncParts().map;
      placementMod.performPlacement(me, { kind: "build", what: "fire_pit", tx: x, ty: y });
      const p = mapMod.peekTile(x, y).prop;
      assert(p && p.sprite === "fire_pit", `nothing built at ${x},${y}: "${said[said.length - 1]}"`);
      assert(JSON.stringify(p.footprint) === "[2,2]" && p.tiles.length === 4 && p.tiles.every(([a, b]) => mapMod.peekTile(a, b).prop === p) && p.facing === "y", `its tiles: ${JSON.stringify(p.tiles)}, facing ${p.facing}`);
      assert(p.made && p.solid && p.fire.switch && !p.fire.lit && p.fire.radius === 5 && p.fire.room && stationsMod.stationOf(p).length > 0 && !placementMod.canCarry(p), `made ${p.made}, lit ${p.fire.lit}, radius ${p.fire.radius}, a station ${stationsMod.stationOf(p).length}`);
      assert(inventoryMod.countAll(me, "stone") === 0, `the eight stone not paid: ${inventoryMod.countAll(me, "stone")}`);
      assert(gameMod.syncParts().map !== before, "the build did not move the map's sync part");
      return p;
    };
    // Refused on water and on a tile taken, said to the acting player.
    me.gx = water[0] - 1.2;
    me.gy = water[1] + 0.5;
    inventoryMod.addItem(bag, "stone", 8);
    said.length = 0;
    placementMod.performPlacement(me, { kind: "build", what: "fire_pit", tx: water[0], ty: water[1] });
    assert(!(mapMod.peekTile(water[0], water[1]).prop && mapMod.peekTile(water[0], water[1]).prop.sprite === "fire_pit") && said.includes("Not on water"), `on water: "${said.join(" / ")}"`);
    inventoryMod.takeAll(me, "stone", 8);
    const pOut = buildAt(out);
    const pRoad = buildAt(road);
    const pIn = buildAt(inside);
    said.length = 0;
    inventoryMod.addItem(bag, "stone", 8);
    placementMod.performPlacement(me, { kind: "build", what: "fire_pit", tx: inside[0], ty: inside[1] });
    assert(mapMod.peekTile(inside[0], inside[1]).prop === pIn && said.includes("No room"), `over another: "${said.join(" / ")}"`);
    inventoryMod.takeAll(me, "stone", 8);
    // Lit by a flame (a switch: no fuel spent), its light: radius 5 at its tile outdoors, its whole room indoors.
    for (const p of [pOut, pIn]) {
      me.gx = p.tile[0] - 1.2;
      me.gy = p.tile[1] + 0.5;
      const r = verbsMod.run("light", worldMod.world, me, { prop: p.id });
      assert(r.ok && p.fire.lit && p.fire.fuel === 0, `lit: ${JSON.stringify(r)}`);
    }
    clock.setHour(0);
    lightMod.update();
    const src = lightMod.sources().find((s) => s.gx === pOut.tile[0] + 0.5 && s.gy === pOut.tile[1] + 0.5);
    assert(src && src.radius === 5 && src.kind === "fire_pit" && src.flicker && src.flicker.amp === 0.24, `the outdoor source: ${JSON.stringify(src)}`);
    const roomId = mapMod.peekTile(inside[0], inside[1]).room;
    assert(lightMod.roomAmbient(roomId) === 1, `its room's light: ${lightMod.roomAmbient(roomId)}`);
    // Take apart: refused lit, then out it gives half its stone.
    me.gx = pOut.tile[0] - 1.2;
    me.gy = pOut.tile[1] + 0.5;
    placementMod.performPlacement(me, { kind: "remove", target: { type: "prop", id: pOut.id } });
    assert(mapMod.propById(pOut.id) === pOut && placementMod.holdsProblem(pOut) === "Put it out first.", "a lit fire pit was taken apart");
    assert(verbsMod.run("putout", worldMod.world, me, { prop: pOut.id }).ok && !pOut.fire.lit, "not put out");
    placementMod.performPlacement(me, { kind: "remove", target: { type: "prop", id: pOut.id } });
    assert(!mapMod.propById(pOut.id) && inventoryMod.countAll(me, "stone") === 4 && [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => !mapMod.peekTile(out[0] + dx, out[1] + dy).prop), `taken apart: ${inventoryMod.countAll(me, "stone")} stone`);
    // Its record carries its footprint and comes back on all four tiles.
    const C = mapMod.CHUNK;
    const rec = JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(Math.floor(pRoad.tile[0] / C), Math.floor(pRoad.tile[1] / C), false))));
    mapMod.installChunk(rec);
    for (const q of rec.props) mapMod.installProp(q);
    const back = mapMod.propById(pRoad.id);
    assert(back && back.tiles.length === 4 && back.tiles.every(([a, b]) => mapMod.peekTile(a, b).prop === back), "the record did not stand it on its four tiles");
    return `outdoors at ${out}, on the road at ${road}, indoors at ${inside} (room ${roomId}); refused on water at ${water} and over another; a switch lit with no fuel, radius 5 outdoors, its room lit; refused apart lit, four stone back out`;
  } finally {
    rulesMod.rules.freeBuilding = free0;
    promptMod.setMessageSink(null);
  }
});

// Michael's rule (2026-10-27): "I would prefer to keep the build menu exclusively things you cannot pick up and carry around." No build
// palette entry makes a prop a player can lift or pick up: none whose sprite names an item to pick it up as (`item`), says it is carried
// (`carry: true`), or is what an item's Place sets down (the campfire, which is made at the workbench instead).
check("the build palette holds only what cannot be picked up and carried (Michael, 2026-10-27)", () => {
  const build = read("data/build.json");
  const itemsJson = read("data/items.json");
  const placed = new Set((Array.isArray(itemsJson) ? itemsJson : itemsJson.items || []).filter((d) => d.place).map((d) => d.place));
  const props = Object.entries(build).filter(([, b]) => b.kind === "prop");
  const bad = [];
  for (const [id, b] of props) {
    const d = read(`data/sprites/${b.sprite}.json`);
    if (d.item) bad.push(`${id}: its prop is picked up as ${d.item}`);
    if (d.carry === true) bad.push(`${id}: its prop is carried`);
    if (placed.has(b.sprite)) bad.push(`${id}: an item sets it down`);
  }
  assert(!bad.length, bad.join("; "));
  assert(!build.campfire && props.length, "the campfire is still built");
  return `${props.map(([id]) => id).join(", ")}: none picked up or carried`;
});

// The campfire is made (Michael, 2026-10-27): at the workbench from three stone and two logs, by the craft verb a guest's Make sends; 3 by
// 3 in the bag; set down by a guest's `campfire` command cold and empty (no starting fuel: its logs were the make's), the player's own; its
// card says where it is made and what Place does; taken apart, half its make back and no tool asked.
check("the fires: the campfire made at the workbench, 3 by 3 in the bag, set down cold and empty by a guest's command, taken apart for half its make", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  try {
    const r = stationsMod.recipe("campfire");
    assert(r && r.station === "workbench" && r.out.id === "campfire" && JSON.stringify(r.in) === JSON.stringify([{ id: "stone", count: 3 }, { id: "log", count: 2 }]) && !r.uses && !r.tool, `the row: ${JSON.stringify(r)}`);
    assert(JSON.stringify(itemsMod.getItem("campfire").size) === "[3,3]", `the item's size: ${JSON.stringify(itemsMod.getItem("campfire").size)}`);
    const bench = mapMod.allProps().find((q) => q.sprite === "workbench" && mapMod.peekTile(q.tile[0], q.tile[1]).prop === q && !stationsMod.roomProblem(q, r));
    assert(bench, "no workbench to make it at");
    const stand = mapMod.nearestWalkable(bench.tile[0], bench.tile[1] + 1, (x, y) => !!mapMod.tileAt(x, y).prop || !bench.tiles.some(([bx, by]) => lineOfSight(x, y, bx, by)));
    me.gx = stand[0];
    me.gy = stand[1];
    me.hands.main = null;
    me.hands.off = null;
    me.worn.back = itemsMod.makeEntry("small_sack", 1);
    const bag = inventoryMod.bagOf(me);
    bag.items.length = 0;
    inventoryMod.addItem(bag, "stone", 3);
    inventoryMod.addItem(bag, "log", 2);
    const made = verbsMod.run("craft", worldMod.world, me, { prop: bench.id }, { recipe: "campfire", count: 1 });
    assert(made.ok, `the make: ${made.reason}`);
    for (let i = 0; i < 60 * 8 && bench.queue && bench.queue.length; i++) stationsMod.update(1 / 60);
    const entry = (bench.output && bench.output.items || []).find((e) => e.id === "campfire");
    assert(entry && inventoryMod.countAll(me, "stone") === 0 && inventoryMod.countAll(me, "log") === 0, `nothing made, or not paid: ${!!entry}, ${inventoryMod.countAll(me, "stone")} stone, ${inventoryMod.countAll(me, "log")} logs`);
    bench.output.items.splice(bench.output.items.indexOf(entry), 1);
    assert(gridMod.insert(bag, entry), "a 3 by 3 Campfire did not fit the sack (6 by 4)");
    const card = itemInfoMod.textOf(itemInfoMod.cardFor(entry));
    assert(/workbench/i.test(card) && /Place/.test(card) && /campfire/i.test(card), `its card: ${card}`);
    // Set down outdoors by a guest's command, by its uid.
    let spot = null;
    for (let rr = 2; rr < 30 && !spot; rr++) for (let dy = -rr; dy <= rr && !spot; dy++) for (let dx = -rr; dx <= rr && !spot; dx++) {
      const x = Math.round(me.gx) + dx;
      const y = Math.round(me.gy) + dy;
      if (!campfireMod.standProblem(x, y) && mapMod.isWalkableTile(x - 1, y) && !(mapMod.peekTile(x - 1, y).room > 0)) spot = [x, y];
    }
    assert(spot, "no open ground for it");
    me.gx = spot[0] - 1;
    me.gy = spot[1];
    placementMod.performPlacement(me, { kind: "campfire", uid: entry.uid, tx: spot[0], ty: spot[1] });
    const fire = mapMod.peekTile(spot[0], spot[1]).prop;
    assert(fire && fire.sprite === "campfire" && fire.fire.fuel === 0 && !fire.fire.lit && fire.made === true && JSON.stringify(fire.footprint) === "[1,1]" && !bag.items.includes(entry), `set down: ${fire && fire.sprite}, fuel ${fire && fire.fire.fuel}, made ${fire && fire.made}: "${said[said.length - 1]}"`);
    const ta = interactMod.actionsForProp(fire, me).find((q) => /^Take apart/.test(q.label));
    assert(ta && ta.enabled && ta.label === "Take apart (1 stone, 1 log back)", `its Take apart: ${ta && ta.label}`);
    assert(ta.perform() && !mapMod.propById(fire.id) && inventoryMod.countAll(me, "stone") === 1 && inventoryMod.countAll(me, "log") === 1, `taken apart: ${inventoryMod.countAll(me, "stone")} stone, ${inventoryMod.countAll(me, "log")} log`);
    // A village campfire picked up stays the village's: set down again, it is not the player's to take apart.
    const village = campfireMod.makeFire(spot[0], spot[1], 0, false);
    assert(campfireMod.pickUp(me, village), `the village's campfire not picked up: "${said[said.length - 1]}"`);
    const vEntry = bag.items.find((e) => e.id === "campfire");
    assert(vEntry && vEntry.made === false, `its entry: ${JSON.stringify(vEntry)}`);
    campfireMod.place(me, vEntry.uid, spot[0], spot[1]);
    const again = mapMod.peekTile(spot[0], spot[1]).prop;
    assert(again && again.sprite === "campfire" && !again.made, "the village's campfire came down the player's");
    return `3 stone and 2 logs at ${bench.id} into a 3 by 3 Campfire; set down cold and empty at ${spot}, the player's; Take apart 1 stone, 1 log, no tool; the village's stays the village's`;
  } finally {
    promptMod.setMessageSink(null);
  }
});

// The fires' flicker darkens a lit room a little, as a lever (Michael, 2026-10-27): the drawn weight of a lit room's light stays within
// [world.litRoomFlickerMin, 1], reaches near both ends, and is 1 for a steady fire; the world's light (what the dead's sight reads) stays 1
// in a lit room at every instant, so the flicker is the renderer's alone and nothing in the simulation moves with it.
check("the fires: a lit room's drawn light dips with its fire's flicker within [the lever, 1]; the world's room light stays 1", () => {
  const T = read("data/tuning.json");
  const min = T.world.litRoomFlickerMin;
  assert(min === 0.85 && tuningMod.world.litRoomFlickerMin === 0.85, `the lever: ${min}, the code's ${tuningMod.world.litRoomFlickerMin}`);
  for (const sprite of ["fireplace", "fire_pit"]) {
    const fl = getDef(sprite).fire.flicker;
    let lo = 1;
    let hi = 0;
    for (let k = 0; k < 20000; k++) {
      const w = lightMod.roomFlickerWeight(fl, lightMod.sourceSeed(12, 34), k * 0.013);
      lo = Math.min(lo, w);
      hi = Math.max(hi, w);
    }
    assert(lo >= min - 1e-9 && hi <= 1 + 1e-9 && lo < min + 0.01 && hi > 0.999, `${sprite}: the drawn weight ran ${lo.toFixed(4)} to ${hi.toFixed(4)}`);
  }
  assert(lightMod.roomFlickerWeight(null, 0, 3) === 1 && lightMod.roomFlickerWeight({ amp: 0.2, speed: 6 }, 1, 2, 1) === 1, "a steady fire, or the lever at 1, dips");
  // The world's light: a lit fireplace's room at 1 at every step, its flicker known to the renderer.
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const fp = mapMod.allProps().find((p) => p.sprite === "fireplace" && mapMod.peekTile(p.tile[0], p.tile[1]).room > 0);
  assert(fp, "no fireplace in a room");
  mapMod.setFireLit(fp, true);
  const id = mapMod.peekTile(fp.tile[0], fp.tile[1]).room;
  clock.setHour(23);
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    gameMod.begin(1 / 60);
    gameMod.step(1 / 60);
    lightMod.update();
    seen.add(lightMod.roomAmbient(id));
  }
  const rec = lightMod.litRoomFlicker(id);
  assert(seen.size === 1 && seen.has(1) && rec && rec.flicker === fp.fire.flicker && rec.seed === lightMod.sourceSeed(fp.tile[0], fp.tile[1]), `the world's room light: ${[...seen].join(",")}; the flicker ${JSON.stringify(rec)}`);
  mapMod.setFireLit(fp, false);
  lightMod.update();
  assert(lightMod.litRoomFlicker(id) === null, "a room put out still flickers");
  return `the fireplace's and the fire pit's rooms drawn ${min} to 1; the world's lit room 1 at every step`;
});

// The valley's fire pit by your cottage (Michael, 2026-10-27: "So I can see one pretty quick in game"): on open grass outside the yard's
// fence, lit, a place of its own, so no tree, node, or comeback stands on it or the ring round it, and no resource spot rule takes it.
check("the fires: the valley's fire pit stands lit on open grass outside your cottage's south gate, clear of the trees and the resources", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const pits = mapMod.allProps().filter((p) => p.sprite === "fire_pit");
  assert(pits.length === 1, `${pits.length} fire pits on the valley`);
  const p = pits[0];
  const [x, y] = p.tile;
  assert(x >= 100 && x <= 115 && y >= 228 && y <= 234 && p.fire.lit && p.tiles.length === 4 && !p.made, `the fire pit at ${x},${y}: lit ${p.fire.lit}, ${p.tiles.length} tiles, made ${p.made}`);
  for (const [a, b] of p.tiles) {
    const t = mapMod.peekTile(a, b);
    const takes = mapMod.resourceKinds().filter((k) => !mapMod.resourceSpotProblem(k, a, b));
    assert(t.prop === p && t.floor === "floor_grass" && !(t.room > 0) && !takes.length, `tile ${a},${b}: floor ${t.floor}, room ${t.room}, a spot for ${takes.map((k) => k.name).join(", ")}`);
  }
  for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
    const t = mapMod.peekTile(x + dx, y + dy);
    assert(!t.prop || t.prop === p, `the ring holds ${t.prop && t.prop.sprite} at ${x + dx},${y + dy}`);
  }
  const guide = gameMod.state.villagers.find((v) => v.guide || v.name === "Wyn");
  assert(!guide || Math.hypot(guide.gx - x, guide.gy - y) > 6, "the fire pit stands by the guide");
  return `at ${x},${y}, lit, its ring clear; ${guide ? `${Math.hypot(guide.gx - x, guide.gy - y).toFixed(0)} tiles from the guide` : "no guide found"}`;
});

// ---- upper floors (docs/49), step 0: the guards and the void ----
// The ground's rooms as a partition, ids aside: each room's tiles, listed and sorted, so a refill that renumbers them reads the same.
const groundRooms = () => {
  const by = new Map();
  for (const c of mapMod.loadedChunks()) {
    if (c.layer !== 0) continue;
    for (let i = 0; i < c.tiles.length; i++) {
      const id = c.tiles[i].room;
      if (!(id > 0)) continue;
      if (!by.has(id)) by.set(id, []);
      by.get(id).push(`${c.cx * mapMod.CHUNK + (i % mapMod.CHUNK)},${c.cy * mapMod.CHUNK + Math.floor(i / mapMod.CHUNK)}`);
    }
  }
  return [...by.values()].map((t) => t.sort().join(" ")).sort().join("\n");
};
// A walled room of w by h tiles at (x, y) on a layer, its floor planks, built through the mutators (as a player's build will be).
const roomOn = (x, y, w, h, layer, floor = "floor_wood") => {
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) mapMod.setFloor(tx, ty, floor, layer);
  for (let tx = x; tx < x + w; tx++) { mapMod.buildWall(tx, y, "n", "wall", "wall_wood", null, layer); mapMod.buildWall(tx, y + h, "n", "wall", "wall_wood", null, layer); }
  for (let ty = y; ty < y + h; ty++) { mapMod.buildWall(x, ty, "w", "wall", "wall_wood", null, layer); mapMod.buildWall(x + w, ty, "w", "wall", "wall_wood", null, layer); }
};
check("upper floors, step 0: a read on another layer is the void above the ground and the earth below it, grows nothing, and no body stands there", () => {
  gameMod.create({ json: read("data/maps/square.json"), rules: { zombieAggro: false } });
  const n0 = mapMod.chunkCount();
  const [x, y] = gameMod.state.info.spawn;
  const groundFloor = mapMod.tileAt(x, y, 0).floor;
  const up = mapMod.tileAt(x, y, 1);
  const down = mapMod.tileAt(x, y, -1);
  assert(up.floor === mapMod.VOID && Object.isFrozen(up) && up === mapMod.blankTile(1) && up.room === 0, `layer 1 reads ${up.floor}`);
  assert(down.floor === mapMod.EARTH && Object.isFrozen(down) && down === mapMod.blankTile(-1), `layer -1 reads ${down.floor}`);
  assert(mapMod.tileAt(x, y, 0).floor !== mapMod.VOID && mapMod.blankTile(0).floor === "floor_grass", "the ground reads the void");
  assert(mapMod.chunkCount() === n0 && !mapMod.peekTile(x, y, 1) && !mapMod.peekTile(x, y, -1), "a read on another layer grew a chunk");
  for (const id of [mapMod.VOID, mapMod.EARTH, mapMod.HOLE]) assert(mapMod.floorRule(id).walk === false && !mapMod.floorRule(id).drink, `${id} is walkable or drinkable`);
  assert(!mapMod.isWalkableTile(x, y, 1) && !mapMod.isWalkableTile(x, y, -1) && mapMod.isWalkableTile(x, y, 0), "an empty tile is walkable, or the ground is not");
  assert(mapMod.circleBlocked(x, y, 0.3, 1) && mapMod.circleBlocked(x, y, 0.3, -1) && !mapMod.circleBlocked(x, y, 0.3, 0), "a body stands in the void or the earth");
  // Grown by a mutator, the rest of an upper chunk is void and of a cellar's earth; a hole is a floor nobody walks.
  mapMod.setFloor(x, y, "floor_wood", 1);
  mapMod.setFloor(x, y, "floor_wood", -1);
  const nx = x % mapMod.CHUNK === mapMod.CHUNK - 1 ? x - 1 : x + 1; // a neighbour in the same chunk
  mapMod.setFloor(nx, y, mapMod.HOLE, 0);
  assert(mapMod.peekTile(nx, y, 1).floor === mapMod.VOID && mapMod.peekTile(nx, y, -1).floor === mapMod.EARTH, "an upper chunk's unbuilt tile is not void, or a cellar's not earth");
  assert(mapMod.isWalkableTile(x, y, 1) && mapMod.isWalkableTile(x, y, -1) && !mapMod.isWalkableTile(nx, y, 0), "a built floor is not walkable, or a hole is");
  assert(mapMod.tileAt(x, y, 0).floor === groundFloor, "a floor laid on layer 1 or -1 changed the ground's");
  return `void and earth blanks frozen, ${mapMod.chunkCount() - n0} chunks grown only by the mutators, STOREY ${mapMod.STOREY}`;
});
check("upper floors, step 0: the light: a lit fire on layer 1 lights its own layer and nothing on the ground under it (the light build's leak closed)", () => {
  gameMod.create({ json: read("data/maps/square.json"), rules: { zombieAggro: false } });
  clock.setHour(0);
  const [sx, sy] = gameMod.state.info.spawn;
  const [x, y] = [sx + 4, sy + 4];
  lightMod.update();
  const ground0 = [lightMod.staticContribAt(x, y, 0), lightMod.lightAt(x, y, 0)];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) mapMod.setFloor(x + dx, y + dy, "floor_wood", 1);
  const fire = mapMod.createProp({ sprite: "lantern_post", tile: [x, y], layer: 1 });
  mapMod.placeProp(fire, x, y, 1);
  assert(fire.fire && fire.fire.lit && fire.layer === 1 && mapMod.peekTile(x, y, 1).prop === fire && mapMod.tileAt(x, y, 0).prop !== fire, "the lantern is not lit on layer 1 alone");
  lightMod.update();
  const ground1 = [lightMod.staticContribAt(x, y, 0), lightMod.lightAt(x, y, 0)];
  const upper = lightMod.staticContribAt(x, y, 1);
  assert(upper > 0.5, `the lantern does not light its own layer (${upper})`);
  assert(ground1[0] === ground0[0] && ground1[1] === ground0[1], `the ground under it was lit through the floor: ${ground0.map((v) => v.toFixed(3))} to ${ground1.map((v) => v.toFixed(3))}`);
  // A flame carried on layer 1 lights layer 1 alone too.
  const beside0 = lightMod.lightAt(x + 2, y, 0);
  const beside1 = lightMod.lightAt(x + 2, y, 1);
  lightMod.setCarriers([{ owner: "t", gx: x + 1, gy: y, radius: 4, flicker: null, strength: 1, layer: 1 }]);
  assert(lightMod.lightAt(x + 2, y, 0) === beside0 && lightMod.lightAt(x + 2, y, 1) > beside1, "a carried flame on layer 1 lit the ground, or not its own layer");
  lightMod.setCarriers([]);
  return `layer 1 lit ${upper.toFixed(2)}; the ground under it ${ground1[0].toFixed(3)} as before`;
});
check("upper floors, step 0: the rooms: a room walled on layer 1 is its own and the ground's rooms stand as they were (the room fill's leak closed)", () => {
  gameMod.create({ json: read("data/maps/square.json"), rules: { zombieAggro: false } });
  mapMod.rebuildRooms();
  const before = groundRooms();
  const cottage = (() => { for (const c of mapMod.loadedChunks()) for (let i = 0; i < c.tiles.length; i++) if (c.layer === 0 && c.cx === 0 && c.cy === 0 && c.tiles[i].room > 0) return [c.cx * mapMod.CHUNK + (i % mapMod.CHUNK), c.cy * mapMod.CHUNK + Math.floor(i / mapMod.CHUNK)]; return null; })();
  assert(cottage, "no room on the square's ground");
  // A 3 by 3 room on layer 1 over the ground's room and over open ground beside it: its walls must bound nothing on the ground.
  const [x, y] = cottage;
  roomOn(x, y, 3, 3, 1);
  roomOn(x + 8, y + 8, 2, 2, 1);
  mapMod.rebuildRooms();
  const after = groundRooms();
  assert(after === before, "the ground's rooms changed when a room was built on layer 1");
  const id = mapMod.roomAt(x + 1, y + 1, 1);
  const room = mapMod.getRoom(id);
  assert(id > 0 && room && room.layer === 1 && room.size === 9, `the room on layer 1: id ${id}, ${room && room.size} tiles on layer ${room && room.layer}`);
  assert(mapMod.roomAt(x + 1, y + 1, 0) !== id && mapMod.roomAt(x + 8, y + 8, 0) === 0 && mapMod.roomAt(x + 8, y + 8, 1) > 0, "a ground tile took the upper room's id, or the open ground under a room is not outdoors");
  // The local refind (one edge) on layer 1 refills layer 1 alone: a door in the small room's wall, then a wall removed to open it to the void.
  mapMod.destroyWall(x + 8, y + 8, "n", false, 1);
  assert(groundRooms() === before, "a wall taken down on layer 1 changed the ground's rooms");
  assert(mapMod.roomAt(x + 9, y + 9, 1) === 0, "a room opened onto the void is not outdoors (an open edge of a floor is a balcony, docs/49 section 3)");
  return `the ground's rooms unchanged; layer 1's room of ${room.size} tiles`;
});
// ---- upper floors (docs/49), step 1: the map in layers, on the proving ground's tower house (tools/mapgen/proving.py) ----
// The tower house: the ground x 2 to 9, y 23 to 28; the first floor over all of it; the second over x 6 to 9, y 24 to 28; the cellar under
// x 2 to 5, y 26 to 28. The stair from the ground climbs east along row 25 (steps 4 to 6, landing 7 on the first floor); the one from the
// first floor climbs south along column 8 (steps 24 to 26, landing 27 on the second).
const movementMod = await import("../src/entities/movement.js");
const reachImport = await import("../src/reach.js");
const towerHouse = () => {
  gameMod.create({ json: read("data/maps/square.json"), rules: { zombieAggro: false } });
  const b = mapMod.buildings().find((q) => q.set === "the tower house");
  assert(b, "the square has no tower house");
  return b;
};
check("upper floors, step 1: the tower house loads on four layers, a room on each, the stairs' landings floored and their stairwells void, in the building index", () => {
  const b = towerHouse();
  assert(JSON.stringify(b.layers) === "[-1,0,1,2]", `its layers ${JSON.stringify(b.layers)}`);
  assert(!mapMod.stairProblemsOf().length, `the stairs did not fit: ${mapMod.stairProblemsOf().join("; ")}`);
  const st = mapMod.stairs().filter((s) => s.building === b.id);
  assert(st.length === 2, `${st.length} stairs`);
  const sizes = [];
  for (const [x, y, layer, size] of [[3, 24, 0, 48], [3, 24, 1, 48], [7, 27, 2, 20], [3, 27, -1, 12]]) {
    const id = mapMod.roomAt(x, y, layer);
    const room = mapMod.getRoom(id);
    assert(id > 0 && room && room.layer === layer && room.size === size, `layer ${layer} at ${x},${y}: room ${id}, ${room && room.size} tiles on layer ${room && room.layer} (wanted ${size})`);
    sizes.push(`${layer}: ${room.size}`);
  }
  assert(new Set([0, 1, 2, -1].map((l) => mapMod.roomAt(3 + (l === 2 ? 4 : 0), 27, l))).size === 4, "two layers share a room");
  for (const s of st) {
    const above = s.layer + 1;
    const land = mapMod.tileAt(s.landing[0], s.landing[1], above);
    assert(land.floor === "floor_wood" && mapMod.isWalkableTile(s.landing[0], s.landing[1], above) && !land.prop, `${s.id}'s landing on layer ${above}: ${land.floor}`);
    for (const [x, y] of s.tiles) {
      const w = mapMod.tileAt(x, y, above);
      assert(w.floor === mapMod.VOID && !mapMod.isWalkableTile(x, y, above), `${s.id}'s stairwell at ${x},${y} on layer ${above} is ${w.floor}`);
      assert(mapMod.tileAt(x, y, s.layer).floor !== mapMod.VOID && mapMod.tileAt(x, y, s.layer).floor !== mapMod.EARTH, `${s.id}'s step at ${x},${y} has no floor`);
    }
    assert(mapMod.isWalkableTile(s.before[0], s.before[1], s.layer), `${s.id}'s tile before its bottom step is not walkable`);
  }
  // A stairwell inside a room's walls is that room's (the fill crosses its void).
  assert(mapMod.roomAt(5, 25, 1) === mapMod.roomAt(3, 24, 1) && mapMod.roomAt(8, 25, 2) === mapMod.roomAt(7, 27, 2), "a stairwell is not its room's");
  assert(mapMod.buildingAt(3, 27, -1) === b && mapMod.buildingAt(3, 27, 2) === null && mapMod.buildingAt(7, 27, 2) === b && mapMod.buildingAt(15, 15, 0) !== b, "the building index does not answer by layer");
  assert(mapMod.peekTile(2, 26, -1).prop && mapMod.peekTile(2, 26, -1).prop.layer === -1 && mapMod.tileAt(2, 26, 0).prop !== mapMod.peekTile(2, 26, -1).prop, "the cellar's barrel is not on the cellar's layer alone");
  return `rooms ${sizes.join(", ")}; stairs ${st.map((s) => `${s.id} ${s.dir} from layer ${s.layer}`).join(", ")}`;
});
check("upper floors, step 1: a cellar's stair is cut out of the earth with a hole in the ground floor over it, and a stair that does not fit is left out with why", () => {
  const json = read("data/maps/square.json");
  const tower = json.sets.find((s) => s.name === "the tower house").buildings[0];
  // The cellar's stair: from its west end climbing east into the ground floor (steps 3 to 5 on row 27, its landing at 6 on the ground).
  tower.stairs.push({ at: [1, 4], dir: "e", layer: -1, material: "stone" });
  tower.stairs.push({ at: [3, 1], dir: "s", layer: 0 }); // across the first stair's run: refused
  gameMod.create({ json, rules: { zombieAggro: false } });
  const cs = mapMod.stairs().find((s) => s.layer === -1);
  assert(cs && cs.material === "stone", "the cellar's stair was not laid");
  for (const [x, y] of cs.tiles) {
    assert(mapMod.tileAt(x, y, 0).floor === mapMod.HOLE && !mapMod.isWalkableTile(x, y, 0), `no hole in the ground floor at ${x},${y}`);
    assert(mapMod.tileAt(x, y, -1).floor !== mapMod.EARTH, `the cellar's step at ${x},${y} is earth`);
  }
  assert(mapMod.isWalkableTile(cs.landing[0], cs.landing[1], 0), "the cellar stair's landing on the ground is not walkable");
  const why = mapMod.stairProblemsOf();
  assert(why.length === 1 && /crosses another stair|not walkable|a wall across/.test(why[0]) && mapMod.stairs().length === 3, `the stair across the first one: ${why.join("; ") || "laid"}`);
  // The ground's room keeps its hole (a stairwell is its room's); the ground's bake takes a hole as dirt until step 3's art.
  assert(mapMod.roomAt(cs.tiles[0][0], cs.tiles[0][1], 0) === mapMod.roomAt(3, 24, 0), "the hole is not the ground room's");
  return `the hole over ${cs.tiles.map((t) => t.join(",")).join(" ")}; refused: ${why[0]}`;
});
check("upper floors, step 1: collision and the paths are each layer's: the first floor's walls and its stairwell stop a body there and nothing on the ground", () => {
  towerHouse();
  // On the first floor, walking east along row 25 from the landing's west: the stairwell (void, x 4 to 6) stops the body; on the ground the
  // same walk goes through (the ground's own floor there).
  const walk = (layer) => { let p = { gx: 3, gy: 25 }; for (let i = 0; i < 60; i++) p = mapMod.moveCircle(p.gx, p.gy, 0.3, 0.05, 0, layer); return p.gx; };
  const up = walk(1);
  const ground = walk(0);
  assert(up < 3.75 && ground > 5.5, `the walk east from 3,25 ended at ${up.toFixed(2)} on the first floor and ${ground.toFixed(2)} on the ground`);
  assert(mapMod.circleBlocked(5, 24.35, 0.3, 1) && mapMod.circleBlocked(5, 24.35, 0.3, 0) && !mapMod.circleBlocked(5, 25, 0.3, 0), "the stair's closed sides (the stairwell's on the first floor, its own on the ground), or a body on the stair held"); // step 3: a stairwell is entered only over the top edge
  // The first floor's north wall: no step out of it on layer 1; on the ground outside the house the same tiles are open grass.
  assert(!mapMod.canStep(3, 23, 3, 22, 1) && !mapMod.canStep(3, 23, 3, 22, 0) && mapMod.canStep(3, 21, 3, 20, 0) && !mapMod.canStep(3, 21, 3, 20, 1), "the first floor's wall or void, or the ground's grass, steps wrong");
  // A path on the second floor round its stairwell, and none from the cellar into the earth.
  const p2 = pathfind.findPath([7, 24], [9, 28], mapMod.canStepOn(2));
  assert(p2 && p2.every(([x, y]) => mapMod.isWalkableTile(x, y, 2)) && !p2.some(([x, y]) => x === 8 && y >= 24 && y <= 26), `the second floor's path ${JSON.stringify(p2)}`);
  assert(pathfind.findPath([2, 26], [5, 28], mapMod.canStepOn(-1)) && pathfind.findPath([2, 26], [7, 27], mapMod.canStepOn(-1)) === null, "the cellar's paths: none inside, or one into the earth");
  assert(mapMod.canStepOn(0) === mapMod.canStep, "the ground's step test is not canStep itself (its paths would change)");
  // Bodies are pushed apart on one layer only: two on top of each other a storey apart stay put, two on one layer part.
  const a = { gx: 3, gy: 24, layer: 1, radius: 0.3 };
  const b = { gx: 3.05, gy: 24, layer: 0, radius: 0.3 };
  movementMod.separate(a, 1 / 60, [a, b]);
  assert(a.gx === 3 && a.gy === 24, `a body on the first floor was pushed by one on the ground (${a.gx}, ${a.gy})`);
  b.layer = 1;
  movementMod.separate(a, 1 / 60, [a, b]);
  assert(a.gx < 3, "two bodies on one layer were not pushed apart");
  return `the first floor's walk stopped at ${up.toFixed(2)}, the ground's went on to ${ground.toFixed(2)}; the second floor's path ${p2.length} steps`;
});
check("upper floors, step 1: growth and eviction: another layer grows only its authored and built chunks, never by a read, and is never dropped as the wild is", () => {
  towerHouse();
  const upper = () => [...mapMod.loadedChunks()].filter((c) => c.layer !== 0).map((c) => `${c.cx},${c.cy},${c.layer}`).sort();
  const at0 = upper();
  assert(at0.join(" ") === "0,1,-1 0,1,1 0,1,2 1,0,1", `the upper and lower chunks at the start: ${at0.join(" ")}`);
  // Far off, a read and the ring grow nothing on another layer; a floor laid there grows its one chunk, named with its layer.
  mapMod.ensureAround(200, 200, 2);
  assert(mapMod.tileAt(200, 200, 1).floor === mapMod.VOID && upper().length === at0.length, "the ring or a read grew a chunk on another layer");
  mapMod.takeTouched();
  mapMod.setFloor(200, 200, "floor_wood", 1);
  const touched = mapMod.takeTouched();
  assert(upper().length === at0.length + 1 && touched.some((t) => t[0] === 12 && t[1] === 12 && t[2] === 1) && !touched.some((t) => t[0] === 12 && t[1] === 12 && !t[2]), `the built floor's chunk: ${JSON.stringify(touched)}`);
  // Eviction from far away: the wild goes, every other layer's chunk stays (none is wild), the evicted list on the ground's layer.
  const dropped = mapMod.evictFar(-4000, -4000, 2);
  const ev = mapMod.takeEvicted();
  assert(dropped.length > 0 && dropped.every((d) => d[3] === 0) && upper().length === at0.length + 1 && ev.every((e) => e.length === 2), `the eviction dropped ${dropped.length}, upper ${upper().length}, evicted ${JSON.stringify(ev.slice(0, 3))}`);
  // A dropped chunk of another layer (a guest told so) leaves the registry with its props, and is grown again from the file.
  const bed = mapMod.allProps().find((p) => p.sprite === "bed" && p.layer === 1);
  assert(bed, "no bed on the first floor");
  mapMod.dropChunk(0, 1, 1);
  assert(!mapMod.propById(bed.id) && !mapMod.peekTile(2, 27, 1) && mapMod.tileAt(2, 27, 1).floor === mapMod.VOID, "a dropped upper chunk left its bed or its tiles");
  mapMod.ensureAround(15, 15, 4);
  assert(mapMod.peekTile(2, 27, 1) && mapMod.peekTile(2, 27, 1).prop && mapMod.peekTile(2, 27, 1).prop.sprite === "bed", "the ring did not grow the authored upper chunk again");
  return `${at0.length} chunks off the ground at the start, a built one grown by its floor, ${dropped.length} wild chunks dropped and none off the ground`;
});
check("upper floors, step 1: the save keeps every layer: a prop, a wall, and an item off the ground come back on their layer, the ground's records carry no layer", () => {
  const json = read("data/maps/square.json");
  towerHouse();
  const item = mapMod.dropItem(7, 25, { id: "stick", count: 1 }, 1); // on the first stair's landing
  mapMod.buildWall(7, 27, "n", "wall", "wall_wood", null, 2);
  mapMod.setFloor(4, 27, "floor_stone", -1);
  const save = JSON.parse(JSON.stringify(gameMod.serialize()));
  const rec = (layer) => save.map.chunks.find((c) => c.cx === 0 && c.cy === 1 && (c.layer || 0) === layer);
  assert(rec(1) && rec(2) && rec(-1) && rec(0), "a layer's chunk is missing from the save");
  assert(rec(1).props.some((p) => p.sprite === "bed" && p.layer === 1) && rec(0).props.every((p) => !("layer" in p)), "the props' layers are not saved, or the ground's carry one");
  gameMod.restore(save, json);
  assert(mapMod.itemsAt(7, 25, 1).some((e) => e.uid === item.uid) && !mapMod.itemsAt(7, 25, 0).some((e) => e.uid === item.uid), "the item came back on another layer");
  assert(mapMod.tileAt(7, 27, 2).n && mapMod.tileAt(7, 27, 2).n.built && !(mapMod.tileAt(7, 27, 1).n && mapMod.tileAt(7, 27, 1).n.built), "the wall came back on another layer");
  assert(mapMod.tileAt(4, 27, -1).floor === "floor_stone" && mapMod.tileAt(4, 27, 0).floor !== "floor_stone", "the cellar's floor came back on another layer");
  const bed = mapMod.allProps().find((p) => p.sprite === "bed" && p.layer === 1);
  assert(bed && mapMod.peekTile(bed.tile[0], bed.tile[1], 1).prop === bed && mapMod.tileAt(bed.tile[0], bed.tile[1], 0).prop !== bed, "the bed came back off its layer");
  // The lanterns on the first floor are brackets of that layer, lit on it alone (the light's leak, through a save).
  const lit = [...mapMod.brackets()].filter((q) => q.layer === 1);
  assert(lit.length === 1, `${lit.length} brackets on the first floor`);
  return `a stick on the landing, a wall on the second floor, a stone floor in the cellar, all on their layers after the restore`;
});
check("upper floors, step 1: the wire: a touched chunk goes with its layer, an aim and a command name theirs, the host refuses one on another layer (PROTOCOL 24 since steps 2 and 3, and on)", () => {
  assert(netMod.PROTOCOL >= 24, `PROTOCOL ${netMod.PROTOCOL}`);
  const s2 = netMod.cleanSnap({ aimAt: [3.5, 4.5] });
  const s3 = netMod.cleanSnap({ aimAt: [3.5, 4.5, 1] });
  const s0 = netMod.cleanSnap({ aimAt: [3.5, 4.5, 0] });
  const bad = netMod.cleanSnap({ aimAt: [3.5, 4.5, 99] });
  const odd = netMod.cleanSnap({ aimAt: [3.5, 4.5, 1, 2] });
  assert(JSON.stringify(s2.aimAt) === "[3.5,4.5]" && JSON.stringify(s3.aimAt) === "[3.5,4.5,1]" && JSON.stringify(s0.aimAt) === "[3.5,4.5,0]" && JSON.stringify(bad.aimAt) === "[3.5,4.5,0]" /* since PROTOCOL 28 the floor aimed at is kept, the ground named (docs/53 step 2) */ && odd.aimAt === null, `the aim cleaned: ${JSON.stringify([s2.aimAt, s3.aimAt, s0.aimAt, bad.aimAt, odd.aimAt])}`);
  assert(netMod.onPlayersLayer({ layer: 0 }, {}) && netMod.onPlayersLayer({ layer: 1 }, { layer: 1 }) && !netMod.onPlayersLayer({ layer: 0 }, { layer: 1 }) && !netMod.onPlayersLayer({ layer: 1 }, {}) && netMod.onPlayersLayer({ layer: 0 }, { layer: "x" }), "a command's layer against its player's");
  assert(netMod.layerIn(-1) === -1 && netMod.layerIn(2) === 2 && netMod.layerIn(1.5) === 0 && netMod.layerIn("1") === 0 && netMod.layerIn(40) === 0, "a layer from the wire is not cleaned");
  // A chunk's record says its layer, and installed on a replica it goes back on that layer.
  towerHouse();
  const c1 = mapMod.getChunk(0, 1, false, 1);
  const rec = JSON.parse(JSON.stringify(mapMod.serializeChunk(c1)));
  assert(rec.layer === 1, "the chunk's record does not name its layer");
  mapMod.dropChunk(0, 1, 1);
  mapMod.installChunk(rec);
  for (const p of rec.props) mapMod.installProp(p);
  assert(mapMod.peekTile(2, 27, 1) && mapMod.peekTile(2, 27, 1).prop && mapMod.peekTile(2, 27, 1).prop.layer === 1 && mapMod.tileAt(2, 27, 0).prop !== mapMod.peekTile(2, 27, 1).prop, "the upper chunk's record went onto another layer");
  return "aims [gx, gy] and [gx, gy, layer], a command on another layer refused, an upper chunk's record back on its layer";
});
check("upper floors, step 1 (the review of #533): a first-floor window opened by day lights its own room, read on its own layer", () => {
  towerHouse();
  clock.setHour(12);
  const id = mapMod.roomAt(3, 24, 1);
  const room = mapMod.getRoom(id);
  const win = mapMod.tileAt(2, 25, 1).w;
  assert(win && win.kind === "window" && room.openings.some((o) => o.tx === 2 && o.ty === 25 && o.edge === "w"), "no first-floor window on the west wall at row 25");
  lightMod.update();
  const shut = lightMod.roomAmbient(id);
  win.shutter = "open";
  mapMod.touch(2, 25, 1);
  lightMod.update();
  const open = lightMod.roomAmbient(id);
  win.shutter = "closed";
  assert(open > shut + 0.1, `the first floor's room by day: ${shut.toFixed(3)} shut, ${open.toFixed(3)} open`);
  return `${shut.toFixed(2)} shut to ${open.toFixed(2)} open`;
});
check("upper floors, step 1 (the review of #533): reach is on one layer, a put-down lands on the player's layer, a bracket is found on its own, a stair over a prop is refused", () => {
  towerHouse();
  const p = gameMod.state.player;
  const bed = mapMod.allProps().find((q) => q.sprite === "bed" && q.layer === 1);
  const table = mapMod.allProps().find((q) => q.sprite === "table" && (q.layer || 0) === 0 && q.tile[0] === 7 && q.tile[1] === 27);
  assert(bed && table, "no bed upstairs or table below");
  p.gx = 3; p.gy = 26; p.layer = 0;
  try {
    const { reachProblem, OTHER_FLOOR } = reachImport;
    assert(reachProblem(p, bed.tiles, 3, bed.layer) === OTHER_FLOOR && reachProblem(p, table.tiles, 6, table.layer || 0) === null, "reach: the bed upstairs is in reach from the ground, or the table is not");
    p.layer = 1;
    assert(reachProblem(p, bed.tiles, 3, bed.layer) === null && reachProblem(p, table.tiles, 6, 0) === OTHER_FLOOR, "reach from the first floor");
    // A prop picked up on the ground and put down by a player on the first floor lands there.
    mapMod.removeProp(table);
    mapMod.placeProp(table, 5, 24, p.layer);
    assert(table.layer === 1 && mapMod.peekTile(5, 24, 1).prop === table && mapMod.tileAt(5, 24, 0).prop !== table, "the table did not land on the player's layer");
    // A bracket by its address on its own layer: the first floor's lantern is not found from the ground.
    const lamp = [...mapMod.brackets()].find((b) => b.layer === 1);
    assert(lamp && mapMod.bracketAt(lamp.tx, lamp.ty, lamp.edge, 1) === lamp && mapMod.bracketAt(lamp.tx, lamp.ty, lamp.edge, 0) === null, "a bracket is found on another layer");
    // A dropped item at the player's feet lands on the player's layer (the drop helpers pass it).
    const it = mapMod.dropItem(Math.round(p.gx), Math.round(p.gy), { id: "stick", count: 1 }, p.layer || 0);
    assert(mapMod.itemsAt(3, 26, 1).includes(it) && !mapMod.itemsAt(3, 26, 0).includes(it), "an item at an upstairs player's feet fell to the ground");
  } finally {
    p.layer = 0;
  }
  // A cellar's stair under an authored ground prop is refused with why, and the prop stays.
  const json = read("data/maps/square.json");
  const tower = json.sets.find((s) => s.name === "the tower house").buildings[0];
  tower.props.push({ sprite: "chest", tile: [2, 4] }); // the world's 4, 27: over the cellar stair's middle step
  tower.stairs.push({ at: [1, 4], dir: "e", layer: -1 });
  gameMod.create({ json, rules: { zombieAggro: false } });
  const why = mapMod.stairProblemsOf();
  assert(why.length === 1 && /stands over a step/.test(why[0]) && mapMod.tileAt(4, 27, 0).prop && mapMod.tileAt(4, 27, 0).prop.sprite === "chest" && mapMod.tileAt(4, 27, 0).floor !== mapMod.HOLE, `the stair under the chest: ${why.join("; ") || "laid"}`);
  return `reach refused across a floor; the table put down upstairs; refused: ${why[0]}`;
});
check("upper floors, step 3 (the review of #534): E, the menu, and the cursor read the player's own floor: an apple upstairs is taken, the table below has no actions", () => {
  towerHouse();
  const p = gameMod.state.player;
  const table = mapMod.allProps().find((q) => q.sprite === "table" && (q.layer || 0) === 0 && q.tile[0] === 7 && q.tile[1] === 27);
  assert(table, "no table on the ground");
  const o = isoMod.getOrigin();
  p.gx = 5; p.gy = 24; p.layer = 1;
  try {
    const below = mapMod.dropItem(5, 24, { id: "apple", count: 1 }, 0);
    const above = mapMod.dropItem(5, 24, { id: "apple", count: 1 }, 1);
    const e = interactImport.nearestSimpleAction(p);
    assert(e && e.target.kind === "item" && e.target.uid === above.uid, `E upstairs: ${e ? JSON.stringify(e.target) : "nothing"}`);
    assert(interactImport.actionsForTarget({ kind: "prop", id: table.id }, p).length === 0, "the table on the ground has actions for a player upstairs");
    // The cursor: the point where the first floor's tile (5, 24) is drawn, a storey up the screen, names the apple up there and not the one below.
    isoMod.setOrigin(0, 0);
    const s = isoMod.toScreen(5, 24);
    const at = interactImport.actionsAt(s.x, s.y - mapMod.STOREY, p).filter((a) => a.target && a.target.kind === "item").map((a) => a.target.uid);
    assert(at.includes(above.uid) && !at.includes(below.uid), `the cursor upstairs: ${at.join(", ") || "no item"}`);
    assert(isoMod.getOrigin().y === 0, "the pick left the origin lifted");
    p.layer = 0;
    const atGround = interactImport.actionsAt(s.x, s.y, p).filter((a) => a.target && a.target.kind === "item").map((a) => a.target.uid);
    assert(atGround.includes(below.uid) && !atGround.includes(above.uid), `the cursor on the ground: ${atGround.join(", ") || "no item"}`);
  } finally {
    p.layer = 0;
    isoMod.setOrigin(o.x, o.y);
  }
  return "E upstairs takes the upstairs apple; the ground's table offers nothing; the cursor reads each floor at its own height";
});
// ---- upper floors (docs/49), step 3: stairs and walking ----
check("upper floors, step 3: a body walks up the tower house's stair (rise 32 a tile), crosses its top edge onto the first floor, and back down; nothing steps on from the side", () => {
  towerHouse();
  const p = { gx: 3, gy: 25, layer: 0, rise: 0 };
  const go = (dx, dy, n) => { for (let i = 0; i < n; i++) { const m = mapMod.moveCircle(p.gx, p.gy, 0.3, dx, dy, p.layer); p.gx = m.gx; p.gy = m.gy; mapMod.stairStep(p); } };
  go(0.05, 0, 30); // to x 4.5: a tile up the stair
  assert(p.layer === 0 && Math.abs(p.rise - 32) < 2, `a tile up: layer ${p.layer}, rise ${p.rise}`);
  go(0.05, 0, 50); // past the top edge at 6.5
  assert(p.layer === 1 && p.rise === 0 && p.gx > 6.5, `past the top: layer ${p.layer}, rise ${p.rise}, x ${p.gx.toFixed(2)}`);
  go(0, -0.05, 15); // on the first floor, north from the landing
  assert(p.layer === 1 && p.gy < 24.5, `the first floor's walk: layer ${p.layer}, y ${p.gy.toFixed(2)}`);
  go(0, 0.05, 15);
  go(-0.05, 0, 30); // back over the top edge: on the stair again, high
  assert(p.layer === 0 && p.rise > 40 && p.rise < 96, `back over the top: layer ${p.layer}, rise ${p.rise.toFixed(1)}`);
  go(-0.05, 0, 80);
  assert(p.layer === 0 && p.rise === 0 && p.gx < 3.5, `down at the foot: layer ${p.layer}, rise ${p.rise}, x ${p.gx.toFixed(2)}`);
  const q = { gx: 5, gy: 24, layer: 0, rise: 0 };
  for (let i = 0; i < 40; i++) { const m = mapMod.moveCircle(q.gx, q.gy, 0.3, 0, 0.05, q.layer); q.gx = m.gx; q.gy = m.gy; mapMod.stairStep(q); }
  assert(q.gy < 24.25 && q.rise === 0, `a body walking at the stair's side got on it (y ${q.gy.toFixed(2)}, rise ${q.rise})`);
  const r = { gx: 5, gy: 24, layer: 1, rise: 0 };
  for (let i = 0; i < 40; i++) { const m = mapMod.moveCircle(r.gx, r.gy, 0.3, 0, 0.05, r.layer); r.gx = m.gx; r.gy = m.gy; mapMod.stairStep(r); }
  assert(r.gy < 24.25 && r.layer === 1, `a body on the first floor walked into the stairwell from its side (y ${r.gy.toFixed(2)}, layer ${r.layer})`);
  // The pathfinder on one layer keeps to the stair's line: a path from the foot to the top step, none onto it from the side.
  const up = pathfind.findPath([3, 25], [6, 25], mapMod.canStepOn(0));
  assert(up && up.map((t) => t.join(",")).join(" ") === "4,25 5,25 6,25" && !mapMod.canStep(5, 24, 5, 25, 0) && !mapMod.canStep(6, 25, 7, 25, 0), `the path up ${JSON.stringify(up)}`);
  return "up 32 a tile, onto the first floor past the top edge, back down; the sides closed on both layers";
});
check("upper floors, step 3 (the review of #534): from under a landing, walking any way never climbs onto the stair over its top edge", () => {
  towerHouse();
  const out = [];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const b = { gx: 7.2, gy: 25, layer: 0, rise: 0 };
    let rose = 0;
    for (let i = 0; i < 80; i++) {
      const m = mapMod.moveCircle(b.gx, b.gy, 0.3, dx * 0.05, dy * 0.05, b.layer);
      b.gx = m.gx;
      b.gy = m.gy;
      mapMod.stairStep(b);
      rose = Math.max(rose, b.rise || 0, b.layer ? 99 : 0);
    }
    out.push(`${dx},${dy}: ${b.gx.toFixed(2)},${b.gy.toFixed(2)} L${b.layer}`);
    assert(!rose, `walking ${dx},${dy} from under the landing it rose (${out[out.length - 1]})`);
  }
  return out.join("; ");
});
check("upper floors, step 3: one of the dead that sees a player go up follows by the stair (the stair-first rule), and bites and blows stay on one layer", () => {
  const json = read("data/maps/square.json");
  gameMod.create({ json, rules: { zombieAggro: true } });
  loopMod.init({ update: (dt) => { gameMod.begin(dt); gameMod.step(dt, gameMod.idleSnapshot()); }, render: () => {} });
  const S = gameMod.state;
  const p = S.player;
  p.gx = 7.2; p.gy = 24.2; p.layer = 1;
  S.zombies.splice(1);
  const z = S.zombies[0];
  Object.assign(z, { gx: 3.4, gy: 25.4, layer: 0, state: "idle", path: [], lastSeen: null, aggro: false });
  let at = null;
  for (let i = 0; i < 60 * 25 && at === null; i++) {
    loopMod.advance(1 / 60);
    if (z.layer === 1) at = i / 60;
  }
  assert(at !== null, `the dead one never came up (at ${z.gx.toFixed(2)},${z.gy.toFixed(2)} layer ${z.layer}, ${z.state})`);
  // A blow from the ground at one upstairs a step away reaches nothing, and the biter's reach is nothing across a storey.
  const hp = p.hp;
  Object.assign(z, { gx: p.gx + 0.5, gy: p.gy, layer: 0, rise: 0 });
  for (let i = 0; i < 120; i++) loopMod.advance(1 / 60);
  assert(p.hp === hp, `bitten through the floor: ${hp} to ${p.hp}`);
  return `up the stair after ${at.toFixed(1)} s; no bite through the floor`;
});
check("upper floors, step 3: the valley's tall house east of your cottage has a stair to its first floor, the spawn and the cottage as they were", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const b = mapMod.buildings().find((q) => q.set === "the tall house");
  assert(b && b.layers.join(",") === "0,1" && !mapMod.stairProblemsOf().length, `the tall house: ${b && b.layers}, ${mapMod.stairProblemsOf().join("; ")}`);
  const s = mapMod.stairs().find((q) => q.building === b.id);
  assert(s && mapMod.tileAt(s.landing[0], s.landing[1], 1).floor === "floor_wood", "no stair or landing");
  assert(JSON.stringify(gameMod.state.info.spawn) === "[102,218]" && mapMod.buildings().some((q) => q.set === "your cottage"), "the spawn or the cottage moved");
  const room = mapMod.getRoom(mapMod.roomAt(b.rect[0] + 1, b.rect[1] + 1, 1));
  assert(room && room.layer === 1 && room.size === 48, `the first floor's room: ${room && room.size}`);
  return `stair ${s.at} ${s.dir}, landing ${s.landing}; the first floor a room of ${room.size}`;
});
// ---- the storeys' playtest (Michael, 2026-10-27): the stair's walkable band under its drawn steps, the treads, and the landing's sides ----
const tallHouse = () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const b = mapMod.buildings().find((q) => q.set === "the tall house");
  return mapMod.stairs().find((q) => q.building === b.id && q.layer === 0);
};
const stepBody = (p, dx, dy, n) => {
  for (let i = 0; i < n; i++) {
    const m = mapMod.moveCircle(p.gx, p.gy, 0.3, dx, dy, p.layer);
    p.gx = m.gx;
    p.gy = m.gy;
    mapMod.stairStep(p);
  }
  return p;
};
check("the storeys' playtest: a body walks up the stair at the steps' left third, middle, and right third, entering from the tile before it across the full width", () => {
  const s = tallHouse();
  const [dx, dy] = s.d;
  const out = [];
  for (const off of [-1 / 3, 0, 1 / 3]) {
    // From the middle of the tile before the bottom step, `off` across, walking straight up the stair's line.
    const p = { gx: s.before[0] - dy * off, gy: s.before[1] + dx * off, layer: 0, rise: 0 };
    stepBody(p, dx * 0.05, dy * 0.05, 120);
    out.push(`${off.toFixed(2)}: layer ${p.layer}`);
    assert(p.layer === 1 && (p.rise || 0) === 0, `up at ${off.toFixed(2)} across: ${out.join("; ")}, stopped at ${p.gx.toFixed(2)},${p.gy.toFixed(2)} rise ${p.rise}`);
  }
  return out.join("; ");
});
check("the storeys' playtest: a body pressed against each side of the stair stays within the drawn side; one beside it is held off it whole", () => {
  const s = tallHouse();
  const [dx, dy] = s.d;
  const res = [];
  for (const side of [-1, 1]) {
    // On the stair, halfway up, pushed sideways for two tiles' worth.
    const p = { gx: s.low[0] + dx * 1.5, gy: s.low[1] + dy * 1.5, layer: 0, rise: 0 };
    mapMod.stairStep(p);
    stepBody(p, -dy * side * 0.05, dx * side * 0.05, 40);
    const { off } = mapMod.stairAlong(s, p.gx, p.gy);
    res.push(`on, ${side < 0 ? "left" : "right"}: ${off.toFixed(3)} rise ${p.rise.toFixed(0)}`);
    assert(Math.abs(off) <= 0.5 - mapMod.STAIR_FEET + 1e-6 && Math.abs(off) > 0.3 && p.layer === 0 && p.rise > 40, res.join("; "));
    // Beside it on the floor, walking into its side: its whole body held off the side line.
    const q = { gx: s.low[0] + dx * 2.5 - dy * side * 1.1, gy: s.low[1] + dy * 2.5 + dx * side * 1.1, layer: 0, rise: 0 }; // by the top step, clear of the chair beside the valley's stair (a body that starts overlapping a solid walks out freely)
    stepBody(q, dy * side * 0.05, -dx * side * 0.05, 40);
    const o2 = mapMod.stairAlong(s, q.gx, q.gy).off;
    res.push(`beside, ${side < 0 ? "left" : "right"}: ${o2.toFixed(3)}`);
    assert(Math.abs(o2) >= 0.5 + 0.3 - 1e-6 && (q.rise || 0) === 0, res.join("; "));
  }
  return res.join("; ");
});
check("the storeys' playtest: twelve treads of 8 px as the drawn stairs lay them, and the feet on the top of the tread under them", () => {
  assert(mapMod.STAIR_TREADS === 12, `${mapMod.STAIR_TREADS} treads`);
  // The drawn stairs (art round 8): tread k (1 to 12) is 8k px tall over u = (8k - 4) / 32 to (8k + 4) / 32 tiles, bare floor before the first.
  const treadAt = (t) => {
    for (let k = 1; k <= 12; k++) if (t >= (8 * k - 4) / 32 - 1e-9 && t <= (8 * k + 4) / 32 + 1e-9) return k * 8;
    return 0;
  };
  for (let i = 0; i <= 600; i++) {
    const t = (i / 600) * 3;
    const r = mapMod.stairRise(t);
    const top = treadAt(t);
    const edge = Math.abs(t * 4 - Math.round(t * 4) - 0.5) < 1e-6 || Math.abs(t * 4 - Math.round(t * 4) + 0.5) < 1e-6; // on a riser itself, either tread
    assert(r === top || (edge && Math.abs(r - top) === 8), `at ${t.toFixed(3)}: rise ${r}, the tread there ${top}`);
  }
  const art = read("data/sprites/stair_wood.json");
  assert(mapMod.stairRise(0) === 0 && mapMod.stairRise(3) === 96 && mapMod.stairRise(1) === 32 && ["n", "w", "s", "e"].every((d) => art.drawings[d] && art.drawings[d].image), "the ends, a tile up, and the drawn stair's four facings");
  return "the rise is the tread under the feet at every point of the run";
});
check("the storeys' playtest: the landing is walked onto from its three open sides on the first floor and then down the stair; the stairwell's sides still stop a body", () => {
  const s = tallHouse();
  const [dx, dy] = s.d;
  const [lx, ly] = s.landing;
  const res = [];
  // The three open sides: beyond the landing up the stair's line, and either side of it.
  for (const [name, ox, oy] of [["beyond", dx, dy], ["left", -dy, dx], ["right", dy, -dx]]) {
    const p = { gx: lx + ox, gy: ly + oy, layer: 1, rise: 0 };
    stepBody(p, -ox * 0.05, -oy * 0.05, 20);
    const onLanding = Math.abs(p.gx - lx) < 0.05 && Math.abs(p.gy - ly) < 0.05 && p.layer === 1;
    stepBody(p, -dx * 0.05, -dy * 0.05, 80); // down the stair, four tiles: to the tile before its foot
    res.push(`${name}: on the landing ${onLanding}, then layer ${p.layer} at ${p.gx.toFixed(2)},${p.gy.toFixed(2)}`);
    assert(onLanding && p.layer === 0 && (p.rise || 0) === 0 && Math.hypot(p.gx - s.before[0], p.gy - s.before[1]) < 0.6, res.join("; "));
  }
  // The stairwell's sides: on the first floor beside the middle step, walking toward it, never into the hole.
  for (const side of [-1, 1]) {
    const [mx, my] = s.tiles[1];
    const p = { gx: mx - dy * side * 1, gy: my + dx * side * 1, layer: 1, rise: 0 };
    stepBody(p, dy * side * 0.05, -dx * side * 0.05, 40);
    const { off } = mapMod.stairAlong(s, p.gx, p.gy);
    res.push(`the well's ${side < 0 ? "left" : "right"} side: off ${off.toFixed(2)}, layer ${p.layer}`);
    assert(p.layer === 1 && Math.abs(off) >= 0.5 + 0.3 - 1e-6, res.join("; "));
  }
  return res.join("; ");
});
// ---- built floors and stairs (docs/49 section 5; Michael, 2026-10-27: "Floors are built a tile at a time, with no physics") ----
// Open grass near the valley's spawn, `w` by `h` tiles bare (no prop, wall, rug, or item), its corner.
const openGrass = (w, h) => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  mapMod.ensureAround(me.gx, me.gy, 3);
  for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) {
    const x = Math.round(me.gx) + dx;
    const y = Math.round(me.gy) + dy;
    let ok = true;
    for (let ay = -1; ay <= h && ok; ay++) for (let ax = -1; ax <= w && ok; ax++) { const t = mapMod.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.rug && !t.n && !t.w && !(t.items && t.items.length) && mapMod.isWalkableTile(x + ax, y + ay); }
    if (ok && !gameMod.state.zombies.concat(gameMod.state.villagers, gameMod.state.animals || []).some((c) => c.gx > x - 2 && c.gx < x + w + 1 && c.gy > y - 2 && c.gy < y + h + 1)) return [x, y];
  }
  return null;
};
check("built floors: laid on the ground by a drag (Free building only), the grass kept and put back by Take apart; refused on water, a stair, its landing, and its stairwell; the chunk's record carries it", () => {
  const at = openGrass(4, 4);
  assert(at, "no open grass");
  const [x, y] = at;
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  try {
    rulesImport.rules.freeBuilding = false;
    me.gx = x + 1.5; me.gy = y + 2.6; me.layer = 0;
    placementImport.performPlacement(me, { kind: "build", what: "floor_wood", tx: x, ty: y, tx2: x + 1, ty2: y + 1 });
    assert(mapMod.peekTile(x, y).floor === "floor_grass" && !placementImport.paletteKinds().some((k) => k.id === "floor_wood"), "a floor laid, or offered, with Free building off");
    rulesImport.rules.freeBuilding = true;
    assert(placementImport.paletteKinds().some((k) => k.id === "floor_wood") && placementImport.paletteKinds().some((k) => k.id === "floor_stone"), "the floors are not on the palette with Free building on");
    const before = gameMod.syncParts().map;
    placementImport.performPlacement(me, { kind: "build", what: "floor_wood", tx: x, ty: y, tx2: x + 1, ty2: y + 1 });
    const laid = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].map(([a, b]) => mapMod.peekTile(a, b));
    assert(laid.every((t) => t.floor === "floor_wood" && t.built && t.built.under === "floor_grass" && t.built.free), `the drag laid ${laid.map((t) => t.floor).join(",")}`);
    assert(gameMod.syncParts().map !== before, "the sync check's map part did not move with a laid floor");
    const c = mapMod.getChunk(Math.floor(x / mapMod.CHUNK), Math.floor(y / mapMod.CHUNK), false, 0);
    const rec = JSON.parse(JSON.stringify(mapMod.serializeChunk(c)));
    assert(rec.built && rec.built.some(([lx, ly, under]) => lx === x - c.cx * mapMod.CHUNK && ly === y - c.cy * mapMod.CHUNK && under === "floor_grass"), "the chunk's record has no built floor");
    mapMod.installChunk(rec);
    assert(mapMod.peekTile(x, y).built && mapMod.peekTile(x, y).floor === "floor_wood", "the record did not bring the floor back");
    // Take apart: the grass back; nothing back for a floor laid free.
    const t = { type: "floor", tx: x, ty: y, layer: 0 };
    assert(placementImport.partsOf(t).back.length === 0, "a free floor gives something back");
    me.gx = x + 0.5; me.gy = y + 1.6;
    placementImport.performPlacement(me, { kind: "remove", target: { type: "floor", tx: x, ty: y } });
    assert(mapMod.peekTile(x, y).floor === "floor_grass" && !mapMod.peekTile(x, y).built && mapMod.peekTile(x + 1, y).floor === "floor_wood", "Take apart did not put the grass back (or took a neighbour)");
    // Stone, over the plank: the grass is still what lies under it.
    placementImport.performPlacement(me, { kind: "build", what: "floor_stone", tx: x + 1, ty: y, tx2: x + 1, ty2: y });
    assert(mapMod.peekTile(x + 1, y).floor === "floor_stone" && mapMod.peekTile(x + 1, y).built.under === "floor_grass", "stone over plank lost the grass under it");
  } finally {
    rulesImport.rules.freeBuilding = free0;
  }
  // The refusals: water, the tall house's stair, its landing, its stairwell.
  let water = null;
  for (let dy = -40; dy <= 40 && !water; dy++) for (let dx = -40; dx <= 40 && !water; dx++) { const tt = mapMod.peekTile(x + dx, y + dy); if (tt && /water/.test(tt.floor)) water = [x + dx, y + dy]; }
  const s = mapMod.stairs().find((q) => q.building && q.layer === 0);
  const why = [water ? mapMod.floorBuildProblem(water[0], water[1], "floor_wood", 0) : "Not on water", mapMod.floorBuildProblem(s.tiles[1][0], s.tiles[1][1], "floor_wood", 0), mapMod.floorBuildProblem(s.landing[0], s.landing[1], "floor_stone", 1), mapMod.floorBuildProblem(s.tiles[1][0], s.tiles[1][1], "floor_wood", 1)];
  assert(why[0] === "Not on water" && why[1] === "Not over a stair" && why[2] === "Not on a stair's landing" && why[3] === "Not over a stair", `refusals: ${why.join("; ")}`);
  return `a 2 by 2 drag laid and its record kept; Take apart put the grass back; refused: ${why.join("; ")}`;
});
check("built stairs and floors upstairs: a stair built in the open climbing away from the camera, walked up, a floor grown from its landing tile by tile, refused away from it and over the stairwell, its open edge unwalkable, a wall built on it, kept by the save", () => {
  const at = openGrass(8, 7);
  assert(at, "no open grass");
  const [x, y] = at;
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  const walk = (dx, dy, n) => { for (let i = 0; i < n; i++) { const m = mapMod.moveCircle(me.gx, me.gy, 0.3, dx, dy, me.layer || 0); me.gx = m.gx; me.gy = m.gy; mapMod.stairStep(me); } };
  const res = [];
  try {
    rulesImport.rules.freeBuilding = true;
    // The stair's foot at (x + 5, y + 3), climbing west: its steps x + 5 to x + 3, its landing (x + 2, y + 3) a storey up.
    me.gx = x + 6.5; me.gy = y + 3; me.layer = 0; me.rise = 0;
    const n0 = mapMod.stairs().length;
    placementImport.performPlacement(me, { kind: "build", what: "stair_wood", tx: x + 3, ty: y + 3, dir: "e" });
    assert(mapMod.stairs().length === n0 && mapMod.stairBuildProblem(x + 3, y + 3, "e", 0) === "Stairs climb away from the camera", "a stair climbing toward the camera was built");
    placementImport.performPlacement(me, { kind: "build", what: "stair_wood", tx: x + 5, ty: y + 3, dir: "w" });
    const s = mapMod.stairs().find((q) => q.built && q.at[0] === x + 5 && q.at[1] === y + 3);
    assert(s && s.dir === "w" && mapMod.peekTile(x + 2, y + 3, 1).floor === "floor_wood" && [3, 4, 5].every((k) => mapMod.peekTile(x + k, y + 3, 1).floor === mapMod.VOID), `the stair: ${JSON.stringify(s && { at: s.at, dir: s.dir })}, landing ${mapMod.peekTile(x + 2, y + 3, 1) && mapMod.peekTile(x + 2, y + 3, 1).floor}`);
    res.push(`stair ${s.at} ${s.dir}`);
    // Up it.
    me.gx = x + 6; me.gy = y + 3;
    walk(-0.05, 0, 90);
    assert(me.layer === 1 && Math.abs(me.gx - (x + 2)) < 0.6, `the climb ended at ${me.gx.toFixed(2)},${me.gy.toFixed(2)} on layer ${me.layer}`);
    me.gx = x + 2; me.gy = y + 3;
    // Not touching any floor: refused.
    placementImport.performPlacement(me, { kind: "build", what: "floor_wood", tx: x, ty: y + 1, tx2: x, ty2: y + 1 });
    assert(mapMod.peekTile(x, y + 1, 1).floor === mapMod.VOID, "a floor laid touching nothing");
    // Over the stairwell: refused.
    assert(mapMod.floorBuildProblem(x + 3, y + 3, "floor_wood", 1) === "Not over a stair", "a floor over the stairwell");
    // A drag from the landing's side out: every tile grows from the landing, ring by ring.
    placementImport.performPlacement(me, { kind: "build", what: "floor_wood", tx: x, ty: y + 2, tx2: x + 1, ty2: y + 4 });
    const grown = [];
    for (let yy = y + 2; yy <= y + 4; yy++) for (let xx = x; xx <= x + 1; xx++) grown.push(mapMod.peekTile(xx, yy, 1).floor);
    assert(grown.every((f) => f === "floor_wood"), `the drag upstairs laid ${grown.join(",")}`);
    res.push("six tiles grown from the landing");
    // The open edge: walking west off the floor stops at its edge, never a fall.
    me.gx = x + 0.2; me.gy = y + 3;
    walk(-0.05, 0, 30);
    assert(me.layer === 1 && me.gx > x - 0.35 && mapMod.isWalkableTile(x - 1, y + 3, 1) === false, `off the edge: ${me.gx.toFixed(2)} on layer ${me.layer}`);
    // A wall on the built floor, from upstairs.
    me.gx = x + 0.4; me.gy = y + 4.1;
    placementImport.performPlacement(me, { kind: "build", what: "wall_oak", tx: x + 1, ty: y + 3, edge: "w" });
    const wl = mapMod.peekTile(x + 1, y + 3, 1).w;
    assert(wl && wl.kind === "wall" && !(mapMod.peekTile(x + 1, y + 3, 0).w), "no wall built on the upper floor, or it went on the ground");
    // Take apart refused under the wall; the tile beside taken up, back to the void, its neighbours as they were.
    assert(mapMod.floorTakeUpProblem(x + 1, y + 3, 1) === "A wall stands on it", "a floor under a wall comes up");
    me.gx = x + 1; me.gy = y + 2.4;
    placementImport.performPlacement(me, { kind: "remove", target: { type: "floor", tx: x + 1, ty: y + 4 } });
    assert(mapMod.peekTile(x + 1, y + 4, 1).floor === mapMod.VOID && mapMod.peekTile(x, y + 4, 1).floor === "floor_wood", "the upper tile was not taken up alone");
    res.push("a wall on it; a tile taken up");
    // The save keeps the stair and the floor: the chunks' records into a fresh world.
    const recs = [0, 1].map((l) => JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(Math.floor((x + 3) / mapMod.CHUNK), Math.floor((y + 3) / mapMod.CHUNK), false, l)))));
    assert(recs[0].stairs && recs[0].stairs.length === 1, "the stair's chunk has no stair record");
    gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
    for (const r of recs) mapMod.installChunk(r);
    const s2 = mapMod.stairs().find((q) => q.built && q.at[0] === x + 5 && q.at[1] === y + 3);
    assert(s2 && mapMod.stairAt(x + 4, y + 3, 0) && mapMod.peekTile(x, y + 3, 1).floor === "floor_wood", "the stair or the floor did not come back from the records");
    res.push("kept by the records");
  } finally {
    rulesImport.rules.freeBuilding = free0;
    me.layer = 0;
    me.rise = 0;
  }
  return res.join("; ");
});
// ---- the cutaway (Michael, 2026-10-30: "more transparency is needed here, even outside a room") ----
check("the cutaway: a wall between the camera and a cut point is cut, one behind it, beside it, or past its reach is not; the walls down cut every wall and every ring", () => {
  const cut = cutawayMod;
  try {
    cut.setCutaway({ points: [{ x: 10, y: 10 }] });
    const cases = [
      ["the wall just south of it", cut.edgeCut(10, 11, "n"), true],
      ["the wall just east of it", cut.edgeCut(11, 10, "w"), true],
      ["three tiles south", cut.edgeCut(10, 13, "n"), true],
      ["the wall north of it (behind)", cut.edgeCut(10, 10, "n"), false],
      ["the wall west of it (behind)", cut.edgeCut(10, 10, "w"), false],
      ["far past its reach to the south", cut.edgeCut(10, 20, "n"), false],
      ["far across the screen", cut.edgeCut(18, 3, "n"), false],
      ["a ring it stands in", cut.ringCut({ x0: 7, y0: 7, n: 7 }), true],
      ["a ring behind it", cut.ringCut({ x0: 0, y0: 0, n: 5 }), false],
    ];
    const ring = { x0: 21, y0: 0, n: 7 }; // the proving ground's ring
    cut.setCutaway({ points: [{ x: 24, y: 9 }] });
    cases.push(["a ring the point stands south of (in front of it)", cut.ringCut(ring), false]);
    cut.setCutaway({ points: [{ x: 23, y: -2 }] });
    cases.push(["a ring the point stands north of (behind it)", cut.ringCut(ring), true]);
    const bad = cases.filter(([, got, want]) => got !== want).map(([what, got]) => `${what}: ${got}`);
    cut.setCutaway({ points: [], down: true });
    const down = cut.allDown() && cut.edgeCut(0, 0, "n") && cut.ringCut({ x0: 50, y0: 50, n: 5 });
    cut.setCutaway(null);
    assert(!bad.length && down && !cut.active(), `${bad.join("; ")}${down ? "" : "; the walls down cut nothing"}`);
    return `${cases.length} cases as meant; the walls down cut every wall and ring; nothing cut once cleared`;
  } finally {
    cut.setCutaway(null);
  }
});

// ---- the Planning tool (Michael, 2026-10-30: "It lets me lay down any number of rulers ... place, keep it there, remove it when needed") ----
check("planning: a ruler laid and taken up by the commands a guest sends, on the player's storey, in its colour, refused out of bounds; kept in the save and the sync check; its words", () => {
  const json = read("data/maps/square.json");
  gameMod.create({ json, rules: { zombieAggro: false } });
  const S = gameMod.state;
  const me = S.player;
  me.layer = 0;
  const said = [];
  promptImport.setMessageSink((t) => (said.push(t), true));
  try {
    assert(!S.plans.length, `a new world has plans: ${S.plans.length}`);
    placementImport.performPlacement(me, { kind: "plan", ax: 12, ay: 4, bx: 6, by: 7, color: "pink" });
    placementImport.performPlacement(me, { kind: "plan", ax: 3, ay: 3, bx: 9, by: 3, color: "blue" });
    const [a, b] = S.plans;
    assert(S.plans.length === 2 && a.x0 === 6 && a.y0 === 4 && a.x1 === 12 && a.y1 === 7 && a.color === "pink" && a.layer === 0 && b.color === "blue", `laid: ${JSON.stringify(S.plans)}`);
    const words = [plansMod.textOf(a), plansMod.textOf(b), plansMod.sizeText(1, 1)];
    assert(words.join("|") === "7 × 4 tiles (28)|7 tiles|1 tile", `its words: ${words.join("|")}`);
    assert(plansMod.planAt(S, 6, 5, 0) === a && !plansMod.planAt(S, 8, 5, 0) && plansMod.planAt(S, 5, 3, 0) === b && !plansMod.planAt(S, 6, 5, 1), "a plan found by its drawn tiles, on its storey, the inside not");
    const before = said.length;
    placementImport.performPlacement(me, { kind: "plan", ax: 0, ay: 0, bx: 400, by: 0, color: "green" });
    placementImport.performPlacement(me, { kind: "plan", ax: 0, ay: 0, bx: 1, by: 1, color: "orange" });
    placementImport.performPlacement(me, { kind: "plan", ax: 1e15, ay: 0, bx: 1e15, by: 0, color: "blue" });
    assert(S.plans.length === 2 && said.length === before + 3, `out of bounds laid: ${S.plans.length} plans, ${said.slice(before).join(" / ")}`);
    const hashWith = gameMod.syncParts().plans;
    const save = JSON.parse(JSON.stringify(gameMod.serialize()));
    assert(save.plans.length === 2 && save.planNext === 2, `the save's plans: ${JSON.stringify(save.plans)} next ${save.planNext}`);
    gameMod.restore(save, json);
    assert(gameMod.state.plans.length === 2 && gameMod.state.plans[0].id === a.id && gameMod.syncParts().plans === hashWith, "the plans did not come back from the save as they were");
    placementImport.performPlacement(gameMod.state.player, { kind: "unplan", id: a.id });
    assert(gameMod.state.plans.length === 1 && gameMod.state.plans[0].id === b.id && gameMod.syncParts().plans !== hashWith, "taken up by its id: the list or the sync part did not change");
    placementImport.performPlacement(gameMod.state.player, { kind: "plan", ax: 1, ay: 1, bx: 2, by: 2, color: "yellow" });
    assert(gameMod.state.plans[1].id === "plan3", `a new plan's id after a restore: ${gameMod.state.plans[1].id}`);
    assert(!placementImport.paletteKinds().some((k) => k.id === "ruler"), "the ruler is still in the build menu");
    return `two laid (pink 7 × 4, blue 7), two refused, kept through the save, one taken up by its id; ${words.join(", ")}`;
  } finally {
    promptImport.setMessageSink(null);
  }
});

// ---- the Terrain tab (Michael, 2026-10-28: "Build menu becomes 2: Build, and Terrain") ----
check("the build palette's tabs are data: every entry's `tab` is a known one, every Terrain entry is `dev` (Free building only) and paints a floor with a definition, the pink floor has its chart colour, no `walk` field, and a place in the ground's table; the Terrain tab is offered only with Free building on", () => {
  const build = read("data/build.json");
  const tabs = placementImport.TABS.map((t) => t.id);
  const ground = read("data/ground.json");
  const bad = [];
  for (const [id, b] of Object.entries(build)) {
    if (b.tab !== undefined && !tabs.includes(b.tab)) bad.push(`${id}: unknown tab ${b.tab}`);
    if (b.tab === "terrain" && !b.dev) bad.push(`${id}: a Terrain entry that is not Free building only`);
    if (b.kind === "terrain") {
      if (b.tab !== "terrain") bad.push(`${id}: kind terrain but not on the Terrain tab`);
      let def = null;
      try { def = read(`data/sprites/${b.sprite}.json`); } catch { bad.push(`${id}: no sprite definition ${b.sprite}`); }
      if (def && !def.mapColor) bad.push(`${id}: ${b.sprite} has no mapColor`);
      if (!ground.floors[b.sprite]) bad.push(`${id}: ${b.sprite} is not in the ground's table`);
    }
  }
  assert(!bad.length, bad.join("; "));
  const terrain = Object.entries(build).filter(([, b]) => b.tab === "terrain").map(([id]) => id);
  for (const want of ["terrain_grass", "terrain_dirt", "terrain_cobble", "terrain_water_shallow", "terrain_water", "terrain_randomspawn", "wall_cliff", "wall_cliff_grass", "floor_cliff_top", "floor_cliff_grass", "stair_ramp_stone"]) assert(terrain.includes(want), `${want} is not on the Terrain tab`);
  assert(!terrain.some((id) => /^(wall|wall_\w+|door|window|fence|gate|floor_wood|floor_stone|stair_wood|stair_stone|fireplace|fire_pit|feed_trough|round_stone\w*)$/.test(id) && !/cliff|ramp/.test(id)), "a Build entry is on the Terrain tab");
  const pink = read("data/sprites/floor_randomspawn.json");
  assert(pink.mapColor && pink.mapColor.toLowerCase() === pink.placeholder.color.toLowerCase() && pink.walk === undefined && /nothing reads it/.test(pink.note), "the pink floor's definition");
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(pink.mapColor.slice(i, i + 2), 16));
  assert(r > 220 && b > 140 && g < 130 && r > g * 1.8, `the pink is not pink: ${pink.mapColor}`);
  const free0 = rulesImport.rules.freeBuilding;
  try {
    rulesImport.rules.freeBuilding = false;
    const off = placementImport.paletteTabs().map((t) => t.id).join(",");
    rulesImport.rules.freeBuilding = true;
    const on = placementImport.paletteTabs().map((t) => t.id).join(",");
    assert(off === "build" && on === "build,terrain", `tabs: off "${off}", on "${on}"`);
    assert(placementImport.paletteKinds().filter((k) => placementImport.tabOf(k) === "terrain").length === terrain.length, "the Terrain tab does not hold what the data names");
  } finally {
    rulesImport.rules.freeBuilding = free0;
  }
  return `${terrain.length} entries on Terrain, all Free building only; the pink ${pink.mapColor}; tabs "${placementImport.TABS.map((t) => t.id)}", Terrain only with Free building on`;
});
check("terrain paints the ground by the command a guest sends: grass over dirt, dirt, cobble, water, the pink, each a floor change with no `built` record, refused with Free building off and upstairs, and water refused under an item, a wall edge, and a body", () => {
  const at = openGrass(8, 8);
  assert(at, "no open grass");
  const [x, y] = at;
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  const paint = (what, a, b, a2 = a, b2 = b) => placementImport.performPlacement(me, { kind: "build", what, tx: x + a, ty: y + b, tx2: x + a2, ty2: y + b2 });
  const fl = (a, b) => mapMod.peekTile(x + a, y + b).floor;
  try {
    rulesImport.rules.freeBuilding = false;
    me.gx = x + 4; me.gy = y + 4; me.layer = 0;
    paint("terrain_dirt", 1, 1, 3, 3);
    assert(fl(1, 1) === "floor_grass" && !placementImport.paletteKinds().some((k) => k.kind === "terrain"), "painted, or offered, with Free building off");
    rulesImport.rules.freeBuilding = true;
    const before = gameMod.syncParts().map;
    paint("terrain_dirt", 1, 1, 3, 3);
    const tiles = [];
    for (let b = 1; b <= 3; b++) for (let a = 1; a <= 3; a++) tiles.push(mapMod.peekTile(x + a, y + b));
    assert(tiles.every((t) => t.floor === "floor_dirt" && !t.built), `the drag painted ${tiles.map((t) => t.floor).join(",")}`);
    assert(gameMod.syncParts().map !== before, "the sync check's map part did not move with a painted tile");
    // Grass over dirt, and a tile with a prop takes grass (a prop is no bar to dirt or grass).
    paint("terrain_grass", 2, 2);
    assert(fl(2, 2) === "floor_grass" && fl(1, 1) === "floor_dirt", "grass over dirt");
    const chest = mapMod.createProp({ sprite: "chest", tile: [x + 7, y + 7] });
    mapMod.placeProp(chest, x + 7, y + 7);
    paint("terrain_cobble", 7, 7);
    assert(fl(7, 7) === "floor_cobble" && mapMod.peekTile(x + 7, y + 7).prop === chest, "cobble under a prop was refused");
    paint("terrain_cobble", 7, 7);
    paint("terrain_randomspawn", 5, 1);
    paint("terrain_water_shallow", 5, 2);
    paint("terrain_water", 5, 3);
    assert([fl(5, 1), fl(5, 2), fl(5, 3)].join() === "floor_randomspawn,floor_water_shallow,floor_water" && mapMod.isWalkableTile(x + 5, y + 1) && mapMod.isWalkableTile(x + 5, y + 2) && !mapMod.isWalkableTile(x + 5, y + 3), `the pink walks, the shallows walk, the water does not: ${[fl(5, 1), fl(5, 2), fl(5, 3)]}`);
    // Water of either kind is refused under what stands or lies there and under a body; the pink and the dirt are not.
    mapMod.dropItem(x + 7, y + 1, { id: "stick", count: 1 });
    mapMod.buildWall(x + 7, y + 3, "n", "wall", "wall_log", null, 0);
    const why = {
      item: mapMod.paintGroundProblem(x + 7, y + 1, "floor_water", 0),
      itemShallow: mapMod.paintGroundProblem(x + 7, y + 1, "floor_water_shallow", 0),
      prop: mapMod.paintGroundProblem(x + 7, y + 7, "floor_water", 0),
      wall: mapMod.paintGroundProblem(x + 7, y + 3, "floor_water", 0),
      wallBelow: mapMod.paintGroundProblem(x + 7, y + 2, "floor_water", 0),
      dirtOnItem: mapMod.paintGroundProblem(x + 7, y + 1, "floor_dirt", 0),
    };
    assert(why.item === "Not under something" && why.itemShallow === "Not under something" && why.prop === "Not under something" && why.wall === "Not under something" && why.wallBelow === "Not under something" && why.dirtOnItem === "", JSON.stringify(why));
    me.gx = x + 4; me.gy = y + 5;
    paint("terrain_water", 4, 5);
    assert(fl(4, 5) === "floor_grass", "water was laid under the player's own feet");
    paint("terrain_water", 7, 1);
    assert(fl(8, 1) === "floor_grass", "water was laid under an item by the command");
    // A corpse lying there refuses water too (its loot must not end up on a tile no one walks), and takes dirt.
    const lying = gameMod.state.zombies.find((q) => !q.dead && !q.corpse);
    Object.assign(lying, { dead: true, corpse: true, gx: x + 6, gy: y + 4, layer: 0, burning: false, cremate: false });
    me.gx = x + 4; me.gy = y + 8;
    paint("terrain_water", 6, 4);
    paint("terrain_water_shallow", 6, 4);
    const corpseKept = fl(6, 4) === "floor_grass";
    paint("terrain_dirt", 6, 4);
    assert(corpseKept && fl(6, 4) === "floor_dirt", `water over a corpse: ${corpseKept ? "refused" : "laid"}; dirt over it: ${fl(6, 4)}`);
    lying.gx = x + 100; // out of the way again
    me.gx = x + 2; me.gy = y + 8;
    // A laid floor is refused, upstairs is refused, a stair's tile is refused.
    mapMod.buildFloor(x + 6, y + 6, "floor_wood", 0, { free: true });
    paint("terrain_dirt", 6, 6);
    assert(fl(6, 6) === "floor_wood" && mapMod.paintGroundProblem(x + 6, y + 6, "floor_dirt", 0) === "A floor is laid there", "dirt over a laid floor");
    assert(mapMod.paintGroundProblem(x + 1, y + 1, "floor_grass", 1) === "Terrain is the ground's", "terrain upstairs");
    me.layer = 1;
    paint("terrain_grass", 1, 1);
    assert(fl(1, 1) === "floor_dirt", "painted from upstairs");
    me.layer = 0;
    const s = mapMod.stairs().find((q) => q.building && q.layer === 0);
    assert(s && mapMod.paintGroundProblem(s.tiles[1][0], s.tiles[1][1], "floor_dirt", 0) === "Not over a stair", "a stair's tile paints");
    return `the pink walks, the shallows walk, the water does not; refused: ${Object.values(why).join(", ")}, under the player, over a laid floor, upstairs, over a stair`;
  } finally {
    rulesImport.rules.freeBuilding = free0;
  }
});
check("a terrain entry that forgot `dev` is no terrain (never paintable with Free building off), the tab and the ground's table are checked by validate-data, and painting inside a room changes no room (rooms read walls and earth, never a floor)", () => {
  const orig = read("data/build.json");
  const free0 = rulesImport.rules.freeBuilding;
  try {
    rulesImport.rules.freeBuilding = false;
    placementImport.setBuildData({ ...orig, terrain_nodev: { ...orig.terrain_dirt, dev: false } });
    assert(placementImport.isTerrainBuild("terrain_dirt") && !placementImport.isTerrainBuild("terrain_nodev"), "a terrain entry without dev is terrain");
    const at = openGrass(6, 6);
    assert(at, "no open grass");
    const [x, y] = at;
    placementImport.setBuildData({ ...orig, terrain_nodev: { ...orig.terrain_dirt, dev: false } });
    const me = gameMod.state.player;
    me.gx = x + 2; me.gy = y + 3; me.layer = 0;
    placementImport.performPlacement(me, { kind: "build", what: "terrain_nodev", tx: x, ty: y, tx2: x + 1, ty2: y + 1 });
    assert(mapMod.peekTile(x, y).floor === "floor_grass", "an entry without dev painted with Free building off");
  } finally {
    placementImport.setBuildData(orig);
    rulesImport.rules.freeBuilding = free0;
  }
  // A room is found by its walls (and earth): painting its floor leaves its tiles, its id, and the count as they were.
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  let spot = null;
  for (let dy = -30; dy <= 30 && !spot; dy++) for (let dx = -30; dx <= 30 && !spot; dx++) {
    const px = Math.round(me.gx) + dx;
    const py = Math.round(me.gy) + dy;
    const t = mapMod.peekTile(px, py, 0);
    if (t && mapMod.roomAt(px, py) > 0 && !t.prop && !t.rug) spot = [px, py];
  }
  assert(spot, "no room near the spawn");
  const [rx, ry] = spot;
  const id = mapMod.roomAt(rx, ry);
  const size = mapMod.getRoom(id).size;
  const count = mapMod.roomCount();
  const free1 = rulesImport.rules.freeBuilding;
  try {
    rulesImport.rules.freeBuilding = true;
    me.gx = rx; me.gy = ry; me.layer = 0;
    for (const [what, a, b] of [["terrain_dirt", 0, 0], ["terrain_water_shallow", 1, 0], ["terrain_randomspawn", 0, 1]]) placementImport.performPlacement(me, { kind: "build", what, tx: rx + a, ty: ry + b, tx2: rx + a, ty2: ry + b });
    assert(mapMod.peekTile(rx, ry).floor === "floor_dirt", "nothing painted in the room");
    assert(mapMod.roomAt(rx, ry) === id && mapMod.getRoom(id).size === size && mapMod.roomCount() === count, `the room moved: ${id} of ${size}, now ${mapMod.roomAt(rx, ry)} of ${mapMod.getRoom(id) && mapMod.getRoom(id).size}, ${count} rooms, now ${mapMod.roomCount()}`);
  } finally {
    rulesImport.rules.freeBuilding = free1;
  }
  return `an entry without dev refused; room ${id} of ${size} tiles kept through paints inside it (${count} rooms)`;
});
check("a terrain drag is at most 24 tiles a side and Free building waives the reach (2026-10-29, `FREE_REACH`), by the same command: a 25-wide drag is refused outright, a 24-wide one paints all 24 even from its far end", () => {
  const at = openGrass(26, 3);
  assert(at, "no open grass 26 by 3");
  const [x, y] = at;
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  const dirt = () => { let k = 0; for (let i = 0; i < 26; i++) if (mapMod.peekTile(x + i, y + 1).floor === "floor_dirt") k++; return k; };
  try {
    rulesImport.rules.freeBuilding = true;
    me.gx = x + 12; me.gy = y + 1; me.layer = 0;
    placementImport.performPlacement(me, { kind: "build", what: "terrain_dirt", tx: x, ty: y + 1, tx2: x + 24, ty2: y + 1 });
    const n25 = dirt();
    placementImport.performPlacement(me, { kind: "build", what: "terrain_dirt", tx: x, ty: y + 1, tx2: x + 23, ty2: y + 1 });
    const n24 = dirt();
    assert(n25 === 0 && n24 === 24, `a 25-wide drag painted ${n25}, a 24-wide ${n24}`);
    me.gx = x - 1; me.gy = y + 1;
    for (let i = 0; i < 26; i++) mapMod.setFloor(x + i, y + 1, "floor_grass", 0);
    placementImport.performPlacement(me, { kind: "build", what: "terrain_dirt", tx: x, ty: y + 1, tx2: x + 23, ty2: y + 1 });
    const near = dirt();
    assert(near === 24 && mapMod.peekTile(x + 14, y + 1).floor === "floor_dirt", `from the drag's end ${near} of 24 were painted (tile 14 ${mapMod.peekTile(x + 14, y + 1).floor}): Free building has no reach limit`);
    return `a 25-wide drag refused, a 24-wide one painted 24; from one end ${near} of 24 painted (no reach under Free building)`;
  } finally {
    rulesImport.rules.freeBuilding = free0;
  }
});
check("a painted tile is saved and sent with its chunk, and a wild chunk holding one is not evicted and regrown away (an untouched wild chunk beside it is)", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  try {
    rulesImport.rules.freeBuilding = true;
    const C = mapMod.CHUNK;
    const X = 40 * C + 3;
    const Y = 40 * C + 3;
    mapMod.ensureAround(X, Y, 3);
    const c = mapMod.getChunk(Math.floor(X / C), Math.floor(Y / C), false, 0);
    assert(c && c.wild, "the far chunk is not wild");
    me.gx = X; me.gy = Y + 1; me.layer = 0;
    placementImport.performPlacement(me, { kind: "build", what: "terrain_randomspawn", tx: X + 1, ty: Y, tx2: X + 1, ty2: Y });
    const t = mapMod.peekTile(X + 1, Y);
    assert(t.floor === "floor_randomspawn" && !t.built && c.dirty, `painted ${t.floor}, dirty ${c.dirty}`);
    const rec = JSON.parse(JSON.stringify(mapMod.serializeChunk(c)));
    mapMod.setFloor(X + 1, Y, "floor_grass", 0);
    mapMod.installChunk(rec);
    assert(mapMod.peekTile(X + 1, Y).floor === "floor_randomspawn", "the chunk's record did not bring the painted tile back");
    const neighbour = [Math.floor(X / C) + 3, Math.floor(Y / C)];
    mapMod.ensureAround(neighbour[0] * C + 3, neighbour[1] * C + 3, 0);
    assert(mapMod.getChunk(neighbour[0], neighbour[1], false, 0), "no neighbouring wild chunk to compare");
    mapMod.evictFar(-4000, -4000, 2);
    assert(mapMod.getChunk(Math.floor(X / C), Math.floor(Y / C), false, 0) && mapMod.peekTile(X + 1, Y).floor === "floor_randomspawn", "the painted chunk was evicted");
    assert(!mapMod.getChunk(neighbour[0], neighbour[1], false, 0), "the untouched wild chunk beside it was not evicted (the comparison proves nothing)");
    return "the pink tile came back from its chunk's record, and the chunk stayed through evictFar while its untouched neighbour went";
  } finally {
    rulesImport.rules.freeBuilding = free0;
  }
});
// ---- the cliffs (art round 10, Michael 2026-10-28: "wire that cliff art for testing"; Free building's pieces) ----
const cliffsMod = await import("../src/cliffs.js");
const CLIFF_IDS = ["wall_cliff", "wall_cliff_grass", "floor_cliff_top", "floor_cliff_grass", "stair_ramp_stone"];
check("the cliffs on the palette: a cliff wall and a grassy one, a cliff top and a grassy one, and the stone ramp, each `dev` (Free building only): hidden and refused with it off (the command a guest sends too), built with it on", () => {
  const at = openGrass(6, 6);
  assert(at, "no open grass");
  const [x, y] = at;
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  try {
    rulesImport.rules.freeBuilding = false;
    const off = placementImport.paletteKinds().filter((k) => CLIFF_IDS.includes(k.id)).length;
    me.gx = x + 1.5; me.gy = y + 1.6; me.layer = 0;
    placementImport.performPlacement(me, { kind: "build", what: "wall_cliff", tx: x + 1, ty: y + 1, edge: "n" });
    placementImport.performPlacement(me, { kind: "build", what: "floor_cliff_top", tx: x, ty: y + 2, tx2: x, ty2: y + 2 });
    const refusedOff = !mapMod.peekTile(x + 1, y + 1).n && mapMod.peekTile(x, y + 2).floor === "floor_grass";
    rulesImport.rules.freeBuilding = true;
    const on = placementImport.paletteKinds().filter((k) => CLIFF_IDS.includes(k.id)).map((k) => k.id);
    placementImport.performPlacement(me, { kind: "build", what: "wall_cliff", tx: x + 1, ty: y + 1, edge: "n" });
    placementImport.performPlacement(me, { kind: "build", what: "floor_cliff_grass", tx: x, ty: y + 2, tx2: x, ty2: y + 2 });
    const w = mapMod.peekTile(x + 1, y + 1).n;
    assert(off === 0 && refusedOff, `with Free building off: ${off} on the palette, built ${!refusedOff}`);
    assert(CLIFF_IDS.every((id) => on.includes(id)), `with it on the palette lacks ${CLIFF_IDS.filter((id) => !on.includes(id)).join(", ")}`);
    assert(w && w.kind === "wall" && w.sprite === "wall_cliff" && w.built && w.free && mapMod.peekTile(x, y + 2).floor === "floor_cliff_grass", `built: ${w ? w.sprite : "no wall"}, floor ${mapMod.peekTile(x, y + 2).floor}`);
    // A cliff is a wall as stone is: it blocks bodies and sight, and bounds a room.
    assert(mapMod.blocksMove(w) && !mapMod.wallRule("wall_cliff").seeThrough && mapMod.wallRule("wall_cliff").cliff && !mapMod.wallRule("wall_stone").cliff, "a cliff does not block as a wall");
    mapMod.destroyWall(x + 1, y + 1, "n");
    mapMod.takeUpFloor(x, y + 2, 0);
    return `off: none offered, none built; on: ${on.join(", ")}; a built cliff wall blocks bodies and sight`;
  } finally {
    rulesImport.rules.freeBuilding = free0;
  }
});
check("a cliff takes no door or window (\"Not in a cliff\", the command a guest sends refused), no painting and no torch (\"Not on a cliff\"), and comes apart only while Free building is on", () => {
  const at = openGrass(6, 6);
  assert(at, "no open grass");
  const [x, y] = at;
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  try {
    rulesImport.rules.freeBuilding = true;
    me.gx = x + 1.5; me.gy = y + 1.6; me.layer = 0;
    placementImport.performPlacement(me, { kind: "build", what: "wall_cliff_grass", tx: x + 1, ty: y + 1, edge: "n" });
    const w = mapMod.peekTile(x + 1, y + 1).n;
    assert(w && w.sprite === "wall_cliff_grass", "no cliff built");
    placementImport.performPlacement(me, { kind: "build", what: "door", tx: x + 1, ty: y + 1, edge: "n" });
    placementImport.performPlacement(me, { kind: "build", what: "window", tx: x + 1, ty: y + 1, edge: "n" });
    const still = mapMod.peekTile(x + 1, y + 1).n;
    assert(still === w && still.kind === "wall", `the cliff became a ${still && still.kind}`);
    assert(!mapMod.canStampOver(w, "door") && !mapMod.canStampOver(w, "window"), "canStampOver takes an opening into a cliff");
    const hang = paintingsMod.segmentProblem(x + 1, y + 1, "n");
    const torch = setdownMod.mountProblem(x + 1, y + 1, "n");
    assert(hang === "Not on a cliff" && torch === "Not on a cliff", `painting: ${hang}; torch: ${torch}`);
    const t = { type: "wall", tx: x + 1, ty: y + 1, edge: "n", wall: w, layer: 0 };
    rulesImport.rules.freeBuilding = false;
    const offWhy = placementImport.takeApartProblem(me, t);
    rulesImport.rules.freeBuilding = true;
    const onWhy = placementImport.takeApartProblem(me, t);
    assert(offWhy === "Cliffs come apart only in Free building" && onWhy === "", `Take apart: off "${offWhy}", on "${onWhy}"`);
    placementImport.performPlacement(me, { kind: "remove", target: { type: "wall", tx: x + 1, ty: y + 1, edge: "n" } });
    assert(!mapMod.peekTile(x + 1, y + 1).n, "Take apart left the cliff");
    return `door and window refused; ${hang}; Take apart: "${offWhy}" off, allowed on`;
  } finally {
    rulesImport.rules.freeBuilding = free0;
  }
});
// ---- the castle gates (Michael, 2026-10-29, docs/09): the map-level pieces, as far as they run under Node (the pictures, the cursor, and the dead's steps are the pane's: check("gates")) ----
const { lineOfReach: lineOfReachMod } = await import("../src/visibility.js");
check("castle gates: built over plain stone edges by the command a guest sends (Free building only, free, at once), shut, one wall on each edge with its place in the run; refused over a door, a window, a painting, a torch, a gap, another gate, or a log wall; taken apart whole, the plain wall back; a gate across a chunk's edge is whole and its record round-trips", () => {
  const at = openGrass(14, 6);
  assert(at, "no open grass");
  const [x, y] = at;
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  const made = [];
  try {
    for (let i = 0; i < 14; i++) { mapMod.buildWall(x + i, y + 2, "n", "wall", "wall_stone"); made.push([x + i, y + 2, "n"]); }
    me.gx = x + 1.9; me.gy = y + 3.2; me.layer = 0;
    rulesImport.rules.freeBuilding = false;
    placementImport.performPlacement(me, { kind: "build", what: "gate_stone_2", tx: x + 1, ty: y + 2, edge: "n" });
    assert(!mapMod.wallBetween(x + 1, y + 2, x + 1, y + 1).gate, "a gate was built with Free building off");
    assert(placementImport.paletteKinds().every((k) => !placementImport.isGateBuild(k.id)), "a gate is offered with Free building off");
    rulesImport.rules.freeBuilding = true;
    const offered = placementImport.paletteKinds().filter((k) => placementImport.isGateBuild(k.id));
    assert(offered.length === 2 && offered.every((k) => k.group === "Castle" && k.dev && placementImport.costText(k.id) === "free"), `the palette's gates: ${offered.map((k) => k.id)}`);
    placementImport.performPlacement(me, { kind: "build", what: "gate_stone_2", tx: x + 1, ty: y + 2, edge: "n" });
    assert(!me.action, "a gate is a timed build");
    const g2 = mapMod.gateMembers(x + 1, y + 2, "n", 0);
    assert(g2.length === 2 && g2.every((m, k) => m.wall.kind === "door" && m.wall.gate.i === k && m.wall.sprite === "wall_stone_gate_2" && !m.wall.open && m.wall.under === "wall_stone" && m.wall.built && m.wall.free && m.wall.hp === 300), "the 2-wide gate (300 an edge, docs/53 step 6)");
    // What a door is to a body and a path, and what a gate is besides.
    const w = g2[0].wall;
    assert(mapMod.blocksMove(w) && !mapMod.wayOpen(w) && !mapMod.canStep(x + 1, y + 2, x + 1, y + 1), "a shut gate stops a body and a path");
    assert(mapMod.transmission(w) === 1 && !mapMod.blocksSight(w) && lineOfSight(x + 1, y + 3, x + 1, y), "sight and light pass a shut gate");
    assert(mapMod.blocksReach(w) && !lineOfReachMod(x + 1, y + 3, x + 1, y) && !mapMod.blocksReach({ kind: "wall", sprite: "wall_fence", boards: { near: [], far: [] } }), "a blow and a bite do not");
    assert(archeryMod.wallStops(w, 30) === false && archeryMod.wallStops(w, 60) === false && archeryMod.wallStops(w, 85) === true, "a shot passes under the crown, shut");
    assert(mapMod.needsBreaking(w) && mapMod.damageOpening(w, 1, 10) === null && w.hp === 290 && !w.broken, "the dead do not wear a shut gate down (Michael, 2026-10-30: about three doors, 300)");
    w.hp = 300;
    assert(!mapMod.canStampOver(w, "door") && !mapMod.canStampOver(w, "window") && !mapMod.canBuildWall(x + 1, y + 2, "n", "door"), "no door nor window over a gate");
    assert(mapMod.addBoard(w, 1) === false || w.boards.near.length === 0, "a gate takes no board");
    // Open and shut as one.
    assert(mapMod.setGateOpen(x + 2, y + 2, "n", true, 0) && g2.every((m) => m.wall.open) && mapMod.wayOpen(w) && !mapMod.blocksMove(w), "opened from its second edge: both edges open");
    assert(!mapMod.blocksReach(w) && archeryMod.wallStops(w, 30) === false && archeryMod.wallStops(w, 85) === true, "open: a blow passes and the stone over the crown still stops a shot");
    mapMod.setGateOpen(x + 1, y + 2, "n", false, 0);
    // Refusals, in their words, each leaving the wall as it was.
    const keep = (xx) => JSON.stringify(mapMod.peekTile(xx, y + 2).n && [mapMod.peekTile(xx, y + 2).n.kind, mapMod.peekTile(xx, y + 2).n.sprite]);
    const refused = (label, what, tx, why) => {
      const was = [tx, tx + 1, tx + 2].map(keep).join();
      me.gx = tx + 0.9; me.gy = y + 3.2;
      placementImport.performPlacement(me, { kind: "build", what, tx, ty: y + 2, edge: "n" });
      assert([tx, tx + 1, tx + 2].map(keep).join() === was, `${label}: built`);
      const got = mapMod.gateProblem(tx, y + 2, "n", `wall_stone_gate_${what.endsWith("3") ? 3 : 2}`, 0);
      assert(got === why, `${label}: "${got}", expected "${why}"`);
    };
    refused("over a gate", "gate_stone_2", x + 1, "Already a gate");
    refused("over a gap", "gate_stone_2", x + 14, "Over a stone wall");
    mapMod.destroyWall(x + 6, y + 2, "n"); mapMod.buildWall(x + 6, y + 2, "n", "wall", "wall_log");
    refused("over a log wall", "gate_stone_2", x + 5, "Over a plain stone wall");
    mapMod.destroyWall(x + 6, y + 2, "n"); mapMod.buildWall(x + 6, y + 2, "n", "wall", "wall_stone");
    mapMod.buildWall(x + 6, y + 2, "n", "door", "wall_stone");
    refused("over a door", "gate_stone_2", x + 5, "Over a plain stone wall");
    mapMod.destroyWall(x + 6, y + 2, "n", true);
    mapMod.buildWall(x + 6, y + 2, "n", "window", "wall_stone");
    refused("over a window", "gate_stone_2", x + 5, "Over a plain stone wall");
    mapMod.destroyWall(x + 6, y + 2, "n", true);
    const w6 = mapMod.peekTile(x + 6, y + 2).n;
    w6.hangings = [{ item: "painting_small_oak", slot: "top", span: 1 }];
    refused("over a painting", "gate_stone_2", x + 5, "Take what hangs there down first");
    delete w6.hangings;
    w6.bracket = { side: 1, torch: true, lit: false };
    refused("over a torch", "gate_stone_2", x + 5, "Take the torch down first");
    delete w6.bracket;
    // The 3-wide gate, and a gate across a chunk's edge: its two chunks both carry it, and a record read back gives it as it was.
    const C = mapMod.CHUNK;
    const cornerX = Math.ceil((x + 3) / C) * C;
    for (let i = -3; i <= 3; i++) if (!mapMod.peekTile(cornerX + i, y + 2).n) { mapMod.buildWall(cornerX + i, y + 2, "n", "wall", "wall_stone"); made.push([cornerX + i, y + 2, "n"]); }
    me.gx = cornerX + 0.5; me.gy = y + 3.2;
    placementImport.performPlacement(me, { kind: "build", what: "gate_stone_3", tx: cornerX - 1, ty: y + 2, edge: "n" });
    const g3 = mapMod.gateMembers(cornerX, y + 2, "n", 0);
    assert(g3.length === 3 && g3.map((m) => m.tx).join() === [cornerX - 1, cornerX, cornerX + 1].join() && g3.every((m) => m.wall.sprite === "wall_stone_gate_3"), `the 3-wide gate: ${g3.length}`);
    mapMod.takeTouched();
    mapMod.setGateOpen(cornerX, y + 2, "n", true, 0);
    const touched = mapMod.takeTouched().map((t) => t.join(","));
    const cA = [Math.floor((cornerX - 1) / C), Math.floor((y + 2) / C)];
    const cB = [Math.floor(cornerX / C), Math.floor((y + 2) / C)];
    assert(cA[0] !== cB[0] && touched.includes(cA.join(",")) && touched.includes(cB.join(",")), `across a chunk's edge: touched ${touched}`);
    const textOf = () => [cA, cB].map((c) => JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(c[0], c[1], false, 0)).walls)).join("|");
    const before = textOf();
    for (const c of [cA, cB]) mapMod.installChunk(JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(c[0], c[1], false, 0)))));
    assert(textOf() === before && mapMod.gateMembers(cornerX + 1, y + 2, "n", 0).length === 3 && mapMod.gateMembers(cornerX, y + 2, "n", 0).every((m) => m.wall.open), "its record read back is the gate as it stood");
    // Taken apart whole by the command a guest sends, aimed at one edge.
    placementImport.performPlacement(me, { kind: "remove", target: { type: "wall", tx: cornerX + 1, ty: y + 2, edge: "n" } });
    assert([cornerX - 1, cornerX, cornerX + 1].every((xx) => { const ww = mapMod.peekTile(xx, y + 2).n; return ww && ww.kind === "wall" && ww.sprite === "wall_stone" && !ww.gate; }), "taking an edge apart did not take the gate whole");
    mapMod.destroyWall(x + 1, y + 2, "n", true);
    assert([x + 1, x + 2].every((xx) => { const ww = mapMod.peekTile(xx, y + 2).n; return ww && ww.kind === "wall" && ww.sprite === "wall_stone" && !ww.gate; }), "a destroyed gate left a hole or a half");
    return "built, refused (gate, gap, log, door, window, painting, torch), open and shut as one, across a chunk's edge, taken apart whole";
  } finally {
    rulesImport.rules.freeBuilding = free0;
    for (const [xx, yy, e] of made) if (mapMod.peekTile(xx, yy) && mapMod.peekTile(xx, yy)[e]) mapMod.destroyWall(xx, yy, e, true);
  }
});
check("castle gates: a room closed by a gate is a room and sealed (the gate bounds the fill though it passes sight, and a fence bounds none), the dead break its gate whole (docs/53 step 6), and the flags on the definition are what decide each ruling", () => {
  const at = openGrass(6, 6);
  assert(at, "no open grass");
  const [x, y] = at;
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  const rule = mapMod.wallRule("wall_stone_gate_2").gate;
  const was = { ...rule };
  const made = [];
  try {
    rulesImport.rules.freeBuilding = true;
    const lay = (xx, yy, e, sprite = "wall_stone") => { mapMod.buildWall(xx, yy, e, "wall", sprite); made.push([xx, yy, e]); };
    for (let i = 0; i < 2; i++) { lay(x + i, y, "n"); lay(x + i, y + 2, "n"); }
    for (let j = 0; j < 2; j++) { lay(x, y + j, "w"); lay(x + 2, y + j, "w"); }
    mapMod.roomsIfDirty();
    assert(mapMod.tileAt(x, y + 1).room > 0, "walls on every side are no room");
    me.gx = x + 0.5; me.gy = y - 1.1; me.layer = 0;
    placementImport.performPlacement(me, { kind: "build", what: "gate_stone_2", tx: x, ty: y, edge: "n" });
    const gm = mapMod.gateMembers(x, y, "n", 0);
    assert(gm.length === 2, "no gate");
    const room = mapMod.getRoom(mapMod.tileAt(x, y + 1).room);
    assert(room && room.openings.some((o) => o.tx === x && o.ty === y && o.edge === "n") && mapMod.roomSealed(room), "the shut gate is a room's sealed opening");
    assert(mapMod.breachTargets(room, x + 0.5, y - 3, 0, true).length === 2, "the dead do not have the gate's two edges to break (docs/53 step 6: gates break)");
    // Broken at one edge, it gives way whole: both edges broken and open, a way in, and its portcullis no longer drawn.
    assert(mapMod.damageOpening(gm[0].wall, 1, 300) === "leaf" && gm.every((m) => m.wall.broken && m.wall.open && mapMod.wayOpen(m.wall)), "a gate broken at one edge is not a way through whole");
    assert(mapMod.breachTargets(mapMod.getRoom(mapMod.tileAt(x, y + 1).room) || room, x + 0.5, y - 3, 0, true).length === 0, "a broken gate is still a breach target");
    // The control: a door in the same place is a breach target; a fence in its place bounds no room at all.
    mapMod.destroyWall(x, y, "n", true);
    mapMod.buildWall(x, y, "n", "door", "wall_stone");
    const doored = mapMod.getRoom(mapMod.tileAt(x, y + 1).room);
    assert(doored && mapMod.breachTargets(doored, x + 0.5, y - 3, 0, true).length === 1, "a door of the same room is not a breach target");
    mapMod.destroyWall(x, y, "n", true);
    mapMod.destroyWall(x + 1, y, "n", false);
    mapMod.buildWall(x, y, "n", "wall", "wall_fence");
    mapMod.buildWall(x + 1, y, "n", "wall", "wall_fence");
    assert(mapMod.tileAt(x, y + 1).room === 0, "a fence bounds a room");
    // The flags: each ruling flipped on the definition, then restored.
    mapMod.destroyWall(x, y, "n"); mapMod.destroyWall(x + 1, y, "n");
    lay(x, y, "n"); lay(x + 1, y, "n");
    rule.deadBreak = false;
    const held = mapMod.createWall("door", "wall_stone_gate_2");
    held.gate = { i: 0 };
    const holds = !mapMod.needsBreaking(held) && held.hp === Infinity && mapMod.damageOpening(held, 1, 999) === null && !held.broken;
    Object.assign(rule, was);
    const hard = mapMod.createWall("door", "wall_stone_gate_2");
    hard.gate = { i: 0 };
    assert(holds && mapMod.needsBreaking(hard) && hard.hp === 300, "deadBreak: the flag is not what decides whether the dead break it");
    rule.shotsPass = false;
    const stopped = archeryMod.wallStops(hard, 30);
    Object.assign(rule, was);
    rule.bitesPass = true;
    const reaches = !mapMod.blocksReach(hard);
    Object.assign(rule, was);
    rule.grille = false;
    const sees = mapMod.transmission(hard);
    Object.assign(rule, was);
    assert(stopped === true && reaches && sees === 0 && archeryMod.wallStops(hard, 30) === false && mapMod.blocksReach(hard) && mapMod.transmission(hard) === 1, `the flags: shots stopped ${stopped}, bites pass ${reaches}, sight ${sees}`);
    // A gate made while the dead could not break it (its health Infinity, saved as null) is breakable, whole, once the flag is flipped.
    assert(mapMod.buildGate(x, y, "n", "wall_stone_gate_2", 0, { free: true }), "no gate to flip the flag on");
    const living = mapMod.gateMembers(x, y, "n", 0);
    living.forEach((m) => { m.wall.hp = null; });
    rule.deadBreak = false;
    assert(mapMod.damageOpening(living[0].wall, 1, 999) === null && !living[0].wall.broken, "a gate broke with the flag off");
    Object.assign(rule, was); // on since docs/53 step 6
    let broke = null;
    for (let i = 0; i < 5 && !broke; i++) broke = mapMod.damageOpening(living[1].wall, 1, 120);
    assert(broke === "leaf" && living.every((m) => m.wall.broken && m.wall.open) && mapMod.wayOpen(living[0].wall), `with the flag on a gate breaks whole: ${broke}`);
    Object.assign(rule, was);
    mapMod.destroyWall(x, y, "n", true);
    return "a gate-closed room is a sealed room whose gate the dead break (300 an edge, whole), a door there is a breach target, a fence bounds no room; the four flags each decide their ruling, and a gate saved while it could not break takes its health when it can";
  } finally {
    Object.assign(rule, was);
    rulesImport.rules.freeBuilding = free0;
    for (const [xx, yy, e] of made) if (mapMod.peekTile(xx, yy) && mapMod.peekTile(xx, yy)[e]) mapMod.destroyWall(xx, yy, e, true);
    for (const e of [[x, y, "n"], [x + 1, y, "n"]]) if (mapMod.peekTile(e[0], e[1])[e[2]]) mapMod.destroyWall(...e);
  }
});
// The artist's hill (tools/art-gen/round10/cliffs/gen.py HILL): an L with a two-wide notch, a step each side of it, a back L, a step on the
// right, its plateau a floor on layer 1, a stone ramp climbing north to the landing 'L'. Laid on open grass at (x, y).
const CLIFF_HILL = ["............", "......####..", "..########..", "..########..", "..#########.", "..#L#..####."];
const cliffHillEdges = (P) => {
  const isP = (a, b) => P.has(`${a},${b}`);
  const edges = new Set();
  for (const k of P) {
    const [a, b] = k.split(",").map(Number);
    for (const [e, ex, ey] of [["n", a, b], ["n", a, b + 1], ["w", a, b], ["w", a + 1, b]]) {
      const [p, q] = e === "n" ? [[ex, ey], [ex, ey - 1]] : [[ex, ey], [ex - 1, ey]];
      if (isP(...p) !== isP(...q)) edges.add(`${e},${ex},${ey}`);
    }
  }
  edges.delete("n,3,6"); // the ramp's head
  return edges;
};
// The artist's own rule for the corners (gen.py build_hill), written again from the plan alone: a vertex with one plateau quadrant or three,
// whose two edges are cliff edges, named by the quadrant; an edge two corners claim takes each one's half.
const cliffHillCorners = (P, edges) => {
  const isP = (a, b) => P.has(`${a},${b}`);
  const outn = { "-1,-1": "outer_s", "1,-1": "outer_w", "-1,1": "outer_e", "1,1": "outer_n" };
  const inn = { "1,1": "inner_n", "-1,1": "inner_e", "1,-1": "inner_w", "-1,-1": "inner_s" };
  const list = [];
  const claims = {};
  for (let vy = -1; vy <= 8; vy++) for (let vx = -1; vx <= 14; vx++) {
    const q = { "-1,-1": isP(vx - 1, vy - 1), "1,-1": isP(vx, vy - 1), "-1,1": isP(vx - 1, vy), "1,1": isP(vx, vy) };
    const c = Object.values(q).filter(Boolean).length;
    if (c !== 1 && c !== 3) continue;
    const s = Object.keys(q).find((k) => q[k] === (c === 1));
    const [sx, sy] = s.split(",").map(Number);
    const ce = [`n,${sx > 0 ? vx : vx - 1},${vy}`, `w,${vx},${sy > 0 ? vy : vy - 1}`];
    if (!ce.every((e) => edges.has(e))) continue;
    list.push({ vx, vy, name: (c === 1 ? outn : inn)[s], ce });
    for (const e of ce) (claims[e] = claims[e] || []).push(`${vx},${vy}`);
  }
  return list.map((k) => {
    const h = k.ce.map((e, i) => (claims[e].length > 1 ? "nw"[i] : "")).join("");
    return { ...k, frame: `${k.name}${h ? `_h${h}` : ""}` };
  });
};
check("the cliffs' corners: the artist's hill built by the commands a guest sends (its walls, the stone ramp, its plateau grown from the ramp's landing), and at every vertex the corner the artist's rule names, outer and inner, halved where a step is one tile long; each straight edge's face or back; widened past a step, the walls left with plateau on both sides buried (no ridge) and the corners still the rule's", () => {
  // The valley's open meadow north-east of the spawn (the pane's test of the same hill stood there), checked open first.
  const X0 = 146;
  const Y0 = 138;
  mapMod.ensureAround(X0 + 6, Y0 + 5, 3);
  for (let b = -1; b <= 11; b++) for (let a = 0; a <= 12; a++) { const t = mapMod.peekTile(X0 + a, Y0 + b); assert(t && !t.prop && !t.n && !t.w && !t.rug && mapMod.isWalkableTile(X0 + a, Y0 + b) && !mapMod.stairAt(X0 + a, Y0 + b, 0), `the meadow is not open at ${X0 + a},${Y0 + b}`); }
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  const P = new Set();
  CLIFF_HILL.forEach((row, b) => [...row].forEach((ch, a) => { if (ch === "#" || ch === "L") P.add(`${a},${b}`); }));
  const edges = cliffHillEdges(P);
  try {
    rulesImport.rules.freeBuilding = true;
    for (const e of edges) {
      const [k, a, b] = e.split(",");
      const ex = Number(a);
      const ey = Number(b);
      const [p, q] = k === "n" ? [[ex, ey], [ex, ey - 1]] : [[ex, ey], [ex - 1, ey]];
      const out = P.has(`${p[0]},${p[1]}`) ? q : p;
      me.gx = X0 + out[0]; me.gy = Y0 + out[1]; me.layer = 0;
      placementImport.performPlacement(me, { kind: "build", what: "wall_cliff_grass", tx: X0 + ex, ty: Y0 + ey, edge: k });
    }
    const built = [...edges].filter((e) => { const [k, a, b] = e.split(","); const w = mapMod.peekTile(X0 + Number(a), Y0 + Number(b), 0)[k]; return w && w.sprite === "wall_cliff_grass"; }).length;
    assert(built === edges.size, `${built} of ${edges.size} cliff walls built`);
    me.gx = X0 + 3; me.gy = Y0 + 9.6; me.layer = 0;
    placementImport.performPlacement(me, { kind: "build", what: "stair_ramp_stone", tx: X0 + 3, ty: Y0 + 8, dir: "n" });
    const s = mapMod.stairs().find((q) => q.built && q.at[0] === X0 + 3 && q.at[1] === Y0 + 8);
    assert(s && s.material === "ramp_stone" && mapMod.peekTile(X0 + 3, Y0 + 5, 1).floor === "floor_cliff_top", `the ramp: ${s ? s.material : "none"}, landing ${mapMod.peekTile(X0 + 3, Y0 + 5, 1) && mapMod.peekTile(X0 + 3, Y0 + 5, 1).floor}`);
    const laid = new Set(["3,5"]);
    let more = true;
    while (more) {
      more = false;
      for (const k of P) {
        if (laid.has(k)) continue;
        const [a, b] = k.split(",").map(Number);
        const from = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [a + dx, b + dy]).find(([c, d]) => laid.has(`${c},${d}`));
        if (!from) continue;
        me.gx = X0 + from[0]; me.gy = Y0 + from[1]; me.layer = 1;
        placementImport.performPlacement(me, { kind: "build", what: "floor_cliff_grass", tx: X0 + a, ty: Y0 + b, tx2: X0 + a, ty2: Y0 + b });
        if (mapMod.peekTile(X0 + a, Y0 + b, 1).floor === "floor_cliff_grass") { laid.add(k); more = true; }
      }
    }
    assert(laid.size === P.size, `${laid.size} of ${P.size} plateau tiles laid`);
    // The corners, against the artist's rule.
    const want = cliffHillCorners(P, edges);
    const got = [];
    for (let vy = -1; vy <= 8; vy++) for (let vx = -1; vx <= 14; vx++) {
      const c = cliffsMod.cornerAt(X0 + vx, Y0 + vy, 0);
      if (c) got.push(`${vx},${vy}:${c.frame}`);
    }
    const wantS = want.map((k) => `${k.vx},${k.vy}:${k.frame}`).sort();
    got.sort();
    assert(JSON.stringify(got) === JSON.stringify(wantS), `corners: got ${got.join(" ")}; the artist's rule ${wantS.join(" ")}`);
    const kinds = new Set(want.map((k) => k.name));
    assert(["outer_s", "outer_w", "outer_e", "outer_n", "inner_n", "inner_e", "inner_w", "inner_s"].every((k) => kinds.has(k)) && want.some((k) => /_h/.test(k.frame)), `not every kind or no half: ${[...kinds].join(", ")}`);
    // Every frame exists in the corners' sheet; a straight edge whose own tile is plateau takes its back, the rest a face variant.
    const cs = read("data/sprites/wall_cliff_grass_corners.json");
    assert(want.every((k) => cs.images[k.frame]), `a corner frame missing: ${want.filter((k) => !cs.images[k.frame]).map((k) => k.frame).join(", ")}`);
    const def = getDef("wall_cliff_grass");
    let backs = 0;
    let faces = 0;
    for (const e of edges) {
      const [k, a, b] = e.split(",");
      const f = cliffsMod.edgeFrame(def, X0 + Number(a), Y0 + Number(b), k, 0);
      if (f.back) backs++;
      else faces++;
      const own = P.has(`${a},${b}`);
      assert(f.back === own && (own ? f.name.endsWith("_back") : /_plain(_\d)?$/.test(f.name)), `edge ${e}: ${f.name}`);
    }
    // A corner's edges are drawn by it: claimed; the other edges not.
    const claimed = [...edges].filter((e) => { const [k, a, b] = e.split(","); const w = mapMod.peekTile(X0 + Number(a), Y0 + Number(b), 0)[k]; return cliffsMod.claimedByCorner(X0 + Number(a), Y0 + Number(b), k, w, 0); }).length;
    const owned = new Set(want.flatMap((k) => k.ce)).size;
    assert(claimed === owned, `${claimed} edges claimed by corners, the rule owns ${owned}`);
    // The hill widened (the review of #561): the plateau laid past its step on the right at (10, 3), with the new edges' cliff walls built.
    // The step's two old walls now have plateau on both sides: buried, drawn as nothing (render/walls.js cliffHidden), and the corners are
    // the artist's rule over the widened plan, as if those walls were not there.
    me.gx = X0 + 9; me.gy = Y0 + 3; me.layer = 1;
    placementImport.performPlacement(me, { kind: "build", what: "floor_cliff_grass", tx: X0 + 10, ty: Y0 + 3, tx2: X0 + 10, ty2: Y0 + 3 });
    const P2 = new Set([...P, "10,3"]);
    const edges2 = cliffHillEdges(P2);
    for (const e of edges2) {
      if (edges.has(e)) continue;
      const [k, a, b] = e.split(",");
      const ex = Number(a);
      const ey = Number(b);
      const [p, q] = k === "n" ? [[ex, ey], [ex, ey - 1]] : [[ex, ey], [ex - 1, ey]];
      const out = P2.has(`${p[0]},${p[1]}`) ? q : p;
      me.gx = X0 + out[0]; me.gy = Y0 + out[1]; me.layer = 0;
      placementImport.performPlacement(me, { kind: "build", what: "wall_cliff_grass", tx: X0 + ex, ty: Y0 + ey, edge: k });
    }
    const buriedNow = [...edges].filter((e) => !edges2.has(e));
    assert(mapMod.peekTile(X0 + 10, Y0 + 3, 1).floor === "floor_cliff_grass" && buriedNow.length === 2 && buriedNow.every((e) => { const [k, a, b] = e.split(","); return mapMod.peekTile(X0 + Number(a), Y0 + Number(b), 0)[k] && cliffsMod.buried(X0 + Number(a), Y0 + Number(b), k, 0); }), `widened: the old step's walls ${buriedNow.join(" ")} not buried`);
    const want2 = cliffHillCorners(P2, edges2).map((k) => `${k.vx},${k.vy}:${k.frame}`).sort();
    const got2 = [];
    for (let vy = -1; vy <= 8; vy++) for (let vx = -1; vx <= 14; vx++) { const c = cliffsMod.cornerAt(X0 + vx, Y0 + vy, 0); if (c) got2.push(`${vx},${vy}:${c.frame}`); }
    got2.sort();
    assert(JSON.stringify(got2) === JSON.stringify(want2), `widened corners: got ${got2.join(" ")}; the rule ${want2.join(" ")}`);
    return `${edges.size} walls, the ramp, ${laid.size} plateau tiles; ${want.length} corners as the artist's rule (${[...kinds].sort().join(", ")}; ${want.filter((k) => /_h/.test(k.frame)).length} halved); ${claimed} edges by corners, ${backs} backs, ${faces} faces; widened past its step: ${buriedNow.length} walls buried, ${want2.length} corners as the rule`;
  } finally {
    rulesImport.rules.freeBuilding = free0;
    me.layer = 0;
    me.rise = 0;
  }
});
check("the stone ramp: a stair of its own material (north and west only), walked at 32 px a tile with no treads (map.riseOn), onto its landing a storey up; its record kept by the chunk's record", () => {
  const at = openGrass(8, 7);
  assert(at, "no open grass");
  const [x, y] = at;
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  const walk = (dx, dy, n) => { for (let i = 0; i < n; i++) { const m = mapMod.moveCircle(me.gx, me.gy, 0.3, dx, dy, me.layer || 0); me.gx = m.gx; me.gy = m.gy; mapMod.stairStep(me); } };
  try {
    rulesImport.rules.freeBuilding = true;
    me.gx = x + 6.5; me.gy = y + 3; me.layer = 0; me.rise = 0;
    const n0 = mapMod.stairs().length;
    placementImport.performPlacement(me, { kind: "build", what: "stair_ramp_stone", tx: x + 3, ty: y + 3, dir: "e" });
    assert(mapMod.stairs().length === n0, "a ramp climbing toward the camera was built");
    placementImport.performPlacement(me, { kind: "build", what: "stair_ramp_stone", tx: x + 5, ty: y + 3, dir: "w" });
    const s = mapMod.stairs().find((q) => q.built && q.at[0] === x + 5 && q.at[1] === y + 3);
    assert(s && s.material === "ramp_stone" && mapMod.stairKind(s.material).ramp && mapMod.peekTile(x + 2, y + 3, 1).floor === "floor_cliff_top", `the ramp: ${s && s.material}, landing ${mapMod.peekTile(x + 2, y + 3, 1) && mapMod.peekTile(x + 2, y + 3, 1).floor}`);
    assert(mapMod.riseOn(s, 1.5) === 48 && mapMod.riseOn(s, 0.4) === 13 && mapMod.riseOn(s, 3) === 96 && mapMod.stairRise(0.4) === 16, `rise: ${mapMod.riseOn(s, 0.4)} at 0.4 (a stair's ${mapMod.stairRise(0.4)})`);
    // Up it, the rise climbing by a pixel or two a step.
    me.gx = x + 6; me.gy = y + 3;
    let prev = 0;
    let jump = 0;
    for (let i = 0; i < 90; i++) { walk(-0.05, 0, 1); const r = (me.layer || 0) * 96 + (me.rise || 0); jump = Math.max(jump, Math.abs(r - prev)); prev = r; }
    assert(me.layer === 1 && Math.abs(me.gx - (x + 2)) < 0.6 && jump <= 3, `the climb: ${me.gx.toFixed(2)} on layer ${me.layer}, the largest step in height ${jump}`);
    // Its record and the chunk's: a fresh install brings back a ramp, never a wooden stair.
    const rec = JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(Math.floor((x + 5) / mapMod.CHUNK), Math.floor((y + 3) / mapMod.CHUNK), false, 0))));
    const st = (rec.stairs || []).find((q) => q[2] === "w" && q[3] === "ramp_stone");
    assert(st, `the chunk's record: ${JSON.stringify(rec.stairs)}`);
    assert(mapMod.stairKind("glass").material === "wood" && mapMod.stairKind("stone").material === "stone" && !mapMod.stairKind("stone").ramp, "an unknown material is not wood, or stone is a ramp");
    return `refused climbing east; built climbing west, its landing a cliff top; up it to layer 1, a step at most ${jump} px; its record says ramp_stone`;
  } finally {
    rulesImport.rules.freeBuilding = free0;
    me.layer = 0;
    me.rise = 0;
  }
});
check("an item lying on the floor is drawn from `lying_<id>`, a name no sprite definition takes (Michael's playtest, 2026-10-28: as `floor_<id>` the item stone's picture took the stone floor's sheet, and every stone floor, a stone stair's landing among them, drew as one pebble)", () => {
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
  const props = fs.readFileSync(path.join(root, "src/render/props.js"), "utf8");
  assert(/registerSheet\(`lying_\$\{def\.id\}`/.test(main) && !/registerSheet\(`floor_\$\{/.test(main), "main.js does not register an item's lying picture as lying_<id>");
  assert(/projectileSheet\(`lying_\$\{e\.id\}`\)/.test(props) && !/projectileSheet\(`floor_\$\{/.test(props), "render/props.js does not draw an item lying from lying_<id>");
  const sprites = new Set(fs.readdirSync(path.join(root, "data/sprites")).map((f) => f.replace(/\.json$/, "")));
  const ids = itemsMod.allItems().map((d) => d.id);
  const clash = ids.filter((id) => sprites.has(`lying_${id}`));
  assert(!clash.length, `a sprite definition takes an item's lying name: ${clash.join(", ")}`);
  const floorIds = ids.filter((id) => sprites.has(`floor_${id}`));
  return `${ids.length} items; none of their lying names is a definition's (the old names would have clashed for ${floorIds.join(", ") || "none"})`;
});
const storeysMod = await import("../src/render/storeys.js");
check("the drawn stair stands on its tiles: halfway up, the feet at either side limit of the walkable band land on the drawn tread, inside its stringers, in all four facings, wood and stone", () => {
  // Tread 6 (48 px, t 1.375 to 1.625) of each picture, its top's corners in the drawing's pixels (the artist's table, art round 8).
  const TREAD6 = {
    wood: { n: [[47.5, 90.2], [57, 85.5], [83, 98.5], [73.5, 103.2]], w: [[86.5, 90.2], [77, 85.5], [51, 98.5], [60.5, 103.2]], s: [[60.5, 38.8], [51, 43.5], [77, 56.5], [86.5, 51.8]], e: [[73.5, 38.8], [83, 43.5], [57, 56.5], [47.5, 51.8]] },
    stone: { n: [[49, 82.5], [58, 78], [82, 90], [73, 94.5]], w: [[82, 82.5], [73, 78], [49, 90], [58, 94.5]], s: [[58, 31.5], [49, 36], [73, 48], [82, 43.5]], e: [[73, 31.5], [82, 36], [58, 48], [49, 43.5]] },
  };
  // Within `m` px of a convex quad (its corners in order): inside it, or that close to an edge.
  const near = ([px, py], q, m) => {
    let inside = true;
    let sign = 0;
    let best = Infinity;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = q[i];
      const [bx, by] = q[(i + 1) % 4];
      const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      if (c !== 0) { if (!sign) sign = Math.sign(c); else if (Math.sign(c) !== sign) inside = false; }
      const vx = bx - ax;
      const vy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
      best = Math.min(best, Math.hypot(px - ax - vx * t, py - ay - vy * t));
    }
    return inside || best <= m;
  };
  const D = { n: [0, -1], w: [-1, 0], s: [0, 1], e: [1, 0] };
  const out = [];
  const iso = isoMod;
  const o0 = iso.getOrigin();
  iso.setOrigin(0, 0);
  try {
    for (const material of ["wood", "stone"]) {
      const def = read(`data/sprites/stair_${material}.json`);
      for (const dir of ["n", "w", "s", "e"]) {
        const [dx, dy] = D[dir];
        const at = [10, 10];
        const s = { dir, d: D[dir], tiles: [0, 1, 2].map((k) => [at[0] + dx * k, at[1] + dy * k]), low: [at[0] - 0.5 * dx, at[1] - 0.5 * dy] };
        const a = def.drawings[dir].anchor;
        const name = `idle_${dir}_0`;
        // As the loader keeps it: the frame, and the definition's top-vertex anchor turned to the tile's centre (iso.HH lower).
        const sheet = { frames: { [name]: [0, 0, 200, 200] }, frameAnchors: { [name]: [a[0], a[1] + iso.HH] } };
        const pic = storeysMod.stairPicture(s, sheet, name);
        const lim = 0.5 - mapMod.STAIR_FEET;
        for (const off of [-lim, lim]) {
          const gx = s.low[0] + dx * 1.5 + -dy * off;
          const gy = s.low[1] + dy * 1.5 + dx * off;
          const p = iso.toScreen(gx, gy);
          const feet = [p.x - pic.left, p.y - mapMod.stairRise(1.5) - pic.top];
          const ok = near(feet, TREAD6[material][dir], 2);
          out.push(`${material} ${dir} ${off > 0 ? "+" : "-"}: ${feet.map((v) => v.toFixed(1)).join(",")}${ok ? "" : " OFF"}`);
        }
      }
    }
  } finally {
    iso.setOrigin(o0.x, o0.y);
  }
  assert(!out.some((l) => l.endsWith("OFF")), out.filter((l) => l.endsWith("OFF")).join("; "));
  return out.join("; ");
});
check("the review of #549: no wall, window, or door across a stair's run or its top, on either layer (its stairwell's sides held by the stair's own edges); a stair never built through a wall; a ford never paved", () => {
  const s = tallHouse(); // the tall house's stair: steps (127..125, 217) climbing west, its landing (124, 217) upstairs
  const [t0, t1, t2] = s.tiles;
  const P = mapMod.stairEdgeProblem;
  const why = {
    between: P(t0[0], t0[1], "w", 0), // between its first two steps
    top: P(t2[0], t2[1], "w", 0), // its top edge, on its own layer, under the landing
    side: P(t1[0], t1[1], "n", 0), // along its side on its own layer: allowed
    wellSide: P(t1[0], t1[1], "n", 1), // its stairwell's side upstairs: allowed, held by the stair's own edges (the recheck of #549)
    wellTop: P(t2[0], t2[1], "w", 1), // its stairwell's top edge, against the landing
  };
  assert(why.between && why.top && !why.side && !why.wellSide && why.wellTop, JSON.stringify(why));
  assert(!mapMod.canBuildWall(t2[0], t2[1], "w", "wall", 1) && !mapMod.canBuildWall(t2[0], t2[1], "w", "window", 1) && !mapMod.canBuildWall(t2[0], t2[1], "w", "door", 0) && mapMod.canBuildWall(t1[0], t1[1], "n", "wall", 0), "canBuildWall takes a wall, window, or door across a stair");
  // Through a guest's command, from upstairs on the landing's side: a window across the stairwell's top is not built.
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  let through = null;
  let ford = "none on the map";
  try {
    rulesImport.rules.freeBuilding = true;
    me.gx = s.landing[0]; me.gy = s.landing[1] + 1.3; me.layer = 1;
    placementImport.performPlacement(me, { kind: "build", what: "window", tx: t2[0], ty: t2[1], edge: "w" });
    assert(!mapMod.peekTile(t2[0], t2[1], 1).w, "a window was built across the stairwell's top");
    me.layer = 0;
    // A stair aimed past a wall: refused by the line, though in reach by distance.
    const at = openGrass(8, 7);
    assert(at, "no open grass");
    const [x, y] = at;
    for (const xx of [x + 4, x + 5, x + 6, x + 7]) mapMod.buildWall(xx, y + 5, "n", "wall", "wall_wood", null, 0);
    me.gx = x + 6.5; me.gy = y + 5.2; me.layer = 0;
    const n0 = mapMod.stairs().length;
    placementImport.performPlacement(me, { kind: "build", what: "stair_wood", tx: x + 5, ty: y + 3, dir: "w" });
    through = mapMod.stairs().length !== n0;
    assert(!through, "a stair was built through a wall");
    // A ford (shallow water): never paved.
    for (let dy = -60; dy <= 60 && ford === "none on the map"; dy++) for (let dx = -60; dx <= 60; dx++) {
      const tt = mapMod.peekTile(x + dx, y + dy);
      if (tt && tt.floor === "floor_water_shallow") { ford = mapMod.floorBuildProblem(x + dx, y + dy, "floor_wood", 0); break; }
    }
    assert(ford === "Not on water" || ford === "none on the map", `a ford: ${ford}`);
  } finally {
    rulesImport.rules.freeBuilding = free0;
    me.layer = 0;
  }
  return `refused: ${why.between}; ${why.top}; ${why.wellTop}; a side on its own layer and the stairwell's side allowed; through a wall refused; a ford: ${ford}`;
});
check("the recheck of #549: a body climbing at either side limit arrives on the landing within it, and never passes a wall at the landing's side nor stands over the void beside it; the same coming down; the stairwell's sides hold a body upstairs", () => {
  const res = [];
  const climbAndPush = (s, off, push) => {
    const [dx, dy] = s.d;
    const b = { gx: s.before[0] - dy * off, gy: s.before[1] + dx * off, layer: s.layer, rise: 0, radius: 0.3 };
    for (let i = 0; i < 100 && b.layer === s.layer; i++) {
      const m = mapMod.moveCircle(b.gx, b.gy, 0.3, dx * 0.05, dy * 0.05, b.layer);
      b.gx = m.gx; b.gy = m.gy;
      mapMod.stairStep(b);
    }
    const up = b.layer === s.layer + 1;
    // Then sideways off the landing, toward the side it climbed on, for two tiles' worth.
    const side = Math.sign(off);
    for (let i = 0; i < 40; i++) {
      const m = mapMod.moveCircle(b.gx, b.gy, 0.3, -dy * side * 0.05 * push, dx * side * 0.05 * push, b.layer);
      b.gx = m.gx; b.gy = m.gy;
      mapMod.stairStep(b);
    }
    const o = mapMod.stairAlong(s, b.gx, b.gy).off;
    return { up, off: o, b };
  };
  // The tall house: walls on both sides of its landing upstairs.
  const s = tallHouse();
  const [lx, ly] = s.landing;
  mapMod.buildWall(lx, ly, "n", "wall", "wall_wood", null, 1);
  mapMod.buildWall(lx, ly + 1, "n", "wall", "wall_wood", null, 1);
  for (const off of [-0.34, 0.34]) {
    const r = climbAndPush(s, off, 1);
    res.push(`house ${off}: up ${r.up}, off ${r.off.toFixed(2)}`);
    assert(r.up && Math.abs(r.off) <= 0.2 + 1e-6, res.join("; "));
  }
  // A stair built in the open: the void on both sides of its landing.
  const at = openGrass(8, 7);
  assert(at, "no open grass");
  const [x, y] = at;
  const b = mapMod.buildStair(x + 5, y + 3, "w", "wood", 0, { free: true });
  assert(b, "no stair built in the open");
  for (const off of [-0.34, 0.34]) {
    const r = climbAndPush(b, off, 1);
    const tx = Math.round(r.b.gx);
    const ty = Math.round(r.b.gy);
    res.push(`open ${off}: up ${r.up}, off ${r.off.toFixed(2)}, on ${tx},${ty} walkable ${mapMod.isWalkableTile(tx, ty, 1)}`);
    assert(r.up && Math.abs(r.off) <= 0.2 + 1e-6 && mapMod.isWalkableTile(tx, ty, 1), res.join("; "));
    // And down again from where it stands, at that side: over the top edge, down the steps, off the foot.
    const d = r.b;
    for (let i = 0; i < 100; i++) {
      const m = mapMod.moveCircle(d.gx, d.gy, 0.3, -b.d[0] * 0.05, -b.d[1] * 0.05, d.layer);
      d.gx = m.gx; d.gy = m.gy;
      mapMod.stairStep(d);
    }
    res.push(`down: layer ${d.layer}, rise ${d.rise}`);
    assert(d.layer === 0 && (d.rise || 0) === 0, res.join("; "));
  }
  // The stairwell's side upstairs, with a wall on it or not: a body walking at it from the floor beside it is held off the hole.
  for (let yy = y + 2; yy <= y + 4; yy += 2) for (const xx of [x + 2, x + 3, x + 4, x + 5]) mapMod.buildFloor(xx, yy, "floor_wood", 1, { free: true });
  for (let k = 0; k < 3; k++) for (const xx of [x + 2, x + 3, x + 4, x + 5]) { mapMod.buildFloor(xx, y + 2, "floor_wood", 1, { free: true }); mapMod.buildFloor(xx, y + 4, "floor_wood", 1, { free: true }); }
  mapMod.buildWall(x + 4, y + 3, "n", "wall", "wall_wood", null, 1);
  for (const [xx, wall] of [[x + 4, true], [x + 3, false]]) {
    const q = { gx: xx, gy: y + 2.2, layer: 1, rise: 0 };
    for (let i = 0; i < 30; i++) {
      const m = mapMod.moveCircle(q.gx, q.gy, 0.3, 0, 0.05, 1);
      q.gx = m.gx; q.gy = m.gy;
      mapMod.stairStep(q);
    }
    res.push(`the stairwell's side${wall ? " (walled)" : ""}: y ${q.gy.toFixed(2)}, layer ${q.layer}`);
    assert(q.layer === 1 && q.gy <= y + 2.5 - 0.3 + 1e-6, res.join("; "));
  }
  return res.join("; ");
});
check("Michael's stair nook: walls along both sides of a stair and a back wall a tile past its top end are all built; the nook under the landing is never reached from the stair nor the stair from it; a body still climbs and comes down, and walks through none of them", () => {
  const s = tallHouse(); // steps (127..125, 217) climbing west; the tile under the landing (124, 217)
  const [dx, dy] = s.d;
  const [lx, ly] = s.landing;
  // The layout: the run's two sides (the north edges of rows 217 and 218 along its three steps), and the back wall on the far edge of the
  // tile under the landing (its west edge), each through the palette's rules.
  const edges = [];
  for (const [tx] of s.tiles) edges.push([tx, ly, "n"], [tx, ly + 1, "n"]);
  edges.push([lx, ly, "w"]);
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  const refused = [];
  try {
    rulesImport.rules.freeBuilding = true;
    for (const [tx, ty, edge] of edges) {
      const [mx, my] = mapMod.edgeMid(tx, ty, edge);
      // Stand a little off the edge, on its side away from the stair, within reach.
      me.layer = 0;
      me.gx = edge === "w" ? mx - 0.9 : mx;
      me.gy = edge === "n" ? (ty === ly ? my - 0.9 : my + 0.9) : my;
      placementImport.performPlacement(me, { kind: "build", what: "wall_oak", tx, ty, edge });
      if (!mapMod.peekTile(tx, ty, 0)[edge]) refused.push(`${tx},${ty},${edge}: ${mapMod.stairEdgeProblem(tx, ty, edge, 0) || (mapMod.canBuildWall(tx, ty, edge, "wall", 0) ? "built not" : "no room")}`);
    }
  } finally {
    rulesImport.rules.freeBuilding = free0;
    me.layer = 0;
  }
  assert(!refused.length, `refused: ${refused.join("; ")}`);
  const walk = (b, mx, my, n) => {
    for (let i = 0; i < n; i++) {
      const m = mapMod.moveCircle(b.gx, b.gy, 0.3, mx, my, b.layer);
      b.gx = m.gx;
      b.gy = m.gy;
      mapMod.stairStep(b);
    }
    return b;
  };
  // Up and down the middle of the run.
  const b = walk({ gx: s.before[0], gy: s.before[1], layer: 0, rise: 0, radius: 0.3 }, dx * 0.05, dy * 0.05, 90);
  assert(b.layer === 1, `the climb ended on layer ${b.layer} at ${b.gx.toFixed(2)},${b.gy.toFixed(2)}`);
  walk(b, -dx * 0.05, -dy * 0.05, 90);
  assert(b.layer === 0 && (b.rise || 0) === 0, `the way down ended on layer ${b.layer}, rise ${b.rise}`);
  // From the top step, on into the nook: it goes up onto the landing instead, never under it.
  const t = walk({ gx: s.tiles[2][0], gy: s.tiles[2][1], layer: 0, rise: 0, radius: 0.3 }, dx * 0.05, dy * 0.05, 40);
  assert(!(t.layer === 0 && Math.round(t.gx) === lx && Math.round(t.gy) === ly), `a body stepped off the stair's top into the nook (layer ${t.layer} at ${t.gx.toFixed(2)},${t.gy.toFixed(2)})`);
  // From the nook, toward the stair's end and its two sides: held at each.
  const n1 = walk({ gx: lx, gy: ly, layer: 0, rise: 0, radius: 0.3 }, -dx * 0.05, -dy * 0.05, 30);
  assert(n1.layer === 0 && (n1.rise || 0) === 0 && mapMod.stairAlong(s, n1.gx, n1.gy).t >= 3 + 0.3 - 1e-6, `from the nook onto the stair's end: ${n1.gx.toFixed(2)},${n1.gy.toFixed(2)} rise ${n1.rise}`);
  const n2 = walk({ gx: lx, gy: ly, layer: 0, rise: 0, radius: 0.3 }, dx * 0.05, dy * 0.05, 30);
  assert(n2.layer === 0 && Math.abs(n2.gx - lx) < 0.25, `through the back wall: ${n2.gx.toFixed(2)}`);
  // On the stair, pushed at each side wall: held inside them.
  for (const side of [-1, 1]) {
    const q = walk({ gx: s.tiles[1][0], gy: s.tiles[1][1], layer: 0, rise: 0, radius: 0.3 }, -dy * side * 0.05, dx * side * 0.05, 40);
    const off = mapMod.stairAlong(s, q.gx, q.gy).off;
    assert(Math.abs(off) < 0.5, `through a side wall: off ${off.toFixed(2)}`);
  }
  return `built: ${edges.length} walls (the run's two sides, the back wall a tile past its top); the nook kept from the stair both ways; up and down the middle`;
});
check("no trap for a body that can no longer walk out of an overlap: no wall, door, or window built across a living body (a corpse is none), no prop set down over one; a door still shuts in the face of the dead, who stay out and can move off; a body climbing at a side limit arrives on the landing clear", () => {
  const at = openGrass(6, 5);
  assert(at, "no open grass");
  const [x, y] = at;
  const me = gameMod.state.player;
  const z = gameMod.state.zombies[0];
  const free0 = rulesImport.rules.freeBuilding;
  const saved = { gx: z.gx, gy: z.gy, layer: z.layer || 0 };
  const res = [];
  try {
    rulesImport.rules.freeBuilding = true;
    me.layer = 0;
    // 1. A wall across the dead one standing on the edge: refused; it steps clear: built.
    z.gx = x + 2; z.gy = y + 2.55; z.layer = 0; // 0.05 past the north edge of (x + 2, y + 3)
    me.gx = x + 2; me.gy = y + 4.2;
    placementImport.performPlacement(me, { kind: "build", what: "wall_oak", tx: x + 2, ty: y + 3, edge: "n" });
    const refusedWall = !mapMod.peekTile(x + 2, y + 3).n;
    z.gy = y + 2.1;
    placementImport.performPlacement(me, { kind: "build", what: "wall_oak", tx: x + 2, ty: y + 3, edge: "n" });
    const builtWall = !!mapMod.peekTile(x + 2, y + 3).n;
    res.push(`wall: refused over a body ${refusedWall}, built once it stepped clear ${builtWall}`);
    assert(refusedWall && builtWall, res.join("; "));
    // A corpse lying across an edge is no body to trap: the wall goes up.
    const corpse = { gx: x + 1, gy: y + 2.5, layer: 0, corpse: true, dead: true, radius: 0.3 };
    gameMod.state.corpses.push(corpse);
    me.gx = x + 1; me.gy = y + 4.2;
    try {
      placementImport.performPlacement(me, { kind: "build", what: "wall_oak", tx: x + 1, ty: y + 3, edge: "n" });
    } finally {
      gameMod.state.corpses.splice(gameMod.state.corpses.indexOf(corpse), 1);
    }
    res.push(`a wall over a corpse built ${!!mapMod.peekTile(x + 1, y + 3).n}`);
    assert(mapMod.peekTile(x + 1, y + 3).n, res.join("; "));
    // 2. A door shut in the face of one of the dead touching its doorway from outside: it shuts; the dead one stays out and can move off;
    // the player inside moves.
    mapMod.buildWall(x + 4, y + 3, "n", "door", "wall_wood", null, 0);
    const door = mapMod.peekTile(x + 4, y + 3).n;
    door.open = true;
    z.gx = x + 4; z.gy = y + 2.25; // outside (north), its circle over the doorway line
    me.gx = x + 4; me.gy = y + 3.9;
    interactImport.performByLabel(me, { kind: "edge", tx: x + 4, ty: y + 3, edge: "n" }, "Close door");
    const shut = door.open === false;
    const zFrom = [z.gx, z.gy];
    const zIn = mapMod.moveCircle(z.gx, z.gy, 0.3, 0, 0.05, 0); // into the door: no deeper
    const zOff = mapMod.moveCircle(z.gx, z.gy, 0.3, 0, -0.05, 0); // away, on its own side
    const meOff = mapMod.moveCircle(me.gx, me.gy, 0.3, 0.05, 0, 0);
    res.push(`door: shut ${shut}; the dead one into it ${zIn.gy.toFixed(2)} from ${zFrom[1].toFixed(2)}, away ${zOff.gy.toFixed(2)}; the player moves ${meOff.gx !== me.gx}`);
    assert(shut && zIn.gy <= zFrom[1] + 1e-9 && zOff.gy < zFrom[1] && meOff.gx !== me.gx, res.join("; "));
    // 3. A prop over a body: the body's circle against the tile's square, exact (beside a side within 0.8, off a corner as near as it is).
    const c = { gx: 10.79, gy: 10, radius: 0.3 };
    const d = { gx: 10.6, gy: 10.6, radius: 0.3 };
    const e = { gx: 10.85, gy: 10, radius: 0.3 };
    res.push(`a tile at 10,10: a body at 0.79 beside ${stationsMod.touchesTile(c, 10, 10)}, off its corner at (0.6, 0.6) ${stationsMod.touchesTile(d, 10, 10)}, at 0.85 ${stationsMod.touchesTile(e, 10, 10)}`);
    assert(stationsMod.touchesTile(c, 10, 10) && stationsMod.touchesTile(d, 10, 10) && !stationsMod.touchesTile(e, 10, 10), res.join("; "));
  } finally {
    rulesImport.rules.freeBuilding = free0;
    Object.assign(z, saved);
  }
  // 4. Climbing at a side limit: on the landing it is clear of what is beside it (no overlap to be held in).
  const s = tallHouse();
  const [lx, ly] = s.landing;
  mapMod.buildWall(lx, ly, "n", "wall", "wall_wood", null, 1);
  mapMod.buildWall(lx, ly + 1, "n", "wall", "wall_wood", null, 1);
  for (const off of [-0.35, 0.35]) {
    const b = { gx: s.before[0] - s.d[1] * off, gy: s.before[1] + s.d[0] * off, layer: 0, rise: 0, radius: 0.3 };
    for (let i = 0; i < 100 && b.layer === 0; i++) {
      const m = mapMod.moveCircle(b.gx, b.gy, 0.3, s.d[0] * 0.05, s.d[1] * 0.05, b.layer);
      b.gx = m.gx; b.gy = m.gy;
      mapMod.stairStep(b);
    }
    const clear = b.layer === 1 && !mapMod.circleBlocked(b.gx, b.gy, 0.3, 1);
    res.push(`on the landing from ${off}: clear ${clear}`);
    assert(clear, res.join("; "));
  }
  return res.join("; ");
});
check("upper floors, step 1: the sync check sees a replica on the wrong storey (the players' and the dead's parts and hashText hash layer and rise); the ground hashes as before", () => {
  towerHouse();
  const p = gameMod.state.player;
  const z = gameMod.state.zombies[0];
  const parts0 = gameMod.syncParts();
  const text0 = gameMod.hashText();
  assert(!/ L0 /.test(text0) && !/ r0/.test(text0), "hashText names the ground's layer (the hashes would all move)");
  p.layer = 1;
  const parts1 = gameMod.syncParts();
  assert(parts1.players !== parts0.players && gameMod.hashText() !== text0, "a player on another layer hashes the same");
  p.layer = 0;
  p.rise = 32;
  assert(gameMod.syncParts().players !== parts0.players && gameMod.hashText() !== text0, "a player's rise hashes the same");
  delete p.rise;
  z.layer = -1;
  assert(gameMod.syncParts().dead !== parts0.dead && gameMod.hashText() !== text0, "one of the dead on another layer hashes the same");
  z.layer = 0;
  assert(gameMod.syncParts().players === parts0.players && gameMod.syncParts().dead === parts0.dead && gameMod.hashText() === text0, "put back, the parts differ");
  // The map part orders its chunks by layer, then position.
  const order = gameMod.syncParts().counts;
  return `players, dead, and hashText move with a layer or a rise; ${order}`;
});

// A torch goes on a wall with its bracket (Michael, 2026-10-27, #523): the Wall bracket item, its anvil row, and its set-down are gone from
// the data and the loot; nothing in data/ names it.
check("torch on a wall (#523): no wall_bracket remains anywhere in the data or the loot; the torch says it goes on a wall", () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".json") ? [path.join(dir, e.name)] : []));
  const files = walk(path.join(root, "data"));
  const naming = files.filter((f) => fs.readFileSync(f, "utf8").includes("wall_bracket")).map((f) => path.relative(root, f).replace(/\\/g, "/"));
  assert(!naming.length, `named in ${naming.join(", ")}`);
  assert(!itemsMod.hasItemDef("wall_bracket") && !stationsMod.recipe("wall_bracket"), "the item or its recipe is still registered");
  const withBracket = (Array.isArray(read("data/items.json")) ? read("data/items.json") : read("data/items.json").items).filter((d) => d.bracket);
  assert(!withBracket.length, `an item still hangs as a bracket: ${withBracket.map((d) => d.id).join(", ")}`);
  assert(itemsMod.getItem("torch").wallMount === true, "the torch has no wallMount");
  return `${files.length} data files, none naming it; the torch's wallMount`;
});

// Place torch (#523): from the bag, the belt, and a hand, by the host's own path and a guest's `torch` command by the face's address; the
// torch keeps its entry on the wall (uid, wear, lit or not) in a bracket of its own; refused on a fence, a window, a door, a face with a
// painting or a bracket, and out of reach; a painting refused under it; Put out, Light, and Pick up from its menu by label (a guest's), the
// torch back put out with its uid and the bracket gone; burnt out, the bracket goes with it; its wall taken down, it falls to the floor;
// the chunk's record and the sync hash carry it; the census holds every torch once throughout.
check("torch on a wall (#523): Place torch from the bag, belt, and hand by the host and a guest's command; refusals; Light, Put out, Pick up; burnt out and its wall gone", () => {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const me = gameMod.state.player;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  try {
    mapMod.ensureAround(me.gx, me.gy, 3);
    let at = null;
    for (let dy = -36; dy <= 36 && !at; dy++) for (let dx = -36; dx <= 36 && !at; dx++) {
      const x = Math.round(me.gx) + dx;
      const y = Math.round(me.gy) + dy;
      let ok = true;
      for (let ay = -2; ay < 5 && ok; ay++) for (let ax = -2; ax < 12 && ok; ax++) { const tt = mapMod.peekTile(x + ax, y + ay); ok = !!tt && tt.floor === "floor_grass" && !tt.prop && !tt.rug && !tt.n && !tt.w && !(tt.items && tt.items.length) && mapMod.isWalkableTile(x + ax, y + ay); }
      if (ok) at = [x, y];
    }
    assert(at, "no bare grass for the walls");
    const [x, y] = at;
    for (let i = 0; i < 10; i++) mapMod.buildWall(x + i, y, "n", "wall");
    mapMod.destroyWall(x + 6, y, "n");
    mapMod.buildWall(x + 6, y, "n", "wall", "wall_fence"); // a fence
    mapMod.buildWall(x + 7, y, "n", "window");
    mapMod.buildWall(x + 8, y, "n", "door");
    const wallAt = (i) => mapMod.peekTile(x + i, y).n;
    const bracketAt = (i) => [...mapMod.brackets()].find((b) => b.wall === wallAt(i)) || null;
    me.hands.main = null;
    me.hands.off = null;
    me.worn.back = itemsMod.makeEntry("small_sack", 1);
    me.worn.waist = itemsMod.makeEntry("belt", 1);
    const belt = inventoryMod.ensureSlots(me.worn.waist);
    belt.fill(null);
    const bag = inventoryMod.bagOf(me);
    bag.items.length = 0;
    const census = () => { const c = gameMod.itemCensus(); assert(c.dups.length === 0, `a uid held twice: ${JSON.stringify(c.dups[0])}`); return (c.totals.get("torch") || 0); };
    const inBag = itemsMod.makeEntry("torch", 1, { wear: 0.2 });
    assert(gridMod.insert(bag, inBag), "the bag took no torch");
    const inHand = itemsMod.makeEntry("torch", 1, { wear: 0.3, lit: true });
    me.hands.main = inHand;
    const onBelt = itemsMod.makeEntry("torch", 1);
    belt[belt.findIndex((e, k) => !e && inventoryMod.roleTakes(inventoryMod.beltRole(k), onBelt))] = onBelt;
    assert(belt.includes(onBelt), "the belt took no torch");
    const has = (menu) => menu.map((m) => m.label).includes("Place torch");
    const beltSlot = `belt:${belt.indexOf(onBelt)}`;
    assert(has(interactMod.itemMenu(me, inBag, bag, null)) && has(interactMod.slotMenu(me, "hand:main")) && has(interactMod.slotMenu(me, beltSlot)), "Place torch missing from the bag's, the hand's, or the belt's menu");
    assert(!has(interactMod.itemMenu(me, itemsMod.makeEntry("log", 1), bag, null)), "a log offers Place torch");
    const card = itemInfoMod.textOf(itemInfoMod.cardFor(inBag));
    assert(card.some((l) => /^Place torch: on a wall's face/.test(l)), `the torch's card: ${card.join(" | ")}`);
    assert(placementMod.beginTorch(inBag) && placementMod.state.kind === "torch" && placementMod.cancel() && placementMod.state.kind === null, "Place torch's mode did not begin, or Esc did not end it");
    const n0 = census();
    // The host's own path: the lit torch in the hand, on the plain wall at x + 1.
    me.gx = x + 2;
    me.gy = y + 1;
    assert(setdownMod.mountTorch(me, inHand.uid, x + 1, y, "n") === true, `the host's mount: "${said[said.length - 1]}"`);
    const b1 = wallAt(1).bracket;
    assert(b1 && b1.made && b1.torch && b1.side === 1 && b1.lit === true && b1.wear === 0.3 && b1.uid === inHand.uid && !me.hands.main && bracketAt(1), `the lit torch on the wall: ${JSON.stringify(b1)}`);
    assert(census() === n0, "the census moved when the torch went on the wall");
    // A guest's command, by the face's address: the bag's torch (unlit) at x + 2, the belt's at x + 3.
    placementMod.performPlacement(me, { kind: "torch", uid: inBag.uid, tx: x + 2, ty: y, edge: "n" });
    placementMod.performPlacement(me, { kind: "torch", uid: onBelt.uid, tx: x + 3, ty: y, edge: "n" });
    const b2 = wallAt(2).bracket;
    const b3 = wallAt(3).bracket;
    assert(b2 && b2.lit === false && b2.uid === inBag.uid && b2.wear === 0.2 && !bag.items.includes(inBag), `the bag's torch by a guest's command: ${JSON.stringify(b2)}`);
    assert(b3 && b3.lit === false && b3.uid === onBelt.uid && !belt.includes(onBelt), `the belt's torch by a guest's command: ${JSON.stringify(b3)}`);
    // The refusals: a second torch on a face that holds one, a fence, a window, a door, a face with a painting, too far; and a painting under a torch.
    const spare = itemsMod.makeEntry("torch", 1);
    assert(gridMod.insert(bag, spare), "no room for the spare torch");
    const pic = itemsMod.makeEntry("painting_small_oak", 1);
    assert(gridMod.insert(bag, pic) && paintingsMod.hang(me, pic.uid, x + 4, y, "n"), `the painting was not hung: "${said[said.length - 1]}"`);
    const refused = [];
    for (const [i, want] of [[1, /bracket is already there/i], [4, /already hangs there/i], [6, /nothing to hang it on/i], [7, /nothing to hang it on/i], [8, /nothing to hang it on/i]]) {
      me.gx = x + i;
      me.gy = y + 1;
      said.length = 0;
      placementMod.performPlacement(me, { kind: "torch", uid: spare.uid, tx: x + i, ty: y, edge: "n" });
      const line = said[said.length - 1] || "";
      if (!want.test(line) || !bag.items.includes(spare) || (i > 1 && wallAt(i).bracket)) refused.push(`${i}: "${line}"`);
    }
    assert(!refused.length, `not refused as it should be: ${refused.join("; ")}`);
    assert(wallAt(6).kind === "wall" && mapMod.wallRule(wallAt(6).sprite).seeThrough === true && wallAt(7).kind === "window" && wallAt(8).kind === "door", "the fence, the window, and the door are not what the check built");
    me.gx = x + 1;
    me.gy = y + 8;
    said.length = 0;
    assert(setdownMod.mountTorch(me, spare.uid, x + 5, y, "n") === false && /far/i.test(said[said.length - 1] || "") && !wallAt(5).bracket, `out of reach: "${said[said.length - 1]}"`);
    assert(/bracket is in the way/i.test(paintingsMod.fitProblem("painting_small_deer", x + 1, y, "n")), `a painting under the torch: ${paintingsMod.fitProblem("painting_small_deer", x + 1, y, "n")}`);
    // The record and the sync hash.
    const [cx, cy] = mapMod.chunkCoord(x + 1, y);
    const rec = JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(cx, cy, false)));
    assert(rec.includes(`"uid":"${inHand.uid}"`) && rec.includes('"made":true'), "the chunk's record does not carry the torch on the wall");
    // Its menu, by the labels a guest sends: Put out, Light (a tinderbox carried), Pick up; never the map bracket's Take the torch.
    me.gx = x + 1;
    me.gy = y + 1;
    const addr = { kind: "bracket", tx: x + 1, ty: y, edge: "n" };
    const labels = () => interactMod.actionsForTarget(addr, me).map((q) => q.label);
    const lit0 = labels();
    assert(lit0.includes("Put out the torch") && lit0.includes("Pick up torch") && !lit0.includes("Take the torch") && !lit0.some((l) => /bracket/i.test(l)), `its menu, lit: ${lit0.join(", ")}`);
    const map0 = gameMod.syncParts().map;
    interactMod.performByLabel(me, addr, "Put out the torch");
    assert(wallAt(1).bracket.lit === false && gameMod.syncParts().map !== map0, "Put out did not put it out, or the sync hash did not see it");
    gridMod.insert(bag, itemsMod.makeEntry("tinderbox", 1));
    interactMod.performByLabel(me, addr, "Light the torch");
    assert(wallAt(1).bracket.lit === true, `Light the torch did not light it: "${said[said.length - 1]}"`);
    const wear1 = wallAt(1).bracket.wear;
    interactMod.performByLabel(me, addr, "Pick up torch");
    const back = inventoryMod.carriedEntry(me, inHand.uid);
    assert(back && back.id === "torch" && back.lit === false && back.wear === wear1 && !wallAt(1).bracket && !bracketAt(1), `picked up: ${JSON.stringify(back)}, the wall ${JSON.stringify(wallAt(1).bracket)}`);
    // Burnt out on the wall: the torch and its bracket both gone.
    wallAt(3).bracket.lit = true;
    wallAt(3).bracket.wear = 0.999;
    mapMod.burnHolders(30);
    assert(!wallAt(3).bracket && !bracketAt(3), `burnt out, the bracket stayed: ${JSON.stringify(wallAt(3).bracket)}`);
    // Its wall taken down: the torch falls to the floor on the face's side, itself, put out.
    mapMod.destroyWall(x + 2, y, "n");
    const fell = mapMod.itemsAt(x + 2, y).find((e) => e.uid === inBag.uid);
    assert(fell && fell.id === "torch" && !fell.lit && !bracketAt(2), `the wall taken down: ${JSON.stringify(mapMod.itemsAt(x + 2, y))}`);
    // The census: every torch once, the spent one gone (the hand's back, the bag's on the floor, the belt's burnt out, the spare still carried).
    const n1 = census();
    assert(n1 === n0 + 1 - 1, `the torches counted ${n0} before the spare was made, ${n1} after one burnt out`);
    return `the hand's lit torch by the host, the bag's and the belt's by a guest's command, each its own uid on the wall; refused on a held face, a painting, a fence, a window, a door, and too far; put out, lit, picked up back with its uid; burnt out and its wall gone`;
  } finally {
    promptMod.setMessageSink(null);
  }
});

// ---- round rooms (docs/50; option A, Michael 2026-10-26: the world's logic on the stepped edges, bodies stopped by the curve too) ----
// The proving ground's rings (tools/mapgen/proving.py): a 7 by 7 room with its square's corner at (21, 0), a door south and a window west,
// and a 5 by 5 tower at (27, 7) on layers 0 and 1. The rows that build their own clear the square's north-west (x 0 to 9, y 0 to 9) and
// stand a 5 by 5 at (2, 2), its centre (4, 4).
const roundMod = await import("../src/round.js");
const roundSquare = () => {
  gameMod.create({ json: read("data/maps/square.json"), rules: { zombieAggro: false } });
  mapMod.ensureAround(24, 5, 2);
  mapMod.ensureAround(4, 4, 2);
  mapMod.rebuildRooms();
};
const clearPatch = (x0, y0, w, h, layer = 0) => {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const t = mapMod.growTile(x, y, layer);
      if (t.prop) mapMod.removeProp(t.prop);
      t.items = null;
    }
  }
};
const ownRing = (opts = { built: true }) => {
  clearPatch(0, 0, 10, 10);
  const why = mapMod.ringProblem(2, 2, 5, 0);
  const r = mapMod.buildRing(2, 2, 5, "wall_stone", 0, opts);
  assert(r, `the ring at 2,2 was refused: ${why}`);
  mapMod.rebuildRooms();
  return r;
};
const pressFrom = (from, dir, layer = 0) => {
  let p = { gx: from[0], gy: from[1] };
  const len = Math.hypot(dir[0], dir[1]) || 1;
  for (let i = 0; i < 400; i++) p = mapMod.moveCircle(p.gx, p.gy, 0.3, (dir[0] / len) * 0.02, (dir[1] / len) * 0.02, layer);
  return p;
};
check("round rooms, step 1: the proving ground's rings load: rooms of 37 and 21 tiles (the tower's on each of its layers), pockets outdoors, every outline edge a stone wall of the ring, the openings at door points, the building index on the stepped tiles", () => {
  roundSquare();
  const ids = mapMod.allRings().map((r) => r.id).sort();
  assert(JSON.stringify(ids) === '["round_0_21_0","round_0_26_7","round_1_26_7"]', `the rings: ${JSON.stringify(ids)}`);
  const sizes = [];
  for (const [x, y, layer, size] of [[24, 3, 0, 37], [28, 9, 0, 21], [28, 9, 1, 21]]) {
    const room = mapMod.getRoom(mapMod.roomAt(x, y, layer));
    assert(room && room.size === size && (room.layer || 0) === layer, `layer ${layer} at ${x},${y}: ${room ? `${room.size} tiles on layer ${room.layer}` : "no room"} (wanted ${size})`);
    sizes.push(room.size);
  }
  assert(mapMod.roomAt(21, 0) === 0 && mapMod.roomAt(26, 7) === 0 && mapMod.roomAt(26, 11) === 0, "a corner pocket is not outdoors");
  for (const r of mapMod.allRings()) {
    const s = mapMod.ringShape(r);
    let opens = 0;
    for (const [tx, ty, e] of s.outline) {
      const w = mapMod.tileAt(tx, ty, r.layer)[e];
      assert(w, `${r.id}: no wall on ${tx},${ty},${e}`);
      if (w.kind === "wall") assert(mapMod.isRingWall(w) && w.sprite === "wall_stone" && mapMod.ringOfWall(w) === r, `${r.id}: ${tx},${ty},${e} is not the ring's`);
      else {
        assert(w.underRound && roundMod.isDoorPoint(r.x0, r.y0, r.n, tx, ty, e), `${r.id}: a ${w.kind} off a door point at ${tx},${ty},${e}`);
        opens++;
      }
    }
    assert(s.outline.length === (r.n === 7 ? 28 : 20) && opens === (r.id === "round_0_21_0" ? 2 : 1), `${r.id}: ${s.outline.length} edges, ${opens} openings`);
  }
  const b = mapMod.buildingAt(28, 9, 1);
  assert(b && b.round && JSON.stringify(b.layers) === "[0,1]" && mapMod.buildingAt(26, 7, 0) === null && mapMod.buildingAt(24, 3, 0) && mapMod.buildingAt(24, 3, 0).round, "the building index does not hold the rings' stepped tiles (and not their pockets)");
  const s7 = roundMod.shape(21, 0, 7);
  assert(s7.unreachable.length === 8 && s7.unreachable.every(([x, y]) => !mapMod.isWalkableTile(x, y) && mapMod.unreachableAt(x, y)) && roundMod.shape(26, 7, 5).unreachable.length === 0, "the 7's eight held-off pocket tiles are walkable, or the 5 has some");
  assert(s7.crossed.length === 8 && s7.crossed.every(([x, y]) => mapMod.curveCrossed(x, y)) && roundMod.shape(26, 7, 5).crossed.every(([x, y]) => mapMod.curveCrossed(x, y) && mapMod.curveCrossed(x, y, 1)), "the curve-crossed tiles are not marked");
  return `rooms ${sizes.join(", ")}; the 7's unreachable ${s7.unreachable.map((t) => t.join(",")).join(" ")}`;
});
check("round rooms, step 1: a sealed round room is a room and is safe: no sight, reach, path, or bite through the ring, the scan's case at the diagonal (#518)", () => {
  roundSquare();
  ownRing();
  const room = mapMod.getRoom(mapMod.roomAt(4, 4));
  assert(room && room.size === 21 && mapMod.roomSealed(room), `the ring's room: ${room && room.size} tiles, sealed ${room && mapMod.roomSealed(room)}`);
  // The scan's case: one inside pressed into the north-east diagonal, one outside pressed into the north-east pocket, within a bite's reach.
  const inn = pressFrom([4, 4], [1, -1]);
  const out = pressFrom([6, 2], [-1, 1]);
  const gap = Math.hypot(inn.gx - out.gx, inn.gy - out.gy);
  assert(gap < 1.2, `the two at the diagonal are ${gap.toFixed(2)} apart: not the scan's case`); // under option A the curve holds both off, past a bite's contact (0.9) as well
  assert(!lineOfSight(inn.gx, inn.gy, out.gx, out.gy) && !lineOfSight(out.gx, out.gy, inn.gx, inn.gy), "a line of sight through the ring at the diagonal");
  assert(reachImport.reachProblem({ gx: inn.gx, gy: inn.gy, layer: 0 }, [[Math.round(out.gx), Math.round(out.gy)]], 2.6), "reach through the ring");
  assert(pathfind.findPath([6, 2], [4, 4], mapMod.canStep) === null && pathfind.findPath([4, 8], [4, 4], mapMod.canStep) === null, "a path into the sealed ring");
  // The dead hunt; one stands in the pocket against the curve, the player inside against it: ten seconds, and no bite.
  const me = gameMod.state.player;
  const z = gameMod.state.zombies[0];
  rulesImport.set({ zombieAggro: true });
  try {
    me.gx = inn.gx;
    me.gy = inn.gy;
    z.gx = out.gx;
    z.gy = out.gy;
    const hp0 = me.hp;
    let t = loopMod.simTime();
    for (let i = 0; i < 600; i++) {
      t += 1 / 60;
      loopMod.setSimTime(t);
      gameMod.begin(1 / 60);
      gameMod.step(1 / 60, gameMod.idleSnapshot());
    }
    assert(me.hp === hp0 && Math.hypot(me.gx - 4, me.gy - 4) < 2.5 && Math.hypot(z.gx - 4, z.gy - 4) > 2.5, `hp ${hp0} to ${me.hp}; the player ${Math.hypot(me.gx - 4, me.gy - 4).toFixed(2)} from the centre, the dead one ${Math.hypot(z.gx - 4, z.gy - 4).toFixed(2)}`);
    return `the two ${gap.toFixed(2)} apart across the diagonal, no sight, reach, or path; ten seconds hunting, health ${hp0} to ${me.hp}`;
  } finally {
    rulesImport.set({ zombieAggro: false });
  }
});
check("round rooms, step 1: bodies are stopped by the curve and by the steps, inside and out, and never stand in the drawn wall", () => {
  roundSquare();
  ownRing();
  let far = 0;
  let near = Infinity;
  for (let k = 0; k < 24; k++) {
    const a = ((k * 15 + 7.5) * Math.PI) / 180;
    const p = pressFrom([4, 4], [Math.cos(a), Math.sin(a)]);
    assert(!mapMod.circleBlocked(p.gx, p.gy, 0.3), `a body walking out at ${k * 15 + 7.5} degrees ended inside a wall`);
    far = Math.max(far, Math.hypot(p.gx - 4, p.gy - 4));
    const q = pressFrom([4 + 4 * Math.cos(a), 4 + 4 * Math.sin(a)], [-Math.cos(a), -Math.sin(a)]);
    near = Math.min(near, Math.hypot(q.gx - 4, q.gy - 4));
  }
  assert(far <= 2.5 - 0.3 + 0.06, // the chords sag 0.02 inside the circle and end at a door edge 0.05 outside it
    `a body inside came ${far.toFixed(3)} from the centre: into the curve (radius 2.5)`);
  assert(near >= 2.5 + 0.3 - 0.03, `a body outside came ${near.toFixed(3)} from the centre: into the curve`);
  // At a door point with the door open, a body walks straight through: the curve leaves the doorway to the edge.
  mapMod.buildWall(4, 2, "n", "door", "wall_stone");
  mapMod.tileAt(4, 2).n.open = true;
  const through = pressFrom([4, 4], [0, -1]);
  assert(through.gy < 1, `a body walking north through the open door stopped at ${through.gy.toFixed(2)}`);
  return `inside never past ${far.toFixed(3)}, outside never nearer than ${near.toFixed(3)} (the curve at 2.5); through the open door to ${through.gy.toFixed(2)}`;
});
check("round rooms, step 1: a ray is stopped by the ring and passes an open door; the dead path in by a door and nowhere else (an open window passes sight, never a body)", () => {
  roundSquare();
  const door = mapMod.tileAt(24, 7).n;
  const win = mapMod.tileAt(21, 3).w;
  assert(door && door.kind === "door" && door.underRound && win && win.kind === "window" && win.underRound, "the 7's door and window are not at their door points");
  assert(!lineOfSight(24, 4, 24, 9) && !lineOfSight(22, 1, 20, -1) && !lineOfSight(26, 5, 28, 7), "a ray through the shut door or the ring");
  assert(pathfind.findPath([24, 9], [24, 3], mapMod.canStep) === null, "a path in through the shut door");
  win.shutter = "open";
  assert(lineOfSight(22, 3, 19, 3) && pathfind.findPath([19, 3], [24, 3], mapMod.canStep) === null, "the open window does not pass sight, or passes a body");
  door.open = true;
  assert(lineOfSight(24, 4, 24, 9), "a ray does not pass the open door");
  const path = pathfind.findPath([24, 10], [24, 3], mapMod.canStep);
  assert(path && path.length, "no path in through the open door");
  const inRoom = (x, y) => mapMod.roomAt(x, y) === mapMod.roomAt(24, 3);
  const crossings = [];
  for (let i = 1; i < path.length; i++) if (inRoom(...path[i]) !== inRoom(...path[i - 1])) crossings.push(`${path[i - 1].join(",")}>${path[i].join(",")}`);
  assert(crossings.length === 1 && crossings[0] === "24,7>24,6", `the path crossed the ring at ${crossings.join(" ")}`);
  return `the shut door and the ring stop a ray, the open door passes it; one path in, by the door (${path.length} steps)`;
});
check("round rooms, step 1: no path ends on an unreachable tile, and no furniture stands on a curve-crossed tile (Michael: \"furniture can't be placed on those 8 tiles\"), the fire pit inside, never a fireplace against the curve", () => {
  roundSquare();
  const s7 = roundMod.shape(21, 0, 7);
  for (const [x, y] of s7.unreachable) assert(pathfind.findPath([24, 9], [x, y], mapMod.canStep) === null, `a path ends on the unreachable ${x},${y}`);
  for (const [x, y] of s7.crossed) {
    const why = setdownMod.standProblem("ground", x, y);
    assert(why === "Not against the curve", `a set-down on the crossed ${x},${y}: "${why}"`);
  }
  assert(setdownMod.fitProblem("ground", "fire_pit", 21, 2) === "Not against the curve", `a fire pit over a crossed tile: ${setdownMod.fitProblem("ground", "fire_pit", 21, 2)}`);
  assert(setdownMod.fitProblem("ground", "fire_pit", 23, 2) === "", `the fire pit in the middle of the 7: ${setdownMod.fitProblem("ground", "fire_pit", 23, 2)}`);
  const fireplaceFits = [];
  for (const [x, y] of s7.stepped) {
    const f = setdownMod.fitFor("wall", "fireplace", x, y);
    if (!f.problem) fireplaceFits.push(`${f.tx},${f.ty} ${f.facing}`);
  }
  assert(!fireplaceFits.length, `a fireplace fits against the ring at ${fireplaceFits.join("; ")}`);
  // The ring's eight crossed tiles of the 5 by 5 refuse a carried prop too, and a made one never lands there (stations.js fits).
  const me = gameMod.state.player;
  me.carrying = { footprint: [1, 1] };
  me.gx = 28;
  me.gy = 9;
  const refused = roundMod.shape(26, 7, 5).crossed.filter(([x, y]) => !placementImport.canPutDown(me, x, y)).length;
  me.carrying = null;
  assert(refused === 8, `a carried prop goes down on ${8 - refused} of the 5's crossed tiles`);
  return `${s7.unreachable.length} unreachable tiles no path reaches; ${s7.crossed.length} crossed tiles refuse a set-down; the fire pit fits at 23,2; no fireplace anywhere in the 7`;
});
check("round rooms, step 1: a door point takes a door and a window, and a door taken away leaves a ring wall; no door off a door point, no wall inside a ring", () => {
  roundSquare();
  ownRing();
  assert(mapMod.ringWallProblem(3, 2, "n", "door") === "Only at a door point of the curve" && !mapMod.canBuildWall(3, 2, "n", "door"), "a door off a door point is not refused");
  assert(mapMod.ringWallProblem(4, 4, "n", "wall") === "Not inside a round room" && !mapMod.canBuildWall(4, 4, "n", "wall"), "a wall inside the ring is not refused");
  assert(mapMod.canBuildWall(4, 2, "n", "door") && mapMod.buildWall(4, 2, "n", "door", "wall_stone"), "no door at the north door point");
  const d = mapMod.tileAt(4, 2).n;
  assert(d.kind === "door" && d.sprite === "wall_stone" && d.underRound && d.underBuilt && !mapMod.isRingWall(d), `the door: ${JSON.stringify(d)}`);
  assert(mapMod.buildWall(2, 4, "w", "window", "wall_stone") && mapMod.tileAt(2, 4).w.kind === "window", "no window at the west door point");
  // The dead break in at a door point as at any door (the siege's breach, map.breachTargets): standing outside it, going through into the room.
  mapMod.rebuildRooms();
  const ringRoom = mapMod.getRoom(mapMod.roomAt(4, 4));
  const breach = mapMod.breachTargets(ringRoom, 4, 0.5);
  assert(breach.length === 1 && breach[0].tx === 4 && breach[0].ty === 2 && breach[0].edge === "n" && breach[0].stand.join(",") === "4,1" && breach[0].into.join(",") === "4,2", `the breach of the ring's room: ${JSON.stringify(breach.map((b) => [b.tx, b.ty, b.edge, b.stand, b.into]))}`);
  mapMod.destroyWall(4, 2, "n", true);
  const w = mapMod.tileAt(4, 2).n;
  assert(w && w.kind === "wall" && mapMod.isRingWall(w) && mapMod.ringOfWall(w) && w.built, `taken away, the door left ${JSON.stringify(w)}`);
  mapMod.rebuildRooms();
  assert(mapMod.roomSealed(mapMod.getRoom(mapMod.roomAt(4, 4))), "the ring is not sealed again with its door gone");
  return "a door and a window at door points, the ring wall back under the door; refused off a door point and inside";
});
check("round rooms, step 1: a torch mounts on a ring edge at its point on the curve, on a face the camera sees; a painting never hangs there", () => {
  roundSquare();
  ownRing();
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  try {
    const me = gameMod.state.player;
    me.gx = 4;
    me.gy = 3.2;
    me.layer = 0;
    assert(setdownMod.mountProblem(4, 2, "n") === "" && setdownMod.mountProblem(3, 2, "n") === "", `the far half's inner face: "${setdownMod.mountProblem(4, 2, "n")}"`);
    assert(setdownMod.mountProblem(6, 2, "w") === "Not on that side of the curve", `a face looking away: "${setdownMod.mountProblem(6, 2, "w")}"`);
    const torch = itemsMod.makeEntry("torch", 1);
    gridMod.insert(inventoryMod.bagOf(me), torch);
    assert(setdownMod.mountTorch(me, torch.uid, 4, 2, "n"), `not mounted: "${said[said.length - 1]}"`);
    const b = mapMod.bracketAt(4, 2, "n");
    const [bx, by] = mapMod.bracketPos(b);
    assert(b && mapMod.roomAt(Math.round(bx), Math.round(by)) === mapMod.roomAt(4, 4) && Math.abs(Math.hypot(bx - 4, by - 4) - 2.2) < 0.06, `the bracket's torch at ${bx.toFixed(2)},${by.toFixed(2)}`);
    const why = paintingsMod.fitProblem("painting_small_deer", 5, 2, "n");
    assert(/curve/.test(why), `a painting on the ring: "${why}"`);
    return `on the inner face at ${bx.toFixed(2)},${by.toFixed(2)}; a face looking away and a painting refused`;
  } finally {
    promptMod.setMessageSink(null);
  }
});
check("round rooms, step 1: the ring is per layer (docs/49): one on the first floor is a room there, blocks bodies there, and nothing on the ground under it", () => {
  roundSquare();
  clearPatch(0, 0, 10, 10);
  for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) mapMod.setFloor(x, y, "floor_wood", 1);
  const r = mapMod.buildRing(2, 2, 5, "wall_stone", 1, { built: true });
  assert(r && r.layer === 1 && r.id === "round_1_2_2", `the first-floor ring: ${mapMod.ringProblem(2, 2, 5, 1)}`);
  mapMod.rebuildRooms();
  const room = mapMod.getRoom(mapMod.roomAt(4, 4, 1));
  assert(room && room.size === 21 && room.layer === 1 && mapMod.roomAt(4, 4, 0) === 0, "the first floor's ring is no room there, or one on the ground");
  assert(mapMod.ringAt(4, 4, 1) === r && !mapMod.ringAt(4, 4, 0) && mapMod.curveCrossed(3, 2, 1) && !mapMod.curveCrossed(3, 2, 0), "the ring's marks are not its layer's alone");
  const up = pressFrom([4, 4], [1, -1], 1);
  const ground = pressFrom([4, 4], [1, -1], 0);
  assert(Math.hypot(up.gx - 4, up.gy - 4) < 2.25 && Math.hypot(ground.gx - 4, ground.gy - 4) > 3, `the walks north-east ended ${Math.hypot(up.gx - 4, up.gy - 4).toFixed(2)} out on the first floor, ${Math.hypot(ground.gx - 4, ground.gy - 4).toFixed(2)} on the ground`);
  const rec = JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(0, 0, false, 1)));
  assert(rec.includes('"round":[2,2,5]') && rec.includes('"layer":1'), "the first floor's chunk record does not carry the ring");
  return `a room of ${room.size} on layer 1, the ground open under it`;
});
check("round rooms, step 1: the save and the wire carry a ring in its walls: restored whole, a replica gets it from its chunks alone and drops it when they come without it (PROTOCOL 25)", () => {
  roundSquare();
  const r = ownRing({ built: true, free: true });
  mapMod.buildWall(4, 2, "n", "door", "wall_stone");
  const keys = new Set();
  for (const [tx, ty] of roundMod.shape(2, 2, 5).outline) keys.add(mapMod.chunkCoord(tx, ty).join(","));
  const recsOf = () => [...keys].map((k) => JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(...k.split(",").map(Number), false)))));
  const withRing = recsOf();
  const parts0 = gameMod.syncParts();
  const saved = JSON.parse(JSON.stringify(gameMod.serialize()));
  gameMod.restore(saved, read("data/maps/square.json"));
  mapMod.rebuildRooms();
  const back = mapMod.ringById(r.id);
  assert(back && back.built && back.free && mapMod.tileAt(4, 2).n.underRound && mapMod.getRoom(mapMod.roomAt(4, 4)).size === 21, "the ring did not come back whole from the save");
  assert(mapMod.circleBlocked(5.6, 2.4, 0.3), "the curve does not block after the restore");
  const parts1 = gameMod.syncParts();
  assert(parts1.rings === parts0.rings && parts1.map === parts0.map, `the sync parts moved over the save: rings ${parts0.rings} to ${parts1.rings}`);
  mapMod.removeRing(r.id);
  const without = recsOf();
  // A replica: a fresh world from the file, the ring's chunks installed as a frame installs them.
  gameMod.create({ json: read("data/maps/square.json"), rules: { zombieAggro: false } });
  for (const d of withRing) mapMod.installChunk(d);
  assert(mapMod.ringById(r.id) && mapMod.curveCrossed(3, 2), "a replica did not get the ring from its chunks");
  for (const d of without) mapMod.installChunk(d);
  assert(!mapMod.ringById(r.id) && !mapMod.curveCrossed(3, 2) && !mapMod.allRings(0).some((q) => q.x0 === 2 && q.y0 === 2), "a replica kept the ring its chunks came without");
  assert(netMod.PROTOCOL >= 25, `PROTOCOL ${netMod.PROTOCOL}`); // 25 brought the rings; 26 the built floors and stairs (docs/49 section 5)
  return `restored with its door and its record; a replica's ring from ${withRing.length} chunk record(s), and gone with them`;
});
check("round rooms, step 6: the round stone wall is in the palette only with Free building (Michael, 2026-10-27), built by a guest's command on its square's corner and size, and taken apart whole; an authored one never", () => {
  roundSquare();
  clearPatch(0, 0, 10, 10);
  const was = rulesImport.rules.freeBuilding;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  try {
    const me = gameMod.state.player;
    me.gx = 4;
    me.gy = 8;
    me.layer = 0;
    me.action = null;
    rulesImport.set({ freeBuilding: false });
    assert(!placementImport.paletteKinds().some((k) => k.id === "round_stone"), "the palette offers the round wall without Free building");
    placementImport.performPlacement(me, { kind: "build", what: "round_stone", tx: 2, ty: 2, size: 5 });
    assert(!mapMod.ringAt(4, 4) && /not in the game yet/.test(said[said.length - 1] || ""), `without Free building: "${said[said.length - 1]}"`);
    rulesImport.set({ freeBuilding: true });
    assert(placementImport.paletteKinds().some((k) => k.id === "round_stone") && placementImport.costText("round_stone") === "free", "the palette does not offer it free with Free building");
    assert(placementImport.performPlacement(me, { kind: "build", what: "round_stone", tx: 2, ty: 2, size: 6 }) === false, "a size of 6 was taken");
    // Each size its own entry (Michael, 2026-10-30): a command naming the other size is refused.
    assert(placementImport.performPlacement(me, { kind: "build", what: "round_stone", tx: 2, ty: 2, size: 7 }) === false && placementImport.performPlacement(me, { kind: "build", what: "round_stone_7", tx: 2, ty: 2, size: 5 }) === false, "a size other than its entry's was taken");
    placementImport.performPlacement(me, { kind: "build", what: "round_stone", tx: 2, ty: 2, size: 5 });
    me.action = null;
    const r = mapMod.ringAt(4, 4);
    assert(r && r.built && r.free && r.sprite === "wall_stone", `the guest's ring: ${JSON.stringify(r)} "${said[said.length - 1]}"`);
    rulesImport.set({ freeBuilding: false });
    assert(JSON.stringify(placementImport.partsOf({ type: "round", ring: { ...r, free: false } }).back) === '[{"id":"stone","count":20}]', `a paid 5 by 5 gives back ${JSON.stringify(placementImport.partsOf({ type: "round", ring: { ...r, free: false } }).back)}`);
    rulesImport.set({ freeBuilding: true });
    placementImport.performPlacement(me, { kind: "remove", target: { type: "round", id: r.id } });
    assert(!mapMod.ringById(r.id) && !mapMod.tileAt(3, 2).n && !mapMod.curveCrossed(3, 2), `taken apart: "${said[said.length - 1]}"`);
    placementImport.performPlacement(me, { kind: "build", what: "round_stone_7", tx: 1, ty: 1, size: 7 });
    me.action = null;
    const r7 = mapMod.ringAt(4, 4);
    assert(r7 && r7.n === 7 && placementImport.costText("round_stone_7") === "free", `the 7 across, its own entry: ${JSON.stringify(r7 && [r7.x0, r7.y0, r7.n])} "${said[said.length - 1]}"`);
    rulesImport.set({ freeBuilding: false });
    assert(placementImport.costText("round_stone_7") === "56 stones" && placementImport.costText("round_stone") === "40 stones" && JSON.stringify(placementImport.partsOf({ type: "round", ring: { ...r7, free: false } }).back) === '[{"id":"stone","count":28}]', `the 7's cost ${placementImport.costText("round_stone_7")}, the 5's ${placementImport.costText("round_stone")}, and the 7's back ${JSON.stringify(placementImport.partsOf({ type: "round", ring: { ...r7, free: false } }).back)}`);
    rulesImport.set({ freeBuilding: true });
    placementImport.performPlacement(me, { kind: "remove", target: { type: "round", id: r7.id } });
    assert(!mapMod.ringById(r7.id), `the 7 taken apart: "${said[said.length - 1]}"`);
    me.gx = 24;
    me.gy = 9;
    placementImport.performPlacement(me, { kind: "remove", target: { type: "round", id: "round_0_21_0" } });
    assert(mapMod.ringById("round_0_21_0") && /village/.test(said[said.length - 1] || ""), `the map's ring: "${said[said.length - 1]}"`);
    // Against a house (the apse, docs/50 section 5): a straight wall and a door on its outline are taken in and come back straight when it goes.
    for (let x = 1; x <= 7; x++) mapMod.buildWall(x, 7, "n", "wall", "wall_wood");
    mapMod.buildWall(4, 7, "n", "door", "wall_wood");
    const newEdges = mapMod.ringNewEdges(2, 2, 5);
    me.gx = 4;
    me.gy = 0.6;
    placementImport.performPlacement(me, { kind: "build", what: "round_stone", tx: 2, ty: 2, size: 5 });
    me.action = null;
    const apse = mapMod.ringAt(4, 4);
    const south = [3, 4, 5].map((x) => mapMod.tileAt(x, 7).n);
    assert(apse && newEdges === 17 && south.every((w) => w && w.roundTaken && (w.round || w.underRound)) && mapMod.isRingWall(south[0]) && south[1].kind === "door", `against the wall: ${newEdges} new edges, south ${JSON.stringify(south.map((w) => w && [w.kind, !!w.roundTaken]))}`);
    assert(mapMod.ringOwnEdges(apse) === 17, `its own plain edges: ${mapMod.ringOwnEdges(apse)} (it laid 17)`);
    placementImport.performPlacement(me, { kind: "remove", target: { type: "round", id: apse.id } });
    const back = [3, 4, 5].map((x) => mapMod.tileAt(x, 7).n);
    assert(!mapMod.ringById(apse.id) && back.every((w) => w && !w.round && !w.underRound && !w.roundTaken && w.sprite === "wall_wood") && back[1].kind === "door" && !mapMod.tileAt(3, 2).n, `taken apart, the house's wall: ${JSON.stringify(back.map((w) => w && [w.kind, w.sprite, !!w.round]))}`);
    return "hidden and refused without Free building; built by a guest's command, taken apart whole; the map's refused; against a wall with a door, the wall and the door taken in and left straight when it went";
  } finally {
    rulesImport.set({ freeBuilding: was });
    promptMod.setMessageSink(null);
  }
});
// The review of #536, the cell law first: a door point is never left an empty edge under a ring drawn whole.
check("round rooms (the review of #536): a door point is never left empty: the map's door broken by the dead, a door stamped over it and taken away; a house door a ring took in, taken away; either way the ring wall is back", () => {
  roundSquare();
  const door = mapMod.tileAt(24, 7).n;
  assert(door && door.kind === "door" && door.under === "wall_stone" && door.underRound, `the map's door point: ${JSON.stringify(door && [door.kind, door.under, door.underRound])}`);
  door.broken = true; // the dead broke it (an opening for good)
  door.open = true;
  door.hp = 0;
  assert(mapMod.buildWall(24, 7, "n", "door", "wall_stone"), "no door stamped over the broken one");
  const stamped = mapMod.tileAt(24, 7).n;
  assert(stamped.underRound && stamped.under === "wall_stone", `the stamped door keeps the ring under it: ${JSON.stringify([stamped.under, stamped.underRound])}`);
  mapMod.destroyWall(24, 7, "n", true);
  const a = mapMod.tileAt(24, 7).n;
  assert(a && mapMod.isRingWall(a) && !a.built && !a.roundTaken, `taken away, the map's door point is ${JSON.stringify(a && [a.kind, !!a.round, !!a.built])}`);
  // Even a door point's opening taken with no restore (a fence's burst, a ring's own take-down) gives the ring wall back.
  mapMod.buildWall(24, 7, "n", "door", "wall_stone");
  mapMod.destroyWall(24, 7, "n", false);
  assert(mapMod.isRingWall(mapMod.tileAt(24, 7).n), "a door point taken with no restore was left empty");
  mapMod.rebuildRooms();
  assert(mapMod.getRoom(mapMod.roomAt(24, 3)).size === 37 && !lineOfSight(24, 4, 24, 9), "the 7 is open where its door was");
  // (b) A house door on an empty edge, taken in by a ring at its door point, then taken away: the ring's own wall, which goes with the ring.
  clearPatch(0, 0, 10, 10);
  assert(mapMod.buildWall(4, 7, "n", "door", "wall_wood"), "no house door on the empty edge");
  const ring = mapMod.buildRing(2, 2, 5, "wall_stone", 0, { built: true });
  const hd = mapMod.tileAt(4, 7).n;
  assert(ring && hd.kind === "door" && hd.roundTaken && hd.underRound && !hd.under, `the house door taken in: ${JSON.stringify(hd && [hd.kind, hd.roundTaken, hd.under])}`);
  mapMod.destroyWall(4, 7, "n", true);
  const b = mapMod.tileAt(4, 7).n;
  assert(b && mapMod.isRingWall(b) && !b.roundTaken && b.built && b.sprite === "wall_stone", `taken away, the house door left ${JSON.stringify(b && [b.kind, b.sprite, !!b.roundTaken])}`);
  assert(mapMod.ringOwnEdges(ring) === 20, `the ring's own edges ${mapMod.ringOwnEdges(ring)}`);
  mapMod.removeRing(ring.id);
  assert(!mapMod.tileAt(4, 7).n && !mapMod.tileAt(3, 2).n, "the ring's own wall at the door point stayed when it went");
  return "the map's door broken, replaced, and taken away, the ring wall back (with a restore or without); a house door taken in and taken away, the ring's own wall back and gone with it";
});
check("round rooms (the review of #536): taking a ring apart gives back for what it takes and nothing it leaves: a door it took in stays unpaid, its own edge under a later door is paid; a ring edge named as a wall takes the whole ring", () => {
  roundSquare();
  clearPatch(0, 0, 10, 10);
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  const was = rulesImport.rules.freeBuilding;
  try {
    // A house wall with its door on the south of the square: taken in. A door stamped later into the ring's own north edge.
    for (let x = 1; x <= 7; x++) mapMod.buildWall(x, 7, "n", "wall", "wall_wood");
    mapMod.buildWall(4, 7, "n", "door", "wall_wood");
    const ring = mapMod.buildRing(2, 2, 5, "wall_stone", 0, { built: true });
    mapMod.buildWall(4, 2, "n", "door", "wall_stone");
    assert(mapMod.ringOwnEdges(ring) === 17, `its own edges with a door in one: ${mapMod.ringOwnEdges(ring)} (17)`);
    rulesImport.set({ freeBuilding: false });
    const back = placementImport.partsOf({ type: "round", ring: { ...ring, free: false } }).back;
    const doorBack = placementImport.partsOf({ type: "wall", tx: 0, ty: 0, edge: "n", wall: { kind: "door", sprite: "wall_stone", built: true } }).back;
    const want = { stone: 17 };
    for (const d of doorBack) want[d.id] = (want[d.id] || 0) + d.count;
    const got = Object.fromEntries(back.map((d) => [d.id, d.count]));
    assert(JSON.stringify(got) === JSON.stringify(want), `taken apart it gives ${JSON.stringify(got)}, wanted ${JSON.stringify(want)} (17 edges and its own door, never the house's)`);
    rulesImport.set({ freeBuilding: true });
    // A guest's remove naming one ring edge as a wall: the whole ring goes (never one edge, the room opened under a curve still drawn).
    const me = gameMod.state.player;
    me.gx = 4;
    me.gy = 0.6;
    me.layer = 0;
    placementImport.performPlacement(me, { kind: "remove", target: { type: "wall", tx: 3, ty: 2, edge: "n" } });
    assert(!mapMod.ringById(ring.id) && !mapMod.tileAt(3, 2).n && !mapMod.tileAt(2, 3).w && !mapMod.tileAt(4, 2).n, `a ring edge removed as a wall: the ring ${mapMod.ringById(ring.id) ? "stands" : "went"}, "${said[said.length - 1]}"`);
    const house = mapMod.tileAt(4, 7).n;
    assert(house && house.kind === "door" && house.sprite === "wall_wood" && !house.roundTaken && !house.underRound && mapMod.tileAt(3, 7).n && !mapMod.tileAt(3, 7).n.round, "the house's wall and door did not stay, straight");
    // The map's ring by a wall address: refused, nothing taken.
    me.gx = 24;
    me.gy = 8.6;
    placementImport.performPlacement(me, { kind: "remove", target: { type: "wall", tx: 23, ty: 7, edge: "n" } });
    assert(mapMod.isRingWall(mapMod.tileAt(23, 7).n) && mapMod.ringById("round_0_21_0"), "a map ring's edge was taken");
    return `17 stone and the ring's own door back, nothing for the house's; a ring edge named as a wall took the ring whole; the map's refused`;
  } finally {
    rulesImport.set({ freeBuilding: was });
    promptMod.setMessageSink(null);
  }
});
check("round rooms (the review of #536): the 7 by 7's outer corner keeps the dead out: a body in the pocket and one inside at the diagonal are under a bite's reach apart (about 0.7), held by no line of sight; a first-floor ring's crossed tiles refuse furniture on that floor", () => {
  roundSquare();
  const inn = pressFrom([24, 3], [-1, -1]);
  const out = pressFrom([20.6, -0.4], [1, 1]);
  const gap = Math.hypot(inn.gx - out.gx, inn.gy - out.gy);
  assert(gap < 0.9 && !lineOfSight(inn.gx, inn.gy, out.gx, out.gy) && !lineOfSight(out.gx, out.gy, inn.gx, inn.gy), `at the 7's north-west: ${gap.toFixed(2)} apart, sight ${lineOfSight(inn.gx, inn.gy, out.gx, out.gy)}`);
  const crossed = roundMod.shape(26, 7, 5).crossed;
  const up = crossed.map(([x, y]) => setdownMod.standProblem("ground", x, y, 1));
  assert(up.every((w) => w === "Not against the curve"), `on the tower's first floor: ${up.join(", ")}`);
  return `the corner's two ${gap.toFixed(2)} apart with no line of sight; the first floor's eight crossed tiles refused`;
});
check("round rooms: the inside skirt (Michael, 2026-10-27) covers every point inside the stone wall's inner face that is off the stepped floor, and reaches no further out than under that face", () => {
  const t = (getDef("wall_stone").wall.thickness || 16) / 2 / 32;
  const K = roundMod.SKIRT_SAMPLES;
  const out = [];
  for (const n of [5, 7]) {
    const s = roundMod.shape(0, 0, n);
    const ends = roundMod.floorEnd(n);
    const inner = s.R - t;
    const rIn = (a) => {
      const f = ((a / (2 * Math.PI)) * K + K) % K;
      const j = Math.floor(f);
      const u = f - j;
      return Math.min(ends[j] - 0.04, inner - 0.08) * (1 - u) + Math.min(ends[(j + 1) % K] - 0.04, inner - 0.08) * u;
    };
    let bare = 0;
    let off = 0;
    for (let i = 0; i < 40000; i++) {
      const a = (i / 40000) * 2 * Math.PI * 97;
      const rad = inner * Math.sqrt(((i * 7919) % 40000) / 40000);
      const x = s.cx + Math.cos(a) * rad;
      const y = s.cy + Math.sin(a) * rad;
      if (roundMod.isStepped(0, 0, n, Math.floor(x + 0.5), Math.floor(y + 0.5))) continue;
      off++;
      if (rad < rIn(a) - 1e-9) bare++;
    }
    assert(off > 0 && bare === 0, `${n} by ${n}: ${bare} of ${off} points off the floor inside the wall left bare`);
    assert([...ends].every((e, j) => Math.min(e - 0.04, inner - 0.08) <= inner - 0.08 + 1e-9), "the skirt's edge past its least width");
    out.push(`${n}: ${off} points off the floor inside the wall, all covered`);
  }
  return out.join("; ");
});
// A straight wall meeting a ring (docs/50 section 3, #588): it ends at a vertex of the stepped outline; the filler is a picture, drawn from
// the walls alone (render/walls.js), its pieces found by map.ringJoin.
check("round rooms, step 3 (#588): the outline's vertices and the filler's pieces: a 5 by 5's step corners half a tile from the curve, a 7 by 7's 0.34 and its diagonal corners 0.05, none at a door point's ends; the pockets' vertices off the outline, the square's corner among them", () => {
  const near = (a, b) => Math.abs(a - b) < 0.002;
  const at = (n, vx, vy) => roundMod.fillsAt(0, 0, n, vx, vy).map((f) => [f.tx, f.ty, f.edge, +f.d.toFixed(3)]);
  const five = roundMod.fillVerticesOf(0, 0, 5);
  const seven = roundMod.fillVerticesOf(0, 0, 7);
  assert(five.length === 8 && five.every(([x, y]) => roundMod.fillsAt(0, 0, 5, x, y).length === 1 && near(roundMod.fillsAt(0, 0, 5, x, y)[0].d, 0.5)), `the 5 by 5's fills: ${JSON.stringify(five.map(([x, y]) => at(5, x, y)))}`);
  assert(seven.length === 12 && JSON.stringify(at(7, 2, 0)) === '[[2,0,"w",0.338]]' && JSON.stringify(at(7, 1, 1)) === '[[1,1,"n",0.051],[1,1,"w",0.051]]' && JSON.stringify(at(7, 0, 2)) === '[[0,2,"n",0.338]]', `the 7 by 7's north-west: ${JSON.stringify([at(7, 2, 0), at(7, 1, 1), at(7, 0, 2)])}`);
  assert(roundMod.isOutlineVertex(0, 0, 7, 3, 0) && !at(7, 3, 0).length && roundMod.isOutlineVertex(0, 0, 5, 2, 0) && !at(5, 2, 0).length && !at(5, 3, 0).length, "a door point's end has a fill");
  const pockets = (n) => {
    const out = [];
    for (let y = -1; y <= n + 1; y++) for (let x = -1; x <= n + 1; x++) if (roundMod.isPocketVertex(0, 0, n, x, y)) out.push(`${x},${y}`);
    return out;
  };
  assert(pockets(5).join(" ") === "0,0 5,0 0,5 5,5" && pockets(7).length === 12 && pockets(7).includes("0,0") && pockets(7).includes("1,0") && !pockets(7).includes("1,1"), `the pockets' vertices: 5: ${pockets(5).join(" ")}; 7: ${pockets(7).join(" ")}`);
  return `5 by 5: ${five.length} fills of 0.5; 7 by 7: ${seven.length} vertices, 0.338 at the step corners, 0.051 twice at the diagonals; none at the door points' ends; pocket vertices ${pockets(5).length} and ${pockets(7).length}`;
});
check("round rooms, step 3 (#588): a straight wall toward a ring ends at a vertex of its stepped outline: one ending at the square's corner or a 7 by 7's pocket corner is refused with why (the command a guest sends too); built from the ring outward it runs through the pocket; the room beyond a run seals against the ring, the ring's own room still one", () => {
  roundSquare();
  const r5 = ownRing(); // the 5 by 5 at (2, 2): its square x 2 to 6, its step corners (3, 2) and (6, 2) on the north, the square's corner (2, 2)
  const WHY = "Build it from a step of the round wall outward";
  const out = [];
  // To the square's corner, along either line: refused.
  assert(mapMod.ringWallProblem(2, 1, "w", "wall") === WHY && !mapMod.canBuildWall(2, 1, "w", "wall"), `a wall to the 5 by 5's corner from the north: "${mapMod.ringWallProblem(2, 1, "w", "wall")}"`);
  assert(mapMod.ringWallProblem(1, 2, "n", "wall") === WHY, `from the west: "${mapMod.ringWallProblem(1, 2, "n", "wall")}"`);
  assert(mapMod.ringWallProblem(2, 1, "w", "door") === WHY, "a door ending at the square's corner is not refused");
  // Square to the side, to a step corner: built. A door point's end: built, no filler.
  assert(!mapMod.ringWallProblem(3, 1, "w", "wall") && mapMod.canBuildWall(3, 1, "w", "wall") && !mapMod.ringWallProblem(4, 1, "w", "wall"), `to a step corner: "${mapMod.ringWallProblem(3, 1, "w", "wall")}", to a door point's end: "${mapMod.ringWallProblem(4, 1, "w", "wall")}"`);
  // Along the square's side (tangent): its pocket's edge first, from the step corner, then on out past the square's corner.
  assert(mapMod.ringWallProblem(1, 2, "n", "wall") === WHY && !mapMod.ringWallProblem(2, 2, "n", "wall"), "the run along the side, from the step corner, is refused");
  mapMod.buildWall(2, 2, "n", "wall", "wall_stone");
  assert(!mapMod.ringWallProblem(1, 2, "n", "wall") && mapMod.buildWall(1, 2, "n", "wall", "wall_stone"), `on out past the corner: "${mapMod.ringWallProblem(1, 2, "n", "wall")}"`);
  const tangent = mapMod.ringJoin(3, 2, 0);
  assert(tangent && tangent.fills.length === 1 && tangent.fills[0].edge === "w" && tangent.fills[0].tx === 3 && tangent.fills[0].ty === 2 && tangent.fills[0].top && Math.abs(tangent.fills[0].d - 0.5) < 0.002, `the tangent wall's filler: ${JSON.stringify(tangent && tangent.fills.map((f) => [f.tx, f.ty, f.edge, f.d, f.top]))}`);
  out.push("5 by 5: the corner refused both ways, the side run built from the step corner out, its filler down the step edge (0.5)");
  // The room beyond a run: a yard north of the ring, walled from the west step corner to the east one, sealed by the ring's north edges.
  const yard = [[3, 1, "w"], [3, 1, "n"], [4, 1, "n"], [5, 1, "n"], [6, 1, "w"]];
  for (const [x, y, e] of yard) assert(mapMod.buildWall(x, y, e, "wall", "wall_stone"), `the yard's wall ${x},${y},${e} was refused: "${mapMod.ringWallProblem(x, y, e, "wall")}"`);
  mapMod.rebuildRooms();
  const yardRoom = mapMod.getRoom(mapMod.roomAt(4, 1));
  const ringRoom = mapMod.getRoom(mapMod.roomAt(4, 4));
  assert(yardRoom && yardRoom.size === 3 && mapMod.roomSealed(yardRoom), `the yard: ${yardRoom ? yardRoom.size + " tiles, sealed " + mapMod.roomSealed(yardRoom) : "no room"}`);
  assert(ringRoom && ringRoom.size === 21 && mapMod.roomSealed(ringRoom), `the ring's room: ${ringRoom && ringRoom.size}`);
  const square = mapMod.ringJoin(3, 2, 0);
  assert(square.fills.length === 1 && square.fills[0].edge === "w" && square.walls.length === 2, `at the yard's west corner: ${square.walls.length} walls, ${JSON.stringify(square.fills.map((f) => [f.tx, f.ty, f.edge]))}`);
  const east = mapMod.ringJoin(6, 2, 0);
  assert(east && east.fills.length === 1 && east.fills[0].tx === 6 && east.fills[0].ty === 2 && east.fills[0].edge === "w" && east.fills[0].top, `at the yard's east corner: ${JSON.stringify(east && east.fills)}`);
  assert(mapMod.buildWall(4, 1, "w", "wall", "wall_stone") && mapMod.ringJoin(4, 2, 0).fills.length === 0, "a wall to a door point's end has a filler");
  out.push("a yard walled from step corner to step corner a sealed room of 3, the ring's 21; none at a door point's end");
  // A 7 by 7 at (2, 2) on cleared ground: its north-west pocket (2, 2), (3, 2), (2, 3), its diagonal corner (3, 3), the pocket corner (3, 2).
  roundSquare();
  clearPatch(0, 0, 12, 12);
  const r7 = mapMod.buildRing(2, 2, 7, "wall_stone", 0, { built: true });
  assert(r7, `the 7 by 7 at 2,2 was refused: ${mapMod.ringProblem(2, 2, 7, 0)}`);
  assert(mapMod.ringWallProblem(3, 1, "w", "wall") === WHY, `a wall to the 7 by 7's pocket corner: "${mapMod.ringWallProblem(3, 1, "w", "wall")}"`);
  assert(mapMod.ringWallProblem(2, 1, "w", "wall") === WHY && mapMod.ringWallProblem(2, 2, "n", "wall") === WHY, "the 7 by 7's corner, or its pocket's edge along the side away from the step corner, is not refused");
  assert(!mapMod.ringWallProblem(3, 2, "w", "wall") && mapMod.buildWall(3, 2, "w", "wall", "wall_stone"), `through the pocket to the diagonal corner: "${mapMod.ringWallProblem(3, 2, "w", "wall")}"`);
  assert(!mapMod.ringWallProblem(3, 1, "w", "wall") && mapMod.buildWall(3, 1, "w", "wall", "wall_stone"), "on out from the pocket refused");
  const diag = mapMod.ringJoin(3, 3, 0);
  assert(diag && diag.fills.length === 1 && diag.fills[0].tx === 3 && diag.fills[0].ty === 3 && diag.fills[0].edge === "w" && Math.abs(diag.fills[0].d - 0.051) < 0.002, `the diagonal corner's filler: ${JSON.stringify(diag && diag.fills.map((f) => [f.tx, f.ty, f.edge, f.d]))}`);
  // A yard north of it through the diagonal corner: the pocket tile (3, 2) is the yard's.
  for (const [x, y, e] of [[3, 1, "n"], [4, 1, "n"], [5, 1, "n"], [6, 1, "w"]]) assert(mapMod.buildWall(x, y, e, "wall", "wall_stone"), `the 7's yard wall ${x},${y},${e}: "${mapMod.ringWallProblem(x, y, e, "wall")}"`);
  mapMod.rebuildRooms();
  const yard7 = mapMod.getRoom(mapMod.roomAt(4, 1));
  const ring7 = mapMod.getRoom(mapMod.roomAt(5, 5));
  assert(yard7 && yard7.size === 4 && mapMod.roomAt(3, 2) === mapMod.roomAt(4, 1) && mapMod.roomSealed(yard7), `the 7's yard: ${yard7 ? yard7.size + " tiles, sealed " + mapMod.roomSealed(yard7) : "no room"}`);
  assert(ring7 && ring7.size === 37 && mapMod.roomSealed(ring7), `the 7 by 7's room: ${ring7 && ring7.size}`);
  out.push("7 by 7: its pocket corner refused, a wall through the pocket to the diagonal corner built from the ring out (filler 0.051), a yard of 4 with the pocket sealed, the ring's 37");
  // The command a guest sends: the same words, nothing built.
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  const said = [];
  promptMod.setMessageSink((t) => { said.push(t); return true; });
  try {
    rulesImport.set({ freeBuilding: true });
    me.gx = 7; me.gy = 0; me.layer = 0; me.action = null;
    placementImport.performPlacement(me, { kind: "build", what: "wall_stone", tx: 8, ty: 1, edge: "w" }); // x 7.5, to (8, 2): the 7 by 7's north-east pocket corner
    assert(!mapMod.tileAt(8, 1).w && said[said.length - 1] === WHY, `a guest's wall to the pocket corner: "${said[said.length - 1]}", built ${!!mapMod.tileAt(8, 1).w}`);
    me.action = null;
    placementImport.performPlacement(me, { kind: "build", what: "wall_stone", tx: 7, ty: 1, edge: "w" }); // x 6.5, to (7, 2): the north-east step corner
    me.action = null;
    assert(mapMod.tileAt(7, 1).w && mapMod.tileAt(7, 1).w.sprite === "wall_stone", `a guest's wall to the step corner: "${said[said.length - 1]}"`);
  } finally {
    rulesImport.set({ freeBuilding: free0 });
    promptMod.setMessageSink(null);
  }
  out.push(`a guest's command refused with "${WHY}" and its wall to the step corner built`);
  return out.join("; ");
});
check("round rooms, step 3 (the review of #589): a ring is refused where a straight wall already ends in one of its corner pockets, as that wall would be refused if built after it; accepted once the wall is gone, or where the wall ends at a step", () => {
  roundSquare();
  clearPatch(0, 0, 12, 12);
  const WORDS = "A wall ends in its corner: start it at a step";
  const out = [];
  // A 5 by 5 at (2, 2): a wall from the north to its square's corner (2, 2).
  mapMod.buildWall(2, 1, "w", "wall", "wall_stone");
  assert(mapMod.ringProblem(2, 2, 5, 0) === WORDS && !mapMod.buildRing(2, 2, 5, "wall_stone", 0), `a 5 by 5 over a wall ending at its corner: "${mapMod.ringProblem(2, 2, 5, 0)}"`);
  // Run on along the square's side to the step corner (3, 2), the corner is passed through, not ended at.
  mapMod.buildWall(2, 2, "n", "wall", "wall_stone");
  assert(!mapMod.ringProblem(2, 2, 5, 0), `with the wall run on to the step corner: "${mapMod.ringProblem(2, 2, 5, 0)}"`);
  mapMod.destroyWall(2, 2, "n");
  mapMod.destroyWall(2, 1, "w");
  out.push("5 by 5: refused over a wall ending at its corner, accepted with it run on to the step corner");
  // A 7 by 7 at (2, 2): a wall from the north to its pocket corner (3, 2); one to its step corner (4, 2) instead.
  mapMod.buildWall(3, 1, "w", "wall", "wall_stone");
  assert(mapMod.ringProblem(2, 2, 7, 0) === WORDS, `a 7 by 7 over a wall ending at its pocket corner: "${mapMod.ringProblem(2, 2, 7, 0)}"`);
  // The 5 by 5 at (2, 2) has its step corner at (3, 2): the same wall ends at a step there.
  assert(!mapMod.ringProblem(2, 2, 5, 0), `a 5 by 5 with that wall at its step corner: "${mapMod.ringProblem(2, 2, 5, 0)}"`);
  mapMod.destroyWall(3, 1, "w");
  mapMod.buildWall(4, 1, "w", "wall", "wall_stone");
  assert(!mapMod.ringProblem(2, 2, 7, 0), `a 7 by 7 with a wall to its step corner: "${mapMod.ringProblem(2, 2, 7, 0)}"`);
  mapMod.destroyWall(4, 1, "w");
  const r = mapMod.buildRing(2, 2, 7, "wall_stone", 0);
  assert(r, `with the wall gone, the 7 by 7: "${mapMod.ringProblem(2, 2, 7, 0)}"`);
  out.push("7 by 7: refused over a wall ending at its pocket corner, accepted with one to its step corner and built once the wall is gone");
  return out.join("; ");
});
const wallsMod = await import("../src/render/walls.js");
const assetsLib = await import("../src/assets.js");
const visibilityLib = await import("../src/visibility.js");
const glLib = await import("../src/gl.js");
check("round rooms, step 3 (#588): the filler is drawn from the walls alone, one for each join and none at a door point's end, faded with its wall; the post at a join: none where the wall runs on into the curve, one where it turns down the step edge (a corner), none at a door point's end", () => {
  // The drawables, headless: render/walls.js run on a stub of the stone wall's drawn sheet (a headless sheet has frames alone), put back after.
  const { tileKey } = visibilityLib;
  roundSquare();
  ownRing(); // the 5 by 5 at (2, 2)
  const real = assetsLib.getSheet("wall_stone");
  assetsLib.registerSheet("wall_stone", { ...real, wall: { material: "stone" }, thickness: 16, wallHeight: 96, frames: { ...real.frames, north_plain: [0, 0, 49, 121], west_plain: [0, 0, 49, 121] }, frameAnchors: { north_plain: [16, 100], west_plain: [33, 100] }, anchor: [16, 100] });
  try {
    const tiles = [];
    for (let y = -2; y < 12; y++) for (let x = -2; x < 12; x++) tiles.push([x, y]);
    const visible = new Set(tiles.map(([x, y]) => tileKey(x, y)));
    const drawn = (room = 0) => {
      const out = [];
      glLib.begin(0);
      wallsMod.wallDrawables(tiles, visible, room, out);
      return out.filter((d) => d.filler);
    };
    const post = (vx, vy) => {
      glLib.begin(0); // a new frame: the posts are worked out once a frame (render/walls.js postBase's cache)
      return !!wallsMod.postAt(vx, vy, 0);
    };
    assert(!drawn().length, "a filler with no straight wall at the ring");
    mapMod.buildWall(6, 1, "w", "wall", "wall_stone"); // square to the north side, to the step corner (6, 2)
    mapMod.buildWall(2, 2, "n", "wall", "wall_stone"); // along the north side (tangent), to the step corner (3, 2)
    mapMod.buildWall(4, 1, "w", "wall", "wall_stone"); // to the north door point's end (4, 2)
    const f = drawn();
    const at = (vx, vy) => f.filter((d) => d.filler.vx === vx && d.filler.vy === vy);
    assert(f.length === 2 && at(6, 2).length === 1 && at(3, 2).length === 1 && !at(4, 2).length, `the fillers: ${JSON.stringify(f.map((d) => d.filler))}`);
    assert(at(6, 2)[0].filler.edge === "w" && at(6, 2)[0].filler.tx === 6 && at(3, 2)[0].filler.edge === "w" && at(3, 2)[0].filler.tx === 3 && Math.abs(at(3, 2)[0].filler.d - 0.5) < 0.002 && at(3, 2)[0].filler.ring === "round_0_2_2", `their edges: ${JSON.stringify(f.map((d) => d.filler))}`);
    assert(!post(6, 2) && post(3, 2) && !post(4, 2), `the posts: on into the curve ${post(6, 2)}, the corner down the step edge ${post(3, 2)}, a door point's end ${post(4, 2)}`);
    // A fence takes no fill (the review of #589): one square into the west step corner (2, 3) leaves the fill to a stone wall along the west
    // side to that corner; a lone fence ending at the west door point's end (2, 4) keeps its own end post.
    mapMod.buildWall(2, 2, "w", "wall", "wall_stone");
    mapMod.buildWall(1, 3, "n", "wall", "wall_fence");
    mapMod.buildWall(1, 4, "n", "wall", "wall_fence");
    const west = drawn().filter((d) => d.filler.vx === 2 && d.filler.vy === 3);
    assert(west.length === 1 && west[0].filler.wall.tx === 2 && west[0].filler.wall.ty === 2 && west[0].filler.wall.edge === "w" && west[0].filler.edge === "n", `at the west step corner, a fence and a stone wall: ${JSON.stringify(west.map((d) => d.filler))}`);
    assert(post(2, 4), "a lone fence at a door point's end lost its end post");
    // Faded with its wall: a room north of the ring (x 3 to 5, y 0 to 1) walled round to its step corners and sealed by its north edges, the
    // player in it: the wall at x 5.5 is its east wall, between the room and the camera, a near wall.
    mapMod.destroyWall(4, 1, "w");
    for (const [x, y, e] of [[6, 0, "w"], [3, 0, "n"], [4, 0, "n"], [5, 0, "n"], [3, 0, "w"], [3, 1, "w"]]) mapMod.buildWall(x, y, e, "wall", "wall_stone");
    mapMod.rebuildRooms();
    const yard = mapMod.roomAt(4, 1);
    const yardRoom = mapMod.getRoom(yard);
    const faded = drawn(yard).filter((d) => d.filler.vx === 6 && d.filler.vy === 2);
    assert(yardRoom && yardRoom.size === 6 && mapMod.roomSealed(yardRoom), `the room north of the ring: ${yardRoom ? yardRoom.size + " tiles, sealed " + mapMod.roomSealed(yardRoom) : "none"}`);
    assert(faded.length === 1 && faded[0].cut, `the filler with its wall a near wall, cut to the stub with it (docs/53 section 6.2): ${JSON.stringify(faded.map((d) => d.cut))}`);
    assert(drawn(0).every((d) => !d.cut && !d.faded), "a filler cut with nobody inside");
    // Faded where a post stands at the vertex (the review of #589): a room west of the yard (x 0 to 2, y 0 to 1), its east wall at x 2.5 square
    // into the step corner (3, 2), where the wall along the side meets it: from inside, the filler fades and stops at the faded post's face.
    for (const [x, y, e] of [[0, 0, "n"], [1, 0, "n"], [2, 0, "n"], [0, 0, "w"], [0, 1, "w"], [0, 2, "n"], [1, 2, "n"]]) mapMod.buildWall(x, y, e, "wall", "wall_stone");
    mapMod.rebuildRooms();
    const westRoom = mapMod.roomAt(1, 1);
    const atPost = drawn(westRoom).filter((d) => d.filler.vx === 3 && d.filler.vy === 2);
    assert(mapMod.getRoom(westRoom) && mapMod.getRoom(westRoom).size === 6 && post(3, 2) && atPost.length === 1 && atPost[0].cut && atPost[0].filler.top, `faded at the post: ${JSON.stringify(atPost.map((d) => [d.faded, d.filler.cuts]))}, the room ${mapMod.getRoom(westRoom) && mapMod.getRoom(westRoom).size}`);
    return `${f.length} fillers (a square wall's and a tangent one's), none at a door point's end; the post only at the tangent corner; cut to the stub with its near wall (docs/53 section 6.2); a fence leaves the fill to a stone wall and keeps its own end post`;
  } finally {
    assetsLib.registerSheet("wall_stone", real);
  }
});

// ---- the battlements (art round 13, Michael 2026-10-29: "make sure the whole of the battlement sits outside the walkway"; Free building's) ----
const battMod = await import("../src/battlements.js");
check("the battlements: the side is read from the floors of the wall's own layer (far: the walkway south of an n edge or east of a w edge; near: north or west), never stored; none on the ground, none with floor on both sides or neither; the corners (outer and inner) and the free ends are classified from the neighbouring edges; the palette entry is `dev` and the command a guest sends refused with Free building off", () => {
  const at = openGrass(6, 6);
  assert(at, "no open grass");
  const [x, y] = at;
  const me = gameMod.state.player;
  const free0 = rulesImport.rules.freeBuilding;
  const floor = (a, b) => {
    const t = mapMod.growTile(a, b, 1);
    t.floor = "floor_stone";
    mapMod.touch(a, b, 1);
  };
  const made = [];
  const lay = (tx, ty, edge) => { if (mapMod.buildWall(tx, ty, edge, "wall", "wall_battlement", null, 1)) made.push([tx, ty, edge]); };
  const floors = [];
  try {
    const rule = mapMod.wallRule("wall_battlement");
    assert(rule.battlement && rule.seeThrough && !rule.fence && !rule.solid && !rule.cliff, `its rule: ${JSON.stringify(rule)}`);
    // The walkway: a ring of floor on layer 1, 5 by 5 (x..x+4, y..y+4), its hole open.
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (i === 0 || j === 0 || i === 4 || j === 4) { floor(x + i, y + j); floors.push([x + i, y + j]); }
    // The sides: the ring's outer edges.
    const sides = [];
    for (let i = 0; i < 5; i++) {
      sides.push(battMod.sideOf(x + i, y, "n", 1), battMod.sideOf(x + i, y + 5, "n", 1), battMod.sideOf(x, y + i, "w", 1), battMod.sideOf(x + 5, y + i, "w", 1));
    }
    const want = ["far", "near", "far", "near"];
    assert(sides.every((s, k) => s === want[k % 4]), `the outer sides: ${sides.join(",")}`);
    assert(battMod.sideOf(x, y, "n", 0) === null, "a side on the ground");
    assert(battMod.sideOf(x, y + 2, "n", 1) === null && battMod.problem(x, y + 2, "n", 1) === "Only along the outer edge of a wall walk", `floor on both sides: ${battMod.problem(x, y + 2, "n", 1)}`); // (x, y + 1) and (x, y + 2), the ring's west column
    assert(battMod.problem(x + 9, y + 9, "n", 1) === "It needs a wall walk to stand on" && battMod.problem(x, y, "n", 0) === "It needs a wall walk to stand on", "neither / the ground");
    // The command a guest sends: refused with Free building off, built with it on, on every outer edge.
    const palette = (on) => { rulesImport.rules.freeBuilding = on; return placementImport.paletteKinds().some((k) => k.id === "battlement_stone"); };
    assert(!palette(false) && palette(true), "the palette entry follows Free building");
    const entry = placementImport.paletteKinds().find((k) => k.id === "battlement_stone");
    assert(entry.dev && entry.group === "Castle" && placementImport.tabOf(entry) === "build" && placementImport.costText("battlement_stone") === "free", "the entry: dev, Castle, Build tab, free");
    me.layer = 1; me.rise = 0;
    const put = (tx, ty, edge, px, py) => { me.gx = px; me.gy = py; placementImport.performPlacement(me, { kind: "build", what: "battlement_stone", tx, ty, edge }); };
    rulesImport.rules.freeBuilding = false;
    put(x + 1, y, "n", x + 1.5, y + 0.6);
    assert(!mapMod.peekTile(x + 1, y, 1).n, "built with Free building off");
    rulesImport.rules.freeBuilding = true;
    for (let i = 0; i < 5; i++) {
      put(x + i, y, "n", x + i, y + 0.6);
      put(x + i, y + 5, "n", x + i, y + 4);
      put(x, y + i, "w", x + 0.6, y + i);
      put(x + 5, y + i, "w", x + 4, y + i);
    }
    let n = 0;
    for (let i = 0; i < 5; i++) for (const w of [mapMod.peekTile(x + i, y, 1).n, mapMod.peekTile(x + i, y + 5, 1).n, mapMod.peekTile(x, y + i, 1).w, mapMod.peekTile(x + 5, y + i, 1).w]) if (w && w.kind === "wall" && w.sprite === "wall_battlement") n++;
    assert(n === 20, `${n} of 20 outer edges stand`);
    for (let i = 0; i < 5; i++) { made.push([x + i, y, "n"], [x + i, y + 5, "n"], [x, y + i, "w"], [x + 5, y + i, "w"]); }
    // Refusals, each leaving nothing: floor on both sides, no floor at all, the ground, a door over one.
    put(x, y + 2, "n", x + 0.5, y + 2.4);
    put(x + 9, y + 9, "n", x + 9, y + 9.4);
    me.layer = 0;
    put(x + 7, y, "n", x + 7, y + 0.6);
    me.layer = 1;
    assert(!mapMod.peekTile(x, y + 2, 1).n && !(mapMod.peekTile(x + 9, y + 9, 1) || {}).n && !(mapMod.peekTile(x + 7, y, 0) || {}).n, "a refused battlement stood");
    // Beside a stair against the wall (Michael, 2026-10-31: refused with "No floor there"): a stair climbing west up to a landing on layer 1, its
    // stairwell's tiles the walkway's, and a battlement on the stairwell's outer (north) edge, built by the command a guest sends.
    const swWhy = mapMod.stairBuildProblem(x + 6, y + 8, "w", 0, "wood");
    const sw = swWhy ? null : mapMod.buildStair(x + 6, y + 8, "w", "wood", 0, { free: true });
    assert(sw && mapMod.stairAt(x + 5, y + 8, 1) && mapMod.stairAt(x + 5, y + 8, 1).well, `the stair: ${swWhy}`);
    try {
      put(x + 5, y + 8, "n", x + 3, y + 8.2);
      const bw = mapMod.peekTile(x + 5, y + 8, 1).n;
      assert(bw && mapMod.wallRule(bw.sprite).battlement && battMod.sideOf(x + 5, y + 8, "n", 1) === "far", `a battlement beside the stairwell: ${bw ? bw.sprite : "none"}`);
      mapMod.destroyWall(x + 5, y + 8, "n", false, 1);
    } finally {
      mapMod.removeStair(sw);
    }
    placementImport.performPlacement(me, { kind: "build", what: "door", tx: x + 1, ty: y, edge: "n" });
    assert(mapMod.peekTile(x + 1, y, 1).n.kind === "wall", "a door was stamped into a battlement");
    // The frames: the artist's names by side and run (plain variants by the edge's hash), the corners and no ends on a closed ring.
    const def = getDef("wall_battlement");
    const nm = (tx, ty, e) => battMod.edgeFrame(def, tx, ty, e, 1, (f) => !!def.images[f]);
    assert([nm(x + 1, y, "n"), nm(x + 1, y + 5, "n"), nm(x, y + 1, "w"), nm(x + 5, y + 1, "w")].every((f, k) => f.startsWith(["north_far", "north_near", "west_far", "west_near"][k])), "the frame names by side and run");
    const corners = [[x, y], [x + 5, y], [x, y + 5], [x + 5, y + 5]].map(([vx, vy]) => (battMod.vertexAt(vx, vy, 1) || {}).frame);
    assert(corners.join() === "corner_outer_n,corner_outer_e,corner_outer_w,corner_outer_s", `the four outer corners: ${corners}`);
    assert(battMod.vertexAt(x + 2, y, 1) === null && battMod.vertexAt(x + 2, y + 5, 1) === null, "a vertex inside a straight run has no piece");
    // An inner corner and the free ends: an L of walkway (x+7.., y), its notch's corner and its cut pictures, and a lone run's two ends.
    const L = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) L.push([x + 7 + i, y + 7 + j]);
    for (let j = 2; j < 4; j++) for (let i = 0; i < 2; i++) L.push([x + 7 + i, y + 7 + j]);
    const has = new Set(L.map(([a, b]) => `${a},${b}`));
    for (const [a, b] of L) { floor(a, b); floors.push([a, b]); }
    for (const [a, b] of L) {
      if (!has.has(`${a},${b - 1}`)) lay(a, b, "n");
      if (!has.has(`${a},${b + 1}`)) lay(a, b + 1, "n");
      if (!has.has(`${a - 1},${b}`)) lay(a, b, "w");
      if (!has.has(`${a + 1},${b}`)) lay(a + 1, b, "w");
    }
    const ix = x + 9;
    const iy = y + 9;
    const inner = battMod.vertexAt(ix, iy, 1);
    assert(inner && inner.frame === "corner_inner_n" && inner.inner, `the L's notch corner: ${inner && inner.frame}`);
    assert(nm(ix, iy, "n") === "north_near_late" && nm(ix, iy, "w") === "west_near_late", `its edges' cuts: ${nm(ix, iy, "n")}, ${nm(ix, iy, "w")}`);
    assert(nm(ix - 1, iy, "n") !== undefined && !/late|early/.test(nm(ix + 1, iy, "n")), "an edge beside it is plain");
    // A lone run: its two ends.
    floor(x + 12, y); floors.push([x + 12, y]);
    lay(x + 12, y, "n");
    const e1 = battMod.vertexAt(x + 12, y, 1);
    const e2 = battMod.vertexAt(x + 13, y, 1);
    assert(e1 && e1.frame === "end_E_far" && e2 && e2.frame === "end_W_far", `a lone run's ends: ${e1 && e1.frame}, ${e2 && e2.frame}`);
    // Blocks bodies, passes sight and light, is no fence, stops an arrow low and not high; the walkway's whole tile is walkable.
    const wall = mapMod.peekTile(x + 1, y, 1).n;
    assert(mapMod.blocksMove(wall) && mapMod.transmission(wall) === 1 && !mapMod.isFence(wall), "block / sight / fence");
    return "sides, refusals, the build, frames, corners, inner corner with its cuts, ends, and its rules";
  } finally {
    rulesImport.rules.freeBuilding = free0;
    me.layer = 0;
    for (const [tx, ty, e] of made) { try { mapMod.destroyWall(tx, ty, e, false, 1); } catch { /* gone */ } }
    for (const [a, b] of floors) { try { mapMod.takeUpFloor(a, b, 1); } catch { /* gone */ } }
  }
});

// Ground with no wall and no storey over a 29 by 25 patch round (x, y) (from x - 7, y - 7), searched round the spawn of a fresh valley
// (docs/53 steps 1 and 2: each step builds its own pieces; props never stop sight, none being opaque).
const clearGround = () => {
  openGrass(1, 1);
  const me = gameMod.state.player;
  mapMod.ensureAround(me.gx, me.gy, 4);
  const clear = (x0, y0) => {
    for (let j = -7; j <= 17; j++) for (let i = -7; i <= 21; i++) {
      const t = mapMod.peekTile(x0 + i, y0 + j, 0);
      if (!t || t.n || t.w || mapMod.peekTile(x0 + i, y0 + j, 1)) return false;
    }
    return true;
  };
  for (let r = 0; r < 60; r += 3) for (let d = -r; d <= r; d += 3) for (const [i, j] of [[d, -r], [d, r], [-r, d], [r, d]]) if (clear(Math.round(me.gx) + i, Math.round(me.gy) + j)) return [Math.round(me.gx) + i, Math.round(me.gy) + j];
  return null;
};

// docs/53 step 1: one height, one walk, for sight. Built on pieces of its own on the valley's open grass (step 0: no scripted castle).
check("height, step 1: sight across storeys by one walk: a walk's edge seen and seeing down (leaning), its back row not from close under the wall, the dead never through a floor, an upstairs window shut and open; from the walk a ground room stays hidden; one storey is the flat walk exactly", () => {
  const vis = visibilityMod;
  const at = clearGround();
  assert(at, "no clear ground");
  const [x, y] = at;
  const floors = [];
  const walls = [];
  const floor = (a, b, L = 1) => { const t = mapMod.growTile(a, b, L); t.floor = "floor_stone"; mapMod.touch(a, b, L); floors.push([a, b, L]); };
  const wall = (tx, ty, edge, L, kind = "wall", sprite = "wall_stone") => { assert(mapMod.buildWall(tx, ty, edge, kind, sprite, null, L), `a ${sprite} at ${tx},${ty} ${edge} on ${L}`); walls.push([tx, ty, edge, L]); return mapMod.peekTile(tx, ty, L)[edge]; };
  const body = (gx, gy, layer) => ({ gx, gy, layer, rise: 0 });
  const sees = zombieMod.sees;
  try {
    // A wall walk: two rows of floor on layer 1 (y, y + 1), a stone wall under its south edge and a battlement on it; the ground south of it open.
    for (let i = 0; i < 6; i++) { floor(x + i, y); floor(x + i, y + 1); wall(x + i, y + 2, "n", 0); wall(x + i, y + 2, "n", 1, "wall", "wall_battlement"); }
    const edge = body(x + 2, y + 1.3, 1); // 0.2 from the battlement: leaning out
    const back = body(x + 2, y, 1); // 1.5 from it
    const near = body(x + 2, y + 3.5, 0);
    const far = body(x + 2, y + 8.5, 0);
    assert(sees(near, edge) && sees(edge, near), "the dead under the walk and the archer at its battlement see each other");
    assert(!sees(near, back) && !sees(back, near), "the dead close under the wall see the walk's back row through its wall");
    assert(sees(far, back) && sees(back, far), "the dead far out and the walk's back row do not see each other over the battlement");
    assert(vis.tileSeen(edge, x + 2, y + 2, 0) && !vis.tileSeen(back, x + 2, y + 2, 0), "the wall's foot: seen leaning out, not from the back row");
    assert(!vis.tileSeen(edge, x + 2, y + 1, 0), "the ground under the walk is seen through its floor");
    // A slab: three by three of floor on layer 1, nothing round it.
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) floor(x + 8 + i, y + 8 + j);
    const under = body(x + 9, y + 9, 0);
    const on = body(x + 9, y + 9, 1);
    assert(!sees(on, under) && !sees(under, on), "a body on a slab and one under it see each other through the floor");
    assert(sees(body(x + 10.4, y + 9, 1), body(x + 14, y + 9, 0)), "a body at the slab's edge does not see down past it");
    // An upstairs room: three by three on layer 1, stone walls round it on layer 1, a window in its south wall.
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) floor(x + i, y + 8 + j);
    let win = null;
    for (let i = 0; i < 3; i++) { wall(x + i, y + 8, "n", 1); if (i === 1) win = wall(x + i, y + 11, "n", 1, "window"); else wall(x + i, y + 11, "n", 1); }
    for (let j = 0; j < 3; j++) { wall(x, y + 8 + j, "w", 1); wall(x + 3, y + 8 + j, "w", 1); }
    const sill = body(x + 1, y + 10.2, 1);
    const deep = body(x + 1, y + 8.6, 1);
    const below = body(x + 1, y + 13, 0);
    win.shutter = "closed"; win.open = false;
    assert(!sees(below, sill) && !sees(sill, below), "a shut shutter upstairs does not hide");
    win.shutter = "open";
    assert(sees(below, sill) && sees(sill, below), "an open window upstairs: the body at it and the dead below do not see each other");
    assert(!sees(below, deep), "the dead see a body deep in an upstairs room through its floor");
    // From the walk's edge: a ground room's inside stays hidden, the open ground beyond is seen; the old flat set from layer 1 saw the room.
    for (let j = 0; j < 2; j++) { wall(x + 12, y + 2 + j, "w", 0); wall(x + 14, y + 2 + j, "w", 0); }
    for (let i = 0; i < 2; i++) { wall(x + 12 + i, y + 2, "n", 0); wall(x + 12 + i, y + 4, "n", 0); }
    const tiles = [];
    for (let j = -6; j <= 16; j++) for (let i = -6; i <= 20; i++) tiles.push([x + i, y + j]);
    const t0 = performance.now();
    const seen = vis.computeSeen(edge, tiles);
    const ms = performance.now() - t0;
    assert(!seen.sees(x + 12, y + 2, 0) && !seen.sees(x + 13, y + 3, 0), "from the walk, the inside of a closed ground room is seen");
    assert(vis.computeVisible(Math.round(edge.gx), Math.round(edge.gy), [[x + 12, y + 2]], 1).size === 1, "the old flat walk on layer 1 does not see into the room, so the row above proves nothing");
    assert(seen.sees(x + 2, y + 6, 0) && seen.sees(x + 8, y + 5, 0), "from the walk, the open ground beyond the battlement is not seen");
    assert(seen.sees(x + 4, y, 1) && seen.has(vis.tileKey(x + 4, y)), "the walk's own floor is not seen from it, by `sees` and by `has`");
    const fromGround = vis.computeSeen(far, tiles);
    assert(fromGround.sees(x + 2, y, 1), "from the ground far out, the walk's back row is not seen (a friend there would not be drawn)");
    assert(!vis.computeSeen(body(x + 2, y + 3, 0), tiles).sees(x + 2, y, 1), "from close under the wall, the walk's back row is seen (a friend there would be drawn through the wall)");
    // One storey is the flat walk exactly: the dead on the ground, and two bodies on layer 1, against lineOfSight.
    let n = 0;
    for (let k = 0; k < 400; k++) {
      const a = body(x - 4 + (k * 7) % 25, y - 4 + (k * 11) % 21, k % 3 ? 0 : 1);
      const b = body(x - 4 + (k * 13) % 25 + 0.3, y - 4 + (k * 5) % 21 - 0.2, a.layer);
      if (sees(a, b) !== lineOfSight(a.gx, a.gy, b.gx, b.gy, a.layer)) n++;
    }
    assert(n === 0, `${n} pairs on one storey differ from the flat walk`);
    return `a ${tiles.length}-tile view from the walk cast in ${ms.toFixed(1)} ms, ${seen.size} seen over ${seen.layers.size} layers`;
  } finally {
    for (const [tx, ty, e, L] of walls.reverse()) { try { mapMod.destroyWall(tx, ty, e, false, L); } catch { /* gone */ } }
    for (const [a, b, L] of floors) { try { mapMod.takeUpFloor(a, b, L); } catch { /* gone */ } }
  }
});

// The review of #601: a body on a stair is looked at where it stands, and a viewer on one looks from where it stands.
check("height, step 1: on a stair: a climber near its top sees the floor above and the dead on it, and a dead one climbing toward a player past the landing is drawn on his screen wherever the dead one sees him", () => {
  const vis = visibilityMod;
  const at = clearGround();
  assert(at, "no clear ground");
  const [x, y] = at;
  const floors = [];
  const floor = (a, b) => { const t = mapMod.growTile(a, b, 1); t.floor = "floor_stone"; mapMod.touch(a, b, 1); floors.push([a, b]); };
  let st = null;
  for (let j = 0; j < 10 && !st; j++) for (let i = 4; i < 14 && !st; i++) if (!mapMod.stairBuildProblem(x + i, y + j, "w", 0, "wood")) st = mapMod.buildStair(x + i, y + j, "w", "wood", 0, { free: true });
  assert(st, "no stair could be built");
  try {
    const [lx, ly] = st.landing;
    for (let j = -2; j <= 2; j++) for (let i = 1; i <= 5; i++) floor(lx - i, ly + j);
    const tiles = [];
    for (let j = -10; j <= 10; j++) for (let i = -12; i <= 12; i++) tiles.push([lx + i, ly + j]);
    const top = st.tiles[st.tiles.length - 1];
    const climber = { gx: top[0], gy: top[1], layer: 0, rise: 0 };
    mapMod.stairStep(climber);
    const up = { gx: lx - 3, gy: ly, layer: 1, rise: 0 };
    assert(climber.rise > 48, `the climber's rise ${climber.rise}`);
    assert(zombieMod.sees(climber, up) && vis.computeSeen(climber, tiles).sees(up.gx, up.gy, 1), "the climber near the top does not see the one on the floor above");
    let bad = [];
    for (const back of [1, 2, 3]) {
      const viewer = { gx: lx - back, gy: ly, layer: 1, rise: 0 };
      const seen = vis.computeSeen(viewer, tiles);
      for (const [tx, ty] of st.tiles) {
        const z = { gx: tx, gy: ty, layer: 0, rise: 0 };
        mapMod.stairStep(z);
        if (zombieMod.sees(z, viewer) && !seen.sees(z.gx, z.gy, z.layer)) bad.push(`${back} back, rise ${z.rise}`);
      }
    }
    assert(!bad.length, `a dead one on the stair sees the player past the landing but is not drawn: ${bad.join("; ")}`);
    return `a climber at rise ${climber.rise} sees the floor above; the dead on every step drawn for a player 1 to 3 tiles past the landing`;
  } finally {
    for (const [a, b] of floors) { const t = mapMod.peekTile(a, b, 1); if (t) { t.floor = "void"; mapMod.touch(a, b, 1); } }
    try { mapMod.removeStair ? mapMod.removeStair(st) : null; } catch { /* gone */ }
  }
});

const isoForRows = await import("../src/iso.js");
// docs/53 step 2: shooting down and up, and items fall. Built on pieces of its own (step 0).
check("height, step 2: a shot from a walk and from a second-storey window lands on the ground and hits there, the blow remembered on the archer's floor; one into the parapet stops and lies on the walk; a spear stops at the walk's edge; a shot up lands on a slab and hits there; nothing lies on the void, and a floor taken up drops what lay on it", () => {
  const at = clearGround();
  assert(at, "no clear ground");
  const [x, y] = at;
  const S = gameMod.state;
  const me = S.player;
  const STEP = 1 / 60;
  const floors = [];
  const walls = [];
  const dead = [];
  const was = { gx: me.gx, gy: me.gy, layer: me.layer, rise: me.rise, aggro: rulesImport.rules.zombieAggro };
  const floor = (a, b, L) => { const t = mapMod.growTile(a, b, L); t.floor = "floor_stone"; mapMod.touch(a, b, L); floors.push([a, b, L]); };
  const wall = (tx, ty, edge, L, kind = "wall", sprite = "wall_stone") => { assert(mapMod.buildWall(tx, ty, edge, kind, sprite, null, L), `a ${sprite} at ${tx},${ty} ${edge} on ${L}`); walls.push([tx, ty, edge, L]); return mapMod.peekTile(tx, ty, L)[edge]; };
  const zombie = (gx, gy, layer) => { const z = zombieMod.createZombie(gx, gy, { hp: 1000 }); z.layer = layer; z.sightTimer = 1e9; z.idleTimer = 1e9; S.zombies.push(z); dead.push(z); return z; };
  const stand = (gx, gy, layer) => { me.gx = gx; me.gy = gy; me.layer = layer; me.rise = 0; };
  const fly = (to, layer, o = {}) => {
    const dx = to[0] - me.gx;
    const dy = to[1] - me.gy;
    const a = archeryMod.shoot(me, [dx, dy], Math.hypot(dx, dy), 1, { layer, ...o });
    for (let i = 0; i < 900 && !a.done; i++) archeryMod.update(STEP);
    assert(a.done, "a flight never came down");
    return a;
  };
  const lying = (tx, ty, L, id = "arrow") => mapMod.itemsAt(tx, ty, L).filter((e) => e.id === id).length;
  try {
    rulesImport.rules.zombieAggro = true;
    archeryMod.reset();
    // A wall walk: two rows of floor on layer 1, stone walls under both its long edges, a battlement on its south edge.
    for (let i = 0; i < 6; i++) { floor(x + i, y, 1); floor(x + i, y + 1, 1); wall(x + i, y, "n", 0); wall(x + i, y + 2, "n", 0); wall(x + i, y + 2, "n", 1, "wall", "wall_battlement"); }
    // Down from the battlement at one of the dead on the ground: it clears the parapet, hits, and the blow is remembered on the walk.
    const below = zombie(x + 2, y + 6, 0);
    stand(x + 2, y + 1.3, 1);
    const hp0 = below.hp;
    const hit = fly([x + 2, y + 6], 0);
    assert(hit.stopD == null && hit.layer === 0 && hit.z0 === archeryMod.tunables.z0 + mapMod.STOREY, `the shot down: stopped ${hit.stopWhy}, layer ${hit.layer}, z0 ${hit.z0}`);
    assert(below.hp < hp0, `the one below was not hit (${below.hp})`);
    assert(Array.isArray(below.lastSeen) && below.lastSeen[2] === 1, `the blow is remembered on ${JSON.stringify(below.lastSeen)}`);
    // A miss lies on the ground where it fell, never a storey up over it.
    const miss = fly([x + 4, y + 8], 0);
    assert(miss.stopD == null && lying(x + 4, y + 8, 0) === 1 && lying(x + 4, y + 8, 1) === 0, `the miss: stopped ${miss.stopWhy}, on the ground ${lying(x + 4, y + 8, 0)}, upstairs ${lying(x + 4, y + 8, 1)}`);
    // From the walk's back row at the ground just past the wall: the parapet stops it under its 28, and it lies on the walk.
    stand(x + 1, y, 1);
    const low = fly([x + 1, y + 5], 0); // at 1.5 tiles out it is 122 px up, under the parapet's top at 124
    assert(low.stopWhy === "wall" && low.stopLayer === 1, `the shot into the parapet: ${low.stopWhy} on ${low.stopLayer}`);
    const onWalk = lying(x + 1, y, 1) + lying(x + 1, y + 1, 1);
    assert(onWalk === 1, `it does not lie on the walk (${onWalk})`);
    // A spear keeps to its own floor: thrown from the walk at the ground, it stops at the walk's edge and lies on the walk.
    stand(x + 3, y + 0.5, 1);
    const spear = fly([x + 3, y + 7], 0, { projectile: "spear", item: { id: "spear", count: 1, uid: "e-spear" } });
    assert(spear.level && spear.stopWhy === "edge" && spear.layer === 1, `the spear: level ${spear.level}, ${spear.stopWhy}, layer ${spear.layer}`);
    assert(lying(x + 3, y + 1, 1, "spear") === 1, "the spear does not lie at the walk's edge");
    // A second-storey window: a column of floor on layers 1 and 2, a stone wall under it, an open window on layer 2 facing south.
    floor(x + 8, y, 1); floor(x + 8, y, 2);
    wall(x + 8, y + 1, "n", 0); wall(x + 8, y + 1, "n", 1);
    const win = wall(x + 8, y + 1, "n", 2, "window");
    win.shutter = "open";
    const far = zombie(x + 8, y + 6, 0);
    stand(x + 8, y + 0.3, 2);
    const hpF = far.hp;
    const fromWindow = fly([x + 8, y + 6], 0);
    assert(fromWindow.stopD == null && far.hp < hpF, `from the window: stopped ${fromWindow.stopWhy} on ${fromWindow.stopLayer}, hp ${hpF} to ${far.hp}`);
    win.shutter = "closed";
    const shut = fly([x + 8, y + 6], 0);
    assert(shut.stopWhy === "wall" && shut.stopLayer === 2, `through a shut window: ${shut.stopWhy} on ${shut.stopLayer}`);
    // Up: a slab of floor on layer 1 with nothing round it, one of the dead on it, shot from the ground; it lands up there and hits there.
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) floor(x + 12 + i, y + 8 + j, 1);
    const onSlab = zombie(x + 13, y + 9, 1);
    stand(x + 13, y + 15, 0);
    const hpS = onSlab.hp;
    const up = fly([x + 13, y + 9], 1);
    assert(up.stopD == null && up.layer === 1 && up.z0 < 0 && onSlab.hp < hpS, `the shot up: stopped ${up.stopWhy}, layer ${up.layer}, z0 ${up.z0}, hp ${hpS} to ${onSlab.hp}`);
    // Nothing lies on the void: let go over the open air of a storey, it falls to the ground; a floor taken up drops what lay on it.
    const air = mapMod.dropItem(x + 16, y + 2, { id: "arrow", count: 1 }, 1);
    assert(lying(x + 16, y + 2, 0) === 1 && lying(x + 16, y + 2, 1) === 0 && air, "an arrow let go over the void did not fall to the ground");
    { const t = mapMod.growTile(x + 16, y + 5, 1); t.built = { under: t.floor, free: true }; t.floor = "floor_stone"; mapMod.touch(x + 16, y + 5, 1); floors.push([x + 16, y + 5, 1]); } // a floor a player laid, alone in the air
    mapMod.dropItem(x + 16, y + 5, { id: "arrow", count: 1 }, 1);
    assert(lying(x + 16, y + 5, 1) === 1, "the arrow is not on the laid floor");
    assert(mapMod.floorTakeUpProblem(x + 16, y + 5, 1) === "", `the floor under an arrow will not come up: "${mapMod.floorTakeUpProblem(x + 16, y + 5, 1)}"`);
    mapMod.takeUpFloor(x + 16, y + 5, 1);
    assert(lying(x + 16, y + 5, 1) === 0 && lying(x + 16, y + 5, 0) === 1, "the arrow on the floor taken up did not fall to the ground");
    // The guest's side: the launch record names the floor it comes down on and the height from it (PROTOCOL 28).
    const rec = archeryMod.launchRecord(hit, 0);
    assert(netMod.PROTOCOL >= 28 && !rec.l && rec.z0 === hit.z0 && archeryMod.launchRecord(up, 0).l === 1, `the records: ${JSON.stringify(rec)}`);
    // The review of #602. A low throw up from under the slab meets its floor from below and comes down under it, never on top.
    stand(x + 13, y + 9.4, 0);
    const knifeUp = fly([x + 13, y + 7.5], 1, { arcMin: 6, arcMax: 20, range: 9, projectile: "throwing_knife", item: { id: "throwing_knife", count: 1, uid: "e-tk" } });
    assert(knifeUp.stopWhy === "floor" && knifeUp.stopLayer === 0, `a knife thrown up from under the slab: ${knifeUp.stopWhy} on ${knifeUp.stopLayer}`);
    // A half draw up at the slab that falls short comes down on the ground where it lands, and hits there.
    const short = zombie(x + 13, y + 16 - 7 * (1 - (1 - 0.31) ** 2), 0); // where a 0.31 draw of 7 tiles lands, under the slab's south edge
    stand(x + 13, y + 16, 0);
    const hpShort = short.hp;
    const half = archeryMod.shoot(me, [0, -1], 7, 0.31, { layer: 1 });
    for (let i = 0; i < 900 && !half.done; i++) archeryMod.update(STEP);
    assert(half.layer === 0 && short.hp < hpShort, `a short shot up: landing layer ${half.layer}, s ${half.s.toFixed(2)}, hp ${hpShort} to ${short.hp}`);
    // A spear on the ground crosses a hole in the ground (a cellar's stairwell) as it always did: no edge there.
    { const t = mapMod.growTile(x + 6, y + 13, 0); t.floor = "hole"; }
    stand(x + 6, y + 16, 0);
    const spear0 = fly([x + 6, y + 10], 0, { projectile: "spear", item: { id: "spear", count: 1, uid: "e-spear0" } });
    { const t = mapMod.growTile(x + 6, y + 13, 0); t.floor = "floor_grass"; }
    assert(spear0.stopWhy !== "edge", `a spear on the ground stopped at a hole: ${spear0.stopWhy}`);
    // A poison splash on the walk never reaches the dead on the ground under it, and the host's end record says where a stopped flight came down.
    const underWalk = zombie(x + 4, y + 0.6, 0);
    stand(x + 4, y + 1.2, 1);
    const vial = archeryMod.shoot(me, [0, -1], 0.6, 1, { layer: 1, projectile: "poison", item: { id: "poison", count: 1, uid: "e-poison" } });
    for (let i = 0; i < 900 && !vial.done; i++) archeryMod.update(STEP);
    assert(!underWalk.poison, `the splash on the walk poisoned one on the ground under it: ${JSON.stringify(underWalk.poison)}`);
    assert(archeryMod.endRecord(low).length === 5 && archeryMod.endRecord(low)[4] === 1 && archeryMod.endRecord(hit).length === 4, `the end records: ${JSON.stringify([archeryMod.endRecord(low), archeryMod.endRecord(hit)])}`);
    // Melee on a storey: one of the dead 0.8 tiles off on the same storey, aimed at as it is drawn, is in the swing's wedge every way round.
    stand(x + 2, y + 0.5, 1);
    const sword = { range: 1.4, arc: 90 };
    let wedgeMiss = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const target = { gx: me.gx + Math.cos(a) * 0.8, gy: me.gy + Math.sin(a) * 0.8, layer: 1, rise: 0 };
      const pt = isoForRows.toScreen(target.gx, target.gy);
      const o = playerMod.aimOrigin(me);
      me.aim = { sx: pt.x - o.x, sy: pt.y - 96 - 24 - o.y };
      if (!combatMod.inWedge(me, sword, target)) wedgeMiss++;
    }
    assert(wedgeMiss === 0, `${wedgeMiss} of 8 directions miss one of the dead on the same storey aimed at as drawn`);
    return "down from a battlement and a window, the parapet, the spear's edge, up onto a slab, a fall from the air and from a floor taken up; the review's: a low throw up meets the floor from below, a short shot up lands below, a spear crosses a hole on the ground, a splash keeps to its floor, melee on a storey";
  } finally {
    archeryMod.reset();
    for (const z of dead) { const i = S.zombies.indexOf(z); if (i >= 0) S.zombies.splice(i, 1); }
    for (const [tx, ty, L] of [[x + 4, y + 8, 0], [x + 1, y, 1], [x + 1, y + 1, 1], [x + 3, y + 1, 1], [x + 16, y + 2, 0], [x + 16, y + 5, 0], [x + 1, y + 3, 0], [x + 8, y + 1, 0]]) { const t = mapMod.peekTile(tx, ty, L); if (t && t.items) t.items.length = 0; }
    for (const [tx, ty, e, L] of walls.reverse()) { try { mapMod.destroyWall(tx, ty, e, false, L); } catch { /* gone */ } }
    for (const [a, b, L] of floors) { const t = mapMod.peekTile(a, b, L); if (t) { if (t.items) t.items.length = 0; delete t.built; t.floor = L ? "void" : t.floor; mapMod.touch(a, b, L); } }
    me.gx = was.gx; me.gy = was.gy; me.layer = was.layer; me.rise = was.rise;
    rulesImport.rules.zombieAggro = was.aggro;
  }
});

// docs/53 step 5: the dead upstairs. Built on pieces of its own (step 0), each of the dead stepped alone with the one player.
check("height, step 5: the dead upstairs: the stair taken is the one whose far side reaches the goal; an upstairs door is battered from its own floor, never from the ground under it; one that sees a player it cannot reach goes for the door of the room under him; a blow and a bite across a stair's top and no further", () => {
  const at = clearGround();
  assert(at, "no clear ground");
  const [x, y] = at;
  const S = gameMod.state;
  const me = S.player;
  const DT = 1 / 60;
  const floors = [];
  const walls = [];
  const stairs = [];
  const was = { gx: me.gx, gy: me.gy, layer: me.layer, rise: me.rise, health: me.health, aggro: rulesImport.rules.zombieAggro };
  const floor = (a, b, L) => { const t = mapMod.growTile(a, b, L); t.floor = "floor_stone"; mapMod.touch(a, b, L); floors.push([a, b, L]); };
  const wall = (tx, ty, edge, L, kind = "wall") => { assert(mapMod.buildWall(tx, ty, edge, kind, "wall_stone", null, L), `a ${kind} at ${tx},${ty} ${edge} on ${L}`); walls.push([tx, ty, edge, L]); return mapMod.peekTile(tx, ty, L)[edge]; };
  const stair = (x0, y0) => { assert(!mapMod.stairBuildProblem(x0, y0, "w", 0, "wood"), `a stair at ${x0},${y0}: ${mapMod.stairBuildProblem(x0, y0, "w", 0, "wood")}`); const s = mapMod.buildStair(x0, y0, "w", "wood", 0, { free: true }); assert(s, `no stair at ${x0},${y0}`); stairs.push(s); return s; };
  const box = (x0, y0, L, door) => { // a 3 by 3 room on L, its door on the east wall's middle
    for (let i = 0; i < 3; i++) { wall(x0 + i, y0, "n", L); wall(x0 + i, y0 + 3, "n", L); }
    for (let j = 0; j < 3; j++) { wall(x0, y0 + j, "w", L); wall(x0 + 3, y0 + j, "w", L, door && j === 1 ? "door" : "wall"); }
    return mapMod.peekTile(x0 + 3, y0 + 1, L).w;
  };
  const zombie = (gx, gy, layer) => { const z = zombieMod.createZombie(gx, gy, { hp: 1000 }); z.layer = layer; z.rise = 0; z.sightTimer = 0; z.idleTimer = 1e9; return z; };
  const hunt = (z, n, each = null) => { for (let i = 0; i < n; i++) { zombieMod.updateZombie(z, DT, [me], [z]); if (each && each(z) === false) break; } };
  const stand = (gx, gy, layer) => { me.gx = gx; me.gy = gy; me.layer = layer; me.rise = 0; me.health = was.health; };
  const cleared = [];
  const bare = (x0, y0, x1, y1) => { // the valley's trees and rocks off the fixture's ground, put back after
    for (let b = y0; b <= y1; b++) for (let a = x0; a <= x1; a++) { const t = mapMod.peekTile(a, b, 0); if (t && t.prop && !cleared.some((c) => c[0] === t.prop)) { const pr = t.prop; cleared.push([pr, pr.tile[0], pr.tile[1]]); mapMod.removeProp(pr); } }
  };
  try {
    rulesImport.rules.zombieAggro = true;
    // 1. Two stairs, both climbing west to layer 1: the near one's landing on a slab that reaches nothing, the far one's on a walk to the goal.
    const near = stair(x + 4, y);
    const far = stair(x + 4, y + 12);
    floor(near.landing[0], near.landing[1], 1);
    floor(near.landing[0] - 1, near.landing[1], 1);
    const [fx, fy] = far.landing;
    for (let i = 0; i <= 4; i++) floor(fx - i, fy, 1); // to the upstairs room's door (below)
    for (let j = 1; j <= 3; j++) floor(fx - 3, fy - j, 1);
    const goal = mapMod.addr(fx - 3, fy - 3, 1);
    const walker = zombie(x + 9, y + 2, 0);
    const route = movementMod.stairRoute(walker, goal);
    assert(route && route.s === far, `the stair taken toward the walk: ${route ? (route.s === near ? "the near one, whose landing reaches nothing" : "another") : "none"}`);
    assert(movementMod.canReach(walker, goal), "the walk counts as out of reach by its stair");
    assert(!movementMod.canReach(walker, mapMod.addr(fx + 30, fy - 30, 1)), "a tile on layer 1 no stair reaches counts as reachable");
    // One standing on the ground right under where it last saw the player (the pane's case, 2026-10-30) climbs to it, never taking itself
    // to be at the sighting and searching the ground.
    const under0 = zombie(fx - 3, fy - 3, 0);
    under0.aggro = true;
    under0.lastSeen = goal.slice();
    under0.state = "chase";
    let searched = false;
    hunt(under0, 900, (z) => { if (z.state === "search" && (z.layer || 0) === 0) searched = true; return (z.layer || 0) === 0; });
    assert(!searched && under0.layer === 1, `the one under the sighting: searched the ground ${searched}, on layer ${under0.layer}, state ${under0.state}`);
    // 2. An upstairs room on the far walk's floor, its door on the walk, a ground room under it with a door of its own. One on the walk
    // batters the upstairs door; one on the ground goes up the stair to it, and never strikes it, or the ground room's door, from below.
    const rx = fx - 7;
    const ry = fy - 1;
    bare(rx - 2, ry - 2, fx + 2, fy + 4); // the valley's trees and rocks off the rooms, their doors' outsides, and the way round
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) floor(rx + i, ry + j, 1);
    const upDoor = box(rx, ry, 1, true);
    const downDoor = box(rx, ry, 0, true);
    const upRoom = mapMod.tileAt(rx + 1, ry + 1, 1).room;
    const downRoom = mapMod.tileAt(rx + 1, ry + 1, 0).room;
    assert(upRoom > 0 && downRoom > 0 && upRoom !== downRoom, `the rooms: upstairs ${upRoom}, under it ${downRoom}`);
    stand(rx + 1, ry + 1, 1);
    const upstairs = zombie(fx - 1, fy, 1);
    upstairs.aggro = true;
    upstairs.lastSeen = mapMod.addr(rx + 1, ry + 1, 1);
    upstairs.state = "chase";
    const upHp = upDoor.hp;
    const downHp = downDoor.hp;
    hunt(upstairs, 900, (z) => upDoor.hp === upHp);
    assert(upDoor.hp < upHp, `the one on the walk never struck the upstairs door (its state ${upstairs.state}, breach ${JSON.stringify(upstairs.breach && upstairs.breach.stand)})`);
    assert(downDoor.hp === downHp, "the one on the walk struck the ground room's door");
    upDoor.hp = upHp;
    const ground = zombie(x + 10, fy + 2, 0);
    ground.aggro = true;
    ground.lastSeen = mapMod.addr(rx + 1, ry + 1, 1);
    ground.state = "chase";
    let fromBelow = 0;
    let climbed = false;
    hunt(ground, 2400, (z) => {
      if ((z.layer || 0) === 1) climbed = true;
      if ((z.state === "breach" || z.state === "breachHit") && z.breach && mapMod.layerOf(z.breach.stand) === 1 && (z.layer || 0) === 0 && Math.hypot(z.gx - (rx + 3), z.gy - (ry + 1)) < 2) fromBelow++;
      return upDoor.hp === upHp;
    });
    assert(downDoor.hp === downHp, `the one from the ground struck the ground room's door under the player (${downDoor.hp} of ${downHp})`);
    assert(!fromBelow, `the one from the ground stood under the upstairs door to strike it ${fromBelow} steps`);
    assert(climbed && upDoor.hp < upHp, `the one from the ground never went up and struck the upstairs door (climbed ${climbed}, state ${ground.state}, at ${ground.gx.toFixed(1)},${ground.gy.toFixed(1)} on ${ground.layer})`);
    // The review of #606: one standing right under the upstairs door (outside the ground room's door below it) never strikes it from the
    // ground, chasing or in a siege; it goes round by the stair. Each is followed until it is up.
    const strikesFromBelow = (z, n) => {
      let hp = upDoor.hp;
      let below = 0;
      hunt(z, n, (q) => {
        if (upDoor.hp < hp && (q.layer || 0) === 0) below++;
        hp = upDoor.hp;
        return (q.layer || 0) === 0;
      });
      upDoor.hp = upHp;
      return below;
    };
    const underDoor0 = zombie(rx + 3.2, ry + 1, 0);
    underDoor0.aggro = true;
    underDoor0.lastSeen = mapMod.addr(rx + 1, ry + 1, 1);
    underDoor0.state = "chase";
    const chaseBelow = strikesFromBelow(underDoor0, 1500);
    const sieger = zombie(rx + 3.2, ry + 1, 0);
    sieger.aggro = true;
    sieger.lastSeen = mapMod.addr(rx + 1, ry + 1, 1);
    sieger.siege = { at: mapMod.addr(rx + 1, ry + 1, 1), openings: [{ tx: rx + 3, ty: ry + 1, edge: "w", layer: 1 }], dawn: clock.getElapsed() + 1e6, idx: 0, switchAt: clock.getElapsed() + 1e6, pid: me.id };
    sieger.state = "siege";
    sieger.sightTimer = 1e9; // it holds the siege without a fresh sighting
    const siegeBelow = strikesFromBelow(sieger, 1500);
    assert(!chaseBelow && !siegeBelow && downDoor.hp === downHp, `the upstairs door struck from the ground: ${chaseBelow} strikes chasing, ${siegeBelow} in a siege; the ground door ${downDoor.hp} of ${downHp}`);
    assert(underDoor0.layer === 1 && sieger.layer === 1, `under the door, they did not go up by the stair: the chaser on ${underDoor0.layer}, the sieger on ${sieger.layer} (${sieger.state})`);
    // Shut in the ground room with the player on the open walk (no room under him): it breaks out by its door, toward a stair outside.
    stand(fx - 2, fy, 1);
    const shut = zombie(rx + 1, ry + 1, 0);
    shut.aggro = true;
    shut.lastSeen = mapMod.addr(fx - 2, fy, 1);
    shut.state = "chase";
    hunt(shut, 2400, (z) => downDoor.hp === downHp);
    assert(downDoor.hp < downHp, `shut in the ground room with the player on the walk, it never broke out (its state ${shut.state}, the door ${downDoor.hp})`);
    stand(rx + 1, ry + 1, 1);
    // A crowd of twenty on the ground hunting the player in the upstairs room, within the step's budget (the door held shut meanwhile).
    upDoor.hp = 1e6;
    const crowd = [];
    for (let i = 0; i < 20; i++) { const z = zombie(x + 10 + (i % 5), fy + 2 + Math.floor(i / 5), 0); z.aggro = true; z.lastSeen = mapMod.addr(rx + 1, ry + 1, 1); z.state = "chase"; crowd.push(z); }
    const t0 = performance.now();
    for (let k = 0; k < 900; k++) for (const z of crowd) zombieMod.updateZombie(z, DT, [me], crowd);
    const crowdMs = (performance.now() - t0) / 900;
    const up = crowd.filter((z) => (z.layer || 0) === 1).length;
    upDoor.hp = upHp;
    assert(crowdMs < 4, `twenty of the dead hunting across storeys took ${crowdMs.toFixed(2)} ms a step`);
    assert(up > 0, "none of the crowd went up the stair in fifteen seconds");
    // 3. A slab with no stair over a ground room: one on the ground that sees the player at its edge goes for the door of the room under him.
    const sx = x - 5;
    const sy = y + 4;
    bare(sx - 1, sy - 1, sx + 9, sy + 3);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) floor(sx + i, sy + j, 1);
    const underDoor = box(sx, sy, 0, true);
    const under = mapMod.tileAt(sx + 1, sy + 1, 0).room;
    stand(sx + 2.3, sy + 1, 1);
    const watcher = zombie(sx + 8, sy + 1, 0);
    assert(zombieMod.sees(watcher, me), "the one on the ground does not see the player at the slab's edge");
    const underHp = underDoor.hp;
    let wanted = null;
    hunt(watcher, 1200, (z) => { if (z.breach) wanted = z.breach.want; return underDoor.hp === underHp; });
    assert(wanted === under && underDoor.hp < underHp, `the one that sees the player on the slab went for ${wanted} (the room under him is ${under}), the door's hp ${underDoor.hp} of ${underHp}, its state ${watcher.state} (sees ${watcher.seesNow}, failed ${watcher.pathFailed}, noWay ${watcher.noWay.toFixed(1)}, path ${watcher.path.length}, at ${watcher.gx.toFixed(1)},${watcher.gy.toFixed(1)} on ${watcher.layer}, from ${sx + 8},${sy + 1})`);
    // 4. Across a stair's top: the one on the top step and the player on the landing reach each other; from the stair's foot, no.
    const [lx, ly] = near.landing;
    stand(lx, ly, 1);
    const top = near.tiles[near.tiles.length - 1];
    const climber = zombie(top[0] + 0.3, top[1], 0);
    mapMod.stairStep(climber);
    const low = zombie(near.tiles[0][0], near.tiles[0][1], 0);
    mapMod.stairStep(low);
    assert(climber.layer === 0 && climber.rise > 48, `the climber's place: layer ${climber.layer}, rise ${climber.rise}`);
    assert(visibilityMod.reachLayer(climber, me) === 1 && zombieMod.biteReach(climber, me) > 0, "the one on the top step cannot bite the player on the landing");
    assert(visibilityMod.reachLayer(low, me) === null && zombieMod.biteReach(low, me) < 0, "the one at the stair's foot can bite the player on the landing");
    assert(visibilityMod.reachLayer(zombie(lx + 6, ly + 6, 0), me) === null, "one on the ground away from any stair reaches the landing");
    // The review of #606: the top step and its own landing alone, never a tile beside the well, nor from the middle of the stair.
    assert(visibilityMod.reachLayer(climber, { gx: lx, gy: ly + 0.6, layer: 1, rise: 0 }) === null, "the one on the top step reaches a tile beside the landing");
    const middle = zombie(near.tiles[1][0], near.tiles[1][1], 0);
    middle.rise = 64;
    assert(visibilityMod.reachLayer(middle, { gx: near.tiles[1][0], gy: near.tiles[1][1] + 0.6, layer: 1, rise: 0 }) === null, "one mid-stair reaches a body on the floor beside the well");
    return `the far stair chosen by its walk; the upstairs door battered from the walk and by one that climbed to it, the ground room's never; the room under a player on a stairless slab broken into (${under}); a bite across the stair's top at rise ${climber.rise}, none from its foot; twenty hunting upstairs in ${crowdMs.toFixed(2)} ms a step, ${up} up in fifteen seconds`;
  } finally {
    me.gx = was.gx; me.gy = was.gy; me.layer = was.layer; me.rise = was.rise; me.health = was.health;
    rulesImport.rules.zombieAggro = was.aggro;
    for (const [tx, ty, e, L] of walls.reverse()) { try { mapMod.destroyWall(tx, ty, e, false, L); } catch { /* gone */ } }
    for (const [a, b, L] of floors) { const t = mapMod.peekTile(a, b, L); if (t) { delete t.built; t.floor = L ? "void" : t.floor; mapMod.touch(a, b, L); } }
    for (const s of stairs) { try { mapMod.removeStair ? mapMod.removeStair(s) : null; } catch { /* gone */ } }
    for (const [pr, tx, ty] of cleared) { try { mapMod.placeProp(pr, tx, ty, 0); } catch { /* gone */ } }
  }
});

// docs/53 step 4, the review of #605: the fire's particles keep their floor. A body burning on a storey sheds its embers and smoke there, at
// its rise; a spark and a burst of splinters name theirs; a guest's `fx` carries a height above the ground and gets the floor back from it.
const fireParticles = await import("../src/fire.js");
check("height, step 4: a burning body's embers and smoke, a spark, and splinters keep their floor and rise; a guest's fx height gives the floor back", () => {
  const fire = fireParticles;
  const body = { gx: 3, gy: 4, layer: 2, rise: 40, burning: true };
  for (let i = 0; i < 400; i++) fire.update(1 / 60, [body]);
  body.burning = false;
  const shed = fire.all().filter((p) => p.kind === "ember" || p.kind === "smoke");
  assert(shed.length > 0, "no embers or smoke in seven seconds of burning");
  assert(shed.every((p) => p.layer === 2 && p.rise === 40), `embers or smoke off the body's floor: ${JSON.stringify(shed.slice(0, 2).map((p) => [p.kind, p.layer, p.rise]))}`);
  fire.spark(1, 1, 22, 3, 1);
  fire.splinters(2, 2, 12, 3, -1);
  const sp = fire.all().filter((p) => p.kind === "spark" || p.kind === "splinter" || (p.kind === "smoke" && p.gx === 2));
  assert(sp.length && sp.every((p) => p.layer === (p.kind === "spark" ? 1 : -1)), `a spark's or a burst's floor: ${JSON.stringify(sp.slice(0, 3).map((p) => [p.kind, p.layer]))}`);
  const back = [fire.fromHeight(22), fire.fromHeight(96 + 22), fire.fromHeight(3 * 96 + 12), fire.fromHeight(-96 + 12)];
  assert(JSON.stringify(back) === "[[0,22],[1,22],[3,12],[-1,12]]", `the heights back: ${JSON.stringify(back)}`);
  assert(netMod.PROTOCOL >= 29, `PROTOCOL ${netMod.PROTOCOL}`);
  for (let i = 0; i < 200; i++) fire.update(1 / 60, []);
  return `${shed.length} embers and puffs on floor 2 at rise 40; a spark on 1, a burst in a cellar; heights 22, 118, 300, -84 back to their floors`;
});

// docs/53 step 6: building's rules. Built on pieces of its own (step 0), through the commands a guest sends (placement.performPlacement).
const roundForRows = await import("../src/round.js");
const battlementsForRows = await import("../src/battlements.js");
const reachForRows = await import("../src/reach.js");
const rugsForRows = await import("../src/rugs.js");
check("height, step 6: building's rules: a rug, a painting, a torch, a set-down, the campfire, and a palette prop upstairs on the player's floor (a torch lights its storey); a shut gate stops a hand and comes apart only in Free building, and breaks; a wall out of sight refused in the bar's words; the ramp and the cliff pieces never on a built floor; a round tower holds its stair; a stair taken up with nobody above and refused with someone, a guest's copy dropping it; the storey cap; the arrow loops spread evenly", () => {
  const at = clearGround();
  assert(at, "no clear ground");
  const [x, y] = at;
  const S = gameMod.state;
  const me = S.player;
  const was = { gx: me.gx, gy: me.gy, layer: me.layer, rise: me.rise, free: rulesImport.rules.freeBuilding };
  const said = [];
  promptImport.setMessageSink((t) => (said.push(t), true));
  const floors = [];
  const walls = [];
  const stairs = [];
  const props = [];
  const dead = [];
  const cleared = [];
  const bag = inventoryMod.bagOf(me);
  const given = [];
  const bare = (x0, y0, x1, y1) => {
    for (let b = y0; b <= y1; b++) for (let a = x0; a <= x1; a++) { const t = mapMod.peekTile(a, b, 0); if (t && t.prop && !cleared.some((c) => c[0] === t.prop)) { const pr = t.prop; cleared.push([pr, pr.tile[0], pr.tile[1]]); mapMod.removeProp(pr); } }
  };
  const floor = (a, b, L, id = "floor_stone") => { const t = mapMod.growTile(a, b, L); t.built = { under: t.floor, free: true }; t.floor = id; mapMod.touch(a, b, L); floors.push([a, b, L]); }; // a floor a player laid
  const wall = (tx, ty, edge, L, kind = "wall", sprite = "wall_stone") => { assert(mapMod.buildWall(tx, ty, edge, kind, sprite, null, L), `a ${sprite} at ${tx},${ty} ${edge} on ${L}`); walls.push([tx, ty, edge, L]); return mapMod.peekTile(tx, ty, L)[edge]; };
  const stand = (gx, gy, L) => { me.gx = gx; me.gy = gy; me.layer = L; me.rise = 0; };
  const give = (id, extra = {}) => { const e = itemsMod.makeEntry(id, 1); Object.assign(e, extra); assert(gridMod.insert(bag, e), `no room in the bag for ${id}`); given.push(e); return e; };
  const send = (cmd) => { said.length = 0; placementImport.performPlacement(me, cmd); return said[said.length - 1] || ""; };
  const lastProp = (tx, ty, L) => { const p = mapMod.peekTile(tx, ty, L)?.prop; if (p && !props.includes(p)) props.push(p); return p; };
  try {
    rulesImport.rules.freeBuilding = true;
    bare(x - 7, y - 7, x + 21, y + 17);
    // ---- An upstairs room, six by six, stone walls round it on layer 1; a short open walk beside it.
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) floor(x + i, y + j, 1);
    for (let i = 0; i < 6; i++) { wall(x + i, y, "n", 1); wall(x + i, y + 6, "n", 1); }
    for (let j = 0; j < 6; j++) { wall(x, y + j, "w", 1); wall(x + 6, y + j, "w", 1); }
    for (let i = 8; i <= 10; i++) floor(x + i, y + 1, 1);
    mapMod.roomsIfDirty();
    assert(mapMod.tileAt(x + 2, y + 2, 1).room > 0 && !(mapMod.tileAt(x + 9, y + 1, 1).room > 0), "the room upstairs and the walk beside it");
    stand(x + 2, y + 2, 1);
    const rug = give("rug_bearskin");
    let why = send({ kind: "rug", uid: rug.uid, tx: x + 1, ty: y + 1, facing: rugsForRows.facingsOf(rugsForRows.rugDef("rug_bearskin").rug)[0] });
    const laid = mapMod.peekTile(x + 1, y + 1, 1)?.rug;
    assert(laid && (laid.layer || 0) === 1 && !mapMod.peekTile(x + 1, y + 1, 0)?.rug, `a rug upstairs: ${why || "not laid"}`);
    props.push(laid);
    const pic = give("painting_small_oak");
    why = send({ kind: "painting", uid: pic.uid, tx: x + 1, ty: y, edge: "n" });
    assert((mapMod.peekTile(x + 1, y, 1).n.hangings || []).some((h) => h.item === "painting_small_oak"), `a painting on an upstairs wall: ${why || "not hung"}`);
    mapMod.roomsIfDirty();
    lightMod.update(); // the step's own gathering of the light's sources
    const lightBefore = lightMod.lightAt(x + 3, y + 1, 1);
    const groundBefore = lightMod.lightAt(x + 3, y + 1, 0);
    const main0 = me.hands.main;
    const torch = itemsMod.makeEntry("torch", 1);
    torch.lit = true;
    me.hands.main = torch; // a lit torch in the hand (a torch in the bag is never lit)
    why = send({ kind: "torch", uid: torch.uid, tx: x + 3, ty: y, edge: "n" });
    const bracket = mapMod.peekTile(x + 3, y, 1).n.bracket;
    if (me.hands.main === torch) me.hands.main = main0;
    assert(bracket, `a torch on an upstairs wall: ${why || "not mounted"}`);
    lightMod.update();
    const lightAfter = lightMod.lightAt(x + 3, y + 1, 1);
    assert(lightAfter > lightBefore + 0.05 && Math.abs(lightMod.lightAt(x + 3, y + 1, 0) - groundBefore) < 0.05, `the torch lights its own storey and not the ground under it: upstairs ${lightBefore.toFixed(2)} to ${lightAfter.toFixed(2)}, the ground ${groundBefore.toFixed(2)} to ${lightMod.lightAt(x + 3, y + 1, 0).toFixed(2)}`);
    me.hands.main = main0;
    const pumpkin = give("decorative_pumpkin");
    why = send({ kind: "setdown", uid: pumpkin.uid, tx: x + 4, ty: y + 1 });
    assert(lastProp(x + 4, y + 1, 1), `a set-down upstairs: ${why || "not set down"}`);
    why = send({ kind: "build", what: "fire_pit", tx: x + 3, ty: y + 3 });
    const pit = lastProp(x + 3, y + 3, 1);
    assert(pit && (pit.layer || 0) === 1, `the fire pit from the palette upstairs: ${why || "not built"}`);
    stand(x + 8, y + 1, 1);
    const fire = give("campfire");
    why = send({ kind: "campfire", uid: fire.uid, tx: x + 9, ty: y + 1 });
    assert(lastProp(x + 9, y + 1, 1), `the campfire on an open walk upstairs: ${why || "not set down"}`);
    // ---- The landforms never on a built floor.
    stand(x + 2, y + 2, 1);
    why = send({ kind: "build", what: "stair_ramp_stone", tx: x + 4, ty: y + 4, dir: "w" });
    assert(why === "Hills stand on dirt, grass, or hills" && !mapMod.stairAt(x + 4, y + 4, 1), `a ramp on a storey: "${why}"`);
    why = send({ kind: "build", what: "wall_cliff", tx: x + 2, ty: y + 5, edge: "n" });
    assert(why === "Hills stand on dirt, grass, or hills" && !mapMod.peekTile(x + 2, y + 5, 1).n, `a cliff wall on a storey: "${why}"`);
    why = send({ kind: "build", what: "floor_cliff_top", tx: x + 5, ty: y + 5, tx2: x + 5, ty2: y + 5 });
    assert(why === "Hills stand on dirt, grass, or hills" && mapMod.peekTile(x + 5, y + 5, 1).floor === "floor_stone", `a cliff top over a storey's floor: "${why}"`);
    // ---- A castle gate: a hand stops at its shut bars, it comes apart only in Free building, and the dead break it whole.
    wall(x + 12, y + 10, "n", 0);
    wall(x + 13, y + 10, "n", 0);
    assert(mapMod.buildGate(x + 12, y + 10, "n", "wall_stone_gate_2", 0, { free: true }), "no gate");
    stand(x + 12.5, y + 11.2, 0);
    assert(reachForRows.reachProblem(me, [[x + 12, y + 9]], 2.6) === reachForRows.WALL_IN_THE_WAY, "a hand reaches through a shut gate's bars");
    const gw = mapMod.peekTile(x + 12, y + 10, 0).n;
    rulesImport.rules.freeBuilding = false;
    why = placementImport.takeApartProblem(me, { type: "wall", tx: x + 12, ty: y + 10, edge: "n", wall: gw, layer: 0 });
    rulesImport.rules.freeBuilding = true;
    assert(why === "Gates come apart only in Free building", `a gate taken apart without Free building: "${why}"`);
    assert(mapMod.needsBreaking(gw) && gw.hp === 300, `a shut gate is not breakable at 300: ${gw.hp}`);
    // ---- A wall out of sight: refused up front in the bar's words, nothing built.
    for (let i = 10; i <= 14; i++) wall(x + i, y + 14, "n", 0);
    stand(x + 12.5, y + 12.5, 0);
    why = send({ kind: "build", what: "wall", tx: x + 12, ty: y + 16, edge: "n" });
    assert(why === reachForRows.WALL_IN_THE_WAY && !mapMod.peekTile(x + 12, y + 16, 0).n, `a wall behind a wall: "${why}"`);
    // ---- A round tower holds its own stair: the stair, the floor round its stairwell, then the ring, in that order.
    const rx = x + 12;
    const ry = y - 6;
    const st = mapMod.buildStair(rx + 4, ry + 3, "w", "wood", 0, { free: true });
    assert(st, `no stair for the tower: ${mapMod.stairBuildProblem(rx + 4, ry + 3, "w", 0, "wood")}`);
    stairs.push(st);
    const shape = roundForRows.shape(rx, ry, 7);
    const well = new Set(st.tiles.map(([a, b]) => `${a},${b}`));
    let more = true;
    while (more) {
      more = false;
      for (const [a, b] of shape.stepped) {
        if (well.has(`${a},${b}`) || (mapMod.peekTile(a, b, 1) && mapMod.peekTile(a, b, 1).floor !== "void")) continue;
        if (mapMod.buildFloor(a, b, "floor_stone", 1, { free: true })) { floors.push([a, b, 1]); more = true; }
      }
    }
    const ringWhy = mapMod.ringProblem(rx, ry, 7, 1);
    assert(!ringWhy, `the ring over its stair refused: "${ringWhy}"`);
    const ring = mapMod.buildRing(rx, ry, 7, "wall_stone", 1, { built: true, free: true });
    assert(ring, "the ring over its stair was not built");
    const climber = { gx: st.before[0], gy: st.before[1], layer: 0, rise: 0 };
    assert(movementMod.canReach(climber, mapMod.addr(rx + 3, ry + 1, 1)), "the tower's top is not reached by its own stair");
    // ---- A stair comes up with nobody above, and not with someone there; a guest's copy drops it with its chunk.
    floor(x + 1, y + 12, 1); // its landing a floor a player laid first: it stays when the stair goes
    const s2 = mapMod.buildStair(x + 4, y + 12, "w", "wood", 0, { free: true });
    assert(s2, `no stair to take up: ${mapMod.stairBuildProblem(x + 4, y + 12, "w", 0, "wood")}`);
    stairs.push(s2);
    for (let j = -1; j <= 1; j++) for (let i = 0; i <= 1; i++) if (i || j) floor(s2.landing[0] - i, s2.landing[1] + j, 1);
    assert(mapMod.floorTakeUpProblem(s2.landing[0], s2.landing[1], 1) === "It is a stair's landing: take the stair apart", `the landing's take-apart words: "${mapMod.floorTakeUpProblem(s2.landing[0], s2.landing[1], 1)}"`);
    const up = zombieMod.createZombie(s2.landing[0] - 1, s2.landing[1], { hp: 1000 });
    up.layer = 1;
    S.zombies.push(up);
    dead.push(up);
    stand(x + 5.5, y + 12.5, 0);
    const t2 = { type: "stair", s: s2, tx: s2.at[0], ty: s2.at[1], layer: 0 };
    why = placementImport.takeApartProblem(me, t2);
    assert(why === "Someone up there would have no way down", `a stair taken up with one of the dead above: "${why}"`);
    S.zombies.splice(S.zombies.indexOf(up), 1);
    const [ccx, ccy] = mapMod.chunkCoord(s2.tiles[0][0], s2.tiles[0][1]);
    const rec0 = JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(ccx, ccy, false, 0))));
    why = send({ kind: "remove", target: { type: "stair", tx: s2.at[0], ty: s2.at[1] } });
    assert(!mapMod.stairAt(s2.tiles[0][0], s2.tiles[0][1], 0) && mapMod.peekTile(s2.landing[0], s2.landing[1], 1).floor === "floor_stone" && s2.tiles.every(([a, b]) => mapMod.peekTile(a, b, 1)?.floor === "void" || !mapMod.peekTile(a, b, 1)), `the stair not taken up with nobody above (its laid landing kept): ${why}`);
    const rec1 = JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(ccx, ccy, false, 0))));
    mapMod.installChunk(rec0);
    const back = !!mapMod.stairAt(s2.tiles[0][0], s2.tiles[0][1], 0);
    mapMod.installChunk(rec1);
    assert(back && !mapMod.stairAt(s2.tiles[0][0], s2.tiles[0][1], 0), `a guest's copy: the stair back with the old record ${back}, gone with the new one ${!mapMod.stairAt(s2.tiles[0][0], s2.tiles[0][1], 0)}`);
    // ---- The review of #607. A stair whose upper side is a room behind a shut door: one of the dead in that room keeps it standing.
    const s3 = mapMod.buildStair(x + 16, y + 12, "w", "wood", 0, { free: true });
    assert(s3, `no third stair: ${mapMod.stairBuildProblem(x + 16, y + 12, "w", 0, "wood")}`);
    stairs.push(s3);
    for (const a of [x + 11, x + 12]) floor(a, y + 12, 1);
    for (let j = 11; j <= 13; j++) for (const a of [x + 9, x + 10]) floor(a, y + j, 1);
    for (const a of [x + 9, x + 10]) { wall(a, y + 11, "n", 1); wall(a, y + 14, "n", 1); }
    for (let j = 11; j <= 13; j++) { wall(x + 9, y + j, "w", 1); wall(x + 11, y + j, "w", 1, j === 12 ? "door" : "wall"); }
    const inRoom = zombieMod.createZombie(x + 9.5, y + 12, { hp: 1000 });
    inRoom.layer = 1;
    S.zombies.push(inRoom);
    dead.push(inRoom);
    stand(x + 17.5, y + 12.5, 0);
    const t3 = { type: "stair", s: s3, tx: s3.at[0], ty: s3.at[1], layer: 0 };
    why = placementImport.takeApartProblem(me, t3);
    assert(why === "Someone up there would have no way down", `a stair with one of the dead behind a shut door upstairs: "${why}"`);
    S.zombies.splice(S.zombies.indexOf(inRoom), 1);
    // Its own landing's planks go back to the void, and what lay on them falls to the ground.
    mapMod.dropItem(s3.landing[0], s3.landing[1], itemsMod.makeEntry("stone", 1), 1);
    why = send({ kind: "remove", target: { type: "stair", tx: s3.at[0], ty: s3.at[1] } });
    assert(mapMod.peekTile(s3.landing[0], s3.landing[1], 1).floor === "void" && mapMod.itemsAt(s3.landing[0], s3.landing[1], 0).some((e) => e.id === "stone"), `the stair's own landing: ${mapMod.peekTile(s3.landing[0], s3.landing[1], 1).floor}, the stone on the ground ${mapMod.itemsAt(s3.landing[0], s3.landing[1], 0).length} (${why})`);
    for (const e of mapMod.itemsAt(s3.landing[0], s3.landing[1], 0)) mapMod.takeItem(s3.landing[0], s3.landing[1], e, 0);
    // A snare is set on the ground alone; a cliff top never over a storey's floor the map laid (not a player's).
    stand(x + 8.2, y + 1.2, 1);
    const snare = give("snare");
    why = send({ kind: "setdown", uid: snare.uid, tx: x + 10, ty: y + 1 });
    assert(why === "Rabbits keep to the ground" && !mapMod.peekTile(x + 10, y + 1, 1)?.prop, `a snare upstairs: "${why}"`);
    const ft = mapMod.growTile(x + 10, y + 3, 1);
    ft.floor = "floor_wood"; // as the map lays an upper floor: no `built`
    mapMod.touch(x + 10, y + 3, 1);
    floors.push([x + 10, y + 3, 1]);
    why = send({ kind: "build", what: "floor_cliff_top", tx: x + 10, ty: y + 3, tx2: x + 10, ty2: y + 3 });
    assert(why === "Hills stand on dirt, grass, or hills" && mapMod.peekTile(x + 10, y + 3, 1).floor === "floor_wood", `a cliff top over the map's upper floor: "${why}"`);
    // ---- The storey cap.
    assert(mapMod.floorBuildProblem(x, y, "floor_stone", 7) === "High enough" && mapMod.stairBuildProblem(x, y, "w", 6) === "High enough", "the storey cap");
    // ---- The arrow loops: one in every ten along a run.
    let off = 0;
    for (let ry2 = 0; ry2 < 40; ry2++) for (const edge of ["n", "w"]) {
      let n = 0;
      for (let i = 0; i < 40; i++) if (battlementsForRows.loopAt(edge === "n" ? 100 + i : ry2, edge === "n" ? ry2 : 100 + i, edge, 0.1)) n++;
      if (n !== 4) off++;
    }
    assert(off === 0, `${off} runs of forty without exactly four loops`);
    return "a rug, a painting, a lit torch (its storey lit, the ground not), a pumpkin, a fire pit, and a campfire upstairs by a guest's commands; a gate's bars stop a hand, Free building takes it apart, 300 to break; a wall behind a wall refused; the ramp, a cliff wall, and a cliff top refused on a built floor; a 7 by 7 tower over its own stair, climbed; a stair refused with one of the dead above, taken up with nobody, and dropped from a guest's copy with its chunk; the cap at 6; four loops in every run of forty";
  } finally {
    promptImport.setMessageSink(null);
    for (const z of dead) { const i = S.zombies.indexOf(z); if (i >= 0) S.zombies.splice(i, 1); }
    for (const p of props) { try { if (mapMod.propById(p.id)) mapMod.removeProp(p); } catch { /* gone */ } }
    for (const r of mapMod.allRings ? mapMod.allRings() : []) { if (r.layer === 1 && r.x0 === x + 12 && r.y0 === y - 6) try { mapMod.removeRing(r.id); } catch { /* gone */ } }
    try { if (mapMod.peekTile(x + 12, y + 10, 0)?.n?.gate) mapMod.removeGate(x + 12, y + 10, "n", 0); } catch { /* gone */ }
    for (const [tx, ty, e, L] of walls.reverse()) { try { if (mapMod.peekTile(tx, ty, L)?.[e]) mapMod.destroyWall(tx, ty, e, false, L); } catch { /* gone */ } }
    for (const s of stairs) { try { mapMod.removeStair(s); } catch { /* gone */ } }
    for (const [a, b, L] of floors) { const t = mapMod.peekTile(a, b, L); if (t) { if (t.items) t.items.length = 0; delete t.built; t.floor = L ? "void" : t.floor; mapMod.touch(a, b, L); } }
    for (const [pr, tx, ty] of cleared) { try { mapMod.placeProp(pr, tx, ty, 0); } catch { /* gone */ } }
    for (const e of given) { try { if (bag.items.includes(e)) gridMod.remove(bag, e); } catch { /* gone */ } }
    me.gx = was.gx; me.gy = was.gy; me.layer = was.layer; me.rise = was.rise;
    rulesImport.rules.freeBuilding = was.free;
  }
});

// docs/53 step 7: everyone by layer. A deer under a walk grazes on, a villager does not cower at the dead upstairs, a boar never bites across a floor.
const villagerForRows = await import("../src/entities/villager.js");
check("height, step 7: everyone by layer: a deer under a wall walk grazes on with a player on the walk over it and flees one on its own floor; a villager cowers at the dead on its floor and not at one a storey up; a boar's bite never crosses a floor", () => {
  const at = clearGround();
  assert(at, "no clear ground");
  const [x, y] = at;
  const S = gameMod.state;
  const me = S.player;
  const DT = 1 / 60;
  const was = { gx: me.gx, gy: me.gy, layer: me.layer, rise: me.rise, hp: me.hp };
  const floors = [];
  const floor = (a, b, L) => { const t = mapMod.growTile(a, b, L); t.floor = "floor_stone"; mapMod.touch(a, b, L); floors.push([a, b, L]); };
  try {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) floor(x + i, y + j, 1);
    // The deer: under the walk with the player a storey over it, it grazes on; the player on the ground beside it, it runs.
    const deer = animalMod.createAnimal("deer", x + 2, y + 1, { home: [x + 2, y + 1] });
    me.gx = x + 2.2; me.gy = y + 1.3; me.layer = 1; me.rise = 0;
    for (let i = 0; i < 120; i++) animalMod.updateAnimal(deer, DT, [deer], [me]);
    const grazing = deer.state;
    const deer2 = animalMod.createAnimal("deer", x + 10, y + 6, { home: [x + 10, y + 6] });
    me.gx = x + 11; me.gy = y + 6; me.layer = 0;
    for (let i = 0; i < 120; i++) animalMod.updateAnimal(deer2, DT, [deer2], [me]);
    assert(!/flee|run/.test(String(grazing)) && /flee|run|alert/.test(String(deer2.state)), `the deer: under the walk "${grazing}", beside a player on its floor "${deer2.state}"`);
    // A villager: one of the dead on the walk over it frightens it not; one beside it on its floor does.
    const v = villagerForRows.createVillager(x + 3, y + 1, { id: "v_step7" });
    const up = zombieMod.createZombie(x + 3.4, y + 1.2, { hp: 1000 });
    up.layer = 1;
    me.gx = x + 14; me.gy = y + 14; me.layer = 0;
    for (let i = 0; i < 60; i++) villagerForRows.updateVillager(v, DT, [up], [me]);
    const calm = v.state;
    const near = zombieMod.createZombie(x + 4, y + 1, { hp: 1000 });
    for (let i = 0; i < 60; i++) villagerForRows.updateVillager(v, DT, [near], [me]);
    assert(calm !== "cower" && calm !== "flee" && (v.state === "cower" || v.state === "flee"), `the villager: with the dead a storey up "${calm}", with one on its floor "${v.state}"`);
    // A boar's bite: an "animalBite" for a victim a floor away does nothing.
    const boar = animalMod.createAnimal("boar", x + 6, y + 1, { home: [x + 6, y + 1] });
    me.gx = x + 6.3; me.gy = y + 1; me.layer = 1; me.hp = 100;
    eventsMod.emit("animalBite", { animal: boar, victim: me, damage: 10 });
    const upHp = me.hp;
    // Struck from a floor up (a shot down from the walk), the boar winds up at no one and gives up (the review of #609).
    boar.state = "charge";
    boar.targetId = me.id;
    boar.calmAt = loopMod.simTime() + 30;
    let wound = false;
    for (let i = 0; i < 120; i++) { animalMod.updateAnimal(boar, DT, [boar], [me]); if (boar.windup > 0) wound = true; }
    assert(!wound && boar.targetId === null, `a boar under a player a floor up: wound up ${wound}, still after ${boar.targetId}`);
    me.layer = 0;
    eventsMod.emit("animalBite", { animal: boar, victim: me, damage: 10 });
    assert(upHp === 100 && me.hp < 100, `a boar's bite: a floor up ${upHp}, on its floor ${me.hp}`);
    return `a deer grazes on under a player on the walk ("${grazing}") and runs from one on its floor; a villager calm at the dead a storey up, cowering at one beside it; a boar's bite stops at a floor`;
  } finally {
    for (const [a, b, L] of floors) { const t = mapMod.peekTile(a, b, L); if (t) { t.floor = "void"; mapMod.touch(a, b, L); } }
    me.gx = was.gx; me.gy = was.gy; me.layer = was.layer; me.rise = was.rise; me.hp = was.hp;
  }
});

const ladderMod = await import("../src/entities/ladders.js");
// docs/53 step 6b: ladders. A tower of three storeys climbed by ladders, built and taken apart through the commands a guest sends.
check("height, step 6b: ladders: built by a guest's command, climbed up two storeys and down by E as a timed state (the walk ignored, the rise climbing), the dead at the tower's foot never coming up and breaking the door below; a ladder taken apart with nobody above and refused with someone; a guest's copy dropping it with its chunk", () => {
  const at = clearGround();
  assert(at, "no clear ground");
  const [x, y] = at;
  const S = gameMod.state;
  const me = S.player;
  const DT = 1 / 60;
  const was = { gx: me.gx, gy: me.gy, layer: me.layer, rise: me.rise, free: rulesImport.rules.freeBuilding, aggro: rulesImport.rules.zombieAggro };
  const said = [];
  promptImport.setMessageSink((t) => (said.push(t), true));
  const floors = [];
  const walls = [];
  const built = [];
  const dead = [];
  const floor = (a, b, L) => { const t = mapMod.growTile(a, b, L); t.built = { under: t.floor, free: true }; t.floor = "floor_wood"; mapMod.touch(a, b, L); floors.push([a, b, L]); };
  const wall = (tx, ty, edge, L, kind = "wall") => { assert(mapMod.buildWall(tx, ty, edge, kind, "wall_stone", null, L), `a ${kind} at ${tx},${ty} ${edge} on ${L}`); walls.push([tx, ty, edge, L]); return mapMod.peekTile(tx, ty, L)[edge]; };
  const stand = (gx, gy, L) => { me.gx = gx; me.gy = gy; me.layer = L; me.rise = 0; delete me.ladder; };
  const send = (cmd) => { said.length = 0; placementImport.performPlacement(me, cmd); return said[said.length - 1] || ""; };
  const steps = (n) => { for (let i = 0; i < n; i++) playerMod.updatePlayer(me, DT); };
  try {
    rulesImport.rules.freeBuilding = true;
    // A tower: a three by three stone room on the ground with a door on its east wall, and two floors over it, each with a hole for its ladder.
    for (let i = 0; i < 3; i++) { wall(x + i, y, "n", 0); wall(x + i, y + 3, "n", 0); }
    for (let j = 0; j < 3; j++) { wall(x, y + j, "w", 0); wall(x + 3, y + j, "w", 0, j === 1 ? "door" : "wall"); }
    const door = mapMod.peekTile(x + 3, y + 1, 0).w;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { if (!(i === 1 && j === 1)) floor(x + i, y + j, 1); if (!(i === 2 && j === 2)) floor(x + i, y + j, 2); }
    mapMod.roomsIfDirty();
    // The ladders, by the command a guest sends: one in the ground room up to the first floor, one there up to the second.
    stand(x + 0.2, y + 2, 0);
    let why = send({ kind: "build", what: "ladder_wood", tx: x + 1, ty: y + 1, dir: "n" });
    const l1 = mapMod.ladderAt(x + 1, y + 1, 0);
    assert(l1 && l1.part === "foot", `the first ladder: ${why || "not built"}`);
    built.push(l1.l);
    stand(x + 0.2, y + 2, 1);
    why = send({ kind: "build", what: "ladder_wood", tx: x + 2, ty: y + 2, dir: "n" });
    const l2 = mapMod.ladderAt(x + 2, y + 2, 1);
    assert(l2 && l2.part === "foot", `the second ladder: ${why || "not built"}`);
    built.push(l2.l);
    assert(send({ kind: "build", what: "ladder_wood", tx: x, ty: y, dir: "e" }) === "Ladders lean away from the camera", "a ladder leaning toward the camera");
    // Up the first by E: a timed climb, the walk inputs ignored, the rise climbing, the climb pose.
    stand(x + 1, y + 1.9, 0);
    let a = interactMod.nearestSimpleAction(me);
    assert(a && a.label === "Climb ladder", `E at the ladder's foot: ${a ? a.label : "nothing"}`);
    a.perform();
    assert(me.ladder && me.ladder.up && me.layer === 0, "the climb did not start");
    let last = -1;
    let mono = true;
    for (let i = 0; i < 200 && me.ladder; i++) {
      playerMod.updatePlayer(me, DT, { axis: { x: 1, y: 0 } }); // a walk key held all the while
      if (me.ladder && me.rise < last) mono = false;
      if (me.ladder) last = me.rise;
      if (me.ladder && me.anim.name !== "climb") mono = false;
    }
    assert(!me.ladder && me.layer === 1 && me.gx === l1.l.landing[0] && me.gy === l1.l.landing[1] && mono, `up the first ladder: on ${me.layer} at ${me.gx},${me.gy}, the rise always climbing ${mono}`);
    // Up the second, then down it again.
    stand(x + 2, y + 2.3, 1); // on its tile, the side it is climbed from
    a = interactMod.nearestSimpleAction(me);
    assert(a && a.label === "Climb ladder", `E at the second ladder: ${a ? a.label : "nothing"}`);
    a.perform();
    steps(120);
    assert(!me.ladder && me.layer === 2, `up the second ladder: on ${me.layer}`);
    a = interactMod.nearestSimpleAction(me);
    assert(a && a.label === "Descend ladder", `E on the landing: ${a ? a.label : "nothing"}`);
    a.perform();
    steps(120);
    assert(!me.ladder && me.layer === 1 && me.gx === x + 2 && me.gy === y + 2, `down the second ladder: on ${me.layer} at ${me.gx},${me.gy}`);
    // The review of #608: a ladder's tiles are its own. No floor in its hole, no wall across its top, no stair onto it, its landing's floor
    // taken up only with the ladder; a climber behind it gets nothing; a fall mid-climb lands at its foot; nothing is done from a ladder.
    const L1 = l1.l;
    assert(mapMod.floorBuildProblem(L1.at[0], L1.at[1], "floor_wood", 1) === "Not over a ladder's hole", `a floor in a ladder's hole: "${mapMod.floorBuildProblem(L1.at[0], L1.at[1], "floor_wood", 1)}"`);
    const topEdge = L1.dir === "n" ? [L1.at[0], L1.at[1], "n"] : [L1.at[0], L1.at[1], "w"];
    assert(mapMod.stairEdgeProblem(topEdge[0], topEdge[1], topEdge[2], 1) === "Not across a ladder's top", "a wall across a ladder's top");
    assert(mapMod.floorTakeUpProblem(L1.landing[0], L1.landing[1], 1) === "It is a ladder's landing: take the ladder apart", `the landing's floor taken up: "${mapMod.floorTakeUpProblem(L1.landing[0], L1.landing[1], 1)}"`);
    assert(!!mapMod.stairBuildProblem(L1.at[0] + 2, L1.at[1], "w", 0, "wood"), "a stair over a ladder's tile");
    stand(L1.at[0], L1.at[1] - 0.8, 0);
    a = interactMod.nearestSimpleAction(me);
    assert(!a || a.label !== "Climb ladder", "Climb ladder from behind the edge it leans on");
    // A fall mid-climb: the body lies at the foot, on its floor.
    stand(x + 1, y + 1.9, 0);
    ladderMod.begin(me, L1, true);
    steps(40);
    assert(me.ladder && me.rise > 20, "the climb for the fall did not start");
    const zcd0 = me.attackCooldown || 0;
    controllerMod.controlPlayer(me, [], DT, { clicked: true, leftDown: true, axis: { x: 0, y: 0 } });
    why = send({ kind: "build", what: "ladder_wood", tx: x + 4, ty: y + 5, dir: "n" });
    assert((me.attackCooldown || 0) === zcd0 && why === "Not while on a ladder.", `acting from a ladder: cooldown ${me.attackCooldown}, a build "${why}"`);
    gameMod.fallForChecks(me); // what a death does to the body (game.js fall), short of the death itself
    assert(!me.ladder && me.rise === 0 && me.layer === 0, "a fall mid-climb leaves the body in mid-air");
    // Up on the second floor, with the dead at the tower's foot: they never climb, and break the ground room's door under him.
    stand(x + 1, y, 2);
    rulesImport.rules.zombieAggro = true;
    const foot = zombieMod.createZombie(x + 5, y + 1, { hp: 1000 });
    foot.sightTimer = 1e9;
    foot.idleTimer = 1e9;
    foot.aggro = true;
    foot.lastSeen = mapMod.addr(x + 1, y, 2);
    foot.state = "chase";
    dead.push(foot);
    const hp0 = door.hp;
    let rose = false;
    for (let i = 0; i < 1800; i++) { zombieMod.updateZombie(foot, DT, [me], [foot]); if ((foot.layer || 0) !== 0) rose = true; }
    assert(!rose && door.hp < hp0, `the dead at the tower's foot: climbed ${rose}, the door ${door.hp} of ${hp0} (its state ${foot.state})`);
    // Taken apart: refused with someone above, done with nobody; a guest's copy drops it with its chunk.
    stand(x + 0.2, y + 2, 0);
    const up = zombieMod.createZombie(x, y, { hp: 1000 });
    up.layer = 1;
    S.zombies.push(up);
    dead.push(up);
    why = placementImport.takeApartProblem(me, { type: "ladder", l: l1.l, tx: x + 1, ty: y + 1, layer: 0 });
    assert(why === "Someone up there would have no way down", `a ladder taken apart with one of the dead above: "${why}"`);
    S.zombies.splice(S.zombies.indexOf(up), 1);
    const [ccx, ccy] = mapMod.chunkCoord(x + 1, y + 1);
    const rec0 = JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(ccx, ccy, false, 0))));
    why = send({ kind: "remove", target: { type: "ladder", tx: x + 1, ty: y + 1 } });
    assert(!mapMod.ladderAt(x + 1, y + 1, 0) && (rec0.ladders || []).length >= 1, `the ladder not taken apart with nobody above: "${why}"`);
    const rec1 = JSON.parse(JSON.stringify(mapMod.serializeChunk(mapMod.getChunk(ccx, ccy, false, 0))));
    mapMod.installChunk(rec0);
    const back = !!mapMod.ladderAt(x + 1, y + 1, 0);
    mapMod.installChunk(rec1);
    assert(back && !mapMod.ladderAt(x + 1, y + 1, 0), `a guest's copy: back with the old record ${back}, gone with the new one`);
    return `two ladders built by a guest's command, climbed up two storeys and down by E (a walk key ignored, the rise always climbing); the dead at the foot broke the door below (${hp0} to ${door.hp}) and never climbed; take-apart refused with one above and done with nobody; a guest's copy drops it`;
  } finally {
    promptImport.setMessageSink(null);
    for (const z of dead) { const i = S.zombies.indexOf(z); if (i >= 0) S.zombies.splice(i, 1); }
    for (const l of built) { try { mapMod.removeLadder(l); } catch { /* gone */ } }
    for (const [tx, ty, e, L] of walls.reverse()) { try { if (mapMod.peekTile(tx, ty, L)?.[e]) mapMod.destroyWall(tx, ty, e, false, L); } catch { /* gone */ } }
    for (const [a, b, L] of floors) { const t = mapMod.peekTile(a, b, L); if (t) { if (t.items) t.items.length = 0; delete t.built; t.floor = "void"; mapMod.touch(a, b, L); } }
    me.gx = was.gx; me.gy = was.gy; me.layer = was.layer; me.rise = was.rise; delete me.ladder;
    rulesImport.rules.freeBuilding = was.free;
    rulesImport.rules.zombieAggro = was.aggro;
  }
});

// Michael's ruling of 2026-10-30 (docs/02): mountains in tiers, hills only on dirt, grass, or hills, and no player-built way up one.
check("hills in tiers: a second tier's cliff wall, ramp, and cliff top built on a first tier's top by the command a guest sends; a cliff wall on cobble refused; a player's floor, stair, or ladder up onto a hill's top refused; a stair on the plateau to a floor above it allowed", () => {
  const at = clearGround();
  assert(at, "no clear ground");
  const [x, y] = at;
  const S = gameMod.state;
  const me = S.player;
  const was = { gx: me.gx, gy: me.gy, layer: me.layer, rise: me.rise, free: rulesImport.rules.freeBuilding };
  const said = [];
  promptImport.setMessageSink((t) => (said.push(t), true));
  const floors = [];
  const walls = [];
  const stairs = [];
  const ground = [];
  const send = (cmd) => { said.length = 0; placementImport.performPlacement(me, cmd); return said[said.length - 1] || ""; };
  const stand = (gx, gy, L) => { me.gx = gx; me.gy = gy; me.layer = L; me.rise = 0; };
  try {
    rulesImport.rules.freeBuilding = true;
    // The first tier, as the map would bake it: a ring of cliff walls on the grass, and its top a storey up.
    for (let i = 0; i < 8; i++) { mapMod.buildWall(x + i, y, "n", "wall", "wall_cliff", null, 0); mapMod.buildWall(x + i, y + 6, "n", "wall", "wall_cliff", null, 0); walls.push([x + i, y, "n", 0], [x + i, y + 6, "n", 0]); }
    for (let j = 0; j < 6; j++) { mapMod.buildWall(x, y + j, "w", "wall", "wall_cliff", null, 0); mapMod.buildWall(x + 8, y + j, "w", "wall", "wall_cliff", null, 0); walls.push([x, y + j, "w", 0], [x + 8, y + j, "w", 0]); }
    for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) { const t = mapMod.growTile(x + i, y + j, 1); t.floor = "floor_cliff_top"; t.built = { under: "void", free: true }; mapMod.touch(x + i, y + j, 1); floors.push([x + i, y + j, 1]); }
    mapMod.roomsIfDirty();
    // The second tier on it: a cliff wall on the top, a ramp up from the top, and a cliff top laid out from the ramp's landing.
    stand(x + 5, y + 4, 1);
    let why = send({ kind: "build", what: "wall_cliff", tx: x + 1, ty: y + 2, edge: "n" });
    const tierWall = mapMod.peekTile(x + 1, y + 2, 1).n;
    assert(tierWall && mapMod.wallRule(tierWall.sprite).cliff, `a second tier's cliff wall: "${why}"`);
    walls.push([x + 1, y + 2, "n", 1]);
    why = send({ kind: "build", what: "stair_ramp_stone", tx: x + 3, ty: y + 4, dir: "n" });
    const ramp = mapMod.stairAt(x + 3, y + 4, 1);
    assert(ramp && !ramp.well, `a ramp up from a hill's top: "${why}"`);
    stairs.push(ramp.s);
    stand(x + 3, y + 1, 2); // on the ramp's landing: a floor is laid on the storey you stand on
    why = send({ kind: "build", what: "floor_cliff_top", tx: x + 3, ty: y, tx2: x + 3, ty2: y });
    assert(mapMod.peekTile(x + 3, y, 2)?.floor === "floor_cliff_top", `a second tier's top beside the ramp's landing: "${why}"`);
    floors.push([x + 3, y, 2], [x + 3, y + 1, 2]);
    // A cliff wall on cobble: refused.
    for (const b of [y + 12, y + 13]) { const t = mapMod.tileAt(x + 12, b, 0); ground.push([x + 12, b, t.floor]); t.floor = "floor_cobble"; mapMod.touch(x + 12, b, 0); }
    stand(x + 12.5, y + 11, 0);
    why = send({ kind: "build", what: "wall_cliff", tx: x + 12, ty: y + 13, edge: "n" });
    assert(why === "Hills stand on dirt, grass, or hills" && !mapMod.peekTile(x + 12, y + 13, 0).n, `a cliff wall on cobble: "${why}"`);
    // No player-built way up: a plank floor, a stair, or a ladder beside a hill's top.
    stand(x + 10, y + 3, 0);
    why = send({ kind: "build", what: "stair_wood", tx: x + 11, ty: y + 2, dir: "w" });
    assert(why === "Not up onto a hill" && !mapMod.stairAt(x + 11, y + 2, 0), `a wood stair up to a hill's top: "${why}"`);
    why = send({ kind: "build", what: "ladder_wood", tx: x + 9, ty: y + 2, dir: "w" });
    assert(why === "Not up onto a hill" && !mapMod.ladderAt(x + 9, y + 2, 0), `a ladder up to a hill's top: "${why}"`);
    stand(x + 7, y + 2, 1);
    why = send({ kind: "build", what: "floor_wood", tx: x + 8, ty: y + 2, tx2: x + 8, ty2: y + 2 });
    assert(why === "Not up onto a hill" && (mapMod.peekTile(x + 8, y + 2, 1)?.floor || "void") === "void", `a plank floor out from a hill's top: "${why}"`);
    // A castle on the plateau still builds up: a wood stair on the top whose landing a storey up is clear of the next tier.
    stand(x + 6, y + 5.4, 1);
    why = send({ kind: "build", what: "stair_wood", tx: x + 6, ty: y + 4, dir: "n" });
    const up = mapMod.stairAt(x + 6, y + 4, 1);
    assert(up && !up.well, `a stair on the plateau to a floor over it: "${why}"`);
    stairs.push(up.s);
    // The review of #611. A floor a storey over the top, out past its edge, is no bridge: from the plateau stair's landing a plank floor stays
    // inside the hill's column; a stair across the column's edge a storey up is refused; a plank floor never replaces the plateau's top.
    stand(x + 6, y + 1, 2);
    why = send({ kind: "build", what: "floor_wood", tx: x + 7, ty: y + 1, tx2: x + 9, ty2: y + 1 });
    floors.push([x + 7, y + 1, 2], [x + 8, y + 1, 2], [x + 9, y + 1, 2]);
    assert(mapMod.peekTile(x + 7, y + 1, 2)?.floor === "floor_wood" && (mapMod.peekTile(x + 8, y + 1, 2)?.floor || "void") === "void" && mapMod.floorBuildProblem(x + 8, y + 1, "floor_wood", 2) === "Not up onto a hill", `a floor out past the hill's edge a storey up: "${why}", x+7 ${mapMod.peekTile(x + 7, y + 1, 2)?.floor}, x+8 ${mapMod.peekTile(x + 8, y + 1, 2)?.floor}`);
    assert(mapMod.stairBuildProblem(x + 9, y + 3, "w", 2, "wood") === "Not up onto a hill", `a stair across the column's edge a storey up: "${mapMod.stairBuildProblem(x + 9, y + 3, "w", 2, "wood")}"`);
    stand(x + 5, y + 4, 1);
    why = send({ kind: "build", what: "floor_wood", tx: x + 5, ty: y + 3, tx2: x + 5, ty2: y + 3 });
    assert(mapMod.peekTile(x + 5, y + 3, 1)?.floor === "floor_cliff_top" && why === "Not up onto a hill", `a plank floor over the plateau's top: "${why}" (${mapMod.peekTile(x + 5, y + 3, 1)?.floor})`);
    // A ramp whose landing would hang past the plateau's edge is refused; a tier's face may rise sheer from the rim below.
    stand(x + 5, y + 3, 1);
    why = send({ kind: "build", what: "stair_ramp_stone", tx: x + 5, ty: y + 2, dir: "n" });
    assert(why === "Hills stand on dirt, grass, or hills" && !mapMod.stairAt(x + 5, y + 2, 1), `a ramp hanging past the edge: "${why}"`);
    stand(x + 2, y + 1, 1);
    why = send({ kind: "build", what: "wall_cliff", tx: x + 2, ty: y, edge: "n" });
    assert(mapMod.peekTile(x + 2, y, 1).n && mapMod.wallRule(mapMod.peekTile(x + 2, y, 1).n.sprite).cliff, `a sheer face on the rim: "${why}"`);
    walls.push([x + 2, y, "n", 1]);
    return "a second tier's cliff wall, ramp, and top on the first tier's top; a sheer face on the rim; a cliff wall on cobble and a ramp hanging past the edge refused; a wood stair, a ladder, and a plank floor up onto a hill refused, and a floor or a stair crossing the hill's column a storey up; a stair and a floor inside the column a storey up allowed, a plank floor over the plateau's own top refused";
  } finally {
    promptImport.setMessageSink(null);
    for (const s of stairs) { try { if (mapMod.stairKind(s.material).ramp) for (const [tx, ty, e] of mapMod.landingSideEdges(s)) if (mapMod.peekTile(tx, ty, s.layer)?.[e]) mapMod.destroyWall(tx, ty, e, false, s.layer); mapMod.removeStair(s); } catch { /* gone */ } }
    for (const [tx, ty, e, L] of walls.reverse()) { try { if (mapMod.peekTile(tx, ty, L)?.[e]) mapMod.destroyWall(tx, ty, e, false, L); } catch { /* gone */ } }
    for (const [a, b, L] of floors) { const t = mapMod.peekTile(a, b, L); if (t) { delete t.built; t.floor = "void"; mapMod.touch(a, b, L); } }
    for (const [a, b, f] of ground) { const t = mapMod.peekTile(a, b, 0); if (t) { t.floor = f; mapMod.touch(a, b, 0); } }
    me.gx = was.gx; me.gy = was.gy; me.layer = was.layer; me.rise = was.rise;
    rulesImport.rules.freeBuilding = was.free;
  }
});

// The layer audit (docs/53 step 0, section 6.5): no call in the simulation leaves its layer to a default of the ground or the drawn storey,
// beyond the allow list of those known on 2026-10-30, each named with the step that gives it its layer. The list only shrinks: a new
// layer-less call fails, and so does an entry with more calls than remain (take it down as the step lands).
{
  const audit = await import("./layer-audit.js");
  const allow = read("tools/layer-audit-allow.json").calls;
  check("layer audit: no simulation read leaves its layer to a default, beyond the allow list", () => {
    const found = audit.grouped(audit.audit());
    const key = (o) => `${o.file}  ${o.call}`;
    const left = new Map(allow.map((a) => [key(a), a]));
    assert(left.size === allow.length, "the allow list names a call twice");
    const bad = allow.filter((a) => ![1, 2, 3, 4, 5, 6, 7, "ground"].includes(a.step) || !(a.n >= 1));
    assert(!bad.length, `allow-list entries with no step of docs/53 or no count: ${bad.map(key).join("; ")}`);
    const fresh = [];
    for (const g of found) {
      const a = left.get(key(g));
      if (!a) { fresh.push(`${g.file}:${g.lines.join(",")} ${g.call}`); continue; }
      if (g.n > a.n) fresh.push(`${g.file}:${g.lines.join(",")} ${g.call} (${g.n}, the list allows ${a.n})`);
      left.delete(key(g));
      if (g.n < a.n) left.set(key(g), { ...a, n: a.n - g.n, stale: true });
    }
    const stale = [...left.values()].map((a) => `${a.file} ${a.call} (step ${a.step})`);
    assert(!fresh.length, `layer-less calls not on the list: ${fresh.join("; ")}`);
    assert(!stale.length, `the list names calls that are gone; take them off tools/layer-audit-allow.json: ${stale.join("; ")}`);
    const fns = audit.layered();
    assert(["tileAt", "peekTile", "wallBetween", "lineOfSight", "itemsAt", "roomAt", "lightAt", "openingsNear"].every((n) => [...fns.values()].some((f) => f.name === n)), "the scan lost a layered function");
    const steps = {};
    for (const a of allow) steps[a.step] = (steps[a.step] || 0) + a.n;
    return `${fns.size} layered functions; ${allow.reduce((t, a) => t + a.n, 0)} calls allowed, by step: ${Object.entries(steps).map(([k, v]) => `${k} ${v}`).join(", ")}`;
  });
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(`${results.length - failed} of ${results.length} pass`);
process.exit(failed ? 1 : 0);
