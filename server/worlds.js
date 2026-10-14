// The server worlds on the disk, by hand (item 5's fourth step, 2026-10-14, `02`): for the checks and for a person
// at the machine, until a browser's "Move to the server" makes them (step 5). The relay finds a world here by its
// code's hash at its next look (server/relay.js).
//
//   node server/worlds.js new --data <DATA_DIR> [--name <name>]    a fresh world; its code is printed once
//   node server/worlds.js list --data <DATA_DIR>
//
// A world's id and code are made here, by the server alone, from the crypto source; the code's SHA-256 is all the
// disk keeps of it (meta.json), so a copy of the volume gives no one a way in.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};
const data = arg("data", process.env.DATA_DIR || null);
if (!data) {
  console.error("usage: node server/worlds.js new|list --data <DATA_DIR> [--name <name>]");
  process.exit(64);
}
const worldsDir = path.join(data, "worlds");

// A join code in the game's own shape (src/net.js makeCode: two tree words and four letters with no look-alikes),
// drawn from the crypto source.
const WORDS = ["oak", "elm", "ash", "yew", "fir", "hazel", "rowan", "thorn", "moss", "fern", "birch", "alder", "willow", "holly", "pine", "maple"];
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
export function mintCode() {
  const a = WORDS[crypto.randomInt(WORDS.length)];
  let b = WORDS[crypto.randomInt(WORDS.length)];
  if (b === a) b = WORDS[(WORDS.indexOf(a) + 1) % WORDS.length];
  let tail = "";
  for (let i = 0; i < 4; i++) tail += CHARS[crypto.randomInt(CHARS.length)];
  return `${a}-${b}-${tail}`;
}
export const mintWorldId = () => `w${crypto.randomBytes(8).toString("hex")}`;
export const hashCode = (code) => crypto.createHash("sha256").update(code).digest("hex");

const cmd = argv[0];
if (cmd === "new") {
  const worldId = mintWorldId();
  const code = mintCode();
  const name = String(arg("name", "A server world")).slice(0, 60);
  const dir = path.join(worldsDir, worldId);
  fs.mkdirSync(dir, { recursive: true });
  const made = spawnSync(process.execPath, [path.join(here, "world.js"), "--dir", dir, "--new", "--make-only", "--name", name], { stdio: "inherit" });
  if (made.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.error("the world could not be made");
    process.exit(1);
  }
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ worldId, name, codeHash: hashCode(code), created: new Date().toISOString(), madeBy: "server/worlds.js" }, null, 1));
  console.log(JSON.stringify({ worldId, name, code }));
} else if (cmd === "list") {
  let ids = [];
  try {
    ids = fs.readdirSync(worldsDir);
  } catch {
    // none yet
  }
  for (const id of ids) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(worldsDir, id, "meta.json"), "utf8"));
      const size = fs.statSync(path.join(worldsDir, id, "save.json.gz")).size;
      console.log(`${id}  ${meta.name}  made ${meta.created}  save ${Math.round(size / 1024)} KB`);
    } catch {
      console.log(`${id}  (not a world)`);
    }
  }
} else {
  console.error("usage: node server/worlds.js new|list --data <DATA_DIR> [--name <name>]");
  process.exit(64);
}
