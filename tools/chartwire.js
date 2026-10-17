// What the chart costs on the wire (#237): a player walks open land and then the village at four tiles a second under plain Node, and every third step (a frame)
// the changed chart cells are taken as the frame carries them. Prints the bytes of the cells, and what the same changes would have cost as whole chunks
// (the frame of #203), per second walked. From the repo's root:  node tools/chartwire.js [seconds]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const seconds = Number(process.argv[2] || 10);
const { bootData } = await import("../server/boot.js");
await bootData(root);
const gameMod = await import("../src/game.js");
const chart = await import("../src/chart.js");
const mapMod = await import("../src/map.js");
const loop = await import("../src/loop.js");

for (const [label, start, dx, dy] of [["open land", [150, 100], 1, 0], ["through the village", [104, 215], 0, -1]]) {
  gameMod.create({ json: read("data/maps/valley.json"), rules: { zombieAggro: false } });
  const S = gameMod.state;
  const p = S.player;
  p.gx = start[0];
  p.gy = start[1];
  chart.takeChanged();
  let cells = 0;
  let bytes = 0;
  let wholeBytes = 0;
  let frames = 0;
  const steps = seconds * 60;
  for (let i = 0; i < steps; i++) {
    p.gx += (dx * 4) / 60;
    p.gy += (dy * 4) / 60;
    mapMod.ensureAround(p.gx, p.gy, 4);
    gameMod.begin(1 / 60);
    if (i % 3 === 2) {
      const out = chart.takeChanged();
      if (!out.length) continue;
      frames++;
      bytes += JSON.stringify(out).length;
      const whole = new Map(chart.serialize().chunks.map(([cx, cy, b64]) => [`${cx},${cy}`, JSON.stringify([cx, cy, b64]).length]));
      for (const [cx, cy, flat] of out) { cells += flat.length / 2; wholeBytes += whole.get(`${cx},${cy}`) || 0; }
    }
  }
  console.log(`${label}: ${seconds} s walked, ${frames} frames with a chart field, ${cells} cells: ${(bytes / seconds / 1024).toFixed(2)} KB/s as cells; the same changes as whole chunks would be ${(wholeBytes / seconds / 1024).toFixed(2)} KB/s`);
}
