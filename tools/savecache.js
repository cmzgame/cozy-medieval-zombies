// The save's cache proved (2026-10-15, `02`: a save that costs what changed). Boots the valley headless, grows all of
// it and a ring of the wild (a well-explored world), then makes every kind of change a chunk can take through the
// game's own mutators, stepping between them, and after each compares three saves character for character: the
// cached text (game.serializeText, what the server writes), the cached object as text (game.serialize, what the
// browser stores and a guest receives), and the whole world made afresh. Then a change made behind the cache's back
// (a prop's field set with no mark) must be caught by game.verifySaveCache, or the check proves nothing. Prints the
// times and the cache's counts. From the repo's root:
//   node tools/savecache.js
// The headless suite runs it (tools/check.js).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { bootData } = await import("../server/boot.js");
const [map, game, loop, interact, stations, save, clock, verbs, items, inventory, farming] = await Promise.all([
  import("../src/map.js"), import("../src/game.js"), import("../src/loop.js"), import("../src/interact.js"), import("../src/stations.js"), import("../src/save.js"), import("../src/clock.js"),
  import("../src/verbs.js"), import("../src/items.js"), import("../src/inventory.js"), import("../src/farming.js"),
]);
await bootData(root);
const json = JSON.parse(fs.readFileSync(path.join(root, "data/maps/valley.json"), "utf8"));
game.create({ json });
loop.init({ update: (dt) => { game.begin(dt); game.step(dt, game.idleSnapshot()); }, render: () => {} });

const fail = (msg) => { console.log(`FAIL: ${msg}`); process.exit(1); };
const W = Math.ceil((json.width || 256) / map.CHUNK), H = Math.ceil((json.height || 256) / map.CHUNK);
for (let cy = -2; cy < H + 2; cy++) for (let cx = -2; cx < W + 2; cx++) map.getChunk(cx, cy);
const steps = (n) => { for (let i = 0; i < n; i++) loop.advance(1 / 60); };
steps(30);

let compared = 0;
const same = (what) => {
  const fresh = JSON.stringify(game.serialize({ fresh: true }));
  const text = game.serializeText();
  const obj = JSON.stringify(game.serialize());
  for (const [name, got] of [["the cached text", text], ["the cached object", obj]]) {
    if (got === fresh) continue;
    let i = 0;
    while (i < got.length && got[i] === fresh[i]) i++;
    fail(`after ${what}, ${name} differs from the world made afresh at character ${i}:\n  cached ${got.slice(Math.max(0, i - 80), i + 80)}\n  fresh  ${fresh.slice(Math.max(0, i - 80), i + 80)}`);
  }
  compared++;
};
same("the boot");

// What the valley offers, found once.
const props = map.allProps();
const tiles = [];
map.eachChunk((c) => tiles.push(c));
let door = null;
for (const c of tiles) {
  for (const t of c.tiles) {
    for (const e of ["n", "w"]) if (!door && t[e] && t[e].kind === "door" && !t[e].broken && !map.isFence(t[e])) door = t[e]; // a house door: a gate takes no boards (2026-10-24)
  }
}
const p = game.state.player;
const done = [];
// A chunk with no lit fire and no station at work: a fire's or a job's own mark remakes its chunk every step, which
// would hide a change elsewhere in it that marked nothing.
const chunkOf = (x, y) => `${Math.floor(x / map.CHUNK)},${Math.floor(y / map.CHUNK)}`;
const busy = () => new Set(map.allProps().filter((q) => (q.fire && q.fire.lit) || (q.queue && q.queue.length)).map((q) => chunkOf(q.tile[0], q.tile[1])));
const quiet = (x, y) => !busy().has(chunkOf(x, y));
const did = (what, n = 20) => { steps(n); same(what); done.push(what); };

// A floor, an item down and taken up, a wall built and destroyed, a prop placed and removed.
const [px, py] = [Math.round(p.gx), Math.round(p.gy)];
map.setFloor(px + 3, py + 3, "floor_dirt"); did("a floor set");
const e = map.dropItem(px + 2, py + 2, { id: "stick", count: 1 }); did("an item dropped");
map.takeItem(px + 2, py + 2, e); did("an item taken");
if (map.canBuildWall(px + 5, py + 5, "n")) {
  map.buildWall(px + 5, py + 5, "n", "wall"); did("a wall built");
  // A painting hung on its face from the bag (#326) and taken down, then hung again and dropped with the wall (a hanging is the wall's state: map.touch marks the chunk).
  const paintings = await import("../src/paintings.js");
  p.gx = px + 5; p.gy = py + 6;
  const art = items.makeEntry("painting_small_oak", 1);
  inventory.stow(p, art);
  if (!paintings.hang(p, art.uid, px + 5, py + 5, "n")) fail("the painting was not hung");
  did("a painting hung");
  paintings.takeDown(p, px + 5, py + 5, "n"); did("a painting taken down");
  paintings.hang(p, art.uid, px + 5, py + 5, "n");
  map.destroyWall(px + 5, py + 5, "n"); did("a wall destroyed with a painting on it");
  map.takeItem(px + 5, py + 5, map.itemsAt(px + 5, py + 5).find((q) => q.id === "painting_small_oak"));
}
// A window of another wood than its wall (#334): the leaf is on the wall, marked with the chunk by buildWall.
if (map.canBuildWall(px + 7, py + 5, "n")) {
  map.buildWall(px + 7, py + 5, "n", "wall", "wall_mahogany");
  map.buildWall(px + 7, py + 5, "n", "window", "wall_mahogany", "wall_spruce"); did("a window of another wood built");
  map.destroyWall(px + 7, py + 5, "n"); did("a window of another wood taken down");
}
const at = [px + 4, py - 3];
const bench = map.createProp({ sprite: "workbench", tile: at, footprint: [1, 1] });
map.placeProp(bench, at[0], at[1]); did("a prop placed");
// A bed across a chunk's edge (#341): the neighbour's record names its tile (`parts`), so placing and lifting it must drop that chunk's copy too.
let edgeAt = null;
for (let dy = -20; dy <= 20 && !edgeAt; dy++) for (let dx = -20; dx <= 20 && !edgeAt; dx++) {
  const x = px + dx, y = py + dy;
  if (((x % map.CHUNK) + map.CHUNK) % map.CHUNK !== map.CHUNK - 1) continue;
  if ([0, 1].every((k) => { const t = map.peekTile(x + k, y); return t && !t.prop && !t.rug && map.isWalkableTile(x + k, y); })) edgeAt = [x, y];
}
if (!edgeAt) fail("no bare ground across a chunk's edge for the bed");
const edgeBed = map.createProp({ sprite: "bed", tile: edgeAt, footprint: [2, 1], facing: "x" });
map.placeProp(edgeBed, edgeAt[0], edgeAt[1]); did("a bed placed across a chunk's edge");
map.removeProp(edgeBed); did("a bed across a chunk's edge lifted");
// A door: opened as the interface opens it, hit short of breaking (the wire never sends that), boarded.
if (!door) fail("the valley has no door to try");
door.open = !door.open; map.touch(door.at[0], door.at[1]); did("a door opened");
map.damageOpening(door, 1, 1); did("a door hit short of breaking");
door.open = false; map.touch(door.at[0], door.at[1]);
map.addBoard(door, 1); did("a board nailed");
map.damageOpening(door, 1, 1); did("a board hit short of breaking");
// A fire fed and burning between its units (the save's copy only), a holder's torch.
const burner = props.find((q) => q.fire && q.fire.burns);
if (!burner) fail("no burner in the valley");
map.feedFire(burner); did("a fire fed", 90);
did("a fire burning between units", 200);
// The valley's posts are lanterns now (#156), so a torch post is made for the change, and an empty bracket is looked for.
let holder = [...map.allProps()].find((q) => q.fire && q.fire.holds);
let madePost = null;
if (!holder) {
  const hx = Math.round(p.gx) + 3;
  const hy = Math.round(p.gy);
  madePost = map.createProp({ sprite: "torch_post", tile: [hx, hy] });
  map.placeProp(madePost, hx, hy);
  holder = madePost;
}
map.setHolder({ kind: "prop", prop: holder }, !holder.fire.has); did("a holder's torch changed");
if (madePost) { map.removeProp(madePost); did("the post taken away"); }
const bracket = [...map.brackets()].find((b) => !b.wall.bracket.lantern);
if (!bracket) fail("no bracket for a torch in the valley");
map.setHolder({ kind: "bracket", bracket }, !bracket.wall.bracket.torch); did("a bracket's torch changed");
// A sway's stamp, a container's bag made on first use, a station's job counting down and landing.
// The bench moved to a quiet chunk first, then the stamp in another, the player stepped away before the world steps.
map.removeProp(bench);
const benchAt = tiles.map((c) => [c.cx * map.CHUNK + 8, c.cy * map.CHUNK + 8]).find(([x, y]) => quiet(x, y) && !map.tileAt(x, y).prop && map.isWalkableTile(x, y));
if (!benchAt) fail("no quiet chunk for the bench");
bench.tile = benchAt;
map.placeProp(bench, benchAt[0], benchAt[1]); did("a prop moved");
const [hx, hy] = [p.gx, p.gy];
const swayer = props.find((q) => q.interactable && !q.fire && !q.container && quiet(q.tile[0], q.tile[1]) && chunkOf(q.tile[0], q.tile[1]) !== chunkOf(benchAt[0], benchAt[1]) && chunkOf(q.tile[0], q.tile[1]) !== chunkOf(hx, hy));
if (!swayer) fail("no quiet thing to sway");
p.gx = swayer.tile[0] + 0.5; p.gy = swayer.tile[1] + 1;
const pokedBefore = swayer.pokedAt;
if (!interact.stampFromGuest(p, swayer.id, 0) || swayer.pokedAt === pokedBefore) fail(`the sway was not stamped (${swayer.sprite}, ${pokedBefore} to ${swayer.pokedAt})`);
p.gx = hx; p.gy = hy;
did("a sway stamped", 2);
const chest = props.find((q) => q.container && !q.bag);
if (chest) { interact.propBag(chest); did("a container's bag made"); }
const r = stations.recipe("handle");
stations.start(p, bench, r, 2); did("a station's job started", 30);
if (!bench.queue || !bench.queue.length) fail("the station took no job");
did("a station's job counting down", 60);
did("a station's job landing", 200);
// The wild dropped and grown again, a whole-world touch.
map.evictFar(p.gx, p.gy, 3); did("the far wild evicted");
for (let cy = -2; cy < H + 2; cy++) for (let cx = -2; cx < W + 2; cx++) map.getChunk(cx, cy);
did("the wild grown again");
map.touch(); did("the whole world touched");
map.removeProp(bench); did("a prop removed");
// A fruit tree picked bare (its sprite and the day it bears again change with no other mark), and bearing again on that day (fruit.js).
const apple = map.allProps().find((q) => q.sprite === "tree_apple");
if (!apple) fail("the valley has no apple tree");
map.restage(apple, "tree_apple_bare", clock.getElapsed() + 2 * clock.DAY_LENGTH); did("a fruit tree picked bare");
clock.setElapsed(clock.getElapsed() + 3 * clock.DAY_LENGTH); did("a fruit tree bearing again", 120);
if (apple.sprite !== "tree_apple" || apple.regrowAt !== undefined) fail(`the apple tree did not bear again (${apple.sprite}, ${apple.regrowAt})`);
// Farming (#194): a tile tilled, a seed planted, the crop watered, its picture turning with its stage, and the harvest: each through the
// verbs the menu and a guest use, and each a change on a chunk the save's cache must hear.
{
  const me = game.state.player;
  let fx = null;
  let fy = null;
  for (let dy = -12; dy <= 12 && fx === null; dy++) for (let dx = -12; dx <= 12 && fx === null; dx++) {
    const [x, y] = [Math.round(me.gx) + dx, Math.round(me.gy) + dy];
    const t = map.peekTile(x, y);
    if (t && t.floor === "floor_grass" && !t.prop && map.isWalkableTile(x, y) && !t.n && !t.w && quiet(x, y)) { fx = x; fy = y; }
  }
  if (fx === null) fail("no bare grass to till near the player");
  me.hands.main = items.makeEntry("hoe", 1);
  me.gx = fx + 1;
  me.gy = fy;
  const stow = (id, n, props = {}) => inventory.addItem(inventory.bagOf(me), id, n, props);
  stow("potato_seed", 3);
  stow("waterskin", 1, { fill: 100 });
  stow("shovel", 1); // a potato is dug (the tool rule, #215)
  const run = (verb, target) => { const r = verbs.run(verb, game.state, me, target); if (!r.ok) fail(`${verb}: ${r.reason}`); };
  run("till", { tile: [fx, fy] }); did("a tile tilled");
  run("plant", { tile: [fx, fy], crop: "potato" }); did("a seed planted");
  const crop = map.tileAt(fx, fy).prop;
  if (!crop || !crop.crop) fail("the seed made no crop");
  run("water", { prop: crop.id }); did("a crop watered");
  clock.setElapsed(clock.getElapsed() + 4 * clock.DAY_LENGTH + 120); crop.crop.wetUntil = clock.getElapsed() + 1e6; did("a crop turning with its stage", 120);
  if (crop.sprite !== "crop_potato_2") fail(`the crop did not turn to its ripe stage (${crop.sprite})`);
  run("harvest", { prop: crop.id }); did("a crop harvested");
  me.hands.main = null;
}
// Chopping (#195): a tree felled to a stump, and the stump chopped up: a prop removed and another placed on its tile, and one removed, with logs.
{
  const me = game.state.player;
  const verbs = await import("../src/verbs.js");
  const items = await import("../src/items.js");
  me.hands.main = items.makeEntry("hatchet", 1);
  me.gx = apple.tile[0] + 1;
  me.gy = apple.tile[1] + 0.2;
  const r1 = verbs.run("chop", game.state, me, { prop: apple.id });
  if (!r1.ok) fail(`chop: ${r1.reason}`);
  did("a tree felled to a stump");
  const stump = map.tileAt(apple.tile[0], apple.tile[1]).prop;
  if (!stump || stump.sprite !== "stump") fail("no stump was left");
  const r2 = verbs.run("chop", game.state, me, { prop: stump.id });
  if (!r2.ok) fail(`chop: ${r2.reason}`);
  did("a stump chopped up");
  me.hands.main = null;
}
// Mining (#196): a rock mined (removed, with stone); an ore rock at the iron workings mined (gone, a debt on the ore area's record, which
// the save keeps outside the chunks) and its replacement rising elsewhere in the area on its day (docs/46: the new prop marks its chunk).
{
  const me = game.state.player;
  const verbs = await import("../src/verbs.js");
  const items = await import("../src/items.js");
  const resources = await import("../src/resources.js");
  const [rx, ry] = [apple.tile[0] + 3, apple.tile[1]];
  const rock = map.createProp({ sprite: "rock_0", tile: [rx, ry] });
  map.placeProp(rock, rx, ry);
  me.hands.main = items.makeEntry("pickaxe", 1);
  me.gx = rx + 1;
  me.gy = ry + 0.4;
  const m1 = verbs.run("mine", game.state, me, { prop: rock.id });
  if (!m1.ok) fail(`mine: ${m1.reason}`);
  did("a rock mined");
  const oreKind = map.resourceKind("ore");
  const oreRock = map.allProps().find((q) => q.sprite === "ore_rock" && map.inResourceArea(oreKind, q.tile[0], q.tile[1]));
  if (!oreRock) fail("no ore rock at the iron workings");
  const [mx, my] = [me.gx, me.gy];
  me.gx = oreRock.tile[0] + 1;
  me.gy = oreRock.tile[1] + 0.4;
  const m2 = verbs.run("mine", game.state, me, { prop: oreRock.id });
  if (!m2.ok) fail(`mine: ${m2.reason}`);
  if (resources.owed("ore").length !== 1) fail(`the ore rock mined left ${resources.owed("ore").length} debts, not one`);
  me.gx = mx;
  me.gy = my;
  did("an ore rock mined, its replacement owed");
  const before = map.allProps().filter((q) => q.sprite === "ore_rock").length;
  clock.setElapsed(clock.getElapsed() + 3 * clock.DAY_LENGTH); did("an ore rock rising elsewhere in its area", 120);
  const grown = map.allProps().filter((q) => q.sprite === "ore_rock");
  if (grown.length !== before + 1 || resources.owed("ore").length || grown.some((q) => q.tile[0] === oreRock.tile[0] && q.tile[1] === oreRock.tile[1])) fail(`no new ore rock rose elsewhere (${before} before, ${grown.length} after, ${resources.owed("ore").length} owed)`);
  me.hands.main = null;
  // A hive's honey taken (docs/43 section 6, #410): the day it has more rides on the prop.
  await import("../src/hives.js");
  const hive = map.allProps().find((q) => q.sprite === "beehive" && Math.hypot(q.tile[0] - me.gx, q.tile[1] - me.gy) < 40);
  if (!hive) fail("no beehive near the player");
  me.gx = hive.tile[0];
  me.gy = hive.tile[1] + 1;
  const h1 = verbs.run("honey", game.state, me, { prop: hive.id });
  if (!h1.ok) fail(`honey: ${h1.reason}`);
  did("a hive's honey taken");
  // Gathering (docs/46 step 2, #448): an herb gathered by hand, a clay bank dug with a shovel carried, a salt rock mined: each node gone (its
  // chunk marked), a debt on its area's record, and the replacements growing elsewhere in their areas on their days.
  await import("../src/gather.js");
  const nodeOf = (name) => { const k = map.resourceKind(name); return map.allProps().find((q) => k.sprites[q.sprite] !== undefined && map.inResourceArea(k, q.tile[0], q.tile[1])); };
  const at = (p) => { me.gx = p.tile[0] + 1; me.gy = p.tile[1] + 0.4; };
  const sage = nodeOf("sage");
  at(sage);
  const g1 = verbs.run("gather", game.state, me, { prop: sage.id });
  if (!g1.ok) fail(`gather: ${g1.reason}`);
  did("an herb gathered, its replacement owed");
  const bank = nodeOf("clay");
  at(bank);
  inventory.stow(me, items.makeEntry("shovel", 1));
  const g2 = verbs.run("dig", game.state, me, { prop: bank.id });
  if (!g2.ok) fail(`dig: ${g2.reason}`);
  did("a clay bank dug, its replacement owed");
  const saltRock = nodeOf("salt");
  at(saltRock);
  me.hands.main = items.makeEntry("pickaxe", 1);
  const g3 = verbs.run("mine", game.state, me, { prop: saltRock.id });
  if (!g3.ok) fail(`mine salt: ${g3.reason}`);
  did("a salt rock mined, its replacement owed");
  me.hands.main = null;
  clock.setElapsed(clock.getElapsed() + 3 * clock.DAY_LENGTH);
  const owing = () => ["sage", "clay", "salt"].filter((n) => resources.owed(n).length);
  for (let i = 0; i < 80 && owing().length; i++) { steps(1); clock.setElapsed(clock.getElapsed() + 30); } // a look each checkSeconds of the clock: a spot by the river takes a few draws
  did("an herb, a clay bank, and a salt rock grown elsewhere in their areas");
  if (owing().length) fail(`still owed after 80 looks: ${owing().join(", ")}`);
}
// A torch burning down in a bracket: its wear changes every step and only the save's copy of the chunk hears (map.burnHolders).
const mount = [...map.brackets()].find((b) => !b.wall.bracket.torch) || [...map.brackets()][0];
if (!mount) fail("the valley has no bracket for a mounted torch");
const mountTarget = { kind: "bracket", bracket: mount, mx: mount.tx, my: mount.ty };
map.setHolder(mountTarget, true, { wear: 0.2, lit: true }); did("a torch mounted, lit");
did("a mounted torch burning down", 200);
map.setHolder(mountTarget, false); did("the torch taken out");

// A snare set from the bag, holding a rabbit, and set again once the catch is taken (docs/45 section 2): its state rides on the prop.
{
  const setdown = await import("../src/setdown.js");
  const animal = await import("../src/entities/animal.js");
  const grid = await import("../src/grid.js");
  const me = game.state.player;
  const home = game.state.animalHomes.find((h) => h.species === "rabbit");
  if (!home) fail("the valley has no home of rabbits");
  me.gx = home.at[0] + 4;
  me.gy = home.at[1];
  steps(2);
  const sn = items.makeEntry("snare", 1);
  const bag0 = inventory.bagOf(me).items;
  inventory.bagOf(me).items = []; // room for it: the run above has filled the kit's sack
  if (!grid.insert(inventory.bagOf(me), sn)) fail("no room in the bag for a snare");
  let at = null;
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const tx = Math.round(me.gx) + dx;
    const ty = Math.round(me.gy) + dy;
    if (!at && map.isWalkableTile(tx, ty) && !map.tileAt(tx, ty).prop && map.tileAt(tx, ty).room === 0) at = [tx, ty];
  }
  if (!at || !setdown.place(me, sn.uid, at[0], at[1])) fail("the snare could not be set beside the rabbits' home");
  did("a snare set");
  const snare = map.tileAt(at[0], at[1]).prop;
  clock.setElapsed(snare.snare.setAt + animal.snareRule().hours * animal.GAME_HOUR + 1);
  me.gx += 70; // nobody near to see the catch
  did("a snare holding a rabbit", 70);
  const caught = game.state.animals.find((q) => q.id === snare.snare.holds);
  if (!caught) fail("the snare caught nothing");
  caught.butchered = true;
  did("a snare set again once its catch is taken", 70);
  if (snare.snare.holds !== null) fail("the snare was not set again");
  map.removeProp(snare);
  inventory.bagOf(me).items = bag0;
}

// The keeping's daily pass (docs/45 section 3): a feeding trough eaten from, and a hen's egg laid into its coop, as the day turns.
{
  const animal = await import("../src/entities/animal.js");
  const grid = await import("../src/grid.js");
  const interact2 = await import("../src/interact.js");
  const hen = game.state.animals.find((a) => a.species === "hen" && !a.dead);
  if (!hen) fail("the valley has no hen");
  const trough = map.allProps().filter((q) => q.sprite === "feed_trough").sort((x, y) => Math.hypot(x.tile[0] - hen.home[0], x.tile[1] - hen.home[1]) - Math.hypot(y.tile[0] - hen.home[0], y.tile[1] - hen.home[1]))[0];
  if (!trough) fail("no feeding trough by the hens");
  const tb = interact2.propBag(trough);
  for (let i = 0; i < 4; i++) grid.insert(tb, items.makeEntry("grain", 1));
  map.markDirty(trough.tile[0], trough.tile[1]); // filled by hand, as the panel's drop marks it
  did("a feeding trough filled");
  clock.setElapsed((animal.today() + 1) * clock.DAY_LENGTH + 2);
  did("a feeding trough eaten from and a coop laid in as the day turns", 6 * 60); // the troughs are looked for every fifth second
  if (hen.fedDay !== animal.today()) fail("the hen was not fed when the day turned");
}

// Saplings and sticks (docs/46 step 3, #449): a sapling planted from the bag, its growing waiting while the player stands on it (the stamp on
// the prop), turning to its second stage and then to the round oak in place; and sticks gathered under a tree (the day it has more on the prop).
{
  const setdown = await import("../src/setdown.js");
  const trees = await import("../src/trees.js");
  const grid = await import("../src/grid.js");
  const { trees: T } = await import("../src/tuning.js");
  const me = game.state.player;
  const [ox, oy] = [Math.round(me.gx), Math.round(me.gy)];
  let at = null;
  for (let d = 2; d < 20 && !at; d++) for (let dy = -d; dy <= d && !at; dy++) for (let dx = -d; dx <= d && !at; dx++) {
    const [x, y] = [ox + dx, oy + dy];
    if (trees.standProblem(x, y) === "" && quiet(x, y)) at = [x, y];
  }
  if (!at) fail("no open grass near the player for a sapling");
  const bag0 = inventory.bagOf(me).items;
  inventory.bagOf(me).items = [];
  const sap = items.makeEntry("sapling", 1);
  if (!grid.insert(inventory.bagOf(me), sap)) fail("no room in the bag for a sapling");
  me.gx = at[0] + 1;
  me.gy = at[1];
  if (!setdown.place(me, sap.uid, at[0], at[1])) fail("the sapling could not be planted");
  did("a sapling planted");
  const s = map.tileAt(at[0], at[1]).prop;
  me.gx = at[0];
  me.gy = at[1];
  clock.setElapsed(clock.getElapsed() + 120);
  did("a sapling waiting while stood on", 70);
  if (!(s.sapling.waited > 0)) fail(`the sapling stood on did not wait (${JSON.stringify(s.sapling)})`);
  me.gx = at[0] + 2;
  me.gy = at[1] + 2;
  clock.setElapsed(s.sapling.at + s.sapling.waited + 0.6 * T.sapling.days * clock.DAY_LENGTH);
  did("a sapling turning to its next stage", 70);
  if (s.sprite !== T.sapling.stages[1]) fail(`the sapling did not turn (${s.sprite})`);
  clock.setElapsed(s.sapling.at + s.sapling.waited + T.sapling.days * clock.DAY_LENGTH + 60);
  did("a sapling grown into a tree", 70);
  const oak = map.tileAt(at[0], at[1]).prop;
  if (!oak || oak.sprite !== T.sapling.grows || oak.id !== s.id) fail(`the sapling did not grow into the oak (${oak && oak.sprite})`);
  me.gx = at[0] + 0.9;
  me.gy = at[1] + 0.3;
  const g = verbs.run("sticks", game.state, me, { prop: oak.id });
  if (!g.ok) fail(`sticks: ${g.reason}`);
  did("sticks gathered under a tree");
  inventory.bagOf(me).items = bag0;
}

// The save as the server writes it: the snapshot's text, the same characters as the object's.
const extra = { worldId: "w", name: "n", owners: {}, dormant: {}, myPlayerId: null, server: true };
const st = save.snapshotText("valley", extra);
const so = JSON.stringify({ ...save.snapshot("valley", extra), savedAt: JSON.parse(st).savedAt });
if (st !== so) fail("the snapshot's text is not the snapshot's object as text");

// A change behind the cache's back is caught, and saved right after.
const sneaky = props.find((q) => q.container && q !== chest) || props.find((q) => q.interactable);
game.serializeText();
sneaky.searched = !sneaky.searched;
const caught = game.verifySaveCache();
if (caught.length !== 1) fail(`a change with no mark was not caught (verifySaveCache gave ${caught.length})`);
same("the change with no mark, after the cache was proved");
sneaky.searched = !sneaky.searched;
map.unsaved(sneaky.tile[0], sneaky.tile[1], false);

// The times, on this world.
const t = (f) => { const a = performance.now(); f(); return performance.now() - a; };
const fresh = Math.min(...[0, 1, 2].map(() => t(() => JSON.stringify(game.serialize({ fresh: true })))));
const cachedText = Math.min(...[0, 1, 2].map(() => t(() => game.serializeText())));
const cachedObj = Math.min(...[0, 1, 2].map(() => t(() => game.serialize())));
const kb = Math.round(game.serializeText().length / 1024);
console.log(`savecache: ${done.length} kinds of change, ${compared} comparisons, the same each time; a change with no mark caught; ${map.chunkCount()} chunks, ${kb} KB`);
console.log(`savecache: afresh ${fresh.toFixed(1)} ms, cached text ${cachedText.toFixed(1)} ms, cached object ${cachedObj.toFixed(1)} ms; chunks made ${map.saveCacheCount.made}, kept ${map.saveCacheCount.kept}`);
