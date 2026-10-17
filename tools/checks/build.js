// Doors, windows, and shutters built onto walls, and the enclosure rule (Michael, 2026-10-17, #147): a door or a window is
// built over a plain wall (the edge's kind and state set, the material kept, the wall remembered and put back by the removal
// tool), or over a broken door or window as a new one, never a repair; a window is not built over a fence, a gate (a door)
// is; and a door of an unbreakable material is refused where it would be a room's only way in. From the console, on a tab
// with `?nosave`:
//   await __game.check("build")
// It builds on open ground through placement.performPlacement (the host's and a guest's one path) with free building on
// (restored), takes everything down, and puts the wall material it flags unbreakable back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const free0 = G.rules.rules.freeBuilding;
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const made = [];
  let stone = null;
  try {
    G.loop.setPaused(true);
    G.rules.set({ freeBuilding: true });
    // Open ground with room round it.
    let c = null;
    for (let y = 120; y < 240 && !c; y += 3) {
      for (let x = 30; x < 230 && !c; x += 3) {
        G.map.ensureAround(x, y, 1); // reading never grows a chunk: grow this one before judging what stands in it
        let clear = true;
        for (let dy = -3; dy <= 4 && clear; dy++) for (let dx = -3; dx <= 4 && clear; dx++) clear = G.map.isWalkableTile(x + dx, y + dy) && G.map.tileAt(x + dx, y + dy).room === 0 && !G.map.tileAt(x + dx, y + dy).n && !G.map.tileAt(x + dx, y + dy).w && !G.map.tileAt(x + dx, y + dy).prop; // no prop at all: a door's tiles stay clear
        if (clear) c = [x, y];
      }
    }
    if (!c) {
      row("open ground was found", false, "none in the loaded map");
      return finish();
    }
    const [cx, cy] = c;
    G.teleport(cx, cy + 2);
    const edgeAt = (i) => [cx + i, cy, "n"]; // a run of north edges in a row
    const build = (what, [x, y, e]) => {
      G.teleport(x, y + 1); // beside the edge, within reach
      const ok = G.placement.performPlacement(me, { kind: "build", what, tx: x, ty: y, edge: e });
      step(60 * 5);
      return ok;
    };
    const wallAt = ([x, y, e]) => G.map.tileAt(x, y)[e];
    for (let i = 0; i < 6; i++) { G.map.buildWall(...edgeAt(i), "wall", "wall_log"); made.push(edgeAt(i)); }

    // A door over a plain wall.
    build("door", edgeAt(0));
    const d = wallAt(edgeAt(0));
    row("a door is built over a wall: the edge is a door, of the wall's material, remembering the wall", d && d.kind === "door" && d.sprite === "wall_log" && d.under === "wall_log" && d.built === true && !d.broken, d ? `${d.kind}, ${d.sprite}, under ${d.under}, hp ${d.hp}` : "nothing");
    // A window over a plain wall.
    build("window", edgeAt(1));
    const w = wallAt(edgeAt(1));
    row("a window is built over a wall: the edge is a window with shutters", w && w.kind === "window" && w.shutter === "closed" && w.under === "wall_log", w ? `${w.kind}, shutter ${w.shutter}` : "nothing");
    // The removal tool puts the wall back.
    G.teleport(cx, cy + 1);
    G.placement.performPlacement(me, { kind: "remove", target: { type: "wall", tx: edgeAt(0)[0], ty: edgeAt(0)[1], edge: "n" } });
    const back = wallAt(edgeAt(0));
    row("the removal tool takes the door out and the wall is back, never a hole", back && back.kind === "wall" && back.sprite === "wall_log", back ? back.kind : "a hole");

    // Over a broken door or window: a new one.
    build("door", edgeAt(2));
    const door = wallAt(edgeAt(2));
    door.broken = true;
    door.open = true;
    door.hp = 0;
    G.map.touch(edgeAt(2)[0], edgeAt(2)[1]);
    build("door", edgeAt(2));
    const fresh = wallAt(edgeAt(2));
    row("over a broken door a new one is built, never a repair: whole, shut, full health", fresh && fresh.kind === "door" && !fresh.broken && !fresh.open && fresh.hp > 0 && fresh !== door, fresh ? `${fresh.kind}, broken ${fresh.broken}, open ${fresh.open}, hp ${fresh.hp}` : "nothing");
    // A whole door is not built over.
    const refused = G.map.canBuildWall(edgeAt(2)[0], edgeAt(2)[1], "n", "door");
    row("a whole door or window cannot be built over", refused === false && !G.map.canBuildWall(edgeAt(1)[0], edgeAt(1)[1], "n", "window"), `door ${refused}`);
    // Shutters: a broken window is rebuilt as a new one.
    const win = wallAt(edgeAt(1));
    win.broken = true;
    win.shutter = "open";
    win.hp = 0;
    G.map.touch(edgeAt(1)[0], edgeAt(1)[1]);
    build("window", edgeAt(1));
    const shutters = wallAt(edgeAt(1));
    row("broken shutters are rebuilt as new: a window, closed, whole", shutters && shutters.kind === "window" && !shutters.broken && shutters.shutter === "closed" && shutters.hp > 0, shutters ? `${shutters.kind}, ${shutters.shutter}, hp ${shutters.hp}` : "nothing");

    // A fence takes a gate and not a window.
    G.map.destroyWall(...edgeAt(4));
    G.map.buildWall(...edgeAt(4), "wall", "wall_fence");
    row("a gate (a door) may be built over a fence, a window may not", G.map.canBuildWall(edgeAt(4)[0], edgeAt(4)[1], "n", "door") && !G.map.canBuildWall(edgeAt(4)[0], edgeAt(4)[1], "n", "window"), "fence edge");

    // The enclosure rule, with the stone wall's material flagged unbreakable for the test.
    stone = G.assets.getDef("wall_stone");
    const unbreakable0 = stone.wall.unbreakable;
    stone.wall.unbreakable = true;
    let one = null;
    let two = null;
    for (let id = 1; id < 300 && !(one && two); id++) {
      const r = G.map.getRoom(id);
      if (!r) continue;
      const doors = r.openings.filter((op) => { const wl = G.map.tileAt(op.tx, op.ty)[op.edge]; return wl && wl.kind === "door"; });
      if (doors.length === 1 && !one) one = doors[0];
      else if (doors.length === 2 && !two) two = doors[0];
    }
    const alone = one ? G.map.enclosureProblem(one.tx, one.ty, one.edge, "door", "wall_stone") : null;
    const withOther = two ? G.map.enclosureProblem(two.tx, two.ty, two.edge, "door", "wall_stone") : null;
    row("an unbreakable door is refused where it would be a room's only way in", typeof alone === "string" && alone.length > 0, String(alone));
    row("and allowed where another door can be broken", withOther === "", String(withOther));
    row("a door of the build's own wood is never refused", one && G.map.enclosureProblem(one.tx, one.ty, one.edge, "door", "wall_log") === "", "wall_log");
    stone.wall.unbreakable = unbreakable0;
  } finally {
    if (stone && stone.wall.unbreakable === true) delete stone.wall.unbreakable;
    for (const [x, y, e] of made) if (G.map.tileAt(x, y)[e]) G.map.destroyWall(x, y, e);
    G.teleport(meAt[0], meAt[1]);
    G.rules.set({ freeBuilding: free0 });
    G.loop.setPaused(wasPaused);
  }
  return finish();

  function finish() {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  }
}
