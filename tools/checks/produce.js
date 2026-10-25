// The recipes of animals' produce, animals step 4 (docs/45, #445). From the console, on a tab with `?nosave` (the valley):
//   await __game.check("produce")
// On open ground, at stations the check sets down (a lit campfire, an oven, a workbench, a loom, a spinning wheel) and the two a workbench
// makes (a smoking rack and a tanning vat, set beside it): each raw meat cooked alone at the fire; the meat pottage beside the plain one,
// the hearty stew, eggs and bacon, cheese, and pemmican (with lard and with honey) at the fire; a meat pie at the oven; butter at the
// workbench; smoked meat at the rack, a log spent; leather at the vat; yarn at the spinning wheel and woollen cloth at the loom, which
// serves as cloth; arrows fletched, one feather for five, refused without one; the valley's spinning wheel a station; every new item's
// card; every recipe's ingredients spent, a raw meat on the belt or in a hand too (the review of #462). Everything set down goes, and the
// bag, the hands, the belt, the clock, the player's needs, and the rules are put back.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const stations = await import("/src/stations.js");
  const inventory = await import("/src/inventory.js");
  const grid = await import("/src/grid.js");
  const items = await import("/src/items.js");
  const info = await import("/src/item-info.js");
  const clock = await import("/src/clock.js");
  const belt0 = inventory.beltOf(me) ? inventory.beltOf(me).slice() : null;
  const saved = { gx: me.gx, gy: me.gy, main: me.hands.main, off: me.hands.off, bag: JSON.parse(JSON.stringify(inventory.bagOf(me).items)), paused: G.loop.isPaused(), aggro: G.rules.rules.zombieAggro, villageStations: G.rules.rules.villageStations, clock: clock.getElapsed(), hunger: me.hunger, thirst: me.thirst, tired: me.tired, hp: me.hp };
  const made = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const bag = () => inventory.bagOf(me);
  const fillBag = (list) => { bag().items = []; for (const [id, n] of list) grid.add(bag(), id, n); for (const id of ["hammer", "knife"]) grid.insert(bag(), items.makeEntry(id, 1)); };
  const put = (sprite, at, extra = {}) => { const pr = map.createProp({ sprite, tile: at, ...extra }); map.placeProp(pr, at[0], at[1]); made.push(pr); return pr; };
  const craft = (station, recipe, list) => {
    fillBag(list);
    const r = G.verbs.run("craft", G.world.world, me, { prop: station.id }, { recipe, count: 1 });
    if (!r.ok) return { ok: false, why: r.reason, got: [] };
    step(Math.ceil(stations.recipe(recipe).seconds * 60) + 4);
    const out = stations.outputOf(station);
    const got = out ? out.items.map((e) => ({ id: e.id, count: e.count || 1 })) : [];
    if (out) out.items = [];
    return { ok: true, got, left: bag().items.map((e) => `${e.id}${(e.count || 1) > 1 ? "x" + e.count : ""}`) };
  };
  const spent = (r) => r.ok && r.left.every((e) => e === "hammer" || e === "knife"); // nothing but the tools left: every ingredient taken
  const gave = (r, id, n = 1) => r.ok && r.got.some((g) => g.id === id && g.count === n) && spent(r);
  const show = (r) => (r.ok ? r.got.map((g) => `${g.id} x${g.count}`).join(", ") || "nothing" : `refused: ${r.why}`);
  try {
    G.loop.setPaused(true);
    G.rules.set({ zombieAggro: false });
    let field = null;
    for (let r = 0; r < 40 && !field; r++) {
      for (let dy = -r; dy <= r && !field; dy++) for (let dx = -r; dx <= r && !field; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(saved.gx) + dx;
        const y = Math.round(saved.gy) + dy;
        let ok = true;
        for (let j = -3; j <= 3 && ok; j++) for (let i = -3; i <= 3 && ok; i++) if (!map.isWalkableTile(x + i, y + j) || map.tileAt(x + i, y + j).room !== 0 || map.tileAt(x + i, y + j).prop) ok = false;
        if (ok) field = [x, y];
      }
    }
    if (!field) throw new Error("no open ground near the spawn");
    const [fx, fy] = field;
    G.teleport(fx, fy);
    step();
    const fire = put("campfire", [fx + 1, fy]);
    fire.fire.fuel = 6;
    fire.fire.lit = true;
    const oven = put("oven", [fx - 1, fy]);
    if (oven.fire) { oven.fire.lit = true; oven.fire.fuel = 6; }
    const bench = put("workbench", [fx, fy + 1]);
    const loom = put("loom", [fx, fy - 1]);
    const wheel = put("spinningwheel", [fx + 1, fy + 1]);

    // ---- raw meat cooked alone at a fire ----
    const cookedRows = ["hen", "rabbit", "venison", "beef", "mutton", "pork"].map((m) => [m, craft(fire, `${m}_cooked`, [[`${m}_raw`, 1]])]);
    row("each raw meat cooks alone at a fire (a hen, a rabbit, venison, beef, mutton, pork)", cookedRows.every(([m, r]) => gave(r, `${m}_cooked`)), cookedRows.map(([m, r]) => `${m}: ${show(r)}`).join("; "));

    // ---- raw meat in recipes ----
    // A raw meat on the belt, and one in a hand, are spent as one in the bag is (the review of #462: counted, never taken, pottage for ever).
    const belt = inventory.beltOf(me);
    let beltRow = "no belt";
    if (belt) {
      const slot = belt.findIndex((e) => !e);
      fillBag([["potato", 2], ["cabbage", 1]]);
      belt[slot] = items.makeEntry("beef_raw", 1);
      const r = G.verbs.run("craft", G.world.world, me, { prop: fire.id }, { recipe: "meat_pottage", count: 1 });
      step(Math.ceil(stations.recipe("meat_pottage").seconds * 60) + 4);
      const out = stations.outputOf(fire);
      beltRow = `${r.ok ? "made" : r.reason}; belt slot ${belt[slot] ? `${belt[slot].id} still there` : "emptied"}; output ${out ? out.items.map((e) => e.id).join(",") : "none"}`;
      const ok = r.ok && !belt[slot] && out && out.items.some((e) => e.id === "meat_pottage");
      if (out) out.items = [];
      belt[slot] = null;
      fillBag([["potato", 2], ["cabbage", 1]]);
      me.hands.main = items.makeEntry("pork_raw", 1);
      const r2 = G.verbs.run("craft", G.world.world, me, { prop: fire.id }, { recipe: "meat_pottage", count: 1 });
      step(Math.ceil(stations.recipe("meat_pottage").seconds * 60) + 4);
      const out2 = stations.outputOf(fire);
      const ok2 = r2.ok && !me.hands.main && out2 && out2.items.some((e) => e.id === "meat_pottage");
      beltRow += `; held: ${r2.ok ? "made" : r2.reason}, the hand ${me.hands.main ? `${me.hands.main.id} still held` : "emptied"}`;
      if (out2) out2.items = [];
      me.hands.main = null;
      row("a raw meat on the belt, and one in a hand, go into a meat pottage and are spent", ok && ok2, beltRow);
    } else row("a raw meat on the belt, and one in a hand, go into a meat pottage and are spent", false, beltRow);
    const pottage = craft(fire, "meat_pottage", [["venison_raw", 1], ["potato", 2], ["cabbage", 1]]);
    const plain = stations.recipe("stew");
    row("the meat pottage takes any raw meat beside the plain pottage, which keeps its meatless recipe", gave(pottage, "meat_pottage") && items.getItem("stew").name === "Plain pottage" && !plain.in.some((w) => w.tag === "meat"), `${show(pottage)}; the plain one: ${plain.in.map((w) => `${w.id || w.tag} x${w.count}`).join(", ")}`);
    const stew = craft(fire, "hearty_stew", [["beef_raw", 1], ["pork_raw", 1], ["potato", 1], ["cabbage", 1], ["garlic", 1]]);
    row("the hearty stew takes two of any raw meat, mixed", gave(stew, "hearty_stew"), show(stew));
    const breakfast = craft(fire, "eggs_and_bacon", [["egg", 2], ["bacon", 1]]);
    row("eggs and bacon at a fire", gave(breakfast, "eggs_and_bacon"), show(breakfast));
    const cheese = craft(fire, "cheese", [["milk", 2]]);
    row("cheese from two jugs of milk at a fire", gave(cheese, "cheese"), show(cheese));
    const pemLard = craft(fire, "pemmican", [["mutton_raw", 1], ["garlic", 1], ["lard", 1]]);
    const pemHoney = craft(fire, "pemmican", [["hen_raw", 1], ["cabbage", 1], ["honey", 1]]);
    row("pemmican from meat, a plant, and a binder, lard or honey; it stacks", gave(pemLard, "pemmican", 2) && gave(pemHoney, "pemmican", 2) && items.getItem("pemmican").stack === 20, `with lard: ${show(pemLard)}; with honey: ${show(pemHoney)}`);
    const pie = craft(oven, "meat_pie", [["rabbit_raw", 1], ["flour", 1]]);
    row("a meat pie at the oven", gave(pie, "meat_pie"), show(pie));
    const butter = craft(bench, "butter", [["milk", 1]]);
    row("butter churned from milk at the workbench", gave(butter, "butter"), show(butter));
    const interact = await import("/src/interact.js");
    const carryOf = (pr) => interact.actionsForProp(pr, me).find((a) => a.kind === "carry");
    me.hands.main = null;
    me.hands.off = null;
    G.rules.rules.villageStations = true; // the oven movable, as a world's rule makes it (docs/43 section 5), put back in the finally
    fillBag([["rabbit_raw", 1], ["flour", 1]]);
    G.verbs.run("craft", G.world.world, me, { prop: oven.id }, { recipe: "meat_pie", count: 1 });
    const busyCarry = carryOf(oven);
    step(Math.ceil(stations.recipe("meat_pie").seconds * 60) + 4);
    const idleCarry = carryOf(oven);
    if (stations.outputOf(oven)) stations.outputOf(oven).items = [];
    G.rules.rules.villageStations = saved.villageStations;
    row("a station is not picked up while its queue runs, and is once it is done", !!busyCarry && !busyCarry.enabled && !!idleCarry && idleCarry.enabled, `busy: ${busyCarry ? `${busyCarry.label}, ${busyCarry.enabled}` : "no Pick up"}; done: ${idleCarry ? `${idleCarry.label}, ${idleCarry.enabled}` : "no Pick up"}`);

    // ---- the smoking rack and the tanning vat, made at the workbench and set beside it ----
    const before = new Set([...map.allProps()].map((p) => p.id));
    craft(bench, "smoking_rack", [["stick", 4], ["plank", 2]]);
    craft(bench, "tanning_vat", [["plank", 4], ["iron_bar", 1]]);
    const fresh = [...map.allProps()].filter((p) => !before.has(p.id));
    made.push(...fresh);
    const rack = fresh.find((p) => p.sprite === "smoking_rack");
    const vat = fresh.find((p) => p.sprite === "tanning_vat");
    const lift = (pr) => (pr ? interact.actionsForProp(pr, me).some((a) => a.kind === "carry") : true);
    row("a smoking rack and a tanning vat are made at the workbench and stand beside it, stations that are not carried off (the spinning wheel neither)", !!rack && !!vat && stations.stationOf(rack).includes("smoking_rack") && stations.stationOf(vat).includes("tanning_vat") && !lift(rack) && !lift(vat) && !lift(wheel), `${fresh.map((p) => p.sprite).join(", ") || "nothing set down"}; a Pick up on the rack ${lift(rack)}, the vat ${lift(vat)}, the wheel ${lift(wheel)}`);
    if (rack) {
      G.teleport(rack.tile[0], rack.tile[1] + 1);
      step();
      const smoked = craft(rack, "smoked_meat", [["pork_raw", 1], ["log", 1]]);
      row("smoked meat at the rack, a log spent", gave(smoked, "smoked_meat") && !smoked.left.some((e) => e.startsWith("log")), `${show(smoked)}; left ${smoked.left.join(", ")}`);
    }
    if (vat) {
      G.teleport(vat.tile[0], vat.tile[1] + 1);
      step();
      const leather = craft(vat, "leather", [["hide", 1]]);
      row("a hide tanned to leather at the vat", gave(leather, "leather"), show(leather));
    }
    G.teleport(fx, fy);
    step();

    // ---- wool: yarn and woollen cloth ----
    const yarn = craft(wheel, "yarn", [["wool", 2]]);
    const cloth = craft(loom, "woollen_cloth", [["yarn", 2]]);
    const torch = craft(bench, "torch", [["stick", 1], ["woollen_cloth", 1]]);
    row("wool spun to yarn at the spinning wheel, yarn woven to woollen cloth at the loom, and woollen cloth serves as cloth (a torch)", gave(yarn, "yarn") && gave(cloth, "woollen_cloth") && gave(torch, "torch"), `${show(yarn)}; ${show(cloth)}; ${show(torch)}`);
    const valleyWheel = [...map.allProps()].find((p) => p.sprite === "spinningwheel" && !made.includes(p));
    row("the valley's spinning wheel is a station now", !valleyWheel || stations.stationOf(valleyWheel).includes("spinning_wheel"), valleyWheel ? `at ${valleyWheel.tile}: ${stations.stationOf(valleyWheel).join(",")}` : "none loaded (the wheel's definition names the station)");

    // ---- fletched arrows ----
    const bare = craft(bench, "arrows", [["stick", 1]]);
    const fletched = craft(bench, "arrows", [["stick", 1], ["feather", 1]]);
    row("arrows are fletched: refused without a feather, five for one", !bare.ok && gave(fletched, "arrow", 5), `without: ${show(bare)}; with: ${show(fletched)}`);

    // ---- the cards ----
    const want = {
      venison_cooked: [/Eat: heals 6, fills hunger 34/, /Made at a cooking fire/],
      hen_cooked: [/Eat: heals 4, fills hunger 26/, /Made at a cooking fire/],
      rabbit_cooked: [/Eat: heals 4, fills hunger 26/, /Made at a cooking fire/],
      beef_cooked: [/Eat: heals 6, fills hunger 34/, /Made at a cooking fire/],
      mutton_cooked: [/Eat: heals 5, fills hunger 30/, /Made at a cooking fire/],
      pork_cooked: [/Eat: heals 5, fills hunger 30/, /Made at a cooking fire/],
      meat_pottage: [/Made at a cooking fire/],
      hearty_stew: [/Eat: heals 10, fills hunger 75/],
      eggs_and_bacon: [/Made at a cooking fire/],
      meat_pie: [/Made at the oven/],
      butter: [/Made at the workbench/],
      smoked_meat: [/Made at the smoking rack/],
      pemmican: [/Made at a cooking fire/, /Eat: heals 3, fills hunger 35/],
      yarn: [/Made at the spinning wheel/, /Goes into: woollen cloth/],
      woollen_cloth: [/Made at the loom/],
      leather: [/Made at the tanning vat/, /To come: the leather belt, the rucksack, and leather armour/],
      cheese: [/Made at a cooking fire/],
      venison_raw: [/Goes into:/, /Butchered from a deer/],
      lard: [/Goes into:.*pemmican/],
      feather: [/Goes into:.*arrow/],
      stew: [/^Plain pottage/],
    };
    const cards = Object.fromEntries(Object.keys(want).map((id) => [id, info.textOf(info.cardFor(items.makeEntry(id, 1))).join(" / ")]));
    const bad = Object.entries(want).filter(([id, res]) => !res.every((re) => re.test(cards[id])));
    row("every new item's card says what it does and where it is made; the raw meats, lard, and the feather say what they go into", bad.length === 0, bad.map(([id]) => `${id}: ${cards[id]}`).join(" || ") || Object.entries(cards).map(([id, t]) => `${id}: ${t}`).join(" || "));
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const p of made) if (map.propById(p.id)) map.removeProp(p);
    bag().items = saved.bag;
    if (belt0) inventory.beltOf(me).splice(0, belt0.length, ...belt0);
    clock.setElapsed(saved.clock);
    Object.assign(me, { hunger: saved.hunger, thirst: saved.thirst, tired: saved.tired, hp: saved.hp });
    me.hands.main = saved.main;
    me.hands.off = saved.off;
    me.action = null;
    me.auto = null;
    G.rules.set({ zombieAggro: saved.aggro });
    G.rules.rules.villageStations = saved.villageStations;
    G.teleport(saved.gx, saved.gy);
    G.loop.setPaused(saved.paused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
