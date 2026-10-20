// The woods, and a door or window of another wood than its wall (#334; src/woods.js). From the console, on a tab with `?nosave`:
//   await __game.check("woods")
// The pixel proof: the oak wall's shut door and shut shutters with each wood's table applied (the leaf's pixels from the leaf wood's, the rest from the wall's own) equal the delivered file of
// every wood, for the six wall types and the four frames each, pixel for pixel (a wall and a leaf of one wood is the delivered file); and for every wall and every other leaf wood the
// recoloured frame is the delivered wall's pixels outside the leaf and the delivered leaf wood's inside it. Then the sheet a wall with another wood's leaf is drawn from (registered once,
// its open leaves the leaf wood's parts), the palette (a row per wall type, a region's two only with Free building on; R cycles the leaf wood of a door or window, shown under its row;
// the ghost and the prompt say it), the plank's card, and a guest's build command, the way the host runs it. The walls, the rules, and the mode are put back.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const W = await import("/src/woods.js");
  const placement = await import("/src/placement.js");
  const palette = await import("/src/ui/build-palette.js");
  const info = await import("/src/item-info.js");
  const me = G.player;
  const role = G.net.status().role;
  const wasPaused = G.loop.isPaused();
  const meAt = [me.gx, me.gy];
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const counts0 = bag0.map((e) => [e, e.count]);
  const free0 = G.rules.get ? G.rules.get().freeBuilding : G.rules.rules.freeBuilding;
  const made = [];
  const setFree = (on) => G.rules.set({ freeBuilding: on });
  try {
    G.loop.setPaused(true);
    const T = await (await fetch("/data/wood_tones.json")).json();
    const png = (name) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `/data/art/village/${name}.png`; });
    const pixels = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const k = c.getContext("2d"); k.drawImage(img, 0, 0); return k.getImageData(0, 0, c.width, c.height); };
    const sprites = { oak: "wall_wood", spruce: "wall_spruce", mahogany: "wall_mahogany", winterpine: "wall_winterpine", bloodbark: "wall_bloodbark", daub: "wall_daub" };
    const file = (wood, frame) => `${sprites[wood]}_${frame}`; // e.g. wall_spruce_north_door_shut
    const FRAMES = ["north_door_shut", "west_door_shut", "north_window_shut", "west_window_shut"];
    const oak = G.assets.getSheet("wall_wood");
    W.setTones(T);
    const delivered = {};
    for (const w of Object.keys(sprites)) for (const f of FRAMES) delivered[`${w}/${f}`] = pixels(await png(file(w, f)));
    const diff = (a, b, only = null) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) { if (only && !only(i / 4)) continue; if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) n++; } return n; };

    // 1. Each wood's shut frames, from the oak ones by its table, are the delivered files.
    const bad = [];
    for (const w of Object.keys(sprites)) {
      const leafWood = w === "daub" ? "oak" : w; // daub's leaves are oak's
      for (const f of FRAMES) {
        const n = diff(W.shutPixels(oak, f, w, leafWood), delivered[`${w}/${f}`]);
        if (n) bad.push(`${w}/${f}: ${n} px`);
      }
    }
    row("the oak frames with each wood's table equal the delivered shut door and shutters of all six, pixel for pixel (daub's leaves oak's)", bad.length === 0, bad.join(" | ") || "24 frames, 0 px different");
    // 2. Every wall with every other leaf wood: the wall's pixels outside the leaf, the leaf wood's inside it.
    const mixed = [];
    let pairs = 0;
    for (const w of Object.keys(sprites)) {
      for (const l of ["oak", "spruce", "mahogany", "winterpine", "bloodbark"]) {
        if (l === w) continue;
        pairs++;
        for (const f of FRAMES) {
          const mask = W.shutMask(oak, f);
          const v = W.shutPixels(oak, f, w, l);
          const nOut = diff(v, delivered[`${w}/${f}`], (i) => !mask[i]);
          const nIn = diff(v, delivered[`${l}/${f}`], (i) => !!mask[i]);
          if (nOut || nIn) mixed.push(`${w}>${l}/${f}: ${nOut} outside, ${nIn} inside`);
        }
      }
    }
    row("every wall with every other wood's leaves: the wall's delivered pixels outside the leaf and the leaf wood's inside it", mixed.length === 0, mixed.slice(0, 3).join(" | ") || `${pairs} pairs by 4 frames, 0 px different`);

    // 3. The sheet a wall of another leaf wood is drawn from.
    const mah = { kind: "door", sprite: "wall_mahogany", leaf: "wall_winterpine" };
    const plain = { kind: "door", sprite: "wall_mahogany" };
    const own = G.assets.getSheet("wall_mahogany");
    const s1 = W.sheetFor(mah);
    const s2 = W.sheetFor(mah);
    row("a wall with its own leaves is drawn from its own sheet; one with another wood's from a registered copy, made once, its open leaves that wood's", W.sheetFor(plain) === own && s1 !== own && s1 === s2 && G.assets.getSheet("leaf:wall_mahogany>wall_winterpine") === s1 && s1.wall.parts === "wall_parts_winterpine" && s1.wall.wood === "mahogany" && !!G.gl.frameUV(s1, "north_door_shut"), `${s1 && s1.id} parts ${s1 && s1.wall.parts}`);
    row("the open leaves are the leaf wood's parts sheet, the wall's own when none is set", W.partsOf(mah) === "wall_parts_winterpine" && W.partsOf(plain) === "wall_parts_mahogany" && W.partsOf({ sprite: "wall_daub" }) === "wall_parts_wood" && W.partsOf({ sprite: "wall_log" }) === "wall_parts_log", `${W.partsOf(mah)} | ${W.partsOf(plain)} | ${W.partsOf({ sprite: "wall_daub" })}`);

    // 4. The palette and the card.
    setFree(false);
    const names = placement.paletteKinds().map((k) => k.label);
    const woodRows = ["Oak wall", "Spruce wall", "Mahogany wall", "Daub wall"];
    row("with Free building off the palette has a wall of oak, spruce, mahogany, and daub, and neither region wood", woodRows.every((n) => names.includes(n)) && !names.includes("Winter Pine wall") && !names.includes("Bloodbark wall"), names.join(", "));
    setFree(true);
    const namesFree = placement.paletteKinds().map((k) => k.label);
    row("with Free building on it has Winter Pine and Bloodbark too", namesFree.includes("Winter Pine wall") && namesFree.includes("Bloodbark wall"), namesFree.join(", "));
    const cards = [false, true].map((on) => { setFree(on); return info.textOf(info.cardFor(G.items.makeEntry("plank", 1))).join(" | "); });
    row("the plank's card, with Free building off and on, says the walls once and keeps the door, window, fence, and gate, and never lists a region's wood", cards.every((c) => /Builds: wood wall \(1\), door \(3\), window \(2\), fence \(1\), gate \(2\)\./.test(c) && !/winter pine|bloodbark/i.test(c)) && cards[0] === cards[1], cards.map((c) => c.slice(c.indexOf("Builds:"))).join(" || "));
    setFree(true);

    if (role === "guest") {
      // A guest: the replica holds a door of another wood the host built, with its leaf.
      const [gx, gy] = [Math.round(me.gx), Math.round(me.gy)];
      let found = null;
      for (let dy = -14; dy <= 14 && !found; dy++) for (let dx = -14; dx <= 14 && !found; dx++) for (const e of ["n", "w"]) { const w = map.peekTile(gx + dx, gy + dy)?.[e]; if (w && w.leaf) found = { x: gx + dx, y: gy + dy, e, leaf: w.leaf, sprite: w.sprite }; }
      row("on a guest the replica has the door or window of another wood the host built, with its leaf", !!found && !!W.sheetFor(map.peekTile(found.x, found.y)[found.e]), found ? JSON.stringify(found) : "none within fourteen tiles");
      throw Object.assign(new Error("guest done"), { guestDone: true });
    }

    // 5. The mode: a door in a mahogany wall, R cycles its leaf wood, the ghost and prompt show it, a click builds it.
    map.ensureAround(me.gx, me.gy, 3);
    let at = null;
    for (let dy = -16; dy <= 16 && !at; dy++) for (let dx = -16; dx <= 16 && !at; dx++) {
      const x = Math.round(meAt[0]) + dx;
      const y = Math.round(meAt[1]) + dy;
      let ok = true;
      for (let ay = -2; ay < 4 && ok; ay++) for (let ax = -1; ax < 7 && ok; ax++) { const t = map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.rug && !t.n && !t.w && !(t.items && t.items.length) && map.isWalkableTile(x + ax, y + ay); }
      if (ok) at = [x, y];
    }
    if (!at) throw new Error("no bare grass for the check");
    const [x, y] = at;
    for (let i = 0; i < 5; i++) { map.buildWall(x + i, y, "n", "wall", i === 3 ? "wall_log" : i === 1 ? "wall_daub" : "wall_mahogany"); made.push([x + i, y, "n"]); }
    const inp = await import("/src/input.js");
    const cv = document.getElementById("game");
    const cvRect = cv.getBoundingClientRect();
    const cam0 = { gx: G.camera.cam.gx, gy: G.camera.cam.gy };
    const mouse0 = { ...inp.getMouse() };
    const look = () => { G.camera.snapTo(me.gx, me.gy); G.camera.applyOrigin(G.view.view.w, G.view.view.h); };
    cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + 1000, clientY: cvRect.top + 500, bubbles: true }));
    const sc = 1000 / inp.getMouse().x;
    const restoreView = () => {
      G.camera.snapTo(cam0.gx, cam0.gy);
      G.camera.applyOrigin(G.view.view.w, G.view.view.h);
      if (mouse0.inside) cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + mouse0.x * sc, clientY: cvRect.top + mouse0.y * sc, bubbles: true }));
      else cv.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    };
    made.push(restoreView);
    const settle = () => { placement.update(me); inp.endStep(); };
    // Aim at the middle of the edge (tx, y), from beside it (the ghost needs the player within reach and not on the edge).
    const aimEdge = (tx) => { me.gx = tx; me.gy = y + 1.3; G.loop.advance(1 / 60); look(); const p = G.iso.toScreen(tx, y - 0.5); cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + p.x * sc, clientY: cvRect.top + p.y * sc, bubbles: true })); settle(); };
    // The hammer and planks, so the rules are met as a player meets them with Free building off (the tool rule, the cost).
    bag.items.length = 0;
    G.inventory.stow(me, G.items.makeEntry("hammer", 1));
    G.inventory.stow(me, G.items.makeEntry("plank", 12));
    G.player.action = null;
    setFree(false);
    placement.beginBuild("door");
    aimEdge(x);
    const g0 = placement.state.ghost;
    row("the door mode over a mahogany wall, hammer and planks in the bag: a green ghost of a mahogany door, the leaf the wall's own, the prompt naming it", !!g0 && g0.ok === true && g0.sprite === "wall_mahogany" && g0.leaf === "" && /leaves: the wall's own · R/.test(placement.prompt().label), g0 ? `${g0.sprite} leaf "${g0.leaf}" ${g0.ok ? "green" : g0.reason} | ${placement.prompt() && placement.prompt().label}` : "no ghost");
    const cycle = [];
    for (let i = 0; i < 5; i++) { inp.tap("KeyR"); settle(); cycle.push(placement.buildLeaf() || "own"); }
    row("R cycles the leaf wood: the wall's own, oak, spruce, mahogany, and round again (Free building off)", cycle.join(",") === "wall_wood,wall_spruce,wall_mahogany,own,wall_wood", cycle.join(","));
    setFree(true);
    const all = ["own"];
    placement.beginBuild("door");
    for (let i = 0; i < 6; i++) { inp.tap("KeyR"); settle(); all.push(placement.buildLeaf() || "own"); }
    row("with Free building on the cycle goes on through Winter Pine and Bloodbark", all.join(",") === "own,wall_wood,wall_spruce,wall_mahogany,wall_winterpine,wall_bloodbark,own", all.join(","));
    // The palette shows the choice under the door row.
    palette.openPalette(me);
    palette.render(me);
    placement.beginBuild("door");
    inp.tap("KeyR"); settle();
    inp.tap("KeyR"); settle();
    palette.render(me);
    const html = document.getElementById("build-palette").innerHTML;
    row("the palette lists a row per wall type and, under the active door row, the leaf wood and R", /Oak wall/.test(html) && /Daub wall/.test(html) && /Winter Pine wall/.test(html) && /leaves: Spruce · R/.test(html), (html.match(/bp-sub">[^<]*/) || ["no sub line"])[0]);
    palette.close();
    // A click builds a Winter Pine door in the mahogany wall; the ghost carried the leaf.
    placement.beginBuild("door");
    inp.tap("KeyR"); settle();
    inp.tap("KeyR"); settle();
    inp.tap("KeyR"); settle();
    inp.tap("KeyR"); settle(); // oak, spruce, mahogany, Winter Pine
    aimEdge(x);
    const g1 = placement.state.ghost;
    row("with Winter Pine chosen the ghost is a mahogany door with a Winter Pine leaf", !!g1 && g1.ok === true && g1.leaf === "wall_winterpine" && g1.chosenLeaf === "wall_winterpine", g1 ? `${g1.sprite} leaf ${g1.leaf}` : "no ghost");
    const clicked = placement.tryConfirm(me);
    G.interact.updateAction(me, 10); // the timed build, run out
    const d = map.peekTile(x, y).n;
    row("a click builds it: a door of the mahogany wall with leaf Winter Pine, and the mode goes on", clicked === true && d.kind === "door" && d.sprite === "wall_mahogany" && d.leaf === "wall_winterpine", d ? `${d.kind} ${d.sprite} leaf ${d.leaf}` : "none");
    // Over that door broken, the default leaf is its wood, and the prompt says so.
    d.broken = true;
    d.hp = 0;
    map.touch(x, y);
    placement.beginBuild("door");
    aimEdge(x);
    const g2 = placement.state.ghost;
    row("over a broken Winter Pine door the ghost defaults to its wood, and the prompt says \"as it was\"", !!g2 && g2.ok === true && g2.leaf === "wall_winterpine" && g2.carriedLeaf === "wall_winterpine" && /leaves: as it was, Winter Pine · R/.test(placement.prompt().label), g2 ? `leaf ${g2.leaf} carried ${g2.carriedLeaf} | ${placement.prompt() && placement.prompt().label}` : "no ghost");
    placement.cancel();
    setFree(false);
    // The rules the host meets, by the command a guest sends.
    const cmd = (what, tx, leaf) => { me.gx = tx; me.gy = y + 1.2; const r = placement.performPlacement(me, { kind: "build", what, tx, ty: y, edge: "n", ...(leaf ? { leaf } : {}) }); G.interact.updateAction(me, 10); return r; }; // the build is timed
    cmd("window", x + 1, "wall_spruce");
    const win = map.peekTile(x + 1, y).n;
    row("a guest's build command (the same `build`, with a leaf) makes a spruce window in a daub wall", win.kind === "window" && win.sprite === "wall_daub" && win.leaf === "wall_spruce", `${win.kind} ${win.sprite} leaf ${win.leaf}`);
    cmd("door", x + 3, "wall_spruce");
    const logDoor = map.peekTile(x + 3, y).n;
    row("the host refuses a spruce door in a log wall (nothing built, nothing spent)", logDoor.kind === "wall", `${logDoor.kind} ${logDoor.sprite}`);
    cmd("door", x + 2, "wall_winterpine");
    const wp = map.peekTile(x + 2, y).n;
    row("and a Winter Pine door with Free building off", wp.kind === "wall", `${wp.kind}`);
  } catch (e) {
    if (!e.guestDone) rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    placement.cancel();
    for (const m of made) { if (typeof m === "function") m(); else if (map.tileAt(m[0], m[1])[m[2]]) map.destroyWall(m[0], m[1], m[2]); }
    setFree(!!free0);
    bag.items.splice(0, bag.items.length, ...bag0);
    for (const [e, n] of counts0) e.count = n;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
