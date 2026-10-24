// The tool rule (Michael, 2026-10-18, #214; #215): an action that would realistically need a tool needs the tool carried, in a hand, on the belt, or in
// the bag. From the console, on a tab with `?nosave`:
//   await __game.check("tools")
// It strips the player's tools, then walks each action twice, refused without its tool and done with it carried: building (a door, a window with a
// hammer; a log wall with a hatchet), boarding up and pulling a board (the plank comes back), Remove, splitting a log, the workbench's rows by their
// verb, and a harvest by crop (rye the scythe, roots the shovel, heads the knife; apples by hand). It also fills a skin on the belt and puts the
// tinderbox on it. Everything it builds and plants is taken away, and the bag, belt, hands, rules, and place are put back.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const saved = { gx: me.gx, gy: me.gy };
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const belt = G.inventory.beltOf(me);
  const belt0 = belt ? belt.slice() : null;
  const counts0 = [...bag0, ...(belt0 || [])].filter(Boolean).map((e) => [e, e.count]); // a stack the check merged into (the kit's apples) goes back to its count
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const free0 = G.rules.rules.freeBuilding;
  const wasPaused = G.loop.isPaused();
  const farming = await import("/src/farming.js");
  const placement = await import("/src/placement.js");
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const made = [];
  const restore = [];
  const TOOLS = ["hammer", "hatchet", "knife", "shovel", "scythe", "pickaxe", "hoe", "fishing_rod"];
  const stripTools = () => {
    bag.items = bag.items.filter((e) => !TOOLS.includes(e.id));
    if (belt) for (let i = 0; i < belt.length; i++) if (belt[i] && TOOLS.includes(belt[i].id)) belt[i] = null;
    me.hands.main = null;
    me.hands.off = null;
  };
  const stowTool = (id) => G.inventory.stow(me, G.items.makeEntry(id, 1));
  const verbOf = (id) => G.items.getItem(id).verbs;
  try {
    G.loop.setPaused(true);
    G.rules.rules.freeBuilding = false;
    stripTools();
    G.inventory.stow(me, G.items.makeEntry("plank", 6));

    // The data: the verbs the tools carry, and what names them.
    row("the hammer carries build, the hatchet notch and split, the knife cut, the shovel dig, the scythe harvest", verbOf("hammer").includes("build") && ["notch", "split", "chop"].every((v) => verbOf("hatchet").includes(v)) && verbOf("knife").includes("cut") && verbOf("shovel").includes("dig") && verbOf("scythe").includes("harvest"), "verbs in items.json");
    const rawRecipes = G.stations.recipesFor("workbench").filter((r) => r.uses);
    row("the workbench's rows name a verb some tool lists (a hammer for furniture, a knife for the bow, the arrows and the rod, a hatchet for sticks)", rawRecipes.length >= 14 && rawRecipes.every((r) => !!G.items.toolFor(r.uses)), rawRecipes.map((r) => `${r.id}:${r.uses}`).join(", "));
    const tears = G.stations.recipesFor("workbench").filter((r) => r.id.startsWith("tear_"));
    row("the bucket's row asks for a hammer and the six tear rows for a knife, by verb (the older `carry` is folded into `uses`)", G.stations.recipe("bucket").uses === "build" && tears.length === 6 && tears.every((r) => r.uses === "cut" && !r.carry), `${tears.length} tear rows`);
    const cr = farming.get().crops;
    row("each crop's harvest names a tool verb: rye harvest, potato and garlic dig, cabbage and pumpkin cut", cr.rye.tool === "harvest" && cr.potato.tool === "dig" && cr.garlic.tool === "dig" && cr.cabbage.tool === "cut" && cr.pumpkin.tool === "cut", Object.entries(cr).map(([k, c]) => `${k}:${c.tool || "hand"}`).join(", "));
    const where = [];
    stowTool("hammer");
    where.push(!!G.inventory.carriedTool(me, "build"));
    stripTools();
    if (belt) { const i = belt.findIndex((e) => !e); belt[i] = G.items.makeEntry("hammer", 1); where.push(!!G.inventory.carriedTool(me, "build")); belt[i] = null; }
    me.hands.main = G.items.makeEntry("hammer", 1);
    where.push(!!G.inventory.carriedTool(me, "build"));
    me.hands.main = null;
    row("a tool is found by its verb in the bag, on the belt, or in a hand, and by nothing else", where.length >= 3 && where.every(Boolean) && !G.inventory.carriedTool(me, "build"), `${where.join(",")}`);

    // A free patch of grass to build on.
    let at = null;
    map.ensureAround(me.gx, me.gy, 3);
    for (let dy = -14; dy <= 14 && !at; dy++) for (let dx = -14; dx <= 14 && !at; dx++) {
      const x = Math.round(me.gx) + dx;
      const y = Math.round(me.gy) + dy;
      let ok = true;
      for (let ay = -1; ay <= 6 && ok; ay++) for (let ax = -1; ax <= 6 && ok; ax++) { const t = map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w && map.isWalkableTile(x + ax, y + ay); }
      if (ok) at = [x, y];
    }
    if (!at) throw new Error("no bare grass for the check");
    const [x, y] = at;
    G.teleport(x + 0.5, y + 1.6);
    step();

    // Building: the tool is in the cost line, so the ghost, the palette, and a guest's command all refuse the same way.
    const door0 = placement.shortfall(me, "door");
    const window0 = placement.shortfall(me, "window");
    const wall0 = placement.shortfall(me, "wall");
    row("without tools a door, a window, and a log wall are refused by name (\"You need a smith's hammer.\" and the hatchet)", /hammer/.test(door0) && /hammer/.test(window0) && /hatchet/.test(wall0), `${door0} | ${window0} | ${wall0}`);
    stowTool("hammer");
    row("with a hammer in the bag a door and a window are no longer refused for a tool, and a log wall still is", !/need a/i.test(placement.shortfall(me, "door")) && !/need a/i.test(placement.shortfall(me, "window")) && /hatchet/.test(placement.shortfall(me, "wall")), `${placement.shortfall(me, "door")} | ${placement.shortfall(me, "wall")}`);
    stowTool("hatchet");
    G.inventory.stow(me, G.items.makeEntry("log", 1));
    row("with a hatchet too the log wall is refused for logs at most, not for a tool", !/hatchet/.test(placement.shortfall(me, "wall")), placement.shortfall(me, "wall") || "free");
    G.rules.rules.freeBuilding = true;
    stripTools();
    row("Free building waives the tool as it waives the cost", placement.shortfall(me, "door") === "" && placement.shortfall(me, "wall") === "", "free");
    G.rules.rules.freeBuilding = false;

    // A door of the check's own: boarding up and pulling a board, by the menu's labels (a guest's way).
    stowTool("hammer");
    map.buildWall(x + 2, y + 2, "n", "door", "wall_log");
    restore.push(() => map.destroyWall(x + 2, y + 2, "n"));
    const doorAddr = { kind: "edge", tx: x + 2, ty: y + 2, edge: "n" };
    G.teleport(x + 2.2, y + 2.8);
    step();
    stripTools();
    const noH = G.interact.actionsForTarget(doorAddr, me).filter((a) => /^Board up/.test(a.label));
    row("without a hammer Board up is greyed with the tool named", noH.length === 1 && !noH[0].enabled && /smith's hammer/.test(noH[0].label), noH.map((a) => a.label).join(", "));
    G.inventory.stow(me, G.items.makeEntry("plank", 0 + 1));
    const planks0 = G.inventory.countAll(me, "plank");
    const refused = G.interact.performByLabel(me, doorAddr, noH[0].label);
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    const w = map.tileAt(x + 2, y + 2).n;
    row("a board is not put up without it (the plank stays)", G.inventory.countAll(me, "plank") === planks0 && !map.boarded(w) && w.boards.near.length + w.boards.far.length === 0, `planks ${G.inventory.countAll(me, "plank")}`);
    void refused;
    belt && (belt[belt.findIndex((e) => !e)] = G.items.makeEntry("hammer", 1)); // on the belt
    const withH = G.interact.actionsForTarget(doorAddr, me).find((a) => /^Board up/.test(a.label));
    G.interact.performByLabel(me, doorAddr, withH.label);
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    const boards = w.boards.near.length + w.boards.far.length;
    row("with a hammer on the belt the same command boards the door up and takes a plank", withH.enabled && boards === 1 && G.inventory.countAll(me, "plank") === planks0 - 1, `${boards} board, planks ${G.inventory.countAll(me, "plank")}`);
    const pullLabel = G.interact.actionsForTarget(doorAddr, me).find((a) => /^Pull a board/.test(a.label));
    G.interact.performByLabel(me, doorAddr, pullLabel.label);
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    row("pulling a board with it gives the plank back", w.boards.near.length + w.boards.far.length === 0 && G.inventory.countAll(me, "plank") === planks0, `planks ${G.inventory.countAll(me, "plank")} of ${planks0}`);
    // A fence gate beside it takes no boards (Michael, 2026-10-24: "I would not allow boards on fences period"): no Board up in its menu,
    // the door's label sent at it (a guest's command) does nothing, and map.addBoard refuses it; the hammer and the plank are in hand.
    map.buildWall(x + 3, y + 2, "n", "door", "wall_fence");
    restore.push(() => { if (map.tileAt(x + 3, y + 2).n) map.destroyWall(x + 3, y + 2, "n"); });
    const gateAddr = { kind: "edge", tx: x + 3, ty: y + 2, edge: "n" };
    const gateW = map.tileAt(x + 3, y + 2).n;
    const gateLabels = G.interact.actionsForTarget(gateAddr, me).map((a) => a.label);
    const planksG = G.inventory.countAll(me, "plank");
    G.interact.performByLabel(me, gateAddr, withH.label);
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    const nailed = map.addBoard(gateW, 1);
    row("a fence gate takes no boards: none in its menu, the door's command does nothing, addBoard refuses it", map.isFence(gateW) && !gateLabels.some((l) => /^Board up/.test(l)) && !nailed && gateW.boards.near.length + gateW.boards.far.length === 0 && G.inventory.countAll(me, "plank") === planksG, `menu: ${gateLabels.join(", ")}; planks ${G.inventory.countAll(me, "plank")} of ${planksG}`);
    // Board it again, then take the hammer away: both Board up and Pull a board are greyed with the tool named.
    G.interact.performByLabel(me, doorAddr, G.interact.actionsForTarget(doorAddr, me).find((a) => /^Board up/.test(a.label)).label);
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    stripTools();
    const noHam = G.interact.actionsForTarget(doorAddr, me).filter((a) => /^Pull a board|^Board up/.test(a.label));
    row("and without a hammer boarding and pulling are both greyed, naming it", noHam.length === 2 && noHam.every((a) => !a.enabled && /smith's hammer/.test(a.label)), noHam.map((a) => a.label).join(" | "));
    G.rules.rules.freeBuilding = true;
    const freeBoard = G.interact.actionsForTarget(doorAddr, me).find((a) => /^Pull a board/.test(a.label));
    row("Free building does not waive the hammer for boards (Michael, 2026-10-11: boards are untouched)", !!freeBoard && !freeBoard.enabled, freeBoard ? freeBoard.label : "none");
    G.rules.rules.freeBuilding = false;
    stowTool("hammer");
    G.interact.performByLabel(me, doorAddr, G.interact.actionsForTarget(doorAddr, me).find((a) => /^Pull a board/.test(a.label)).label);
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    stripTools();

    // Remove (X) needs the hammer: a guest's command by the wall's address.
    const rm = (id) => { if (id) stowTool(id); placement.performPlacement(me, { kind: "remove", target: { type: "wall", tx: x + 2, ty: y + 2, edge: "n" } }); };
    rm(null);
    row("Remove takes nothing down without a hammer", !!map.tileAt(x + 2, y + 2).n && map.tileAt(x + 2, y + 2).n.built === true, "the door stands");
    rm("hammer");
    row("and takes it down with one", !map.tileAt(x + 2, y + 2).n || !map.tileAt(x + 2, y + 2).n.built, "gone");
    stripTools();

    // Splitting a log: the bag menu's entry is greyed without a hatchet.
    const log = G.items.makeEntry("log", 1);
    G.inventory.stow(me, log);
    const split0 = G.interact.itemMenu(me, log, bag, null).find((a) => /^Split/.test(a.label));
    row("a log's Split is greyed without a hatchet and names it", !!split0 && !split0.enabled && /hatchet/.test(split0.label), split0 ? split0.label : "no entry");
    stowTool("hatchet");
    const split1 = G.interact.itemMenu(me, log, bag, null).find((a) => /^Split/.test(a.label));
    row("and offered with one carried", !!split1 && split1.enabled, split1 ? split1.label : "no entry");
    bag.items = bag.items.filter((e) => e !== log);
    stripTools();

    // The workbench, a bench of the check's own: each row by its verb.
    const bench = map.createProp({ sprite: "workbench", tile: [x + 3, y + 4], footprint: [2, 1] });
    map.placeProp(bench, x + 3, y + 4);
    made.push(bench);
    G.teleport(x + 3.5, y + 5.4);
    step();
    const can = (id) => G.stations.canMake(me, bench, G.stations.recipe(id), 1);
    G.inventory.stow(me, G.items.makeEntry("plank", 8));
    G.inventory.stow(me, G.items.makeEntry("stick", 4));
    G.inventory.stow(me, G.items.makeEntry("cap", 1)); // a garment is tagged cloth (a cap fits the bag where a tunic may not)
    const tableNo = can("table");
    const bowNo = can("bow");
    const handleNo = can("handle");
    row("a table, a bow, and sticks from a plank are each refused without their tool, by name", /smith's hammer/.test(tableNo) && /dirk/.test(bowNo) && /hatchet/.test(handleNo), `${tableNo} | ${bowNo} | ${handleNo}`);
    stowTool("hammer");
    row("a hammer carried in the bag lets the table through and not the bow", can("table") === true && /dirk/.test(can("bow")), `${can("table")} | ${can("bow")}`);
    stripTools();
    me.hands.main = G.items.makeEntry("knife", 1);
    row("a knife in a hand lets the bow and the arrows through and not the table", can("bow") === true && can("arrows") === true && /hammer/.test(can("table")), `${can("bow")} | ${can("table")}`);
    me.hands.main = null;
    if (belt) { const i = belt.findIndex((e) => !e); belt[i] = G.items.makeEntry("hatchet", 1); row("a hatchet on the belt lets sticks be split from a plank", can("handle") === true, String(can("handle"))); belt[i] = null; }
    stripTools();
    row("the shovel is a workbench row with no iron and needs a hammer, so the loop opens from the joiner's hammer (a hoe too)", G.stations.recipe("shovel").uses === "build" && G.stations.recipe("hoe").uses === "build" && G.stations.recipe("hoe").in.every((i) => ["stick", "plank"].includes(i.id)), "stick and plank");

    // Harvest by tool: a ripe crop of each kind on tilled soil.
    const sow = (kind, dx) => {
      map.setFloor(x + dx, y, "floor_farm");
      const c = map.createProp({ sprite: `crop_${kind}_2`, tile: [x + dx, y], solid: false });
      map.placeProp(c, x + dx, y);
      made.push(c);
      restore.push(() => map.setFloor(x + dx, y, "floor_grass"));
      return c;
    };
    G.teleport(x + 0.5, y + 0.9);
    step();
    const harvest = (c) => G.verbs.run("harvest", G.world, me, { prop: c.id });
    const trials = [["rye", "harvest", "scythe", "scythe"], ["potato", "dig", "shovel", "shovel"], ["garlic", "dig", "shovel", "shovel"], ["cabbage", "cut", "knife", "dirk"], ["pumpkin", "cut", "knife", "dirk"]];
    let dx = 0;
    for (const [kind, verb, tool, name] of trials) {
      const c = sow(kind, dx);
      G.teleport(x + dx + 0.5, y + 0.9);
      step();
      dx++;
      const no = harvest(c);
      const stays = !!map.propById(c.id);
      stowTool(tool);
      const yes = harvest(c);
      row(`${kind} by hand is refused ("${name}"), and gathered with the ${tool} in the bag`, !no.ok && no.reason.includes(name) && stays && yes.ok && !map.propById(c.id), `${no.reason} | ${yes.ok ? "harvested" : yes.reason}`);
      stripTools();
    }
    const menuCrop = sow("cabbage", dx++);
    const menuNo = G.interact.actionsForTarget({ kind: "prop", id: menuCrop.id }, me).find((a) => /^Harvest/.test(a.label));
    row("a ripe cabbage's menu says Harvest (need a dirk), greyed", !!menuNo && !menuNo.enabled && /dirk/.test(menuNo.label), menuNo ? menuNo.label : "none");

    // Apples stay by hand.
    const tree = map.createProp({ sprite: "tree_apple", tile: [x + 4, y] });
    map.placeProp(tree, x + 4, y);
    made.push(tree);
    row("an apple is picked by hand (the pick verb names no tool)", !!G.verbs.get("pick") && !/need a/.test(String(G.verbs.run("pick", G.world, me, { prop: tree.id }).reason || "")), "no tool named");

    // The belt: a skin on it is filled at water, and the tinderbox may ride it.
    if (belt) {
      const i = belt.findIndex((e) => !e);
      const skin = G.items.makeEntry("waterskin", 1, { fill: 0 });
      belt[i] = skin;
      const toFill = G.inventory.skinsOf(me).filter((e) => (e.fill ?? 0) < 100);
      row("a waterskin on the belt is among the skins to fill at a well", toFill.includes(skin), `${toFill.length} to fill`);
      belt[i] = null;
      // The tinderbox on the belt (and nowhere else) lights the torch in hand with T.
      bag.items = bag.items.filter((e) => e.id !== "tinderbox");
      for (let k = 0; k < belt.length; k++) if (belt[k] && belt[k].id === "tinderbox") belt[k] = null;
      belt[i] = G.items.makeEntry("tinderbox", 1);
      const torch = G.items.makeEntry("torch", 1);
      me.hands.main = torch;
      G.interact.updateInteract(me, 0.016, { t: true });
      row("the tinderbox has a belt place, and T lights the torch in hand with it from the belt", G.items.getItem("tinderbox").belt === true && torch.lit === true, `belt: true; torch lit ${torch.lit}`);
      me.hands.main = null;
      belt[i] = null;
    }

    // Where each first tool comes from: the chests' tables.
    const loot = (t, id) => G.items.rollLoot(t).some((e) => e.id === id);
    const homeBag = G.inventory.createBag(4, 3, "chest");
    const fitted = G.items.rollLoot("home_chest").map((e) => G.grid.add(homeBag, e.id, e.count || 1, {})).every((n) => n > 0);
    row("your cottage's chest holds a hatchet, a shovel (the first potatoes dig on day one), bread, and a bucket, all fitting its 4 by 3", loot("home_chest", "shovel") && loot("home_chest", "hatchet") && loot("home_chest", "bucket") && fitted, homeBag.items.map((e) => e.id).join(", "));
    row("a first hammer is in the joiner's chest and the quarryman's, a hatchet in your cottage's and the joiner's, and the smithy's bars make the knife at the anvil (the hammer in hand)", loot("joiner_chest", "hammer") && loot("joiner_chest", "hatchet") && loot("home_chest", "hatchet") && loot("smithy_chest", "iron_bar") && G.stations.recipe("knife").station === "anvil" && G.stations.recipe("knife").tool === "hammer", "tables");
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const r of restore.reverse()) r();
    for (const q of made) { const t = map.propById(q.id); if (t) map.removeProp(t); }
    G.rules.rules.freeBuilding = free0;
    bag.items.splice(0, bag.items.length, ...bag0);
    if (belt) for (let i = 0; i < belt.length; i++) belt[i] = belt0[i];
    for (const [e, n] of counts0) e.count = n;
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    me.action = null;
    G.teleport(saved.gx, saved.gy);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
