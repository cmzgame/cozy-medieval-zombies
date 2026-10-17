// Torches burn down and are lit with a tinderbox (Michael, 2026-10-17, #156): a lit torch burns while it is lit, fastest held
// and at the slower wall rate on the belt, in a bracket, or on a post; a kill costs far more than a second of burning; a spent
// torch is gone; a new one starts unlit; T lights it only with a tinderbox carried and douses a lit one; an unlit torch gives no
// light; the village's own mounted torches never go out. From the console, on a tab with `?nosave`:
//   await __game.check("torch")
// It shortens the burn times for the test (`world.torchHeldLife` and `torchWallLife`, put back in the finally), and puts the
// player's hands, belt, and bag back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const W = G.tuning.world;
  const life0 = { held: W.torchHeldLife, wall: W.torchWallLife };
  const wasPaused = G.loop.isPaused();
  const me = G.player;
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const belt = G.inventory.beltOf(me);
  const belt0 = belt ? [...belt] : null;
  const bag = G.inventory.bagOf(me);
  const spent = [];
  const off = G.events.on("weaponBroke", (e) => spent.push(e));
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const mk = (props = {}) => G.items.makeEntry("torch", 1, props);
  const press = () => { G.interact.updateInteract(me, 1 / 60, { t: true }); step(1); };
  const restore = [];
  try {
    G.loop.setPaused(true);
    W.torchHeldLife = 60; // seconds held: a hundredth of a day
    W.torchWallLife = 120;
    me.hands.main = null;
    me.hands.off = null;

    // A new torch starts unlit, and gives no light.
    const fresh = mk();
    row("a new torch starts unlit", !fresh.lit && !G.items.isLit(fresh), `lit ${fresh.lit}`);
    me.hands.main = fresh;
    step(2);
    row("an unlit torch in the hand gives no light", G.items.heldFire(me.hands) === null && G.light.carriers().every((c) => c.owner !== me.id), `carried lights ${G.light.carriers().length}`);

    // T: with no tinderbox, it says why and lights nothing; with one, it lights; again, it douses.
    const boxes = [];
    for (const e of [...(bag.items || [])]) if (e.id === "tinderbox") boxes.push(e);
    for (const e of boxes) G.inventory.detach(me, e);
    restore.push(() => { for (const e of boxes) G.inventory.addItem(bag, e.id, 1); });
    press();
    row("T with no tinderbox lights nothing", !fresh.lit, `lit ${fresh.lit}`);
    G.inventory.addItem(bag, "tinderbox", 1);
    restore.push(() => { for (const e of [...(bag.items || [])]) if (e.id === "tinderbox") G.inventory.detach(me, e); }); // the one this test added
    press();
    row("T with a tinderbox lights the torch in hand, and it gives light", fresh.lit === true && G.items.heldFire(me.hands) !== null, `lit ${fresh.lit}`);
    press();
    row("T again douses it", !fresh.lit && G.items.heldFire(me.hands) === null, `lit ${fresh.lit}`);

    // Burning: held faster than on the belt, and a kill costs far more than a second.
    press();
    const held = fresh;
    held.wear = 0;
    const beltTorch = mk({ lit: true, wear: 0 });
    if (belt) {
      const slot = belt.findIndex((e) => !e);
      if (slot >= 0) belt[slot] = beltTorch;
      else row("a belt slot for the second torch", false, "no free slot");
    }
    step(60 * 6);
    const k = G.items.getItem("torch").weapon.kills;
    row("a lit torch burns down held, and slower on the belt", held.wear > 0.05 && beltTorch.wear > 0.02 && held.wear > beltTorch.wear * 1.7 && held.wear < beltTorch.wear * 2.3, `after 6 s: held ${held.wear.toFixed(3)}, belt ${beltTorch.wear.toFixed(3)} (rates 1 over ${W.torchHeldLife} and ${W.torchWallLife} seconds, shortened here; really ${life0.held} and ${life0.wall})`);
    const perSecond = 1 / life0.held;
    const perKill = 1 / k;
    row("a kill costs far more than a second of burning", perKill > perSecond * 100, `a kill ${perKill.toFixed(3)} of a torch, a second held ${perSecond.toFixed(5)}`);

    // Spent: gone, with the weapon's word.
    held.wear = 0.999;
    step(60 * 3);
    row("a spent torch is gone from the hand, with a word", me.hands.main !== held && spent.some((e) => e.uid === held.uid), `hand ${me.hands.main && me.hands.main.id}, ${spent.length} told`);
    if (belt && belt.includes(beltTorch)) belt[belt.indexOf(beltTorch)] = null;

    // A torch in a bracket or on a post keeps its wear and burns at the wall rate; the village's own never go out.
    let bracket = null;
    let authored = null;
    for (const b of G.map.brackets()) {
      if (b.wall.bracket.torch && b.wall.bracket.wear === undefined && !authored) authored = b;
      if (!b.wall.bracket.torch && !bracket) bracket = b;
    }
    if (bracket) {
      const target = { kind: "bracket", bracket, mx: bracket.tx, my: bracket.ty };
      const t = mk({ lit: true, wear: 0.5 });
      G.map.setHolder(target, true, t);
      restore.push(() => G.map.setHolder(target, false));
      const st0 = G.map.holderState(target);
      row("a mounted torch keeps its wear and lit", st0.wear === 0.5 && st0.lit === true, JSON.stringify(st0));
      step(60 * 6);
      const st1 = G.map.holderState(target);
      row("and burns at the wall rate in its bracket (half the held rate)", st1.wear > 0.5 + (6 / W.torchWallLife) * 0.7 && st1.wear < 0.5 + (6 / W.torchWallLife) * 1.3, `wear ${st1.wear.toFixed(3)} after 6 s (a wall rate of ${(6 / W.torchWallLife).toFixed(3)})`);
      bracket.wall.bracket.wear = 0.999;
      step(60 * 3);
      row("a spent mounted torch is gone from its bracket", !G.map.holderHas(target), `holds a torch: ${G.map.holderHas(target)}`);
    } else row("an empty bracket for the mounting test", false, "none in the loaded map");
    if (authored) {
      step(60 * 10);
      row("the village's own mounted torches never go out", authored.wall.bracket.torch === true && authored.wall.bracket.wear === undefined, "an authored bracket, 10 s on");
    }
  } finally {
    off();
    W.torchHeldLife = life0.held;
    W.torchWallLife = life0.wall;
    for (const r of restore.reverse()) r();
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    if (belt && belt0) belt.splice(0, belt.length, ...belt0);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
