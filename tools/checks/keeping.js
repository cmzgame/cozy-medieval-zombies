// Keeping, animals step 3 (docs/45, #444). From the console, on a tab with `?nosave` (the valley):
//   await __game.check("keeping")
// The lead, the shears, milk, wool, the egg, and hay as items with their cards, the lead made at the workbench and the shears at the anvil,
// the feeding trough in the build palette and one by each farm's stock; a cow led by the label a guest sends, following, let go where it
// stands, let go by itself when its leader is far, one lead for one animal; the byre's cows fed from their trough when the day turns, the
// grain taken; milk with a bucket once a day, greyed without one and when milked; the sheepfold's sheep shorn with shears, an unfed one
// greyed; Hollow Farm's hens laying into their coop; two cows fed in the byre breeding a calf with nobody near, and not the next day; hay
// from the scythe over grass; what a guest's record carries in the sync part. The farms' stock, troughs, and coop, the player, the bag,
// the hands, the clock, and the rules are put back, and anything added goes.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const A = await import("/src/entities/animal.js");
  const interact = await import("/src/interact.js");
  const inventory = await import("/src/inventory.js");
  const grid = await import("/src/grid.js");
  const items = await import("/src/items.js");
  const info = await import("/src/item-info.js");
  const stations = await import("/src/stations.js");
  const placement = await import("/src/placement.js");
  const combat = await import("/src/combat.js");
  const clock = await import("/src/clock.js");
  const saved = { gx: me.gx, gy: me.gy, aim: { ...me.aim }, main: me.hands.main, off: me.hands.off, bag: JSON.parse(JSON.stringify(inventory.bagOf(me).items)), clock: clock.getElapsed(), paused: G.loop.isPaused(), aggro: G.rules.rules.zombieAggro, stamina: me.stamina };
  const ids0 = new Set(S.animals.map((a) => a.id));
  const stock0 = S.animals.filter((a) => !A.isWild(a)).map((a) => [a, JSON.parse(JSON.stringify(A.serializeAnimal(a)))]);
  const props0 = [...G.map.allProps()].filter((p) => p.sprite === "feed_trough" || p.sprite === "chicken_coop").map((p) => [p, p.bag ? JSON.parse(JSON.stringify(p.bag)) : null, p.searched]);
  const others = S.players.filter((p) => p !== me);
  const otherAt = others.map((p) => [p.gx, p.gy]);
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const spawn = (species, gx, gy) => { const a = A.createAnimal(species, gx, gy, { home: [gx, gy] }); a.idleTimer = 999; S.animals.push(a); return a; };
  const bag = () => inventory.bagOf(me);
  const give = (id, n = 1) => grid.insert(bag(), items.makeEntry(id, n));
  const bagCount = (id) => inventory.countItem(bag(), id);
  const labels = (a) => interact.actionsForTarget({ kind: "character", id: a.id }, me).map((x) => `${x.label}${x.enabled === false ? " [grey]" : ""}`);
  const byLabel = (a, label) => interact.performByLabel(me, { kind: "character", id: a.id }, label);
  const work = (seconds) => step(Math.ceil(seconds * 60) + 10);
  const placeOf = (name) => ((S.info && S.info.places) || []).find((p) => p.name === name);
  const troughNear = (at) => [...G.map.allProps()].filter((p) => p.sprite === "feed_trough").sort((a, b) => Math.hypot(a.tile[0] - at[0], a.tile[1] - at[1]) - Math.hypot(b.tile[0] - at[0], b.tile[1] - at[1]))[0];
  const nextDay = () => { clock.setElapsed((A.today() + 1) * clock.DAY_LENGTH + 2); step(61); }; // a day turned, and the step's once-a-second pass run
  try {
    G.loop.setPaused(true);
    G.rules.rules.zombieAggro = false;
    for (const p of others) { p.gx = me.gx + 200; p.gy = me.gy; } // a guest in a two-tab run, far off: births wait while anyone is near

    // ---- the items, their cards, where they are made ----
    const want = {
      lead: [/Equip: main or off hand/, /Leads a tame animal; let go, it stays where it stands/, /Made at the workbench/],
      shears: [/Shears a fed sheep's wool/, /Made at the anvil/],
      milk: [/Eat: heals 1, fills hunger 4, quenches thirst 20/, /Milked from a fed cow, a bucket carried/],
      wool: [/Shorn from a fed sheep, shears carried/],
      egg: [/Eat: heals 1, fills hunger 6/, /Laid by a fed hen into its coop/],
      hay: [/Feed: put in a feeding trough/],
      grain: [/Feed: put in a feeding trough/],
      feather: [/Butchered from a hen/, /Laid by a fed hen into its coop/],
      bucket: [/Milks a fed cow/],
    };
    const cards = Object.fromEntries(Object.keys(want).map((id) => [id, info.textOf(info.cardFor(items.makeEntry(id, 1))).join(" / ")]));
    const badCards = Object.entries(want).filter(([id, res]) => !res.every((re) => re.test(cards[id])));
    row("the lead, shears, milk, wool, the egg, and hay have cards that say what they are for and where they come from; feed and the bucket say so too", badCards.length === 0, badCards.map(([id]) => `${id}: ${cards[id]}`).join(" || ") || Object.entries(cards).map(([id, t]) => `${id}: ${t}`).join(" || "));
    const rec = (id) => stations.recipes().find((r) => r.out && r.out.id === id);
    const trough = placement.buildKinds().find((k) => k.sprite === "feed_trough");
    row("the lead is made at the workbench, the shears at the anvil, and the feeding trough is in the build palette (planks)", rec("lead")?.station === "workbench" && rec("shears")?.station === "anvil" && !!trough && trough.cost.plank > 0, `${rec("lead")?.station}, ${rec("shears")?.station}, ${trough ? JSON.stringify(trough.cost) : "no trough"}`);
    const homes = S.animalHomes.filter((h) => !A.speciesOf(h.species).wild);
    const R = A.keepRule();
    const troughed = homes.map((h) => [h.species, troughNear(h.at)]).map(([sp, t]) => `${sp} ${t ? Math.hypot(t.tile[0] - homes.find((h) => h.species === sp).at[0], t.tile[1] - homes.find((h) => h.species === sp).at[1]).toFixed(1) : "none"}`);
    row("every farm's stock has a feeding trough within its reach of home", homes.length >= 4 && homes.every((h) => { const t = troughNear(h.at); return t && Math.hypot(t.tile[0] - h.at[0], t.tile[1] - h.at[1]) <= R.feedReach; }), troughed.join(", "));

    // ---- the lead ----
    let field = null;
    for (let r = 0; r < 40 && !field; r++) {
      for (let dy = -r; dy <= r && !field; dy++) for (let dx = -r; dx <= r && !field; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(saved.gx) + dx;
        const y = Math.round(saved.gy) + dy;
        let ok = true;
        for (let j = -6; j <= 6 && ok; j++) for (let i = -6; i <= 6 && ok; i++) if (!G.map.isWalkableTile(x + i, y + j) || G.map.tileAt(x + i, y + j).room !== 0) ok = false;
        if (ok) field = [x, y];
      }
    }
    if (!field) throw new Error("no open ground near the spawn");
    const [fx, fy] = field;
    G.teleport(fx, fy);
    bag().items = [];
    me.hands.main = null;
    me.hands.off = null;
    step();
    const cow = spawn("cow", fx + 1, fy);
    const noLead = labels(cow);
    give("lead");
    byLabel(cow, "Lead the cow");
    const ledNow = cow.state === "led" && cow.leaderId === me.id;
    const second = spawn("cow", fx + 1, fy + 1);
    const inUse = labels(second);
    // Walk away by small steps; the cow follows.
    for (let k = 1; k <= 5; k++) { G.teleport(fx - k, fy); step(30); }
    const follow = Math.hypot(cow.gx - me.gx, cow.gy - me.gy);
    row("a cow takes the lead by its label (greyed with no lead), follows its leader, and a second waits for a second lead", /Lead the cow \(you need a lead\) \[grey\]/.test(noLead.join("|")) && ledNow && follow <= R.leadClose + 1.2 && inUse.some((l) => /Lead the cow \(your lead is in use\) \[grey\]/.test(l)), `with none: ${noLead.join(" | ")}; led ${ledNow}; ${follow.toFixed(1)} tiles behind after five tiles; the second: ${inUse.join(" | ")}`);
    byLabel(cow, "Let go of the cow");
    const at = [Math.round(cow.gx), Math.round(cow.gy)];
    row("let go, it stays where it was let go: that is its home now", cow.state !== "led" && cow.leaderId === null && cow.home[0] === at[0] && cow.home[1] === at[1], `state ${cow.state}, home ${cow.home}`);
    byLabel(cow, "Lead the cow");
    G.teleport(fx + R.leadReach + 8, fy);
    step(5);
    row("led and left far behind, it lets go by itself where it stands", cow.state !== "led" && cow.leaderId === null, `state ${cow.state}, leader ${cow.leaderId}`);
    G.teleport(fx, fy);
    step();

    // ---- feeding, milk, wool, eggs ----
    const byre = placeOf("Hollow Farm's byre");
    const cows = S.animals.filter((a) => a.species === "cow" && !a.dead && ids0.has(a.id));
    const byreTrough = cows.length ? troughNear(cows[0].home) : null;
    if (!byre || !byreTrough || cows.length < 2) throw new Error("the byre, its trough, or its two cows are missing (run on the valley)");
    for (const c of cows) { c.fedDay = -1; c.takenDay = -1; c.bredDay = -1; c.lastDay = A.today(); }
    interact.propBag(byreTrough).items = [];
    grid.insert(byreTrough.bag, items.makeEntry("grain", 1));
    grid.insert(byreTrough.bag, items.makeEntry("grain", 1));
    grid.insert(byreTrough.bag, items.makeEntry("grain", 1));
    const sheep = S.animals.filter((a) => a.species === "sheep" && !a.dead && ids0.has(a.id));
    const foldTrough = sheep.length ? troughNear(sheep[0].home) : null;
    for (const q of sheep) { q.fedDay = -1; q.takenDay = -1; q.bredDay = 99999; q.lastDay = A.today(); }
    if (foldTrough) interact.propBag(foldTrough).items = [];
    const hens = S.animals.filter((a) => a.species === "hen" && !a.dead && ids0.has(a.id));
    const henTrough = hens.length ? troughNear(hens[0].home) : null;
    const coop = [...G.map.allProps()].find((p) => p.sprite === "chicken_coop" && hens.length && Math.hypot(p.tile[0] - hens[0].home[0], p.tile[1] - hens[0].home[1]) <= R.coopReach);
    for (const h of hens) { h.fedDay = -1; h.lastDay = A.today(); h.bredDay = 99999; }
    if (henTrough) { interact.propBag(henTrough).items = []; for (let i = 0; i < 3; i++) grid.insert(henTrough.bag, items.makeEntry("cabbage", 1)); }
    if (coop) interact.propBag(coop).items = [];
    G.teleport(byre.box[0] + byre.box[2] + 60, byre.box[1] + 5); // far from the byre, so a birth is out of sight
    const before = S.animals.filter((a) => a.species === "cow" && !a.dead).length;
    nextDay();
    const day1 = A.today();
    const fed = cows.every((c) => c.fedDay === day1);
    const grainLeft = byreTrough.bag.items.filter((e) => e.id === "grain").length;
    const calves = S.animals.filter((a) => a.species === "cow" && !a.dead).length - before;
    const calf = S.animals.find((a) => a.species === "cow" && !ids0.has(a.id) && a !== cow && a !== second);
    row("when the day turns the byre's cows eat from their trough, a unit each", fed && grainLeft === 1, `fed ${cows.map((c) => c.fedDay).join(",")} on day ${day1}; grain left ${grainLeft} of 3`);
    row("two cows fed in a pen with room, nobody near, breed a calf in the pen", calves === 1 && !!calf && calf.homeId === cows[0].homeId && A.penOf(cows[0]).has(`${Math.round(calf.gx)},${Math.round(calf.gy)}`), `${calves} born${calf ? ` at ${Math.round(calf.gx)},${Math.round(calf.gy)}` : ""}`);
    const eggs = coop ? coop.bag.items.filter((e) => e.id === "egg").length : 0;
    row("Hollow Farm's hens, fed, lay into their coop", !!coop && hens.length > 0 && hens.every((h) => h.fedDay === day1) && eggs >= hens.length, coop ? `${hens.length} hens, ${eggs} eggs, ${coop.bag.items.filter((e) => e.id === "feather").length} feathers in the coop` : "no coop by the hens");
    // Milk and wool, at the pens.
    const c0 = cows[0];
    G.teleport(c0.gx + 1, c0.gy);
    step();
    const noBucket = labels(c0);
    give("bucket");
    byLabel(c0, "Milk the cow");
    work(A.workSeconds("milk"));
    const milked = bagCount("milk");
    const again = labels(c0);
    row("a fed cow is milked with a bucket carried, once a day: greyed without one, and after", /Milk the cow \(you need a bucket\) \[grey\]/.test(noBucket.join("|")) && milked >= 1 && again.some((l) => /Milk the cow \(it has been milked today\) \[grey\]/.test(l)), `${noBucket.find((l) => l.startsWith("Milk"))}; milk +${milked}; then ${again.find((l) => l.startsWith("Milk"))}`);
    if (sheep.length) {
      const q = sheep[0];
      G.teleport(q.gx + 1, q.gy);
      step();
      give("shears");
      const hungry = labels(q);
      q.fedDay = A.today(); // fed by hand for the row (its trough was left empty, so it was not)
      byLabel(q, "Shear the sheep");
      work(A.workSeconds("shear"));
      row("an unfed sheep's shearing is greyed; fed, shears carried, it gives its wool", hungry.some((l) => /Shear the sheep \(the sheep has not been fed today\) \[grey\]/.test(l)) && bagCount("wool") >= 1, `${hungry.find((l) => l.startsWith("Shear"))}; wool +${bagCount("wool")}`);
    }
    // The next day: fed again, but they bred yesterday.
    G.teleport(byre.box[0] + byre.box[2] + 60, byre.box[1] + 5);
    const cowsNow = S.animals.filter((a) => a.species === "cow" && !a.dead).length;
    nextDay();
    row("the day after, they do not breed again (every few days)", S.animals.filter((a) => a.species === "cow" && !a.dead).length === cowsNow, `${cowsNow} cows, then ${S.animals.filter((a) => a.species === "cow" && !a.dead).length}`);

    // ---- hay ----
    G.teleport(fx, fy);
    step();
    bag().items = [];
    const scythe = items.makeEntry("scythe", 1);
    me.hands.main = scythe;
    me.aim = { sx: 1, sy: 0.5 };
    me.attackCooldown = 0;
    me.stamina = 100;
    combat.tryAttack(me, S.zombies);
    step(30);
    row("the scythe over open grass cuts hay", bagCount("hay") === 1, `hay ${bagCount("hay")}`);
    me.hands.main = null;

    // ---- what a guest's record carries: the leader, the fed and taken days ----
    const h0 = G.game.syncParts().animals;
    c0.takenDay = -1;
    const h1 = G.game.syncParts().animals;
    second.leaderId = me.id;
    const h2 = G.game.syncParts().animals;
    second.leaderId = null;
    row("the sync part's hash moves with the day an animal's milk was taken and with who leads it", h0 !== h1 && h1 !== h2, `${h0}, ${h1}, ${h2}`);
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    S.animals.splice(0, S.animals.length, ...S.animals.filter((a) => ids0.has(a.id)));
    for (const [a, d] of stock0) Object.assign(a, d, { path: [], anim: { ...d.anim } });
    for (const [p, b, searched] of props0) { p.bag = b; p.searched = searched; }
    for (const [i, p] of others.entries()) { p.gx = otherAt[i][0]; p.gy = otherAt[i][1]; }
    bag().items = saved.bag;
    me.hands.main = saved.main;
    me.hands.off = saved.off;
    me.aim = saved.aim;
    me.stamina = saved.stamina;
    me.action = null;
    clock.setElapsed(saved.clock);
    G.rules.rules.zombieAggro = saved.aggro;
    G.teleport(saved.gx, saved.gy);
    G.loop.setPaused(saved.paused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
