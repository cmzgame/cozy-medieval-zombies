// The village's lights are lanterns (Michael, 2026-10-17, #156): steady (no flicker), a little brighter than a torch (radius 3.4
// against 3), burning nothing, and not taken or mounted like a torch; put out and lit again since docs/43 section 3 (2026-10-25: light
// will draw the dead, so a light must be snuffable). From the console, on a tab with `?nosave`:
//   await __game.check("lantern")
// It reads the valley as generated, steps the world ten minutes, and changes nothing it does not put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const hour0 = G.clock.getHour();
  const me = G.player;
  const me0 = [me.gx, me.gy];
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
    const labels = target ? G.interact.actionsForTarget({ kind: "bracket", tx: target.tx, ty: target.ty, edge: target.edge }, me).map((a) => a.label) : [];
    row("a lantern bracket offers no torch to take or mount: its one entry is Put out the lantern", !!target && labels.length === 1 && labels[0] === "Put out the lantern", target ? `${target.tx},${target.ty}${target.edge}: ${labels.join(", ")}` : "none");
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
    row("the lanterns burn nothing: lit still after ten minutes of their own", target.wall.bracket.lantern === true && posts.every((p) => p.fire.lit) && G.light.sources().some((s) => s.kind === "lantern"), `${lanterns.filter((b) => b.wall.bracket.lantern).length} lanterns and ${posts.filter((p) => p.fire.lit).length} posts lit after ten minutes`);
    // Put out and lit again (docs/43, section 3): the bracket's lantern and a post, by the menu; the light goes and comes back with them.
    const at = (s) => s.kind === "lantern" && Math.abs(s.gx - lx) < 0.01 && Math.abs(s.gy - ly) < 0.01;
    const addr = { kind: "bracket", tx: target.tx, ty: target.ty, edge: target.edge };
    G.teleport(target.wall.bracket.side > 0 ? target.tx : target.edge === "n" ? target.tx : target.tx - 1, target.wall.bracket.side > 0 ? target.ty : target.edge === "n" ? target.ty - 1 : target.ty);
    step();
    const off = G.interact.actionsForTarget(addr, me).find((a) => a.label === "Put out the lantern");
    const offRan = off ? off.perform() : null;
    G.light.update();
    const dark = !G.light.sources().some(at);
    if (!G.inventory.countAll(me, "tinderbox")) G.inventory.addItem(G.inventory.bagOf(me), "tinderbox", 1);
    const on = G.interact.actionsForTarget(addr, me).find((a) => a.label === "Light the lantern");
    const onRan = on ? on.perform() : null;
    G.light.update();
    row("a bracket's lantern is put out (no light from it) and lit again with a tinderbox (its light back)", offRan === true && dark && onRan === true && target.wall.bracket.lit !== false && G.light.sources().some(at), `put out ${offRan}, dark ${dark}; lit ${onRan}`);
    G.teleport(post.tile[0], post.tile[1] + 1);
    step();
    const pOff = G.interact.actionsForProp(post, me).find((a) => a.label === "Put out the lantern");
    const pOffRan = pOff ? pOff.perform() : null;
    G.light.update();
    const pDark = !G.light.sources().some((s) => s.kind === "lantern_post" && s.gx === post.tile[0] && s.gy === post.tile[1]);
    const pOn = G.interact.actionsForProp(post, me).find((a) => a.label === "Light the lantern");
    const pOnRan = pOn ? pOn.perform() : null;
    G.light.update();
    row("a lantern post likewise: put out, dark, lit again", pOffRan === true && pDark && pOnRan === true && post.fire.lit === true, `put out ${pOffRan}, dark ${pDark}; lit ${pOnRan}`);
  } finally {
    for (const b of G.map.brackets()) if (b.wall.bracket.lantern && b.wall.bracket.lit === false) G.map.setLantern(b, true); // every lantern lit as authored
    for (const p of G.map.fires()) if (p.sprite === "lantern_post" && !p.fire.lit) G.map.setFireLit(p, true);
    G.teleport(me0[0], me0[1]);
    G.clock.setHour(hour0);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
