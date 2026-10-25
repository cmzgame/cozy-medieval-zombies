// The hover card (#262; src/item-info.js, src/ui/hover-card.js). From the console, on a tab with `?nosave`:
//   await __game.check("hovercard")
// What a card says is read from the data: the full name, the kind, and the direct uses (food heals and fills, a tool's verbs, a weapon's damage, what an item is Used on, what a
// seed grows), the word Use its own segment; no two items read the same on their cards, though six are drawn "Seed". Then the card on the page: over an item in the bag, in a hand,
// on the worn slots, and on a belt slot it shows the card; over an empty slot, the slot's name; the browser's title tooltip is gone from them; it is inside the window; it
// follows the pointer; and it goes away when the pointer leaves. The bag, belt, hands, and worn slots are put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const info = await import("/src/item-info.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const card = await import("/src/ui/hover-card.js");
  const { hoverCard: T } = await import("/src/tuning.js");
  const me = G.player;
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const counts0 = bag0.map((e) => [e, e.count]);
  const belt = G.inventory.beltOf(me);
  const belt0 = belt ? belt.slice() : null;
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const head0 = me.worn.head;
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen(); // the title or pause screen over the panels would take the pointer: hide it for the check, put it back after
  if (screen0) G.screens.hide();
  const was = { bag: panel.isBagOpen(), character: panel.isCharacter() };
  const all = G.items.allItems ? G.items.allItems() : null;
  const text = (id, props) => info.textOf(info.cardFor(G.items.makeEntry(id, 1, props)));
  const has = (id, needle, props) => text(id, props).some((l) => l.includes(needle));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    G.loop.setPaused(true);
    // The content, from the data.
    const bread = info.cardFor(G.items.makeEntry("bread"));
    row("food: the full name, Food, and what eating heals and fills", bread.name === "Loaf of bread" && bread.kind === "Food" && has("bread", "Eat: heals 5, fills hunger 40."), text("bread").join(" | "));
    row("a hatchet: a tool and weapon, its damage, and what it is for", has("hatchet", "30 damage") && has("hatchet", "For: chop, notch, split.") && info.cardFor(G.items.makeEntry("hatchet")).kind === "Tool, weapon", text("hatchet").join(" | "));
    const tb = info.cardFor(G.items.makeEntry("tinderbox"));
    const useSeg = tb.lines.flat().find((s) => s.k === "use");
    row("a tinderbox: the word Use is its own segment, and the card says what it lights", !!useSeg && useSeg.t === "Use" && has("tinderbox", "Use on campfire, torch post") && has("tinderbox", ": light."), text("tinderbox").join(" | "));
    row("a seed says what it grows", has("potato_seed", "Grows potato on tilled soil.") && info.cardFor(G.items.makeEntry("potato_seed")).kind === "Seed", text("potato_seed").join(" | "));
    row("a rucksack says where it is worn and what it holds", has("rucksack", "worn on your back; holds 8×5"), text("rucksack").join(" | "));
    // A stack is one of the few things that stack (#399): throwing knives, which also wear; a single food shows no count.
    const knives = info.cardFor(G.items.makeEntry("throwing_knife", 3, { wear: 0.25 })).state;
    const oneLoaf = info.cardFor(G.items.makeEntry("bread", 1)).state;
    row("a waterskin says its fill, a stack its count and wear, and a single food no count", has("waterskin", "Drink: 40% full", { fill: 40 }) && knives === "×3 · 75% left" && !/×/.test(oneLoaf), `knives "${knives}"; a loaf "${oneLoaf}"`);
    row("a material says what it is made into", has("log", "Splits into 3 planks.") || has("log", "Goes into:"), text("log").join(" | "));
    // What the cards say is true: the swing animation's name is not a fact about the weapon, an ingredient says what it goes into whatever else it is, ids are player words.
    row("a halberd says it is held in both hands and never calls itself one-handed", has("halberd", "Equip: both hands.") && !text("halberd").some((l) => /one-handed/.test(l)) && !G.items.allItems().some((d) => info.textOf(info.cardFor(G.items.makeEntry(d.id))).some((l) => /one-handed/.test(l))), text("halberd").join(" | "));
    row("a plank says what it goes into and what it builds; a stick, though a weapon, says what it goes into", has("plank", "Goes into:") && has("plank", "Builds:") && /door/.test(text("plank").join(" ")) && has("stick", "Goes into:"), `${text("plank").join(" | ")} || ${text("stick").join(" | ")}`);
    row("the Use lines name things in player words: a bucket fills at water, a well, a trough; seeds go on tilled soil", has("bucket", "Use on water, well") && !text("bucket").some((l) => /floor_|water shallow/.test(l)) && has("potato_seed", "Use on tilled soil: plant."), `${text("bucket").join(" | ")} || ${text("potato_seed").join(" | ")}`);
    row("a log splits into planks, plural", has("log", "Splits into 3 planks."), text("log").join(" | "));
    // Every item: a name nobody else has, a kind, and no segment but Use is gold.
    const ids = [...new Set((all || []).map((d) => d.id))];
    const names = new Map();
    let noKind = 0;
    let badUse = 0;
    for (const id of ids) {
      const c = info.cardFor(G.items.makeEntry(id));
      names.set(c.name, (names.get(c.name) || 0) + 1);
      if (!c.kind) noKind++;
      for (const s of c.lines.flat()) if (s.k === "use" && s.t !== "Use") badUse++;
    }
    const dup = [...names].filter(([, n]) => n > 1).map(([k]) => k);
    row("every item's card has its own full name and a kind, and Use is written Use", ids.length >= 60 && dup.length === 0 && noKind === 0 && badUse === 0, `${ids.length} items; duplicates: ${dup.join(", ") || "none"}; no kind: ${noKind}`);

    // On the page.
    for (const e of [...bag.items]) bag.items.splice(bag.items.indexOf(e), 1);
    const bread1 = G.items.makeEntry("bread", 1); // one a cell (#399)
    const hatchet = G.items.makeEntry("hatchet", 1);
    G.inventory.stow(me, bread1);
    G.inventory.stow(me, hatchet);
    if (belt) for (let i = 0; i < belt.length; i++) belt[i] = null;
    if (belt) belt[0] = G.items.makeEntry("tinderbox", 1);
    me.hands.main = G.items.makeEntry("sword", 1);
    me.hands.off = null;
    me.worn.head = G.items.makeEntry("cap", 1);
    panel.setBagOpen(true);
    panel.setCharacterOpen(true);
    panel.renderInventoryPanel(me, bag, null, belt);
    const move = (el, dx = 0, dy = 0) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width / 2 + dx, clientY: r.top + r.height / 2 + dy, bubbles: true }));
    };
    const cardEl = () => document.getElementById("hover-card");
    const hoverOver = async (sel, label) => {
      const el = document.querySelector(sel);
      if (!el) { row(label, false, `no element for ${sel}`); return null; }
      move(el);
      await wait(T.delayMs + 80);
      return el;
    };
    let el = await hoverOver(".inv-item[data-bag='inv']", "an item in the bag shows its card");
    let c = cardEl();
    row("over an item in the bag the card shows its full name, its kind, and its uses", !!el && !c.hidden && /Loaf of bread|Hatchet/.test(c.textContent) && /Food|Tool/.test(c.textContent), c ? c.textContent.slice(0, 120) : "no card");
    row("the browser's own title tooltip is gone from the items and the slots", ![...document.querySelectorAll(".inv-item, .doll-slot, .hot-slot")].some((n) => n.hasAttribute("title")), `${document.querySelectorAll(".inv-item, .doll-slot, .hot-slot").length} checked`);
    const r1 = c.getBoundingClientRect();
    move(el, 6, 4);
    const r2 = c.getBoundingClientRect();
    row("the card follows the pointer and stays inside the window", Math.abs(r2.left - r1.left) + Math.abs(r2.top - r1.top) > 0 && r2.left >= 0 && r2.top >= 0 && r2.right <= innerWidth + 1 && r2.bottom <= innerHeight + 1, `moved ${Math.round(r2.left - r1.left)},${Math.round(r2.top - r1.top)}`);
    // Near the bottom right corner it flips so it stays on screen.
    const ev = new PointerEvent("pointermove", { clientX: innerWidth - 3, clientY: innerHeight - 3, bubbles: true });
    el.dispatchEvent(ev);
    const r3 = c.getBoundingClientRect();
    row("at the window's corner the card flips to stay on screen", r3.right <= innerWidth + 1 && r3.bottom <= innerHeight + 1 && r3.left >= 0 && r3.top >= 0, `${Math.round(r3.left)},${Math.round(r3.top)} to ${Math.round(r3.right)},${Math.round(r3.bottom)} in ${innerWidth}x${innerHeight}`);
    (el.closest("#hotbar") || el.closest(".inv-body, .doll-wrap, .container-wrap").parentElement).dispatchEvent(new PointerEvent("pointerleave", { bubbles: false })); // the panel's own edge, where a real pointer leaves it
    row("the card goes away when the pointer leaves", cardEl().hidden, "hidden");
    if (belt) {
      el = await hoverOver(".hot-slot:not(.empty) .inv-item", "a belt slot shows its card");
      row("a belt slot's card says what the tinderbox is for", !!el && /Tinderbox/.test(cardEl().textContent) && /Use/.test(cardEl().textContent), cardEl().textContent.slice(0, 120));
      el = await hoverOver(".hot-slot.empty", "an empty belt slot shows its name");
      row("an empty belt slot shows its name", !!el && /Belt slot/.test(cardEl().textContent), cardEl().textContent.slice(0, 60));
    }
    // The card is not stale: a count that changes, and a slot that empties, while the pointer does not move.
    if (belt) {
      belt[0] = G.items.makeEntry("arrow", 3); // a count that can change is a stack's: arrows, which stack and ride on the belt (#399)
      panel.renderInventoryPanel(me, bag, null, belt);
      el = await hoverOver(".hot-slot:not(.empty) .inv-item", "the belt shows arrows");
      const was3 = cardEl().textContent;
      belt[0].count = 2;
      panel.renderInventoryPanel(me, bag, null, belt);
      const now2 = cardEl().textContent;
      belt[0] = null;
      panel.renderInventoryPanel(me, bag, null, belt);
      const gone = cardEl();
      row("the card is not stale: a count that falls shows at once, and a slot that empties no longer shows the item", /×3/.test(was3) && /×2/.test(now2) && !/×3/.test(now2) && (gone.hidden || !/arrow/i.test(gone.textContent)), `${/×3/.test(was3) ? "×3" : "?"} -> ${/×2/.test(now2) ? "×2" : "?"} -> ${gone.hidden ? "hidden" : gone.textContent.slice(0, 30)}`);
      belt[0] = G.items.makeEntry("tinderbox", 1);
      panel.renderInventoryPanel(me, bag, null, belt);
    }
    // Every piece and slot has the full name for a screen reader, since the title is gone.
    row("every piece and slot carries its full name as an aria-label", [...document.querySelectorAll(".inv-item")].every((n) => n.getAttribute("aria-label")) && [...document.querySelectorAll(".doll-slot, .hot-slot")].every((n) => n.getAttribute("aria-label")), `${document.querySelectorAll(".inv-item, .doll-slot, .hot-slot").length} checked`);
    // An open container (a chest, a body, a station's output) is a grid like the bag.
    const chest = { container: "chest", cols: 4, rows: 3, items: [] };
    const apple = G.items.makeEntry("apple", 2);
    apple.x = 0;
    apple.y = 0;
    chest.items.push(apple);
    panel.renderInventoryPanel(me, bag, chest, belt);
    el = await hoverOver(".inv-item[data-bag='container']", "an item in an open container shows its card");
    row("an item in an open container (chest, body, station output) shows its card", !!el && /Apple/.test(cardEl().textContent) && /×2/.test(cardEl().textContent) && /Eat/.test(cardEl().textContent), cardEl().textContent.slice(0, 80));
    panel.renderInventoryPanel(me, bag, null, belt);
    el = await hoverOver(".doll-slot[data-slot='hand:main'] .inv-item", "a hand shows its card");
    row("the main hand's card names the sword", !!el && /sword/i.test(cardEl().textContent), cardEl().textContent.slice(0, 80));
    el = await hoverOver(".doll-slot[data-slot='worn:head'] .inv-item", "a worn slot shows its card");
    row("a worn slot's card names the cap", !!el && /cap/i.test(cardEl().textContent) && /Equip/.test(cardEl().textContent), cardEl().textContent.slice(0, 80));
    el = await hoverOver(".doll-slot[data-slot='hand:off'].empty", "an empty hand shows its name");
    row("an empty hand shows its name", !!el && /Off-hand/.test(cardEl().textContent), cardEl().textContent.slice(0, 60));
    el = await hoverOver(".hot-slot:not(.empty) .inv-item", "the Use word");
    const useEl = document.querySelector("#hover-card .hc-use");
    const probe = document.createElement("i");
    probe.style.color = "var(--gold)";
    document.body.appendChild(probe);
    const goldRgb = getComputedStyle(probe).color;
    probe.remove();
    row("the word Use is drawn in --gold", !!useEl && getComputedStyle(useEl).color === goldRgb, useEl ? `${getComputedStyle(useEl).color} vs ${goldRgb}` : "no Use word");
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    card.hide();
    bag.items.splice(0, bag.items.length, ...bag0);
    for (const [e, n] of counts0) e.count = n;
    if (belt) for (let i = 0; i < belt.length; i++) belt[i] = belt0[i];
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    me.worn.head = head0;
    panel.setBagOpen(was.bag);
    panel.setCharacterOpen(was.character);
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
