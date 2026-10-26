// Reach (#208): every player action meets one test, distance and a clear line (src/reach.js; #206's ruling: over a fence or through an open window is in
// reach, a wall or a shut door or shutter is not, which keeps a sealed room a cell, #147). From the console, on a tab with `?nosave`:
//   await __game.check("reach")
// On a patch of bare grass it stands a chest, a workbench, a tree, and a villager one tile beyond a wall and tries each: a menu action on the chest, a craft's
// ingredients and its station, a chop, a poke. Then the wall becomes a fence (sight passes) and the same things are allowed. Everything it builds is taken
// away, and the bag, hands, and place are put back.

export async function run(game) {
  const G = game;
  const panelOpen0 = G.panel.isOpen(); // a Search or a container opens the bag: closed again in the finally if it was (the order-independence of the checks, check("all"))
  const needs0 = (({ hunger, thirst, tired, hp, bleed, sick, infection }) => ({ hunger, thirst, tired, hp, bleed, sick, infection }))(G.player); // put back in the finally: its steps drain them and the dead may bite (the order-independence of the checks, check("all"))
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const saved = { gx: me.gx, gy: me.gy };
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const counts0 = bag0.map((e) => [e, e.count]);
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const wasPaused = G.loop.isPaused();
  const S = G.game.state;
  const { createVillager } = await import("/src/entities/villager.js");
  const reach = await import("/src/reach.js");
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const made = [];
  const restore = [];
  let opened = 0;
  restore.push(G.events.on("containerOpened", () => { opened++; })); // a chest that opens at once (already searched) shows as this event, not as a timed action
  try {
    G.loop.setPaused(true);
    let at = null;
    map.ensureAround(me.gx, me.gy, 3);
    for (let dy = -14; dy <= 14 && !at; dy++) for (let dx = -14; dx <= 14 && !at; dx++) {
      const x = Math.round(me.gx) + dx;
      const y = Math.round(me.gy) + dy;
      let ok = true;
      for (let ay = -2; ay <= 4 && ok; ay++) for (let ax = -2; ax <= 4 && ok; ax++) { const t = map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w && map.isWalkableTile(x + ax, y + ay); }
      if (ok) at = [x, y];
    }
    if (!at) throw new Error("no bare grass for the check");
    const [x, y] = at;
    const place = (sprite, tile, extra = {}) => { const q = map.createProp({ sprite, tile, ...extra }); map.placeProp(q, tile[0], tile[1]); made.push(q); return q; };
    const chest = place("chest", [x + 1, y]);
    chest.bag = G.inventory.createBag(4, 3, "chest");
    chest.searched = true;
    G.grid.add(chest.bag, "plank", 4);
    const bench = place("workbench", [x + 1, y + 2], { footprint: [2, 1] });
    const tree = place("tree_oak_m", [x + 1, y + 3]);
    const vil = createVillager(x + 1, y - 1, { id: "reach_vil", name: "Reach", line: "Hey!" });
    S.villagers.push(vil);
    restore.push(() => { const i = S.villagers.indexOf(vil); if (i >= 0) S.villagers.splice(i, 1); });
    me.hands.main = G.items.makeEntry("hatchet", 1);
    me.hands.off = null;
    G.inventory.stow(me, G.items.makeEntry("hammer", 1));
    const wall = (sprite) => { for (let dy = -1; dy <= 3; dy++) map.buildWall(x + 1, y + dy, "w", "wall", sprite); };
    const unwall = () => { for (let dy = -1; dy <= 3; dy++) map.destroyWall(x + 1, y + dy, "w"); };
    restore.push(unwall);
    const stand = (dy) => { G.teleport(x + 0.1, y + dy); me.auto = null; me.action = null; step(); };
    const cancel = () => { me.action = null; me.auto = null; };
    const labelOf = (a) => G.interact.actionsForTarget({ kind: "prop", id: chest.id }, me).find((q) => /^(Search|Open)/.test(q.label));

    // The helper itself.
    wall("wall_wood");
    stand(0);
    row("the helper: a wall between is a wall in the way, the same tiles beside it are in reach, and far is far", reach.pointReachProblem(me, x + 1, y, 2.6) === reach.WALL_IN_THE_WAY && reach.pointReachProblem(me, x, y + 1, 2.6) === null && reach.pointReachProblem(me, x + 9, y, 2.6) === reach.TOO_FAR, `${reach.pointReachProblem(me, x + 1, y, 2.6)} | ${reach.pointReachProblem(me, x, y + 1, 2.6)}`);

    // A menu action: the chest's Search or Open, run by its label as a guest's command is, from the near side of a wall.
    const a = labelOf();
    G.interact.performByLabel(me, { kind: "prop", id: chest.id }, a.label);
    const startedAtOnce = !!me.action || opened > 0;
    const walking = !!me.auto;
    for (let i = 0; i < 900 && opened === 0 && (me.auto || me.action); i++) step();
    row("a chest one tile beyond a wall does not open from here, and the player walks round the wall and opens it", !startedAtOnce && walking && opened > 0, `${startedAtOnce ? "started at once" : walking ? "walking round" : "no walk"}; opened ${opened}; now at ${me.gx.toFixed(1)},${me.gy.toFixed(1)}`);
    cancel();

    // A bracket on the far side of its wall (side -1) is reached from its own side only.
    const torch = G.items.makeEntry("torch", 1);
    G.inventory.stow(me, torch);
    const bracket = map.addBracket(x + 1, y - 1, "w", -1, false);
    restore.push(() => { map.brackets().delete(bracket); delete bracket.wall.bracket; });
    const bTarget = { kind: "bracket", tx: bracket.tx, ty: bracket.ty, edge: bracket.edge };
    const holds = () => map.holderHas({ kind: "bracket", bracket });
    const mountTiles = G.interact.actionsForTarget(bTarget, me).find((q) => /^Mount the torch/.test(q.label));
    stand(-1);
    G.interact.performByLabel(me, bTarget, "Mount the torch");
    const mountedOwnSide = holds();
    if (mountedOwnSide) map.setHolder({ kind: "bracket", bracket }, false);
    G.teleport(x + 2.1, y - 1);
    me.auto = null;
    step();
    G.interact.performByLabel(me, bTarget, "Mount the torch");
    const mountedBehind = holds();
    row("a bracket facing out of the wall (side -1) is reached from its own side and not through its wall", !!mountTiles && mountedOwnSide && !mountedBehind, `own side ${mountedOwnSide}, from behind the wall ${mountedBehind}`);
    if (mountedBehind) map.setHolder({ kind: "bracket", bracket }, false);
    cancel();

    // Remove on a made prop and putting down a carried one need a clear line as well (a wall in the way is refused; Primary's ruling on #227).
    const mine = place("chest", [x + 1, y + 1]);
    mine.made = true; // players made it, so X may take it away (stations.js)
    stand(0);
    G.placement.performPlacement(me, { kind: "remove", target: { type: "prop", id: mine.id } });
    const stoodThrough = !!map.propById(mine.id);
    const carried = map.createProp({ sprite: "chest", tile: [x + 2, y + 1], made: true });
    made.push(carried);
    me.carrying = carried;
    G.placement.performPlacement(me, { kind: "prop", tx: x + 2, ty: y + 1, turns: 0 });
    const heldThrough = me.carrying === carried;
    row("Remove on a made prop and putting down a carried prop are refused through a wall", stoodThrough && heldThrough, `the chest stood: ${stoodThrough}; still carried: ${heldThrough}`);
    me.carrying = null;

    // A craft: the station behind the wall refuses, and its neighbour's chest is no source.
    stand(2);
    const rec = G.stations.recipe("table");
    const can = G.stations.canMake(me, bench, rec, 1);
    row("a workbench beyond a wall refuses a craft with the wall named", /wall/.test(String(can)), String(can));
    G.grid.add(bag, "plank", 2);
    const srcs = G.stations.sources(me, { ...bench, bag: null, output: null });
    row("a chest of planks beyond the wall is no ingredient source (a craft's reach stops at the wall)", !srcs.includes(chest.bag), `${srcs.length} bags in reach`);

    // A chop: the hatchet in hand, a tree beyond the wall.
    stand(3);
    const chop = G.verbs.run("chop", G.world, me, { prop: tree.id });
    row("a tree beyond a wall is not chopped, the wall named", !chop.ok && /wall/.test(chop.reason), String(chop.reason));

    // A poke: a villager beyond the wall hears nothing of it.
    stand(-1);
    const poked = G.interact.pokeVillagerFromGuest(me, vil.id);
    row("a villager beyond a wall is not poked", poked === false, String(poked));

    // The same, over a fence (sight passes).
    unwall();
    wall("wall_fence");
    stand(0);
    opened = 0;
    G.interact.performByLabel(me, { kind: "prop", id: chest.id }, labelOf().label);
    row("over a fence the chest's action starts (it opens)", !!me.action || opened > 0, me.action ? "started" : `${opened} opened`);
    cancel();
    stand(2);
    const canF = G.stations.canMake(me, bench, rec, 1);
    const srcF = G.stations.sources(me, { ...bench, bag: null, output: null });
    row("over a fence the workbench works and the chest's planks are an ingredient source", canF === true && srcF.includes(chest.bag), `${canF}; ${srcF.length} bags`);
    stand(3);
    const chopF = G.verbs.run("chop", G.world, me, { prop: tree.id });
    row("over a fence the tree is chopped", chopF.ok || !/wall/.test(String(chopF.reason)), String(chopF.reason || "ok"));
    stand(-1);
    row("over a fence the villager is poked", G.interact.pokeVillagerFromGuest(me, vil.id) === true, "poked");
    stand(0);
    me.carrying = carried;
    G.placement.performPlacement(me, { kind: "prop", tx: x + 2, ty: y + 1, turns: 0 });
    const putOver = !me.carrying;
    G.placement.performPlacement(me, { kind: "remove", target: { type: "prop", id: mine.id } });
    row("over a fence a prop is put down and a made prop is removed", putOver && !map.propById(mine.id), `put down ${putOver}; the other chest gone ${!map.propById(mine.id)}`);
    me.carrying = null;
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    if (!panelOpen0) G.panel.closeAll();
    if (G.player) Object.assign(G.player, needs0); // the needs and the health its steps and bites took
    for (const r of restore.reverse()) if (typeof r === "function") r();
    for (const q of made) { const t = map.propById(q.id); if (t) { t.queue = []; if (t.output) t.output.items = []; map.removeProp(t); } }
    me.action = null;
    me.auto = null;
    bag.items.splice(0, bag.items.length, ...bag0);
    for (const [e, n] of counts0) e.count = n;
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    G.teleport(saved.gx, saved.gy);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
