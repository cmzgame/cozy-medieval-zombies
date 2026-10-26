// Every instrument in one page, to find the ones that pass or fail by what ran before them (test hygiene, after #465). From the
// console, on a tab with `?nosave&mute` (the valley; silent, as every test page is unless its test is about sound):
//   await __game.check("all", { baseline: true })   the fresh-page run: one check a page, the page reloading itself between (the
//                                                    queue in this tab's sessionStorage, picked up again by dev.js after each boot);
//                                                    with `only`, just those, the rest of a kept run kept; read the end with
//                                                    __game.check("all", { report: true }) when `mode` is `done` (each a minute or less)
//   await __game.check("all")                        every check in this page, in docs/testing.md's order
//   await __game.check("all", { reverse: true })     the same, reversed (on a fresh page of its own)
// A sweep returns each check's count, `differ` (every row whose result is not the fresh run's, by check and row, with its detail; a
// row's numbers are masked, so a count in its words is the same row), `reworded` (rows in one run only, passing: their words carry a
// choice the run made), and `left` (what each check left changed behind it: the player, alive and hurt, the needs, what is carried, the
// bodies, the doors and shutters, the valley's stations and chests, a menu, panel, ghost, or key left open or held, the pause, the
// rules, the hour, the screen). The fresh run is the one in sessionStorage, or `opts.fresh`; `opts.only` names the checks to run, in
// its order. A check that throws or runs past `opts.limit` seconds (300: worlds alone takes over 90 in a hidden pane, whose timers are slowed) is one row of its own, "threw" or "timed out". Left out, by
// their own protocol: determinism, frame, and sheets (a fresh boot, compared with the last boot's), and this runner; and sound, unless
// `{ sound: true }`. The checks that need a second tab (sync, wire, the guests' halves) or the proving ground (ground, light) run
// alone here, and their alone-rows are compared as any.

const KEY = "cmz-check-all";
const SKIP = ["all", "determinism", "frame", "sheets"]; // sheets, like determinism, compares this boot with the last
// The checks that play sound, left out unless asked for with `{ sound: true }`: the pane is heard, and a sweep's sounds go on for
// minutes (Michael, 2026-10-25: every test page silent unless the test is about sound; open it with `?nosave&mute`).
const LOUD = ["sound"];

async function names(withSound = false) {
  const testing = await (await fetch("/docs/testing.md", { cache: "no-store" })).text();
  const list = testing.split("\n").find((l) => l.startsWith("**The instruments**")) || "";
  // The checks are the folder's files; the order is the one docs/testing.md names them in, the rest after, by name.
  const listing = await (await fetch("/tools/checks/", { cache: "no-store" })).text();
  const files = [...new Set([...listing.matchAll(/href="([a-z0-9_-]+)\.js"/g)].map((m) => m[1]))].filter((n) => !SKIP.includes(n) && (withSound || !LOUD.includes(n)));
  const at = (n) => { const i = list.indexOf("`" + n + "`"); return i < 0 ? Infinity : i; };
  return files.sort((a, b) => at(a) - at(b) || (a < b ? -1 : 1));
}

// What a check may leave changed behind it, read before and after each one in a sweep: the player (who, alive, hurt), the players
// and the bodies, the pause, the world's rules, the time scale, the screen. A key that moved is named against the check that moved it.
// (The props and the animals are left out: they move by the world's own growth round the player and its renewal of the herds.)
function probe(G) {
  const S = G.game.state;
  const me = G.player;
  return {
    me: me ? me.id : "none",
    dead: me ? !!me.dead : null,
    hp: me ? Math.round(me.hp) : null,
    hunger: me ? Math.round(me.hunger / 10) * 10 : null, // the needs to the ten: a check that steps for hours drains them
    thirst: me ? Math.round(me.thirst / 10) * 10 : null,
    tired: me ? Math.round(me.tired / 10) * 10 : null,
    hurt: me ? `${me.bleed ? "bleed " : ""}${me.sick ? "sick " : ""}${me.infection ? "infected" : ""}`.trim() || "-" : null,
    clockDays: Math.floor(G.clock.getElapsed() / G.clock.DAY_LENGTH),
    hour: Math.floor(G.clock.getHour()),
    openings: openings(G), // the doors open, the openings broken, the shutters open, over the grown chunks
    bag: me && G.inventory.bagOf(me) ? G.inventory.bagOf(me).items.map((e) => e.id).sort().join(",") : "-", // what is carried
    belt: me ? (G.inventory.beltOf(me) || []).map((e) => (e ? e.id : "")).join(",") : "-",
    hands: me ? [me.hands.main, me.hands.off].map((e) => (e ? `${e.id}${e.lit ? "*" : ""}` : "")).join("|") : "-", // a lit one starred
    things: things(G), // the stations, containers, and fires standing, by sprite
    ui: ui(G), // what of the interface is open or held: a menu, a panel, the palette, a ghost, the Use mode, a key down
    near: me ? [...S.corpses, ...(S.animals || []), ...S.players.filter((q) => q !== me)].filter((c) => Math.hypot(c.gx - me.gx, c.gy - me.gy) < 4).map((c) => `${c.species || c.kind}${c.dead ? " dead" : ""}`).sort().join(", ") || "-" : "-", // bodies and beasts close by
    players: S.players.length,
    corpses: S.corpses.length,
    paused: G.loop.isPaused(),
    rules: JSON.stringify(G.rules.rules),
    timeScale: G.world.world.timeScale,
    tuning: tuningSum(G), // every number in data/tuning.json as the page holds it: a check that changes one names it here
    screen: G.screens.currentScreen() || "none",
  };
}
// The stations, containers, and fires on the valley's own chunks (never dropped, unlike the wild's): one that goes is a real change,
// one that comes may be its chunk growing round the player, so only what went is named.
function things(G) {
  const n = {};
  for (const q of G.map.allProps()) {
    const d = G.assets.getDef(q.sprite) || {};
    if (!(d.station || q.container || q.bag || q.fire)) continue;
    const c = G.map.getChunk(Math.floor(q.tile[0] / G.map.CHUNK), Math.floor(q.tile[1] / G.map.CHUNK), false);
    if (c && !c.wild) n[q.sprite] = (n[q.sprite] || 0) + 1;
  }
  return JSON.stringify(Object.keys(n).sort().map((k) => [k, n[k]]));
}
let panels = null; // the panels' modules, imported once a sweep
function ui(G) {
  const open = [];
  if (G.menu.isMenuOpen()) open.push("menu");
  if (G.panel.isOpen()) open.push(G.panel.isCharacter() ? "character" : "bag");
  if (G.buildPalette.isOpen()) open.push("palette");
  if (G.placement.state && G.placement.state.active) open.push("ghost");
  if (G.use.isActive()) open.push("use");
  if (G.input.getMouse().inside) open.push("mouse over the canvas");
  if (panels) for (const [name, m] of Object.entries(panels)) if (m.isOpen()) open.push(name);
  const keys = G.input.heldKeys ? G.input.heldKeys() : [];
  return [...open, ...keys.map((k) => `key ${k}`)].join(", ") || "-";
}
function tuningSum(G) {
  const flat = [];
  const walk = (o, path) => { if (o && typeof o === "object") for (const k of Object.keys(o)) walk(o[k], `${path}.${k}`); else if (typeof o !== "function") flat.push(`${path}=${o}`); };
  for (const k of Object.keys(G.tuning)) if (typeof G.tuning[k] === "object") walk(G.tuning[k], k);
  return flat.join(";");
}
function openings(G) {
  let open = 0, broken = 0, shutters = 0;
  for (const c of G.map.loadedChunks()) for (const t of c.tiles || []) for (const e of ["n", "w"]) {
    const w = t && t[e];
    if (!w || (w.kind !== "door" && w.kind !== "window")) continue;
    if (w.broken) broken++;
    else if (w.kind === "door" && w.open) open++;
    else if (w.kind === "window" && w.shutter === "open") shutters++;
  }
  return `${open} open, ${broken} broken, ${shutters} shutters open`;
}
// A list key (the bag, the things) is named by what came and went; the rules by which changed; the rest as before -> after.
function delta(a, b) {
  const count = (list) => { const m = {}; for (const x of list) m[x] = (m[x] || 0) + 1; return m; };
  const A = count(a), B = count(b), out = [];
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) { const d = (B[k] || 0) - (A[k] || 0); if (d) out.push(`${d > 0 ? "+" : ""}${d} ${k}`); }
  return out.join(", ");
}
const moved = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => {
  if (k === "tuning") { const A = new Set(a.tuning.split(";")); const B = new Set(b.tuning.split(";")); return `tuning: ${[...B].filter((x) => !A.has(x)).join(", ")}`; }
  if (k === "rules") return `rules: ${Object.keys(JSON.parse(a.rules)).filter((r) => JSON.parse(a.rules)[r] !== JSON.parse(b.rules)[r]).join(", ")}`;
  if (k === "bag") return `bag: ${delta(a.bag.split(",").filter(Boolean), b.bag.split(",").filter(Boolean))}`;
  if (k === "things") { const flat = (t) => JSON.parse(t).flatMap(([s, n]) => Array(n).fill(s)); const gone = delta(flat(a.things), flat(b.things)).split(", ").filter((x) => x.startsWith("-")).join(", "); return gone ? `things gone: ${gone}` : null; }
  return `${k}: ${a[k]} -> ${b[k]}`;
}).filter(Boolean);

// A row's words with their numbers masked (a count or a place in them is the same row), and a repeated row given its ordinal.
const mask = (words) => String(words).replace(/ \(#\d+\)$/, "").replace(/-?\d+(\.\d+)?/g, "#");
function keyed(rows, words, result) {
  const w = mask(words);
  let k = w;
  for (let i = 2; k in rows; i++) k = `${w} (${i})`;
  rows[k] = result;
  return k;
}
// A fresh run kept with its words whole (an older runner's) is keyed again the same way.
const rekey = (base) => { const out = {}; for (const [k, v] of Object.entries(base)) keyed(out, k, v); return out; };

const store = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; } };
const keep = (s) => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* a page with no storage runs the sweep only */ } };

// One check, its rows as { key: result }: a repeated row's words get its ordinal, so two rows of the same words stay two. `details`,
// when given, takes each row's detail by the same key (a sweep's, to say why a row differs).
async function runOne(G, name, limit, details = null) {
  const rows = {};
  const add = (check, result, detail = "") => { const k = keyed(rows, check, result); if (details) details[k] = String(detail).slice(0, 240); };
  let timer = null;
  try {
    const r = await Promise.race([G.check(name), new Promise((_, no) => { timer = setTimeout(() => no(new Error(`timed out after ${limit} s`)), limit * 1000); })]);
    const list = r && Array.isArray(r.rows) ? r.rows : null;
    if (list) for (const row of list) add(String(row.check), /^pass$/i.test(String(row.result)) ? "pass" : "FAIL", row.detail ?? "");
    else if (r && Array.isArray(r.results)) for (const x of r.results) add(String(x.name), x.ok ? "pass" : "FAIL", x.detail ?? ""); // growth's shape
    else if (r && typeof r.same === "boolean") add("the same as the last boot", r.same ? "pass" : "FAIL", ""); // sheets'
    else add("(no rows)", "pass");
  } catch (e) {
    add(/timed out/.test(e.message) ? "timed out" : "threw", `FAIL ${String(e.message).slice(0, 120)}`, e.stack ? e.stack.split(String.fromCharCode(10)).slice(1, 3).join(" <- ") : ""); // where it threw, for the sweep's detail
  } finally {
    clearTimeout(timer);
  }
  return rows;
}

// The fresh-page run goes on here after each reload (dev.js calls this while the queue is in sessionStorage).
export async function resume(G) {
  const s = store();
  if (!s || s.mode !== "baseline" || !s.queue.length) return;
  for (let i = 0; i < 120 && !(G.player && G.check); i++) await new Promise((r) => setTimeout(r, 500));
  const name = s.queue.shift();
  s.fresh[name] = await runOne(G, name, s.limit);
  s.mode = s.queue.length ? "baseline" : "done";
  keep(s);
  if (s.queue.length) location.reload();
  else console.log(`check("all"): the fresh-page run is done, ${Object.keys(s.fresh).length} checks; run check("all") on a fresh page`);
}

export async function run(game, opts = {}) {
  const G = game;
  const limit = opts.limit || 300;
  if (opts.baseline) {
    // With `only`, the named checks are run fresh again and the rest of a kept fresh run stays (a check changed since).
    const queue = opts.only || (await names(!!opts.sound));
    const kept = opts.only && store() ? store().fresh || {} : {};
    keep({ mode: "baseline", queue, fresh: kept, limit });
    location.reload();
    return { started: queue.length, note: "the page reloads once a check; read the end with check('all', { report: true })" };
  }
  const s = store();
  if (opts.report) return s ? { mode: s.mode, left: s.queue.length, ran: Object.keys(s.fresh).length, failingFresh: Object.fromEntries(Object.entries(s.fresh).map(([n, r]) => [n, Object.entries(r).filter(([, v]) => v !== "pass").map(([k]) => k)]).filter(([, v]) => v.length)) } : { mode: "none" };
  const fresh = opts.fresh || (s && s.fresh) || {};
  let order = opts.only || (await names(!!opts.sound));
  if (opts.reverse) order = order.slice().reverse();
  panels = { map: await import("/src/ui/map-panel.js"), station: await import("/src/ui/station-panel.js"), talk: await import("/src/ui/talk-panel.js") };
  const counts = {};
  const differ = [];
  const left = {}; // what each check left changed (probe)
  const reworded = []; // rows in one run only, passing
  const t0 = performance.now();
  for (const [i, name] of order.entries()) {
    window.__checkAll = { at: name, done: i, of: order.length, differ: differ.length }; // where a long sweep is, for a console that asks
    const before = probe(G);
    const details = {};
    const rows = await runOne(G, name, limit, details);
    const after = probe(G);
    const changed = moved(before, after);
    if (changed.length) left[name] = changed;
    const passed = Object.values(rows).filter((v) => v === "pass").length;
    counts[name] = `${passed}/${Object.keys(rows).length}`;
    const base = fresh[name] && rekey(fresh[name]);
    if (!base) continue;
    // A row in both runs whose result changed differs; a row in one run only was reworded (its words carry a choice the run made, such as
    // which house it found): it differs only when it fails here, or when a row that failed fresh is gone and nothing in its place fails.
    for (const [k, v] of Object.entries(rows)) {
      const was = base[k];
      if (was === undefined) (v === "pass" ? reworded : differ).push({ check: name, row: k, fresh: "(none)", here: v, detail: details[k] });
      else if ((was === "pass") !== (v === "pass")) differ.push({ check: name, row: k, fresh: was, here: v, detail: details[k] });
    }
    for (const k of Object.keys(base)) if (!(k in rows)) reworded.push({ check: name, row: k, fresh: base[k], here: "(none)" });
  }
  const unbased = order.filter((n) => !fresh[n]);
  console.table(differ);
  return { order: opts.reverse ? "reversed" : "testing.md's", ran: order.length, seconds: Math.round((performance.now() - t0) / 1000), counts, differ, reworded, left, unbased };
}
