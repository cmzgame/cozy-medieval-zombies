// Crafting (docs/30, section 6): a recipe made at a station from ingredients
// in a chest within reach, taking its seconds in the world's time, paused while
// the station's fire is out, the result landing in the station's output; a
// prop recipe landing beside the station; the craft verb refusing what it
// should. From the console: await __game.check("craft")
// It pauses the loop, uses the joiner's workbench and the baker's oven from the
// valley (or any workbench and oven it finds), places a chest of its own
// beside each, and takes everything away again.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const p = G.player;
  const saved = { gx: p.gx, gy: p.gy };
  G.loop.setPaused(true);
  const bag = G.inventory.bagOf(p);
  const bag0 = bag.items.slice();
  for (const id of ["hammer", "knife"]) G.inventory.stow(p, G.items.makeEntry(id, 1)); // the tool rule (#215): the workbench's rows want a carried hammer or knife
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const find = (station) => {
    for (const c of map.loadedChunks()) for (const t of c.tiles) if (t.prop && t.prop.tile && G.stations.stationOf(t.prop) === station && map.peekTile(t.prop.tile[0], t.prop.tile[1]) === t) return t.prop;
    return null;
  };
  const made = []; // props placed by the check, taken away after
  const standBy = (prop) => {
    const at = map.nearestWalkable(prop.tile[0], prop.tile[1] + 1, (x, y) => !!map.tileAt(x, y).prop);
    G.teleport(at[0], at[1]);
    step();
    return at;
  };
  const chestBeside = (prop, items) => {
    const at = map.nearestWalkable(prop.tile[0] - 1, prop.tile[1] + 1, (x, y) => !!map.tileAt(x, y).prop || (x === Math.round(p.gx) && y === Math.round(p.gy)));
    const chest = map.createProp({ sprite: "chest", tile: at });
    map.placeProp(chest, at[0], at[1]);
    made.push(chest);
    chest.bag = G.inventory.createBag(4, 3, "chest");
    chest.searched = true;
    for (const [id, n] of items) G.grid.add(chest.bag, id, n);
    return chest;
  };
  let bench = null;
  try {
    bench = find("workbench");
    const oven = find("oven");
    if (!bench) throw new Error("no workbench in the loaded chunks");
    // 1. The workbench: arrows from a stick in a chest beside it.
    standBy(bench);
    const chest = chestBeside(bench, [["stick", 1], ["plank", 4]]);
    const r0 = G.verbs.run("craft", G.world.world, p, { prop: bench.id }, { recipe: "arrows", count: 1 });
    row("the verb takes a recipe from a chest's ingredients", r0.ok && G.grid.countItem ? true : r0.ok, r0.ok ? "started" : r0.reason);
    row("the ingredients are taken when the work starts", !chest.bag.items.some((e) => e.id === "stick"), `chest holds ${chest.bag.items.map((e) => `${e.id} x${e.count}`).join(", ")}`);
    const rec = G.stations.recipe("arrows");
    step(Math.ceil(rec.seconds * 60) + 2);
    const out = G.stations.outputOf(bench);
    const arrows = out.items.find((e) => e.id === "arrow");
    row("the result lands in the station's output after its seconds", !!arrows && arrows.count === rec.out.count, `output holds ${out.items.map((e) => `${e.id} x${e.count}`).join(", ") || "nothing"}`);
    // 2. A prop recipe: a bench from planks, placed beside the workbench.
    const before = new Set([...map.loadedChunks()].flatMap((c) => c.tiles.filter((t) => t.prop).map((t) => t.prop.id)));
    const r1 = G.verbs.run("craft", G.world.world, p, { prop: bench.id }, { recipe: "bench", count: 1 });
    step(Math.ceil(G.stations.recipe("bench").seconds * 60) + 2);
    let placed = null;
    for (let dy = -3; dy <= 3 && !placed; dy++) for (let dx = -3; dx <= 3; dx++) { const pr = map.peekTile(bench.tile[0] + dx, bench.tile[1] + dy)?.prop; if (pr && pr.sprite === "bench" && !before.has(pr.id)) { placed = pr; break; } }
    if (placed) made.push(placed);
    row("a prop recipe lands beside the station", r1.ok && !!placed, r1.ok ? (placed ? `a bench at ${placed.tile}` : "no bench appeared") : r1.reason);
    // 3. The verb refuses: short, and from afar.
    const r2 = G.verbs.run("craft", G.world.world, p, { prop: bench.id }, { recipe: "sword", count: 1 });
    row("the verb refuses what the station cannot make", !r2.ok && /Not at this station|Short/.test(r2.reason), r2.reason || "took it");
    G.teleport(bench.tile[0] + 6, bench.tile[1] + 6);
    step();
    const r3 = G.verbs.run("craft", G.world.world, p, { prop: bench.id }, { recipe: "arrows", count: 1 });
    row("the verb refuses from afar", !r3.ok && /far/.test(r3.reason), r3.reason || "took it");
    // 4. The oven: bread from flour, paused while the fire is out.
    if (oven) {
      standBy(oven);
      chestBeside(oven, [["flour", 2]]);
      const fireSaved = { lit: oven.fire.lit, fuel: oven.fire.fuel };
      oven.fire.lit = false;
      const r4 = G.verbs.run("craft", G.world.world, p, { prop: oven.id }, { recipe: "bread", count: 1 });
      row("a fire recipe refuses while the fire is out", !r4.ok && /fire/.test(r4.reason), r4.reason || "took it");
      oven.fire.lit = true;
      oven.fire.fuel = 2;
      const r5 = G.verbs.run("craft", G.world.world, p, { prop: oven.id }, { recipe: "bread", count: 1 });
      const bread = G.stations.recipe("bread");
      step(Math.ceil(bread.seconds * 60 / 2));
      oven.fire.lit = false;
      const half = G.stations.progress(oven);
      step(Math.ceil(bread.seconds * 60));
      const stillHalf = G.stations.progress(oven);
      row("the work pauses while the fire is out", r5.ok && half !== null && stillHalf !== null && Math.abs(stillHalf - half) < 0.02, `${r5.ok ? "" : r5.reason + "; "}progress ${half && half.toFixed(2)} then ${stillHalf && stillHalf.toFixed(2)} with the fire out`);
      oven.fire.lit = true;
      step(Math.ceil(bread.seconds * 60) + 2);
      const o2 = G.stations.outputOf(oven);
      row("and finishes once it is lit again", o2.items.some((e) => e.id === "bread"), `output holds ${o2.items.map((e) => `${e.id} x${e.count}`).join(", ") || "nothing"}`);
      Object.assign(oven.fire, fireSaved);
      oven.queue = [];
      o2.items = [];
    } else row("the oven", false, "no oven in the loaded chunks");
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message });
  } finally {
    for (const pr of made) map.removeProp(pr);
    if (bench) { bench.queue = []; if (bench.output) bench.output.items = []; }
    bag.items.splice(0, bag.items.length, ...bag0);
    G.teleport(saved.gx, saved.gy);
    G.loop.setPaused(wasPaused);
  }
  const failed = rows.filter((r) => r.result === "FAIL").length;
  console.table(rows);
  return { rows, pass: rows.length - failed, fail: failed };
}
