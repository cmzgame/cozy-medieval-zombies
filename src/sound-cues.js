// The ear (docs/40, sections 3 to 5): each frame, after the picture is drawn, it reads what this client already has
// (its own world on the host, its replica on a guest) round the listener and turns it into sound. It writes nothing to
// the world: a sound is never saved, never in the sync check, never read by the simulation, and never rolls rng.js.
// So a guest hears what it sees, when it sees it, and nothing new crosses the wire.
//
// Step 1: the footsteps (a character's walk turning to a contact frame), the swing (a hand's cooldown rising), and a hit
// (the floating numbers' events, read through a cursor of the ear's own so the Floating numbers setting off does not
// silence one). Its memory (what it heard last frame, by character id) is view state of one client, so a module-level
// map is right here. Its gaps are measured in sim time (loop.simTime): when more than FRESH seconds of the world's time
// passed since its last run (a tab hidden while its world ran on), and after reset(), it takes a fresh baseline and
// plays nothing, so a return never bursts and a check that awaits between steps loses nothing. Its only chance is a
// hash of an id and a count.

import * as audio from "./audio.js";
import * as loop from "./loop.js";
import * as map from "./map.js";
import * as floaters from "./floaters.js";
import * as combat from "./combat.js";
import { cam } from "./camera.js";
import { hashString } from "./sound-gen.js";

const FRESH = 0.25; // seconds of sim time since the last run past which the ear starts again from a baseline (docs/40)
const WALK = new Set(["walk", "carry_walk"]);

let steps = { nearest: 6, gap: 0.18, dead: "shuffle" }; // data/sounds.json `footsteps`
let swingCfg = { heavyAt: 0.8, rise: 0.1 }; // data/sounds.json `swing`
const walkers = new Map(); // id -> { name, frame, last, count }: a character's walk as heard last frame
const hands = new Map(); // player id -> { main, off }: its hands' cooldowns last frame
let lastSim = null;
let fresh = true;

export function configure(data) {
  if (!data) return;
  if (data.footsteps) steps = { ...steps, ...data.footsteps };
  if (data.swing) swingCfg = { ...swingCfg, ...data.swing };
}

// A fresh baseline at the next update: a new world, a welcome, a tab come back.
export function reset() {
  walkers.clear();
  hands.clear();
  lastSim = null;
  fresh = true;
}

const living = (S) => [...S.players, ...S.villagers, ...S.zombies].filter((c) => c && !c.dead && !c.corpse);

function remember(S) {
  walkers.clear();
  for (const c of living(S)) walkers.set(c.id, { name: c.anim && c.anim.name, frame: c.anim && c.anim.frame, last: -Infinity, count: 0 });
  hands.clear();
  for (const p of S.players) hands.set(p.id, { main: p.attackCooldown || 0, off: p.offCooldown || 0 });
  floaters.takeForEar(); // what happened before the baseline is not heard
}

// `S` the world's state (game.state: players, zombies, villagers, corpses, player). `dt` is accepted for a check that
// passes the step it advanced; the gap itself is read from the sim clock.
export function update(S, dt = 0) {
  if (!S || !S.players) return;
  const sim = loop.simTime();
  const me = S.player;
  audio.setClock(loop.simTime);
  audio.setListener(me && !me.dead ? me.gx : cam.gx, me && !me.dead ? me.gy : cam.gy); // a dead player hears from the camera
  const gap = lastSim === null ? Infinity : sim - lastSim;
  // A guest's clock is set to the host's by every frame (net.js applyFrame) and steps on its own between frames, so it is
  // nudged back a little now and then; only a jump of more than FRESH either way is a fresh start.
  if (fresh || !(gap <= FRESH) || gap < -FRESH) {
    remember(S);
    lastSim = sim;
    fresh = false;
    return;
  }
  footsteps(S, sim);
  swings(S);
  hits(S);
  lastSim = sim;
}

// ---- footsteps: a step when a walk's frame turns to a contact (0 or 2), no sooner than `gap` after the last (a guest's
// replayed walk can go 2, 1, 2 near a frame's arrival; the gap swallows the repeat on every client alike).
function footsteps(S, sim) {
  const seen = new Set();
  const due = [];
  const [lx, ly] = listenerAt(S);
  for (const c of living(S)) {
    seen.add(c.id);
    const a = c.anim || {};
    const was = walkers.get(c.id);
    const now = { name: a.name, frame: a.frame, last: was ? was.last : -Infinity, count: was ? was.count : 0 };
    walkers.set(c.id, now);
    if (!was) continue; // first sight: learned silently
    const contact = WALK.has(a.name) && (a.frame === 0 || a.frame === 2) && (was.name !== a.name || was.frame !== a.frame);
    if (!contact || sim - now.last < steps.gap) continue;
    due.push({ c, mem: now, d: Math.hypot(c.gx - lx, c.gy - ly) });
  }
  for (const id of [...walkers.keys()]) if (!seen.has(id)) walkers.delete(id);
  due.sort((a, b) => a.d - b.d);
  for (const { c, mem } of due.slice(0, steps.nearest)) {
    mem.last = sim;
    mem.count++;
    const name = c.kind === "zombie" ? steps.dead : stepSlot(c);
    audio.play(name, { at: [c.gx, c.gy], variant: hashString(`${c.id}#${mem.count}`) });
  }
}

function stepSlot(c) {
  const t = map.tileAt(Math.round(c.gx), Math.round(c.gy));
  const name = t && steps[t.floor];
  return typeof name === "string" ? name : "step_grass";
}

function listenerAt(S) {
  const me = S.player;
  return me && !me.dead ? [me.gx, me.gy] : [cam.gx, cam.gy];
}

// ---- the swing: a hand's cooldown risen by more than `rise` since the last frame, which only a swing does (a swing
// sets it to the weapon's whole `swing` from at or near zero). The slot is the weapon's own `sound`, else light or heavy
// by how long its swing is.
function swings(S) {
  for (const p of S.players) {
    if (p.dead) continue;
    const was = hands.get(p.id) || { main: 0, off: 0 };
    const main = p.attackCooldown || 0;
    const off = p.offCooldown || 0;
    hands.set(p.id, { main, off });
    if (main - was.main > swingCfg.rise) audio.play(swingSlot(mainWeapon(p, main)), { at: [p.gx, p.gy] });
    if (off - was.off > swingCfg.rise) audio.play(swingSlot(combat.offWeaponOf(p) || combat.FISTS), { at: [p.gx, p.gy] });
  }
  for (const id of [...hands.keys()]) if (!S.players.some((p) => p.id === id)) hands.delete(id);
}

// The main hand's swing or its other mode (the halberd's thrust), told apart by which one's `swing` the cooldown is.
function mainWeapon(p, cd) {
  const w = combat.weaponOf(p);
  const alt = combat.altWeaponOf(p);
  if (alt && Math.abs(cd - alt.swing) < Math.abs(cd - w.swing)) return alt;
  return w;
}

function swingSlot(w) {
  if (w && typeof w.sound === "string") return w.sound;
  return w && w.swing >= swingCfg.heavyAt ? "swing_heavy" : "swing_light";
}

// ---- a hit: every damage event since the ear last read, at the one hit's place (a blow, a bite, an arrow, a burst).
function hits(S) {
  const events = floaters.takeForEar();
  if (!events.length) return;
  const all = [...S.players, ...S.zombies, ...S.villagers, ...(S.corpses || [])];
  for (const e of events) {
    const c = all.find((x) => x.id === e.id);
    if (c) audio.play("hit", { at: [c.gx, c.gy] });
  }
}
