// Potions, step 2 (docs/47 sections 2 to 4, 8 and 9, #481): the vials, the cauldron, and drinking. From the console, on a tab with
// `?nosave&mute` (the valley):
//   await __game.check("potions")
// The art (art round 5, 2026-10-26): each vial item a drawn pair, 19 by 19, lying on the floor as its picture (`lying_<id>`), the colour on
// the wax seal and the glazed band (healing red, stamina gold, mana blue, poison green, strong poison a darker green with a black seal), the
// potions and poisons with a belt portrait, the empty vial and the unfired one bare; over the bag each new item's icon and its hover
// card read on the page. The witch's cauldron on the lane to the mere: its menu (Use the cauldron, the oven's Light, no Pick up, no Boil),
// its panel (titled Cauldron, the five brews, the clean water among the ingredients), lit by its menu, a brew made by the panel's own Make
// with a clean skin carried, twenty seconds of the lit fire, the potion in its output. Drinking by the real keys (the belt order Sequential):
// key 1 a healing potion, its vial back in the slot; key 3 within ten seconds refused with its line; a double-click in the bag a stamina
// potion, the bar full and the buff in the row framed in gold with its card; key 2 a poison's line. Your own cauldron: the Cauldron item's
// Place, set down, its menu's Pick up, back in the bag. Everything it touched is put back in its finally.
//
// Two tabs (`?nosave&mute&relay=none`): on the host `await __game.check("potions", { keep: true })` runs the rows above and then stands every
// other player by the witch's cauldron, lit with three logs, with a healing potion in its first belt slot and a poison in its third, a stamina
// potion, two yarrow, a sage, a clay vial, and a clean skin in its bag, health 50 and stamina 10, the dead calm, and returns `kept`; with the
// host's tab left running, on the guest `await __game.check("potions", { guest: <kept> })` reads its replica (the potions, the cauldron lit),
// sends its main-hand slot's key by role in its snapshot and sees the health and the vial come back, sends key 3's within ten seconds and sees
// the host's refusal reach it, double-clicks the stamina potion in its bag (a `dbl` command) and sees its bar full and the buff in its own
// row in gold, opens its own panel on the replica and presses Make (the panel's command) and sees the healing potion in the cauldron's
// output on its replica twenty seconds later; then `await __game.check("sync")` on the host, and `await __game.check("potions", { stop: true })`
// there puts the other players' belts, bags, health, and the dead back.

const keptBack = []; // the other players as `{ keep: true }` found them (the module is cached by the page)
let keptRules = null;

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const done = (extra = {}) => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, fails: rows.filter((r) => r.result === "FAIL").length, ...extra };
  };
  if (opts.stop) {
    const put = [];
    for (const k of keptBack.splice(0)) {
      const p = G.game.state.players.find((q) => q.id === k.id);
      if (!p) continue;
      p.worn.waist = k.waist;
      const b = G.inventory.bagOf(p);
      if (b && k.bag) b.items.splice(0, b.items.length, ...k.bag);
      Object.assign(p, { hp: k.hp, stamina: k.stamina, potionAt: k.potionAt, buffs: k.buffs });
      put.push(p.id);
    }
    if (keptRules) { G.rules.set(keptRules); keptRules = null; }
    row("the other players' belts, bags, health, stamina, and potion stamps put back as { keep: true } found them, and the dead's aggro", true, put.join(", ") || "nobody kept");
    return done();
  }
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const inv = G.inventory;
  const info = await import("/src/item-info.js");
  const art = await import("/src/gather-art.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const card = await import("/src/ui/hover-card.js");
  const potions = await import("/src/potions.js");
  const debuffRow = await import("/src/ui/debuff-row.js");
  const stationPanel = await import("/src/ui/station-panel.js");
  const setdown = await import("/src/setdown.js");
  const { hoverCard: HC, potions: P } = await import("/src/tuning.js");
  const me = G.player;
  const mk = (id, n = 1, props = {}) => G.items.makeEntry(id, n, props);
  const id = (e) => (e ? e.id : "-");
  const msgEl = () => document.getElementById("message");
  const message = () => ((msgEl() || {}).textContent || "").trim();
  const clearMessage = () => { const m = msgEl(); if (m) { m.textContent = ""; m.hidden = true; } };
  const at = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
  const hoverText = async (el) => {
    card.hide();
    if (el) el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, ...at(el) }));
    await wait(HC.delayMs + 80);
    const c = document.getElementById("hover-card");
    return c && !c.hidden ? c.textContent.replace(/\s+/g, " ").trim() : "(no card)";
  };
  const VIALS = ["unfired_vial", "clay_vial", "healing_potion", "stamina_potion", "mana_potion", "poison", "strong_poison"];
  const NEW = [...VIALS, "cauldron"];

  // ---- a guest's side ----
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
      const belt = () => inv.beltOf(me) || [];
      const bag = () => inv.bagOf(me);
      // The host's keep reaches my replica in its frames: stepped until they are in.
      const arrived = () => { const w = G.map.propById(opts.guest.witch || "cauldron_witch"); return id(belt()[0]) === "healing_potion" && id(belt()[2]) === "poison" && !!w && w.fire.lit; };
      await pump(arrived, 20000);
      const witch = G.map.propById(opts.guest.witch || "cauldron_witch");
      row("on the guest my replica holds the host's potions (a healing potion in slot 1, a poison in slot 3, a stamina potion in my bag) and the witch's cauldron lit beside me", id(belt()[0]) === "healing_potion" && id(belt()[2]) === "poison" && !!bag() && bag().items.some((e) => e.id === "stamina_potion") && !!witch && witch.fire.lit, `${belt().map(id).join(" ")}; cauldron ${witch ? (witch.fire.lit ? "lit" : "out") : "none"}`);
      // The main-hand slot's key, by its role in my snapshot: the host drinks it for my player; the health and the vial come back.
      const hp0 = me.hp;
      tap("beltMain1");
      const ms1 = await pump(() => id(belt()[0]) === "clay_vial" && me.hp > hp0, 8000);
      row("my main-hand slot's key (beltMain1) drinks the healing potion on the host: my health up by its number, the clay vial back in the slot on my replica", id(belt()[0]) === "clay_vial" && Math.round(me.hp - hp0) === P.heal, `hp ${hp0} to ${me.hp}; slot 1 ${id(belt()[0])}; ${ms1} ms`);
      if (id(belt()[0]) === "healing_potion") {
        // The slot's menu, the other way a guest drinks from the belt (an item command by the slot's id), so the rows after it still stand.
        const hp1 = me.hp;
        G.net.sendItem({ op: "menu", label: "Drink", src: { kind: "slot", id: "belt:0" } });
        const ms1b = await pump(() => id(belt()[0]) === "clay_vial", 5000);
        row("my slot's menu Drink (a menu command by the slot) drinks it on the host: health up, the vial back in the slot", id(belt()[0]) === "clay_vial" && Math.round(me.hp - hp1) === P.heal, `hp ${hp1} to ${me.hp}; ${ms1b} ms`);
      }
      row("my record carries the potion's stamp (potionAt) from the host", Number.isFinite(me.potionAt), String(me.potionAt));
      // The utility slot's poison: its line reaches me; the vial stays a poison.
      clearMessage();
      tap("beltUtility");
      await pump(() => /Poison isn't for drinking/.test(message()), 5000);
      if (message() !== potions.POISON_WORD) {
        // The same line by a double-click on the slot, read off my replica (inventory-actions' useSlot, the key's own answer), never sent.
        clearMessage();
        (await import("/src/ui/inventory-actions.js")).createRemoteInventoryActions(() => me, () => null, (c) => G.net.sendItem(c)).useSlot("belt:2");
      }
      row("my utility slot's key with a poison there: the host's line reaches me and nothing is drunk", message() === potions.POISON_WORD && id(belt()[2]) === "poison", `"${message()}"`);
      // The stamina potion by a double-click in my bag, within ten seconds: refused with the host's line; then after them, drunk.
      const sp = bag().items.find((e) => e.id === "stamina_potion");
      clearMessage();
      G.net.sendItem({ op: "dbl", uid: sp.uid, src: { kind: "bag", bag: { mine: true } } });
      await pump(() => message() === potions.TOO_SOON, 5000);
      row("my double-click on the stamina potion within ten seconds: the host refuses with its line, which reaches me", message() === potions.TOO_SOON && bag().items.some((e) => e.uid === sp.uid), `"${message()}"`);
      await pump(() => false, (P.between - 1) * 1000);
      // A sprint out and back first (my snapshot, the host's step), so the bar the potion fills was not full already.
      const sprint = async (x) => { G.net.setTestSnapshot({ axis: { x, y: 0 }, sprint: true }); await pump(() => false, 1000); };
      await sprint(1);
      await sprint(-1);
      G.net.setTestSnapshot(null);
      await pump(() => false, 300);
      const st0 = me.stamina;
      G.net.sendItem({ op: "dbl", uid: sp.uid, src: { kind: "bag", bag: { mine: true } } });
      const ms2 = await pump(() => !!(me.buffs && me.buffs.stamina), 5000);
      debuffRow.updateDebuffs(me);
      const el = document.querySelector('#debuffs .debuff.buff[data-id="stamina"]');
      const border = el ? getComputedStyle(el.querySelector(".db-box")).borderTopColor : "";
      row("after ten seconds it is drunk on the host: my bar (drained by a sprint) full, the buff on my record, in my row framed in gold", !bag().items.some((e) => e.uid === sp.uid) && st0 < me.maxStamina - 5 && me.stamina >= me.maxStamina - 0.5 &&!!(me.buffs && me.buffs.stamina) && !!el && border === "rgb(232, 200, 96)", `stamina ${st0} to ${me.stamina}; buffs ${JSON.stringify(me.buffs)}; row ${el ? border : "none"}; ${ms2} ms`);
      // A brew from my own panel on the replica: its Make is the panel's command to the host.
      if (witch) {
        stationPanel.openPanel(witch, me);
        const root = document.getElementById("station");
        const title = root ? (root.querySelector(".inv-title") || {}).textContent : "";
        const rowsN = root ? root.querySelectorAll(".st-row").length : 0;
        const water = root ? /clean water/.test(root.textContent) : false;
        row("my panel on the replica: Cauldron, the five brews, clean water among the ingredients", title === "Cauldron" && rowsN === 5 && water, `${title}; ${rowsN} rows; water ${water}`);
        const make = root && root.querySelector("[data-make]");
        if (make) make.click();
        // A frame's chunk installs the prop anew on my replica, so it is found again by its id each look.
        const now = () => G.map.propById(witch.id);
        const brewed = () => { const w = now(); return !!(w && w.output && w.output.items.some((e) => e.id === "healing_potion")); };
        const ms3 = await pump(brewed, 40000);
        const w2 = now();
        row("its Make goes to the host, the brew runs twenty seconds over the lit fire, and the healing potion is in the output on my replica", brewed() && !bag().items.some((e) => e.id === "yarrow"), `output ${w2 && w2.output ? w2.output.items.map(id).join(",") : "none"}; ${ms3} ms`);
        stationPanel.close();
      }
    } catch (e) {
      rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
    } finally {
      G.net.setTestSnapshot(null);
      G.loop.setPaused(wasPaused);
    }
    return done();
  }

  // ---- the host's own (or a world of one's own) ----
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  const order0 = G.settings.get("beltOrder"); // shared with Michael's browser: put back in the finally
  const aggro0 = G.rules.rules.zombieAggro;
  const bag = inv.bagOf(me);
  const save0 = { bag: bag ? bag.items.slice() : null, waist: me.worn.waist, belt: inv.beltOf(me) ? inv.beltOf(me).slice() : null, main: me.hands.main, off: me.hands.off, hp: me.hp, stamina: me.stamina, potionAt: me.potionAt, buffs: me.buffs, gx: me.gx, gy: me.gy, hunger: me.hunger, thirst: me.thirst, tired: me.tired, clock: G.clock.getElapsed() };
  const bagOpen0 = panel.isBagOpen();
  const witch = G.map.propById("cauldron_witch");
  const witch0 = witch ? { fire: { ...witch.fire }, queue: witch.queue ? witch.queue.slice() : null, output: witch.output ? witch.output.items.slice() : null } : null;
  const placed = [];
  let kept = null;
  G.loop.setPaused(true);
  if (screen0) G.screens.hide();
  const press = (n) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: `Digit${n}`, bubbles: true }));
    G.loop.advance(1 / 60);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: `Digit${n}`, bubbles: true }));
    G.loop.advance(1 / 60);
  };
  const render = () => panel.renderInventoryPanel(me, inv.bagOf(me), null, inv.beltOf(me));
  const intoBag = (p, e) => { const b = inv.bagOf(p); return !!b && G.grid.insert(b, e); };
  const blockOf = (e) => { const i = bag.items.indexOf(e); return i < 0 ? null : document.querySelector(`.inv-item[data-bag="inv"][data-index="${i}"]`); };
  const standBy = (prop) => {
    G.map.ensureAround(prop.tile[0], prop.tile[1], 2);
    const spot = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [0, 2]].map(([dx, dy]) => [prop.tile[0] + dx, prop.tile[1] + dy]).find(([x, y]) => G.map.isWalkableTile(x, y) && !G.map.tileAt(x, y).prop);
    G.teleport(spot[0], spot[1]);
    return spot;
  };
  try {
    if (!bag) throw new Error("no bag on the back");
    if (!witch) throw new Error("no witch's cauldron (cauldron_witch) on this map: run it on the valley");
    G.settings.set("beltOrder", "sequential");
    G.rules.set({ zombieAggro: false });
    // The witch's cauldron cold, empty, and idle to begin (a keep run before this one leaves it lit); put back as found in the finally.
    Object.assign(witch.fire, { lit: false, fuel: 0 });
    witch.queue = [];
    if (witch.output) witch.output.items.length = 0;
    me.hunger = me.maxHunger;
    me.thirst = me.maxThirst;

    // ---- the art (art round 5, 2026-10-26): each a drawn pair, the potions and poisons with a portrait for the belt ----
    const wrongArt = [];
    const POTS = ["healing_potion", "stamina_potion", "mana_potion", "poison", "strong_poison"];
    for (const v of VIALS) {
      const def = G.items.getItem(v);
      let floor = null;
      try { floor = G.assets.getSheet(`lying_${v}`); } catch { floor = null; }
      if (!def.icon || def.icon.src !== `data/art/items/${v}_icon.png` || def.icon.size.join() !== "19,19" || !def.held || def.held.image !== `data/art/items/${v}_world.png` || !floor) wrongArt.push(`${v}: no drawn icon, picture, or floor picture`);
      else if (!!def.portrait !== POTS.includes(v)) wrongArt.push(`${v}: portrait ${!!def.portrait}`);
    }
    row("every vial item is a drawn pair (its icon 19 by 19, its picture, lying on the floor as that picture); the potions and poisons a portrait for the belt, the empty and the unfired vials none", wrongArt.length === 0, wrongArt.join("; ") || VIALS.join(", "));

    // ---- the cards, read over the bag on the page ----
    bag.items.length = 0;
    const belt = inv.beltOf(me);
    if (belt) belt.fill(null);
    me.hands.main = null;
    me.hands.off = null;
    for (const v of NEW) intoBag(me, mk(v));
    panel.setBagOpen(true);
    render();
    const want = {
      unfired_vial: ["Unfired vial", "Material", "Made at the workbench."],
      clay_vial: ["Clay vial", "Material", "Made at the oven."],
      healing_potion: ["Healing potion", "Potion", `Drink: heals ${P.heal} at once.`],
      stamina_potion: ["Stamina potion", "Potion", `for ${P.staminaSeconds} seconds.`],
      mana_potion: ["Mana potion", "Potion", `Drink: restores ${P.mana} mana at once.`],
      poison: ["Poison", "Poison", "Use on a blade or arrows: coat."],
      strong_poison: ["Strong poison", "Poison", "Strong poison: never drunk."],
      cauldron: ["Cauldron", "Furniture", "Set down, it is a station: 5 recipes, over a fire of logs"],
    };
    const read = [];
    const wrong = [];
    for (const v of NEW) {
      const e = bag.items.find((q) => q.id === v);
      const el = e && blockOf(e);
      const text = el ? await hoverText(el) : "(not in the bag)";
      read.push(`${v}: ${text}`);
      const img = el && el.querySelector("img.inv-icon");
      if (!want[v].every((w) => text.includes(w)) || (VIALS.includes(v) && !(img && img.getAttribute("src").includes(`/${v}_icon.png`)))) wrong.push(`${v}: "${text}"`);
    }
    card.hide();
    row("over the bag each new item shows its icon and its card from the data (its name, its kind, what it does or where it is made)", wrong.length === 0, wrong.length ? wrong.join(" || ") : read.join(" || "));

    // ---- the witch's cauldron: its menu, its panel, a brew by the panel's Make ----
    standBy(witch);
    const target = { kind: "prop", id: witch.id };
    const labels = () => G.interact.actionsForTarget(target, me).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}`);
    const l0 = labels();
    row("the witch's cauldron's menu: Use the cauldron and the oven's Light, no Pick up, no Carry, no Boil or Cook", l0.includes("Use the cauldron") && l0.some((l) => /^Light the cauldron/.test(l)) && !l0.some((l) => /^(Pick up|Carry|Take apart|Boil|Cook)/.test(l)), l0.join(", "));
    bag.items.length = 0;
    for (const [v, n] of [["yarrow", 2], ["sage", 1], ["clay_vial", 1], ["log", 2], ["tinderbox", 1]]) intoBag(me, mk(v, n));
    const skin = mk("waterskin", 1, { fill: 30, clean: true });
    intoBag(me, skin);
    G.interact.performByLabel(me, target, G.interact.actionsForTarget(target, me).find((a) => /^Light the cauldron/.test(a.label)).label);
    row("lit by its menu, a log and a flame carried, as the oven is", witch.fire.lit && witch.fire.fuel >= 1, JSON.stringify({ lit: witch.fire.lit, fuel: witch.fire.fuel }));
    // The panel alone, as the menu's Use the cauldron opens it (station-panel.openPanel): the menu's own path also opens the output beside the bag,
    // a container main.js keeps open until the page next runs, which a check after this one would find (the review of #491).
    stationPanel.openPanel(witch, me);
    const root = document.getElementById("station");
    const title = root ? (root.querySelector(".inv-title") || {}).textContent : "";
    const rowsN = root ? root.querySelectorAll(".st-row").length : 0;
    const detail = root ? (root.querySelector(".st-detail") || {}).textContent || "" : "";
    row("its panel: Cauldron, the five brews, the healing potion's yarrow, sage, clay vial, and clean water 30 of 10", !root.hidden && title === "Cauldron" && rowsN === 5 && /yarrow/.test(detail) && /clay vial/.test(detail) && /clean water\s*30 \/ 10/.test(detail), `${title}; ${rowsN} rows; ${detail.replace(/\s+/g, " ").slice(0, 160)}`);
    const make = root && root.querySelector("[data-make]");
    if (make) make.click();
    row("its Make starts the brew: the herbs, the vial, and a draught of 10 from the clean skin taken", witch.queue && witch.queue.length === 1 && skin.fill === 20 && !bag.items.some((e) => e.id === "yarrow"), `queue ${witch.queue ? witch.queue.length : 0}; skin ${skin.fill}`);
    for (let i = 0; i < 60 * 21; i++) G.loop.advance(1 / 60);
    const brewed = witch.output && witch.output.items.find((e) => e.id === "healing_potion");
    row("twenty seconds over the lit fire: one healing potion in the cauldron's output", !!brewed && !(witch.queue && witch.queue.length), witch.output ? witch.output.items.map(id).join(",") : "no output");
    stationPanel.close();

    // ---- drinking by the real keys, the bag's double-click, the buff in the row ----
    bag.items.length = 0;
    belt[0] = mk("healing_potion");
    belt[1] = mk("poison");
    belt[2] = mk("healing_potion");
    me.potionAt = null;
    me.hp = 40;
    render();
    const slotEl = (i) => document.querySelector(`#hotbar .inv-item[data-slot="belt:${i}"]`);
    const c0 = slotEl(0) ? await hoverText(slotEl(0)) : "(no slot)";
    row("a potion's card on a belt slot leads with what its key does there", /From this main-hand slot: drunk\./.test(c0), c0);
    card.hide();
    clearMessage();
    press(1);
    row("key 1 drinks the healing potion: health up by its number, the clay vial back in the slot", Math.abs(me.hp - (40 + P.heal)) < 0.5 && id(belt[0]) === "clay_vial", `hp ${me.hp}; slot 1 ${id(belt[0])}; "${message()}"`);
    clearMessage();
    press(3);
    row("key 3 within ten seconds is refused with its line, the potion kept", message() === potions.TOO_SOON && id(belt[2]) === "healing_potion" && Math.abs(me.hp - (40 + P.heal)) < 0.5, `"${message()}"`);
    clearMessage();
    press(2);
    row("key 2 on a poison says its line and drinks nothing", message() === potions.POISON_WORD && id(belt[1]) === "poison", `"${message()}"`);
    for (let i = 0; i < 60 * (P.between + 0.5); i++) G.loop.advance(1 / 60);
    const sp = mk("stamina_potion");
    intoBag(me, sp);
    const spE = bag.items.find((e) => e.id === "stamina_potion");
    me.stamina = 5;
    render();
    const el = blockOf(spE);
    if (el) el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, ...at(el) }));
    const vialAt = bag.items.find((e) => e.id === "clay_vial");
    row("a double-click in the bag drinks the stamina potion: the bar full, the buff for its seconds, the vial in its cell", me.stamina === me.maxStamina && !!(me.buffs && me.buffs.stamina) && Math.abs(me.buffs.stamina.left - P.staminaSeconds) < 0.1 && !!vialAt && vialAt.x === spE.x && vialAt.y === spE.y, `stamina ${me.stamina}; ${JSON.stringify(me.buffs)}; vial ${vialAt ? [vialAt.x, vialAt.y] : "none"}`);
    debuffRow.updateDebuffs(me);
    const bEl = document.querySelector('#debuffs .debuff.buff[data-id="stamina"]');
    const border = bEl ? getComputedStyle(bEl.querySelector(".db-box")).borderTopColor : "";
    for (const h of document.querySelectorAll("#hotbar, #inventory")) h.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false })); // the bag's card lets go of the pointer
    card.hide();
    if (bEl) bEl.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, ...at(bEl) }));
    await wait(HC.delayMs + 80);
    const hcEl = document.getElementById("hover-card");
    const bCard = hcEl && !hcEl.hidden ? hcEl.textContent.replace(/\s+/g, " ").trim() : "(no card)";
    row("the buff in the row at the top right, framed in gold, its time, its card a Buff", !!bEl && border === "rgb(232, 200, 96)" && /30s/.test(bEl.textContent) && /Buff/.test(bCard) && /twice as fast/.test(bCard), `${border}; "${bEl ? bEl.textContent : ""}"; ${bCard}`);
    card.hide();
    for (let i = 0; i < 60 * (P.staminaSeconds + 1); i++) G.loop.advance(1 / 60);
    debuffRow.updateDebuffs(me);
    row("after its seconds the host's step ends it and the row lets it go", me.buffs === null && !document.querySelector('#debuffs .debuff[data-id="stamina"]'), JSON.stringify(me.buffs));

    // ---- your own cauldron: Place from the bag, its menu's Pick up ----
    bag.items.length = 0;
    const cItem = mk("cauldron");
    intoBag(me, cItem);
    const cE = bag.items.find((e) => e.id === "cauldron");
    const menu = G.interact.itemMenu(me, cE, bag, null).map((m) => m.label);
    row("the Cauldron item's menu offers Place", menu.includes("Place"), menu.join(", "));
    let spot = null;
    const [px0, py0] = [Math.round(me.gx), Math.round(me.gy)];
    for (let r = 1; r < 6 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (const dy of [-r, r]) if (!spot && !setdown.standProblem("ground", px0 + dx, py0 + dy) && !setdown.reachFor(me, px0 + dx, py0 + dy)) spot = [px0 + dx, py0 + dy];
    const ok = spot && setdown.place(me, cE.uid, spot[0], spot[1]);
    const own = ok ? G.map.tileAt(spot[0], spot[1]).prop : null;
    if (own) placed.push(own);
    const ownLabels = own ? G.interact.actionsForTarget({ kind: "prop", id: own.id }, me).map((a) => a.label) : [];
    row("set down from the bag it is a cauldron of your own: a station, cold and empty, its menu Use, Light, Pick up, and Take apart", !!own && own.made && own.sprite === "cauldron" && !own.fire.lit && ownLabels.includes("Use the cauldron") && ownLabels.includes("Pick up cauldron") && ownLabels.some((l) => /^Take apart/.test(l)), `${spot}; ${ownLabels.join(", ")}`);
    if (own) {
      G.interact.performByLabel(me, { kind: "prop", id: own.id }, "Pick up cauldron");
      for (let i = 0; i < 10; i++) G.loop.advance(1 / 60); // the menu's action runs in the step
      row("its Pick up gives the Cauldron item back", !G.map.propById(own.id) && bag.items.some((e) => e.id === "cauldron"), bag.items.map(id).join(","));
    }

    // ---- two tabs: the guest's potions by the witch's cauldron ----
    if (opts.keep) {
      const others = G.game.state.players.filter((p) => p !== me);
      for (const p of others) {
        keptBack.push({ id: p.id, waist: p.worn.waist, bag: inv.bagOf(p) ? inv.bagOf(p).items.slice() : null, hp: p.hp, stamina: p.stamina, potionAt: p.potionAt, buffs: p.buffs });
        p.worn.waist = mk("belt");
        const b = inv.beltOf(p);
        b[0] = mk("healing_potion");
        b[2] = mk("poison");
        for (const [v, n] of [["stamina_potion", 1], ["yarrow", 2], ["sage", 1], ["clay_vial", 1]]) intoBag(p, mk(v, n));
        intoBag(p, mk("waterskin", 1, { fill: 60, clean: true }));
        const s = standBy(witch);
        p.gx = s[0];
        p.gy = s[1];
        p.auto = null;
        p.hp = 50;
        p.stamina = 10;
        p.potionAt = null;
        p.buffs = null;
      }
      witch.fire.fuel = 3;
      witch.fire.lit = true;
      witch.queue = [];
      if (witch.output) witch.output.items.length = 0; // the guest's own brew is the one it finds there
      G.map.touch(witch.tile[0], witch.tile[1]);
      keptRules = { zombieAggro: aggro0 };
      kept = others.length ? { players: others.map((p) => p.id), witch: witch.id } : null;
      row("kept for the guest: every other player by the witch's cauldron, lit with three logs, a healing potion in slot 1, a poison in slot 3, a stamina potion and a brew's makings in its bag, health 50, stamina 10, the dead calm; `{ stop: true }` puts them back", !!kept, kept ? JSON.stringify(kept) : "no other player");
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    for (const h of document.querySelectorAll("#hotbar, #inventory")) h.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false })); // no card left resting under a pointer
    card.hide();
    (await import("/src/ui/context-menu.js")).closeContextMenu();
    stationPanel.close();
    G.settings.set("beltOrder", order0);
    if (!kept) G.rules.set({ zombieAggro: aggro0 });
    for (const p of placed) if (G.map.propById(p.id)) G.map.removeProp(p);
    if (save0.bag && inv.bagOf(me)) inv.bagOf(me).items.splice(0, inv.bagOf(me).items.length, ...save0.bag);
    me.worn.waist = save0.waist;
    const b = inv.beltOf(me);
    if (b && save0.belt) b.splice(0, b.length, ...save0.belt);
    me.hands.main = save0.main;
    me.hands.off = save0.off;
    Object.assign(me, { hp: save0.hp, stamina: save0.stamina, potionAt: save0.potionAt, buffs: save0.buffs, hunger: save0.hunger, thirst: save0.thirst, tired: save0.tired });
    G.clock.setElapsed(save0.clock); // the minute or so of game time the brew and the buff stepped
    if (witch && witch0 && !kept) {
      Object.assign(witch.fire, witch0.fire);
      witch.queue = witch0.queue;
      if (witch.output) witch.output.items.splice(0, witch.output.items.length, ...(witch0.output || []));
      G.map.touch(witch.tile[0], witch.tile[1]);
    }
    G.teleport(save0.gx, save0.gy);
    debuffRow.updateDebuffs(me);
    panel.setBagOpen(bagOpen0);
    render();
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  return done({ kept });
}
