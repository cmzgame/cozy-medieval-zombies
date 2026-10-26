// Throwing knives and axes (docs/24 section 1, #489): the knife pulls and the axe stops. From the console, on a tab with `?nosave&mute`:
//   await __game.check("throwing")
// The numbers are Michael's in data/items.json; both throw on the left button from the main hand only (the spear keeps its throw on the
// other mode); a throw takes one from the stack as an entry of its own, with a fresh uid, and the hand empties with the last; they spin along
// the arc from sheets turned out of their drawn art (whole pixels, eight steps) and lie where they land as their own picture; a hit lodges
// one in the body, which comes out of its loot stacked, and a miss lies on the ground; the axe staggers every hit and knocks down about one
// in three, the knife never; they break about 30% and 10% of throws, hit or miss; neither clears a wall's 80 px; E takes a pile from the
// tile and its neighbours, each floor entry by itself; and after a run of throws the item census holds no uid twice.
// It works on open ground with dead of its own, the world's dead, villagers, and animals held out, the generator seeded, and puts back the
// player's hands, bag, place, aim, health and needs, the rules, the generator, and the floor round the ground it used (docs/testing.md).

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const finish = () => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  };
  if (G.net.status().role === "guest") {
    row("this tab is the host", false, "a guest's console reads its replica: throw from the guest's own game, and run this on the host");
    return finish();
  }
  const archery = await import("/src/archery.js");
  const { createZombie } = await import("/src/entities/zombie.js");
  const { lootOf } = await import("/src/entities/character.js");
  const info = await import("/src/item-info.js");
  const S = G.game.state;
  const p = G.player;
  const I = (id) => G.items.getItem(id);
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const bag = G.inventory.bagOf(p);
  const saved = {
    main: p.hands.main, off: p.hands.off, gx: p.gx, gy: p.gy, aim: { ...p.aim }, bag: bag ? bag.items.slice() : null, counts: bag ? bag.items.map((e) => e.count) : null,
    needs: (({ hp, hunger, thirst, tired, bleed, sick, infection, stamina }) => ({ hp, hunger, thirst, tired, bleed, sick, infection, stamina }))(p),
    aggro: G.rules.rules.zombieAggro, rng: G.rng.getState(), paused: G.loop.isPaused(), elapsed: G.clock.getElapsed(), // its throws step the world's clock
    held: { zombies: S.zombies, villagers: S.villagers, animals: S.animals },
  };
  const made = []; // its own dead
  let ground = null; // the open ground it threw over: its floor items are cleared after
  const floorOf = (x0, y0, x1, y1) => { const out = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const e of G.map.itemsAt(x, y)) out.push([e, x, y]); return out; };
  try {
    G.loop.setPaused(true);
    G.rules.rules.zombieAggro = false;
    G.rng.seed(opts.seed ?? 4242);
    S.zombies = [];
    S.villagers = [];
    S.animals = [];

    // 1. The numbers, Michael's (docs/24 section 1).
    const K = I("throwing_knife");
    const A = I("throwing_axe");
    const k = K.thrown;
    const a = A.thrown;
    row("the knife's numbers are Michael's: 15 damage, 13 tiles, a 0.3 stagger, no knockdown, 30% to break, stacks of 20", k.damage === 15 && k.range === 13 && k.staggerChance === 0.3 && !k.knockdown && k.breakChance === 0.3 && K.stack === 20 && !K.weapon, JSON.stringify(k));
    row("the axe's numbers are Michael's: 30 damage, 9 tiles, always staggers, knocks down at 0.35, 10% to break, stacks of 10", a.damage === 30 && a.range === 9 && a.staggerChance === 1 && a.knockdown === 0.35 && a.breakChance === 0.1 && A.stack === 10 && !A.weapon, JSON.stringify(a));
    // Neither clears a wall: the highest point of a full-range throw is under the 80 px a shot must clear (archery.wallStops).
    const peak = (t) => { let m = 0; for (let u = 0; u <= 1; u += 0.01) m = Math.max(m, t.z0 * (1 - u) + 4 * t.arcMax * u * (1 - u)); return m; };
    row("neither clears a wall: a full-range throw peaks under the wall's 80 px (the spear's clears)", peak(k) < archery.tunables.wallHeight && peak(a) < archery.tunables.wallHeight && peak(I("spear").thrown) > archery.tunables.wallHeight, `knife ${peak(k).toFixed(1)}, axe ${peak(a).toFixed(1)}, spear ${peak(I("spear").thrown).toFixed(1)} px`);

    // 2. The button and the hand.
    p.hands.off = null;
    p.hands.main = G.items.makeEntry("throwing_knife", 5);
    const lk = archery.launcherOf(p);
    p.hands.main = G.items.makeEntry("throwing_axe", 3);
    const la = archery.launcherOf(p);
    p.hands.main = G.items.makeEntry("spear", 1);
    const ls = archery.launcherOf(p);
    p.hands.main = null;
    p.hands.off = G.items.makeEntry("throwing_knife", 5);
    const lo = archery.launcherOf(p);
    p.hands.off = null;
    row("the knife and the axe throw on the left button, the spear on its other mode, and none from the off hand", lk && lk.button === "primary" && la && la.button === "primary" && la.knockdown === 0.35 && ls && ls.button === "alt" && lo === null, `knife ${lk && lk.button}, axe ${la && la.button}, spear ${ls && ls.button}, off hand ${lo ? lo.kind : "nothing"}`);

    // Open ground: a band of tiles east of a spot with nothing on them and no wall across them, so a throw flies its whole length.
    const clear = (x, y) => G.map.isWalkableTile(x, y) && !G.map.tileAt(x, y).prop && !(G.map.itemsAt(x, y) || []).length;
    const bandOk = (x0, y0) => {
      for (let dx = -2; dx <= 15; dx++) for (let dy = -2; dy <= 2; dy++) {
        if (!clear(x0 + dx, y0 + dy)) return false;
        if (G.map.wallBetween(x0 + dx, y0 + dy, x0 + dx + 1, y0 + dy) || G.map.wallBetween(x0 + dx, y0 + dy, x0 + dx, y0 + dy + 1)) return false;
      }
      return true;
    };
    const ox = Math.round(saved.gx);
    const oy = Math.round(saved.gy);
    let spot = null;
    for (let r = 0; r <= 40 && !spot; r += 2) for (let dy = -r; dy <= r && !spot; dy += 2) for (let dx = -r; dx <= r && !spot; dx += 2) if ((Math.abs(dx) === r || Math.abs(dy) === r) && bandOk(ox + dx, oy + dy)) spot = [ox + dx, oy + dy];
    if (!spot) {
      row("open ground to throw over", false, `no clear band of 18 by 5 tiles within 40 of ${ox}, ${oy}`);
      return finish();
    }
    const [sx, sy] = spot;
    ground = [sx - 3, sy - 3, sx + 16, sy + 3];
    G.teleport(sx, sy);
    step();
    const throwAt = (x, y, c = 1) => { p.recover = 0; p.draw = { t: 1, c, source: "script" }; p.aimOverride = [x, y]; const f = archery.releaseDraw(p, {}); p.aimOverride = null; return f; };
    const settle = () => { for (let i = 0; i < 300 && archery.arrowsInFlight().some((f) => !f.done); i++) step(); p.recover = 0; };
    const landed = [];
    const onLand = (e) => landed.push(e);
    G.events.on("arrowLanded", onLand);
    try {
      // 3. A throw takes one from the stack, as an entry of its own.
      const stack = G.items.makeEntry("throwing_knife", 3);
      p.hands.main = stack;
      const f1 = throwAt(sx + 6, sy);
      const fresh = f1 && f1.item && f1.item.uid !== stack.uid && f1.item.count === 1 && f1.item.id === "throwing_knife";
      const after1 = stack.count;
      settle();
      throwAt(sx + 6, sy + 1);
      settle();
      throwAt(sx + 6, sy - 1);
      settle();
      row("a throw takes one from the stack as a new entry with a uid of its own, and the hand empties with the last", fresh && after1 === 2 && p.hands.main === null, `thrown ${f1 && f1.item ? `${f1.item.id} ×${f1.item.count} ${f1.item.uid}` : "nothing"} from ${stack.uid}; ${after1} left after one, the hand ${p.hands.main ? p.hands.main.id : "empty"} after three`);
      // 4. A miss lies on the ground where it came down, as its picture at the landing angle.
      const lying = landed.filter((e) => e.kept && !e.hit).map((e) => ({ e, at: floorOf(Math.round(e.gx), Math.round(e.gy), Math.round(e.gx), Math.round(e.gy)).find(([x]) => x.id === "throwing_knife") }));
      const sheetK = G.assets.getSheet("throwing_knife");
      const lies = lying.length > 0 && lying.every(({ at }) => at && Array.isArray(at[0].at) && sheetK.frames[`throwing_knife_${at[0].angle || 0}`]);
      row("a miss lies on the ground where it came down, drawn as its own picture at the angle it flew", lies, `${lying.length} of ${landed.length} kept on the ground; angles ${lying.map(({ at }) => at && at[0].angle).join(", ")}; broken ${landed.filter((e) => e.broken).length}`);

      // 5. The spin: sheets turned from the drawn art, eight steps, whole pixels; a flight's step by its age, forward either way.
      const whole = (sheet) => { const c = sheet.image; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] !== 0 && d[i] !== 255) return -1; else if (d[i]) n++; return n; };
      const ks = G.assets.getSheet("knife_spin");
      const as = G.assets.getSheet("axe_spin");
      const eight = (sh, name) => sh && [0, 1, 2, 3, 4, 5, 6, 7].every((i) => sh.frames[`${name}_${i}`]) && !sh.frames[`${name}_8`];
      row("each spins from a sheet of its own turned from its drawn art: eight steps, every pixel whole, at 2 and 1.5 turns a second", eight(ks, "knife_spin") && eight(as, "axe_spin") && ks.spin === k.spin && as.spin === a.spin && whole(ks) > 0 && whole(as) > 0 && whole(G.assets.getSheet("throwing_axe")) > 0, `knife ${ks ? Object.keys(ks.frames).length : 0} frames, ${whole(ks)} px; axe ${as ? Object.keys(as.frames).length : 0} frames, ${whole(as)} px`);
      const fake = (dx, dy, t) => ({ dx, dy, t });
      const ages = [0, 1, 2, 3].map((i) => (i + 0.5) / (2 * 8)); // a step apart at 2 turns a second of 8 steps
      const east = ages.map((t) => archery.spinFrame(fake(1, 0, t), 2));
      const west = ages.map((t) => archery.spinFrame(fake(-1, 0, t), 2));
      const turns = (xs, dir) => xs.slice(1).every((v, i) => v === (((xs[i] + dir) % 8) + 8) % 8);
      row("its step turns with its age, clockwise thrown to the right and the other way to the left", turns(east, 1) && turns(west, -1), `east ${east.join(" ")}, west ${west.join(" ")}`);

      // 6. A hit lodges it in the body; the body's loot gives it back, stacked.
      const z = createZombie(sx + 5, sy, { hp: 1000 });
      z.state = "idle";
      made.push(z);
      S.zombies.push(z);
      landed.length = 0;
      let lodgedIn = 0;
      for (let i = 0; i < 6; i++) {
        p.hands.main = G.items.makeEntry("throwing_knife", 1);
        z.gx = sx + 5; z.gy = sy; z.path = []; z.knock = null; z.state = "idle";
        throwAt(sx + 5, sy);
        settle();
      }
      const hits = landed.filter((e) => e.hit === z);
      lodgedIn = (z.lodgedItems || []).filter((e) => e.id === "throwing_knife").length;
      const unbroken = hits.filter((e) => !e.broken).length;
      row("a hit takes the knife's damage and lodges it in the body, unless it broke", hits.length === 6 && lodgedIn === unbroken && z.hp === 1000 - 6 * 15, `${hits.length} hits of 6, ${unbroken} unbroken, ${lodgedIn} lodged; hp ${z.hp} of 1000`);
      z.hp = 0;
      z.dead = true;
      const loot = lootOf(z);
      const knivesOut = loot ? loot.items.filter((e) => e.id === "throwing_knife") : [];
      row("its loot gives the lodged knives back, stacked in one entry", lodgedIn === 0 || (knivesOut.length === 1 && knivesOut[0].count === lodgedIn), `${knivesOut.length} entries, ${knivesOut.map((e) => e.count).join(", ")} knives`);

      // 7. The axe staggers every hit and knocks down about one in three; the knife never knocks down. 7 and 8 are by the seeded generator.
      const tally = (id, n) => {
        let hit = 0, down = 0, stag = 0, broke = 0;
        for (let i = 0; i < n; i++) {
          const t = createZombie(sx + 5, sy, { hp: 1000 });
          made.push(t);
          S.zombies.push(t);
          t.state = "idle";
          landed.length = 0;
          p.hands.main = G.items.makeEntry(id, 1);
          throwAt(sx + 5, sy);
          settle();
          const l = landed[0];
          if (l && l.broken) broke++;
          if (l && l.hit === t) {
            hit++;
            if (t.state === "down") down++;
            else if (t.stagger > 0 || t.staggerImmune > 0) stag++;
          }
          S.zombies.splice(S.zombies.indexOf(t), 1);
        }
        return { hit, down, stag, broke, n };
      };
      const ax = tally("throwing_axe", 60);
      const kn = tally("throwing_knife", 60);
      row("the axe staggers every hit it does not floor, and floors about 35% (20 to 50 in 100 here)", ax.hit === ax.n && ax.down + ax.stag === ax.hit && ax.down / ax.hit >= 0.2 && ax.down / ax.hit <= 0.5, `${ax.hit} hits of ${ax.n}: ${ax.down} down, ${ax.stag} staggered`);
      row("the knife never knocks down, and staggers some (about 30%)", kn.hit === kn.n && kn.down === 0 && kn.stag > 0 && kn.stag < kn.hit, `${kn.hit} hits of ${kn.n}: ${kn.down} down, ${kn.stag} staggered`);
      // 8. They break about 30% and 10% of throws, hit or miss; a broken one is nowhere.
      row("they break about 30% (knife) and 10% (axe) of throws, hit or miss", kn.broke / kn.n >= 0.15 && kn.broke / kn.n <= 0.45 && ax.broke / ax.n <= 0.25, `knife ${kn.broke} of ${kn.n}, axe ${ax.broke} of ${ax.n}`);

      // 9. E takes a pile from the tile and its neighbours, each floor entry as itself; one two tiles off stays. The player stands on its middle.
      for (const [e, x, y] of floorOf(...ground)) G.map.takeItem(x, y, e); // the ground cleared of the throws so far
      const px = sx + 2, py = sy;
      const put = [[px, py], [px, py], [px + 1, py], [px, py + 1], [px - 1, py - 1], [px + 1, py + 1]];
      for (const [x, y] of put) G.map.dropItem(x, y, { ...G.items.makeEntry("throwing_knife", 1), at: [x, y], angle: 4 });
      G.map.dropItem(px + 3, py, { ...G.items.makeEntry("throwing_knife", 1), at: [px + 3, py], angle: 4 });
      if (bag) bag.items.length = 0;
      G.teleport(px, py);
      step();
      const action = G.interact.nearestSimpleAction(p);
      G.interact.updateInteract(p, 1 / 60, { eTap: true });
      step(2);
      const inBag = bag ? bag.items.filter((e) => e.id === "throwing_knife").reduce((n, e) => n + e.count, 0) : 0;
      const left = floorOf(...ground).filter(([e]) => e.id === "throwing_knife").length;
      row("E takes the pile from the tile and its neighbours in one press, and one two tiles off stays", action && /^Pick up Throwing knife \(6\)$/.test(action.label) && inBag === 6 && left === 1, `E said "${action && action.label}"; ${inBag} in the bag, ${left} left on the ground`);

      // 9b. A knife past a wall stays (#208's reach, a sealed room is a cell, #147): the pile is only what the player can reach.
      for (const [e, x, y] of floorOf(...ground)) G.map.takeItem(x, y, e);
      const wx = sx + 8, wy = sy;
      let built = false;
      try {
        built = G.map.buildWall(wx + 1, wy, "w", "wall", "wall_log"); // between (wx, wy) and (wx + 1, wy)
        for (const [x, y] of [[wx, wy], [wx - 1, wy], [wx + 1, wy]]) G.map.dropItem(x, y, { ...G.items.makeEntry("throwing_knife", 1), at: [x, y], angle: 4 });
        if (bag) bag.items.length = 0;
        G.teleport(wx, wy);
        step();
        const a2 = G.interact.nearestSimpleAction(p);
        G.interact.updateInteract(p, 1 / 60, { eTap: true });
        step(2);
        const got = bag ? bag.items.filter((e) => e.id === "throwing_knife").reduce((n, e) => n + e.count, 0) : 0;
        const past = G.map.itemsAt(wx + 1, wy).filter((e) => e.id === "throwing_knife").length;
        row("a knife past a wall stays where it lies: E takes only what the player can reach", !!built && a2 && /\(2\)$/.test(a2.label) && got === 2 && past === 1, `wall built ${!!built}; E said "${a2 && a2.label}"; ${got} in the bag, ${past} past the wall`);
      } finally {
        if (built) G.map.destroyWall(wx + 1, wy, "w");
      }

      // 10. After a run of throws the item census holds no uid twice.
      const c = G.game.itemCensus();
      row("after the run the item census holds no uid twice", c.dups.length === 0, c.summary || `${c.entries} entries, ${c.dups.length} held twice`);

      // 11. The cards read the throw's button, the stagger, the knockdown, and the break.
      const text = (id) => info.textOf(info.cardFor(G.items.makeEntry(id, 1)));
      row("the cards say the left button from the main hand, the stagger, the knockdown (the axe's alone), and the break", text("throwing_knife").some((l) => l.startsWith("Throw (left button, from the main hand)")) && text("throwing_knife").some((l) => /staggers the dead 30%/.test(l)) && !text("throwing_knife").some((l) => /knocks/.test(l)) && text("throwing_axe").some((l) => /Every hit staggers/.test(l)) && text("throwing_axe").some((l) => /knocks the dead down 35%/.test(l)) && !text("throwing_axe").some((l) => /To come/.test(l)), `${text("throwing_knife").slice(2, 6).join(" | ")} || ${text("throwing_axe").slice(2, 7).join(" | ")}`);
    } finally {
      G.events.off("arrowLanded", onLand);
    }
  } catch (e) {
    row("setup", false, e.message + (e.stack ? " " + e.stack.split("\n")[1] : ""));
  } finally {
    for (let i = 0; i < 300 && archery.arrowsInFlight().some((f) => !f.done); i++) step(); // nothing left in the air
    for (const z of made) for (const list of [S.zombies, S.corpses || []]) { const i = list.indexOf(z); if (i >= 0) list.splice(i, 1); }
    if (ground) for (const [e, x, y] of floorOf(...ground)) if (e.id === "throwing_knife" || e.id === "throwing_axe") G.map.takeItem(x, y, e);
    S.zombies = [...saved.held.zombies, ...S.zombies];
    S.villagers = [...saved.held.villagers, ...S.villagers];
    S.animals = [...saved.held.animals, ...S.animals];
    p.hands.main = saved.main;
    p.hands.off = saved.off;
    if (bag) { bag.items.length = 0; saved.bag.forEach((e, i) => { e.count = saved.counts[i]; bag.items.push(e); }); }
    p.draw = null;
    p.drawing = false;
    p.recover = 0;
    p.aimOverride = null;
    G.teleport(saved.gx, saved.gy);
    Object.assign(p.aim, saved.aim);
    Object.assign(p, saved.needs);
    G.rules.rules.zombieAggro = saved.aggro;
    G.rng.setState(saved.rng);
    G.clock.setElapsed(saved.elapsed);
    G.loop.setPaused(saved.paused);
  }
  return finish();
}
