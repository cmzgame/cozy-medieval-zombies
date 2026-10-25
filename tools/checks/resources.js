// Natural resources come back (docs/46, step 1; section 7's rows). From the console, on a tab with `?nosave` (the valley):
//   await __game.check("resources")
// Each area's count is its lever; a take by the verb queues one debt and the count falls by one; past its day a node of the kind stands at a
// new spot in the same area (an ore rock never where it was) and the count is back; the one rule of where a node may stand refuses a
// reserved tile, a built floor, tilled soil, water, a road, a room, an authored fenced yard, a pen a player fenced, and a body; the quarry
// is open to stone and the iron workings to ore; a take in the wild queues nothing; a spot in an ungrown chunk is grown through a mutator
// before it is tested; a rising rock is drawn from below the ground line to whole; mushrooms come back in a world with Trees off; the debts
// survive a save and its restore. The world is put back from its own save at the end (a solo test: it restores the world under any guest).
//
// Two tabs (`?nosave&relay=none`): on the host `await __game.check("resources", { keep: true })` skips the rows that remake the world
// (Trees off, the save's restore), leaves a newly risen ore rock in the world, and returns it as `kept`; on the guest
// `await __game.check("resources", { guest: <kept> })` reads it on the replica, arrived through its touched chunk, with the host's stamp;
// then `await __game.check("sync")` on both.

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const resources = await import("/src/resources.js");
  const RES = G.tuning.resources;
  const done = () => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, kept };
  };
  let kept = null;

  // ---- a guest's side: the node the host kept, on the replica ----
  if (opts.guest) {
    const k = opts.guest;
    const p = G.map.propById(k.id);
    row("on the guest the risen ore rock is there by its id, at the host's tile, arrived through its touched chunk", !!p && p.sprite === k.sprite && p.tile[0] === k.tile[0] && p.tile[1] === k.tile[1] && G.map.tileAt(k.tile[0], k.tile[1]).prop === p, p ? `${p.id} ${p.sprite} at ${p.tile.join(",")}` : `no prop ${k.id}`);
    row("with the host's sim-clock stamp, so the replica draws the same rise (below the ground at its stamp, whole after)", !!p && p.risenAt === k.risenAt && resources.riseOf(p, 40, p.risenAt) === 40 && resources.riseOf(p, 40, p.risenAt + RES.riseSeconds) === 0, p ? `risenAt ${p.risenAt} (host ${k.risenAt}), the guest's clock ${G.loop.simTime().toFixed(2)}` : "-");
    return done();
  }

  const keep = !!opts.keep;
  const wasPaused = G.loop.isPaused();
  const clean = keep ? null : G.save.snapshot("check");
  const me = () => G.player;
  const meAt = [me().gx, me().gy];
  const hands0 = { main: me().hands.main, off: me().hands.off };
  const bag = G.inventory.bagOf(me());
  const bag0 = bag ? bag.items.slice() : null; // the ore and stone the verb mines go here: put back after a `keep` run
  const clock0 = G.clock.getElapsed();
  const undo = [];
  const bodies = () => [...G.game.state.players, ...G.game.state.zombies, ...G.game.state.villagers, ...G.game.state.corpses, ...(G.game.state.animals || [])];
  const kindProps = (kind) => G.map.allProps().filter((p) => kind.sprites[p.sprite] !== undefined && G.map.inResourceArea(kind, p.tile[0], p.tile[1]));
  const json = await (await fetch("/data/maps/valley.json", { cache: "no-store" })).json();
  try {
    G.loop.setPaused(true);
    if (!G.info || G.info.name !== json.name) throw new Error(`the valley's check, and this world is ${G.info && G.info.name}`);
    const stone = G.map.resourceKind("stone");
    const ore = G.map.resourceKind("ore");
    const mush = G.map.resourceKind("mushrooms");

    // ---- the areas and their counts ----
    row("the valley has its areas: stone, ore, and mushrooms, each with its count (docs/42's levers)", !!stone && !!ore && !!mush && stone.count === 40 && ore.count === 6 && mush.count === 774, [stone, ore, mush].map((k) => k && `${k.name} ${k.count} in ${JSON.stringify(k.rects)}`).join("; "));
    for (const k of [stone, ore, mush]) {
      const standing = G.map.resourceCensus(k);
      const owed = resources.owed(k.name).length;
      row(`${k.name}: the count in its area is its lever (on a fresh world nothing is owed and the count is the lever)`, standing + owed === k.count, `${standing} standing, ${owed} owed, lever ${k.count}`);
    }

    // ---- where a node may not stand ----
    G.map.ensureAround(me().gx, me().gy, 2);
    const probe = (x, y, o = {}) => { G.map.growTile(x, y); return G.map.resourceSpotProblem(stone, x, y, { bodies: bodies(), ...o }); };
    const [rx, ry] = [json.reserve[0][0] + 2, json.reserve[0][1] + 2];
    row("not on a reserved tile (the scatter's: the village's reserve)", probe(rx, ry) === "a reserved tile", `${rx},${ry}: ${probe(rx, ry)}`);
    // A tile of an authored feature that only the floor rule refuses (not reserved, nothing on it): found by the pure read, then grown and tested live.
    const featureTile = (kind) => {
      for (const f of json.features.filter((q) => q.kind === kind)) {
        const [fx, fy, fw, fh] = f.rect;
        for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) if (G.map.resourceSpotProblem(stone, x, y, { live: false }) === "not natural ground") return [x, y, f.sprite];
      }
      return null;
    };
    const wet = featureTile("water");
    const road = featureTile("road");
    row("not on water (the river's own tiles, by the floor rule alone)", !!wet && probe(wet[0], wet[1]) === "not natural ground", wet ? `${wet[0]},${wet[1]} ${wet[2]}: ${probe(wet[0], wet[1])}` : "no water tile outside the reserves");
    row("not on a road (by the floor rule alone)", !!road && probe(road[0], road[1]) === "not natural ground", road ? `${road[0]},${road[1]} ${road[2]}: ${probe(road[0], road[1])}` : "no road tile outside the reserves");
    // A 3 by 3 of open natural ground near the player, free of everything, its centre a spot a rock may take.
    let at = null;
    const ok3 = (x0, y0) => {
      for (let y = y0 - 1; y <= y0 + 3; y++) for (let x = x0 - 1; x <= x0 + 3; x++) { const t = G.map.peekTile(x, y); if (!t || t.prop || t.rug || t.n || t.w || t.items || t.floor !== "floor_grass") return false; }
      return G.map.resourceSpotProblem(stone, x0 + 1, y0 + 1, { bodies: [] }) === null;
    };
    for (let r = 3; r <= 40 && !at; r++) for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r && !at; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x0 = Math.round(meAt[0]) + dx;
      const y0 = Math.round(meAt[1]) + dy;
      if (ok3(x0, y0)) at = [x0, y0];
    }
    if (!at) throw new Error("no open natural ground near the player");
    const [x0, y0] = at;
    const [cx, cy] = [x0 + 1, y0 + 1];
    row("an open spot of natural ground passes (the rule is not refusing everything)", probe(cx, cy) === null, `${cx},${cy}`);
    G.map.setFloor(cx, cy, "floor_wood");
    row("not on a built floor", probe(cx, cy) === "not natural ground", String(probe(cx, cy)));
    G.map.setFloor(cx, cy, "floor_farm");
    row("not on tilled soil", probe(cx, cy) === "not natural ground", String(probe(cx, cy)));
    G.map.setFloor(cx, cy, "floor_grass");
    const ring = [];
    for (let i = 0; i < 3; i++) ring.push([x0 + i, y0, "n"], [x0 + i, y0 + 3, "n"], [x0, y0 + i, "w"], [x0 + 3, y0 + i, "w"]);
    const wallUp = (sprite) => { for (const [x, y, e] of ring) G.map.buildWall(x, y, e, "wall", sprite); G.map.rebuildRooms(); };
    const wallDown = () => { for (const [x, y, e] of ring) G.map.destroyWall(x, y, e); G.map.rebuildRooms(); };
    wallUp("wall_log");
    row("not inside a room (four walls round a 3 by 3)", probe(cx, cy) === "inside a room", `${probe(cx, cy)}, room ${G.map.roomAt(cx, cy)}`);
    wallDown();
    wallUp("wall_fence");
    row("not inside a pen a player fenced (fence walls from the palette's kind; a see-through wall makes no room, the fill finds it)", probe(cx, cy) === "inside a fenced yard" && G.map.roomAt(cx, cy) === 0, `${probe(cx, cy)}, room ${G.map.roomAt(cx, cy)}`);
    wallDown();
    row("and open again once the fence is down", probe(cx, cy) === null, String(probe(cx, cy)));
    const yard = json.sets.find((s) => s.name === "your cottage");
    const [yx, yy] = [yard.rect[0] + 1, yard.rect[1] + 10];
    row("not inside an authored fenced yard (your cottage's: refused, and the fill alone finds it closed)", !!probe(yx, yy) && G.map.fencedIn(yx, yy), `${yx},${yy}: ${probe(yx, yy)}, fenced in ${G.map.fencedIn(yx, yy)}`);
    G.teleport(cx + 0.5, cy + 0.4);
    row("not under a body (the player standing on it)", probe(cx, cy) === "a body stands there", String(probe(cx, cy)));
    G.teleport(meAt[0], meAt[1]);
    const beast = (G.game.state.animals || []).find((a) => !a.dead);
    if (beast) {
      const [bx, by] = [beast.gx, beast.gy];
      beast.gx = cx + 0.3;
      beast.gy = cy - 0.2;
      const why = probe(cx, cy);
      beast.gx = bx;
      beast.gy = by;
      row("not under an animal (a living one counts as a body, as the step's list has it)", why === "a body stands there", `${beast.species} ${beast.id}: ${why}`);
    } else row("not under an animal", false, "no living animal in the world");
    G.teleport(meAt[0], meAt[1]);

    // ---- the places open to their own kind ----
    const place = (name) => (G.info.places || []).find((p) => p.name === name);
    const tileIn = (box, kind, want = () => true) => {
      for (let y = box[1]; y < box[1] + box[3]; y++) for (let x = box[0]; x < box[0] + box[2]; x++) { const t = G.map.growTile(x, y); if (want(t) && !G.map.resourceSpotProblem(kind, x, y, { bodies: bodies() })) return [x, y]; }
      return null;
    };
    const quarry = place("the quarry");
    const works = place("the iron workings");
    const inQuarry = tileIn(quarry.box, stone, (t) => t.floor === "floor_dirt"); // inside the pit, on its own dirt
    const inWorks = tileIn(works.box, ore);
    row("the quarry's footprint is open to stone (its dirt natural ground) and not to ore", !!inQuarry && G.map.peekTile(inQuarry[0], inQuarry[1]).floor === "floor_dirt" && G.map.resourceSpotProblem(ore, inQuarry[0], inQuarry[1]) === "outside its area", inQuarry ? `${inQuarry.join(",")} on ${G.map.peekTile(inQuarry[0], inQuarry[1]).floor}` : "no free tile in the quarry");
    row("the iron workings' footprint is open to ore", !!inWorks, inWorks ? inWorks.join(",") : "no free tile at the iron workings");
    // What another place keeps clear inside an open one stays clear: the quarryman's hut in the quarry, the miners' hut at the iron workings.
    const passing = (name, kind) => {
      const s = json.sets.find((q) => q.name === name);
      let n = 0;
      if (s) for (let y = s.rect[1] - 1; y <= s.rect[1] + s.rect[3]; y++) for (let x = s.rect[0] - 1; x <= s.rect[0] + s.rect[2]; x++) if (!G.map.resourceSpotProblem(kind, x, y, { live: false })) n++;
      return s ? n : -1;
    };
    const hutQ = passing("the quarryman's hut", stone);
    const hutM = passing("the miners' hut", ore);
    row("the huts inside them stay clear: no tile of the quarryman's hut or its padding takes stone, nor of the miners' hut ore", hutQ === 0 && hutM === 0, `${hutQ} and ${hutM} tiles pass`);
    const only = (kind, rects) => ({ ...kind, rects });
    const qRock = resources.grow(only(stone, [quarry.box]), bodies());
    const wRock = resources.grow(only(ore, [works.box]), bodies());
    row("stone does rise in the quarry, and ore at the iron workings (a comeback drawn in those places alone)", !!qRock && !!wRock && Number.isFinite(qRock.risenAt) && Number.isFinite(wRock.risenAt), `${qRock ? `${qRock.sprite} at ${qRock.tile.join(",")}` : "none"}; ${wRock ? `${wRock.sprite} at ${wRock.tile.join(",")}` : "none"}`);
    for (const p of [qRock, wRock]) if (p) undo.push(() => G.map.propById(p.id) && G.map.removeProp(p));

    // ---- a take in the wild ----
    const wildRock = G.map.allProps().find((p) => stone.sprites[p.sprite] !== undefined && !G.map.inResourceArea(stone, p.tile[0], p.tile[1]));
    const owedAll = () => JSON.stringify(resources.serialize().debts);
    const before = owedAll();
    const wildDebt = resources.taken(wildRock || { sprite: "rock_0", tile: [-20, -20] });
    row("a take in the wild queues nothing (the wild comes back by new chunks)", wildDebt === null && owedAll() === before, wildRock ? `the wild's ${wildRock.sprite} at ${wildRock.tile.join(",")}` : "a rock at -20,-20 (no wild rock grown)");

    // ---- a spot's chunk is grown through a mutator before the test ----
    let fresh = null;
    for (let ccy = 0; ccy < 16 && !fresh; ccy++) for (let ccx = 0; ccx < 16 && !fresh; ccx++) {
      if (G.map.peekTile(ccx * 16 + 8, ccy * 16 + 8)) continue;
      for (let i = 0; i < 256 && !fresh; i++) { const x = ccx * 16 + (i % 16); const y = ccy * 16 + Math.floor(i / 16); if (!G.map.resourceSpotProblem(stone, x, y, { live: false })) fresh = [x, y]; }
    }
    if (fresh) {
      const grownBefore = !!G.map.peekTile(fresh[0], fresh[1]);
      const p = resources.grow(only(stone, [[fresh[0], fresh[1], 1, 1]]), bodies());
      row("a spot in a chunk not yet grown: the chunk is grown through a mutator, then tested, and the node stands on the live tile", !grownBefore && !!p && !!G.map.peekTile(fresh[0], fresh[1]) && G.map.tileAt(fresh[0], fresh[1]).prop === p, `${fresh.join(",")}: grown before ${grownBefore}, after ${!!G.map.peekTile(fresh[0], fresh[1])}, ${p ? p.sprite : "nothing placed"}`);
      if (p) undo.push(() => G.map.propById(p.id) && G.map.removeProp(p));
    } else row("a spot in a chunk not yet grown is grown through a mutator", false, "every valley chunk is grown already: run on a fresh boot");

    // ---- takes by the verb: an ore rock at the iron workings, a rock ----
    const mineIt = (prop) => {
      me().hands.main = G.items.makeEntry("pickaxe", 1);
      for (const [ox, oy] of [[1, 0.4], [0.4, 1], [-1, 0.4], [0.4, -1], [1, 1], [-1, -1]]) {
        G.teleport(prop.tile[0] + ox, prop.tile[1] + oy);
        const r = G.verbs.run("mine", G.world, me(), { prop: prop.id });
        if (r.ok) return true;
      }
      return false;
    };
    const take = (kind) => {
      const list = kindProps(kind).filter((p) => !(qRock && p.id === qRock.id) && !(wRock && p.id === wRock.id));
      const prop = list[0];
      G.map.ensureAround(prop.tile[0], prop.tile[1], 1);
      const n0 = G.map.resourceCensus(kind);
      const o0 = resources.owed(kind.name).length;
      const ok = mineIt(prop);
      return { prop, tile: [...prop.tile], ok, n0, o0, n1: G.map.resourceCensus(kind), o1: resources.owed(kind.name).length };
    };
    const tOre = take(ore);
    row("mining an ore rock at the iron workings queues one debt and the count falls by one", tOre.ok && tOre.o1 === tOre.o0 + 1 && tOre.n1 === tOre.n0 - 1 && !G.map.propById(tOre.prop.id), `${tOre.prop.id} at ${tOre.tile.join(",")}: mined ${tOre.ok}, ${tOre.n0} -> ${tOre.n1} standing, ${tOre.o0} -> ${tOre.o1} owed`);
    const tStone = take(stone);
    row("mining a rock queues one debt on the stone area's record and the count falls by one", tStone.ok && tStone.o1 === tStone.o0 + 1 && tStone.n1 === tStone.n0 - 1, `${tStone.prop.sprite} at ${tStone.tile.join(",")}: ${tStone.n0} -> ${tStone.n1}, owed ${tStone.o0} -> ${tStone.o1}`);
    const debt = resources.owed("ore").slice(-1)[0];
    const day = G.clock.DAY_LENGTH;
    row("its day falls a game day or two on (the lever), and it remembers the tile it may not take", debt && debt.due - G.clock.getElapsed() >= RES.days[0] * day - 1 && debt.due - G.clock.getElapsed() <= RES.days[1] * day + 1 && debt.at[0] === tOre.tile[0] && debt.at[1] === tOre.tile[1], debt ? `due in ${((debt.due - G.clock.getElapsed()) / day).toFixed(2)} days, at ${debt.at.join(",")}` : "no debt");
    // A mushroom taken as step 2's forage verb will take one: the debt, then the prop goes.
    const shroom = kindProps(mush)[0];
    G.map.growTile(shroom.tile[0], shroom.tile[1]); // a take is always in a grown chunk: a player stands near it
    resources.taken(shroom);
    G.map.removeProp(shroom);

    // ---- the debts survive a save and its restore ----
    const owedNow = owedAll();
    const saved = G.game.serialize();
    if (keep) {
      resources.restore(JSON.parse(JSON.stringify(saved.resources)));
      row("the debts survive a save and its restore (the save's part put back)", owedAll() === owedNow && !!saved.resources, owedNow);
    } else {
      await G.restoreWorld(JSON.parse(JSON.stringify(G.save.snapshot("check"))));
      row("the debts survive a save and its restore (the whole world put back from its save)", owedAll() === owedNow, owedNow);
    }
    const parts = G.game.syncParts();
    row("and they are not a part of the sync check (the host's alone, as the generator's state is)", !Object.keys(parts).some((k) => /resource|debt/i.test(k)), Object.keys(parts).join(", "));

    // ---- past the day: a node of the kind at a new spot in the same area ----
    const ids0 = new Set(G.map.allProps().map((p) => p.id));
    const latest = Math.max(...["ore", "stone", "mushrooms"].flatMap((n) => resources.owed(n).map((d) => d.due)));
    G.clock.setElapsed(latest + 1);
    let looks = 0;
    for (; looks < 40 && ["ore", "stone", "mushrooms"].some((n) => resources.owed(n).length); looks++) {
      G.game.begin(0);
      G.clock.setElapsed(G.clock.getElapsed() + RES.checkSeconds);
    }
    const grown = (kind) => G.map.allProps().filter((p) => !ids0.has(p.id) && kind.sprites[p.sprite] !== undefined && G.map.inResourceArea(kind, p.tile[0], p.tile[1])); // not the wild's new chunks
    const [newOre] = grown(ore);
    const [newStone] = grown(stone);
    const [newShroom] = grown(mush);
    row("past its day an ore rock stands at a new spot in the ore area, and the count is back", !!newOre && G.map.inResourceArea(ore, newOre.tile[0], newOre.tile[1]) && G.map.resourceCensus(ore) === tOre.n0 && !resources.owed("ore").length, newOre ? `${newOre.id} at ${newOre.tile.join(",")} after ${looks} looks; ${G.map.resourceCensus(ore)} standing` : `none after ${looks} looks`);
    row("ore never returns in place: the new one is elsewhere, and its old tile is empty", !!newOre && (newOre.tile[0] !== tOre.tile[0] || newOre.tile[1] !== tOre.tile[1]) && !G.map.tileAt(tOre.tile[0], tOre.tile[1]).prop, newOre ? `old ${tOre.tile.join(",")}, new ${newOre.tile.join(",")}` : "-");
    // The rule itself: a one-tile area that is the taken tile, free in every other way, refuses the debt's replacement and takes any other.
    const free = !G.map.resourceSpotProblem(ore, tOre.tile[0], tOre.tile[1], { bodies: bodies() }) ? tOre.tile : tileIn(works.box, ore);
    if (free) {
      const one = only(ore, [[free[0], free[1], 1, 1]]);
      const why = G.map.resourceSpotProblem(ore, free[0], free[1], { bodies: bodies(), not: free });
      const refused = resources.grow(one, bodies(), free);
      const allowed = resources.grow(one, bodies());
      row("the rule never grows a replacement where its node was taken: a one-tile area that is that tile refuses it, and grows a rock without the debt's tile", why === "where the last one stood" && refused === null && !!allowed && allowed.tile[0] === free[0] && allowed.tile[1] === free[1], `${free.join(",")}: ${why}; with the debt's tile ${refused ? refused.id : "nothing"}, without ${allowed ? allowed.id : "nothing"}`);
      if (allowed) G.map.removeProp(allowed);
    } else row("the rule never grows a replacement where its node was taken", false, "no free tile at the iron workings");
    row("a rock stands at a new spot in the valley, and the stone count is back", !!newStone && G.map.resourceCensus(stone) === tStone.n0 && !resources.owed("stone").length, newStone ? `${newStone.sprite} at ${newStone.tile.join(",")}` : "none");
    row("a mushroom comes back near trees elsewhere, simply appearing (no rise)", !!newShroom && newShroom.risenAt === undefined && newShroom.solid === false && G.map.resourceCensus(mush) === mush.count - resources.owed("mushrooms").length, newShroom ? `${newShroom.sprite} at ${newShroom.tile.join(",")}; ${G.map.resourceCensus(mush)} standing, ${resources.owed("mushrooms").length} owed` : "none");
    for (const p of [newOre, newStone, newShroom]) if (p) row(`the ${p.sprite} marked its chunk and stands on the live tile (what a guest gets: the chunk's record carries it${p.risenAt !== undefined ? " and its stamp" : ""})`, G.map.tileAt(p.tile[0], p.tile[1]).prop === p && (() => { let c = null; G.map.eachChunk((ch) => { if (ch.cx === Math.floor(p.tile[0] / 16) && ch.cy === Math.floor(p.tile[1] / 16)) c = ch; }); const rec = c && G.map.serializeChunk(c).props.find((q) => q.id === p.id); return !!c && c.dirty && !!rec && rec.risenAt === p.risenAt; })(), `${p.id}`);

    // ---- the rise ----
    if (newOre) {
      const r0 = newOre.risenAt;
      const samples = [];
      for (let i = 0; i <= 20; i++) samples.push(resources.riseOf(newOre, 40, r0 + (i / 20) * RES.riseSeconds));
      const monotone = samples.every((v, i) => i === 0 || v <= samples[i - 1]);
      row("a rising rock's draw starts wholly below the ground line, comes up in whole pixels, and ends whole", Number.isFinite(r0) && samples[0] === 40 && samples[20] === 0 && samples.every(Number.isInteger) && monotone && samples.some((v) => v > 0 && v < 40), `stamp ${r0.toFixed(2)} (the sim clock), ${samples.join(" ")} px below, over ${RES.riseSeconds} s`);
      const authored = kindProps(stone).find((p) => p.risenAt === undefined);
      row("an authored rock never rose, and is drawn whole", !!authored && resources.riseOf(authored, 40) === 0, authored ? authored.id : "-");
      if (keep) kept = { id: newOre.id, sprite: newOre.sprite, tile: [...newOre.tile], risenAt: newOre.risenAt };
    }

    // ---- Trees off: mushrooms still come back (near where the trees would have stood) ----
    if (!keep) {
      G.game.create({ json, rules: { ...G.rules.rules, trees: false } });
      await G.restoreWorld(JSON.parse(JSON.stringify(G.save.snapshot("check"))));
      G.loop.setPaused(true);
      const m2 = G.map.resourceKind("mushrooms");
      const trees = G.map.allProps().filter((p) => G.assets.getDef(p.sprite).canopy).length;
      const n0 = G.map.resourceCensus(m2);
      const before2 = new Set(G.map.allProps().map((p) => p.id));
      for (const p of kindProps(m2).slice(0, 3)) { G.map.growTile(p.tile[0], p.tile[1]); resources.taken(p); G.map.removeProp(p); }
      const due = Math.max(...resources.owed("mushrooms").map((d) => d.due));
      G.clock.setElapsed(due + 1);
      let n = 0;
      for (; n < 40 && resources.owed("mushrooms").length; n++) { G.game.begin(0); G.clock.setElapsed(G.clock.getElapsed() + RES.checkSeconds); }
      const back = G.map.allProps().filter((p) => !before2.has(p.id) && m2.sprites[p.sprite] !== undefined && G.map.inResourceArea(m2, p.tile[0], p.tile[1]));
      row("with Trees off (no tree stands), the count is the lever and three mushrooms taken come back", trees === 0 && n0 === m2.count && back.length === 3 && G.map.resourceCensus(m2) === m2.count, `${trees} trees, ${n0} at the start, ${back.length} back after ${n} looks: ${back.map((p) => p.tile.join(",")).join(" ")}`);
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    if (keep) {
      for (const f of undo.reverse()) f();
      me().hands.main = hands0.main;
      me().hands.off = hands0.off;
      me().action = null;
      if (bag && bag0) bag.items.splice(0, bag.items.length, ...bag0);
      G.clock.setElapsed(clock0);
      G.teleport(meAt[0], meAt[1]);
    } else {
      try { await G.restoreWorld(clean); } catch (e) { rows.push({ check: "put back", result: "FAIL", detail: e.message }); }
    }
    G.loop.setPaused(wasPaused);
  }
  return done();
}
