// Sight-pull (docs/48, #492): one of the dead turning to hunt a player first-hand calls, once, to the dead near it that see it. From the
// console, on a tab with `?nosave&mute`:
//   await __game.check("pull")
// Staged so no two of the dead turn on one step (docs/48 section 6): each stage brings dead of its own onto open ground, holds every other
// one's sight check off while the one it is about turns, and takes them away after. One struck at the edge of a group with a wall between
// brings none; one struck in the middle brings those within `pullRadius` that see it, and none beyond; a killing blow brings none; one that
// turned to a flame first still pulls when it sees the player; one drawn in that then sees the player calls no one; in the dark the pull
// reaches less far; `pullRadius` 0 brings none; the call's line shows only when one answers. The guest's half is two tabs and check("sync").
// It turns Zombie aggro on for its stages, holds the world's dead, villagers, and animals out, and puts back the rule, the clock, the
// generator, the tuning, the player's place and health, and the walls it built (docs/testing.md).

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const finish = () => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  };
  if (G.net.status().role === "guest") {
    row("this tab is the host", false, "the pull is the host's: run this on the host, and read the guest's replica in its own tab");
    return finish();
  }
  const Z = await import("/src/entities/zombie.js");
  const T = G.tuning.zombie;
  const S = G.game.state;
  const p = G.player;
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const saved = {
    gx: p.gx, gy: p.gy, needs: (({ hp, hunger, thirst, tired, bleed, sick, infection, stamina }) => ({ hp, hunger, thirst, tired, bleed, sick, infection, stamina }))(p),
    aggro: G.rules.rules.zombieAggro, rng: G.rng.getState(), elapsed: G.clock.getElapsed(), paused: G.loop.isPaused(), pullRadius: T.pullRadius,
    held: { zombies: S.zombies, villagers: S.villagers, animals: S.animals }, main: p.hands.main, off: p.hands.off,
  };
  const walls = [];
  try {
    G.loop.setPaused(true);
    G.rules.rules.zombieAggro = true;
    G.rng.seed(4242);
    S.zombies = [];
    S.villagers = [];
    S.animals = [];
    p.hands.main = null; // no torch: the dark stage needs the player unlit
    p.hands.off = null;
    G.clock.setHour(12);

    // Open ground: 26 by 11 tiles with nothing on them and no wall across them.
    const clear = (x, y) => G.map.isWalkableTile(x, y) && !G.map.tileAt(x, y).prop;
    const open = (x0, y0) => {
      for (let dx = -2; dx <= 24; dx++) for (let dy = -5; dy <= 5; dy++) {
        if (!clear(x0 + dx, y0 + dy)) return false;
        if (G.map.wallBetween(x0 + dx, y0 + dy, x0 + dx + 1, y0 + dy) || G.map.wallBetween(x0 + dx, y0 + dy, x0 + dx, y0 + dy + 1)) return false;
      }
      return true;
    };
    const ox = Math.round(saved.gx);
    const oy = Math.round(saved.gy);
    let spot = null;
    for (let r = 0; r <= 50 && !spot; r += 2) for (let dy = -r; dy <= r && !spot; dy += 2) for (let dx = -r; dx <= r && !spot; dx += 2) if ((Math.abs(dx) === r || Math.abs(dy) === r) && open(ox + dx, oy + dy)) spot = [ox + dx, oy + dy];
    if (!spot) {
      row("open ground for the stages", false, `no clear 27 by 11 tiles within 50 of ${ox}, ${oy}`);
      return finish();
    }
    const [sx, sy] = spot;
    // The player stands far off (beyond any sight) unless a stage brings them in.
    const away = () => { G.teleport(sx + 22, sy); step(); };
    // A stage's dead: made, idle, their own sight checks held off (a stage turns exactly the one it is about).
    let made = [];
    const add = (x, y) => { const z = Z.createZombie(x, y); z.sightTimer = 1e9; z.groanTimer = 1e9; z.idleTimer = 1e9; z.line = null; S.zombies.push(z); made.push(z); return z; };
    const make = (pts) => {
      for (const z of made) { const i = S.zombies.indexOf(z); if (i >= 0) S.zombies.splice(i, 1); }
      made = [];
      return pts.map(([x, y]) => add(x, y));
    };
    const strike = (z, amount = 1) => Z.damageZombie(z, amount, { from: [p.gx, p.gy] });
    const joined = (zs) => zs.filter((z) => z.huntsPlayer);
    const lineOf = (z) => (z.line ? z.line.text : "");

    // 1. Struck at the edge, a wall between it and the group: none join, and it says no call.
    away();
    for (let dy = -3; dy <= 3; dy++) if (G.map.buildWall(sx + 2, sy + dy, "w", "wall", "wall_log")) walls.push([sx + 2, sy + dy, "w"]);
    const [edge, ...group1] = make([[sx, sy], [sx + 3, sy], [sx + 3, sy + 1], [sx + 3, sy - 1]]);
    strike(edge);
    step();
    row("one struck at the edge of a group with a wall between brings none, and says no call", edge.huntsPlayer && joined(group1).length === 0 && lineOf(edge) !== T.pullText, `struck hunts ${edge.huntsPlayer}; ${joined(group1).length} of ${group1.length} joined; its line "${lineOf(edge)}"`);
    for (const w of walls.splice(0)) G.map.destroyWall(...w);

    // 2. Struck in the middle: those within the radius that see it join, with the "!" over each, the caller's call; none beyond.
    away();
    const [mid, n1, n2, n3, far] = make([[sx + 4, sy], [sx + 6, sy], [sx + 4, sy + 2], [sx + 2, sy - 1], [sx + 10, sy]]);
    strike(mid);
    const before = [n1, n2, n3, far].map((z) => z.huntsPlayer);
    step();
    const near3 = [n1, n2, n3];
    row("one struck in the middle brings those within the radius that see it", near3.every((z) => z.huntsPlayer && z.aggro && z.lastSeen && Math.abs(z.lastSeen[0] - mid.lastSeen[0]) < 1e-9) && before.every((b) => !b), `${joined(near3).length} of 3 within ${T.pullRadius} tiles joined, each with the caller's lastSeen`);
    row("and none beyond it", !far.huntsPlayer && !far.aggro, `the one ${(far.gx - mid.gx).toFixed(1)} tiles off: hunts ${far.huntsPlayer}`);
    row("the call shows only when one answers: the caller's line and a \"!\" over each drawn in", lineOf(mid) === T.pullText && near3.every((z) => lineOf(z) === T.pullBubble) && lineOf(far) !== T.pullBubble, `caller "${lineOf(mid)}"; drawn in ${near3.map(lineOf).join(", ")}; the far one "${lineOf(far)}"`);
    step(30);
    row("the ones drawn in turn to the chase", near3.every((z) => z.state === "chase" || z.state === "attack"), near3.map((z) => z.state).join(", "));

    // 3. A drawn-in one that then sees the player calls no one.
    const late = add(sx + 7, sy + 1); // a fresh idle one beside it
    G.teleport(n1.gx - 4, n1.gy);
    n1.sightTimer = 0;
    step();
    row("one drawn in that then sees the player calls no one", n1.seesNow && !late.huntsPlayer && lineOf(n1) !== T.pullText, `it sees the player ${n1.seesNow}; the fresh one beside it hunts ${late.huntsPlayer}`);

    // 4. A killing blow brings none.
    away();
    const [victim, ...group4] = make([[sx + 4, sy], [sx + 5, sy], [sx + 4, sy + 1]]);
    strike(victim, 10000);
    step(2);
    row("a killing blow brings none", victim.dead && joined(group4).length === 0 && !victim.pullDue, `dead ${victim.dead}; ${joined(group4).length} of ${group4.length} joined`);

    // 5. One that turned to a flame first (hunting, not a player) still pulls when it sees the player.
    away();
    const [lit, ...group5] = make([[sx + 4, sy], [sx + 5, sy + 1], [sx + 3, sy - 1]]);
    lit.aggro = true; // as nearestFlame sets it: a hunt, but not a player's
    lit.lastSeen = [sx + 8, sy];
    lit.state = "chase";
    const flameFirst = lit.aggro && !lit.huntsPlayer;
    G.teleport(sx + 9, sy);
    lit.sightTimer = 0;
    step();
    row("one that turned to a flame first still pulls when it sees the player", flameFirst && lit.huntsPlayer && joined(group5).length === group5.length && lineOf(lit) === T.pullText, `${joined(group5).length} of ${group5.length} joined; its line "${lineOf(lit)}"`);

    // 6. In the dark the pull reaches less far: a neighbour at 2.5 tiles joins by day and not at night, unlit.
    const darkStage = (hour) => {
      G.clock.setHour(hour);
      away();
      step();
      const [c, nb] = make([[sx + 4, sy], [sx + 6.5, sy]]);
      const reach = Z.sightRange(T.pullRadius, c.gx, c.gy);
      strike(c);
      step();
      return { joined: nb.huntsPlayer, reach };
    };
    const day = darkStage(12);
    const night = darkStage(0);
    G.clock.setHour(12);
    row("a pull in the dark reaches less far than by day", day.joined && !night.joined && night.reach < day.reach, `by day ${day.reach.toFixed(1)} tiles, the one at 2.5 joined ${day.joined}; at night ${night.reach.toFixed(1)}, joined ${night.joined}`);

    // 7. pullRadius 0: none join.
    away();
    T.pullRadius = 0;
    const [c7, ...group7] = make([[sx + 4, sy], [sx + 5, sy], [sx + 4, sy + 1]]);
    strike(c7);
    step();
    T.pullRadius = saved.pullRadius;
    row("with pullRadius 0 none join", c7.huntsPlayer && joined(group7).length === 0, `${joined(group7).length} of ${group7.length} joined`);

    // 8. A hunt given up is a pull again: giveUp clears the mark (the search ends in it).
    away();
    const [g8, ...group8] = make([[sx + 4, sy], [sx + 5, sy]]);
    strike(g8);
    step();
    const first = group8[0].huntsPlayer;
    // Each searching with its time run out, the blow's reel or push over (a reeling one's step returns before its search can end).
    for (const z of [g8, ...group8]) { z.state = "search"; z.searchTimer = 0; z.seesNow = false; z.sincePlayer = 1e9; z.stagger = 0; z.knock = null; }
    step(5);
    const cleared = [g8, ...group8].every((z) => !z.huntsPlayer && !z.aggro);
    row("giving up clears the mark, so a later turn pulls again", first && cleared, `joined first ${first}; after the search, hunting ${[g8, ...group8].map((z) => z.huntsPlayer).join(", ")}`);
    for (const z of made) { const i = S.zombies.indexOf(z); if (i >= 0) S.zombies.splice(i, 1); }
    made = [];
  } catch (e) {
    row("setup", false, e.message + (e.stack ? " " + e.stack.split("\n")[1] : ""));
  } finally {
    for (const w of walls) G.map.destroyWall(...w);
    S.zombies = saved.held.zombies; // its own dead go with the list it made
    S.villagers = saved.held.villagers;
    S.animals = saved.held.animals;
    T.pullRadius = saved.pullRadius;
    p.hands.main = saved.main;
    p.hands.off = saved.off;
    G.teleport(saved.gx, saved.gy);
    Object.assign(p, saved.needs);
    G.rules.rules.zombieAggro = saved.aggro;
    G.rng.setState(saved.rng);
    G.clock.setElapsed(saved.elapsed);
    G.loop.setPaused(saved.paused);
  }
  return finish();
}
