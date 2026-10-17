// Talk (docs/34, #198): what villagers say, as data. No DOM, runs headless, and **talk reads the world and never writes it**
// (Michael, `02` 2026-10-13): this module imports nothing that mutates the world, its conditions are a fixed small vocabulary, and the data
// has no field that could write (the validator rejects any key it does not know). It loads `data/talk/<id>.json` (a villager's `talk` id
// names its file) and offers `matches` (a `when` against a context), `barkFor` (the line a villager says now), `node` (a conversation's
// node with its lines and the options that hold: part 2), and `contextFor`, the one builder of the context both sides read. Time comes from
// the clock, chance from nowhere: a bark takes turns by a counter on the villager, so it never shifts the sim's generator.

import * as clock from "./clock.js";
import * as map from "./map.js";
import * as items from "./items.js";
import { hungerStage, thirstStage, tiredStage } from "./moodles.js";
import { villager as T } from "./tuning.js";

let files = new Map();

// `json`: { talkId: file }, every file under data/talk (main.js, server/boot.js).
export function load(json) {
  files = new Map(Object.entries(json || {}));
}

export function has(id) {
  return !!id && files.has(id);
}

export function get(id) {
  return files.get(id) || null;
}

export function ids() {
  return [...files.keys()];
}

// The conditions a `when` may name, with the kind of value each takes (tools/validate-data.py mirrors this list).
export const CONDITIONS = {
  time: "phase", // "day" | "night" | "dawn" | "dusk"
  deadNear: "bool",
  deadInWorld: "bool",
  villagerAlive: "id",
  villagerDead: "id",
  indoors: "bool",
  hurt: "bool",
  holding: "item", // an item id or tag in the talker's hands
  hungry: "bool",
  thirsty: "bool",
  tired: "bool",
  bleeding: "bool",
};

// The talker's conditions need a talker: with none (an ambient bark has nobody poking) a `true` fails and a `false` holds.
const TALKER = new Set(["holding", "hungry", "thirsty", "tired", "bleeding"]);

// The context both sides read, built in one place from what the conditions name: the villager and the talker (null for an ambient
// bark), the dead, the living villagers, and the talk ids the map authored (so a villager gone from the list is dead).
// `world`: { zombies, villagers, roster } where `roster` is a Set of the talk ids the map placed.
export function contextFor(villager, talker, world) {
  const zombies = (world && world.zombies) || [];
  const villagers = (world && world.villagers) || [];
  const roster = (world && world.roster) || new Set();
  const near = T.barkDeadRadius;
  let deadNear = false;
  if (villager) for (const z of zombies) if (!z.dead && Math.hypot(z.gx - villager.gx, z.gy - villager.gy) <= near) { deadNear = true; break; }
  const alive = new Set(villagers.filter((v) => !v.dead && v.talk).map((v) => v.talk));
  return {
    phase: clock.getPhase(),
    deadNear,
    deadInWorld: zombies.some((z) => !z.dead),
    alive,
    roster,
    indoors: !!villager && map.roomAt(Math.round(villager.gx), Math.round(villager.gy)) > 0,
    hurt: !!villager && villager.hp < (villager.maxHp ?? 100),
    talker,
  };
}

function holds(talker, want) {
  if (!talker || !talker.hands) return false;
  for (const slot of ["main", "off"]) {
    const e = talker.hands[slot];
    if (!e) continue;
    if (e.id === want) return true;
    const def = items.getItem(e.id);
    if (def && (def.tags || []).includes(want)) return true;
  }
  return false;
}

function talkerFact(key, talker) {
  if (!talker) return null;
  switch (key) {
    case "hungry": return hungerStage(talker) >= 2;
    case "thirsty": return thirstStage(talker) >= 2;
    case "tired": return tiredStage(talker) >= 2;
    case "bleeding": return !!(talker.bleed && talker.bleed.stacks > 0);
    default: return null;
  }
}

// Whether every condition of a `when` holds (a missing or empty `when` always does). An unknown condition throws: the validator rejects
// the file before it ships, and a check that walks every file finds a mistake it missed.
export function matches(when, ctx) {
  if (!when) return true;
  for (const [key, want] of Object.entries(when)) {
    if (!(key in CONDITIONS)) throw new Error(`talk: unknown condition ${JSON.stringify(key)}`);
    let ok;
    switch (key) {
      case "time": ok = ctx.phase === want; break;
      case "deadNear": ok = ctx.deadNear === want; break;
      case "deadInWorld": ok = ctx.deadInWorld === want; break;
      case "villagerAlive": ok = ctx.alive.has(want); break;
      case "villagerDead": ok = ctx.roster.has(want) && !ctx.alive.has(want); break;
      case "indoors": ok = ctx.indoors === want; break;
      case "hurt": ok = ctx.hurt === want; break;
      case "holding": ok = holds(ctx.talker, want); break;
      default: { // hungry, thirsty, tired, bleeding
        const fact = talkerFact(key, ctx.talker);
        ok = fact === null ? want === false : fact === want;
      }
    }
    if (!ok) return false;
  }
  return true;
}

// The line a villager says now, or null when their file has none for this moment (the caller falls back to the map's `line`). The first
// group whose `when` holds is used; an `ambient` call (nobody poked) only hears groups marked `"ambient": true`. Within a group the lines
// take turns by the villager's own counter, which is bookkeeping nothing reads (`barkTurn`, saved with it): no `rng`, so the determinism
// hash is not shifted by what is said.
export function barkFor(villager, ctx, { ambient = false } = {}) {
  const file = get(villager && villager.talk);
  if (!file || !Array.isArray(file.barks)) return null;
  for (const g of file.barks) {
    if (ambient && g.ambient !== true) continue;
    if (!matches(g.when, ctx)) continue;
    if (!g.lines || !g.lines.length) continue;
    const turn = villager.barkTurn || 0;
    villager.barkTurn = turn + 1;
    return g.lines[turn % g.lines.length];
  }
  return null;
}

// A conversation's node, addressed `<talk id>/<node id>` (stable names, so memory can name them later): its lines (a `say` may be a list
// of { when, lines } variants, the first that holds used) and the options whose `when` holds. Part 2 (#202) draws it.
export function node(talkId, nodeId, ctx) {
  const file = get(talkId);
  const n = file && file.nodes && file.nodes[nodeId];
  if (!n) return null;
  let say = n.say || [];
  if (say.length && typeof say[0] === "object") {
    const hit = say.find((v) => matches(v.when, ctx));
    say = hit ? hit.lines : [];
  }
  const options = (n.options || []).filter((o) => matches(o.when, ctx));
  return { id: nodeId, say, options, end: !!n.end };
}
