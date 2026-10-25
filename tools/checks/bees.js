// Bees at the hives (#441): a few specks in small loops round each hive's crown by day, none from dusk to dawn, livelier for a few seconds when its
// honey is taken; cosmetic, drawn by the props renderer from the sim clock and the prop's own `honeyAt`, nothing in the world or on the wire.
// From the console, on a tab with `?nosave`:
//   await __game.check("bees")
// It goes to a hive in the valley, reads what the frame's drawable for it decided at noon, dusk, midnight, and dawn, out of sight, across steps and
// a pause, and after Take honey by the verb; then puts the player, the clock, the bag, and the hive's day back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const clock0 = G.clock.getElapsed();
  const wasPaused = G.loop.isPaused();
  const props = await import("/src/render/props.js");
  const bees = await import("/src/render/bees.js");
  const { tileKey } = await import("/src/visibility.js");
  const hive = [...G.map.allProps()].find((q) => q.sprite === "beehive");
  if (!hive) return { rows: [{ check: "setup", result: "FAIL", detail: "no beehive on the map" }], passed: 0, total: 1 };
  const hive0 = { honeyAt: hive.honeyAt, had: "honeyAt" in hive };
  const [hx, hy] = hive.tile;
  // The frame's drawable for the hive, as the renderer makes it, in sight or not; its `bees` is what it will draw.
  const drawn = (inSight = true) => {
    const out = [];
    props.propDrawables([[hx, hy]], inSight ? new Set([tileKey(hx, hy)]) : new Set(), out);
    return out.find((d) => d.kind === "prop" && d.rect);
  };
  const at = (hour) => {
    G.clock.setHour(hour);
    return drawn();
  };
  const where = (d) => (d && d.bees ? JSON.stringify(d.bees.list.map((b) => [b.x, b.y])) : "none");
  try {
    G.loop.setPaused(true);
    G.map.ensureAround(hx, hy, 3);
    delete hive.honeyAt; // a hive with honey, never taken from: calm
    const take = G.interact.actionsForTarget({ kind: "prop", id: hive.id }, me).find((x) => x.kind === "honey");
    const stand = take && G.interact.approachTile(take, me);
    G.teleport(stand ? stand[0] : hx + 1, stand ? stand[1] : hy);
    G.loop.advance(1 / 60);
    const noon = at(12);
    const n = noon && noon.bees ? noon.bees.list.length : 0;
    row("at noon a hive in sight has three to six bees, its own number", n >= 3 && n <= 6 && n === bees.countOf(hive), `${n} (its number ${bees.countOf(hive)}) at ${hx},${hy}`);
    const near = noon && noon.bees && noon.bees.list.every((b) => Number.isInteger(b.x) && Number.isInteger(b.y) && Math.abs(b.x) <= 30 && b.y >= -24 && b.y <= 14);
    row("each at a whole pixel, in a small cloud round the crown", !!near, where(noon));
    const f = G.assets.getSheet("beehive").frames.idle_0;
    const top = noon && noon.rect ? noon.rect.y : null;
    row("the cloud's centre is the hive's crown, a few pixels under the top of its picture", noon && noon.bees && noon.bees.cy === top + bees.BEES.crownY && noon.bees.cx === noon.rect.x + Math.round(f[2] / 2), noon && noon.bees ? `centre ${noon.bees.cx},${noon.bees.cy}, picture from ${noon.rect.x},${top}` : "none");
    row("none for a hive out of sight", !drawn(false).bees, where(drawn(false)));
    for (const [name, hour] of [["at dusk", 22.5], ["at midnight", 0], ["at dawn", 6.5], ["late in the night", 4]]) row(`none ${name} (${hour}:00)`, !at(hour).bees, where(at(hour)));
    row("back again at 07:30", !!(at(7.5).bees && at(7.5).bees.list.length === n), where(at(7.5)));
    // The sim clock: paused it holds still, and a step moves the bees a little, never across their loops.
    G.clock.setHour(12);
    const a = drawn().bees.list;
    const b = drawn().bees.list;
    row("paused, the bees hold still", JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a.map((q) => [q.x, q.y]))}`);
    let moved = 0;
    let jump = 0;
    let prev = a;
    for (let i = 0; i < 30; i++) {
      G.loop.advance(1 / 60);
      G.clock.setHour(12);
      const now = drawn().bees.list;
      now.forEach((q, k) => { const d = Math.max(Math.abs(q.x - prev[k].x), Math.abs(q.y - prev[k].y)); if (d) moved++; jump = Math.max(jump, d); });
      prev = now;
    }
    row("stepped, they drift: moving, at most a few pixels a step", moved > 0 && jump <= 3, `${moved} moves in 30 steps, the largest ${jump} px`);
    // Take honey: livelier for a few seconds of the clock, from the prop's own day, then calm again.
    const r = G.verbs.run("honey", G.world, me, { prop: hive.id });
    row("Take honey by the verb (as the menu and a guest's label run it)", r.ok && Number.isFinite(hive.honeyAt), r.ok ? `honeyAt ${Math.round(hive.honeyAt)}` : String(r.reason));
    const t0 = G.clock.getElapsed();
    const stirred = drawn();
    row("straight after, the hive is stirred: six bees, in wider loops", bees.stirOf(hive, t0) === 1 && stirred.bees && stirred.bees.list.length === bees.BEES.max, `stir ${bees.stirOf(hive, t0)}, ${stirred.bees ? stirred.bees.list.length : 0} bees`);
    G.clock.setElapsed(t0 + bees.BEES.stirSeconds / 2);
    row("half way, still lively", bees.stirOf(hive, G.clock.getElapsed()) > 0.4 && bees.stirOf(hive, G.clock.getElapsed()) < 0.6, `stir ${bees.stirOf(hive, G.clock.getElapsed()).toFixed(2)}`);
    G.clock.setElapsed(t0 + bees.BEES.stirSeconds + 1);
    const calm = drawn();
    row(`after ${bees.BEES.stirSeconds} s of the clock, calm again: its own number`, bees.stirOf(hive, G.clock.getElapsed()) === 0 && calm.bees && calm.bees.list.length === n, `${calm.bees ? calm.bees.list.length : 0} bees`);
    const saved = hive.honeyAt;
    hive.honeyAt = G.clock.getElapsed() - G.clock.DAY_LENGTH; // taken days ago, its day already past
    const late = drawn();
    row("a hive whose honey was taken while nobody watched is calm when it comes into view", bees.stirOf(hive, G.clock.getElapsed()) === 0 && late.bees && late.bees.list.length === n, `${late.bees ? late.bees.list.length : 0} bees`);
    hive.honeyAt = saved;
  } finally {
    if (hive0.had) hive.honeyAt = hive0.honeyAt;
    else delete hive.honeyAt;
    G.map.touch(hx, hy);
    G.clock.setElapsed(clock0);
    bag.items.splice(0, bag.items.length, ...bag0);
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
