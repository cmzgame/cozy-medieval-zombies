// Boiling water (docs/44 section 2, #418): one verb, `boil`, at a lit cooking fire, three ways in. From the console, on a tab with `?nosave` (the valley):
//   await __game.check("boil")                 the host's half
//   await __game.check("boil", { keep: true }) the same, then a lit campfire left and every other player stood by it with three tainted skins, the dead left calm
// On a guest (two tabs, `?nosave&relay=none`, joined by `__game.net.open({ join })`), after the host ran it with `keep` and with the host's tab left
// running (unpaused: it answers in real time on the wire's background driver):
//   await __game.check("boil")                 my tainted skin on the replica has the brown drop and its card; its menu offers Boil water; the skin's
//                                              menu (an item command), Use on the fire (a use command), and the fire's menu (an act command) each come
//                                              back clean on my replica, the fill kept (each a real 30 s bar on the host: about a minute and a half)
// Then `check("sync")` on the host. (`check("water")` is the water tiles' and the fences'.)
// The host's half: a tainted skin in the bag carries the brown drop and says so on its card; its menu's Boil water starts a bar of `boilSeconds` and
// at its end the skin is clean, its fill kept, the drop gone, the card "Clean water."; the fire's menu boils the fullest tainted skin, then is greyed
// with why; Use on the fire is the same bar; a guest's three commands, run here by label, uid, and the fire's id, do the same; out of reach the
// skin's menu is greyed with why and the verb refuses; a fire put out mid-bar boils nothing; a fireplace lit is a cooking fire that offers it;
// filling a clean skin at the river or a pond taints it all, and every well and trough and the font say "(tainted)". The player, its bag, the rule,
// and the loop are put back.

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const panel = await import("/src/ui/inventory-panel.js");
  const info = await import("/src/item-info.js");
  const acts = await import("/src/ui/inventory-actions.js");
  const W = G.tuning.water;
  const me = G.player;
  const role = G.net.status().role;
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  const bag = G.inventory.bagOf(me);
  const bag0 = bag ? bag.items.slice() : [];
  const pos0 = [me.gx, me.gy];
  const aggro0 = G.rules.rules.zombieAggro;
  const was = { bag: panel.isBagOpen() };
  const restore = [];
  let keep = false;
  const cardText = (e) => info.textOf(info.cardFor(e)).join(" | ");
  const blockOf = (e) => { const i = bag.items.indexOf(e); return i < 0 ? null : document.querySelector(`.inv-item[data-bag="inv"][data-index="${i}"]`); };
  const redraw = () => panel.renderInventoryPanel(me, bag, null, G.inventory.beltOf(me));
  const finish = () => { for (let i = 0; i < 60 * (W.boilSeconds + 5) && me.action; i++) G.loop.advance(1 / 60); };
  try {
    G.loop.setPaused(true);
    if (screen0) G.screens.hide();
    if (role === "guest") {
      // A guest waits on the host in real time: a step of its own each sixtieth of a second of the wall clock, up to `ms`.
      const stepUntil = async (cond, ms) => {
        const t0 = performance.now();
        let last = t0;
        while (!cond() && performance.now() - t0 < ms) {
          await yieldOnce();
          if (performance.now() - last >= 1000 / 60) { last = performance.now(); G.loop.advance(1 / 60); }
        }
        return cond();
      };
      const mineBag = () => G.inventory.bagOf(me);
      const taintedNow = () => (mineBag() ? mineBag().items.filter((e) => e.id === "waterskin" && (e.fill ?? 0) > 0 && !e.clean) : []);
      const fire = [...G.map.allProps()].find((p) => p.fire && p.fire.cooks && p.fire.lit && Math.hypot(p.tile[0] - me.gx, p.tile[1] - me.gy) < W.boilReach);
      const skins = taintedNow();
      row("on a guest my replica carries the tainted skins the host gave and a lit campfire in reach (the host's keep run)", skins.length >= 3 && !!fire, `${skins.length} tainted, fire ${fire ? fire.id : "none"}`);
      if (skins.length && fire) {
        panel.setBagOpen(true);
        panel.renderInventoryPanel(me, mineBag(), null, G.inventory.beltOf(me));
        const i = mineBag().items.indexOf(skins[0]);
        const el = document.querySelector(`.inv-item[data-bag="inv"][data-index="${i}"]`);
        row("on a guest the tainted skin's icon has the brown drop and its card says tainted", !!el && !!el.querySelector(".inv-taint") && /Tainted water: drinking it may make you Sick\./.test(cardText(skins[0])), `${el ? !!el.querySelector(".inv-taint") : "no block"}; ${cardText(skins[0])}`);
        const menu = G.interact.itemMenu(me, skins[0], mineBag(), null).map((m) => `${m.label}${m.enabled === false ? " [off]" : ""}`);
        row("on a guest its menu offers Boil water, enabled", menu.includes("Boil water"), menu.join(", "));
        const ms = (W.boilSeconds + 15) * 1000;
        const [a, b, c] = skins;
        const fills = [a.fill, b.fill, c.fill];
        const cleanOnReplica = (uid) => () => { const e = mineBag() && mineBag().items.find((q) => q.uid === uid); return !!e && e.clean === true; };
        G.net.sendItem({ op: "menu", label: "Boil water", uid: a.uid, src: { kind: "bag", bag: { mine: true } } });
        const okA = await stepUntil(cleanOnReplica(a.uid), ms);
        const ea = mineBag().items.find((q) => q.uid === a.uid);
        row("on a guest the skin's menu goes to the host and comes back clean, the fill kept", okA && !!ea && ea.fill === fills[0], ea ? JSON.stringify({ fill: ea.fill, clean: ea.clean }) : "gone");
        G.net.sendUse({ uid: b.uid, src: { kind: "bag", bag: { mine: true } }, target: { kind: "prop", id: fire.id } });
        const okB = await stepUntil(cleanOnReplica(b.uid), ms);
        row("on a guest Use on the fire goes to the host and comes back clean", okB, String(okB));
        G.net.sendAct({ kind: "prop", id: fire.id }, "Boil water");
        const okC = await stepUntil(cleanOnReplica(c.uid), ms);
        row("on a guest the fire's menu boils my fullest tainted skin on the host and it comes back clean", okC, String(okC));
        panel.renderInventoryPanel(me, mineBag(), null, G.inventory.beltOf(me));
        const j = mineBag().items.findIndex((q) => q.uid === a.uid);
        const el2 = document.querySelector(`.inv-item[data-bag="inv"][data-index="${j}"]`);
        row("on a guest the boiled skin has no drop and its card says Clean water", !!el2 && !el2.querySelector(".inv-taint") && /Clean water\./.test(cardText(mineBag().items[j])), cardText(mineBag().items[j]));
        panel.setBagOpen(was.bag);
      }
      throw Object.assign(new Error("guest done"), { guestDone: true });
    }

    G.rules.set({ zombieAggro: false }); // thirty seconds a bar at a fire in the open: the dead must not interrupt
    // Open ground, outdoors, near the player.
    let c = null;
    const [px, py] = [Math.round(me.gx), Math.round(me.gy)];
    for (let r = 0; r < 40 && !c; r += 2) {
      for (let y = py - r; y <= py + r && !c; y += 2) for (let x = px - r; x <= px + r && !c; x += 2) {
        G.map.ensureAround(x, y, 1);
        let clear = true;
        for (let dy = -2; dy <= 2 && clear; dy++) for (let dx = -2; dx <= 3 && clear; dx++) { const t = G.map.tileAt(x + dx, y + dy); clear = G.map.isWalkableTile(x + dx, y + dy) && t.room === 0 && !t.prop && !G.map.drinkableAt(x + dx, y + dy); }
        if (clear) c = [x, y];
      }
    }
    if (!c) { row("open ground was found", false, "none near the player"); throw new Error("no ground"); }
    const [cx, cy] = c;
    G.teleport(cx, cy);
    const fire = G.map.createProp({ sprite: "campfire", tile: [cx + 1, cy], fuel: 4, lit: true });
    G.map.placeProp(fire, cx + 1, cy);
    restore.push(() => G.map.removeProp(fire));
    row("a campfire with fuel, lit, is a lit cooking fire", !!fire.fire && fire.fire.cooks && fire.fire.lit, JSON.stringify({ cooks: fire.fire && fire.fire.cooks, lit: fire.fire && fire.fire.lit }));
    for (const e of [...bag.items]) if (e.id === "waterskin") G.inventory.detach(me, e); // the kit's skin out of the way; put back in the finally
    const mk = (fill, props = {}) => { const e = G.items.makeEntry("waterskin", 1, { fill, ...props }); G.inventory.stow(me, e); return e; };
    const skinA = mk(40);
    const skinB = mk(90);
    panel.setBagOpen(true);
    redraw();
    row("a tainted skin's icon has a small brown drop", !!blockOf(skinA) && !!blockOf(skinA).querySelector(".inv-taint"), blockOf(skinA) ? blockOf(skinA).innerHTML.slice(0, 160) : "no block");
    const el = blockOf(skinA);
    if (el) {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
      await wait((G.tuning.hoverCard.delayMs || 0) + 80);
    }
    const hc = document.getElementById("hover-card");
    row("its card, read over the bag, says Tainted water and keeps the name Waterskin", !!hc && !hc.hidden && /Tainted water: drinking it may make you Sick\./.test(hc.textContent) && /Waterskin/.test(hc.textContent), hc ? hc.textContent.slice(0, 200) : "no card");
    const menuOf = (e) => G.interact.itemMenu(me, e, bag, null);
    row("its Drink says (tainted)", menuOf(skinA).some((m) => m.label === "Drink (tainted, 40%)"), menuOf(skinA).map((m) => m.label).join(", "));

    // The skin's menu.
    const boil = menuOf(skinA).find((m) => m.label.startsWith("Boil water"));
    row("the skin's menu offers Boil water, enabled, with a lit fire in reach", !!boil && boil.enabled && boil.label === "Boil water", boil ? boil.label : "none");
    if (boil) boil.onSelect();
    row("it starts a timed bar of boilSeconds", !!me.action && me.action.action.duration === W.boilSeconds && me.action.action.label === "Boil water", me.action ? `${me.action.action.label} ${me.action.action.duration}s` : "no bar");
    finish();
    redraw();
    row("at its end the skin is clean and its fill kept", skinA.clean === true && skinA.fill === 40, JSON.stringify({ fill: skinA.fill, clean: skinA.clean }));
    row("the drop is gone and the card says Clean water", !!blockOf(skinA) && !blockOf(skinA).querySelector(".inv-taint") && /Clean water\./.test(cardText(skinA)), cardText(skinA));
    row("a clean skin offers no Boil water, and its Drink drops (tainted)", !menuOf(skinA).some((m) => m.label.startsWith("Boil water")) && menuOf(skinA).some((m) => m.label === "Drink (40%)"), menuOf(skinA).map((m) => m.label).join(", "));

    // The fire's menu: the fullest tainted skin first; with none, greyed with why.
    const onFire = { kind: "prop", id: fire.id };
    const fireMenu = () => G.interact.actionsForTarget(onFire, me).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}`);
    const skinC = mk(60);
    row("the fire's menu offers Boil water", fireMenu().includes("Boil water"), fireMenu().join(", "));
    G.interact.performByLabel(me, onFire, "Boil water");
    finish();
    row("the fire's menu boils the fullest tainted skin (90 before 60)", skinB.clean === true && skinB.fill === 90 && !skinC.clean, JSON.stringify([skinB.clean, skinC.clean]));
    G.interact.performByLabel(me, onFire, "Boil water");
    finish();
    row("and then the next", skinC.clean === true, String(skinC.clean));
    row("with no tainted skin carried it is greyed with why", fireMenu().includes("Boil water (no tainted water carried) [off]"), fireMenu().join(", "));

    // Use: the skin on the fire, the same bar.
    const skinD = mk(70);
    G.use.begin(skinD, { kind: "bag", bag });
    G.use.hover({ kind: "prop", prop: fire });
    const useLabel = (document.getElementById("use-label") || {}).textContent || "";
    G.use.apply({ kind: "prop", prop: fire }, me);
    row("Use on the fire starts the same bar", !!me.action && me.action.action.duration === W.boilSeconds, `${useLabel}; ${me.action ? me.action.action.label : "no bar"}`);
    finish();
    row("and the skin comes out clean", skinD.clean === true && skinD.fill === 70, JSON.stringify({ fill: skinD.fill, clean: skinD.clean }));
    row("the skin's card names Use on fire: boil", /Use on fire: boil\./.test(cardText(skinD)), cardText(skinD));

    // A guest's three ways in, run here as the host runs them: the item command by uid, the use command by the fire's id, the fire's label.
    const skinE = mk(50);
    acts.performItemCommand(me, { op: "menu", label: "Boil water", uid: skinE.uid, src: { kind: "bag", bag: { mine: true } } });
    finish();
    const skinF = mk(30);
    acts.performUseCommand(me, { uid: skinF.uid, src: { kind: "bag", bag: { mine: true } }, target: { kind: "prop", id: fire.id } }, null);
    finish();
    row("a guest's menu command and Use command, run on the host, boil by uid and the fire's id", skinE.clean === true && skinF.clean === true, JSON.stringify([skinE.clean, skinF.clean]));

    // Out of reach: greyed with why; the verb refuses; a fire put out mid-bar boils nothing.
    const skinG = mk(65);
    G.teleport(cx - 6, cy);
    const far = menuOf(skinG).find((m) => m.label.startsWith("Boil water"));
    row("out of reach the skin's menu is greyed with why", !!far && !far.enabled && far.label === "Boil water (no lit fire in reach)", far ? far.label : "none");
    const r1 = G.verbs.run("boil", G.world, me, { prop: fire.id, entry: skinG.uid }, { timed: true });
    row("and the verb refuses, saying why", !r1.ok && r1.reason === "Too far away.", String(r1.reason));
    G.teleport(cx, cy);
    menuOf(skinG).find((m) => m.label === "Boil water").onSelect();
    G.map.setFireLit(fire, false);
    finish();
    row("a fire put out mid-bar boils nothing, and an unlit fire offers no Boil water", !skinG.clean && !fireMenu().some((l) => l.startsWith("Boil water")), `${skinG.clean}; ${fireMenu().join(", ")}`);
    // A fireplace lit is a cooking fire: it offers Boil water too (a switch since docs/43 section 3).
    const fp = [...G.map.allProps()].find((p) => p.sprite === "fireplace" || p.sprite === "hearth");
    if (fp) {
      const lit0 = fp.fire.lit;
      G.map.setFireLit(fp, true);
      const labels = G.interact.actionsForTarget({ kind: "prop", id: fp.id }, me).map((a) => a.label);
      row(`a ${fp.sprite} lit is a cooking fire that offers Boil water`, labels.some((l) => l.startsWith("Boil water")), labels.join(", "));
      G.map.setFireLit(fp, lit0);
    } else row("a fireplace or a hearth in the loaded map", false, "none");

    // Mixing taints, and no fixed source is clean.
    const sources = [...G.map.allProps()].filter((p) => p.water);
    const said = sources.map((p) => G.interact.actionsForTarget({ kind: "prop", id: p.id }, me).find((a) => a.label.startsWith("Drink from"))).filter(Boolean).map((a) => a.label);
    row("every well, trough, and font in the loaded map says (tainted)", said.length > 0 && said.every((l) => l.endsWith("(tainted)")), `${said.length}: ${[...new Set(said)].join(", ")}`);
    let bank = null;
    for (let r = 0; r < 120 && !bank; r += 3) {
      for (let y = cy - r; y <= cy + r && !bank; y += 3) for (let x = cx - r; x <= cx + r && !bank; x += 3) {
        G.map.ensureAround(x, y, 0);
        if (!G.map.drinkableAt(x, y)) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!bank && G.map.isWalkableTile(x + dx, y + dy) && !G.map.drinkableAt(x + dx, y + dy)) bank = { water: [x, y], stand: [x + dx, y + dy] };
      }
    }
    if (bank) {
      G.teleport(bank.stand[0], bank.stand[1]);
      for (const e of [...bag.items]) if (e.id === "waterskin" && e !== skinA) G.inventory.detach(me, e);
      skinA.fill = 50; // clean, half full
      const tile = { kind: "tile", tile: bank.water };
      const labels = G.interact.actionsForTarget(tile, me).map((a) => a.label);
      G.interact.performByLabel(me, tile, "Fill waterskins");
      for (let i = 0; i < 240 && me.action; i++) G.loop.advance(1 / 60);
      row("a clean skin topped up at the water is tainted all through", skinA.fill === 100 && !skinA.clean && labels.includes("Drink from the water (tainted)"), `${JSON.stringify({ fill: skinA.fill, clean: !!skinA.clean })}; ${labels.join(", ")}`);
    } else row("water with a bank near the player", false, "none within 120 tiles");

    if (opts.keep) {
      keep = true;
      G.teleport(cx, cy);
      const camp = G.map.createProp({ sprite: "campfire", tile: [cx + 1, cy + 2], fuel: 6, lit: true }); // kept for the guest's half
      G.map.placeProp(camp, cx + 1, cy + 2);
      for (const p of G.game.state.players) {
        if (p === me) continue;
        p.gx = cx;
        p.gy = cy + 2;
        p.auto = null;
        for (const fill of [80, 60, 40]) G.inventory.stow(p, G.items.makeEntry("waterskin", 1, { fill }));
      }
    }
  } catch (e) {
    if (!e.guestDone && e.message !== "no ground") rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    (await import("/src/ui/hover-card.js")).hide();
    if (G.use.isActive()) G.use.cancel();
    if (role !== "guest") {
      me.action = null;
      for (const f of restore.reverse()) f();
      if (bag) { bag.items.length = 0; for (const e of bag0) bag.items.push(e); }
      G.teleport(pos0[0], pos0[1]);
      panel.setBagOpen(was.bag);
      if (!keep) G.rules.set({ zombieAggro: aggro0 }); // a keep run leaves the dead calm for the guest's ninety seconds at the fire: G.rules.set({ zombieAggro: true }) after
    }
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, fails: rows.filter((r) => r.result === "FAIL").length };
}
