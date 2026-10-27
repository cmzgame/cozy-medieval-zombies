// The light verb (Michael, 2026-10-17, #156: "fire lights what is made to be lit"): a tinderbox or a lit torch used on an unlit
// campfire with fuel, a torch on a post, a torch in a bracket that is out, or an unlit torch in a hand lights it (and an unlit torch
// used on a burning fire is lit from it), and nothing else burns (not a fireplace, an oven, or a forge); not through a wall, not from
// afar; every refusal says why. It runs through data/interactions.json and the verb table (use.applyWith, the path a guest's Use
// takes on the host) and through the holder's menu. Since docs/43 section 3: the home lights (a fireplace, a fire pit, a lantern) are
// switches, lit with a flame and put out with nothing; the campfire is made at the workbench (2026-10-27), its 3 by 3 item set down
// outdoors cold and empty by a guest's command, fed, not lit by a log, picked up only out and empty, and taken apart for half its make;
// the Fireplace and the fire pit are the palette's (the fire rulings, 2026-10-26): the Fireplace along a west or a north wall by a guest's
// command, the fire pit by the host's own click through the palette's ghost outdoors and by a guest's command indoors, each a switch that
// cooks, refused Take apart while lit; the fire pit radius 5 outdoors and its room lit indoors, the room's drawn light dipping within
// [world.litRoomFlickerMin, 1]. From the console, on a tab with `?nosave&mute`:
//   await __game.check("kindle")
// It builds on open ground and puts everything it made or moved back.

export async function run(game) {
  const G = game;
  const needs0 = (({ hunger, thirst, tired, hp, bleed, sick, infection }) => ({ hunger, thirst, tired, hp, bleed, sick, infection }))(G.player); // put back in the finally: its steps drain them and the dead may bite (the order-independence of the checks, check("all"))
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const bag = G.inventory.bagOf(me);
  const bagItems0 = bag.items.slice();
  const counts0 = bagItems0.map((e) => [e, e.count]);
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
    bag.items.length = 0; // an empty bag (#437): a bag left full by a check before would send the logs and the torch stowed below elsewhere; put back in the finally
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
    // ---- The campfire (docs/43, section 3; Michael, 2026-10-27): made at the workbench (check("craft") makes one), no longer the palette's;
    // the Campfire item 3 by 3, set down outdoors cold and empty by a guest's command, fed and lit, picked up out and empty, taken apart for
    // half its make. Free building off.
    {
      const campfireMod = await import("/src/campfire.js");
      const free0 = G.rules.rules.freeBuilding;
      const back0 = me.worn.back;
      restore.push(() => { G.rules.set({ freeBuilding: free0 }); me.worn.back = back0; });
      G.rules.set({ freeBuilding: false });
      const said = () => (document.getElementById("message") || {}).textContent || "";
      const rec = G.stations.recipe("campfire");
      row("the campfire is made at the workbench from three stone and two logs, and the build palette has none (the build menu holds only what cannot be carried)", !G.placement.buildKinds().some((k) => k.id === "campfire" || k.sprite === "campfire") && !!rec && rec.station === "workbench" && rec.out.id === "campfire" && JSON.stringify(G.items.getItem("campfire").size) === "[3,3]", `${JSON.stringify(rec && rec.in)}; the item ${JSON.stringify(G.items.getItem("campfire").size)}`);
      me.worn.back = G.items.makeEntry("small_sack", 1); // the sack (6 by 4) takes a 3 by 3 Campfire now
      const held0 = bag.items.slice();
      const sack = G.inventory.bagOf(me);
      const item0 = G.items.makeEntry("campfire", 1); // as the workbench makes it: no mark, the player's own
      const fitsSack = G.grid.insert(sack, item0);
      // Indoors is refused: the cottage the player woke in.
      const inside = [Math.round(meAt[0]), Math.round(meAt[1])];
      G.teleport(meAt[0], meAt[1]);
      G.placement.performPlacement(me, { kind: "campfire", uid: item0.uid, tx: inside[0], ty: inside[1] });
      row("the Campfire item fits the sack, and is set down outdoors only", fitsSack && sack.items.includes(item0) && /Outdoors only/.test(said()), `in the sack ${fitsSack}; "${said()}"`);
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
        G.placement.performPlacement(me, { kind: "campfire", uid: item0.uid, tx: fx, ty: fy }); // a guest's set-down, by the item's uid
        const built = G.map.tileAt(fx, fy).prop;
        if (built && built.sprite === "campfire") restore.push(() => { if (G.map.propById(built.id)) G.map.removeProp(built); });
        row("set down by a guest's command: a cold, empty campfire on one tile, the player's own, the item gone from the bag", !!built && built.sprite === "campfire" && built.made === true && built.fire.fuel === 0 && built.fire.lit === false && built.fire.maxFuel === 6 && built.tiles.length === 1 && !sack.items.includes(item0), built ? `fuel ${built.fire.fuel} of ${built.fire.maxFuel}, lit ${built.fire.lit}, made ${built.made}` : `nothing set down: "${said()}"`);
        if (built && built.sprite === "campfire") {
          row("each log burns three game hours: a full campfire burns eighteen", built.fire.hoursPerUnit === 3 && built.fire.maxFuel * built.fire.hoursPerUnit === 18, `${built.fire.hoursPerUnit} h a log, ${built.fire.maxFuel} logs`);
          G.inventory.addItem(sack, "log", 2);
          const fed = [0, 1].map(() => G.verbs.run("feed", G.world.world, me, { prop: built.id }).ok);
          row("fed two logs as any fire, lighting nothing cold", fed.every(Boolean) && built.fire.fuel === 2 && !built.fire.lit, `fed ${fed.join(", ")}; fuel ${built.fire.fuel}, lit ${built.fire.lit}`);
          const labels = () => G.interact.actionsForProp(built, me).map((a) => a.label);
          const heldLabels = labels();
          G.placement.performPlacement(me, { kind: "remove", target: { type: "prop", id: built.id } });
          row("with fuel in it, it is neither picked up nor taken apart", heldLabels.includes("Pick up campfire (only when out and empty)") && heldLabels.some((l) => /^Take apart \(it still has fuel/.test(l)) && !!G.map.propById(built.id) && /still has fuel/.test(said()), `${heldLabels.join(", ")}; "${said()}"`);
          // Burnt down: out and empty (the test sets its fuel to none, as two logs burning six game hours would).
          built.fire.fuel = 0;
          built.fire.lit = false;
          G.map.touch(fx, fy);
          const p1 = G.interact.actionsForProp(built, me).find((a) => a.label === "Pick up campfire");
          const up = p1 ? p1.perform() : null;
          const item = G.inventory.bagOf(me).items.find((e) => e.id === "campfire");
          row("out and empty it is picked up into the sack as the 3 by 3 Campfire item, still the player's", up === true && !G.map.propById(built.id) && !!item && item.made === true, `picked up ${up}; item ${!!item}, made ${item && item.made}`);
          if (item) {
            const menu = G.interact.itemMenu(me, item, G.inventory.bagOf(me), null).map((m) => m.label);
            G.placement.performPlacement(me, { kind: "campfire", uid: item.uid, tx: fx, ty: fy });
            const again = G.map.tileAt(fx, fy).prop;
            if (again && again.sprite === "campfire") restore.push(() => { if (G.map.propById(again.id)) G.map.removeProp(again); });
            row("its menu has Place, and set down again it is cold, empty, and the player's own", menu.includes("Place") && !!again && again.sprite === "campfire" && again.fire.fuel === 0 && !again.fire.lit && again.made === true, `${menu.join(", ")}; ${again ? `fuel ${again.fire.fuel}, made ${again.made}` : "nothing set down"}`);
            if (again && again.sprite === "campfire") {
              const ta = G.interact.actionsForProp(again, me).find((a) => /^Take apart/.test(a.label));
              const st0 = G.inventory.countAll(me, "stone");
              const lg0 = G.inventory.countAll(me, "log");
              const ran = ta ? ta.perform() : null;
              row("taken apart, it gives back half its make (a stone and a log) and asks for no tool", ta && ta.label === "Take apart (1 stone, 1 log back)" && ran === true && !G.map.propById(again.id) && G.inventory.countAll(me, "stone") - st0 === 1 && G.inventory.countAll(me, "log") - lg0 === 1, `${ta && ta.label}; ran ${ran}; +${G.inventory.countAll(me, "stone") - st0} stone, +${G.inventory.countAll(me, "log") - lg0} log`);
            }
          }
        }
      }
      me.worn.back = back0;
      bag.items.splice(0, bag.items.length, ...held0);
    }
    // ---- The built fires (Michael, 2026-10-26, the fire rulings): the Fireplace along a flat wall indoors and the 2 by 2 fire pit indoors or out,
    // each from the palette, a switch out when built, cooking, never carried, refused Take apart while lit, half its stone back out.
    {
      const free0 = G.rules.rules.freeBuilding;
      restore.push(() => G.rules.set({ freeBuilding: free0 }));
      G.rules.set({ freeBuilding: false });
      const sd = await import("/src/setdown.js");
      const lightMod = await import("/src/light.js");
      const hour0 = G.clock.getHour();
      restore.push(() => G.clock.setHour(hour0)); // the light rows read midnight
      const said = () => (document.getElementById("message") || {}).textContent || "";
      const kinds = G.placement.buildKinds();
      const fpE = kinds.find((k) => k.id === "fireplace");
      const pitE = kinds.find((k) => k.id === "fire_pit");
      row("the build palette has the Fireplace (six stone, against a wall) and the fire pit (eight stone, on the ground), and no hearth", !!fpE && fpE.sprite === "fireplace" && fpE.stand === "wall" && fpE.cost.stone === 6 && !!pitE && pitE.sprite === "fire_pit" && pitE.stand === "ground" && pitE.cost.stone === 8 && !kinds.some((k) => k.id === "hearth"), `${JSON.stringify(fpE && fpE.cost)} ${JSON.stringify(pitE && pitE.cost)}`);
      const back0 = me.worn.back;
      restore.push(() => { me.worn.back = back0; });
      me.worn.back = G.items.makeEntry("rucksack", 1); // room for the stone
      const sack = G.inventory.bagOf(me);
      const tb = G.items.makeEntry("tinderbox", 1);
      G.inventory.stow(me, tb);
      restore.push(() => G.inventory.detach(me, tb));
      const step = (n) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
      // The Fireplace in the cottage the player woke in: a fit for each facing, refused outdoors and in the open of the room.
      const room = G.map.tileAt(Math.round(meAt[0]), Math.round(meAt[1])).room;
      const fits = {};
      let openTile = null;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -8; dx <= 8; dx++) {
        const x = Math.round(meAt[0]) + dx, y = Math.round(meAt[1]) + dy;
        const t = G.map.peekTile(x, y);
        if (!t || t.room !== room) continue;
        const f = sd.fitAt("wall", "fireplace", x, y);
        if (!f.problem && !fits[f.facing]) fits[f.facing] = f;
        if (f.problem === "Against a wall" && !openTile) openTile = [x, y];
      }
      let outside = null;
      for (let r = 3; r < 14 && !outside; r++) for (let dx = -r; dx <= r && !outside; dx++) { const x = Math.round(meAt[0]) + dx, y = Math.round(meAt[1]) + r; const t = G.map.peekTile(x, y); if (t && !(t.room > 0) && sd.fitAt("wall", "fireplace", x, y).problem === "Indoors only") outside = [x, y]; }
      row("a Fireplace fits along a west wall (facing y, 1 by 2) and a north wall (facing x, 2 by 1), and is refused outdoors and in the open of a room", !!fits.y && !!fits.x && JSON.stringify(fits.y.footprint) === "[1,2]" && JSON.stringify(fits.x.footprint) === "[2,1]" && !!outside && !!openTile, `y ${fits.y ? `${fits.y.tx},${fits.y.ty}` : "none"}, x ${fits.x ? `${fits.x.tx},${fits.x.ty}` : "none"}; outdoors ${outside}; open floor ${openTile}`);
      if (fits.y) {
        const f = fits.y;
        G.teleport(f.tx + 0.6, f.ty + 0.5);
        G.loop.advance(1 / 60);
        const st0 = G.inventory.countAll(me, "stone");
        G.inventory.addItem(sack, "stone", 6);
        G.placement.performPlacement(me, { kind: "build", what: "fireplace", tx: f.tx, ty: f.ty }); // a guest's command: the anchor alone
        step(60 * 9);
        const h = G.map.tileAt(f.tx, f.ty).prop;
        if (h && h.sprite === "fireplace" && h.made) restore.push(() => { if (G.map.propById(h.id)) G.map.removeProp(h); });
        row("built by a guest's command along the west wall: a Fireplace facing y on both its tiles, a switch, out, made, a station, the six stone paid", !!h && h.sprite === "fireplace" && h.made === true && h.facing === "y" && h.tiles.length === 2 && h.fire.switch && !h.fire.lit && G.stations.stationOf(h).length > 0 && G.inventory.countAll(me, "stone") === st0, h ? `facing ${h.facing}, ${h.tiles.length} tiles, lit ${h.fire.lit}, made ${h.made}; stone ${G.inventory.countAll(me, "stone")}` : `nothing built: "${said()}"`);
        if (h && h.sprite === "fireplace" && h.made) {
          const lightIt = G.interact.actionsForProp(h, me).find((q) => q.label === "Light the fireplace");
          const lit = lightIt ? lightIt.perform() : null;
          const lockedLabel = (G.interact.actionsForProp(h, me).find((q) => /^Take apart/.test(q.label)) || {}).label;
          const off = G.interact.actionsForProp(h, me).find((q) => q.label === "Put out the fireplace");
          const out = off ? off.perform() : null;
          const ta = G.interact.actionsForProp(h, me).find((q) => /^Take apart/.test(q.label));
          const s0 = G.inventory.countAll(me, "stone");
          const apart = ta ? ta.perform() : null;
          row("lit with the tinderbox, Take apart refused while it burns, put out with nothing, then taken apart for half its stone", lit === true && lockedLabel === "Take apart (put it out first)" && out === true && ta && ta.label === "Take apart (3 stones back)" && apart === true && G.inventory.countAll(me, "stone") - s0 === 3, `${lit} "${lockedLabel}" ${out}; ${ta && ta.label}; +${G.inventory.countAll(me, "stone") - s0}`);
          G.inventory.takeAll(me, "stone", 3);
        }
      }
      // The fire pit outdoors by the host's own click (the palette's mode, the ghost, a click), and indoors by a guest's command.
      let pitOut = null;
      for (let r = 4; r < 16 && !pitOut; r++) for (let dy = -r; dy <= r && !pitOut; dy++) for (let dx = -r; dx <= r && !pitOut; dx++) {
        const x = cx + dx, y = cy + dy;
        const tiles = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].map(([a, b]) => G.map.peekTile(a, b));
        if (!sd.fitAt("ground", "fire_pit", x, y).problem && tiles.every((t) => t && !(t.room > 0)) && G.map.isWalkableTile(x - 1, y) && G.map.isWalkableTile(x - 2, y)) pitOut = [x, y];
      }
      let pitIn = null;
      for (let dy = -7; dy <= 7 && !pitIn; dy++) for (let dx = -8; dx <= 8 && !pitIn; dx++) {
        const x = Math.round(meAt[0]) + dx, y = Math.round(meAt[1]) + dy;
        const t = G.map.peekTile(x, y);
        if (t && t.room === room && !sd.fitAt("ground", "fire_pit", x, y).problem) pitIn = [x, y];
      }
      row("open ground outdoors and a 2 by 2 of open floor in the cottage for the fire pit", !!pitOut && !!pitIn, `outdoors ${pitOut}, indoors ${pitIn}`);
      if (pitOut) {
        const inp = await import("/src/input.js");
        const cv = document.getElementById("game");
        const cam0 = { gx: G.camera.cam.gx, gy: G.camera.cam.gy };
        const mouse0 = { ...inp.getMouse() };
        const cvRect = cv.getBoundingClientRect();
        cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + 1000, clientY: cvRect.top + 500, bubbles: true }));
        const sc = 1000 / inp.getMouse().x;
        restore.push(() => {
          G.placement.cancel();
          G.camera.snapTo(cam0.gx, cam0.gy);
          G.camera.applyOrigin(G.view.view.w, G.view.view.h);
          if (mouse0.inside) cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + mouse0.x * sc, clientY: cvRect.top + mouse0.y * sc, bubbles: true }));
          else cv.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        });
        const [px, py] = pitOut;
        G.teleport(px - 1.5, py + 0.5);
        G.loop.advance(1 / 60);
        G.inventory.addItem(sack, "stone", 8);
        G.placement.beginBuild("fire_pit");
        G.camera.snapTo(me.gx, me.gy);
        G.camera.applyOrigin(G.view.view.w, G.view.view.h);
        const p = G.iso.toScreen(px + 0.5, py + 0.5); // the footprint's middle: the ghost is centred on the cursor
        cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + p.x * sc, clientY: cvRect.top + p.y * sc, bubbles: true }));
        G.placement.update(me);
        inp.endStep();
        const g = G.placement.state.ghost;
        row("the palette's fire pit: the ghost is the 2 by 2 over the cursor, green on open ground", !!g && g.ok === true && g.tx === px && g.ty === py && JSON.stringify(g.footprint) === "[2,2]" && g.build === "fire_pit", g ? `${g.tx},${g.ty} ${JSON.stringify(g.footprint)} ${g.ok ? "green" : g.reason}` : "no ghost");
        const clicked = G.placement.tryConfirm(me);
        step(60 * 11);
        G.placement.cancel();
        const pit = G.map.tileAt(px, py).prop;
        if (pit && pit.sprite === "fire_pit") restore.push(() => { if (G.map.propById(pit.id)) G.map.removeProp(pit); });
        row("the host's click builds it after its bar: four tiles, made, a switch out, a cooking station, never carried, eight stone paid", clicked === true && !!pit && pit.sprite === "fire_pit" && pit.tiles.length === 4 && pit.tiles.every(([a, b]) => G.map.tileAt(a, b).prop === pit) && pit.made && pit.fire.switch && !pit.fire.lit && G.stations.stationOf(pit).length > 0 && !G.placement.canCarry(pit) && G.inventory.countAll(me, "stone") === 0, pit ? `${pit.tiles.length} tiles, made ${pit.made}, lit ${pit.fire.lit}, stone ${G.inventory.countAll(me, "stone")}` : `nothing built: "${said()}"`);
        if (pit && pit.sprite === "fire_pit") {
          G.verbs.run("light", G.world.world, me, { prop: pit.id });
          G.clock.setHour(0);
          G.loop.advance(1 / 60);
          lightMod.update();
          const src = lightMod.sources().find((s) => s.gx === pit.tile[0] && s.gy === pit.tile[1]);
          const near = lightMod.lightAt(pit.tile[0] + 2.5, pit.tile[1] + 0.5);
          const far = lightMod.lightAt(pit.tile[0] + 6, pit.tile[1] + 0.5);
          row("lit outdoors it is a source of radius 5, lighting four tiles off brighter than six", pit.fire.lit && !!src && src.radius === 5 && near > far, `lit ${pit.fire.lit}; radius ${src && src.radius}; light ${near.toFixed(2)} at 2.5, ${far.toFixed(2)} at 6`);
          const menu = G.interact.actionsForProp(pit, me).map((q) => q.label);
          row("lit, it cooks (Use the fire pit), boils water, and Take apart is refused until it is put out", menu.some((l) => /^Use the fire pit|^Cook/.test(l)) && menu.includes("Take apart (put it out first)") && menu.includes("Put out the fire pit"), menu.join(", "));
          G.verbs.run("putout", G.world.world, me, { prop: pit.id });
          const ta = G.interact.actionsForProp(pit, me).find((q) => /^Take apart/.test(q.label));
          const apart = ta ? ta.perform() : null;
          row("out, taken apart for four stone", apart === true && ta.label === "Take apart (4 stones back)" && !G.map.propById(pit.id) && G.inventory.countAll(me, "stone") === 4, `${ta && ta.label}; ${G.inventory.countAll(me, "stone")} stone`);
          G.inventory.takeAll(me, "stone", 4);
        }
      }
      if (pitIn) {
        const [ix, iy] = pitIn;
        G.teleport(meAt[0], meAt[1]);
        G.loop.advance(1 / 60);
        G.inventory.addItem(sack, "stone", 8);
        G.placement.performPlacement(me, { kind: "build", what: "fire_pit", tx: ix, ty: iy });
        step(60 * 11);
        const pit = G.map.tileAt(ix, iy).prop;
        if (pit && pit.sprite === "fire_pit") restore.push(() => { if (G.map.propById(pit.id)) G.map.removeProp(pit); });
        row("built indoors by a guest's command", !!pit && pit.sprite === "fire_pit" && pit.made === true, pit ? `${pit.sprite} at ${pit.tile}` : `nothing built: "${said()}"`);
        if (pit && pit.sprite === "fire_pit") {
          const lit0 = [...G.map.allProps()].filter((q) => q.fire && q.fire.room && q.fire.lit && G.map.tileAt(q.tile[0], q.tile[1]).room === room);
          for (const q of lit0) G.map.setFireLit(q, false); // the cottage's own fireplace out, so the pit alone lights the room
          restore.push(() => { for (const q of lit0) G.map.setFireLit(q, true); });
          G.clock.setHour(0);
          lightMod.update();
          const dark = lightMod.roomAmbient(room);
          G.verbs.run("light", G.world.world, me, { prop: pit.id });
          G.loop.advance(1 / 60);
          lightMod.update();
          const rec = lightMod.litRoomFlicker(room);
          let lo = 1, hi = 0;
          for (let k = 0; k < 4000; k++) { const w = lightMod.roomFlickerWeight(rec && rec.flicker, rec && rec.seed, k * 0.017); lo = Math.min(lo, w); hi = Math.max(hi, w); }
          const min = G.tuning.world.litRoomFlickerMin;
          row("lit indoors it lights its whole room (the world's light 1 at midnight), and the room's drawn light dips with its flicker within [the lever, 1]", dark < 1 && lightMod.roomAmbient(room) === 1 && !!rec && lo >= min - 1e-9 && hi <= 1 && lo < min + 0.02, `dark ${dark.toFixed(2)}, lit ${lightMod.roomAmbient(room)}; drawn ${lo.toFixed(3)} to ${hi.toFixed(3)}, the lever ${min}`);
          G.map.setFireLit(pit, false);
        }
      }
      G.teleport(meAt[0], meAt[1]);
    }

  } finally {
    if (G.player) Object.assign(G.player, needs0); // the needs and the health its steps and bites took
    for (const r of restore.reverse()) r();
    bag.items.splice(0, bag.items.length, ...bagItems0);
    for (const [e, n] of counts0) e.count = n;
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
