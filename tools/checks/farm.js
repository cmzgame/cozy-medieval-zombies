// Farming (#194; docs/30 sections 8 and 14). From the console, on a tab with `?nosave`:
//   await __game.check("farm")
// It tills a patch of bare grass beside the player, plants a potato, grows it over its days with the soil dry and watered, harvests it with
// the seeds back, and tries each verb by the menu's label on the tile's or prop's address (a guest's path) and by the Use mode. The clock,
// the floors, the props, the bag, the hands, and the place are put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const farming = await import("/src/farming.js");
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const clock0 = G.clock.getElapsed();
  const wasPaused = G.loop.isPaused();
  const DAY = G.clock.DAY_LENGTH;
  const restore = [];
  const count = (id) => G.inventory.countAll(me, id);
  const mk = (id, props = {}) => G.items.makeEntry(id, 1, props);
  const labels = (target) => G.interact.actionsForTarget(target, me).map((a) => a.label);
  const lastLine = async () => (await import("/src/ui/log.js")).lines().slice(-1)[0] || "";
  const setNow = (t) => { G.clock.setElapsed(t); };
  const crops = farming.get().crops;
  try {
    G.loop.setPaused(true);
    farming.reset();

    // The data.
    const kinds = Object.keys(crops);
    row("five crops in data, each with a seed item tagged seed, a harvest item, and three stages", kinds.length === 5 && kinds.every((k) => G.items.getItem(crops[k].seed).tags.includes("seed") && G.items.getItem(crops[k].harvest.item) && [0, 1, 2].every((s) => G.assets.getDef(`crop_${k}_${s}`).crop.kind === k)), kinds.join(", "));
    row("the hoe lists the verb till, and the workbench makes it from a stick and a plank", G.items.getItem("hoe").verbs.includes("till") && G.stations.recipe("hoe").station === "workbench", JSON.stringify(G.stations.recipe("hoe").in));

    // A patch of bare grass: two tiles side by side with nothing on or round them.
    let at = null;
    G.map.ensureAround(me.gx, me.gy, 3);
    for (let dy = -14; dy <= 14 && !at; dy++) for (let dx = -14; dx <= 14 && !at; dx++) {
      const x = Math.round(me.gx) + dx;
      const y = Math.round(me.gy) + dy;
      const ok = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [2, 0]].every(([ax, ay]) => { const t = G.map.peekTile(x + ax, y + ay); return t && t.floor === "floor_grass" && !t.prop && G.map.isWalkableTile(x + ax, y + ay) && !t.n && !t.w; });
      if (ok) at = [x, y];
    }
    if (!at) throw new Error("no bare grass to farm near the player");
    const [x, y] = at;
    G.teleport(x - 0.9, y + 0.1);
    me.hands.main = null;
    me.hands.off = null;
    restore.push(() => { for (const [ax, ay] of [[0, 0], [1, 0]]) { const t = G.map.peekTile(x + ax, y + ay); if (t && t.prop && t.prop.crop) G.map.removeProp(t.prop); G.map.setFloor(x + ax, y + ay, "floor_grass"); } });

    // Till.
    const run1 = (verb, target) => G.verbs.run(verb, G.world, me, target);
    row("without a hoe in hand the soil cannot be tilled, and the menu offers nothing", !run1("till", { tile: [x, y] }).ok && !labels({ kind: "tile", tile: [x, y] }).includes("Till the soil"), String(run1("till", { tile: [x, y] }).reason));
    const hoe = mk("hoe");
    me.hands.main = hoe;
    row("with the hoe in hand the tile's menu offers Till the soil", labels({ kind: "tile", tile: [x, y] }).includes("Till the soil"), labels({ kind: "tile", tile: [x, y] }).join(", "));
    const tilled = run1("till", { tile: [x, y] });
    const floor = G.map.peekTile(x, y).floor;
    row("tilling turns bare grass to soil, its furrows along the way the player faces (east of the player: along x)", tilled.ok && floor === "floor_farm", `${floor}`);
    row("an already tilled tile is refused", !run1("till", { tile: [x, y] }).ok && /already/.test(run1("till", { tile: [x, y] }).reason), String(run1("till", { tile: [x, y] }).reason));
    G.teleport(x + 1.1, y - 1.4);
    row("and from the north the furrows run along y", run1("till", { tile: [x + 1, y] }).ok && G.map.peekTile(x + 1, y).floor === "floor_farm_y", G.map.peekTile(x + 1, y).floor);
    G.teleport(x - 0.9, y + 0.1);

    // Plant.
    const seed = G.items.makeEntry("potato_seed", 3);
    G.inventory.stow(me, seed);
    me.hands.main = null;
    row("a seed carried is offered at tilled soil only", labels({ kind: "tile", tile: [x, y] }).includes("Plant potato") && !labels({ kind: "tile", tile: [x + 5, y + 5] }).includes("Plant potato"), labels({ kind: "tile", tile: [x, y] }).join(", "));
    const planted = run1("plant", { tile: [x, y], crop: "potato" });
    const crop = G.map.peekTile(x, y).prop;
    row("planting takes one seed and puts the crop at stage 0, its rows along the furrows", planted.ok && count("potato_seed") === 2 && crop && crop.sprite === "crop_potato_0" && crop.facing === "x" && crop.crop.kind === "potato" && crop.solid === false, `${crop && crop.sprite}, facing ${crop && crop.facing}, ${count("potato_seed")} seeds left`);
    row("a planted tile takes no second seed, and grass takes none", !run1("plant", { tile: [x, y], crop: "potato" }).ok && !run1("plant", { tile: [x - 1, y], crop: "potato" }).ok, `${run1("plant", { tile: [x, y], crop: "potato" }).reason}; ${run1("plant", { tile: [x - 1, y], crop: "potato" }).reason}`);

    // Growth over days, dry and watered.
    const t0 = G.clock.getElapsed();
    const stageAt = (t) => farming.stageOf(crop, t);
    row("a potato (2 days, then 2) is stage 0 before day 2 and stage 1 after it, while the soil is wet", stageAt(t0 + 1.9 * DAY) === 0 && stageAt(t0 + 2.1 * DAY) === 1, `${stageAt(t0 + 1.9 * DAY)} then ${stageAt(t0 + 2.1 * DAY)}`);
    const wetDays = farming.get().soil.wetDays;
    row("with no water growth stops when the soil dries, at the two wet days: never ready, and the crop is not killed", stageAt(t0 + 30 * DAY) === 1 && farming.daysLeft(crop, t0 + 30 * DAY) > 1.9 && !farming.isWet(crop, t0 + 30 * DAY), `stage ${stageAt(t0 + 30 * DAY)}, ${farming.daysLeft(crop, t0 + 30 * DAY).toFixed(2)} days left after thirty, wet ${farming.isWet(crop, t0 + 30 * DAY)} (wet ${wetDays} days)`);
    setNow(t0 + 3 * DAY);
    const skin = G.items.makeEntry("waterskin", 1, { fill: 100 });
    G.inventory.stow(me, skin);
    me.hands.main = null;
    row("a dry crop's menu offers Water with a skin and says it waits", labels({ kind: "prop", id: crop.id }).includes("Water") && labels({ kind: "prop", id: crop.id }).some((l) => /^Dry: waiting for water/.test(l)), labels({ kind: "prop", id: crop.id }).join(", "));
    const watered = run1("water", { prop: crop.id, entry: skin.uid });
    row("watering costs the skin's fill and soaks the soil again", watered.ok && skin.fill === 100 - farming.get().soil.fillCost && farming.isWet(crop), `fill ${skin.fill}`);
    const t1 = G.clock.getElapsed();
    row("and growth goes on from where it stopped: ready two more wet days on, not before", stageAt(t1 + 1.9 * DAY) === 1 && stageAt(t1 + 2.1 * DAY) === 2 && stageAt(t1 + 40 * DAY) === 2, `${stageAt(t1 + 1.9 * DAY)} then ${stageAt(t1 + 2.1 * DAY)}`);
    row("an empty skin cannot water", (() => { const f = skin.fill; skin.fill = 5; const r = run1("water", { prop: crop.id, entry: skin.uid }); skin.fill = f; return !r.ok && /waterskin/.test(r.reason); })(), "refused below the cost");

    // The picture follows the stage; harvest waits for ready.
    setNow(t1 + 0.5 * DAY);
    G.game.begin(0);
    row("the picture follows the stage on the world's step", crop.sprite === "crop_potato_1", crop.sprite);
    row("a crop not ready cannot be harvested, and its menu says how long", !run1("harvest", { prop: crop.id }).ok && labels({ kind: "prop", id: crop.id }).some((l) => /^Growing \(ready in about/.test(l)), `${run1("harvest", { prop: crop.id }).reason}; ${labels({ kind: "prop", id: crop.id }).join(", ")}`);

    // A saved crop (an evicted chunk keeps it as it was) is at the right stage the moment it loads.
    const copy = { ...JSON.parse(JSON.stringify(G.map.serializeProp(crop))), id: "p_farm_check" };
    const revived = G.map.reviveProp(copy, false);
    row("a crop saved and loaded again reads the same stage at any later time (the derived numbers are in the record)", [0.1, 1, 2.5, 9].every((d) => farming.stageOf(revived, t1 + d * DAY) === farming.stageOf(crop, t1 + d * DAY)), "the record carries kind, grown, at, wetUntil");

    // Growth through fast time: the clock's gain is the crop's, so a slept night grows it.
    const before = farming.growth(crop);
    const c0 = G.clock.getElapsed();
    G.world.setTimeScale(G.tuning.world.sleepTimeScale);
    G.loop.setPaused(false);
    for (let i = 0; i < 600; i++) G.loop.advance(1 / 60);
    G.loop.setPaused(true);
    G.world.setTimeScale(1);
    const gained = G.clock.getElapsed() - c0;
    const grew = farming.growth(crop) - before;
    row("stepped at the sleep time scale the crop grows by exactly the clock's gain (a night's sleep grows the fields)", gained > 10 && Math.abs(grew - gained) < 1e-6, `clock +${gained.toFixed(1)} s, growth +${grew.toFixed(1)} s`);

    // Harvest, ready.
    crop.crop.grown = 4 * DAY;
    crop.crop.at = G.clock.getElapsed();
    crop.crop.wetUntil = G.clock.getElapsed() + DAY;
    G.game.begin(0);
    const foodBefore = count("potato");
    const seedsBefore = count("potato_seed");
    const list = labels({ kind: "prop", id: crop.id });
    row("a ready crop's menu offers Harvest (and E, a simple action)", list.includes("Harvest") && G.interact.actionsForTarget({ kind: "prop", id: crop.id }, me).find((a) => a.label === "Harvest").simple === true, list.join(", "));
    const did = G.interact.performByLabel(me, { kind: "prop", id: crop.id }, "Harvest");
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    const [lo, hi] = crops.potato.harvest.count;
    const gotFood = count("potato") - foodBefore;
    row("a guest's command (the label on the crop's id) harvests: the food in range and two seeds back, the crop gone, the tile still soil", did === true && gotFood >= lo && gotFood <= hi && count("potato_seed") - seedsBefore === crops.potato.seeds && !G.map.peekTile(x, y).prop && G.map.peekTile(x, y).floor === "floor_farm", `+${gotFood} potatoes, +${count("potato_seed") - seedsBefore} seeds, floor ${G.map.peekTile(x, y).floor}`);

    // The menu by label on the tile (a guest's way) and the Use mode.
    me.hands.main = mk("hoe");
    G.teleport(x + 1.4, y + 0.5);
    G.map.setFloor(x + 1, y, "floor_grass");
    const viaLabel = G.interact.performByLabel(me, { kind: "tile", tile: [x + 1, y] }, "Till the soil");
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    row("a guest's Till the soil, by the tile's address, tills", viaLabel === true && /^floor_farm/.test(G.map.peekTile(x + 1, y).floor), G.map.peekTile(x + 1, y).floor);
    me.hands.main = null;
    const viaPlant = G.interact.performByLabel(me, { kind: "tile", tile: [x + 1, y] }, "Plant potato");
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    const crop2 = G.map.peekTile(x + 1, y).prop;
    row("and Plant potato by the tile's address plants it", viaPlant === true && !!crop2 && !!crop2.crop, crop2 ? crop2.sprite : "nothing");
    // The Use mode (a row in interactions.json per pair): a seed on soil, the skin on a crop, the hoe on grass.
    G.teleport(x - 0.4, y + 0.6);
    me.hands.main = mk("hoe");
    G.use.applyWith(me.hands.main, { kind: "tile", x: x - 1, y, floor: "floor_grass" }, me);
    const usedHoe = G.map.peekTile(x - 1, y).floor;
    row("by the Use mode the hoe tills grass", /^floor_farm/.test(usedHoe), `${usedHoe}; "${await lastLine()}"`);
    restore.push(() => G.map.setFloor(x - 1, y, "floor_grass"));
    me.hands.main = null;
    G.inventory.stow(me, G.items.makeEntry("potato_seed", 1));
    const seedEntry = bag.items.find((e) => e.id === "potato_seed");
    G.use.applyWith(seedEntry, { kind: "tile", x: x - 1, y, floor: G.map.peekTile(x - 1, y).floor }, me);
    const used = G.map.peekTile(x - 1, y).prop;
    row("a seed on soil plants it by the Use mode", !!used && !!used.crop, used ? used.sprite : `nothing; "${await lastLine()}"`);
    restore.push(() => { const t = G.map.peekTile(x - 1, y); if (t && t.prop) G.map.removeProp(t.prop); });
    if (used) {
      const f0 = skin.fill;
      G.use.applyWith(skin, { kind: "prop", prop: used }, me);
      row("and the skin on the crop waters it", skin.fill === f0 - farming.get().soil.fillCost, `fill ${f0} to ${skin.fill}`);
    }

    // The map's own crops are live: the home plot at its authored stages, settled, ready ones harvestable.
    const home = G.map.allProps().filter((p) => p.crop && p.crop.kind && (p.sprite === "crop_potato_2" || p.sprite === "crop_cabbage_2" || p.sprite === "crop_potato_1" || p.sprite === "crop_cabbage_1"));
    G.map.ensureAround(me.gx, me.gy, 3);
    farming.reset();
    G.game.begin(0);
    const live = G.map.allProps().filter((p) => p.crop && p.crop.at !== undefined && p.id !== crop.id && (!crop2 || p.id !== crop2.id) && (!used || p.id !== used.id));
    row("the map's authored crops are settled live at their authored stage on the first step", live.length > 0 && live.every((p) => farming.stageOf(p) === Number(p.sprite.slice(-1))), `${live.length} settled; ${home.length} authored crops in view`);
  } finally {
    for (const r of restore.reverse()) r();
    G.world.setTimeScale(1);
    setNow(clock0);
    farming.reset();
    bag.items.splice(0, bag.items.length, ...bag0);
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    me.action = null;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
