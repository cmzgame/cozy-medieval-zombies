// Mining (#196; docs/30 section 10). From the console, on a tab with `?nosave`:
//   await __game.check("mine")
// It mines a rock and an ore rock with and without a pickaxe, watches the ore rock come back on its clock day, does the same by the menu's
// label on the rock's address (a guest's way), and reads the tables of the chests that start the smithy. The props, the bag, the hands,
// the clock, and the place are put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const clock0 = G.clock.getElapsed();
  const wasPaused = G.loop.isPaused();
  const DAY = G.clock.DAY_LENGTH;
  const mining = await import("/src/mining.js");
  const fruit = await import("/src/fruit.js");
  const restore = [];
  const count = (id) => G.inventory.countAll(me, id);
  const labels = (id) => G.interact.actionsForTarget({ kind: "prop", id }, me).map((a) => a.label);
  const run1 = (id) => G.verbs.run("mine", G.world, me, { prop: id });
  const finish = () => { for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1); };
  const holds = (table, id, n) => G.items.rollLoot(table).some((e) => e.id === id && (n === undefined || e.count === n));
  try {
    G.loop.setPaused(true);

    // The data.
    const rockDefs = [0, 1, 2, 3].map((n) => G.assets.getDef(`rock_${n}`));
    row("the pickaxe lists the verb mine; the four rocks give stone and go; there is a stone item", G.items.getItem("pickaxe").verbs.includes("mine") && rockDefs.every((d) => d.mine && d.mine.item === "stone" && d.mine.gone === true && d.interactable === true) && !!G.items.getItem("stone"), JSON.stringify(rockDefs[0].mine));
    const ore = G.assets.getDef("ore_rock");
    const spent = G.assets.getDef("ore_rock_spent");
    row("the ore rock gives iron ore and stands spent for days, and the spent kind says it ripens back (a gatherable both ways)", ore.mine.item === "iron_ore" && ore.mine.spent === "ore_rock_spent" && ore.mine.days > 0 && spent.ripens === "ore_rock" && ore.interactable === true && spent.interactable === true, JSON.stringify(ore.mine));

    // Two tiles of bare ground beside the player.
    let at = null;
    G.map.ensureAround(me.gx, me.gy, 3);
    for (let dy = -12; dy <= 12 && !at; dy++) for (let dx = -12; dx <= 12 && !at; dx++) {
      const x = Math.round(me.gx) + dx;
      const y = Math.round(me.gy) + dy;
      if ([[0, 0], [2, 0]].every(([ax, ay]) => { const t = G.map.peekTile(x + ax, y + ay); return t && !t.prop && G.map.isWalkableTile(x + ax, y + ay) && !t.n && !t.w; })) at = [x, y];
    }
    if (!at) throw new Error("no clear ground near the player");
    const [x, y] = at;
    const place = (sprite, tx) => { const p = G.map.createProp({ sprite, tile: [tx, y] }); G.map.placeProp(p, tx, y); restore.push(() => { const t = G.map.propById(p.id); if (t) G.map.removeProp(t); }); return p; };
    G.teleport(x + 1.0, y + 0.5);
    me.hands.main = null;
    me.hands.off = null;
    const rock = place("rock_0", x);
    const orePiece = place("ore_rock", x + 2);

    // Without a pickaxe.
    const stoneBefore = count("stone");
    const entry = G.interact.actionsForTarget({ kind: "prop", id: rock.id }, me).find((a) => a.kind === "mine");
    row("without a pickaxe the rock's entry says so and is off, and the verb refuses", entry.enabled === false && /need a pickaxe/.test(entry.label) && !run1(rock.id).ok && /pickaxe/.test(run1(rock.id).reason) && count("stone") === stoneBefore, `${entry.label}; ${run1(rock.id).reason}`);
    me.hands.main = G.items.makeEntry("pickaxe", 1);
    const withPick = G.interact.actionsForTarget({ kind: "prop", id: rock.id }, me).find((a) => a.kind === "mine");
    row("with it in hand the rock offers Mine stone over the data's seconds", withPick.enabled === true && withPick.label === "Mine stone" && withPick.duration === rockDefs[0].mine.seconds, `${withPick.label}, ${withPick.duration} s`);
    G.teleport(x + 8, y + 0.5);
    row("too far from the rock it is refused", !run1(rock.id).ok && /far/.test(run1(rock.id).reason), String(run1(rock.id).reason));
    G.teleport(x + 1.0, y + 0.5);

    // A rock: stone, and it goes.
    const mined = run1(rock.id);
    row("mining a rock gives its stone and the rock goes (a second miner finds it gone)", mined.ok && count("stone") - stoneBefore === rockDefs[0].mine.count[0] && !G.map.propById(rock.id) && !G.map.tileAt(x, y).prop && !run1(rock.id).ok, `+${count("stone") - stoneBefore} stone`);

    // An ore rock: ore, spent, back after its days.
    const oreBefore = count("iron_ore");
    const t0 = G.clock.getElapsed();
    const gotOre = run1(orePiece.id);
    row("an ore rock gives iron ore and stands spent, with the day it returns three days on", gotOre.ok && count("iron_ore") - oreBefore === ore.mine.count[0] && orePiece.sprite === "ore_rock_spent" && Math.abs(orePiece.regrowAt - (t0 + ore.mine.days * DAY)) < 1, `+${count("iron_ore") - oreBefore} ore, ${orePiece.sprite}, regrowAt ${orePiece.regrowAt}`);
    row("a spent one cannot be mined and its menu says when it returns", !run1(orePiece.id).ok && /mined out/.test(run1(orePiece.id).reason) && labels(orePiece.id).some((l) => /^Mined out \(more in about 3 days\)/.test(l)), `${run1(orePiece.id).reason}; ${labels(orePiece.id).join(", ")}`);
    const day = orePiece.regrowAt;
    G.clock.setElapsed(day - 40);
    fruit.reset();
    G.game.begin(0);
    row("a day short it is still spent", orePiece.sprite === "ore_rock_spent", orePiece.sprite);
    const copy = { ...JSON.parse(JSON.stringify(G.map.serializeProp(orePiece))), id: "p_mine_check" };
    const revived = G.map.reviveProp(copy, false);
    row("saved and loaded again (an evicted chunk) it keeps its day", revived.sprite === "ore_rock_spent" && revived.regrowAt === day, `${revived.sprite} ${revived.regrowAt}`);
    G.clock.setElapsed(day + 31);
    G.game.begin(0);
    row("past its day it is an ore rock again (iron never runs out)", orePiece.sprite === "ore_rock" && orePiece.regrowAt === undefined, `${orePiece.sprite} ${orePiece.regrowAt}`);
    G.clock.setElapsed(t0);

    // A guest's way: the label on the rock's address, run on the authority as the player.
    const rock2 = place("rock_1", x);
    G.teleport(x + 0.9, y + 0.6);
    const stone2 = count("stone");
    const did = G.interact.performByLabel(me, { kind: "prop", id: rock2.id }, "Mine stone");
    const started = !!me.action;
    finish();
    row("a guest's command (the label on the rock's id) mines it after the bar", did === true && started && count("stone") - stone2 === 3 && !G.map.propById(rock2.id), `ran ${did}, bar ${started}, +${count("stone") - stone2}`);
    me.hands.main = null;

    // The smithy's start: the chests and the cart.
    G.map.ensureAround(98, 184, 4);
    G.map.ensureAround(224, 148, 4);
    G.map.ensureAround(190, 54, 4);
    const chests = G.map.allProps().filter((p) => p.container).map((p) => p.container.loot);
    row("the smithy's own chest holds the first iron (bars), so the anvil works on day one", chests.includes("smithy_chest") && holds("smithy_chest", "iron_bar", 3), "smithy_chest");
    row("the miners' hut holds a pickaxe and a crate of ore, the quarryman's a pickaxe and a hammer, the ore cart and the cut stone give ore and stone", chests.includes("miners_chest") && holds("miners_chest", "pickaxe") && holds("miners_chest", "iron_ore") && chests.includes("quarry_chest") && holds("quarry_chest", "pickaxe") && holds("quarry_chest", "hammer") && chests.includes("ore_cart") && holds("ore_cart", "iron_ore") && chests.includes("stone_stack") && holds("stone_stack", "stone"), "miners_chest, quarry_chest, ore_cart, stone_stack");
    const props = G.map.allProps();
    row("the iron workings and the quarry stand: ore rocks, rocks, the mine mouth, the crane", props.filter((p) => p.sprite === "ore_rock").length >= 6 && props.some((p) => p.sprite === "mine_mouth") && props.some((p) => p.sprite === "crane") && props.filter((p) => p.sprite.startsWith("rock_") && p.tile[0] >= 184 && p.tile[1] >= 36 && p.tile[1] < 60).length >= 8, `${props.filter((p) => p.sprite === "ore_rock").length} ore rocks`);

    // The chain: ore to a bar at a forge, a bar to a hammer at the anvil, all by recipes in data.
    const bar = G.stations.recipe("iron_bar");
    const hammer = G.stations.recipe("hammer");
    row("ore smelts to a bar at the forge (a fire) and a bar and a stick make a hammer at the anvil", bar.station === "forge" && bar.fire === true && bar.in.some((i) => i.id === "iron_ore") && hammer.station === "anvil" && hammer.in.some((i) => i.id === "iron_bar"), `${JSON.stringify(bar.in)} / ${JSON.stringify(hammer.in)}`);
  } finally {
    for (const r of restore.reverse()) r();
    G.clock.setElapsed(clock0);
    fruit.reset();
    bag.items.splice(0, bag.items.length, ...bag0);
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    me.action = null;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  void mining;
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
