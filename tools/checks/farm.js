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
  const belt = G.inventory.beltOf(me);
  const belt0 = belt ? belt.slice() : null; // a stowed bucket can land on the belt: put the belt back too
  const clock0 = G.clock.getElapsed();
  const body0 = { hp: me.hp, bleed: me.bleed, hunger: me.hunger, thirst: me.thirst }; // the growth section's sleep steps let the dead bite: put the player back, so a second run starts well
  const wasPaused = G.loop.isPaused();
  const DAY = G.clock.DAY_LENGTH;
  const restore = [];
  const count = (id) => G.inventory.countAll(me, id);
  const mk = (id, props = {}) => G.items.makeEntry(id, 1, props);
  const labels = (target) => G.interact.actionsForTarget(target, me).map((a) => a.label); // the host's rebuild of a command by its address
  const menu = (x, y) => { const s = G.iso.toScreen(x, y); return G.interact.actionsAt(s.x, s.y, me).map((a) => a.label); }; // the menu a player (and a guest) opens, at a tile's canvas point
  const lastLine = async () => (await import("/src/ui/log.js")).lines().slice(-1)[0] || "";
  const setNow = (t) => { G.clock.setElapsed(t); };
  const crops = farming.get().crops;
  try {
    G.loop.setPaused(true);
    farming.reset();

    // The data.
    const kinds = Object.keys(crops);
    row("six crops in data, each with a seed item tagged seed, a harvest item, and three stages", kinds.length === 6 && kinds.every((k) => G.items.getItem(crops[k].seed).tags.includes("seed") && G.items.getItem(crops[k].harvest.item) && [0, 1, 2].every((s) => G.assets.getDef(`crop_${k}_${s}`).crop.kind === k)), kinds.join(", "));
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
    row("without a hoe in hand the soil cannot be tilled, and the menu offers nothing", !run1("till", { tile: [x, y] }).ok && !labels({ kind: "tile", tile: [x, y] }).includes("Till the soil") && !menu(x, y).includes("Till the soil"), String(run1("till", { tile: [x, y] }).reason));
    const hoe = mk("hoe");
    me.hands.main = hoe;
    row("with the hoe in hand the tile's menu (the right-click one, and the address a guest sends) offers Till the soil, and Walk here stays beside it", menu(x, y).includes("Till the soil") && menu(x, y).includes("Walk here") && labels({ kind: "tile", tile: [x, y] }).includes("Till the soil"), menu(x, y).join(", "));
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
    row("a seed carried is offered at tilled soil only (in the right-click menu and by address)", menu(x, y).includes("Plant potato") && labels({ kind: "tile", tile: [x, y] }).includes("Plant potato") && !menu(x + 5, y + 5).includes("Plant potato"), labels({ kind: "tile", tile: [x, y] }).join(", "));
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
    row("a crop's record through JSON (what a save and a frame carry) reads the same stage at any later time (the derived numbers are in the record)", [0.1, 1, 2.5, 9].every((d) => farming.stageOf(revived, t1 + d * DAY) === farming.stageOf(crop, t1 + d * DAY)), "the record carries kind, grown, at, wetUntil");

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
    row("the menu's label on the crop's id (a guest's command, run here on the host as the player) harvests: the food in range and two seeds back, the crop gone, the tile still soil", did === true && gotFood >= lo && gotFood <= hi && count("potato_seed") - seedsBefore === crops.potato.seeds && !G.map.peekTile(x, y).prop && G.map.peekTile(x, y).floor === "floor_farm", `+${gotFood} potatoes, +${count("potato_seed") - seedsBefore} seeds, floor ${G.map.peekTile(x, y).floor}`);

    // The menu by label on the tile (a guest's way) and the Use mode.
    me.hands.main = mk("hoe");
    G.teleport(x + 1.4, y + 0.5);
    G.map.setFloor(x + 1, y, "floor_grass");
    const viaLabel = G.interact.performByLabel(me, { kind: "tile", tile: [x + 1, y] }, "Till the soil");
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    row("Till the soil by the tile's address (a guest's command, run here on the host as the player) tills", viaLabel === true && /^floor_farm/.test(G.map.peekTile(x + 1, y).floor), G.map.peekTile(x + 1, y).floor);
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

    // The map's own crops are live: a crop the map authored by stage (its definition's `crop: { kind, stage }`) is settled at that stage on the
    // first pass, whatever the sprite says (three made here, at stages 0, 1, and 2, and unsettled as the loader leaves them).
    const findGrass = (w, h) => {
      G.map.ensureAround(me.gx, me.gy, 3);
      for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
        const px = Math.round(meAt[0]) + dx;
        const py = Math.round(meAt[1]) + dy;
        let ok = true;
        for (let ay = 0; ay < h && ok; ay++) for (let ax = 0; ax < w && ok; ax++) { const t = G.map.peekTile(px + ax, py + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w && !(G.map.peekTile(px + ax, py + ay + 1) || {}).n && G.map.isWalkableTile(px + ax, py + ay); }
        if (ok) return [px, py];
      }
      throw new Error("no bare grass");
    };
    const [ax0, ay0] = findGrass(3, 1);
    const authored = [0, 1, 2].map((st) => { const c = G.map.createProp({ sprite: `crop_cabbage_${st}`, tile: [ax0 + st, ay0] }); G.map.setFloor(ax0 + st, ay0, "floor_farm"); G.map.placeProp(c, ax0 + st, ay0); restore.push(() => { const t = G.map.propById(c.id); if (t) G.map.removeProp(t); G.map.setFloor(ax0 + st, ay0, "floor_grass"); }); return [c, st]; });
    const unsettled = authored.every(([c]) => c.crop && c.crop.at === undefined && c.crop.stage !== undefined);
    farming.reset();
    G.game.begin(0);
    row("the map's authored crops are settled live at their authored stage on the first pass (unsettled before it, wet and at that stage's growth after)", unsettled && authored.every(([c, st]) => c.crop.at !== undefined && c.crop.stage === undefined && farming.stageOf(c) === st && farming.isWet(c) && c.sprite === `crop_cabbage_${st}`), authored.map(([c]) => `${c.sprite}:${farming.stageOf(c)}`).join(", "));

    // Through a wall (the reviewer of #194 tilled, planted, and harvested from inside a house): a closed wall between the player and the tile
    // stops every verb; a sealed room is a cell (#147).
    const [gx0, gy0] = findGrass(2, 3); // two columns, three rows: the soil row beyond, the wall's row, the player's row
    const wx = gx0;
    const wy = gy0 + 1;
    G.map.setFloor(wx, wy - 1, "floor_farm");
    const beyond = G.map.createProp({ sprite: "crop_potato_2", tile: [wx + 1, wy - 1], solid: false });
    beyond.crop = { kind: "potato", grown: 99 * DAY, at: G.clock.getElapsed(), wetUntil: G.clock.getElapsed() + 9 * DAY };
    G.map.placeProp(beyond, wx + 1, wy - 1);
    G.map.setFloor(wx + 1, wy - 1, "floor_farm");
    G.map.buildWall(wx, wy, "n", "wall");
    G.map.buildWall(wx + 1, wy, "n", "wall");
    restore.push(() => { G.map.destroyWall(wx, wy, "n"); G.map.destroyWall(wx + 1, wy, "n"); const t = G.map.propById(beyond.id); if (t) G.map.removeProp(t); G.map.setFloor(wx, wy - 1, "floor_grass"); G.map.setFloor(wx + 1, wy - 1, "floor_grass"); });
    me.hands.main = mk("hoe");
    G.teleport(wx + 0.3, wy + 0.4); // a step from the tile beyond the wall: near enough, a wall in the way
    const seed2 = G.items.makeEntry("potato_seed", 2);
    G.inventory.stow(me, seed2);
    G.inventory.stow(me, G.items.makeEntry("waterskin", 1, { fill: 100 }));
    const through = {
      till: G.verbs.run("till", G.world, me, { tile: [wx, wy - 1] }),
      plant: G.verbs.run("plant", G.world, me, { tile: [wx, wy - 1], crop: "potato" }),
      water: G.verbs.run("water", G.world, me, { prop: beyond.id }),
      harvest: G.verbs.run("harvest", G.world, me, { prop: beyond.id }),
    };
    row("a wall between the player and the tile stops till, plant, water, and harvest alike", Object.values(through).every((r) => !r.ok && /wall/.test(r.reason)) && !!G.map.propById(beyond.id), JSON.stringify(Object.fromEntries(Object.entries(through).map(([k, r]) => [k, r.reason]))));
    row("and the right-click menu does not offer Plant or Till across it (offered and refused is worse)", !menu(wx, wy - 1).includes("Plant potato") && !menu(wx + 1, wy - 1).includes("Plant potato"), menu(wx, wy - 1).join(", "));
    G.map.destroyWall(wx, wy, "n");
    G.map.destroyWall(wx + 1, wy, "n");
    row("and with the wall gone the same reach works", G.verbs.run("harvest", G.world, me, { prop: beyond.id }).ok, "harvested once the wall is down");
    me.hands.main = null;

    // The scythe (#200): a swing harvests the ready grain on the three tiles ahead, and nothing else.
    row("rye is the grain crop (a flag in data), and the scythe lists the verb harvest", crops.rye.grain === true && !crops.potato.grain && G.items.getItem("scythe").verbs.includes("harvest"), "grain: rye");
    let field = null;
    G.map.ensureAround(me.gx, me.gy, 3);
    for (let dy = -14; dy <= 14 && !field; dy++) for (let dx = -14; dx <= 14 && !field; dx++) {
      const fx = Math.round(me.gx) + dx;
      const fy = Math.round(me.gy) + dy;
      let ok = true;
      for (let ay = -2; ay <= 2 && ok; ay++) for (let ax = -1; ax <= 4 && ok; ax++) { const t = G.map.peekTile(fx + ax, fy + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w && G.map.isWalkableTile(fx + ax, fy + ay); }
      if (ok) field = [fx, fy];
    }
    if (!field) throw new Error("no bare grass for a field");
    const [fx, fy] = field;
    const sow = (kind, stage, x, y) => {
      G.map.setFloor(x, y, "floor_farm");
      const c = G.map.createProp({ sprite: `crop_${kind}_${stage}`, tile: [x, y], solid: false });
      const now = G.clock.getElapsed();
      c.crop = { kind, grown: stage === 2 ? 99 * DAY : 0, at: now, wetUntil: now + 9 * DAY };
      G.map.placeProp(c, x, y);
      restore.push(() => { const t = G.map.propById(c.id); if (t) G.map.removeProp(t); G.map.setFloor(x, y, "floor_grass"); });
      return c;
    };
    // The player at (fx, fy) faces +x: the tiles ahead are x+1 with y-1, y, y+1.
    const ahead = sow("rye", 2, fx + 1, fy);
    const left = sow("rye", 2, fx + 1, fy - 1);
    const unripe = sow("rye", 0, fx + 1, fy + 1);
    const farOne = sow("rye", 2, fx + 3, fy);
    const potato = sow("potato", 2, fx + 1, fy + 2);
    me.hands.main = G.items.makeEntry("scythe", 1);
    me.hands.off = null;
    me.attackCooldown = 0;
    me.stamina = me.maxStamina ?? 100;
    G.teleport(fx, fy);
    const p0 = G.iso.toScreen(fx, fy);
    const p1 = G.iso.toScreen(fx + 1, fy);
    me.aim = { sx: p1.x - p0.x, sy: p1.y - p0.y };
    const grain0 = count("grain");
    const seeds0 = count("rye_seed");
    const swung = G.combat.tryAttack(me, G.zombies, "main");
    row("a swing with the scythe harvests the two ready rye ahead and leaves the unripe one, the far one, and the potato", Array.isArray(swung) && !G.map.propById(ahead.id) && !G.map.propById(left.id) && !!G.map.propById(unripe.id) && !!G.map.propById(farOne.id) && !!G.map.propById(potato.id), `ahead ${!!G.map.propById(ahead.id)}, left ${!!G.map.propById(left.id)}, unripe ${!!G.map.propById(unripe.id)}, far ${!!G.map.propById(farOne.id)}`);
    const [ryeLo, ryeHi] = crops.rye.harvest.count;
    row("the grain and the seeds of the two rows went into the bag, and the tiles stay soil", count("grain") - grain0 >= 2 * ryeLo && count("grain") - grain0 <= 2 * ryeHi && count("rye_seed") - seeds0 === 2 * crops.rye.seeds && G.map.peekTile(fx + 1, fy).floor === "floor_farm" && G.map.peekTile(fx + 1, fy - 1).floor === "floor_farm", `+${count("grain") - grain0} grain, +${count("rye_seed") - seeds0} seeds`);
    me.attackCooldown = 0;
    me.stamina = me.maxStamina ?? 100;
    const again = G.combat.tryAttack(me, G.zombies, "main");
    row("a second swing over the same tiles cuts nothing more (and still swings)", Array.isArray(again) && !!G.map.propById(unripe.id) && count("rye_seed") - seeds0 === 2 * crops.rye.seeds, "no more");
    // The unripe one, ripened, falls to the next swing; a sword cuts nothing.
    unripe.crop.grown = 99 * DAY;
    me.hands.main = G.items.makeEntry("sword", 1);
    me.attackCooldown = 0;
    me.stamina = me.maxStamina ?? 100;
    const swordSwing = G.combat.tryAttack(me, G.zombies, "main");
    row("a swing with a sword cuts nothing (and the swing happened)", Array.isArray(swordSwing) && !!G.map.propById(unripe.id), "the ripe one stands");
    me.hands.main = G.items.makeEntry("scythe", 1);
    me.attackCooldown = 0;
    me.stamina = me.maxStamina ?? 100;
    G.combat.tryAttack(me, G.zombies, "main");
    row("and the scythe takes it once it is ripe", !G.map.propById(unripe.id), "gone");
    // The off hand: a scythe in the off hand harvests too.
    const off = sow("rye", 2, fx + 1, fy);
    me.hands.main = null;
    me.hands.off = G.items.makeEntry("scythe", 1);
    me.offCooldown = 0;
    me.stamina = me.maxStamina ?? 100;
    G.combat.tryAttack(me, G.zombies, "off");
    row("a scythe in the off hand harvests when that hand swings", !G.map.propById(off.id), "gone");
    // Through a wall (a sealed room is a cell, #147): the three tiles ahead are the same clear-line rule as the hand's.
    const behind = [sow("rye", 2, fx + 1, fy - 1), sow("rye", 2, fx + 1, fy), sow("rye", 2, fx + 1, fy + 1)];
    for (const dy of [-1, 0, 1]) G.map.buildWall(fx + 1, fy + dy, "w", "wall");
    restore.push(() => { for (const dy of [-1, 0, 1]) G.map.destroyWall(fx + 1, fy + dy, "w"); });
    me.hands.main = G.items.makeEntry("scythe", 1);
    me.hands.off = null;
    me.attackCooldown = 0;
    me.stamina = me.maxStamina ?? 100;
    G.combat.tryAttack(me, G.zombies, "main");
    row("a scythe swing across a wall cuts nothing", behind.every((c) => !!G.map.propById(c.id)), "the three stand");
    for (const dy of [-1, 0, 1]) G.map.destroyWall(fx + 1, fy + dy, "w");
    me.attackCooldown = 0;
    me.stamina = me.maxStamina ?? 100;
    G.combat.tryAttack(me, G.zombies, "main");
    row("and the same swing with the wall gone cuts them", behind.every((c) => !G.map.propById(c.id)), "gone");
    me.hands.main = null;
    me.hands.off = null;
    // The bucket (#199; Michael, 2026-10-18: it goes in the bag): an item holding water in its entry's fill, filled at water, poured on a
    // plot to water the 3 by 3 round it.
    const bdef = G.items.getItem("bucket");
    row("the bucket is an ordinary item (bag, belt, or hand) that holds water (a vessel, capacity in data), made at the workbench from planks, and a waterskin is not one", bdef.hands === "either" && bdef.vessel.capacity > 0 && G.stations.recipe("bucket").station === "workbench" && G.stations.recipe("bucket").out.id === "bucket" && !G.items.getItem("waterskin").vessel && !bdef.capacity, JSON.stringify(G.stations.recipe("bucket").in));
    row("the first bucket is in your cottage's chest (a placed container's own table)", G.items.rollLoot("home_chest").some((e) => e.id === "bucket"), "home_chest");
    const pond = [86, 192];
    G.map.ensureAround(pond[0], pond[1], 3);
    me.hands.main = null;
    me.hands.off = null;
    G.teleport(pond[0] - 1.0, pond[1] + 0.2);
    const bucket = G.items.makeEntry("bucket", 1);
    G.inventory.stow(me, bucket);
    row("a new bucket is empty", (bucket.fill ?? 0) === 0, `fill ${bucket.fill}`);
    const atPond = G.interact.actionsForTarget({ kind: "tile", tile: pond }, me);
    row("carried in the bag, it offers Fill the bucket at the pond (and the waterskin's own entries are unchanged)", atPond.some((a) => a.label === "Fill the bucket" && a.enabled) && atPond.some((a) => a.label === "Drink from the water"), atPond.map((a) => a.label).join(", "));
    row("an empty bucket cannot pour, and nothing growing needs a pour", !G.verbs.run("pour", G.world, me, { tile: pond }).ok && /empty/.test(G.verbs.run("pour", G.world, me, { tile: pond }).reason), String(G.verbs.run("pour", G.world, me, { tile: pond }).reason));
    const filledBy = G.interact.performByLabel(me, { kind: "tile", tile: pond }, "Fill the bucket");
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    row("a guest's command (the label on the water's address) fills it to the capacity", filledBy === true && bucket.fill === bdef.vessel.capacity, `fill ${bucket.fill}`);
    row("a full bucket will not fill again", !G.verbs.run("fill", G.world, me, { tile: pond }).ok && /full/.test(G.verbs.run("fill", G.world, me, { tile: pond }).reason), String(G.verbs.run("fill", G.world, me, { tile: pond }).reason));
    G.teleport(pond[0] - 8, pond[1] - 8);
    row("too far from the water it is refused", (() => { bucket.fill = 0; const r = G.verbs.run("fill", G.world, me, { tile: pond }); bucket.fill = bdef.vessel.capacity; return !r.ok && /far/.test(r.reason); })(), "refused");
    // The Use mode: the bucket on the water fills it too.
    G.teleport(pond[0] - 1.0, pond[1] + 0.2);
    bucket.fill = 0;
    G.use.applyWith(bucket, { kind: "tile", x: pond[0], y: pond[1], floor: G.map.peekTile(pond[0], pond[1]).floor }, me);
    row("by the Use mode the bucket on water fills", bucket.fill === bdef.vessel.capacity, `fill ${bucket.fill}; "${await lastLine()}"`);

    // A plot of nine, all dry, and a tenth crop beyond the pour's 3 by 3.
    let plot = null;
    G.map.ensureAround(me.gx, me.gy, 3);
    for (let dy = -14; dy <= 14 && !plot; dy++) for (let dx = -14; dx <= 14 && !plot; dx++) {
      const px = Math.round(me.gx) + dx;
      const py = Math.round(me.gy) + dy;
      let ok = true;
      for (let ay = -1; ay <= 4 && ok; ay++) for (let ax = -1; ax <= 4 && ok; ax++) { const t = G.map.peekTile(px + ax, py + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w && G.map.isWalkableTile(px + ax, py + ay); }
      if (ok) plot = [px, py];
    }
    if (!plot) throw new Error("no bare grass for a plot of nine");
    const crops9 = [];
    for (let ay = 0; ay < 3; ay++) for (let ax = 0; ax < 3; ax++) {
      G.map.setFloor(plot[0] + ax, plot[1] + ay, "floor_farm");
      const c = G.map.createProp({ sprite: "crop_potato_0", tile: [plot[0] + ax, plot[1] + ay], solid: false });
      const now = G.clock.getElapsed();
      c.crop = { kind: "potato", grown: 0, at: now, wetUntil: now - 1 }; // dry
      G.map.placeProp(c, plot[0] + ax, plot[1] + ay);
      crops9.push(c);
    }
    G.map.setFloor(plot[0] + 3, plot[1], "floor_farm");
    const far = G.map.createProp({ sprite: "crop_potato_0", tile: [plot[0] + 3, plot[1]], solid: false });
    far.crop = { kind: "potato", grown: 0, at: G.clock.getElapsed(), wetUntil: G.clock.getElapsed() - 1 };
    G.map.placeProp(far, plot[0] + 3, plot[1]);
    restore.push(() => { for (const c of [...crops9, far]) { const t = G.map.propById(c.id); if (t) G.map.removeProp(t); } for (let ay = 0; ay < 3; ay++) for (let ax = 0; ax < 4; ax++) G.map.setFloor(plot[0] + ax, plot[1] + ay, "floor_grass"); });
    G.teleport(plot[0] + 1.2, plot[1] + 2.4);
    const onCrop = G.interact.actionsForTarget({ kind: "prop", id: crops9[4].id }, me);
    row("carried at a plot, a crop's menu offers Pour the bucket (and Water with a skin as before)", onCrop.some((a) => a.label === "Pour the bucket" && a.enabled) && onCrop.some((a) => a.label.startsWith("Water")), onCrop.map((a) => a.label).join(", "));
    G.teleport(plot[0] + 1.2, plot[1] + 1.8); // within the action's own reach, so the bar starts at once
    const stageDry = farming.stageOf(crops9[4], G.clock.getElapsed() + 5 * DAY);
    const poured = G.interact.performByLabel(me, { kind: "prop", id: crops9[4].id }, "Pour the bucket");
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    const now2 = G.clock.getElapsed();
    row("a guest's command pours it: all nine tiles are watered, and the tenth beyond the 3 by 3 is not", poured === true && crops9.every((c) => farming.isWet(c, now2)) && !farming.isWet(far, now2), `${crops9.filter((c) => farming.isWet(c, now2)).length} of 9 wet; the far one wet ${farming.isWet(far, now2)}`);
    row("the bucket is empty after one pour (one pour a fill)", bucket.fill === 0, `fill ${bucket.fill}`);
    row("a crop that was dry, watered by the pour, grows again: stage 1 after its first wet days where a dry one stays at stage 0", stageDry === 0 && farming.stageOf(crops9[4], now2 + 2.1 * DAY) === 1, `dry ${stageDry}, watered ${farming.stageOf(crops9[4], now2 + 2.1 * DAY)}`);
    // The Use mode: the bucket on a crop pours.
    bucket.fill = bdef.vessel.capacity;
    for (const c of crops9) c.crop.wetUntil = G.clock.getElapsed() - 1;
    G.use.applyWith(bucket, { kind: "prop", prop: crops9[4] }, me);
    row("by the Use mode the bucket on a crop pours: nine watered, the bucket empty", crops9.every((c) => farming.isWet(c)) && bucket.fill === 0, `${crops9.filter((c) => farming.isWet(c)).length} of 9; fill ${bucket.fill}`);
    // The Use mode and a guest's command by uid ask the same questions of the named bucket (the #211 review): an empty one cannot pour, a full one cannot fill.
    for (const c of crops9) c.crop.wetUntil = G.clock.getElapsed() - 1;
    bucket.fill = 0;
    G.use.applyWith(bucket, { kind: "prop", prop: crops9[4] }, me);
    const emptyLine = await lastLine();
    const byUid = G.verbs.run("pour", G.world, me, { prop: crops9[4].id, entry: bucket.uid });
    row("the Use mode and a command by uid refuse an empty bucket on a crop, and the crops stay dry", crops9.every((c) => !farming.isWet(c)) && /empty/.test(emptyLine) && !byUid.ok && /empty/.test(byUid.reason), `"${emptyLine}"; ${byUid.reason}`);
    bucket.fill = bdef.vessel.capacity;
    G.teleport(pond[0] - 1.0, pond[1] + 0.2);
    const fullBy = G.verbs.run("fill", G.world, me, { tile: pond, entry: bucket.uid });
    row("and a command by uid refuses to fill a full bucket", !fullBy.ok && /full/.test(fullBy.reason), String(fullBy.reason));
    // A wall inside the 3 by 3 keeps the far side dry, and nothing is offered through it.
    G.teleport(plot[0] + 1.2, plot[1] + 1.9);
    for (const ax of [0, 1, 2]) G.map.buildWall(plot[0] + ax, plot[1] + 1, "n", "wall");
    restore.push(() => { for (const ax of [0, 1, 2]) G.map.destroyWall(plot[0] + ax, plot[1] + 1, "n"); });
    const pouredWall = G.verbs.run("pour", G.world, me, { tile: [plot[0] + 1, plot[1] + 1] });
    row("a pour on the near side waters the plants it can reach and not the row across a wall", pouredWall.ok && pouredWall.watered === 6 && crops9.filter((c) => c.tile[1] === plot[1]).every((c) => !farming.isWet(c)) && crops9.filter((c) => c.tile[1] > plot[1]).every((c) => farming.isWet(c)), `watered ${pouredWall.watered}: ${pouredWall.message || pouredWall.reason}`);
    bucket.fill = bdef.vessel.capacity;
    G.teleport(plot[0] + 1.2, plot[1] + 0.2); // in the row across the wall, close enough that only the wall refuses
    const behindB = G.interact.actionsForTarget({ kind: "prop", id: crops9[4].id }, me);
    const refused = G.verbs.run("pour", G.world, me, { tile: [plot[0] + 1, plot[1] + 1] });
    row("from behind the wall the crop's menu offers no Pour, and the verb says there is a wall in the way", !behindB.some((a) => a.label.startsWith("Pour")) && !refused.ok && /wall/.test(refused.reason), `${behindB.map((a) => a.label).join(", ")}; ${refused.reason}`);
    for (const ax of [0, 1, 2]) G.map.destroyWall(plot[0] + ax, plot[1] + 1, "n");
    for (const c of crops9) c.crop.wetUntil = G.clock.getElapsed() - 1;
    G.teleport(plot[0] + 1.2, plot[1] + 1.8);
    bucket.fill = 0;
    const emptyMenu = G.interact.actionsForTarget({ kind: "prop", id: crops9[4].id }, me).find((a) => a.label.startsWith("Pour"));
    row("an empty bucket's Pour says so in its label, disabled", !!emptyMenu && emptyMenu.label === "Pour the bucket (empty)" && !emptyMenu.enabled, emptyMenu ? emptyMenu.label : "none");
    // The water is the entry's: it travels with the inventory and the save.
    bucket.fill = 70;
    const kept = JSON.parse(JSON.stringify(bucket));
    row("its water is a fill on the entry (it survives a JSON round trip, as the save and the frame's record make), and held in a hand it still pours (the belt is proved by the guest's two-tab run)", kept.fill === 70 && (() => { me.hands.main = bucket; bag.items.splice(bag.items.indexOf(bucket), 1); const found = G.verbs.run("pour", G.world, me, { tile: [plot[0] + 1, plot[1] + 1] }); me.hands.main = null; return found.ok === true; })(), `fill ${kept.fill}`);
  } finally {
    for (const r of restore.reverse()) r();
    G.world.setTimeScale(1);
    setNow(clock0);
    farming.reset();
    bag.items.splice(0, bag.items.length, ...bag0);
    if (belt && belt0) belt.splice(0, belt.length, ...belt0);
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    Object.assign(me, body0);
    me.action = null;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
