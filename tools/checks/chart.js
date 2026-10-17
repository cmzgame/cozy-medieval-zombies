// The chart and its panel (docs/33, #203 and #204). From the console, on a tab with `?nosave`:
//   await __game.check("chart")
// It reads what the world has charted of itself: the spawn's surroundings and nothing past the radius; a tile behind a shut wall is not charted and is
// once a door in it is open; a wall built (with the built flag) and taken down, a tilled tile, and a felled tree change their cells; a wild chunk dropped by
// eviction keeps its chart; serialize, restore, serialize is the same; the chart is the world's, not a player's; and the reveal's cost in open land. The
// chart, the player, and the map it builds on are put back (the chart from its own save). The panel's rows (7 to 9 of docs/33's acceptance, and the rest) open the map by M and read what it drew.

export async function run(game) {
  const G = game;
  const map = G.map;
  const S = G.game.state;
  const chart = await import("/src/chart.js");
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const chart0 = JSON.stringify(chart.serialize());
  const aggro0 = G.rules.rules.zombieAggro;
  const wasPaused = G.loop.isPaused();
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const made = [];
  const restore = [];
  const T = G.tuning.world;
  const surface = (x, y) => chart.surfaceOfCell(chart.cellAt(x, y));
  try {
    G.loop.setPaused(true);
    G.rules.rules.zombieAggro = false; // the dead near a spot this check stands on must not bite it mid-run
    // 1. A fresh chart: the spawn's surroundings after a step and nothing beyond the radius.
    chart.restore({ chunks: [] });
    for (const p of S.players) p.chartTile = null;
    G.teleport(S.info.spawn[0] + 0.1, S.info.spawn[1] + 0.1);
    step();
    let near = 0;
    let far = 0;
    for (const c of chart.chartedChunks()) for (let i = 0; i < 256; i++) if (c.cells[i]) {
      const x = c.cx * 16 + (i % 16);
      const y = c.cy * 16 + Math.floor(i / 16);
      if (Math.hypot(x - me.gx, y - me.gy) <= T.chartRadius + 0.5) near++; else far++;
    }
    row("a fresh chart has charted the spawn's surroundings after one step, and nothing beyond the radius", near > 5 && far === 0 && surface(S.info.spawn[0] + 40, S.info.spawn[1] + 40) === 0, `${near} tiles charted within ${T.chartRadius}, ${far} beyond`);

    // A patch of bare grass in open land, with room round it.
    let at = null;
    map.ensureAround(me.gx, me.gy, 4);
    for (let dy = -30; dy <= 30 && !at; dy += 2) for (let dx = -30; dx <= 30 && !at; dx += 2) {
      const x = Math.round(me.gx) + dx;
      const y = Math.round(me.gy) + dy;
      let ok = true;
      for (let ay = -5; ay <= 5 && ok; ay++) for (let ax = -5; ax <= 8 && ok; ax++) { const t = map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w; }
      if (ok) at = [x, y];
    }
    if (!at) throw new Error("no open grass for the check");
    const [x, y] = at;
    chart.restore({ chunks: [] });
    for (const p of S.players) p.chartTile = null;
    const column = (sprite) => { for (let dy = -4; dy <= 4; dy++) map.buildWall(x + 2, y + dy, "w", "wall", sprite); };
    const unwall = () => { for (let dy = -4; dy <= 4; dy++) map.destroyWall(x + 2, y + dy, "w"); };
    restore.push(unwall);
    column("wall_wood");
    G.teleport(x + 0.1, y + 0.1);
    step();
    row("2. a tile behind a shut wall is not charted, and the tiles on this side are", surface(x + 4, y) === 0 && surface(x, y) > 0 && surface(x - 3, y) > 0, `behind ${surface(x + 4, y)}, here ${surface(x, y)}`);
    map.buildWall(x + 2, y, "w", "door", "wall_wood");
    const door = map.tileAt(x + 2, y).w;
    door.open = true;
    map.touch(x + 2, y);
    G.teleport(x + 0.1, y + 0.1);
    me.chartTile = null;
    step();
    row("opened, the door shows the tiles now in line of sight", surface(x + 4, y) > 0 && surface(x + 6, y) > 0, `through the door: ${surface(x + 4, y)}, ${surface(x + 6, y)}; beside it ${surface(x + 4, y + 3)} (still hidden)`);

    // 3. A wall built in a charted place changes its cell, with the built flag; removing it changes it back.
    unwall();
    step();
    const open0 = chart.cellAt(x + 2, y + 1);
    map.buildWall(x + 2, y + 1, "w", "wall", "wall_wood");
    map.touch(x + 2, y + 1);
    step();
    const built = chart.cellAt(x + 2, y + 1);
    map.destroyWall(x + 2, y + 1, "w");
    step();
    const gone = chart.cellAt(x + 2, y + 1);
    row("a wall built in a charted place changes its cell on the next step, with the built flag; taken down it changes back", chart.westWall(open0) === 0 && (chart.westWall(built) & 7) === 1 && (chart.westWall(built) & 8) === 8 && chart.westWall(gone) === 0, `${chart.westWall(open0)} then ${chart.westWall(built)} then ${chart.westWall(gone)}`);

    // 4. A tilled tile and a felled tree change their cells.
    const grass = surface(x - 1, y + 3);
    map.setFloor(x - 1, y + 3, "floor_farm");
    restore.push(() => map.setFloor(x - 1, y + 3, "floor_grass"));
    step();
    const tilled = surface(x - 1, y + 3);
    const tree = map.createProp({ sprite: "tree_oak_m", tile: [x - 2, y + 3] });
    map.placeProp(tree, x - 2, y + 3);
    made.push(tree);
    map.touch(x - 2, y + 3);
    step();
    const withTree = surface(x - 2, y + 3);
    map.removeProp(tree);
    made.pop();
    map.touch(x - 2, y + 3);
    step();
    const felled = surface(x - 2, y + 3);
    row("a tilled tile and a felled tree change their cells (the tree shows, then the grass again)", tilled !== grass && withTree !== felled && felled === grass, `grass ${grass}, tilled ${tilled}; tree ${withTree}, felled ${felled}`);

    // 5. A wild chunk dropped by eviction keeps its chart, and it is unchanged when the chunk grows back.
    const wild = [-40, -40];
    G.teleport(wild[0] + 0.1, wild[1] + 0.1);
    step(2);
    const probe = [wild[0] + 3, wild[1] + 2];
    const seen = chart.cellAt(probe[0], probe[1]);
    const dropped = map.evictFar(x, y, 2, () => false);
    const stillThere = map.peekTile(probe[0], probe[1]);
    const afterDrop = chart.cellAt(probe[0], probe[1]);
    G.teleport(wild[0] + 0.1, wild[1] + 0.1);
    step(2);
    row("a wild chunk dropped by eviction keeps its chart, and the chart is the same when it grows back", seen > 0 && dropped.length > 0 && !stillThere && afterDrop === seen && chart.cellAt(probe[0], probe[1]) === seen, `cell ${seen}; ${dropped.length} dropped; after ${afterDrop}`);

    // 6. serialize, restore, serialize; and the chart is the world's, not a player's.
    const a = JSON.stringify(chart.serialize());
    chart.restore(JSON.parse(a));
    const b = JSON.stringify(chart.serialize());
    const someone = G.addPlayer(x + 1, y + 1);
    made.push({ id: someone.id, player: true });
    const leaveWorld = () => { G.game.removePlayer(someone.id); made.splice(made.findIndex((q) => q.id === someone.id), 1); }; // gone again after the row, so no one stands on the panel rows' markers
    step();
    row("serialize, restore, serialize gives the same chart, and a character made afterwards has the whole of it (it is the world's)", a === b && chart.cellAt(probe[0], probe[1]) === seen && a.length > 100, `${a.length} bytes of chart`);
    leaveWorld();


    // ---- The panel (docs/33, #204): M, the world running, the markers, zoom and pan, Escape, the names ----
    const mp = await import("/src/ui/map-panel.js");
    const input = await import("/src/input.js");
    const key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code }));
    const tap = (code) => { key(code); step(1); key(code, "keyup"); };
    const frame = () => mp.update({ player: me, players: S.players, places: (S.info && S.info.places) || [] });
    const cv = () => document.querySelector("#map-panel canvas");
    const pix = (px, py) => Array.from(cv().getContext("2d").getImageData(Math.round(px), Math.round(py), 1, 1).data);
    const isMarker = ([r, g, b]) => (r > 230 && g > 180 && b > 60) || (r > 235 && g > 235 && b > 235); // the gold, or the white
    const expect = (g, vs) => ({ x: vs.width / 2 + (g.gx - g.gy) * vs.h - (vs.gx - vs.gy) * vs.h, y: vs.height / 2 + ((g.gx + g.gy) * vs.h) / 2 - ((vs.gx + vs.gy) * vs.h) / 2 });
    const ownMarker = () => mp.markers().find((m) => m.self);
    G.teleport(x + 0.1, y + 0.1);
    chart.reveal(me.gx, me.gy);
    step();
    restore.push(() => { mp.close(); mp.forgetDrawn(); key("KeyD", "keyup"); });
    const t0 = G.loop.simTime();
    const p0 = [me.gx, me.gy];
    tap("KeyM");
    const wasOpen = mp.isOpen();
    mp.zoomBy(-5);
    mp.zoomBy(1); // the middle step, whatever it was left at
    key("KeyD");
    step(30);
    key("KeyD", "keyup");
    row("7. with the map open the world runs and the keys walk (the sim's clock advances, the player moves)", wasOpen && G.loop.simTime() > t0 + 0.3 && Math.hypot(me.gx - p0[0], me.gy - p0[1]) > 0.5, `open ${wasOpen}; clock +${(G.loop.simTime() - t0).toFixed(2)} s; walked ${Math.hypot(me.gx - p0[0], me.gy - p0[1]).toFixed(2)} tiles`);
    frame();
    let vs = mp.viewState();
    let m = ownMarker();
    let e = m && expect(me, vs);
    const first = m && Math.hypot(m.x - e.x, m.y - e.y) <= 1 && isMarker(pix(m.x, m.y));
    // Pan (a drag) and zoom (the wheel about a point), then the marker again against the projection.
    const box = cv().getBoundingClientRect();
    const at0 = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    cv().dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: at0.x, clientY: at0.y, bubbles: true }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: at0.x + 60, clientY: at0.y - 30, bubbles: true }));
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true }));
    frame();
    const panned = mp.viewState();
    const dragged = !panned.following && Math.hypot(panned.gx - me.gx, panned.gy - me.gy) > 1;
    const cursor = { x: Math.round(at0.x + 80), y: Math.round(at0.y + 40) }; // a wheel event carries whole pixels
    const k = box.width / cv().width;
    const underBefore = mp.unproject((cursor.x - box.left) / k, (cursor.y - box.top) / k);
    cv().dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: cursor.x, clientY: cursor.y, bubbles: true, cancelable: true }));
    frame();
    const zoomed = mp.viewState();
    const underAfter = mp.unproject((cursor.x - box.left) / k, (cursor.y - box.top) / k);
    row("zoom steps on the wheel about the pointer (the grid point under it stays), and a drag pans and stops following", zoomed.h === 2 * panned.h && Math.hypot(underBefore.gx - underAfter.gx, underBefore.gy - underAfter.gy) < 0.05 && dragged, `h ${panned.h} to ${zoomed.h}; the point under the pointer moved ${Math.hypot(underBefore.gx - underAfter.gx, underBefore.gy - underAfter.gy).toFixed(3)} tiles; dragged ${dragged}`);
    vs = mp.viewState();
    m = ownMarker();
    e = m && expect(me, vs);
    const second = m && Math.hypot(m.x - e.x, m.y - e.y) <= 1 && (m.x < 0 || m.y < 0 || m.x > vs.width || m.y > vs.height || isMarker(pix(m.x, m.y)));
    row("8. a marker is at the projection of the player's position at the zoom and pan, within a pixel, centred and after a pan and a zoom", !!first && !!second, m && e ? `centred ${first}; panned and zoomed ${m.x.toFixed(1)},${m.y.toFixed(1)} against ${e.x.toFixed(1)},${e.y.toFixed(1)}` : "no marker drawn for the player");
    // 9. No marker for the dead or for villagers; a dead player's is gone.
    const zed = S.zombies[0];
    const vil = S.villagers[0];
    const zAt = zed ? [zed.gx, zed.gy] : null;
    const vAt = vil ? [vil.gx, vil.gy] : null;
    mp.centreOn(me.gx, me.gy);
    if (zed) { zed.gx = me.gx + 2; zed.gy = me.gy + 1; restore.push(() => { zed.gx = zAt[0]; zed.gy = zAt[1]; }); }
    if (vil) { vil.gx = me.gx + 1; vil.gy = me.gy + 3; restore.push(() => { vil.gx = vAt[0]; vil.gy = vAt[1]; }); }
    const other = G.addPlayer(x + 3, y + 2);
    made.push({ id: other.id, player: true });
    other.name = "Visitor";
    frame();
    vs = mp.viewState();
    const bare = (g) => { const p = expect(g, vs); return !isMarker(pix(p.x, p.y)); };
    const livingIds = S.players.filter((p) => !p.dead).map((p) => p.id).sort().join(",");
    const drawnIds = mp.markers().map((q) => q.id).sort().join(",");
    other.dead = true;
    frame();
    const afterDeath = mp.markers().map((q) => q.id).join(",");
    other.dead = false;
    row("9. a marker for every living player and none for any of the dead or any villager; a dead player's is not drawn", drawnIds === livingIds && (!zed || bare(zed)) && (!vil || bare(vil)) && !afterDeath.includes(other.id), `drawn ${drawnIds}; a zombie's spot ${zed ? (bare(zed) ? "bare" : "MARKED") : "none"}, a villager's ${vil ? (bare(vil) ? "bare" : "MARKED") : "none"}; after a death ${afterDeath}`);
    // Centre brings the view back to the player, and the world's mouse does not take a click on the panel.
    document.querySelector("#map-panel .mp-centre").click();
    mp.update({ player: me, players: S.players, places: [] });
    const homed = mp.viewState();
    cv().dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: at0.x, clientY: at0.y, bubbles: true }));
    const worldClicked = input.mouseLeftDown();
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true }));
    row("Centre follows the player again, and a click on the panel is the panel's, not the world's", homed.following && Math.hypot(homed.gx - me.gx, homed.gy - me.gy) < 0.01 && !worldClicked, `following ${homed.following}; the world saw a click: ${worldClicked}`);
    // A place's name: drawn once any tile of it is charted and not before.
    const place = (S.info.places || []).slice().sort((a, b) => Math.hypot(a.box[0] - me.gx, a.box[1] - me.gy) - Math.hypot(b.box[0] - me.gx, b.box[1] - me.gy))[0];
    if (place) {
      const [bx, by, bw, bh] = place.box;
      map.ensureAround(bx + bw / 2, by + bh / 2, 1);
      chart.restore({ chunks: [] });
      mp.forgetDrawn();
      mp.centreOn(bx + bw / 2, by + bh / 2);
      frame();
      const before = mp.labels().includes(place.name);
      chart.chartTile(bx + 1, by + 1);
      mp.forgetDrawn();
      mp.centreOn(bx + bw / 2, by + bh / 2);
      frame();
      row("a place's name is drawn once any tile of it is charted, and not before", !before && mp.labels().includes(place.name), `${place.name}: before ${before}, after ${mp.labels().includes(place.name)}`);
    } else row("a place's name is drawn once any tile of it is charted", false, "the map names no place");
    // The compass: a white arrow in the top right corner pointing up and to the right (map north).
    frame();
    const cs = cv().getContext("2d");
    const cw = cv().width;
    const white = (x0, y0, w0, h0) => { const d = cs.getImageData(x0, y0, w0, h0).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) n++; return n; };
    const upRight = white(cw - 34, 26, 20, 14); // above and right of the arrow's middle
    const downLeft = white(cw - 54, 40, 20, 14); // below and left of it
    row("the compass is drawn, its arrow pointing up and to the right", upRight > 0 && downLeft > 0 && white(cw - 70, 8, 70, 66) > 20, `${upRight} white pixels up and right of its middle, ${downLeft} below and left, ${white(cw - 70, 8, 70, 66)} in the corner`);
    // Escape shuts the map before the pause menu comes up.
    key("Escape");
    key("Escape", "keyup");
    row("Escape closes the map, and the pause menu does not come up behind it", !mp.isOpen() && !G.screens.currentScreen(), `open ${mp.isOpen()}; screen ${G.screens.currentScreen() || "none"}`);
    tap("KeyM");
    const reopened = mp.isOpen();
    tap("KeyM");
    row("M opens it and M shuts it", reopened && !mp.isOpen(), `reopened ${reopened}; after the second tap ${mp.isOpen()}`);

    // 11. The reveal's cost in open, uncharted land (the profile's number).
    chart.restore({ chunks: [] });
    const times = [];
    for (let k = 0; k < 8; k++) {
      const gx = x - 2 + (k % 4) * 0.5;
      const gy = y + k;
      const t0 = performance.now();
      chart.reveal(gx, gy, T.chartRadius);
      times.push(performance.now() - t0);
      if (k === 0) chart.restore({ chunks: [] }); // the first alone is the worst case: everything round it uncharted
    }
    row("the reveal in open uncharted land is cheap (reported: the first, with everything uncharted, is the worst)", times[0] < 12, `first ${times[0].toFixed(2)} ms (everything uncharted), then ${times.slice(1).map((t) => t.toFixed(2)).join(", ")} ms`);
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const r of restore.reverse()) r();
    for (const q of made) { if (q.player) G.game.removePlayer(q.id); else { const t = map.propById(q.id); if (t) map.removeProp(t); } }
    chart.restore(JSON.parse(chart0));
    for (const p of S.players) p.chartTile = null;
    G.rules.rules.zombieAggro = aggro0;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
