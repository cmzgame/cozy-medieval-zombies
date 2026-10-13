// Sleep and the needs (docs/30 step 2): the sleep verb refuses outdoors and
// takes a bed indoors; asleep, the world's time scale rises and the loop runs
// the night through: the clock reaches the morning, the fire burns its logs
// down by the hours, tiredness is restored, health comes back at the sleeping
// rate; the sleeper gets up with the scale back at one. From the console:
// await __game.check("sleep")
// It pauses the loop, uses the bed and the hearth at the spawn (your cottage)
// with the loop stepped, and puts the clock, the needs, and the fire back.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const p = G.player;
  const saved = { gx: p.gx, gy: p.gy, hp: p.hp, hunger: p.hunger, thirst: p.thirst, tired: p.tired, elapsed: G.clock.getElapsed(), survival: G.settings.get("survival") };
  G.loop.setPaused(true);
  const step = () => G.loop.advance(1 / 60);
  // The bed nearest the spawn, and a burner in the same room.
  let bed = null;
  let fire = null;
  for (let r = 0; r < 12 && (!bed || !fire); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const t = map.peekTile(Math.round(saved.gx) + dx, Math.round(saved.gy) + dy);
    const pr = t && t.prop;
    if (!pr) continue;
    if (!bed && G.assets.getDef(pr.sprite).sleep) bed = pr;
    if (!fire && pr.fire && pr.fire.burns) fire = pr;
  }
  if (!bed) {
    G.loop.setPaused(wasPaused);
    return { rows: [{ check: "setup", result: "FAIL", detail: "no bed within 12 tiles of the spawn" }] };
  }
  const fireSaved = fire ? { lit: fire.fire.lit, fuel: fire.fire.fuel } : null;
  let other = null;
  try {
    G.settings.set("survival", true);
    step();
    // 1. Outdoors the verb refuses.
    const outside = map.nearestWalkable(bed.tile[0], bed.tile[1] + 8, (x, y) => map.roomAt(x, y) !== 0);
    G.teleport(outside[0], outside[1]);
    step();
    const far = G.verbs.run("sleep", G.world.world, p, { prop: bed.id });
    row("the verb refuses from afar", !far.ok, far.reason || "took it");
    // 2. Beside the bed at night, tired, it takes.
    G.teleport(bed.tile[0], bed.tile[1] + 1);
    G.clock.setHour(22);
    p.tired = 30;
    p.hp = 60;
    if (fire) { fire.fire.lit = true; fire.fire.fuel = 2; }
    step();
    const r = G.verbs.run("sleep", G.world.world, p, { prop: bed.id });
    row("the verb takes a bed indoors at night", r.ok && !!p.sleeping && G.world.world.timeScale > 1, `${r.ok ? "asleep" : r.reason}, time scale ${G.world.world.timeScale}`);
    // 3. The night, stepped: tiredness restored, the clock at the morning, the fire down by its hours, health up.
    const hour0 = G.clock.getHour();
    let steps = 0;
    while (p.sleeping && steps < 60 * 60 * 20) { step(); steps++; }
    const slept = steps / 60 / 30; // game hours
    const h = G.clock.getHour();
    row("the sleeper gets up rested in the morning", !p.sleeping && p.tired >= p.maxTired - 0.01 && h >= 6 && h < 7, `up after ${slept.toFixed(1)} game hours (from ${hour0}:00), at ${h}:00, tired ${Math.round(p.tired)}`);
    row("the time scale is back at one", G.world.world.timeScale === 1, `scale ${G.world.world.timeScale}`);
    if (fire) {
      const expected = Math.max(0, 2 - slept / fire.fire.hoursPerUnit);
      row("the fire burned its logs down by the hours", Math.abs(fire.fire.fuel - expected) < 0.15 && (expected > 0 ? fire.fire.lit : !fire.fire.lit), `fuel ${fire.fire.fuel.toFixed(2)} (expected ${expected.toFixed(2)} at ${fire.fire.hoursPerUnit} h a log), lit ${fire.fire.lit}`);
    }
    const gained = p.hp - 60;
    const expectedHp = Math.min(40, (slept * 30 / 60) * G.tuning.player.sleepRegenPerMinute);
    row("health came back at the sleeping rate", Math.abs(gained - expectedHp) < 2, `+${gained.toFixed(1)} (expected about ${expectedHp.toFixed(1)})`);
    // 4. Two players (Michael, 2026-10-13: sleep is optional in a world with friends in it, and time skips only when
    // every living player is in bed): one asleep, the other awake, the world keeps its pace; both asleep, it skips;
    // one wakes, it slows again.
    G.clock.setHour(22);
    p.tired = 30;
    G.teleport(bed.tile[0], bed.tile[1] + 1);
    other = G.addPlayer(bed.tile[0] + 1, bed.tile[1] + 1);
    other.tired = 30;
    step();
    const first = G.verbs.run("sleep", G.world.world, p, { prop: bed.id });
    step();
    row("one asleep and one awake: the world keeps its pace", first.ok && !!p.sleeping && !other.sleeping && G.world.world.timeScale === 1, `${first.ok ? "asleep" : first.reason}, scale ${G.world.world.timeScale}`);
    const second = G.verbs.run("sleep", G.world.world, other, { prop: bed.id });
    step();
    row("both asleep: time skips", second.ok && !!other.sleeping && G.world.world.timeScale > 1, `${second.ok ? "asleep" : second.reason}, scale ${G.world.world.timeScale}`);
    p.tired = p.maxTired;
    G.clock.setHour(7);
    step();
    step();
    row("one wakes: the world is back at its pace", !p.sleeping && !!other.sleeping && G.world.world.timeScale === 1, `first asleep ${!!p.sleeping}, second asleep ${!!other.sleeping}, scale ${G.world.world.timeScale}`);
  } finally {
    if (other) G.game.removePlayer(other.id);
    if (p.sleeping) G.player.sleeping = null;
    G.world.setTimeScale(1);
    G.teleport(saved.gx, saved.gy);
    Object.assign(p, { hp: saved.hp, hunger: saved.hunger, thirst: saved.thirst, tired: saved.tired });
    G.clock.setElapsed(saved.elapsed);
    if (fire && fireSaved) Object.assign(fire.fire, fireSaved);
    G.settings.set("survival", saved.survival);
    G.loop.setPaused(wasPaused);
  }
  const failed = rows.filter((r) => r.result === "FAIL").length;
  console.table(rows);
  return { rows, pass: rows.length - failed, fail: failed };
}
