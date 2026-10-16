// Durability is kills (docs/30, law 5 and 5.2): a weapon's `kills` is its
// life; a landed hit costs it one over kills times the hits a kill takes
// against the standard zombie; a miss costs nothing; at the last hit the
// weapon is gone from the hand with a word. From the console:
// await __game.check("wear")
// It pauses the loop, puts a stick in the main hand, stands the dead in front
// of the player one at a time, swings through them with the loop stepped, and
// puts the hands and the dead back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const p = G.player;
  const saved = { main: p.hands.main, off: p.hands.off, gx: p.gx, gy: p.gy, aim: { ...p.aim }, aggro: G.rules.rules.zombieAggro, multi: G.rules.rules.multiHit };
  G.loop.setPaused(true);
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const added = [];
  try {
    G.rules.set({ zombieAggro: false });
    G.rules.set({ multiHit: false });
    const stickDef = G.items.getItem("stick");
    const per = G.items.wearPerHit(stickDef);
    const hpk = G.items.hitsPerKill(stickDef);
    row("a stick's wear per hit is one over kills times hits a kill", Math.abs(per - 1 / (stickDef.weapon.kills * hpk)) < 1e-9 && stickDef.weapon.kills === 5, `kills ${stickDef.weapon.kills}, ${hpk} hits a kill, ${(per * 100).toFixed(2)} percent a hit`);
    // The stick in hand, the player on open ground facing east.
    const open = G.map.nearestWalkable(Math.round(p.gx) + 4, Math.round(p.gy), (x, y) => G.map.roomAt(x, y) !== 0 || !!G.map.tileAt(x, y).prop || !!G.map.tileAt(x + 1, y).prop);
    G.teleport(open[0], open[1]);
    p.hands.main = G.items.makeEntry("stick", 1);
    p.hands.off = null;
    const stick = p.hands.main;
    step();
    let swings = 0;
    let landed = 0;
    let misses = 0;
    const wearBefore = stick.wear || 0;
    // A swing at nothing: a miss costs nothing.
    p.aim.sx = 1; p.aim.sy = 0;
    G.combat.tryAttack(p, G.zombies, "main");
    step(Math.ceil(stickDef.weapon.swing * 60) + 2);
    misses++;
    row("a miss costs nothing", (stick.wear || 0) === wearBefore, `wear ${((stick.wear || 0) * 100).toFixed(2)} percent after a swing at air`);
    // Then the dead, one at a time in front, until the stick is spent.
    const total = stickDef.weapon.kills * hpk;
    let z = null;
    let guard = 0;
    while (p.hands.main === stick && guard++ < total * 3) {
      if (!z || z.dead) {
        z = G.zombies.find((zz) => !zz.dead && Math.hypot(zz.gx - p.gx, zz.gy - p.gy) < 2) || null;
        if (!z) {
          const s = G.iso.toScreen(p.gx + 0.9, p.gy);
          const d = G.iso.toGrid(s.x, s.y);
          z = G.entities ? null : null;
          const made = (await import("/src/entities/zombie.js")).createZombie(p.gx + 0.9, p.gy);
          G.zombies.push(made);
          added.push(made);
          z = made;
        }
      }
      // Each swing finds it a step east again: a hit knocks it back, and with aggro off it wanders.
      z.gx = p.gx + 0.9;
      z.gy = p.gy;
      z.knock = null;
      const s = G.iso.toScreen(z.gx, z.gy);
      const o = G.iso.toScreen(p.gx, p.gy);
      const n = G.iso.normalize(s.x - o.x, s.y - o.y - 0.001);
      p.aim.sx = n.x; p.aim.sy = n.y;
      const hpBefore = z.hp;
      const hit = G.combat.tryAttack(p, G.zombies, "main");
      swings++;
      if (hit && hit.length) landed += hit.length;
      step(Math.ceil(stickDef.weapon.swing * 60) + 2);
      if (z.hp === hpBefore && !(hit && hit.length)) misses++;
    }
    row("the stick is spent on its last kill's last hit", p.hands.main === null && landed === total, `${landed} landed hits of ${total} (${swings} swings, ${misses} at air), the hand ${p.hands.main ? "still holds it" : "is empty"}`);
    // About five: a floored one takes the finisher's extra, so a stick can see a sixth off; the number is a design number, not a count.
    const corpses = added.filter((zz) => zz.dead).length;
    row("about five of the dead fell to it", Math.abs(corpses - stickDef.weapon.kills) <= 2, `${corpses} fell (the stick's number is ${stickDef.weapon.kills})`);
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message });
  } finally {
    for (const zz of added) { const i = G.zombies.indexOf(zz); if (i >= 0) G.zombies.splice(i, 1); const j = G.corpses.indexOf(zz); if (j >= 0) G.corpses.splice(j, 1); }
    p.hands.main = saved.main;
    p.hands.off = saved.off;
    Object.assign(p.aim, saved.aim);
    G.teleport(saved.gx, saved.gy);
    G.rules.set({ zombieAggro: saved.aggro });
    G.rules.set({ multiHit: saved.multi });
    G.loop.setPaused(wasPaused);
  }
  const failed = rows.filter((r) => r.result === "FAIL").length;
  console.table(rows);
  return { rows, pass: rows.length - failed, fail: failed };
}
