// The chicken coop and the beehive in the valley (#333). From the console, on a tab with `?nosave`:
//   await __game.check("coop")
// The coop is a drawn container with a loot table of its own (coop, a placeholder), two tiles along y or, mirrored, along x, no dev box; the valley has coops and hives at the home and at
// Hollow Farm; the coop's menu offers Search, which opens its 3 by 2 grid; Take All, sent the way a guest's button sends it, moves what is in it to the bag and empties it. (The hive's sway
// is `check("sway")`'s.) The coop's bag, the player's bag, and anything made are put back.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const counts0 = bag0.map((e) => [e, e.count]);
  const meAt = [me.gx, me.gy];
  const wasPaused = G.loop.isPaused();
  const { performItemCommand } = await import("/src/ui/inventory-actions.js");
  const made = [];
  const role = G.net.status().role;
  let coop = null;
  let coop0 = null;
  try {
    G.loop.setPaused(true);
    const coops = [...map.allProps()].filter((p) => p.sprite === "chicken_coop");
    const hives = [...map.allProps()].filter((p) => p.sprite === "beehive");
    const def = G.assets.getDef("chicken_coop");
    row("the coop is a drawn container with a loot table of its own, and the hive is drawn, not a dev box", !def.placeholder && !!def.container && def.container.loot === "coop" && !G.assets.getDef("beehive").placeholder, `coop container ${JSON.stringify(def.container)}, hive ${G.assets.getDef("beehive").placeholder ? "dev box" : "drawn"}`);
    const home = coops.find((c) => c.tile[0] >= 98 && c.tile[0] <= 114 && c.tile[1] >= 212 && c.tile[1] <= 224);
    const farm = coops.find((c) => c.tile[0] >= 56 && c.tile[0] <= 100 && c.tile[1] >= 228 && c.tile[1] <= 241);
    row("the valley has a coop at the home and one at Hollow Farm, and at least five hives (two at the home, three at the farm, three at the manor)", !!home && !!farm && hives.length >= 8, `${coops.length} coops (home ${home ? home.tile : "none"}, farm ${farm ? farm.tile : "none"}), ${hives.length} hives`);
    coop = home || coops[0];
    if (!coop) throw new Error("no coop on the map");
    row("the coop is two tiles along y, and its sheet is the drawing (a frame, not the box)", coop.tiles.length === 2 && coop.tiles[0][0] === coop.tiles[1][0], `${JSON.stringify(coop.tiles)}`);
    if (role === "guest") {
      // A guest reads the replica: the coop's menu, built from what it has, offers the same Search, named by an address the host can rebuild.
      G.teleport(coop.tile[0], coop.tile[1] - 2);
      map.ensureAround(coop.tile[0], coop.tile[1], 3);
      const a = G.interact.actionsForTarget({ kind: "prop", id: coop.id }, me).find((q) => q.kind === "container");
      row("on a guest the coop's menu offers Search or Open chicken coop, by an address the host can rebuild", !!a && /^(Search|Open) chicken coop$/.test(a.label), a ? a.label : "no container action");
      throw Object.assign(new Error("guest done"), { guestDone: true });
    }
    // Search and Take All.
    coop0 = { bag: coop.bag, searched: coop.searched };
    G.teleport(coop.tile[0], coop.tile[1] - 2);
    map.ensureAround(coop.tile[0], coop.tile[1], 3);
    G.loop.advance(1 / 60);
    coop.bag = null;
    coop.searched = false;
    const search = G.interact.actionsForTarget({ kind: "prop", id: coop.id }, me).find((a) => a.kind === "container");
    row("its menu offers Search chicken coop", !!search && search.label === "Search chicken coop", search ? search.label : "no container action");
    // Searching rolls its table into a 3 by 2 grid; then known items stand in it so Take All has something to carry whatever the dice gave.
    search.perform();
    row("Search opens a 3 by 2 grid and marks it searched", !!coop.bag && coop.bag.cols === 3 && coop.bag.rows === 2 && coop.searched === true, coop.bag ? `${coop.bag.cols} by ${coop.bag.rows}, ${coop.bag.items.length} items rolled` : "no bag");
    coop.bag.items.length = 0;
    bag.items.length = 0;
    G.grid.add(coop.bag, "rag", 2);
    G.grid.add(coop.bag, "stick", 1);
    const before = coop.bag.items.reduce((n, e) => n + (e.count || 1), 0);
    const ok = performItemCommand(me, { op: "takeall", bag: { propId: coop.id } });
    const got = bag.items.reduce((n, e) => n + (e.count || 1), 0);
    row("Take All, as a guest's button sends it, moves what is in the coop to the bag and empties it", before === 3 && got === 3 && coop.bag.items.length === 0 && ok !== false, `${before} in the coop, ${got} in the bag, ${coop.bag.items.length} left`);
    // The x facing: a coop along x on bare grass has its two tiles along x and a sheet.
    let at = null;
    for (let dy = -14; dy <= 14 && !at; dy++) for (let dx = -14; dx <= 14 && !at; dx++) {
      const x = Math.round(meAt[0]) + dx;
      const y = Math.round(meAt[1]) + dy;
      let free = true;
      for (let ay = -1; ay <= 1 && free; ay++) for (let ax = -1; ax <= 2 && free; ax++) { const t = map.peekTile(x + ax, y + ay); free = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w; }
      if (free) at = [x, y];
    }
    if (at) {
      const cx = map.createProp({ sprite: "chicken_coop", tile: at, footprint: [2, 1] });
      map.placeProp(cx, at[0], at[1]);
      made.push(cx);
      const sheet = G.assets.getSheet("chicken_coop", 2);
      row("a coop along x has its two tiles along x (the mirrored drawing)", cx.tiles.length === 2 && cx.tiles[0][1] === cx.tiles[1][1] && !!sheet && Object.keys(sheet.frames).length >= 2, `${JSON.stringify(cx.tiles)}, ${sheet ? Object.keys(sheet.frames).length : 0} frames`);
    } else row("a coop along x has its two tiles along x (the mirrored drawing)", false, "no bare grass found");
  } catch (e) {
    if (!e.guestDone) rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const p of made) { const t = map.propById(p.id); if (t) map.removeProp(t); }
    if (coop && coop0) { coop.bag = coop0.bag; coop.searched = coop0.searched; }
    bag.items.splice(0, bag.items.length, ...bag0);
    for (const [e, n] of counts0) e.count = n;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
