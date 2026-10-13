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

const assets = await import("../src/assets.js");
assets.setHeadless(true);
assets.setJsonReader(async (p) => read(p));

const [items, placement, combat, figure, interactions, stations, tuning, map, game, loop] = await Promise.all([
  import("../src/items.js"),
  import("../src/placement.js"),
  import("../src/combat.js"),
  import("../src/figure.js"),
  import("../src/interactions.js"),
  import("../src/stations.js"),
  import("../src/tuning.js"),
  import("../src/map.js"),
  import("../src/game.js"),
  import("../src/loop.js"),
]);

const t0 = performance.now();

// The data stage, as main.js runs it.
const [itemsJson, buildJson, combatJson, posesJson, lootJson, wardrobesJson, interactionsJson] = [
  read("data/items.json"), read("data/build.json"), optional("data/combat.json"), optional("data/poses.json"),
  read("data/loot.json"), read("data/wardrobes.json"), optional("data/interactions.json"),
];
interactions.load(interactionsJson);
stations.loadRecipes(optional("data/recipes.json"));
tuning.load(optional("data/tuning.json"));
items.loadItems(itemsJson);
placement.setBuildData(buildJson);
if (combatJson) combat.setCombatData(combatJson);
if (posesJson) figure.setPoses(posesJson);
items.loadLoot(lootJson);
figure.setArtResolver((id) => items.getItem(id).art || null);
figure.setWardrobes(wardrobesJson);

// The art stage: every sprite definition, no picture.
assets.setManifest(read("data/manifest.json"));
await assets.loadAll();

// The layers stage: every painted style's name, so a wardrobe that names one resolves.
const folders = [["hair", "data/hair"], ...["head", "chest", "legs", "hands", "feet", "body", "beard", "waist"].map((s) => [s, `data/layers/${s}`])];
for (const [slot, folder] of folders) {
  const index = optional(`${folder}/index.json`) || { styles: [] };
  for (const name of index.styles || []) figure.registerLayer(slot, name, read(`${folder}/${name}.json`));
}

// The world stage: the same calls as the browser's.
const json = read(`data/maps/${mapName}.json`);
// The world's options as the pane has them, so the hashes compare: the dev chest and the
// testing dead each make props and so move every id after them (docs/31/05, item 4).
game.create({ json, devChest: flags.has("--devchest"), combatTesting: flags.has("--combat") });
const booted = performance.now() - t0;

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
  }
  loop.advance(1 / 60);
}
const stepped = performance.now() - t1;

const text = game.hashText();
const S = game.state;
console.log(`${mapName}: ${S.zombies.length} dead, ${S.villagers.length} villagers, ${map.chunkCount()} chunks, ${map.roomCount()} rooms`);
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
