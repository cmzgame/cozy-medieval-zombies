// Doors, windows, and shutters built onto walls (Michael, 2026-10-17, #147): a door or a window is
// built over a plain wall (the edge's kind and state set, the material kept, the wall remembered and put back by the removal
// tool), or over a broken door or window as a new one, never a repair; a window is not built over a fence, a gate (a door)
// is; a door or a window always has hit points, whatever the wall is made of; the removal tool keeps what was the player's. Then Take apart
// (docs/43, section 2), with Free building off: a paid door gives half its planks back, rounded down, and the wall is back; a log wall asks for
// its build's tool (a hatchet) and gives nothing back from one log; a door built free gives nothing; a made chest is refused while it holds
// anything, taken apart empty by its menu's label (a guest's way) for half its planks, which a full bag drops at the feet; the village's own
// chest is carried, never taken apart.
// From the console, on a tab
// with `?nosave`:
//   await __game.check("build")
// It builds on open ground through placement.performPlacement (the host's and a guest's one path) with free building on
// (restored) and takes everything down. The dead do not hunt while it runs (restored): a bite mid-build cancels the timed action.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const free0 = G.rules.rules.freeBuilding;
  const aggro0 = G.rules.rules.zombieAggro;
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const made = [];
  const props = [];
  const bag = G.inventory.bagOf(me);
  const bag0 = bag ? bag.items.slice() : [];
  const counts0 = bag0.map((e) => [e, e.count]);
  const hands0 = { main: me.hands.main, off: me.hands.off };
  try {
    G.loop.setPaused(true);
    G.rules.set({ freeBuilding: true, zombieAggro: false }); // each build runs five seconds of the world, and a bite from one of the dead that wanders up to the spot cancels the timed build (#349)
    // Open ground with room round it.
    let c = null;
    for (let y = 120; y < 240 && !c; y += 3) {
      for (let x = 30; x < 230 && !c; x += 3) {
        G.map.ensureAround(x, y, 1); // reading never grows a chunk: grow this one before judging what stands in it
        let clear = true;
        for (let dy = -3; dy <= 4 && clear; dy++) for (let dx = -3; dx <= 4 && clear; dx++) clear = G.map.isWalkableTile(x + dx, y + dy) && G.map.tileAt(x + dx, y + dy).room === 0 && !G.map.tileAt(x + dx, y + dy).n && !G.map.tileAt(x + dx, y + dy).w && !G.map.tileAt(x + dx, y + dy).prop; // no prop at all: a door's tiles stay clear
        if (clear) c = [x, y];
      }
    }
    if (!c) {
      row("open ground was found", false, "none in the loaded map");
      return finish();
    }
    const [cx, cy] = c;
    G.teleport(cx, cy + 2);
    const edgeAt = (i) => [cx + i, cy, "n"]; // a run of north edges in a row
    const build = (what, [x, y, e]) => {
      G.teleport(x, y + 1); // beside the edge, within reach
      const ok = G.placement.performPlacement(me, { kind: "build", what, tx: x, ty: y, edge: e });
      step(60 * 5);
      return ok;
    };
    const wallAt = ([x, y, e]) => G.map.tileAt(x, y)[e];
    for (let i = 0; i < 6; i++) { G.map.buildWall(...edgeAt(i), "wall", "wall_log"); made.push(edgeAt(i)); }

    // A door over a plain wall.
    build("door", edgeAt(0));
    const d = wallAt(edgeAt(0));
    row("a door is built over a wall: the edge is a door, of the wall's material, remembering the wall", d && d.kind === "door" && d.sprite === "wall_log" && d.under === "wall_log" && d.built === true && !d.broken, d ? `${d.kind}, ${d.sprite}, under ${d.under}, hp ${d.hp}` : "nothing");
    // A window over a plain wall.
    build("window", edgeAt(1));
    const w = wallAt(edgeAt(1));
    row("a window is built over a wall: the edge is a window with shutters", w && w.kind === "window" && w.shutter === "closed" && w.under === "wall_log", w ? `${w.kind}, shutter ${w.shutter}` : "nothing");
    // The removal tool puts the wall back.
    G.teleport(cx, cy + 1);
    G.placement.performPlacement(me, { kind: "remove", target: { type: "wall", tx: edgeAt(0)[0], ty: edgeAt(0)[1], edge: "n" } });
    const back = wallAt(edgeAt(0));
    row("the removal tool takes the door out and the wall is back, never a hole", back && back.kind === "wall" && back.sprite === "wall_log", back ? back.kind : "a hole");

    // Over a broken door or window: a new one.
    build("door", edgeAt(2));
    const door = wallAt(edgeAt(2));
    door.broken = true;
    door.open = true;
    door.hp = 0;
    G.map.touch(edgeAt(2)[0], edgeAt(2)[1]);
    build("door", edgeAt(2));
    const fresh = wallAt(edgeAt(2));
    row("over a broken door a new one is built, never a repair: whole, shut, full health", fresh && fresh.kind === "door" && !fresh.broken && !fresh.open && fresh.hp > 0 && fresh !== door, fresh ? `${fresh.kind}, broken ${fresh.broken}, open ${fresh.open}, hp ${fresh.hp}` : "nothing");
    // A whole door is not built over.
    const refused = G.map.canBuildWall(edgeAt(2)[0], edgeAt(2)[1], "n", "door");
    row("a whole door or window cannot be built over", refused === false && !G.map.canBuildWall(edgeAt(1)[0], edgeAt(1)[1], "n", "window"), `door ${refused}`);
    // Shutters: a broken window is rebuilt as a new one.
    const win = wallAt(edgeAt(1));
    win.broken = true;
    win.shutter = "open";
    win.hp = 0;
    G.map.touch(edgeAt(1)[0], edgeAt(1)[1]);
    build("window", edgeAt(1));
    const shutters = wallAt(edgeAt(1));
    row("broken shutters are rebuilt as new: a window, closed, whole", shutters && shutters.kind === "window" && !shutters.broken && shutters.shutter === "closed" && shutters.hp > 0, shutters ? `${shutters.kind}, ${shutters.shutter}, hp ${shutters.hp}` : "nothing");

    // A fence takes a gate and not a window.
    G.map.destroyWall(...edgeAt(4));
    G.map.buildWall(...edgeAt(4), "wall", "wall_fence");
    row("a gate (a door) may be built over a fence, a window may not", G.map.canBuildWall(edgeAt(4)[0], edgeAt(4)[1], "n", "door") && !G.map.canBuildWall(edgeAt(4)[0], edgeAt(4)[1], "n", "window"), "fence edge");

    // Whatever the wall is made of, the door built in it breaks (stone stands only to the dead as a wall; every entrance is breakable).
    const stoneAt = edgeAt(5);
    G.map.destroyWall(...stoneAt);
    G.map.buildWall(...stoneAt, "wall", "wall_stone");
    build("door", stoneAt);
    const sd = wallAt(stoneAt);
    row("a door built in a stone wall has hit points, so the dead can break it", sd && sd.kind === "door" && sd.sprite === "wall_stone" && Number.isFinite(sd.hp) && sd.hp > 0, sd ? `${sd.kind} of ${sd.sprite}, hp ${sd.hp}` : "nothing");
    // The removal tool keeps what was the player's: a built wall with a door in it is a built wall again.
    const own = edgeAt(3);
    G.map.destroyWall(...own);
    G.map.buildWall(...own, "wall", "wall_log"); // built by the player (`built`)
    build("door", own);
    G.teleport(own[0], own[1] + 1);
    G.placement.performPlacement(me, { kind: "remove", target: { type: "wall", tx: own[0], ty: own[1], edge: "n" } });
    const ownBack = wallAt(own);
    row("the player's own wall with a door removed is still the player's own (it can be removed)", ownBack && ownBack.kind === "wall" && ownBack.built === true, ownBack ? `${ownBack.kind}, built ${ownBack.built}` : "a hole");
    // A broken door stamped into a wall, built anew, still stands in that wall.
    const again = edgeAt(2);
    const old = wallAt(again);
    old.broken = true;
    old.open = true;
    old.hp = 0;
    build("door", again);
    const renewed = wallAt(again);
    row("a new door built over a broken stamped one remembers the wall under it", renewed && renewed.kind === "door" && !renewed.broken && renewed.under === "wall_log", renewed ? `${renewed.kind}, under ${renewed.under}` : "nothing");
    G.teleport(again[0], again[1] + 1);
    G.placement.performPlacement(me, { kind: "remove", target: { type: "wall", tx: again[0], ty: again[1], edge: "n" } });
    const filled = wallAt(again);
    row("and removing it puts the wall back, never a hole", filled && filled.kind === "wall", filled ? filled.kind : "a hole");

    // ---- Take apart (docs/43, section 2), paid: Free building off.
    G.rules.set({ freeBuilding: false });
    const msg = () => (document.getElementById("message") || {}).textContent || "";
    const planks = () => G.inventory.countItem(bag, "plank");
    bag.items.length = 0;
    me.hands.main = null;
    me.hands.off = null;
    G.inventory.addItem(bag, "hammer", 1);
    G.inventory.addItem(bag, "plank", 3);
    build("door", own); // over the player's own log wall: three planks paid
    const paid = wallAt(own);
    const paidOk = paid && paid.kind === "door" && !paid.free && planks() === 0;
    G.teleport(own[0], own[1] + 1);
    G.placement.performPlacement(me, { kind: "remove", target: { type: "wall", tx: own[0], ty: own[1], edge: "n" } });
    const afterDoor = wallAt(own);
    row("a paid door taken apart gives half its planks back, rounded down (one of three), and the wall is back", paidOk && planks() === 1 && afterDoor && afterDoor.kind === "wall" && /take the door apart: 1 plank/i.test(msg()), `paid ${paidOk}; ${planks()} plank back; the edge ${afterDoor ? afterDoor.kind : "empty"}; "${msg()}"`);
    const logT = { type: "wall", tx: own[0], ty: own[1], edge: "n", wall: afterDoor };
    const logWhy = G.placement.takeApartProblem(me, logT);
    row("a log wall asks for the tool its build asks for (a hatchet, not the hammer), and gives nothing back from its one log", /hatchet/i.test(logWhy) && G.placement.partsOf(logT).back.length === 0, `"${logWhy}"; back ${JSON.stringify(G.placement.partsOf(logT).back)}`);
    G.rules.set({ freeBuilding: true });
    build("door", edgeAt(0));
    G.rules.set({ freeBuilding: false });
    const freeDoor = wallAt(edgeAt(0));
    const p0 = planks();
    G.teleport(edgeAt(0)[0], edgeAt(0)[1] + 1);
    G.placement.performPlacement(me, { kind: "remove", target: { type: "wall", tx: edgeAt(0)[0], ty: edgeAt(0)[1], edge: "n" } });
    row("a door built while Free building was on cost nothing, so taking it apart gives nothing back", freeDoor && freeDoor.free === true && planks() === p0 && wallAt(edgeAt(0)) && wallAt(edgeAt(0)).kind === "wall", `free ${freeDoor && freeDoor.free}; planks ${p0} then ${planks()}`);

    // A made chest: refused while it holds anything; empty, taken apart by its menu label for half its planks.
    const spot = [cx + 2, cy + 3];
    const chestAt = (made, at = spot) => {
      const q = G.map.createProp({ sprite: "chest", tile: at });
      if (made) q.made = true;
      q.bag = G.inventory.createBag(4, 3, "chest");
      q.searched = true;
      G.map.placeProp(q, at[0], at[1]);
      props.push(q);
      return q;
    };
    G.teleport(spot[0], spot[1] + 1.2);
    step();
    const chest = chestAt(true);
    G.grid.add(chest.bag, "apple", 1);
    const target = { kind: "prop", id: chest.id };
    const fullLabels = G.interact.actionsForTarget(target, me).map((a) => a.label);
    G.placement.performPlacement(me, { kind: "remove", target: { type: "prop", id: chest.id } });
    const stillThere = G.map.propById(chest.id);
    row("a made chest holding anything is not taken apart: its menu says to empty it, and the removal tool's click is refused", fullLabels.includes("Take apart (empty it first)") && !!stillThere && chest.bag.items.length === 1 && /Empty it first/.test(msg()), `${fullLabels.join(", ")}; still there ${!!stillThere}; "${msg()}"`);
    chest.bag.items.length = 0;
    const emptyLabel = G.interact.actionsForTarget(target, me).map((a) => a.label).find((l) => /^Take apart/.test(l));
    const pBefore = planks();
    const ran = emptyLabel ? G.interact.performByLabel(me, target, emptyLabel) : false;
    step(5);
    row("empty, it is taken apart by its menu's label (a guest's command), for half its four planks", emptyLabel === "Take apart (2 planks back)" && ran && !G.map.propById(chest.id) && planks() - pBefore === 2, `"${emptyLabel}"; ran ${ran}; gone ${!G.map.propById(chest.id)}; +${planks() - pBefore} planks`);
    // A full bag: what does not fit lies at the feet.
    const chest2 = chestAt(true);
    let filled2 = 0;
    for (let i = 0; i < 80; i++) filled2 += G.inventory.addItem(bag, "stone", 1);
    const feet = [Math.round(me.gx), Math.round(me.gy)];
    const floorBefore = G.map.itemsAt(feet[0], feet[1]).filter((e) => e.id === "plank").length;
    G.placement.performPlacement(me, { kind: "remove", target: { type: "prop", id: chest2.id } });
    const floorAfter = G.map.itemsAt(feet[0], feet[1]).filter((e) => e.id === "plank").length;
    row("with the bag full, what comes back lies on the floor at the player's feet", !G.map.propById(chest2.id) && floorAfter - floorBefore === 2, `${filled2} stones filled the bag; ${floorAfter - floorBefore} planks at the feet`);
    for (const e of G.map.itemsAt(feet[0], feet[1]).filter((q) => q.id === "plank")) G.map.takeItem(feet[0], feet[1], e);
    bag.items.length = 0;
    // The village's own chest: carried, never taken apart.
    const village = chestAt(false);
    const vLabels = G.interact.actionsForTarget({ kind: "prop", id: village.id }, me).map((a) => a.label);
    row("the village's own chest is carried (Pick up), never taken apart", vLabels.some((l) => /^Pick up chest/.test(l)) && !vLabels.some((l) => /^Take apart/.test(l)), vLabels.join(", "));
  } finally {
    for (const q of props) if (G.map.propById(q.id)) G.map.removeProp(q);
    if (bag) { bag.items.splice(0, bag.items.length, ...bag0); for (const [e, n] of counts0) e.count = n; }
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    for (const [x, y, e] of made) if (G.map.tileAt(x, y)[e]) G.map.destroyWall(x, y, e);
    G.teleport(meAt[0], meAt[1]);
    G.rules.set({ freeBuilding: free0, zombieAggro: aggro0 });
    G.loop.setPaused(wasPaused);
  }
  return finish();

  function finish() {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  }
}
