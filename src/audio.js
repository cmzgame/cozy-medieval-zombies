// The sound engine (docs/40, section 1): one AudioContext, a gain per group into a master gain, the slots and their
// buffers, distance, the voice cap, and the log a check reads. A leaf: no game imports, so a tool page can use it.
// A sound is never game state: nothing here is saved, synced, or read by the simulation, and it rolls no rng.js.
//
// The browser keeps a new AudioContext suspended until the page has had a user gesture (the autoplay rule): unlock()
// resumes it on the first pointerdown or keydown. A sound asked for while it is suspended is dropped, not queued, but
// it is still written to the log, because a scripted pane can give no gesture and the check reads the log.

const GROUPS = ["effects", "ambience", "music", "interface"];

let ctx = null; // the AudioContext, or null where the browser has none (or before init)
let master = null; // the master gain node
const groupGain = {}; // group -> its GainNode
const slots = new Map(); // name -> { name, buffers, group, volume, radius, maxVoices, count }
let voices = []; // { slot, gain, node, end } now sounding
let voiceCap = 24;
let on = true; // the master switch (the Sound setting)
let masterLevel = 0.75; // the Volume setting
let duck = 1; // 0.3 while a screen is up on the wire (docs/40, section 1)
const groupLevel = { effects: 1, ambience: 0.5, music: 0.5, interface: 0.75 };
let listener = [0, 0];
let simClock = () => 0; // the ear hands in loop.simTime, to stamp the log
export const log = []; // the last LOG_MAX sounds asked for (docs/40: { name, variant, group, at, gain, muffled, sim, ctx })
const LOG_MAX = 200;

// Make the context and its graph. Safe to call twice; a browser with no Web Audio gets a silent engine that still logs.
export function init({ voices: cap = 24, groups = null } = {}) {
  voiceCap = cap;
  if (groups) for (const g of GROUPS) if (typeof groups[g] === "number") groupLevel[g] = groups[g];
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  try {
    ctx = new AC({ latencyHint: "interactive" });
  } catch {
    ctx = null;
    return null;
  }
  master = ctx.createGain();
  master.connect(ctx.destination);
  for (const g of GROUPS) {
    groupGain[g] = ctx.createGain();
    groupGain[g].connect(master);
  }
  applyLevels();
  return ctx;
}

export function context() {
  return ctx;
}

export function sampleRate() {
  return ctx ? ctx.sampleRate : 44100;
}

// The first gesture resumes the context; the listener removes itself. Nothing queued before it plays.
export function unlock() {
  if (typeof document === "undefined") return;
  const go = () => {
    document.removeEventListener("pointerdown", go, true);
    document.removeEventListener("keydown", go, true);
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  document.addEventListener("pointerdown", go, true);
  document.addEventListener("keydown", go, true);
}

// A hidden tab runs no frames: the context is suspended while hidden and resumed on return (the ear takes a fresh
// baseline then, sound-cues.js).
export function suspend() {
  if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
}
export function resume() {
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

function applyLevels() {
  if (!ctx) return;
  master.gain.value = on ? masterLevel * duck : 0;
  for (const g of GROUPS) groupGain[g].gain.value = groupLevel[g];
}

export function setOn(v) {
  on = !!v;
  applyLevels();
}
export function setMaster(v) {
  masterLevel = Math.max(0, Math.min(1, +v || 0));
  applyLevels();
}
export function setVolume(group, v) {
  if (!GROUPS.includes(group)) return;
  groupLevel[group] = Math.max(0, Math.min(1, +v || 0));
  applyLevels();
}
export function setDuck(v) {
  duck = Math.max(0, Math.min(1, +v));
  applyLevels();
}
export function setListener(gx, gy) {
  listener = [gx, gy];
}
export function setClock(fn) {
  if (typeof fn === "function") simClock = fn;
}

// A slot: a name with one or more buffers (its variants) and its numbers from data/sounds.json. A delivered
// recording and a generated placeholder register the same way.
export function register(name, buffers, def = {}) {
  slots.set(name, {
    name,
    buffers: buffers || [],
    group: GROUPS.includes(def.group) ? def.group : "effects",
    volume: typeof def.volume === "number" ? def.volume : 1,
    radius: typeof def.radius === "number" ? def.radius : 14,
    maxVoices: typeof def.maxVoices === "number" ? def.maxVoices : 6,
    count: 0, // the slot's own cosmetic counter, for a variant when none is asked for
  });
}

export function slot(name) {
  return slots.get(name) || null;
}

export function slotNames() {
  return [...slots.keys()].sort();
}

// One shot. `at` a grid point [gx, gy] or null (no place); `variant` an index, else the slot's own counter picks.
export function play(name, { at = null, volume = 1, rate = 1, variant = null } = {}) {
  const s = slots.get(name);
  if (!s || !s.buffers.length) return;
  if (!on || !(masterLevel > 0) || !(groupLevel[s.group] > 0)) return; // nothing logged with the switch off or the group at zero
  let fall = 1;
  if (at) {
    const d = Math.hypot(at[0] - listener[0], at[1] - listener[1]);
    if (!(d < s.radius)) return; // beyond the radius: not played, not logged, no voice spent
    fall = (1 - d / s.radius) ** 2;
  }
  const v = variant != null ? ((variant % s.buffers.length) + s.buffers.length) % s.buffers.length : s.count++ % s.buffers.length;
  const gain = s.volume * volume * fall * groupLevel[s.group] * masterLevel * duck;
  log.push({ name, variant: v, group: s.group, at: at ? [+at[0].toFixed(2), +at[1].toFixed(2)] : null, gain: +gain.toFixed(4), muffled: false, sim: simClock(), ctx: ctx ? ctx.currentTime : 0 });
  if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  if (!ctx || ctx.state !== "running") return; // suspended (no gesture yet, or hidden): dropped, never queued
  start(s, v, s.volume * volume * fall, rate);
}

function start(s, v, level, rate) {
  const now = ctx.currentTime;
  voices = voices.filter((x) => x.end > now);
  // The cap, the quietest dropped first: a slot's own, then the whole.
  const mine = voices.filter((x) => x.slot === s.name);
  const over = (list, cap) => {
    if (list.length < cap) return true;
    const quietest = list.reduce((a, b) => (a.gain <= b.gain ? a : b));
    if (quietest.gain >= level) return false; // the new one is the quietest: it is the one dropped
    stopVoice(quietest);
    return true;
  };
  if (!over(mine, s.maxVoices)) return;
  if (!over(voices, voiceCap)) return;
  const src = ctx.createBufferSource();
  src.buffer = s.buffers[v];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = level;
  src.connect(g);
  g.connect(groupGain[s.group]);
  const voice = { slot: s.name, gain: level, node: src, end: now + src.buffer.duration / rate };
  src.onended = () => {
    voices = voices.filter((x) => x !== voice);
    try { g.disconnect(); } catch { /* already gone */ }
  };
  voices.push(voice);
  src.start();
}

function stopVoice(voice) {
  voices = voices.filter((x) => x !== voice);
  try { voice.node.stop(); } catch { /* already stopped */ }
}

// A looping sound (docs/40, section 1): the bow's draw today, fires and the beds later. Returns a handle with
// `set({ at, volume, rate })` (its gain recomputed by distance) and `stop(fade)`. Logged once, when it starts, as a
// one-shot is; with the switch off, the group at zero, or past its radius it starts silent and logs nothing, and a later
// `set` does not wake it (the ear starts a fresh one when the cause begins again).
export function loop(name, { at = null, volume = 1, rate = 1 } = {}) {
  const dead = { set() {}, stop() {}, playing: false };
  const s = slots.get(name);
  if (!s || !s.buffers.length) return dead;
  if (!on || !(masterLevel > 0) || !(groupLevel[s.group] > 0)) return dead;
  const fallAt = (p) => {
    if (!p) return 1;
    const d = Math.hypot(p[0] - listener[0], p[1] - listener[1]);
    return d < s.radius ? (1 - d / s.radius) ** 2 : 0;
  };
  const f0 = fallAt(at);
  if (!(f0 > 0)) return dead;
  log.push({ name, variant: 0, group: s.group, at: at ? [+at[0].toFixed(2), +at[1].toFixed(2)] : null, gain: +(s.volume * volume * f0 * groupLevel[s.group] * masterLevel * duck).toFixed(4), muffled: false, sim: simClock(), ctx: ctx ? ctx.currentTime : 0, loop: true });
  if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  const handle = { playing: true, set() {}, stop() { handle.playing = false; } };
  if (!ctx || ctx.state !== "running") return handle; // suspended: logged, never queued
  const src = ctx.createBufferSource();
  src.buffer = s.buffers[0];
  src.loop = true;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = s.volume * volume * f0;
  src.connect(g);
  g.connect(groupGain[s.group]);
  src.start();
  handle.set = ({ at: p = at, volume: v = volume, rate: r = null } = {}) => {
    at = p;
    volume = v;
    g.gain.setTargetAtTime(s.volume * v * fallAt(p), ctx.currentTime, 0.03);
    if (r != null) src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.03);
  };
  handle.stop = (fade = 0.3) => {
    if (!handle.playing) return;
    handle.playing = false;
    const t = ctx.currentTime;
    g.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 3));
    try { src.stop(t + fade); } catch { /* already stopped */ }
    src.onended = () => { try { g.disconnect(); } catch { /* gone */ } };
  };
  return handle;
}

export function state() {
  return { context: ctx ? ctx.state : "none", on, master: masterLevel, duck, voices: voices.length, slots: slots.size, listener: [...listener] };
}
