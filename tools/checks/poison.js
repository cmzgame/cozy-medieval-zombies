// Poisons, step 3 (docs/47 section 6 and section 9's poison lines, #482). From the console, on a tab with `?nosave&mute` (the valley):
//   await __game.check("poison")
// On open ground with its own dead: the new items' cards read over the bag on the page (the poison and the strong poison saying Use once,
// from the rows, never drunk, what a coat and its arrows do; the two poisoned arrows; a coated sword's "Poisoned: 10 hits left."), each with
// its icon; the Use mode on the page (use.begin, use.apply) coating the sword in hand, the vial back; a strong poison on arrows in the bag
// making five of a stack of eight; a poison on a fire arrow and a poisoned arrow on a fire "Nothing interesting happens." in the log; a
// swing striking two of the dead spending one hit and poisoning both; the ticks a second as red floating numbers over the poisoned one on
// the page; its tint green and pulsing, deeper with three stacks and darker for the strong tier (render/entities.js `bodyTint`, from the
// record); a strong hit lifting it and an ordinary one keeping it strong; the bow's draw and release taking a strongly poisoned arrow before
// a poisoned one and a plain one, its hit poisoning and lodging a plain arrow; a coated spear's landing hit spending one of its coat, which
// lodges with it; burning beside poison, each its own; never a player. Everything it touched is put back in its finally.
//
// Two tabs (`?nosave&mute&relay=none`): on the host `await __game.check("poison", { keep: true })` runs the rows above and then gives every
// other player a sword in its main hand, a poison, a strong poison, and eight arrows in its bag, and stands one of the dead (calm, standing
// still, 150 health) 0.9 tiles east of each, and returns `kept`; with the host's tab left running, on the guest
// `await __game.check("poison", { guest: <kept> })` coats its sword by its own Use (the Use mode's command to the host, by uid), sees the
// coat on its replica and its card, makes five strongly poisoned arrows the same way, swings at the dead one through its snapshot's click
// and sees the coat spend one hit and the body's record poisoned, draws its tint from the replica's record, and reads the ticks arrive as
// floating numbers over it; then `await __game.check("sync")` on the host, and `await __game.check("poison", { stop: true })` there puts the
// other players' hands, bags, health, places, and stamina back, takes the dead it stood there away, and puts Zombie aggro back as it was (off while kept, so the dead stay calm).

const keptBack = []; // the other players as `{ keep: true }` found them (the module is cached by the page)
const keptDead = [];
let keptRules = null;

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const done = (extra = {}) => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, fails: rows.filter((r) => r.result === "FAIL").length, ...extra };
  };
  const S = G.game.state;
  const takeAway = (z) => {
    for (const list of [S.zombies, S.corpses]) { const i = list.indexOf(z); if (i >= 0) list.splice(i, 1); }
  };
  if (opts.stop) {
    const put = [];
    for (const k of keptBack.splice(0)) {
      const p = S.players.find((q) => q.id === k.id);
      if (!p) continue;
      p.hands.main = k.main;
      p.hands.off = k.off;
      const b = G.inventory.bagOf(p);
      if (b && k.bag) b.items.splice(0, b.items.length, ...k.bag);
      Object.assign(p, { hp: k.hp, gx: k.gx, gy: k.gy, auto: k.auto, stamina: k.stamina, winded: k.winded }); // where it stood and the bar its swing spent, as mana.js puts them back
      put.push(p.id);
    }
    for (const z of keptDead.splice(0)) takeAway(z);
    if (keptRules) { G.rules.set(keptRules); keptRules = null; }
    row("the other players' hands, bags, health, places, walks, and stamina put back as { keep: true } found them, the dead it stood there taken away, the rules back (Zombie aggro, off while kept)", true, put.join(", ") || "nobody kept");
    return done();
  }
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const inv = G.inventory;
  const info = await import("/src/item-info.js");
  const poison = await import("/src/poison.js");
  const archery = await import("/src/archery.js");
  const use = await import("/src/use.js");
  const interactions = await import("/src/interactions.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const card = await import("/src/ui/hover-card.js");
  const floatUi = await import("/src/ui/floaters.js");
  const { bodyTint } = await import("/src/render/entities.js");
  const { createZombie } = await import("/src/entities/zombie.js");
  const { hoverCard: HC } = await import("/src/tuning.js");
  const P = poison.POISON;
  const me = G.player;
  const mk = (id, n = 1, props = {}) => G.items.makeEntry(id, n, props);
  const at = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
  const hoverText = async (el) => {
    card.hide();
    if (el) el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, ...at(el) }));
    await wait(HC.delayMs + 80);
    const c = document.getElementById("hover-card");
    return c && !c.hidden ? c.textContent.replace(/\s+/g, " ").trim() : "(no card)";
  };
  const lastLog = () => { const ls = document.querySelectorAll("#log .log-line"); return ls.length ? ls[ls.length - 1].textContent.trim() : ""; };
  const green = (c) => !!c && c[1] > c[0] + 0.05 && c[1] > c[2] + 0.05;
  const tintAt = (z, t) => poison.tintOf(z.poison, t);
  const tintRange = (z) => { let lo = 1; let hi = 0; for (let t = 0; t < 4; t += 0.05) { const c = tintAt(z, t); if (c) { lo = Math.min(lo, c[0]); hi = Math.max(hi, c[0]); } } return [lo, hi]; };
  const chars = () => [...S.players, ...S.zombies, ...S.villagers, ...S.corpses, ...S.animals];
  const tickTexts = (id) => floatUi.shown().filter((n) => n.id === id && n.kind === 0).map((n) => n.text);
  const floaters0 = G.settings.get("floaters"); // shared with Michael's browser: on for the reading, put back in the finally

  // ---- a guest's side ----
  if (opts.guest) {
    const wasPaused = G.loop.isPaused();
    const screenG = G.screens.currentScreen(); // a screen up sends an idle snapshot, whatever a check says (net.js): hidden, shown again in the finally
    if (screenG) G.screens.hide();
    G.loop.setPaused(true);
    const pump = async (until, ms = 15000, each = null) => {
      const t0 = performance.now();
      let last = t0;
      while (!until() && performance.now() - t0 < ms) {
        await yieldOnce();
        if (performance.now() - last >= 1000 / 60) { last = performance.now(); G.loop.advance(1 / 60); if (each) each(); }
      }
      return Math.round(performance.now() - t0);
    };
    const bag = () => inv.bagOf(me);
    const inBag = (id) => (bag() ? bag().items.filter((e) => e.id === id) : []);
    const kept = opts.guest === true ? {} : opts.guest;
    const myDead = () => S.zombies.find((z) => (kept.dead && kept.dead[me.id] ? z.id === kept.dead[me.id] : Math.hypot(z.gx - me.gx, z.gy - me.gy) < 1.5));
    try {
      G.settings.set("floaters", true);
      const arrived = () => me.hands.main && me.hands.main.id === "sword" && inBag("poison").length && inBag("strong_poison").length && inBag("arrow").length && !!myDead();
      const ms0 = await pump(arrived, 20000);
      row("on the guest my replica holds the host's kit (a sword in my main hand, a poison, a strong poison, and arrows in my bag) and one of the dead stands beside me", !!arrived(), `${me.hands.main ? me.hands.main.id : "-"}; bag ${bag() ? bag().items.map((e) => `${e.id}x${e.count}`).join(",") : "-"}; dead ${myDead() ? myDead().id : "none"}; ${ms0} ms`);
      // My own Use: the Use mode picks the poison in my bag, the click lands on my sword's slot; on a guest the pair goes to the host by uid.
      const sword = () => me.hands.main;
      use.begin(inBag("poison")[0], { kind: "bag", bag: bag() });
      use.apply({ kind: "item", entry: sword(), slot: "hand:main" }, me);
      const ms1 = await pump(() => !!(sword() && sword().poison && sword().poison.hits === P.hits), 8000);
      const sc = sword() ? info.textOf(info.cardFor(sword())) : [];
      row("my Use of the poison on my sword (its command by uid) coats it on the host: the coat on my replica's entry, its card \"Poisoned: 10 hits left.\", the vial back in my bag", !!(sword() && sword().poison && sword().poison.tier === 1) && sc.includes(`Poisoned: ${P.hits} hits left.`) && !inBag("poison").length && inBag("clay_vial").length === 1, `${JSON.stringify(sword() && sword().poison)}; ${sc.join(" | ")}; ${ms1} ms`);
      use.begin(inBag("strong_poison")[0], { kind: "bag", bag: bag() });
      use.apply({ kind: "item", entry: inBag("arrow")[0], bag: bag() }, me);
      const ms2 = await pump(() => inBag("strong_poison_arrow").reduce((n, e) => n + e.count, 0) === P.arrows, 8000);
      row("my Use of the strong poison on my eight arrows makes five strongly poisoned arrows on the host, which reach my bag, three plain ones kept", inBag("strong_poison_arrow").reduce((n, e) => n + e.count, 0) === P.arrows && inBag("arrow").reduce((n, e) => n + e.count, 0) === 3, `bag ${bag().items.map((e) => `${e.id}x${e.count}`).join(",")}; ${ms2} ms`);
      // My swing, by my snapshot's click aimed at the dead one: the host's blow lands, the coat spends one, the body's record carries the poison.
      const z = myDead();
      const dx = z.gx - me.gx;
      const dy = z.gy - me.gy;
      const aim = { x: (dx - dy) * 32, y: (dx + dy) * 16 };
      me.stamina = me.maxStamina;
      G.net.setTestSnapshot({ axis: { x: 0, y: 0 }, clicked: true, leftDown: true, aim });
      G.loop.advance(1 / 60);
      G.net.setTestSnapshot({ axis: { x: 0, y: 0 }, aim });
      const ms3 = await pump(() => { const q = myDead(); return !!(q && q.poison) && sword() && sword().poison && sword().poison.hits === P.hits - 1; }, 8000);
      G.net.setTestSnapshot(null);
      const zq = myDead();
      row("my click swings on the host: the dead one's record on my replica poisoned (tier 1, a stack) and my sword's coat one hit fewer", !!(zq && zq.poison && zq.poison.tier === 1 && zq.poison.stacks >= 1) && sword().poison.hits === P.hits - 1, `${zq ? JSON.stringify(zq.poison) : "no body"}; coat ${JSON.stringify(sword() && sword().poison)}; ${ms3} ms`);
      // The tint, drawn by my client from the replica's record (render/entities.js bodyTint), and the ticks arriving as floating numbers over it.
      const tint = zq ? bodyTint(zq) : null;
      row("my client draws it green from the record (bodyTint over the replica's poison)", green(tint), JSON.stringify(tint));
      // A tick is the drain at its stacks (-1 at one ordinary stack), never the swing's own number, which arrived first.
      const tick = `-${poison.dpsOf(zq.poison)}`;
      const seen = new Set();
      const hp0 = zq.hp;
      const ms4 = await pump(() => seen.has(tick) && hp0 - myDead().hp >= 2, 6000, () => { floatUi.update(1 / 60, chars(), null, me); for (const t of tickTexts(zq.id)) seen.add(t); });
      row("the ticks reach me in the frames and are drawn as red numbers over it (its health in my replica falling a point a second)", seen.has(tick) && hp0 - myDead().hp >= 2, `drawn ${[...seen].join(" ")}; hp ${hp0} to ${myDead().hp}; ${ms4} ms`);
      row("my frames' weight read from net.status().wire", true, JSON.stringify(G.net.status().wire));
    } catch (e) {
      rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
    } finally {
      use.cancel();
      floatUi.clear();
      G.settings.set("floaters", floaters0);
      G.net.setTestSnapshot(null);
      if (screenG) G.screens.show(screenG);
      G.loop.setPaused(wasPaused);
    }
    return done();
  }

  // ---- the host's own (or a world of one's own) ----
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  const rules0 = { zombieAggro: G.rules.rules.zombieAggro, multiHit: G.rules.rules.multiHit };
  const bag = inv.bagOf(me);
  const save0 = { bag: bag ? bag.items.slice() : null, belt: inv.beltOf(me) ? inv.beltOf(me).slice() : null, main: me.hands.main, off: me.hands.off, hp: me.hp, stamina: me.stamina, gx: me.gx, gy: me.gy, aim: { ...me.aim }, hunger: me.hunger, thirst: me.thirst, tired: me.tired, clock: G.clock.getElapsed() };
  const bagOpen0 = panel.isBagOpen();
  const added = [];
  let kept = null;
  G.loop.setPaused(true);
  if (screen0) G.screens.hide();
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const render = () => panel.renderInventoryPanel(me, inv.bagOf(me), null, inv.beltOf(me));
  const intoBag = (e) => { G.grid.insert(bag, e); return bag.items.find((q) => q.uid === e.uid) || bag.items.filter((q) => q.id === e.id).pop(); };
  const blockOf = (e) => { const i = bag.items.indexOf(e); return i < 0 ? null : document.querySelector(`.inv-item[data-bag="inv"][data-index="${i}"]`); };
  const bring = (dx, dy = 0) => {
    const z = createZombie(me.gx + dx, me.gy + dy);
    z.target = null;
    z.idleTimer = 1e9; // it stands where it is put
    S.zombies.push(z);
    added.push(z);
    return z;
  };
  const face = (z) => {
    const s = G.iso.toScreen(z.gx, z.gy);
    const o = G.iso.toScreen(me.gx, me.gy);
    const n = G.iso.normalize(s.x - o.x, s.y - o.y - 0.001);
    me.aim.sx = n.x;
    me.aim.sy = n.y;
  };
  const flyOut = () => { for (let i = 0; i < 600 && archery.arrowsInFlight().length; i++) step(); };
  const count = (id) => inv.countAll(me, id);
  try {
    if (!bag) throw new Error("no bag on the back");
    G.rules.set({ zombieAggro: false, multiHit: true });
    G.settings.set("floaters", true);
    const open = G.map.nearestWalkable(Math.round(me.gx) + 4, Math.round(me.gy), (x, y) => {
      for (let dx = -1; dx <= 8; dx++) for (let dy = -2; dy <= 2; dy++) { const t = G.map.peekTile(x + dx, y + dy); if (!t || G.map.roomAt(x + dx, y + dy) !== 0 || t.prop || !G.map.isWalkableTile(x + dx, y + dy)) return true; }
      return false;
    });
    G.teleport(open[0], open[1]);
    me.hunger = me.maxHunger;
    me.thirst = me.maxThirst;
    bag.items.length = 0;
    const belt = inv.beltOf(me);
    if (belt) belt.fill(null);
    me.hands.main = null;
    me.hands.off = null;
    step();

    // ---- the cards, read over the bag on the page ----
    const NEW = ["poison", "strong_poison", "poison_arrow", "strong_poison_arrow"];
    for (const v of NEW) intoBag(mk(v, v.endsWith("arrow") ? 5 : 1));
    const coated = intoBag(mk("knife", 1, { poison: { tier: 1, hits: P.hits } }));
    panel.setBagOpen(true);
    render();
    const want = {
      poison: ["Poison", "Ordinary poison: never drunk.", "Use on a blade or arrows: coat.", poison.effectWords(1), `A vial coats a blade for ${P.hits} landed hits, or ${P.arrows} arrows`],
      strong_poison: ["Strong poison", "Strong poison: never drunk.", "Use on a blade or arrows: coat.", poison.effectWords(2)],
      poison_arrow: ["Poisoned arrow", "Ammunition", poison.effectWords(1), "Made from arrows: Use poison on them (coat)."],
      strong_poison_arrow: ["Strongly poisoned arrow", "Ammunition", poison.effectWords(2), "Made from arrows: Use strong poison on them (coat)."],
    };
    const read = [];
    const wrong = [];
    for (const v of NEW) {
      const e = bag.items.find((q) => q.id === v);
      const el = e && blockOf(e);
      const text = el ? await hoverText(el) : "(not in the bag)";
      read.push(`${v}: ${text}`);
      const uses = (text.match(/Use on /g) || []).length;
      if (!want[v].every((w) => text.includes(w)) || (v.endsWith("poison") && uses !== 1)) wrong.push(`${v}: "${text}"`);
    }
    const kText = blockOf(coated) ? await hoverText(blockOf(coated)) : "(no dirk)";
    card.hide();
    row("over the bag the poisons' cards say Use once (the rows' line), never drunk, what a coat and a vial's arrows do; the poisoned arrows say what they poison and how they are made", wrong.length === 0, wrong.length ? wrong.join(" || ") : read.join(" || "));
    row("a coated dirk's card on the page says \"Poisoned: 10 hits left.\"", kText.includes(`Poisoned: ${P.hits} hits left.`), kText);
    G.grid.remove(bag, coated);

    // ---- the Use mode on the page: a poison on the sword in hand, a strong poison on arrows in the bag, and the two that do nothing ----
    bag.items.length = 0;
    const sword = mk("sword");
    me.hands.main = sword;
    const vial = intoBag(mk("poison", 2));
    use.begin(vial, { kind: "bag", bag });
    use.apply({ kind: "item", entry: sword, slot: "hand:main" }, me);
    row("Use poison on the sword in hand coats it (tier 1, ten hits), one vial spent and the clay vial back, its line in the log", !!(sword.poison && sword.poison.tier === 1 && sword.poison.hits === P.hits) && vial.count === 1 && count("clay_vial") === 1 && lastLog() === "You coat the arming sword with poison.", `${JSON.stringify(sword.poison)}; vials ${vial.count}, clay ${count("clay_vial")}; "${lastLog()}"`);
    const fa = intoBag(mk("fire_arrow", 3));
    use.begin(vial, { kind: "bag", bag });
    use.apply({ kind: "item", entry: fa, bag }, me);
    const said1 = lastLog();
    const fire = [...G.map.fires()].find((f) => f.fire && f.fire.burns);
    const pa = intoBag(mk("poison_arrow", 2));
    use.begin(pa, { kind: "bag", bag });
    use.apply({ kind: "prop", prop: fire }, me);
    const said2 = lastLog();
    row("a poison on a fire arrow, and a poisoned arrow on a fire: \"Nothing interesting happens.\", nothing spent or changed", said1 === interactions.NOTHING && said2 === interactions.NOTHING && vial.count === 1 && fa.id === "fire_arrow" && pa.id === "poison_arrow", `"${said1}" / "${said2}"`);
    G.grid.remove(bag, fa);
    G.grid.remove(bag, pa);
    const arrows = intoBag(mk("arrow", 8));
    const sv = intoBag(mk("strong_poison", 1));
    use.begin(sv, { kind: "bag", bag });
    use.apply({ kind: "item", entry: arrows, bag }, me);
    row("Use strong poison on eight arrows: five strongly poisoned arrows, three plain ones kept, the vial back", count("strong_poison_arrow") === P.arrows && count("arrow") === 3 && count("strong_poison") === 0 && count("clay_vial") === 2 && lastLog() === "You coat 5 arrows with strong poison.", `${count("strong_poison_arrow")} strong, ${count("arrow")} plain, clay ${count("clay_vial")}; "${lastLog()}"`);
    use.cancel();

    // ---- a swing: two of the dead struck, one hit spent, both poisoned; the ticks as numbers; the tint ----
    const z1 = bring(0.9, 0);
    const z2 = bring(0.9, 0.35);
    z1.hp = 150;
    z2.hp = 150;
    face(z1);
    me.stamina = me.maxStamina;
    me.attackCooldown = 0;
    const hit = G.combat.tryAttack(me, S.zombies, "main");
    row("a swing striking two of the dead spends one hit of the coat and poisons both", !!hit && hit.length === 2 && !!z1.poison && !!z2.poison && sword.poison.hits === P.hits - 1, `struck ${hit ? hit.length : 0}; ${JSON.stringify(z1.poison)}, ${JSON.stringify(z2.poison)}; ${sword.poison && sword.poison.hits} hits left`);
    floatUi.clear();
    const seen = new Set();
    const hp1 = z1.hp;
    for (let i = 0; i < 60 * 3 + 2; i++) { step(); floatUi.update(1 / 60, chars(), null, me); for (const t of tickTexts(z1.id)) seen.add(t); }
    row("its ticks, a second apart, are red floating numbers over it on the page (-1 at one stack), three seconds three points", Math.abs(hp1 - z1.hp - 3) < 1e-6 && seen.has("-1"), `lost ${(hp1 - z1.hp).toFixed(2)}; drawn ${[...seen].join(" ")}`);
    floatUi.clear();
    const t1 = bodyTint(z1);
    const [lo1, hi1] = tintRange(z1);
    poison.apply(z1, 1);
    poison.apply(z1, 1);
    const [lo3] = tintRange(z1);
    row("the poisoned body is drawn green (render/entities.js bodyTint, from its record), pulsing, deeper at three stacks", green(t1) && hi1 - lo1 > 0.02 && lo3 < lo1 - 0.05 && z1.poison.stacks === 3, `tint ${JSON.stringify(t1 && t1.map((v) => +v.toFixed(2)))}; red ${lo1.toFixed(2)} to ${hi1.toFixed(2)} at one stack, down to ${lo3.toFixed(2)} at three`);
    poison.apply(z1, 2);
    const strongTint = tintRange(z1)[0];
    poison.apply(z1, 1);
    row("a strong hit lifts it to strong (a darker green), an ordinary hit after keeps it strong", z1.poison.tier === 2 && z1.poison.stacks === 3 && strongTint < lo3, `${JSON.stringify(z1.poison)}; red down to ${strongTint.toFixed(2)}`);
    G.burn.ignite(z2);
    step(60);
    row("burning stands beside poison, each its own", z2.burning && !!z2.poison, `burning ${z2.burning}; ${JSON.stringify(z2.poison)}`);
    z2.burning = false;
    row("a player is never poisoned", poison.apply(me, 2) === false && !me.poison, "apply(player) refused");
    takeAway(z1);
    takeAway(z2);

    // ---- the bow: a strongly poisoned arrow before a poisoned one and a plain one; its hit poisons and lodges a plain arrow ----
    me.hands.main = mk("bow");
    me.hands.off = me.hands.main;
    intoBag(mk("poison_arrow", 2));
    const L = archery.launcherOf(me);
    row("the bow draws strongly poisoned arrows before poisoned and plain ones (no fire arrows carried)", L && L.ammo === "strong_poison_arrow" && L.poison === 2, L ? `${L.ammo}, tier ${L.poison}` : "no launcher");
    const z3 = bring(6, 0);
    z3.hp = 150;
    const before = count("strong_poison_arrow");
    archery.setAimOverride(me, [z3.gx, z3.gy]);
    archery.beginDraw(me, archery.launcherOf(me), "script");
    me.draw.t = 99;
    me.draw.c = 1;
    const shot = archery.releaseDraw(me, { mouse: { x: 0, y: 0 } });
    archery.setAimOverride(me, null);
    flyOut();
    row("its release spends a strongly poisoned arrow, which flies as one, poisons what it hits (strong), and lodges a plain arrow", !!shot && shot.projectile === "strong_poison_arrow" && count("strong_poison_arrow") === before - 1 && z3.poison && z3.poison.tier === 2 && (z3.lodged || {}).arrow === 1 && !(z3.lodged || {}).strong_poison_arrow, shot ? `${shot.projectile}; ${before} to ${count("strong_poison_arrow")}; ${JSON.stringify(z3.poison)}; lodged ${JSON.stringify(z3.lodged || {})}` : "no shot");
    let sheetOk = false;
    try { sheetOk = !!G.assets.getSheet("poison_arrow").frames.poison_arrow_4 && !!G.assets.getSheet("strong_poison_arrow").frames.strong_poison_arrow_4; } catch { sheetOk = false; }
    row("both poisoned arrows have their flight's picture (sixteen angles, the green head)", sheetOk, String(sheetOk));
    takeAway(z3);
    // ---- a coated spear's landing hit spends one of its coat, which lodges with it ----
    me.hands.main = null;
    me.hands.off = null;
    const z4 = bring(5, 0);
    z4.hp = 150;
    const spear = mk("spear", 1, { poison: { tier: 1, hits: 4 } });
    archery.shoot(me, [1, 0], 5, 1, { damage: 1, projectile: "spear", item: { ...spear } });
    flyOut();
    const lodged = (z4.lodgedItems || []).find((e) => e.uid === spear.uid);
    row("a thrown spear's landing hit poisons the body and spends one of its coat, the rest lodged with it", !!z4.poison && !!lodged && lodged.poison && lodged.poison.hits === 3, `${JSON.stringify(z4.poison)}; lodged ${JSON.stringify(lodged && lodged.poison)}`);
    takeAway(z4);

    // ---- two tabs: every other player kitted beside one of the dead ----
    if (opts.keep) {
      const others = S.players.filter((p) => p !== me);
      const dead = {};
      for (const p of others) {
        const b = inv.bagOf(p);
        keptBack.push({ id: p.id, main: p.hands.main, off: p.hands.off, bag: b ? b.items.slice() : null, hp: p.hp, gx: p.gx, gy: p.gy, auto: p.auto, stamina: p.stamina, winded: p.winded });
        p.hands.main = mk("sword");
        p.hands.off = null;
        if (b) { b.items.length = 0; for (const [v, n] of [["poison", 1], ["strong_poison", 1], ["arrow", 8]]) G.grid.add(b, v, n); }
        p.gx = me.gx;
        p.gy = me.gy + 2;
        p.auto = null;
        p.hp = p.maxHp;
        const z = createZombie(p.gx + 0.9, p.gy);
        z.target = null;
        z.idleTimer = 1e9;
        z.hp = 150;
        S.zombies.push(z);
        keptDead.push(z);
        dead[p.id] = z.id;
      }
      keptRules = { zombieAggro: rules0.zombieAggro, multiHit: rules0.multiHit };
      kept = others.length ? { players: others.map((p) => p.id), dead } : null;
      row("kept for the guest: every other player with a sword in hand, a poison, a strong poison, and eight arrows in its bag, one of the dead standing 0.9 tiles east of it, the dead kept calm (Zombie aggro off until `{ stop: true }`); `{ stop: true }` puts them back", !!kept, kept ? JSON.stringify(kept) : "no other player");
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    for (const h of document.querySelectorAll("#hotbar, #inventory")) h.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false })); // no card left resting under a pointer
    card.hide();
    use.cancel();
    floatUi.clear();
    G.settings.set("floaters", floaters0);
    archery.setAimOverride(me, null);
    if (me.draw) archery.cancelDraw(me);
    for (const z of added) takeAway(z);
    if (!kept) G.rules.set(rules0);
    else G.rules.set({ multiHit: rules0.multiHit }); // the dead stay calm for the guest until { stop: true }
    if (save0.bag && inv.bagOf(me)) inv.bagOf(me).items.splice(0, inv.bagOf(me).items.length, ...save0.bag);
    const b = inv.beltOf(me);
    if (b && save0.belt) b.splice(0, b.length, ...save0.belt);
    me.hands.main = save0.main;
    me.hands.off = save0.off;
    Object.assign(me, { hp: save0.hp, stamina: save0.stamina, hunger: save0.hunger, thirst: save0.thirst, tired: save0.tired });
    delete me.poison;
    G.clock.setElapsed(save0.clock);
    G.teleport(save0.gx, save0.gy);
    me.aim = save0.aim;
    panel.setBagOpen(bagOpen0);
    render();
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  return done(kept ? { kept } : {});
}
