// The light verb (Michael, 2026-10-17, #156: "fire lights what is made to be lit"): a tinderbox or a lit torch used on an unlit
// campfire with fuel, a torch on a post, a torch in a bracket that is out, or an unlit torch in a hand lights it, and nothing else
// burns; every refusal says why. It runs through data/interactions.json and the verb table (use.applyWith, the path a guest's Use takes
// on the host) and through the holder's menu. From the console, on a tab with `?nosave`:
//   await __game.check("light")
// It builds on open ground and puts everything it made or moved back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const bag = G.inventory.bagOf(me);
  const bagItems0 = bag.items.slice();
  const restore = [];
  const mk = (id, props = {}) => G.items.makeEntry(id, 1, props);
  const run = (target) => G.verbs.run("light", G.world, me, target);
  try {
    G.loop.setPaused(true);
    let c = null;
    for (let y = 120; y < 240 && !c; y += 3) {
      for (let x = 30; x < 230 && !c; x += 3) {
        G.map.ensureAround(x, y, 2);
        let clear = true;
        for (let dy = -3; dy <= 3 && clear; dy++) for (let dx = -3; dx <= 5 && clear; dx++) clear = G.map.isWalkableTile(x + dx, y + dy) && G.map.tileAt(x + dx, y + dy).room === 0 && !G.map.tileAt(x + dx, y + dy).prop && !G.map.tileAt(x + dx, y + dy).n && !G.map.tileAt(x + dx, y + dy).w;
        if (clear) c = [x, y];
      }
    }
    if (!c) {
      row("open ground was found", false, "none in the loaded map");
      return finish();
    }
    const [cx, cy] = c;
    G.teleport(cx, cy);
    me.hands.main = null;
    me.hands.off = null;
    const box = mk("tinderbox");
    G.inventory.stow(me, box);
    restore.push(() => G.inventory.detach(me, box));
    const prop = (sprite, x, y, extra = {}) => { const p = G.map.createProp({ sprite, tile: [x, y], ...extra }); G.map.placeProp(p, x, y); restore.push(() => G.map.removeProp(p)); return p; };
    const use = (entry, target) => G.use.applyWith(entry, target, me);

    // A campfire: with fuel it is lit by a tinderbox through the interaction row; with none it is not; lit, it says so.
    const fire = prop("campfire", cx + 1, cy, { fuel: 2, lit: false });
    use(box, { kind: "prop", prop: fire });
    row("a tinderbox used on a campfire with fuel lights it", fire.fire.lit === true, `lit ${fire.fire.lit}`);
    const again = run({ prop: fire, entry: box.uid });
    row("one already burning is refused, with its reason", !again.ok && /already burning/.test(again.reason), String(again.reason));
    const dry = prop("campfire", cx + 1, cy + 2, { fuel: 0, lit: false });
    const nothing = run({ prop: dry.id, entry: box.uid });
    row("one with nothing to burn is refused, and stays out", !nothing.ok && !dry.fire.lit && /nothing to burn/.test(nothing.reason), String(nothing.reason));

    // A torch on a post, by a lit torch in the hand.
    const post = prop("torch_post", cx + 2, cy);
    G.map.setHolder({ kind: "post", prop: post }, true, mk("torch", { lit: false, wear: 0.1 }));
    const lit = mk("torch", { lit: true, wear: 0 });
    me.hands.main = lit;
    use(lit, { kind: "prop", prop: post });
    row("a lit torch used on a mounted torch that is out lights it", post.fire.lit === true, `lit ${post.fire.lit}`);

    // An unlit torch in the other hand, by the lit one; and one in the bag is refused.
    const cold = mk("torch", { lit: false, wear: 0 });
    me.hands.off = cold;
    use(lit, { kind: "item", entry: cold });
    row("a lit torch used on an unlit torch in a hand lights it", cold.lit === true, `lit ${cold.lit}`);
    const stowed = mk("torch", { lit: false, wear: 0 });
    G.inventory.stow(me, stowed);
    restore.push(() => G.inventory.detach(me, stowed));
    const inBag = run({ onEntry: stowed.uid, entry: box.uid });
    row("a torch in the bag is refused (it burns only where it is used)", !inBag.ok && !stowed.lit, String(inBag.reason));

    // An unlit torch is no flame.
    me.hands.off = null;
    const unlit = mk("torch", { lit: false, wear: 0 });
    me.hands.main = unlit;
    const post2 = prop("torch_post", cx + 2, cy + 2);
    G.map.setHolder({ kind: "post", prop: post2 }, true, mk("torch", { lit: false }));
    const noFlame = run({ prop: post2, entry: unlit.uid });
    row("an unlit torch gives no flame", !noFlame.ok && !post2.fire.lit && /no flame/.test(noFlame.reason), String(noFlame.reason));
    me.hands.main = null;

    // A bracket, by the holder's menu: refused with no flame, lit with a tinderbox; a lantern never.
    const bracket = [...G.map.brackets()].find((b) => !b.wall.bracket.torch && !b.wall.bracket.lantern);
    if (bracket) {
      const target = { kind: "bracket", bracket, mx: bracket.tx, my: bracket.ty };
      G.map.setHolder(target, true, mk("torch", { lit: false, wear: 0.2 }));
      restore.push(() => G.map.setHolder(target, false));
      G.teleport(bracket.tx + (bracket.edge === "w" ? 1.2 : 0), bracket.ty + (bracket.edge === "n" ? 1.2 : 0));
      const own = bag.items.filter((e) => e.id === "tinderbox"); // the starting kit's too: no flame at all
      for (const e of own) G.inventory.detach(me, e);
      restore.push(() => { for (const e of own) G.inventory.stow(me, e); });
      const addr = { kind: "bracket", tx: bracket.tx, ty: bracket.ty, edge: bracket.edge };
      const menu = () => G.interact.actionsForTarget(addr, me).find((a) => a.label === "Light the torch");
      const none = menu();
      const noBox = none && none.perform();
      row("the holder's menu lights nothing with no flame on you", !!none && noBox === false && bracket.wall.bracket.lit === false, `lit ${bracket.wall.bracket.lit}`);
      const where = G.inventory.stow(me, box);
      const act = menu();
      if (act) act.perform();
      else row("the holder's menu offers Light", false, `box stowed ${where}; menu ${G.interact.actionsForTarget(addr, me).map((a) => a.label).join(", ")}`);
      row("and lights the torch in the bracket with a tinderbox", bracket.wall.bracket.lit === true, `lit ${bracket.wall.bracket.lit}`);
      row("a lit one offers no Light", !menu(), "the menu entry is gone");
      G.teleport(bracket.tx + (bracket.edge === "w" ? 6 : 0), bracket.ty + (bracket.edge === "n" ? 6 : 0));
      bracket.wall.bracket.lit = false;
      const far = run({ bracket: addr, entry: box.uid });
      row("too far away is refused, and the torch stays out", !far.ok && /far/.test(far.reason) && bracket.wall.bracket.lit === false, String(far.reason));
    } else row("an empty bracket for the menu test", false, "none in the loaded map");
    const lantern = [...G.map.brackets()].find((b) => b.wall.bracket.lantern);
    if (lantern) {
      G.teleport(lantern.tx + (lantern.edge === "w" ? 1.2 : 0), lantern.ty + (lantern.edge === "n" ? 1.2 : 0));
      const l = run({ bracket: { tx: lantern.tx, ty: lantern.ty, edge: lantern.edge }, entry: box.uid });
      row("a lantern is always lit: nothing to light", !l.ok && /lantern/.test(l.reason), String(l.reason));
    }
  } finally {
    for (const r of restore.reverse()) r();
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  return finish();

  function finish() {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  }
}
