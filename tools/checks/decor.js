// Rugs (#327; src/rugs.js, render/rugs.js). From the console, on a tab with `?nosave`:
//   await __game.check("decor")
// A rug is an item (decor, rolled up, 1 by 4, with its icon and its card: "Place: lay on the floor") that Place lays from the bag as a flat 2 by 3 prop, y or x; a laid rug does not
// block a step, furniture may stand on it or be set down over it, it is drawn before everything that stands (the scene's order), and two rugs never overlap nor one lie across a wall;
// Pick up gives back the item and is refused while furniture stands on it ("Move the chest off it first."); it survives a save and restore; a guest's Place and Pick up are the
// commands the host runs (`performPlacement`, `performByLabel`); the Developer Chest holds both rugs. On a guest, run after the host has laid a rug: the replica has it, walkable.
// Set down and picked up again (docs/43 section 4; src/setdown.js): a pumpkin placed as decoration is a decoration, not interactable, and
// comes back a Decorative pumpkin, not food; a torch post is set down outdoors only, comes up only empty and only a player's own.
// The bag, the map, and the player are put back.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const rugs = await import("/src/rugs.js");
  const placement = await import("/src/placement.js");
  const info = await import("/src/item-info.js");
  const me = G.player;
  const role = G.net.status().role;
  // A guest's console does not teleport (docs/31/07 question 14, #102): there the replica's own player is stood directly, the camera
  // with it, and the host's next frame puts it back where the host has it.
  const standAt = (gx, gy) => { if (role !== "guest") return G.teleport(gx, gy); me.gx = gx; me.gy = gy; me.auto = null; G.camera.snapTo(gx, gy); };
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const counts0 = bag0.map((e) => [e, e.count]);
  const meAt = [me.gx, me.gy];
  const wasPaused = G.loop.isPaused();
  const made = [];
  const walls = [];
  const extra = []; // laid by the mode test, taken up in the finally
  let restoreView = null; // puts the camera and the cursor back, once the check has moved them
  try {
    G.loop.setPaused(true);
    const ids = ["rug_bearskin", "rug_regal_red"];
    const defs = ids.map((id) => G.items.getItem(id));
    row("both rugs are items: decor, rolled 1 by 4, with an icon and a laid picture", defs.every((d) => d && d.kind === "decor" && d.size[0] === 1 && d.size[1] === 4 && d.icon && d.icon.size[0] === 19 && d.icon.size[1] === 76 && d.held && d.held.image && G.assets.getDef(d.rug).rug === true), defs.map((d) => `${d.id} ${d.size} ${d.icon && d.icon.src.split("/").pop()}`).join(" | "));
    const card = info.textOf(info.cardFor(G.items.makeEntry("rug_bearskin")));
    row("the card says Place: lay on the floor, and the kind", card.includes("Decor") && card.includes("Place: lay on the floor."), card.join(" | "));
    const kit = G.items.rollLoot("dev_kit");
    const [kc, kr] = G.items.containerGrid("dev_kit");
    const kitBag = G.inventory.createBag(kc, kr, "chest");
    G.grid.fill(kitBag, kit);
    row("the Developer Chest's grid holds both rugs", ids.every((id) => kitBag.items.some((e) => e.id === id)), `${kitBag.items.length} things, rugs: ${kitBag.items.filter((e) => ids.includes(e.id)).length}`);
    const scene = await (await fetch("/src/render/scene.js")).text();
    row("the scene lays the rugs before any standing drawable (the ground, the rugs, then the props, items, bodies, walls)", scene.indexOf("emitRugs(tiles)") > scene.indexOf("emitGround(tiles)") && scene.indexOf("emitRugs(tiles)") < scene.indexOf("propDrawables(tiles"), `ground ${scene.indexOf("emitGround(tiles)")}, rugs ${scene.indexOf("emitRugs(tiles)")}, props ${scene.indexOf("propDrawables(tiles")}`);

    if (role === "guest") {
      // A guest: the replica holds a rug the host laid, on its tiles, walkable.
      const laid = [...map.allProps()].find((p) => p.rugItem);
      const t = laid ? map.peekTile(laid.tile[0], laid.tile[1]) : null;
      row("on a guest the replica has the rug the host laid, in the rug slot, not blocking", !!laid && !!t && t.rug === laid && !t.prop && laid.solid === false && map.isWalkableTile(laid.tile[0], laid.tile[1]), laid ? `${laid.sprite} at ${laid.tile} facing ${laid.facing}` : "no rug in the replica");
      const act = laid ? G.interact.actionsForTarget({ kind: "prop", id: laid.id }, me).find((a) => a.kind === "rug") : null;
      row("on a guest its menu offers Pick up, by an address the host can rebuild", !!act && /^Pick up .* rug$/.test(act.label), act ? act.label : "none");
      throw Object.assign(new Error("guest done"), { guestDone: true });
    }

    // A patch of bare grass, 8 by 8.
    map.ensureAround(me.gx, me.gy, 3);
    let at = null;
    for (let dy = -16; dy <= 16 && !at; dy++) for (let dx = -16; dx <= 16 && !at; dx++) {
      const x = Math.round(meAt[0]) + dx;
      const y = Math.round(meAt[1]) + dy;
      let ok = true;
      for (let ay = -2; ay < 8 && ok; ay++) for (let ax = -2; ax < 8 && ok; ax++) { const t = map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.rug && !t.n && !t.w && !(t.items && t.items.length) && map.isWalkableTile(x + ax, y + ay); }
      if (ok) at = [x, y];
    }
    if (!at) throw new Error("no bare grass for the check");
    const [x, y] = at;
    bag.items.length = 0;
    const bear = G.items.makeEntry("rug_bearskin", 1);
    const red = G.items.makeEntry("rug_regal_red", 1);
    G.inventory.stow(me, bear);
    G.inventory.stow(me, red);
    standAt(x + 3, y + 3);
    G.loop.advance(1 / 60);

    // Place, y: the bearskin at (x, y), 2 wide and 3 along y.
    const itemsBefore = bag.items.length;
    row("Place lays the bearskin along y: the item leaves the bag, the rug is a 2 by 3 prop on six tiles", rugs.placeRug(me, bear.uid, x, y, "y") === true && !bag.items.includes(bear) && bag.items.length === itemsBefore - 1, `${bag.items.length} in the bag`);
    const a = map.peekTile(x, y).rug;
    made.push(a);
    row("it is a rug prop of the bearskin, 2 by 3, facing y, not solid, carrying its item, in the rug slot only", !!a && a.sprite === "rug_bearskin" && a.footprint[0] === 2 && a.footprint[1] === 3 && a.facing === "y" && a.solid === false && a.rugItem === "rug_bearskin" && a.tiles.length === 6 && a.tiles.every(([tx, ty]) => map.peekTile(tx, ty).rug === a && !map.peekTile(tx, ty).prop), a ? `${a.sprite} ${JSON.stringify(a.footprint)} ${a.facing}` : "none");
    row("it blocks no step: its tiles stay walkable, and no body is blocked there", a.tiles.every(([tx, ty]) => map.isWalkableTile(tx, ty)) && !map.circleBlocked(x + 0.5, y + 1, 0.3), "walkable");
    // x: the regal red at (x + 3, y), 3 wide and 2 along x.
    row("Place lays the regal red along x: a 3 by 2 footprint, facing x", rugs.placeRug(me, red.uid, x + 2, y + 4, "x") === true, "laid");
    const b = map.peekTile(x + 2, y + 4).rug;
    made.push(b);
    row("it is 3 by 2, facing x", !!b && b.footprint[0] === 3 && b.footprint[1] === 2 && b.facing === "x" && b.sprite === "rug_regal_red", b ? `${JSON.stringify(b.footprint)} ${b.facing}` : "none");
    // The mode itself, as the Place entry starts it: the ghost follows the cursor, R turns it between y and x, a click lays it as it was turned, Esc cancels and keeps the item.
    // The ghost rows do not wait for the page's own frame (it runs no camera and no placement while the title or any screen is up, and not at all in a hidden pane): the check snaps the
    // camera to the player and applies the origin, aims the cursor with a real mousemove on the canvas, and runs `placement.update` itself, once, then clears the key edges as a step
    // would (so a tapped key is seen once). The camera and the cursor are put back in the finally.
    const inp = await import("/src/input.js");
    const cv = document.getElementById("game");
    const cam0 = { gx: G.camera.cam.gx, gy: G.camera.cam.gy };
    const mouse0 = { ...inp.getMouse() };
    const look = () => { G.camera.snapTo(me.gx, me.gy); G.camera.applyOrigin(G.view.view.w, G.view.view.h); };
    const cvRect = cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + 1000, clientY: cvRect.top + 500, bubbles: true }));
    const sc = 1000 / inp.getMouse().x; // client pixels per canvas pixel
    restoreView = () => {
      G.camera.snapTo(cam0.gx, cam0.gy);
      G.camera.applyOrigin(G.view.view.w, G.view.view.h);
      if (mouse0.inside) cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + mouse0.x * sc, clientY: cvRect.top + mouse0.y * sc, bubbles: true }));
      else cv.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    };
    const aimAt = (gx, gy) => { const p = G.iso.toScreen(gx, gy); cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + p.x * sc, clientY: cvRect.top + p.y * sc, bubbles: true })); };
    const settle = () => { placement.update(me); inp.endStep(); };
    // Step the world, put the camera on the player, aim at a grid point computed in that view, and let placement read it.
    const aimGrid = (gx, gy) => { G.loop.advance(1 / 60); look(); aimAt(gx, gy); settle(); };
    const spare = G.items.makeEntry("rug_regal_red", 1);
    G.inventory.stow(me, spare);
    const menu = G.interact.itemMenu(me, spare, bag, null).map((m) => m.label);
    row("an item's menu offers Place beside Use, for a rug", menu.includes("Place") && menu.includes("Use"), menu.join(", "));
    G.interact.itemMenu(me, spare, bag, null).find((m) => m.label === "Place").onSelect();
    standAt(x + 4, y + 3);
    aimGrid(x + 6, y + 1.5); // the mode rug lies on x + 5 to x + 7, y + 1 and y + 2 once turned: clear of every tile the rows below test
    const g0 = placement.state.ghost;
    row("Place starts the ghost over the 2 by 3 footprint, green where it fits within reach", placement.state.kind === "rug" && !!g0 && g0.footprint[0] === 2 && g0.footprint[1] === 3 && g0.ok === true, g0 ? `${JSON.stringify(g0.footprint)} ${g0.ok ? "green" : g0.reason}` : "no ghost");
    inp.tap("KeyR");
    settle(); // the one update that reads the tap, then the edge is cleared
    const g1 = placement.state.ghost;
    row("R turns it to x: the footprint is 3 by 2", !!g1 && g1.footprint[0] === 3 && g1.footprint[1] === 2 && placement.state.rug.facing === "x", g1 ? JSON.stringify(g1.footprint) : "no ghost");
    const spot = [g1.tx, g1.ty];
    const laidOk = placement.tryConfirm(me);
    const c1 = map.peekTile(spot[0], spot[1]).rug;
    if (c1) extra.push(c1);
    row("a click lays it as turned (3 by 2, x), the item leaves the bag, and the mode ends", laidOk === true && !!c1 && c1.facing === "x" && c1.footprint[0] === 3 && !bag.items.includes(spare) && placement.state.kind === null, c1 ? `${c1.sprite} ${c1.facing} at ${c1.tile}` : "not laid");
    const spare2 = G.items.makeEntry("rug_bearskin", 1);
    G.inventory.stow(me, spare2);
    placement.beginRug(spare2);
    G.loop.advance(1 / 60);
    settle();
    const esc = placement.cancel();
    row("Esc cancels the mode and the item stays in the bag", esc === true && placement.state.kind === null && bag.items.includes(spare2), "kept");
    bag.items.splice(bag.items.indexOf(spare2), 1);
    // Refusals: over another rug, across a wall, too far, no ground.
    const again = G.items.makeEntry("rug_bearskin", 1);
    G.inventory.stow(me, again);
    row("a rug is refused over another rug", rugs.fitProblem("rug_bearskin", "y", x + 1, y + 1) === "A rug is already there", rugs.fitProblem("rug_bearskin", "y", x + 1, y + 1));
    map.buildWall(x + 5, y, "n", "wall");
    walls.push([x + 5, y, "n"]);
    row("a rug is refused across a wall", rugs.fitProblem("rug_bearskin", "y", x + 5, y - 1) === "A wall is in the way", rugs.fitProblem("rug_bearskin", "y", x + 5, y - 1));
    row("a rug is refused beyond reach, and the item stays in the bag", rugs.reachFor(me, "rug_bearskin", "y", x + 12, y + 12) === "Too far" && rugs.placeRug(me, again.uid, x + 12, y + 12, "y") === false && bag.items.includes(again), rugs.reachFor(me, "rug_bearskin", "y", x + 12, y + 12) || "reachable");
    // Furniture: a chest set down over the rug, and a rug laid under a chest.
    const chest = map.createProp({ sprite: "chest", tile: [x, y] });
    map.placeProp(chest, x, y);
    made.push(chest);
    row("furniture stands on a rug: the chest is in the prop slot over the rug, which stays", map.peekTile(x, y).prop === chest && map.peekTile(x, y).rug === a, "chest over the bearskin");
    const under = map.createProp({ sprite: "chest", tile: [x + 4, y + 1] });
    map.placeProp(under, x + 4, y + 1);
    made.push(under);
    row("a rug is laid under furniture: a chest on its tiles does not stop it", rugs.fitProblem("rug_regal_red", "y", x + 3, y) === "", rugs.fitProblem("rug_regal_red", "y", x + 3, y) || "fits");
    // A rug is laid only where it could come up again: under what can be lifted (a barrel, a table), never under a tree, an anvil, a crop, or a cart.
    const tree = map.createProp({ sprite: "tree_oak_m", tile: [x - 2, y - 2] });
    map.placeProp(tree, x - 2, y - 2);
    made.push(tree);
    const anvil = map.createProp({ sprite: "anvil", tile: [x - 2, y + 3] });
    map.placeProp(anvil, x - 2, y + 3);
    made.push(anvil);
    const crop = map.createProp({ sprite: "crop_potato_1", tile: [x - 1, y + 6] });
    map.placeProp(crop, x - 1, y + 6);
    made.push(crop);
    const barrel = map.createProp({ sprite: "barrel", tile: [x + 7, y + 6] });
    map.placeProp(barrel, x + 7, y + 6);
    made.push(barrel);
    const fitTree = rugs.fitProblem("rug_bearskin", "y", x - 2, y - 2);
    const fitAnvil = rugs.fitProblem("rug_bearskin", "y", x - 2, y + 2);
    const fitCrop = rugs.fitProblem("rug_bearskin", "y", x - 1, y + 5);
    row("a rug is refused over a tree, an anvil, and a crop, saying what is in the way with the right article", fitTree === "There is a tree in the way" && fitAnvil === "There is an anvil in the way" && fitCrop === "There is a potato crop in the way", `${fitTree} | ${fitAnvil} | ${fitCrop}`);
    const names = ["anvil", "altar", "oven", "ore_cart", "table", "crop_cabbage_2", "tree_yellow_l", "tree_spire_blue_old", "chicken_coop"].map((sp) => rugs.withArticle(rugs.nameOf(sp)));
    row("a prop's name reads as a player would say it: an before a vowel, a crop as what it is, a tree as a tree", names.join(", ") === "an anvil, an altar, an oven, an ore cart, a table, a cabbage crop, a tree, a tree, a chicken coop", names.join(", "));
    row("a rug is still laid under a barrel and a chest (what can be lifted away)", rugs.fitProblem("rug_regal_red", "x", x + 6, y + 5) === "" && rugs.fitProblem("rug_regal_red", "y", x + 3, y) === "", rugs.fitProblem("rug_regal_red", "x", x + 6, y + 5) || "fits");
    // A wall is not built through a laid rug (both tiles of the edge under one rug), though one along its edge is.
    row("a wall is refused across a laid rug, and allowed on the edge outside it", map.canBuildWall(x, y + 1, "n", "wall") === false && map.canBuildWall(x, y, "n", "wall") === true, `inside ${map.canBuildWall(x, y + 1, "n", "wall")}, on the edge ${map.canBuildWall(x, y, "n", "wall")}`);
    // The menu: a villager standing on the rug is the thing pointed at, so the rug's entry follows hers.
    const vil = G.game.state.villagers.find((q) => !q.dead);
    if (vil) {
      const vAt = [vil.gx, vil.gy];
      vil.gx = x;
      vil.gy = y + 2;
      const vp = G.iso.toScreen(vil.gx, vil.gy);
      let labels = [];
      for (const up of [4, 8, 12, 16]) { // the cursor on her feet: on her body and on the rug's tile at once
        labels = G.interact.actionsAt(vp.x, vp.y - up, me).map((q) => q.label);
        if (labels.some((l) => /^Talk to/.test(l)) && labels.some((l) => /^Pick up bearskin rug/.test(l))) break;
      }
      vil.gx = vAt[0];
      vil.gy = vAt[1];
      const ti = labels.findIndex((l) => /^Talk to/.test(l));
      const pi = labels.findIndex((l) => /^Pick up bearskin rug/.test(l));
      row("with a villager on the rug, Talk to comes before Pick up in the menu", ti >= 0 && pi >= 0 && ti < pi, labels.join(" | "));
    } else row("with a villager on the rug, Talk to comes before Pick up in the menu", false, "no villager");
    // Pick up refused under furniture, then allowed.
    const label = G.interact.actionsForTarget({ kind: "prop", id: a.id }, me).find((q) => q.kind === "rug");
    row("the rug's menu offers Pick up bearskin rug", !!label && label.label === "Pick up bearskin rug", label ? label.label : "none");
    const refused = rugs.pickUp(me, a);
    row("Pick up is refused while the chest stands on it, and the rug stays", refused === false && map.peekTile(x, y).rug === a && rugs.pickUpProblem(a) === "Move the chest off it first.", rugs.pickUpProblem(a));
    map.removeProp(chest);
    map.removeProp(under);
    made.splice(0, made.length, a, b, tree, anvil, crop, barrel);
    // A dropped item lies on it and an item on the floor does not block it.
    const stick = G.items.makeEntry("stick", 1);
    map.dropItem(x + 1, y + 1, stick);
    row("an item dropped on the rug lies on its tile, and does not stop Pick up", map.itemsAt(x + 1, y + 1).some((e) => e.id === "stick") && rugs.pickUpProblem(a) === "", "ok");
    // Object Highlight finds a laid rug (it has Pick up now), and E picks it up when nothing else is in reach.
    const hl = await import("/src/highlight.js");
    const sp = G.iso.toScreen(x, y + 2);
    const seen = hl.targetAt(sp.x, sp.y, me, null);
    row("Object Highlight finds the rug under the cursor", !!seen && seen.kind === "prop" && seen.id === a.id, JSON.stringify(seen));
    const lying = map.itemsAt(x + 1, y + 1).find((e) => e.id === "stick");
    if (lying) map.takeItem(x + 1, y + 1, lying); // the stick would be E's first: a rug is its last resort
    standAt(x + 0.5, y + 1);
    G.loop.advance(1 / 60);
    const near = G.interact.nearestSimpleAction(me);
    row("E picks the rug up when it is the nearest thing (nothing else in reach)", !!near && near.kind === "rug" && /^Pick up /.test(near.label), near ? near.label : "none");
    standAt(x + 3, y + 3);
    G.loop.advance(1 / 60);
    // Save and restore: the chunk's record and back.
    const [cx, cy] = map.chunkCoord(x, y);
    const rec = JSON.parse(JSON.stringify(map.serializeChunk(map.getChunk(cx, cy, false))));
    const recRug = rec.props.find((p) => p.sprite === "rug_bearskin" && p.tile[0] === x && p.tile[1] === y);
    row("the chunk's record carries the rug with its item, facing, and walkability", !!recRug && recRug.rugItem === "rug_bearskin" && (recRug.facing ?? "y") === "y" /* the first facing is the default, so a record leaves it out */ && recRug.solid === false, recRug ? JSON.stringify(recRug).slice(0, 120) : "not in the record");
    map.installChunk(rec);
    for (const p of rec.props) map.installProp(p);
    const back = map.peekTile(x, y).rug;
    row("after the restore the rug is back on its six tiles, a rug, walkable, still giving its item", !!back && back.rugItem === "rug_bearskin" && back.tiles.every(([tx, ty]) => map.peekTile(tx, ty).rug === back) && back.solid === false, back ? `${back.sprite} ${back.facing}` : "gone");
    made.splice(0, made.length, back, map.peekTile(x + 2, y + 4).rug);
    // A guest's commands, the way the host runs them.
    const gp = placement.performPlacement(me, { kind: "rug", uid: again.uid, tx: x + 5, ty: y + 3, facing: "x" });
    const gl = map.peekTile(x + 5, y + 3).rug;
    if (gl) made.push(gl);
    row("a guest's Place (the command the host runs) lays the rug: the item leaves the bag", gp === true && !!gl && !bag.items.includes(again), gl ? `${gl.sprite} at ${gl.tile}` : "not laid");
    const pickLabel = gl ? G.interact.actionsForTarget({ kind: "prop", id: gl.id }, me).find((q) => q.kind === "rug").label : "";
    const n0 = bag.items.length;
    standAt(x + 4.6, y + 3); // within a step of it: the host walks a guest there otherwise, and the check is not waiting
    G.loop.advance(1 / 60);
    if (gl) G.interact.performByLabel(me, { kind: "prop", id: gl.id }, pickLabel);
    row("a guest's Pick up (by the address and the label) rolls it back into the bag", !!gl && !map.peekTile(x + 5, y + 3).rug && bag.items.length === n0 + 1 && bag.items.some((e) => e.id === "rug_bearskin"), `${pickLabel}; ${bag.items.length} in the bag`);
    // A second pick-up of the same rug (a walk that met someone else's, a guest's command twice) gets nothing: one rug laid, one rug back.
    const ent = G.items.makeEntry("rug_bearskin", 1);
    G.inventory.stow(me, ent);
    const laidTwice = rugs.placeRug(me, ent.uid, x + 5, y + 3, "x");
    const dupRug = map.peekTile(x + 5, y + 3).rug;
    if (dupRug) extra.push(dupRug);
    const nA = bag.items.filter((e) => e.id === "rug_bearskin").length;
    const first = rugs.pickUp(me, dupRug);
    const second = rugs.pickUp(me, dupRug);
    const nB = bag.items.filter((e) => e.id === "rug_bearskin").length;
    row("picking the same rug up twice gives one rug, not two", laidTwice === true && first === true && second === false && nB === nA + 1, `first ${first}, second ${second}, ${nB - nA} more in the bag`);
    // The real pick-up of the first rug returns the same item.
    const n1 = bag.items.length;
    row("Pick up of the first rug gives the bearskin back", rugs.pickUp(me, map.peekTile(x, y).rug) === true && !map.peekTile(x, y).rug && bag.items.length === n1 + 1, "back in the bag");
    made.splice(0, made.length, map.peekTile(x + 2, y + 4).rug);
    // ---- Set down and picked up again (docs/43 section 4), by the guest's command (performPlacement) and the menus' labels.
    {
      const setdown = await import("/src/setdown.js");
      let spot = null;
      for (let r = 2; r < 20 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
        const x = Math.round(meAt[0]) + dx, y = Math.round(meAt[1]) + dy;
        if (!setdown.standProblem("outdoors", x, y) && !setdown.standProblem("outdoors", x + 1, y) && map.isWalkableTile(x, y + 1) && !map.peekTile(x, y + 1).prop) spot = [x, y];
      }
      if (!spot) row("an open tile outdoors for the set-down rows", false, "none");
      else {
        const [sx, sy] = spot;
        standAt(sx, sy + 1);
        G.loop.advance(1 / 60);
        const labels = (prop) => G.interact.actionsForProp(prop, me).map((a) => a.label);
        const pumpkin = G.items.makeEntry("pumpkin", 1);
        G.inventory.stow(me, pumpkin);
        const menu = G.interact.itemMenu(me, pumpkin, bag, null).map((m) => m.label);
        placement.performPlacement(me, { kind: "setdown", uid: pumpkin.uid, tx: sx, ty: sy });
        const deco = map.peekTile(sx, sy).prop;
        if (deco) extra.push(deco);
        row("a pumpkin's menu has Place as decoration, and set down it is a decoration: not interactable, not made, the pumpkin gone from the bag", menu.includes("Place as decoration (it will not be food again)") && !!deco && deco.sprite === "pumpkin_plain_0" && G.assets.getDef(deco.sprite).interactable === false && !deco.made && !bag.items.includes(pumpkin), `${menu.join(", ")}; ${deco ? deco.sprite : "nothing"}`);
        const up = deco ? G.interact.actionsForProp(deco, me).find((a) => a.label === "Pick up decorative pumpkin") : null;
        const upOk = up ? up.perform() : null;
        const back = bag.items.find((e) => e.id === "decorative_pumpkin");
        const bdef = G.items.getItem("decorative_pumpkin");
        row("picked up it is a Decorative pumpkin: decor, not food (one way)", upOk === true && !!back && bdef.kind === "decor" && !bdef.hunger && !(bdef.tags || []).includes("food") && !map.propById(deco.id), `${deco ? labels(deco).join(", ") : ""}; ${back ? back.id : "none"}`);
        const card = info.textOf(info.cardFor(G.items.makeEntry("pumpkin", 1)));
        row("the pumpkin's card says Place as decoration, and that it comes back a decoration", card.some((l) => /^Place as decoration: .*not food/.test(l)), card.join(" | "));
        // The torch post: outdoors only, a player's own, empty to come up.
        const post = G.items.makeEntry("torch_post", 1);
        G.inventory.stow(me, post);
        const room = [...map.allProps()].find((q) => q.sprite === "bed");
        const indoor = room ? map.nearestWalkable(room.tile[0], room.tile[1] + 1, (x, y) => !!map.tileAt(x, y).prop) : null;
        let refused = "";
        if (indoor) {
          standAt(indoor[0], indoor[1] + 0.2);
          G.loop.advance(1 / 60);
          placement.performPlacement(me, { kind: "setdown", uid: post.uid, tx: indoor[0], ty: indoor[1] });
          refused = (document.getElementById("message") || {}).textContent || "";
        }
        standAt(sx, sy + 1);
        G.loop.advance(1 / 60);
        placement.performPlacement(me, { kind: "setdown", uid: post.uid, tx: sx + 1, ty: sy });
        const mine = map.peekTile(sx + 1, sy).prop;
        if (mine) extra.push(mine);
        row("a torch post sets down outdoors only, a player's own, empty", /Outdoors only/.test(refused) && !!mine && mine.sprite === "torch_post" && mine.made === true && !mine.fire.has, `indoors: "${refused}"; ${mine ? `made ${mine.made}, has ${mine.fire.has}` : "nothing"}`);
        if (mine) {
          const torch = G.items.makeEntry("torch", 1);
          G.inventory.stow(me, torch);
          const mount = G.interact.actionsForProp(mine, me).find((a) => a.label === "Mount the torch");
          if (mount) mount.perform();
          const held = labels(mine);
          const take = G.interact.actionsForProp(mine, me).find((a) => a.label === "Take the torch");
          if (take) take.perform();
          const pick = G.interact.actionsForProp(mine, me).find((a) => a.label === "Pick up torch post");
          const picked = pick ? pick.perform() : null;
          row("with a torch on it Pick up is greyed until the torch is taken; then it comes up as the Torch post item", held.includes("Pick up torch post (take the torch first)") && picked === true && !map.propById(mine.id) && bag.items.some((e) => e.id === "torch_post"), `${held.join(", ")}; picked ${picked}`);
        }
        const village = [...map.allProps()].find((q) => q.sprite === "torch_post" && !q.made);
        row("the village's own torch post is not picked up", !!village && G.interact.actionsForProp(village, me).some((a) => a.label === "Pick up torch post (that is the village's)" && a.enabled === false), village ? labels(village).join(", ") : "no village post");
      }
    }
  } catch (e) {
    if (!e.guestDone) rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    placement.cancel();
    if (restoreView) restoreView();
    for (const [wx, wy, edge] of walls) map.destroyWall(wx, wy, edge);
    for (const p of [...made, ...extra]) { const t = p && map.propById(p.id); if (t) map.removeProp(t); }
    bag.items.splice(0, bag.items.length, ...bag0);
    for (const [e, n] of counts0) e.count = n;
    standAt(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
