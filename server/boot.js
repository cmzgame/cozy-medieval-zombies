// The world's data stage under plain Node (item 5's third step, 2026-10-14, `02`): what main.js does before a
// world can be made or restored, without a window, an image, or a canvas. Shared by the headless runner
// (tools/world.js, whose hash proves this is the browser's boot) and the server's world process (server/world.js).
// Reads only JSON: the sprite definitions' pictures are never loaded (assets.setHeadless), so a server image needs
// none of the art.

import fs from "node:fs";
import path from "node:path";

export async function bootData(root) {
  const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
  const optional = (p) => (fs.existsSync(path.join(root, p)) ? read(p) : null);

  const assets = await import("../src/assets.js");
  assets.setHeadless(true);
  assets.setJsonReader(async (p) => read(p));

  const [items, placement, combat, figure, interactions, stations, tuning] = await Promise.all([
    import("../src/items.js"),
    import("../src/placement.js"),
    import("../src/combat.js"),
    import("../src/figure.js"),
    import("../src/interactions.js"),
    import("../src/stations.js"),
    import("../src/tuning.js"),
  ]);

  // The data stage, as main.js runs it.
  const [itemsJson, buildJson, combatJson, posesJson, lootJson, wardrobesJson, interactionsJson] = [
    read("data/items.json"), read("data/build.json"), optional("data/combat.json"), optional("data/poses.json"),
    read("data/loot.json"), read("data/wardrobes.json"), optional("data/interactions.json"),
  ];
  interactions.load(interactionsJson);
  stations.loadRecipes(optional("data/recipes.json"));
  tuning.load(optional("data/tuning.json"));
  items.loadItems(itemsJson);
  placement.setBuildData(buildJson);
  if (combatJson) combat.setCombatData(combatJson);
  if (combatJson) (await import("../src/archery.js")).setBowData(combatJson.bow); // the bow's and the flight's (2026-10-15)
  if (posesJson) figure.setPoses(posesJson);
  items.loadLoot(lootJson);
  figure.setArtResolver((id) => items.getItem(id).art || null);
  figure.setWardrobes(wardrobesJson);

  // The art stage: every sprite definition, no picture.
  assets.setManifest(read("data/manifest.json"));
  await assets.loadAll();

  // The layers stage: every painted style's name, so a wardrobe that names one resolves.
  const folders = [["hair", "data/hair"], ...["head", "chest", "legs", "hands", "feet", "body", "beard", "waist"].map((s) => [s, `data/layers/${s}`])];
  for (const [slot, folder] of folders) {
    const index = optional(`${folder}/index.json`) || { styles: [] };
    for (const name of index.styles || []) figure.registerLayer(slot, name, read(`${folder}/${name}.json`));
  }

  return { read, optional, map: (name) => read(`data/maps/${name}.json`) };
}
