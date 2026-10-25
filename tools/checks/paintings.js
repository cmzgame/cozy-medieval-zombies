// Paintings (#326; src/paintings.js, render/paintings.js). From the console, on a tab with `?nosave`:
//   await __game.check("paintings")
// A painting is an item (decor; small 2 by 2, tall 2 by 3, wide 3 by 2; its icon, its held picture, and its card: "Place: hang on a wall's face") that Place hangs on the camera-facing
// face of a plain wall: the ghost follows the cursor onto a wall's face, a click hangs it, Esc keeps the item; the picture is drawn after its wall segment (a wide one in two halves, each with its own segment); refused at a corner;
// Pick up takes it down (from either segment of a wide one) and is refused out of reach; a wall taken down drops it as an item; Object Highlight finds it and its menu offers Pick up
// beside Walk here; a guest's Place and Pick up are the commands the host runs (`performPlacement`, `performByLabel`); the Developer Chest holds all eight. On a guest, run after the
// host has hung one: the replica has it on the wall and its menu offers Pick up by an address the host can rebuild. The bag, the walls, the floor items, and the player are put back.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const P = await import("/src/paintings.js");
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
  const walls = [];
  let restoreView = null; // puts the camera and the cursor back, once the check has moved them
  const IDS = ["small_oak", "small_deer", "small_peak", "tall_waterfall", "tall_pines", "wide_castle", "wide_lake", "wide_sunset"].map((n) => `painting_${n}`);
  try {
    G.loop.setPaused(true);
    const defs = IDS.map((id) => G.items.getItem(id));
    const sizes = { small: [2, 2], tall: [2, 3], wide: [3, 2] };
    const sheet = G.assets.getSheet("decor_paintings");
    row("all eight are items: decor, sized by their kind, with an icon, a held picture, and both walls drawn", defs.every((d) => d && d.kind === "decor" && sizes[d.painting] && d.size[0] === sizes[d.painting][0] && d.size[1] === sizes[d.painting][1] && d.icon && d.held && d.held.image && !!sheet && !!sheet.frames[`${d.id}_north`] && !!sheet.frames[`${d.id}_west`]), defs.map((d) => `${d.id} ${d.size}`).join(" | "));
    const card = info.textOf(info.cardFor(G.items.makeEntry("painting_wide_lake")));
    row("the card says Place: hang on a wall's face, and the kind", card.includes("Decor") && card.includes("Place: hang on a wall's face."), card.join(" | "));
    const kit = G.items.rollLoot("dev_kit");
    const [kc, kr] = G.items.containerGrid("dev_kit");
    const kitBag = G.inventory.createBag(kc, kr, "chest");
    G.grid.fill(kitBag, kit);
    row("the Developer Chest's grid holds all eight", IDS.every((id) => kitBag.items.some((e) => e.id === id)), `${kitBag.items.filter((e) => IDS.includes(e.id)).length} of 8`);
    const scene = await (await fetch("/src/render/walls.js")).text();
    const art = await import("/src/render/paintings.js");
    const splits = ["wide_castle", "wide_lake", "wide_sunset"].flatMap((n) => ["n", "w"].map((e) => [n, e, art.splitOf(`painting_${n}`, e)]));
    row("each wide painting has a joint inside its picture on both walls, so each segment draws its own half (north: the holder the left, west: the holder the right)", splits.every(([, , s]) => s && s.at > 15 && s.at < s.width - 15), splits.map(([n, e, s]) => `${n}/${e} ${s && s.at}/${s && s.width}`).join(" | "));
    row("the wall drawable emits a segment's hangings after its face and before its bracket", scene.indexOf("emitHangings(wall, edge, tx, ty") > scene.indexOf("emitDrawnWall(sheet, wall, variant") && scene.indexOf("if (br) {", scene.indexOf("emitHangings(wall, edge, tx, ty")) - scene.indexOf("emitHangings(wall, edge, tx, ty") < 200, "order in walls.js");

    if (role === "guest") {
      let held = null;
      const [gx, gy] = [Math.round(me.gx), Math.round(me.gy)];
      for (let dy = -12; dy <= 12 && !held; dy++) for (let dx = -12; dx <= 12 && !held; dx++) for (const e of ["n", "w"]) { const w = map.peekTile(gx + dx, gy + dy)?.[e]; if (w && w.hangings && w.hangings.some((h) => h.item)) held = { tx: gx + dx, ty: gy + dy, edge: e }; }
      const act = held ? G.interact.actionsForTarget({ kind: "painting", ...held }, me).find((a) => a.kind === "painting") : null;
      row("on a guest the replica has the painting the host hung, and its menu offers Pick up, by an address the host can rebuild", !!held && !!act && /^Pick up .* painting$/.test(act.label), held ? `${JSON.stringify(held)} ${act ? act.label : "no action"}` : "no painting within twelve tiles");
      throw Object.assign(new Error("guest done"), { guestDone: true });
    }

    // A run of eight plain walls on bare grass, and a floor in front of it.
    map.ensureAround(me.gx, me.gy, 3);
    let at = null;
    for (let dy = -16; dy <= 16 && !at; dy++) for (let dx = -16; dx <= 16 && !at; dx++) {
      const x = Math.round(meAt[0]) + dx;
      const y = Math.round(meAt[1]) + dy;
      let ok = true;
      for (let ay = -3; ay < 5 && ok; ay++) for (let ax = -2; ax < 10 && ok; ax++) { const t = map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.rug && !t.n && !t.w && !(t.items && t.items.length) && map.isWalkableTile(x + ax, y + ay); }
      if (ok) at = [x, y];
    }
    if (!at) throw new Error("no bare grass for the check");
    const [x, y] = at;
    for (let i = 0; i < 8; i++) { map.buildWall(x + i, y, "n", "wall"); walls.push([x + i, y, "n"]); }
    bag.items.length = 0;
    const add = (id) => { const e = G.items.makeEntry(id, 1); G.inventory.stow(me, e); return e; };
    // The ghost rows do not wait for the page's own frame (it runs no camera and no placement while the title or any screen is up, and not at all in a hidden pane): the check snaps the
    // camera to the player and applies the origin, aims the cursor with a real mousemove on the canvas, and runs `placement.update` itself, once, then clears the key edges as a step
    // would (so a tapped key is seen once). The camera and the cursor are put back in the finally.
    const cv = document.getElementById("game");
    const inp = await import("/src/input.js");
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
    const aimAt = (sx, sy) => cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + sx * sc, clientY: cvRect.top + sy * sc, bubbles: true }));
    const faceMid = (tx, ty) => { const p = G.iso.toScreen(tx, ty); return [p.x + 12, p.y - 47]; }; // the middle of a north segment's camera face
    const settle = () => { placement.update(me); inp.endStep(); };
    // Step the world, put the camera on the player, aim at a point computed in that view, and let placement read it.
    const aimFace = (tx, ty) => { G.loop.advance(1 / 60); look(); aimAt(...faceMid(tx, ty)); settle(); };
    standAt(x + 2, y + 1);
    G.loop.advance(1 / 60);
    look();

    // The ghost and the click: Place from the item's menu, over the face of the segment at x + 1.
    const oak = add("painting_small_oak");
    const menu = G.interact.itemMenu(me, oak, bag, null).map((m) => m.label);
    row("an item's menu offers Place beside Use, for a painting", menu.includes("Place") && menu.includes("Use"), menu.join(", "));
    G.interact.itemMenu(me, oak, bag, null).find((m) => m.label === "Place").onSelect();
    aimFace(x + 1, y);
    const g0 = placement.state.ghost;
    row("Place starts the ghost on the face under the cursor, green within reach", placement.state.kind === "painting" && !!g0 && g0.tx === x + 1 && g0.ty === y && g0.edge === "n" && g0.ok === true, g0 ? `${g0.tx},${g0.ty} ${g0.edge} ${g0.ok ? "green" : g0.reason}` : "no ghost");
    aimFace(x + 6, y); // out of reach from x + 2
    const g1 = placement.state.ghost;
    row("a face out of reach is a red ghost that says Too far", !!g1 && g1.ok === false && g1.reason === "Too far", g1 ? g1.reason : "no ghost");
    const refusedClick = placement.tryConfirm(me);
    row("a click on the red ghost is spent, says why, and the item stays in the bag", refusedClick === true && bag.items.includes(oak) && !map.peekTile(x + 6, y).n.hangings, "kept");
    aimFace(x + 1, y);
    const hungOk = placement.tryConfirm(me);
    row("a click on the green ghost hangs it: the item leaves the bag, the wall holds it, the mode ends", hungOk === true && !bag.items.includes(oak) && map.peekTile(x + 1, y).n.hangings?.[0]?.item === "painting_small_oak" && placement.state.kind === null, JSON.stringify(map.peekTile(x + 1, y).n.hangings));
    const spare = add("painting_small_deer");
    placement.beginPainting(spare);
    G.loop.advance(1 / 60);
    settle();
    row("Esc cancels the mode and the item stays in the bag", placement.cancel() === true && placement.state.kind === null && bag.items.includes(spare), "kept");
    // A wide one aimed at its second section hangs from the one before it.
    const wide = add("painting_wide_lake");
    placement.beginPainting(wide);
    standAt(x + 6.5, y + 1);
    aimFace(x + 7, y); // the last segment of the run: a wide painting cannot start there, so it hangs from the one before
    const gw = placement.state.ghost;
    row("a wide painting aimed at the last section of a wall hangs from the one before it (the holder is the segment before)", !!gw && gw.ok === true && gw.tx === x + 6 && gw.edge === "n", gw ? `${gw.tx},${gw.ty} ${gw.ok ? "green" : gw.reason}` : "no ghost");
    placement.cancel();
    // Rules, by the module: each refusal says what is in the way.
    row("a wide painting is refused where only one segment is left (the wall's end)", P.fitProblem("painting_wide_lake", x + 7, y, "n") === "Too wide for the wall", P.fitProblem("painting_wide_lake", x + 7, y, "n"));
    row("a painting is refused where there is no wall", P.fitProblem("painting_small_oak", x, y + 3, "n") === "No wall to hang it on", P.fitProblem("painting_small_oak", x, y + 3, "n"));
    // A corner: a wall meeting the end of a run on the camera's side hides much of a painting there, so it is refused (a wall behind the run, on the far side, hides nothing).
    map.buildWall(x + 8, y, "w", "wall");
    walls.push([x + 8, y, "w"]);
    row("a painting is refused at a corner (a wall meeting the run's end on the camera's side), and not one segment in from it", P.fitProblem("painting_small_oak", x + 7, y, "n") === "A corner is in the way" && P.fitProblem("painting_small_oak", x + 6, y, "n") === "", `${P.fitProblem("painting_small_oak", x + 7, y, "n")} | ${P.fitProblem("painting_small_oak", x + 6, y, "n") || "fits"}`);
    map.buildWall(x + 6, y, "n", "window");
    row("a painting is refused on a window", P.fitProblem("painting_small_oak", x + 6, y, "n") === "Nothing to hang it on" && P.fitProblem("painting_wide_lake", x + 5, y, "n") === "Nothing to hang it on", P.fitProblem("painting_small_oak", x + 6, y, "n"));
    row("a painting is refused on a segment that already holds one", P.fitProblem("painting_small_deer", x + 1, y, "n") === "Something already hangs there", P.fitProblem("painting_small_deer", x + 1, y, "n"));
    // Wide and tall: hung, drawn, the cover.
    standAt(x + 4, y + 1);
    G.loop.advance(1 / 60);
    const tall = add("painting_tall_pines");
    row("a tall painting takes both slots of one segment", P.hang(me, tall.uid, x + 3, y, "n") === true && map.peekTile(x + 3, y).n.hangings[0].slot === "both", JSON.stringify(map.peekTile(x + 3, y).n.hangings));
    const w1 = add("painting_wide_castle");
    row("a wide painting is held by one segment and covers the next", P.hang(me, w1.uid, x + 4, y, "n") === true && map.peekTile(x + 4, y).n.hangings[0].span === 2 && map.peekTile(x + 5, y).n.hangings[0].cover[0] === x + 4, JSON.stringify([map.peekTile(x + 4, y).n.hangings, map.peekTile(x + 5, y).n.hangings]));
    const rect = P.rectOf("painting_wide_castle", x + 4, y, "n");
    const sp = [rect.x + rect.w / 2, rect.y + rect.h / 2];
    // Object Highlight, the menu.
    const hl = await import("/src/highlight.js");
    const seen = hl.targetAt(sp[0], sp[1], me, null);
    row("Object Highlight finds the painting under the cursor, by the segment that holds it", !!seen && seen.kind === "painting" && seen.tx === x + 4 && seen.ty === y && seen.edge === "n", JSON.stringify(seen));
    const labels = G.interact.actionsAt(sp[0], sp[1], me).map((a) => a.label);
    row("its menu offers Pick up, with Walk here beside it", labels.some((l) => /^Pick up castle painting$/i.test(l)) && labels.some((l) => /^Walk here/.test(l)), labels.join(" | "));
    // Pick up from the cover, once; and out of reach.
    standAt(x + 5, y + 8);
    G.loop.advance(1 / 60);
    const nFar = bag.items.length;
    row("Pick up is refused out of reach and the painting stays", P.takeDown(me, x + 5, y, "n") === false && !!map.peekTile(x + 4, y).n.hangings && bag.items.length === nFar, P.reachFor(me, "painting_wide_castle", x + 4, y, "n"));
    standAt(x + 5, y + 1);
    G.loop.advance(1 / 60);
    const n0 = bag.items.length;
    row("Pick up from the second segment takes the whole painting down into the bag", P.takeDown(me, x + 5, y, "n") === true && bag.items.length === n0 + 1 && bag.items.some((e) => e.id === "painting_wide_castle") && !map.peekTile(x + 4, y).n.hangings && !map.peekTile(x + 5, y).n.hangings, `${bag.items.length - n0} more in the bag`);
    row("a second Pick up of the same painting gives nothing", P.takeDown(me, x + 4, y, "n") === false && bag.items.length === n0 + 1, "once");
    // A guest's commands, the way the host runs them.
    const gpaint = add("painting_small_peak");
    const gp = placement.performPlacement(me, { kind: "painting", uid: gpaint.uid, tx: x + 5, ty: y, edge: "n" });
    row("a guest's Place (the command the host runs) hangs the painting: the item leaves the bag", gp === true && map.peekTile(x + 5, y).n.hangings?.[0]?.item === "painting_small_peak" && !bag.items.includes(gpaint), JSON.stringify(map.peekTile(x + 5, y).n.hangings));
    const target = { kind: "painting", tx: x + 5, ty: y, edge: "n" };
    const pickLabel = (G.interact.actionsForTarget(target, me).find((q) => q.kind === "painting") || {}).label;
    const n1 = bag.items.length;
    G.interact.performByLabel(me, target, pickLabel);
    row("a guest's Pick up (by the address and the label) takes it down into the bag", /^Pick up /.test(pickLabel || "") && !map.peekTile(x + 5, y).n.hangings && bag.items.length === n1 + 1, `${pickLabel}; ${bag.items.length - n1} more in the bag`);
    // A full bag: the painting is at the player's feet.
    bag.items.length = 0;
    const keep = add("painting_small_peak");
    P.hang(me, keep.uid, x + 5, y, "n");
    for (let again = true; again;) { again = false; for (const id of ["painting_small_deer", "log", "stick", "rag", "tinderbox"]) { const f = G.items.makeEntry(id, 1); if (G.grid.insert(bag, f)) again = true; } }
    const feet = [Math.round(me.gx), Math.round(me.gy)];
    P.takeDown(me, x + 5, y, "n");
    row("with a full bag, Pick up leaves the painting at the player's feet", map.itemsAt(feet[0], feet[1]).some((e) => e.id === "painting_small_peak") && !map.peekTile(x + 5, y).n.hangings, `${map.itemsAt(feet[0], feet[1]).length} on the floor at ${feet}`);
    const lyingFeet = map.itemsAt(feet[0], feet[1]).find((e) => e.id === "painting_small_peak");
    if (lyingFeet) map.takeItem(feet[0], feet[1], lyingFeet);
    bag.items.length = 0;
    // The wall goes: the painting falls to the floor, whole.
    standAt(x + 3, y + 1);
    const tall2 = add("painting_tall_waterfall");
    P.hang(me, tall2.uid, x + 2, y, "n");
    map.destroyWall(x + 2, y, "n");
    row("a wall taken down drops the painting on it as an item on the face's floor", map.itemsAt(x + 2, y).some((e) => e.id === "painting_tall_waterfall"), `${map.itemsAt(x + 2, y).map((e) => e.id)}`);
    row("the floor item is the same painting, its card and its Place menu still there", map.itemsAt(x + 2, y).some((e) => e.id === "painting_tall_waterfall" && G.interact.itemMenu(me, e, bag, null).some((m) => m.label === "Place")), "item menu");
    // The save: a chunk's record carries it, and back.
    const [cx, cy] = map.chunkCoord(x + 1, y);
    const rec = JSON.parse(JSON.stringify(map.serializeChunk(map.getChunk(cx, cy, false))));
    row("the chunk's record carries the painting on the wall (the save and a guest's chunk)", JSON.stringify(rec).includes("painting_small_oak"), "in the record");
    map.installChunk(rec);
    row("after the restore the painting is on its wall", map.peekTile(x + 1, y).n.hangings?.[0]?.item === "painting_small_oak", JSON.stringify(map.peekTile(x + 1, y).n.hangings));
    // A wall bracket (docs/43 section 4): hung on a face as a painting is, by the guest's command; it holds a torch; empty, a player's own comes down again.
    {
      standAt(x + 5, y + 1);
      G.loop.advance(1 / 60);
      const br = add("wall_bracket");
      const began = placement.beginBracket(br);
      const esc = placement.cancel();
      placement.performPlacement(me, { kind: "bracket", uid: br.uid, tx: x + 5, ty: y, edge: "n" });
      const w5 = map.peekTile(x + 5, y).n;
      const listed = [...map.brackets()].some((b) => b.wall === w5);
      row("a wall bracket's Place begins a mode Esc ends, and hung by the guest's command it is an empty bracket on the face, the player's own", began && esc && !!w5.bracket && w5.bracket.side === 1 && w5.bracket.made === true && !w5.bracket.torch && listed && !bag.items.includes(br), w5.bracket ? JSON.stringify(w5.bracket) : "none");
      const br2 = add("wall_bracket");
      placement.performPlacement(me, { kind: "bracket", uid: br2.uid, tx: x + 5, ty: y, edge: "n" });
      const said = (document.getElementById("message") || {}).textContent || "";
      const pic = add("painting_small_oak");
      const picWhy = P.fitProblem(pic.id, x + 5, y, "n");
      row("a second bracket there is refused, and so is a painting", /already there/.test(said) && bag.items.includes(br2) && /bracket is in the way/i.test(picWhy), `"${said}"; painting: ${picWhy}`);
      const addr = { kind: "bracket", tx: x + 5, ty: y, edge: "n" };
      const labels = () => G.interact.actionsForTarget(addr, me).map((q) => q.label);
      const empty = labels();
      const torch = add("torch");
      G.interact.performByLabel(me, addr, "Mount the torch");
      const holding = labels();
      G.interact.performByLabel(me, addr, "Take the torch");
      const down = G.interact.performByLabel(me, addr, "Take down the bracket");
      row("empty it offers Mount the torch and Take down the bracket; holding a torch, no Take down; taken down by its label it is the item again", empty.includes("Take down the bracket") && !holding.includes("Take down the bracket") && holding.includes("Take the torch") && down === true && !map.peekTile(x + 5, y).n.bracket && bag.items.filter((e) => e.id === "wall_bracket").length === 2 && ![...map.brackets()].some((b) => b.wall === w5), `${empty.join(", ")} / ${holding.join(", ")}`);
      const card = info.textOf(info.cardFor(G.items.makeEntry("wall_bracket", 1)));
      row("the Wall bracket's card says Place on a wall's face and where it is made", card.includes("Place: hang on a wall's face, to hold a torch.") && card.some((l) => /anvil/.test(l)), card.join(" | "));
      void torch;
    }
  } catch (e) {
    if (!e.guestDone) rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    placement.cancel();
    if (restoreView) restoreView();
    for (const [wx, wy, edge] of walls) map.destroyWall(wx, wy, edge);
    for (const [wx, wy] of walls) for (const e of [...map.itemsAt(wx, wy)]) if (/^painting_/.test(e.id)) map.takeItem(wx, wy, e);
    bag.items.splice(0, bag.items.length, ...bag0);
    for (const [e, n] of counts0) e.count = n;
    standAt(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
