// Saplings and sticks (docs/46 step 3, #449). From the console, on a tab with `?nosave` (the valley):
//   await __game.check("saplings")
// The data and the art: the two stages' sheets generated from their designs, hard-pixelled, outlined all the way round, the second larger;
// the Sapling item's icon its first stage's own pixels, 19 by 38, registered as its picture on the floor. Felling drops a sapling at its
// chance (a thousand rolls of the seeded generator, the same twice), always at 1 and never at 0, by the label a guest sends. The item's Place
// starts the ghost, green on open grass within reach and red with why on a road, and a click plants it; a guest's `setdown` command plants
// another; refused indoors, on a road, on tilled soil, and against a wall, each with its word and nothing planted. Its menu: Inspect (the
// client's own line) and Pick up. Over the days of the clock it turns to its second stage and then to the round oak, keeping its id, its
// chunk marked; one with the player standing on it waits and grows once stepped off; the grown oak is chopped by its label. Gather sticks
// under a tree by the label a guest sends, after its bar: one or two sticks, greyed and refused the same day, again the next; none on a
// stump; never E's (the menu's alone: E opens doors), on a laden apple tree E keeping to Pick apples. Over the bag, the sapling's and the stick's cards read on the page. The world is put
// back from its own save at the end (run it solo).
//
// Two tabs (`?nosave&relay=none`): on the host `await __game.check("saplings", { keep: true })` skips the world's restore, plants a sapling
// and gathers a tree's sticks beside every other player, gives each a sapling and a second tree to gather under, and returns `kept`; on the
// guest `await __game.check("saplings", { guest: <kept> })` reads the sapling on the replica (its stamp, its Inspect line, its Pick up) and
// the gathered tree greyed, sends Gather sticks to the host and waits for the sticks in its bag and the stamp on its replica's tree, and plants
// its own sapling by the `setdown` command and waits for it on the replica; then `await __game.check("sync")`.

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const trees = await import("/src/trees.js");
  const setdown = await import("/src/setdown.js");
  const info = await import("/src/item-info.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const art = await import("/src/gather-art.js");
  const T = G.tuning.trees;
  const DAY = G.clock.DAY_LENGTH;
  const me = G.player;
  const map = G.map;
  const cardText = (id) => info.textOf(info.cardFor(G.items.makeEntry(id, 1))).join(" | ");
  const labelsOf = (p) => G.interact.actionsForTarget({ kind: "prop", id: p.id }, me).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}${a.local ? " [local]" : ""}`);
  const count = (id) => G.inventory.countAll(me, id);
  const message = () => ((document.getElementById("message") || {}).textContent || "").trim();
  const SAPLING_CARD = "Sapling | Seedling | Place: plant on open grass outdoors. | Grows into an oak in about 5 game days; it waits while anyone stands on it. | Sometimes dropped by a felled tree (about 1 in 3). | Right-click for actions.";
  const STICK_LINE = "Gathered under any standing tree, 1 to 2 a day from each tree.";
  let kept = null;
  const done = () => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, kept };
  };
  const plainTreeNear = (x, y, not = []) => map.allProps().filter((p) => trees.isStandingTree(p) && !p.sprite.startsWith("tree_apple") && !not.includes(p.id) && trees.hasSticks(p)).sort((a, b) => Math.hypot(a.tile[0] - x, a.tile[1] - y) - Math.hypot(b.tile[0] - x, b.tile[1] - y))[0] || null;
  // An open tile for a sapling, nearest (x, y): the stand rule's, its chunk grown first (a read never grows).
  const openNear = (x, y, ok = () => true) => {
    for (let d = 1; d <= 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const tx = Math.round(x) + dx;
      const ty = Math.round(y) + dy;
      map.growTile(tx, ty);
      if (trees.standProblem(tx, ty) === "" && ok(tx, ty)) return [tx, ty];
    }
    return null;
  };

  // ---- a guest's side: the host's sapling and the gathered tree on the replica; sticks and a sapling of its own through the host ----
  if (opts.guest) {
    const k = opts.guest;
    const wasPaused = G.loop.isPaused();
    G.loop.setPaused(true);
    const pump = async (until, ms = 15000) => {
      const t0 = performance.now();
      let last = t0;
      while (!until() && performance.now() - t0 < ms) {
        await yieldOnce();
        if (performance.now() - last >= 1000 / 60) { last = performance.now(); G.loop.advance(1 / 60); }
      }
      return Math.round(performance.now() - t0);
    };
    try {
      const s = map.propById(k.sapling.id);
      row("on the guest the host's sapling is there by its id, at the host's tile, with the host's growing stamp (its chunk)", !!s && s.sprite === k.sapling.sprite && s.tile[0] === k.sapling.tile[0] && s.tile[1] === k.sapling.tile[1] && !!s.sapling && s.sapling.at === k.sapling.at, s ? `${s.id} ${s.sprite} at ${s.tile}, ${JSON.stringify(s.sapling)}` : `no prop ${k.sapling.id}`);
      const sl = s ? labelsOf(s) : [];
      row("its menu on the replica: Inspect (this client's own) and Pick up sapling", sl.includes("Inspect [local]") && sl.includes("Pick up sapling"), sl.join(", "));
      if (s) row("its Inspect line, read from the stamp and the clock here", /^A sapling: an oak in about \d days? of growing/.test(trees.report(s)), trees.report(s));
      const gone = map.propById(k.gathered.id);
      const gl = gone ? labelsOf(gone) : [];
      row("the tree the host gathered under is greyed on the replica, its day on the prop", !!gone && gone.sticksAt === k.gathered.sticksAt && gl.includes("Gather sticks (none until tomorrow) [off]"), gl.join(", ") || "no tree");
      const tree = map.propById(k.tree.id);
      const tl = tree ? labelsOf(tree) : [];
      row("the tree beside me offers Gather sticks on the replica", tl.includes("Gather sticks"), tl.join(", ") || "no tree");
      const s0 = count("stick");
      G.net.sendAct({ kind: "prop", id: k.tree.id }, "Gather sticks");
      const ms = await pump(() => count("stick") > s0 && Number.isFinite((map.propById(k.tree.id) || {}).sticksAt));
      row("the label goes to the host, which runs the bar and the verb: sticks in my bag on the replica, the tree's day on its prop", count("stick") > s0 && count("stick") <= s0 + T.sticks.count[1] && Number.isFinite((map.propById(k.tree.id) || {}).sticksAt), `${s0} -> ${count("stick")} sticks, sticksAt ${(map.propById(k.tree.id) || {}).sticksAt}, ${ms} ms`);
      const mine = G.inventory.bagOf(me) ? G.inventory.bagOf(me).items.find((e) => e.id === "sapling") : null;
      const spot = k.spot;
      row("the host gave me a sapling, in my bag on the replica", !!mine, mine ? mine.uid : "none");
      if (mine && spot) {
        G.net.sendPlace({ kind: "setdown", uid: mine.uid, tx: spot[0], ty: spot[1] });
        const ms2 = await pump(() => { const p = map.peekTile(spot[0], spot[1]); return !!(p && p.prop && p.prop.sapling); });
        const p = map.peekTile(spot[0], spot[1]);
        row("my setdown command plants it on the host: the sapling on the replica at my tile, gone from my bag", !!(p && p.prop && p.prop.sapling && p.prop.sprite === T.sapling.stages[0]) && !G.inventory.bagOf(me).items.some((e) => e.uid === mine.uid), `${p && p.prop ? p.prop.sprite : "nothing"} at ${spot}, ${ms2} ms`);
      }
      row("on the guest the sapling's card and the stick's read the same (the replica's tuning)", cardText("sapling") === SAPLING_CARD && cardText("stick").includes(STICK_LINE), `${cardText("sapling")} || ${cardText("stick")}`);
    } catch (e) {
      rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
    } finally {
      G.loop.setPaused(wasPaused);
    }
    return done();
  }

  const keep = !!opts.keep;
  const wasPaused = G.loop.isPaused();
  const clean = keep ? null : G.save.snapshot("check");
  const meAt = [me.gx, me.gy];
  const bag = G.inventory.bagOf(me);
  const bag0 = bag ? bag.items.slice() : [];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const clock0 = G.clock.getElapsed();
  const chance0 = T.sapling.chance;
  const screen0 = G.screens.currentScreen();
  const was = { bag: panel.isBagOpen() };
  const json = await (await fetch("/data/maps/valley.json", { cache: "no-store" })).json();
  const finish = () => { for (let i = 0; i < 600 && me.action; i++) G.loop.advance(1 / 60); };
  const standAt = (x, y) => { G.map.ensureAround(x, y, 1); G.teleport(x, y); me.auto = null; me.moving = false; };
  const look = () => { G.game.begin(0); G.clock.setElapsed(G.clock.getElapsed() + T.checkSeconds); };
  const lookUntil = (t) => { let n = 0; while (G.clock.getElapsed() < t && n < 5000) { look(); n++; } look(); return n + 1; };
  let restoreView = null;
  const sapEntry = () => { const e = G.items.makeEntry("sapling", 1); G.inventory.stow(me, e); return e; };
  try {
    G.loop.setPaused(true);
    if (!G.info || G.info.name !== json.name) throw new Error(`the valley's check, and this world is ${G.info && G.info.name}`);
    if (screen0) G.screens.hide();
    me.hands.main = null;
    me.hands.off = null;
    if (bag) bag.items.length = 0;

    // ---- the data ----
    const item = G.items.getItem("sapling");
    row("the sapling's levers are data: its chance, five days, its stages, the round oak; the sticks' count and bar", T.sapling.chance > 0 && T.sapling.chance < 1 && T.sapling.days === 5 && T.sapling.stages.length === 2 && T.sapling.grows === "tree_oak_m" && T.sticks.item === "stick" && T.sticks.count[0] === 1 && T.sticks.count[1] === 2 && T.sticks.seconds > 0 && item.place === T.sapling.stages[0] && item.stand === "natural", JSON.stringify(T));

    // ---- the art: the stages' sheets, the item's icon ----
    const pixels = (sheet) => {
      const f = sheet.frames.idle_0;
      const c = document.createElement("canvas");
      c.width = f[2];
      c.height = f[3];
      c.getContext("2d").drawImage(sheet.image, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
      return c.getContext("2d").getImageData(0, 0, f[2], f[3]);
    };
    const outlinedHard = (img) => {
      const { width: w, height: h, data } = img;
      let soft = 0;
      let bare = 0;
      const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]);
      const out = parseInt(art.OUTLINE.slice(1), 16);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const al = a(x, y);
        if (al !== 0 && al !== 255) soft++;
        if (al !== 255) continue;
        const edge = !a(x + 1, y) || !a(x - 1, y) || !a(x, y + 1) || !a(x, y - 1);
        const i = (y * w + x) * 4;
        if (edge && ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) !== out) bare++;
      }
      return { soft, bare };
    };
    const sheets = T.sapling.stages.map((sid) => [sid, G.assets.getSheet(sid)]);
    const bad = sheets.map(([sid, sh]) => [sid, outlinedHard(pixels(sh)), G.assets.getDef(sid)]).filter(([, r, d]) => r.soft || r.bare || !d.interactable || !d.sapling);
    const h0 = sheets[0][1].frames.idle_0[3];
    const h1 = sheets[1][1].frames.idle_0[3];
    row("each stage's sheet is generated from its design, interactable, hard-pixelled, outlined all the way round, the second larger", bad.length === 0 && h1 > h0 + 8, bad.map(([s, r]) => `${s}: ${r.soft} soft, ${r.bare} bare`).join("; ") || `${h0} px then ${h1} px tall`);
    {
      let sheet = null;
      try { sheet = G.assets.getSheet("icon_sapling"); } catch { sheet = null; }
      let diff = -1;
      if (sheet && sheet.image.width === 19 && sheet.image.height === 38) {
        const n = pixels(sheets[0][1]);
        const ic = pixels(sheet);
        const ox = Math.floor((19 - n.width) / 2);
        const oy = Math.floor((38 - n.height) / 2);
        diff = 0;
        for (let y = 0; y < n.height; y++) for (let x = 0; x < n.width; x++) for (let c = 0; c < 4; c++) if (n.data[(y * n.width + x) * 4 + c] !== ic.data[((y + oy) * 19 + x + ox) * 4 + c]) diff++;
      }
      row("the Sapling item's icon is made at boot from its first stage's design, its very pixels, 19 by 38, and registered as its picture on the floor", /^data:image\/png/.test(item.icon.src || "") && diff === 0, sheet ? `${sheet.image.width}x${sheet.image.height}, ${diff} values differ` : "no icon_sapling sheet");
    }

    // ---- felling drops a sapling at its chance ----
    {
      const rng0 = G.rng.getState();
      // The felling's own roll, trees.fellDrop, a thousand times on one tile under the player, its saplings taken up again after each run.
      const [rx, ry] = [Math.round(me.gx), Math.round(me.gy)];
      const roll = (seed) => {
        G.rng.seed(seed);
        let n = 0;
        for (let i = 0; i < 1000; i++) if (trees.fellDrop(rx, ry, "tree_oak_m")) n++;
        for (const e of [...map.itemsAt(rx, ry)]) if (e.id === "sapling") map.takeItem(rx, ry, e);
        return n;
      };
      const a = roll(7);
      const b = roll(7);
      G.rng.setState(rng0);
      row("the felling's roll (trees.fellDrop) is the sim's generator's: a thousand seeded fellings near the lever, the same twice", a === b && Math.abs(a / 1000 - T.sapling.chance) < 0.05, `${a} and ${b} of 1000 at ${T.sapling.chance}`);
      const fell = (chance) => {
        const tree = plainTreeNear(me.gx, me.gy);
        standAt(tree.tile[0] + 0.9, tree.tile[1] + 0.2);
        me.hands.main = G.items.makeEntry("hatchet", 1);
        for (const e of [...map.itemsAt(tree.tile[0], tree.tile[1])]) map.takeItem(tree.tile[0], tree.tile[1], e);
        T.sapling.chance = chance;
        const label = `Chop down (${tree.wood} log${tree.wood > 1 ? "s" : ""})`;
        const ran = G.interact.performByLabel(me, { kind: "prop", id: tree.id }, label);
        finish();
        T.sapling.chance = chance0;
        me.hands.main = null;
        const n = map.itemsAt(tree.tile[0], tree.tile[1]).filter((e) => e.id === "sapling").length;
        const st = map.tileAt(tree.tile[0], tree.tile[1]).prop;
        return { ran, n, stump: st && st.sprite, tile: tree.tile };
      };
      const one = fell(1);
      const none = fell(0);
      row("a tree felled by the label a guest sends drops a sapling on its stump's tile at chance 1, none at 0 (the chance put back)", one.ran && one.n === 1 && one.stump === "stump" && none.ran && none.n === 0 && T.sapling.chance === chance0, `at 1: ${one.n} at ${one.tile}; at 0: ${none.n}; ${one.stump}`);
      const fallen = map.itemsAt(one.tile[0], one.tile[1]).find((e) => e.id === "sapling");
      if (fallen) map.takeItem(one.tile[0], one.tile[1], fallen);
    }

    // ---- planting by the Place mode: the ghost, a click ----
    const inp = await import("/src/input.js");
    const placement = G.placement;
    const cv = document.getElementById("game");
    const cam0 = { gx: G.camera.cam.gx, gy: G.camera.cam.gy };
    const mouse0 = { ...inp.getMouse() };
    const cvRect = cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + 1000, clientY: cvRect.top + 500, bubbles: true }));
    const sc = 1000 / inp.getMouse().x;
    restoreView = () => {
      G.camera.snapTo(cam0.gx, cam0.gy);
      G.camera.applyOrigin(G.view.view.w, G.view.view.h);
      if (mouse0.inside) cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + mouse0.x * sc, clientY: cvRect.top + mouse0.y * sc, bubbles: true }));
      else cv.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    };
    const aimGrid = (gx, gy) => {
      G.loop.advance(1 / 60);
      G.camera.snapTo(me.gx, me.gy);
      G.camera.applyOrigin(G.view.view.w, G.view.view.h);
      const p = G.iso.toScreen(gx, gy);
      cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + p.x * sc, clientY: cvRect.top + p.y * sc, bubbles: true }));
      placement.update(me);
      inp.endStep();
    };
    const home = [Math.round(meAt[0]), Math.round(meAt[1])];
    const open = openNear(home[0], home[1], (x, y) => trees.standProblem(x + 1, y) === "" && map.isWalkableTile(x + 1, y));
    const bare = (t) => !t.prop && !t.rug && !(t.items && t.items.length);
    const road = (() => { for (let d = 1; d < 60; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { const x = home[0] + dx; const y = home[1] + dy; map.growTile(x, y); const t = map.tileAt(x, y); if (["floor_cobble", "floor_dirt"].includes(t.floor) && bare(t) && map.roomAt(x, y) <= 0 && map.isWalkableTile(x, y)) return [x, y]; } return null; })();
    const indoor = (() => { const bed = map.allProps().filter((q) => q.sprite === "bed").sort((a, b) => Math.hypot(a.tile[0] - home[0], a.tile[1] - home[1]) - Math.hypot(b.tile[0] - home[0], b.tile[1] - home[1]))[0]; const at = bed ? map.nearestWalkable(bed.tile[0], bed.tile[1] + 1, (x, y) => !bare(map.tileAt(x, y))) : null; return at && map.roomAt(at[0], at[1]) > 0 ? at : null; })();
    const walled = (() => { for (let d = 1; d < 60; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { const x = home[0] + dx; const y = home[1] + dy; map.growTile(x, y); const t = map.tileAt(x, y); if (t.floor === map.baseFloor() && bare(t) && map.roomAt(x, y) <= 0 && (t.n || t.w) && map.isWalkableTile(x, y)) return [x, y]; } return null; })();
    if (!open || !road || !indoor || !walled) throw new Error(`no tiles to try: open ${open}, road ${road}, indoors ${indoor}, against a wall ${walled}`);
    standAt(open[0] + 1.2, open[1] + 0.3);
    const e1 = sapEntry();
    const menu = G.interact.itemMenu(me, e1, bag, null);
    const place = menu.find((m) => m.label === "Place");
    row("the sapling's menu in the bag offers Place", !!place, menu.map((m) => m.label).join(", "));
    if (place) place.onSelect();
    aimGrid(open[0], open[1]);
    const g0 = placement.state.ghost;
    row("Place starts the ghost of its first stage, green on open grass within reach", placement.state.kind === "setdown" && placement.state.setdown.stand === "natural" && !!g0 && g0.prop.sprite === T.sapling.stages[0] && g0.ok === true && g0.tx === open[0] && g0.ty === open[1], g0 ? `${g0.prop.sprite} at ${g0.tx},${g0.ty} ${g0.ok ? "green" : g0.reason}` : "no ghost");
    standAt(road[0] + 1.2, road[1] + 0.3);
    aimGrid(road[0], road[1]);
    const gRoad = placement.state.ghost;
    row("over a road it is red, and says why", !!gRoad && gRoad.ok === false && gRoad.reason === "Open grass only", gRoad ? `${gRoad.tx},${gRoad.ty}: ${gRoad.reason}` : "no ghost");
    standAt(open[0] + 1.2, open[1] + 0.3);
    aimGrid(open[0], open[1]);
    const now0 = G.clock.getElapsed();
    const clicked = placement.tryConfirm(me);
    const s1 = map.peekTile(open[0], open[1]).prop;
    row("a click plants it: the first stage on the tile, walked through, not a player's made thing, its growing from now, the item gone, the mode ended", clicked === true && !!s1 && s1.sprite === T.sapling.stages[0] && s1.solid === false && !s1.made && !!s1.sapling && Math.abs(s1.sapling.at - now0) < 1 && count("sapling") === 0 && placement.state.kind === null, s1 ? `${s1.id} ${s1.sprite}, ${JSON.stringify(s1.sapling)}; ${message()}` : "nothing planted");
    const [scx, scy] = map.chunkCoord(open[0], open[1]);
    const ch = map.getChunk(scx, scy, false);
    row("its chunk is marked for the wire and its saved copy dropped", !!ch && ch.dirty === true && ch.saved === null, ch ? `dirty ${ch.dirty}` : "no chunk");
    const sl = s1 ? labelsOf(s1) : [];
    row("its menu: Inspect (this client's own) and Pick up sapling; no Take apart, no sticks", sl.includes("Inspect [local]") && sl.includes("Pick up sapling") && !sl.some((l) => /Take apart|sticks/.test(l)), sl.join(", "));
    row("its Inspect line says how long", /an oak in about 5 days of growing, which waits while anyone stands on it/.test(trees.report(s1)), trees.report(s1));

    // ---- a guest's command, and the refusals ----
    const spot2 = openNear(open[0] + 4, open[1] + 4, (x, y) => Math.hypot(x - open[0], y - open[1]) > 3);
    standAt(spot2[0] + 1.2, spot2[1] + 0.3);
    const e2 = sapEntry();
    placement.performPlacement(me, { kind: "setdown", uid: e2.uid, tx: spot2[0], ty: spot2[1] });
    const s2 = map.peekTile(spot2[0], spot2[1]).prop;
    row("a guest's setdown command (by the entry's uid and the tile, the one path) plants one too", !!s2 && !!s2.sapling && s2.sprite === T.sapling.stages[0] && count("sapling") === 0, s2 ? `${s2.sprite} at ${s2.tile}; ${message()}` : "nothing");
    const refusal = (at, stand) => {
      standAt(stand[0], stand[1]);
      G.loop.advance(1 / 60);
      const e = sapEntry();
      placement.performPlacement(me, { kind: "setdown", uid: e.uid, tx: at[0], ty: at[1] });
      const said = message();
      const planted = !!(map.peekTile(at[0], at[1]).prop && map.peekTile(at[0], at[1]).prop.sapling);
      const kept = count("sapling") === 1;
      for (const q of [...bag.items]) if (q.id === "sapling") bag.items.splice(bag.items.indexOf(q), 1);
      return { said, planted, kept };
    };
    // Each tried from the tile itself, so reach never speaks first (a wall between would).
    const rIn = refusal(indoor, indoor);
    const rRoad = refusal(road, road);
    const rWall = refusal(walled, walled);
    const tilled = [open[0] + 1, open[1]];
    map.setFloor(tilled[0], tilled[1], "floor_farm");
    const rTill = refusal(tilled, tilled);
    map.setFloor(tilled[0], tilled[1], map.baseFloor());
    const all = [["indoors", rIn, "Outdoors only"], ["on a road", rRoad, "Open grass only"], ["against a wall", rWall, "Not against a wall"], ["on tilled soil", rTill, "Open grass only"]];
    row("refused indoors, on a road, against a wall, and on tilled soil: the word said, nothing planted, the sapling kept", all.every(([, r, w]) => !r.planted && r.kept && r.said.includes(w)), all.map(([n, r]) => `${n}: "${r.said}" planted ${r.planted} kept ${r.kept}`).join("; "));

    // ---- growing over the days; waiting while stood on ----
    standAt(spot2[0], spot2[1]); // the player stands on the second
    const stamp0 = s2.sapling.waited;
    lookUntil(now0 + 0.6 * T.sapling.days * DAY);
    row("past half its days the first is its second stage, drawn larger, the same prop", s1.sprite === T.sapling.stages[1] && map.propById(s1.id) === s1, `${s1.sprite}`);
    row("the one stood on waits: still its first stage, the time added to its stamp, its chunk marked", s2.sprite === T.sapling.stages[0] && s2.sapling.waited > stamp0 + 0.5 * T.sapling.days * DAY, `${s2.sprite}, waited ${Math.round(s2.sapling.waited)} s`);
    lookUntil(now0 + T.sapling.days * DAY + 60);
    const oak = map.peekTile(open[0], open[1]).prop;
    row("on its fifth day it is the round oak, keeping its id: solid, with a canopy and its logs, no longer a sapling", !!oak && oak.id === s1.id && oak.sprite === T.sapling.grows && oak.solid === true && oak.wood === G.assets.getDef(T.sapling.grows).wood && !oak.sapling && map.propById(s1.id) === oak, oak ? `${oak.id} ${oak.sprite} wood ${oak.wood}` : "nothing");
    row("the one stood on is still a sapling, under the player", map.peekTile(spot2[0], spot2[1]).prop === s2 && !!s2.sapling, s2.sprite);
    standAt(spot2[0] + 2.5, spot2[1] + 2.5);
    const left = trees.daysLeft(s2);
    lookUntil(G.clock.getElapsed() + left * DAY + 60);
    const oak2 = map.peekTile(spot2[0], spot2[1]).prop;
    row("stepped off, it grows on from where it waited and is an oak in its own days", !!oak2 && oak2.sprite === T.sapling.grows && oak2.id === s2.id, `${left.toFixed(2)} days left when stepped off; ${oak2 ? oak2.sprite : "nothing"}`);
    standAt(open[0] + 0.9, open[1] + 0.3);
    me.hands.main = G.items.makeEntry("hatchet", 1);
    const chopLabel = `Chop down (${oak.wood} log${oak.wood > 1 ? "s" : ""})`;
    const chopped = G.interact.performByLabel(me, { kind: "prop", id: oak.id }, chopLabel);
    finish();
    me.hands.main = null;
    const stump = map.peekTile(open[0], open[1]).prop;
    row("the grown oak is chopped by its label for its logs, and leaves a stump", chopped && !map.propById(oak.id) && !!stump && stump.sprite === "stump" && map.itemsAt(open[0], open[1]).filter((e) => e.id === "log").reduce((n, e) => n + e.count, 0) === oak.wood, `${chopLabel}; ${stump ? stump.sprite : "nothing"}`);
    for (const e of [...map.itemsAt(open[0], open[1])]) map.takeItem(open[0], open[1], e);

    // ---- an apple tree's sapling grows an apple tree (a default, the review of #461); a wall on its edge holds it back, and Inspect says why ----
    {
      const ax = openNear(home[0] + 6, home[1] - 6, (x, y) => map.canBuildWall(x, y, "n") && Math.hypot(x - spot2[0], y - spot2[1]) > 3 && Math.hypot(x - open[0], y - open[1]) > 3);
      T.sapling.chance = 1;
      const fromApple = trees.fellDrop(ax[0], ax[1], "tree_apple");
      T.sapling.chance = chance0;
      if (fromApple) map.takeItem(ax[0], ax[1], fromApple);
      const appleSap = G.items.makeEntry("sapling", 1, { tree: "tree_apple" });
      const appleCard = info.textOf(info.cardFor(appleSap));
      row("a felled apple tree's sapling carries its tree, and its card says it grows into an apple tree", !!fromApple && fromApple.tree === "tree_apple" && appleCard.includes("Grows into an apple tree in about 5 game days; it waits while anyone stands on it."), `${JSON.stringify(fromApple)}; ${appleCard.join(" | ")}`);
      standAt(ax[0] + 1.2, ax[1] + 0.3);
      G.inventory.stow(me, appleSap);
      placement.performPlacement(me, { kind: "setdown", uid: appleSap.uid, tx: ax[0], ty: ax[1] });
      const ap = map.peekTile(ax[0], ax[1]).prop;
      map.buildWall(ax[0], ax[1], "n", "wall");
      const blocked = ap ? trees.report(ap) : "";
      standAt(ax[0] + 3, ax[1] + 3);
      if (ap) lookUntil(ap.sapling.at + T.sapling.days * DAY + 60);
      const held = map.peekTile(ax[0], ax[1]).prop;
      row("with a wall on its edge it does not grow into its tree, and its Inspect gives the stand rule's reason", !!ap && ap.sapling.tree === "tree_apple" && held === ap && !!ap.sapling && /^A sapling that cannot grow into an apple tree here: not against a wall\./.test(blocked), `"${blocked}"; ${held ? held.sprite : "nothing"}`);
      map.destroyWall(ax[0], ax[1], "n");
      look();
      look();
      const grown = map.peekTile(ax[0], ax[1]).prop;
      row("the wall gone, it grows into an apple tree with its id", !!grown && !!ap && grown.sprite === "tree_apple" && grown.id === ap.id && !grown.sapling, grown ? `${grown.id} ${grown.sprite}` : "nothing");
    }

    // ---- sticks under a tree ----
    const tree = plainTreeNear(me.gx, me.gy);
    standAt(tree.tile[0] + 0.9, tree.tile[1] + 0.3);
    const acts = G.interact.actionsForTarget({ kind: "prop", id: tree.id }, me);
    const sAct = acts.find((a) => a.label === "Gather sticks");
    const eNear = G.interact.nearestSimpleAction(me);
    row("a standing tree's menu offers Gather sticks after its own, its bar the data's, the menu's alone: E beside the tree never takes it (E opens doors)", !!sAct && sAct.simple === false && sAct.duration === T.sticks.seconds && acts.indexOf(sAct) > acts.findIndex((a) => a.kind === "tree") && (!eNear || eNear.kind !== "sticks"), `${acts.map((a) => `${a.label}${a.simple ? " (E)" : ""}`).join(", ")}; E: ${eNear ? eNear.label : "none"}`);
    const st0 = count("stick");
    const ran = G.interact.performByLabel(me, { kind: "prop", id: tree.id }, "Gather sticks");
    const timed = !!me.action && me.action.action.duration === T.sticks.seconds;
    finish();
    const got = count("stick") - st0;
    const day = Math.floor(G.clock.getElapsed() / DAY);
    row("by the label a guest sends, after its bar: one or two sticks in the bag, and the tree's next day on its prop", ran && timed && got >= 1 && got <= 2 && tree.sticksAt === (day + 1) * DAY, `bar ${timed}, ${got} sticks, sticksAt ${tree.sticksAt} (day ${day + 1} starts ${(day + 1) * DAY}); ${message()}`);
    const again = G.verbs.run("sticks", G.world, me, { prop: tree.id });
    row("the same day it is greyed with why and the verb refuses", !again.ok && again.reason === trees.NONE_TODAY && labelsOf(tree).includes("Gather sticks (none until tomorrow) [off]"), `${again.reason}; ${labelsOf(tree).join(", ")}`);
    G.clock.setElapsed((day + 1) * DAY + 5);
    row("the next day it has sticks again", labelsOf(tree).includes("Gather sticks") && trees.hasSticks(tree), labelsOf(tree).join(", "));
    row("a stump offers no sticks", !labelsOf(stump).some((l) => /sticks/i.test(l)), labelsOf(stump).join(", "));
    const apple = map.allProps().filter((p) => p.sprite === "tree_apple").sort((a, b) => Math.hypot(a.tile[0] - me.gx, a.tile[1] - me.gy) - Math.hypot(b.tile[0] - me.gx, b.tile[1] - me.gy))[0];
    if (apple) {
      map.growTile(apple.tile[0], apple.tile[1]);
      standAt(apple.tile[0] + 0.9, apple.tile[1] + 0.3);
      const aa = G.interact.actionsForTarget({ kind: "prop", id: apple.id }, me);
      const near = G.interact.nearestSimpleAction(me);
      const onApple = near && near.target && near.target.id === apple.id;
      row("on a laden apple tree too, Gather sticks is on the menu but not E's, and E keeps to Pick apples", aa.some((a) => a.label === "Gather sticks" && a.simple === false) && aa.some((a) => /^Pick/.test(a.label) && a.simple) && (!onApple || /^Pick/.test(near.label)) && (!near || near.kind !== "sticks"), `${aa.map((a) => `${a.label}${a.simple ? " (E)" : ""}`).join(", ")}; E: ${near ? `${near.label} on ${near.target && near.target.id}` : "none"}`);
    }

    // ---- the cards on the page, over the bag ----
    bag.items.length = 0;
    for (const id of ["sapling", "stick"]) G.inventory.stow(me, G.items.makeEntry(id, 1));
    panel.setBagOpen(true);
    panel.renderInventoryPanel(me, bag, null, G.inventory.beltOf(me));
    const { hoverCard: HC } = await import("/src/tuning.js");
    const read = {};
    for (const id of ["sapling", "stick"]) {
      const i = bag.items.findIndex((e) => e.id === id);
      const el = document.querySelector(`.inv-item[data-bag="inv"][data-index="${i}"]`);
      if (!el) { read[id] = "(not in the bag)"; continue; }
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
      await wait(HC.delayMs + 60);
      const c = document.getElementById("hover-card");
      read[id] = c && !c.hidden ? c.textContent.replace(/\s+/g, " ").trim() : "(no card)";
    }
    (await import("/src/ui/hover-card.js")).hide();
    panel.setBagOpen(was.bag);
    const sapOk = /^Sapling/.test(read.sapling) && read.sapling.includes("Place: plant on open grass outdoors.") && read.sapling.includes("Grows into an oak in about 5 game days") && read.sapling.includes("Sometimes dropped by a felled tree (about 1 in 3).");
    row("over the bag the sapling's card says its name, its kind, Place, how long it grows, and where it comes from; the stick's where it is gathered", sapOk && read.stick.includes(STICK_LINE) && cardText("sapling") === SAPLING_CARD, `sapling: ${read.sapling} || stick: ${read.stick}`);
    bag.items.length = 0;

    // ---- the sync part ----
    {
      const t2 = plainTreeNear(me.gx, me.gy, [tree.id]);
      standAt(t2.tile[0] + 0.9, t2.tile[1] + 0.3);
      const m0 = G.game.syncParts().map;
      G.verbs.run("sticks", G.world, me, { prop: t2.id });
      row("a tree's sticks day moves the map's sync part (a guest's chunk carries it)", G.game.syncParts().map !== m0, `${m0} -> ${G.game.syncParts().map}`);
    }

    // ---- two tabs: a sapling and a gathered tree beside every other player, a sapling in each one's bag ----
    if (keep) {
      const others = G.game.state.players.filter((p) => p !== me);
      const guest = others[0];
      if (guest) {
        const gx = Math.round(guest.gx);
        const gy = Math.round(guest.gy);
        const a = openNear(gx, gy, (x, y) => Math.hypot(x - gx, y - gy) >= 1.5 && Math.hypot(x - gx, y - gy) <= 2.4);
        standAt(a[0] + 1.2, a[1] + 0.3);
        const e = sapEntry();
        setdown.place(me, e.uid, a[0], a[1]);
        const planted = map.peekTile(a[0], a[1]).prop;
        const gathered = plainTreeNear(gx, gy);
        standAt(gathered.tile[0] + 0.9, gathered.tile[1] + 0.3);
        G.verbs.run("sticks", G.world, me, { prop: gathered.id });
        const t3 = plainTreeNear(gx, gy, [gathered.id]);
        G.map.ensureAround(t3.tile[0], t3.tile[1], 1);
        for (const p of others) { p.gx = t3.tile[0] + 0.9; p.gy = t3.tile[1] + 0.3; p.auto = null; G.inventory.stow(p, G.items.makeEntry("sapling", 1)); }
        const spot = openNear(t3.tile[0], t3.tile[1], (x, y) => Math.hypot(x - (t3.tile[0] + 0.9), y - (t3.tile[1] + 0.3)) <= 2.4 && Math.hypot(x - (t3.tile[0] + 0.9), y - (t3.tile[1] + 0.3)) >= 1);
        if (planted && planted.sapling) kept = { sapling: { id: planted.id, sprite: planted.sprite, tile: [...planted.tile], at: planted.sapling.at }, gathered: { id: gathered.id, sticksAt: gathered.sticksAt }, tree: { id: t3.id, tile: [...t3.tile] }, spot };
      }
      row("kept for the guest: a sapling planted, a tree gathered under, a tree and a sapling for each other player", !!kept, kept ? JSON.stringify(kept) : "no other player");
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    T.sapling.chance = chance0;
    try { G.placement.cancel(); } catch { /* no mode */ }
    if (restoreView) restoreView();
    (await import("/src/ui/hover-card.js")).hide();
    panel.setBagOpen(was.bag);
    me.action = null;
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    if (keep) {
      if (bag) bag.items.splice(0, bag.items.length, ...bag0);
      G.teleport(meAt[0], meAt[1]);
    } else {
      try { await G.restoreWorld(clean); } catch (e) { rows.push({ check: "put back", result: "FAIL", detail: e.message }); }
    }
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  return done();
}
