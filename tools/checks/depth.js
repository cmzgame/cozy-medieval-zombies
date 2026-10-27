// The depth buffer (docs/51 section 8): the frame sorted per pixel. From the console, on a tab with `?nosave&mute` sized 1280 by 800
// (docs/testing.md; the proving ground, `?map=square`, or the valley: it builds what it reads on open ground of its own):
//   await __game.check("depth")
// It reads the canvas straight after each draw, as check("frame") does. A thing's own pixels are told from what is behind them by
// drawing the frame twice with the thing in two flat colours (render/scene.js `probe.mark`: its quads in one colour, unlit and unfogged,
// in their own passes and at their own depths): where the two frames differ, it shows, whatever the colours of what is behind it (a dark
// chest on a dark wall included). Its silhouette is the same with nothing else drawn (`probe.skip`: the other drawables gathered and
// counted as ever, the holes and the order unchanged, but not drawn). So a figure half behind a wall shows exactly where its silhouette
// is not under the wall's; a prop against a wall shows wherever its silhouette is. What the client's own modules would stage (the ghost, the marker, an arrow in flight, the tile mark, tracks, Object
// Highlight, the fog) it gives the frame through `probe.override`. Flames, flicker, and sways are frozen on the wall clock for the paired
// draws, and the draw between steps is off (data/tuning.json feel.blend) so a body is drawn where it is put.
// It builds a house of oak walls (5 by 4, a door in its south wall), a lone west wall, and the props and bodies each row needs, one row at a
// time, on bare ground near the player; the world's dead, villagers, and animals are held out meanwhile. Everything it made, moved, or
// set is put back in its finally: the walls and props, the floor items, the player's place, facing, and hands, the hour, the rules, the
// generator, the legibility floor, the blend, the swing's targets, and the wall clock.
// Rows 1 to 4 are the gate for removing render/entities.js's `besideWalls` (docs/51 section 6). Row 12's range is read at the tab's own
// size; the spec asks it at 3840 by 2160 at zoom 1.1 (the pane's resize_window), and the row says which it had. Row 13 measures the
// frame's time on the busy view: the "before" is the same loop on main's renderer, passed as `{ before: ms }`.

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail = "") => rows.push({ check, result: ok === null ? "info" : ok ? "pass" : "FAIL", detail });
  const finish = () => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, failed: rows.filter((r) => r.result === "FAIL").length, total: rows.length };
  };
  if (G.net.status().role === "guest") {
    row("this tab is the host", false, "the check builds on the world: run it alone or on the host (the renderer is each client's own; a guest draws the same code)");
    return finish();
  }
  const scene = await import("/src/render/scene.js");
  const depth = await import("/src/render/depth.js");
  const sprites = await import("/src/sprites.js");
  const ph = await import("/src/placeholders.js");
  const { createZombie } = await import("/src/entities/zombie.js");
  const { tileKey } = await import("/src/visibility.js");
  const glm = G.gl;
  const ctx = glm.gl;
  const canvas = ctx.canvas;
  const V = G.view.view;
  const S = G.game.state;
  const me = G.player;
  const night = G.render.night;
  const feel = G.tuning.feel;

  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const saved = {
    paused: G.loop.isPaused(), hour: G.clock.getHour(), elapsed: G.clock.getElapsed(), rng: G.rng.getState(), aggro: G.rules.rules.zombieAggro,
    gx: me.gx, gy: me.gy, facing: me.facing, main: me.hands.main, off: me.hands.off, blend: feel.blend, floor: night.standingFloor, zoom: G.settings.get("worldScale"),
    held: { zombies: S.zombies, villagers: S.villagers, animals: S.animals },
  };
  const realNow = performance.now.bind(performance);
  const walls = []; // [tx, ty, edge] built
  const props = []; // placed
  const items = []; // [tx, ty, uid] dropped
  const pokes = []; // undo functions for what was set on the world's objects
  const targets = [];

  // ---- the frame, read ----
  const W = () => canvas.width;
  const H = () => canvas.height;
  const k = () => canvas.width / V.w; // buffer pixels per world pixel: the zoom
  let frozen = false;
  const freeze = (on) => {
    if (on && !frozen) performance.now = () => 1234567.5;
    if (!on) performance.now = realNow;
    frozen = on;
  };
  // A frame drawn now (no step) with what `skip` returns true for left out and `override` given to the scene, read back at once. What the
  // client would stage of its own (the highlight under the real mouse, a ghost, the aim guide, an Inspect's mark, prints) is none unless
  // the row gives it.
  const QUIET = { highlight: null, ghost: null, marker: null, hitShapes: null, tileMark: null, tracks: [], grid: false };
  const shot = (skip = null, override = null, mark = null) => {
    scene.probe.skip = skip;
    scene.probe.override = { ...QUIET, ...(override || {}) };
    scene.probe.mark = mark;
    try {
      G.loop.advance(0);
    } finally {
      scene.probe.skip = null;
      scene.probe.override = null;
      scene.probe.mark = null;
    }
    const px = new Uint8Array(W() * H() * 4);
    ctx.readPixels(0, 0, W(), H(), ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    return px;
  };
  // The pixels where two frames differ (a mask by buffer index, with its count).
  const diff = (a, b, tol = 3) => {
    const n = a.length / 4;
    const m = new Uint8Array(n);
    let c = 0;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      if (Math.abs(a[j] - b[j]) > tol || Math.abs(a[j + 1] - b[j + 1]) > tol || Math.abs(a[j + 2] - b[j + 2]) > tol) {
        m[i] = 1;
        c++;
      }
    }
    m.count = c;
    return m;
  };
  const and = (a, b) => { const m = new Uint8Array(a.length); let c = 0; for (let i = 0; i < a.length; i++) if (a[i] && b[i]) { m[i] = 1; c++; } m.count = c; return m; };
  const minus = (a, b) => { const m = new Uint8Array(a.length); let c = 0; for (let i = 0; i < a.length; i++) if (a[i] && !b[i]) { m[i] = 1; c++; } m.count = c; return m; };
  const or = (...ms) => { const m = new Uint8Array(ms[0].length); let c = 0; for (let i = 0; i < m.length; i++) if (ms.some((x) => x[i])) { m[i] = 1; c++; } m.count = c; return m; };
  const share = (part, whole) => (whole.count ? part.count / whole.count : 0);
  // A buffer index from a world pixel (screen coordinates in the world's own pixels), the buffer's rows bottom up.
  const idx = (wx, wy) => {
    const bx = Math.floor((wx + 0.5) * k());
    const by = Math.floor((wy + 0.5) * k());
    if (bx < 0 || by < 0 || bx >= W() || by >= H()) return -1;
    return (H() - 1 - by) * W() + bx;
  };
  const colOf = (i) => (i % W()) / k(); // a buffer index's world column
  // What a thing shows, and what it would show alone: `is` picks its drawables, drawn in two flat colours.
  const MARK_A = [1, 0, 1];
  const MARK_B = [0, 1, 0];
  const visibleOf = (is, override = null) => diff(shot(null, override, { is, color: MARK_A }), shot(null, override, { is, color: MARK_B }));
  const silhouetteOf = (is, override = null) => diff(shot((d) => !is(d), override, { is, color: MARK_A }), shot((d) => !is(d), override, { is, color: MARK_B }));
  const pct = (x) => `${(100 * x).toFixed(1)}%`;

  // ---- what the drawables are ----
  const isPlayer = (d) => d.kind === "entity" && d.entity === me;
  const isEntity = (e) => (d) => d.kind === "entity" && d.entity === e;
  const isProp = (p) => (d) => d.prop === p || d.highlightOf === p;
  const isWall = (list) => (d) => (d.wall && list.some(([x, y, e]) => d.wall.tx === x && d.wall.ty === y && d.wall.edge === e)) || (d.post && list.some(([x, y, e]) => e === "posts" && d.post.tx === x && d.post.ty === y));
  const isFloor = (tx, ty) => (d) => d.items && d.tile && d.tile[0] === tx && d.tile[1] === ty;

  // ---- building ----
  const build = (tx, ty, edge, kind = "wall", sprite = "wall_wood") => {
    if (G.map.buildWall(tx, ty, edge, kind, sprite)) walls.push([tx, ty, edge]);
  };
  const place = async (sprite, tx, ty, extra = {}) => {
    const fp = extra.footprint || [1, 1];
    await G.assets.loadSprite(sprite, { tileCount: fp[0] * fp[1] });
    const p = G.map.createProp({ sprite, tile: [tx, ty], ...extra });
    G.map.placeProp(p, tx, ty);
    props.push(p);
    return p;
  };
  const unplace = (p) => {
    G.map.removeProp(p);
    const i = props.indexOf(p);
    if (i >= 0) props.splice(i, 1);
  };
  const drop = (tx, ty, entry) => {
    G.map.dropItem(tx, ty, entry);
    items.push([tx, ty, entry.uid]);
    return entry;
  };
  const undrop = () => {
    for (const [x, y, uid] of items) for (const e of [...(G.map.itemsAt(x, y) || [])]) if (e.uid === uid) G.map.takeItem(x, y, e);
    items.length = 0;
  };
  // Stand the player at a point and settle it: two steps, so the sight, the room, and the camera follow; no blend between steps.
  const standAt = (gx, gy, facing = null) => {
    G.teleport(gx, gy);
    step(2);
    me.gx = gx;
    me.gy = gy;
    if (facing) me.facing = facing;
  };
  const screen = (gx, gy) => G.iso.toScreen(gx, gy);

  try {
    G.loop.setPaused(true);
    G.rules.rules.zombieAggro = false;
    G.rng.seed(opts.seed ?? 5151);
    feel.blend = false;
    S.zombies = [];
    S.villagers = [];
    S.animals = [];
    me.hands.main = null; // a carried light moves with the player and would light two draws of a pair differently
    me.hands.off = null;
    G.view.setZoom(1.1); // the wide view, the spec's numbers' (the setting put back in the finally)
    G.clock.setHour(12);
    step();
    await G.assets.loadSprite("wall_wood");

    const info = glm.depthInfo();
    row("the depth buffer: its bits read, the emit-order step two buffer steps or more, the range +-4096 round the camera", info.bits >= 16 && info.step >= 2 * info.unitsPerBufferStep - 1e-9 && info.halfRange === 4096, `${info.bits} bits, a step ${info.unitsPerBufferStep.toFixed(5)} units, the emit order ${info.step.toFixed(5)}, the kinds' biases ${JSON.stringify(scene.DEPTH_BIAS)}${G.light.carriers().length ? `; ${G.light.carriers().length} carried lights (a lit torch on the belt?): rows 8a and 11b may read their light` : ""}`);
    if (!(W() > 0 && H() > 0)) {
      row("the tab has a size", false, "the pane gave the page no size: resize it (1280 by 800) and run again");
      return finish();
    }

    // ---- the ground: 24 by 24 bare tiles near the player ----
    const bare = (x, y) => {
      const t = G.map.peekTile(x, y);
      return !!t && !t.prop && !t.rug && !t.n && !t.w && !(t.items && t.items.length) && G.map.isWalkableTile(x, y) && G.map.roomAt(x, y) === 0;
    };
    const blockOk = (x0, y0) => {
      for (let dy = -1; dy <= 25; dy++) for (let dx = -1; dx <= 25; dx++) if (!bare(x0 + dx, y0 + dy)) return false;
      return true;
    };
    const ox = Math.round(saved.gx);
    const oy = Math.round(saved.gy);
    let site = null;
    for (let r = 0; r <= 60 && !site; r += 4) for (let dy = -r; dy <= r && !site; dy += 4) for (let dx = -r; dx <= r && !site; dx += 4) if ((Math.abs(dx) === r || Math.abs(dy) === r) && blockOk(ox + dx, oy + dy)) site = [ox + dx, oy + dy];
    if (!site) {
      row("open ground to build on", false, `no bare 26 by 26 tiles within 60 of ${ox}, ${oy}`);
      return finish();
    }
    const [X, Y] = site;

    // The house: tiles X+4..X+8 by Y+4..Y+7, oak walls, a door at the east end of its south wall; a lone west wall at (X+16, Y+4).
    for (let x = X + 4; x <= X + 8; x++) {
      build(x, Y + 4, "n");
      build(x, Y + 8, "n", x === X + 8 ? "door" : "wall");
    }
    for (let y = Y + 4; y <= Y + 7; y++) {
      build(X + 4, y, "w");
      build(X + 9, y, "w");
    }
    build(X + 16, Y + 4, "w");
    const T = G.assets.getSheet("wall_wood").thickness || ph.WALL_T;
    const north = [];
    const south = [];
    for (let x = X + 4; x <= X + 8; x++) {
      north.push([x, Y + 4, "n"]);
      south.push([x, Y + 8, "n"]);
    }
    for (let x = X + 4; x <= X + 9; x++) {
      north.push([x, Y + 4, "posts"]);
      south.push([x, Y + 8, "posts"]);
    }
    const lone = [[X + 16, Y + 4, "w"], [X + 16, Y + 4, "posts"], [X + 16, Y + 5, "posts"]];
    standAt(X + 12, Y + 14);
    freeze(true);

    // 1. A figure half behind a wall: on the far side of the lone west wall (x < X+15.5), most of a tile behind it, its middle on the
    // column of the post at the wall's near (south) end, so the post and the wall cover its right half and its left half is clear of both.
    {
      standAt(X + 14.7, Y + 4.2);
      const sil = silhouetteOf(isPlayer);
      const vis = and(visibleOf(isPlayer), sil);
      const wall = silhouetteOf(isWall(lone));
      const hidden = minus(sil, vis);
      const out = minus(sil, wall);
      const hiddenUnder = share(and(hidden, wall), hidden);
      const outShown = share(and(out, vis), out);
      const f = share(hidden, sil);
      row("1. a figure half behind a wall segment: the pixels under the wall are the wall's, the rest the figure's", f > 0.1 && f < 0.9 && hiddenUnder >= 0.97 && outShown >= 0.97, `${pct(f)} of its ${sil.count} hidden, ${pct(hiddenUnder)} of the hidden under the wall, ${pct(outShown)} of what the wall does not cover shown`);
    }

    // 2. A figure against a back wall is whole: inside, stopped 0.3 from the north wall (the collision's radius).
    {
      standAt(X + 6, Y + 3.5 + 0.31);
      const sil = silhouetteOf(isPlayer);
      const vis = and(visibleOf(isPlayer), sil);
      const cols = columnsLost(sil, vis);
      row("2. a figure against a back wall is whole (every row and column of it shows)", share(vis, sil) >= 0.98 && cols.length === 0, `${pct(share(vis, sil))} of ${sil.count} shown${cols.length ? `; columns short: ${cols.slice(0, 6).join(", ")}` : ""}`);
    }

    // 3. A prop against a wall shows whole, with its whole outline: a chest on the north wall, Object Highlight on it.
    {
      const chest = await place("chest", X + 5, Y + 4);
      standAt(X + 8, Y + 5.5);
      const hl = { highlight: { kind: "prop", id: chest.id } };
      const sil = silhouetteOf(isProp(chest), hl);
      const shown = and(visibleOf(isProp(chest), hl), sil);
      const cols = columnsLost(sil, shown);
      const nw = silhouetteOf(isWall(north));
      row("3. a prop against a wall shows whole with its whole outline (no column of it the wall's)", share(shown, sil) >= 0.98 && cols.length === 0, `${pct(share(shown, sil))} of ${sil.count} (the chest and its outline) shown, ${and(sil, nw).count} of them over the wall${cols.length ? `; columns short: ${cols.slice(0, 6).join(", ")}` : ""}`);
      unplace(chest);
    }

    // 4. A two-tile table beside a wall, both slices whole; a cupboard's bottom rows show over the floor.
    {
      const table = await place("table", X + 5, Y + 4, { footprint: [2, 1], facing: "x" });
      standAt(X + 8, Y + 6.5);
      const slices = [0, 1].map((i) => (d) => d.prop === table && d.tile && d.tile[0] === table.tiles[i][0] && d.tile[1] === table.tiles[i][1]);
      const res = slices.map((is) => {
        const sil = silhouetteOf(is);
        const shown = and(visibleOf(is), sil);
        return { sil: sil.count, share: share(shown, sil), cols: columnsLost(sil, shown).length };
      });
      row("4a. a two-tile table against a wall: both slices whole", res.every((r) => r.sil > 0 && r.share >= 0.98 && r.cols === 0), res.map((r, i) => `slice ${i}: ${pct(r.share)} of ${r.sil}${r.cols ? `, ${r.cols} columns short` : ""}`).join("; "));
      unplace(table);
      const cup = await place("cupboard", X + 4, Y + 6);
      const sil = silhouetteOf(isProp(cup));
      const shown = and(visibleOf(isProp(cup)), sil);
      const bottom = bottomRows(sil, 3);
      row("4b. a cupboard's bottom rows show over the floor", bottom.count > 0 && share(and(bottom, shown), bottom) >= 0.97, `${pct(share(and(bottom, shown), bottom))} of its lowest three rows (${bottom.count} px), ${pct(share(shown, sil))} of it`);
      unplace(cup);
    }

    // 14. A prop just inside a south wall is hidden by it from outside: a bed against the house's south wall; the wall shows whole over it,
    // crisp from the yard and faded from inside (the bed drawn under the faded wall, never over it).
    {
      const bed = await place("bed", X + 5, Y + 7, { footprint: [2, 1], facing: "x" });
      const southWall = isWall(south);
      standAt(X + 1, Y + 12);
      const bedSil = silhouetteOf(isProp(bed));
      const sil = silhouetteOf(southWall);
      const over = and(bedSil, sil);
      const crisp = share(and(visibleOf(southWall), over), over);
      standAt(X + 7, Y + 5);
      const silF = silhouetteOf(southWall);
      const overF = and(silhouetteOf(isProp(bed)), silF);
      const faded = share(and(visibleOf(southWall), overF), overF);
      row("14. a bed against the house's south wall does not show through it from outside, crisp or faded", over.count > 0 && crisp >= 0.99 && faded >= 0.99, `the wall over the bed's ${over.count} px: ${pct(crisp)} the wall's from the yard; faded, ${pct(faded)} of ${overF.count} the wall's`);
      unplace(bed);
    }

    // 15. A figure before a prop's flank is whole: at the west end of a chest, 0.3 before it.
    {
      const chest = await place("chest", X + 16, Y + 12);
      standAt(X + 16 - 0.3, Y + 12 + 0.81);
      const sil = silhouetteOf(isPlayer);
      const shown = and(visibleOf(isPlayer), sil);
      const cols = columnsLost(sil, shown);
      row("15. a figure before a chest's flank is whole", share(shown, sil) >= 0.98 && cols.length === 0, `${pct(share(shown, sil))} of ${sil.count}${cols.length ? `; columns short: ${cols.slice(0, 6).join(", ")}` : ""}`);
      unplace(chest);
    }

    // 5. A tree in front of a house: a large oak on the tile against its south wall, and one a tile clear of it; the canopy over the wall's
    // face in the columns 30 to 75 px right of the trunk. By the spec's arithmetic the billboard holds an adjacent oak to 64 - T px right
    // of the trunk (50 for oak's T 14) and one a tile clear to 128 - T, so the adjacent oak is read to 64 - T - 2 and the clear one to 75.
    {
      const southWall = isWall(south);
      const reach = async (ty) => {
        const oak = await place("tree_oak_old", X + 5, ty);
        standAt(X + 11, Y + 13); // a little below and right of the trunk: the oak and the wall in view, the player clear of both
        const sil = silhouetteOf(isProp(oak));
        const wall = silhouetteOf(southWall);
        const shown = and(visibleOf(isProp(oak)), sil);
        const trunk = screen(X + 5, ty).x;
        const lost = [];
        let over = 0;
        for (let i = 0; i < sil.length; i++) {
          if (!sil[i] || !wall[i]) continue;
          const dx = colOf(i) - trunk;
          if (dx < 30 || dx > 75) continue;
          over++;
          if (!shown[i]) lost.push(Math.round(dx));
        }
        return { over, first: lost.length ? Math.min(...lost) : null, oak };
      };
      const near = await reach(Y + 8);
      const limit = 64 - T - 2;
      row(`5a. a large oak against the house's south wall: its canopy over the wall's face whole from 30 to ${limit} px right of the trunk (the billboard's reach)`, near.over > 0 && (near.first === null || near.first > limit), near.over ? `${near.over} canopy px over the wall in 30 to 75 px; ${near.first === null ? "none lost" : `the first lost at ${near.first} px`}` : "no canopy over the wall's face in those columns to read");
      unplace(near.oak);
      const clear = await reach(Y + 9);
      row("5b. a large oak a tile clear of the south wall: its canopy over the wall's face whole from 30 to 75 px right of the trunk", clear.over > 0 && clear.first === null, clear.over ? `${clear.over} canopy px over the wall; ${clear.first === null ? "none lost" : `the first lost at ${clear.first} px`}` : "no canopy over the wall's face in those columns to read");
      // A figure two tiles before the tree, over its trunk.
      standAt(X + 6, Y + 10);
      const sil = silhouetteOf(isPlayer);
      const shown = and(visibleOf(isPlayer), sil);
      const over = and(sil, silhouetteOf(isProp(clear.oak)));
      row("5c. a figure two tiles before a tree is drawn over its trunk", over.count > 0 && share(shown, sil) >= 0.98, `${pct(share(shown, sil))} of ${sil.count} shown, ${over.count} over the tree`);
      unplace(clear.oak);
    }

    // 6. A figure through a door: in front of it and in the doorway the player is whole; one of the dead just inside it, on the column of
    // the opening (the door is at the house's east end, its right jamb the corner post), is hidden by the wall above and beside the opening
    // and its posts, and seen through it.
    {
      const door = G.map.peekTile(X + 8, Y + 8).n;
      const was = door.open;
      door.open = true;
      G.map.touch(X + 8, Y + 8);
      pokes.push(() => { door.open = was; G.map.touch(X + 8, Y + 8); });
      standAt(X + 8, Y + 8.4);
      let sil = silhouetteOf(isPlayer);
      let shown = and(visibleOf(isPlayer), sil);
      const front = share(shown, sil);
      standAt(X + 8, Y + 7.55);
      sil = silhouetteOf(isPlayer);
      shown = and(visibleOf(isPlayer), sil);
      const doorway = share(shown, sil);
      standAt(X + 9, Y + 11.5);
      const z = createZombie(X + 7.5, Y + 7.2, { hp: 1000 });
      S.zombies.push(z);
      step(2);
      z.gx = X + 7.5;
      z.gy = Y + 7.2;
      z.facing = "s";
      const seen = G.visible.has(tileKey(X + 8, Y + 7)) || G.visible.has(tileKey(X + 7, Y + 7));
      const zs = silhouetteOf(isEntity(z));
      const zv = and(visibleOf(isEntity(z)), zs);
      const hidden = minus(zs, zv);
      const doorWall = silhouetteOf(isWall([[X + 8, Y + 8, "n"], [X + 8, Y + 8, "posts"], [X + 9, Y + 8, "posts"]]));
      const under = share(and(hidden, doorWall), hidden);
      row("6. a figure through a door: whole in front and in the doorway; one just inside hidden by the wall and posts about the opening, seen through it", front >= 0.98 && doorway >= 0.9 && zs.count > 0 && hidden.count > 0 && zv.count > 0 && under >= 0.95, `in front ${pct(front)}, in the doorway ${pct(doorway)}; inside${seen ? "" : " (its tile not in sight)"}: ${pct(share(zv, zs))} of ${zs.count} seen, ${pct(under)} of the hidden under the door's wall`);
      S.zombies.splice(S.zombies.indexOf(z), 1);
      pokes.pop()();
    }

    // 7. Overlays stand on their own base.
    {
      // A lit wall cap at night shows lit over its own face (the 2026-10-12 cap bug): the cap's middle the same with the room's fire lit
      // and put out, where the face below it changes.
      let fire = await place("fireplace", X + 8, Y + 5, { footprint: [1, 2], facing: "y" });
      if (fire.fire) { fire.fire.fuel = 4; G.map.setFireLit(fire, true); }
      G.clock.setHour(0);
      standAt(X + 5, Y + 6.5);
      const top = screen(X + 5.5, Y + 3.5); // the top vertex of north wall (X+6, Y+4)
      const h = G.assets.getSheet("wall_wood").wallHeight || 80;
      const capAt = [top.x + 16, top.y + 8 - h];
      const faceAt = [top.x + 16, top.y + 8 - 10]; // ten pixels up the face from its foot, about
      const lit = shot();
      G.map.setFireLit(fire, false);
      G.light.update();
      step();
      me.gx = X + 5;
      me.gy = Y + 6.5;
      const dark = shot();
      const capSame = patchSame(lit, dark, capAt, 3);
      const faceMoved = !patchSame(lit, dark, faceAt, 3);
      row("7a. a lit wall cap at night shows lit over its own face: the cap's middle the sky's whatever the room's light, the face below it the room's", capSame && faceMoved, `the cap at ${capAt.map(Math.round)} ${capSame ? "the same" : "moved"} with the fire lit and out; the face ${faceMoved ? "moved" : "did not move"}`);
      // A fireplace's flame over the fireplace (the hearth went with the fires, #527): every whole pixel of the drawn flame frame shows in
      // its own colour (it is unlit, in sight). The fireplace stands against the north wall, its firebox clear of the faded near walls on
      // screen (a faded wall drawn over a flame changes its colour, as it should), the player beside it.
      unplace(fire);
      fire = await place("fireplace", X + 5, Y + 4, { footprint: [2, 1], facing: "x" });
      if (fire.fire) { fire.fire.fuel = 4; G.map.setFireLit(fire, true); }
      G.light.update();
      standAt(X + 5.5, Y + 6.5);
      const sheet = G.assets.getSheet("fireplace", 2);
      const fl = sheet.flames && sheet.flames[fire.facing];
      let flame = { n: 0, ok: 0 };
      if (fl) {
        const [tx, ty] = fire.tiles[fl.tile];
        const kf = Math.floor((performance.now() / 1000) * sheet.flameFps + Math.abs(tx * 3 + ty * 7)) % fl.count;
        const p = screen(tx, ty);
        const off = fire.offset || [0, 0];
        flame = framePixels(shot(), sheet, `flame_${fire.facing}_${kf}`, Math.round(p.x) + off[0], Math.round(p.y) + off[1]);
      }
      row("7b. a fireplace's flame shows over the fireplace", flame.n > 0 && flame.ok / flame.n >= 0.9, fl ? `${flame.ok} of ${flame.n} of the flame's whole pixels in their own colour` : "the fireplace has no flames");
      unplace(fire);
      // A torch's flame over its bracket: a lit torch in a bracket on the north wall's face, seen from inside.
      const seg = G.map.peekTile(X + 6, Y + 4).n;
      seg.bracket = { side: 1, torch: true, made: true };
      pokes.push(() => { delete seg.bracket; });
      G.clock.setHour(12);
      standAt(X + 5, Y + 6.5);
      const fs = G.assets.getSheet("flame");
      const wp = screen(X + 6, Y + 4);
      const x = Math.round(wp.x);
      const y = Math.round(wp.y);
      const a = [x, y - 16];
      const b = [x + 32, y];
      const bx = Math.round((a[0] + b[0]) / 2) - Math.round(T / 2);
      const by = Math.round((a[1] + b[1]) / 2 - Math.min(ph.BRACKET_UP, h * 0.5)) + Math.round(T / 4);
      const torch = framePixels(shot(), fs, `flame_${Math.floor(performance.now() / 180 + (X + 6 + Y + 4)) % 3}`, bx, by - 15);
      row("7c. a torch's flame shows over its bracket", torch.n > 0 && torch.ok / torch.n >= 0.9, `${torch.ok} of ${torch.n} of the flame's whole pixels in their own colour`);
      pokes.pop()();
      // The swing outline green round a targeted dead one, its body whole inside it.
      const z = createZombie(X + 16, Y + 16, { hp: 1000 });
      S.zombies.push(z);
      standAt(X + 14, Y + 18);
      z.gx = X + 16;
      z.gy = Y + 16;
      const body = silhouetteOf(isEntity(z));
      G.client.targets.add(z.id);
      targets.push(z.id);
      const withRing = silhouetteOf(isEntity(z));
      const ring = minus(withRing, body);
      const frame = shot();
      let green = 0;
      for (let i = 0; i < ring.length; i++) {
        if (!ring[i]) continue;
        const j = i * 4;
        if (Math.abs(frame[j] - 97) <= 8 && frame[j + 1] >= 245 && Math.abs(frame[j + 2] - 97) <= 8) green++;
      }
      const bodyShown = share(and(visibleOf(isEntity(z)), body), body);
      row("7d. the swing outline green round a targeted dead one, its body whole inside it", ring.count > 0 && green / ring.count >= 0.9 && bodyShown >= 0.98, `${green} of the ring's ${ring.count} px green, ${pct(bodyShown)} of the body shown`);
      G.client.targets.delete(z.id);
      S.zombies.splice(S.zombies.indexOf(z), 1);
      // A held sword over the hand: facing the camera, the sword in the main hand changes pixels inside the body's own silhouette.
      standAt(X + 20, Y + 20, "s");
      me.hands.main = null;
      me.hands.off = null;
      const bare = shot();
      const bodySil = silhouetteOf(isPlayer);
      me.hands.main = G.items.makeEntry("sword", 1);
      me.facing = "s";
      const armed = shot();
      const inside = and(diff(bare, armed), bodySil);
      row("7e. a held sword draws over the hand and the body before it", inside.count >= 10, `${inside.count} px of the body's own silhouette changed by the sword facing the camera`);
      me.hands.main = saved.main;
      me.hands.off = saved.off;
    }

    // 8. The faded near wall and its cuts fade at 0.42 over the room; the canopy hole round the player behind a tree.
    {
      const southWall = isWall(south);
      // Inside, the south wall and its posts drawn in two flat colours over the room: where a pixel is the wall's at alpha a, the two frames
      // differ by a times the colours' difference, so each pixel's alpha is read straight off them (the wall's own picture differs inside
      // and out, so it is not compared with the crisp one). A post that joins a far wall stays solid (docs/17) and is left out; a pixel where
      // two faded quads overlap (a post over its wall, a leaf over the opening) reads 1 - (1 - a)^2 there, as it always has.
      standAt(X + 5, Y + 5);
      const fa = shot(null, null, { is: southWall, color: MARK_A });
      const fb = shot(null, null, { is: southWall, color: MARK_B });
      const inPlayer = silhouetteOf(isPlayer);
      const A = scene.NEAR_WALL_ALPHA;
      let good = 0;
      let solid = 0;
      let over = 0;
      let n = 0;
      for (let i = 0; i < fa.length / 4; i++) {
        if (inPlayer[i]) continue;
        const j = i * 4;
        const a = (fa[j] - fb[j] + (fb[j + 1] - fa[j + 1])) / 510;
        if (a < 0.02) continue;
        if (a >= 0.97) {
          solid++;
          continue;
        }
        n++;
        if (Math.abs(a - A) <= 0.03) good++;
        else if (Math.abs(a - (1 - (1 - A) * (1 - A))) <= 0.03) over++;
      }
      row(`8a. the faded near wall and its cut pieces fade at ${A} over the room`, n > 0 && (good + over) / n >= 0.98 && good / n >= 0.9, `${good} of ${n} faded px of the south wall at ${A}, ${over} where two faded quads overlap, ${n - good - over} at another alpha; ${solid} solid (a post joining a far wall)`);
      const oak = await place("tree_oak_l", X + 18, Y + 18);
      standAt(X + 17, Y + 17);
      const sheet = G.assets.getSheet(me.sprite);
      const r = sprites.resolveFacing(sheet, me.facing);
      let name = sprites.frameName(sheet, me.anim.name, r.facing, me.anim.frame);
      if (!sheet.frames[name]) name = sprites.frameName(sheet, "idle", r.facing, 0);
      const f = sheet.frames[name];
      const p = screen(me.gx, me.gy);
      const hole = [Math.round(p.x) - sheet.anchor[0] + f[2] / 2, Math.round(p.y) - sheet.anchor[1] + f[3] * 0.45];
      const sil = silhouetteOf(isProp(oak), { player: null }); // its whole silhouette: with no player, no hole
      const shown = and(visibleOf(isProp(oak)), sil);
      let inHole = 0;
      let seenInHole = 0;
      for (let i = 0; i < sil.length; i++) {
        if (!sil[i]) continue;
        const bx = (i % W()) / k();
        const byy = (H() - 1 - Math.floor(i / W())) / k();
        if (Math.hypot(bx - hole[0], byy - hole[1]) > 28) continue;
        inHole++;
        if (shown[i]) seenInHole++;
      }
      row("8b. the canopy hole cuts round the player behind a tree", inHole > 0 && seenInHole / inHole <= 0.05, `${inHole} canopy px within 28 px of the hole's middle, ${seenInHole} of them still the canopy's`);
      unplace(oak);
    }

    // 9. The soft sheets show: their half-clear pixels (a shadow, a glow) drawn, not cut by the opaque pass's alpha test.
    {
      G.clock.setHour(0);
      const camp = await place("campfire", X + 12, Y + 18, { fuel: 4, lit: true });
      if (camp.fire && !camp.fire.lit) { camp.fire.fuel = 4; camp.fire.lit = true; }
      const post = await place("torch_post", X + 14, Y + 20, { torch: true, lit: true });
      if (post.fire && !post.fire.lit) post.fire.lit = true;
      G.light.update();
      standAt(X + 10, Y + 21);
      const softOf = async (p) => {
        const sheet = G.assets.getSheet(p.sprite);
        if (!sheet.soft) return { hard: true };
        const anim = sheet.animations && sheet.animations.idle;
        const [tx, ty] = p.tile;
        const fi = anim && anim.fps > 0 ? Math.floor((performance.now() / 1000) * anim.fps + Math.abs(tx * 7 + ty * 3)) % anim.frames : 0;
        const at = screen(tx, ty);
        const vis = visibleOf(isProp(p));
        const out = { n: 0, shown: 0 };
        for (const kind of ["idle", "flame"]) {
          const name = G.assets.idleFrame(sheet, p, fi, kind);
          if (!sheet.frames[name]) continue;
          const s = softPixels(sheet, name, Math.round(at.x), Math.round(at.y));
          for (const i of s) { out.n++; if (vis[i]) out.shown++; }
        }
        return out;
      };
      const c = await softOf(camp);
      const t = await softOf(post);
      const say = (r) => (r.hard ? "drawn hard: nothing soft to cut" : `${r.shown} of ${r.n} soft px shown`);
      row("9a. a campfire's glow and shadow show (a soft sheet's half-clear pixels)", c.hard || (c.n > 0 && c.shown / c.n >= 0.8), say(c));
      row("9b. a torch post's halo shows at night", t.hard || (t.n > 0 && t.shown / t.n >= 0.8), say(t));
      unplace(camp);
      unplace(post);
      const flame = G.assets.getSheet("flame");
      row("9c. a wall bracket's torch halo and a carried torch's (the flame sheet's quads, per quad, from an opaque drawable)", true, flame.soft ? "the flame sheet is soft: its quads go to the translucent pass (gl.js route), read in 7c's colours" : "the torch flame is drawn hard (art round 3): nothing soft to cut; 7c reads its pixels");
      G.clock.setHour(12);
      G.light.update();
    }

    // 10. The flat things show whole: a floor item, a lying arrow, an arrow's shadow, the tile mark, tracks.
    {
      standAt(X + 10, Y + 21);
      drop(X + 12, Y + 12, G.items.makeEntry("apple", 1));
      const lying = { ...G.items.makeEntry("arrow", 1), at: [X + 12.1, Y + 14.2], angle: 3 };
      drop(X + 12, Y + 14, lying);
      const res = [[X + 12, Y + 12, "a floor item"], [X + 12, Y + 14, "a lying arrow"]].map(([tx, ty, what]) => {
        const sil = silhouetteOf(isFloor(tx, ty));
        const shown = and(visibleOf(isFloor(tx, ty)), sil);
        return { what, sil: sil.count, share: share(shown, sil) };
      });
      const flight = [{ gx: X + 13, gy: Y + 17, z: 40, projectile: "arrow", frame: 0 }];
      const isShadow = (d) => d.kind === "arrowShadow";
      const fsil = silhouetteOf(isShadow, { arrows: flight });
      const fshown = and(visibleOf(isShadow, { arrows: flight }), fsil);
      const mark = diff(shot(null, { tileMark: { tiles: [[X + 15, Y + 13]], alpha: 1 } }), shot(null, { tileMark: null }));
      const prints = diff(shot(null, { tracks: [{ gx: X + 15, gy: Y + 16, dx: 1, dy: 0, species: "deer", fade: 1 }] }), shot(null, { tracks: [] }));
      const ok = res.every((r) => r.sil > 0 && r.share >= 0.98) && fsil.count > 0 && share(fshown, fsil) >= 0.98 && mark.count >= 100 && prints.count >= 6;
      row("10. the flat things show whole: a floor item, a lying arrow, an arrow's shadow, the tile mark, tracks", ok, `${res.map((r) => `${r.what} ${pct(r.share)} of ${r.sil}`).join(", ")}, the shadow ${pct(share(fshown, fsil))} of ${fsil.count}, the mark ${mark.count} px, the prints ${prints.count} px`);
      undrop();
    }

    // 11. The fog dims the unseen; the night pool climbs a wall; the legibility floor holds a figure's brightness; the ghost and the marker
    // draw on top.
    {
      standAt(X + 1, Y + 12);
      const unseen = screen(X + 5, Y + 4.2); // the floor inside the shut house, by its north wall: above the south wall's top on screen
      const seen = screen(X + 2, Y + 14);
      const fogged = shot(null, { fog: true, drawAll: false });
      const clear = shot(null, { fog: false, drawAll: false });
      const dims = !patchSame(fogged, clear, [unseen.x, unseen.y], 2) && patchSame(fogged, clear, [seen.x, seen.y], 2);
      row("11a. the fog dims the unseen and not the seen", dims, `inside the shut house ${dims ? "dimmed" : "not dimmed or the yard dimmed too"}`);
      G.clock.setHour(0);
      const lum = (px, p) => { const i = idx(p[0], p[1]); return i < 0 ? -1 : px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]; };
      const faceUp = () => { const a = screen(X + 15.5 + T / 64, Y + 4); return [a.x, a.y - 30]; }; // the lone wall's face, its middle, 30 px up
      standAt(X + 15.5, Y + 6);
      const nearLum = lum(shot(), faceUp());
      standAt(X + 9, Y + 12);
      const farLum = lum(shot(), faceUp());
      const climbs = nearLum >= 0 && farLum >= 0 && nearLum > farLum + 6;
      row("11b. the night pool climbs a wall (the face 30 px up brighter with the player beside it)", climbs, `${nearLum} beside, ${farLum} away${farLum < 0 ? " (off the window)" : ""}`);
      standAt(X + 20, Y + 20, "s");
      const body = silhouetteOf(isPlayer);
      night.standingFloor = 0;
      const low = shot();
      night.standingFloor = 0.6;
      const high = shot();
      night.standingFloor = saved.floor;
      let brighter = 0;
      let n = 0;
      for (let i = 0; i < body.length; i++) {
        if (!body[i]) continue;
        n++;
        const j = i * 4;
        if (high[j] + high[j + 1] + high[j + 2] > low[j] + low[j + 1] + low[j + 2] + 3) brighter++;
      }
      row("11c. the legibility floor holds a figure's brightness in the dark", n > 0 && brighter / n >= 0.5, `${brighter} of ${n} of the body brighter at a floor of 0.6 than at 0`);
      G.clock.setHour(12);
      const ghost = { kind: "prop", tx: X + 6, ty: Y + 3, footprint: [1, 1], prop: { sprite: "chest", facing: "y" }, ok: true };
      await G.assets.loadSprite("chest");
      standAt(X + 1, Y + 12);
      const nw2 = silhouetteOf(isWall(north));
      const g = and(diff(shot(null, { ghost }), shot(null, { ghost: null })), nw2);
      const marker = { from: [me.gx, me.gy], full: [X + 6.5, Y + 2.6], land: [X + 6, Y + 3] };
      const mk = and(diff(shot(null, { marker }), shot(null, { marker: null })), nw2);
      row("11d. the ghost and the marker draw on top: over the wall in front of where they are", g.count > 20 && mk.count > 4, `the chest's ghost behind the north wall ${g.count} px over it, the landing marker ${mk.count} px over it (the wall ${nw2.count} px)`);
    }

    // 12. No flicker, and the range holds.
    {
      standAt(X + 12, Y + 14);
      const a = shot();
      const b = shot();
      const same = diff(a, b, 0).count === 0;
      // Every standing vertex drawn inside the window lies within the range (+-4096 round the camera).
      let inside = 0;
      let outOf = 0;
      for (const p of [1, 2]) {
        const { stride, data } = glm.passData(p);
        for (let i = 0; i < data.length; i += stride) {
          const x = data[i];
          const y = data[i + 1];
          if (x < 0 || y < 0 || x > V.w || y > V.h) continue;
          inside++;
          if (Math.abs(data[i + 13]) > 4096) outOf++;
        }
      }
      // A wall and a tree rooted just below the bottom edge draw their tops: the deepest a visible pixel can be.
      const below = G.iso.toGrid(V.w / 2, V.h + 8);
      const rx = Math.round(below.gx);
      const ry = Math.round(below.gy);
      let tops = "not tried: the ground below the window is not bare";
      let topsOk = null;
      if (bare(rx, ry) && bare(rx + 1, ry)) {
        build(rx + 1, ry, "w");
        const oak = await place("tree_oak_old", rx, ry);
        const ov = visibleOf(isProp(oak)).count;
        const wv = visibleOf(isWall([[rx + 1, ry, "w"]])).count;
        topsOk = ov > 0 && wv > 0;
        tops = `an oak rooted ${Math.round(screen(rx, ry).y - V.h)} px below the bottom edge ${ov} px, a wall ${wv} px`;
        unplace(oak);
        const last = walls[walls.length - 1];
        if (last && last[0] === rx + 1 && last[1] === ry && last[2] === "w") {
          G.map.destroyWall(rx + 1, ry, "w");
          walls.pop();
        }
      }
      const size = `${canvas.width} by ${canvas.height} at zoom ${(k()).toFixed(2)}${canvas.width >= 3840 ? "" : " (the spec asks 3840 by 2160 at 1.1: resize the tab for the full case)"}`;
      row("12. no flicker (two draws of a still scene the same bytes), and the range holds", same && outOf === 0 && topsOk !== false, `${same ? "the same" : "different"}; ${outOf} of ${inside} standing vertices in the window outside the range; ${tops}; ${size}`);
    }

    // 13. The cost: the busy view (night, a torch lit, twenty of the dead in view), the frame's time over sixty draws, and pass 2's count.
    {
      freeze(false);
      G.clock.setHour(0);
      standAt(X + 12, Y + 14);
      me.hands.main = G.items.makeEntry("torch", 1);
      me.hands.main.lit = true;
      const dead = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const z = createZombie(X + 12 + Math.cos(a) * (3 + (i % 3)), Y + 14 + Math.sin(a) * (3 + (i % 3)), { hp: 1000 });
        S.zombies.push(z);
        dead.push(z);
      }
      step(2);
      const times = [];
      for (let i = 0; i < 60; i++) {
        G.loop.advance(0);
        times.push(G.timing.render || 0);
      }
      times.sort((p, q) => p - q);
      const median = times[30];
      const stats = { ...scene.lastStats };
      const before = Number(opts.before);
      const within = Number.isFinite(before) && before > 0 ? median <= before * 1.1 : null;
      row("13. the cost on the busy view: the frame's time, and the drawables in pass 2", within, `median ${median.toFixed(2)} ms over 60 draws (render's time, main.js)${Number.isFinite(before) && before > 0 ? ` against ${before} ms before: ${(100 * (median / before - 1)).toFixed(1)}%` : "; pass { before: ms } from the same loop on main to compare (within 10%)"}; ${stats.drawables} drawables, ${stats.translucent} in pass 2; ${JSON.stringify(glm.depthInfo().passes)} vertices by pass`);
      for (const z of dead) S.zombies.splice(S.zombies.indexOf(z), 1);
      me.hands.main = saved.main;
      G.clock.setHour(12);
    }
  } catch (err) {
    row("the check ran to its end", false, String(err && err.stack ? err.stack.split("\n").slice(0, 3).join(" | ") : err));
  } finally {
    freeze(false);
    scene.probe.skip = null;
    scene.probe.override = null;
    for (const id of targets) G.client.targets.delete(id);
    while (pokes.length) pokes.pop()();
    undrop();
    for (const p of [...props]) unplace(p);
    for (const [x, y, e] of walls.reverse()) G.map.destroyWall(x, y, e);
    S.zombies = saved.held.zombies; // its own dead go with the list it made
    S.villagers = saved.held.villagers;
    S.animals = saved.held.animals;
    me.hands.main = saved.main;
    me.hands.off = saved.off;
    night.standingFloor = saved.floor;
    feel.blend = saved.blend;
    if (G.settings.get("worldScale") !== saved.zoom) G.settings.set("worldScale", saved.zoom); // the view follows the setting
    G.rules.rules.zombieAggro = saved.aggro;
    G.clock.setHour(saved.hour);
    G.light.update();
    G.teleport(saved.gx, saved.gy);
    me.facing = saved.facing;
    G.rng.setState(saved.rng);
    G.clock.setElapsed(saved.elapsed);
    G.loop.advance(1 / 60);
    G.loop.setPaused(saved.paused);
  }
  return finish();

  // ---- helpers over masks and sheets ----

  // The world columns of a silhouette where less than nine tenths of its pixels show.
  function columnsLost(sil, shown) {
    const per = new Map();
    for (let i = 0; i < sil.length; i++) {
      if (!sil[i]) continue;
      const c = i % W();
      const e = per.get(c) || [0, 0];
      e[0]++;
      if (shown[i]) e[1]++;
      per.set(c, e);
    }
    const out = [];
    for (const [c, [n, s]] of per) if (n >= 3 && s / n < 0.9) out.push(Math.round(c / k()));
    return [...new Set(out)].sort((a, b) => a - b);
  }

  // The lowest `n` buffer rows of a silhouette in each of its columns.
  function bottomRows(sil, n) {
    const m = new Uint8Array(sil.length);
    let c = 0;
    const rowsN = Math.max(1, Math.round(n * k()));
    for (let x = 0; x < W(); x++) {
      let got = 0;
      for (let by = H() - 1; by >= 0 && got < rowsN; by--) {
        const i = (H() - 1 - by) * W() + x;
        if (sil[i]) { m[i] = 1; c++; got++; }
      }
    }
    m.count = c;
    return m;
  }

  // Whether a small patch round a world point is the same in two frames.
  function patchSame(a, b, p, tol) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const i = idx(p[0] + dx, p[1] + dy);
        if (i < 0) return false;
        const j = i * 4;
        if (Math.abs(a[j] - b[j]) > tol || Math.abs(a[j + 1] - b[j + 1]) > tol || Math.abs(a[j + 2] - b[j + 2]) > tol) return false;
      }
    }
    return true;
  }

  // A frame's pixels from its sheet (straight colours).
  function frameData(sheet, name) {
    const f = sheet.frames[name];
    if (!f) return null;
    const c = document.createElement("canvas");
    c.width = f[2];
    c.height = f[3];
    const g = c.getContext("2d");
    g.drawImage(sheet.image, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
    return { f, data: g.getImageData(0, 0, f[2], f[3]).data };
  }

  // The whole (opaque) pixels of a frame drawn at (x, y) by its anchor, and how many show in the frame in their own colour (an unlit,
  // unfogged overlay is drawn exactly so).
  function framePixels(px, sheet, name, x, y) {
    const fd = frameData(sheet, name);
    if (!fd) return { n: 0, ok: 0 };
    const an = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
    let n = 0;
    let ok = 0;
    for (let v = 0; v < fd.f[3]; v++) {
      for (let u = 0; u < fd.f[2]; u++) {
        const s = (v * fd.f[2] + u) * 4;
        if (fd.data[s + 3] !== 255) continue;
        const i = idx(x - an[0] + u, y - an[1] + v);
        if (i < 0) continue;
        n++;
        const j = i * 4;
        if (Math.abs(px[j] - fd.data[s]) <= 6 && Math.abs(px[j + 1] - fd.data[s + 1]) <= 6 && Math.abs(px[j + 2] - fd.data[s + 2]) <= 6) ok++;
      }
    }
    return { n, ok };
  }

  // The buffer indices of a frame's soft pixels (alpha between a twentieth and nineteen twentieths) drawn at (x, y) by its anchor.
  function softPixels(sheet, name, x, y) {
    const fd = frameData(sheet, name);
    if (!fd) return [];
    const an = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
    const out = [];
    for (let v = 0; v < fd.f[3]; v++) {
      for (let u = 0; u < fd.f[2]; u++) {
        const a = fd.data[(v * fd.f[2] + u) * 4 + 3];
        if (a < 13 || a > 242) continue;
        const i = idx(x - an[0] + u, y - an[1] + v);
        if (i >= 0) out.push(i);
      }
    }
    return out;
  }
}
