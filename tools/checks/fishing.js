// Fishing (#190; Michael, 2026-10-18: fishing joins valley 1.0). From the console, on a tab with `?nosave`:
//   await __game.check("fishing")
// It stands the player beside the river and the village pond, casts with a rod in hand through the verb, the menu's timed action, and a
// guest's command (the label on the water's address), counts what bites from each water's table, and checks the rod's recipe and the
// grilling. Hands, bag, ground, and place are put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const wasPaused = G.loop.isPaused();
  const fishing = await import("/src/fishing.js");
  const data = fishing.get();
  const run = (tile) => G.verbs.run("fish", G.world, me, { tile });
  const labels = (tx, ty) => G.interact.actionsForTarget({ kind: "tile", tile: [tx, ty] }, me).map((a) => a.label);
  try {
    G.loop.setPaused(true);

    // The things as data.
    const rodDef = G.items.getItem("fishing_rod");
    row("the rod is a tool that lists the verb fish, and the workbench makes it from a stick and a cloth", rodDef.kind === "tool" && rodDef.verbs.includes("fish") && G.stations.recipe("fishing_rod").station === "workbench", JSON.stringify(G.stations.recipe("fishing_rod").in));
    const all = [...new Set(Object.values(data.waters).flatMap((t) => t.catch.map((e) => e.item)))];
    row("every water's table names fish that exist (two or three kinds), each with a grilled one that cooks at a fire", all.length >= 2 && all.length <= 3 && all.every((f) => G.items.getItem(f).kind === "food" && G.stations.recipe(`grilled_${f}`).station === "cooking" && G.stations.recipe(`grilled_${f}`).fire === true && G.items.getItem(`grilled_${f}`).hunger > G.items.getItem(f).hunger * 1.5 && G.items.getItem(`grilled_${f}`).heal > G.items.getItem(f).heal), all.join(", "));

    // The waters, as the map names them.
    G.map.ensureAround(120, 105, 4);
    let wx = null;
    for (let x = 100; x < 145 && wx === null; x++) if (G.map.drinkableAt(x, 105) && G.map.isWalkableTile(x - 1, 105)) wx = x;
    G.map.ensureAround(88, 192, 4);
    const pondTile = [88, 192];
    row("the river's tiles are the river, the duck pond's the pond, dry ground none", wx !== null && G.map.waterBodyAt(wx, 105) === "river" && G.map.drinkableAt(...pondTile) && G.map.waterBodyAt(...pondTile) === "pond" && G.map.waterBodyAt(wx - 3, 105) === null, `river at ${wx},105; pond ${G.map.waterBodyAt(...pondTile)}`);

    // At the river.
    const rod = G.items.makeEntry("fishing_rod", 1);
    G.teleport(wx - 1 + 0.5, 105);
    me.hands.main = null;
    me.hands.off = null;
    row("with no rod the water offers no cast, and the verb says why", !labels(wx, 105).includes("Cast the line") && /rod/.test(String(run([wx, 105]).reason)), labels(wx, 105).join(", "));
    me.hands.main = rod;
    row("with the rod in hand the water offers Cast the line", labels(wx, 105).includes("Cast the line"), labels(wx, 105).join(", "));
    row("dry ground is refused", !run([wx - 3, 105]).ok && /water/.test(String(run([wx - 3, 105]).reason)), String(run([wx - 3, 105]).reason));
    G.teleport(wx - 7, 105);
    row("too far from the water is refused", !run([wx, 105]).ok && /far/.test(String(run([wx, 105]).reason)), String(run([wx, 105]).reason));
    G.teleport(wx - 1 + 0.5, 105);

    // Many casts: the miss rate and the catch kinds follow the table.
    const tally = async (tile, n) => {
      const t = { miss: 0, got: {} };
      for (let i = 0; i < n; i++) {
        const r = run(tile);
        if (!r.ok) return { error: r.reason };
        if (r.caught === null) t.miss++;
        else t.got[r.caught] = (t.got[r.caught] || 0) + 1;
        // the bag holds a few: empty it as it fills, the ground the rest (the verb drops a catch the bag cannot take)
        bag.items.splice(0, bag.items.length);
        for (const e of [...G.map.itemsAt(Math.round(me.gx), Math.round(me.gy))]) G.map.takeItem(Math.round(me.gx), Math.round(me.gy), e);
      }
      return t;
    };
    const river = await tally([wx, 105], 400);
    const rt = data.waters.river;
    const kinds = Object.keys(river.got || {});
    row("river casts follow the river's table: its miss rate and only its fish", !river.error && Math.abs(river.miss / 400 - rt.miss) < 0.09 && kinds.length >= 2 && kinds.every((k) => rt.catch.some((e) => e.item === k)), river.error || `${river.miss} misses of 400 (wanted ${rt.miss}); ${JSON.stringify(river.got)}`);
    G.teleport(pondTile[0] - 2 + 0.5, pondTile[1]);
    const pond = await tally(pondTile, 400);
    const pt = data.waters.pond;
    const pkinds = Object.keys(pond.got || {});
    row("pond casts follow the pond's: carp and perch, and no trout", !pond.error && Math.abs(pond.miss / 400 - pt.miss) < 0.09 && pkinds.every((k) => pt.catch.some((e) => e.item === k)) && !pkinds.includes("trout") && pkinds.includes("carp"), pond.error || `${pond.miss} misses of 400 (wanted ${pt.miss}); ${JSON.stringify(pond.got)}`);

    // The timed action, as the menu runs it: a wait rolled as the cast starts, then the verb.
    G.teleport(wx - 1 + 0.5, 105);
    const cast = G.interact.actionsForTarget({ kind: "tile", tile: [wx, 105] }, me).find((a) => a.label === "Cast the line");
    G.interact.startAction(me, cast);
    const wait = me.action && me.action.action.duration;
    row("the cast is a timed action whose wait is rolled in data's range", !!me.action && wait >= data.cast.waitMin && wait <= data.cast.waitMax, `waits ${wait && wait.toFixed(2)} s of ${data.cast.waitMin} to ${data.cast.waitMax}`);
    for (let i = 0; i < 400 && me.action; i++) G.interact.updateAction(me, 0.1);
    row("and it ends by itself with a result", !me.action, me.action ? "still waiting" : "done");
    // Walking away ends the wait with nothing.
    G.interact.startAction(me, G.interact.actionsForTarget({ kind: "tile", tile: [wx, 105] }, me).find((a) => a.label === "Cast the line"));
    me.moving = true;
    G.interact.updateAction(me, 0.1);
    me.moving = false;
    row("walking away from the water ends the cast", !me.action, me.action ? "still on" : "ended");

    // A guest's command: the label on the water's address, run on the authority as this player.
    const did = G.interact.performByLabel(me, { kind: "tile", tile: [wx, 105] }, "Cast the line");
    const started = !!me.action;
    for (let i = 0; i < 400 && me.action; i++) G.interact.updateAction(me, 0.1);
    row("a guest's command (the label on the water's address) starts the same cast and it finishes", did === true && started && !me.action, `ran ${did}, started ${started}`);
    row("no rod in hand on the authority, nothing starts", (() => { me.hands.main = null; const r = G.interact.performByLabel(me, { kind: "tile", tile: [wx, 105] }, "Cast the line"); me.hands.main = rod; return r === false; })(), "refused");
  } finally {
    me.action = null;
    me.moving = false;
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    bag.items.splice(0, bag.items.length, ...bag0);
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
