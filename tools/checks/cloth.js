// Cloth (#212). From the console, on a tab with `?nosave`:
//   await __game.check("cloth")
// It grows flax (a seed planted, a ripe crop harvested), makes cloth, bandages, and a cap at a loom of its own from flax and cloth in a chest
// beside it, tears a garment into rags at a workbench of its own (refused without a knife on you, allowed with one in the bag), and makes
// a torch from a rag. Everything placed is taken away and the bag, hands, and place are put back.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const p = G.player;
  const saved = { gx: p.gx, gy: p.gy };
  const bag = G.inventory.bagOf(p);
  const bag0 = bag.items.slice();
  const belt = G.inventory.beltOf(p);
  const belt0 = belt ? belt.slice() : null;
  const hands0 = { main: p.hands.main, off: p.hands.off };
  const wasPaused = G.loop.isPaused();
  G.loop.setPaused(true);
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const made = [];
  const restore = [];
  const farming = await import("/src/farming.js");
  const count = (id) => G.inventory.countAll(p, id);
  const DAY = G.clock.DAY_LENGTH;
  try {
    // The data.
    const crops = farming.get().crops;
    row("flax is a sixth crop, on rye's days, with its seed and its fibre, and three outlined stage sprites (the gatherables law)", !!crops.flax && JSON.stringify(crops.flax.stages) === JSON.stringify(crops.rye.stages) && G.items.getItem(crops.flax.seed).tags.includes("seed") && G.items.getItem("flax") && [0, 1, 2].every((s) => G.assets.getDef(`crop_flax_${s}`).crop.kind === "flax" && G.assets.getDef(`crop_flax_${s}`).placeholder.outline === true), JSON.stringify(crops.flax));
    row("cloth and a rag are tagged cloth (a garment already was), so every recipe that asks for the tag takes any of them", ["cloth", "rag", "cap", "tunic"].every((id) => G.items.getItem(id).tags.includes("cloth")) && G.stations.recipe("torch").in.some((i) => i.tag === "cloth"), "torch asks the tag");
    const loomRows = G.stations.recipesFor("loom").map((r) => r.id);
    row("the loom has rows: cloth from flax, bandages and clothes from cloth", ["cloth", "bandage", "weave_cap", "weave_breeches", "weave_tunic"].every((id) => loomRows.includes(id)) && G.stations.recipe("cloth").in[0].id === "flax" && G.stations.recipe("bandage").in[0].id === "cloth", loomRows.join(", "));
    const tears = G.stations.recipesFor("workbench").filter((r) => r.id.startsWith("tear_"));
    row("a garment tears into two rags at the workbench with a knife on you, and no rag or cloth is ever torn", tears.length === 6 && tears.every((r) => r.out.id === "rag" && r.out.count === 2 && r.carry === "knife" && !["rag", "cloth"].includes(r.in[0].id)), tears.map((r) => r.id).join(", "));
    G.map.ensureAround(76, 168, 4);
    const chestLoot = map.allProps().filter((q) => q.container).map((q) => q.container.loot);
    row("the weaver's chest holds a handful of flax seed and a knife (a way in on day one), and the weaver has a loom", chestLoot.includes("weaver_chest") && G.items.rollLoot("weaver_chest").some((e) => e.id === "flax_seed" && e.count >= 4) && G.items.rollLoot("weaver_chest").some((e) => e.id === "knife") && map.allProps().some((q) => q.sprite === "loom"), "weaver_chest");

    // Flax planted and harvested (the farming verbs, #194).
    let at = null;
    map.ensureAround(p.gx, p.gy, 3);
    for (let dy = -14; dy <= 14 && !at; dy++) for (let dx = -14; dx <= 14 && !at; dx++) {
      const x = Math.round(p.gx) + dx;
      const y = Math.round(p.gy) + dy;
      let ok = true;
      for (let ay = -1; ay <= 6 && ok; ay++) for (let ax = -1; ax <= 6 && ok; ax++) { const t = map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w && map.isWalkableTile(x + ax, y + ay); }
      if (ok) at = [x, y];
    }
    if (!at) throw new Error("no bare grass for the check");
    const [x, y] = at;
    p.hands.main = null;
    p.hands.off = null;
    bag.items = bag.items.filter((e) => e.id !== "knife"); // a player who already carries one (the dev kit) would make the no-knife rows fail
    if (belt) for (let i = 0; i < belt.length; i++) if (belt[i] && belt[i].id === "knife") belt[i] = null;
    G.teleport(x + 0.1, y + 0.9);
    map.setFloor(x, y, "floor_farm");
    restore.push(() => { const t = map.peekTile(x, y); if (t && t.prop) map.removeProp(t.prop); map.setFloor(x, y, "floor_grass"); });
    G.inventory.stow(p, G.items.makeEntry("flax_seed", 3));
    const planted = G.verbs.run("plant", G.world, p, { tile: [x, y], crop: "flax" });
    const crop = map.peekTile(x, y).prop;
    row("a flax seed planted on soil is a flax crop at stage 0", planted.ok && crop && crop.sprite === "crop_flax_0" && crop.crop.kind === "flax" && count("flax_seed") === 2, planted.ok ? crop && crop.sprite : planted.reason);
    const t0 = G.clock.getElapsed();
    crop.crop.wetUntil = t0 + 99 * DAY; // watered through
    row("it ripens on its days (three and three, as rye does)", farming.stageOf(crop, t0 + 2.9 * DAY) === 0 && farming.stageOf(crop, t0 + 3.1 * DAY) === 1 && farming.stageOf(crop, t0 + 5.9 * DAY) === 1 && farming.stageOf(crop, t0 + 6.1 * DAY) === 2, "stage 0, then 1 at three days, then ready at six");
    crop.crop.grown = 99 * DAY;
    crop.crop.at = G.clock.getElapsed();
    crop.crop.wetUntil = G.clock.getElapsed() + 9 * DAY;
    const flax0 = count("flax");
    const seeds0 = count("flax_seed");
    const harvested = G.verbs.run("harvest", G.world, p, { prop: crop.id });
    row("harvested ripe it gives flax and two seeds back, the soil stays", harvested.ok && count("flax") - flax0 >= 3 && count("flax") - flax0 <= 4 && count("flax_seed") - seeds0 === 2 && map.peekTile(x, y).floor === "floor_farm" && !map.peekTile(x, y).prop, `+${count("flax") - flax0} flax, +${count("flax_seed") - seeds0} seeds`);

    // A loom and a workbench of the check's own, each with a chest beside it.
    const standBy = (prop, dy = 2.4) => { G.teleport(prop.tile[0] + 1.0, prop.tile[1] + dy); step(); };
    const chestBeside = (prop, items) => {
      const cx = prop.tile[0] + 2;
      const cy = prop.tile[1] + 1;
      const chest = map.createProp({ sprite: "chest", tile: [cx, cy] });
      map.placeProp(chest, cx, cy);
      made.push(chest);
      chest.bag = G.inventory.createBag(8, 6, "chest");
      chest.searched = true;
      for (const [id, n] of items) G.grid.add(chest.bag, id, n);
      return chest;
    };
    const place = (sprite, tile, footprint = [1, 1]) => { const q = map.createProp({ sprite, tile, footprint }); map.placeProp(q, tile[0], tile[1]); made.push(q); return q; };
    const finish = (prop, recipe) => { const q = prop.queue && prop.queue[0]; if (q) q.left = 0.2; step(30); void recipe; };
    const craft = (prop, recipe, n = 1) => G.verbs.run("craft", G.world.world, p, { prop: prop.id }, { recipe, count: n });
    const out = (prop) => G.stations.outputOf(prop).items.map((e) => `${e.id}x${e.count}`).join(",");
    const take = (prop) => { const o = G.stations.outputOf(prop); const got = {}; for (const e of o.items) got[e.id] = (got[e.id] || 0) + e.count; o.items = []; return got; };

    const loom = place("loom", [x + 3, y], [2, 2]);
    const loomChest = chestBeside(loom, [["flax", 4], ["cloth", 3]]);
    standBy(loom);
    const totalFlax = () => count("flax") + loomChest.bag.items.filter((e) => e.id === "flax").reduce((n, e) => n + e.count, 0);
    const flaxBefore = totalFlax();
    const r1 = craft(loom, "cloth");
    finish(loom, "cloth");
    const got1 = take(loom);
    row("at the loom two flax become a cloth", r1.ok && got1.cloth === 1 && flaxBefore - totalFlax() === 2, `${r1.ok ? "" : r1.reason + "; "}output ${JSON.stringify(got1)}`);
    const r2 = craft(loom, "bandage");
    finish(loom, "bandage");
    const got2 = take(loom);
    row("a cloth becomes two bandages", r2.ok && got2.bandage === 2, `${r2.ok ? "" : r2.reason + "; "}output ${JSON.stringify(got2)}`);
    const r3 = craft(loom, "weave_cap");
    finish(loom, "weave_cap");
    const got3 = take(loom);
    row("a cloth becomes a cap (clothes at the loom: a cap from one, breeches from two, a tunic from three)", r3.ok && got3.cap === 1 && G.stations.recipe("weave_breeches").in[0].count === 2 && G.stations.recipe("weave_tunic").in[0].count === 3, `${r3.ok ? "" : r3.reason + "; "}output ${JSON.stringify(got3)}`);
    const rshort = craft(loom, "weave_tunic");
    row("a tunic wants three cloth: one short is refused", !rshort.ok && /Short/.test(rshort.reason), String(rshort.reason));

    const bench = place("workbench", [x + 3, y + 3], [2, 1]);
    const benchChest = chestBeside(bench, [["tunic", 1], ["stick", 2]]);
    standBy(bench, 1.9);
    const noKnife = craft(bench, "tear_tunic");
    row("tearing a garment wants a knife on you: without one it is refused, the tunic stays", !noKnife.ok && /knife/.test(noKnife.reason) && benchChest.bag.items.some((e) => e.id === "tunic"), String(noKnife.reason));
    const inChest = G.grid.add(benchChest.bag, "knife", 1);
    const chestKnife = craft(bench, "tear_tunic");
    row("a knife in a chest within reach does not count: it has to be on you", inChest > 0 && !chestKnife.ok && /knife/.test(chestKnife.reason), String(chestKnife.reason));
    benchChest.bag.items = benchChest.bag.items.filter((e) => e.id !== "knife");
    const slot = belt ? belt.findIndex((e) => !e) : -1;
    if (slot >= 0) {
      belt[slot] = G.items.makeEntry("knife", 1);
      const onBelt = craft(bench, "tear_tunic");
      finish(bench, "tear_tunic");
      const beltRag = take(bench);
      row("a knife on the belt does count, and the tunic tears into two rags", onBelt.ok && beltRag.rag === 2 && !benchChest.bag.items.some((e) => e.id === "tunic"), `${onBelt.ok ? "" : onBelt.reason + "; "}output ${JSON.stringify(beltRag)}`);
      belt[slot] = null;
      G.grid.add(benchChest.bag, "tunic", 1);
    } else row("a knife on the belt does count", false, "no free belt slot to try it on");
    G.inventory.stow(p, G.items.makeEntry("knife", 1)); // in the bag, not in a hand: carried is enough
    const tear = craft(bench, "tear_tunic");
    finish(bench, "tear_tunic");
    const gotRag = take(bench);
    row("with a knife in the bag the tunic tears into two rags", tear.ok && gotRag.rag === 2 && !benchChest.bag.items.some((e) => e.id === "tunic"), `${tear.ok ? "" : tear.reason + "; "}output ${JSON.stringify(gotRag)}`);
    // A recipe that asks for the `cloth` tag takes a rag before a garment, wherever each sits (the #216 review).
    G.grid.add(benchChest.bag, "tunic", 1);
    G.grid.add(benchChest.bag, "rag", 1);
    const torch = craft(bench, "torch");
    finish(bench, "torch");
    const gotTorch = take(bench);
    row("a torch is made from a stick and the rag, and the tunic beside it stays (a garment is taken last for a tag)", torch.ok && gotTorch.torch === 1 && benchChest.bag.items.some((e) => e.id === "tunic") && !benchChest.bag.items.some((e) => e.id === "rag"), `${torch.ok ? "" : torch.reason + "; "}output ${JSON.stringify(gotTorch)}; the chest holds ${benchChest.bag.items.map((e) => e.id).join(", ")}`);
    void out;
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message });
  } finally {
    for (const r of restore.reverse()) r();
    for (const q of made) { const t = map.propById(q.id); if (t) { t.queue = []; if (t.output) t.output.items = []; map.removeProp(t); } }
    bag.items.splice(0, bag.items.length, ...bag0);
    if (belt) for (let i = 0; i < belt.length; i++) belt[i] = belt0[i];
    p.hands.main = hands0.main;
    p.hands.off = hands0.off;
    G.teleport(saved.gx, saved.gy);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
