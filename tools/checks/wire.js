// The wire (net.js, docs/31/04): what this tab knows of the other. Run on a
// host tab (`?host=<code>&nosave`) and on a guest tab (`?join=<code>&nosave&lag=100`):
//   await __game.check("wire")
// A hidden pane runs no frames, so a two-tab test is stepped from scripts in
// turn (docs/02, 2026-10-13, the wire): the host steps, the guest steps, each
// with `__game.loop.advance(1 / 60)` in a loop, and `__game.net.setTestSnapshot`
// on the guest walks its player in place of the keyboard. This check only reads.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const s = G.net.status();
  const S = G.game.state;
  if (!s.role) {
    row("this tab is on the wire", false, "alone: open with ?host=<code> or ?join=<code>");
  } else if (s.role === "host") {
    row("the host has a guest", s.guests.length > 0, `${s.guests.length} guest${s.guests.length === 1 ? "" : "s"}: ${s.guests.join(", ") || "none"}; ${s.tick} frames sent`);
    row("every guest's player is in the world", s.guests.every((id) => S.players.some((p) => p.id === id)), S.players.map((p) => p.id).join(", "));
  } else {
    row("the guest has joined", s.joined, s.joined ? `as ${s.myPlayerId}, ${s.framesSeen} frames` : "not yet: step the host (it answers joins in its step)");
    row("my player is mine", !!G.player && G.player.id === s.myPlayerId, G.player ? `${G.player.id} at ${G.player.gx.toFixed(1)},${G.player.gy.toFixed(1)}, hp ${G.player.hp}` : "none");
    row("the host's player is in my world", S.players.some((p) => p.id !== s.myPlayerId), S.players.map((p) => p.id).join(", "));
    row("frames are flowing", s.framesSeen > 0 && performance.now() - s.lastFrameAt < 5000, `${s.framesSeen} seen, the last ${Math.round(performance.now() - s.lastFrameAt)} ms ago (step the host if stale)`);
    row("the world is the host's", G.map.chunkCount() > 0 && S.zombies.length > 0, `${G.map.chunkCount()} chunks, ${S.zombies.length} dead, ${G.clock.getLabel()}`);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
