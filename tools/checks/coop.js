// The chicken coop and the beehive in the valley (#333). From the console, on a tab with `?nosave`:
//   await __game.check("coop")
// The coop is a drawn container with a loot table of its own (coop, a placeholder), two tiles along y or, mirrored, along x, no dev box; the valley has coops and hives at the home and at
// Hollow Farm; the coop's menu offers Search, which opens its 3 by 2 grid; Take All, sent the way a guest's button sends it, moves what is in it to the bag and empties it. (The hive's sway
// is `check("sway")`'s.) Then the hive's honey (docs/43 section 6, #410), by `check("apples")`' pattern: Take honey by a guest's label on the hive's
// id after its bar, honey in the bag and the day on the prop three days on, a second take refused and the menu saying when, the chunk marked
// and the day in the prop's record, none a little short of the day and honey again past it; on a guest, every hive in the replica offers what
// its day says. The coop's bag, the hive's day, the clock, the player's bag, and anything made are put back.

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
  // A guest's console does not teleport (docs/31/07 question 14, #102): there the replica's own player is stood directly, the camera
  // with it, and the host's next frame puts it back where the host has it.
  const standAt = (gx, gy) => { if (role !== "guest") return G.teleport(gx, gy); me.gx = gx; me.gy = gy; me.auto = null; G.camera.snapTo(gx, gy); };
  let coop = null;
  let coop0 = null;
  let hive = null;
  let hive0 = null;
  let clock0 = null;
  try {
    G.loop.setPaused(true);
    const coops = [...map.allProps()].filter((p) => p.sprite === "chicken_coop");
    const hives = [...map.allProps()].filter((p) => p.sprite === "beehive");
    const def = G.assets.getDef("chicken_coop");
    row("the coop is a drawn container with a loot table of its own, and the hive is drawn, not a dev box", !def.placeholder && !!def.container && def.container.loot === "coop" && !G.assets.getDef("beehive").placeholder, `coop container ${JSON.stringify(def.container)}, hive ${G.assets.getDef("beehive").placeholder ? "dev box" : "drawn"}`);
    const home = coops.find((c) => c.tile[0] >= 98 && c.tile[0] <= 114 && c.tile[1] >= 212 && c.tile[1] <= 224);
    const farm = coops.find((c) => c.tile[0] >= 56 && c.tile[0] <= 100 && c.tile[1] >= 228 && c.tile[1] <= 241);
    row("the valley has a coop at the home and one at Hollow Farm, and at least eight hives (two at the home, three at the farm, three at the manor)", !!home && !!farm && hives.length >= 8, `${coops.length} coops (home ${home ? home.tile : "none"}, farm ${farm ? farm.tile : "none"}), ${hives.length} hives`);
    coop = home || coops[0];
    if (!coop) throw new Error("no coop on the map");
    row("the coop is two tiles along y", coop.tiles.length === 2 && coop.tiles[0][0] === coop.tiles[1][0], `${JSON.stringify(coop.tiles)}`);
    if (role === "guest") {
      // A guest reads the replica: the coop's menu, built from what it has, offers the same Search, named by an address the host can rebuild.
      standAt(coop.tile[0], coop.tile[1] - 2); // the replica's own player stood by the coop for the read; its menu is read at once
      map.ensureAround(coop.tile[0], coop.tile[1], 3);
      const a = G.interact.actionsForTarget({ kind: "prop", id: coop.id }, me).find((q) => q.kind === "container");
      row("on a guest the coop's menu offers Search or Open chicken coop, by an address the host can rebuild", !!a && /^(Search|Open) chicken coop$/.test(a.label), a ? a.label : "no container action");
      // The hive's day rides on the prop in its chunk: the replica's menu reads it (Take honey while it has some, else when it will).
      const hivesMod = await import("/src/hives.js");
      const hv = hives.map((q) => [q, G.interact.actionsForTarget({ kind: "prop", id: q.id }, me).find((x) => x.kind === "honey")]);
      row("on a guest every hive in the replica has its menu read off the replica's day: Take honey, or No honey yet with the days", hv.length > 0 && hv.every(([q, x]) => !!x && (hivesMod.hasHoney(q) ? x.label === "Take honey" : /^No honey yet \(more in about \d+ days?\)$/.test(x.label) && x.enabled === false)), hv.map(([q, x]) => `${q.id} ${q.honeyAt ?? "-"} ${x ? x.label : "none"}`).join("; "));
      throw Object.assign(new Error("guest done"), { guestDone: true });
    }
    // Search and Take All.
    coop0 = { bag: coop.bag, searched: coop.searched };
    standAt(coop.tile[0], coop.tile[1] - 2);
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

    // The hives give honey (docs/43 section 6, #410), by apples' pattern: taken by the verb and by a guest's label, empty until its day, the day
    // on the prop (saved, sent with the chunk), and full again past it.
    const hivesMod = await import("/src/hives.js");
    const H = G.tuning.work.honey;
    hive = hives.find((q) => hivesMod.hasHoney(q)) || hives[0];
    hive0 = { honeyAt: hive.honeyAt, had: "honeyAt" in hive };
    clock0 = G.clock.getElapsed();
    delete hive.honeyAt;
    map.ensureAround(hive.tile[0], hive.tile[1], 2);
    const hiveActs = () => G.interact.actionsForTarget({ kind: "prop", id: hive.id }, me).filter((x) => x.kind === "honey");
    const t = G.interact.approachTile(hiveActs()[0], me);
    if (t) standAt(t[0], t[1]);
    bag.items.length = 0;
    const honey = () => bag.items.filter((e) => e.id === H.item).reduce((n, e) => n + e.count, 0);
    row("the hive says it is one (`hive` on its definition) and the honey's numbers are data, honey a food", G.assets.getDef("beehive").hive === true && H.days > 0 && H.seconds > 0 && G.items.getItem(H.item).kind === "food", JSON.stringify(H));
    row("a hive with honey offers Take honey, a simple action (E does it)", hiveActs().some((x) => x.label === "Take honey" && x.enabled !== false && x.simple), hiveActs().map((x) => x.label).join(", "));
    const did = G.interact.performByLabel(me, { kind: "prop", id: hive.id }, "Take honey");
    const timed = !!me.action && me.action.action.duration === H.seconds;
    for (let i = 0; i < 600 && me.action; i++) G.interact.updateAction(me, 1 / 30);
    row("a guest's command (the label on the hive's id) takes it after the bar: honey in the bag, the day on the prop days on", did && timed && honey() >= H.count[0] && honey() <= H.count[1] && Math.abs(hive.honeyAt - (G.clock.getElapsed() + H.days * G.clock.DAY_LENGTH)) < 1, `ran ${did}, bar ${timed}, ${honey()} honey, honeyAt ${hive.honeyAt}, now ${G.clock.getElapsed()}`);
    const again = G.verbs.run("honey", G.world, me, { prop: hive.id });
    row("a second take finds none, and the menu says when", !again.ok && hiveActs().some((x) => /^No honey yet \(more in about 3 days\)$/.test(x.label) && x.enabled === false), `${again.reason}; ${hiveActs().map((x) => x.label).join(", ")}`);
    const [hcx, hcy] = map.chunkCoord(hive.tile[0], hive.tile[1]);
    const hchunk = map.getChunk(hcx, hcy, false);
    row("its chunk is marked for the wire and its saved copy dropped; the day is in the prop's record", hchunk.dirty === true && hchunk.saved === null && map.serializeProp(hive).honeyAt === hive.honeyAt, `dirty ${hchunk.dirty}, saved ${hchunk.saved === null ? "dropped" : "kept"}, ${JSON.stringify(map.serializeProp(hive))}`);
    G.clock.setElapsed(hive.honeyAt - 40);
    const short = hivesMod.hasHoney(hive);
    G.clock.setElapsed(hive.honeyAt + 1);
    row("a little short of its day it has none; past it, honey again", !short && hivesMod.hasHoney(hive) && hiveActs().some((x) => x.label === "Take honey"), `short ${short}, after ${hivesMod.hasHoney(hive)}`);
    G.clock.setElapsed(clock0);
  } catch (e) {
    if (!e.guestDone) rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const p of made) { const t = map.propById(p.id); if (t) map.removeProp(t); }
    if (coop && coop0) { coop.bag = coop0.bag; coop.searched = coop0.searched; }
    if (hive && hive0) { if (hive0.had) hive.honeyAt = hive0.honeyAt; else delete hive.honeyAt; map.touch(hive.tile[0], hive.tile[1]); }
    if (clock0 !== null) G.clock.setElapsed(clock0);
    me.action = null;
    bag.items.splice(0, bag.items.length, ...bag0);
    for (const [e, n] of counts0) e.count = n;
    standAt(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
