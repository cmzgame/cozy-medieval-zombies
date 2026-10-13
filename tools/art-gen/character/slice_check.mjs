// usage: node slice_check.mjs <png> <slot> <name> '<options json>' <outdir>
import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";
const [png, slot, name, optJson, outdir] = process.argv.slice(2);
const root = path.resolve("repo");
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : p.endsWith(".json") ? "application/json" : "text/html" }); r.end(d); }); });
await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const pg = await br.newPage(); pg.on("pageerror", e => console.log("[err]", e.message));
await pg.goto(`http://localhost:${port}/tools/slice_headless.html`); await pg.waitForFunction(() => window.__h, null, { timeout: 15000 });
const data = "data:image/png;base64," + fs.readFileSync(png).toString("base64");
const res = await pg.evaluate(async ({ data, slot, name, opts }) => {
  const img = new Image(); await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = data; });
  window.__h.setSlot(slot); window.__h.setOptions(opts); document.getElementById("name").value = name;
  return window.__h.run(img);
}, { data, slot, name, opts: JSON.parse(optJson || "{}") });
fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(path.join(outdir, name + ".json"), JSON.stringify(res.json));
fs.writeFileSync(path.join(outdir, name + "_worn.png"), Buffer.from(res.worn.split(",")[1], "base64"));
fs.writeFileSync(path.join(outdir, name + "_read.png"), Buffer.from(res.read.split(",")[1], "base64"));
console.log(res.report.join("\n")); console.log("ragged", res.ragged);
await br.close(); srv.close();
