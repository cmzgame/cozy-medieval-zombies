// The world with no window (docs/31/05, item 23; tier 0 of docs/31/06): boot the
// simulation under plain Node from the same files the browser loads, step it,
// and print the hash the pane's determinism check prints. The same number on
// both is the proof that the world is the simulation's alone: nothing in it
// reads a window, a canvas, a keyboard, or the DOM. From the repo's root:
//   node tools/world.js              the valley, 600 steps (the check's protocol)
//   node tools/world.js square 1200  another map, more steps
//   node tools/world.js valley 600 --devchest
//                                    with the dev chest, as a pane whose setting is on (the chest's
//                                    id moves every id after it, so the hashes compare only alike)
//   node tools/world.js valley 600 --players=2
//                                    more players, standing five tiles apart: the dead hunt whoever is nearest
//   node tools/world.js valley 600 --bite
//                                    the dead hunting and one beside the player: its bite lands with no page
//                                    behind the world (the host's rules are the world's; item 5's first step)
//   node tools/world.js valley 600 --roundtrip
//                                    the save proved: the world serialised half way, the run
//                                    finished, then a fresh world restored from the save and run
//                                    the other half; the two hashes must agree (docs/31/05, item 24)
// Compare with the pane: await __game.check("determinism") on a fresh boot.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const optional = (p) => (fs.existsSync(path.join(root, p)) ? read(p) : null);

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const mapName = args[0] || "valley";
const steps = Number(args[1] || 600);

// The data stage, shared with the server's world process (server/boot.js): this runner's hash is the proof that
// it is the browser's boot.
const { bootData } = await import("../server/boot.js");
// net.js is imported for its parse alone: it has no window at module scope, and a stray brace in it once
// passed node --check (which parses a .js as a script) and broke the browser's boot.
await import("../src/net.js");
const settings = await import("../src/settings.js");
const [map, game, loop] = await Promise.all([import("../src/map.js"), import("../src/game.js"), import("../src/loop.js")]);

// The hash's protocol is a world with the dead's aggro off, as the pane Michael tests in has it (the setting's default is
// on since 2026-10-15; a browser that saved its settings keeps its own, and his are off). `--bite` turns it on below.
settings.set("zombieAggro", false);

const t0 = performance.now();
await bootData(root);

// The world stage: the same calls as the browser's.
const json = read(`data/maps/${mapName}.json`);
// The world's options as the pane has them, so the hashes compare: the dev chest and the
// testing dead each make props and so move every id after them (docs/31/05, item 4).
game.create({ json, devChest: flags.has("--devchest"), combatTesting: flags.has("--combat") });
const playersFlag = [...flags].find((f) => f.startsWith("--players="));
const nPlayers = playersFlag ? Number(playersFlag.split("=")[1]) : 1;
for (let i = 1; i < nPlayers; i++) game.addPlayer(game.state.player.gx + 5 * i, game.state.player.gy, {});
const booted = performance.now() - t0;
let bitten = null;
if (flags.has("--bite")) {
  // The dead hunt (the rule the world reads each step from the settings), and the nearest stands beside the player.
  settings.set("zombieAggro", true);
  const p = game.state.player;
  const z = game.state.zombies.slice().sort((a, b) => Math.hypot(a.gx - p.gx, a.gy - p.gy) - Math.hypot(b.gx - p.gx, b.gy - p.gy))[0];
  z.gx = p.gx + 0.6;
  z.gy = p.gy;
  bitten = { hp0: p.hp };
}

loop.init({
  update: (dt) => {
    game.begin(dt);
    game.step(dt, game.idleSnapshot());
  },
  render: () => {},
});
const t1 = performance.now();
const half = Math.floor(steps / 2);
let snap = null;
let snapBytes = 0;
for (let i = 0; i < steps; i++) {
  if (flags.has("--roundtrip") && i === half) {
    const raw = JSON.stringify(game.serialize()); // as the slot would hold it: through text
    snapBytes = raw.length;
    snap = JSON.parse(raw);
    if (!snap.rules || typeof snap.rules.zombieAggro !== "boolean") { console.log("the save carries no rules"); process.exit(1); }
  }
  loop.advance(1 / 60);
}
const stepped = performance.now() - t1;

if (bitten) console.log(`bite: hp ${bitten.hp0} to ${game.state.player.hp} after ${steps} steps`);
const text = game.hashText();
const S = game.state;
console.log(`${mapName}: ${S.players.length} player${S.players.length === 1 ? "" : "s"}, ${S.zombies.length} dead, ${S.villagers.length} villagers, ${map.chunkCount()} chunks, ${map.roomCount()} rooms`);
console.log(`booted in ${booted.toFixed(0)} ms, ${steps} steps in ${stepped.toFixed(0)} ms (${(stepped / steps).toFixed(2)} ms a step)`);
console.log(`hash ${game.hashOf(text)} over ${text.split("\n").length - 2} entities after ${steps} steps`);

if (snap) {
  // A fresh world from the save, run the other half: the same hash, or the save lost something.
  const t2 = performance.now();
  game.restore(snap, json);
  const restored = performance.now() - t2;
  for (let i = half; i < steps; i++) loop.advance(1 / 60);
  const again = game.hashText();
  const same = again === text;
  console.log(`roundtrip: ${(snapBytes / 1024).toFixed(0)} KB of save at step ${half}, restored in ${restored.toFixed(0)} ms, hash ${game.hashOf(again)} after the other half: ${same ? "the same" : "DIFFERENT"}`);
  if (!same) {
    const a = text.split("\n");
    const b = again.split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { console.log(`  first difference at line ${i}:\n    ${a[i]}\n    ${b[i]}`); break; }
    process.exit(1);
  }
}
