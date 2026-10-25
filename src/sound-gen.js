// The placeholder sounds, generated at boot (docs/40, section 2), as placeholders.js is for the art: each slot without a
// `file` is rendered once into an AudioBuffer by an OfflineAudioContext (which the autoplay rule does not stop), from
// noise and oscillators shaped by filters and envelopes. A slot with a `file` decodes it instead, and falls back to its
// recipe with a warning if that fails. Nothing is downloaded for a placeholder and nothing waits for a sound file.
//
// The noise comes from a small generator of its own, seeded by the slot's name and variant, so a placeholder is the
// same sound on every boot and every client (check("sound") hashes them). Never rng.js, never Math.random.

// A 32-bit hash of a string (FNV-1a), the seed of a slot's variant.
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// mulberry32: a small seeded generator, 0 inclusive to 1 exclusive.
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A hash of a buffer's samples, quantised to 16 bits, for the check (two boots give the same sound).
export function hashBuffer(buffer) {
  const d = buffer.getChannelData(0);
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) {
    const q = Math.max(-32768, Math.min(32767, Math.round(d[i] * 32767)));
    h ^= q & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (q >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function OAC() {
  return typeof window !== "undefined" ? window.OfflineAudioContext || window.webkitOfflineAudioContext : null;
}

function noise(oc, seconds, rand) {
  const n = Math.max(1, Math.ceil(seconds * oc.sampleRate));
  const b = oc.createBuffer(1, n, oc.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = rand() * 2 - 1;
  const src = oc.createBufferSource();
  src.buffer = b;
  return src;
}

function filter(oc, type, freq, q = 0.707) {
  const f = oc.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

// A gain node shaped as an envelope: up to `peak` level over `attack`, then an exponential fall to near silence by `end`.
function envelope(oc, { start = 0, attack = 0.004, level = 1, end }) {
  const g = oc.createGain();
  const p = g.gain;
  p.setValueAtTime(0.0001, start);
  p.linearRampToValueAtTime(level, start + attack);
  p.exponentialRampToValueAtTime(0.0001, Math.max(start + attack + 0.001, end));
  return g;
}

function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

// The recipes. `g` the slot's numbers (data/sounds.json `gen`), `k` the variant's factor (0.9 to 1.1: a variant moves
// its centre frequency and length by up to a tenth), `rand` the slot's own generator, `L` the length in seconds.
const RECIPES = {
  step_dirt(oc, g, k, rand, L) {
    const n = noise(oc, L, rand);
    chain(n, filter(oc, "lowpass", g.cut * k), envelope(oc, { attack: 0.004, level: 0.8, end: L }), oc.destination);
    const o = oc.createOscillator();
    o.frequency.value = g.thump * k;
    chain(o, envelope(oc, { attack: 0.003, level: 0.7, end: g.thumpLength }), oc.destination);
    o.start(0);
    o.stop(L);
    return [n];
  },
  step_wood(oc, g, k, rand, L) {
    const o = oc.createOscillator();
    o.frequency.setValueAtTime(g.from * k, 0);
    o.frequency.exponentialRampToValueAtTime(g.to * k, Math.min(L, 0.05));
    chain(o, envelope(oc, { attack: 0.002, level: 0.9, end: L }), oc.destination);
    o.start(0);
    o.stop(L);
    const n = noise(oc, 0.005, rand);
    chain(n, filter(oc, "highpass", g.clickCut), envelope(oc, { attack: 0.0005, level: 0.5, end: 0.005 }), oc.destination);
    return [n];
  },
  step_stone(oc, g, k, rand, L) {
    const n = noise(oc, g.clickLength, rand);
    chain(n, filter(oc, "highpass", g.clickCut * k), envelope(oc, { attack: 0.0008, level: 0.8, end: g.clickLength }), oc.destination);
    const o = oc.createOscillator();
    o.frequency.value = g.knock * k;
    chain(o, envelope(oc, { attack: 0.002, level: 0.6, end: L }), oc.destination);
    o.start(0);
    o.stop(L);
    return [n];
  },
  step_water(oc, g, k, rand, L) {
    const n = noise(oc, L, rand);
    const f = filter(oc, "bandpass", g.from * k, 1.2);
    f.frequency.setValueAtTime(g.from * k, 0);
    f.frequency.exponentialRampToValueAtTime(g.to * k, L);
    chain(n, f, envelope(oc, { attack: 0.01, level: 0.8, end: L }), oc.destination);
    const bubbles = Math.max(1, Math.round(g.bubbles || 2));
    for (let i = 0; i < bubbles; i++) {
      const t = (i + 0.3 + rand() * 0.5) * (L / (bubbles + 1));
      const o = oc.createOscillator();
      o.frequency.setValueAtTime(1000 + rand() * 2000, t);
      o.frequency.exponentialRampToValueAtTime((1000 + rand() * 2000) * 1.3, t + 0.02);
      chain(o, envelope(oc, { start: t, attack: 0.002, level: 0.25, end: t + 0.025 }), oc.destination);
      o.start(t);
      o.stop(t + 0.03);
    }
    return [n];
  },
  shuffle(oc, g, k, rand, L) {
    const n = noise(oc, L, rand);
    // A drag, not a footfall: a slow rise and a slow fall.
    chain(n, filter(oc, "lowpass", g.cut * k), envelope(oc, { attack: L * 0.4, level: 0.9, end: L }), oc.destination);
    return [n];
  },
  swing(oc, g, k, rand, L) {
    const n = noise(oc, L, rand);
    const [a, b, c] = g.sweep;
    const f = filter(oc, "bandpass", a * k, 1.4);
    f.frequency.setValueAtTime(a * k, 0);
    f.frequency.exponentialRampToValueAtTime(b * k, g.peak);
    f.frequency.exponentialRampToValueAtTime(c * k, L);
    chain(n, f, envelope(oc, { attack: g.peak, level: 1, end: L }), oc.destination);
    return [n];
  },
  // ---- step 2 (#386)
  shove(oc, g, k, rand, L) {
    // A push: a dull thump under a short breath of low noise.
    const n = noise(oc, L, rand);
    chain(n, filter(oc, "lowpass", g.cut * k), envelope(oc, { attack: 0.006, level: 0.8, end: L }), oc.destination);
    const o = oc.createOscillator();
    o.frequency.setValueAtTime(g.thump * k, 0);
    o.frequency.exponentialRampToValueAtTime(g.thump * k * 0.6, L);
    chain(o, envelope(oc, { attack: 0.003, level: 0.7, end: L * 0.7 }), oc.destination);
    o.start(0);
    o.stop(L);
    return [n];
  },
  bow_draw(oc, g, k, rand, L) {
    // The draw's creak, a loop: a band-passed sawtooth with a slow wobble, held level end to end so it loops clean.
    const o = oc.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = g.freq * k;
    const lfo = oc.createOscillator();
    lfo.frequency.value = 1 / L; // one whole wobble over the loop, so its ends meet
    const depth = oc.createGain();
    depth.gain.value = g.wobble;
    chain(lfo, depth);
    depth.connect(o.frequency);
    const level = oc.createGain();
    level.gain.value = 0.35;
    chain(o, filter(oc, "bandpass", g.centre * k, 2), level, oc.destination);
    o.start(0);
    lfo.start(0);
    o.stop(L);
    lfo.stop(L);
    return [];
  },
  bow_release(oc, g, k, rand, L) {
    // The twang: a plucked string by Karplus-Strong, made sample by sample, with a short whoosh under it.
    const sr = oc.sampleRate;
    const n = Math.ceil(L * sr);
    const b = oc.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    const period = Math.max(2, Math.round(sr / (g.freq * k)));
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = rand() * 2 - 1;
    for (let i = 0; i < n; i++) {
      const j = i % period;
      d[i] = ring[j] * Math.min(1, (n - i) / (sr * 0.05));
      ring[j] = 0.996 * 0.5 * (ring[j] + ring[(j + 1) % period]);
    }
    const src = oc.createBufferSource();
    src.buffer = b;
    const gain = oc.createGain();
    gain.gain.value = 0.6;
    chain(src, gain, oc.destination);
    const w = noise(oc, g.whoosh, rand);
    chain(w, filter(oc, "bandpass", 1200, 1), envelope(oc, { attack: 0.005, level: 0.4, end: g.whoosh }), oc.destination);
    return [src, w];
  },
  arrow_land(oc, g, k, rand, L) {
    const o = oc.createOscillator();
    o.frequency.setValueAtTime(g.freq * k, 0);
    o.frequency.exponentialRampToValueAtTime(g.freq * k * 0.5, L);
    chain(o, envelope(oc, { attack: 0.001, level: 0.9, end: L }), oc.destination);
    o.start(0);
    o.stop(L);
    const n = noise(oc, 0.008, rand);
    chain(n, filter(oc, "highpass", 1800), envelope(oc, { attack: 0.0005, level: 0.4, end: 0.008 }), oc.destination);
    return [n];
  },
  cast(oc, g, k, rand, L) {
    // A spell let go: a rising shimmer of noise and a chirp under it.
    const n = noise(oc, L, rand);
    const f = filter(oc, "bandpass", g.from * k, 3);
    f.frequency.setValueAtTime(g.from * k, 0);
    f.frequency.exponentialRampToValueAtTime(g.to * k, L);
    chain(n, f, envelope(oc, { attack: L * 0.3, level: 0.9, end: L }), oc.destination);
    const o = oc.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(g.from * k * 1.5, 0);
    o.frequency.exponentialRampToValueAtTime(g.to * k * 0.5, L);
    chain(o, envelope(oc, { attack: L * 0.2, level: 0.25, end: L }), oc.destination);
    o.start(0);
    o.stop(L);
    return [n];
  },
  death(oc, g, k, rand, L) {
    // A body giving out, a tier below a hit: a low falling tone and a soft collapse.
    const o = oc.createOscillator();
    o.frequency.setValueAtTime(g.from * k, 0);
    o.frequency.exponentialRampToValueAtTime(g.to * k, L);
    chain(o, envelope(oc, { attack: 0.01, level: 0.8, end: L }), oc.destination);
    o.start(0);
    o.stop(L);
    const n = noise(oc, L * 0.6, rand);
    chain(n, filter(oc, "lowpass", g.cut * k), envelope(oc, { start: 0.05, attack: 0.02, level: 0.5, end: L * 0.6 }), oc.destination);
    return [n];
  },
  fall(oc, g, k, rand, L) {
    // A body hitting the ground: a deep thud.
    const o = oc.createOscillator();
    o.frequency.setValueAtTime(g.freq * k * 1.6, 0);
    o.frequency.exponentialRampToValueAtTime(g.freq * k, 0.04);
    chain(o, envelope(oc, { attack: 0.002, level: 1, end: L }), oc.destination);
    o.start(0);
    o.stop(L);
    const n = noise(oc, 0.06, rand);
    chain(n, filter(oc, "lowpass", g.cut * k), envelope(oc, { attack: 0.001, level: 0.6, end: 0.06 }), oc.destination);
    return [n];
  },
  door(oc, g, k, rand, L) {
    // The creak, for a door and shutters alike, opening or closing (Michael: one placeholder for all four).
    const o = oc.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = g.freq * k;
    const lfo = oc.createOscillator();
    lfo.frequency.value = g.rate;
    const depth = oc.createGain();
    depth.gain.value = g.wobble;
    chain(lfo, depth);
    depth.connect(o.frequency);
    chain(o, filter(oc, "bandpass", g.centre * k, 3), envelope(oc, { attack: 0.04, level: 0.6, end: L }), oc.destination);
    o.start(0);
    lfo.start(0);
    o.stop(L);
    lfo.stop(L);
    return [];
  },
  moan(oc, g, k, rand, L) {
    // The dead's moan (#424): a low voice, falling, with a slow waver, through one vowel's formant.
    const o = oc.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(g.from * k, 0);
    o.frequency.linearRampToValueAtTime(g.to * k, L);
    const lfo = oc.createOscillator();
    lfo.frequency.value = g.vibrato;
    const depth = oc.createGain();
    depth.gain.value = g.depth;
    chain(lfo, depth);
    depth.connect(o.frequency);
    chain(o, filter(oc, "bandpass", g.formant * k, 2), envelope(oc, { attack: 0.18, level: 0.9, end: L }), oc.destination);
    o.start(0);
    lfo.start(0);
    o.stop(L);
    lfo.stop(L);
    return [];
  },
  strike(oc, g, k, rand, L) {
    // A blow on wood (#424): the dead at a door, shutters, boards, or a fence. A short thump and a knock of noise.
    const o = oc.createOscillator();
    o.frequency.setValueAtTime(g.freq * k, 0);
    o.frequency.exponentialRampToValueAtTime(g.freq * k * 0.6, L);
    chain(o, envelope(oc, { attack: 0.002, level: 0.9, end: L }), oc.destination);
    o.start(0);
    o.stop(L);
    const n = noise(oc, g.noiseLength, rand);
    chain(n, filter(oc, "lowpass", g.cut * k), envelope(oc, { attack: 0.001, level: 0.8, end: g.noiseLength }), oc.destination);
    return [n];
  },
  hit(oc, g, k, rand, L) {
    const o = oc.createOscillator();
    o.frequency.setValueAtTime(g.freq * k, 0);
    o.frequency.exponentialRampToValueAtTime(g.freq * k * g.drop, L);
    chain(o, envelope(oc, { attack: 0.002, level: 1, end: L }), oc.destination);
    o.start(0);
    o.stop(L);
    const n = noise(oc, g.noiseLength, rand);
    chain(n, filter(oc, "lowpass", g.noiseCut * k), envelope(oc, { attack: 0.001, level: 0.7, end: g.noiseLength }), oc.destination);
    return [n];
  },
};

export function recipeNames() {
  return Object.keys(RECIPES);
}

// One variant of one slot, rendered: an AudioBuffer at `sampleRate`.
export async function renderVariant(name, def, variant, sampleRate) {
  const Ctor = OAC();
  if (!Ctor) return null;
  const g = def.gen || {};
  const recipe = RECIPES[g.recipe];
  if (!recipe) throw new Error(`sound ${name}: no recipe "${g.recipe}"`);
  const rand = generator(hashString(`${name}#${variant}`));
  const k = 0.9 + rand() * 0.2; // the variant's factor: its centre and length moved by up to a tenth
  const L = Math.max(0.01, (g.length || 0.1) * k);
  const pad = def.loop ? 0 : 0.01; // a loop is rendered to its exact length, so its ends meet with no gap
  const oc = new Ctor(1, Math.ceil((L + pad) * sampleRate), sampleRate);
  const sources = recipe(oc, g, k, rand, L);
  for (const s of sources) if (s && s.start) s.start(0);
  return oc.startRendering();
}

// Every slot's buffers: { name: [AudioBuffer, ...] }. A slot with a `file` decodes it (one buffer, or one per path),
// falling back to its recipe; `decode` is the context's decodeAudioData.
export async function generateAll(slots, sampleRate, decode = null) {
  const out = {};
  const jobs = [];
  for (const [name, def] of Object.entries(slots)) {
    if (def.file && decode) {
      jobs.push((async () => {
        try {
          const paths = Array.isArray(def.file) ? def.file : [def.file];
          out[name] = await Promise.all(paths.map(async (p) => decode(await (await fetch(p)).arrayBuffer())));
        } catch (err) {
          console.warn(`sound ${name}: ${def.file} would not decode (${err.message}); using its recipe`);
          out[name] = await Promise.all(Array.from({ length: def.variants || 1 }, (_, v) => renderVariant(name, def, v, sampleRate)));
        }
      })());
    } else {
      jobs.push(Promise.all(Array.from({ length: def.variants || 1 }, (_, v) => renderVariant(name, def, v, sampleRate))).then((b) => { out[name] = b.filter(Boolean); }));
    }
  }
  await Promise.all(jobs);
  return out;
}
