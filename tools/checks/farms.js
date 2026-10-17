// The farms and the mill (#201). From the console, on a tab with `?nosave` (the valley):
//   await __game.check("farms")
// It reads the valley's farms from the map (Hollow Farm, Long Acre, the mill), harvests a ripe crop of each field it finds (a verb at the crop,
// the player moved beside it), and proves every crop has a seed in a granary, a use in a recipe, and a field. The crops it harvests are planted
// again and the bag, hands, and place are put back.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const p = G.player;
  const saved = { gx: p.gx, gy: p.gy };
  const bag = G.inventory.bagOf(p);
  const bag0 = bag.items.slice();
  const hands0 = { main: p.hands.main, off: p.hands.off };
  const wasPaused = G.loop.isPaused();
  G.loop.setPaused(true);
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const farming = await import("/src/farming.js");
  const restore = [];
  const aggro0 = G.rules.rules.zombieAggro; // the dead stay off for the run: a long craft or a loaded farm otherwise lets them kill the player (the checks run in sequence)
  try {
    G.rules.set({ zombieAggro: false });
    const crops = farming.get().crops;
    const kinds = Object.keys(crops);
    const json = await (await fetch("/data/maps/valley.json")).json();
    const sets = Object.fromEntries(json.sets.map((s) => [s.name, s]));
    const named = (re) => json.sets.filter((s) => re.test(s.name));
    row("Hollow Farm has its barn, farmhouse, granary, and fenced fields of pumpkins, potatoes, cabbages, and garlic", ["Hollow Farm's great barn", "Hollow Farm's farmhouse", "Hollow Farm's granary", "Hollow Farm's pumpkin field", "Hollow Farm's potatoes", "Hollow Farm's cabbages", "Hollow Farm's garlic"].every((n) => sets[n]) && named(/^Hollow Farm's (pumpkin|potatoes|cabbages|garlic)/).every((s) => s.fences.length === 1 && s.fences[0].gates.length >= 1), named(/^Hollow Farm/).map((s) => s.name).join(", "));
    const cropOf = (s) => new Set(s.props.filter((q) => q.sprite.startsWith("crop_")).map((q) => q.sprite.split("_")[1]));
    row("the pumpkin field is the biggest plot on the map, the scarecrow in its middle", Math.max(...json.sets.map((s) => s.props.filter((q) => q.sprite.startsWith("crop_")).length)) === sets["Hollow Farm's pumpkin field"].props.filter((q) => q.sprite.startsWith("crop_")).length && sets["Hollow Farm's pumpkin field"].props.some((q) => q.sprite === "scarecrow"), "pumpkins " + sets["Hollow Farm's pumpkin field"].props.filter((q) => q.sprite.startsWith("crop_")).length);
    const rye = named(/^Long Acre's .* rye/);
    row("Long Acre has two rye fields on furrows along y, a flax strip, a kitchen garden, a farmhouse and a barn", rye.length === 2 && rye.every((s) => s.floorRects.some((f) => f.sprite === "floor_farm_y")) && cropOf(sets["Long Acre's flax"]).has("flax") && sets["Long Acre's kitchen garden"] && sets["Long Acre's farmhouse"] && sets["Long Acre's barn"], rye.map((s) => s.name).join(", "));
    const fieldKinds = new Set(json.sets.flatMap((s) => [...cropOf(s)]));
    row("every crop in data is grown in a field somewhere in the valley", kinds.every((k) => fieldKinds.has(k)), `fields: ${[...fieldKinds].join(", ")}; crops: ${kinds.join(", ")}`);

    // The live world, not only the map file: the farms' props stand where the loader put them.
    for (const [cx, cy] of [[77, 245], [80, 45], [102, 58]]) map.ensureAround(cx, cy, 4);
    const live = map.allProps();
    const liveLoot = new Set(live.filter((q) => q.container).map((q) => q.container.loot));
    const cropCount = (k) => live.filter((q) => q.sprite.startsWith(`crop_${k}_`)).length;
    row("in the loaded world: the millstones, the scarecrow, the wheel, both granaries' tables, the barn's rack, and plots of every farm crop stand", live.some((q) => q.sprite === "millstones") && live.some((q) => q.sprite === "scarecrow") && live.some((q) => q.sprite === "millwheel") && ["granary_hollow", "granary_mill", "barn_rack"].every((t) => liveLoot.has(t)) && ["pumpkin", "potato", "cabbage", "garlic", "rye", "flax"].every((k) => cropCount(k) >= 20), `${["pumpkin", "potato", "cabbage", "garlic", "rye", "flax"].map((k) => `${k} ${cropCount(k)}`).join(", ")}`);

    // Seeds: a source for every crop.
    const seedsIn = (table) => G.items.rollLoot(table).map((e) => e.id);
    const hollow = seedsIn("granary_hollow");
    const mill = seedsIn("granary_mill");
    row("each granary holds seed of every crop (a fixed table, never refilled)", kinds.every((k) => hollow.includes(crops[k].seed) && mill.includes(crops[k].seed)), `${hollow.length} stacks and ${mill.length}`);
    const placedLoot = (s) => (s.buildings || []).flatMap((b) => b.props || []).filter((q) => q.loot).map((q) => q.loot);
    row("the granaries' chests name those tables, and the barn's tool rack names a hoe", placedLoot(sets["Hollow Farm's granary"]).includes("granary_hollow") && placedLoot(sets["the mill's granary"]).includes("granary_mill") && placedLoot(sets["Hollow Farm's great barn"]).includes("barn_rack") && seedsIn("barn_rack").includes("hoe"), "tables named");

    // The mill.
    row("the mill has its millstones, a wheel, and the miller alive and not immune", sets["the mill"].buildings.some((b) => (b.props || []).some((q) => q.sprite === "millstones")) && sets["the mill"].props.some((q) => q.sprite === "millwheel") && json.villagers.some((v) => v.name === "Miller" && !v.immune), "the mill");
    const rec = G.stations.recipe("flour");
    row("the millstones grind grain to flour with no fire", rec && rec.station === "millstones" && !rec.fire && rec.in[0].id === "grain" && rec.out.id === "flour", JSON.stringify(rec));

    // No dead-end crop: each crop's harvest is an ingredient of some recipe, directly or by tag.
    const uses = (id) => G.stations.recipesFor("cooking").concat(G.stations.recipesFor("oven"), G.stations.recipesFor("millstones"), G.stations.recipesFor("loom"), G.stations.recipesFor("workbench")).some((r) => r.in.some((i) => i.id === id || (i.tag && G.items.getItem(id).tags.includes(i.tag))));
    const deadEnds = kinds.filter((k) => !uses(crops[k].harvest.item));
    row("every crop's harvest feeds a recipe (no dead-end crop)", deadEnds.length === 0, deadEnds.length ? `dead ends: ${deadEnds.join(", ")}` : kinds.map((k) => crops[k].harvest.item).join(", "));
    row("the pumpkin makes a pie at the oven with flour", G.stations.recipe("pumpkin_pie").station === "oven" && G.stations.recipe("pumpkin_pie").in.some((i) => i.id === "pumpkin") && G.items.getItem("pumpkin_pie").kind === "food", "pumpkin pie");

    // A harvest at each farm: the nearest ripe crop of a field in the loaded map, the player beside it.
    p.hands.main = null;
    p.hands.off = null;
    const harvestAt = (cx, cy, kind) => {
      map.ensureAround(cx, cy, 4);
      let crop = null;
      let best = 1e9;
      for (const c of map.loadedChunks()) for (const t of c.tiles) {
        const q = t.prop;
        if (!q || !q.tile || q.sprite !== `crop_${kind}_2`) continue;
        const d = Math.abs(q.tile[0] - cx) + Math.abs(q.tile[1] - cy);
        if (d < best && map.peekTile(q.tile[0], q.tile[1]) === t) { best = d; crop = q; }
      }
      if (!crop) return { ok: false, reason: `no ripe ${kind} near ${cx},${cy}` };
      const [x, y] = crop.tile;
      const sprite = crop.sprite;
      restore.push(() => { if (!map.peekTile(x, y).prop) { const q = map.createProp({ sprite, tile: [x, y], solid: false }); map.placeProp(q, x, y); } });
      G.teleport(x + 0.5, y + 0.9);
      step(2);
      const item = crops[kind].harvest.item;
      const before = G.inventory.countAll(p, item);
      const r = G.verbs.run("harvest", G.world, p, { prop: crop.id });
      return { ok: r.ok && G.inventory.countAll(p, item) > before && !map.propById(crop.id), reason: r.ok ? `+${G.inventory.countAll(p, item) - before} ${item}` : r.reason, at: crop.tile };
    };
    const h1 = harvestAt(77, 247, "pumpkin");
    row("Hollow Farm's pumpkin field has ripe pumpkins and one is harvested", h1.ok, h1.reason + (h1.at ? ` at ${h1.at}` : ""));
    const h2 = harvestAt(93, 244, "potato");
    row("Hollow Farm's potato plot has ripe potatoes and one is harvested", h2.ok, h2.reason + (h2.at ? ` at ${h2.at}` : ""));
    const h3 = harvestAt(72, 56, "rye");
    row("Long Acre's rye is ripe and a plant is harvested (grain)", h3.ok, h3.reason + (h3.at ? ` at ${h3.at}` : ""));
    const h4 = harvestAt(70, 34, "flax");
    row("Long Acre's flax strip has ripe flax and one is harvested", h4.ok, h4.reason + (h4.at ? ` at ${h4.at}` : ""));
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message });
  } finally {
    G.rules.set({ zombieAggro: aggro0 });
    for (const r of restore.reverse()) r();
    bag.items.splice(0, bag.items.length, ...bag0);
    p.hands.main = hands0.main;
    p.hands.off = hands0.off;
    G.teleport(saved.gx, saved.gy);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
