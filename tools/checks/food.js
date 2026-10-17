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
  const state0 = { hp: me.hp, hunger: me.hunger, thirst: me.thirst };
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
    for (const d of defs) {
      me.hp = 50;
      me.hunger = Math.max(0, me.maxHunger - 80);
      const entry = G.items.makeEntry(d.id, 1);
      G.inventory.stow(me, entry);
      G.interact.itemMenu(me, entry, bag, null).find((m) => m.label === "Eat").onSelect();
      const got = me.hp - 50;
      if (got !== (d.heal || 0)) row(`${d.id} heals exactly its heal`, false, `${got} of ${d.heal}`);
      G.inventory.detach(me, entry);
    }
    row("each food eaten from the bag heals exactly its number", rows.every((r) => r.result === "pass"), "every food, from 50 health");
    me.hp = me.maxHp - 1;
    const bread = G.items.makeEntry("bread", 1);
    G.inventory.stow(me, bread);
    G.interact.itemMenu(me, bread, bag, null).find((m) => m.label === "Eat").onSelect();
    row("a heal is capped at full health", me.hp === me.maxHp, `health ${me.hp} of ${me.maxHp}`);

    // From the belt: the slot's Eat entry, and a double-click.
    if (belt) {
      const slot = belt.findIndex((e) => !e);
      if (slot >= 0) {
        me.hp = 40;
        belt[slot] = G.items.makeEntry("stew", 2);
        const id = `belt:${slot}`;
        const first = G.interact.slotMenu(me, id)[1] || G.interact.slotMenu(me, id)[0];
        row("a food on the belt offers Eat from its slot, and not Equip", G.interact.slotMenu(me, id).some((m) => m.label === "Eat") && !G.interact.slotMenu(me, id).some((m) => m.label.startsWith("Equip")), G.interact.slotMenu(me, id).map((m) => m.label).join(", "));
        const did = actions.useSlot(id);
        row("a double-click on it eats one: health up, one fewer on the belt", did === true && me.hp === 40 + heal("stew") && belt[slot] && belt[slot].count === 1, `health ${me.hp}, ${belt[slot] ? belt[slot].count : 0} left`);
        actions.useSlot(id);
        row("and the last one empties the slot", belt[slot] === null && me.hp === 40 + 2 * heal("stew"), `slot ${belt[slot] ? "still full" : "empty"}, health ${me.hp}`);
      } else row("a free belt slot for the belt rows", false, "none");
    } else row("the player has a belt", false, "no belt");
  } finally {
    me.hp = state0.hp;
    me.hunger = state0.hunger;
    me.thirst = state0.thirst;
    bag.items.splice(0, bag.items.length, ...bag0);
    if (belt && belt0) belt.splice(0, belt.length, ...belt0);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
