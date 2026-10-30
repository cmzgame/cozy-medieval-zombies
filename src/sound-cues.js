// The ear (docs/40, sections 3 to 5): each frame, after the picture is drawn, it reads what this client already has
// (its own world on the host, its replica on a guest) round the listener and turns it into sound. It writes nothing to
// the world: a sound is never saved, never in the sync check, never read by the simulation, and never rolls rng.js.
// So a guest hears what it sees, when it sees it, and nothing new crosses the wire.
//
// Step 1: the footsteps (a character's walk turning to a contact frame), the swing (a hand's cooldown rising), and a hit
// (the floating numbers' events, read through a cursor of the ear's own so the Floating numbers setting off does not
// silence one). Step 2 (#386): the shove (its cooldown rising), the bow's draw (a loop while `draw` is up) and release
// (`recover` rising), a spell's cast (`recover` rising with a spell in hand), an arrow landing (a projectile gone from the
// list in flight), the dead's death and a downed one's fall (a body's state), and doors and shutters (an opening's
// state, scanned round the listener). Its memory (what it heard last frame, by id or edge) is view state of one client,
// so a module-level map is right here. Its gaps are measured in sim time (loop.simTime): when more than FRESH seconds
// of the world's time passed since its last run either way (a tab hidden while its world ran on), and after reset(), it
// takes a fresh baseline and plays nothing, so a return never bursts and a check that awaits between steps loses
// nothing. Its only chance is a hash of an id and a count. #424: the dead's moan (one turning to the chase from a calm state, its
// `state` in the frame, throttled) and a strike (the jolt every client draws when the dead hit a door, shutters, boards, or a fence:
// main.js hands each to `struck`, from the host's own event and a guest's fx alike).

import * as audio from "./audio.js";
import * as loop from "./loop.js";
import * as map from "./map.js";
import * as floaters from "./floaters.js";
import * as combat from "./combat.js";
import * as archery from "./archery.js";
import { cam } from "./camera.js";
import { hashString } from "./sound-gen.js";
import { client } from "./client.js";

const FRESH = 0.25; // seconds of sim time since the last run past which the ear starts again from a baseline (docs/40)
const WALK = new Set(["walk", "carry_walk"]);
const LANDS = new Set(["arrow", "fire_arrow", "poison_arrow", "strong_poison_arrow"]); // the projectiles whose landing is `arrow_land` (a spear's and a spell's are later)

let steps = { nearest: 6, gap: 0.18, dead: "shuffle", default: "shuffle" }; // data/sounds.json `footsteps`
let swingCfg = { heavyAt: 0.8, rise: 0.1 }; // data/sounds.json `swing`
let openCfg = { radius: 14, every: 0.05, slot: "door", storeyVolume: 0.5 }; // data/sounds.json `openings`
let bowCfg = { rateFrom: 0.9, rateTo: 1.2 }; // data/sounds.json `bow`
let moanCfg = { from: ["idle", "wander", "search", "siege"], to: ["chase", "breach", "press"], again: 10, gap: 1.2 }; // data/sounds.json `moan`
const walkers = new Map(); // id -> { name, frame, last, count }: a character's walk as heard last frame
const hands = new Map(); // player id -> { main, off, shove, recover }: its clocks last frame
const draws = new Map(); // player id -> the bow's draw loop's handle
const bodies = new Map(); // a dead one's id -> { dead, down }
const openings = new Map(); // "x,y,edge" -> { open, broken }
const chases = new Map(); // a dead one's id -> { state, last, count }: its state as heard last frame, and when it last moaned
let lastMoan = -Infinity;
let strikes = []; // the jolts drawn since the last update, [tx, ty, edge]
let flying = []; // the arrows in flight last frame, { gx, gy, projectile }
let lastScan = -Infinity;
let lastSim = null;
let fresh = true;

export function configure(data) {
  if (!data) return;
  if (data.footsteps) steps = { ...steps, ...data.footsteps };
  if (data.swing) swingCfg = { ...swingCfg, ...data.swing };
  if (data.openings) openCfg = { ...openCfg, ...data.openings };
  if (data.bow) bowCfg = { ...bowCfg, ...data.bow };
  if (data.moan) moanCfg = { ...moanCfg, ...data.moan };
}

// A wall the dead struck, as this client draws its jolt (main.js: the host's own `wallStruck`, a guest's `shake` fx).
export function struck(tx, ty, edge) {
  strikes.push([tx, ty, edge]);
}

// A fresh baseline at the next update: a new world, a welcome, a tab come back.
export function reset() {
  walkers.clear();
  hands.clear();
  for (const h of draws.values()) h.stop(0.05);
  draws.clear();
  bodies.clear();
  openings.clear();
  chases.clear();
  lastMoan = -Infinity;
  strikes = [];
  flying = [];
  lastScan = -Infinity;
  lastSim = null;
  fresh = true;
}

const living = (S) => [...S.players, ...S.villagers, ...S.zombies].filter((c) => c && !c.dead && !c.corpse);
const theDead = (S) => [...S.zombies, ...(S.corpses || [])].filter((c) => c && c.kind === "zombie");

function remember(S) {
  walkers.clear();
  for (const c of living(S)) walkers.set(c.id, { name: c.anim && c.anim.name, frame: c.anim && c.anim.frame, last: -Infinity, count: 0 });
  hands.clear();
  for (const p of S.players) hands.set(p.id, clocks(p));
  for (const h of draws.values()) h.stop(0.05);
  draws.clear();
  bodies.clear();
  for (const z of theDead(S)) bodies.set(z.id, bodyState(z));
  chases.clear();
  for (const z of S.zombies) if (z && !z.dead && !z.corpse) chases.set(z.id, { state: z.state, last: -Infinity, count: 0 });
  strikes = [];
  flying = inFlight();
  openings.clear();
  scanOpenings(S, false);
  floaters.takeForEar(); // what happened before the baseline is not heard
}

// `S` the world's state (game.state: players, zombies, villagers, corpses); the listener is this client's own player (client.me, #102). `dt` is accepted for a check that
// passes the step it advanced; the gap itself is read from the sim clock.
export function update(S, dt = 0) {
  if (!S || !S.players) return;
  const sim = loop.simTime();
  const me = client.me;
  audio.setClock(loop.simTime);
  audio.setListener(me && !me.dead ? me.gx : cam.gx, me && !me.dead ? me.gy : cam.gy); // a dead player hears from the camera
  const gap = lastSim === null ? Infinity : sim - lastSim;
  // A guest's clock is set to the host's by every frame (net.js applyFrame) and steps on its own between frames, so it is
  // nudged back a little now and then; only a jump of more than FRESH either way is a fresh start.
  if (fresh || !(gap <= FRESH) || gap < -FRESH) {
    remember(S);
    lastSim = sim;
    lastScan = sim;
    fresh = false;
    return;
  }
  footsteps(S, sim);
  players(S);
  hits(S);
  deaths(S);
  moans(S, sim);
  struckWalls();
  arrows();
  if (sim - lastScan >= openCfg.every || sim < lastScan) {
    lastScan = sim;
    scanOpenings(S, true);
  }
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

// The floor's step slot; a floor not listed, grass among them since #386, takes the default (the dead's shuffle).
function stepSlot(c) {
  const t = map.tileAt(Math.round(c.gx), Math.round(c.gy), c.layer || 0); // the walker's own floor (docs/53 step 7): planks upstairs, not the grass under them
  const name = t && steps[t.floor];
  return typeof name === "string" ? name : steps.default || "shuffle";
}

function listenerAt(S) {
  const me = client.me;
  return me && !me.dead ? [me.gx, me.gy] : [cam.gx, cam.gy];
}

// ---- a player's hands: the swing (a hand's cooldown risen by more than `rise` since the last frame, which only a swing
// does), the shove (its cooldown risen), the bow's draw (a loop while `draw` is up with a bow in hand, its rate following
// the draw) and release (`recover` risen with a bow), a spell's cast (`recover` risen with a spell). A dry release sets no
// `recover`, so it ends the draw's loop and plays no twang. A thrown spear's throw is a sound of its own, later.
// The mana bar's flash rising is a cast it could not pay for (`mana_short`, docs/47 section 5), and a prayer's bar beginning is `pray` (the host's
// timed action, or a guest's copy's `actionView` from the record): both for this client's own player alone.
function clocks(p) {
  const praying = p.action && p.action.action ? p.action.action.kind === "pray" : !!(p.actionView && p.actionView.label === "Pray");
  return { main: p.attackCooldown || 0, off: p.offCooldown || 0, shove: p.shoveCooldown || 0, recover: p.recover || 0, flash: p.manaFlash || 0, praying };
}

function players(S) {
  for (const p of S.players) {
    const was = hands.get(p.id) || { main: 0, off: 0, shove: 0, recover: 0, flash: 0, praying: false };
    const now = clocks(p);
    hands.set(p.id, now);
    if (p.dead) {
      stopDraw(p.id);
      continue;
    }
    const at = [p.gx, p.gy];
    if (now.main - was.main > swingCfg.rise) audio.play(swingSlot(mainWeapon(p, now.main)), { at });
    if (now.off - was.off > swingCfg.rise) audio.play(swingSlot(combat.offWeaponOf(p) || combat.FISTS), { at });
    if (now.shove - was.shove > swingCfg.rise) audio.play("shove", { at });
    // Mine alone, as their twins are (the bar's flash and the prayer's bar are this client's own HUD): interface sounds, at no place.
    if (p === client.me && now.flash > was.flash + 1e-6) audio.play("mana_short", { at: null });
    if (p === client.me && now.praying && !was.praying) audio.play("pray", { at: null });
    const L = archery.launcherOf(p);
    const kind = L && !L.refuse ? L.kind : null;
    if (p.draw && kind === "bow") {
      const rate = bowCfg.rateFrom + (bowCfg.rateTo - bowCfg.rateFrom) * Math.max(0, Math.min(1, p.draw.c || 0));
      const h = draws.get(p.id);
      if (h && h.playing) h.set({ at, rate });
      else draws.set(p.id, audio.loop("bow_draw", { at, rate }));
    } else stopDraw(p.id);
    if (now.recover - was.recover > swingCfg.rise) {
      if (kind === "bow") audio.play("bow_release", { at });
      else if (kind === "spell") audio.play("cast", { at });
    }
  }
  for (const id of [...hands.keys()]) {
    if (S.players.some((p) => p.id === id)) continue;
    hands.delete(id);
    stopDraw(id);
  }
}

function stopDraw(id) {
  const h = draws.get(id);
  if (h) h.stop(0.08);
  draws.delete(id);
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

// ---- the dead: a death when one is dead that was not (a tier below a hit), a fall when one goes down that was standing
// (so downed reads apart from dead; #385). First sight is learned silently.
function bodyState(z) {
  const dead = !!(z.dead || z.corpse);
  return { dead, down: !dead && z.state === "down" };
}

function deaths(S) {
  const seen = new Set();
  for (const z of theDead(S)) {
    seen.add(z.id);
    const now = bodyState(z);
    const was = bodies.get(z.id);
    bodies.set(z.id, now);
    if (!was) continue;
    if (now.dead && !was.dead) audio.play("death", { at: [z.gx, z.gy] });
    else if (now.down && !was.down) audio.play("fall", { at: [z.gx, z.gy] });
  }
  for (const id of [...bodies.keys()]) if (!seen.has(id)) bodies.delete(id);
}

// ---- the moan (#424): one of the dead turning from a calm state to closing on someone (the chase, or breaking an opening or
// pressing a fence to come at them) moans, throttled by its own last moan and
// by anyone's, so a crowd closing at once gives one or two, not a drone. First sight is learned silently.
function moans(S, sim) {
  const seen = new Set();
  for (const z of S.zombies) {
    if (!z || z.dead || z.corpse) continue;
    seen.add(z.id);
    const was = chases.get(z.id);
    const now = { state: z.state, last: was ? was.last : -Infinity, count: was ? was.count : 0 };
    chases.set(z.id, now);
    if (!was || !moanCfg.to.includes(z.state) || !moanCfg.from.includes(was.state)) continue; // a calm one closing on someone
    if (sim - now.last < moanCfg.again || sim - lastMoan < moanCfg.gap) continue;
    now.last = sim;
    now.count++;
    lastMoan = sim;
    audio.play("moan", { at: [z.gx, z.gy], variant: hashString(`${z.id}#moan${now.count}`) });
  }
  for (const id of [...chases.keys()]) if (!seen.has(id)) chases.delete(id);
}

// ---- a strike (#424): each jolt this client drew since the last update, at the edge struck.
function struckWalls() {
  for (const [tx, ty, edge] of strikes) audio.play("strike", { at: edge === "w" ? [tx - 0.5, ty] : [tx, ty - 0.5] });
  strikes = [];
}

// ---- an arrow landing: an arrow or a fire arrow in flight last frame and gone now, heard at its last place. Each is matched
// to the nearest of its kind still flying (a guest's flights leave its list when their drawn flight ends, archery.stepFlights).
function inFlight() {
  return archery.arrowsInFlight().filter((a) => !a.done && LANDS.has(a.projectile)).map((a) => ({ gx: a.gx, gy: a.gy, projectile: a.projectile }));
}

function arrows() {
  const now = inFlight();
  const used = new Set();
  for (const a of flying) {
    let best = -1;
    let bestD = 3; // tiles: an arrow moves well under this between two frames
    now.forEach((b, i) => {
      if (used.has(i) || b.projectile !== a.projectile) return;
      const d = Math.hypot(b.gx - a.gx, b.gy - a.gy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) used.add(best);
    else audio.play("arrow_land", { at: [a.gx, a.gy] });
  }
  flying = now;
}

// ---- doors and shutters: every opening within `radius` of the listener, remembered by its edge. A change seen before
// plays the one creak at the opening, open or close (Michael: one placeholder for all four); a break plays nothing (its
// own sound is step 4, never the open); an opening first seen, walked into range, is learned silently.
// The scan's cost for the check (docs/40 step 2, item 8): the mean milliseconds of `n` silent scans where the listener
// stands. A silent scan only learns what is there, which the next real one would learn the same.
export function scanCost(S, n = 50) {
  if (!S || !S.players) return null;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) scanOpenings(S, false);
  return { ms: (performance.now() - t0) / n, openings: openings.size, every: openCfg.every };
}

// The doors, shutters, and gates on the listener's floor and the storeys next to it (docs/53 step 7: an upstairs door creaks), one a storey
// apart at `storeyVolume` of its loudness (data/sounds.json `openings`), each remembered by its edge and its floor. A read never grows a chunk.
function scanOpenings(S, play) {
  const [lx, ly] = listenerAt(S);
  const me = client.me;
  const LL = (me && !me.dead && me.layer) || 0;
  const r = Math.ceil(openCfg.radius);
  const cx = Math.round(lx);
  const cy = Math.round(ly);
  const seen = new Set();
  for (const L of [LL - 1, LL, LL + 1]) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const t = map.peekTile(x, y, L);
        if (!t) continue;
        for (const edge of ["n", "w"]) {
          const w = t[edge];
          if (!w || (w.kind !== "door" && w.kind !== "window")) continue;
          if (w.gate && w.gate.i) continue; // a castle gate creaks once, at its first edge, not once for each of its edges
          const key = `${x},${y},${edge},${L}`;
          seen.add(key);
          const now = { open: w.kind === "door" ? !!w.open : w.shutter === "open", broken: !!w.broken };
          const was = openings.get(key);
          openings.set(key, now);
          if (!play || !was) continue;
          if (now.broken !== was.broken) continue; // a break, not an open
          if (now.open !== was.open) audio.play(openCfg.slot, { at: edge === "n" ? [x, y - 0.5] : [x - 0.5, y], volume: L === LL ? 1 : openCfg.storeyVolume });
        }
      }
    }
  }
  for (const key of [...openings.keys()]) if (!seen.has(key)) openings.delete(key);
}
