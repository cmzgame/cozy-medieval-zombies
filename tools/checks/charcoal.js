// The charcoal clamp (#197; docs/30 sections 6 and 7). From the console, on a tab with `?nosave`:
//   await __game.check("charcoal")
// It places a clamp of its own with a chest of logs beside it, lights it from the menu (a log of fuel and a tinderbox), makes charcoal
// from four logs over the recipe's seconds, pauses while the fire is out and finishes when it is fed, and then lights the forge with the
// charcoal. The valley's clamps, sacks, and the smithy's chest are read from the map. Everything placed is taken away.

export async function run(game) {
  const G = game;
  const needs0 = (({ hunger, thirst, tired, hp, bleed, sick, infection }) => ({ hunger, thirst, tired, hp, bleed, sick, infection }))(G.player); // put back in the finally: its steps drain them and the dead may bite (the order-independence of the checks, check("all"))
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const p = G.player;
  const saved = { gx: p.gx, gy: p.gy };
  const bag = G.inventory.bagOf(p);
  const bag0 = bag.items.slice();
  const wasPaused = G.loop.isPaused();
  G.loop.setPaused(true);
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const made = [];
  try {
    // The data.
    const def = G.assets.getDef("charcoal_clamp");
    const rec = G.stations.recipe("charcoal");
    row("a clamp is a station of its own with a slow fire of logs (a log a day), and a recipe: four logs to three charcoal, the fire lit", def.station === "clamp" && def.fire.burns === true && def.fire.fuel === "log" && def.fire.hoursPerUnit >= 12 && rec.station === "clamp" && rec.fire === true && rec.in[0].id === "log" && rec.in[0].count === 4 && rec.out.id === "charcoal" && rec.out.count === 3, JSON.stringify(rec));

    // The map: the burners' clearing, the smithy's own clamp and chest.
    G.map.ensureAround(224, 174, 4);
    G.map.ensureAround(98, 188, 4);
    const props = map.allProps();
    const clamps = props.filter((q) => q.sprite === "charcoal_clamp");
    const loot = props.filter((q) => q.container).map((q) => q.container.loot);
    row("the burners' clearing has three clamps, sacks of charcoal, and the hut's chest of them; the smithy's yard one more", clamps.length === 4 && props.filter((q) => q.sprite === "charcoal_sack").length >= 2 && loot.includes("charcoal_sacks") && G.items.rollLoot("charcoal_sacks").some((e) => e.id === "charcoal"), `${clamps.length} clamps`);
    row("the smithy's own chest holds the first iron and a sack of charcoal, so the forge works on day one", loot.includes("smithy_chest") && G.items.rollLoot("smithy_chest").some((e) => e.id === "iron_bar") && G.items.rollLoot("smithy_chest").some((e) => e.id === "charcoal"), "smithy_chest");

    // A clamp of the check's own, with a chest of logs beside it, and a tinderbox and a log on the player.
    // Open ground for it, read from the map: the clamp's 2 by 2, the chest east of it, and the player's place south of it, with a tile round
    // them, all walkable outdoor tiles with nothing on them and no wall on an edge (the spawn is indoors: a clamp set there with the player
    // put outside the cottage's south wall, #514, was refused with "There is a wall in the way.").
    let home = null;
    for (let r = 0; r < 40 && !home; r++) for (let dy = -r; dy <= r && !home; dy++) for (let dx = -r; dx <= r && !home; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = Math.round(p.gx) + dx, y = Math.round(p.gy) + dy;
      let ok = true;
      for (let j = -1; j <= 3 && ok; j++) for (let i = -1; i <= 3 && ok; i++) { map.growTile(x + i, y + j); const t = map.tileAt(x + i, y + j); if (!map.isWalkableTile(x + i, y + j) || map.roomAt(x + i, y + j) !== 0 || t.prop || t.n || t.w) ok = false; }
      if (ok) home = [x, y];
    }
    if (!home) throw new Error("no open ground for a clamp within 40 tiles of the player");
    const clamp = map.createProp({ sprite: "charcoal_clamp", tile: home, footprint: [2, 2] });
    map.placeProp(clamp, home[0], home[1]);
    made.push(clamp);
    const chestAt = [home[0] + 2, home[1] + 1];
    const chest = map.createProp({ sprite: "chest", tile: chestAt });
    map.placeProp(chest, chestAt[0], chestAt[1]);
    made.push(chest);
    chest.bag = G.inventory.createBag(8, 6, "chest"); // a log is 2 by 3 cells: four need room
    chest.searched = true;
    G.grid.add(chest.bag, "log", 4);
    G.teleport(home[0] + 1.0, home[1] + 2.4);
    G.inventory.stow(p, G.items.makeEntry("tinderbox", 1));
    G.inventory.stow(p, G.items.makeEntry("log", 1));
    step();
    const craft = () => G.verbs.run("craft", G.world.world, p, { prop: clamp.id }, { recipe: "charcoal", count: 1 });
    const r0 = craft();
    row("with the fire out the recipe is refused", !r0.ok && /fire/.test(r0.reason), String(r0.reason));
    const fireAct = G.interact.actionsForTarget({ kind: "prop", id: clamp.id }, p).find((a) => a.kind === "fire");
    row("the clamp's menu offers to light it with a log and a flame", !!fireAct && /^Light the charcoal clamp/.test(fireAct.label) && fireAct.enabled, fireAct ? fireAct.label : "no fire entry");
    fireAct.perform();
    row("lit, with a log of fuel in it", clamp.fire.lit === true && clamp.fire.fuel >= 1 - 1e-9, `lit ${clamp.fire.lit}, fuel ${clamp.fire.fuel}`);
    const r1 = craft();
    row("then the recipe starts and takes its four logs from the chest", r1.ok && !chest.bag.items.some((e) => e.id === "log"), r1.ok ? "started" : r1.reason);
    step(120);
    const half = G.stations.progress(clamp);
    clamp.fire.lit = false;
    step(300);
    const still = G.stations.progress(clamp);
    row("the work pauses while the fire is out", half !== null && still !== null && Math.abs(still - half) < 0.001, `progress ${half && half.toFixed(4)} then ${still && still.toFixed(4)}`);
    clamp.fire.lit = true;
    clamp.queue[0].left = 0.5; // the rest of the half day: the seconds are the recipe's, the step is the world's
    step(90);
    const out = G.stations.outputOf(clamp);
    row("and finishes when it is lit again: three charcoal in the output", out.items.filter((e) => e.id === "charcoal").reduce((k, e) => k + e.count, 0) === 3, `output holds ${out.items.map((e) => `${e.id} x${e.count}`).join(", ") || "nothing"}`);

    // The charcoal lights the forge: fed to it, it burns, and a bar is smelted from ore.
    const forge = props.find((q) => q.sprite === "forge") || null;
    if (forge) {
      const fuel0 = { lit: forge.fire.lit, fuel: forge.fire.fuel };
      row("charcoal is the forge's fuel (it takes a piece as it takes nothing else)", forge.fire.fuelItem === "charcoal" && G.map.feedFire(forge) === true && forge.fire.fuel > fuel0.fuel, `fuel ${fuel0.fuel} to ${forge.fire.fuel}`);
      Object.assign(forge.fire, fuel0);
      // The smelt itself: the forge lit (a piece of charcoal burning), two ore in a chest beside it, an iron bar in its output after the recipe's seconds.
      const at = map.nearestWalkable(forge.tile[0], forge.tile[1] + 1, (x, y) => !!map.tileAt(x, y).prop);
      G.teleport(at[0], at[1]);
      step();
      const cat = map.nearestWalkable(forge.tile[0] - 1, forge.tile[1] + 1, (x, y) => !!map.tileAt(x, y).prop || (x === Math.round(p.gx) && y === Math.round(p.gy)));
      const chest = map.createProp({ sprite: "chest", tile: cat });
      map.placeProp(chest, cat[0], cat[1]);
      made.push(chest);
      chest.bag = G.inventory.createBag(4, 3, "chest");
      chest.searched = true;
      G.grid.add(chest.bag, "iron_ore", 2);
      forge.fire.lit = true;
      forge.fire.fuel = 2;
      const made1 = G.verbs.run("craft", G.world.world, p, { prop: forge.id }, { recipe: "iron_bar", count: 1 });
      step(Math.ceil(G.stations.recipe("iron_bar").seconds * 60) + 4);
      const bars = G.stations.outputOf(forge).items.filter((e) => e.id === "iron_bar").reduce((n, e) => n + e.count, 0);
      row("with the forge lit, two ore in a chest beside it smelt to an iron bar", made1.ok && bars === 1 && !chest.bag.items.some((e) => e.id === "iron_ore"), `${made1.ok ? "" : made1.reason + "; "}${bars} bar in the output`);
      G.stations.outputOf(forge).items = [];
      forge.queue = [];
      Object.assign(forge.fire, fuel0);
    } else row("the forge", false, "no forge in the loaded chunks");
    clamp.queue = [];
    out.items = [];
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message });
  } finally {
    if (G.player) Object.assign(G.player, needs0); // the needs and the health its steps and bites took
    for (const q of made) map.removeProp(q);
    bag.items.splice(0, bag.items.length, ...bag0);
    G.teleport(saved.gx, saved.gy);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
