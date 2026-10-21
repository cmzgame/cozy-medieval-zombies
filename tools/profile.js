// The profile (docs/23, "measure, then move, then measure"; docs/23a, "The
// measured baseline"): the numbers every engine move records before and after,
// in its commit message. From the console, in the game's page:
//   const r = await (await import("/tools/profile.js")).run(window.__game); console.log(r.text)
// It pauses the loop, steps it at the middle and the wide zoom, moves the clock
// to midnight for the light's numbers, and puts everything back. Michael may be
// playing in the same pane: it never moves the player.

export async function run(game, { steps = 120 } = {}) {
  const G = game;
  const rows = [];
  const add = (what, value) => rows.push({ what, value });
  const time = (fn, n = 1) => {
    const a = performance.now();
    for (let i = 0; i < n; i++) fn();
    return +((performance.now() - a) / n).toFixed(2);
  };
  const wasPaused = G.loop.isPaused();
  const scale0 = G.view.view.worldScale;
  const hour0 = G.clock.getHour();
  try {
    G.loop.setPaused(true);
    if (window.__boot) add("boot (ms)", Object.entries(window.__boot.timings).map(([k, v]) => `${k} ${v}`).join(", "));
    add("world", `${G.map.chunkCount()} chunks, ${G.zombies.length} dead, ${G.corpses.length} corpses, ${G.villagers.length} villagers, ${G.map.roomCount()} rooms, ${G.light.sources().length} light sources`);
    const atlas = G.gl.atlasInfo();
    add("atlas", `${atlas.pages} page${atlas.pages === 1 ? "" : "s"} of ${atlas.size}: ${atlas.perPage.map((p) => Math.round(p.fraction * 100) + "%").join(", ")} full, ${G.assets.figureSheetCount()} figure sheets, ${G.assets.corpseSheetCount()} corpse sheets`);
    for (const [name, scale] of [["middle", G.view.ZOOM_LEVELS[1]], ["wide", G.view.ZOOM_LEVELS[0]]]) {
      G.view.setZoom(scale);
      for (let i = 0; i < 30; i++) G.loop.advance(1 / 60); // settle: the sight key, the ring's bakes
      let worst = 0;
      const both = time(() => {
        const a = performance.now();
        G.loop.advance(1 / 60);
        worst = Math.max(worst, performance.now() - a);
      }, steps);
      const renderOnly = time(() => G.loop.advance(0), 30);
      add(`${name} zoom (${scale})`, `${G.tiles.length} tiles, ${G.visible.size} visible, ${G.drawn} drawables: step ${G.timing.step.toFixed(2)} ms, sight ${G.timing.vis.toFixed(2)} ms, render ${G.timing.render.toFixed(2)} ms; a step and a render ${both} ms, a render alone ${renderOnly} ms, the worst of ${steps} ${worst.toFixed(1)} ms`);
    }
    G.view.setZoom(scale0);
    G.loop.advance(1 / 60);
    add("rooms refound (ms)", time(() => G.map.rebuildRooms(), 3));
    G.clock.setHour(0);
    G.loop.advance(1 / 60);
    const nightRender = time(() => G.loop.advance(0), 10);
    G.map.touch();
    const afterTouch = time(() => G.loop.advance(0), 1);
    add("night", `${G.light.sources().length} sources: a render ${nightRender} ms; the frame after a world change (the light rebuilt) ${afterTouch} ms`);
    const gs = G.ground.stats();
    add("ground", `${gs.baked} bakes, the last ${gs.lastMs.toFixed(1)} ms, the worst ${gs.maxMs.toFixed(1)} ms, ${gs.syncBakes} at draw, ${gs.textures} textures`);
    if (performance.memory) add("heap (MB)", Math.round(performance.memory.usedJSHeapSize / 1048576));
  } finally {
    G.clock.setHour(hour0);
    G.view.setZoom(scale0);
    G.loop.advance(1 / 60);
    G.loop.setPaused(wasPaused);
  }
  return { rows, text: rows.map((r) => `${r.what}: ${r.value}`).join("\n") };
}
