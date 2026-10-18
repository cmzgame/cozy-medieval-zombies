// Take All (#10): the button on a container's panel moves everything it can into the player's bag. From the console, on a tab with `?nosave`:
//   await __game.check("takeall")
// It sends the command a guest's button would send (`performItemCommand`, op "takeall", the host's handler) for a chest, a station's output, and a body, each named by its address:
// everything fits and the container empties in the grid's order; a bag that fills takes what fits and the rest stays, with the word; what does not fit the bag but belongs on the belt
// goes to a free belt slot; a stack that fits in part is merged and the remainder stays; the player's own bag is refused; a searched body is redrawn without what was taken.
// The bag, belt, and everything it makes are put back.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const counts0 = bag0.map((e) => [e, e.count]);
  const belt = G.inventory.beltOf(me);
  const belt0 = belt ? belt.slice() : null;
  const meAt = [me.gx, me.gy];
  const wasPaused = G.loop.isPaused();
  const { performItemCommand, takeAllFrom, takeAllWord } = await import("/src/ui/inventory-actions.js");
  const { createZombie } = await import("/src/entities/zombie.js");
  const { lootOf, dressCorpse } = await import("/src/entities/character.js");
  const made = [];
  const restore = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const takeAll = (address) => performItemCommand(me, { op: "takeall", bag: address });
  const put = (b, id, n = 1) => G.grid.add(b, id, n);
  try {
    G.loop.setPaused(true);
    if (!belt) throw new Error("no belt to try on");
    let at = null;
    map.ensureAround(me.gx, me.gy, 3);
    for (let dy = -14; dy <= 14 && !at; dy++) for (let dx = -14; dx <= 14 && !at; dx++) {
      const x = Math.round(me.gx) + dx;
      const y = Math.round(me.gy) + dy;
      let ok = true;
      for (let ay = -1; ay <= 2 && ok; ay++) for (let ax = -1; ax <= 3 && ok; ax++) { const t = map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w && map.isWalkableTile(x + ax, y + ay); }
      if (ok) at = [x, y];
    }
    if (!at) throw new Error("no bare grass for the check");
    const [x, y] = at;
    G.teleport(x + 0.1, y + 0.1);
    step();
    const chest = map.createProp({ sprite: "chest", tile: [x + 1, y] });
    map.placeProp(chest, x + 1, y);
    made.push(chest);
    chest.bag = G.inventory.createBag(6, 4, "chest");
    chest.searched = true;
    const addr = { propId: chest.id };
    // The bag emptied for the try: nothing in it but what the check puts.
    bag.items.length = 0;
    for (let i = 0; i < belt.length; i++) belt[i] = null;

    // What a set of bags holds, by item id and count: Take All must conserve it (nothing lost, nothing doubled).
    const tally = (...bags) => { const t = {}; for (const b of bags) for (const e of b.items) t[e.id] = (t[e.id] || 0) + (e.count || 1); for (const e of belt) if (e) t[e.id] = (t[e.id] || 0) + (e.count || 1); return JSON.stringify(Object.entries(t).sort()); };
    const fillBag = () => { const f = []; for (let i = 0; i < 60; i++) { const e = G.items.makeEntry("hatchet", 1); if (!G.grid.insert(bag, e)) break; f.push(e); } return f; };

    // 1. Everything fits.
    put(chest.bag, "plank", 4);
    put(chest.bag, "log", 1);
    put(chest.bag, "apple", 3);
    const total0 = tally(chest.bag);
    const ran = takeAll(addr);
    row("Take All moves everything of a chest into the bag, in full, and the chest is empty", ran === true && chest.bag.items.length === 0 && tally(bag) === total0, `${total0}; chest ${chest.bag.items.length} stacks left`);

    // 2. A bag that fills: what fits moves, the rest stays; nothing lost or doubled.
    bag.items.length = 0;
    const filler = fillBag();
    G.grid.remove(bag, filler[filler.length - 1]); // room for one more thing of the hatchet's size
    for (const id of ["sword", "pickaxe", "shovel", "hammer", "hatchet"]) put(chest.bag, id, 1);
    const total2 = tally(chest.bag, bag);
    const before = chest.bag.items.length;
    const ran2 = takeAll(addr);
    const left = chest.bag.items.length;
    row("a bag that fills takes what fits and the rest stays in the chest (nothing lost, nothing doubled)", ran2 === true && left > 0 && left < before && tally(chest.bag, bag) === total2, `${before} in the chest; ${left} left; belt ${belt.filter(Boolean).map((e) => e.id).join(",") || "empty"}`);
    chest.bag.items.length = 0;

    // 3. What does not fit the bag but belongs on the belt goes to a free belt slot.
    bag.items.length = 0;
    for (let i = 0; i < belt.length; i++) belt[i] = null;
    fillBag();
    put(chest.bag, "apple", 2);
    const bagFull = !G.grid.findSpot(bag, "apple");
    const ran3 = takeAll(addr);
    const onBelt = belt.find((e) => e && e.id === "apple");
    row("food that does not fit the full bag goes to a free belt slot", bagFull && ran3 === true && !!onBelt && onBelt.count === 2 && chest.bag.items.length === 0, `bag full ${bagFull}; belt ${belt.filter(Boolean).map((e) => `${e.id}x${e.count}`).join(",") || "empty"}; chest ${chest.bag.items.length}`);

    // 4. A stack that fits in part: merged into the bag (and the belt takes none of it, the belt being full), the remainder stays.
    bag.items.length = 0;
    for (let i = 0; i < belt.length; i++) belt[i] = G.items.makeEntry("hammer", 1);
    const f4 = fillBag();
    G.grid.remove(bag, f4[f4.length - 1]); // a hatchet's room
    const room = G.grid.add(bag, "apple", 99); // how many apples the rest of the bag takes (they go in)
    for (const e of bag.items.filter((q) => q.id === "apple")) G.grid.remove(bag, e);
    put(chest.bag, "apple", room + 4);
    const held = G.inventory.countItem(chest.bag, "apple");
    const total4 = tally(chest.bag, bag);
    const ran4 = takeAll(addr);
    const remainder = G.inventory.countItem(chest.bag, "apple");
    row("a stack that fits only in part is merged into the bag and its remainder stays (nothing lost)", ran4 === true && remainder > 0 && remainder < held && tally(chest.bag, bag) === total4, `${held} apples in the chest (the bag had room for ${room}): ${G.inventory.countItem(bag, "apple")} went in, ${remainder} stay`);
    chest.bag.items.length = 0;

    // 5. A station's output, by the address a guest names it with.
    const bench = map.createProp({ sprite: "workbench", tile: [x + 1, y + 1], footprint: [2, 1] });
    map.placeProp(bench, x + 1, y + 1);
    made.push(bench);
    const out = G.stations.outputOf(bench);
    bag.items.length = 0;
    for (let i = 0; i < belt.length; i++) belt[i] = null;
    put(out, "stick", 3);
    const total5 = tally(out);
    const queue0 = JSON.stringify(bench.queue || []);
    const ran5 = takeAll({ propId: bench.id, name: "output" });
    row("Take All on a station's output empties it into the bag and leaves the queue as it was", ran5 === true && out.items.length === 0 && tally(bag) === total5 && JSON.stringify(bench.queue || []) === queue0, `${total5}; output ${out.items.length}; queue unchanged ${JSON.stringify(bench.queue || []) === queue0}`);

    // 6. A body: everything it carried, and it is redrawn without what was taken.
    bag.items.length = 0;
    const z = createZombie(x + 1.2, y + 0.1);
    z.dead = true;
    z.state = "down";
    z.worn.chest = G.items.makeEntry("tunic", 1);
    S.corpses.push(z);
    restore.push(() => { const i = S.corpses.indexOf(z); if (i >= 0) S.corpses.splice(i, 1); });
    const loot = lootOf(z);
    dressCorpse(z); // the body as searched: drawn in what is still on it
    const key0 = z.corpseKey;
    const had = loot.items.length;
    const total6 = tally(loot);
    const ran6 = takeAll({ characterId: z.id });
    row("Take All on a body takes everything it carried and the body is redrawn without it", ran6 === true && loot.items.length === 0 && had > 0 && tally(bag) === total6 && z.corpseKey !== key0, `${had} things; the corpse's look "${key0}" became "${z.corpseKey}"`);

    // 6b. A bag with things in it stays where it is, and the word says why (not "full"); with no bag on your back, the word says so.
    bag.items.length = 0;
    const sack = G.items.makeEntry("small_sack", 1);
    sack.bag = G.inventory.createBag(4, 3, "sack");
    G.grid.add(sack.bag, "apple", 1);
    chest.bag.items.length = 0;
    G.grid.insert(chest.bag, sack);
    const rNested = takeAllFrom(me, chest.bag);
    row("a bag with things in it stays in the chest and the word is not \"full\" (the bag has room)", rNested.nested === 1 && rNested.left === 0 && chest.bag.items.includes(sack) && takeAllWord(rNested) === "A bag with things in it stays: empty it first.", `nested ${rNested.nested}, left ${rNested.left}: "${takeAllWord(rNested)}"`);
    chest.bag.items.length = 0;
    const back0 = me.worn.back;
    me.worn.back = null;
    put(chest.bag, "plank", 1);
    const rNone = takeAllFrom(me, chest.bag);
    me.worn.back = back0;
    row("with no bag on your back Take All says so and moves nothing", rNone.noBag === true && takeAllWord(rNone) === "You have no bag." && chest.bag.items.length === 1, `"${takeAllWord(rNone)}"`);
    chest.bag.items.length = 0;

    // 7. The player's own bag is refused, and a container out of reach is not taken from.
    put(bag, "log", 1);
    const mineBefore = bag.items.length;
    const ran7 = takeAll({ mine: true });
    G.teleport(x + 30, y);
    step();
    put(chest.bag, "log", 1);
    const far = takeAll(addr);
    row("the player's own bag is refused, and a chest out of reach is not taken from", ran7 === false && bag.items.length === mineBefore && far === false && chest.bag.items.length === 1, `own bag ${ran7}; out of reach ${far}`);
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const r of restore.reverse()) r();
    for (const q of made) { const t = map.propById(q.id); if (t) { t.queue = []; map.removeProp(t); } }
    bag.items.splice(0, bag.items.length, ...bag0);
    for (const [e, n] of counts0) e.count = n;
    if (belt) for (let i = 0; i < belt.length; i++) belt[i] = belt0[i];
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
