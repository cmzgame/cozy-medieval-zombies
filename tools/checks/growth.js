// Growth (docs/31/05, item 8; docs/02, 2026-10-13): reading never grows a chunk.
// The renderer, the ground, the light, sight, a far lookup, a zoom change: none
// of them may add a chunk; only the simulation's ring round each player and the
// mutators do. From the console:
//   await __game.check("growth")
// Restores the zoom and the pause state it found. For the second half of the
// proof, run check("determinism") on a fresh boot at one zoom, reload, and run
// it at another: the hashes must match (the chunks grown no longer depend on
// what the window shows).

export async function run(game) {
  const G = game;
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok, detail });
  const wasPaused = G.loop.isPaused();
  const zoom0 = G.view.view.worldScale; // restored at the end, as the profile does
  G.loop.setPaused(true);
  try {
    const before = G.map.chunkCount();
    const px = Math.round(G.player.gx);
    const py = Math.round(G.player.gy);

    // 1. A read far beyond the ring is the blank tile, frozen, and grows nothing.
    const far = G.map.tileAt(px + 5000, py + 5000);
    check("a far read is the blank tile", far === G.map.blankTile(), `floor ${far.floor}, prop ${far.prop}, room ${far.room}`);
    let threw = false;
    try {
      far.prop = {};
    } catch {
      threw = true;
    }
    check("the blank tile refuses a write", threw && far.prop === null);
    check("peekTile beyond the ring is null", G.map.peekTile(px + 5000, py + 5000) === null);
    check("a far read grew nothing", G.map.chunkCount() === before, `${before} chunks`);

    // 2. The light and sight read far without growing.
    G.light.lightAt(px + 3000, py + 3000);
    const tiles = [];
    for (let dy = -20; dy <= 20; dy++) for (let dx = -20; dx <= 20; dx++) tiles.push([px + 3000 + dx, py + 3000 + dy]);
    G.visibility.computeVisible(px + 3000, py + 3000, tiles);
    check("light and sight far away grew nothing", G.map.chunkCount() === before);
    const [fcx, fcy] = G.map.chunkCoord(px + 3000, py + 3000);
    const rec = G.ground.drawRecord(fcx, fcy);
    check("the ground has no picture for an ungrown chunk, and baking it grows nothing", rec === null && G.map.chunkCount() === before);

    // 3. A frame at each zoom (the renderer, the ground's ring, the walls) grows nothing.
    for (const level of G.view.ZOOM_LEVELS) {
      G.view.setZoom(level);
      G.loop.advance(0);
      G.loop.advance(0);
    }
    check("a frame at every zoom grew nothing", G.map.chunkCount() === before, `${G.map.chunkCount()} chunks`);

    // 4. A mutator does grow: a floor set far away makes exactly one chunk, then it is put back. The chunk is one not grown yet, so a
    // second run in the same page (whose first run grew the chunk it used, which stays) still starts from an ungrown one.
    const fy = py + 4000;
    let fx = px + 4000;
    for (let k = 0; k < 64 && G.map.peekTile(fx, fy) !== null; k++) fx += G.map.CHUNK * 2;
    const ungrown = G.map.peekTile(fx, fy) === null;
    const count0 = G.map.chunkCount();
    const was = G.map.tileAt(fx, fy).floor;
    G.map.setFloor(fx, fy, was === "floor_dirt" ? "floor_grass" : "floor_dirt");
    const grown = G.map.chunkCount() - count0;
    check("a mutator grows its chunk", ungrown && grown === 1 && G.map.peekTile(fx, fy) !== null, `${grown} chunk at ${fx},${fy}${ungrown ? "" : " (no ungrown chunk found)"}`);
    G.map.setFloor(fx, fy, was);

    // 5. The step's own growth is the player's ring: one step grows nothing new where the player stands.
    const afterStep0 = G.map.chunkCount();
    G.loop.advance(1 / 60);
    check("a step in place grows nothing", G.map.chunkCount() === afterStep0, `${G.map.chunkCount()} chunks`);
  } finally {
    G.view.setZoom(zoom0);
    G.loop.setPaused(wasPaused);
  }
  const passed = results.filter((r) => r.ok).length;
  for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  return { passed, total: results.length, results };
}
