// An item's menu and its Use survive walking (Michael's report, 2026-10-27: "if you right click something in your inventory to use it
// while walking, it unselects as you walk"; only the pause menu stops the game), and the menu goes when what it was opened on goes
// (the review of #547). From the console, on a tab with `?nosave&mute`:
//   await __game.check("menuwalk")
// With an unlit torch in the off hand, a tinderbox in the bag, and a leather belt worn with a sword in its first main-hand slot, the bag
// and the character screen open, everything by real DOM events with the loop stepped: the tinderbox's menu (a `contextmenu` on its
// piece) stays open through a second of D held; its Use stays on through an auto-walk and A held; a `pointerdown` on the off hand's torch
// lights it. The off hand's torch's menu and the belt sword's menu each stay open through a second of walking; the belt key 1 drawing the
// sword closes the belt slot's menu. The menu closes when its item leaves the bag, when its panel closes (the bag's X for a bag item, C for
// a hand), and when the chest open beside the bag is walked out of reach (a chest item's menu, and a bag item's with its "Store in chest",
// which then stores nothing, picked after the step or before it); opening a second chest closes a bag item's menu opened with the first.
// The world's menu (a right tap on the canvas) still closes as the player walks. Everything it touches is put back in the finally.
//
// Two tabs (`?nosave&mute&relay=none`): on the host `await __game.check("menuwalk", { keep: true })` runs the rows above and then gives
// every other player a tinderbox in its bag, an unlit torch in its off hand, and a leather belt with a sword in its first main-hand slot;
// on the guest `await __game.check("menuwalk", { guest: true })` walks its replica (the keys in its own snapshot) with the bag item's,
// the hand's, and the belt slot's menus each open, its Use going to the host as the use command and the replica's torch lit, and the belt
// key's draw (a key event to the host) closing the belt slot's menu; then `await __game.check("sync")` on the host, and
// `await __game.check("menuwalk", { stop: true })` there puts the other players' hands, belts, and bags back.

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
      p.worn.waist = k.waist;
      const b = G.inventory.bagOf(p);
      if (b && k.bag) b.items.splice(0, b.items.length, ...k.bag);
    }
    row("the other players' hands, belts, and bags put back", true, "");
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
  const walkFor = async (n, each = null) => {
    let last = performance.now();
    for (let i = 0; i < n;) {
      if (guest) { await yieldOnce(); if (performance.now() - last < 1000 / 60) continue; last = performance.now(); }
      step(1);
      i++;
      if (each) each();
    }
  };
  const held = [];
  const key = (code, type = "keydown") => {
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    if (type === "keydown") held.push(code);
    else if (held.includes(code)) held.splice(held.indexOf(code), 1);
  };
  const at = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
  const render = () => panel.renderInventoryPanel(me, G.inventory.bagOf(me), G.openBag ? G.openBag.bag : null, G.inventory.beltOf(me));
  const bag = () => G.inventory.bagOf(me);
  const belt = () => G.inventory.beltOf(me);
  const bagEl = (id, which = "inv") => {
    const b = which === "inv" ? bag() : G.openBag && G.openBag.bag;
    const i = b ? b.items.findIndex((e) => e.id === id) : -1;
    return i < 0 ? null : document.querySelector(`#inventory .inv-item[data-bag="${which}"][data-index="${i}"]`);
  };
  const slotEl = (slot) => document.querySelector(`.inv-item[data-slot="${slot}"]`);
  const rightClick = (el) => { if (el) el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...at(el) })); return !!el && menu.isMenuOpen() && menu.isItemMenu(); };
  const entryEl = (label) => [...document.querySelectorAll("#menu .menu-entry")].find((q) => q.textContent === label);
  const shut = () => { if (menu.isMenuOpen()) menu.closeContextMenu(); };
  // A menu open through a walk: D held for `n` steps, moving every step, the menu open at the end.
  const walkWithMenu = async (n = 60, code = "KeyD") => {
    const from = [me.gx, me.gy];
    let movedAll = true;
    key(code);
    await walkFor(n, () => { if (!me.moving) movedAll = false; });
    key(code, "keyup");
    const open = menu.isMenuOpen() && menu.isItemMenu();
    await walkFor(2);
    return { open, movedAll, walked: Math.hypot(me.gx - from[0], me.gy - from[1]) };
  };
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  const bagOpen0 = panel.isBagOpen();
  const char0 = panel.isCharacter();
  const at0 = [me.gx, me.gy];
  const aggro0 = guest ? null : G.rules.rules.zombieAggro;
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const waist0 = me.worn.waist;
  const bag0 = bag() ? bag().items.slice() : null;
  const props = [];
  try {
    G.loop.setPaused(true);
    if (screen0) G.screens.hide();
    if (!guest) {
      G.rules.set({ zombieAggro: false });
      me.hands.main = null;
      me.hands.off = G.items.makeEntry("torch", 1);
      me.worn.waist = G.items.makeEntry("good_belt", 1);
      belt()[0] = G.items.makeEntry("sword", 1);
      for (const e of [...bag().items]) if (e.id === "tinderbox") G.inventory.detach(me, e);
      G.inventory.addItem(bag(), "tinderbox", 1);
      step(2);
    } else {
      await pump(() => !!me.hands.off && me.hands.off.id === "torch" && !!bag() && bag().items.some((e) => e.id === "tinderbox") && !!belt() && !!belt()[0], 10000);
    }
    const torch = () => me.hands.off;
    row(`${guest ? "on a guest my replica holds" : "the player holds"} an unlit torch in the off hand, a tinderbox in the bag, and a sword on the belt's first main-hand slot`, !!torch() && torch().id === "torch" && !torch().lit && !!bag() && bag().items.some((e) => e.id === "tinderbox") && !!belt() && !!belt()[0] && belt()[0].id === "sword", `off ${torch() ? `${torch().id} lit ${!!torch().lit}` : "empty"}; bag ${bag() ? bag().items.map((e) => e.id).join(",") : "-"}; belt ${belt() ? belt().map((e) => (e ? e.id : "")).join(",") : "none"}`);
    panel.setBagOpen(true);
    panel.setCharacterOpen(true);
    render();

    // ---- the tinderbox's Use, while walking, on the torch in the hand ----
    const opened = rightClick(bagEl("tinderbox")) && !!entryEl("Use");
    // A guest stands where the host put it, which may be against something on D's side (its first walk once made 0.4 tiles): it walks A first.
    const w1 = await walkWithMenu(60, guest ? "KeyA" : "KeyD");
    row(`the tinderbox's menu, opened on the bag while ${guest ? "A" : "D"} is held, stays open through a second of walking`, opened && w1.open && w1.movedAll && w1.walked > 0.5, `opened ${opened}; after 60 steps open ${w1.open}, moving every step ${w1.movedAll}, walked ${w1.walked.toFixed(2)} tiles`);
    const u = entryEl("Use");
    if (u) u.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const began = use.isActive() && use.current_()?.entry?.id === "tinderbox" && !menu.isMenuOpen();
    key("KeyD");
    await walkFor(30);
    key("KeyD", "keyup");
    if (!guest) {
      G.walkTo(Math.round(me.gx) - 2, Math.round(me.gy));
      step(20);
    }
    const autoOn = guest || !!me.auto;
    key("KeyA");
    await walkFor(30);
    const still = use.isActive() && use.current_()?.entry?.id === "tinderbox";
    row(`its Use begins the Use mode, which stays through walking on (D, ${guest ? "" : "an auto-walk, "}then A held)`, began && still && autoOn, `began ${began}; ${guest ? "" : `auto-walk ${autoOn}; `}still on ${still}`);
    render();
    const off = slotEl("hand:off");
    if (off) off.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...at(off) }));
    const lit = guest ? await pump(() => !!torch() && !!torch().lit, 10000) : (step(1), !!torch() && !!torch().lit);
    row(`a click on the torch in the off-hand slot, still walking, lights it${guest ? " (the use command to the host, the replica's torch lit)" : ""}`, !!off && lit && !use.isActive(), `slot ${!!off}; lit ${!!(torch() && torch().lit)}; Use mode ${use.isActive()}`);
    key("KeyA", "keyup");
    await walkFor(2);

    // ---- a hand's menu and a belt slot's menu, through a walk ----
    render();
    const handOpen = rightClick(slotEl("hand:off"));
    const w2 = await walkWithMenu(60, "KeyA");
    row("the off hand's torch's menu (the character screen) stays open through a second of walking", handOpen && w2.open && w2.movedAll && w2.walked > 0.5, `opened ${handOpen}; open ${w2.open}, moving every step ${w2.movedAll}, walked ${w2.walked.toFixed(2)} tiles`);
    shut();
    render();
    const beltOpen = rightClick(slotEl("belt:0"));
    const w3 = await walkWithMenu(60, "KeyD");
    row("the belt sword's menu (the hotbar) stays open through a second of walking", beltOpen && w3.open && w3.movedAll && w3.walked > 0.5, `opened ${beltOpen}; open ${w3.open}, moving every step ${w3.movedAll}, walked ${w3.walked.toFixed(2)} tiles`);
    // The belt key 1 draws the sword into the main hand: the slot's item has gone, and its menu with it (a key event, the host's on a guest).
    key("Digit1");
    await walkFor(1);
    key("Digit1", "keyup");
    const drawn = await pump(() => !!me.hands.main && me.hands.main.id === "sword", guest ? 10000 : 200);
    await walkFor(1);
    row(`the belt key 1 drawing the sword closes the belt slot's menu${guest ? " (on a guest, once the host's draw reaches the replica)" : ""}`, beltOpen && drawn && !menu.isMenuOpen(), `drawn ${drawn}; menu open ${menu.isMenuOpen()}`);
    shut();

    if (!guest) {
      // ---- the menu goes with its item, and with its panel ----
      render();
      const gone0 = rightClick(bagEl("tinderbox"));
      const box = bag().items.find((e) => e.id === "tinderbox");
      G.inventory.detach(me, box);
      step(1);
      row("the tinderbox's menu closes when the tinderbox leaves the bag", gone0 && !menu.isMenuOpen(), `open ${gone0}, then ${menu.isMenuOpen()}`);
      G.inventory.addItem(bag(), "tinderbox", 1);
      render();
      const bagMenu = rightClick(bagEl("tinderbox"));
      const x = document.querySelector('#inventory button[data-close="bag"]');
      if (x) x.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      key("KeyD");
      await walkFor(10);
      key("KeyD", "keyup");
      const bagShut = !panel.isBagOpen() && !menu.isMenuOpen();
      panel.setBagOpen(true);
      render();
      const handMenu = rightClick(slotEl("hand:off"));
      key("KeyC");
      await walkFor(1);
      key("KeyC", "keyup");
      key("KeyA");
      await walkFor(10);
      key("KeyA", "keyup");
      const charShut = !panel.isCharacter() && !menu.isMenuOpen();
      row("a bag item's menu closes with the bag (its X), and a hand's with the character screen (C), never left floating", bagMenu && !!x && bagShut && handMenu && charShut, `bag menu ${bagMenu}, closed with the bag ${bagShut}; hand menu ${handMenu}, closed with C ${charShut}`);
      panel.setCharacterOpen(true);

      // ---- a chest beside the bag: out of reach, its menus go, and Store in stores nothing ----
      // A chest on a free tile beside the player, on the side away from D (D walks gx up, gy down).
      const findFree = (cx, cy, avoid = []) => {
        for (let r = 1; r < 5; r++) for (const [dx, dy] of [[-r, 0], [0, r], [-r, r], [r, 0], [0, -r]]) {
          const tx = cx + dx, ty = cy + dy;
          G.map.ensureAround(tx, ty, 1);
          const t = G.map.tileAt(tx, ty);
          if (t && !t.prop && G.map.isWalkableTile(tx, ty) && !avoid.some(([ax, ay]) => ax === tx && ay === ty)) return [tx, ty];
        }
        return null;
      };
      const home = [Math.round(me.gx), Math.round(me.gy)];
      const placeChest = (tile) => {
        const c = G.map.createProp({ sprite: "chest", tile });
        G.map.placeProp(c, tile[0], tile[1]);
        props.push(c);
        const b = G.interact.propBag(c); // made first: the chest's searched mark after it, so its Open runs with no search
        c.searched = true;
        b.items.length = 0;
        return { prop: c, bag: b };
      };
      const t1 = findFree(home[0], home[1]);
      const t2 = t1 ? findFree(home[0], home[1], [t1]) : null;
      if (!t1 || !t2) row("two free tiles beside the player for the chests", false, `${JSON.stringify(t1)} ${JSON.stringify(t2)}`);
      else {
        const A = placeChest(t1);
        const B = placeChest(t2);
        G.grid.insert(A.bag, G.items.makeEntry("apple", 1));
        const back = () => { G.teleport(home[0] + 0.1, home[1] + 0.1); step(2); };
        const openA = () => { back(); G.interact.performByLabel(me, { kind: "prop", id: A.prop.id }, "Open chest"); step(1); render(); return !!G.openBag && G.openBag.bag === A.bag; };
        const walkOut = async () => { key("KeyD"); let n = 0; while (G.openBag && n < 240) { await walkFor(1); n++; } await walkFor(1); key("KeyD", "keyup"); await walkFor(1); return { closed: !G.openBag, steps: n }; };
        // A chest item's menu.
        const a1 = openA();
        const appleMenu = a1 && rightClick(bagEl("apple", "container")) && !!entryEl("Take");
        const out1 = await walkOut();
        row("a chest item's menu (Take) closes when the player walks out of the chest's reach", appleMenu && out1.closed && !menu.isMenuOpen(), `chest open ${a1}, menu ${appleMenu}; out of reach after ${out1.steps} steps ${out1.closed}; menu open ${menu.isMenuOpen()}`);
        shut();
        // A bag item's menu with Store in chest: closed out of reach, and its Store, picked anyway, stores nothing.
        const a2 = openA();
        const storeMenu = a2 && rightClick(bagEl("tinderbox")) && !!entryEl("Store in chest");
        const storeEl = entryEl("Store in chest");
        const out2 = await walkOut();
        const closed2 = !menu.isMenuOpen();
        if (storeEl) storeEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        step(1);
        const inA = () => A.bag.items.some((e) => e.id === "tinderbox");
        const inBag = () => bag().items.some((e) => e.id === "tinderbox");
        row("a bag item's menu with Store in chest closes when the chest is walked out of reach, and its Store, picked after, stores nothing (#208)", storeMenu && out2.closed && closed2 && !inA() && inBag(), `menu ${storeMenu}; out of reach ${out2.closed}, menu closed ${closed2}; in the chest ${inA()}, in the bag ${inBag()}`);
        // Picked in the moment before the step closes it: the player out of reach (a teleport, no step), the Store picked: nothing stored.
        const a3 = openA();
        const storeMenu3 = a3 && rightClick(bagEl("tinderbox")) && !!entryEl("Store in chest");
        G.teleport(home[0] + 8.1, home[1] - 8.1);
        const s3 = entryEl("Store in chest");
        if (s3) s3.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        const stored3 = inA();
        step(1);
        row("Store in chest picked out of reach before the step has closed the chest stores nothing", storeMenu3 && !stored3 && inBag(), `menu ${storeMenu3}; in the chest ${stored3}, in the bag ${inBag()}`);
        shut();
        // A second chest opened while the menu is up: the menu opened with the first goes.
        const a4 = openA();
        const storeMenu4 = a4 && rightClick(bagEl("tinderbox")) && !!entryEl("Store in chest");
        G.interact.performByLabel(me, { kind: "prop", id: B.prop.id }, "Open chest");
        step(1);
        const onB = !!G.openBag && G.openBag.bag === B.bag;
        row("opening a second chest closes a bag item's menu opened with the first (its Store never lands in either)", storeMenu4 && onB && !menu.isMenuOpen(), `menu ${storeMenu4}; second chest open ${onB}; menu open ${menu.isMenuOpen()}`);
        shut();
        back();
      }

      // ---- the world's menu still closes as the player walks ----
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
      step(3);
      const worldShut = !menu.isMenuOpen();
      key("KeyD", "keyup");
      step(2);
      row("the world's menu (a right tap on the ground) still closes when the player walks", worldOpen && worldShut, `opened ${worldOpen}, shut after walking ${worldShut}`);

      if (opts.keep) {
        for (const p of G.game.state.players.filter((q) => q !== me)) {
          const b = G.inventory.bagOf(p);
          keptBack.push({ id: p.id, hands: { main: p.hands.main, off: p.hands.off }, waist: p.worn.waist, bag: b ? b.items.slice() : null });
          p.hands.main = null;
          p.hands.off = G.items.makeEntry("torch", 1);
          p.worn.waist = G.items.makeEntry("good_belt", 1);
          G.inventory.beltOf(p)[0] = G.items.makeEntry("sword", 1);
          if (b) G.inventory.addItem(b, "tinderbox", 1);
        }
        row("every other player given an unlit torch in the off hand, a tinderbox in the bag, and a leather belt with a sword, for the guest's half", true, `${keptBack.length} players`);
      }
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    for (const k of [...held]) key(k, "keyup");
    if (use.isActive()) use.cancel();
    shut();
    if (!guest) {
      me.auto = null;
      for (const p of props) G.map.removeProp(p);
      me.hands.main = hands0.main;
      me.hands.off = hands0.off;
      me.worn.waist = waist0;
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
