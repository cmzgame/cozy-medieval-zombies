// The light verb (Michael, 2026-10-17, #156: "fire lights what is made to be lit"): a tinderbox or a lit torch used on an unlit
// campfire with fuel, a torch on a post, a torch in a bracket that is out, or an unlit torch in a hand lights it (and an unlit torch
// used on a burning fire is lit from it), and nothing else burns (not a hearth, an oven, or a forge); not through a wall, not from
// afar; every refusal says why. It runs through data/interactions.json and the verb table (use.applyWith, the path a guest's Use
// takes on the host) and through the holder's menu. Since docs/43 section 3: the home lights (a fireplace, a hearth, a lantern) are
// switches, lit with a flame and put out with nothing; the campfire is built from the palette outdoors (three stone and two logs, the
// logs its fuel), not lit by a log, picked up only out and empty as a 5 by 5 Campfire item, set down again, and taken apart for one
// stone. From the console, on a tab with `?nosave`:
//   await __game.check("kindle")
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
  // The bracket Use mode finds under the cursor at a bracket's own point (what main.js's useTargetAt asks), so the Use rows go through it.
  const viaCursor = (b) => { const p = G.iso.toScreen(...G.map.bracketPos(b)); return G.interact.bracketAt(p.x, p.y); };
  const lastLine = async () => (await import("/src/ui/log.js")).lines().slice(-1)[0] || "";
  // A point `d` tiles from a bracket's wall edge, on the bracket's side (negative: the far side).
  const nearSide = (b, d) => {
    const e0 = b.edge === "n" ? b.ty - 0.5 : b.tx - 0.5;
    const s = b.wall.bracket.side;
    return b.edge === "n" ? [b.tx, e0 + s * d] : [e0 + s * d, b.ty];
  };
  try {
    // The valley's empty brackets hold an unlit torch since docs/43 section 4: the rows below want empty ones, so those torches come out for the
    // run and go back in the finally, unlit and unworn as authored.
    for (const b of [...G.map.brackets()].filter((q) => q.wall.bracket.torch && q.wall.bracket.lit === false && !q.wall.bracket.made)) {
      const t = { kind: "bracket", bracket: b };
      G.map.setHolder(t, false);
      restore.push(() => G.map.setHolder(t, true, { lit: false, wear: 0 }));
    }
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
    restore.push(() => G.inventory.detach(me, box)); // the one this test added; the kit's own is never touched but for a moment below
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

    // A lantern post is a flame too (#175): an unlit torch held to it is lit; the post stays lit.
    const lpost = prop("lantern_post", cx + 3, cy - 2);
    const taperP = mk("torch", { lit: false, wear: 0 });
    me.hands.main = taperP;
    G.teleport(cx + 1.8, cy - 2);
    use(taperP, { kind: "prop", prop: lpost });
    row("an unlit torch held to a lantern post is lit from it (and the post is lit still)", taperP.lit === true && lpost.fire.lit === true, `torch lit ${taperP.lit}, post lit ${lpost.fire.lit}`);
    // A lantern post that is lit says so to a tinderbox or a lit torch (not "Nothing interesting happens" or "That cannot be lit"); put
    // out from its menu, it is lit again by a tinderbox (docs/43, section 3, striking "always lit").
    {
      const tp = { prop: lpost.id };
      const withBox = run({ ...tp, entry: box.uid });
      const litTorch = mk("torch", { lit: true, wear: 0 });
      me.hands.main = litTorch;
      const withTorch = run({ ...tp, entry: litTorch.uid });
      me.hands.main = null;
      row("a tinderbox or a lit torch on a lit lantern post says it is already lit", !withBox.ok && /already lit/.test(withBox.reason) && !withTorch.ok && /already lit/.test(withTorch.reason), `${withBox.reason} / ${withTorch.reason}`);
      use(box, { kind: "prop", prop: lpost });
      row("Use of the tinderbox on a lit lantern post says so too, not 'Nothing interesting happens'", /already lit/.test(await lastLine()), `"${await lastLine()}"`);
      const putOut = G.interact.actionsForProp(lpost, me).find((a) => a.label === "Put out the lantern");
      const outOk = putOut ? putOut.perform() : null;
      const wasOut = lpost.fire.lit === false;
      use(box, { kind: "prop", prop: lpost });
      row("a lantern post is put out from its menu and lit again by a tinderbox (docs/43)", outOk === true && wasOut && lpost.fire.lit === true, `put out ${outOk}, out ${wasOut}; lit again ${lpost.fire.lit}; "${await lastLine()}"`);
    }
    me.hands.main = null;

    const stood = [me.gx, me.gy]; // where the rows after these expect the player, put back below
    // A fireplace is a switch (docs/43, section 3): a tinderbox lights it with no fuel in it, and nothing is spent.
    const hearth = prop("fireplace", cx + 1, cy - 2, { fuel: 0, lit: false });
    use(box, { kind: "prop", prop: hearth });
    row("a fireplace (a switch) is lit by a tinderbox with no fuel in it, and burns none (docs/43)", hearth.fire.lit === true && hearth.fire.switch === true && hearth.fire.fuel === 0, `lit ${hearth.fire.lit}, switch ${hearth.fire.switch}, fuel ${hearth.fire.fuel}`);
    G.map.setFireLit(hearth, false);

    // A station's fire keeps its fuel and its flame (Michael, 2026-10-17, #168; docs/43 keeps it): the oven and the forge, each with fuel and
    // without a flame, then with a tinderbox (the rule is `inventory.flameOf`, the verb's).
    const menuLight = (p) => G.interact.actionsForProp(p, me).find((a) => /^Light the/.test(a.label));
    const menuAt = (p, re) => G.interact.actionsForProp(p, me).find((a) => re.test(a.label));
    const msgEl = document.getElementById("message");
    const said = () => (msgEl ? msgEl.textContent : "");
    const boxesOff = () => {
      const boxes = bag.items.filter((e) => e.id === "tinderbox");
      const onBelt = (G.inventory.beltOf(me) || []).map((e, k) => (e && e.id === "tinderbox" ? [k, e] : null)).filter(Boolean); // a belt tinderbox is a flame too
      for (const e of boxes) G.inventory.detach(me, e);
      for (const [, e] of onBelt) G.inventory.detach(me, e);
      return () => { for (const e of boxes) G.inventory.stow(me, e); for (const [k, e] of onBelt) G.inventory.beltOf(me)[k] = e; };
    };
    const kinds = ["oven", "forge"];
    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i];
      const p = prop(kind, cx + 4, cy - 3 + i * 2, { fuel: 0, lit: false });
      const fuelId = p.fire.fuelItem;
      const fuel = mk(fuelId);
      G.inventory.stow(me, fuel);
      restore.push(() => G.inventory.detach(me, fuel));
      const back = boxesOff();
      const a0 = menuLight(p);
      if (msgEl) msgEl.textContent = "";
      const ran = a0 ? a0.perform() : null;
      const text = said();
      const noFlame = !!a0 && ran === false && a0.simple === false && !p.fire.lit && G.inventory.countAll(me, fuelId) >= 1 && /flame/.test(a0.label) && /You need a tinderbox or a lit torch to light it/.test(text);
      back();
      const a1 = menuLight(p);
      const did = a1 ? a1.perform() : null;
      row(`a ${kind} cannot be lit from its menu with fuel and no flame, and can with a tinderbox`, noFlame && did === true && p.fire.lit === true, `no flame: ${a0 && a0.label}, simple ${a0 && a0.simple}, said "${text}"; with: lit ${p.fire.lit}`);
    }
    // The fireplace's own menu: Light needs a flame carried, and nothing else; Put out needs nothing.
    {
      const fp = prop("fireplace", cx + 4, cy + 1, { fuel: 0, lit: false });
      G.teleport(cx + 4, cy + 2); // beside it: the menu's verbs ask the one reach test, as the walk there would meet it
      const back = boxesOff();
      const a0 = menuLight(fp);
      const greyed = !!a0 && a0.enabled === false && /flame/.test(a0.label);
      back();
      const a1 = menuLight(fp);
      const lit = a1 ? a1.perform() : null;
      const off = menuAt(fp, /^Put out the fireplace$/);
      // A fire put out by hand is not one that burnt out: no fireOut, so nobody near is told "A fire has gone out." after their own words.
      let burntOut = 0;
      const onOut = () => { burntOut++; };
      G.events.on("fireOut", onOut);
      let out;
      try { out = off ? off.perform() : null; } finally { G.events.off("fireOut", onOut); }
      row("a fireplace's menu: Light greyed with no flame, lit with a tinderbox and no fuel, then Put out with nothing", greyed && lit === true && out === true && fp.fire.lit === false && fp.fire.fuel === 0 && /put out the fireplace/i.test(said()), `${a0 && a0.label}; lit ${lit}; put out ${out}; "${said()}"`);
      row("put out by hand, it is not told as a fire burnt out (no fireOut)", burntOut === 0, `${burntOut} fireOut`);
    }
    // The campfire (docs/43, section 3): a log added to a cold one lights nothing; then a flame lights it.
    const wood = prop("campfire", cx + 3, cy + 3, { fuel: 0, lit: false });
    G.teleport(cx + 3, cy + 4); // beside it
    const log = mk("log");
    G.inventory.stow(me, log);
    restore.push(() => G.inventory.detach(me, log));
    const addCold = menuAt(wood, /^Add a log/);
    const added = addCold ? addCold.perform() : null;
    row("a log added to a cold campfire lights nothing (#168: a flame is needed)", added === true && wood.fire.fuel === 1 && wood.fire.lit === false, `added ${added}; fuel ${wood.fire.fuel}, lit ${wood.fire.lit}; "${said()}"`);
    const back2 = boxesOff();
    const noFlameLight = menuLight(wood);
    const greyedCamp = !!noFlameLight && noFlameLight.enabled === false && /flame/.test(noFlameLight.label);
    // A lit torch in a hand is a flame too.
    const flameTorch = mk("torch", { lit: true, wear: 0 });
    me.hands.main = flameTorch;
    const byTorch = menuLight(wood);
    if (byTorch) byTorch.perform();
    row("with no flame its Light is greyed; a lit torch in the hand is a flame for it", greyedCamp && wood.fire.lit === true, `${noFlameLight && noFlameLight.label}; lit ${wood.fire.lit}`);
    me.hands.main = null;
    const log2 = mk("log");
    G.inventory.stow(me, log2);
    restore.push(() => G.inventory.detach(me, log2));
    const feed = menuAt(wood, /^Add a log/);
    const fed = feed ? feed.perform() : null;
    row("a burning campfire is fed with no flame carried, and keeps burning", fed === true && wood.fire.fuel > 1 && wood.fire.lit === true, `fed ${fed}; fuel ${wood.fire.fuel.toFixed(2)}`);
    back2();
    G.teleport(stood[0], stood[1]);

    // An unlit torch in a hand used on a burning fire is lit from it; on one that is out, it is not.
    const taper = mk("torch", { lit: false, wear: 0 });
    me.hands.main = taper;
    const outFire = prop("campfire", cx + 1, cy + 3, { fuel: 2, lit: false });
    const fromOut = run({ prop: outFire.id, entry: taper.uid });
    row("an unlit torch used on a fire that is out is no flame", !fromOut.ok && taper.lit !== true, String(fromOut.reason));
    use(taper, { kind: "prop", prop: fire });
    row("an unlit torch used on a burning campfire is lit from it", taper.lit === true, `lit ${taper.lit}`);
    me.hands.main = null;

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
      row("a Use on an empty bracket is labelled the empty bracket", bracket.wall.bracket.torch === false && (await import("/src/interactions.js")).nameOfTarget({ kind: "bracket", bracket }) === "the empty bracket", (await import("/src/interactions.js")).nameOfTarget({ kind: "bracket", bracket }));
      G.map.setHolder(target, true, mk("torch", { lit: false, wear: 0.2 }));
      restore.push(() => G.map.setHolder(target, false));
      G.teleport(bracket.tx + (bracket.edge === "w" ? 1.2 : 0), bracket.ty + (bracket.edge === "n" ? 1.2 : 0));
      const own = bag.items.filter((e) => e.id === "tinderbox" && e !== box); // the starting kit's: no flame at all, put back after
      for (const e of own) G.inventory.detach(me, e);
      G.inventory.detach(me, box);
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
      // By Use (#170): Use can target a bracket, and a lit torch in one is a flame like a post's.
      bracket.wall.bracket.lit = false;
      row("Use mode finds the bracket under the cursor", viaCursor(bracket) === bracket, `${viaCursor(bracket) ? "found" : "none"}`);
      // The Use label names what hangs there (#177).
      const names = await import("/src/interactions.js");
      const lanternB = [...G.map.brackets()].find((b) => b.wall.bracket.lantern);
      row("a Use on a bracket with a torch in it is labelled the torch in the bracket", names.nameOfTarget({ kind: "bracket", bracket }) === "the torch in the bracket", names.nameOfTarget({ kind: "bracket", bracket }));
      row("and on a lantern bracket, the lantern (a map with none fails here)", !!lanternB && names.nameOfTarget({ kind: "bracket", bracket: lanternB }) === "the lantern", lanternB ? names.nameOfTarget({ kind: "bracket", bracket: lanternB }) : "no lantern bracket in the loaded map");
      use(box, { kind: "bracket", bracket: viaCursor(bracket) });
      row("a tinderbox used on a mounted torch that is out lights it (Use targets a bracket)", bracket.wall.bracket.lit === true, `lit ${bracket.wall.bracket.lit}`);
      const taper2 = mk("torch", { lit: false, wear: 0 });
      me.hands.main = taper2;
      use(taper2, { kind: "bracket", bracket: viaCursor(bracket) });
      row("an unlit torch in the hand used on the lit torch in a bracket is lit from it", taper2.lit === true, `lit ${taper2.lit}`);
      bracket.wall.bracket.lit = false;
      const taper3 = mk("torch", { lit: false, wear: 0 });
      me.hands.main = taper3;
      const refused3 = run({ bracket: addr, entry: taper3.uid });
      row("and not from one that is out (no flame)", !refused3.ok && taper3.lit !== true && /no flame/.test(refused3.reason), String(refused3.reason));
      me.hands.main = null;
      bracket.wall.bracket.lit = true;
      G.teleport(bracket.tx + (bracket.edge === "w" ? 6 : 0), bracket.ty + (bracket.edge === "n" ? 6 : 0));
      bracket.wall.bracket.lit = false;
      const far = run({ bracket: addr, entry: box.uid });
      row("too far away is refused, and the torch stays out", !far.ok && /far/.test(far.reason) && bracket.wall.bracket.lit === false, String(far.reason));
    } else row("an empty bracket for the menu test", false, "none in the loaded map");
    // A lantern with room on both sides of its wall: it is stood beside (its own side, as close as `nearSide` says) and across from.
    const lantern = [...G.map.brackets()].find((b) => b.wall.bracket.lantern && [nearSide(b, 0.8), nearSide(b, -0.8)].every(([px, py]) => G.map.isWalkableTile(Math.round(px), Math.round(py))));
    if (lantern) {
      G.teleport(...nearSide(lantern, 0.8));
      const l = run({ bracket: { tx: lantern.tx, ty: lantern.ty, edge: lantern.edge }, entry: box.uid });
      row("a lantern that is lit: nothing to light", !l.ok && /already lit/.test(l.reason), String(l.reason));
      // By Use, through the cursor: a lantern and an empty bracket are targets too, each with its own word (not "Nothing interesting happens").
      const onLantern = viaCursor(lantern);
      use(box, { kind: "bracket", bracket: onLantern });
      row("Use on a lantern is a target of its own: it says it is already lit", onLantern === lantern && /already lit/.test(await lastLine()), `found ${onLantern === lantern}; "${await lastLine()}"`);
      // A lantern is a flame (Michael, 2026-10-17, #175: "Sure why not."): an unlit torch held to it is lit from it; it stays lit and unchanged.
      const taperL = mk("torch", { lit: false, wear: 0 });
      me.hands.main = taperL;
      const lanternRecord = JSON.stringify(lantern.wall.bracket); // the whole record, not one field of it
      use(taperL, { kind: "bracket", bracket: viaCursor(lantern) });
      row("an unlit torch held to a lantern bracket is lit from it (and the lantern is as it was)", taperL.lit === true && JSON.stringify(lantern.wall.bracket) === lanternRecord && /at the lantern/.test(await lastLine()), `torch lit ${taperL.lit}; "${await lastLine()}"`);
      me.hands.main = null;
      // A guest's Use goes to the host as an address (inventory-actions.performUseCommand): the tinderbox in the bag by uid, the lantern by its edge.
      if (!bag.items.includes(box)) G.inventory.stow(me, box);
      const performUse = (await import("/src/ui/inventory-actions.js")).performUseCommand;
      const byGuest = performUse(me, { uid: box.uid, src: { kind: "bag", bag: { mine: true } }, target: { kind: "bracket", tx: lantern.tx, ty: lantern.ty, edge: lantern.edge } });
      row("a guest's Use of the tinderbox on the lit lantern, by address, says it is already lit and changes nothing", byGuest === true && /already lit/.test(await lastLine()) && JSON.stringify(lantern.wall.bracket) === lanternRecord, `ran ${byGuest}; "${await lastLine()}"`);
      // Put out (docs/43, section 3): by the lantern's menu, then the guest's Use by address lights it again; the light comes and goes with it.
      const lanternAddr = { kind: "bracket", tx: lantern.tx, ty: lantern.ty, edge: lantern.edge };
      const off = G.interact.actionsForTarget(lanternAddr, me).find((a) => a.label === "Put out the lantern");
      const offOk = off ? off.perform() : null;
      const outRec = lantern.wall.bracket.lit === false;
      G.loop.advance(1 / 60);
      const relit = performUse(me, { uid: box.uid, src: { kind: "bag", bag: { mine: true } }, target: lanternAddr });
      row("a lantern in a bracket is put out from its menu, and a guest's Use of the tinderbox by address lights it again", offOk === true && outRec && relit === true && lantern.wall.bracket.lit !== false && JSON.stringify(lantern.wall.bracket) === lanternRecord, `put out ${offOk}, out ${outRec}; lit again ${lantern.wall.bracket.lit !== false}; "${await lastLine()}"`);
      // Not through a wall (the one rule): from the far side of the lantern's wall, if there is room on both sides.
      // A lantern with room on both sides of its wall, found as the torch bracket is below; none is a failure, not a skipped row.
      const walledL = lantern;
      {
        const taperF = mk("torch", { lit: false, wear: 0 });
        me.hands.main = taperF;
        const [fx, fy] = nearSide(walledL, -0.8);
        G.teleport(fx, fy);
        const behindL = run({ bracket: { tx: walledL.tx, ty: walledL.ty, edge: walledL.edge }, entry: taperF.uid });
        row("but not through the wall from its far side", !behindL.ok && /wall/.test(behindL.reason) && taperF.lit !== true, String(behindL.reason));
        me.hands.main = null;
      }
    } else row("a lantern bracket with room on both sides of its wall for the lantern rows", false, "none in the loaded map");


    // Not through a wall: a torch in a bracket from the far side of its wall, a campfire on the other side of one.
    const walled = [...G.map.brackets()].find((b) => {
      if (b.wall.bracket.torch || b.wall.bracket.lantern) return false;
      const [x, y] = nearSide(b, 0.8);
      const [fx, fy] = nearSide(b, -0.8);
      return [[x, y], [fx, fy]].every(([px, py]) => G.map.isWalkableTile(Math.round(px), Math.round(py)));
    });
    if (walled) {
      const t = { kind: "bracket", bracket: walled, mx: walled.tx, my: walled.ty };
      G.map.setHolder(t, true, mk("torch", { lit: false, wear: 0.2 }));
      restore.push(() => G.map.setHolder(t, false));
      const addr = { tx: walled.tx, ty: walled.ty, edge: walled.edge };
      if (!bag.items.includes(box)) G.inventory.stow(me, box);
      const [bx, by] = nearSide(walled, -0.8);
      G.teleport(bx, by);
      const behind = run({ bracket: addr, entry: box.uid });
      row("a torch in a bracket cannot be lit from the far side of its wall", !behind.ok && /wall/.test(behind.reason) && walled.wall.bracket.lit === false, String(behind.reason));
      const [sx, sy] = nearSide(walled, 0.8);
      G.teleport(sx, sy);
      const beside = run({ bracket: addr, entry: box.uid });
      row("and is lit from its own side, as close as that", beside.ok && walled.wall.bracket.lit === true, `lit ${walled.wall.bracket.lit}`);
      // An unlit torch held to the lit torch from the far side of the wall is not lit from it.
      const taper4 = mk("torch", { lit: false, wear: 0 });
      me.hands.main = taper4;
      G.teleport(bx, by);
      const wallFlame = run({ bracket: addr, entry: taper4.uid });
      row("an unlit torch held to a lit bracket torch from the far side of its wall is not lit", !wallFlame.ok && /wall/.test(wallFlame.reason) && taper4.lit !== true, String(wallFlame.reason));
      me.hands.main = null;
      G.teleport(sx, sy);
      // A campfire on one side of the same wall, the player on the other.
      const [tx0, ty0] = walled.edge === "n" ? [walled.tx, walled.ty + (walled.wall.bracket.side > 0 ? 0 : -1)] : [walled.tx + (walled.wall.bracket.side > 0 ? 0 : -1), walled.ty];
      if (!G.map.tileAt(tx0, ty0).prop) {
        const wf = prop("campfire", tx0, ty0, { fuel: 2, lit: false });
        G.teleport(bx, by);
        const thru = run({ prop: wf.id, entry: box.uid });
        row("a campfire cannot be lit through a wall", !thru.ok && /wall/.test(thru.reason) && !wf.fire.lit, String(thru.reason));
      } else row("a free tile for the campfire behind the wall", false, `${tx0},${ty0} has a prop`);
    } else row("a bracket with room on both sides for the wall rows", false, "none in the loaded map");
    // ---- The campfire (docs/43, section 3): built, picked up, set down, taken apart. Free building off, so it is paid for.
    {
      const campfireMod = await import("/src/campfire.js");
      const free0 = G.rules.rules.freeBuilding;
      const back0 = me.worn.back;
      restore.push(() => { G.rules.set({ freeBuilding: free0 }); me.worn.back = back0; });
      G.rules.set({ freeBuilding: false });
      const said = () => (document.getElementById("message") || {}).textContent || "";
      const entry = G.placement.buildKinds().find((k) => k.id === "campfire");
      row("the build palette has a campfire: a prop on a tile, three stone and two logs, the logs its fuel", !!entry && entry.kind === "prop" && entry.sprite === "campfire" && entry.cost.stone === 3 && entry.cost.log === 2 && entry.fuel === "log", JSON.stringify(entry && entry.cost));
      // Indoors is refused: the cottage the player woke in.
      const inside = [Math.round(meAt[0]), Math.round(meAt[1])];
      G.teleport(meAt[0], meAt[1]);
      G.placement.performPlacement(me, { kind: "build", what: "campfire", tx: inside[0], ty: inside[1] });
      G.loop.advance(1 / 60);
      row("a campfire is built outdoors only", G.map.tileAt(inside[0], inside[1]).room > 0 && !(G.map.tileAt(inside[0], inside[1]).prop && G.map.tileAt(inside[0], inside[1]).prop.sprite === "campfire") && /Outdoors only/.test(said()), `"${said()}"`);
      // A free tile out in the open, near the ground the rows above used.
      let spot = null;
      for (let r = 6; r < 14 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!campfireMod.standProblem(x, y) && G.map.isWalkableTile(x, y + 1)) spot = [x, y];
      }
      if (!spot) row("a free tile out in the open for the campfire rows", false, "none");
      else {
        const [fx, fy] = spot;
        G.teleport(fx, fy + 1.2);
        G.loop.advance(1 / 60);
        const held0 = bag.items.slice(); // room in the bag for two logs: emptied here, put back after
        restore.push(() => bag.items.splice(0, bag.items.length, ...held0));
        bag.items.length = 0;
        const stone0 = G.inventory.countAll(me, "stone");
        const log0 = G.inventory.countAll(me, "log");
        G.inventory.addItem(bag, "stone", 3);
        G.inventory.addItem(bag, "log", 2);
        G.placement.performPlacement(me, { kind: "build", what: "campfire", tx: fx, ty: fy });
        for (let i = 0; i < 60 * 5; i++) G.loop.advance(1 / 60);
        const built = G.map.tileAt(fx, fy).prop;
        if (built && built.sprite === "campfire") restore.push(() => { if (G.map.propById(built.id)) G.map.removeProp(built); });
        row("built: a cold campfire holding its two logs as fuel, made by the player, and the three stone and two logs paid", !!built && built.sprite === "campfire" && built.made === true && built.fire.fuel === 2 && built.fire.lit === false && built.fire.maxFuel === 6 && G.inventory.countAll(me, "stone") === stone0 && G.inventory.countAll(me, "log") === log0, built ? `fuel ${built.fire.fuel} of ${built.fire.maxFuel}, lit ${built.fire.lit}, made ${built.made}; stone ${G.inventory.countAll(me, "stone")}, logs ${G.inventory.countAll(me, "log")}` : "nothing built");
        if (built && built.sprite === "campfire") {
          row("each log burns three game hours: a full campfire burns eighteen", built.fire.hoursPerUnit === 3 && built.fire.maxFuel * built.fire.hoursPerUnit === 18, `${built.fire.hoursPerUnit} h a log, ${built.fire.maxFuel} logs`);
          const labels = () => G.interact.actionsForProp(built, me).map((a) => a.label);
          const heldLabels = labels();
          G.placement.performPlacement(me, { kind: "remove", target: { type: "prop", id: built.id } });
          row("with fuel in it, it is neither picked up nor taken apart", heldLabels.includes("Pick up campfire (only when out and empty)") && heldLabels.some((l) => /^Take apart \(it still has fuel/.test(l)) && !!G.map.propById(built.id) && /still has fuel/.test(said()), `${heldLabels.join(", ")}; "${said()}"`);
          // Burnt down: out and empty (the test sets its fuel to none, as two logs burning six game hours would).
          built.fire.fuel = 0;
          built.fire.lit = false;
          G.map.touch(fx, fy);
          // The sack (6 by 4) cannot take a 5 by 5 Campfire; a satchel (7 by 5) can.
          me.worn.back = G.items.makeEntry("small_sack", 1);
          const pick = () => G.interact.actionsForProp(built, me).find((a) => a.label === "Pick up campfire");
          const p1 = pick();
          const inSack = p1 ? p1.perform() : null;
          const refusedSack = inSack === false && !!G.map.propById(built.id) && /No room/.test(said());
          me.worn.back = G.items.makeEntry("satchel", 1);
          const p2 = pick();
          const inSatchel = p2 ? p2.perform() : null;
          const item = G.inventory.bagOf(me).items.find((e) => e.id === "campfire");
          row("out and empty it is picked up as a Campfire item, 5 by 5: too big for the sack, taken by a satchel", refusedSack && inSatchel === true && !G.map.propById(built.id) && !!item && item.made === true && JSON.stringify(G.items.getItem("campfire").size) === "[5,5]", `sack: ${inSack}; satchel: ${inSatchel}; item ${!!item}, made ${item && item.made}`);
          if (item) {
            const menu = G.interact.itemMenu(me, item, G.inventory.bagOf(me), null).map((m) => m.label);
            G.placement.performPlacement(me, { kind: "campfire", uid: item.uid, tx: fx, ty: fy }); // a guest's set-down, by the item's uid
            const again = G.map.tileAt(fx, fy).prop;
            if (again && again.sprite === "campfire") restore.push(() => { if (G.map.propById(again.id)) G.map.removeProp(again); });
            row("its menu has Place, and set down by a guest's command it is a cold, empty campfire, still the player's own", menu.includes("Place") && !!again && again.sprite === "campfire" && again.fire.fuel === 0 && !again.fire.lit && again.made === true && !G.inventory.bagOf(me).items.some((e) => e.id === "campfire"), `${menu.join(", ")}; ${again ? `fuel ${again.fire.fuel}, made ${again.made}` : "nothing set down"}`);
            if (again && again.sprite === "campfire") {
              const ta = G.interact.actionsForProp(again, me).find((a) => /^Take apart/.test(a.label));
              const st0 = G.inventory.countAll(me, "stone");
              const ran = ta ? ta.perform() : null;
              row("taken apart, it gives back half its stones (one), no logs, and asks for no tool", ta && ta.label === "Take apart (1 stone back)" && ran === true && !G.map.propById(again.id) && G.inventory.countAll(me, "stone") - st0 === 1, `${ta && ta.label}; ran ${ran}; +${G.inventory.countAll(me, "stone") - st0} stone`);
              G.inventory.takeAll(me, "stone", 1);
            }
          }
        }
      }
    }
    // ---- The hearth (docs/43, section 4): built from the palette inside a room, against a wall, six stone; a switch, out when built.
    {
      const free0 = G.rules.rules.freeBuilding;
      restore.push(() => G.rules.set({ freeBuilding: free0 }));
      G.rules.set({ freeBuilding: false });
      const sd = await import("/src/setdown.js");
      const said = () => (document.getElementById("message") || {}).textContent || "";
      const entry = G.placement.buildKinds().find((k) => k.id === "hearth");
      row("the build palette has a hearth: a prop, six stone, standing indoors against a wall", !!entry && entry.kind === "prop" && entry.sprite === "hearth" && entry.stand === "wall" && entry.cost.stone === 6, JSON.stringify(entry && entry.cost));
      // In the cottage the player woke in: a tile against a wall, and one in the open of the room.
      const room = G.map.tileAt(Math.round(meAt[0]), Math.round(meAt[1])).room;
      let wallTile = null;
      let openTile = null;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const x = Math.round(meAt[0]) + dx, y = Math.round(meAt[1]) + dy;
        const t = G.map.peekTile(x, y);
        if (!t || t.room !== room) continue;
        const why = sd.standProblem("wall", x, y);
        if (!why && !wallTile && G.map.isWalkableTile(x, y + 1) && G.map.tileAt(x, y + 1).room === room && !G.map.tileAt(x, y + 1).prop) wallTile = [x, y];
        if (why === "Against a wall" && !openTile) openTile = [x, y];
      }
      const outside = [];
      for (let r = 3; r < 14 && !outside.length; r++) for (let dx = -r; dx <= r && !outside.length; dx++) { const x = Math.round(meAt[0]) + dx, y = Math.round(meAt[1]) + r; if (sd.standProblem("ground", x, y) === "" && !(G.map.peekTile(x, y).room > 0)) outside.push(x, y); }
      row("a hearth is refused outdoors and in the open of a room", outside.length && sd.standProblem("wall", outside[0], outside[1]) === "Indoors only" && !!openTile, `outdoors: ${outside.length ? sd.standProblem("wall", outside[0], outside[1]) : "no tile"}; open floor: ${openTile ? sd.standProblem("wall", openTile[0], openTile[1]) : "none found"}`);
      if (wallTile) {
        const [hx, hy] = wallTile;
        G.teleport(hx, hy + 1.2);
        G.loop.advance(1 / 60);
        const back0 = me.worn.back;
        restore.push(() => { me.worn.back = back0; });
        me.worn.back = G.items.makeEntry("rucksack", 1); // room for the six stone
        const st0 = G.inventory.countAll(me, "stone");
        G.inventory.addItem(G.inventory.bagOf(me), "stone", 6);
        G.placement.performPlacement(me, { kind: "build", what: "hearth", tx: hx, ty: hy });
        for (let i = 0; i < 60 * 9; i++) G.loop.advance(1 / 60);
        const h = G.map.tileAt(hx, hy).prop;
        if (h && h.sprite === "hearth") restore.push(() => { if (G.map.propById(h.id)) G.map.removeProp(h); });
        row("built against a wall: a hearth, a switch, out, made, the six stone paid", !!h && h.sprite === "hearth" && h.fire.switch === true && h.fire.lit === false && h.made === true && G.inventory.countAll(me, "stone") === st0, h ? `switch ${h.fire.switch}, lit ${h.fire.lit}, made ${h.made}; stone ${G.inventory.countAll(me, "stone")}` : `nothing built: "${said()}"`);
        if (h && h.sprite === "hearth") {
          const tb = G.items.makeEntry("tinderbox", 1);
          G.inventory.stow(me, tb);
          restore.push(() => G.inventory.detach(me, tb));
          const lightIt = G.interact.actionsForProp(h, me).find((q) => q.label === "Light the hearth");
          const lit = lightIt ? lightIt.perform() : null;
          const off = G.interact.actionsForProp(h, me).find((q) => q.label === "Put out the hearth");
          const out = off ? off.perform() : null;
          const ta = G.interact.actionsForProp(h, me).find((q) => /^Take apart/.test(q.label));
          const s0 = G.inventory.countAll(me, "stone");
          const apart = ta ? ta.perform() : null;
          row("lit with the tinderbox and put out with nothing; taken apart for half its stone", lit === true && out === true && ta && ta.label === "Take apart (3 stones back)" && apart === true && G.inventory.countAll(me, "stone") - s0 === 3, `${lit} ${out}; ${ta && ta.label}; +${G.inventory.countAll(me, "stone") - s0}`);
          G.inventory.takeAll(me, "stone", 3);
        }
      } else row("a tile against a wall in the cottage", false, "none");
      G.teleport(meAt[0], meAt[1]);
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
