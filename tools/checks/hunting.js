// Hunting, animals step 2 (docs/45, #443). From the console, on a tab with `?nosave` (the valley):
//   await __game.check("hunting")
// On open ground near the spawn, with the dead's aggro off: a sword's blow kills a deer and the carcass keeps "melee", an arrow's "bow"
// with the arrow lodged, a halberd's "halberd"; a tame cow beside one of the dead is passed by a swing that would hit both, and hit when
// it is the one thing aimed at; an arrow landing between a cow and one of the dead takes the dead one, and a spell passes the cow; a boar
// struck charges the player and bites; Skin and Butcher, by the labels a guest sends, greyed with no dirk and with "skin it first", the
// yields by the weapon's share (a bow's whole, a halberd's nothing), a hen's feathers and a pig's bacon and lard, the arrow back, the
// butchered carcass gone from the list; a snare set from the bag, its catch from a home of rabbits unseen, none with a player near, its
// Look at, set again once the catch is taken; game's tracks near the player and none for stock; the record and the sync part; every new
// item's card. Everything is put back: the player, the bag, the hands, health, the clock, the rules, and every animal added or changed.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const A = await import("/src/entities/animal.js");
  const combat = await import("/src/combat.js");
  const archery = await import("/src/archery.js");
  const interact = await import("/src/interact.js");
  const inventory = await import("/src/inventory.js");
  const grid = await import("/src/grid.js");
  const items = await import("/src/items.js");
  const info = await import("/src/item-info.js");
  const setdown = await import("/src/setdown.js");
  const tracks = await import("/src/tracks.js");
  const clock = await import("/src/clock.js");
  const stations = await import("/src/stations.js");
  const { createZombie } = await import("/src/entities/zombie.js");
  const saved = { gx: me.gx, gy: me.gy, hp: me.hp, stamina: me.stamina, aim: { ...me.aim }, main: me.hands.main, off: me.hands.off, bag: JSON.parse(JSON.stringify(inventory.bagOf(me).items)), clock: clock.getElapsed(), paused: G.loop.isPaused(), aggro: G.rules.rules.zombieAggro, multi: G.rules.rules.multiHit };
  const ids0 = new Set(S.animals.map((a) => a.id));
  const zombies0 = S.zombies.slice();
  const restoreAfter = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const spawn = (species, gx, gy) => { const a = A.createAnimal(species, gx, gy, { home: [gx, gy] }); a.idleTimer = 999; S.animals.push(a); return a; };
  const face = (t) => {
    const s = G.iso.toScreen(t.gx, t.gy);
    const o = G.iso.toScreen(me.gx, me.gy);
    const n = G.iso.normalize(s.x - o.x, s.y - o.y - 0.001);
    me.aim.sx = n.x;
    me.aim.sy = n.y;
  };
  const hold = (id) => { const e = id ? items.makeEntry(id, 1) : null; me.hands.main = e; me.hands.off = e && items.getItem(id).hands === "both" ? e : null; };
  const swing = (t) => { face(t); me.attackCooldown = 0; me.offCooldown = 0; me.shoveCooldown = 0; me.swingLock = 0; me.stamina = 100; me.action = null; return combat.tryAttack(me, S.zombies) || []; };
  const bagCount = (id) => inventory.countItem(inventory.bagOf(me), id);
  const byLabel = (a, label) => interact.performByLabel(me, { kind: "character", id: a.id }, label);
  const labels = (a) => interact.actionsForTarget({ kind: "character", id: a.id }, me).map((x) => `${x.label}${x.enabled === false ? " [grey]" : ""}`);
  const work = (seconds) => step(Math.ceil(seconds * 60) + 10);
  try {
    G.loop.setPaused(true);
    G.rules.rules.zombieAggro = false;
    // Open ground: the nearest outdoor spot with five tiles of walkable ground every way (the spawn is indoors).
    let field = null;
    for (let r = 0; r < 40 && !field; r++) {
      for (let dy = -r; dy <= r && !field; dy++) for (let dx = -r; dx <= r && !field; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(saved.gx) + dx;
        const y = Math.round(saved.gy) + dy;
        let ok = true;
        for (let j = -5; j <= 5 && ok; j++) for (let i = -5; i <= 5 && ok; i++) if (!G.map.isWalkableTile(x + i, y + j) || G.map.tileAt(x + i, y + j).room !== 0) ok = false;
        if (ok) field = [x, y];
      }
    }
    if (!field) throw new Error("no open ground within forty tiles of the spawn");
    G.teleport(field[0], field[1]);
    step();
    const [fx, fy] = field;

    // ---- kills by weapon (docs/45 section 2) ----
    // Deer and rabbits run from a player who comes near: the shots below are at ones stood still (idle for ever, the flight off for the
    // row), since the point is the blow, not the stalk.
    const deerSp = A.speciesOf("deer");
    const flee0 = deerSp.flee;
    restoreAfter.push(() => { deerSp.flee = flee0; });
    deerSp.flee = null;
    hold("sword");
    const d1 = spawn("deer", fx + 1, fy);
    let blows = 0;
    while (!d1.dead && blows < 6) { swing(d1); blows++; step(40); }
    row("a sword's blows kill a deer, and the carcass keeps the class of the weapon: melee", d1.dead && d1.killedBy === "melee" && d1.state === "dead" && S.animals.includes(d1), `dead ${d1.dead} after ${blows} blows, killed by ${d1.killedBy}, hp ${d1.hp}`);
    hold("halberd");
    const d2 = spawn("deer", fx + 1, fy + 1);
    blows = 0;
    while (!d2.dead && blows < 6) { swing(d2); blows++; step(70); }
    row("a halberd's kill is a halberd's", d2.dead && d2.killedBy === "halberd", `killed by ${d2.killedBy} after ${blows}`);
    hold(null);
    const d3 = spawn("deer", fx + 4, fy);
    let landed = null;
    const onLand = (e) => { landed = e; };
    G.events.on("arrowLanded", onLand);
    for (let k = 0; k < 3 && !d3.dead; k++) {
      archery.shoot(me, [1, 0], 4, 1, { damage: 40 });
      step(90);
    }
    G.events.off && G.events.off("arrowLanded", onLand);
    row("an arrow's kill is the bow's, and the arrow stays in it", d3.dead && d3.killedBy === "bow" && (d3.lodged && d3.lodged.arrow >= 1), `killed by ${d3.killedBy}, lodged ${JSON.stringify(d3.lodged || {})}, landed ${landed ? (landed.hit ? landed.hit.kind : "on nothing") : "never"}`);
    deerSp.flee = flee0;

    // ---- livestock is hurt only on purpose, in either Multi-hit mode (off is the intended way to play) ----
    hold("sword");
    const dropAnimal = (a) => { const i = S.animals.indexOf(a); if (i >= 0) S.animals.splice(i, 1); };
    for (const multi of [false, true]) {
      G.rules.rules.multiHit = multi;
      // One of the dead straight ahead and a cow nearer, off to the side within the wedge: the swing aimed at the dead one.
      const z = createZombie(fx + 1.3, fy, { aggro: false });
      z.state = "idle";
      S.zombies.push(z);
      const cow = spawn("cow", fx + 0.85, fy + 0.3);
      const zHp = z.hp;
      swing(z);
      step(40);
      const side = `cow ${cow.hp} of ${cow.maxHp}, the dead one ${zHp} to ${z.hp}`;
      const passed = cow.hp === cow.maxHp && z.hp < zHp;
      S.zombies.splice(S.zombies.indexOf(z), 1);
      dropAnimal(cow);
      // Two cows in a pen, 0.7 tiles apart, the swing aimed at the nearer: it strikes that one, and only it.
      const cowA = spawn("cow", fx + 1, fy);
      const cowB = spawn("cow", fx + 1.4, fy + 0.55);
      swing(cowA);
      step(40);
      const pen = `the aimed cow ${cowA.hp}, the other ${cowB.hp}`;
      const struck = cowA.hp < cowA.maxHp && cowB.hp === cowB.maxHp;
      dropAnimal(cowA);
      dropAnimal(cowB);
      row(`Multi-hit ${multi ? "on" : "off"}: a swing at one of the dead passes a nearer cow by, and a swing into a pen strikes the cow aimed at and no other`, passed && struck, `${side}; ${pen}`);
    }
    G.rules.rules.multiHit = true;
    const wildRabbit = spawn("rabbit", fx + 1, fy + 0.6);
    A.speciesOf("rabbit").flee && (wildRabbit.lookTimer = 99);
    const z2 = createZombie(fx + 1, fy - 0.6, { aggro: false });
    z2.state = "idle";
    S.zombies.push(z2);
    const rHp = wildRabbit.hp;
    swing({ gx: fx + 1, gy: fy });
    step(10);
    row("wild game takes a blow as anything does, beside one of the dead", wildRabbit.hp < rHp || wildRabbit.dead, `rabbit ${rHp} to ${wildRabbit.hp}${wildRabbit.dead ? " (dead)" : ""}`);
    S.zombies.splice(S.zombies.indexOf(z2), 1);
    // An arrow landing between a cow and one of the dead takes the dead one; a spell passes the cow; an arrow at the cow alone hurts it.
    hold(null);
    const cow2 = spawn("cow", fx + 4, fy - 0.25);
    const z3 = createZombie(fx + 4, fy + 0.35, { aggro: false });
    z3.state = "idle";
    S.zombies.push(z3);
    const c2 = cow2.hp;
    const z3hp = z3.hp;
    archery.shoot(me, [1, 0], 4, 1, { damage: 20 });
    step(90);
    const arrowPassed = cow2.hp === c2 && z3.hp < z3hp;
    S.zombies.splice(S.zombies.indexOf(z3), 1);
    archery.shoot(me, [1, 0], 4, 1, { damage: 20, vanish: true, flat: true, projectile: "fireball" });
    step(90);
    const spellPassed = cow2.hp === c2;
    archery.shoot(me, [1, 0], 4, 1, { damage: 20 });
    step(90);
    row("an arrow landing between a cow and one of the dead takes the dead one; a spell passes the cow; an arrow at the cow alone hurts it", arrowPassed && spellPassed && cow2.hp < c2, `cow ${c2}, the dead one ${z3hp} to ${z3.hp}; after the spell cow ${spellPassed ? c2 : "hurt"}; after the last arrow cow ${cow2.hp}`);

    // ---- the boar fights back ----
    const boar = spawn("boar", fx + 3, fy + 2);
    const hp0 = me.hp;
    me.hp = 100;
    A.damageAnimal(boar, 5, { by: me, cls: "melee", from: [me.gx, me.gy] });
    let charged = false;
    let bit = false;
    let attackAnim = false;
    const onBite = () => { bit = true; };
    G.events.on("animalBite", onBite);
    for (let i = 0; i < 60 * 6 && !bit; i++) { step(); if (boar.state === "charge") charged = true; if (boar.anim.name === "attack") attackAnim = true; }
    G.events.off && G.events.off("animalBite", onBite);
    const took = 100 - me.hp;
    row("a boar struck by a player charges and bites (its sheet's attack)", charged && attackAnim && bit && took > 0, `charged ${charged}, attack ${attackAnim}, bit ${bit}, the player took ${took}`);
    G.teleport(fx + 30, fy);
    for (let i = 0; i < 60 * 3 && boar.state === "charge"; i++) step();
    row("it gives up past its giving-up distance", boar.state !== "charge", `state ${boar.state}`);
    // A shield met the bite: the guard takes it, and the boar is not staggered as one of the dead would be (it has no stagger, and no hurt pose).
    {
      const shield = items.makeEntry("shield", 1);
      const off0 = me.hands.off;
      me.hands.off = shield;
      me.blocking = true;
      me.stamina = 100;
      boar.gx = me.gx + 1;
      boar.gy = me.gy;
      face(boar);
      const taken = combat.guardAgainst(me, boar, 10);
      const clean = boar.stagger === undefined && boar.knock === undefined && boar.anim.name !== "hurt";
      me.blocking = false;
      me.hands.off = off0;
      row("a shield meets the boar's bite, and the boar is not staggered as the dead are", taken < 10 && clean, `took ${taken} of 10; stagger ${boar.stagger}, anim ${boar.anim.name}`);
    }
    G.teleport(fx, fy);
    step();
    me.hp = hp0;
    const deerCharge = spawn("deer", fx + 3, fy - 2);
    A.damageAnimal(deerCharge, 1, { by: me, cls: "melee", from: [me.gx, me.gy] });
    row("a deer struck runs (it never fights)", deerCharge.state === "flee" || deerCharge.state === "alert", deerCharge.state);

    // ---- skinning and butchering, by the labels a guest sends ----
    // The deer's venison fixed at four for these rows, so the shares tell apart: a bow's four, a melee kill's three, a halberd's none.
    const deerYields = deerSp.yields;
    restoreAfter.push(() => { deerSp.yields = deerYields; });
    deerSp.yields = { skin: deerYields.skin, butcher: [{ id: "venison_raw", count: [4, 4] }] };
    const knife = items.makeEntry("knife", 1);
    hold(null);
    for (const a of [d1, d2, d3]) { a.gx = fx + 1; a.gy = fy; }
    const noDirk = labels(d1);
    row("with no dirk Skin is greyed with why, and Butcher says skin it first", noDirk.some((l) => /^Skin the deer \(you need a dirk\) \[grey\]$/.test(l)) && noDirk.some((l) => /^Butcher the deer \(skin it first\) \[grey\]$/.test(l)), noDirk.join(" | "));
    grid.insert(inventory.bagOf(me), knife);
    const hide0 = bagCount("hide");
    const ven0 = bagCount("venison_raw");
    byLabel(d1, "Skin the deer");
    work(A.workSeconds("skin"));
    const skinnedHide = bagCount("hide") - hide0;
    byLabel(d1, "Butcher the deer");
    work(A.workSeconds("butcher"));
    const venMelee = bagCount("venison_raw") - ven0;
    step(2);
    row("a dirk carried, Skin then Butcher by their labels: a melee kill's hide (three quarters of one: one or none by the chance of the rest) and three quarters of four venison, three", d1.skinned && skinnedHide <= 1 && venMelee === 3 && !S.animals.includes(d1), `hide +${skinnedHide}, venison +${venMelee}, the carcass ${S.animals.includes(d1) ? "still listed" : "gone from the list"}`);
    const ven1 = bagCount("venison_raw");
    const arrows0 = bagCount("arrow");
    byLabel(d3, "Skin the deer");
    work(A.workSeconds("skin"));
    byLabel(d3, "Butcher the deer");
    work(A.workSeconds("butcher"));
    const venBow = bagCount("venison_raw") - ven1;
    row("a bow's kill gives the whole yield, four of four, and its arrow comes back with the meat", venBow === 4 && bagCount("arrow") - arrows0 >= 1, `venison +${venBow}, arrows +${bagCount("arrow") - arrows0}`);
    const hide2 = bagCount("hide");
    const ven2 = bagCount("venison_raw");
    byLabel(d2, "Skin the deer");
    work(A.workSeconds("skin"));
    byLabel(d2, "Butcher the deer");
    work(A.workSeconds("butcher"));
    row("a halberd's kill is ruined: no hide and no meat", bagCount("hide") === hide2 && bagCount("venison_raw") === ven2 && !S.animals.includes(d2), `hide +${bagCount("hide") - hide2}, venison +${bagCount("venison_raw") - ven2}`);
    inventory.bagOf(me).items = [knife]; // room for what comes next: the yields above have filled the kit's sack
    const hen = spawn("hen", fx + 1, fy);
    A.damageAnimal(hen, 99, { by: me, cls: "bow" });
    const henLabels = labels(hen);
    const f0 = bagCount("feather");
    byLabel(hen, "Butcher the hen");
    work(A.workSeconds("butcher"));
    const feathers = bagCount("feather") - f0;
    row("a hen has nothing to skin; butchered it gives its meat and three to five feathers", !henLabels.some((l) => l.startsWith("Skin")) && feathers >= 3 && feathers <= 5 && bagCount("hen_raw") >= 1, `${henLabels.join(" | ")}; feathers +${feathers}, hen +${bagCount("hen_raw")}`);
    const pig = spawn("pig", fx + 1, fy);
    A.damageAnimal(pig, 99, { by: me, cls: "bow" });
    byLabel(pig, "Butcher the pig");
    work(A.workSeconds("butcher"));
    row("a pig butchered gives pork, bacon, and lard", bagCount("pork_raw") >= 2 && bagCount("bacon") >= 1 && bagCount("lard") >= 1, `pork ${bagCount("pork_raw")}, bacon ${bagCount("bacon")}, lard ${bagCount("lard")}`);
    const alive = spawn("deer", fx + 1, fy);
    alive.lookTimer = 99;
    row("a living animal has no Skin or Butcher, only Look at", labels(alive).join(" | ") === "Look at the deer", labels(alive).join(" | "));

    // ---- the carcass in the record and the sync part ----
    const boarDead = spawn("boar", fx + 2, fy);
    A.damageAnimal(boarDead, 99, { by: me, cls: "thrown" });
    const rec = A.serializeAnimal(boarDead);
    const back = A.restoreAnimal(JSON.parse(JSON.stringify(rec)));
    const h0 = G.game.syncParts().animals;
    boarDead.killedBy = "bow";
    const h1 = G.game.syncParts().animals;
    boarDead.skinned = true;
    const h2 = G.game.syncParts().animals;
    boarDead.killedBy = "thrown";
    boarDead.skinned = false;
    row("a carcass's class and skinning are in its record and come back, and the sync part's hash moves with each", rec.killedBy === "thrown" && back.dead && back.killedBy === "thrown" && back.skinned === false && h0 !== h1 && h1 !== h2 && h2 !== h0, `record ${rec.killedBy}/${rec.skinned}, restored ${back.killedBy}/${back.skinned}; the animals part ${h0}, then ${h1} (bow), then ${h2} (skinned)`);

    // ---- snares ----
    const snareRow = stations.recipes().find((r) => r.out && r.out.id === "snare");
    row("a snare is made at the workbench", !!snareRow && snareRow.station === "workbench", snareRow ? JSON.stringify(snareRow.in) : "no recipe");
    inventory.bagOf(me).items = [knife];
    const sn = items.makeEntry("snare", 1);
    grid.insert(inventory.bagOf(me), sn);
    const placedOk = setdown.place(me, sn.uid, fx + 1, fy - 1);
    const prop = G.map.tileAt(fx + 1, fy - 1).prop;
    row("set down outdoors from the bag, it is a snare set from now, walked over", placedOk && !!prop && !!prop.snare && prop.snare.holds === null && prop.solid === false, prop ? JSON.stringify(prop.snare) + ` solid ${prop.solid}` : "nothing set");
    if (prop && prop.snare) {
      // Every other player (a guest in a two-tab run) out past the clear distance for these rows, and back after: a catch waits while
      // anyone is near, rightly (Primary's two-tab run of #456).
      const others = S.players.filter((p) => p !== me);
      const otherAt = others.map((p) => [p.gx, p.gy]);
      restoreAfter.push(() => others.forEach((p, i) => { p.gx = otherAt[i][0]; p.gy = otherAt[i][1]; }));
      for (const p of others) { p.gx = fx + A.renewRule().clear + 20; p.gy = fy; }
      const home = { id: "hsnare", species: "rabbit", at: [fx + 6, fy + 2], count: 1, cap: 1, renew: true, nextAt: null };
      const rab = spawn("rabbit", fx + 6, fy + 2);
      rab.homeId = "hsnare";
      const H = A.GAME_HOUR;
      clock.setElapsed(prop.snare.setAt + A.snareRule().hours * H - 5);
      const early = A.snareStep([prop], S.animals, [home], []).length;
      clock.setElapsed(prop.snare.setAt + A.snareRule().hours * H + 5);
      const watched = A.snareStep([prop], S.animals, [home], [me]).length;
      const caught = A.snareStep([prop], S.animals, [home], []).length;
      row("after its hours, with a home of rabbits near and nobody to see, it holds one of theirs: a carcass on the snare, the snare's", early === 0 && watched === 0 && caught === 1 && rab.dead && rab.killedBy === "snare" && rab.gx === fx + 1 && rab.gy === fy - 1 && prop.snare.holds === rab.id, `early ${early}, watched ${watched}, caught ${caught}; the rabbit ${rab.dead ? "dead" : "alive"} by ${rab.killedBy} at ${rab.gx},${rab.gy}`);
      row("its Look at says what it holds", A.snareLine(prop) === "The snare holds a rabbit.", A.snareLine(prop));
      const caughtAt = clock.getElapsed();
      byLabel(rab, "Skin the rabbit");
      work(A.workSeconds("skin"));
      byLabel(rab, "Butcher the rabbit");
      work(A.workSeconds("butcher"));
      A.snareStep([prop], S.animals, [home], []); // the world's own pass may have set it again during the butchering already: either way
      const reset = prop.snare.holds === null && prop.snare.setAt >= caughtAt; // set again from the moment its catch was gone
      row("once the catch is taken it is set again", reset && bagCount("rabbit_raw") >= 1, `holds ${prop.snare.holds}, set at ${prop.snare.setAt.toFixed(1)}, rabbit meat ${bagCount("rabbit_raw")}`);
      others.forEach((p, i) => { p.gx = otherAt[i][0]; p.gy = otherAt[i][1]; });
      clock.setElapsed(saved.clock);
      G.map.removeProp ? G.map.removeProp(prop) : null;
    }

    // ---- tracks ----
    tracks.reset();
    const walker = spawn("deer", fx - 3, fy);
    const stock = spawn("sheep", fx - 3, fy + 1);
    tracks.update(S.animals);
    for (let k = 1; k <= 5; k++) { walker.gx = fx - 3 + k; stock.gx = fx - 3 + k; clock.setElapsed(clock.getElapsed() + 1); tracks.update(S.animals); }
    const prints = tracks.near(me);
    row("game leaves prints the way it went, seen near the player; stock leaves none", prints.length >= 4 && prints.every((p) => p.species === "deer" && p.dx > 0.9), `${prints.length} prints, ${[...new Set(prints.map((p) => p.species))].join(",")}`);
    G.teleport(fx + 40, fy);
    row("and none past the radius", tracks.near(me).length === 0, `${tracks.near(me).length} seen from 40 tiles`);
    G.teleport(fx, fy);
    tracks.reset();

    // ---- the cards ----
    const cards = {};
    for (const id of ["hen_raw", "rabbit_raw", "venison_raw", "beef_raw", "mutton_raw", "pork_raw", "bacon", "lard", "hide", "feather", "snare"]) cards[id] = info.textOf(info.cardFor(items.makeEntry(id, 1))).join(" / ");
    const want = {
      venison_raw: [/Eat: heals 1, fills hunger 14/, /Butchered from a deer, a dirk carried/],
      pork_raw: [/Butchered from a boar or a pig/],
      hide: [/Skinned from a rabbit, a deer, a boar, a cow or a sheep, a dirk carried/],
      feather: [/Butchered from a hen/],
      bacon: [/Butchered from a pig/],
      lard: [/Butchered from a pig/],
      snare: [/Place: set down outdoors/, /Set near rabbits, it holds one after about 6 game hours/],
    };
    const bad = Object.entries(want).filter(([id, res]) => !res.every((re) => re.test(cards[id])));
    row("every new item's card says what it is and where it comes from (read from the data)", bad.length === 0 && Object.values(cards).every((t) => t.length > 0), bad.map(([id]) => `${id}: ${cards[id]}`).join(" || ") || Object.entries(cards).map(([id, t]) => `${id}: ${t.replace(/\n/g, " / ")}`).join(" || "));
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const r of restoreAfter.reverse()) r();
    S.animals.splice(0, S.animals.length, ...S.animals.filter((a) => ids0.has(a.id)));
    S.zombies.splice(0, S.zombies.length, ...zombies0);
    inventory.bagOf(me).items = saved.bag;
    me.hands.main = saved.main;
    me.hands.off = saved.off;
    me.hp = saved.hp;
    me.stamina = saved.stamina;
    me.aim = saved.aim;
    me.action = null;
    clock.setElapsed(saved.clock);
    G.rules.rules.zombieAggro = saved.aggro;
    G.rules.rules.multiHit = saved.multi;
    G.teleport(saved.gx, saved.gy);
    G.loop.setPaused(saved.paused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
