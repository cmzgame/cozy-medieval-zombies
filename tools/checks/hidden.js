// Hiding a worn item's art (#159): an eye on each worn slot of the character screen leaves the item's layer out of the figure and keeps every use. From the console, on a
// tab with `?nosave`:
//   await __game.check("hidden")
// It wears the good belt and compares figure sheets by pixels: shown, hidden through the guest's command (`performItemCommand`, op "hide"), hidden equals the figure with no belt
// at all, shown again equals the first; the belt's slots (its `beltSlots`, five since #478) still work with it hidden; a slot with nothing worn cannot be hidden, and a command
// naming a hand or nonsense does nothing. The worn items, the belt, and what is hidden are put back.

function hashPixels(canvas) {
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const worn0 = { ...me.worn };
  const hidden0 = me.hidden;
  const belt0 = G.inventory.beltOf(me) ? G.inventory.beltOf(me).slice() : null;
  const { performItemCommand } = await import("/src/ui/inventory-actions.js");
  const sheetOf = () => hashPixels(G.figure.generateFigure(G.figure.characterSpec(G.figure.characterInputs(me))).image);
  const slotsLive = () => (G.inventory.beltOf(me) || []).length;
  try {
    me.hidden = [];
    me.worn.waist = G.items.makeEntry("good_belt", 1);
    const shown = sheetOf();
    const slots = slotsLive();
    const ran = performItemCommand(me, { op: "hide", slot: "waist" });
    const hiddenSheet = sheetOf();
    row("the guest's command hides the belt: the figure's sheet changes, and the belt stays worn", ran === true && me.hidden.includes("waist") && !!me.worn.waist && hiddenSheet !== shown, `shown ${shown}, hidden ${hiddenSheet}; hidden ${JSON.stringify(me.hidden)}`);
    const bare = me.worn.waist;
    me.worn.waist = null;
    const without = sheetOf();
    me.worn.waist = bare;
    row("hidden is the figure with no belt on at all (the layer is simply left out)", hiddenSheet === without, `hidden ${hiddenSheet}, no belt ${without}`);
    const torch = G.items.makeEntry("torch", 1);
    torch.lit = true;
    const beltNow = G.inventory.beltOf(me);
    let stays = false;
    if (beltNow) { beltNow[0] = torch; stays = G.inventory.beltOf(me)[0] === torch; beltNow[0] = null; }
    // (the figure code never reads the belt, the light, or the bag: only the worn art and the hidden list)
    const want = G.items.getItem("good_belt").beltSlots; // the data's count, never a number here (#478 made it five)
    row("the belt keeps every use while hidden: its slots are there and hold a torch", slots === want && slotsLive() === want && stays, `${slotsLive()} slots of the leather belt's ${want}; a torch placed on the belt stays: ${stays}`);
    performItemCommand(me, { op: "hide", slot: "waist" });
    row("the eye again shows it: the sheet is the first one", !me.hidden.includes("waist") && sheetOf() === shown, `back to ${sheetOf()} (first ${shown})`);
    const emptyBefore = me.hidden.slice();
    me.worn.head = null;
    const none = performItemCommand(me, { op: "hide", slot: "head" });
    const hand = performItemCommand(me, { op: "hide", slot: "hand:main" });
    const junk = performItemCommand(me, { op: "hide", slot: 7 });
    row("a slot with nothing worn, a hand, and nonsense cannot be hidden", none === false && hand === false && junk === false && JSON.stringify(me.hidden) === JSON.stringify(emptyBefore), `${none}, ${hand}, ${junk}; hidden ${JSON.stringify(me.hidden)}`);
    row("nothing hidden draws as before (a character with no `hidden` field at all is the same figure)", (() => { const h = me.hidden; delete me.hidden; const s = sheetOf(); me.hidden = h; return s === shown; })(), "an old save's character");
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    me.worn.waist = worn0.waist;
    me.worn.head = worn0.head;
    me.hidden = hidden0;
    if (belt0) { const b = G.inventory.beltOf(me); if (b) for (let i = 0; i < b.length; i++) b[i] = belt0[i] ?? null; }
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
