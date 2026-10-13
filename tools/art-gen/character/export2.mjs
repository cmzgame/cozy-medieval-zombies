import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";
const root = path.resolve("repo");
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : p.endsWith(".json") ? "application/json" : "text/html" }); r.end(d); }); });
await new Promise(r => srv.listen(8766, r));
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const pg = await br.newPage(); pg.on("pageerror", e => console.log("[err]", e.message));
await pg.goto("http://localhost:8766/tools/template.html"); await pg.waitForFunction(() => window.__template, null, { timeout: 15000 });
const out = await pg.evaluate(() => {
  const t = window.__template; const sheet = t.sheet; const F = ["s","sw","w","nw","n","ne","e","se"];
  const maps = {}, joints = {}, PART = {};
  for (const f of F) { maps[f] = Array.from(sheet.partMaps[`idle_${f}_0`]); joints[f] = sheet.joints[`idle_${f}_0`]; }
  // the 1x body pixels
  const c = document.createElement("canvas"); c.width = 48 * 4; c.height = 72 * 2; const x = c.getContext("2d");
  F.forEach((f, i) => { const fr = sheet.frames[`idle_${f}_0`]; x.drawImage(sheet.image, fr[0], fr[1], fr[2], fr[3], (i % 4) * 48, Math.floor(i / 4) * 72, 48, 72); });
  return { maps, joints, body1x: c.toDataURL(), partNames: null };
});
fs.writeFileSync("out/partmaps.json", JSON.stringify({ maps: out.maps, joints: out.joints }));
fs.writeFileSync("out/body_1x.png", Buffer.from(out.body1x.split(",")[1], "base64"));
await br.close(); srv.close(); console.log("ok");
