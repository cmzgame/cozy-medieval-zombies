// Durability is kills (docs/30, law 5 and 5.2): a weapon's `kills` is its
// life; a landed hit costs it one over kills times the hits a kill takes
// against the standard zombie; a miss costs nothing; at the last hit the
// weapon is gone from the hand with a word. From the console:
// await __game.check("wear")
// It pauses the loop, puts a stick in the main hand, stands the dead in front
// of the player one at a time, swings through them with the loop stepped, and
// puts the hands and the dead back.
// Then repairs that run out (docs/43 section 6, #410), `?nosave`: the data (each made weapon's `repair`, the ladders); at the valley's
// grindstone a worn sword in hand is offered "Sharpen arming sword (35% to 60%)" and a mace is not; the label run as a guest's command is
// (`performByLabel` on the grindstone's id) a timed bar, then 60% and one repair counted, the card "2 repairs left"; at once again refused
// (40% is below it); the anvil without a hammer and without an iron bar greyed with the need, then the second repair to 80% spending the
// bar; the third at the grindstone to 20%; past the last rung both greyed "worn past repair" and the verb refused, the card "past repair";
// a hoe at the anvil for a plank; the count in the save and the sync check's entry text (wear and the count). On a guest it reads the replica:
// both places' menus built from what it has, by an address the host can rebuild, and a carried entry's count on its card. The hands, the bag,
// and the place are put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const done = () => {
    const failed = rows.filter((r) => r.result === "FAIL").length;
    console.table(rows);
    return { rows, pass: rows.length - failed, fail: failed };
  };
  // On a guest the durability rows are the host's (a swing resolves on the host, and a guest's console does not teleport, #102):
  // it reads the repairs' menus off the replica alone.
  if (G.net.status().role === "guest") {
    await repairs(G, row);
    return done();
  }
  const wasPaused = G.loop.isPaused();
  const p = G.player;
  const saved = { main: p.hands.main, off: p.hands.off, gx: p.gx, gy: p.gy, aim: { ...p.aim }, aggro: G.rules.rules.zombieAggro, multi: G.rules.rules.multiHit };
  G.loop.setPaused(true);
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const added = [];
  try {
    G.rules.set({ zombieAggro: false });
    G.rules.set({ multiHit: false });
    const stickDef = G.items.getItem("stick");
    const per = G.items.wearPerHit(stickDef);
    const hpk = G.items.hitsPerKill(stickDef);
    row("a stick's wear per hit is one over kills times hits a kill", Math.abs(per - 1 / (stickDef.weapon.kills * hpk)) < 1e-9 && stickDef.weapon.kills === 5, `kills ${stickDef.weapon.kills}, ${hpk} hits a kill, ${(per * 100).toFixed(2)} percent a hit`);
    // The stick in hand, the player on open ground facing east.
    const open = G.map.nearestWalkable(Math.round(p.gx) + 4, Math.round(p.gy), (x, y) => G.map.roomAt(x, y) !== 0 || !!G.map.tileAt(x, y).prop || !!G.map.tileAt(x + 1, y).prop);
    G.teleport(open[0], open[1]);
    p.hands.main = G.items.makeEntry("stick", 1);
    p.hands.off = null;
    const stick = p.hands.main;
    step();
    let swings = 0;
    let landed = 0;
    let misses = 0;
    const wearBefore = stick.wear || 0;
    // A swing at nothing: a miss costs nothing.
    p.aim.sx = 1; p.aim.sy = 0;
    G.combat.tryAttack(p, G.zombies, "main");
    step(Math.ceil(stickDef.weapon.swing * 60) + 2);
    misses++;
    row("a miss costs nothing", (stick.wear || 0) === wearBefore, `wear ${((stick.wear || 0) * 100).toFixed(2)} percent after a swing at air`);
    // Then the dead, one at a time in front, until the stick is spent.
    const total = stickDef.weapon.kills * hpk;
    let z = null;
    let guard = 0;
    while (p.hands.main === stick && guard++ < total * 3) {
      if (!z || z.dead) {
        z = G.zombies.find((zz) => !zz.dead && Math.hypot(zz.gx - p.gx, zz.gy - p.gy) < 2) || null;
        if (!z) {
          const s = G.iso.toScreen(p.gx + 0.9, p.gy);
          const d = G.iso.toGrid(s.x, s.y);
          z = G.entities ? null : null;
          const made = (await import("/src/entities/zombie.js")).createZombie(p.gx + 0.9, p.gy);
          G.zombies.push(made);
          added.push(made);
          z = made;
        }
      }
      // Each swing finds it a step east again: a hit knocks it back, and with aggro off it wanders.
      z.gx = p.gx + 0.9;
      z.gy = p.gy;
      z.knock = null;
      const s = G.iso.toScreen(z.gx, z.gy);
      const o = G.iso.toScreen(p.gx, p.gy);
      const n = G.iso.normalize(s.x - o.x, s.y - o.y - 0.001);
      p.aim.sx = n.x; p.aim.sy = n.y;
      const hpBefore = z.hp;
      const hit = G.combat.tryAttack(p, G.zombies, "main");
      swings++;
      if (hit && hit.length) landed += hit.length;
      step(Math.ceil(stickDef.weapon.swing * 60) + 2);
      if (z.hp === hpBefore && !(hit && hit.length)) misses++;
    }
    row("the stick is spent on its last kill's last hit", p.hands.main === null && landed === total, `${landed} landed hits of ${total} (${swings} swings, ${misses} at air), the hand ${p.hands.main ? "still holds it" : "is empty"}`);
    // About five: a floored one takes the finisher's extra, so a stick can see a sixth off; the number is a design number, not a count.
    const corpses = added.filter((zz) => zz.dead).length;
    row("about five of the dead fell to it", Math.abs(corpses - stickDef.weapon.kills) <= 2, `${corpses} fell (the stick's number is ${stickDef.weapon.kills})`);
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message });
  } finally {
    for (const zz of added) { const i = G.zombies.indexOf(zz); if (i >= 0) G.zombies.splice(i, 1); const j = G.corpses.indexOf(zz); if (j >= 0) G.corpses.splice(j, 1); }
    p.hands.main = saved.main;
    p.hands.off = saved.off;
    Object.assign(p.aim, saved.aim);
    G.teleport(saved.gx, saved.gy);
    G.rules.set({ zombieAggro: saved.aggro });
    G.rules.set({ multiHit: saved.multi });
    G.loop.setPaused(wasPaused);
  }
  await repairs(G, row);
  return done();
}

// Repairs that run out (docs/43 section 6, #410): the grindstone and the anvil on one count per item.
async function repairs(G, row) {
  const info = await import("/src/item-info.js");
  const me = G.player;
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const counts0 = bag0.map((e) => [e, e.count]);
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const belt = G.inventory.beltOf(me);
  const belt0 = belt ? belt.slice() : null;
  const meAt = [me.gx, me.gy];
  const wasPaused = G.loop.isPaused();
  const role = G.net.status().role;
  // A guest's console does not teleport (docs/31/07 question 14, #102): there the replica's own player is stood directly, the camera
  // with it, and the host's next frame puts it back where the host has it.
  const standAt = (gx, gy) => { if (role !== "guest") return G.teleport(gx, gy); me.gx = gx; me.gy = gy; me.auto = null; G.camera.snapTo(gx, gy); };
  const W = G.tuning.work;
  const pct = (e) => 100 - Math.round((e.wear || 0) * 100);
  const card = (e) => info.textOf(info.cardFor(e)).join(" | ");
  const acts = (prop) => G.interact.actionsForTarget({ kind: "prop", id: prop.id }, me);
  const labels = (prop) => acts(prop).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}`);
  const finish = () => { for (let i = 0; i < 600 && me.action; i++) G.interact.updateAction(me, 1 / 30); };
  // Stand where the menu's walk would stop: a tile in reach with a clear line (the smithy's walls are round them).
  const standBy = (prop) => { const t = G.interact.approachTile(acts(prop)[0], me); if (t) standAt(t[0], t[1]); G.loop.advance(1 / 60); };
  try {
    G.loop.setPaused(true);
    const sword = G.items.getItem("sword");
    row("repairs: the made weapons and tools name their material, the edged ones say so; the ladders are 60, 40, 20 and 100, 80, 60", sword.repair && sword.repair.with === "iron_bar" && sword.repair.edged === true && G.items.getItem("mace").repair.edged !== true && G.items.getItem("hoe").repair.with === "plank" && !G.items.getItem("torch").repair && !G.items.getItem("stick").repair && JSON.stringify(W.grindstone.ceilings) === "[0.6,0.4,0.2]" && JSON.stringify(W.anvil.ceilings) === "[1,0.8,0.6]", `sword ${JSON.stringify(sword.repair)}, grindstone ${JSON.stringify(W.grindstone.ceilings)}, anvil ${JSON.stringify(W.anvil.ceilings)}`);
    G.map.ensureAround(101, 188, 3); // the smithy (tools/mapgen/valley.py: the forge, the anvil, the grindstone)
    const stone = G.map.allProps().find((p) => p.sprite === "grindstone");
    const anvil = G.map.allProps().find((p) => p.sprite === "anvil");
    row("the valley has a grindstone and an anvil, and each names itself a repairing place", !!stone && !!anvil && G.assets.getDef("grindstone").repair === "grindstone" && G.assets.getDef("anvil").repair === "anvil", `${stone ? stone.tile : "no grindstone"}, ${anvil ? anvil.tile : "no anvil"}`);
    if (!stone || !anvil) return;

    if (role === "guest") {
      // A guest reads the replica: each place's menu is built from what it has, named by the prop's address the host rebuilds.
      standBy(stone);
      const s = acts(stone).filter((a) => a.kind === "sharpen");
      const a = acts(anvil).filter((q) => q.kind === "repair");
      row("on a guest the grindstone's and the anvil's menus are built from the replica, by the props' addresses", s.length > 0 && a.length > 0 && s.every((q) => q.target && q.target.id === stone.id) && a.every((q) => q.target && q.target.id === anvil.id), `${s.map((q) => q.label).join(", ")} || ${a.map((q) => q.label).join(", ")}`);
      const counted = [me.hands.main, me.hands.off, ...(G.inventory.beltOf(me) || []), ...bag.items].filter((e) => e && e.repairs > 0);
      row("on a guest a carried entry's repair count reaches the replica and its card says it (run after a repair as this guest)", counted.length > 0 && counted.every((e) => /repairs? left|past repair/.test(card(e))), counted.length ? counted.map((e) => `${e.id} r${e.repairs} w${Math.round((e.wear || 0) * 100)}`).join(", ") : "nothing repaired is carried");
      return;
    }

    bag.items.length = 0;
    if (belt) belt.fill(null);
    me.hands.main = null;
    me.hands.off = null;
    standBy(stone);
    row("the grindstone with nothing worn carried: one greyed line that says what it does", JSON.stringify(labels(stone)) === JSON.stringify(["Sharpen (no dull blade carried) [off]"]), labels(stone).join(" | "));
    const blade = G.items.makeEntry("sword", 1, { wear: 0.65 });
    const mace = G.items.makeEntry("mace", 1, { wear: 0.5 });
    me.hands.main = blade;
    G.inventory.stow(me, mace);
    const first = "Sharpen arming sword (35% to 60%)";
    row("a worn sword in hand is offered to 60%; a mace, blunt, is not", labels(stone).includes(first) && !labels(stone).some((l) => /mace/.test(l)), labels(stone).join(" | "));
    const did = G.interact.performByLabel(me, { kind: "prop", id: stone.id }, first);
    const timed = !!me.action && me.action.action.duration === W.grindstone.seconds;
    finish();
    row("run as a guest's command (the label on the grindstone's id): a timed bar, then 60% and one repair", did && timed && pct(blade) === 60 && blade.repairs === 1, `ran ${did}, bar ${timed}, ${pct(blade)}%, repairs ${blade.repairs}`);
    row("its card says 60% left and 2 repairs left, and where it is repaired", /60% left · 2 repairs left/.test(card(blade)) && /Repaired at an anvil with an iron bar, or sharpened at a grindstone; 3 repairs in all\./.test(card(blade)), card(blade));
    const again = G.verbs.run("sharpen", G.world, me, { prop: stone.id, uid: blade.uid });
    row("sharpened again at once: refused, the stone's next rung (40%) is below it", !again.ok && /sharp as the stone/.test(again.reason) && blade.repairs === 1, String(again.reason));
    const blunt = G.verbs.run("sharpen", G.world, me, { prop: stone.id, uid: mace.uid });
    row("the mace refused at the grindstone by the verb too", !blunt.ok && /edge/.test(blunt.reason), String(blunt.reason));
    row("the sword at 60% (the stone's next rung 40%) and a blunt mace: one greyed line, nothing it can better", JSON.stringify(labels(stone)) === JSON.stringify(["Sharpen (nothing it can better) [off]"]), labels(stone).join(" | "));

    standBy(anvil);
    blade.wear = 0.7;
    row("the anvil without a hammer: greyed with the need", labels(anvil).includes("Repair arming sword (need a smith's hammer) [off]"), labels(anvil).join(" | "));
    G.inventory.stow(me, G.items.makeEntry("hammer", 1));
    row("with a hammer and no iron bar: greyed with the need", labels(anvil).includes("Repair arming sword (need an iron bar) [off]"), labels(anvil).join(" | "));
    G.inventory.stow(me, G.items.makeEntry("iron_bar", 1));
    const second = "Repair arming sword (30% to 80%, an iron bar)";
    row("with both, the second rung: 30% to 80%", labels(anvil).includes(second), labels(anvil).join(" | "));
    const did2 = G.interact.performByLabel(me, { kind: "prop", id: anvil.id }, second);
    finish();
    row("repaired to 80% by the label, the iron bar spent, the count two", did2 && pct(blade) === 80 && blade.repairs === 2 && G.inventory.countAll(me, "iron_bar") === 0, `ran ${did2}, ${pct(blade)}%, repairs ${blade.repairs}, bars ${G.inventory.countAll(me, "iron_bar")}`);

    standBy(stone);
    blade.wear = 0.9;
    const third = "Sharpen arming sword (10% to 20%)";
    row("the third rung at the grindstone: 10% to 20%", labels(stone).includes(third), labels(stone).join(" | "));
    G.interact.performByLabel(me, { kind: "prop", id: stone.id }, third);
    finish();
    row("sharpened to 20%, the count three", pct(blade) === 20 && blade.repairs === 3, `${pct(blade)}%, repairs ${blade.repairs}`);
    blade.wear = 0.95;
    const past = labels(stone);
    standBy(anvil);
    G.inventory.stow(me, G.items.makeEntry("iron_bar", 1));
    row("past the last rung: greyed worn past repair at both", past.includes("Sharpen arming sword (worn past repair) [off]") && labels(anvil).includes("Repair arming sword (worn past repair) [off]"), `${past.join(" | ")} || ${labels(anvil).join(" | ")}`);
    const refused = G.verbs.run("repair", G.world, me, { prop: anvil.id, uid: blade.uid });
    row("the verb refuses it, the bar kept, and the card says past repair", !refused.ok && /past repair/.test(refused.reason) && G.inventory.countAll(me, "iron_bar") === 1 && /5% left · past repair/.test(card(blade)), `${refused.reason}; ${card(blade)}`);

    const hoe = G.items.makeEntry("hoe", 1, { wear: 0.6 });
    G.inventory.stow(me, hoe);
    G.inventory.stow(me, G.items.makeEntry("plank", 1));
    const hoeLabel = "Repair hoe (40% to 100%, a plank)";
    row("a hoe, wood, is repaired at the anvil for a plank", labels(anvil).includes(hoeLabel), labels(anvil).join(" | "));
    const rh = G.verbs.run("repair", G.world, me, { prop: anvil.id, uid: hoe.uid });
    row("to 100%, the plank spent, its wear gone, its count one", rh.ok && !(hoe.wear > 0) && hoe.repairs === 1 && G.inventory.countAll(me, "plank") === 0, `${rh.message || rh.reason}`);

    const saved = JSON.stringify(G.game.serialize());
    row("the count rides in the save with the entry", saved.includes(`"uid":"${blade.uid}"`) && /"repairs":3/.test(saved), "the sword's entry and repairs 3 in the save");
    const before = G.game.syncParts().players;
    blade.repairs = 2;
    const fewer = G.game.syncParts().players;
    blade.repairs = 3;
    blade.wear = 0.5;
    const worn = G.game.syncParts().players;
    row("the sync check's entry text gains the repair count and the wear (to the hundredth, as the wire compares it)", before !== fewer && before !== worn, `count moved it ${before !== fewer}, wear moved it ${before !== worn}`);
  } catch (e) {
    row("repairs: setup", false, e.message + (e.stack ? " " + e.stack.split("\n")[1] : ""));
  } finally {
    me.action = null;
    bag.items.splice(0, bag.items.length, ...bag0);
    for (const [e, n] of counts0) e.count = n;
    if (belt && belt0) belt.splice(0, belt.length, ...belt0);
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    standAt(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
}
