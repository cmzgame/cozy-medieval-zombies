// The build palette's two tabs and the Terrain tab's painting (Michael, 2026-10-28: "Build menu becomes 2: Build, and Terrain"). From the console,
// on a tab with `?nosave&mute`, at any window size (the geometry rows read what the page has; run it at 1280 by 800, 1280 by 500, and 1000 by 420):
//   await __game.check("terrain")
// 1. The palette: no tab bar with Free building off; with it on a Build and a Terrain tab (Build marked), the tab remembered over a close and an open,
//    each tab's rows under their small headings, Take apart on Build only, every row's `title`, long labels ellipsised.
// 2. The height cap: the palette stays under the HUD and over the log, the hotbar, and the nav row, only its list scrolls (title, tabs, Take apart, hint
//    stay), every row can be scrolled into the list's box, the scroll is kept across the per-step rebuild, a picked row is scrolled into view when the
//    palette opens again, and a wheel over the list never reaches the world's zoom.
// 3. The ghost of a terrain drag: green where it paints, red where not, with its reason ("Already dirt", "A floor is laid there").
// 4. Painted by the commands a guest sends, then read off the ground's bake: a dirt patch's edge is ragged against grass (dirt pixels spill onto the
//    grass tile, grass pixels into the dirt tile), deep water blends too, a shallow tile is a hard diamond, and the pink is pink in the bake and in the
//    drawn frame at noon.
// What it paints is put back (the floors, the pause, the hour, the rules, the camera and the cursor) in the finally.

export async function run(game) {
  const G = game;
  const map = G.map;
  const me = G.player;
  const rows = [];
  const row = (check, ok, detail = "") => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const placement = await import("/src/placement.js");
  const bp = await import("/src/ui/build-palette.js");
  const inp = await import("/src/input.js");
  const role = G.net.status().role;
  if (!new URLSearchParams(location.search).has("nosave")) {
    row("a ?nosave page", false, "it paints the world: open the page with ?nosave&mute");
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: 0, total: 1 };
  }
  const C = map.CHUNK;
  const saved = { paused: G.loop.isPaused(), free: G.rules.rules.freeBuilding, hour: G.clock.getHour(), gx: me.gx, gy: me.gy, layer: me.layer || 0, aggro: G.rules.rules.zombieAggro };
  const painted = new Map(); // key -> [x, y, floor] to put back
  const paint = (x, y, id) => {
    const t = map.peekTile(x, y, 0);
    if (!painted.has(`${x},${y}`)) painted.set(`${x},${y}`, [x, y, t.floor]);
    map.setFloor(x, y, id, 0);
  };
  const cv = document.getElementById("game");
  const cvRect = cv.getBoundingClientRect();
  const cam0 = { gx: G.camera.cam.gx, gy: G.camera.cam.gy };
  const mouse0 = { ...inp.getMouse() };
  let sc = 1;
  const palEl = () => document.getElementById("build-palette");
  const listEl = () => palEl().querySelector(".bp-list");
  const rect = (el) => el.getBoundingClientRect();
  const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const rowsOf = () => [...listEl().querySelectorAll(".bp-row")];
  const names = () => rowsOf().map((r) => r.querySelector(".bp-name").textContent);
  const groups = () => [...listEl().querySelectorAll(".bp-group")].map((g) => g.textContent);
  try {
    G.screens.hide();
    G.loop.setPaused(true);
    G.rules.set({ zombieAggro: false });

    // ---- 1. the tabs ----
    placement.cancel();
    bp.close();
    G.rules.set({ freeBuilding: false });
    bp.openPalette(me);
    const barOff = palEl().querySelector(".bp-tabs");
    row("with Free building off the palette is Build alone: no tab bar, no Terrain row, Take apart and the hint kept", barOff.hidden && !placement.paletteKinds().some((k) => placement.tabOf(k) === "terrain") && !!palEl().querySelector(".bp-remove") && /N or Esc/.test(palEl().querySelector(".bp-hint").textContent), `tabs ${placement.paletteTabs().map((t) => t.id)}; ${names().length} rows`);
    bp.close();
    G.rules.set({ freeBuilding: true });
    bp.openPalette(me);
    const tabBtns = [...palEl().querySelectorAll(".bp-tab")];
    row("with it on there are two tabs, Build and Terrain, the Build one marked", tabBtns.map((b) => b.textContent).join() === "Build,Terrain" && tabBtns[0].classList.contains("on") && !tabBtns[1].classList.contains("on") && !palEl().querySelector(".bp-tabs").hidden, tabBtns.map((b) => `${b.textContent}${b.classList.contains("on") ? "*" : ""}`).join());
    const buildGroups = groups();
    const buildNames = names();
    row("Build holds walls, openings, props, floors, and stairs under three headings, with Take apart; the cliffs and the ground are not here", buildGroups.join() === "Walls and openings,Props,Floors and stairs" && buildNames.includes("Log wall") && buildNames.includes("Door") && buildNames.includes("Plank floor") && buildNames.includes("Stone stair") && !buildNames.some((n) => /Cliff|ramp|Grass|Dirt|Water/.test(n)) && !palEl().querySelector(".bp-foot").hidden, `${buildGroups.join(" | ")}; ${buildNames.length} rows`);
    tabBtns[1].click();
    const terrNames = names();
    row("a click on Terrain shows the ground's surfaces, the water, and the landforms, each under its heading, with no Take apart", groups().join() === "Ground,Water,Landforms" && terrNames.join() === "Grass,Dirt,Cobblestone,Random spawn,Shallow water,Water,Cliff wall,Grassy cliff wall,Cliff top,Grassy cliff top,Stone ramp" && palEl().querySelector(".bp-foot").hidden && bp.currentTab() === "terrain", `${groups().join(" | ")}; ${terrNames.join(", ")}`);
    const sw = [...listEl().querySelectorAll(".bp-sw")].map((e) => e.style.background);
    row("each terrain row shows its floor's colour, the pink one pink; every row has a title", sw.length === 6 && /255, 95, 180|#ff5fb4/i.test(sw[3]) && rowsOf().every((r) => r.title && r.title.includes(r.querySelector(".bp-name").textContent)), `${sw.length} swatches, the fourth ${sw[3]}`);
    bp.close();
    bp.openPalette(me);
    row("the tab is remembered over a close and an open", bp.currentTab() === "terrain" && palEl().querySelector(".bp-tab.on").textContent === "Terrain" && names()[0] === "Grass");
    palEl().querySelector('.bp-tab[data-tab="build"]').click();
    row("and Build is one click back", bp.currentTab() === "build" && names()[0] === "Log wall");
    // The remembered tab outlives the Terrain tab's absence: Free building off shows Build, and Terrain returns with Free building.
    palEl().querySelector('.bp-tab[data-tab="terrain"]').click();
    bp.close();
    G.rules.set({ freeBuilding: false });
    bp.openPalette(me);
    const during = [bp.currentTab(), bp.rememberedTab(), palEl().querySelector(".bp-tabs").hidden, names()[0]];
    bp.close();
    G.rules.set({ freeBuilding: true });
    bp.openPalette(me);
    row("the remembered tab is kept while Terrain is not on offer and comes back with Free building (shown Build meanwhile)", during.join() === "build,terrain,true,Log wall" && bp.currentTab() === "terrain" && names()[0] === "Grass", `meanwhile ${during.join(" ")}; after ${bp.currentTab()}`);
    palEl().querySelector('.bp-tab[data-tab="build"]').click();

    // ---- 2. the height cap and the scroll ----
    const pal = rect(palEl());
    const ui = rect(document.getElementById("ui"));
    const probes = ["#hud", "#clock", "#log", "#hotbar", "#nav-row"].map((s) => [s, document.querySelector(s)]).filter(([, el]) => el && el.offsetParent !== null);
    const hit = probes.filter(([, el]) => overlap(pal, rect(el))).map(([s]) => s);
    row("the palette is inside the UI area and overlaps nothing at the screen's edge: the HUD, the log, the hotbar, the nav row", pal.top >= ui.top && pal.bottom <= ui.bottom && pal.left >= ui.left && pal.right <= ui.right && !hit.length, `${Math.round(pal.top)} to ${Math.round(pal.bottom)} of ${Math.round(ui.height)}${hit.length ? `; overlaps ${hit.join(", ")}` : ""}; checked ${probes.map(([s]) => s).join(" ")}`);
    const cs = getComputedStyle(listEl());
    row("only the list scrolls: overflow auto and contained, the title, the tabs, Take apart, and the hint outside it", cs.overflowY === "auto" && cs.overscrollBehaviorY === "contain" && !listEl().contains(palEl().querySelector(".bp-title")) && !listEl().contains(palEl().querySelector(".bp-tabs")) && !listEl().contains(palEl().querySelector(".bp-remove")) && !listEl().contains(palEl().querySelector(".bp-hint")), `overflow-y ${cs.overflowY}, overscroll ${cs.overscrollBehaviorY}; list ${listEl().clientHeight} of ${listEl().scrollHeight}`);
    const reach = (label) => {
      const bad = [];
      for (const r of rowsOf()) {
        listEl().scrollTop = Math.min(r.offsetTop, listEl().scrollHeight - listEl().clientHeight);
        const a = rect(r);
        const l = rect(listEl());
        if (a.top < l.top - 1 || a.bottom > l.bottom + 1) bad.push(r.querySelector(".bp-name").textContent);
      }
      listEl().scrollTop = 0;
      row(`every ${label} row can be scrolled into the list's box`, !bad.length && rowsOf().length > 5, bad.length ? `out of reach: ${bad.join(", ")}` : `${rowsOf().length} rows, the list ${listEl().clientHeight} px of ${listEl().scrollHeight}`);
    };
    reach("Build");
    palEl().querySelector('.bp-tab[data-tab="terrain"]').click();
    reach("Terrain");
    palEl().querySelector('.bp-tab[data-tab="build"]').click();
    // The scroll kept across the per-step rebuild (a row marked active changes the html).
    const scrollable = listEl().scrollHeight > listEl().clientHeight + 4;
    listEl().scrollTop = scrollable ? Math.min(60, listEl().scrollHeight - listEl().clientHeight) : 0;
    const was = listEl().scrollTop;
    const seen = rowsOf().find((r) => r.dataset.kind !== "__remove" && rect(r).top >= rect(listEl()).top && rect(r).bottom <= rect(listEl()).bottom);
    placement.beginBuild(seen.dataset.kind); // a row in view turns active: the list is rebuilt and stays where it was
    bp.render(me);
    const afterActive = listEl().scrollTop;
    placement.cancel();
    bp.render(me);
    row("the list's scroll is kept when the palette is rebuilt (a row in view turned active, then not)", afterActive === was && listEl().scrollTop === was && (scrollable || was === 0), `${was} then ${afterActive} then ${listEl().scrollTop}${scrollable ? "" : " (the whole list fits: nothing to scroll at this size)"}`);
    // A picked row is scrolled into view when the palette opens again.
    const last = rowsOf().filter((r) => r.dataset.kind !== "__remove").pop();
    last.click();
    row("picking a row enters its mode and shuts the palette", placement.state.kind === "build" && placement.state.build.what === last.dataset.kind && !bp.isOpen(), `${last.dataset.kind}: ${placement.state.kind}`);
    listEl().scrollTop = 0;
    bp.openPalette(me);
    const lr = rowsOf().find((r) => r.dataset.kind === last.dataset.kind);
    const inView = rect(lr).top >= rect(listEl()).top - 1 && rect(lr).bottom <= rect(listEl()).bottom + 1;
    row("the picked row is scrolled into view when the palette opens again", inView, `${last.dataset.kind}: row ${Math.round(rect(lr).top)} to ${Math.round(rect(lr).bottom)}, list ${Math.round(rect(listEl()).top)} to ${Math.round(rect(listEl()).bottom)}`);
    placement.cancel();
    // A wheel over the palette never reaches the world's zoom (the wheel is read on the canvas alone).
    inp.takeWheel();
    listEl().dispatchEvent(new WheelEvent("wheel", { deltaY: 240, bubbles: true, cancelable: true }));
    const overPalette = inp.takeWheel();
    cv.dispatchEvent(new WheelEvent("wheel", { deltaY: 240, bubbles: true, cancelable: true }));
    const overWorld = inp.takeWheel();
    row("a wheel over the palette adds nothing to the world's zoom; over the world it does", overPalette === 0 && overWorld !== 0, `palette ${overPalette}, world ${overWorld}`);
    bp.close();

    // ---- 3 and 4. the ghost, painting, the ground's bake ----
    const find = () => {
      const open = (x, y) => {
        for (let b = -1; b <= 9; b++) for (let a = -1; a <= 9; a++) {
          const t = map.peekTile(x + a, y + b, 0);
          if (!(t && t.floor === "floor_grass" && !t.prop && !t.rug && !t.n && !t.w && !(t.items && t.items.length) && map.isWalkableTile(x + a, y + b))) return false;
          if (map.stairAt(x + a, y + b, 0)) return false;
        }
        return true;
      };
      const px = Math.round(me.gx);
      const py = Math.round(me.gy);
      map.ensureAround(px, py, 3);
      const cand = [];
      for (let dy = -30; dy <= 30; dy += 1) for (let dx = -30; dx <= 30; dx += 1) cand.push([px + dx, py + dy]);
      cand.sort((p, q) => Math.hypot(p[0] - px, p[1] - py) - Math.hypot(q[0] - px, q[1] - py));
      return cand.find(([x, y]) => open(x, y)) || null;
    };
    const at = find();
    row("open grass for a patch", !!at);
    if (at) {
      const [x, y] = at;
      const stand = (gx, gy) => { me.gx = gx; me.gy = gy; me.layer = 0; me.rise = 0; me.auto = null; me.action = null; };
      const cmd = (what, a, b, a2 = a, b2 = b) => placement.performPlacement(me, { kind: "build", what, tx: x + a, ty: y + b, tx2: x + a2, ty2: y + b2 });
      const fl = (a, b) => map.peekTile(x + a, y + b, 0).floor;
      G.clock.setHour(12);
      stand(x + 4, y + 9);
      // The ghost: a 3 by 3 of dirt dragged over a tile already dirt and one with a laid floor.
      paint(x + 2, y + 1, "floor_dirt");
      painted.set(`${x + 3},${y + 1}`, [x + 3, y + 1, fl(3, 1)]);
      map.buildFloor(x + 3, y + 1, "floor_wood", 0, { free: true });
      const look = () => { G.camera.snapTo(me.gx, me.gy); G.camera.applyOrigin(G.view.view.w, G.view.view.h); };
      G.loop.advance(1 / 60);
      look();
      cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + 1000, clientY: cvRect.top + 500, bubbles: true }));
      sc = 1000 / inp.getMouse().x;
      const aimAt = (gx, gy) => { const p = G.iso.toScreen(gx, gy); cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + p.x * sc, clientY: cvRect.top + p.y * sc, bubbles: true })); };
      placement.beginBuild("terrain_dirt");
      placement.state.build.from = [x + 1, y + 1];
      look();
      aimAt(x + 3, y + 3);
      placement.update(me);
      inp.endStep();
      const g = placement.state.ghost;
      // The cost of a full 24 by 24 ghost recomputed at each cursor move (the plan is kept while nothing it reads has changed).
      const ms = [];
      for (let k = 0; k < 6; k++) {
        placement.state.build.from = [x - 8, y - 3];
        aimAt(x + 15 - (k % 2), y + 20);
        const t0 = performance.now();
        placement.update(me);
        ms.push(performance.now() - t0);
      }
      const big = placement.state.ghost;
      row("a 24 by 24 ghost recomputes in a few milliseconds at a cursor move", !!big && big.tiles.length >= 500 && Math.max(...ms) < 40, `${big ? big.tiles.length : 0} tiles: ${ms.map((m) => m.toFixed(1)).join(", ")} ms`);
      const why = g && g.tiles ? Object.fromEntries(g.tiles.map(([a, b, r]) => [`${a - x},${b - y}`, r])) : {};
      row("the ghost of a terrain drag is each tile green or red with its reason: nine tiles, the dirt one \"That is already dirt ground\", the laid one \"A floor is laid there\", the rest green", !!g && g.kind === "floor" && g.terrain === true && g.tiles.length === 9 && why["2,1"] === "That is already dirt ground" && why["3,1"] === "A floor is laid there" && g.tiles.filter((t) => !t[2]).length === 7 && g.ok, g ? `${g.tiles.length} tiles, ${g.good} green; ${why["2,1"]}; ${why["3,1"]}` : "no ghost");
      placement.cancel();
      map.takeUpFloor(x + 3, y + 1, 0);
      paint(x + 2, y + 1, "floor_grass");
      paint(x + 3, y + 1, "floor_grass");

      // The patch: dirt 3 by 3, cobble beside it, shallow water, deep water, the pink. By the commands a guest sends.
      stand(x + 4, y + 8);
      G.rules.set({ freeBuilding: true });
      const set = [["terrain_dirt", 0, 0, 2, 2], ["terrain_cobble", 4, 0, 4, 2], ["terrain_water_shallow", 0, 4, 2, 4], ["terrain_water", 3, 4, 5, 6], ["terrain_randomspawn", 0, 6, 1, 7]];
      for (const [what, a, b, a2, b2] of set) for (let j = Math.min(b, b2); j <= Math.max(b, b2); j++) for (let i = Math.min(a, a2); i <= Math.max(a, a2); i++) painted.set(`${x + i},${y + j}`, painted.get(`${x + i},${y + j}`) || [x + i, y + j, "floor_grass"]);
      for (const s of set) cmd(...s);
      row("the patch is painted by the guest's command: dirt, cobble, shallow water, water, the pink, each a floor change with no built record", fl(1, 1) === "floor_dirt" && fl(4, 1) === "floor_cobble" && fl(1, 4) === "floor_water_shallow" && fl(4, 5) === "floor_water" && fl(0, 6) === "floor_randomspawn" && ![[1, 1], [4, 1], [1, 4], [4, 5], [0, 6]].some(([a, b]) => map.peekTile(x + a, y + b, 0).built), [fl(1, 1), fl(4, 1), fl(1, 4), fl(4, 5), fl(0, 6)].join());
      // The bake: which kind each pixel of a tile is (ground.kindMap), and the frame's own pixels.
      const ids = G.ground.kindNames();
      const ownerOf = (px, py) => {
        const a = (px + 0.5) / 32 - 16;
        const b = (py + 0.5) / 16 - 1;
        const lx = Math.floor((a + b) / 2 + 0.5);
        const ly = Math.floor((b - a) / 2 + 0.5);
        return lx < 0 || ly < 0 || lx >= C || ly >= C ? null : [lx, ly];
      };
      const kindsOfTile = (tx, ty) => {
        const cx = Math.floor(tx / C);
        const cy = Math.floor(ty / C);
        const km = G.ground.kindMap(cx, cy);
        const counts = {};
        for (let py = 0; py < 512; py++) for (let px = 0; px < 1024; px++) {
          const o = ownerOf(px, py);
          if (!o || o[0] + cx * C !== tx || o[1] + cy * C !== ty) continue;
          const n = ids[km[py * 1024 + px]];
          counts[n] = (counts[n] || 0) + 1;
        }
        return counts;
      };
      const share = (c, k) => (c[k] || 0) / Object.values(c).reduce((a, b) => a + b, 0);
      const dirtEdge = kindsOfTile(x + 2, y + 1); // a dirt tile at the patch's edge
      const dirtMid = kindsOfTile(x + 1, y + 1); // the middle one
      // The ragged edge is noise in the world's position, so the mixed tile is looked for among the tiles within two or three of the patch, not at one spot (the dirt reaches a tile or two past the painted ones, as the valley's paths do).
      const ring = (x0, y0, x1, y1, d = 3) => { const t = []; for (let b = y0 - d; b <= y1 + d; b++) for (let a = x0 - d; a <= x1 + d; a++) if (a < x0 || a > x1 || b < y0 || b > y1) t.push(kindsOfTile(x + a, y + b)); return t; };
      const mixed = (list, k) => list.find((c) => (c[k] || 0) > 50 && (c.grass || 0) > 50);
      const dirtRing = ring(0, 0, 2, 2, 2).filter((c) => !c.cobble && !c.water);
      const grassBeside = mixed(dirtRing, "dirt") || {};
      row("a painted dirt patch blends like the valley's: a grass tile beside it is part dirt and part grass (a ragged edge, no hard diamond), its own tiles dirt all through", (grassBeside.dirt || 0) > 100 && (grassBeside.grass || 0) > 100 && share(dirtEdge, "dirt") > 0.97 && share(dirtMid, "dirt") > 0.97, `ring ${JSON.stringify(dirtRing.slice(0, 6))}; grass beside ${JSON.stringify(grassBeside)}; edge ${JSON.stringify(dirtEdge)}; middle ${JSON.stringify(dirtMid)}`);
      const waterRing = ring(3, 4, 5, 6);
      const waterEdge = mixed(waterRing, "dirt") || {}; // a ragged dirt shore: a tile part dirt, part grass
      const waterMid = kindsOfTile(x + 4, y + 5);
      const shallow = kindsOfTile(x + 1, y + 4);
      const shallowEdge = kindsOfTile(x + 0, y + 4);
      row("deep water blends as the river does, a ragged dirt shore between it and the grass (a grass tile beside it is part dirt, part grass); a shallow tile is a hard diamond of the laid kind (as the river's ford)", (waterEdge.dirt || 0) > 100 && (waterEdge.grass || 0) > 100 && share(waterMid, "water") > 0.97 && share(shallow, "laid") > 0.99 && share(shallowEdge, "laid") > 0.99, `water ring ${JSON.stringify(waterRing.slice(0, 6))}; water edge ${JSON.stringify(waterEdge)}; shallow ${JSON.stringify(shallow)}; shallow edge ${JSON.stringify(shallowEdge)}`);
      const pinkBake = G.ground.bakeImage(Math.floor((x + 0) / C), Math.floor((y + 6) / C));
      let pink = 0;
      let all = 0;
      const cx0 = Math.floor(x / C);
      const cy0 = Math.floor((y + 6) / C);
      for (let py = 0; py < 512; py++) for (let px = 0; px < 1024; px++) {
        const o = ownerOf(px, py);
        if (!o || o[0] + cx0 * C !== x || o[1] + cy0 * C !== y + 6) continue;
        const k = (py * 1024 + px) * 4;
        all++;
        if (pinkBake.data[k] > 220 && pinkBake.data[k + 2] > 140 && pinkBake.data[k + 1] < 130) pink++;
      }
      row("the pink tile bakes pink: the whole diamond of its tile is #ff5fb4 or its alternate", all > 500 && pink / all > 0.97, `${pink} of ${all} px`);
      // The drawn frame at noon, the player three tiles off, read at the pink tile's centre and at a grass tile's.
      stand(x + 4, y + 9.5);
      G.loop.advance(1 / 60);
      G.loop.advance(1 / 60);
      look();
      const ctx = cv.getContext("webgl2");
      const readAt = (gx, gy) => {
        const p = G.iso.toScreen(gx, gy);
        const k = cv.width / G.view.view.w;
        const px = new Uint8Array(4);
        ctx.readPixels(Math.round(p.x * k), cv.height - 1 - Math.round(p.y * k), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
        return [...px];
      };
      G.loop.advance(1 / 60);
      const pk = readAt(x, y + 6);
      const gr = readAt(x + 8, y + 3);
      const isPink = (c) => c[0] > 150 && c[0] > c[1] * 1.5 && c[2] > c[1] * 1.2;
      row("and drawn in the frame at noon the pink tile is pink and the grass is not", isPink(pk) && !isPink(gr), `pink tile ${pk.slice(0, 3)}, grass ${gr.slice(0, 3)}`);
    }
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    placement.cancel();
    bp.close();
    for (const [x, y, f] of painted.values()) { const t = map.peekTile(x, y, 0); if (t && t.built) map.takeUpFloor(x, y, 0); map.setFloor(x, y, f, 0); }
    G.camera.snapTo(cam0.gx, cam0.gy);
    G.camera.applyOrigin(G.view.view.w, G.view.view.h);
    if (mouse0.inside) cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + mouse0.x * sc, clientY: cvRect.top + mouse0.y * sc, bubbles: true }));
    else cv.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    G.clock.setHour(saved.hour);
    G.rules.set({ freeBuilding: saved.free, zombieAggro: saved.aggro });
    me.gx = saved.gx; me.gy = saved.gy; me.layer = saved.layer;
    G.loop.setPaused(saved.paused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
