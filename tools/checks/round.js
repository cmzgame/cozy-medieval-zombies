// Round rooms in the pane (docs/50 steps 1 to 3): the world's rings as the frame draws them. On the proving ground, `?map=square&nosave&mute`
// at 1280 by 800 (docs/testing.md): await __game.check("round")
// It reads the 7 by 7 room at (21, 0) (tools/mapgen/proving.py). What it reads:
// - each ring on screen is two drawables, the far half and the near half, and no edge of a ring is drawn as a straight wall or takes a post;
// - the near half goes to the translucent pass while the player is in the ring's room and is opaque otherwise;
// - the sort's worst cases, by pixels (the probe of check("depth"): a thing's quads drawn in two flat colours, the pixels that differ are what
//   shows): the player inside against the far half's inner face shows whole; outside behind the far half, hidden; outside in front of the near
//   half, whole; inside behind the near half with the near half opaque, hidden, and with it faded (the player's own room), seen through it;
// - the headless rows' world proofs again on the page's world: the room of 37, a body stopped at the curve, no sight through the ring.
// Everything it moves is put back in its finally: the player's place and hands, the hour, the blend, the zoom, the dead and the villagers.

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
    row("the proving ground's 7 by 7 room is loaded", false, "open ?map=square");
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
  const isPlayer = (d) => d.kind === "entity" && d.entity === me;
  const visible = (override) => diffCount(shot(null, override, { is: isPlayer, color: [1, 0, 1] }), shot(null, override, { is: isPlayer, color: [0, 1, 0] }));
  const alone = (override) => diffCount(shot((d) => !isPlayer(d), override, { is: isPlayer, color: [1, 0, 1] }), shot((d) => !isPlayer(d), override, { is: isPlayer, color: [0, 1, 0] }));
  const standAt = (gx, gy) => {
    G.teleport(gx, gy);
    step(2);
    me.gx = gx;
    me.gy = gy;
  };
  const share = (gx, gy, override = {}) => {
    standAt(gx, gy);
    const whole = alone(override);
    return whole ? visible(override) / whole : 0;
  };
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  const roomId = G.map.roomAt(24, 3);
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
    const ringEdge = (w) => w && shape.outline.some(([x, y, e]) => w.tx === x && w.ty === y && w.edge === e && G.map.isRingWall(G.map.tileAt(x, y)[e]));
    const straight = seen.filter((d) => d.wall && !d.ring && ringEdge(d.wall));
    const cornerPosts = seen.filter((d) => d.post && shape.outline.some(([x, y]) => d.post.tx === x && d.post.ty === y) && !shape.doors.some(([x, y, e]) => (e === "n" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]]).some(([px, py]) => px === d.post.tx && py === d.post.ty)));
    row("the ring is two drawables, its far half and its near half; no ring edge drawn straight, no post at a step corner", halves.length === 2 && halves.some((d) => d.ring.near) && halves.some((d) => !d.ring.near) && !straight.length && !cornerPosts.length, `${halves.length} halves, ${straight.length} straight walls, ${cornerPosts.length} posts at step corners`);

    // The near half's fade.
    const nearOnly = (d) => !(d.ring && d.ring.id === ring.id && d.ring.near);
    shot(nearOnly, { playerRoom: 0 });
    const opaque = scene.lastStats.translucent;
    shot(nearOnly, { playerRoom: roomId });
    const faded = scene.lastStats.translucent;
    row("the near half fades with the player in the ring's room, opaque outside it", opaque === 0 && faded === 1, `translucent drawables: ${opaque} outside, ${faded} inside`);

    // The sort's worst cases, by pixels.
    const insideFar = share(22.3, 1.3, { playerRoom: roomId });
    const behindFar = share(21, 0, { playerRoom: 0 });
    const frontNear = share(28.5, 3, { playerRoom: 0 });
    const behindNear = share(26.4, 2.1, { playerRoom: 0 });
    const throughNear = share(26.4, 2.1, { playerRoom: roomId });
    row("inside against the far half's inner face, the player shows whole", insideFar > 0.97, pct(insideFar));
    row("outside behind the far half, the player is hidden", behindFar < 0.05, pct(behindFar));
    row("outside in front of the near half, the player shows whole", frontNear > 0.97, pct(frontNear));
    row("inside behind the near half, opaque: hidden (bar a head over its top)", behindNear < 0.15, pct(behindNear));
    row("inside behind the near half, faded in the player's own room: seen through it", throughNear > 0.3, pct(throughNear));

    // The world on this page: the room, a body at the curve, sight.
    let p = { gx: 24, gy: 3 };
    for (let i = 0; i < 400; i++) p = G.map.moveCircle(p.gx, p.gy, 0.3, 0.014, -0.014);
    const r = Math.hypot(p.gx - 24, p.gy - 3);
    const room = G.map.getRoom(roomId);
    row("the page's world: a room of 37, a body held off the curve at the diagonal, no sight through the ring", room && room.size === 37 && r < 3.5 - 0.29 && r > 2.8 && !lineOfSight(22, 1, 20, -1), `room ${room && room.size}, the walk north-east ended ${r.toFixed(2)} from the centre`);
  } finally {
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
