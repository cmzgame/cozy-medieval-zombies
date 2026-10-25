// Keeping, animals step 3 (docs/45, #444). From the console, on a tab with `?nosave` (the valley):
//   await __game.check("keeping")
// The lead, the shears, milk, wool, the egg, and hay as items with their cards (the lead and the shears drawn in the hand, grain, hay, and
// eggs stacking), the lead made at the workbench and the shears at the anvil, the feeding trough in the build palette and by each farm's
// stock, opening at once and taking feed alone; a cow led by the label a guest sends, keeping up with its leader at a walk and at a sprint
// down the west road, let go where it stands by hand, lost (its old home kept) when its leader is shut in a house or gone; the byre's cows
// eating from their own trough as soon as it is filled, never from one outside their fence; a calf born beside a parent with the player
// beside the pen, not the next day though both are fed, and none at the pen's cap; Hollow Farm's hens laying into their coop; milk with an
// empty bucket once a day, refused with a bucket of water; an unfed sheep's shearing greyed, then its wool; hay from the scythe over grass;
// the sync part's hash moving with the taken day and the leader. The farms' stock, troughs, and coop, the player, the bag, the hands, the
// clock, and the rules are put back, and anything added goes; every trough and coop put back is marked, so a guest in a two-tab run gets
// it too. `{ keep: true }` leaves the farms' stock, troughs, and coop as the check left them (Primary's two-tab run of #460):
//   await __game.check("keeping", { keep: true })   // on the host, a guest joined; then check("sync")

export async function run(game, opts = {}) {
  const keepWorld = !!opts.keep;
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
  const tuning = await import("/src/tuning.js");
  const saved = { gx: me.gx, gy: me.gy, aim: { ...me.aim }, main: me.hands.main, off: me.hands.off, bag: JSON.parse(JSON.stringify(inventory.bagOf(me).items)), clock: clock.getElapsed(), paused: G.loop.isPaused(), aggro: G.rules.rules.zombieAggro, stamina: me.stamina, hp: me.hp };
  const ids0 = new Set(S.animals.map((a) => a.id));
  const stock0 = S.animals.filter((a) => !A.isWild(a)).map((a) => [a, JSON.parse(JSON.stringify(A.serializeAnimal(a)))]);
  const props0 = [...G.map.allProps()].filter((p) => p.sprite === "feed_trough" || p.sprite === "chicken_coop").map((p) => [p, p.bag ? JSON.parse(JSON.stringify(p.bag)) : null, p.searched]);
  const others = S.players.filter((p) => p !== me);
  const otherAt = others.map((p) => [p.gx, p.gy]);
  const extraProps = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const spawn = (species, gx, gy) => { const a = A.createAnimal(species, gx, gy, { home: [gx, gy] }); a.idleTimer = 999; S.animals.push(a); return a; };
  const bag = () => inventory.bagOf(me);
  const give = (id, n = 1) => grid.insert(bag(), items.makeEntry(id, n));
  const bagCount = (id) => inventory.countItem(bag(), id);
  const labels = (a) => interact.actionsForTarget({ kind: "character", id: a.id }, me).map((x) => `${x.label}${x.enabled === false ? " [grey]" : ""}`);
  const byLabel = (a, label) => interact.performByLabel(me, { kind: "character", id: a.id }, label);
  const work = (seconds) => step(Math.ceil(seconds * 60) + 10);
  const placeOf = (name) => ((S.info && S.info.places) || []).find((p) => p.name === name);
  const fill = (trough, id, n) => { const b = interact.propBag(trough); b.items = []; if (n) grid.insert(b, items.makeEntry(id, n)); };
  const feedLeft = (trough) => (trough.bag ? trough.bag.items.reduce((n, e) => n + (e.count || 1), 0) : 0);
  const feedTime = () => step(6 * 60); // the troughs are looked for every fifth second
  const nextDay = () => { clock.setElapsed((A.today() + 1) * clock.DAY_LENGTH + 2); feedTime(); };
  const dropAnimal = (a) => { const i = S.animals.indexOf(a); if (i >= 0) S.animals.splice(i, 1); };
  try {
    G.loop.setPaused(true);
    G.rules.rules.zombieAggro = false;
    for (const p of others) { p.gx = me.gx + 200; p.gy = me.gy; } // a guest in a two-tab run, out of the way

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
    const held = ["lead", "shears"].filter((id) => !items.getItem(id).held);
    const stacks = ["grain", "hay", "egg"].map((id) => `${id} ${items.getItem(id).stack || 1}`);
    row("the lead and the shears are drawn in the hand; grain, hay, and eggs stack (twenty)", held.length === 0 && ["grain", "hay", "egg"].every((id) => items.getItem(id).stack === 20), `no held: ${held.join(",") || "none"}; ${stacks.join(", ")}`);
    const rec = (id) => stations.recipes().find((r) => r.out && r.out.id === id);
    const trough = placement.buildKinds().find((k) => k.sprite === "feed_trough");
    row("the lead is made at the workbench, the shears at the anvil, and the feeding trough is in the build palette (planks)", rec("lead")?.station === "workbench" && rec("shears")?.station === "anvil" && !!trough && trough.cost.plank > 0, `${rec("lead")?.station}, ${rec("shears")?.station}, ${trough ? JSON.stringify(trough.cost) : "no trough"}`);

    // The farms' troughs: one by each stock, opening at once, taking feed alone.
    const byre = placeOf("Hollow Farm's byre");
    const cows = S.animals.filter((a) => a.species === "cow" && !a.dead && ids0.has(a.id));
    const byreTrough = G.map.propById("feed_trough_byre");
    const sheep = S.animals.filter((a) => a.species === "sheep" && !a.dead && ids0.has(a.id));
    const foldTrough = G.map.propById("feed_trough_fold");
    const hens = S.animals.filter((a) => a.species === "hen" && !a.dead && ids0.has(a.id));
    const henTrough = G.map.propById("feed_trough_hens");
    const styTrough = G.map.propById("feed_trough_sty");
    if (!byre || !byreTrough || !foldTrough || !henTrough || !styTrough || cows.length < 2) throw new Error("the byre, its cows, or the four authored troughs are missing (run on the valley)");
    const openLabel = interact.actionsForProp ? interact.actionsForProp(byreTrough, me).map((a) => a.label) : [];
    const tb = interact.propBag(byreTrough);
    const refuses = !grid.fits(tb, "stick", 0, 0) && grid.fits(tb, "grain", 0, 0);
    row("the four authored troughs stand by the stock; each opens at once as the feeding trough and takes feed alone", openLabel.includes("Open feeding trough") && refuses, `${openLabel.join(" | ")}; a stick ${grid.fits(tb, "stick", 0, 0) ? "fits" : "refused"}, grain ${grid.fits(tb, "grain", 0, 0) ? "fits" : "refused"}`);
    for (const t of [byreTrough, foldTrough, henTrough, styTrough]) fill(t, "grain", 0);

    // ---- the lead, at a walk and at a sprint down the west road ----
    G.teleport(20, 158);
    bag().items = [];
    me.hands.main = null;
    me.hands.off = null;
    step(2);
    const walker = spawn("cow", 19, 158);
    give("lead");
    const noLeadCow = spawn("cow", 18, 159);
    byLabel(walker, "Lead the cow");
    const inUse = labels(noLeadCow);
    dropAnimal(noLeadCow);
    const walk = tuning.player.speed;
    const sprint = walk * tuning.player.sprintMult;
    let worst = 0;
    for (let i = 0; i < 60 * 12; i++) { G.teleport(me.gx + walk / 60, me.gy); step(); if (i > 120) worst = Math.max(worst, Math.hypot(walker.gx - me.gx, walker.gy - me.gy)); }
    const atWalk = walker.state === "led";
    let worstSprint = 0;
    for (let i = 0; i < 60 * 6; i++) { G.teleport(me.gx + sprint / 60, me.gy); step(); if (i > 120) worstSprint = Math.max(worstSprint, Math.hypot(walker.gx - me.gx, walker.gy - me.gy)); }
    const home0 = walker.home.slice();
    step(120); // the leader stops: the cow comes up beside it, within reach of the menu
    row(`a cow on the lead keeps up with its leader at a walk (${walk} tiles a second, 12 s) and a sprint (${sprint.toFixed(2)}, 6 s), and a second waits for a second lead`, atWalk && walker.state === "led" && worst <= 4 && worstSprint <= 5.5 && inUse.some((l) => /Lead the cow \(your lead is in use\) \[grey\]/.test(l)), `led after the walk ${atWalk}, after the sprint ${walker.state === "led"}; at most ${worst.toFixed(1)} and ${worstSprint.toFixed(1)} tiles behind; the second: ${inUse.find((l) => l.startsWith("Lead"))}`);
    byLabel(walker, "Let go of the cow");
    const here = [Math.round(walker.gx), Math.round(walker.gy)];
    row("let go by hand, where it stands is its home", walker.state !== "led" && walker.leaderId === null && walker.home[0] === here[0] && walker.home[1] === here[1] && (walker.home[0] !== home0[0] || walker.home[1] !== home0[1]), `home ${home0} to ${walker.home}`);
    // Its leader shut in a house it cannot reach: lost after its seconds, its home kept.
    const home = (S.info && S.info.spawn) || [Math.round(saved.gx), Math.round(saved.gy)]; // the map's spawn: inside your cottage, its door shut
    walker.home = [home[0] + 6, home[1] + 4];
    walker.gx = walker.home[0];
    walker.gy = walker.home[1];
    G.teleport(walker.gx + 1, walker.gy);
    step();
    byLabel(walker, "Lead the cow");
    const keptHome = walker.home.slice();
    G.teleport(home[0], home[1]); // inside the cottage, its door shut
    for (let i = 0; i < 60 * (A.keepRule().leadStuck + 2) && walker.state === "led"; i++) step();
    row("with no way to its leader (shut in a house) the lead is lost after its seconds, and the cow keeps its old home", walker.state !== "led" && walker.leaderId === null && walker.home[0] === keptHome[0] && walker.home[1] === keptHome[1], `state ${walker.state}, home ${walker.home} (was ${keptHome})`);
    // A leader gone from the world (a guest away): the lead is freed by the sweep, the home kept.
    G.teleport(walker.gx + 1, walker.gy);
    step();
    byLabel(walker, "Lead the cow");
    walker.leaderId = "P-gone";
    step(61);
    row("a lead whose leader is gone from the world is freed within a second, the home kept", walker.leaderId === null && walker.state !== "led" && walker.home[0] === keptHome[0], `leader ${walker.leaderId}, state ${walker.state}`);
    dropAnimal(walker);

    // ---- feeding: as soon as there is feed, from its own pen's trough ----
    for (const c of cows) { c.fedDay = -1; c.takenDay = -1; c.bredDay = 99999; c.lastDay = A.today(); }
    for (const q of sheep) { q.fedDay = -1; q.takenDay = -1; q.bredDay = 99999; }
    for (const h of hens) { h.fedDay = -1; h.bredDay = 99999; }
    G.teleport(byre.box[0] + byre.box[2] + 2, byre.box[1] + 5);
    step();
    // A trough just outside the byre's fence, near the cows' home, with feed in it: the penned cows do not eat from it.
    const outside = [byre.box[0] + byre.box[2] + 1, byre.box[1] + 2];
    const stray = G.map.createProp({ sprite: "feed_trough", tile: outside });
    G.map.placeProp(stray, outside[0], outside[1]);
    extraProps.push(stray);
    fill(stray, "grain", 5);
    feedTime();
    const fromOutside = cows.some((c) => c.fedDay === A.today());
    G.map.removeProp(stray);
    extraProps.length = 0;
    fill(byreTrough, "grain", 5);
    feedTime();
    const fedNow = cows.every((c) => c.fedDay === A.today());
    row("penned cows never eat from a trough outside their fence, and eat from their own as soon as it is filled, a unit each, the same day", !fromOutside && fedNow && feedLeft(byreTrough) === 3, `from outside ${fromOutside}; fed ${cows.map((c) => c.fedDay).join(",")} on day ${A.today()}; grain left ${feedLeft(byreTrough)} of 5`);

    // ---- breeding: beside a parent, with the player beside the pen; not again the next day; none at the cap ----
    for (const c of cows) c.bredDay = -1;
    const before = S.animals.filter((a) => a.species === "cow" && !a.dead).length;
    step(61);
    const calf = S.animals.find((a) => a.species === "cow" && !a.dead && !ids0.has(a.id));
    const near = calf ? Math.min(...cows.map((c) => Math.hypot(calf.gx - c.gx, calf.gy - c.gy))) : Infinity;
    const meToPen = Math.hypot(me.gx - cows[0].gx, me.gy - cows[0].gy);
    row("two cows fed in the byre have a calf beside a parent, with the player beside the pen", S.animals.filter((a) => a.species === "cow" && !a.dead).length === before + 1 && !!calf && near <= 2 && A.penOf(cows[0]).has(`${Math.round(calf.gx)},${Math.round(calf.gy)}`), `${calf ? `born ${near.toFixed(1)} tiles from a parent` : "none born"}; the player ${meToPen.toFixed(1)} tiles off`);
    fill(byreTrough, "grain", 10);
    nextDay();
    const allFed = cows.every((c) => c.fedDay === A.today()) && (!calf || calf.fedDay === A.today());
    const n1 = S.animals.filter((a) => a.species === "cow" && !a.dead).length;
    step(61);
    row("the next day, every cow fed, they do not breed again (every few days)", allFed && S.animals.filter((a) => a.species === "cow" && !a.dead).length === n1, `fed ${allFed}; ${n1} cows, then ${S.animals.filter((a) => a.species === "cow" && !a.dead).length}`);
    // The pen's cap: cows enough in the byre to reach it, all rested and fed: none is born.
    const cap = A.keepRule().penCap;
    const fillers = [];
    while (S.animals.filter((a) => a.species === "cow" && !a.dead && A.penOf(cows[0]).has(`${Math.round(a.gx)},${Math.round(a.gy)}`)).length < cap) {
      const f = spawn("cow", cows[0].home[0] + (fillers.length % 3) - 1, cows[0].home[1] + 2 + Math.floor(fillers.length / 3));
      f.homeId = cows[0].homeId;
      fillers.push(f);
    }
    for (const c of S.animals.filter((a) => a.species === "cow")) { c.bredDay = -1; c.fedDay = A.today(); }
    const atCap = S.animals.filter((a) => a.species === "cow" && !a.dead).length;
    step(61);
    row(`at the pen's cap (${cap} of a kind) none is born`, S.animals.filter((a) => a.species === "cow" && !a.dead).length === atCap, `${atCap} cows, then ${S.animals.filter((a) => a.species === "cow" && !a.dead).length}`);
    for (const f of fillers) dropAnimal(f);
    if (calf) dropAnimal(calf);

    // ---- hens lay; milk and wool ----
    fill(henTrough, "grain", 6);
    const coop = [...G.map.allProps()].find((p) => p.sprite === "chicken_coop" && hens.length && Math.hypot(p.tile[0] - hens[0].home[0], p.tile[1] - hens[0].home[1]) <= A.keepRule().coopReach);
    if (coop) interact.propBag(coop).items = [];
    for (const h of hens) h.fedDay = -1;
    feedTime();
    const eggs = coop ? coop.bag.items.filter((e) => e.id === "egg").reduce((n, e) => n + (e.count || 1), 0) : 0;
    row("Hollow Farm's hens, fed, lay into their coop", !!coop && hens.length > 0 && hens.every((h) => h.fedDay === A.today()) && eggs >= hens.length, coop ? `${hens.length} hens, ${eggs} eggs, ${coop.bag.items.filter((e) => e.id === "feather").length} feather stacks in the coop` : "no coop by the hens");
    const c0 = cows[0];
    c0.takenDay = -1;
    c0.state = "idle";
    c0.path = [];
    c0.idleTimer = 999; // it stands for the rows, within reach
    G.teleport(c0.gx + 1, c0.gy);
    step();
    bag().items = [];
    const noBucket = labels(c0);
    const wet = items.makeEntry("bucket", 1);
    wet.fill = 50;
    grid.insert(bag(), wet);
    const water = labels(c0);
    wet.fill = 0;
    byLabel(c0, "Milk the cow");
    work(A.workSeconds("milk"));
    const milked = bagCount("milk");
    const again = labels(c0);
    row("a fed cow is milked with an empty bucket carried, once a day: greyed without one, with a bucket of water, and after", /Milk the cow \(you need a bucket\) \[grey\]/.test(noBucket.join("|")) && /Milk the cow \(empty the bucket first\) \[grey\]/.test(water.join("|")) && milked >= 1 && again.some((l) => /Milk the cow \(it has been milked today\) \[grey\]/.test(l)), `${noBucket.find((l) => l.startsWith("Milk"))}; ${water.find((l) => l.startsWith("Milk"))}; milk +${milked}; then ${again.find((l) => l.startsWith("Milk"))}`);
    if (sheep.length) {
      const q = sheep[0];
      q.state = "idle";
      q.path = [];
      q.idleTimer = 999;
      G.teleport(q.gx + 1, q.gy);
      step();
      give("shears");
      const hungry = labels(q);
      fill(foldTrough, "grain", 4);
      feedTime();
      const shears = bag().items.find((e) => e.id === "shears");
      grid.remove(bag(), shears);
      const noShears = labels(q);
      grid.insert(bag(), shears);
      const shearLine = noShears.find((l) => l.startsWith("Shear")) || "no Shear line";
      row("a fed sheep with no shears carried is greyed \"(you need shears)\", never \"a shears\"", /^Shear the sheep \(you need shears\) \[grey\]$/.test(shearLine), shearLine);
      byLabel(q, "Shear the sheep");
      work(A.workSeconds("shear"));
      row("an unfed sheep's shearing is greyed; its trough filled, it eats, and shears carried give its wool", hungry.some((l) => /Shear the sheep \(the sheep has not been fed today\) \[grey\]/.test(l)) && q.fedDay === A.today() && bagCount("wool") >= 1, `${hungry.find((l) => l.startsWith("Shear"))}; fed ${q.fedDay}; wool +${bagCount("wool")}`);
    }

    // ---- hay ----
    G.teleport(20, 150);
    step();
    bag().items = [];
    me.hands.main = items.makeEntry("scythe", 1);
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
    cows[1].leaderId = me.id;
    const h2 = G.game.syncParts().animals;
    cows[1].leaderId = null;
    row("the sync part's hash moves with the day an animal's milk was taken and with who leads it", h0 !== h1 && h1 !== h2, `${h0}, ${h1}, ${h2}`);
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const p of extraProps) G.map.removeProp(p);
    S.animals.splice(0, S.animals.length, ...S.animals.filter((a) => ids0.has(a.id)));
    if (!keepWorld) {
      for (const [a, d] of stock0) Object.assign(a, d, { path: [], anim: { ...d.anim } });
      for (const [p, b, searched] of props0) { p.bag = b; p.searched = searched; G.map.markDirty(p.tile[0], p.tile[1]); } // marked: a guest's replica gets them back too
    }
    for (const [i, p] of others.entries()) { p.gx = otherAt[i][0]; p.gy = otherAt[i][1]; }
    bag().items = saved.bag;
    me.hands.main = saved.main;
    me.hands.off = saved.off;
    me.aim = saved.aim;
    me.stamina = saved.stamina;
    me.hp = saved.hp;
    me.action = null;
    me.auto = null;
    clock.setElapsed(saved.clock);
    G.rules.rules.zombieAggro = saved.aggro;
    G.teleport(saved.gx, saved.gy);
    G.loop.setPaused(saved.paused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
