// A guest's slot command meets the host's canPlace (#224). From the console, on a tab with `?nosave`:
//   await __game.check("slots")
// It sends the command a guest's drag would send (inventory-actions `performItemCommand`, the host's handler) for items the host's own drag would refuse
// and allow: a log onto the belt, a hammer onto the belt, a sword onto the head slot, a cap onto it, a belt slot that does not exist. The bag, belt, and
// worn slots are put back.

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
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message });
  } finally {
    bag.items.splice(0, bag.items.length, ...bag0);
    if (belt) for (let i = 0; i < belt.length; i++) belt[i] = belt0[i];
    me.worn.head = head0;
    for (const [e, n] of counts0) e.count = n;
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
