// An item's menu and its Use survive walking (Michael's report, 2026-10-27: "if you right click something in your inventory to use it
// while walking, it unselects as you walk"; only the pause menu stops the game). From the console, on a tab with `?nosave&mute`:
//   await __game.check("menuwalk")
// With an unlit torch in the off hand and a tinderbox in the bag, the bag and the character screen open, it right-clicks the tinderbox
// on the page (a real `contextmenu` on its piece), holds D for a second (a real keydown, the loop stepped), and the menu is still open;
// clicks its Use, walks on (an auto-walk, then A held), and the Use mode is still on; clicks the torch in the off-hand slot (a real
// `pointerdown`), and the torch is lit. The tinderbox's menu closes when the tinderbox leaves the bag; the world's menu (a right tap on
// the canvas) still closes as the player walks, as it always has. Everything it touches is put back in the finally.
//
// Two tabs (`?nosave&mute&relay=none`): on the host `await __game.check("menuwalk", { keep: true })` runs the rows above and then gives
// every other player a tinderbox in its bag and an unlit torch in its off hand; on the guest `await __game.check("menuwalk", { guest: true })`
// does the same walk on its replica (the keys in its own snapshot), and its Use goes to the host as the use command, the torch lit on the
// replica; then `await __game.check("sync")` on the host, and `await __game.check("menuwalk", { stop: true })` there puts the other
// players' hands and bags back.

const keptBack = [];

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const done = () => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  };
  const me = G.player;
  if (opts.stop) {
    for (const k of keptBack.splice(0)) {
      const p = G.game.state.players.find((q) => q.id === k.id);
      if (!p) continue;
      p.hands.main = k.hands.main;
      p.hands.off = k.hands.off;
      const b = G.inventory.bagOf(p);
      if (b && k.bag) b.items.splice(0, b.items.length, ...k.bag);
    }
    row("the other players' hands and bags put back", true, "");
    return done();
  }
  const menu = await import("/src/ui/context-menu.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const use = await import("/src/use.js");
  const guest = G.net.status().role === "guest";
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  // On a guest a step waits on the wire too: real time between steps, so the host's frames arrive.
  const pump = async (until, ms = 10000) => {
    const t0 = performance.now();
    let last = t0;
    while (!until() && performance.now() - t0 < ms) {
      await yieldOnce();
      if (performance.now() - last >= 1000 / 60) { last = performance.now(); step(1); }
    }
    return until();
  };
  // A guest walks at the wall clock's pace, a step each sixtieth of a second, so the host hears every step's keys as it runs in real time.
  const walkFor = async (n) => {
    if (!guest) { step(n); return; }
    let last = performance.now();
    for (let i = 0; i < n;) {
      await yieldOnce();
      if (performance.now() - last >= 1000 / 60) { last = performance.now(); step(1); i++; }
    }
  };
  const key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const at = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
  const render = () => panel.renderInventoryPanel(me, G.inventory.bagOf(me), null, G.inventory.beltOf(me));
  const bag = () => G.inventory.bagOf(me);
  const boxEl = () => {
    const b = bag();
    const i = b ? b.items.findIndex((e) => e.id === "tinderbox") : -1;
    return i < 0 ? null : document.querySelector(`#inventory .inv-item[data-bag="inv"][data-index="${i}"]`);
  };
  const entryEl = (label) => [...document.querySelectorAll("#menu .menu-entry")].find((q) => q.textContent === label);
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  const bagOpen0 = panel.isBagOpen();
  const char0 = panel.isCharacter();
  const at0 = [me.gx, me.gy];
  const aggro0 = guest ? null : G.rules.rules.zombieAggro;
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const bag0 = bag() ? bag().items.slice() : null;
  const held = [];
  try {
    G.loop.setPaused(true);
    if (screen0) G.screens.hide();
    if (!guest) {
      G.rules.set({ zombieAggro: false });
      me.hands.main = null;
      me.hands.off = G.items.makeEntry("torch", 1);
      for (const e of [...bag().items]) if (e.id === "tinderbox") G.inventory.detach(me, e);
      G.inventory.addItem(bag(), "tinderbox", 1);
      step(2);
    } else {
      await pump(() => !!me.hands.off && me.hands.off.id === "torch" && !!bag() && bag().items.some((e) => e.id === "tinderbox"), 10000);
    }
    const torch = () => me.hands.off;
    row(`${guest ? "on a guest my replica holds" : "the player holds"} an unlit torch in the off hand with a tinderbox in the bag`, !!torch() && torch().id === "torch" && !torch().lit && !!bag() && bag().items.some((e) => e.id === "tinderbox"), `off ${torch() ? `${torch().id} lit ${!!torch().lit}` : "empty"}; bag ${bag() ? bag().items.map((e) => e.id).join(",") : "-"}`);
    panel.setBagOpen(true);
    panel.setCharacterOpen(true);
    render();

    // The tinderbox's menu on the page, then a second of D held: the menu stays.
    const el = boxEl();
    if (el) el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...at(el) }));
    const opened = menu.isMenuOpen() && menu.isItemMenu() && !!entryEl("Use");
    const from = [me.gx, me.gy];
    key("KeyD");
    held.push("KeyD");
    let movedAll = true;
    for (let i = 0; i < 60; i++) { await walkFor(1); if (!me.moving) movedAll = false; }
    const walked = Math.hypot(me.gx - from[0], me.gy - from[1]);
    const stayed = menu.isMenuOpen() && !!entryEl("Use");
    row("the tinderbox's menu, opened on the bag while D is held, stays open through a second of walking", opened && stayed && movedAll && walked > 0.5, `opened ${opened}; after 60 steps open ${stayed}, moving every step ${movedAll}, walked ${walked.toFixed(2)} tiles`);

    // Its Use, then walking on: the Use mode stays.
    const u = entryEl("Use");
    if (u) u.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const began = use.isActive() && use.current_()?.entry?.id === "tinderbox" && !menu.isMenuOpen();
    await walkFor(30);
    key("KeyD", "keyup");
    held.splice(held.indexOf("KeyD"), 1);
    if (!guest) {
      G.walkTo(Math.round(me.gx) - 2, Math.round(me.gy));
      step(20);
    }
    const autoOn = guest || !!me.auto;
    key("KeyA");
    held.push("KeyA");
    await walkFor(30);
    const still = use.isActive() && use.current_()?.entry?.id === "tinderbox";
    row(`its Use begins the Use mode, which stays through walking on (D, ${guest ? "" : "an auto-walk, "}then A held)`, began && still && autoOn, `began ${began}; ${guest ? "" : `auto-walk ${autoOn}; `}still on ${still}`);

    // The torch in the off-hand slot is the target, while walking: lit.
    render();
    const slot = document.querySelector(`#inventory .inv-item[data-slot="hand:off"]`);
    if (slot) slot.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...at(slot) }));
    const lit = guest ? await pump(() => !!torch() && !!torch().lit, 10000) : (step(1), !!torch() && !!torch().lit);
    row(`a click on the torch in the off-hand slot, still walking, lights it${guest ? " (the use command to the host, the replica's torch lit)" : ""}`, !!slot && lit && !use.isActive(), `slot ${!!slot}; lit ${!!(torch() && torch().lit)}; Use mode ${use.isActive()}`);
    key("KeyA", "keyup");
    held.splice(held.indexOf("KeyA"), 1);
    await walkFor(2);

    if (!guest) {
      // The item gone, its menu goes with it.
      render();
      const el2 = boxEl();
      if (el2) el2.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...at(el2) }));
      const open2 = menu.isMenuOpen();
      for (const e of [...bag().items]) if (e.id === "tinderbox") G.inventory.detach(me, e);
      step(1);
      row("the tinderbox's menu closes when the tinderbox leaves the bag", open2 && !menu.isMenuOpen(), `open ${open2}, then ${menu.isMenuOpen()}`);

      // The world's menu still closes as the player walks.
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 + 40, cy = rect.top + rect.height / 2 + 30;
      canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent("mousedown", { button: 2, clientX: cx, clientY: cy, bubbles: true }));
      step(1);
      window.dispatchEvent(new MouseEvent("mouseup", { button: 2, clientX: cx, clientY: cy, bubbles: true }));
      step(2);
      const worldOpen = menu.isMenuOpen() && !menu.isItemMenu();
      key("KeyD");
      held.push("KeyD");
      step(3);
      const worldShut = !menu.isMenuOpen();
      key("KeyD", "keyup");
      held.splice(held.indexOf("KeyD"), 1);
      step(2);
      row("the world's menu (a right tap on the ground) still closes when the player walks", worldOpen && worldShut, `opened ${worldOpen}, shut after walking ${worldShut}`);

      if (opts.keep) {
        for (const p of G.game.state.players.filter((q) => q !== me)) {
          const b = G.inventory.bagOf(p);
          keptBack.push({ id: p.id, hands: { main: p.hands.main, off: p.hands.off }, bag: b ? b.items.slice() : null });
          p.hands.main = null;
          p.hands.off = G.items.makeEntry("torch", 1);
          if (b) G.inventory.addItem(b, "tinderbox", 1);
        }
        row("every other player given an unlit torch in the off hand and a tinderbox in the bag, for the guest's half", true, `${keptBack.length} players`);
      }
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    for (const k of held) key(k, "keyup");
    if (use.isActive()) use.cancel();
    if (menu.isMenuOpen()) menu.closeContextMenu();
    if (!guest) {
      me.auto = null;
      me.hands.main = hands0.main;
      me.hands.off = hands0.off;
      if (bag() && bag0) bag().items.splice(0, bag().items.length, ...bag0);
      G.teleport(at0[0], at0[1]);
      G.rules.set({ zombieAggro: aggro0 });
    }
    panel.setBagOpen(bagOpen0);
    panel.setCharacterOpen(char0);
    step(1);
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  return done();
}
