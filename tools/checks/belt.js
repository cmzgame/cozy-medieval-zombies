// The belt (#285; Michael, 2026-10-19: a belt slot's key does one thing, into the hand chosen for that slot; no left-click parity; the
// halberd kept off). From the console, on a tab with `?nosave`:
//   await __game.check("belt")
// It wears the leather belt and presses the real keys 1 to 4 (a keydown on the window, the loop stepped): a food is eaten, a skin drunk
// from, a sword drawn into the main hand, a book into the off hand (its own hand, never refused until a hand is set), a torch into a free
// hand, a lit torch on the belt giving its light where it sits, and the tinderbox left where it is with a word. On the page: the slot's menu
// (a right-click on the hotbar) offers Equip, Equip to main hand, and Equip to off hand, the current one marked in gold; clicking Equip to
// main hand draws the book there and the choice sticks to the slot (the key then draws it there), through a save and in the players' sync
// part; the refusals in words (a shield to the main hand, the bow to the off hand), the choice left as it was; a double-click on the slot
// draws into the chosen hand; the halberd refused onto the belt by the slot check, a guest's slot command, and an empty slot's key, with
// its word; the cards, over the bag and over a belt slot (the slot's hand). Everything worn, held, carried, and the choices are put back.
//
// Two tabs (`?nosave&relay=none`): on the host `await __game.check("belt", { keep: true })` runs the rows above and then gives every other
// player the leather belt with a sword in slot 1 and a book in slot 2, a halberd in its bag, and empty hands, and returns `kept`; on the
// guest `await __game.check("belt", { guest: <kept> })` reads its replica's belt and marks, sends Equip to main hand by its label (the
// panel's command) and waits for the book in its main hand and the choice on its record, puts it back by a slot command, presses key 2
// in its snapshot (`net.setTestSnapshot`) and waits for the book drawn into the main hand, double-clicks slot 1 through the remote
// handlers, and sends the halberd onto the belt and sees it refused; then `await __game.check("sync")` on the host.

export async function run(game, opts = {}) {
  const G = game;
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
  const message = () => ((document.getElementById("message") || {}).textContent || "").trim();
  const marked = (i) => G.interact.slotMenu(me, `belt:${i}`).filter((m) => m.checked).map((m) => m.label).join(",");
  const held = () => `main ${me.hands.main ? me.hands.main.id : "-"}, off ${me.hands.off ? me.hands.off.id : "-"}`;
  let kept = null;
  const done = () => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, kept };
  };

  // ---- a guest's side: its own belt on the replica, the menu's label, a slot command, its key, a double-click, the halberd ----
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
    try {
      const belt = inv.beltOf(me);
      row("on the guest my replica wears the leather belt the host gave, a sword in slot 1 and a book in slot 2, my hands empty", !!belt && belt.length === 4 && belt[0] && belt[0].id === "sword" && belt[1] && belt[1].id === "book_of_fire" && !me.hands.main && !me.hands.off, belt ? belt.map((e) => (e ? e.id : "-")).join(" ") : "no belt");
      row("the replica's menus mark the defaults: the sword's main hand, the book's off hand", marked(0) === "Equip to main hand" && marked(1) === "Equip to off hand", `${marked(0)} / ${marked(1)}`);
      const book = belt && belt[1];
      // The menu's label, as the panel sends it (createRemoteInventoryActions' slotMenu).
      const remote = actionsMod.createRemoteInventoryActions(() => me, () => null, (cmd) => G.net.sendItem(cmd));
      const entry = remote.slotMenu("belt:1").find((m) => m.label === "Equip to main hand");
      if (entry) entry.onSelect();
      const ms1 = await pump(() => me.hands.main && book && me.hands.main.uid === book.uid && me.beltHands && me.beltHands[1] && me.beltHands[1].hand === "main");
      row("Equip to main hand, sent by its label, runs on the host: the book in my main hand on the replica and the choice on my record", !!entry && me.hands.main && book && me.hands.main.uid === book.uid && me.beltHands[1] && me.beltHands[1].id === "book_of_fire" && me.beltHands[1].hand === "main", `${held()}; ${JSON.stringify(me.beltHands)}; ${ms1} ms`);
      // Back onto slot 2 by a slot command (the panel's drag).
      if (book) G.net.sendItem({ op: "slot", uid: book.uid, src: { kind: "slot", id: "hand:main" }, slot: "belt:1" });
      const ms2 = await pump(() => { const b = inv.beltOf(me); return !!(b && b[1] && book && b[1].uid === book.uid && !me.hands.main); });
      row("put back on slot 2 by a slot command, the slot's menu marks the main hand (the host's record of my choice)", inv.beltOf(me)[1] && inv.beltOf(me)[1].uid === book.uid && marked(1) === "Equip to main hand", `${marked(1)}; ${held()}; ${ms2} ms`);
      // Key 2 in my snapshot, for one step: the host's step presses it for my player.
      G.net.setTestSnapshot({ axis: { x: 0, y: 0 }, keys: { belt2: true } });
      G.loop.advance(1 / 60);
      G.net.setTestSnapshot(null);
      const ms3 = await pump(() => me.hands.main && me.hands.main.uid === book.uid && !inv.beltOf(me)[1]);
      row("my key 2, in my snapshot, draws the book into the chosen main hand on the host, and the replica shows it", me.hands.main && me.hands.main.uid === book.uid && !inv.beltOf(me)[1], `${held()}; ${ms3} ms`);
      // A double-click on slot 1 through the remote handlers: Equip, the sword into its hand (the main, the book going to the bag or the belt).
      const sword = inv.beltOf(me)[0];
      const dbl = remote.useSlot("belt:0");
      const ms4 = await pump(() => me.hands.main && sword && me.hands.main.uid === sword.uid);
      row("a double-click on slot 1 sends Equip, and the sword is drawn into its main hand", dbl === true && me.hands.main && sword && me.hands.main.uid === sword.uid, `${held()}; ${ms4} ms`);
      // The halberd onto the belt: the host's slot check refuses a guest's command too (#226).
      const bag = inv.bagOf(me);
      const halberd = bag && bag.items.find((e) => e.id === "halberd");
      const free = inv.beltOf(me).indexOf(null);
      if (halberd && free >= 0) G.net.sendItem({ op: "slot", uid: halberd.uid, src: { kind: "bag", bag: { mine: true } }, slot: `belt:${free}` });
      await pump(() => /too long for the belt/.test(message()), 4000);
      row("my halberd sent onto a free belt slot is refused by the host: still in my bag, the slot empty, and the word reaches me", !!halberd && free >= 0 && bag.items.some((e) => e.uid === halberd.uid) && !inv.beltOf(me)[free] && message() === "The halberd is too long for the belt.", `${halberd ? "a halberd" : "no halberd"}, slot ${free + 1}; "${message()}"`);
      // The cards on the replica: the sword's from the belt, and slot 1's own hand (the book is there now, or the slot is empty).
      const swordCard = info.textOf(info.cardFor(mk("sword"))).join(" | ");
      row("on the guest the sword's card says the belt draws it into the main hand", swordCard.includes("Equip: main or off hand; from the belt, the main hand."), swordCard);
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
  const beltHands0 = me.beltHands;
  const offMemory0 = me.offMemory;
  const needs0 = { hunger: me.hunger, thirst: me.thirst };
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
  const fresh = () => {
    me.worn.waist = mk("good_belt");
    me.hands.main = null;
    me.hands.off = null;
    me.beltHands = [];
    me.offMemory = null;
    belt = inv.beltOf(me);
    return belt;
  };
  const render = () => panel.renderInventoryPanel(me, inv.bagOf(me), null, inv.beltOf(me));
  // Into a bag where it fits, else laid at its corner (a halberd is five cells long: a sack's grid may have no room; the commands find it by uid).
  const intoBag = (p, e) => {
    const b = inv.bagOf(p);
    if (!b || G.grid.insert(b, e)) return;
    Object.assign(e, { x: 0, y: 0, rot: false });
    b.items.push(e);
  };
  const bagOpen0 = panel.isBagOpen();
  const slotEl = (i) => document.querySelector(`#hotbar .inv-item[data-slot="belt:${i}"]`);
  const at = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
  try {
    if (!inv.bagOf(me)) throw new Error("no bag on the back to try the belt with");
    // ---- each kind's one thing, by the real keys ----
    fresh();
    me.hunger = 10;
    me.thirst = me.maxThirst - 30; // not thirsty: no auto-sip in the steps, so the skin's fill moves by the key alone
    belt[0] = mk("bread");
    belt[1] = mk("waterskin", { fill: 80, clean: true });
    press(1);
    press(2);
    row("key 1 eats the bread on slot 1 and key 2 drinks from the skin on slot 2, the hands untouched", !belt[0] && belt[1] && belt[1].fill < 80 && me.hunger > 10 && !me.hands.main && !me.hands.off, `slot 1 ${belt[0] ? belt[0].id : "empty"}, skin ${belt[1] ? belt[1].fill : "-"}%, hunger ${Math.round(me.hunger)}; ${held()}`);
    fresh();
    belt[0] = mk("sword");
    belt[1] = mk("book_of_fire");
    press(2);
    row("key 2 draws the book into the off hand with both hands empty (its own hand; it went to the main hand before)", me.hands.off && me.hands.off.id === "book_of_fire" && !me.hands.main, held());
    press(1);
    row("key 1 draws the sword into the main hand, the book kept in the off hand", me.hands.main && me.hands.main.id === "sword" && me.hands.off && me.hands.off.id === "book_of_fire", held());
    fresh();
    me.hands.main = mk("sword");
    belt[2] = mk("torch");
    belt[2].lit = true;
    G.loop.advance(1 / 60);
    const lightOnBelt = G.light.carriers().find((c) => c.owner === me.id);
    row("a lit torch on the belt gives its light where it sits, at the belt's strength", !!lightOnBelt && lightOnBelt.strength === G.tuning.world.beltLight, lightOnBelt ? `strength ${lightOnBelt.strength}` : "no carried light");
    press(3);
    row("key 3 swaps the torch into a hand: the free one, the off hand beside the sword, as before", me.hands.off && me.hands.off.id === "torch" && me.hands.main && me.hands.main.id === "sword" && !belt[2], held());
    belt[3] = mk("tinderbox");
    press(4);
    row("key 4 leaves the tinderbox on the belt and says why", belt[3] && belt[3].id === "tinderbox" && /not held in a hand/.test(message()), `"${message()}"`);
    // ---- the slot's menu on the page: Equip, the two hands, the mark ----
    fresh();
    belt[0] = mk("sword");
    belt[1] = mk("book_of_fire");
    panel.setBagOpen(true);
    render();
    const el1 = slotEl(1);
    if (el1) el1.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...at(el1) }));
    const entries = [...document.querySelectorAll("#menu .menu-entry")];
    const checked = entries.filter((e) => e.classList.contains("checked"));
    const mark = checked[0] ? getComputedStyle(checked[0], "::before") : null;
    const probe = document.createElement("i");
    probe.style.color = "var(--gold)";
    document.body.appendChild(probe);
    const gold = getComputedStyle(probe).color;
    probe.remove();
    row("the book's slot menu on the page: Use, Equip, Equip to main hand, Equip to off hand, and more", entries.map((e) => e.textContent).join(",").startsWith("Use,Equip,Equip to main hand,Equip to off hand"), entries.map((e) => e.textContent).join(", "));
    row("the current choice, the book's own off hand, is marked with a gold check before it", checked.length === 1 && checked[0].textContent === "Equip to off hand" && !!mark && mark.content.includes("✓") && mark.color === gold, checked.length ? `${checked[0].textContent}: ${mark && mark.content} in ${mark && mark.color} (gold ${gold})` : "nothing marked");
    const toMain = entries.find((e) => e.textContent === "Equip to main hand");
    if (toMain) toMain.click();
    row("clicking Equip to main hand draws the book into the main hand and keeps the choice for slot 2", me.hands.main && me.hands.main.id === "book_of_fire" && me.beltHands[1] && me.beltHands[1].hand === "main", `${held()}; ${JSON.stringify(me.beltHands)}`);
    const book = me.hands.main;
    if (book) { G.items.release(me.hands, book); belt[1] = book; }
    row("put back, its slot's menu marks the main hand", marked(1) === "Equip to main hand", marked(1));
    const parts0 = G.game.syncParts().players;
    const choice = me.beltHands;
    me.beltHands = [];
    const parts1 = G.game.syncParts().players;
    me.beltHands = choice;
    row("the choice is in the players' sync part", parts0 !== parts1, `${parts0} with, ${parts1} without`);
    const saved = JSON.parse(JSON.stringify(G.game.serialize()));
    const rec = ((saved.characters && saved.characters.players) || []).find((p) => p.id === me.id); // game.serialize keeps the players under `characters`
    row("the choice is in the save, on the player's record", !!rec && Array.isArray(rec.beltHands) && rec.beltHands[1] && rec.beltHands[1].hand === "main", rec ? JSON.stringify(rec.beltHands) : "no record");
    press(2);
    row("key 2 now draws the book into the main hand", me.hands.main && me.hands.main.id === "book_of_fire" && !belt[1], held());
    // ---- the hover card on a belt slot says the slot's hand ----
    G.items.release(me.hands, me.hands.main);
    belt[1] = mk("book_of_fire");
    me.beltHands = [null, null, null, null];
    inv.setBeltHand(me, 0, "off");
    render();
    const el0 = slotEl(0);
    if (el0) el0.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, ...at(el0) }));
    await wait(HC.delayMs + 80);
    const cardText = (document.getElementById("hover-card") || {}).textContent || "";
    row("over slot 1 (a sword chosen for the off hand) the card says this slot draws it into the off hand", /this slot draws it into the off hand/.test(cardText), cardText.slice(0, 160));
    card.hide();
    // ---- the double-click draws into the chosen hand ----
    me.hands.main = mk("mace");
    render();
    const d0 = slotEl(0);
    if (d0) d0.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, ...at(d0) }));
    row("a double-click on slot 1 draws the sword into its chosen off hand, the mace kept in the main hand", me.hands.off && me.hands.off.id === "sword" && me.hands.main && me.hands.main.id === "mace", held());
    // ---- the refusals ----
    fresh();
    belt[0] = mk("shield");
    belt[1] = mk("bow");
    G.interact.slotMenu(me, "belt:0").find((m) => m.label === "Equip to main hand").onSelect();
    const shieldWord = message();
    G.interact.slotMenu(me, "belt:1").find((m) => m.label === "Equip to off hand").onSelect();
    const bowWord = message();
    row("a shield to the main hand is refused in words, the shield left on the belt and the choice as it was", shieldWord === "The wooden shield cannot be held in your main hand." && belt[0] && belt[0].id === "shield" && !me.hands.main && marked(0) === "Equip to off hand", `"${shieldWord}"; ${marked(0)}`);
    row("the bow to the off hand is refused: \"The hunting bow needs both hands.\"", bowWord === "The hunting bow needs both hands." && belt[1] && belt[1].id === "bow", `"${bowWord}"`);
    // ---- the halberd ----
    fresh();
    const h = actionsMod.createInventoryActions(() => me);
    const halberd = mk("halberd");
    intoBag(me, halberd);
    const inBag = inv.bagOf(me).items.includes(halberd);
    row("the slot check refuses the halberd on every belt slot (a sword it takes)", [0, 1, 2, 3].every((i) => !h.canPlace(halberd, `belt:${i}`)) && h.canPlace(mk("sword"), "belt:0"), "belt:0 to belt:3");
    const ran = inBag ? actionsMod.performItemCommand(me, { op: "slot", uid: halberd.uid, src: { kind: "bag", bag: { mine: true } }, slot: "belt:0" }) : null;
    row("a guest's slot command with the halberd is refused, with the word", inBag && ran === false && !belt[0] && message() === "The halberd is too long for the belt.", `in the bag ${inBag}; ran ${ran}; "${message()}"`);
    h.slotRefused(halberd, "belt:0");
    row("a drag of it let go over a belt slot says the same", message() === "The halberd is too long for the belt.", `"${message()}"`);
    if (inBag) inv.bagOf(me).items.splice(inv.bagOf(me).items.indexOf(halberd), 1);
    me.hands.main = halberd;
    me.hands.off = halberd;
    press(1);
    row("an empty slot's key does not take a held halberd, and says why", me.hands.main === halberd && !belt[0] && message() === "The halberd is too long for the belt.", `${held()}; "${message()}"`);
    me.hands.main = null;
    me.hands.off = null;
    // ---- the cards that changed ----
    const text = (id) => info.textOf(info.cardFor(mk(id))).join(" | ");
    const cards = { sword: "Equip: main or off hand; from the belt, the main hand.", book_of_fire: "Equip: main or off hand; from the belt, the off hand.", torch: "Equip: main or off hand; from the belt, a free hand.", halberd: "Equip: both hands; too long for the belt." };
    const off = Object.entries(cards).filter(([id, line]) => !text(id).includes(line));
    row("the cards: a sword, a book, and a torch say where the belt draws them; the halberd that it is too long for the belt", off.length === 0, Object.keys(cards).map((id) => text(id)).join(" || "));
    // Over the bag, on the page: the book's card.
    const bookInBag = mk("book_of_fire");
    G.inventory.stow(me, bookInBag);
    render();
    const bEl = [...document.querySelectorAll(".inv-item[data-bag='inv']")].find((e) => /book/i.test(e.getAttribute("aria-label") || ""));
    if (bEl) bEl.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, ...at(bEl) }));
    await wait(HC.delayMs + 80);
    const bookCard = (document.getElementById("hover-card") || {}).textContent || "";
    row("over the bag the book's card reads its belt hand on the page", bookCard.includes("from the belt, the off hand"), bookCard.slice(0, 160));
    card.hide();
    G.inventory.detach(me, bookInBag);

    // ---- two tabs: a belt, a sword, a book, and a halberd for every other player ----
    if (opts.keep) {
      const others = G.game.state.players.filter((p) => p !== me);
      for (const p of others) {
        p.worn.waist = mk("good_belt");
        const b = inv.beltOf(p);
        b[0] = mk("sword");
        b[1] = mk("book_of_fire");
        p.hands.main = null;
        p.hands.off = null;
        p.beltHands = [];
        p.offMemory = null;
        intoBag(p, mk("halberd"));
      }
      kept = others.length ? { players: others.map((p) => p.id) } : null;
      row("kept for the guest: every other player has the leather belt with a sword and a book, a halberd in its bag, and empty hands", !!kept, kept ? JSON.stringify(kept) : "no other player");
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    card.hide();
    (await import("/src/ui/context-menu.js")).closeContextMenu();
    me.worn.waist = worn0.waist;
    me.worn.back = worn0.back;
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    if (bag0 && inv.bagOf(me)) inv.bagOf(me).items.splice(0, inv.bagOf(me).items.length, ...bag0);
    me.beltHands = beltHands0;
    me.offMemory = offMemory0;
    me.hunger = needs0.hunger;
    me.thirst = needs0.thirst;
    panel.setBagOpen(bagOpen0);
    render();
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  return done();
}
