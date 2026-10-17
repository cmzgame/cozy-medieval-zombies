// What a player sees of the dead in the dark (docs/07, #88; src/sight.js): in daylight every one of the dead in view; at
// night, with no light, those within a short radius, fading to hidden over a soft edge past it; a carried torch gives
// sight back to its own radius; a dead one standing in another's light is seen from afar; a burning one is seen. Numbers
// are `data/tuning.json`'s `sight`. From the console, on a tab with `?nosave`:
//   await __game.check("sight")
// It stands one of the dead at set distances east of the player, changes the hour and the player's hands, and puts the
// hour, the hands, the other player, and the dead one back.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const sight = await import("/src/sight.js");
  const T = G.tuning.sight;
  const wasPaused = G.loop.isPaused();
  const hour0 = G.clock.getHour();
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const z = G.zombies.find((q) => !q.dead && !q.corpse);
  const z0 = { gx: z.gx, gy: z.gy, state: z.state, aggro: z.aggro, burning: z.burning };
  let other = null;
  const step = (n = 4) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const alphaAt = (d) => { z.gx = me.gx + d; z.gy = me.gy; step(2); return sight.seenAlpha(me, z); };
  const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;
  try {
    G.loop.setPaused(true);
    // A tile of open ground with room to the east: the spawn's street.
    const spot = G.map.nearestWalkable(112, 188) || meAt;
    G.teleport(spot[0], spot[1]);
    z.state = "idle";
    z.aggro = false;
    z.path = [];
    z.burning = false;

    G.clock.setHour(12);
    row("daytime is unchanged: the dead at eight tiles are seen whole", near(alphaAt(8), 1), `${alphaAt(8).toFixed(2)}`);

    G.clock.setHour(0);
    me.hands.main = null;
    me.hands.off = null;
    step();
    const dark = [0, 1, T.darkRadius, T.darkRadius + T.edge / 2, T.darkRadius + T.edge, T.darkRadius + T.edge + 2].map(alphaAt);
    row("at night with no light the dead within the short radius are seen whole", near(dark[1], 1) && near(dark[2], 1), `${dark[1].toFixed(2)} at 1, ${dark[2].toFixed(2)} at ${T.darkRadius}`);
    row("past it they fade over the soft edge", dark[3] > 0.2 && dark[3] < 0.8 && dark[2] > dark[3] && dark[3] > dark[4], `half way ${dark[3].toFixed(2)}, at the edge's end ${dark[4].toFixed(2)}`);
    row("and are hidden beyond it", near(dark[4], 0) && near(dark[5], 0), `${dark[5].toFixed(2)} at ${T.darkRadius + T.edge + 2}`);

    // The dark hides information, never physics (Michael, #150): one lost in it cannot be pointed at (no hover hand, no click, no
    // right-click: `characterAt`), one seen can; and a hit still lands on it (a swing or a shot is the world's, not the eye's).
    const pointAt = (d) => { z.gx = me.gx + d; z.gy = me.gy; step(2); const p = G.iso.toScreen(z.gx, z.gy); return G.interact.characterAt(p.x, p.y - 20); };
    const seenOne = pointAt(1);
    const hiddenOne = pointAt(6);
    row("a dead one seen in the dark can be pointed at, and one lost in it cannot", seenOne === z && hiddenOne === null, `at 1 tile ${seenOne === z ? "found" : "missed"}, at 6 ${hiddenOne === null ? "nothing there" : "found"}`);
    z.gx = me.gx + 6;
    z.gy = me.gy;
    const hp0 = z.hp;
    const dmg = (await import("/src/entities/zombie.js")).damageZombie(z, 10, { dir: [1, 0] });
    row("a blow still lands on one lost in the dark", z.hp === hp0 - 10 && !dmg.killed, `hp ${hp0} to ${z.hp}`);
    z.hp = hp0;

    me.hands.main = hands0.main || me.hands.main;
    const torch = hands0.main && hands0.main.id === "torch" ? hands0.main : hands0.off && hands0.off.id === "torch" ? hands0.off : null;
    if (torch) {
      me.hands.main = torch;
      step();
      const carried = G.light.carriers().find((c) => Math.hypot(c.gx - me.gx, c.gy - me.gy) < 0.7);
      const R = carried ? carried.radius : 3;
      const lit = [R, R + T.edge / 2, R + T.edge].map(alphaAt);
      row("a carried torch gives sight back to its radius", carried && R > T.darkRadius && near(lit[0], 1), `radius ${R}: ${lit[0].toFixed(2)} whole at ${R}`);
      row("and the soft edge is past that", lit[1] > 0.2 && lit[1] < 0.8 && near(lit[2], 0), `${lit[1].toFixed(2)} half way, ${lit[2].toFixed(2)} at the end`);
    } else row("a carried torch gives sight back to its radius", false, "the player holds no torch to try");

    // Another player's torch: the dead one standing in its light is seen from afar.
    me.hands.main = null;
    me.hands.off = null;
    step();
    z.gx = me.gx + 9;
    z.gy = me.gy;
    const far = alphaAt(9);
    const spotFor = G.map.nearestWalkable(Math.round(me.gx + 10), Math.round(me.gy)) || [me.gx + 10, me.gy];
    other = G.addPlayer(spotFor[0], spotFor[1]);
    other.hands.main = torch ? { ...torch } : { id: "torch", count: 1 };
    step(6);
    const lit = sight.seenAlpha(me, z);
    other.hands.main = null;
    step(6);
    const unlit = sight.seenAlpha(me, z);
    row("a dead one in another's torchlight is seen from afar, and hidden when it goes out", near(far, 0) && lit > 0.9 && near(unlit, 0), `${far.toFixed(2)} dark, ${lit.toFixed(2)} by their torch, ${unlit.toFixed(2)} after`);

    z.gx = me.gx + 9;
    z.gy = me.gy;
    z.burning = true; // read at once: the burn's own step would put it out
    row("a burning one is its own light", near(sight.seenAlpha(me, z), 1), "seen whole at nine tiles");
    z.burning = false;
  } finally {
    if (other) G.game.removePlayer(other.id);
    Object.assign(z, z0);
    z.path = [];
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    G.teleport(meAt[0], meAt[1]);
    G.clock.setHour(hour0);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
