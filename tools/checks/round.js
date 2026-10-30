// Round rooms in the pane (docs/50 steps 1 to 3): the world's rings as the frame draws them. On the proving ground, `?map=square&nosave&mute`
// at 1280 by 800 (docs/testing.md): await __game.check("round")
// It reads the 7 by 7 room at (21, 0) (tools/mapgen/proving.py). What it reads:
// - each ring on screen is two drawables, the far half and the near half, and no edge of a ring is drawn as a straight wall or takes a post;
// - the near half goes to the translucent pass while the player is in the ring's room and is opaque otherwise;
// - the sort's worst cases, by pixels (the probe of check("depth"): a thing's quads drawn in two flat colours, the pixels that differ are what
//   shows): the player inside against the far half's inner face shows whole; outside behind the far half, hidden; outside in front of the near
//   half, whole; inside behind the near half with the near half opaque, hidden, and with it faded (the player's own room), seen through it;
// - the headless rows' world proofs again on the page's world: the room of 37, a body stopped at the curve, no sight through the ring;
// - a straight wall meeting the ring (#588): ending in a corner pocket refused with its words; a yard walled square to the ring's west side
//   into its step corners a room of 6, the ring's still 37; a filler drawable at each join and no post there, the near wall's faded from
//   inside the yard; a wall along the square's side built from the step corner out, its filler down the step edge and a post at the corner;
//   none at a door point's end; from inside a room at that corner, the filler faded and cut at the faded post's face.
// Everything it moves is put back in its finally: the player's place and hands, the hour, the blend, the zoom, the dead and the villagers,
// and the walls it builds.

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail = "") => rows.push({ check, result: ok === null ? "info" : ok ? "pass" : "FAIL", detail });
  const finish = () => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, failed: rows.filter((r) => r.result === "FAIL").length, total: rows.length };
  };
  if (G.net.status().role === "guest") {
    row("this tab is the host", false, "the check moves the player: run it alone or on the host");
    return finish();
  }
  const ring = G.map.ringById("round_0_21_0");
  if (!ring) {
    row("the proving ground's 7 by 7 room is loaded", null, "this map has none: run it on ?map=square"); // the valley's one round room is its own (an info row, so check("all") on the valley passes)
    return finish();
  }
  const scene = await import("/src/render/scene.js");
  const { lineOfSight } = await import("/src/visibility.js");
  const ctx = G.gl.gl;
  const canvas = ctx.canvas;
  const S = G.game.state;
  const me = G.player;
  const feel = G.tuning.feel;
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const saved = { paused: G.loop.isPaused(), hour: G.clock.getHour(), gx: me.gx, gy: me.gy, main: me.hands.main, off: me.hands.off, blend: feel.blend, zoom: G.settings.get("worldScale"), held: { zombies: S.zombies, villagers: S.villagers, animals: S.animals } };
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
    const px = new Uint8Array(canvas.width * canvas.height * 4);
    ctx.readPixels(0, 0, canvas.width, canvas.height, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    return px;
  };
  const diffCount = (a, b) => {
    let c = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 3 || Math.abs(a[i + 1] - b[i + 1]) > 3 || Math.abs(a[i + 2] - b[i + 2]) > 3) c++;
    return c;
  };
  const isEntity = (e) => (d) => d.kind === "entity" && d.entity === e;
  const visible = (e) => diffCount(shot(null, null, { is: isEntity(e), color: [1, 0, 1] }), shot(null, null, { is: isEntity(e), color: [0, 1, 0] }));
  const alone = (e) => diffCount(shot((d) => !isEntity(e)(d), null, { is: isEntity(e), color: [1, 0, 1] }), shot((d) => !isEntity(e)(d), null, { is: isEntity(e), color: [0, 1, 0] }));
  const standAt = (gx, gy) => {
    G.teleport(gx, gy);
    step(2);
    me.gx = gx;
    me.gy = gy;
  };
  // What share of a figure shows: the player (where it stands decides the near half's fade, the layered scene's own rule) or one of the dead
  // put at a point (the player standing elsewhere).
  const share = (e) => {
    const whole = alone(e);
    return whole ? visible(e) / whole : 0;
  };
  const { createZombie } = await import("/src/entities/zombie.js");
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  const roomId = G.map.roomAt(24, 3);
  const built = []; // the walls a row below builds, taken down in the finally
  try {
    G.loop.setPaused(true);
    feel.blend = false;
    S.zombies = [];
    S.villagers = [];
    S.animals = [];
    me.hands.main = null; // a carried light would light the paired draws differently
    me.hands.off = null;
    G.view.setZoom(1.1);
    G.clock.setHour(12);

    // The drawables: two halves, and no straight wall or post on the ring's edges.
    standAt(24, 9);
    const seen = [];
    shot((d) => { seen.push(d); return false; });
    const halves = seen.filter((d) => d.ring && d.ring.id === ring.id);
    const shape = G.map.ringShape(ring);
    // No edge of the ring drawn straight, its door and window at their door points included (Michael's playtest, 2026-10-27: their straight
    // frames jutted out of the curve), and no post at any vertex of its outline, a door point's ends included.
    const ringEdge = (w) => w && shape.outline.some(([x, y, e]) => w.tx === x && w.ty === y && w.edge === e && G.map.drawnByRing(G.map.tileAt(x, y)[e]));
    const straight = seen.filter((d) => d.wall && !d.ring && ringEdge(d.wall));
    const vertices = new Set(shape.outline.flatMap(([x, y, e]) => (e === "n" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]]).map(([px, py]) => `${px},${py}`)));
    const posts = seen.filter((d) => d.post && vertices.has(`${d.post.tx},${d.post.ty}`));
    row("the ring is two drawables, its far half and its near half; no ring edge drawn straight (its door and window included), no post on its outline", halves.length === 2 && halves.some((d) => d.ring.near) && halves.some((d) => !d.ring.near) && !straight.length && !posts.length, `${halves.length} halves, ${straight.length} straight walls, ${posts.length} posts on the outline`);

    // The near half's fade.
    const nearOnly = (d) => !(d.ring && d.ring.id === ring.id && d.ring.near);
    shot(nearOnly);
    const opaque = scene.lastStats.translucent;
    standAt(24, 3);
    shot(nearOnly);
    const faded = scene.lastStats.translucent;
    // Inside, only the stretch over the room fades: the flanks keep opaque quads (Michael's playtest, 2026-10-27: the sides went see-through).
    const opaqueQuads = G.gl.passVertices(G.gl.PASS_STAND);
    const fadedQuads = G.gl.passVertices(G.gl.PASS_TRANS);
    row("the near half fades over the room with the player in it, its flanks opaque; all opaque outside it", opaque === 0 && faded === 1 && opaqueQuads > 0 && fadedQuads > 0, `translucent drawables: ${opaque} outside, ${faded} inside; inside, ${opaqueQuads} opaque vertices and ${fadedQuads} faded`);

    // The sort's worst cases, by pixels, each where the proving ground's tower (its second storey drawn lifted, docs/49) stands clear of
    // the figure on screen: the player inside against the north-east of the far half, outside behind its north-west, outside before its
    // east; one of the dead inside behind the near half's east with the player outside (the near half opaque), then inside (faded).
    standAt(25.1, 1.1);
    const insideFar = share(me);
    standAt(21, 0);
    const behindFar = share(me);
    standAt(28.5, 3);
    const frontNear = share(me);
    const z = createZombie(26.4, 2.1, { hp: 1000 });
    S.zombies = [z];
    standAt(29, 3);
    z.gx = 26.4;
    z.gy = 2.1;
    const behindNear = share(z);
    standAt(23.5, 3.5);
    z.gx = 26.4;
    z.gy = 2.1;
    const throughNear = share(z);
    S.zombies = [];
    row("inside against the far half's inner face, the player shows whole", insideFar > 0.97, pct(insideFar));
    row("outside behind the far half, the player is hidden", behindFar < 0.05, pct(behindFar));
    row("outside in front of the near half, the player shows whole", frontNear > 0.97, pct(frontNear));
    row("one of the dead inside behind the near half, the player outside: hidden (bar a head over its top)", behindNear < 0.15, pct(behindNear));
    row("the same with the player inside, the near half faded: seen through it", throughNear > 0.3, pct(throughNear));

    // The world on this page: the room, a body at the curve, sight.
    let p = { gx: 24, gy: 3 };
    for (let i = 0; i < 400; i++) p = G.map.moveCircle(p.gx, p.gy, 0.3, 0.014, -0.014);
    const r = Math.hypot(p.gx - 24, p.gy - 3);
    const room = G.map.getRoom(roomId);
    row("the page's world: a room of 37, a body held off the curve at the diagonal, no sight through the ring", room && room.size === 37 && r < 3.5 - 0.29 && r > 2.8 && !lineOfSight(22, 1, 20, -1), `room ${room && room.size}, the walk north-east ended ${r.toFixed(2)} from the centre`);
    // The 7 by 7's outer corner (the review of #536): one inside pressed into the north-west diagonal and one in the pocket pressed at it are
    // inside a bite's reach (0.9) of each other; only the wall's corner between them, which no line of sight crosses, keeps the bite out.
    const press = (from, dir) => {
      let q = { gx: from[0], gy: from[1] };
      for (let i = 0; i < 400; i++) q = G.map.moveCircle(q.gx, q.gy, 0.3, dir[0] * 0.014, dir[1] * 0.014);
      return q;
    };
    const inn = press([24, 3], [-1, -1]);
    const out = press([20.6, -0.4], [1, 1]);
    const gap = Math.hypot(inn.gx - out.gx, inn.gy - out.gy);
    row("the 7 by 7's outer corner: the two within a bite's reach, and no line of sight between them either way", gap < 0.9 && !lineOfSight(inn.gx, inn.gy, out.gx, out.gy) && !lineOfSight(out.gx, out.gy, inn.gx, inn.gy), `${gap.toFixed(2)} apart`);

    // A straight wall meeting the ring (docs/50 section 3, #588), on its west side (the house to the west has its east wall at x 18.5).
    const WHY = "Start it at a step of the round wall";
    const why = [G.map.ringWallProblem(21, 0, "w", "wall"), G.map.ringWallProblem(20, 1, "n", "wall"), G.map.ringWallProblem(20, 6, "n", "wall"), G.map.ringWallProblem(20, 2, "n", "wall"), G.map.ringWallProblem(20, 3, "n", "wall")];
    row(`a wall ending in a corner pocket is refused ("${WHY}"); one to a step corner or a door point's end is not`, why[0] === WHY && why[1] === WHY && why[2] === WHY && !why[3] && !why[4], why.map((w) => `"${w}"`).join(", "));
    // A yard of six between the house and the ring, its walls square to the ring's side into its two west step corners (21, 2) and (21, 5).
    const yardWalls = [[19, 2, "w"], [19, 2, "n"], [20, 2, "n"], [19, 5, "n"], [20, 5, "n"]];
    for (const [x, y, e] of yardWalls) if (!G.map.tileAt(x, y)[e] && G.map.buildWall(x, y, e, "wall", "wall_stone")) built.push([x, y, e]);
    G.map.rebuildRooms();
    const yardRoom = G.map.getRoom(G.map.roomAt(20, 3));
    const ringRoom = G.map.getRoom(G.map.roomAt(24, 3)); // the rooms found again: their ids may have moved
    row("the yard walled to the ring's step corners is a room of 6 sealed by the ring's edges, the ring's own still 37", built.length === yardWalls.length && yardRoom && yardRoom.size === 6 && G.map.roomAt(20, 3) !== G.map.roomAt(24, 3) && ringRoom && ringRoom.size === 37, `built ${built.length} of ${yardWalls.length}; the yard ${yardRoom && yardRoom.size}, the ring's ${ringRoom && ringRoom.size}`);
    const drawn = () => {
      const all = [];
      shot((d) => { all.push(d); return false; });
      return all;
    };
    standAt(24, 9);
    let all = drawn();
    const fillersAt = (list, vx, vy) => list.filter((d) => d.filler && d.filler.ring === ring.id && d.filler.vx === vx && d.filler.vy === vy);
    const postAt = (list, vx, vy) => list.some((d) => d.post && d.post.tx === vx && d.post.ty === vy);
    const f2 = fillersAt(all, 21, 2);
    const f5 = fillersAt(all, 21, 5);
    row("a filler drawn at each join, along the wall's own line into the curve (0.34 of the step edge), and no post there", f2.length === 1 && f5.length === 1 && f2[0].filler.edge === "n" && f2[0].filler.tx === 21 && f2[0].filler.ty === 2 && f5[0].filler.tx === 21 && f5[0].filler.ty === 5 && Math.abs(f2[0].filler.d - 0.338) < 0.002 && !postAt(all, 21, 2) && !postAt(all, 21, 5), `fillers ${f2.length} and ${f5.length} (${JSON.stringify([...f2, ...f5].map((d) => [d.filler.tx, d.filler.ty, d.filler.edge, +d.filler.d.toFixed(3)]))}), posts ${postAt(all, 21, 2)} and ${postAt(all, 21, 5)}`);
    // From inside the yard its south wall is a near wall: its filler fades with it; the north wall's does not.
    standAt(19.6, 3.2);
    all = drawn();
    const in2 = fillersAt(all, 21, 2);
    const in5 = fillersAt(all, 21, 5);
    row("standing in the yard, the filler of its near (south) wall fades with that wall, the far (north) wall's stays opaque", in5.length === 1 && in5[0].faded && in2.length === 1 && !in2[0].faded, `south ${in5.map((d) => d.faded)}, north ${in2.map((d) => d.faded)}`);
    // Along the square's west side (tangent), built from the step corner out through the pocket: the filler turns down the step edge, a post at
    // the corner; a wall to the west window's end: no filler, no post.
    for (const [x, y, e] of built.splice(0)) G.map.destroyWall(x, y, e);
    const tangentFirst = G.map.ringWallProblem(21, 0, "w", "wall");
    for (const [x, y, e] of [[21, 1, "w"], [21, 0, "w"], [20, 3, "n"]]) if (!G.map.tileAt(x, y)[e] && !G.map.ringWallProblem(x, y, e, "wall") && G.map.buildWall(x, y, e, "wall", "wall_stone")) built.push([x, y, e]);
    standAt(24, 9);
    all = drawn();
    const t2 = fillersAt(all, 21, 2);
    const t3 = fillersAt(all, 21, 3);
    row("along the square's side: refused from the pocket's far end, built from the step corner out; its filler down the step edge with a post at the corner; none at a door point's end", tangentFirst === WHY && built.length === 3 && t2.length === 1 && t2[0].filler.edge === "n" && postAt(all, 21, 2) && !t3.length && !postAt(all, 21, 3), `first "${tangentFirst}", built ${built.length} of 3; at the step corner ${t2.length} filler (${JSON.stringify(t2.map((d) => [d.filler.tx, d.filler.ty, d.filler.edge]))}) and a post ${postAt(all, 21, 2)}; at the window's end ${t3.length} and ${postAt(all, 21, 3)}`);
    // The fade where a post stands at the join (the review of #589): a room of 4 west of that run (x 19 to 20, y 0 to 1), its south wall square
    // into the step corner (21, 2) where the run along the side meets it. From inside, that wall and the run are near walls: the filler fades
    // with its wall and stops at the faded post's face (half the post's thickness), so the two do not overlap twice as dark.
    const nBefore = built.length;
    for (const [x, y, e] of [[20, 0, "n"], [19, 0, "n"], [19, 0, "w"], [19, 1, "w"], [19, 2, "n"], [20, 2, "n"]]) if (!G.map.tileAt(x, y)[e] && !G.map.ringWallProblem(x, y, e, "wall") && G.map.buildWall(x, y, e, "wall", "wall_stone")) built.push([x, y, e]);
    G.map.rebuildRooms();
    const westRoom = G.map.getRoom(G.map.roomAt(19, 1));
    standAt(19.6, 0.7);
    all = drawn();
    const j2 = fillersAt(all, 21, 2);
    const { getSheet } = await import("/src/assets.js");
    const half = (getSheet("wall_stone").thickness || 18) / 2;
    row("at a join with a post, faded from inside the room it bounds: the filler fades and is cut at the post's face", built.length - nBefore === 6 && westRoom && westRoom.size === 4 && postAt(all, 21, 2) && j2.length === 1 && j2[0].faded && j2[0].filler.top && Math.abs(j2[0].filler.cuts.far - half) < 1e-6, `built ${built.length - nBefore} of 6, the room ${westRoom && westRoom.size}, a post ${postAt(all, 21, 2)}, the filler ${JSON.stringify(j2.map((d) => ({ faded: d.faded, cuts: d.filler.cuts })))} (the post's half thickness ${half})`);
  } finally {
    for (const [x, y, e] of built) G.map.destroyWall(x, y, e);
    if (built.length) G.map.rebuildRooms();
    feel.blend = saved.blend;
    S.zombies = saved.held.zombies;
    S.villagers = saved.held.villagers;
    S.animals = saved.held.animals;
    me.hands.main = saved.main;
    me.hands.off = saved.off;
    if (G.settings.get("worldScale") !== saved.zoom) G.settings.set("worldScale", saved.zoom); // the view follows the setting, as check("depth") puts it back
    G.clock.setHour(saved.hour);
    G.teleport(saved.gx, saved.gy);
    G.loop.setPaused(saved.paused);
  }
  return finish();
}
