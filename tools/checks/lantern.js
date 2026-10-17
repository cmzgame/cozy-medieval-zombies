// The village's lights are lanterns (Michael, 2026-10-17, #156): steady (no flicker), a little brighter than a torch (radius 3.4
// against 3), never out, and not taken or mounted like a torch. From the console, on a tab with `?nosave`:
//   await __game.check("lantern")
// It reads the valley as generated, steps the world ten minutes, and changes nothing it does not put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const hour0 = G.clock.getHour();
  const me = G.player;
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  try {
    G.loop.setPaused(true);
    const brackets = [...G.map.brackets()];
    const lanterns = brackets.filter((b) => b.wall.bracket.lantern);
    const torches = brackets.filter((b) => b.wall.bracket.torch);
    row("the village has lantern brackets, and no authored torch is left in a bracket", lanterns.length > 0 && torches.every((b) => b.wall.bracket.wear !== undefined), `${lanterns.length} lanterns, ${torches.length} torches (a torch a player mounted has wear)`);
    const posts = [...G.map.fires()].filter((p) => p.sprite === "lantern_post");
    row("the square's lamps are lantern posts, lit, and not carried off", posts.length > 0 && posts.every((p) => p.fire.lit && !G.placement.canCarry(p)), `${posts.length} posts`);
    const target = lanterns[0];
    row("a lantern bracket offers no torch to take or mount", !!target && G.interact.actionsForTarget({ kind: "bracket", tx: target.tx, ty: target.ty, edge: target.edge }, me).length === 0, target ? `${target.tx},${target.ty}${target.edge}` : "none");
    // The light: radius 3.4 and no flicker, against a torch's 3.
    G.light.update();
    const [lx, ly] = G.map.bracketPos(target);
    const src = G.light.sources().find((s) => s.kind === "lantern" && Math.abs(s.gx - lx) < 0.01 && Math.abs(s.gy - ly) < 0.01);
    const torchRadius = G.items.getItem("torch").fire.radius;
    row("a lantern lights a little further than a torch and does not flicker", !!src && src.radius === G.assets.getDef("lantern_post").fire.radius && src.radius > torchRadius && !src.flicker, src ? `radius ${src.radius} against ${torchRadius}, flicker ${JSON.stringify(src.flicker)}` : "no source");
    const post = posts[0];
    G.light.update();
    const psrc = G.light.sources().find((s) => s.kind === "lantern_post" && s.gx === post.tile[0] && s.gy === post.tile[1]);
    row("a lantern post is a steady light too", !!psrc && psrc.radius > torchRadius && !psrc.flicker, psrc ? `radius ${psrc.radius}, flicker ${JSON.stringify(psrc.flicker)}` : "no source");
    // Never out: ten real minutes of steps, from midnight to midnight and beyond.
    G.clock.setHour(0);
    step(60 * 600);
    G.light.update();
    row("the lanterns never go out", target.wall.bracket.lantern === true && posts.every((p) => p.fire.lit) && G.light.sources().some((s) => s.kind === "lantern"), `${lanterns.filter((b) => b.wall.bracket.lantern).length} lanterns and ${posts.filter((p) => p.fire.lit).length} posts lit after ten minutes`);
  } finally {
    G.clock.setHour(hour0);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
