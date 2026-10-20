// Water and fences (docs/30 step 0, law 8): a wholly-water tile stops every
// body (the player's circle, the pathfinder's step), shallow water is walked at
// half speed, you drink and fill at the bank, a fence passes sight and bounds
// no room, and its gate is a door. From the console: await __game.check("water")
// It pauses the loop, lays a pond and a fence on open ground near the player
// with setFloor and buildWall, and puts everything back.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const px0 = G.player.gx;
  const py0 = G.player.gy;
  G.loop.setPaused(true);
  // Open ground: a 7 by 7 of plain floor with nothing on it, no walls, outdoors.
  const base = map.tileAt(Math.round(px0), Math.round(py0)).floor;
  let ox = null;
  let oy = null;
  const cx0 = Math.round(px0);
  const cy0 = Math.round(py0);
  for (let r = 4; r < 40 && ox === null; r++) {
    for (let dy = -r; dy <= r && ox === null; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      let free = true;
      for (let y = 0; y < 7 && free; y++) for (let x = 0; x < 7; x++) {
        const t = map.tileAt(cx0 + dx + x, cy0 + dy + y);
        if (t.prop || t.n || t.w || t.room !== 0 || t.floor !== "floor_grass") { free = false; break; }
      }
      if (free) { ox = cx0 + dx; oy = cy0 + dy; break; }
    }
  }
  if (ox === null) {
    G.loop.setPaused(wasPaused);
    return { rows: [{ check: "setup", result: "FAIL", detail: "no 7 x 7 of open grass within 40 tiles" }] };
  }
  const changed = [];
  const lay = (x, y, id) => { changed.push([x, y, map.tileAt(x, y).floor]); map.setFloor(x, y, id); };
  const built = [];
  const build = (x, y, edge, kind, mat) => { if (map.buildWall(x, y, edge, kind, mat)) built.push([x, y, edge]); };
  const step = () => G.loop.advance(1 / 60);
  try {
    // 1. A pond three by three in the middle; the player at its west side.
    const wx = ox + 3, wy = oy + 3;
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) lay(wx + x, wy + y, "floor_water");
    row("water is not walkable", !map.isWalkableTile(wx, wy) && map.canStep(wx - 3, wy, wx - 2, wy) && !map.canStep(wx - 2, wy, wx - 1, wy), `isWalkableTile ${map.isWalkableTile(wx, wy)}, a step onto the bank ${map.canStep(wx - 3, wy, wx - 2, wy)}, into the water ${map.canStep(wx - 2, wy, wx - 1, wy)}`);
    G.teleport(wx - 2.5, wy);
    step();
    const before = G.player.gx;
    for (let i = 0; i < 60; i++) { const m = map.moveCircle(G.player.gx, G.player.gy, G.player.radius, 0.05, 0); G.player.gx = m.gx; G.player.gy = m.gy; }
    row("a body stops at the water's edge", G.player.gx < wx - 1.5 + 0.35 && G.player.gx > before, `walked east from ${before.toFixed(2)} to ${G.player.gx.toFixed(2)}; the water starts at ${(wx - 1.5).toFixed(1)}`);
    // 2. The pathfinder goes round it.
    const path = (await import("/src/pathfind.js")).findPath([wx - 3, wy], [wx + 3, wy], map.canStep, 4000);
    const through = path && path.some(([x, y]) => Math.abs(x - wx) <= 1 && Math.abs(y - wy) <= 1);
    row("a path goes round the water", !!path && !through, `${path ? path.length + " tiles" : "no path"}${through ? ", through the water" : ""}`);
    // 3. Drinking at the bank: E's nearest action, and the menu's, on the water tile.
    G.player.thirst = 10;
    const near = G.interact.nearestSimpleAction(G.player);
    const s = G.iso.toScreen(wx - 1, wy);
    const menu = G.interact.actionsAt(s.x, s.y, G.player).map((a) => a.label);
    row("you drink and fill at the bank", !!near && /Drink from the water \(tainted\)/.test(near.label) && menu.some((l) => /Fill waterskins/.test(l)), `E: ${near ? near.label : "nothing"}; menu: ${menu.join(" | ")}`);
    G.player.thirst = G.player.maxThirst;
    // 4. Shallow water: walked, at half speed.
    for (let y = -1; y <= 1; y++) lay(wx, wy + y, "floor_water_shallow");
    row("shallow water is walked", map.isWalkableTile(wx, wy) && map.canStep(wx - 1, wy, wx, wy), `walkable ${map.isWalkableTile(wx, wy)}`);
    row("shallow water is slow for everyone", map.floorSpeedAt(wx, wy) === 0.5 && map.floorSpeedAt(wx - 3, wy) === 1, `factor ${map.floorSpeedAt(wx, wy)} in it, ${map.floorSpeedAt(wx - 3, wy)} on grass`);
    // 5. A fence round a 2 by 2 with a gate: outdoors still, sight through, the gate a door.
    const fx = ox + 1, fy = oy + 1;
    for (let x = fx; x < fx + 2; x++) { build(x, fy, "n", "wall", "wall_fence"); build(x, fy + 2, "n", x === fx ? "door" : "wall", "wall_fence"); }
    for (let y = fy; y < fy + 2; y++) { build(fx, y, "w", "wall", "wall_fence"); build(fx + 2, y, "w", "wall", "wall_fence"); }
    const wall = map.tileAt(fx, fy).n;
    row("a fence passes sight and bounds no room", map.transmission(wall) === 1 && map.roomAt(fx, fy) === 0 && map.roomAt(fx + 1, fy + 1) === 0, `transmission ${map.transmission(wall)}, room ${map.roomAt(fx, fy)}`);
    const gate = map.tileAt(fx, fy + 2).n;
    row("a fence's gate is a door that blocks shut", !!gate && gate.kind === "door" && map.blocksMove(gate) && map.transmission(gate) === 1, `kind ${gate && gate.kind}, blocks ${map.blocksMove(gate)}, sees ${map.transmission(gate)}`);
  } finally {
    for (const [x, y, e] of built) map.destroyWall(x, y, e);
    for (const [x, y, f] of changed.reverse()) map.setFloor(x, y, f);
    G.teleport(px0, py0);
    G.loop.setPaused(wasPaused);
  }
  const failed = rows.filter((r) => r.result === "FAIL").length;
  console.table(rows);
  return { rows, pass: rows.length - failed, fail: failed };
}
