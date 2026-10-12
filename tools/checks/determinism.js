// Determinism (docs/23a, C1's verify): two boots with the same seed and no
// input produce the same world after `steps` steps. From the console, on a
// fresh boot, before anything has been stepped or clicked:
//   await __game.check("determinism")
// then reload and run it again: `same` says whether this boot's world matched
// the last one's (the hash is kept in sessionStorage). It pauses the loop and
// leaves it paused at the title.

function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function run(game, { steps = 600 } = {}) {
  const G = game;
  G.loop.setPaused(true);
  for (let i = 0; i < steps; i++) G.loop.advance(1 / 60);
  const f = (n) => n.toFixed(3);
  const parts = [
    `clock ${f(G.clock.getElapsed())}`,
    `player ${f(G.player.gx)},${f(G.player.gy)} hp ${G.player.hp}`,
    ...G.zombies.map((z) => `${z.id} ${f(z.gx)},${f(z.gy)} ${z.state} ${z.wardrobe} hp ${z.hp}`),
    ...G.villagers.map((v) => `${v.id} ${f(v.gx)},${f(v.gy)} ${v.state}`),
  ];
  const hash = hashOf(parts.join("\n"));
  const key = "cmz.determinism";
  let previous = null;
  try {
    previous = sessionStorage.getItem(key);
    sessionStorage.setItem(key, hash);
  } catch {
    // no storage: the two boots cannot be compared, the hash is still returned
  }
  return { hash, previous, same: previous === null ? null : previous === hash, steps, entities: parts.length - 2 };
}
