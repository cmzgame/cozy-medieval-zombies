// The belt's roles (Michael, 2026-10-25: docs/02, "The belt's slots have roles"). From the console, on a tab with `?nosave&mute`:
//   await __game.check("belt")
// With the leather belt worn and the key order Sequential, it presses the real keys 1 to 5 (a keydown on the window, the loop stepped): a
// main-hand slot draws a sword into the main hand and swaps, an off-hand slot a book into the off hand, the utility slot eats bread, the
// second main and off slots the same; a tap on an empty hand slot does nothing and says nothing; each refusal in its words (a shield in a
// main-hand slot, a spear in an off-hand slot, a skin never drunk by a tap, the tinderbox, a weapon and a torch in the utility slot); a lit
// torch in the utility slot gives its light; the halberd stored in the utility slot as one cell by the slot command, and drawn into both
// hands from a main-hand slot, the shield it pushes out going to an empty off-hand slot; the bow refused onto an off-hand slot by the slot
// command with its line. The setting "Belt slot order": Hands grouped on the leather belt (2 the second main, 5 the utility) and on the rope
// belt (2 and 4 drawn locked, doing nothing, and saying a leather belt adds a slot there), Sequential on the rope belt (4 and 5 silent); with no
// belt, a key says so; what a draw pushes out going to the empty utility slot before the floor (the bow under a draw into the off hand, the
// shield under the halberd's); Take All putting a bow on the utility slot past an empty off-hand slot; the hotbar's places in each order. On the page:
// each empty slot stamped with its role's faint icon (the right hand on a main-hand slot and the left on an off-hand slot, mirrored for a
// left-handed character; a pouch on the utility slot), the empty slots' and a locked place's hover cards, a filled slot's card naming what
// its key does there, the slot's menu (the key's Equip where it draws, else an Equip into the item's own hand as from the bag; no mark), the
// utility slot's Equip (both hands) holding the halberd, and a double-click on the utility slot saying why. Everything worn, held, carried, the setting, and the handedness are put back in the finally.
//
// Two tabs (`?nosave&mute&relay=none`): on the host `await __game.check("belt", { keep: true })` runs the rows above and then gives every
// other player the leather belt with a sword in its first main-hand slot and a book in its first off-hand slot, a bow in its bag where it
// fits, and empty hands, and returns `kept`; on the guest `await __game.check("belt", { guest: <kept> })` reads its replica's belt, sends
// the off-hand slot's key by its role in its snapshot (`net.setTestSnapshot`, `beltOff1`) and waits for the book in its off hand, then the
// main-hand slot's (`beltMain1`) for the sword, sends the bow onto an off-hand slot by a slot command and sees it refused with the host's
// line reaching it, then onto the utility slot and sees it stored there, and equips it from that slot's menu by a menu command; then `await __game.check("sync")` on the host, and
// `await __game.check("belt", { stop: true })` there puts the other players' belts, hands, and bags back as `{ keep: true }` found them.

// The other players as `{ keep: true }` found them, put back by `{ stop: true }` on the host after the guest's half (the module is cached by the page).
const keptBack = [];

export async function run(game, opts = {}) {
  const G = game;
  if (opts.stop) {
    const put = [];
    for (const k of keptBack.splice(0)) {
      const p = G.game.state.players.find((q) => q.id === k.id);
      if (!p) continue;
      p.worn.waist = k.waist;
      p.hands.main = k.hands.main;
      p.hands.off = k.hands.off;
      const b = G.inventory.bagOf(p);
      if (b && k.bag) b.items.splice(0, b.items.length, ...k.bag);
      p.offMemory = k.offMemory;
      put.push(p.id);
    }
    const rows = [{ check: "the other players' belts, hands, and bags put back as { keep: true } found them", result: "pass", detail: put.join(", ") || "nobody kept" }];
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.length, total: rows.length };
  }
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const inv = G.inventory;
  const info = await import("/src/item-info.js");
  const actionsMod = await import("/src/ui/inventory-actions.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const card = await import("/src/ui/hover-card.js");
  const { hoverCard: HC } = await import("/src/tuning.js");
  const me = G.player;
  const mk = (id, props) => G.items.makeEntry(id, 1, props);
  const msgEl = () => document.getElementById("message");
  const message = () => ((msgEl() || {}).textContent || "").trim();
  const clearMessage = () => { const m = msgEl(); if (m) { m.textContent = ""; m.hidden = true; } };
  const id = (e) => (e ? e.id : "-");
  const held = (p = me) => `main ${id(p.hands.main)}, off ${id(p.hands.off)}`;
  let kept = null;
  const done = () => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, kept };
  };

  // ---- a guest's side: its own belt on the replica, its keys by role, its slot commands ----
  if (opts.guest) {
    const wasPaused = G.loop.isPaused();
    G.loop.setPaused(true);
    const pump = async (until, ms = 15000) => {
      const t0 = performance.now();
      let last = t0;
      while (!until() && performance.now() - t0 < ms) {
        await yieldOnce();
        if (performance.now() - last >= 1000 / 60) { last = performance.now(); G.loop.advance(1 / 60); }
      }
      return Math.round(performance.now() - t0);
    };
    const tap = (event) => {
      G.net.setTestSnapshot({ axis: { x: 0, y: 0 }, keys: { [event]: true } });
      G.loop.advance(1 / 60);
      G.net.setTestSnapshot(null);
    };
    try {
      let belt = inv.beltOf(me);
      row("on the guest my replica wears the leather belt the host gave: five slots, a sword in the first main-hand slot and a book in the first off-hand slot, my hands empty", !!belt && belt.length === 5 && id(belt[0]) === "sword" && id(belt[1]) === "book_of_fire" && !me.hands.main && !me.hands.off, belt ? belt.map(id).join(" ") : "no belt");
      const sword = belt && belt[0];
      const book = belt && belt[1];
      // The off-hand slot's key, by its role, in my snapshot: the host's step draws the book for my player.
      tap("beltOff1");
      const ms1 = await pump(() => me.hands.off && book && me.hands.off.uid === book.uid);
      row("my off-hand slot's key, sent by its role (beltOff1), draws the book into my off hand on the host, and the replica shows it", !!book && me.hands.off && me.hands.off.uid === book.uid && !inv.beltOf(me)[1], `${held()}; ${ms1} ms`);
      tap("beltMain1");
      const ms2 = await pump(() => me.hands.main && sword && me.hands.main.uid === sword.uid);
      row("my main-hand slot's key (beltMain1) draws the sword into my main hand, the book kept in the off hand", !!sword && me.hands.main && me.hands.main.uid === sword.uid && me.hands.off && book && me.hands.off.uid === book.uid, `${held()}; ${ms2} ms`);
      // An empty main-hand slot's key: nothing, no line.
      clearMessage();
      tap("beltMain1");
      await pump(() => false, 600);
      row("my empty main-hand slot's key leaves the sword in my hand and says nothing", !!sword && me.hands.main && me.hands.main.uid === sword.uid && message() === "", `${held()}; "${message()}"`);
      // The bow onto an off-hand slot: the host's slot check refuses it and its line reaches me.
      const bag = inv.bagOf(me);
      const bow = bag && bag.items.find((e) => e.id === "bow");
      const skipped = opts.guest.bows && opts.guest.bows[me.id] === false;
      if (bow) {
        clearMessage();
        G.net.sendItem({ op: "slot", uid: bow.uid, src: { kind: "bag", bag: { mine: true } }, slot: "belt:4" });
        await pump(() => /needs both hands/.test(message()), 5000);
        belt = inv.beltOf(me);
        row("my bow sent onto an off-hand slot is refused by the host: still in my bag, the slot empty, and the line reaches me", bag.items.some((e) => e.uid === bow.uid) && !belt[4] && message() === "The hunting bow needs both hands: it goes in a main-hand slot or the utility slot.", `"${message()}"; slot 5 ${id(belt[4])}`);
        G.net.sendItem({ op: "slot", uid: bow.uid, src: { kind: "bag", bag: { mine: true } }, slot: "belt:2" });
        await pump(() => { const b = inv.beltOf(me); return !!(b && b[2] && b[2].uid === bow.uid); }, 5000);
        belt = inv.beltOf(me);
        row("my bow sent onto the utility slot is stored there, one cell", belt[2] && belt[2].uid === bow.uid && !inv.bagOf(me).items.some((e) => e.uid === bow.uid), `utility ${id(belt[2])}`);
        // Its key there: the host says why, to me.
        clearMessage();
        tap("beltUtility");
        await pump(() => /utility slot/.test(message()), 5000);
        row("my utility slot's key with the bow there equips nothing and the host's line reaches me", belt[2] && belt[2].uid === bow.uid && me.hands.main && sword && me.hands.main.uid === sword.uid && message() === "You can't equip a weapon from the utility slot.", `"${message()}"; ${held()}`);
        // The utility slot's menu equips it into both hands, as from the bag (the review of #478, S3): the guest's menu command, run on the host.
        const labels = G.interact.slotMenu(me, "belt:2").map((m) => m.label).join(",");
        G.net.sendItem({ op: "menu", label: "Equip (both hands)", src: { kind: "slot", id: "belt:2" } });
        const ms3 = await pump(() => me.hands.main && me.hands.main.uid === bow.uid, 5000);
        belt = inv.beltOf(me);
        row("my utility slot's menu offers Equip (both hands) for the bow, and my menu command equips it into both hands on the host", /Equip \(both hands\)/.test(labels) && me.hands.main && me.hands.main.uid === bow.uid && me.hands.off && me.hands.off.uid === bow.uid && !(belt[2] && belt[2].uid === bow.uid), `${labels}; ${held()}; ${ms3} ms`);
      } else row("my bow onto an off-hand slot", !!skipped, skipped ? "skipped: the host found no room for a bow in my bag" : "no bow in my bag");
      // The card on the replica for a filled slot: what its key does there.
      const swordCard = info.textOf(info.cardFor(mk("sword"), { beltRole: "main" })).join(" | ");
      row("on the guest a sword's card on a main-hand slot says its key draws it into the main hand", swordCard.includes("From this main-hand slot: drawn into your main hand."), swordCard);
    } catch (e) {
      rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
    } finally {
      G.net.setTestSnapshot(null);
      G.loop.setPaused(wasPaused);
    }
    return done();
  }

  // ---- the host's own (or a world of one's own) ----
  const worn0 = { waist: me.worn.waist, back: me.worn.back };
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const bag0 = inv.bagOf(me) ? inv.bagOf(me).items.slice() : null;
  const offMemory0 = me.offMemory;
  const handed0 = Object.prototype.hasOwnProperty.call(me, "handed") ? { v: me.handed } : null;
  const needs0 = { hunger: me.hunger, thirst: me.thirst };
  const order0 = G.settings.get("beltOrder"); // shared with Michael's browser: put back in the finally
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  G.loop.setPaused(true);
  if (screen0) G.screens.hide(); // the title takes the keys
  const press = (n) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: `Digit${n}`, bubbles: true }));
    G.loop.advance(1 / 60);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: `Digit${n}`, bubbles: true }));
    G.loop.advance(1 / 60);
  };
  let belt = null;
  const fresh = (beltId = "good_belt") => {
    me.worn.waist = mk(beltId);
    me.hands.main = null;
    me.hands.off = null;
    me.offMemory = null;
    belt = inv.beltOf(me);
    return belt;
  };
  const render = () => panel.renderInventoryPanel(me, inv.bagOf(me), null, inv.beltOf(me));
  const intoBag = (p, e) => { const b = inv.bagOf(p); return !!b && G.grid.insert(b, e); };
  const bagOpen0 = panel.isBagOpen();
  const slotEl = (i) => document.querySelector(`#hotbar .inv-item[data-slot="belt:${i}"]`);
  const placeEl = (i) => document.querySelector(`#hotbar .hot-slot[data-slot="belt:${i}"]`);
  const at = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
  const hoverText = async (el) => {
    card.hide();
    if (el) el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, ...at(el) }));
    await wait(HC.delayMs + 80);
    return (document.getElementById("hover-card") || {}).textContent || "";
  };
  const h = actionsMod.createInventoryActions(() => me);
  try {
    if (!inv.bagOf(me)) throw new Error("no bag on the back to try the belt with");
    G.settings.set("beltOrder", "sequential");
    // ---- each role's key, by the real keys, Sequential on the leather belt ----
    fresh();
    me.hunger = 10;
    me.thirst = me.maxThirst - 30; // not thirsty: no auto-sip in the steps
    row("the leather belt has five slots: main, off, utility, main, off", belt.length === 5 && [0, 1, 2, 3, 4].map(inv.beltRole).join(",") === "main,off,utility,main,off", `${belt.length} slots`);
    belt[0] = mk("sword");
    belt[1] = mk("book_of_fire");
    belt[2] = mk("bread");
    belt[3] = mk("mace");
    belt[4] = mk("shield");
    const sword = belt[0];
    const bookE = belt[1];
    press(1);
    row("key 1, a main-hand slot, draws the sword into the main hand", id(me.hands.main) === "sword" && !belt[0], held());
    press(2);
    row("key 2, an off-hand slot, draws the book into the off hand", id(me.hands.off) === "book_of_fire" && !belt[1], held());
    press(3);
    row("key 3, the utility slot, eats the bread, the hands untouched", !belt[2] && me.hunger > 10 && id(me.hands.main) === "sword" && id(me.hands.off) === "book_of_fire", `slot 3 ${id(belt[2])}, hunger ${Math.round(me.hunger)}; ${held()}`);
    press(4);
    row("key 4, the second main-hand slot, draws the mace and swaps the sword onto that slot", id(me.hands.main) === "mace" && belt[3] === sword, `${held()}; slot 4 ${id(belt[3])}`);
    press(5);
    row("key 5, the second off-hand slot, draws the shield and swaps the book onto that slot", id(me.hands.off) === "shield" && belt[4] === bookE, `${held()}; slot 5 ${id(belt[4])}`);
    // An empty hand slot: nothing at all, no line.
    clearMessage();
    press(1);
    press(2);
    row("keys 1 and 2 on empty hand slots leave the mace and the shield in hand and say nothing", id(me.hands.main) === "mace" && id(me.hands.off) === "shield" && !belt[0] && !belt[1] && message() === "", `${held()}; "${message()}"`);
    // ---- the refusals, each in its words ----
    const word = (n, put) => { put(); clearMessage(); press(n); return message(); };
    fresh();
    let w = word(1, () => { belt[0] = mk("shield"); });
    row("a shield in a main-hand slot is storage: its key says \"The wooden shield can't be held in your main hand.\"", w === "The wooden shield can't be held in your main hand." && id(belt[0]) === "shield" && !me.hands.main, `"${w}"`);
    w = word(2, () => { belt[1] = mk("spear"); });
    row("a spear in an off-hand slot: \"The throwing spear can't be held in your off hand.\"", w === "The throwing spear can't be held in your off hand." && id(belt[1]) === "spear", `"${w}"`);
    w = word(1, () => { belt[0] = mk("waterskin", { fill: 80, clean: true }); });
    row("a tap never drinks: \"Your waterskin drinks by itself from your belt.\", the fill unchanged", w === "Your waterskin drinks by itself from your belt." && belt[0].fill === 80, `"${w}"; ${belt[0].fill}%`);
    w = word(3, () => { belt[2] = mk("tinderbox"); });
    row("the tinderbox in the utility slot stays and says why", /not held in a hand/.test(w) && id(belt[2]) === "tinderbox", `"${w}"`);
    w = word(3, () => { belt[2] = mk("sword"); });
    row("a sword in the utility slot: \"You can't equip a weapon from the utility slot.\"", w === "You can't equip a weapon from the utility slot." && id(belt[2]) === "sword" && !me.hands.main, `"${w}"`);
    w = word(3, () => { belt[2] = mk("torch"); belt[2].lit = true; });
    G.loop.advance(1 / 60);
    const light = G.light.carriers().find((c) => c.owner === me.id);
    row("a lit torch in the utility slot gives its light at the belt's strength and its key says it can't be equipped from there", w === "You can't equip the torch from the utility slot." && id(belt[2]) === "torch" && !!light && light.strength === G.tuning.world.beltLight, `"${w}"; ${light ? `strength ${light.strength}` : "no carried light"}`);
    belt[2] = null;
    w = word(1, () => { belt[0] = mk("torch"); });
    row("a torch in a main-hand slot is drawn into the main hand", id(me.hands.main) === "torch" && !belt[0] && w === "", `${held()}; "${w}"`);
    // ---- the halberd: stored in the utility slot as one cell, drawn into both hands from a main-hand slot ----
    fresh();
    const halberd = mk("halberd");
    if (!intoBag(me, halberd)) { inv.bagOf(me).items.length = 0; intoBag(me, halberd); } // five cells; the bag is put back in the finally
    const ranH = actionsMod.performItemCommand(me, { op: "slot", uid: halberd.uid, src: { kind: "bag", bag: { mine: true } }, slot: "belt:2" });
    row("the halberd onto the utility slot by the slot command (a guest's way): stored there in one cell, out of the bag", ranH === true && belt[2] === halberd && !inv.bagOf(me).items.includes(halberd), `ran ${ranH}; utility ${id(belt[2])}`);
    w = word(3, () => {});
    row("its key there equips nothing: \"You can't equip a weapon from the utility slot.\"", w === "You can't equip a weapon from the utility slot." && belt[2] === halberd && !me.hands.main, `"${w}"`);
    belt[2] = null;
    belt[0] = halberd;
    me.hands.main = mk("sword");
    me.hands.off = mk("shield");
    const shield = me.hands.off;
    press(1);
    row("the halberd in a main-hand slot: key 1 draws it into both hands, the sword onto its slot, the shield to the empty off-hand slot", me.hands.main === halberd && me.hands.off === halberd && id(belt[0]) === "sword" && belt[1] === shield, `${held()}; slots ${belt.map(id).join(" ")}`);
    press(1);
    row("key 1 again: the sword back in the main hand, the halberd on its slot, the shield back in the off hand (docs/21)", id(me.hands.main) === "sword" && me.hands.off === shield && belt[0] === halberd && !belt[1], `${held()}; slots ${belt.map(id).join(" ")}`);
    // ---- a two-hander refused in an off-hand slot ----
    const bow = mk("bow");
    if (!intoBag(me, bow)) { inv.bagOf(me).items.length = 0; intoBag(me, bow); }
    clearMessage();
    const ranB = actionsMod.performItemCommand(me, { op: "slot", uid: bow.uid, src: { kind: "bag", bag: { mine: true } }, slot: "belt:4" });
    row("the bow onto an off-hand slot by the slot command is refused, with \"The hunting bow needs both hands: it goes in a main-hand slot or the utility slot.\"", ranB === false && !belt[4] && inv.bagOf(me).items.includes(bow) && message() === "The hunting bow needs both hands: it goes in a main-hand slot or the utility slot.", `ran ${ranB}; "${message()}"`);
    clearMessage();
    h.slotRefused(bow, "belt:1");
    row("a drag of it let go over an off-hand slot says the same", message() === "The hunting bow needs both hands: it goes in a main-hand slot or the utility slot.", `"${message()}"`);
    row("the slot check takes the bow on the main-hand slots and the utility slot and refuses it on both off-hand slots", [0, 2, 3].every((i) => h.canPlace(bow, `belt:${i}`)) && [1, 4].every((i) => !h.canPlace(bow, `belt:${i}`)), "belt:0 to belt:4");
    G.grid.remove(inv.bagOf(me), bow);

    // ---- the key orders ----
    G.settings.set("beltOrder", "grouped");
    fresh();
    belt[3] = mk("mace");
    belt[2] = mk("bread");
    me.hunger = 10;
    press(2);
    press(5);
    row("Hands grouped on the leather belt: key 2 is the second main-hand slot (the mace drawn), key 5 the utility slot (the bread eaten)", id(me.hands.main) === "mace" && !belt[3] && !belt[2] && me.hunger > 10, `${held()}; hunger ${Math.round(me.hunger)}`);
    render();
    const order = () => [...document.querySelectorAll("#hotbar .hot-slot")].map((el) => (el.classList.contains("locked") ? "locked" : el.dataset.slot)).join(" ");
    const keysShown = () => [...document.querySelectorAll("#hotbar .hot-key")].map((el) => el.textContent).join("");
    row("on the page the grouped leather belt's places read slots 1, 4, 2, 5, 3 under keys 1 to 5", order() === "belt:0 belt:3 belt:1 belt:4 belt:2" && keysShown() === "12345", `${order()}; keys ${keysShown()}`);
    fresh("belt");
    belt[1] = mk("book_of_fire");
    me.hands.main = mk("sword");
    clearMessage();
    press(2);
    const said2 = message();
    clearMessage();
    press(4);
    row("Hands grouped on the rope belt: keys 2 and 4 are locked places, do nothing, and say \"A leather belt adds a slot here.\" on this screen (S4)", id(me.hands.main) === "sword" && !me.hands.off && id(belt[1]) === "book_of_fire" && said2 === "A leather belt adds a slot here." && message() === "A leather belt adds a slot here.", `${held()}; "${said2}" / "${message()}"`);
    press(3);
    row("Hands grouped on the rope belt: key 3 is its off-hand slot (the book drawn)", id(me.hands.off) === "book_of_fire" && !belt[1], held());
    render();
    const locked = [...document.querySelectorAll("#hotbar .hot-slot.locked")];
    row("on the page the grouped rope belt shows five places, 2 and 4 locked", order() === "belt:0 locked belt:1 locked belt:2" && locked.map((el) => el.dataset.key).join(",") === "2,4", order());
    const lockedCard = await hoverText(locked[0]);
    row("a locked place's hover card says a leather belt adds a second main-hand slot there", /Locked slot/.test(lockedCard) && /A leather belt adds a second main-hand slot here\./.test(lockedCard), lockedCard.slice(0, 160));
    card.hide();
    G.settings.set("beltOrder", "sequential");
    render();
    row("Sequential on the rope belt: three places, 1 main, 2 off, 3 utility, none locked", order() === "belt:0 belt:1 belt:2" && keysShown() === "123", order());
    me.hands.off = null;
    belt[2] = mk("bread");
    me.hunger = 10;
    press(3);
    row("Sequential on the rope belt: key 3 is its utility slot (the bread eaten)", !belt[2] && me.hunger > 10, `hunger ${Math.round(me.hunger)}`);
    clearMessage();
    press(4);
    press(5);
    row("Sequential on the rope belt: keys 4 and 5, with no place drawn, do nothing and say nothing", message() === "", `"${message()}"`);
    // No belt worn: every belt key says so, on this screen alone, and nothing moves (S4).
    me.worn.waist = null;
    me.hands.main = mk("sword");
    clearMessage();
    press(1);
    row("with no belt worn, key 1 says \"You have no belt.\" and the sword stays in hand", message() === "You have no belt." && id(me.hands.main) === "sword", `"${message()}"; ${held()}`);
    // A draw into the off hand with a two-hander held, both main-hand slots full and no bag: the bow to the utility slot, not the floor (S1).
    fresh();
    me.worn.back = null;
    const heldBow = mk("bow");
    me.hands.main = heldBow;
    me.hands.off = heldBow;
    belt[0] = mk("sword");
    belt[3] = mk("mace");
    belt[1] = mk("torch");
    press(2);
    row("the torch drawn into the off hand with the bow held, both main-hand slots full and no bag: the bow goes to the empty utility slot, not the floor", id(me.hands.off) === "torch" && !me.hands.main && belt[2] === heldBow, `${held()}; slots ${belt.map(id).join(" ")}`);
    // The halberd from a main-hand slot with the off-hand slots full and no bag: the shield to the utility slot (S1).
    fresh();
    me.worn.back = null;
    belt[0] = mk("halberd");
    belt[1] = mk("book_of_fire");
    belt[4] = mk("book_of_fire");
    me.hands.main = mk("sword");
    me.hands.off = mk("shield");
    const shieldU = me.hands.off;
    press(1);
    row("the halberd drawn with both off-hand slots full and no bag: the shield goes to the empty utility slot, not the floor", id(me.hands.main) === "halberd" && belt[2] === shieldU, `${held()}; slots ${belt.map(id).join(" ")}`);
    me.worn.back = worn0.back;
    // Take All with the bag full: the bow tries every empty belt slot its role allows, the utility slot past the off-hand one (S2).
    fresh("belt");
    belt[0] = mk("sword");
    const fullBag = inv.bagOf(me);
    if (fullBag) for (let n = 0; n < 200 && G.grid.insert(fullBag, mk("hatchet")); n++);
    const chestBag = inv.createBag(3, 3, "chest");
    const takeBow = mk("bow");
    G.grid.insert(chestBag, takeBow);
    const took = actionsMod.takeAllFrom(me, chestBag, h);
    row("Take All with the bag full puts a bow on the rope belt's empty utility slot, past its empty off-hand slot", took.moved === 1 && took.left === 0 && belt[2] === takeBow && !belt[1] && chestBag.items.length === 0, `${JSON.stringify(took)}; slots ${belt.map(id).join(" ")}`);
    if (bag0 && fullBag) fullBag.items.splice(0, fullBag.items.length, ...bag0);

    // ---- the look: each empty slot's role icon, and the hover cards ----
    fresh();
    panel.setBagOpen(true);
    render();
    const iconOf = (i) => { const el = placeEl(i); const img = el && el.querySelector("img.hot-role"); return img ? img.dataset.roleIcon : "none"; };
    const icons = () => [0, 1, 2, 3, 4].map(iconOf).join(",");
    const img0 = placeEl(0) && placeEl(0).querySelector("img.hot-role");
    if (img0 && !img0.complete) await new Promise((r) => { img0.onload = img0.onerror = r; setTimeout(r, 1000); }); // a data URL decodes after the markup is set
    const faint = img0 ? Number(getComputedStyle(img0).opacity) : 1;
    row("every empty slot is stamped with its role's icon, the right hand on the main-hand slots, the left on the off-hand slots, a pouch on the utility slot, drawn faint", icons() === "hand-right,hand-left,utility,hand-right,hand-left" && !!img0 && img0.complete && img0.naturalWidth === 16 && faint > 0 && faint < 0.6, `${icons()}; opacity ${faint}; ${img0 ? img0.naturalWidth : 0} px`);
    me.handed = "left";
    render();
    row("a left-handed character's main-hand slots show the left hand and its off-hand slots the right", icons() === "hand-left,hand-right,utility,hand-left,hand-right", icons());
    if (handed0) me.handed = handed0.v; else delete me.handed;
    render();
    const mainCard = await hoverText(placeEl(0));
    const offCard = await hoverText(placeEl(1));
    const utilCard = await hoverText(placeEl(2));
    row("hovering an empty main-hand slot: \"This is a main-hand slot. Its key draws what's here into your main hand...\" and two-handed items go there", /Main-hand slot/.test(mainCard) && /This is a main-hand slot\. Its key draws what's here into your main hand, or eats it if it is food\./.test(mainCard) && /two-handed item goes here/i.test(mainCard), mainCard.slice(0, 220));
    row("hovering an empty off-hand slot: its off hand, and two-handed items can't go there", /This is an off-hand slot\. Its key draws what's here into your off hand/.test(offCard) && /Two-handed items can't go here/.test(offCard), offCard.slice(0, 220));
    row("hovering the empty utility slot: it eats food, never equips, and stores anything in one cell", /This is the utility slot\. Its key eats what's here if it is food, and never equips anything\./.test(utilCard) && /one cell whatever its size/.test(utilCard), utilCard.slice(0, 220));
    belt[0] = mk("sword");
    belt[2] = mk("halberd");
    render();
    const swordCard = await hoverText(slotEl(0));
    const halberdCard = await hoverText(slotEl(2));
    row("a filled main-hand slot's card names what its key does: \"From this main-hand slot: drawn into your main hand.\"", swordCard.includes("From this main-hand slot: drawn into your main hand."), swordCard.slice(0, 200));
    row("the halberd's card in the utility slot: \"From the utility slot: stored. You can't equip a weapon from the utility slot. Its menu equips it.\"", halberdCard.includes("From the utility slot: stored. You can't equip a weapon from the utility slot. Its menu equips it."), halberdCard.slice(0, 200));
    card.hide();
    // ---- the slot's menu on the page, and the double-click ----
    const menuOf = async (i) => {
      const el = slotEl(i);
      if (el) el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...at(el) }));
      const entries = [...document.querySelectorAll("#menu .menu-entry")];
      const out = { labels: entries.map((e) => e.textContent), checked: entries.filter((e) => e.classList.contains("checked")).length };
      (await import("/src/ui/context-menu.js")).closeContextMenu();
      return out;
    };
    const m0 = await menuOf(0);
    const m2 = await menuOf(2);
    row("the sword's main-hand slot menu: Use, Equip, Put in bag, Drop; no hand choice and no mark", m0.labels.join(",") === "Use,Equip,Put in bag,Drop" && m0.checked === 0, m0.labels.join(", "));
    row("the halberd's utility slot menu equips it into both hands, as from the bag (S3): Use, Equip (both hands), Put in bag, Drop", m2.labels.join(",") === "Use,Equip (both hands),Put in bag,Drop" && m2.checked === 0, m2.labels.join(", "));
    clearMessage();
    const d2 = slotEl(2);
    if (d2) d2.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, ...at(d2) }));
    row("a double-click on the utility slot's halberd equips nothing and says why", id(belt[2]) === "halberd" && !me.hands.main && message() === "You can't equip a weapon from the utility slot.", `${held()}; "${message()}"`);
    const d0 = slotEl(0);
    if (d0) d0.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, ...at(d0) }));
    row("a double-click on the main-hand slot's sword draws it", id(me.hands.main) === "sword" && !belt[0], held());
    // The menu's Equip from the utility slot: the halberd into both hands, the sword put away (S3).
    const hal = belt[2];
    const eq = h.slotMenu("belt:2").find((m) => m.label === "Equip (both hands)");
    if (eq) eq.onSelect();
    row("the utility slot's Equip (both hands) holds the halberd in both hands", !!eq && me.hands.main === hal && me.hands.off === hal && belt[2] !== hal, `${held()}; slots ${belt.map(id).join(" ")}`);
    belt[3] = mk("shield");
    const m3 = h.slotMenu("belt:3").map((m) => m.label).join(",");
    row("a shield's menu in a main-hand slot offers Equip (off hand), its key still saying why", m3 === "Use,Equip (off hand),Put in bag,Drop", m3);
    // ---- no choice kept anywhere ----
    const rec = ((G.game.serialize().characters || {}).players || []).find((p) => p.id === me.id);
    row("no hand choice on the player, in the save, or in the players' sync part", !("beltHands" in me) && !!rec && !("beltHands" in rec) && !/beltHands/.test(G.game.syncParts().players), rec ? Object.keys(rec).filter((k) => /belt/i.test(k)).join(",") || "none" : "no record");

    // ---- two tabs: a belt, a sword, a book, and a bow for every other player ----
    if (opts.keep) {
      const others = G.game.state.players.filter((p) => p !== me);
      const bows = {};
      for (const p of others) {
        keptBack.push({ id: p.id, waist: p.worn.waist, hands: { main: p.hands.main, off: p.hands.off }, bag: inv.bagOf(p) ? inv.bagOf(p).items.slice() : null, offMemory: p.offMemory });
        p.worn.waist = mk("good_belt");
        const b = inv.beltOf(p);
        b[0] = mk("sword");
        b[1] = mk("book_of_fire");
        p.hands.main = null;
        p.hands.off = null;
        p.offMemory = null;
        bows[p.id] = intoBag(p, mk("bow")); // none when its bag has no room: the guest's bow rows say they were skipped
      }
      kept = others.length ? { players: others.map((p) => p.id), bows } : null;
      row("kept for the guest: every other player has the leather belt with a sword and a book, a bow in its bag where it fits, and empty hands; `{ stop: true }` puts them back", !!kept, kept ? JSON.stringify(kept) : "no other player");
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    card.hide();
    (await import("/src/ui/context-menu.js")).closeContextMenu();
    G.settings.set("beltOrder", order0);
    me.worn.waist = worn0.waist;
    me.worn.back = worn0.back;
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    if (bag0 && inv.bagOf(me)) inv.bagOf(me).items.splice(0, inv.bagOf(me).items.length, ...bag0);
    me.offMemory = offMemory0;
    if (handed0) me.handed = handed0.v; else delete me.handed;
    me.hunger = needs0.hunger;
    me.thirst = needs0.thirst;
    panel.setBagOpen(bagOpen0);
    render();
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  return done();
}
