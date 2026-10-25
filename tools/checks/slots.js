// A guest's slot command meets the host's canPlace (#224). From the console, on a tab with `?nosave`:
//   await __game.check("slots")
// It sends the command a guest's drag would send (inventory-actions `performItemCommand`, the host's handler) for items the host's own drag would refuse
// and allow: a log onto the belt, a hammer onto the belt, a sword onto the head slot, a cap onto it, a belt slot that does not exist. Then the bags (#400):
// a full sack taken off is set down holding everything, stands as a container (Open, Equip, no Pick up while full), and is equipped again by the menu's
// label as a guest's command is, its things still in it; a linen satchel sent onto the back takes it, the sack dropped at the feet with its things, and
// the satchel's own grid, 7 by 5, takes what is put in it. Pick up keeps a thing whole (docs/43, section 2): a chest holding an apple, picked
// up by its menu's label, is carried overhead holding it, and set down by a guest's `prop` placement still holds it. The bag, belt, worn
// slots, and the floor are put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const counts0 = bag0.map((e) => [e, e.count]);
  const belt = G.inventory.beltOf(me);
  const belt0 = belt ? belt.slice() : null;
  const head0 = me.worn.head;
  const back0 = me.worn.back;
  const tile0 = [Math.round(me.gx), Math.round(me.gy)];
  const floor0 = G.map.itemsAt(tile0[0], tile0[1]).slice();
  const { performItemCommand } = await import("/src/ui/inventory-actions.js");
  const send = (entry, slot) => performItemCommand(me, { op: "slot", uid: entry.uid, src: { kind: "bag", bag: { mine: true } }, slot });
  try {
    if (!belt) throw new Error("no belt to try slots on");
    for (let i = 0; i < belt.length; i++) belt[i] = null;
    me.worn.head = null;
    const log = G.items.makeEntry("log", 1);
    const hammer = G.items.makeEntry("hammer", 1);
    const sword = G.items.makeEntry("sword", 1);
    const cap = G.items.makeEntry("cap", 1);
    for (const e of [log, hammer, sword, cap]) G.inventory.stow(me, e);
    row("a log onto a belt slot is refused: it stays in the bag and the slot stays empty", send(log, "belt:0") === false && bag.items.includes(log) && !belt[0], `ran false; belt0 ${belt[0] ? belt[0].id : "empty"}`);
    row("a hammer onto a belt slot is allowed", send(hammer, "belt:0") === true && belt[0] === hammer && !bag.items.includes(hammer), `belt0 ${belt[0] ? belt[0].id : "empty"}`);
    row("a belt slot that does not exist is refused", send(sword, "belt:9") === false && bag.items.includes(sword), "belt:9");
    row("a sword onto the head slot is refused (it is not worn there)", send(sword, "worn:head") === false && !me.worn.head && bag.items.includes(sword), `head ${me.worn.head ? me.worn.head.id : "empty"}`);
    row("a cap onto the head slot is allowed", send(cap, "worn:head") === true && me.worn.head === cap, `head ${me.worn.head ? me.worn.head.id : "empty"}`);
    row("a slot name that means nothing is refused", send(sword, "nowhere:0") === false && bag.items.includes(sword), "nowhere:0");
    row("a belt slot with a negative or non-number index is refused (the item stays in the bag)", send(sword, "belt:-1") === false && send(sword, "belt:x") === false && bag.items.includes(sword), "belt:-1, belt:x");
    row("a hand that is not main or off is refused, even for an either-hand item", send(sword, "hand:foo") === false && bag.items.includes(sword) && me.hands.foo === undefined, "hand:foo");

    // ---- Bags (#400): taken off, a bag keeps its contents and stands as a container.
    const [tx, ty] = tile0;
    const sack = me.worn.back;
    const held = bag.items.length;
    const msg = () => (document.getElementById("message") || {}).textContent || "";
    G.interact.slotMenu(me, "worn:back").find((m) => m.label === "Unequip").onSelect();
    const down = G.map.itemsAt(tx, ty).find((e) => e.id === sack.id && e.bag === bag);
    row("a full sack taken off is set down at your feet with everything still in it, and the back is bare", !me.worn.back && !!down && down.bag.items.length === held && held > 0 && /set the burlap sack down/i.test(msg()), `back ${me.worn.back ? me.worn.back.id : "bare"}; on the floor ${down ? `the sack holding ${down.bag.items.length} of ${held}` : "nothing"}; "${msg()}"`);
    const target = down ? { kind: "item", uid: down.uid, tile: [tx, ty] } : null;
    const labels = target ? G.interact.actionsForTarget(target, me).map((a) => a.label) : [];
    row("set down, it is a container: Open and Equip on its menu, and no Pick up while it holds things", labels.some((l) => /^Open /.test(l)) && labels.some((l) => /^Equip /.test(l)) && !labels.some((l) => /^Pick up/.test(l)), labels.join(", "));
    const open = down ? G.interact.containerAt(me, { entryUid: down.uid, tile: [tx, ty] }) : null;
    row("opened by its address (a guest's), it is the same grid with the same things", !!open && open.bag === bag && open.bag.items.length === held, open ? `${open.bag.items.length} things` : "no container at the address");
    const equipLabel = labels.find((l) => /^Equip /.test(l));
    const ran = equipLabel ? G.interact.performByLabel(me, target, equipLabel) : false;
    for (let i = 0; i < 5; i++) G.loop.advance(1 / 60);
    row("equipped again by its menu label (a guest's command), it is on the back holding all it held, and off the floor", ran && me.worn.back && me.worn.back.bag === bag && G.inventory.bagOf(me).items.length === held && !G.map.itemsAt(tx, ty).some((e) => e.bag === bag), `ran ${ran}; back ${me.worn.back ? me.worn.back.id : "bare"} holding ${G.inventory.bagOf(me) ? G.inventory.bagOf(me).items.length : 0}`);

    // ---- The linen satchel (#400): 7 by 5, onto the back; the old bag drops with its things.
    const satchel = G.items.makeEntry("satchel", 1);
    G.map.dropItem(tx, ty, satchel);
    const onFloor = G.map.itemsAt(tx, ty).find((e) => e.id === "satchel");
    const swapLabel = onFloor ? G.interact.actionsForTarget({ kind: "item", uid: onFloor.uid, tile: [tx, ty] }, me).map((a) => a.label).find((l) => /^Swap bags/.test(l)) : null;
    const swapped = swapLabel ? G.interact.performByLabel(me, { kind: "item", uid: onFloor.uid, tile: [tx, ty] }, swapLabel) : false;
    for (let i = 0; i < 5; i++) G.loop.advance(1 / 60);
    const sb = G.inventory.bagOf(me);
    const oldDown = G.map.itemsAt(tx, ty).find((e) => e.bag === bag);
    row("a linen satchel equipped from the floor swaps bags: on the back, the sack set down with its things", swapped && me.worn.back && me.worn.back.id === "satchel" && !!oldDown && oldDown.bag.items.length === held, `${swapLabel || "no Swap bags"}; back ${me.worn.back ? me.worn.back.id : "bare"}; the sack down holding ${oldDown ? oldDown.bag.items.length : "-"}`);
    let put = 0;
    if (sb) for (let i = 0; i < 40; i++) put += G.inventory.addItem(sb, "stick", 1);
    // ---- Pick up keeps a thing whole (docs/43, section 2): a chest holding something is carried overhead with it.
    me.worn.back = back0;
    me.hands.main = null;
    me.hands.off = null;
    const chestTile = [tx + 1, ty];
    const chest = G.map.createProp({ sprite: "chest", tile: chestTile });
    chest.bag = G.inventory.createBag(4, 3, "chest");
    chest.searched = true;
    G.grid.add(chest.bag, "apple", 1);
    G.map.placeProp(chest, chestTile[0], chestTile[1]);
    const pick = G.interact.actionsForTarget({ kind: "prop", id: chest.id }, me).map((a) => a.label).find((l) => /^Pick up chest$/.test(l));
    const picked = pick ? G.interact.performByLabel(me, { kind: "prop", id: chest.id }, pick) : false;
    for (let i = 0; i < 5; i++) G.loop.advance(1 / 60);
    const carried = me.carrying === chest && chest.bag.items.length === 1;
    const setBack = carried ? G.placement.performPlacement(me, { kind: "prop", tx: chestTile[0], ty: chestTile[1], turns: 0 }) : false;
    row("Pick up keeps a thing whole: a chest holding an apple is carried overhead holding it, and set down by a guest's placement still holds it", picked && carried && setBack && !me.carrying && G.map.propById(chest.id) === chest && chest.bag.items.length === 1, `label "${pick}"; carried ${carried}; set down ${setBack}; holds ${chest.bag.items.length}`);
    if (G.map.propById(chest.id)) G.map.removeProp(chest);
    if (me.carrying === chest) me.carrying = null;
    row("the satchel's own grid is 7 by 5 and takes what is put in it", !!sb && sb.cols === 7 && sb.rows === 5 && put > 0, sb ? `${sb.cols} by ${sb.rows}; ${put} sticks put in` : "no bag on the back");
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message });
  } finally {
    bag.items.splice(0, bag.items.length, ...bag0);
    if (belt) for (let i = 0; i < belt.length; i++) belt[i] = belt0[i];
    me.worn.head = head0;
    me.worn.back = back0;
    for (const [e, n] of counts0) e.count = n;
    const t = G.map.tileAt(tile0[0], tile0[1]);
    if (t) { t.items = floor0.slice(); G.map.touch(tile0[0], tile0[1]); }
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
