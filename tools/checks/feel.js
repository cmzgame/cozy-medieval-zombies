// Movement feel (#161): how evenly a walking player and the world scroll past on a display of any refresh rate. From the console, on a tab with `?nosave`:
//   await __game.check("feel")
// A real page cannot be sampled at a display's rate from here (a hidden pane draws nothing), so this records the world's own steps while the player walks (the keys held, the
// camera following) and replays them through a display at each refresh rate, drawing every frame as the game does: without help (the last step's positions) and as
// `interp.js` does (blended by how far between steps the frame falls). What it reports is the whole-pixel scroll per frame (the camera's rounded origin) and the player's
// drawn x: mean, spread, and the extremes. Without blending, 75, 120 and 144 Hz draw some frames with no scroll at all and the next with three pixels; with it the spread
// is a third. It also reports the camera's lag behind the player and that diagonals are not faster. Everything it touches is put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const interp = await import("/src/interp.js");
  const camera = await import("/src/camera.js");
  const iso = await import("/src/iso.js");
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const wasPaused = G.loop.isPaused();
  const aggro0 = G.rules.rules.zombieAggro;
  const key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code }));
  const W = 960;
  const H = 540;
  // With a screen up (the title on a fresh tab) the keys do not reach the world: the check puts it away and brings it back.
  const screen0 = G.screens.currentScreen();
  try {
    if (screen0) G.screens.hide();
    G.loop.setPaused(true);
    G.rules.rules.zombieAggro = false;
    // A stretch of open ground to walk across the screen on (D walks along gx up, gy down): twelve tiles of bare walkable grass with a tile of room each side.
    G.map.ensureAround(meAt[0], meAt[1], 3);
    let from = null;
    for (let dy = 0; dy <= 30 && !from; dy += 2) for (let dx = -30; dx <= 30 && !from; dx += 2) {
      const x = Math.round(meAt[0]) + dx;
      const y = Math.round(meAt[1]) + dy;
      let ok = true;
      for (let i = -1; i <= 14 && ok; i++) for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = G.map.peekTile(x + i + ox, y - i + oy); if (!t || t.prop || !G.map.isWalkableTile(x + i + ox, y - i + oy)) { ok = false; break; } }
      if (ok) from = [x, y];
    }
    if (!from) throw new Error("no open ground to walk on");
    G.teleport(from[0] + 0.1, from[1] + 0.1);
    for (let i = 0; i < 40; i++) G.loop.advance(1 / 60);
    const walk = () => { // per step: player gx, gy, camera gx, gy
      G.teleport(from[0] + 0.1, from[1] + 0.1);
      for (let i = 0; i < 40; i++) G.loop.advance(1 / 60);
      const out = [];
      key("KeyD");
      for (let i = 0; i < 300; i++) {
        G.loop.advance(1 / 60);
        out.push([me.gx, me.gy, camera.cam.gx, camera.cam.gy]);
      }
      key("KeyD", "keyup");
      G.loop.advance(1 / 60);
      return out;
    };
    const rec = walk();
    const stats = (xs) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
      return { mean: +m.toFixed(2), sd: +sd.toFixed(2), min: Math.min(...xs), max: Math.max(...xs) };
    };
    // A frame at time t (seconds): the step state at t * 60, either as the step left it or blended.
    const frameAt = (t, blended) => {
      const s = t * 60;
      const i = Math.floor(s);
      const a = rec[i];
      const b = rec[Math.min(rec.length - 1, i + 1)];
      const al = blended ? s - i : 1;
      const p = interp.blend([a[0], a[1]], [b[0], b[1]], al);
      const c = interp.blend([a[2], a[3]], [b[2], b[3]], al);
      const useStepped = !blended;
      const pos = useStepped ? [a[0], a[1]] : p;
      const cam = useStepped ? [a[2], a[3]] : c;
      const o = camera.originOf(cam[0], cam[1], W, H);
      return { ox: o.x, px: Math.round((pos[0] - pos[1]) * iso.HW + o.x) };
    };
    const replay = (hz, blended, jitterMs = 0) => {
      const scroll = [];
      const px = [];
      let prev = null;
      let t = 1;
      for (let k = 0; k < 2 * hz; k++) {
        const wob = ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1;
        t += 1 / hz + ((wob - 0.5) * 2 * jitterMs) / 1000;
        if (t * 60 > rec.length - 3) break;
        const f = frameAt(t, blended);
        if (prev !== null) scroll.push(-(f.ox - prev));
        prev = f.ox;
        px.push(f.px);
      }
      return { scroll: stats(scroll), playerX: stats(px) };
    };
    const out = {};
    for (const hz of [60, 75, 120, 144]) out[hz] = { stepped: replay(hz, false), blended: replay(hz, true) };
    out["60 with 2 ms of frame jitter"] = { stepped: replay(60, false, 2), blended: replay(60, true, 2) };
    for (const [hz, o] of Object.entries(out)) console.log(`${hz} Hz: scroll per frame without help sd ${o.stepped.scroll.sd} (${o.stepped.scroll.min} to ${o.stepped.scroll.max} px), blended sd ${o.blended.scroll.sd} (${o.blended.scroll.min} to ${o.blended.scroll.max} px)`);
    const worst = (k) => Math.max(...Object.values(out).map((o) => o[k].scroll.sd));
    row("blended, the scroll per frame is even on every display (spread under 0.6 px at 60, 75, 120, 144 Hz and with jitter)", worst("blended") < 0.6, `the worst spread ${worst("blended")} px; without help ${worst("stepped")} px`);
    row("without help it is not (the reason for the blend: some frames scroll nothing and the next three pixels)", out[144].stepped.scroll.min === 0 && out[144].stepped.scroll.max >= 3 && out[144].blended.scroll.max <= 2, `144 Hz without help ${out[144].stepped.scroll.min} to ${out[144].stepped.scroll.max} px, blended ${out[144].blended.scroll.min} to ${out[144].blended.scroll.max} px`);
    row("the mean scroll is the same either way (the blend adds nothing and loses nothing)", Object.values(out).every((o) => Math.abs(o.stepped.scroll.mean - o.blended.scroll.mean) < 0.1), Object.entries(out).map(([hz, o]) => `${hz}: ${o.stepped.scroll.mean} / ${o.blended.scroll.mean}`).join("; "));
    // The camera: how far it trails a walking player, and a diagonal is as fast as a straight line.
    const last = rec[rec.length - 1];
    const lagTiles = Math.hypot(last[0] - last[2], last[1] - last[3]);
    const speed = Math.hypot(rec[299][0] - rec[239][0], rec[299][1] - rec[239][1]) / 1;
    row("the camera trails a walking player by under half a tile (reported), and the player walks at the world's speed along the screen", lagTiles < 0.5 && Math.abs(speed - G.tuning.player.speed) < 0.1, `trailing ${lagTiles.toFixed(2)} tiles (${(lagTiles * 32 * 2).toFixed(0)} px at most); ${speed.toFixed(2)} tiles a second against ${G.tuning.player.speed}`);
    // The camera's follow is a number in data/tuning.json (feel.cameraFollow): doubled, it trails half as far.
    const follow0 = G.tuning.feel.cameraFollow;
    G.tuning.feel.cameraFollow = follow0 * 2;
    const quick = walk();
    G.tuning.feel.cameraFollow = follow0;
    const lagQuick = Math.hypot(quick[299][0] - quick[299][2], quick[299][1] - quick[299][3]);
    row("the camera's follow is a tuning number (feel.cameraFollow): doubled, it trails about half as far", Math.abs(lagQuick - lagTiles / 2) < 0.04, `${follow0} a second trails ${lagTiles.toFixed(3)} tiles, ${follow0 * 2} trails ${lagQuick.toFixed(3)}`);
    // A flying thing (an arrow, a thrown item, the fireball) blends its height with its position, and a jump is not blended.
    const arrow = { gx: 10, gy: 10, z: 20 };
    interp.mark([arrow]);
    arrow.gx += 0.27;
    arrow.z += 6;
    interp.apply(0.5);
    const mid2 = [arrow.gx, arrow.z];
    interp.restore();
    const back2 = arrow.gx === 10.27 && arrow.z === 26;
    interp.mark([arrow]);
    arrow.gx += 5;
    arrow.z += 6;
    interp.apply(0.5);
    const jumpedFlight = arrow.gx === 15.27 && arrow.z === 32;
    interp.restore();
    row("an arrow's position and height blend together and come back exactly; a jump is drawn where it landed", Math.abs(mid2[0] - 10.135) < 1e-9 && Math.abs(mid2[1] - 23) < 1e-9 && back2 && jumpedFlight, `halfway ${mid2[0].toFixed(3)}, ${mid2[1]}; restored ${back2}; a 5-tile jump drawn where it landed ${jumpedFlight}`);
    // Blending leaves the simulation alone: apply and restore are exact, and a jump is not blended.
    const gx0 = me.gx;
    const gy0 = me.gy;
    interp.mark([me]);
    me.gx += 0.05;
    interp.apply(0.5);
    const mid = me.gx;
    interp.restore();
    const exact = me.gx === gx0 + 0.05 && me.gy === gy0;
    interp.mark([me]);
    const here = me.gx;
    me.gx += 9;
    interp.apply(0.5);
    const jumped = me.gx === here + 9;
    interp.restore();
    me.gx = here;
    row("a draw puts the positions back exactly, and a jump (a teleport) is drawn where it landed, not blended", exact && Math.abs(mid - (gx0 + 0.025)) < 1e-9 && jumped && !interp.isApplied(), `blended ${mid.toFixed(3)}; restored ${exact}; a 9-tile jump drawn ${jumped ? "where it landed" : "blended"}`);
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    key("KeyD", "keyup");
    interp.restore();
    G.rules.rules.zombieAggro = aggro0;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
    if (screen0 && !G.screens.currentScreen()) G.screens.show(screen0);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
