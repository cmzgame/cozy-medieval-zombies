// A rendered frame hashed at a fixed state (docs/23, step 2: a split of
// render.js must change no pixel): the loop paused, the clock at noon and then
// at midnight, the camera where the player stands, the fog on. From the
// console, on a fresh boot and always in the same order as the last time
// (the dead walk during every check, and the frame shows them; the protocol is
// sheets, determinism, frame): await __game.check("frame"); after the change,
// reload, run the same sequence: `same` says whether both frames hashed as before.
// The pixels are read straight after the draw, in the same task, so the buffer
// is still there. Hashes kept in sessionStorage.

function hashBytes(data) {
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function run(game) {
  const G = game;
  const gl = G.gl.gl;
  const canvas = gl.canvas;
  const wasPaused = G.loop.isPaused();
  const hour0 = G.clock.getHour();
  const hashes = {};
  // Flames, flicker, and sways animate on the wall clock (render.js): frozen for
  // the two renders, or no two boots ever draw the same frame.
  // What animates on the sim clock (the bees at a hive, #441; a sway's lean) is drawn at a pinned sim time too: the world steps on its own
  // clock, then the draw alone reads the fixed one, and the stepped time is put back straight after.
  const realNow = performance.now.bind(performance);
  performance.now = () => 1234567.5;
  const PINNED_SIM = 4321.25;
  let simBack = null;
  try {
    G.loop.setPaused(true);
    for (const [name, hour] of [["noon", 12], ["midnight", 0]]) {
      G.clock.setHour(hour);
      G.loop.advance(1 / 60);
      simBack = G.loop.simTime();
      G.loop.setSimTime(PINNED_SIM);
      G.loop.advance(0);
      const px = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      G.loop.setSimTime(simBack);
      simBack = null;
      hashes[name] = `${canvas.width}x${canvas.height}:${hashBytes(px)}`;
    }
  } finally {
    if (simBack !== null) G.loop.setSimTime(simBack);
    performance.now = realNow;
    G.clock.setHour(hour0);
    G.loop.advance(1 / 60);
    G.loop.setPaused(wasPaused);
  }
  const key = "cmz.frame";
  let previous = null;
  try {
    previous = JSON.parse(sessionStorage.getItem(key) || "null");
    sessionStorage.setItem(key, JSON.stringify(hashes));
  } catch {
    // no storage
  }
  const changed = previous ? Object.keys(hashes).filter((k) => previous[k] !== hashes[k]) : [];
  return { hashes, same: previous === null ? null : changed.length === 0, changed };
}
