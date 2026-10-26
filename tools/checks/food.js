// Food heals a little (Michael, 2026-10-18, #179: "I DO want food to heal. It should be a stopgap while you wait for natural heal or
// grab a potion. The only big heals allowed are from potions"; cooked and combined foods more than raw; eat from the belt). From the
// console, on a tab with `?nosave`:
//   await __game.check("food")
// It hurts the player, eats each food from the bag and then from the belt (a menu entry, a double-click), and puts health, hunger, and
// the bag and belt back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const bag = G.inventory.bagOf(me);
  const belt = G.inventory.beltOf(me);
  const state0 = { hp: me.hp, hunger: me.hunger, thirst: me.thirst, survival: G.rules.rules.survival };
  G.rules.rules.survival = true; // the rows below set Survival where they mean it
  const bag0 = bag.items.slice();
  const belt0 = belt ? [...belt] : null;
  const defs = G.items.allItems().filter((d) => d.kind === "food");
  const heal = (id) => G.items.getItem(id).heal || 0;
  const actions = (await import("/src/ui/inventory-actions.js")).createInventoryActions(() => me);
  try {
    // Every food heals a little, and none a great deal.
    row("every food heals a little (at least one, at most ten: a stopgap, never a potion's)", defs.every((d) => (d.heal || 0) >= 1 && (d.heal || 0) <= 10), defs.map((d) => `${d.id} ${d.heal || 0}`).join(", "));
    row("cooked food heals more than the raw it is made of", heal("roast_potato") > heal("potato") && heal("stew") > heal("potato") && heal("stew") > heal("cabbage") && heal("porridge") > heal("potato") && heal("bread") > heal("apple"), `roast potato ${heal("roast_potato")} over potato ${heal("potato")}; stew ${heal("stew")}; porridge ${heal("porridge")}; bread ${heal("bread")} over apple ${heal("apple")}`);

    // Eaten from the bag: the heal is applied, and capped at full health.
    let exact = true;
    for (const d of defs) {
      me.hp = 50;
      me.hunger = Math.max(0, me.maxHunger - 80);
      const entry = G.items.makeEntry(d.id, 1);
      G.inventory.stow(me, entry);
      G.interact.itemMenu(me, entry, bag, null).find((m) => m.label === "Eat").onSelect();
      const got = me.hp - 50;
      if (got !== (d.heal || 0)) { exact = false; row(`${d.id} heals exactly its heal`, false, `${got} of ${d.heal}`); }
      G.inventory.detach(me, entry);
    }
    row("each food eaten from the bag heals exactly its number", exact, "every food, from 50 health");
    me.hp = me.maxHp - 1;
    const bread = G.items.makeEntry("bread", 1);
    G.inventory.stow(me, bread);
    G.interact.itemMenu(me, bread, bag, null).find((m) => m.label === "Eat").onSelect();
    row("a heal is capped at full health", me.hp === me.maxHp, `health ${me.hp} of ${me.maxHp}`);

    // From the belt: the slot's Eat entry, and a double-click.
    me.hunger = 0; // the belt rows eat two stews, so there is room for them
    if (belt) {
      // Food is one a cell since #399, so a belt slot holds one food: a stew in each of two slots, eaten one after the other.
      const free = belt.map((e, i) => (e ? -1 : i)).filter((i) => i >= 0);
      if (free.length >= 2) {
        const [a, b] = free;
        me.hp = 40;
        belt[a] = G.items.makeEntry("stew", 1);
        belt[b] = G.items.makeEntry("stew", 1);
        const id = `belt:${a}`;
        row("a food on the belt offers Eat from its slot, and not Equip", G.interact.slotMenu(me, id).some((m) => m.label === "Eat") && !G.interact.slotMenu(me, id).some((m) => m.label.startsWith("Equip")), G.interact.slotMenu(me, id).map((m) => m.label).join(", "));
        const did = actions.useSlot(id);
        row("a double-click on it eats it: health up, its slot empty, the other slot's stew still there", did === true && me.hp === 40 + heal("stew") && belt[a] === null && !!belt[b], `health ${me.hp}; slot ${a + 1} ${belt[a] ? "still full" : "empty"}, slot ${b + 1} ${belt[b] ? "full" : "empty"}`);
        actions.useSlot(`belt:${b}`);
        row("the second slot, a second bite: both slots empty", belt[b] === null && me.hp === 40 + 2 * heal("stew"), `slot ${b + 1} ${belt[b] ? "still full" : "empty"}, health ${me.hp}`);
      } else row("two free belt slots for the belt rows", false, `${free.length} free`);
      // Food heals what it says on the tin, full or not, and hunger stops at the top (Michael, 2026-10-18, overturning #186's "You are
      // full."), by the menu, the double-click, and the key alike.
      const word = () => (document.getElementById("message") || {}).textContent || "";
      const was = G.rules.rules.survival;
      const bleed0 = me.bleed;
      const tired0 = me.tired;
      const sleeping0 = me.sleeping;
      G.rules.rules.survival = true;
      const full = (what, fn, eaten) => {
        me.hp = 40;
        me.hunger = me.maxHunger - 2;
        const msg = document.getElementById("message");
        if (msg) { msg.textContent = ""; msg.hidden = true; }
        fn();
        row(`a full belly still eats, heals in full, and hunger stops at the top: ${what}`, me.hp === 40 + heal("stew") && me.hunger === me.maxHunger && eaten() && !/full/i.test(word()), `health ${me.hp} (wanted ${40 + heal("stew")}), hunger ${me.hunger}, "${word()}"`);
      };
      try {
        const slot2 = belt.findIndex((e) => !e);
        const oneStew = () => { belt[slot2] = G.items.makeEntry("stew", 1); }; // one food a slot (#399): each way in eats a stew of its own
        oneStew();
        full("the belt slot's menu", () => G.interact.slotMenu(me, `belt:${slot2}`).find((m) => m.label === "Eat").onSelect(), () => belt[slot2] === null);
        oneStew();
        full("the double-click on it", () => actions.useSlot(`belt:${slot2}`), () => belt[slot2] === null);
        const press = (await import("/src/interact.js")).updateInteract;
        oneStew();
        full("the belt key", () => press(me, 1 / 60, { [G.inventory.BELT_EVENTS[slot2]]: true }), () => belt[slot2] === null); // the key event names the slot by its role (2026-10-25)
        // With Survival off the needs stay full for good, and food heals all the same.
        G.rules.rules.survival = false;
        belt[slot2] = G.items.makeEntry("stew", 1);
        me.hp = 40;
        G.interact.slotMenu(me, `belt:${slot2}`).find((m) => m.label === "Eat").onSelect();
        row("with Survival off food heals all the same", me.hp === 40 + heal("stew") && belt[slot2] === null, `health ${me.hp}`);
        // Health comes back faster well fed (Michael, 2026-10-18): the rate at fullAt and over is wellFedRegenMult times the fed rate.
        G.rules.rules.survival = true;
        const P = await import("/src/entities/player.js");
        const T = G.tuning.player;
        me.bleed = null;
        me.tired = me.maxTired;
        me.sleeping = false;
        me.hp = 40;
        me.thirst = me.maxThirst;
        me.hunger = T.fullAt - 1;
        const fed = P.regenPerMinute(me);
        me.hunger = T.fullAt;
        const wellFed = P.regenPerMinute(me);
        row("health comes back wellFedRegenMult times as fast well fed as fed", fed === T.healthRegenPerMinute && wellFed === fed * T.wellFedRegenMult && T.wellFedRegenMult > 1, `fed ${fed} a minute, well fed ${wellFed} (x${T.wellFedRegenMult})`);
        me.hunger = 0;
        row("and none starving", P.regenPerMinute(me) === 0, `${P.regenPerMinute(me)} a minute at hunger 0`);
      } finally {
        G.rules.rules.survival = was;
        me.bleed = bleed0;
        me.tired = tired0;
        me.sleeping = sleeping0;
      }
    } else row("the player has a belt", false, "no belt");

    // Water (docs/44): a tainted drink always quenches and makes the one roll (two of the generator's floats: Sick, then the infection), from a
    // skin and from a source alike; a clean sip makes none; the auto-sip takes only clean water; Sick, food heals sickHealMult of its number.
    {
      const P = await import("/src/entities/player.js");
      const rng = await import("/src/rng.js");
      const W = G.tuning.water;
      const keep = { sick: me.sick, infection: me.infection, rng: rng.getState(), presentFor: me.presentFor, fills: G.inventory.skinsOf(me).map((e) => [e, e.fill]) };
      const used = (fn) => { const s0 = rng.getState(); fn(); const next = rng.float(); rng.setState(s0); const seq = [rng.float(), rng.float(), rng.float()]; rng.setState(s0); return seq.indexOf(next); };
      try {
        G.rules.rules.survival = true;
        const tainted = G.items.makeEntry("waterskin", 1, { fill: 100 });
        const clean = G.items.makeEntry("waterskin", 1, { fill: 100, clean: true });
        G.inventory.stow(me, tainted);
        G.inventory.stow(me, clean);
        me.sick = null;
        me.thirst = 10;
        const n1 = used(() => G.interact.itemMenu(me, tainted, bag, null).find((m) => m.label.startsWith("Drink (tainted")).onSelect());
        row("a tainted skin's Drink quenches and makes the one roll (two floats: Sick, the infection)", n1 === 2 && me.thirst > 10, `${n1} floats, thirst ${me.thirst.toFixed(1)}`);
        me.sick = null;
        me.thirst = 10;
        const n2 = used(() => G.interact.itemMenu(me, clean, bag, null).find((m) => m.label === "Drink (100%)").onSelect());
        row("a clean skin's Drink quenches and rolls nothing", n2 === 0 && me.thirst > 10, `${n2} floats`);
        // The chance, through the module's own roll: a roll under sickChance makes you Sick, one over it does not; while Sick every tainted drink adds a stack.
        const S = await import("/src/sick.js");
        me.sick = null;
        S.taintedDrink(me, W.sickChance + 0.001, 0.99);
        const none = !me.sick;
        S.taintedDrink(me, W.sickChance - 0.001, 0.99);
        const one = me.sick && me.sick.stacks === 1;
        S.taintedDrink(me, 0.99, 0.99);
        row("Sick at its chance (20%), and a further tainted drink adds a stack", none && one && me.sick.stacks === 2 && Math.abs(W.sickChance - 0.2) < 1e-9, JSON.stringify(me.sick));
        row("the infection at its chance (1%) from a tainted drink", Math.abs(W.infectionChance - 0.01) < 1e-9 && S.taintedDrink({ sick: null, infection: null }, 0.99, 0.0099).infected === true && S.taintedDrink({ sick: null, infection: null }, 0.99, 0.0101).infected === false, `infectionChance ${W.infectionChance}`);
        // Sick, food heals a quarter less.
        me.hp = 40;
        const stew = G.items.makeEntry("stew", 1);
        G.inventory.stow(me, stew);
        G.interact.itemMenu(me, stew, bag, null).find((m) => m.label === "Eat").onSelect();
        row("Sick, food heals sickHealMult of its number", Math.abs(me.hp - (40 + heal("stew") * W.sickHealMult)) < 1e-9, `health ${me.hp} (wanted ${40 + heal("stew") * W.sickHealMult})`);
        me.sick = null;
        // The auto-sip takes only clean water.
        me.thirst = 20;
        me.presentFor = 0;
        for (const e of G.inventory.skinsOf(me)) if (e !== tainted) e.fill = 0;
        tainted.fill = 100;
        row("the auto-sip leaves a tainted skin alone", P.autoDrink(me) === null && tainted.fill === 100, `tainted fill ${tainted.fill}`);
        clean.fill = 100;
        const drank = P.autoDrink(me);
        row("and sips from a clean one", drank === clean && clean.fill < 100, `drank ${drank ? (drank === clean ? "the clean skin" : drank.id) : "nothing"}`);
      } finally {
        me.sick = keep.sick;
        me.infection = keep.infection;
        me.presentFor = keep.presentFor;
        for (const [e, f] of keep.fills) e.fill = f; // the kit's own skin, emptied for the auto-sip's rows
        rng.setState(keep.rng);
      }
    }
  } finally {
    G.rules.rules.survival = state0.survival;
    me.hp = state0.hp;
    me.hunger = state0.hunger;
    me.thirst = state0.thirst;
    bag.items.splice(0, bag.items.length, ...bag0);
    if (belt && belt0) belt.splice(0, belt.length, ...belt0);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
