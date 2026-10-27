// Michael's playtest, the second batch, 2026-10-26 (docs/bugs.md, Fixed). From the console, on a tab with `?nosave&mute`:
//   await __game.check("playtest2")
// The Worlds screen's Delete asks on the page and deletes (a world written to this page's store, never one of Michael's), Cancel and Escape
// keeping it, and window.confirm never called; the shovel dragged beside the spear refused in the spear's words on the page, never "No room to
// swap."; the cooking list keeping its scroll when a recipe low in it is picked; on a plot of its own, the bucket's Use on a crop the map grew
// (wet until first looked at) watering it, the plot under the pointer outlined in the Use mode, and the crop's menu offering "Water with the
// bucket" and "Water with the waterskin", the bucket first, each by its label (a guest's command) using its own vessel; Inspect as a card in
// the hover card's look above the patch, not at the top of the screen, closed by its button with the mark; a right click putting away a
// rug's ghost and a fence's as Escape does and opening no menu, and opening the menu with no ghost; the tainted skin's card leading with its
// warning in red, bold, on a red ground; the tainted-only line in the log at Thirsty; the throwing knife's card saying 18. Everything is
// put back in the finally.
//
// Two tabs (`?nosave&mute&relay=none`): on the host `await __game.check("playtest2", { keep: true })` runs the rows above and then gives every
// other player a full bucket and a full clean waterskin by a plot of three dry potatoes and returns `kept`; on the guest
// `await __game.check("playtest2", { guest: <kept> })` reads its replica crop's menu (the bucket's entry, then the skin's), sends Water with
// the waterskin by its label and waits for its skin to lose a watering, then the bucket's Use on another crop through the Use mode's sender
// and waits for the bucket empty and the crop wet, and finds the outline on the crop under its own Use; then `await __game.check("sync")` on
// the host, and `await __game.check("playtest2", { stop: true })` there takes the plot away and the players' things back.

const keptBack = { players: [], plot: null };

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const done = (kept = null) => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, kept };
  };
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const farming = await import("/src/farming.js");
  const bucketMod = await import("/src/bucket.js");
  const hl = await import("/src/highlight.js");
  const use = await import("/src/use.js");
  const mk = (id, n = 1, props = {}) => G.items.makeEntry(id, n, props);
  const me = G.player;
  const takePlot = (plot) => {
    if (!plot) return;
    for (const id of plot.crops) { const p = G.map.propById(id); if (p) G.map.removeProp(p); }
    for (const [x, y, f] of plot.floors) G.map.setFloor(x, y, f);
  };
  if (opts.stop) {
    const put = [];
    for (const k of keptBack.players.splice(0)) {
      const p = G.game.state.players.find((q) => q.id === k.id);
      if (!p) continue;
      const b = G.inventory.bagOf(p);
      if (b && k.bag) b.items.splice(0, b.items.length, ...k.bag);
      if (k.at) { p.gx = k.at[0]; p.gy = k.at[1]; p.auto = null; } // where { keep: true } found it
      put.push(p.id);
    }
    takePlot(keptBack.plot);
    keptBack.plot = null;
    row("the plot taken away and the other players' bags and places put back as { keep: true } found them", true, put.join(", ") || "nobody kept");
    return done();
  }

  // ---- a guest's side: the crop's menu from the replica, the skin by its label, the bucket by its Use, the outline ----
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
      return until();
    };
    const screenG = G.screens.currentScreen();
    if (screenG) G.screens.hide();
    try {
      const kept = opts.guest;
      const bag = () => G.inventory.bagOf(me);
      const find = (id) => bag() && bag().items.find((e) => e.id === id);
      await pump(() => !!find("bucket") && !!find("waterskin") && kept.crops.every((id) => !!G.map.propById(id)), 10000);
      const bucket = find("bucket");
      const skin = find("waterskin");
      const crops = kept.crops.map((id) => G.map.propById(id));
      row("on a guest my replica carries the full bucket and the clean skin the host gave, beside the host's three dry potatoes", !!bucket && !!skin && bucket.fill > 0 && skin.fill === 100 && crops.every(Boolean), `bucket ${bucket ? bucket.fill : "-"}, skin ${skin ? skin.fill : "-"}; crops ${crops.filter(Boolean).length}`);
      if (bucket && skin && crops.every(Boolean)) {
        const labels = G.interact.actionsForTarget({ kind: "prop", id: crops[0].id }, me).map((a) => a.label);
        const iB = labels.indexOf(bucketMod.POUR_LABEL);
        const iS = labels.indexOf("Water with the waterskin");
        row("on a guest the crop's menu, read from my replica, offers Water with the bucket and then Water with the waterskin", iB >= 0 && iS > iB, labels.join(", "));
        const fill0 = skin.fill;
        G.net.sendAct({ kind: "prop", id: crops[0].id }, "Water with the waterskin");
        const skinDone = await pump(() => { const s = find("waterskin"); return !!s && s.fill < fill0; }, 15000);
        const s1 = find("waterskin");
        const b1 = find("bucket");
        row("on a guest Water with the waterskin sent by its label waters on the host with my skin alone, the bucket untouched", skinDone && s1.fill === fill0 - farming.get().soil.fillCost && b1.fill === bucket.fill, `skin ${fill0} to ${s1 ? s1.fill : "-"}, bucket ${b1 ? b1.fill : "-"}`);
        // The bucket's Use on the second crop (within the pour's reach of where the host stood me), through the Use mode's own sender
        // (main.js armGuest): a use command by the bucket's uid.
        use.begin(b1, { kind: "bag", bag: bag() });
        const outlined = hl.forUse({ kind: "prop", prop: crops[1] }, me);
        row("on a guest the Use mode outlines the crop under the pointer on my replica", !!outlined && outlined.kind === "prop" && outlined.id === crops[1].id, JSON.stringify(outlined));
        use.apply({ kind: "prop", prop: crops[1] }, me);
        const poured = await pump(() => { const b = find("bucket"); const c = G.map.propById(crops[1].id); return !!b && b.fill === 0 && !!c && farming.isWet(c); }, 15000);
        row("on a guest the bucket's Use on a crop goes to the host and waters it: the bucket empty, the crop wet on my replica", poured, (() => { const b = find("bucket"); const c = G.map.propById(crops[1].id); return `bucket ${b ? b.fill : "-"}, wet ${c ? farming.isWet(c) : "-"}`; })());
      }
    } catch (e) {
      rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
    } finally {
      if (use.isActive()) use.cancel();
      if (screenG) G.screens.show(screenG);
      G.loop.setPaused(wasPaused);
    }
    return done();
  }

  // ---- the host's own (or a world of one's own) ----
  const screens = await import("/src/ui/screens.js");
  const actionsMod = await import("/src/ui/inventory-actions.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const stationPanel = await import("/src/ui/station-panel.js");
  const card = await import("/src/ui/inspect-card.js");
  const mark = await import("/src/inspect-mark.js");
  const menu = await import("/src/ui/context-menu.js");
  const log = await import("/src/ui/log.js");
  const hoverCard = await import("/src/ui/hover-card.js");
  const inp = await import("/src/input.js");
  const mouse0 = { ...inp.getMouse() };
  const h = actionsMod.createInventoryActions(() => me);
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  const at0 = [me.gx, me.gy];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const bag = G.inventory.bagOf(me);
  const bag0 = bag ? bag.items.slice() : null;
  const belt = G.inventory.beltOf(me);
  const belt0 = belt ? belt.slice() : null;
  const needs0 = { thirst: me.thirst, hunger: me.hunger, hp: me.hp, taintNoted: me.taintNoted };
  const rules0 = { survival: G.rules.rules.survival, zombieAggro: G.rules.rules.zombieAggro };
  const bagOpen0 = panel.isBagOpen();
  const confirm0 = window.confirm;
  const restore = [];
  let plot = null;
  let kept = null;
  const msg = () => ((document.getElementById("message") || {}).textContent || "").trim();
  const clearMessage = () => { const m = document.getElementById("message"); if (m) { m.textContent = ""; m.hidden = true; } };
  const canvas = document.getElementById("game");
  const look = () => { G.camera.snapTo(me.gx, me.gy); G.camera.applyOrigin(G.view.view.w, G.view.view.h); };
  try {
    G.loop.setPaused(true);
    if (screen0) G.screens.hide();
    G.rules.set({ zombieAggro: false, survival: true });

    // ---- 1. the Worlds screen's Delete: asked on the page, never window.confirm (the desktop pane answers it false at once) ----
    {
      let confirms = 0;
      window.confirm = () => { confirms++; return false; };
      const wid = `wpt2${Date.now().toString(36)}`;
      await G.save.writeWorld({ worldId: wid, name: "Playtest two, delete me", mapName: "valley", savedAt: Date.now(), map: {}, characters: { players: [] } });
      const listed = () => G.save.listWorlds().some((w) => w.worldId === wid);
      const btn = () => document.querySelector(`button[data-go="delete"][data-world="${wid}"]`);
      const askBtn = (a) => document.querySelector(`.screen-ask button[data-ask="${a}"]`);
      G.screens.show("worlds");
      const click = (el) => el && el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      click(btn());
      const q1 = screens.asked();
      const box = document.querySelector(".screen-ask .ask-box");
      const shown = !!box && box.getBoundingClientRect().width > 0;
      click(askBtn("no"));
      const afterCancel = listed() && !screens.asked();
      click(btn());
      screens.back(); // Escape
      const afterEscape = listed() && !screens.asked() && G.screens.currentScreen() === "worlds";
      click(btn());
      const focusNo = document.activeElement === askBtn("no"); // Enter is the safe no
      G.screens.hide(); // the screens hidden answer it no
      const afterHide = !screens.asked() && listed();
      G.screens.show("worlds");
      click(btn());
      click(askBtn("yes"));
      await wait(50);
      row("the question opens with Cancel focused, and hiding the screens answers it no", focusNo && afterHide, `Cancel focused ${focusNo}; after hide asked ${screens.asked()}, listed ${listed()}`);
      row("the Worlds screen's Delete asks on the page (\"Delete this world and every character in it?\"), never through window.confirm, which the desktop app's pane answers false at once", q1 === "Delete this world and every character in it?" && shown && confirms === 0, `asked "${q1}", box shown ${shown}, window.confirm called ${confirms}`);
      row("Cancel and Escape keep the world; the question's Delete deletes it and the list is drawn again without it", afterCancel && afterEscape && !listed() && !btn(), `after Cancel ${afterCancel}, after Escape ${afterEscape}, listed at the end ${listed()}`);
      if (listed()) await G.save.deleteWorld(wid);
      window.confirm = confirm0;
      G.screens.hide();
      G.loop.setPaused(true); // the screens' going lets the world run: held again
    }

    // ---- 2. the shovel beside the spear: the spear's words on the page, never "No room to swap." with room in the bag ----
    {
      me.hands.main = mk("spear");
      me.hands.off = null;
      bag.items.length = 0;
      G.grid.insert(bag, mk("shovel"));
      const shovel = bag.items.find((e) => e.id === "shovel");
      clearMessage();
      h.placeInSlot(shovel, { kind: "bag", bag }, "hand:off");
      const m = msg();
      row("the shovel dragged onto the off hand beside the spear, the bag nearly empty: refused, and the page says the spear's rule, not \"No room to swap.\"", !me.hands.off && bag.items.includes(shovel) && m === "The throwing spear can't be held beside the shovel: it is never dual wielded.", `off ${me.hands.off ? me.hands.off.id : "-"}; "${m}"`);
      clearMessage();
      const torch = mk("torch");
      me.hands.off = torch;
      h.placeInSlot(shovel, { kind: "bag", bag }, "hand:off");
      row("with a torch in the off hand the same drag moves nothing: the torch still held, never stowed in the bag", me.hands.off === torch && !bag.items.includes(torch) && bag.items.includes(shovel) && msg() === m, `off ${me.hands.off ? me.hands.off.id : "-"}; bag ${bag.items.map((e) => e.id).join(",")}; "${msg()}"`);
      me.hands.off = null;
      clearMessage();
      me.hands.main = null;
      bag.items.length = 0;
    }

    // ---- 3. the cooking list keeps its scroll when a recipe low in it is picked ----
    {
      // The nearest cooking station with a tile beside it from which its panel stays open (a fireplace in a wall is reached from its room's side).
      let station = null;
      for (const p of [...G.map.allProps()].filter((q) => G.stations.stationOf(q).includes("cooking")).sort((a, b) => Math.hypot(a.tile[0] - me.gx, a.tile[1] - me.gy) - Math.hypot(b.tile[0] - me.gx, b.tile[1] - me.gy)).slice(0, 8)) {
        const [sx, sy] = p.tile;
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          if (station || !G.map.isWalkableTile(sx + dx, sy + dy)) continue;
          G.teleport(sx + dx, sy + dy);
          stationPanel.openPanel(p, me);
          stationPanel.update(me);
          if (stationPanel.isOpen()) station = p;
        }
        if (station) break;
      }
      if (!station) row("a cooking station on the map with a tile beside it in reach", false, "none");
      else {
        const list = () => document.querySelector("#station .st-list");
        const n = list() ? list().querySelectorAll("[data-recipe]").length : 0;
        list().scrollTop = list().scrollHeight;
        const top0 = list().scrollTop;
        const rowsEl = [...list().querySelectorAll("[data-recipe]")];
        const low = rowsEl[rowsEl.length - 1];
        const lowId = low && low.dataset.recipe;
        low && low.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        stationPanel.update(me); // the step's redraw
        const sel = list() && list().querySelector(`[data-recipe="${lowId}"]`);
        const lr = list().getBoundingClientRect();
        const sr = sel ? sel.getBoundingClientRect() : null;
        const inView = !!sr && sr.top >= lr.top - 1 && sr.bottom <= lr.bottom + 1;
        row("in the cooking list, a recipe picked low in a long list stays in view after the redraw (the list keeps its scroll)", top0 > 0 && !!sel && sel.classList.contains("selected") && list().scrollTop === top0 && inView, `${n} recipes, scrolled ${top0} px, after the pick ${list().scrollTop} px; ${lowId} selected ${sel ? sel.classList.contains("selected") : "-"}, in view ${inView}`);
        stationPanel.close();
        G.teleport(at0[0], at0[1]);
      }
    }

    // ---- 4 and 5. a plot of its own: the bucket's Use on a crop the map grew, the outline, the vessels each their own Water ----
    {
      G.map.ensureAround(me.gx, me.gy, 3);
      let at = null;
      for (let r = 2; r <= 16 && !at; r++) for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r && !at; dx++) {
        const px = Math.round(me.gx) + dx, py = Math.round(me.gy) + dy;
        let ok = true;
        for (let ay = -1; ay <= 2 && ok; ay++) for (let ax = -1; ax <= 4 && ok; ax++) { const t = G.map.peekTile(px + ax, py + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w && G.map.isWalkableTile(px + ax, py + ay) && !(G.map.itemsAt(px + ax, py + ay) || []).length; }
        if (ok) at = [px, py];
      }
      if (!at) throw new Error("no bare grass for a plot");
      plot = { crops: [], floors: [] };
      const now = G.clock.getElapsed();
      for (let i = 0; i < 4; i++) {
        const x = at[0] + i, y = at[1];
        plot.floors.push([x, y, G.map.peekTile(x, y).floor]);
        G.map.setFloor(x, y, "floor_farm");
        const c = G.map.createProp({ sprite: "crop_potato_1", tile: [x, y], solid: false });
        c.facing = G.map.furrowsOf(G.map.peekTile(x, y).floor) || c.facing; // as the plant verb makes one (farming.js), so the record a guest gets is the host's key for key
        delete c.furrowsPending;
        c.crop =i === 0 ? { kind: "potato", stage: 1 } : { kind: "potato", grown: 0, at: now, wetUntil: now - 1 }; // the first as the map grows one: wet until first looked at
        G.map.placeProp(c, x, y);
        plot.crops.push(c.id);
      }
      const crop = (i) => G.map.propById(plot.crops[i]);
      G.teleport(at[0] + 0.4, at[1] + 1.1);
      look();
      bag.items.length = 0;
      const cap = G.items.getItem("bucket").vessel.capacity;
      G.grid.insert(bag, mk("bucket", 1, { fill: cap }));
      G.grid.insert(bag, mk("waterskin", 1, { fill: 100, clean: true }));
      const bucket = bag.items.find((e) => e.id === "bucket");
      const skin = bag.items.find((e) => e.id === "waterskin");
      // The outline in the Use mode: the crop under the pointer by its pixels, and a click on its plot's soil names the same crop.
      use.begin(bucket, { kind: "bag", bag });
      const byPixels = hl.forUse({ kind: "prop", prop: crop(0) }, me, null);
      const bySoil = hl.forUse({ kind: "tile", x: at[0], y: at[1], floor: "floor_farm" }, me, null);
      const none = hl.forUse({ kind: "tile", x: at[0] + 1, y: at[1] + 1, floor: "floor_grass" }, me, null);
      row("in the Use mode the plot under the pointer is outlined: the crop by its pixels and by its soil, bare grass not", !!byPixels && byPixels.id === crop(0).id && !!bySoil && bySoil.id === crop(0).id && !none && hl.current() === null, `${JSON.stringify(byPixels)}, ${JSON.stringify(bySoil)}, ${JSON.stringify(none)}`);
      use.cancel();
      const lines0 = log.count();
      G.use.applyWith(bucket, { kind: "prop", prop: crop(0) }, me);
      const said = log.since(lines0).join(" / ");
      row("the bucket's Use on a crop the map grew (wet until first looked at) waters it, as the menu's Water does: the bucket empty, the line said, not \"Nothing there needs water.\"", bucket.fill === 0 && farming.isWet(crop(0)) && crop(0).crop.at !== undefined && /You water \d+ plants?\./.test(said) && !/Nothing there needs water/.test(said), `fill ${bucket.fill}; "${said}"`);
      bucket.fill = cap;
      for (let i = 1; i < 4; i++) crop(i).crop.wetUntil = G.clock.getElapsed() - 1;
      const labels = G.interact.actionsForTarget({ kind: "prop", id: crop(2).id }, me).map((a) => a.label);
      const iB = labels.indexOf(bucketMod.POUR_LABEL);
      const iS = labels.indexOf("Water with the waterskin");
      row("with a full bucket and a full skin the crop's menu offers each its own Water, the bucket first (it waters 3 by 3); E never waters", iB >= 0 && iS > iB && !labels.includes("Water") && !G.interact.actionsForTarget({ kind: "prop", id: crop(2).id }, me).some((a) => /^Water/.test(a.label) && a.simple), labels.join(", "));
      const s0 = skin.fill;
      G.teleport(crop(3).tile[0] + 0.2, crop(3).tile[1] + 0.75); // within the action's own reach, so the bar starts at once
      G.interact.performByLabel(me, { kind: "prop", id: crop(3).id }, "Water with the waterskin");
      for (let i = 0; i < 200 && me.action; i++) G.interact.updateAction(me, 0.1);
      row("Water with the waterskin, by its label as a guest sends it, takes the skin's water and leaves the bucket full", skin.fill === s0 - farming.get().soil.fillCost && bucket.fill === cap && farming.isWet(crop(3)), `skin ${s0} to ${skin.fill}, bucket ${bucket.fill}`);
      G.teleport(crop(2).tile[0] + 0.2, crop(2).tile[1] + 0.75);
      G.interact.performByLabel(me, { kind: "prop", id: crop(2).id }, bucketMod.POUR_LABEL);
      for (let i = 0; i < 200 && me.action; i++) G.interact.updateAction(me, 0.1);
      row("Water with the bucket, by its label, empties the bucket and leaves the skin as it was", bucket.fill === 0 && skin.fill === s0 - farming.get().soil.fillCost && farming.isWet(crop(1)) && farming.isWet(crop(2)), `bucket ${bucket.fill}, skin ${skin.fill}`);

      // ---- 6. Inspect as a card above the patch, closed by its button with the mark ----
      const ins = G.interact.actionsForTarget({ kind: "prop", id: crop(2).id }, me).find((a) => a.label === "Inspect");
      clearMessage();
      if (ins) G.interact.runAction(me, ins);
      look();
      card.update(me);
      const cur = card.current();
      const el = document.getElementById("inspect-card");
      const s = G.iso.toScreen(crop(2).tile[0], crop(2).tile[1]);
      const u = G.view.toUi(s.x, s.y);
      const ui = document.getElementById("ui").getBoundingClientRect();
      const k = G.view.view.uiScale || 1;
      const tileTop = ui.top + u.y * k;
      const cs = el ? getComputedStyle(el) : null;
      const hcs = getComputedStyle(document.getElementById("hover-card"));
      row("Inspect shows a card, not the line at the top: the crop's name and a line for each fact, a close button, in the hover card's look", !!cur && cur.shown && !msg() && !!el.querySelector(".hc-name") && el.querySelector(".hc-name").textContent === "Potatoes" && el.querySelectorAll(".hc-line").length >= 3 && !!el.querySelector(".ic-close") && cs.backgroundColor === hcs.backgroundColor && cs.borderRadius === hcs.borderRadius, cur ? `${cur.text}; message "${msg()}"; ${cs.backgroundColor} / ${hcs.backgroundColor}` : "no card");
      row("the card stands above the inspected patch, not at the very top of the screen, and the patch is marked while it shows", !!cur && cur.rect.bottom <= tileTop + 2 && cur.rect.bottom >= tileTop - 120 && cur.rect.top > 40 && !!mark.marked(), cur ? `card ${Math.round(cur.rect.top)} to ${Math.round(cur.rect.bottom)}, the tile at ${Math.round(tileTop)}; marked ${!!mark.marked()}` : "no card");
      // The pause menu from the nav row's Menu button covers it (the review of #507: it drew over the screens at 55); so does a right-click menu.
      document.querySelector('[data-nav="menu"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const pauseUp = G.screens.currentScreen() === "pause";
      const cr = el.getBoundingClientRect();
      const atCard = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
      const covered = !!atCard && !atCard.closest("#inspect-card");
      G.screens.hide();
      G.loop.setPaused(true); // the pause menu's going let the world run: held again for the rows after
      const zCard = Number(getComputedStyle(el).zIndex);
      const zMenu = Number(getComputedStyle(document.getElementById("menu") || document.body).zIndex) || 9;
      row("the pause menu opened from the nav row covers the Inspect card, and the card sits under the context menu and the screens", pauseUp && covered && zCard < zMenu && zCard < Number(getComputedStyle(document.getElementById("screens")).zIndex), `pause ${pauseUp}, at the card's middle ${atCard ? atCard.id || atCard.className : "-"}; z card ${zCard}, menu ${zMenu}`);
      card.update(me);
      el.querySelector(".ic-close").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      row("its close button closes it and the patch's mark goes with it", !card.current() && el.hidden && !mark.marked(), `open ${card.isOpen()}, hidden ${el.hidden}, marked ${!!mark.marked()}`);
      look();
    }

    // ---- 7. a right click puts away a placement ghost as Escape does, and opens no menu that click ----
    {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 + 40, cy = rect.top + rect.height / 2 + 30;
      canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true }));
      const rightTap = () => {
        canvas.dispatchEvent(new MouseEvent("mousedown", { button: 2, clientX: cx, clientY: cy, bubbles: true }));
        G.loop.advance(1 / 60);
        window.dispatchEvent(new MouseEvent("mouseup", { button: 2, clientX: cx, clientY: cy, bubbles: true }));
        G.loop.advance(1 / 60);
        G.loop.advance(1 / 60);
      };
      const rugDef = G.items.allItems().find((d) => d.rug);
      G.grid.insert(bag, mk(rugDef.id));
      const rug = bag.items.find((e) => e.id === rugDef.id);
      G.placement.beginRug(rug);
      const rugOn = G.placement.state.active && G.placement.state.kind === "rug";
      rightTap();
      const rugOff = !G.placement.state.active && !menu.isMenuOpen();
      const fence = G.placement.buildKinds().find((b) => /fence/.test(b.id)) || G.placement.buildKinds()[0];
      G.placement.beginBuild(fence.id);
      const buildOn = G.placement.state.active && G.placement.state.kind === "build";
      rightTap();
      const buildOff = !G.placement.state.active && !menu.isMenuOpen();
      row("a right click puts away a rug's ghost and a fence's (as Escape does) and opens no menu that click", rugOn && rugOff && buildOn && buildOff, `rug ${rugOn} then ${rugOff}; ${fence.id} ${buildOn} then ${buildOff}`);
      rightTap();
      const menuNow = menu.isMenuOpen();
      menu.closeContextMenu();
      row("with no ghost up, the same right click opens the menu", menuNow, `menu open ${menuNow}`);
      bag.items.length = 0;
    }

    // ---- 8. tainted water: the card's red lead, and the line at Thirsty ----
    {
      G.grid.insert(bag, mk("waterskin", 1, { fill: 80 }));
      const tainted = bag.items.find((e) => e.id === "waterskin");
      panel.setBagOpen(true);
      panel.renderInventoryPanel(me, bag, null, G.inventory.beltOf(me));
      const i = bag.items.indexOf(tainted);
      const blk = document.querySelector(`.inv-item[data-bag="inv"][data-index="${i}"]`);
      if (blk) { const r = blk.getBoundingClientRect(); blk.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true })); }
      await wait((G.tuning.hoverCard.delayMs || 0) + 80);
      const hc = document.getElementById("hover-card");
      const first = hc.querySelector(".hc-line");
      const lead = first && first.querySelector(".hc-warn");
      const ls = lead ? getComputedStyle(lead) : null;
      const fs = first ? getComputedStyle(first) : null;
      const red = getComputedStyle(document.documentElement).getPropertyValue("--red").trim();
      row("the tainted skin's card leads with its warning: \"Tainted water:\" bold in the warning red, the rest red, on a red-ruled ground", !!lead && lead.textContent === "Tainted water:" && Number(ls.fontWeight) >= 700 && ls.color === "rgb(208, 80, 80)" && /drinking it may make you Sick\./.test(first.textContent) && fs.borderLeftStyle === "solid" && fs.backgroundColor !== "rgba(0, 0, 0, 0)", first ? `"${first.textContent}"; ${ls ? `${ls.color} ${ls.fontWeight}` : "-"}; ground ${fs.backgroundColor}, rule ${fs.borderLeftStyle}; --red ${red}` : "no line");
      panel.setBagOpen(bagOpen0);
      const lines0 = log.count();
      me.taintNoted = 0;
      me.thirst = 30;
      for (let n = 0; n < 4; n++) G.loop.advance(1 / 60);
      const got = log.since(lines0);
      row("Thirsty with only tainted water carried: \"Your waterskins hold only tainted water: boil it at a lit fire.\" in the log, once", got.filter((l) => l.includes("Your waterskins hold only tainted water: boil it at a lit fire.")).length === 1 && tainted.fill === 80, got.join(" / ") || "nothing");
      me.thirst = needs0.thirst;
      me.taintNoted = needs0.taintNoted;
      bag.items.length = 0;
    }

    // ---- 9. the throwing knife's 18, read on its card over the bag ----
    {
      G.grid.insert(bag, mk("throwing_knife", 5));
      const kn = bag.items.find((e) => e.id === "throwing_knife");
      panel.setBagOpen(true);
      panel.renderInventoryPanel(me, bag, null, G.inventory.beltOf(me));
      const i = bag.items.indexOf(kn);
      const blk = document.querySelector(`.inv-item[data-bag="inv"][data-index="${i}"]`);
      if (blk) { const r = blk.getBoundingClientRect(); blk.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true })); }
      await wait((G.tuning.hoverCard.delayMs || 0) + 80);
      const t = document.getElementById("hover-card").textContent;
      row("the throwing knife does 18 at a full draw (Michael, 2026-10-26), and its card says so", G.items.getItem("throwing_knife").thrown.damage === 18 && /18 damage/.test(t), t.slice(0, 220));
      panel.setBagOpen(bagOpen0);
      bag.items.length = 0;
    }

    // ---- 10. Fill waterskins at tainted water skips a skin holding clean water (Michael, 2026-10-26) ----
    {
      let bank = null;
      const [cx, cy] = [Math.round(me.gx), Math.round(me.gy)];
      for (let r = 0; r < 120 && !bank; r += 3) {
        for (let y = cy - r; y <= cy + r && !bank; y += 3) for (let x = cx - r; x <= cx + r && !bank; x += 3) {
          G.map.ensureAround(x, y, 0);
          if (!G.map.drinkableAt(x, y)) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!bank && G.map.isWalkableTile(x + dx, y + dy) && !G.map.drinkableAt(x + dx, y + dy)) bank = { water: [x, y], stand: [x + dx, y + dy] };
        }
      }
      if (!bank) row("water with a bank near the player", false, "none within 120 tiles");
      else {
        G.teleport(bank.stand[0], bank.stand[1]);
        bag.items.length = 0;
        G.grid.insert(bag, mk("waterskin", 1, { fill: 40, clean: true }));
        const cleanSkin = bag.items.find((e) => e.id === "waterskin");
        const tile = { kind: "tile", tile: bank.water };
        const labels = () => G.interact.actionsForTarget(tile, me).map((a) => a.label);
        const l1 = labels().find((l) => l.startsWith("Fill waterskins"));
        clearMessage();
        G.interact.performByLabel(me, tile, l1);
        for (let i = 0; i < 240 && me.action; i++) G.loop.advance(1 / 60);
        const m1 = msg();
        row("with only a clean skin to fill, Fill waterskins at tainted water is offered as \"(they hold clean water)\", fills nothing, and the page says why", l1 === "Fill waterskins (they hold clean water)" && cleanSkin.fill === 40 && cleanSkin.clean === true && m1 === "Your waterskins hold clean water: they won't be filled from tainted water.", `"${l1}"; skin ${cleanSkin.fill} clean ${!!cleanSkin.clean}; "${m1}"`);
        G.grid.insert(bag, mk("waterskin", 1, { fill: 30 }));
        G.grid.insert(bag, mk("waterskin", 1, { fill: 0, clean: true }));
        const [, tSkin, eSkin] = bag.items.filter((e) => e.id === "waterskin");
        const l2 = labels().find((l) => l.startsWith("Fill waterskins"));
        G.interact.performByLabel(me, tile, l2);
        for (let i = 0; i < 240 && me.action; i++) G.loop.advance(1 / 60);
        row("with a tainted skin and an empty one beside it, Fill waterskins fills those two and leaves the clean skin as it was", l2 === "Fill waterskins" && tSkin.fill === 100 && eSkin.fill === 100 && !eSkin.clean && cleanSkin.fill === 40 && cleanSkin.clean === true, `"${l2}"; tainted ${tSkin.fill}, empty ${eSkin.fill} clean ${!!eSkin.clean}, clean ${cleanSkin.fill} ${!!cleanSkin.clean}`);
        clearMessage();
        bag.items.length = 0;
        G.teleport(at0[0], at0[1]);
      }
    }

    // ---- two tabs: a bucket and a skin for every other player, by three dry potatoes ----
    if (opts.keep) {
      const others = G.game.state.players.filter((p) => p !== me);
      for (const p of others) {
        const b = G.inventory.bagOf(p);
        keptBack.players.push({ id: p.id, bag: b ? b.items.slice() : null, at: [p.gx, p.gy] });
        if (!b) continue;
        b.items.length = 0;
        G.grid.insert(b, mk("bucket", 1, { fill: G.items.getItem("bucket").vessel.capacity }));
        G.grid.insert(b, mk("waterskin", 1, { fill: 100, clean: true }));
        p.gx = G.map.propById(plot.crops[1]).tile[0] + 0.4;
        p.gy = G.map.propById(plot.crops[1]).tile[1] + 1.1;
        p.auto = null;
      }
      for (let i = 0; i < 4; i++) { const c = G.map.propById(plot.crops[i]); c.crop = { kind: "potato", grown: 0, at: G.clock.getElapsed(), wetUntil: G.clock.getElapsed() - 1 }; G.map.touch(c.tile[0], c.tile[1]); }
      keptBack.plot = plot;
      kept = others.length ? { players: others.map((p) => p.id), crops: plot.crops.slice(1) } : null;
      plot = null; // kept: { stop: true } takes it away
      row("kept for the guest: every other player beside three dry potatoes with a full bucket and a full clean skin; { stop: true } puts them back", !!kept, kept ? JSON.stringify(kept) : "no other player");
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    window.confirm = confirm0;
    canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: 2, clientY: 2, bubbles: true })); // off the panels: the card the bag rows raised goes
    hoverCard.hide();
    Object.assign(inp.getMouse(), mouse0); // the pointer as the page had it
    if (use.isActive()) use.cancel();
    card.close();
    mark.clear();
    G.placement.cancel();
    if (menu.isMenuOpen()) menu.closeContextMenu();
    if (stationPanel.isOpen()) stationPanel.close();
    panel.setBagOpen(bagOpen0);
    takePlot(plot);
    for (const r of restore.reverse()) r();
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    if (bag0 && bag) bag.items.splice(0, bag.items.length, ...bag0);
    if (belt0 && belt) belt.splice(0, belt.length, ...belt0);
    me.thirst = needs0.thirst;
    me.hunger = needs0.hunger;
    me.hp = needs0.hp;
    if (needs0.taintNoted === undefined) delete me.taintNoted; else me.taintNoted = needs0.taintNoted;
    G.rules.set(rules0);
    G.teleport(at0[0], at0[1]);
    clearMessage();
    if (screen0) G.screens.show(screen0);
    else if (G.screens.currentScreen()) G.screens.hide();
    G.loop.setPaused(wasPaused);
  }
  return done(kept);
}
