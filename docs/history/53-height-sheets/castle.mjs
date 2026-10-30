// Sheet D: Michael's three-storey castle, built headless under Node through placement.performPlacement alone (Free building on),
// then probed. Writes nothing in the repo. Run from anywhere:
//   node castle.mjs                 the build, the probes, the edge cases; writes castle-results.json and castle-tables.md beside it
//   node castle.mjs --hash-only     the build alone, then 600 steps; prints the world's hash (the determinism child)
//   node castle.mjs --roundtrip     the build, 300 steps, a save, 300 more; a restore of the save and 300 more; prints both hashes
// The repo is read from REPO below (or the CMZ_REPO environment variable).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = process.env.CMZ_REPO || fileURLToPath(new URL("../../../", import.meta.url)).replace(/[\/]$/, ""); // the checkout this file lives in (docs/history/53-height-sheets), or CMZ_REPO
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const imp = (p) => import(pathToFileURL(path.join(REPO, p)).href);
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const MODE = process.argv.includes("--hash-only") ? "hash" : process.argv.includes("--roundtrip") ? "roundtrip" : "full";

const { bootData } = await imp("server/boot.js");
await imp("src/net.js");
const rulesMod = await imp("src/rules.js");
const map = await imp("src/map.js");
const game = await imp("src/game.js");
const loop = await imp("src/loop.js");
const placement = await imp("src/placement.js");
const interact = await imp("src/interact.js");
const prompt = await imp("src/ui/prompt.js");
const visibility = await imp("src/visibility.js");
const pathfind = await imp("src/pathfind.js");
const movement = await imp("src/entities/movement.js");
const zombieMod = await imp("src/entities/zombie.js");
const archery = await imp("src/archery.js");
const light = await imp("src/light.js");
const clock = await imp("src/clock.js");
const events = await imp("src/events.js");
const inventory = await imp("src/inventory.js");
const items = await imp("src/items.js");
const round = await imp("src/round.js");
const reach = await imp("src/reach.js");

await bootData(REPO);
const buildData = read("data/build.json");
const json = read("data/maps/flat.json");
game.create({ json, rules: { zombieAggro: false } });
rulesMod.set({ freeBuilding: true, zombieAggro: false });
loop.init({ update: (dt) => { game.begin(dt); game.step(dt, game.idleSnapshot()); }, render: () => {} });
clock.setHour(12);

const S = game.state;
let me = S.player;
const refreshMe = () => { me = game.state.player; };

// ---- the recorder ----
const msgs = [];
prompt.setMessageSink((t) => { msgs.push(t); return true; });
let started = null;
placement.init({
  startAction: (p, action) => {
    started = { label: action.label, duration: action.duration, range: action.range, tiles: action.tiles };
    const orig = action.perform;
    action.perform = function (...a) { const r = orig.apply(this, a); started.performed = r; return r; };
    return interact.startAction(p, action);
  },
});
const cmds = [];
const setPos = (x, y, L = 0) => { me.gx = x; me.gy = y; me.layer = L; me.rise = 0; me.auto = null; me.action = null; };
const where = (c) => {
  if (c.kind === "remove") return `${c.target.type} ${c.target.tx ?? c.target.id},${c.target.ty ?? ""}${c.target.edge ? " " + c.target.edge : ""}`;
  if (c.tx2 !== undefined) return `${c.tx},${c.ty} to ${c.tx2},${c.ty2}`;
  return `${c.tx},${c.ty}${c.edge ? " " + c.edge : ""}${c.dir ? " climbing " + c.dir : ""}${c.size ? " size " + c.size : ""}`;
};
function floorCount(c, L) {
  const out = new Map();
  for (let y = Math.min(c.ty, c.ty2); y <= Math.max(c.ty, c.ty2); y++) for (let x = Math.min(c.tx, c.tx2); x <= Math.max(c.tx, c.tx2); x++) { const t = map.peekTile(x, y, L); out.set(`${x},${y}`, t ? t.floor : null); }
  return out;
}
// One command as a player sends it: stand there, performPlacement, the bar run to its end by interact.updateAction (its range and
// line-of-reach checks, the cancel rule), every message said meanwhile kept.
function run(group, label, stand, cmd, note = "") {
  setPos(...stand);
  msgs.length = 0;
  started = null;
  const L = me.layer || 0;
  const v0 = map.worldVersion;
  const before = cmd.tx2 !== undefined ? floorCount(cmd, L) : null;
  let ret;
  let crash = null;
  try {
    ret = placement.performPlacement(me, cmd);
    if (me.action) interact.updateAction(me, me.action.action.duration + 1e-6);
  } catch (e) {
    crash = e;
  }
  let result;
  if (crash) result = "CRASH";
  else if (ret === false) result = "rejected (command not taken)";
  else if (started && started.performed) result = "built";
  else if (started && started.performed === false) result = "refused at completion";
  else if (started && started.performed === undefined) result = "bar cancelled";
  else if ((cmd.kind === "remove" || cmd.kind === "torch") && map.worldVersion !== v0) result = "done";
  else result = msgs.length ? "refused" : "nothing happened";
  let laid = null;
  if (before) {
    const after = floorCount(cmd, L);
    laid = 0;
    for (const [k, f] of after) if (f !== before.get(k)) laid++;
    if (result === "built") result = `built (${laid} of ${after.size} tiles)`;
  }
  const d = buildData[cmd.what] || {};
  const rec = {
    n: cmds.length + 1,
    group,
    label,
    what: cmd.what || cmd.kind,
    where: where(cmd),
    layer: L,
    stand: stand.slice(0, 2).map((v) => +v.toFixed(2)).join(","),
    result,
    words: crash ? String(crash.stack || crash).split("\n").slice(0, 3).join(" | ") : msgs.join(" / "),
    seconds: started ? +(+started.duration).toFixed(2) : 0,
    dataSeconds: d.seconds ?? null,
    changed: map.worldVersion !== v0,
    note,
  };
  cmds.push(rec);
  return rec;
}
const ok = (r) => /^(built|done)/.test(r.result);

// ---- the layout ----
const KX = 264, KY = 236; // the keep's interior, 9 by 9: x KX..KX+8, y KY..KY+8
const TX = KX + 9, TY = KY + 4; // the tower's 7 by 7 square, flush to the keep's east wall
const BX = KX + 22, BY = KY; // the bluff, 12 by 8: x BX..BX+11, y BY..BY+7
const RAMP = [BX + 5, BY + 10]; // the ramp's foot tile, climbing north to its landing (BX+5, BY+7) on layer 1
const C = { KX, KY, TX, TY, BX, BY };
const keepStand0 = [KX + 4.5, KY + 3.5, 0];
const towerShape = round.shape(TX, TY, 7);

function keepWalls(group, what, L, stand, skipFn = () => false) {
  const again = [];
  for (let i = 0; i < 9; i++) {
    for (const [tx, ty, e] of [[KX + i, KY, "n"], [KX + i, KY + 9, "n"], [KX, KY + i, "w"], [KX + 9, KY + i, "w"]]) {
      if (skipFn(tx, ty, e)) continue;
      const r = run(group, `keep wall L${L}`, stand, { kind: "build", what, tx, ty, edge: e });
      if (/step of the round wall/.test(r.words)) again.push([tx, ty, e]);
    }
  }
  // "Start it at a step of the round wall": the player builds those again from the ring outward (the last refused first).
  for (const [tx, ty, e] of again.reverse()) run(group, `keep wall L${L}, again from the ring outward`, stand, { kind: "build", what, tx, ty, edge: e });
}

function buildCastle() {
  // ===== the ground (layer 0) =====
  keepWalls("1 keep, ground", "wall_stone", 0, keepStand0);
  run("1 keep, ground", "door, south wall", keepStand0, { kind: "build", what: "door", tx: KX + 4, ty: KY + 9, edge: "n" });
  for (const [tx, ty, e] of [[KX + 1, KY + 9, "n"], [KX + 7, KY + 9, "n"], [KX, KY + 4, "w"], [KX + 9, KY + 2, "w"]]) run("1 keep, ground", "window", keepStand0, { kind: "build", what: "window", tx, ty, edge: e });
  run("1 keep, ground", "2-wide gate, keep's north wall", [KX + 3, KY + 1.6, 0], { kind: "build", what: "gate_stone_2", tx: KX + 2, ty: KY, edge: "n" });
  run("1 keep, ground", "keep stair 0 to 1", keepStand0, { kind: "build", what: "stair_stone", tx: KX + 1, ty: KY + 7, dir: "n" });
  // The wall walk's ground: a corridor one tile wide (two stone walls), from the keep's west wall west 8 tiles, then south 8.
  const walkStand = [KX - 4, KY + 4.5, 0]; // in the bailey, south of the corridor
  for (let x = KX - 8; x <= KX - 1; x++) run("2 wall walk, ground", "curtain, outer (north) wall", walkStand, { kind: "build", what: "wall_stone", tx: x, ty: KY + 1, edge: "n" });
  for (let x = KX - 7; x <= KX - 1; x++) run("2 wall walk, ground", "curtain, inner (south) wall", walkStand, { kind: "build", what: "wall_stone", tx: x, ty: KY + 2, edge: "n" });
  for (let y = KY + 1; y <= KY + 9; y++) run("2 wall walk, ground", "curtain, outer (west) wall", [KX - 11, y + 0.5, 0], { kind: "build", what: "wall_stone", tx: KX - 8, ty: y, edge: "w" });
  for (let y = KY + 2; y <= KY + 9; y++) run("2 wall walk, ground", "curtain, inner (east) wall", walkStand, { kind: "build", what: "wall_stone", tx: KX - 7, ty: y, edge: "w" });
  run("2 wall walk, ground", "curtain, south end cap", [KX - 8, KY + 12, 0], { kind: "build", what: "wall_stone", tx: KX - 8, ty: KY + 10, edge: "n" });
  run("2 wall walk, ground", "3-wide gate in the curtain's outer wall (under the walk)", [KX - 5, KY - 1.4, 0], { kind: "build", what: "gate_stone_3", tx: KX - 6, ty: KY + 1, edge: "n" });
  run("2 wall walk, ground", "door, corridor to bailey", walkStand, { kind: "build", what: "door", tx: KX - 5, ty: KY + 2, edge: "n" });

  // The tower: first where a castle has it (centred on the keep's south-east corner), then flush to the east wall near that corner.
  run("3 tower, ground", "round tower centred on the keep's SE corner", [KX + 12, KY + 13, 0], { kind: "build", what: "round_stone", tx: KX + 6, ty: KY + 6, size: 7 });
  run("3 tower, ground", "round tower flush to the keep's east wall", keepStand0, { kind: "build", what: "round_stone", tx: TX, ty: TY, size: 7 });
  const towerIn0 = [TX + 1.5, TY + 3.5, 0];
  run("3 tower, ground", "door at the tower's west door point (keep to tower)", keepStand0, { kind: "build", what: "door", tx: TX, ty: TY + 3, edge: "w" });
  run("3 tower, ground", "door at the tower's south door point (tower to outside)", [TX + 3, TY + 9, 0], { kind: "build", what: "door", tx: TX + 3, ty: TY + 7, edge: "n" });

  // The bluff: the ramp first (it brings its landing's side walls), the cliff walls round the patch less the ramp's head, then the tops.
  const rampStand = [RAMP[0], RAMP[1] + 2.5, 0];
  run("4 bluff", "stone ramp up the bluff", rampStand, { kind: "build", what: "stair_ramp_stone", tx: RAMP[0], ty: RAMP[1], dir: "n" });
  for (let i = 0; i < 12; i++) {
    run("4 bluff", "cliff wall, north", [BX + i + 0.5, BY - 2, 0], { kind: "build", what: "wall_cliff_grass", tx: BX + i, ty: BY, edge: "n" });
    if (BX + i === RAMP[0]) continue; // the ramp's head
    run("4 bluff", "cliff wall, south", rampStand, { kind: "build", what: "wall_cliff_grass", tx: BX + i, ty: BY + 8, edge: "n" });
  }
  for (let j = 0; j < 8; j++) {
    run("4 bluff", "cliff wall, west", [BX - 2, BY + j + 0.5, 0], { kind: "build", what: "wall_cliff_grass", tx: BX, ty: BY + j, edge: "w" });
    run("4 bluff", "cliff wall, east", [BX + 14, BY + j + 0.5, 0], { kind: "build", what: "wall_cliff_grass", tx: BX + 12, ty: BY + j, edge: "w" });
  }
  // Walk up the ramp as a body does (moveCircle and stairStep, the player's own movement), to prove the ramp carries a body to layer 1.
  setPos(RAMP[0], RAMP[1] + 1.2, 0);
  for (let i = 0; i < 120; i++) { const m = map.moveCircle(me.gx, me.gy, me.radius || 0.3, 0, -0.05, me.layer || 0); me.gx = m.gx; me.gy = m.gy; map.stairStep(me); }
  walkUps.push({ what: "up the ramp", end: [+me.gx.toFixed(2), +me.gy.toFixed(2)], layer: me.layer });
  run("4 bluff", "cliff tops on layer 1 (one 12 by 8 drag from the ramp's landing)", [RAMP[0], BY + 7, 1], { kind: "build", what: "floor_cliff_grass", tx: BX, ty: BY, tx2: BX + 11, ty2: BY + 7 });

  // ===== layer 1 =====
  // Up the keep's stair as a body.
  setPos(KX + 1, KY + 8.3, 0);
  for (let i = 0; i < 120; i++) { const m = map.moveCircle(me.gx, me.gy, me.radius || 0.3, 0, -0.05, me.layer || 0); me.gx = m.gx; me.gy = m.gy; map.stairStep(me); }
  walkUps.push({ what: "up the keep's stair 0 to 1", end: [+me.gx.toFixed(2), +me.gy.toFixed(2)], layer: me.layer });
  const land1 = [KX + 1, KY + 4, 1];
  run("5 keep, layer 1", "floor over the keep (9 by 9 drag from the landing)", land1, { kind: "build", what: "floor_stone", tx: KX, ty: KY, tx2: KX + 8, ty2: KY + 8 });
  run("5 keep, layer 1", "floor over the tower (7 by 7 drag)", [KX + 8, KY + 7, 1], { kind: "build", what: "floor_stone", tx: TX, ty: TY, tx2: TX + 6, ty2: TY + 6 });
  run("6 wall walk, layer 1", "walk floor along the curtain (row)", [KX, KY + 1, 1], { kind: "build", what: "floor_stone", tx: KX - 8, ty: KY + 1, tx2: KX - 1, ty2: KY + 1 });
  run("6 wall walk, layer 1", "walk floor along the curtain (the turn south)", [KX, KY + 1, 1], { kind: "build", what: "floor_stone", tx: KX - 8, ty: KY + 2, tx2: KX - 8, ty2: KY + 9 });
  run("7 tower, layer 1", "round tower ring on layer 1", [KX + 6, KY + 6, 1], { kind: "build", what: "round_stone", tx: TX, ty: TY, size: 7 });
  // The tower's own stair 0 to 1, after its ring on 1: first as a player would try it (floor over it), then with a stairwell taken up.
  run("7 tower, layer 1", "tower stair 0 to 1 (with floor over it)", towerIn0, { kind: "build", what: "stair_stone", tx: TX + 3, ty: TY + 5, dir: "n" });
  for (let y = TY + 3; y <= TY + 5; y++) run("7 tower, layer 1", "take up a floor tile for the tower's stairwell", [TX + 3, TY + 1.6, 1], { kind: "remove", target: { type: "floor", tx: TX + 3, ty: y } });
  run("7 tower, layer 1", "tower stair 0 to 1 (stairwell cleared)", towerIn0, { kind: "build", what: "stair_stone", tx: TX + 3, ty: TY + 5, dir: "n" });
  const ringEdges1 = new Set(towerShape.outline.map(([x, y, e]) => `${x},${y},${e}`));
  keepWalls("5 keep, layer 1", "wall_stone", 1, [KX + 4.5, KY + 3.5, 1]);
  run("5 keep, layer 1", "door, keep to wall walk (L1)", [KX + 2, KY + 2, 1], { kind: "build", what: "door", tx: KX, ty: KY + 1, edge: "w" });
  run("7 tower, layer 1", "door at the ring's west door point (keep to tower, L1)", [KX + 6, KY + 6, 1], { kind: "build", what: "door", tx: TX, ty: TY + 3, edge: "w" });
  for (const x of [KX + 2, KX + 6]) run("5 keep, layer 1", "window, south wall L1", [KX + 4.5, KY + 3.5, 1], { kind: "build", what: "window", tx: x, ty: KY + 9, edge: "n" });
  // Battlements on the walk's outer edges: north of the row, west of the column, and the south end.
  for (let x = KX - 8; x <= KX - 1; x++) run("6 wall walk, layer 1", "battlement, north edge", [x + 0.5, KY + 1.2, 1], { kind: "build", what: "battlement_stone", tx: x, ty: KY + 1, edge: "n" });
  for (let y = KY + 1; y <= KY + 9; y++) run("6 wall walk, layer 1", "battlement, west edge", [KX - 7.8 + 0.6, y + 0.3, 1], { kind: "build", what: "battlement_stone", tx: KX - 8, ty: y, edge: "w" });
  run("6 wall walk, layer 1", "battlement, south end", [KX - 8, KY + 8.5, 1], { kind: "build", what: "battlement_stone", tx: KX - 8, ty: KY + 10, edge: "n" });
  run("6 wall walk, layer 1", "battlement on the inner edge (the bailey side)", [KX - 4, KY + 1, 1], { kind: "build", what: "battlement_stone", tx: KX - 4, ty: KY + 2, edge: "n" });
  run("5 keep, layer 1", "keep stair 1 to 2", [KX + 4.5, KY + 3.5, 1], { kind: "build", what: "stair_stone", tx: KX + 7, ty: KY + 7, dir: "n" });

  // ===== layer 2 =====
  const land2 = [KX + 7, KY + 4, 2];
  run("8 keep, layer 2", "floor over the keep (9 by 9 drag from the landing)", land2, { kind: "build", what: "floor_stone", tx: KX, ty: KY, tx2: KX + 8, ty2: KY + 8 });
  run("8 keep, layer 2", "floor over the tower (7 by 7 drag)", [KX + 8, KY + 7, 2], { kind: "build", what: "floor_stone", tx: TX, ty: TY, tx2: TX + 6, ty2: TY + 6 });
  run("9 tower, layer 2", "round tower ring on layer 2", [KX + 6, KY + 6, 2], { kind: "build", what: "round_stone", tx: TX, ty: TY, size: 7 });
  for (let y = TY + 3; y <= TY + 5; y++) run("9 tower, layer 2", "take up a floor tile for the tower's stairwell 1 to 2", [TX + 4, TY + 1.6, 2], { kind: "remove", target: { type: "floor", tx: TX + 4, ty: y } });
  run("9 tower, layer 2", "tower stair 1 to 2", [TX + 1.5, TY + 3.5, 1], { kind: "build", what: "stair_stone", tx: TX + 4, ty: TY + 5, dir: "n" });
  keepWalls("8 keep, layer 2", "wall_stone", 2, [KX + 4.5, KY + 3.5, 2]);
  run("9 tower, layer 2", "door at the ring's west door point (keep to tower, L2)", [KX + 6, KY + 6, 2], { kind: "build", what: "door", tx: TX, ty: TY + 3, edge: "w" });
  for (const x of [KX + 2, KX + 6]) run("8 keep, layer 2", "window, south wall L2", [KX + 4.5, KY + 3.5, 2], { kind: "build", what: "window", tx: x, ty: KY + 9, edge: "n" });
  run("8 keep, layer 2", "keep stair 2 to 3", [KX + 4.5, KY + 2.5, 2], { kind: "build", what: "stair_stone", tx: KX + 4, ty: KY + 7, dir: "n" });

  // ===== layer 3 =====
  run("10 keep, layer 3", "floor over the keep (9 by 9 drag from the landing)", [KX + 4, KY + 4, 3], { kind: "build", what: "floor_stone", tx: KX, ty: KY, tx2: KX + 8, ty2: KY + 8 });
  keepWalls("10 keep, layer 3", "wall_stone", 3, [KX + 4.5, KY + 2.5, 3]);

  // ===== the second keep, on the bluff's layer-1 top =====
  const bk = [BX + 1, BY]; // a 9 by 9 keep, its south row past the bluff's edge on purpose (as much as the rules allow)
  const bStand1 = [BX + 5.5, BY + 3.5, 1];
  for (let i = 0; i < 9; i++) {
    for (const [tx, ty, e] of [[bk[0] + i, bk[1], "n"], [bk[0] + i, bk[1] + 9, "n"], [bk[0], bk[1] + i, "w"], [bk[0] + 9, bk[1] + i, "w"]]) run("11 bluff keep, layer 1", "bluff keep wall L1", bStand1, { kind: "build", what: "wall_stone", tx, ty, edge: e });
  }
  run("11 bluff keep, layer 1", "door, bluff keep west wall", bStand1, { kind: "build", what: "door", tx: bk[0], ty: BY + 3, edge: "w" });
  run("11 bluff keep, layer 1", "bluff keep stair 1 to 2", bStand1, { kind: "build", what: "stair_stone", tx: BX + 3, ty: BY + 6, dir: "n" });
  run("12 bluff keep, layer 2", "floor over the bluff keep (9 by 9 drag)", [BX + 3, BY + 3, 2], { kind: "build", what: "floor_stone", tx: bk[0], ty: bk[1], tx2: bk[0] + 8, ty2: bk[1] + 8 });
  for (let i = 0; i < 9; i++) {
    for (const [tx, ty, e] of [[bk[0] + i, bk[1], "n"], [bk[0] + i, bk[1] + 9, "n"], [bk[0], bk[1] + i, "w"], [bk[0] + 9, bk[1] + i, "w"]]) run("12 bluff keep, layer 2", "bluff keep wall L2", [BX + 5.5, BY + 2.5, 2], { kind: "build", what: "wall_stone", tx, ty, edge: e });
  }
  setPos(KX + 4.5, KY + 3.5, 0);
}

const walkUps = [];
const tBuild0 = performance.now();
buildCastle();
const buildMs = performance.now() - tBuild0;

if (MODE === "hash" || MODE === "roundtrip") {
  rulesMod.set({ zombieAggro: true });
  setPos(KX - 5, KY + 1, 1);
  S.zombies.push(zombieMod.createZombie(KX - 5, KY - 0.2, { aggro: true }));
  const steps = (n) => { for (let i = 0; i < n; i++) loop.advance(1 / 60); };
  if (MODE === "hash") {
    steps(600);
    console.log(`hash ${game.hashOf(game.hashText())} after 600 steps; ${cmds.length} commands; ${S.zombies.length} dead`);
  } else {
    steps(300);
    const raw = JSON.stringify(game.serialize());
    const snap = JSON.parse(raw);
    steps(300);
    const a = game.hashText();
    game.restore(snap, json);
    steps(300);
    const b = game.hashText();
    console.log(`roundtrip ${game.hashOf(a)} ${game.hashOf(b)} ${a === b ? "the same" : "DIFFERENT"} save ${raw.length} bytes`);
    if (a !== b) {
      const x = a.split("\n"), y = b.split("\n");
      for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) { console.log(`first difference at line ${i}:\n  ${x[i]}\n  ${y[i]}`); break; }
    }
  }
  process.exit(0);
}

// ===================== the probes =====================
const probes = [];
const probe = (name, call, result) => probes.push({ name, call, result: typeof result === "string" ? result : JSON.stringify(result) });
const tryIt = (f) => { try { return f(); } catch (e) { return `THREW ${String(e.stack || e).split("\n").slice(0, 2).join(" | ")}`; } };

// --- rooms per layer ---
map.rebuildRooms();
const roomOf = (x, y, L) => {
  const id = map.roomAt(x, y, L);
  const r = id > 0 ? map.getRoom(id) : null;
  return r ? { id, size: r.size, layer: r.layer, openings: r.openings.length, sealed: map.roomSealed(r) } : { id, outdoors: id === 0 };
};
for (const [name, x, y, L] of [
  ["keep, ground", KX + 4, KY + 4, 0], ["tower, ground", TX + 3, TY + 3, 0], ["walk corridor, ground", KX - 4, KY + 1, 0], ["bailey (south of the walk)", KX - 4, KY + 5, 0],
  ["inside the bluff, ground", BX + 3, BY + 3, 0], ["the ramp's landing tile, ground", RAMP[0], BY + 7, 0],
  ["keep, layer 1", KX + 4, KY + 4, 1], ["tower, layer 1", TX + 3, TY + 1, 1], ["wall walk, layer 1", KX - 4, KY + 1, 1], ["bluff top outside the bluff keep, layer 1", BX + 11, BY + 7, 1], ["bluff keep, layer 1", BX + 5, BY + 3, 1],
  ["keep, layer 2", KX + 4, KY + 4, 2], ["tower, layer 2", TX + 3, TY + 1, 2], ["bluff keep, layer 2", BX + 5, BY + 3, 2], ["keep, layer 3", KX + 4, KY + 4, 3],
]) probe(`room: ${name}`, `map.roomAt(${x}, ${y}, ${L}) then map.getRoom(id), map.roomSealed(room)`, tryIt(() => roomOf(x, y, L)));
probe("rooms in the world", "map.roomCount()", String(map.roomCount()));

// --- line of sight across storeys ---
probe("lineOfSight's signature", "visibility.lineOfSight.toString().split('{')[0]", visibility.lineOfSight.toString().split("{")[0].trim());
const walkPt = [KX - 2, KY + 1]; // the walk over the curtain's plain stone wall
const gateWalk = [KX - 5, KY + 1]; // the walk over the curtain's 3-wide gate
const outPt = [KX - 2, KY - 4];
for (const L of [0, 1]) {
  probe(`sight from the walk (${walkPt}) to the ground outside (${outPt}), layer ${L}`, `lineOfSight(${walkPt}, ${outPt}, ${L})`, String(tryIt(() => visibility.lineOfSight(walkPt[0], walkPt[1], outPt[0], outPt[1], L))));
  probe(`sight from the ground outside to the walk, layer ${L}`, `lineOfSight(${outPt}, ${walkPt}, ${L})`, String(tryIt(() => visibility.lineOfSight(outPt[0], outPt[1], walkPt[0], walkPt[1], L))));
}
for (const L of [0, 1]) probe(`sight from the walk over the gate (${gateWalk}) to the ground outside (${gateWalk[0]},${KY - 4}), layer ${L}`, `lineOfSight(${gateWalk}, ${gateWalk[0]}, ${KY - 4}, ${L})`, String(tryIt(() => visibility.lineOfSight(gateWalk[0], gateWalk[1], gateWalk[0], KY - 4, L))));
const winPt = [KX + 2, KY + 8];
const below = [KX + 2, KY + 13];
{
  setPos(winPt[0], winPt[1], 2);
  const o = interact.actionsForTarget({ kind: "edge", tx: KX + 2, ty: KY + 9, edge: "n" }, me).find((a) => /^Open/.test(a.label));
  if (o) o.perform();
}
for (const L of [0, 2]) probe(`sight from inside the layer-2 window (${winPt}) to the ground outside (${below}), layer ${L}`, `lineOfSight(${winPt}, ${below}, ${L})`, String(tryIt(() => visibility.lineOfSight(winPt[0], winPt[1], below[0], below[1], L))));
{
  const w = map.tileAt(KX + 2, KY + 9, 2).n;
  probe("the layer-2 window's state", "map.tileAt(KX+2, KY+9, 2).n", w ? { kind: w.kind, shutter: w.shutter, open: w.open } : null);
}

// --- canStep and the pathfinder ---
probe("findPath's signature", "pathfind.findPath.toString().split('{')[0]", pathfind.findPath.toString().split("{")[0].trim());
probe("repath's signature (the dead's cross-layer path)", "movement.repath.toString().split('{')[0]", movement.repath.toString().split("{")[0].trim());
const gateOut = [KX - 5, KY]; // outside the curtain's 3-wide gate
probe("the tower's curve-crossed and held-off tiles (relative to its square)", "round.shape(TX, TY, 7).crossed / .unreachable", { crossed: towerShape.crossed.map(([x, y]) => [x - TX, y - TY]), unreachable: (towerShape.unreachable || []).map(([x, y]) => [x - TX, y - TY]) });
probe("canStep through the shut curtain gate", `map.canStep(${gateOut}, ${KX - 5}, ${KY + 1}, 0)`, String(map.canStep(gateOut[0], gateOut[1], KX - 5, KY + 1, 0)));
{
  const z = zombieMod.createZombie(gateOut[0], gateOut[1], { aggro: false });
  movement.repath(z, map.addr(walkPt[0], walkPt[1], 1));
  probe("one of the dead at the curtain gate, a path to the walk (layer 1), everything shut", `repath(z at ${gateOut} L0, addr(${walkPt}, 1))`, { pathFailed: z.pathFailed, len: z.path.length, path: z.path.slice(0, 40) });
  map.setGateOpen(KX - 6, KY + 1, "n", true, 0);
  for (const [x, y, e, L] of [[KX - 5, KY + 2, "n", 0], [KX + 4, KY + 9, "n", 0], [KX, KY + 1, "w", 1]]) { const w = map.tileAt(x, y, L)[e]; if (w) { w.open = true; map.touch(x, y, L); } }
  map.markRoomsDirty();
  movement.repath(z, map.addr(walkPt[0], walkPt[1], 1));
  probe("the same with the curtain gate, the corridor door, the keep door, and the L1 walk door open", `setGateOpen + doors open, repath(...)`, { pathFailed: z.pathFailed, len: z.path.length, path: z.path });
  map.setGateOpen(KX - 6, KY + 1, "n", false, 0);
  for (const [x, y, e, L] of [[KX - 5, KY + 2, "n", 0], [KX + 4, KY + 9, "n", 0], [KX, KY + 1, "w", 1]]) { const w = map.tileAt(x, y, L)[e]; if (w) { w.open = false; map.touch(x, y, L); } }
  map.markRoomsDirty();
  const z2 = zombieMod.createZombie(RAMP[0], RAMP[1] + 3, { aggro: false });
  movement.repath(z2, map.addr(BX + 10, BY + 6, 1));
  probe("one of the dead at the ramp's foot, a path to the bluff top outside the bluff keep (layer 1)", `repath(z at ${RAMP[0]},${RAMP[1] + 3} L0, addr(${BX + 10}, ${BY + 6}, 1))`, { pathFailed: z2.pathFailed, len: z2.path.length, path: z2.path });
  movement.repath(z2, map.addr(BX + 5, BY + 3, 2));
  probe("the same dead one, a path to the bluff keep's layer 2 (two storeys up: ramp then stair)", `repath(z, addr(${BX + 5}, ${BY + 3}, 2))`, { pathFailed: z2.pathFailed, len: z2.path.length, path: z2.path });
  probe("findPath on layer 1 alone, keep's L1 landing to the walk", `findPath([${KX + 1},${KY + 4}], [${walkPt}], canStepOn(1), 4000)`, tryIt(() => { const p = pathfind.findPath([KX + 1, KY + 4], walkPt, map.canStepOn(1), 4000); return p ? { len: p.length } : null; }));
}

// --- the dead at the gate, the player on the walk, 600 steps ---
function deadRun(label, setup, steps = 600, every = 60, aggro = true) {
  const snap = JSON.parse(JSON.stringify(game.serialize()));
  refreshMe();
  const kept = S.zombies.slice();
  S.zombies = [];
  rulesMod.set({ zombieAggro: true });
  setPos(gateWalk[0], gateWalk[1], 1);
  const z = zombieMod.createZombie(gateOut[0], gateOut[1] - 0.2, { aggro });
  S.zombies.push(z);
  setup && setup(z);
  const log = [];
  const t0 = performance.now();
  for (let i = 1; i <= steps; i++) {
    loop.advance(1 / 60);
    if (i % every === 0) log.push({ step: i, state: z.state, at: [+z.gx.toFixed(2), +z.gy.toFixed(2)], layer: z.layer || 0, target: z.target ? z.target.id : null, huntsPlayer: z.huntsPlayer, breach: z.breach ? `${z.breach.tx},${z.breach.ty} ${z.breach.edge}` : null, siege: z.siege ? z.siege.openings.length + " openings" : null, press: z.press ? `${z.press.tx},${z.press.ty}` : null, path: z.path.length, lastSeen: z.lastSeen, player: [+me.gx.toFixed(2), +me.gy.toFixed(2), me.layer || 0], hp: me.hp });
  }
  const ms = performance.now() - t0;
  probe(`the dead at the gate, ${label} (${steps} steps, ${ms.toFixed(0)} ms)`, `zombieAggro on; createZombie(at the curtain gate, aggro true); loop.advance(1/60) x ${steps}`, log);
  S.zombies = kept;
  rulesMod.set({ zombieAggro: false });
  game.restore(snap, json);
  refreshMe();
}
deadRun("the player on the walk above it, gate shut", null);
deadRun("the player on the walk above it, gate shut, run on (the stair-first path's end)", null, 4800, 600);
deadRun("the player on the walk above it, gate shut, the dead one fresh (has seen no one: aggro false at its spawn)", null, 600, 60, false);
deadRun("the player on the walk above it, gate open", () => map.setGateOpen(KX - 6, KY + 1, "n", true, 0));
deadRun("the player on the ground in the bailey, gate shut (a control: sight through the bars)", () => setPos(KX - 4, KY + 5, 0));

// --- a bow shot from the walk toward the ground ---
const landed = [];
events.on("arrowLanded", (p) => landed.push({ at: [+p.gx.toFixed(2), +p.gy.toFixed(2)], layer: p.arrow.layer, stoppedBy: p.stoppedBy, hit: p.hit ? p.hit.id : null, kept: p.kept }));
function shot(label, from, aim) {
  const me2 = game.state.player;
  me2.gx = from[0]; me2.gy = from[1]; me2.layer = from[2]; me2.rise = 0; me2.recover = 0; me2.draw = null;
  const bow = items.makeEntry("bow");
  inventory.equip(me2, bow);
  inventory.addItem(inventory.bagOf(me2), "arrow", 5);
  const L = archery.launcherOf(me2);
  const began = archery.beginDraw(me2, L, "script");
  if (began) { me2.draw.t = 5; me2.draw.c = 1; }
  landed.length = 0;
  const a = began ? archery.releaseDraw(me2, { aimAt: aim }) : null;
  for (let i = 0; i < 240 && !landed.length; i++) archery.update(1 / 60);
  const lay = landed[0];
  const itemsThere = lay ? [0, 1, 2].map((Lx) => ({ layer: Lx, items: map.itemsAt(Math.round(lay.at[0]), Math.round(lay.at[1]), Lx).map((e) => e.id) })) : null;
  const floorThere = lay ? [0, 1, 2].map((Lx) => ({ layer: Lx, floor: (map.peekTile(Math.round(lay.at[0]), Math.round(lay.at[1]), Lx) || {}).floor })) : null;
  probe(`bow shot: ${label}`, `beginDraw(player at ${from}, launcherOf, "script"); draw.c = 1; releaseDraw(player, { aimAt: [${aim}] }); archery.update until arrowLanded`, { began, arrow: a ? { layer: a.layer, z0: a.z0, s: +a.s.toFixed(2), H: +a.H.toFixed(1), stopD: a.stopD, stopWhy: a.stopWhy } : null, landed: lay || null, itemsThere, floorThere, said: msgs.slice(-2) });
}
msgs.length = 0;
shot("from the walk (layer 1) north over the battlement to the ground (over plain wall)", [walkPt[0], walkPt[1], 1], [walkPt[0], walkPt[1] - 7]);
shot("from the walk (layer 1) above the 3-wide gate, north to the ground", [gateWalk[0], gateWalk[1], 1], [gateWalk[0], gateWalk[1] - 7]);
shot("from the walk (layer 1) south into the bailey", [walkPt[0], walkPt[1], 1], [walkPt[0], walkPt[1] + 7]);
shot("from the keep's layer-2 window tile south to the ground", [KX + 2, KY + 8, 2], [KX + 2, KY + 15]);
shot("from the bluff top (layer 1) north to the ground", [BX + 6, BY + 0.6, 1], [BX + 6, BY - 7]);
shot("control: on the ground, north of the keep, north over open grass", [KX + 4, KY - 3, 0], [KX + 4, KY - 10]);

// --- light: a torch on a layer-1 wall, and what the ground below reads ---
{
  clock.setHour(0);
  refreshMe();
  const me3 = me;
  const torchEntry = () => { const f = inventory.findItem(me3, "torch"); return f ? f.entry : (me3.hands.main && me3.hands.main.id === "torch" ? me3.hands.main : null); };
  let t = torchEntry();
  if (!t) { inventory.addItem(inventory.bagOf(me3), "torch", 2); t = torchEntry(); }
  const groundTile = [KX + 3, KY + 10];
  light.update();
  const before = { ground: +light.lightAt(groundTile[0], groundTile[1], 0).toFixed(3), insideL1: +light.lightAt(KX + 3, KY + 1, 1).toFixed(3) };
  if (t) t.lit = true;
  run("probe: light", "torch on the keep's layer-1 north wall (inner face), as a player", [KX + 3, KY + 2, 1], { kind: "torch", uid: t && t.uid, tx: KX + 3, ty: KY, edge: "n" });
  run("probe: light", "torch on the keep's layer-1 south wall (outer face, over the void)", [KX + 3, KY + 7, 1], { kind: "torch", uid: t && t.uid, tx: KX + 3, ty: KY + 9, edge: "n" });
  t = torchEntry(); if (t) t.lit = true;
  const r0 = run("probe: light", "control: torch on the keep's ground south wall (outer face)", [KX + 3, KY + 10.5, 0], { kind: "torch", uid: t && t.uid, tx: KX + 3, ty: KY + 9, edge: "n" });
  light.update();
  const withGround = { ground: +light.lightAt(groundTile[0], groundTile[1], 0).toFixed(3), insideL1: +light.lightAt(KX + 3, KY + 1, 1).toFixed(3), walkL1: +light.lightAt(KX + 3, KY + 10, 1).toFixed(3) };
  // Not a player's path: a lit bracket put straight on the layer-1 south wall, to read what light does with a storey's torch.
  const farGround = [KX + 7, KY + 10]; // three tiles east of the ground torch
  const beforeUpper = { groundBelow: +light.lightAt(farGround[0], farGround[1], 0).toFixed(3), voidL1Outside: +light.lightAt(farGround[0], farGround[1], 1).toFixed(3) };
  const b = map.addBracket(KX + 7, KY + 9, "n", 1, true, false, true, 1);
  map.touch(KX + 5, KY + 9, 1);
  light.update();
  const withUpper = { groundBelow: +light.lightAt(farGround[0], farGround[1], 0).toFixed(3), voidL1Outside: +light.lightAt(farGround[0], farGround[1], 1).toFixed(3), insideL1: +light.lightAt(KX + 7, KY + 8, 1).toFixed(3) };
  if (b) { map.removeBracket(b); map.touch(KX + 7, KY + 9, 1); }
  probe("light at midnight round the keep's south wall", "light.update(); light.lightAt(x, y, layer)", { before, afterGroundTorch: withGround, groundTorchResult: r0.result, beforeBracketOnL1: beforeUpper, afterBracketOnL1SouthWall_notAPlayersPath: withUpper, readAt: `ground ${farGround} (L0) and the same x,y on L1` });
  clock.setHour(12);
}

// --- the save: serialize, restore into a fresh world, compare the sync parts ---
{
  const parts0 = game.syncParts();
  const t0 = performance.now();
  const raw = JSON.stringify(game.serialize());
  const ser = performance.now() - t0;
  const stairs0 = map.stairs().length, rings0 = map.allRings().length;
  game.create({ json, rules: { zombieAggro: false } }); // a fresh world first, so nothing of the castle is left in memory
  refreshMe();
  const t1 = performance.now();
  game.restore(JSON.parse(raw), json);
  refreshMe();
  const res = performance.now() - t1;
  const parts1 = game.syncParts();
  const differ = Object.keys(parts0).filter((k) => String(parts0[k]) !== String(parts1[k]));
  probe("the save: serialize, a fresh world, restore, sync parts compared", "game.serialize(); game.create(fresh); game.restore(save, json); game.syncParts()", { bytes: raw.length, serializeMs: +ser.toFixed(1), restoreMs: +res.toFixed(1), partsDiffer: differ, before: Object.fromEntries(differ.map((k) => [k, parts0[k]])), after: Object.fromEntries(differ.map((k) => [k, parts1[k]])), stairs: [stairs0, map.stairs().length], rings: [rings0, map.allRings().length], gates: [map.gateMembers(KX + 2, KY, "n", 0).length, map.gateMembers(KX - 6, KY + 1, "n", 0).length] });
  rulesMod.set({ freeBuilding: true, zombieAggro: false });
}

// --- chunk records' sizes ---
{
  const out = [];
  const cxs = new Set(), cys = new Set();
  for (const x of [KX - 8, KX, TX + 6, BX, BX + 11]) cxs.add(Math.floor(x / map.CHUNK));
  for (const y of [KY, KY + 10, TY + 6]) cys.add(Math.floor(y / map.CHUNK));
  const per = {};
  for (const L of [0, 1, 2, 3]) for (const cx of cxs) for (const cy of cys) {
    const c = map.getChunk(cx, cy, false, L);
    if (!c) continue;
    const n = JSON.stringify(map.serializeChunk(c)).length;
    out.push({ layer: L, chunk: `${cx},${cy}`, bytes: n });
    per[L] = (per[L] || 0) + n;
  }
  probe("chunk records (JSON bytes) under the castle, by layer and chunk", "JSON.stringify(map.serializeChunk(map.getChunk(cx, cy, false, layer))).length", { perLayer: per, chunks: out });
}

// --- determinism: the build and 600 steps in two fresh processes, and the roundtrip ---
{
  const h = [0, 1].map(() => execFileSync(process.execPath, [SELF, "--hash-only"], { encoding: "utf8" }).trim());
  probe("determinism: the castle built and 600 steps in two fresh processes", "node castle.mjs --hash-only (twice)", { runs: h, same: h[0] === h[1] });
  const rt = execFileSync(process.execPath, [SELF, "--roundtrip"], { encoding: "utf8" }).trim();
  probe("the roundtrip: 300 steps, a save, 300 more; the save restored and 300 more", "node castle.mjs --roundtrip", rt);
}

// ===================== 4. what a player might try =====================
rulesMod.set({ freeBuilding: true, zombieAggro: false });
const E = "13 what a player might try";
// (a) a floor on layer 2 where layer 1 has none: through an opened layer-2 window, a balcony out over the void.
{
  const acts = (() => { setPos(KX + 2, KY + 8, 2); return interact.actionsForTarget({ kind: "edge", tx: KX + 2, ty: KY + 9, edge: "n" }, me); })();
  const open = acts.find((a) => /^Open/.test(a.label));
  if (open) open.perform();
  probe("the layer-2 window's actions from inside (the guest's click path)", `interact.actionsForTarget({ kind: "edge", tx: ${KX + 2}, ty: ${KY + 9}, edge: "n" }, player on L2)`, acts.map((a) => a.label));
  run(E, "a floor on layer 2 out of the opened window, layer 1 has none under it", [KX + 2, KY + 8, 2], { kind: "build", what: "floor_wood", tx: KX + 1, ty: KY + 9, tx2: KX + 3, ty2: KY + 10 });
}
// (b) a stair whose top lands on the tower's stepped tile on layer 1 (from outside, climbing west into the tower)
run(E, "a stair whose landing is a stepped tile inside the tower (L1)", [TX + 11, TY + 3, 0], { kind: "build", what: "stair_stone", tx: TX + 9, ty: TY + 3, dir: "w" });
{
  // A crossed tile whose stair (three tiles south of it, climbing north) stands on stepped, uncrossed tiles of the tower's ground.
  const st = (x, y) => round.isStepped(TX, TY, 7, x, y);
  const crossedSet = new Set(towerShape.crossed.map(([x, y]) => `${x},${y}`));
  const c = towerShape.crossed.find(([x, y]) => [1, 2, 3, 4].every((k) => st(x, y + k) && !crossedSet.has(`${x},${y + k}`)) && !map.stairAt(x, y + 1, 0) && !map.stairAt(x, y + 2, 0) && !map.stairAt(x, y + 3, 0));
  if (c) {
    for (let k = 1; k <= 3; k++) run(E, "take up the tower's L1 floor for a stairwell under a curve-crossed landing", [TX + 3, TY + 1.5, 1], { kind: "remove", target: { type: "floor", tx: c[0], ty: c[1] + k } });
    run(E, `a stair inside the tower whose landing (${c[0] - TX},${c[1] - TY} of its square) is a curve-crossed tile (L1)`, [TX + 3.5, TY + 5.5, 0], { kind: "build", what: "stair_wood", tx: c[0], ty: c[1] + 3, dir: "n" });
  } else probe("a crossed tile to land a stair on", "towerShape.crossed", "none fits");
}
// (c) a battlement on the ground
run(E, "a battlement on the ground, on the keep's stone wall", [KX + 4, KY + 11, 0], { kind: "build", what: "battlement_stone", tx: KX + 3, ty: KY + 9, edge: "n" });
run(E, "a battlement on the ground, on an empty edge", [KX + 4, KY + 13, 0], { kind: "build", what: "battlement_stone", tx: KX + 4, ty: KY + 12, edge: "n" });
// (d) a gate on a storey
run(E, "a 2-wide gate in the keep's layer-1 north wall (void outside)", [KX + 3, KY + 1.6, 1], { kind: "build", what: "gate_stone_2", tx: KX + 2, ty: KY, edge: "n" });
run(E, "a 3-wide gate in the bluff keep's layer-1 west wall (cliff top both sides)", [BX + 3, BY + 5, 1], { kind: "build", what: "gate_stone_3", tx: BX + 1, ty: BY + 4, edge: "w" });
// (g) a ramp on a storey (on the top storey, so nothing below is cut)
run(E, "a stone ramp on the keep's layer 3", [KX + 2, KY + 4, 3], { kind: "build", what: "stair_ramp_stone", tx: KX + 6, ty: KY + 7, dir: "n" });
{
  const sides = [[KX + 6, KY + 4, "n"], [KX + 6, KY + 5, "n"], [KX + 6, KY + 4, "w"], [KX + 7, KY + 4, "w"]].map(([x, y, e]) => { const w = (map.peekTile(x, y, 3) || {})[e]; return `${x},${y} ${e}: ${w ? w.sprite : "none"}`; });
  probe("after the ramp on layer 3: the walls round its landing's tile on layer 3", "map.peekTile(x, y, 3)[edge]", sides);
  probe("after the ramp on layer 3: its landing on layer 4", `map.peekTile(${KX + 6}, ${KY + 4}, 4).floor`, String((map.peekTile(KX + 6, KY + 4, 4) || {}).floor));
}
{
  setPos(BX + 2.5, BY + 5, 1);
  probe("the 3-wide gate on the bluff's layer 1: its actions from beside it on layer 1", "interact.actionsForTarget({ kind: 'edge', ... }, player on L1)", interact.actionsForTarget({ kind: "edge", tx: BX + 1, ty: BY + 5, edge: "w" }, me).map((a) => a.label));
}
run(E, "a stone wall outside the keep, ordered from inside it (in reach, behind the keep's wall)", keepStand0, { kind: "build", what: "wall_stone", tx: KX + 4, ty: KY - 3, edge: "n" });
run(E, "take apart a wall the ramp on layer 3 laid round its landing's tile", [KX + 5, KY + 3, 3], { kind: "remove", target: { type: "wall", tx: KX + 6, ty: KY + 4, edge: "w" } });
// The natural order for a tower (its stair first, then its upper floor, then the upper ring), on a small one south of the keep.
{
  const X = KX, Y = KY + 13;
  run(E, "trap: a 5 by 5 tower on the ground", [X + 2, Y + 7, 0], { kind: "build", what: "round_stone", tx: X, ty: Y, size: 5 });
  run(E, "trap: its door at the south door point", [X + 2, Y + 7, 0], { kind: "build", what: "door", tx: X + 2, ty: Y + 5, edge: "n" });
  run(E, "trap: its stair first, 0 to 1", [X + 1, Y + 3, 0], { kind: "build", what: "stair_stone", tx: X + 2, ty: Y + 3, dir: "n" });
  run(E, "trap: its floor on layer 1 from the landing", [X + 2, Y, 1], { kind: "build", what: "floor_stone", tx: X, ty: Y, tx2: X + 4, ty2: Y + 4 });
  run(E, "trap: its ring on layer 1", [X + 2, Y, 1], { kind: "build", what: "round_stone", tx: X, ty: Y, size: 5 });
}
// (e) a round room on layer 3
run(E, "a 5 by 5 round room on layer 3 over the stair's landing", [KX + 6, KY + 6, 3], { kind: "build", what: "round_stone", tx: KX + 2, ty: KY, size: 5 });
run(E, "a 5 by 5 round room on layer 3 over the stairwell", [KX + 6, KY + 1, 3], { kind: "build", what: "round_stone", tx: KX + 2, ty: KY + 3, size: 5 });
run(E, "a 5 by 5 round room on layer 3, clear of the stair", [KX + 7, KY + 1, 3], { kind: "build", what: "round_stone", tx: KX, ty: KY, size: 5 });
// (f) a cliff top over a storey floor
run(E, "a cliff top over the keep's layer-1 stone floor", [KX + 4, KY + 4, 1], { kind: "build", what: "floor_cliff_top", tx: KX + 3, ty: KY + 2, tx2: KX + 3, ty2: KY + 2 });
// (h) removing a layer-1 floor that a layer-2 floor stands over
run(E, "take up a layer-1 keep floor tile under the layer-2 floor", [KX + 4, KY + 2, 1], { kind: "remove", target: { type: "floor", tx: KX + 3, ty: KY + 3 } });
// (i) removing the only stair while a body is upstairs
{
  setPos(TX + 3, TY + 1, 2); // a body upstairs in the tower
  const r1 = run(E, "remove the keep's stair 0 to 1 (a stair addressed as the command allows nothing else)", [KX + 2, KY + 8, 0], { kind: "remove", target: { type: "stair", tx: KX + 1, ty: KY + 7 } });
  const r2 = run(E, "take up the keep stair 1 to 2's landing floor", [KX + 6, KY + 4, 2], { kind: "remove", target: { type: "floor", tx: KX + 7, ty: KY + 4 } });
  const r3 = run(E, "take up the floor before the keep stair 1 to 2's foot", [KX + 6, KY + 8, 1], { kind: "remove", target: { type: "floor", tx: KX + 7, ty: KY + 8 } });
}
// (j) a wall on layer 1 with no floor
run(E, "a stone wall on layer 1 with no floor either side", [KX + 4, KY + 4, 1], { kind: "build", what: "wall_stone", tx: KX + 4, ty: KY - 3, edge: "n" });
// (k) a door upstairs with nothing outside it
run(E, "a door in the keep's layer-1 north wall (void outside)", [KX + 4, KY + 2, 1], { kind: "build", what: "door", tx: KX + 4, ty: KY, edge: "n" });
// (l) a window on a battlement's edge
run(E, "a window on a battlement", [walkPt[0], walkPt[1], 1], { kind: "build", what: "window", tx: KX - 3, ty: KY + 1, edge: "n" });
// (m) a torch on a cliff wall
{
  if (!inventory.findItem(me, "torch")) inventory.addItem(inventory.bagOf(me), "torch", 1);
  const f = inventory.findItem(me, "torch");
  const t = f ? f.entry : null;
  run(E, "a torch on the bluff's south cliff wall (outer face)", [BX + 2, BY + 9.5, 0], { kind: "torch", uid: t && t.uid, tx: BX + 2, ty: BY + 8, edge: "n" }, t ? "" : "no torch carried");
}
// (n) a floor over the top of a ring (a roof): on layer 3 over the tower
run(E, "a floor on layer 3 over the tower's top (a roof over the L2 ring), from inside the keep's L3 walls", [KX + 8, KY + 7, 3], { kind: "build", what: "floor_stone", tx: TX, ty: TY, tx2: TX + 6, ty2: TY + 6 });
run(E, "a window in the keep's L3 east wall, to reach the tower's top", [KX + 7, KY + 7, 3], { kind: "build", what: "window", tx: KX + 9, ty: KY + 7, edge: "w" });
{
  setPos(KX + 8, KY + 7, 3);
  const o = interact.actionsForTarget({ kind: "edge", tx: KX + 9, ty: KY + 7, edge: "w" }, me).find((a) => /^Open/.test(a.label));
  if (o) o.perform();
}
run(E, "the roof over the tower again, through the opened L3 window", [KX + 8, KY + 7, 3], { kind: "build", what: "floor_stone", tx: TX, ty: TY, tx2: TX + 6, ty2: TY + 6 });
// (o) the curtain's gate opened by E with the player on the walk above it
{
  refreshMe();
  setPos(KX - 5, KY + 1, 1);
  const before = map.gateMembers(KX - 6, KY + 1, "n", 0).map((m) => m.wall.open);
  const snap = { ...game.idleSnapshot(), keys: { eTap: true } };
  loop.advance(0); // nothing
  game.begin(1 / 60);
  game.step(1 / 60, { [me.id]: snap });
  const after = map.gateMembers(KX - 6, KY + 1, "n", 0).map((m) => m.wall.open);
  const acts = interact.actionsForTarget({ kind: "edge", tx: KX - 5, ty: KY + 1, edge: "n" }, me);
  probe("E pressed on the walk above the curtain's gate (the key event in the step's snapshot)", `game.step(dt, { [player.id]: { ...idleSnapshot(), keys: { eTap: true } } }) with the player at ${KX - 5},${KY + 1} on L1`, { gateOpenBefore: before, gateOpenAfter: after, actionsForTargetFromTheWalk: acts.map((a) => a.label), nearestSimpleAction: (interact.nearestSimpleAction(me) || {}).label || null });
  setPos(KX - 5, KY - 0.8, 0);
  const acts0 = interact.actionsForTarget({ kind: "edge", tx: KX - 5, ty: KY + 1, edge: "n" }, me);
  probe("control: the same gate's actions from the ground outside it", "interact.actionsForTarget(edge, player on L0)", acts0.map((a) => a.label));
}

// ===================== the report's tables =====================
const totalSec = cmds.filter((c) => !/^probe|^13/.test(c.group)).reduce((s, c) => s + (ok(c) ? c.seconds : 0), 0);
const byGroup = {};
for (const c of cmds) {
  const g = (byGroup[c.group] = byGroup[c.group] || { n: 0, built: 0, refused: 0, sec: 0 });
  g.n++;
  if (ok(c)) { g.built++; g.sec += c.seconds; } else g.refused++;
}
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
let md = `Built by castle.mjs on ${new Date().toISOString()}; ${cmds.length} commands in ${buildMs.toFixed(0)} ms of build; the walk-ups: ${JSON.stringify(walkUps)}\n\n`;
md += `Layout: keep interior x ${KX}..${KX + 8}, y ${KY}..${KY + 8}; tower square ${TX},${TY} (7); wall walk row y ${KY + 1} x ${KX - 8}..${KX - 1} and column x ${KX - 8} y ${KY + 2}..${KY + 9}; bluff x ${BX}..${BX + 11}, y ${BY}..${BY + 7}, ramp foot ${RAMP}.\n\n`;
md += `### Seconds by group (build bars only, the castle's groups)\n\n| group | commands | built | refused | seconds built |\n|---|---|---|---|---|\n`;
for (const [g, v] of Object.entries(byGroup)) md += `| ${esc(g)} | ${v.n} | ${v.built} | ${v.refused} | ${v.sec.toFixed(0)} |\n`;
md += `\nTotal bar time of the castle as built (groups 1 to 12): ${totalSec.toFixed(0)} s = ${(totalSec / 60).toFixed(1)} min.\n\n`;
md += `### Every command\n\n| # | group | what | id | where | L | result | words | s |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const c of cmds) md += `| ${c.n} | ${esc(c.group)} | ${esc(c.label)} | ${esc(c.what)} | ${esc(c.where)} | ${c.layer} | ${esc(c.result)} | ${esc(c.words)} | ${c.seconds} |\n`;
md += `\n### Probes\n\n`;
for (const p of probes) md += `- **${esc(p.name)}**\n  - call: \`${p.call}\`\n  - result: \`${p.result.length > 3000 ? p.result.slice(0, 3000) + "..." : p.result}\`\n`;
fs.writeFileSync(path.join(HERE, "castle-tables.md"), md);
fs.writeFileSync(path.join(HERE, "castle-results.json"), JSON.stringify({ C, walkUps, cmds, probes, buildMs, totalSec }, null, 1));
console.log(`${cmds.length} commands (${cmds.filter(ok).length} built), ${probes.length} probes, bar total ${totalSec.toFixed(0)} s; crashes: ${cmds.filter((c) => c.result === "CRASH").length}`);
for (const c of cmds) if (!ok(c)) console.log(`  #${c.n} [${c.group}] ${c.label} (${c.what} ${c.where} L${c.layer}): ${c.result}: ${c.words}`);
