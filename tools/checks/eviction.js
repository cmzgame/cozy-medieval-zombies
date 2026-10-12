// Chunks and the dead bounded (docs/23a, B1, B2): walking far drops the wild
// chunks left behind and puts their dead to sleep; coming back grows the same
// chunks and wakes the same dead; the village is never dropped. From the
// console: await __game.check("eviction")
// It pauses the loop, teleports the player far and back, and restores the
// position and the pause.

export async function run(game, { far = 400 } = {}) {
  const G = game;
  const map = G.map;
  const rows = [];
  const wasPaused = G.loop.isPaused();
  const gx0 = G.player.gx;
  const gy0 = G.player.gy;
  const steps = (n) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  try {
    G.loop.setPaused(true);
    steps(5);
    const chunks0 = map.chunkCount();
    const ids0 = new Set(G.zombies.map((z) => z.id));
    const authored = [...map.loadedChunks()].filter((c) => !c.wild).length;
    G.teleport(gx0 + far, gy0 + far);
    steps(60);
    const chunksFar = map.chunkCount();
    const idsFar = new Set(G.zombies.map((z) => z.id));
    const gone = [...ids0].filter((id) => !idsFar.has(id)).length;
    const authoredFar = [...map.loadedChunks()].filter((c) => !c.wild).length;
    rows.push({ check: "far away, the chunks behind are dropped", result: chunksFar < chunks0 + 100 && chunksFar <= 17 * 17 + authored ? "pass" : "FAIL", detail: `${chunks0} chunks at home, ${chunksFar} far away (${authoredFar} authored kept of ${authored})` });
    rows.push({ check: "the village is never dropped", result: authoredFar === authored ? "pass" : "FAIL", detail: `${authoredFar} of ${authored} authored chunks loaded` });
    rows.push({ check: "the dead left behind sleep", result: gone > 0 ? "pass" : "FAIL", detail: `${gone} of ${ids0.size} dead asleep on their chunks' records` });
    const totalFar = G.zombies.length + map.sleepingCount(); // the dead met so far: at home, plus those rolled out there
    G.teleport(gx0, gy0);
    steps(60);
    const idsBack = new Set(G.zombies.map((z) => z.id));
    const woke = [...ids0].filter((id) => idsBack.has(id)).length;
    const extra = [...idsBack].filter((id) => !ids0.has(id)).length;
    const total = G.zombies.length + map.sleepingCount();
    // Boot grows a ring of 4 and a step a ring of 3, so the dead between stay asleep until walked to.
    rows.push({ check: "back home, the dead near wake, none is lost, none is rolled twice", result: woke > 0 && extra === 0 && total === totalFar ? "pass" : "FAIL", detail: `${woke} of ${ids0.size} awake at home, ${extra} new; living plus sleeping ${total} (was ${totalFar} far away)` });
    rows.push({ check: "the chunk count is bounded", result: map.chunkCount() <= chunksFar + 1 ? "pass" : "FAIL", detail: `${map.chunkCount()} chunks loaded after the round trip, ${map.sleepingCount()} dead asleep` });
  } finally {
    G.teleport(gx0, gy0);
    G.loop.setPaused(wasPaused);
  }
  return { rows, fails: rows.filter((r) => r.result === "FAIL").length };
}
