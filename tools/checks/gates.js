// The castle gates (Michael, 2026-10-29, docs/09; docs/02: "the dead cannot break a closed gate", bites and melee do not pass its bars, arrows and spells do,
// fire does not spread through it, Free building only, placed at once and free). From the console, on a tab with `?nosave&mute` sized 1280 by 800 (docs/testing.md), in the valley:
//   await __game.check("gates")
// It lays stone wall on open ground across a chunk's corner, builds both gates (2 and 3 wide) on both runs (n and w) by the commands a guest sends
// (placement.performPlacement, Free building on), and reads:
//   1. The data: both definitions, their flags (the rulings, as data), their pictures and the parts sheet's three frames on each run.
//   2. The palette: both entries under "Castle" on the Build tab, `dev` (Free building only), free; the ghost spans the run, green or red with a reason.
//   3. The build, both widths on both runs: one door-kind wall on each edge of the run, `gate: { i }`, the plain wall remembered under each, shut,
//      no post inside or at the ends of the arch; refusals over a door, a window, a painting, a torch, a gap, another gate, a log wall, out of
//      reach, with a body across, and with Free building off, each in its words, nothing changed.
//   4. A gate across a chunk's edge: both chunks touched on a toggle, the record round-tripped as the wire and the save carry it, the sync part equal.
//   5. E: "Open gate" and "Close gate" (never "door"), on any edge of it, all its edges together, no boards offered; taking it apart whole puts
//      the plain wall back on each edge.
//   6. Bodies, sight, reach, light, rooms, shots: shut it stops a body by the movement keys and a path, passes sight and light, bounds a room (sealed) and
//      is no way through; open it lets a body through; a blow and a bite do not cross it shut; an arrow does; the dead break nothing of it, bite
//      nothing through it, and win no way in.
//   7. The swing: its three frames drawn (closed, mid, raised) and its seconds the definition's.
// What it built is taken down again; the player, the rules, the hour, the pause, and the camera are put back in its finally.

const rowsOf = () => {
  const results = [];
  return {
    results,
    row: (name, ok, detail = "") => results.push({ name, ok: !!ok, detail }),
    finish() {
      const passed = results.filter((r) => r.ok).length;
      for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
      return { passed, total: results.length, results };
    },
  };
};

// Open grass for the layout (W by H and a tile round it), the corner (X0 + 8, Y0 + 8) a chunk's corner, nearest the spawn.
function findSpot(G, W, H) {
  const map = G.map;
  const C = map.CHUNK;
  const open = (X0, Y0) => {
    map.ensureAround(X0 + W / 2, Y0 + H / 2, 2);
    for (let b = -1; b <= H; b++) for (let a = -1; a <= W; a++) {
      const t = map.peekTile(X0 + a, Y0 + b, 0);
      if (!(t && !t.prop && !t.n && !t.w && !t.rug && !(t.items && t.items.length) && map.isWalkableTile(X0 + a, Y0 + b))) return false;
    }
    return true;
  };
  const tries = [];
  for (let cy = 6; cy <= 14; cy++) for (let cx = 4; cx <= 14; cx++) tries.push([cx * C - 8, cy * C - 8]);
  tries.sort((p, q) => Math.hypot(p[0] - 153, p[1] - 137) - Math.hypot(q[0] - 153, q[1] - 137));
  return tries.find(([x, y]) => open(x, y)) || null;
}

export async function run(game) {
  const G = game;
  const { results, row, finish } = rowsOf();
  if (G.net.status().role === "guest") {
    row("this tab is the host", false, "the check builds: run it alone or on the host");
    return finish();
  }
  if (!new URLSearchParams(location.search).has("nosave")) {
    row("a ?nosave page", false, "the walls and gates it builds are taken down again, but a kept world would autosave them mid-way: open the page with ?nosave&mute");
    return finish();
  }
  const map = G.map;
  const me = G.player;
  const placement = G.placement;
  const light = await import("/src/light.js");
  const walls = await import("/src/render/walls.js");
  const archery = await import("/src/archery.js");
  const combat = await import("/src/combat.js");
  const { lineOfSight, lineOfReach } = G.visibility;
  const { createZombie } = await import("/src/entities/zombie.js");
  const inp = await import("/src/input.js");
  const scene = await import("/src/render/scene.js");
  const saved = { paused: G.loop.isPaused(), gx: me.gx, gy: me.gy, layer: me.layer || 0, rise: me.rise || 0, free: G.rules.rules.freeBuilding, aggro: G.rules.rules.zombieAggro, hour: G.clock.getHour(), hp: me.hp, main: me.hands.main, off: me.hands.off };
  const made = []; // [x, y, edge] of every wall the check laid, taken down in the finally
  const dead = [];
  const cv = document.getElementById("game");
  const cam0 = { gx: G.camera.cam.gx, gy: G.camera.cam.gy };
  const mouse0 = { ...inp.getMouse() };
  const cvRect = cv.getBoundingClientRect();
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const stay = (x, y) => { me.layer = 0; me.rise = 0; me.auto = null; G.teleport(x, y); step(1); };
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code, bubbles: true }));
  const hold = (codes, n, stop = null) => {
    codes.forEach((c) => key(c, true));
    const log = [];
    try {
      for (let i = 0; i < n; i++) {
        step(1);
        log.push([me.gx, me.gy]);
        if (stop && stop(log)) break;
      }
    } finally {
      codes.forEach((c) => key(c, false));
      step(1);
    }
    return log;
  };
  const place = (cmd) => { placement.performPlacement(me, cmd); for (let i = 0; i < 45 && me.action; i++) step(1); };
  const wallAt = (x, y, e) => map.peekTile(x, y, 0) && map.peekTile(x, y, 0)[e];
  const lay = (x, y, e, sprite = "wall_stone") => { if (map.buildWall(x, y, e, "wall", sprite)) made.push([x, y, e]); };
  const members = (x, y, e) => map.gateMembers(x, y, e, 0);
  try {
    G.loop.setPaused(true);
    G.rules.set({ freeBuilding: true, zombieAggro: false });
    G.clock.setHour(12);
    const spot = findSpot(G, 20, 18);
    if (!spot) {
      row("open grass for the layout was found", false, "none in the loaded map");
      return finish();
    }
    const [X0, Y0] = spot;
    const CX = X0 + 8; // the chunk's corner: tiles from CX east are in the next chunk, from Y0 + 8 south
    const CY = Y0 + 8;
    row("the layout's corner is a chunk's corner", map.CHUNK === 16 && CX % 16 === 0 && CY % 16 === 0, `corner ${CX},${CY}`);

    // ---- 1. The data ----
    const rules = [2, 3].map((n) => map.wallRule(`wall_stone_gate_${n}`));
    const sheets = [2, 3].map((n) => G.assets.getSheet(`wall_stone_gate_${n}`));
    const partsSheets = [2, 3].map((n) => G.assets.getSheet(`wall_parts_gate_stone_${n}`));
    const dims = [[81, 137], [113, 153]];
    row("both gates are defined: a stone run (`wall.run`), a span of 2 and 3, the rulings as flags (the dead cannot break it, its bars pass sight and shots but not a blow or a bite, no fire through it), a swing in seconds",
      rules.every((r, i) => r.run === "wall_stone" && r.gate && r.gate.span === i + 2 && r.gate.grille === true && r.gate.deadBreak === false && r.gate.bitesPass === false && r.gate.shotsPass === true && r.gate.fireSpreads === false && r.gate.swing > 0 && r.gate.opening.crown === 78) && map.wallRule("wall_stone").run === "wall_stone" && !map.wallRule("wall_stone").gate,
      rules.map((r) => JSON.stringify({ span: r.gate && r.gate.span, run: r.run, swing: r.gate && r.gate.swing })).join(" "));
    row("each gate's picture is its run wide (81 by 137 and 113 by 153), on both runs, and each parts sheet holds the portcullis in closed, mid, and raised on both",
      sheets.every((s, i) => ["north_gate", "west_gate"].every((n) => s.frames[n] && s.frames[n][2] === dims[i][0] && s.frames[n][3] === dims[i][1])) && partsSheets.every((s) => ["north", "west"].every((side) => ["closed", "mid", "raised"].every((st) => s.frames[`leaf_${side}_${st}`]))),
      sheets.map((s) => ["north_gate", "west_gate"].map((n) => s.frames[n].slice(2).join("x")).join("/")).join(" "));

    // ---- 2. The palette ----
    G.rules.set({ freeBuilding: false });
    const off = placement.paletteKinds().filter((k) => placement.isGateBuild(k.id)).length;
    G.rules.set({ freeBuilding: true });
    const on = placement.paletteKinds().filter((k) => placement.isGateBuild(k.id));
    row("the gates are offered under \"Castle\" on the Build tab as \"Stone gate (2 wide)\" and \"(3 wide)\", each with a hint, only while Free building is on, and cost nothing",
      off === 0 && on.length === 2 && on.every((k) => k.group === "Castle" && placement.tabOf(k) === "build" && k.dev && k.hint && placement.costText(k.id) === "free" && Object.keys(placement.costOf(k.id)).length === 0) && on.map((k) => k.label).join("|") === "Stone gate (2 wide)|Stone gate (3 wide)",
      `${off} with it off; on: ${on.map((k) => `${k.label} [${k.group}]`).join(", ")}`);
    G.rules.set({ freeBuilding: false });
    me.gx = X0 + 4.5; me.gy = Y0 + 3;
    for (let i = 0; i < 4; i++) lay(X0 + 3 + i, Y0 + 2, "n");
    placement.performPlacement(me, { kind: "build", what: "gate_stone_2", tx: X0 + 3, ty: Y0 + 2, edge: "n" });
    const refusedOff = !members(X0 + 3, Y0 + 2, "n").length;
    G.rules.set({ freeBuilding: true });
    row("with Free building off the command a guest sends builds nothing (\"Castle gates are not in the game yet\")", refusedOff && !wallAt(X0 + 3, Y0 + 2, "n").gate, "");
    for (let i = 0; i < 4; i++) { map.destroyWall(X0 + 3 + i, Y0 + 2, "n"); made.pop(); }

    // ---- 3. The build: both widths, both runs ----
    // The n runs are on ty = Y0 + 2 (one row of stone from X0 to X0 + 16), the gate 3 at X0 + 11 on it; the w runs on tx = X0 + 3 down from Y0 + 5.
    for (let x = X0; x <= X0 + 16; x++) lay(x, Y0 + 2, "n");
    for (let y = Y0 + 5; y <= Y0 + 15; y++) lay(X0 + 3, y, "w");
    const builds = [
      { name: "2 wide, n run", what: "gate_stone_2", at: [X0 + 1, Y0 + 2], edge: "n", span: 2, from: [X0 + 1.9, Y0 + 3.2] },
      { name: "3 wide, n run", what: "gate_stone_3", at: [X0 + 11, Y0 + 2], edge: "n", span: 3, from: [X0 + 12.5, Y0 + 3.2] },
      { name: "2 wide, w run", what: "gate_stone_2", at: [X0 + 3, Y0 + 6], edge: "w", span: 2, from: [X0 + 4.2, Y0 + 6.9] },
      { name: "3 wide, w run", what: "gate_stone_3", at: [X0 + 3, Y0 + 11], edge: "w", span: 3, from: [X0 + 4.2, Y0 + 12.5] },
    ];
    const edgesOf = (b) => Array.from({ length: b.span }, (_, k) => (b.edge === "n" ? [b.at[0] + k, b.at[1]] : [b.at[0], b.at[1] + k]));
    for (const b of builds) {
      stay(...b.from);
      place({ kind: "build", what: b.what, tx: b.at[0], ty: b.at[1], edge: b.edge });
      const ms = members(b.at[0], b.at[1], b.edge);
      const sprite = `wall_stone_gate_${b.span}`;
      const ok = ms.length === b.span && ms.every((m, k) => m.wall.kind === "door" && m.wall.sprite === sprite && m.wall.gate.i === k && !m.wall.open && m.wall.under === "wall_stone" && m.wall.built && m.wall.free && m.tx === edgesOf(b)[k][0] && m.ty === edgesOf(b)[k][1]);
      row(`the gate ${b.name} is built by the command a guest sends: one door-kind wall on each of its ${b.span} edges with its place in the run, shut, the plain stone wall remembered under each, free`, ok, `${ms.length} edges; ${ms.map((m) => `${m.wall.kind}/${m.wall.gate.i}/${m.wall.open ? "open" : "shut"}/${m.wall.under}`).join(" ")}`);
      // No post at the ends of the arch nor inside it: the vertices along the run, where the gate meets the stone wall and its own edges meet.
      const vs = [];
      for (let k = 0; k <= b.span; k++) vs.push(b.edge === "n" ? [b.at[0] + k, b.at[1]] : [b.at[0], b.at[1] + k]);
      const posts = vs.filter(([vx, vy]) => walls.postAt(vx, vy, 0));
      row(`and no post stands at the ends of the ${b.name} gate nor between its edges (the gate and the stone wall are one run)`, !posts.length, `${vs.length} vertices, posts at ${JSON.stringify(posts)}`);
    }

    // ---- refusals ----
    const gate2n = builds[0];
    const refuse = (label, what, at, edge, from, expectReason) => {
      stay(...from);
      const span = what === "gate_stone_3" ? 3 : 2;
      const read = () => JSON.stringify(edgesOf({ at, edge, span }).map(([x, y]) => { const w = wallAt(x, y, edge); return w ? [w.kind, w.sprite, !!w.gate] : null; }));
      const before = read();
      place({ kind: "build", what, tx: at[0], ty: at[1], edge });
      const reason = map.gateProblem(at[0], at[1], edge, `wall_stone_gate_${span}`, 0);
      row(label, before === read() && reason === expectReason, `nothing changed: ${before === read()}; the map's reason: "${reason}", expected "${expectReason}"`);
    };
    // Over a gate already there, over a gap (an empty edge), over a log wall, a door, a window, a painting, a torch.
    refuse("a gate is refused over another gate (\"Already a gate\")", "gate_stone_2", [gate2n.at[0], gate2n.at[1]], "n", gate2n.from, "Already a gate");
    refuse("a gate is refused over a gap in the wall (\"Over a stone wall\")", "gate_stone_2", [X0 + 17, Y0 + 2], "n", [X0 + 17.5, Y0 + 3.2], "Over a stone wall");
    const logAt = [X0 + 5, Y0 + 2];
    map.destroyWall(logAt[0], logAt[1], "n"); made.pop();
    lay(logAt[0], logAt[1], "n", "wall_log");
    refuse("a gate is refused where the wall is not stone (a log wall: \"Over a plain stone wall\")", "gate_stone_2", logAt, "n", [logAt[0] + 0.9, logAt[1] + 1.2], "Over a plain stone wall");
    map.destroyWall(logAt[0], logAt[1], "n"); made.pop();
    lay(logAt[0], logAt[1], "n");
    map.buildWall(X0 + 7, Y0 + 2, "n", "door", "wall_stone");
    refuse("a gate is refused where an edge of its run is a door (\"Over a plain stone wall\")", "gate_stone_2", [X0 + 6, Y0 + 2], "n", [X0 + 6.9, Y0 + 3.2], "Over a plain stone wall");
    map.destroyWall(X0 + 7, Y0 + 2, "n", true);
    map.buildWall(X0 + 7, Y0 + 2, "n", "window", "wall_stone");
    refuse("a gate is refused where an edge of its run is a window", "gate_stone_2", [X0 + 6, Y0 + 2], "n", [X0 + 6.9, Y0 + 3.2], "Over a plain stone wall");
    map.destroyWall(X0 + 7, Y0 + 2, "n", true);
    const w7 = wallAt(X0 + 7, Y0 + 2, "n");
    w7.hangings = [{ item: "painting_small_oak", slot: "top", span: 1 }];
    refuse("a gate is refused where a painting hangs on an edge of its run", "gate_stone_2", [X0 + 6, Y0 + 2], "n", [X0 + 6.9, Y0 + 3.2], "Take what hangs there down first");
    delete w7.hangings;
    w7.bracket = { side: 1, torch: true, lit: false };
    refuse("a gate is refused where a torch is on an edge of its run", "gate_stone_2", [X0 + 6, Y0 + 2], "n", [X0 + 6.9, Y0 + 3.2], "Take the torch down first");
    delete w7.bracket;
    // A body across it, and out of reach.
    stay(X0 + 6.9, Y0 + 3.2);
    {
      const z = createZombie(X0 + 6.9, Y0 + 1.6, { aggro: false });
      G.zombies.push(z);
      dead.push(z);
      place({ kind: "build", what: "gate_stone_2", tx: X0 + 6, ty: Y0 + 2, edge: "n" });
      const why = wallAt(X0 + 6, Y0 + 2, "n").gate ? "built" : "refused";
      row("a gate is refused with a body across its run (\"Someone is in the way\")", why === "refused", why);
      z.dead = true;
      G.zombies.splice(G.zombies.indexOf(z), 1);
    }
    stay(X0 + 6.9, Y0 + 7);
    place({ kind: "build", what: "gate_stone_2", tx: X0 + 6, ty: Y0 + 2, edge: "n" });
    row("and out of reach (\"Too far\")", !wallAt(X0 + 6, Y0 + 2, "n").gate, "a builder five tiles off");

    // ---- the ghost: a real cursor over the run ----
    {
      const sc = (() => { cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + 1000, clientY: cvRect.top + 500, bubbles: true })); return 1000 / inp.getMouse().x; })();
      const look = () => { G.camera.snapTo(me.gx, me.gy); G.camera.applyOrigin(G.view.view.w, G.view.view.h); };
      const aimAtGrid = (gx, gy) => { const p = G.iso.toScreen(gx, gy); cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + p.x * sc, clientY: cvRect.top + p.y * sc, bubbles: true })); };
      const settle = () => { placement.update(me); inp.endStep(); };
      stay(X0 + 6.9, Y0 + 3.2);
      look();
      placement.beginBuild("gate_stone_2");
      step(1); look();
      aimAtGrid(X0 + 6.2, Y0 + 1.55); // over the n edge at (X0 + 6, Y0 + 2), the near end of it: the run takes that edge and the one before
      settle();
      const g1 = placement.state.ghost;
      row("the ghost of the 2-wide gate spans two edges of the run under the cursor, green over plain stone, on the edge the cursor is nearer (the hovered edge and the one beside it)",
        !!g1 && g1.kind === "gate" && g1.span === 2 && g1.edge === "n" && g1.ty === Y0 + 2 && (g1.tx === X0 + 6 || g1.tx === X0 + 5) && g1.ok === true, g1 ? `${g1.kind} ${g1.span} wide at ${g1.tx},${g1.ty} ${g1.edge} ${g1.ok ? "green" : g1.reason}` : "no ghost");
      const pr = placement.prompt();
      row("its prompt says it is placed at once", !!pr && /place the gate at once/.test(pr.label), pr ? pr.label : "no prompt");
      stay(X0 + 12.3, Y0 + 3.2);
      step(1); look();
      aimAtGrid(X0 + 11.8, Y0 + 1.55); // over the 3-wide gate's place: red, Already a gate
      settle();
      const g2 = placement.state.ghost;
      row("a ghost over a gate is red, with its reason", !!g2 && g2.ok === false && /gate/.test(g2.reason), g2 ? `${g2.ok ? "green" : g2.reason}` : "no ghost");
      placement.cancel();
      cv.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    }

    // ---- 4. A gate across a chunk's edge ----
    // On the n run's row at the chunk corner column: the gate at (CX - 1, Y0 + 2) has its edges at CX - 1 and CX, two chunks.
    map.takeTouched();
    stay(CX + 0.1, Y0 + 3.2);
    place({ kind: "build", what: "gate_stone_2", tx: CX - 1, ty: Y0 + 2, edge: "n" });
    const across = members(CX - 1, Y0 + 2, "n");
    const chunkOf = (x, y) => [Math.floor(x / 16), Math.floor(y / 16)];
    const cA = chunkOf(CX - 1, Y0 + 2);
    const cB = chunkOf(CX, Y0 + 2);
    row("a gate whose two edges stand in two chunks is built whole", across.length === 2 && (cA[0] !== cB[0] || cA[1] !== cB[1]), `chunks ${cA} and ${cB}`);
    map.takeTouched();
    const acts = G.interact.actionsForTarget({ kind: "edge", tx: CX, ty: Y0 + 2, edge: "n" }, me); // the second edge: a guest's click on it
    const toggled = acts.find((a) => /gate/.test(a.label));
    const label1 = toggled && toggled.label;
    toggled.perform();
    const touchedKeys = map.takeTouched().map((t) => t.join(","));
    const openNow = across.map((m) => m.wall.open);
    row("opening it from its second edge opens both edges and touches both chunks (the wire and the save carry each)", openNow.every(Boolean) && touchedKeys.includes(cA.join(",")) && touchedKeys.includes(cB.join(",")), `open ${openNow}; touched ${touchedKeys.join(" ")}`);
    const wallsOf = () => [cA, cB].map((c) => JSON.stringify(map.serializeChunk(map.getChunk(c[0], c[1], false, 0)).walls)).join("|"); // the walls of both chunks as the wire and the save write them
    const h0 = wallsOf();
    for (const c of [cA, cB]) {
      const rec = JSON.parse(JSON.stringify(map.serializeChunk(map.getChunk(c[0], c[1], false, 0)))); // as the wire and the save write it, read back as a guest's frame is
      map.installChunk(rec);
    }
    const again = members(CX - 1, Y0 + 2, "n");
    row("the chunks' records, written and read as the wire and the save carry them, give the gate back as it stood, open, and both chunks' walls are the same text again", again.length === 2 && again.every((m, k) => m.wall.open && m.wall.gate.i === k && m.wall.at && m.wall.sprite === "wall_stone_gate_2") && wallsOf() === h0, `${again.length} edges, open ${again.map((m) => m.wall.open)}`);
    row("the toggle's label reads \"Open gate\" (never door), and no board is offered on a gate", label1 === "Open gate" && !acts.some((a) => a.kind === "board" || a.kind === "pull"), acts.map((a) => a.label).join(" | "));
    const acts2 = G.interact.actionsForTarget({ kind: "edge", tx: CX - 1, ty: Y0 + 2, edge: "n" }, me);
    row("once open it reads \"Close gate\"", acts2.length && acts2[0].label === "Close gate", acts2.map((a) => a.label).join(" | "));
    acts2[0].perform();
    row("closed again from the first edge: both shut", members(CX - 1, Y0 + 2, "n").every((m) => !m.wall.open), "");

    // ---- 5. Taking apart whole, the plain wall back ----
    const t = { type: "wall", tx: CX, ty: Y0 + 2, edge: "n", wall: wallAt(CX, Y0 + 2, "n"), layer: 0 };
    const why = placement.takeApartProblem(me, t);
    const nameOf = (() => { try { return placement.partsOf(t); } catch (e) { return String(e); } })();
    placement.performPlacement(me, { kind: "remove", target: { type: "wall", tx: CX, ty: Y0 + 2, edge: "n" } });
    const back = [CX - 1, CX].map((x) => wallAt(x, Y0 + 2, "n"));
    row("taking it apart (the command a guest sends, aimed at its second edge) removes the whole gate and puts the plain stone wall back on each edge", !why && back.every((w) => w && w.kind === "wall" && w.sprite === "wall_stone" && !w.gate), `problem "${why}"; edges ${back.map((w) => w && `${w.kind}/${w.sprite}`).join(" ")}; gives back ${JSON.stringify(nameOf.back)}`);

    // ---- 6. A room closed by a gate: bodies, sight, reach, light, shots, the dead ----
    // A room 2 wide and 2 deep: its tiles x in X0 + 9..X0 + 10, y in Y0 + 13..Y0 + 14; its north side two stone edges at y = Y0 + 13 (a gate over them), its
    // south side at y = Y0 + 15, its west at x = X0 + 9 and its east at x = X0 + 11 (a w edge of the tile to the east).
    const RX = X0 + 9;
    const RY = Y0 + 13;
    for (let x = RX; x <= RX + 1; x++) { lay(x, RY, "n"); lay(x, RY + 2, "n"); }
    for (let y = RY; y <= RY + 1; y++) { lay(RX, y, "w"); lay(RX + 2, y, "w"); }
    map.roomsIfDirty();
    const roomOpen = map.tileAt(RX, RY + 1, 0).room;
    row("the room is a room before the gate (walls on every side)", roomOpen > 0, `room ${roomOpen}`);
    stay(RX + 0.5, RY - 1.2);
    place({ kind: "build", what: "gate_stone_2", tx: RX, ty: RY, edge: "n" });
    const gm = members(RX, RY, "n");
    const room = map.getRoom(map.tileAt(RX, RY + 1, 0).room);
    const inside = [RX + 0.5, RY + 1];
    const out = [RX + 0.5, RY - 2];
    row("a room closed by a gate is still a room: the shut gate bounds the fill though sight passes it, and the room is sealed", gm.length === 2 && !!room && room.openings.some((o) => o.tx === RX && o.ty === RY && o.edge === "n") && map.roomSealed(room), `room ${room && room.id}, openings ${room && room.openings.length}`);
    row("sight passes the shut gate (line of sight, light's transmission 1, the walls either side stop it)", lineOfSight(inside[0], inside[1], out[0], out[1]) && map.transmission(gm[0].wall) === 1 && !map.blocksSight(gm[0].wall) && !lineOfSight(RX + 0.5, RY + 1, RX + 0.5, RY + 4) && !lineOfSight(RX + 0.5, RY + 1, RX + 2.5, RY + 1), "");
    row("and a blow or a bite does not: line of reach through the shut gate is stopped, as it is not by a fence", !lineOfReach(inside[0], inside[1], out[0], out[1]) && map.blocksReach(gm[0].wall) && !map.blocksReach({ kind: "wall", sprite: "wall_fence", boards: { near: [], far: [] } }), "");
    const sharesShut = light.daylightShares(room);
    const roomPlain = (() => { const r2 = map.getRoom(map.tileAt(RX, RY + 1, 0).room); return r2; })();
    row("light comes in through it: the room's daylight share is above nothing by day with only the shut gate to admit it", sharesShut.open > 0 && roomPlain === room, `open ${sharesShut.open.toFixed(2)}, leak ${sharesShut.leak.toFixed(2)}`);
    // Bodies, by the movement keys: from the south end of the room walking north into the shut gate, then through it open.
    stay(RX + 0.5, RY + 1.2);
    const runN = hold(["KeyW", "KeyD"], 120);
    const nearest = Math.min(...runN.map((p) => p[1]));
    row("a body walking north into the shut gate by the movement keys is stopped by it", nearest > RY - 0.5 + 0.05, `closest y ${nearest.toFixed(2)} (the gate's edge is at ${RY - 0.5})`);
    row("a path through the shut gate is no path (canStep refuses it) and no wall of the room has a way in the dead can break (no breach target)", !map.canStep(RX, RY, RX, RY - 1) && !map.canStep(RX + 1, RY, RX + 1, RY - 1) && map.breachTargets(room, RX + 0.5, RY - 3, 0, true).length === 0 && !map.needsBreaking(gm[0].wall), `breach targets ${map.breachTargets(room, RX + 0.5, RY - 3, 0, true).length}`);
    // Shots: an arrow from inside to the north over the shut gate, and at the room's plain south wall for the control.
    stay(inside[0], inside[1]);
    const shotN = archery.shoot(me, [0, -1], 6, 1);
    const shotS = archery.shoot(me, [0, 1], 6, 1);
    archery.arrowsInFlight().splice(0); // neither lands in the world: the stops were fixed at release
    row("an arrow from inside passes the shut gate (no stop) and one at the plain wall opposite is stopped by it", shotN.stopD == null && shotS.stopD != null, `north stop ${shotN.stopD}, south stop ${shotS.stopD} (${shotS.stopWhy})`);
    row("a shot above the arch's crown is stopped by the wall over it (the gate passes shots under 78)", archery.wallStops(gm[0].wall, 60) === false && archery.wallStops(gm[0].wall, 85) === true && archery.wallStops(gm[0].wall, 100) === false, `z 60 ${archery.wallStops(gm[0].wall, 60)}, 85 ${archery.wallStops(gm[0].wall, 85)}`);
    // A blow: a zombie across it, in a sword's reach, seen but not struck; a control with the gate open.
    const z = createZombie(RX + 0.5, RY - 0.75, { aggro: false });
    G.zombies.push(z);
    dead.push(z);
    me.hands.main = G.items.makeEntry("sword", 1);
    stay(RX + 0.5, RY + 0.35);
    const pa = G.iso.toScreen(me.gx, me.gy);
    const pb = G.iso.toScreen(z.gx, z.gy);
    me.aim = { ...(me.aim || {}), sx: pb.x - pa.x, sy: pb.y - pa.y }; // the swing aimed at the dead one
    const seen = lineOfSight(me.gx, me.gy, z.gx, z.gy);
    const shutHits = combat.swingTargets(me, [z]).length;
    map.setGateOpen(RX, RY, "n", true, 0);
    const openHits = combat.swingTargets(me, [z]).length;
    map.setGateOpen(RX, RY, "n", false, 0);
    row("a swing with a sword at one of the dead on the far side of the shut gate (which it sees through) finds nothing, and finds it once the gate is open", seen && shutHits === 0 && openHits === 1, `seen ${seen}; targets shut ${shutHits}, open ${openHits}`);
    // The dead: one outside with the player inside, 600 steps: it breaks nothing, bites nothing through it, and wins no way in; the control with the gate open gets in.
    me.hands.main = null;
    G.rules.set({ zombieAggro: true });
    const hp0 = me.hp;
    stay(RX + 0.5, RY + 0.7);
    z.gx = RX + 0.5;
    z.gy = RY - 1.2; // a body already overlapping a wall walks out through it (map.moveCircle), so it starts a little off
    z.aggro = true;
    z.state = "chase";
    z.dead = false;
    const hits = [];
    const offHit = G.events.on("playerHit", (e) => hits.push(e));
    let breached = false;
    for (let i = 0; i < 600; i++) {
      step(1);
      if (map.tileAt(Math.round(z.gx), Math.round(z.gy), 0).room === room.id) breached = true; // in the room with the player
    }
    offHit();
    const gate0 = members(RX, RY, "n");
    row("the dead at a shut gate with the player in reach on its far side strike nothing, bite nothing through its bars, and do not get in (600 steps)", !hits.length && !breached && me.hp >= hp0 - 0.01 && gate0.every((m) => !m.wall.open && !m.wall.broken && m.wall.hp === Infinity), `hits ${hits.length}, breached ${breached}, hp ${me.hp.toFixed(1)} of ${hp0.toFixed(1)}, gate hp ${gate0.map((m) => m.wall.hp)}, the dead at ${z.gx.toFixed(2)},${z.gy.toFixed(2)} (${z.state})`);
    // Control: the gate open, the same dead one comes through and bites.
    map.setGateOpen(RX, RY, "n", true, 0);
    me.hp = hp0;
    stay(RX + 0.5, RY + 0.7);
    z.gx = RX + 0.5;
    z.gy = RY - 1.3;
    z.state = "chase";
    const hits2 = [];
    const offHit2 = G.events.on("playerHit", (e) => hits2.push(e));
    for (let i = 0; i < 600 && !hits2.length; i++) step(1);
    offHit2();
    row("the control: with the gate open the same dead one walks through and bites (so the rows above are not a dead one's idleness)", hits2.length > 0, `${hits2.length} bites`);
    G.rules.set({ zombieAggro: false });
    // Open, a body walks through by the keys.
    me.hp = hp0;
    z.dead = true;
    G.zombies.splice(G.zombies.indexOf(z), 1);
    stay(RX + 0.5, RY + 1.2);
    const runOpen = hold(["KeyW", "KeyD"], 150, (l) => l[l.length - 1][1] < RY - 1.3);
    row("an open gate lets a body through, by the movement keys, along its whole width", Math.min(...runOpen.map((p) => p[1])) < RY - 1.2, `closest y ${Math.min(...runOpen.map((p) => p[1])).toFixed(2)}`);
    stay(RX + 1.3, RY + 1.2);
    const runOpen2 = hold(["KeyW", "KeyD"], 150, (l) => l[l.length - 1][1] < RY - 1.3);
    row("including through its second edge", Math.min(...runOpen2.map((p) => p[1])) < RY - 1.2, `closest y ${Math.min(...runOpen2.map((p) => p[1])).toFixed(2)}`);
    map.setGateOpen(RX, RY, "n", false, 0);
    // ---- the rulings are data: flip each flag on the definition and the behaviour follows (Michael: "I will probably overrule this later") ----
    {
      const rule = map.wallRule("wall_stone_gate_2").gate;
      const was = { deadBreak: rule.deadBreak, bitesPass: rule.bitesPass, shotsPass: rule.shotsPass, grille: rule.grille };
      try {
        const w = gm[0].wall;
        // bitesPass: true lets a blow and a bite through the bars, as a fence's.
        rule.bitesPass = true;
        const reachOn = lineOfReach(inside[0], inside[1], out[0], out[1]) && !map.blocksReach(w);
        rule.bitesPass = was.bitesPass;
        // shotsPass: false stops a shot at the shut gate as at a door.
        rule.shotsPass = false;
        const stopped = archery.wallStops(w, 30) === true;
        rule.shotsPass = was.shotsPass;
        // grille: false stops sight as a door does.
        rule.grille = false;
        const blind = !lineOfSight(inside[0], inside[1], out[0], out[1]) && map.transmission(w) === 0;
        rule.grille = was.grille;
        // deadBreak: true makes a gate that is made after it a door's hit points, which the dead go for and break whole.
        rule.deadBreak = true;
        const soft = map.createWall("door", "wall_stone_gate_2");
        soft.gate = { i: 0 };
        const asks = map.needsBreaking(soft) && !map.gateHolds(soft) && Number.isFinite(soft.hp) && soft.hp > 0;
        rule.deadBreak = was.deadBreak;
        const hard = map.createWall("door", "wall_stone_gate_2");
        hard.gate = { i: 0 };
        row("each ruling is a flag on the gate's definition: `bitesPass`, `shotsPass`, `grille`, and `deadBreak` each flipped changes the behaviour the rulings fixed, with no change of code, and restored they hold again",
          reachOn && stopped && blind && asks && !map.needsBreaking(hard) && hard.hp === Infinity && !lineOfReach(inside[0], inside[1], out[0], out[1]) && archery.wallStops(w, 30) === false && lineOfSight(inside[0], inside[1], out[0], out[1]),
          `bites ${reachOn}, shots stopped ${stopped}, blind ${blind}, breakable ${asks} (hp ${soft.hp})`);
      } finally {
        Object.assign(rule, was);
      }
    }
    // ---- 7. The swing: the portcullis frame the renderer draws, by the gate's state ----
    {
      const drawn = () => {
        const seen = [];
        scene.probe.mark = { is: (d) => { if (d.kind === "wall" && d.wall && d.wall.edge === "n" && d.wall.ty === RY && (d.wall.tx === RX || d.wall.tx === RX + 1)) seen.push(d); return false; }, color: [1, 0, 0] };
        try { G.loop.advance(0); } finally { scene.probe.mark = null; }
        return seen.map((d) => d.gateLeaf);
      };
      const names = (a) => a.join(",");
      stay(RX + 0.5, RY - 2.5);
      map.setGateOpen(RX, RY, "n", false, 0);
      G.loop.advance(map.gateSwing(gm[0].wall) + 0.2); // any swing from the rows before is over
      const shut = drawn();
      map.setGateOpen(RX, RY, "n", true, 0);
      const rising = drawn();
      G.loop.advance(map.gateSwing(gm[0].wall) / 2);
      const midway = drawn();
      G.loop.advance(map.gateSwing(gm[0].wall));
      const up = drawn();
      map.setGateOpen(RX, RY, "n", false, 0);
      const falling = drawn();
      G.loop.advance(map.gateSwing(gm[0].wall) + 0.2);
      const down = drawn();
      row("the portcullis is drawn in each edge of the gate from its own state: closed while shut, the in-between frame all through a swing either way (a gate's `swing` seconds), raised once open",
        names(shut) === "leaf_north_closed,leaf_north_closed" && names(rising) === "leaf_north_mid,leaf_north_mid" && names(midway) === "leaf_north_mid,leaf_north_mid" && names(up) === "leaf_north_raised,leaf_north_raised" && names(falling) === "leaf_north_mid,leaf_north_mid" && names(down) === "leaf_north_closed,leaf_north_closed",
        `shut ${names(shut)} | opening ${names(rising)} | midway ${names(midway)} | up ${names(up)} | closing ${names(falling)} | down ${names(down)}`);
      // The west run's frames are the west ones.
      const wb = builds[2];
      stay(wb.at[0] + 2.5, wb.at[1] + 1);
      const seenW = [];
      scene.probe.mark = { is: (d) => { if (d.kind === "wall" && d.wall && d.wall.edge === "w" && d.wall.tx === wb.at[0] && d.wall.ty >= wb.at[1] && d.wall.ty < wb.at[1] + 2) seenW.push(d); return false; }, color: [1, 0, 0] };
      try { G.loop.advance(0); } finally { scene.probe.mark = null; }
      row("and on a west run the west frames", seenW.length === 2 && seenW.every((d) => d.gateLeaf === "leaf_west_closed"), names(seenW.map((d) => d.gateLeaf)));
    }
  } finally {
    G.rules.set({ freeBuilding: saved.free, zombieAggro: saved.aggro });
    for (const z of dead) { const i = G.zombies.indexOf(z); if (i >= 0) G.zombies.splice(i, 1); }
    for (const [x, y, e] of made) if (wallAt(x, y, e)) map.destroyWall(x, y, e, true);
    // Whatever a gate left behind: every wall of the layout's rows that is a gate piece.
    me.hands.main = saved.main;
    me.hands.off = saved.off;
    me.hp = saved.hp;
    G.clock.setHour(saved.hour);
    me.gx = saved.gx;
    me.gy = saved.gy;
    me.layer = saved.layer;
    me.rise = saved.rise;
    me.auto = null;
    G.camera.snapTo(cam0.gx, cam0.gy);
    G.camera.applyOrigin(G.view.view.w, G.view.view.h);
    if (mouse0.inside) cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + mouse0.x, clientY: cvRect.top + mouse0.y, bubbles: true }));
    else cv.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    step(1);
    G.loop.setPaused(saved.paused);
  }
  return finish();
}
