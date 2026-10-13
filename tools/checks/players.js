// More than one player in the world (docs/31/03; docs/31/05 items 4, 5, 15, 18, 19,
// 20): a second player stands in the world, is drawn like anyone (in sight, never
// through a wall), the dead hunt whichever player they see nearest, a bite names
// its victim and wounds them alone, a torch in the second player's hand lures the
// dead to the second player, and the world steps the same with two as with one.
// From the console:
//   await __game.check("players")
// It pauses the loop, turns zombie aggro on and restores it (the setting is
// shared with Michael's pane: read first, put back in a finally), moves the
// dead about with teleports, and removes the second player at the end.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const aggro0 = G.settings.get("zombieAggro");
  const hour0 = G.clock.getHour();
  const me = G.player;
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const dist = (a, b) => Math.hypot(a.gx - b.gx, a.gy - b.gy);
  let other = null;
  const meAt = [me.gx, me.gy, me.hp];
  const dead = G.zombies.slice(0, 2).map((z) => [z, z.gx, z.gy, z.state, z.aggro, z.lastSeen, z.target]);
  try {
    G.loop.setPaused(true);
    G.settings.set("zombieAggro", true);
    G.clock.setHour(12);
    // 1. A second player, eight tiles away on open ground, in the world's lists, with their own id and sheet.
    const at = G.map.nearestWalkable(Math.round(me.gx) + 8, Math.round(me.gy), (x, y) => G.map.roomAt(x, y) !== 0) || [me.gx + 8, me.gy];
    other = G.addPlayer(at[0], at[1]);
    step(2);
    row("a second player stands in the world with their own id and sheet", S.players.length === 2 && other.id !== me.id && other.sprite !== me.sprite && S.others.includes(other), `${me.id} as ${me.sprite}, ${other.id} as ${other.sprite}`);
    // 2. Seen on open ground beside me; not seen from outdoors once they stand in my room (the spawn
    // is indoors), as any character: another player is never drawn through a wall (docs/31/03).
    const key = (x, y) => (Math.round(x) + 32768) * 65536 + (Math.round(y) + 32768);
    const near = G.map.nearestWalkable(at[0] - 3, at[1], (x, y) => G.map.roomAt(x, y) !== 0) || [at[0] - 3, at[1]];
    G.teleport(near[0], near[1]);
    step(3);
    const seenOpen = G.visible.has(key(other.gx, other.gy));
    other.gx = meAt[0];
    other.gy = meAt[1];
    step(3);
    const seenIndoors = G.visible.has(key(other.gx, other.gy));
    other.gx = at[0];
    other.gy = at[1];
    step(3);
    row("the other player is seen beside me on open ground and not through my cottage's wall", seenOpen && !seenIndoors, `open ground ${seenOpen}, indoors from outside ${seenIndoors}, ${G.drawn} drawables`);
    // 2b. And drawn: the frame with them beside me has more drawables than the frame with them far away
    // (Michael's first real join, 2026-10-13: the other player was a name with no body, since the scene
    // listed my player alone).
    const drawnWith = G.drawn;
    other.gx = at[0] + 60;
    other.gy = at[1];
    step(3);
    const drawnWithout = G.drawn;
    other.gx = at[0];
    other.gy = at[1];
    step(3);
    row("the other player's body is drawn, not only seen", drawnWith > drawnWithout, `${drawnWith} drawables with them beside me, ${drawnWithout} with them far off`);
    // 3. The dead hunt whichever they see nearest: a zombie beside the other player targets them, not me.
    const z = G.zombies.find((q) => !q.dead && !q.corpse);
    if (z) {
      z.gx = other.gx + 1.5;
      z.gy = other.gy;
      z.aggro = false;
      z.target = null;
      z.lastSeen = null;
      z.sightTimer = 0;
      z.state = "idle";
      z.path = [];
      step(20);
      row("a zombie beside the other player hunts them, not me", z.target === other && z.aggro, `target ${z.target ? z.target.id : "none"}, state ${z.state}`);
      // 4. The bite wounds the victim alone.
      const myHp = me.hp;
      const theirHp = other.hp;
      let bitten = 0;
      for (let i = 0; i < 60 * 6 && other.hp === theirHp; i++) { step(); bitten++; }
      row("its bite wounds the other player and not me", other.hp < theirHp && me.hp === myHp, `them ${theirHp} to ${other.hp} in ${(bitten / 60).toFixed(1)} s, me ${me.hp}`);
      // 5. At night, the other player's torch lures a zombie that cannot see either of us to where they stand.
      G.clock.setHour(1);
      const torch = G.items.makeEntry("torch", 1);
      other.hands.main = torch;
      z.gx = other.gx + 9;
      z.gy = other.gy + 1;
      z.aggro = false;
      z.target = null;
      z.lastSeen = null;
      z.sincePlayer = 100;
      z.sightTimer = 0;
      z.state = "idle";
      z.path = [];
      step(30);
      const luredTo = z.lastSeen;
      row("the other player's torch at night lures a zombie to where they stand", !!luredTo && Math.hypot(luredTo[0] - other.gx, luredTo[1] - other.gy) < 1.5, luredTo ? `last seen ${luredTo[0].toFixed(1)},${luredTo[1].toFixed(1)}; they stand ${other.gx.toFixed(1)},${other.gy.toFixed(1)}` : "not lured");
      other.hands.main = null;
    } else row("a zombie to test with", false, "no zombie alive");
    // 6. The carried lights: one per player with a torch, by owner.
    me.hands.off = me.hands.off || G.items.makeEntry("torch", 1);
    other.hands.main = G.items.makeEntry("torch", 1);
    step(1);
    const owners = G.light.carriers().filter((c) => c.owner).map((c) => c.owner).sort();
    row("two torches are two carried lights, each with its owner", owners.length === 2 && owners.includes(me.id) && owners.includes(other.id), owners.join(", "));
    other.hands.main = null;
  } finally {
    if (other) G.game.removePlayer(other.id);
    for (const [z, gx, gy, state, aggro, lastSeen, target] of dead) { z.gx = gx; z.gy = gy; z.state = state; z.aggro = aggro; z.lastSeen = lastSeen; z.target = target; z.path = []; }
    me.gx = meAt[0]; me.gy = meAt[1]; me.hp = meAt[2];
    G.clock.setHour(hour0);
    G.settings.set("zombieAggro", aggro0);
    step(1);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
