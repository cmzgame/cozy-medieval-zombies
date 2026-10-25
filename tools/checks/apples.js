// Apple trees (#190; Michael, 2026-10-18: apples "come from certain trees and be pickable in some fashion and this makes it part of
// production, which needs to be upkept"). From the console, on a tab with `?nosave`:
//   await __game.check("apples")
// It goes to the orchard, reads the tree's picture (#422: the round tree, green, with its apples painted on at load, and bare the same crown
// without them), picks a tree by the verb and by the menu entry (a guest's path: the label on the prop's address), watches the tree go bare
// and bear again on its day, chops one, and puts the player, the clock, the bag, and the tree back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const clock0 = G.clock.getElapsed();
  const wasPaused = G.loop.isPaused();
  const fruit = await import("/src/fruit.js");
  const restore = [];
  const apples = () => bag.items.filter((e) => e.id === "apple").reduce((n, e) => n + e.count, 0);
  const treeAt = (x, y) => G.map.tileAt(x, y).prop;
  try {
    G.loop.setPaused(true);
    G.map.ensureAround(46, 240, 4);
    const orchard = G.map.allProps().filter((p) => p.sprite === "tree_apple" || p.sprite === "tree_apple_bare");
    const inOrchard = orchard.filter((p) => p.tile[0] >= 38 && p.tile[0] < 54 && p.tile[1] >= 232 && p.tile[1] < 250);
    row("the orchard stands: twenty apple trees in rows at Hollow Farm", inOrchard.length === 20, `${inOrchard.length}`);
    G.map.ensureAround(60, 70, 4);
    const gardens = G.map.allProps().filter((p) => p.sprite === "tree_apple" && p.tile[1] < 232);
    row("and a few trees in cottage gardens, reachable early", gardens.length >= 3, `${gardens.length}`);

    const tree = inOrchard.find((p) => p.sprite === "tree_apple");
    const [tx, ty] = tree.tile;
    const stand = [tx + 1.0, ty + 0.2];
    G.teleport(stand[0], stand[1]);
    const def = G.assets.getDef("tree_apple");
    row("it is a gatherable: interactable, with wood to chop, and a pick block in data", def.interactable === true && def.wood > 0 && def.pick && def.pick.count && def.pick.days > 0, JSON.stringify(def.pick));

    // The picture (#422): the round tree, green (tree_oak_m's file, size, and anchor), its apples painted on at load from the definition's fruit
    // block; the bare tree is the same picture without them, pixel for pixel the round tree's.
    const pixelsOf = (sheet) => {
      const [fx, fy, fw, fh] = sheet.frames.idle_0;
      const c = document.createElement("canvas");
      c.width = fw;
      c.height = fh;
      const k = c.getContext("2d", { willReadFrequently: true });
      k.drawImage(sheet.image, fx, fy, fw, fh, 0, 0, fw, fh);
      return { w: fw, h: fh, px: k.getImageData(0, 0, fw, fh).data };
    };
    const art = await import("/src/fruit-art.js");
    const laden = G.assets.getSheet("tree_apple");
    const bareSheet = G.assets.getSheet("tree_apple_bare");
    const round = G.assets.getSheet("tree_oak_m");
    const L = pixelsOf(laden);
    const B = pixelsOf(bareSheet);
    const R = pixelsOf(round);
    row("the apple tree is the round tree's size and anchor, bearing and bare (82 by 104, as tree_oak_m)", L.w === R.w && L.h === R.h && B.w === R.w && B.h === R.h && String(laden.anchor) === String(round.anchor) && String(bareSheet.anchor) === String(round.anchor), `${L.w}x${L.h} and ${B.w}x${B.h} against ${R.w}x${R.h}; anchors ${laden.anchor} ${bareSheet.anchor} ${round.anchor}`);
    row("the bare tree is the round tree's crown, pixel for pixel", B.px.every((v, i) => v === R.px[i]), "tree_apple_bare against tree_oak_m");
    let fruitPx = 0;
    let offLeaf = 0;
    for (let i = 0; i < L.px.length; i += 4) {
      if (L.px[i] === B.px[i] && L.px[i + 1] === B.px[i + 1] && L.px[i + 2] === B.px[i + 2] && L.px[i + 3] === B.px[i + 3]) continue;
      fruitPx++;
      if (!art.isLeaf(B.px, i)) offLeaf++;
    }
    const cells = def.fruit.shape.join("").replace(/\./g, "").length;
    row("the bearing tree is the bare one with its apples on the crown's leaves: every one placed, none on the outline or the trunk", fruitPx === def.fruit.count * cells && offLeaf === 0, `${fruitPx} pixels changed (${def.fruit.count} apples of ${cells}), ${offLeaf} off the leaves`);
    const spots = art.fruitSpots(B.px, B.w, B.h, def.fruit);
    row("the apples are throughout the crown: some in each quarter of it", new Set(spots.map(([x, y]) => `${x < B.w / 2 ? "w" : "e"}${y < 45 ? "n" : "s"}`)).size === 4, JSON.stringify(spots));
    row("its sheet says where it came from: the file, with fruit painted on (the sprite tool will not save it over the file)", laden.source && laden.source.painted === "fruit" && laden.source.drawn.includes(def.image) && !(bareSheet.source && bareSheet.source.painted), JSON.stringify(laden.source));
    const names = await import("/src/interactions.js");
    row("it is called the apple tree, bearing or bare (a Use on it says so)", names.nameOfTarget({ kind: "prop", prop: tree }) === "apple tree" && G.assets.getDef("tree_apple_bare").name === "apple tree", names.nameOfTarget({ kind: "prop", prop: tree }));

    const label = `Pick ${G.items.getItem("apple").name.toLowerCase()}s`;
    const actions = () => G.interact.actionsForProp(tree, me);
    row("the menu offers Pick apples, and Chop down", actions().some((a) => a.label === label && a.enabled) && actions().some((a) => a.label.startsWith("Chop down")), actions().map((a) => a.label).join(", "));

    // The verb, as the menu's timed action and a guest's command both run it.
    const before = apples();
    const r = G.verbs.run("pick", G.world, me, { prop: tree.id });
    const got = apples() - before;
    const [lo, hi] = def.pick.count;
    row("picking gives the apples (a count in data) into the bag", r.ok && got >= lo && got <= hi, `got ${got} of ${lo} to ${hi}`);
    row("and the tree is bare, with the day it bears again set three days on", tree.sprite === "tree_apple_bare" && Math.abs(tree.regrowAt - (G.clock.getElapsed() + def.pick.days * G.clock.DAY_LENGTH)) < 1, `${tree.sprite}, regrowAt ${tree.regrowAt}`);
    row("and it is drawn bare: the round tree's crown with no apples", G.assets.getSheet(tree.sprite) === bareSheet, tree.sprite);
    const again = G.verbs.run("pick", G.world, me, { prop: tree.id });
    row("a second pick finds it bare and gets nothing", !again.ok && apples() === before + got, String(again.reason));
    const bareMenu = actions();
    row("a bare tree says when it will bear, and offers no pick", bareMenu.some((a) => /^Bare \(fruit in about 3 days\)/.test(a.label) && a.enabled === false) && !bareMenu.some((a) => a.label === label), bareMenu.map((a) => a.label).join(", "));
    const [ccx, ccy] = G.map.chunkCoord(tx, ty);
    const chunk = G.map.getChunk(ccx, ccy, false);
    row("its chunk is marked for the wire and its saved copy dropped, so a guest and the save have the bare tree", chunk.dirty === true && chunk.saved === null && JSON.stringify(G.map.serializeProp(tree)).includes("regrowAt"), `dirty ${chunk.dirty}, saved copy ${chunk.saved === null ? "dropped" : "kept"}, regrowAt in the record`);
    const copy = { ...JSON.parse(JSON.stringify(G.map.serializeProp(tree))), id: "p_apples_check" }; // another id: reviving under the tree's own would take it out of the registry
    const revived = G.map.reviveProp(copy, false);
    row("the saved prop comes back bare with its day", revived.sprite === "tree_apple_bare" && revived.regrowAt === tree.regrowAt, `${revived.sprite} ${revived.regrowAt}`);

    // Time: bare until its day, then it bears again at the next look.
    const day = tree.regrowAt;
    G.clock.setElapsed(day - 40);
    fruit.reset();
    G.game.begin(0);
    row("a day short it is still bare", tree.sprite === "tree_apple_bare", tree.sprite);
    G.clock.setElapsed(day + 31);
    G.game.begin(0);
    row("past its day it bears again, with no day left on it", tree.sprite === "tree_apple" && tree.regrowAt === undefined, `${tree.sprite} ${tree.regrowAt}`);
    row("and it is drawn with its apples again", G.assets.getSheet(tree.sprite) === laden, tree.sprite);

    // A guest's way: the label on the prop's address, run on the host.
    const before2 = apples();
    const did = G.interact.performByLabel(me, { kind: "prop", id: tree.id }, label);
    // the action walks if needed and runs timed: finish it
    for (let i = 0; i < 200 && me.action; i++) G.interact.updateAction(me, 1 / 30);
    row("a guest's command (the label on the prop's id) picks it too", did === true && apples() > before2 && tree.sprite === "tree_apple_bare", `ran ${did}, +${apples() - before2}, ${tree.sprite}`);

    // Chopping a bare tree: logs, the tree gone, the fruit lost.
    const logsAt = () => G.map.itemsAt(tx, ty).filter((e) => e.id === "log").reduce((n, e) => n + e.count, 0);
    me.hands.main = G.items.makeEntry("hatchet", 1); // chopping needs a hatchet in hand (#195)
    const chop = actions().find((a) => a.label.startsWith("Chop down"));
    chop.perform();
    row("chopping it is any tree's: logs on the ground and a stump in its place, the fruit lost", logsAt() >= def.wood && !!treeAt(tx, ty) && treeAt(tx, ty).sprite === "stump", `${logsAt()} logs, prop ${treeAt(tx, ty) ? treeAt(tx, ty).sprite : "gone"}`);
    restore.push(() => {
      const p = G.map.createProp({ sprite: "tree_apple", tile: [tx, ty] });
      G.map.placeProp(p, tx, ty);
      for (const e of [...G.map.itemsAt(tx, ty)]) if (e.id === "log") G.map.takeItem(tx, ty, e);
    });
  } finally {
    for (const r of restore.reverse()) r();
    G.clock.setElapsed(clock0);
    fruit.reset();
    bag.items.splice(0, bag.items.length, ...bag0);
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
