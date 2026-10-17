// Burning made real (#14; Michael, 2026-10-15): a status like bleeding, capped at one, never more than its cap over a
// burn, only on the dead; set by a torch's blow (its `ignite` chance), always by the fireball and a fire arrow; arrows
// dipped in a lit fire become fire arrows, which a bow draws first and which lodge as plain ones; a body that dies
// burning burns on; the old menu toggle is gone. From the console, on a ?nosave tab:
// await __game.check("burn")
// It pauses the loop, works on open ground with the dead it brings and takes away, and puts the player's hands, place,
// and settings back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const p = G.player;
  const saved = { main: p.hands.main, off: p.hands.off, gx: p.gx, gy: p.gy, aim: { ...p.aim }, aggro: G.rules.rules.zombieAggro, multi: G.rules.rules.multiHit };
  G.loop.setPaused(true);
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const { createZombie } = await import("/src/entities/zombie.js");
  const archery = await import("/src/archery.js");
  const use = await import("/src/use.js");
  const burn = G.burn;
  const B = burn.BURN;
  const added = [];
  const bring = (gx, gy) => {
    const z = createZombie(gx, gy);
    z.target = null;
    G.zombies.push(z);
    added.push(z);
    return z;
  };
  const face = (z) => {
    const s = G.iso.toScreen(z.gx, z.gy);
    const o = G.iso.toScreen(p.gx, p.gy);
    const n = G.iso.normalize(s.x - o.x, s.y - o.y - 0.001);
    p.aim.sx = n.x;
    p.aim.sy = n.y;
  };
  const flyOut = () => { for (let i = 0; i < 600 && archery.arrowsInFlight().length; i++) step(); };
  try {
    G.rules.set({ zombieAggro: false });
    G.rules.set({ multiHit: false });
    const open = G.map.nearestWalkable(Math.round(p.gx) + 4, Math.round(p.gy), (x, y) => {
      for (let dx = -1; dx <= 8; dx++) for (let dy = -2; dy <= 2; dy++) {
        const t = G.map.peekTile(x + dx, y + dy);
        if (!t || G.map.roomAt(x + dx, y + dy) !== 0 || t.prop || !G.map.isWalkableTile(x + dx, y + dy)) return true;
      }
      return false;
    });
    G.teleport(open[0], open[1]);
    p.hands.main = null;
    p.hands.off = null;
    step();

    // 1. The menu toggle is gone: no "Set on fire" on one of the dead, a villager, or yourself.
    const z0 = bring(p.gx + 1, p.gy);
    step();
    const v = (G.villagers || [])[0];
    const menus = [["one of the dead", z0], ["yourself", p], ...(v ? [[v.name || "a villager", v]] : [])].map(([who, c]) => [who, G.interact.actionsForTarget({ kind: "character", id: c.id }, p).map((a) => a.label || "")]);
    const any = menus.some(([, ls]) => ls.length);
    row("no Set on fire / Put out in any character's menu", any && !menus.some(([, ls]) => ls.some((l) => /fire|put out/i.test(l))), menus.map(([who, ls]) => `${who}: ${ls.join(", ") || "(none)"}`).join("; "));

    // 2. Only the dead burn: a player never.
    row("a player cannot be set alight", burn.ignite(p) === false && !p.burning, `ignite(player) refused`);

    // 3. The cap: refreshed every three seconds for thirty, a full-health body loses no more than the cap.
    z0.hp = 100;
    burn.ignite(z0);
    let refreshes = 0;
    for (let s = 0; s < 30 * 60; s++) {
      if (s % 180 === 0 && s > 0) { burn.ignite(z0); refreshes++; }
      z0.gx = p.gx + 1; z0.gy = p.gy;
      step();
    }
    const lost = 100 - z0.hp;
    row("one burn takes no more than its cap however often refreshed", lost <= B.cap + 1e-6 && lost >= Math.min(B.cap, B.dps * B.duration) - 0.05, `lost ${lost.toFixed(2)} over 30 s with ${refreshes} refreshes (cap ${B.cap}, ${B.dps}/s for ${B.duration} s)`);
    // A plain burn left alone: dps times duration, then out.
    z0.hp = 100;
    z0.burning = false;
    burn.ignite(z0);
    step(Math.ceil(B.duration * 60) + 30);
    row("a plain burn runs its duration and goes out", !z0.burning && Math.abs(100 - z0.hp - Math.min(B.cap, B.dps * B.duration)) < 0.1, `lost ${(100 - z0.hp).toFixed(2)}, burning ${z0.burning}`);
    // The cap at one: a second source mid-burn refreshes, it never stacks the rate.
    z0.hp = 100;
    burn.ignite(z0);
    step(60);
    burn.ignite(z0);
    step(60);
    row("a second source never stacks the rate", Math.abs(100 - z0.hp - 2 * B.dps) < 0.05 && Math.abs(z0.burnLeft - (B.duration - 1)) < 0.05, `lost ${(100 - z0.hp).toFixed(2)} in 2 s (one rate: ${(2 * B.dps).toFixed(2)}), ${z0.burnLeft.toFixed(2)} s left`);
    z0.burning = false;

    // 4. A body that dies burning burns on as a corpse, then goes out.
    const z1 = bring(p.gx + 1, p.gy + 1);
    z1.hp = 1;
    burn.ignite(z1);
    step(3 * 60);
    const corpseBurning = z1.dead && z1.burning;
    step(Math.ceil(B.duration * 60));
    row("a body that dies burning burns on, then goes out", corpseBurning && !z1.burning, `dead ${z1.dead}, burning after death ${corpseBurning}, out by its timer ${!z1.burning}`);

    // 5. The torch: its chance over many landed blows (the dead one kept alive and put out each time, the torch kept whole).
    const torch = G.items.getItem("torch");
    const chance = torch.weapon.ignite;
    p.hands.main = G.items.makeEntry("torch", 1);
    const z2 = bring(p.gx + 0.9, p.gy);
    let landed = 0;
    let lit = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      z2.gx = p.gx + 0.9; z2.gy = p.gy; z2.knock = null; z2.hp = 100; z2.burning = false; z2.state = "idle";
      p.hands.main.wear = 0;
      p.stamina = p.maxStamina || 100;
      face(z2);
      const hit = G.combat.tryAttack(p, G.zombies, "main");
      if (hit && hit.includes(z2)) {
        landed++;
        if (z2.burning) lit++;
      }
      step(Math.ceil(torch.weapon.swing * 60) + 2);
    }
    const share = landed ? lit / landed : 0;
    const sd = Math.sqrt(chance * (1 - chance) / Math.max(1, landed));
    row("a torch's blow sets alight at its chance", landed > N * 0.8 && Math.abs(share - chance) < 4 * sd, `${lit} of ${landed} landed blows (${(share * 100).toFixed(1)} percent; the torch's ignite ${chance})`);
    // A blow with any other weapon never does.
    p.hands.main = G.items.makeEntry("stick", 1);
    let stickLit = 0;
    for (let i = 0; i < 40; i++) {
      z2.gx = p.gx + 0.9; z2.gy = p.gy; z2.knock = null; z2.hp = 100; z2.burning = false;
      p.hands.main.wear = 0;
      p.stamina = p.maxStamina || 100;
      face(z2);
      G.combat.tryAttack(p, G.zombies, "main");
      if (z2.burning) stickLit++;
      step(40);
    }
    row("a stick never sets alight", stickLit === 0, `${stickLit} of 40`);
    z2.burning = false;

    // 6. The fireball always sets its target alight (through the spell's own numbers, the book's).
    const spell = G.items.getItem("book_of_fire").book.spell;
    z2.gx = p.gx - 6; // out of the way: the fireball bursts on the first body ahead
    z0.gx = p.gx - 6;
    const z3 = bring(p.gx + 5, p.gy);
    z3.hp = 100;
    archery.shoot(p, [1, 0], 5, 1, { projectile: "fireball", damage: spell.damage, speed: spell.speed, flat: true, vanish: true, z0: spell.z0, knockback: 0, contact: spell.contact, landRadius: spell.landRadius, ignite: !!spell.ignite });
    flyOut();
    row("the fireball always sets its target alight", z3.burning === true || (z3.dead && z3.burning), `hp ${Math.round(z3.hp)}, burning ${z3.burning}, the spell's ignite ${spell.ignite}`);
    z3.burning = false;

    // 7. Fire arrows: arrows used on a lit fire, the whole stack at once; the bow draws them first; a hit sets alight
    // and lodges a plain arrow; with none left the bow draws plain ones again.
    let fire = null;
    for (const f of G.map.fires()) if (f.fire && f.fire.burns) { fire = f; break; }
    if (!fire) {
      row("a lit fire to dip at", false, "no fire on the map");
    } else {
      const wasLit = fire.fire.lit;
      const wasFuel = fire.fire.fuel;
      fire.fire.lit = true;
      if (!fire.fire.fuel) fire.fire.fuel = 1;
      const at = G.map.nearestWalkable(fire.tile[0] + 1, fire.tile[1] + 1);
      G.teleport(at[0], at[1]);
      step();
      p.hands.main = G.items.makeEntry("arrow", 5);
      const arrows = p.hands.main;
      use.applyWith(arrows, { kind: "prop", prop: fire }, p);
      row("arrows used on a lit fire become fire arrows, all at once", arrows.id === "fire_arrow" && arrows.count === 5, `${arrows.count} ${arrows.id}`);
      // An unlit fire refuses.
      fire.fire.lit = false;
      const plain = G.items.makeEntry("arrow", 2);
      p.hands.off = plain;
      use.applyWith(plain, { kind: "prop", prop: fire }, p);
      row("an unlit fire turns nothing", plain.id === "arrow", plain.id);
      fire.fire.lit = wasLit;
      fire.fire.fuel = wasFuel;
      // The bow: fire arrows before plain ones, carried in the bag.
      G.teleport(open[0], open[1]);
      step();
      const bag = G.inventory.bagOf(p);
      p.hands.main = G.items.makeEntry("bow", 1);
      p.hands.off = null;
      G.grid.add(bag, "arrow", 3);
      G.grid.add(bag, "fire_arrow", 2);
      const L = archery.launcherOf(p);
      row("a bow draws fire arrows first", L && L.ammo === "fire_arrow" && L.ignite === true, L ? `${L.ammo}, ignite ${L.ignite}` : "no launcher");
      const z4 = bring(p.gx + 6, p.gy);
      z4.hp = 100;
      const lodgedBefore = { ...(z4.lodged || {}) };
      const a = archery.shoot(p, [1, 0], 6, 1, { projectile: L.projectile, ignite: L.ignite, damage: 10 });
      flyOut();
      row("a fire arrow's hit sets alight and lodges a plain arrow", z4.burning && (z4.lodged || {}).arrow === (lodgedBefore.arrow || 0) + 1 && !(z4.lodged || {}).fire_arrow, `burning ${z4.burning}, lodged ${JSON.stringify(z4.lodged || {})}, projectile ${a.projectile}`);
      z4.burning = false;
      // The bow's own draw and release (the review of #62): a fire arrow leaves the bag, flies as one, and burns.
      const z5 = bring(p.gx + 6, p.gy);
      z5.hp = 100;
      const before = G.inventory.countAll(p, "fire_arrow");
      archery.setAimOverride(p, [z5.gx, z5.gy]);
      archery.beginDraw(p, archery.launcherOf(p), "script");
      p.draw.t = 99;
      p.draw.c = 1;
      const shot = archery.releaseDraw(p, { mouse: { x: 0, y: 0 } });
      archery.setAimOverride(p, null);
      flyOut();
      row("the bow's release spends a fire arrow, which burns what it hits", shot && shot.projectile === "fire_arrow" && shot.ignite === true && G.inventory.countAll(p, "fire_arrow") === before - 1 && z5.burning, shot ? `${shot.projectile}, ignite ${shot.ignite}, fire arrows ${before} to ${G.inventory.countAll(p, "fire_arrow")}, burning ${z5.burning}` : "no shot");
      z5.burning = false;
      // Spend the fire arrows: the launcher goes back to plain ones.
      G.inventory.takeAll(p, "fire_arrow", 99);
      const L2 = archery.launcherOf(p);
      row("with none left the bow draws plain arrows", L2 && L2.ammo === "arrow" && !L2.ignite, L2 ? L2.ammo : "no launcher");
      G.inventory.takeAll(p, "arrow", 3);
    }
  } catch (e) {
    row("the check ran", false, String(e && e.stack || e));
  } finally {
    for (const z of added) {
      const i = G.zombies.indexOf(z);
      if (i >= 0) G.zombies.splice(i, 1);
      const j = (G.corpses || []).indexOf(z);
      if (j >= 0) G.corpses.splice(j, 1);
    }
    p.hands.main = saved.main;
    p.hands.off = saved.off;
    G.teleport(saved.gx, saved.gy);
    p.aim = saved.aim;
    G.rules.set({ zombieAggro: saved.aggro });
    G.rules.set({ multiHit: saved.multi });
    G.loop.setPaused(wasPaused);
  }
  console.table(rows);
  return { pass: rows.every((r) => r.result === "pass"), rows };
}
