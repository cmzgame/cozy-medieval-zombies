// The playtest's features, first batch (#506; docs/02, 2026-10-26, The playtest's rulings). From the console, on a tab with `?nosave&mute`:
//   await __game.check("features1")
// On open ground of its own, with a lit campfire it makes: a bucket of tainted water boiled by its menu (a bar of `bucketBoilSeconds`) and by the
// fire's "Boil water in the bucket", its card read over the bag (the drop, "Tainted water.", then "Clean water.", and its Use lines), and poured
// into a skin by the Use mode (clean into an empty skin; tainted into a clean skin refused, "That would taint the clean water.", in the log), the
// skin's card read; Burn corpse with a tinderbox alone and nothing spent, its card read on the page from the menu entry (no log, the Use line in
// gold), a lit torch's Use on a body burning it, an unlit one refused, the torch's card read over the bag; sleep at 20, at the bed beside it, the
// screen fading to black over about a second and back on waking, and a friend asleep drawn with a "Zz" (never in the log, never over myself); a
// leather belt on the ground opened where it lies and a linen satchel in a chest opened from its menu there, each a container panel on the page
// whose Take All empties it, the satchel's panel closing when it leaves the chest; a stack of pemmican dragged by real pointer events onto a
// matching belt stack and onto a matching bag stack fills it to 20, the rest staying, and a coated stack of knives never merging. Everything put
// back in the finally.
//
// Two tabs (`?nosave&mute&relay=none`): on the host `await __game.check("features1", { keep: true })` runs the rows above, then gives every other
// player a full clean bucket and an empty skin, a lit torch in hand, pemmican 12 on its utility slot and 15 in its bag, one of the dead lying
// beside it, and a leather belt on the ground holding a sword and pemmican, and puts the host's own player asleep (its bed by id, tired) beside
// them, and returns `kept`; on the guest `await __game.check("features1", { guest: <kept> })` pours the bucket into its skin by the Use mode's
// sender, burns the body with its torch by Use, opens the belt on the ground by its label and takes all from it by its panel's command, drops its
// pemmican on its belt stack by a slot command, opens a second belt and takes all from it, takes the sword alone from the first and leaves its
// panel open (a partial take, the review of #508), and reads the "Zz" over the sleeping host; then on the host
// `await __game.check("features1", { sleepOthers: true })` gets me up and puts every other player to bed, and on the guest
// `await __game.check("features1", { wake: true })` sees its screen go black and wakes by a key (Michael, 2026-10-26: "any key or click wakes
// you early"); then `await __game.check("sync")` on the host, and `await __game.check("features1", { stop: true })` there puts everything back.

const keptBack = { players: [], bodies: [], items: [], host: null };

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
  const mk = (id, n = 1, props = {}) => G.items.makeEntry(id, n, props);
  const use = await import("/src/use.js");
  const speech = await import("/src/ui/speech.js");
  const visibility = await import("/src/visibility.js");
  const me = G.player;

  if (opts.stop) {
    const put = [];
    for (const k of keptBack.players.splice(0)) {
      const p = G.game.state.players.find((q) => q.id === k.id);
      if (!p) continue;
      const b = G.inventory.bagOf(p);
      if (b && k.bag) b.items.splice(0, b.items.length, ...k.bag);
      const bl = G.inventory.beltOf(p);
      if (bl && k.belt) bl.splice(0, bl.length, ...k.belt);
      p.hands.main = k.hands.main;
      p.hands.off = k.hands.off;
      p.gx = k.at[0]; p.gy = k.at[1]; p.auto = null;
      p.sleeping = null; // put to bed by { sleepOthers: true }
      p.tired = k.tired;
      put.push(p.id);
    }
    for (const z of keptBack.bodies.splice(0)) {
      for (const list of [G.zombies, G.corpses]) { const i = list.indexOf(z); if (i >= 0) list.splice(i, 1); }
    }
    for (const [x, y, e] of keptBack.items.splice(0)) if (G.map.itemsAt(x, y).includes(e)) G.map.takeItem(x, y, e);
    if (keptBack.host) {
      me.sleeping = null;
      me.tired = keptBack.host.tired;
      G.teleport(keptBack.host.at[0], keptBack.host.at[1]); // where { keep: true } found me
      keptBack.host = null;
    }
    row("the other players' bags, belts, hands, places, and needs put back, awake, the body and the belts on the ground taken away, and I am awake where I was", true, put.join(", ") || "nobody kept");
    return done();
  }

  // ---- two tabs, after the guest's first half: I get up, and every other player is put to bed, for the guest to wake by a key ----
  if (opts.sleepOthers) {
    let bed = null;
    for (const pr of G.map.allProps()) if (G.assets.getDef(pr.sprite).sleep) { bed = pr; break; }
    const playerMod = await import("/src/entities/player.js");
    if (me.sleeping) playerMod.wake(me);
    const others = G.game.state.players.filter((p) => p !== me);
    for (const p of others) {
      p.tired = 5; // not rested: asleep until woken
      p.sleeping = { bed: bed.id, since: G.loop.simTime(), hour: G.clock.getHour() };
    }
    row("I am up and every other player is asleep (its bed by id, tired), the world at 1 while I am awake", !me.sleeping && others.length > 0 && others.every((p) => p.sleeping) && G.game.timeScaleNow() === 1, `${others.map((p) => p.id).join(", ")}; scale ${G.game.timeScaleNow()}`);
    return done();
  }

  // ---- a guest put to bed: any key wakes it on the host, and its screen's fade comes back in ----
  if (opts.wake) {
    const sleepFade = await import("/src/ui/sleep-fade.js");
    const wasPaused = G.loop.isPaused();
    G.loop.setPaused(true);
    const screenG = G.screens.currentScreen();
    if (screenG) G.screens.hide();
    const pump = async (until, ms = 15000) => {
      const t0 = performance.now();
      let last = t0;
      while (!until() && performance.now() - t0 < ms) {
        await yieldOnce();
        if (performance.now() - last >= 1000 / 60) { last = performance.now(); G.loop.advance(1 / 60); }
      }
      return until();
    };
    try {
      const asleep = await pump(() => !!G.player.sleeping, 10000);
      sleepFade.update(G.player);
      const dark = sleepFade.state();
      for (let i = 0; i < 3; i++) G.loop.advance(1 / 60); // seen asleep a few steps: the press that put me to bed never wakes me
      G.input.tap("KeyX"); // any key
      const woke = await pump(() => !G.player.sleeping, 10000);
      sleepFade.update(G.player);
      const light = sleepFade.state();
      row("on a guest put to bed by the host: my screen fades to black, any key wakes me on the host (a key event in my snapshot), and the fade comes back in", asleep && dark.on && woke && !light.on, `asleep ${asleep}, dark ${dark.on}; woke ${woke}, fade ${light.on}`);
    } catch (e) {
      rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
    } finally {
      if (screenG) G.screens.show(screenG);
      G.loop.setPaused(wasPaused);
    }
    return done();
  }

  // ---- a guest's side ----
  if (opts.guest) {
    const kept = opts.guest;
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
      const bag = () => G.inventory.bagOf(me);
      const find = (id, f = () => true) => bag() && bag().items.find((e) => e.id === id && f(e));
      const body = () => G.corpses.find((c) => c.id === kept.body);
      const groundBelt = () => G.map.itemsAt(kept.belt.tile[0], kept.belt.tile[1]).find((e) => e.uid === kept.belt.uid);
      await pump(() => !!find("bucket") && !!find("waterskin") && !!me.hands.main && !!body() && !!groundBelt(), 10000);
      const bucket = find("bucket");
      const skin = find("waterskin");
      row("on a guest my replica has the host's gifts: a clean full bucket, an empty skin, a lit torch, the body beside me, the belt on the ground", !!bucket && bucket.clean && !!skin && !(skin.fill > 0) && me.hands.main && me.hands.main.lit && !!body() && !!groundBelt(), `bucket ${bucket ? `${bucket.fill} ${bucket.clean}` : "-"}, skin ${skin ? skin.fill : "-"}, torch ${me.hands.main ? me.hands.main.lit : "-"}, body ${!!body()}, belt ${!!groundBelt()}`);
      if (bucket && skin) {
        use.begin(bucket, { kind: "bag", bag: bag() });
        use.apply({ kind: "item", entry: skin, bag: bag() }, me); // the Use mode's sender: a use command by the two uids
        const poured = await pump(() => { const s = find("waterskin"); const b = find("bucket"); return !!s && s.fill === 100 && s.clean === true && !!b && b.fill === 0; });
        row("on a guest the bucket's Use on my skin goes to the host and fills it with clean water, the bucket emptied, on my replica", poured, (() => { const s = find("waterskin"); const b = find("bucket"); return `skin ${s ? `${s.fill} ${!!s.clean}` : "-"}, bucket ${b ? b.fill : "-"}`; })());
      }
      if (body() && me.hands.main) {
        use.begin(me.hands.main, { kind: "slot", id: "hand:main" });
        use.apply({ kind: "character", ch: body() }, me);
        const burnt = await pump(() => !!body() && !!body().cremate);
        row("on a guest my lit torch's Use on the body burns it on the host: the body cremating on my replica, my torch kept", burnt && !!me.hands.main && me.hands.main.id === "torch", `cremate ${body() ? body().cremate : "gone"}, torch ${me.hands.main ? me.hands.main.id : "-"}`);
      }
      // Before the belt's Take All, whose pemmican would top up the bag's 15.
      {
        const beltSlots = G.inventory.beltOf(me);
        const p15 = find("pemmican", (e) => e.count === 15);
        if (!beltSlots || !p15 || !beltSlots[2]) row("on a guest a belt with pemmican 12 on its utility slot and 15 in my bag", false, `belt ${!!beltSlots}, slot ${beltSlots && beltSlots[2] ? beltSlots[2].count : "-"}, bag stack ${p15 ? p15.count : "-"}`);
        else {
          G.handlers.placeInSlot(p15, { kind: "bag", bag: bag() }, "belt:2"); // the drag's handler on a guest: a slot command by the uid
          const filled = await pump(() => { const s = (G.inventory.beltOf(me) || [])[2]; return !!s && s.count === 20; });
          const rest = find("pemmican");
          row("on a guest my pemmican dropped on my belt's stack of 12 fills it to 20 on the host, 7 staying in my bag", filled && !!rest && rest.count === 7, `slot ${(G.inventory.beltOf(me) || [])[2] ? G.inventory.beltOf(me)[2].count : "-"}, bag ${rest ? rest.count : "-"}`);
        }
      }
      const name = G.items.getItem("good_belt").name.toLowerCase();
      const beltAt = (b) => G.map.itemsAt(b.tile[0], b.tile[1]).find((e) => e.uid === b.uid);
      const openBelt = async (b) => {
        G.net.sendAct({ kind: "item", tile: b.tile, uid: b.uid }, `Open ${name}`);
        return pump(() => !!G.openBag && !!G.openBag.bag && G.openBag.bag.takeOnly && G.openBag.address && G.openBag.address.entryUid === b.uid && G.openBag.bag.items.length === 2);
      };
      // The second belt: opened by its label and emptied by Take All.
      if (kept.belt2 && beltAt(kept.belt2)) {
        const labels = G.interact.actionsForTarget({ kind: "item", tile: kept.belt2.tile, uid: kept.belt2.uid }, me).map((a) => a.label);
        const up = await openBelt(kept.belt2);
        row("on a guest a belt on the ground offers Open, sent by its label: the host opens it for me, its slots a panel on my replica", labels.includes(`Open ${name}`) && up, `${labels.join(", ")}; open ${!!G.openBag} ${G.openBag ? JSON.stringify(G.openBag.address) : ""}`);
        if (up) {
          G.handlers.takeAll(G.openBag.bag); // the panel's Take All, the command by the open container's address
          const took = await pump(() => { const b = beltAt(kept.belt2); return !!b && b.slots.every((s) => !s) && !!find("knife") && !!find("bread"); });
          row("on a guest Take All on the belt's panel empties the belt on the ground into my bag, by its address on the host", took, (() => { const b = beltAt(kept.belt2); return `slots ${b ? JSON.stringify(b.slots.map((s) => s && s.id)) : "-"}; knife ${!!find("knife")}, bread ${!!find("bread")}`; })());
        }
      }
      // The first: a partial take (the review of #508), the sword alone dragged out by the panel's command, the pemmican left in slot 2 and the
      // panel left open, so the replica lays the view out afresh from the host's chunk; `check("sync")` after shows the two agree.
      if (groundBelt()) {
        const up = await openBelt(kept.belt);
        const sword = up ? G.openBag.bag.items.find((e) => e.id === "sword") : null;
        const spot = sword ? G.grid.findSpot(bag(), "sword") : null;
        if (sword && spot) G.handlers.moveInGrid(sword, G.openBag.bag, bag(), spot.x, spot.y, spot.rot);
        const took = await pump(() => { const b = groundBelt(); return !!b && !b.slots[0] && !!b.slots[2] && !!find("sword"); });
        const b = groundBelt();
        const pem = b && b.slots[2];
        row("on a guest the sword alone dragged out of the open belt's panel: in my bag, the belt keeping its pemmican in slot 2 at the place its slot gives it, the panel still open", up && took && !!pem && pem.x === 2 * G.items.allItems().reduce((w, d) => (d.hands || d.kind === "food" || d.capacity || d.belt === true ? Math.max(w, (d.size || [1, 1])[0]) : w), 1) && !!G.openBag && G.openBag.bag.items.length === 1, `slots ${b ? JSON.stringify(b.slots.map((s) => s && `${s.id}@${s.x}`)) : "-"}; sword ${!!find("sword")}; open ${!!G.openBag}`);
      }
      // The host asleep: a "Zz" over it on my screen, from its record's `sleeping`; never a line in the log.
      const host = G.game.state.players.find((p) => p.id === kept.host);
      const lines0 = (await import("/src/ui/log.js")).lines().length;
      speech.updateSpeech(G.game.state.others, G.visible, me, 0);
      const zz = [...document.querySelectorAll("#speech .speech")].find((el) => el.textContent === "Zz");
      const lines1 = (await import("/src/ui/log.js")).lines().length;
      row("on a guest the sleeping host has a \"Zz\" over it, drawn from its record, and nothing in my log", !!host && !!host.sleeping && !!zz && zz.classList.contains("speech-zz") && lines1 === lines0, `host asleep ${!!(host && host.sleeping)}, bubble ${!!zz}; log ${lines0} to ${lines1}`);
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
  const panel = await import("/src/ui/inventory-panel.js");
  const menu = await import("/src/ui/context-menu.js");
  const hoverCard = await import("/src/ui/hover-card.js");
  const log = await import("/src/ui/log.js");
  const sleepFade = await import("/src/ui/sleep-fade.js");
  const playerMod = await import("/src/entities/player.js");
  const { createZombie, damageZombie } = await import("/src/entities/zombie.js");
  const water = await import("/src/water.js");
  const actions = await import("/src/ui/inventory-actions.js");
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  const at0 = [me.gx, me.gy];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const bag = G.inventory.bagOf(me);
  const bag0 = bag ? bag.items.slice() : null;
  const belt = G.inventory.beltOf(me);
  const belt0 = belt ? belt.slice() : null;
  const needs0 = { hunger: me.hunger, thirst: me.thirst, tired: me.tired, hp: me.hp };
  const rules0 = { zombieAggro: G.rules.rules.zombieAggro };
  const bagOpen0 = panel.isBagOpen();
  const props = [];
  const added = [];
  const dropped = [];
  let kept = null;
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const finish = () => { for (let i = 0; i < 1500 && me.action; i++) G.interact.updateAction(me, 0.1); };
  const msg = () => ((document.getElementById("message") || {}).textContent || "").trim();
  const render = () => panel.renderInventoryPanel(me, bag, G.openBag ? G.openBag.bag : null, G.inventory.beltOf(me));
  const blockOf = (entry, which = "inv", b = bag) => document.querySelector(`.inv-item[data-bag="${which}"][data-index="${b.items.indexOf(entry)}"]`);
  // The hover card over an item's block in a grid, as the page draws it.
  const cardOver = async (entry, which = "inv", b = bag) => {
    panel.setBagOpen(true);
    render();
    const blk = blockOf(entry, which, b);
    if (!blk) return null;
    const r = blk.getBoundingClientRect();
    blk.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
    await wait((G.tuning.hoverCard.delayMs || 0) + 80);
    const hc = document.getElementById("hover-card");
    return { text: [...hc.querySelectorAll(".hc-line")].map((l) => l.textContent), drop: !!blk.querySelector(".inv-taint"), el: hc };
  };
  const lay = (gx, gy) => {
    const z = createZombie(gx, gy);
    z.target = null;
    G.zombies.push(z);
    added.push(z);
    damageZombie(z, z.hp + 10);
    for (let i = 0; i < 240 && !G.corpses.includes(z); i++) step();
    return z;
  };
  try {
    G.loop.setPaused(true);
    if (screen0) G.screens.hide();
    G.rules.set({ zombieAggro: false });
    const open = G.map.nearestWalkable(Math.round(me.gx) + 4, Math.round(me.gy), (x, y) => {
      for (let dx = -2; dx <= 4; dx++) for (let dy = -2; dy <= 4; dy++) {
        const t = G.map.peekTile(x + dx, y + dy);
        if (!t || G.map.roomAt(x + dx, y + dy) !== 0 || t.prop || !G.map.isWalkableTile(x + dx, y + dy) || G.map.itemsAt(x + dx, y + dy).length) return true;
      }
      return false;
    });
    const [ox, oy] = open;
    G.teleport(ox, oy);
    me.hands.main = null;
    me.hands.off = null;
    bag.items.length = 0;
    if (belt) belt.fill(null);
    step();

    // ---- 1. a bucket boiled and poured ----
    {
      const fire = G.map.createProp({ sprite: "campfire", tile: [ox + 2, oy], fuel: 3, lit: true });
      G.map.placeProp(fire, ox + 2, oy);
      props.push(fire);
      const cap = G.items.getItem("bucket").vessel.capacity;
      const W = G.tuning.water;
      const bucket = mk("bucket", 1, { fill: cap });
      G.grid.insert(bag, bucket);
      const c0 = await cardOver(bucket);
      row("the tainted bucket's card on the page: its drop, \"Tainted water.\" first, and its Use lines (boil at a fire, pour into a waterskin)", !!c0 && c0.drop && c0.text[0] === "Tainted water." && c0.text.some((l) => /^Use on fire.*: boil\.$/.test(l)) && c0.text.some((l) => /^Use on .*waterskin.*: pour\.$/.test(l)), c0 ? `${c0.drop ? "drop; " : ""}${c0.text.join(" | ")}` : "no block");
      const boil = G.interact.itemMenu(me, bucket, bag, null).find((m) => m.label === "Boil water");
      const fireLabels = G.interact.actionsForTarget({ kind: "prop", id: fire.id }, me).map((a) => a.label);
      if (boil) boil.onSelect();
      const bar = me.action ? me.action.action.duration : null;
      finish();
      const c1 = await cardOver(bucket);
      row(`the bucket's menu boils it at the lit fire in a bar of ${W.bucketBoilSeconds} s (bucketBoilSeconds), the fill kept; the fire's menu offers "${water.BOIL_BUCKET}"`, !!boil && bar === W.bucketBoilSeconds && bucket.clean === true && bucket.fill === cap && fireLabels.includes(water.BOIL_BUCKET), `bar ${bar}; ${JSON.stringify({ fill: bucket.fill, clean: bucket.clean })}; the fire: ${fireLabels.join(", ")}`);
      row("its card then says \"Clean water.\" and the drop is gone", !!c1 && !c1.drop && c1.text.includes("Clean water.") && !c1.text.includes("Tainted water."), c1 ? c1.text.join(" | ") : "no block");
      const b2 = mk("bucket", 1, { fill: 60 });
      G.grid.insert(bag, b2);
      G.interact.performByLabel(me, { kind: "prop", id: fire.id }, water.BOIL_BUCKET);
      const bar2 = me.action ? me.action.action.duration : null;
      finish();
      row("the fire's \"Boil water in the bucket\", by its label as a guest sends it, boils the tainted bucket", bar2 === W.bucketBoilSeconds && b2.clean === true && b2.fill === 60, `bar ${bar2}; ${JSON.stringify({ fill: b2.fill, clean: b2.clean })}`);
      G.grid.remove(bag, b2);
      // Poured by the Use mode: clean into an empty skin; tainted into a clean skin refused in Michael's words.
      const skin = mk("waterskin", 1, { fill: 0 });
      G.grid.insert(bag, skin);
      let n0 = log.lines().length;
      use.begin(bucket, { kind: "bag", bag });
      use.apply({ kind: "item", entry: skin, bag }, me);
      const said1 = log.lines().slice(n0).join(" / ");
      row("Use the clean bucket on an empty skin: the skin full of clean water, the bucket empty, the line in the log", skin.fill === 100 && skin.clean === true && bucket.fill === 0 && /You fill the waterskin from the bucket/.test(said1), `skin ${skin.fill} ${!!skin.clean}, bucket ${bucket.fill}; "${said1}"`);
      skin.fill = 40;
      const t = mk("bucket", 1, { fill: cap });
      G.grid.insert(bag, t);
      n0 = log.lines().length;
      use.begin(t, { kind: "bag", bag });
      use.apply({ kind: "item", entry: skin, bag }, me);
      const said2 = log.lines().slice(n0).join(" / ");
      row("Use a tainted bucket on a skin holding clean water: refused, \"That would taint the clean water.\" in the log, nothing moved", said2 === "That would taint the clean water." && skin.fill === 40 && skin.clean === true && t.fill === cap, `"${said2}"; skin ${skin.fill} ${!!skin.clean}, bucket ${t.fill}`);
      const cs = await cardOver(skin);
      row("the waterskin's card on the page says it fills at water or from a bucket", !!cs && cs.text.some((l) => l.includes("fill it at water, or from a bucket.")), cs ? cs.text.join(" | ") : "no block");
      bag.items.length = 0;
    }

    // ---- 2. Burn corpse for a tinderbox alone; a lit torch Used on a body ----
    {
      const WB = G.tuning.work.burnCorpse;
      const body = lay(ox + 1, oy + 1);
      const addr = { kind: "character", id: body.id };
      me.hands.main = mk("tinderbox");
      const entry = G.interact.actionsForTarget(addr, me).find((a) => /^Burn corpse/.test(a.label || ""));
      row("with a tinderbox and no log anywhere on me, Burn corpse is offered whole (no log, Michael 2026-10-26)", !!entry && entry.label === "Burn corpse" && entry.enabled !== false && G.inventory.countAll(me, "log") === 0, entry ? `${entry.label}${entry.enabled === false ? " (greyed)" : ""}` : "none");
      if (entry) {
        G.menu.openContextMenu(40, 40, [{ label: entry.label, enabled: true, card: entry.card, onSelect: () => {} }]);
        const el = [...document.querySelectorAll("#menu .menu-entry")].find((q) => q.textContent === "Burn corpse");
        const box = el ? el.getBoundingClientRect() : null;
        if (el) el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: box.left + 6, clientY: box.top + 4 }));
        await wait((G.tuning.hoverCard.delayMs || 0) + 120);
        const hc = document.getElementById("hover-card");
        const lines = [...hc.querySelectorAll(".hc-line")].map((l) => l.textContent);
        const gold = hc.querySelector(".hc-use");
        const goldOk = !!gold && getComputedStyle(gold).color !== getComputedStyle(hc).color;
        G.menu.closeContextMenu();
        row("its card on the page: the warning first, \"Needs a tinderbox carried or a lit torch in hand; nothing is spent.\", and \"Use a lit torch on the body to burn it too.\" with Use in gold", lines[0] === "Burns the body and everything in it." && lines.includes("Needs a tinderbox carried or a lit torch in hand; nothing is spent.") && lines.includes("Use a lit torch on the body to burn it too.") && goldOk && !lines.some((l) => /log/.test(l)), `${lines.join(" | ")}; Use ${gold ? getComputedStyle(gold).color : "none"}`);
      }
      G.interact.performByLabel(me, addr, "Burn corpse");
      step(Math.ceil(WB.seconds * 60) + 3);
      row("Burn corpse by its label: the body alight, nothing spent, the tinderbox kept", body.cremate && body.burning && G.inventory.countAll(me, "tinderbox") === 1, `cremate ${body.cremate}, tinderboxes ${G.inventory.countAll(me, "tinderbox")}`);
      const body2 = lay(ox - 1, oy + 1);
      const torch = mk("torch");
      me.hands.main = torch;
      let n0 = log.lines().length;
      use.begin(torch, { kind: "slot", id: "hand:main" });
      use.apply({ kind: "character", ch: body2 }, me);
      const unlit = log.lines().slice(n0).join(" / ");
      torch.lit = true;
      n0 = log.lines().length;
      use.begin(torch, { kind: "slot", id: "hand:main" });
      use.apply({ kind: "character", ch: body2 }, me);
      const lit = log.lines().slice(n0).join(" / ");
      row("Use an unlit torch on a body: \"The torch is not lit.\"; a lit one burns it, the torch kept and still lit", unlit === "The torch is not lit." && body2.cremate && body2.burning && me.hands.main === torch && torch.lit && /The body catches/.test(lit), `unlit "${unlit}"; lit "${lit}"; cremate ${body2.cremate}`);
      // The menu's Burn corpse with a lit torch in hand and no tinderbox (Michael, 2026-10-26: "the menu's Burn corpse works with a lit torch in
      // hand too"), greyed only with neither.
      const body3 = lay(ox + 1, oy - 1);
      const addr3 = { kind: "character", id: body3.id };
      const burnLabel = () => { const a = G.interact.actionsForTarget(addr3, me).find((q) => /^Burn corpse/.test(q.label || "")); return a ? `${a.label}${a.enabled === false ? " (greyed)" : ""}` : "none"; };
      torch.lit = false;
      const neither = burnLabel();
      torch.lit = true;
      const withTorch = burnLabel();
      G.interact.performByLabel(me, addr3, "Burn corpse");
      step(Math.ceil(WB.seconds * 60) + 3);
      row("the menu's Burn corpse with a lit torch in hand and no tinderbox: offered and done, the torch kept lit; with an unlit torch and no tinderbox, greyed \"(need a tinderbox or a lit torch)\"", G.inventory.countAll(me, "tinderbox") === 0 && neither === "Burn corpse (need a tinderbox or a lit torch) (greyed)" && withTorch === "Burn corpse" && body3.cremate && me.hands.main === torch && torch.lit, `${neither}; ${withTorch}; cremate ${body3.cremate}`);
      body3.burning = false;
      body3.cremate = false;
      me.hands.main = null;
      const t2 = mk("torch");
      G.grid.insert(bag, t2);
      const ct = await cardOver(t2);
      row("the torch's card on the page names its new Use: \"Use on a body of the dead: burn.\"", !!ct && ct.text.includes("Use on a body of the dead: burn."), ct ? ct.text.join(" | ") : "no block");
      bag.items.length = 0;
      for (const z of [body, body2]) { z.burning = false; z.cremate = false; } // put out, taken away in the finally
    }

    // ---- 3. sleep: 20, beside the bed, the fade, a friend's "Zz" ----
    {
      row("sleep's levers: the world at 20 while everyone sleeps (was 60), the fade about a second", G.tuning.player.sleepTimeScale === 20 && G.tuning.feel.sleepFadeSeconds === 1, `${G.tuning.player.sleepTimeScale}, ${G.tuning.feel.sleepFadeSeconds}`);
      let bed = null;
      for (let r = 0; r < 14 && !bed; r++) for (let dy = -r; dy <= r && !bed; dy++) for (let dx = -r; dx <= r && !bed; dx++) {
        const pr = G.map.peekTile(Math.round(at0[0]) + dx, Math.round(at0[1]) + dy)?.prop;
        if (pr && G.assets.getDef(pr.sprite).sleep) bed = pr;
      }
      if (!bed) row("a bed near the spawn", false, "none within 14 tiles");
      else {
        const { canReach } = await import("/src/reach.js");
        const stand = G.map.nearestWalkable(bed.tile[0], bed.tile[1], (x, y) => bed.tiles.some(([bx, by]) => bx === x && by === y) || G.map.roomAt(x, y) !== G.map.roomAt(bed.tile[0], bed.tile[1]) || !canReach({ gx: x, gy: y }, bed.tiles, 1.5));
        G.teleport(stand[0], stand[1]);
        me.tired = 10;
        const r = G.verbs.run("sleep", G.world, me, { prop: bed.id });
        const onBed = bed.tiles.some(([bx, by]) => bx === Math.round(me.gx) && by === Math.round(me.gy));
        const scale = G.game.timeScaleNow();
        const want = G.game.everyoneAsleep() ? 20 : 1; // with a friend awake the world keeps its pace (Michael, 2026-10-13)
        // The fade: the page's own CSS transition, read whether or not the pane draws frames (a hidden pane's clock stands still): its
        // seconds, and the opacity it ends at once played out.
        // Read at once after the toggle, so the transition is found whether or not the pane draws frames (it fails when there is none), then
        // played out to read where it ends.
        const settle = () => { const s = sleepFade.state(); const fading = s.fading; if (s.transition) s.transition.finish(); return { ...sleepFade.state(), fading }; };
        sleepFade.update(me);
        const dark = settle();
        row("asleep in the bed I stand beside it (never on it), the world at 20 (alone; at 1 with a friend awake), and my screen fades to black over a 1 s transition", r.ok && !!me.sleeping && !onBed && Math.abs(me.gx - stand[0]) < 0.01 && scale === want && (G.game.state.players.length > 1 || scale === 20) && dark.on && dark.fading === G.tuning.feel.sleepFadeSeconds && dark.opacity > 0.99, `${r.ok ? "asleep" : r.reason}; at ${me.gx},${me.gy} beside ${bed.tile}; scale ${scale}; fade on ${dark.on}, transition ${dark.fading} s, opacity ${dark.opacity}`);
        // Waking early (Michael, 2026-10-26): any key or click, a key event in my snapshot performed by the world's step; never the press that put
        // me to bed (a press counts once my client has seen me asleep a step).
        G.input.tap("KeyX");
        step();
        const keptAsleep = !!me.sleeping;
        step(2);
        G.input.tap("KeyX");
        step();
        const wokeByKey = !me.sleeping;
        sleepFade.update(me);
        const light = settle();
        row("a key pressed in the first step asleep does not wake me; any key after does, on the world's step, the screen fading back in over 1 s and the world at 1", keptAsleep && wokeByKey && !light.on && light.fading === G.tuning.feel.sleepFadeSeconds && light.opacity < 0.01 && G.game.timeScaleNow() === 1, `first step ${keptAsleep ? "asleep" : "woke"}; then ${wokeByKey ? "woke" : "asleep"}; fade on ${light.on}, transition ${light.fading} s, opacity ${light.opacity}; scale ${G.game.timeScaleNow()}`);
        me.tired = 10;
        const r2 = G.verbs.run("sleep", G.world, me, { prop: bed.id });
        step(3);
        document.getElementById("ui").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
        step();
        row("asleep again, a click anywhere on the page wakes me too", r2.ok && !me.sleeping, `${r2.ok ? "slept" : r2.reason}; ${me.sleeping ? "still asleep" : "woke"}`);
        if (me.sleeping) playerMod.wake(me);
        sleepFade.update(me);
        const dur = getComputedStyle(document.getElementById("sleep-fade")).transitionDuration;
        row("the fade's length on the page is the lever's, feel.sleepFadeSeconds", dur === `${G.tuning.feel.sleepFadeSeconds}s`, dur);
        me.tired = needs0.tired;
      }
      // A friend asleep: a "Zz" over them, never in the log; none over myself.
      const friend = { id: "zz-friend", kind: "player", name: "Friend", gx: me.gx + 1, gy: me.gy, sleeping: { bed: "b" }, line: null, dead: false };
      const vis = new Set([visibility.tileKey(Math.round(friend.gx), Math.round(friend.gy)), visibility.tileKey(Math.round(me.gx), Math.round(me.gy))]);
      const n0 = log.lines().length;
      speech.updateSpeech([friend], vis, me, 0);
      const zz = [...document.querySelectorAll("#speech .speech")].find((el) => el.textContent === "Zz");
      const zzLogged = log.lines().length !== n0;
      speech.updateSpeech([], vis, me, 0);
      const self = { ...me, sleeping: { bed: "b" }, line: null };
      speech.updateSpeech([self], vis, self, 0);
      const overMe = [...document.querySelectorAll("#speech .speech")].some((el) => el.textContent === "Zz");
      speech.updateSpeech([], vis, me, 0);
      row("a friend asleep has a \"Zz\" bubble over them, a visual twin that never reaches the log; none over my own sleeper", !!zz && zz.classList.contains("speech-zz") && !zzLogged && !overMe, `bubble ${!!zz}, logged ${zzLogged}, over me ${overMe}`);
      G.teleport(ox, oy);
    }

    // ---- 4. container items opened where they lie ----
    {
      const [tx, ty] = [Math.round(me.gx), Math.round(me.gy)];
      const gBelt = mk("good_belt");
      G.inventory.ensureSlots(gBelt);
      gBelt.slots[0] = mk("sword");
      gBelt.slots[2] = mk("pemmican", 5);
      G.map.dropItem(tx, ty, gBelt);
      dropped.push([tx, ty, gBelt]);
      const name = G.items.getItem("good_belt").name.toLowerCase();
      const addr = { kind: "item", tile: [tx, ty], uid: gBelt.uid };
      const labels = G.interact.actionsForTarget(addr, me).map((a) => `${a.label}${a.simple ? " (E)" : ""}`);
      G.interact.performByLabel(me, addr, `Open ${name}`);
      step();
      panel.setBagOpen(true);
      render();
      const col = document.querySelector(".container-wrap .inv-column");
      const title = col ? (col.querySelector(".inv-header") || col).textContent : "";
      const blocks = document.querySelectorAll('.container-wrap .inv-item[data-bag="container"]').length;
      row("a leather belt on the ground holding things offers Open (E) and opens where it lies: a container panel titled for it, its two things in it, with Take All", labels.includes(`Open ${name} (E)`) && !!G.openBag && G.openBag.bag.takeOnly && /Leather belt/.test(title) && blocks === 2 && !!document.querySelector(".container-wrap [data-takeall]"), `${labels.join(", ")}; title "${title.trim().slice(0, 40)}", ${blocks} blocks`);
      document.querySelector(".container-wrap [data-takeall]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      step();
      render();
      row("its Take All on the page empties the belt itself into my bag and belt: its slots empty, nothing doubled", gBelt.slots.every((s) => !s) && G.inventory.countAll(me, "sword") === 1 && G.inventory.countAll(me, "pemmican") === 5 && G.game.itemCensus().dups.length === 0, `slots ${JSON.stringify(gBelt.slots.map((s) => s && s.id))}; dups ${G.game.itemCensus().dups.length}`);
      panel.setBagOpen(false);
      G.map.takeItem(tx, ty, gBelt);
      bag.items.length = 0;
      if (belt) belt.fill(null);
      // A satchel holding things in a chest: Open on its menu there.
      G.teleport(ox, oy);
      const chest = G.map.createProp({ sprite: "chest", tile: [ox, oy + 1] }); // within reach: its Open runs at once
      G.map.placeProp(chest, ox, oy + 1);
      props.push(chest);
      const cBag = G.interact.propBag(chest);
      chest.searched = true;
      cBag.items.length = 0;
      const sat = mk("satchel");
      G.inventory.ensureBag(sat);
      G.grid.insert(sat.bag, mk("bread"));
      G.grid.insert(sat.bag, mk("apple"));
      G.grid.insert(cBag, sat);
      G.interact.performByLabel(me, { kind: "prop", id: chest.id }, "Open chest");
      step();
      const chestOpen = !!G.openBag && G.openBag.bag === cBag;
      const sname = G.items.getItem("satchel").name.toLowerCase();
      const sOpen = G.handlers.itemMenu(sat, cBag, bag).find((m) => m.label === `Open ${sname}`);
      if (sOpen) sOpen.onSelect();
      step();
      panel.setBagOpen(true);
      render();
      const col2 = document.querySelector(".container-wrap .inv-column");
      const title2 = col2 ? (col2.querySelector(".inv-header") || col2).textContent : "";
      const blocks2 = document.querySelectorAll('.container-wrap .inv-item[data-bag="container"]').length;
      // Take-only (Primary's reading on the review of #508): an apple dropped into it from my bag stays in my bag.
      const apple2 = mk("apple");
      G.grid.insert(bag, apple2);
      if (G.openBag) G.handlers.moveInGrid(apple2, bag, G.openBag.bag, 0, 0, false);
      const refusedIn = bag.items.includes(apple2) && sat.bag.items.length === 2;
      G.grid.remove(bag, apple2);
      row("the satchel opened inside the chest is take-only: an apple dragged into it stays in my bag, and nothing in it offers Open", refusedIn && !!G.openBag && G.openBag.bag.takeOnly && !G.handlers.itemMenu(mk("small_sack"), G.openBag.bag, bag).some((m) => /^Open/.test(m.label)), `stayed ${refusedIn}; take-only ${!!(G.openBag && G.openBag.bag.takeOnly)}`);
      row("a linen satchel holding things in an open chest has Open on its menu there, which opens its grid as the container panel", chestOpen && !!sOpen && !!G.openBag && G.openBag.bag.items === sat.bag.items && G.openBag.address && G.openBag.address.within && G.openBag.address.within.propId === chest.id && /Linen satchel/.test(title2) && blocks2 === 2, `chest open ${chestOpen}; ${sOpen ? sOpen.label : "no Open"}; ${G.openBag ? JSON.stringify(G.openBag.address) : "nothing open"}; "${title2.trim().slice(0, 40)}", ${blocks2} blocks`);
      document.querySelector(".container-wrap [data-takeall]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      step();
      row("its Take All empties the satchel where it lies into my bag, the satchel still in the chest", sat.bag.items.length === 0 && G.inventory.countAll(me, "bread") === 1 && G.inventory.countAll(me, "apple") === 1 && cBag.items.includes(sat), `left ${sat.bag.items.length}; bread ${G.inventory.countAll(me, "bread")}, apple ${G.inventory.countAll(me, "apple")}`);
      G.grid.insert(sat.bag, mk("bread"));
      G.grid.remove(cBag, sat); // taken out of the chest by someone else: its panel closes with it
      step();
      row("the satchel gone from the chest, its panel closes (it is found again by its address each step)", !G.openBag, G.openBag ? JSON.stringify(G.openBag.address) : "closed");
      panel.setBagOpen(false);
      bag.items.length = 0;
    }

    // ---- 5. a stack dropped on a matching stack fills it (real pointer events on the panel) ----
    {
      const put = (e) => { Object.assign(e, G.grid.findSpot(bag, e.id)); bag.items.push(e); };
      const drag = async (fromEl, toEl) => {
        const a = fromEl.getBoundingClientRect();
        const b = toEl.getBoundingClientRect();
        const [x0, y0, x1, y1] = [a.left + a.width / 2, a.top + a.height / 2, b.left + b.width / 2, b.top + b.height / 2];
        fromEl.dispatchEvent(new PointerEvent("pointerdown", { button: 0, clientX: x0, clientY: y0, bubbles: true }));
        for (const f of [0.1, 0.5, 1]) window.dispatchEvent(new PointerEvent("pointermove", { clientX: x0 + (x1 - x0) * f, clientY: y0 + (y1 - y0) * f, bubbles: true }));
        window.dispatchEvent(new PointerEvent("pointerup", { button: 0, clientX: x1, clientY: y1, bubbles: true }));
        render();
      };
      if (!belt) row("a belt to drop on", false, "no belt worn");
      else {
        belt[2] = mk("pemmican", 12);
        const p15 = mk("pemmican", 15);
        put(p15);
        panel.setBagOpen(true);
        render();
        const slotEl = document.querySelector('.hot-slot[data-slot="belt:2"]');
        await drag(blockOf(p15), slotEl);
        row("pemmican 15 dragged from the bag onto the belt's pemmican 12: the slot filled to 20, 7 staying in the bag", belt[2] && belt[2].count === 20 && p15.count === 7 && bag.items.includes(p15), `slot ${belt[2] ? belt[2].count : "-"}, bag ${p15.count}`);
        const p10 = mk("pemmican", 10);
        put(p10);
        render();
        await drag(blockOf(p15), blockOf(p10));
        row("the bag's 7 dragged onto another stack of 10 in the bag: one stack of 17, the 7 gone", p10.count === 17 && !bag.items.includes(p15), `stack ${p10.count}, the 7 ${bag.items.includes(p15) ? `still ${p15.count}` : "gone"}`);
        const n = msg;
        await drag(document.querySelector('.hot-slot[data-slot="belt:2"] .inv-item') || slotEl, blockOf(p10));
        row("the belt's 20 dragged onto the bag's 17: the bag stack filled to 20, 17 staying on the belt", p10.count === 20 && belt[2] && belt[2].count === 17, `bag ${p10.count}, slot ${belt[2] ? belt[2].count : "-"}${n() ? `; "${n()}"` : ""}`);
        // A coated stack never merges: it swaps as any other thing does.
        bag.items.length = 0;
        belt[2] = null;
        me.hands.main = mk("throwing_knife", 5);
        const coated = mk("throwing_knife", 6, { poison: { tier: 1, hits: 4 } });
        put(coated);
        G.handlers.placeInSlot(coated, { kind: "bag", bag }, "hand:main");
        row("a coated stack of throwing knives dropped on a plain one in the hand never merges: it is held whole with its coat, the plain five back in the bag", me.hands.main === coated && coated.count === 6 && !!coated.poison && bag.items.some((e) => e.id === "throwing_knife" && e.count === 5 && !e.poison) && actions.STACK_FULL === "That stack is full.", `hand ${me.hands.main ? `${me.hands.main.count}${me.hands.main.poison ? " coated" : ""}` : "-"}; bag ${bag.items.map((e) => `${e.id}x${e.count}${e.poison ? " coated" : ""}`).join(", ")}`);
        me.hands.main = null;
        bag.items.length = 0;
        panel.setBagOpen(false);
      }
    }

    // ---- two tabs: the gifts for every other player, and the host asleep beside them ----
    if (opts.keep) {
      const others = G.game.state.players.filter((p) => p !== me);
      let bed = null;
      for (const pr of G.map.allProps()) if (G.assets.getDef(pr.sprite).sleep) { bed = pr; break; }
      const body = others.length ? lay(ox + 1, oy + 3) : null;
      if (body) { added.splice(added.indexOf(body), 1); keptBack.bodies.push(body); }
      const gBelt = mk("good_belt");
      G.inventory.ensureSlots(gBelt);
      gBelt.slots[0] = mk("sword");
      gBelt.slots[2] = mk("pemmican", 3);
      const gBelt2 = mk("good_belt"); // the second, for the guest's Take All; the first for its partial take
      G.inventory.ensureSlots(gBelt2);
      gBelt2.slots[0] = mk("knife");
      gBelt2.slots[2] = mk("bread");
      if (others.length) {
        G.map.dropItem(ox - 1, oy + 3, gBelt);
        keptBack.items.push([ox - 1, oy + 3, gBelt]);
        G.map.dropItem(ox + 1, oy + 4, gBelt2);
        keptBack.items.push([ox + 1, oy + 4, gBelt2]);
      }
      for (const p of others) {
        const b = G.inventory.bagOf(p);
        const bl = G.inventory.beltOf(p);
        keptBack.players.push({ id: p.id, bag: b ? b.items.slice() : null, belt: bl ? bl.slice() : null, hands: { main: p.hands.main, off: p.hands.off }, at: [p.gx, p.gy], tired: p.tired });
        if (!b) continue;
        b.items.length = 0;
        G.grid.insert(b, mk("bucket", 1, { fill: G.items.getItem("bucket").vessel.capacity, clean: true }));
        G.grid.insert(b, mk("waterskin", 1, { fill: 0 }));
        const p15 = mk("pemmican", 15);
        Object.assign(p15, G.grid.findSpot(b, "pemmican"));
        b.items.push(p15);
        if (bl) { bl.fill(null); bl[2] = mk("pemmican", 12); }
        p.hands.main = mk("torch", 1, { lit: true });
        p.hands.off = null;
        p.gx = ox;
        p.gy = oy + 3;
        p.auto = null;
      }
      if (bed && others.length) {
        keptBack.host = { tired: needs0.tired, at: at0 };
        me.tired = 5; // not rested: asleep until { stop: true }
        me.sleeping = { bed: bed.id, since: G.loop.simTime(), hour: G.clock.getHour() };
      }
      kept = others.length && body ? { players: others.map((p) => p.id), body: body.id, belt: { uid: gBelt.uid, tile: [ox - 1, oy + 3] }, belt2: { uid: gBelt2.uid, tile: [ox + 1, oy + 4] }, host: me.id } : null;
      row("kept for the guest: every other player with a clean bucket, an empty skin, a lit torch, pemmican on its belt and in its bag, beside a body and a belt on the ground, and me asleep; { stop: true } puts it back", !!kept && !!me.sleeping, kept ? JSON.stringify(kept) : "no other player");
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    document.getElementById("game")?.dispatchEvent(new PointerEvent("pointermove", { clientX: 2, clientY: 2, bubbles: true }));
    hoverCard.hide();
    if (use.isActive()) use.cancel();
    if (menu.isMenuOpen()) menu.closeContextMenu();
    panel.setBagOpen(bagOpen0);
    for (const z of added) for (const list of [G.zombies, G.corpses]) { const i = list.indexOf(z); if (i >= 0) list.splice(i, 1); }
    for (const p of props) if (G.map.propById(p.id)) G.map.removeProp(p);
    for (const [x, y, e] of dropped) if (G.map.itemsAt(x, y).includes(e)) G.map.takeItem(x, y, e);
    if (!opts.keep && me.sleeping) playerMod.wake(me);
    sleepFade.update(me);
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    if (bag0 && bag) bag.items.splice(0, bag.items.length, ...bag0);
    if (belt0 && G.inventory.beltOf(me)) G.inventory.beltOf(me).splice(0, belt0.length, ...belt0);
    me.hunger = needs0.hunger;
    me.thirst = needs0.thirst;
    me.hp = needs0.hp;
    if (!keptBack.host) me.tired = needs0.tired;
    G.rules.set(rules0);
    if (!opts.keep) G.teleport(at0[0], at0[1]);
    if (screen0) G.screens.show(screen0);
    else if (G.screens.currentScreen()) G.screens.hide();
    G.loop.setPaused(wasPaused);
  }
  return done(kept);
}
