// Chopping (#195; docs/30 sections 4 and 10). From the console, on a tab with `?nosave`:
//   await __game.check("chop")
// It fells a tree near the player with and without a hatchet, chops the stump it leaves, and does the same by the menu's label on the
// tree's address (a guest's way); and opens the cottage's and the joiner's chests for the hatchet each holds. The tree, the logs, the
// stump, the bag, the hands, and the place are put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const wasPaused = G.loop.isPaused();
  const chop = await import("/src/chop.js");
  const restore = [];
  const labels = (id) => G.interact.actionsForTarget({ kind: "prop", id }, me).map((a) => a.label);
  const entry = (id) => G.interact.actionsForTarget({ kind: "prop", id }, me).find((a) => a.kind === "tree");
  const logsAt = (x, y) => G.map.itemsAt(x, y).filter((e) => e.id === "log").reduce((n, e) => n + e.count, 0);
  const clearLogs = (x, y) => { for (const e of [...G.map.itemsAt(x, y)]) if (e.id === "log") G.map.takeItem(x, y, e); };
  const run1 = (id) => G.verbs.run("chop", G.world, me, { prop: id });
  const finish = () => { for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1); };
  try {
    G.loop.setPaused(true);

    // The data.
    const hatchet = G.items.getItem("hatchet");
    const stumpDef = G.assets.getDef("stump");
    row("the hatchet lists the verb chop; the stump is a gatherable (interactable, an outlined dev box, a collision radius like a trunk's, one log) that says it is felled", hatchet.verbs.includes("chop") && stumpDef.interactable === true && stumpDef.wood === 1 && stumpDef.felled === true && stumpDef.collide.radius > 0 && stumpDef.collide.radius < 0.5 && stumpDef.placeholder.outline === true, JSON.stringify({ verbs: hatchet.verbs, wood: stumpDef.wood }));
    row("the chop's seconds and the stump's sprite are data", G.tuning.world.chopSeconds > 0 && G.tuning.world.stumpSprite === "stump", `${G.tuning.world.chopSeconds} s, ${G.tuning.world.stumpSprite}`);

    // The chests: a fresh world's cottage chest and the joiner's each hold a hatchet, made from their own tables.
    G.map.ensureAround(106, 216, 3);
    const home = G.map.allProps().find((p) => p.sprite === "chest" && p.container && p.container.loot === "home_chest");
    G.map.ensureAround(76, 190, 4);
    const joiner = G.map.allProps().find((p) => p.sprite === "chest" && p.container && p.container.loot === "joiner_chest");
    const holds = (p) => G.items.rollLoot(p.container.loot).some((e) => e.id === "hatchet"); // the table it names, not the chest opened (opening would change the world)
    row("your cottage's chest holds a hatchet (a placed container names its own loot table)", !!home && holds(home), home ? JSON.stringify(G.items.rollLoot(home.container.loot).map((e) => e.id)) : "no chest names home_chest");
    row("and the joiner's chest a second", !!joiner && holds(joiner), joiner ? JSON.stringify(G.items.rollLoot(joiner.container.loot).map((e) => e.id)) : "no chest names joiner_chest");
    row("the cottage's other chest and every untouched one keep the definition's table", G.map.allProps().filter((p) => p.sprite === "chest" && p.container && !["home_chest", "joiner_chest"].includes(p.container.loot)).every((p) => p.container.loot === "chest"), "the rest roll `chest`");

    // A tree beside the player.
    const tree = G.map.allProps().filter((p) => p.wood && G.assets.getDef(p.sprite).canopy && Math.hypot(p.tile[0] - meAt[0], p.tile[1] - meAt[1]) < 25).sort((a, b) => Math.hypot(a.tile[0] - meAt[0], a.tile[1] - meAt[1]) - Math.hypot(b.tile[0] - meAt[0], b.tile[1] - meAt[1]))[0];
    if (!tree) throw new Error("no tree near the player");
    const [tx, ty] = tree.tile;
    const sprite = tree.sprite;
    const wood = tree.wood;
    G.teleport(tx + 1.2, ty + 0.3);
    me.hands.main = null;
    me.hands.off = null;
    restore.push(() => { const p = G.map.tileAt(tx, ty).prop; if (p) G.map.removeProp(p); clearLogs(tx, ty); const t = G.map.createProp({ sprite, tile: [tx, ty] }); G.map.placeProp(t, tx, ty); });

    const before = entry(tree.id);
    row("without a hatchet the tree's entry says so and is off, and the verb refuses", before.enabled === false && /need a hatchet/.test(before.label) && !run1(tree.id).ok && /hatchet/.test(run1(tree.id).reason) && G.map.propById(tree.id) === tree, `${before.label}; ${run1(tree.id).reason}`);

    me.hands.main = G.items.makeEntry("hatchet", 1);
    const withAxe = entry(tree.id);
    row("with a hatchet in hand it offers Chop down with the logs it gives, over the data's seconds", withAxe.enabled === true && withAxe.label === `Chop down (${wood} log${wood > 1 ? "s" : ""})` && withAxe.duration === G.tuning.world.chopSeconds, `${withAxe.label}, ${withAxe.duration} s`);
    G.teleport(tx + 7, ty + 0.3);
    row("too far from the tree it is refused", !run1(tree.id).ok && /far/.test(run1(tree.id).reason), String(run1(tree.id).reason));
    G.teleport(tx + 1.2, ty + 0.3);

    // Felled: the logs on the tile, a stump in the tree's place.
    clearLogs(tx, ty);
    const felled = run1(tree.id);
    const stump = G.map.tileAt(tx, ty).prop;
    row("felling drops its logs on the tile and leaves a stump on it (solid, interactable)", felled.ok && logsAt(tx, ty) === wood && !!stump && stump.sprite === "stump" && stump.solid === true && stump.interactable === true && !G.map.propById(tree.id), `${logsAt(tx, ty)} of ${wood} logs, ${stump ? stump.sprite : "no stump"}`);

    // The stump.
    clearLogs(tx, ty);
    const sEntry = entry(stump.id);
    row("the stump offers Chop up the stump (1 log) with a hatchet", sEntry.enabled === true && sEntry.label === "Chop up the stump (1 log)", sEntry.label);
    me.hands.main = null;
    row("and says it needs a hatchet without one", /need a hatchet/.test(entry(stump.id).label) && entry(stump.id).enabled === false, entry(stump.id).label);
    me.hands.main = G.items.makeEntry("hatchet", 1);
    const dug = run1(stump.id);
    row("the hatchet on the stump gives a log and clears the tile (no second stump)", dug.ok && logsAt(tx, ty) === 1 && !G.map.tileAt(tx, ty).prop, `${logsAt(tx, ty)} log, prop ${G.map.tileAt(tx, ty).prop ? G.map.tileAt(tx, ty).prop.sprite : "none"}`);
    clearLogs(tx, ty);

    // A guest's way: the label on the tree's address, run on the authority as the player.
    G.teleport(tx + 0.9, ty + 0.2); // within the action's own reach, so the bar starts at once
    const t2 = G.map.createProp({ sprite, tile: [tx, ty] });
    G.map.placeProp(t2, tx, ty);
    const label = entry(t2.id).label;
    const did = G.interact.performByLabel(me, { kind: "prop", id: t2.id }, label);
    const started = !!me.action;
    finish();
    const s2 = G.map.tileAt(tx, ty).prop;
    row("a guest's command (the label on the tree's id) fells it too, after the timed bar, and leaves the stump", did === true && started && !!s2 && s2.sprite === "stump" && logsAt(tx, ty) === wood, `ran ${did}, bar ${started}, ${s2 ? s2.sprite : "none"}, ${logsAt(tx, ty)} logs`);
    clearLogs(tx, ty);
    const did2 = G.interact.performByLabel(me, { kind: "prop", id: s2.id }, "Chop up the stump (1 log)");
    finish();
    row("and the stump by its label", did2 === true && !G.map.tileAt(tx, ty).prop && logsAt(tx, ty) === 1, `ran ${did2}, ${logsAt(tx, ty)} log`);
    clearLogs(tx, ty);

    // Any tree leaves a stump: an apple tree too (it has a canopy).
    const apple = G.map.createProp({ sprite: "tree_apple", tile: [tx, ty] });
    G.map.placeProp(apple, tx, ty);
    const ra = run1(apple.id);
    row("an apple tree is a tree: felled it leaves a stump too", ra.ok && G.map.tileAt(tx, ty).prop && G.map.tileAt(tx, ty).prop.sprite === "stump", G.map.tileAt(tx, ty).prop ? G.map.tileAt(tx, ty).prop.sprite : "none");
    clearLogs(tx, ty);
    void chop;
  } finally {
    for (const r of restore.reverse()) r();
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    me.action = null;
    bag.items.splice(0, bag.items.length, ...bag0);
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
