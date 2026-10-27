// Torches burn down and are lit with a tinderbox (Michael, 2026-10-17, #156): a lit torch burns while it is lit, fastest held
// and at the slower wall rate on the belt, in a bracket, or on a post; a kill costs far more than a second of burning; a spent
// torch is gone; a new one starts unlit; T lights it only with a tinderbox carried and puts out a lit one ("put out", never "douse": docs/43); an unlit torch gives no
// light; the village's own mounted torches never go out. A torch goes on a wall with its bracket (#523): Place torch on a held torch's menu,
// the ghost on the face under the cursor, a click; a guest's `torch` command by the face's address; refused on a fence, a window, a face
// with a painting or a torch; Put out, Light, and Pick up by label, the torch back with its uid and no bracket left. From the console, on a
// tab with `?nosave&mute`:
//   await __game.check("torch")
// In two tabs, `{ keep: true }` on the host leaves the lit torch on its wall (and the run of walls) and returns `kept`; then on a guest
// carrying a torch, `check("torch")` reads the replica's torch on the wall and its Pick up torch, and its own torch's Place torch; then
// `check("sync")` on the host.
// It shortens the burn times for the test (`world.torchHeldLife` and `torchWallLife`, put back in the finally), and puts the
// player's hands, belt, and bag back.

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  // On a guest (#523), run after the host's `{ keep: true }`: the replica has the torch the host put on a wall, its menu offers Pick up torch
  // (never the map bracket's Take the torch) by an address the host rebuilds, and a torch the guest carries offers Place torch, which begins
  // the ghost on this screen; the click's command is the host's `performPlacement` (its rows below), and the two-tab test sends it for real.
  if (G.net.status().role === "guest") {
    const me = G.player;
    const placement = await import("/src/placement.js");
    let held = null;
    const [gx, gy] = [Math.round(me.gx), Math.round(me.gy)];
    for (const b of G.map.brackets()) if (b.wall.bracket.made && b.wall.bracket.torch && Math.abs(b.tx - gx) <= 12 && Math.abs(b.ty - gy) <= 12) held = b;
    const labels = held ? G.interact.actionsForTarget({ kind: "bracket", tx: held.tx, ty: held.ty, edge: held.edge }, me).map((a) => a.label) : [];
    row("on a guest the replica has the torch the host put on a wall, its own uid in its bracket, and its menu offers Pick up torch, not Take the torch", !!held && held.wall.bracket.uid != null && labels.includes("Pick up torch") && !labels.includes("Take the torch"), held ? `${held.tx},${held.ty} ${held.edge}: ${labels.join(", ")}` : "no torch on a wall within twelve tiles (run the host's check(\"torch\", { keep: true }) first)");
    const mine = G.inventory.findItem(me, "torch");
    const menu = mine ? (mine.place === "hand" ? G.interact.slotMenu(me, `hand:${me.hands.main === mine.entry ? "main" : "off"}`) : mine.place === "belt" ? G.interact.slotMenu(me, `belt:${mine.index}`) : G.interact.itemMenu(me, mine.entry, G.inventory.bagOf(me), null)) : [];
    const began = mine ? placement.beginTorch(mine.entry) && placement.state.kind === "torch" : false;
    const ended = began && placement.cancel();
    row("on a guest a torch it carries offers Place torch, which begins the ghost here and Esc ends", !!mine && menu.some((m) => m.label === "Place torch") && began && ended, mine ? `${mine.place}: ${menu.map((m) => m.label).join(", ")}` : "the guest carries no torch");
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  }
  const W = G.tuning.world;
  const life0 = { held: W.torchHeldLife, wall: W.torchWallLife };
  const wasPaused = G.loop.isPaused();
  const me = G.player;
  // The dead's aggro off while it steps, and the player's health put back: minutes of torches burning down must not leave the player
  // bitten (or dead) for the checks after it (the order-independence of the checks, check("all")).
  const aggro0 = G.rules.rules.zombieAggro;
  const health0 = { hp: me.hp, bleed: me.bleed ? { ...me.bleed } : null, infection: me.infection ? { ...me.infection } : null };
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const belt = G.inventory.beltOf(me);
  const belt0 = belt ? [...belt] : null;
  const bag = G.inventory.bagOf(me);
  const spent = [];
  const off = G.events.on("weaponBroke", (e) => spent.push(e));
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const mk = (props = {}) => G.items.makeEntry("torch", 1, props);
  const press = () => { G.interact.updateInteract(me, 1 / 60, { t: true }); step(1); };
  const restore = [];
  let kept = null; // `{ keep: true }`: the face the lit torch was left on, for a guest's run (#523)
  try {
    G.loop.setPaused(true);
    G.rules.set({ zombieAggro: false });
    // The valley's own (docs/43 section 4): its torch posts by the square and along the high street, and its four brackets that stood empty,
    // each hold an unlit torch with no wear, for a player to light.
    const vPosts = [...G.map.allProps()].filter((q) => q.sprite === "torch_post" && !q.made); // read before the check sets up a post of its own
    const vBrackets = [...G.map.brackets()].filter((b) => b.wall.bracket.torch && !b.wall.bracket.made);
    row("the valley's torch posts and its four torch brackets each hold an unlit torch, unworn", vPosts.length >= 4 && vPosts.every((q) => q.fire.has && q.fire.lit === false) && vBrackets.length === 4 && vBrackets.every((b) => b.wall.bracket.lit === false && b.wall.bracket.wear === 0), `${vPosts.length} posts (${vPosts.map((q) => `${q.tile}: ${q.fire.has ? (q.fire.lit ? "lit" : "unlit") : "empty"}`).join(", ")}); ${vBrackets.length} brackets`);
    // The valley's empty brackets hold an unlit torch since docs/43 section 4: the rows below want empty ones, so those torches come out for the
    // run and go back in the finally, unlit and unworn as authored.
    for (const b of [...G.map.brackets()].filter((q) => q.wall.bracket.torch && q.wall.bracket.lit === false && !q.wall.bracket.made)) {
      const t = { kind: "bracket", bracket: b };
      G.map.setHolder(t, false);
      restore.push(() => G.map.setHolder(t, true, { lit: false, wear: 0 }));
    }
    W.torchHeldLife = 60; // seconds held: a hundredth of a day
    W.torchWallLife = 120;
    me.hands.main = null;
    me.hands.off = null;

    // A new torch starts unlit, and gives no light.
    const fresh = mk();
    row("a new torch starts unlit", !fresh.lit && !G.items.isLit(fresh), `lit ${fresh.lit}`);
    me.hands.main = fresh;
    step(2);
    row("an unlit torch in the hand gives no light", G.items.heldFire(me.hands) === null && G.light.carriers().every((c) => c.owner !== me.id), `carried lights ${G.light.carriers().length}`);

    // T: with no tinderbox, it says why and lights nothing; with one, it lights; again, it puts it out.
    const boxes = [];
    for (const e of [...(bag.items || [])]) if (e.id === "tinderbox") boxes.push(e);
    for (const e of boxes) G.inventory.detach(me, e);
    restore.push(() => { for (const e of boxes) G.inventory.addItem(bag, e.id, 1); });
    press();
    row("T with no tinderbox lights nothing", !fresh.lit, `lit ${fresh.lit}`);
    G.inventory.addItem(bag, "tinderbox", 1);
    restore.push(() => { for (const e of [...(bag.items || [])]) if (e.id === "tinderbox") G.inventory.detach(me, e); }); // the one this test added
    press();
    row("T with a tinderbox lights the torch in hand, and it gives light", fresh.lit === true && G.items.heldFire(me.hands) !== null, `lit ${fresh.lit}`);
    press();
    const said = (document.getElementById("message") || {}).textContent || "";
    row("T again puts it out, and says so in those words (never \"douse\", docs/43)", !fresh.lit && G.items.heldFire(me.hands) === null && said === "You put out the torch.", `lit ${fresh.lit}; "${said}"`);

    // Burning: held faster than on the belt, and a kill costs far more than a second.
    press();
    const held = fresh;
    held.wear = 0;
    const beltTorch = mk({ lit: true, wear: 0 });
    if (belt) {
      const slot = belt.findIndex((e) => !e);
      if (slot >= 0) belt[slot] = beltTorch;
      else row("a belt slot for the second torch", false, "no free slot");
    }
    step(60 * 6);
    const k = G.items.getItem("torch").weapon.kills;
    row("a lit torch burns down held, and slower on the belt", held.wear > 0.05 && beltTorch.wear > 0.02 && held.wear > beltTorch.wear * 1.7 && held.wear < beltTorch.wear * 2.3, `after 6 s: held ${held.wear.toFixed(3)}, belt ${beltTorch.wear.toFixed(3)} (rates 1 over ${W.torchHeldLife} and ${W.torchWallLife} seconds, shortened here; really ${life0.held} and ${life0.wall})`);
    const perSecond = 1 / life0.held;
    const perKill = 1 / k;
    row("a kill costs far more than a second of burning", perKill > perSecond * 100, `a kill ${perKill.toFixed(3)} of a torch, a second held ${perSecond.toFixed(5)}`);

    // Spent: gone, with the weapon's word.
    held.wear = 0.999;
    step(60 * 3);
    row("a spent torch is gone from the hand, with a word", me.hands.main !== held && spent.some((e) => e.uid === held.uid), `hand ${me.hands.main && me.hands.main.id}, ${spent.length} told`);
    if (belt && belt.includes(beltTorch)) belt[belt.indexOf(beltTorch)] = null;

    // A torch in a bracket or on a post keeps its wear and burns at the wall rate; the village's own never go out.
    let bracket = null;
    let authored = null;
    for (const b of G.map.brackets()) {
      if (b.wall.bracket.lantern && !authored) authored = b;
      if (!b.wall.bracket.torch && !b.wall.bracket.lantern && !bracket) bracket = b;
    }
    if (bracket) {
      const target = { kind: "bracket", bracket, mx: bracket.tx, my: bracket.ty };
      const t = mk({ lit: true, wear: 0.5 });
      G.map.setHolder(target, true, t);
      restore.push(() => G.map.setHolder(target, false));
      const st0 = G.map.holderState(target);
      row("a mounted torch keeps its wear and lit", st0.wear === 0.5 && st0.lit === true, JSON.stringify(st0));
      step(60 * 6);
      const st1 = G.map.holderState(target);
      row("and burns at the wall rate in its bracket (half the held rate)", st1.wear > 0.5 + (6 / W.torchWallLife) * 0.7 && st1.wear < 0.5 + (6 / W.torchWallLife) * 1.3, `wear ${st1.wear.toFixed(3)} after 6 s (a wall rate of ${(6 / W.torchWallLife).toFixed(3)})`);
      // The save's copy of the chunk is never wrong while it burns (the wire's half is `check("sync")` with a guest).
      step(60 * 3);
      G.game.serialize();
      step(37);
      const wrong = G.game.verifySaveCache();
      row("and the save's cache is never wrong while it burns", wrong.length === 0, wrong.length ? JSON.stringify(wrong[0]).slice(0, 200) : "the cached save is the world made afresh");
      // Taking it out of the holder puts it out, wherever it lands.
      const out = G.interact.actionsForTarget({ kind: "bracket", tx: bracket.tx, ty: bracket.ty, edge: bracket.edge }, me).find((a) => /Take the torch/.test(a.label));
      const had = new Set([me.hands.main, me.hands.off]);
      row("a lit torch can be taken out of a bracket", !!out && out.perform() !== false, out ? out.label : "no such action");
      const found = G.inventory.findItem(me, "torch");
      const taken = [me.hands.main, me.hands.off].find((e) => e && e.id === "torch" && !had.has(e)) || (found && found.entry);
      row("and it comes out doused, with its wear", !!taken && !taken.lit && taken.wear > 0.5, taken ? `lit ${taken.lit}, wear ${taken.wear}` : "no torch on the player");
      if (taken) G.inventory.detach(me, taken);
      bracket.wall.bracket.wear = 0.999;
      G.map.setHolder(target, true, mk({ lit: true, wear: 0.999 }));
      step(60 * 3);
      row("a spent mounted torch is gone from its bracket", !G.map.holderHas(target), `holds a torch: ${G.map.holderHas(target)}`);
    } else row("an empty bracket for the mounting test", false, "none in the loaded map");
    if (authored) {
      step(60 * 10);
      row("the village's own lights are lanterns, which never go out", authored.wall.bracket.lantern === true && authored.wall.bracket.wear === undefined, "an authored lantern bracket, 10 s on");
    } else row("a village lantern bracket for the never-out test", false, "none in the loaded map");

    // A post holds a torch the same way.
    let at = null;
    for (let r = 2; r < 9 && !at; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const x = Math.round(me.gx) + dx;
      const y = Math.round(me.gy) + dy;
      G.map.ensureAround(x, y, 2);
      if (G.map.isWalkableTile(x, y) && !G.map.tileAt(x, y).prop && !G.map.tileAt(x, y).n && !G.map.tileAt(x, y).w) { at = [x, y]; break; }
    }
    if (at) {
      const post = G.map.createProp({ sprite: "torch_post", tile: at });
      G.map.placeProp(post, at[0], at[1]);
      restore.push(() => G.map.removeProp(post));
      const pt = { kind: "post", prop: post };
      G.map.setHolder(pt, true, mk({ lit: true, wear: 0.4 }));
      const p0 = G.map.holderState(pt);
      step(60 * 6);
      const p1 = G.map.holderState(pt);
      row("a torch on a post keeps its wear and burns at the wall rate", p0.wear === 0.4 && p1.wear > 0.4 + (6 / W.torchWallLife) * 0.7 && p1.wear < 0.4 + (6 / W.torchWallLife) * 1.3, `${p0.wear} to ${p1.wear.toFixed(3)} after 6 s`);
      post.fire.wear = 0.999;
      step(60 * 3);
      row("and a spent one is gone from the post", !G.map.holderHas(pt), `holds a torch: ${G.map.holderHas(pt)}`);
    } else row("open ground for a post", false, "none near the player");

    // A torch goes on a wall with its bracket (Michael, 2026-10-27, #523): Place torch on a torch's own menu (a hand, the belt, the bag), the
    // ghost on the face under the cursor as a painting's, a click mounting it lit or not with its own uid; a guest's `torch` command by the
    // face's address the same; refused on a fence, a window, and a face with a painting; Light, Put out, and Pick up by label, the torch back
    // put out with its uid and no bracket left; the save's record and the sync hash carry it.
    {
      const placement = await import("/src/placement.js");
      const P = await import("/src/paintings.js");
      const map = G.map;
      const message = () => (document.getElementById("message") || {}).textContent || "";
      const meAt = [me.gx, me.gy];
      restore.push(() => G.teleport(meAt[0], meAt[1]));
      // The bag emptied for the run (room for a torch and a painting), with a tinderbox for Light; put back in the finally.
      const bagItems0 = bag.items.slice();
      bag.items.length = 0;
      restore.push(() => bag.items.splice(0, bag.items.length, ...bagItems0));
      G.inventory.addItem(bag, "tinderbox", 1);
      map.ensureAround(me.gx, me.gy, 3);
      let spot = null;
      for (let dy = -16; dy <= 16 && !spot; dy++) for (let dx = -16; dx <= 16 && !spot; dx++) {
        const x = Math.round(me.gx) + dx;
        const y = Math.round(me.gy) + dy;
        let ok = true;
        for (let ay = -3; ay < 5 && ok; ay++) for (let ax = -2; ax < 10 && ok; ax++) { const t = map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.rug && !t.n && !t.w && !(t.items && t.items.length) && map.isWalkableTile(x + ax, y + ay); }
        if (ok) spot = [x, y];
      }
      if (!spot) row("bare grass for the wall run of the Place torch rows", false, "none within sixteen tiles");
      else {
        const [x, y] = spot;
        const wallAt = (i) => map.peekTile(x + i, y).n;
        for (let i = 0; i < 8; i++) map.buildWall(x + i, y, "n", "wall");
        map.destroyWall(x + 5, y, "n");
        map.buildWall(x + 5, y, "n", "wall", "wall_fence");
        map.buildWall(x + 6, y, "n", "window");
        const cleanWalls = () => {
          for (let i = 0; i < 8; i++) map.destroyWall(x + i, y, "n");
          for (let i = 0; i < 8; i++) for (const e of [...map.itemsAt(x + i, y)]) if (e.id === "torch" || /^painting_/.test(e.id)) map.takeItem(x + i, y, e);
        };
        if (!opts.keep) restore.push(cleanWalls);
        G.teleport(x + 2, y + 1);
        step(1);
        // The ghost (the page's own frame runs no placement while the pane is hidden): the camera snapped to the player, the cursor aimed by a
        // real mousemove on the canvas, `placement.update` run once; both put back after (as check("paintings") does).
        const cv = document.getElementById("game");
        const inp = await import("/src/input.js");
        const cam0 = { gx: G.camera.cam.gx, gy: G.camera.cam.gy };
        const mouse0 = { ...inp.getMouse() };
        const cvRect = cv.getBoundingClientRect();
        cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + 1000, clientY: cvRect.top + 500, bubbles: true }));
        const sc = 1000 / inp.getMouse().x;
        restore.push(() => {
          G.camera.snapTo(cam0.gx, cam0.gy);
          G.camera.applyOrigin(G.view.view.w, G.view.view.h);
          if (mouse0.inside) cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + mouse0.x * sc, clientY: cvRect.top + mouse0.y * sc, bubbles: true }));
          else cv.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        });
        restore.push(() => placement.cancel());
        const aimFace = (tx, ty) => {
          G.camera.snapTo(me.gx, me.gy);
          G.camera.applyOrigin(G.view.view.w, G.view.view.h);
          const p = G.iso.toScreen(tx, ty);
          cv.dispatchEvent(new MouseEvent("mousemove", { clientX: cvRect.left + (p.x + 12) * sc, clientY: cvRect.top + (p.y - 47) * sc, bubbles: true })); // the middle of a north segment's face
          placement.update(me);
          inp.endStep();
        };
        // The host's own: a lit torch in the main hand, Place torch from its slot's menu, the ghost green on x + 1 and lit, a click.
        const handT = mk({ lit: true, wear: 0.1 });
        me.hands.main = handT;
        const handMenu = G.interact.slotMenu(me, "hand:main");
        const placeIt = handMenu.find((m) => m.label === "Place torch");
        if (placeIt) placeIt.onSelect();
        aimFace(x + 1, y);
        const g0 = placement.state.ghost;
        row("Place torch on a held torch's menu starts the ghost on the face under the cursor, green within reach, drawn lit", !!placeIt && placement.state.kind === "torch" && !!g0 && g0.kind === "torch" && g0.tx === x + 1 && g0.ty === y && g0.edge === "n" && g0.ok === true && g0.torch.lit === true, g0 ? `${g0.tx},${g0.ty} ${g0.edge} ${g0.ok ? "green" : g0.reason}, lit ${g0.torch && g0.torch.lit}` : `no ghost; the menu: ${handMenu.map((m) => m.label).join(", ")}`);
        aimFace(x + 5, y);
        const gF = placement.state.ghost;
        row("over the fence the ghost is red and says why", !!gF && gF.ok === false && /nothing to hang it on/i.test(gF.reason), gF ? gF.reason : "no ghost");
        aimFace(x + 1, y);
        const clicked = placement.tryConfirm(me);
        const b1 = wallAt(1).bracket;
        G.light.update();
        const [bx, by] = b1 ? G.map.bracketPos({ tx: x + 1, ty: y, edge: "n", wall: wallAt(1) }) : [0, 0];
        const glows = G.light.sources().some((s) => s.kind === "torch" && Math.abs(s.gx - bx) < 0.01 && Math.abs(s.gy - by) < 0.01);
        row("a click puts the lit torch on the wall in a bracket of its own: lit kept, its uid and wear, the hand empty, the mode ended, its light there", clicked === true && !!b1 && b1.made === true && b1.torch === true && b1.lit === true && b1.uid === handT.uid && b1.wear === 0.1 && !me.hands.main && placement.state.kind === null && glows, b1 ? `${JSON.stringify(b1)}, light ${glows}` : `nothing on the wall: "${message()}"`);
        // A guest's command by the face's address: an unlit torch from the bag at x + 2, unlit on the wall.
        const bagT = mk({ wear: 0.25 });
        const where = G.inventory.stow(me, bagT);
        placement.performPlacement(me, { kind: "torch", uid: bagT.uid, tx: x + 2, ty: y, edge: "n" });
        const b2 = wallAt(2).bracket;
        row("a guest's torch command (the uid and the face's tx, ty, edge) puts an unlit torch up unlit, its own uid", !!where && !!b2 && b2.made === true && b2.lit === false && b2.uid === bagT.uid && !G.inventory.carriedEntry(me, bagT.uid), b2 ? JSON.stringify(b2) : `nothing on the wall: "${message()}" (stowed: ${where})`);
        // Refused: a fence, a window, a face with a painting (and the face already holding a torch); each says why and the torch stays.
        const spare = mk();
        G.inventory.stow(me, spare);
        const pic = G.items.makeEntry("painting_small_oak", 1);
        G.inventory.stow(me, pic);
        G.teleport(x + 4, y + 1);
        step(1);
        const hung = P.hang(me, pic.uid, x + 3, y, "n");
        const refusals = [];
        for (const [i, want] of [[5, /nothing to hang it on/i], [6, /nothing to hang it on/i], [3, /already hangs there/i], [2, /bracket is already there/i]]) {
          placement.performPlacement(me, { kind: "torch", uid: spare.uid, tx: x + i, ty: y, edge: "n" });
          const said = message();
          refusals.push(`${i}: "${said}"`);
          if (!want.test(said) || !G.inventory.carriedEntry(me, spare.uid) || (i >= 5 && wallAt(i).bracket)) refusals.push("WRONG");
        }
        row("refused on a fence, a window, a face with a painting, and a face that holds a torch, each with its reason, the torch kept", hung === true && !refusals.includes("WRONG"), refusals.join("; "));
        // The record and the sync hash.
        const [cx, cy] = map.chunkCoord(x + 1, y);
        const rec = JSON.stringify(map.serializeChunk(map.getChunk(cx, cy, false)));
        row("the wall's chunk record carries the torch on the wall with its uid (the save and a guest's chunk)", rec.includes(`"uid":"${handT.uid}"`) && rec.includes('"made":true'), "in the record");
        // Put out, Light, and Pick up by the labels a guest sends; the map's Take the torch never offered.
        G.teleport(x + 1, y + 1);
        step(1);
        const addr = { kind: "bracket", tx: x + 1, ty: y, edge: "n" };
        const labels = () => G.interact.actionsForTarget(addr, me).map((a) => a.label);
        const l0 = labels();
        const hash0 = G.game.syncParts().map;
        G.interact.performByLabel(me, addr, "Put out the torch");
        const out1 = wallAt(1).bracket && wallAt(1).bracket.lit === false;
        const hash1 = G.game.syncParts().map;
        G.interact.performByLabel(me, addr, "Light the torch"); // the tinderbox the check carries
        const lit1 = wallAt(1).bracket && wallAt(1).bracket.lit === true;
        row("its menu offers Put out the torch and Pick up torch (no Take the torch, nothing about a bracket); put out and lit again by label, the sync hash moving", l0.includes("Put out the torch") && l0.includes("Pick up torch") && !l0.includes("Take the torch") && !l0.some((l) => /bracket/i.test(l)) && out1 && lit1 && hash0 !== hash1, `${l0.join(", ")}; out ${out1}, lit ${lit1}`);
        if (opts.keep) {
          kept = { tx: x + 1, ty: y, edge: "n" };
          row("kept for the guest: the lit torch stays on the wall at x + 1 and the run of walls stays (put them away by hand)", !!wallAt(1).bracket, JSON.stringify(kept));
        } else {
          const had = new Set([me.hands.main, me.hands.off]);
          G.interact.performByLabel(me, addr, "Pick up torch");
          const back = G.inventory.carriedEntry(me, handT.uid);
          row("Pick up torch by its label: the torch back, put out, its uid and wear, and no bracket left on the wall", !!back && back.id === "torch" && back.lit === false && back.wear >= 0.1 && !wallAt(1).bracket && ![...map.brackets()].some((b) => b.wall === wallAt(1)), back ? `${JSON.stringify({ uid: back.uid, lit: back.lit, wear: back.wear })}, in the hand: ${!had.has(back) && (me.hands.main === back || me.hands.off === back)}` : "no torch back");
          if (back) G.inventory.detach(me, back);
        }
        for (const e of [bagT, spare, pic]) if (G.inventory.carriedEntry(me, e.uid)) G.inventory.detach(me, e);
      }
    }

    // A torch put away or dropped is out.
    const lit1 = mk({ lit: true, wear: 0.1 });
    me.hands.main = lit1;
    G.inventory.detach(me, lit1);
    G.inventory.stow(me, lit1);
    row("a lit torch put in the bag is out", lit1.lit === false, `lit ${lit1.lit}`);
    G.inventory.detach(me, lit1);
    const lit2 = mk({ lit: true, wear: 0.1 });
    const floor = G.map.dropItem(Math.round(me.gx), Math.round(me.gy), lit2);
    G.map.takeItem(Math.round(me.gx), Math.round(me.gy), floor);
    row("a lit torch dropped on the ground is out", floor.lit === false, `lit ${floor.lit}`);
    // What an entry carries goes out with it (#162): a belt dropped, and a body made.
    const mkBelt = () => { const b = G.items.makeEntry("belt", 1, {}); G.inventory.ensureSlots(b)[0] = mk({ lit: true, wear: 0.1 }); return b; };
    const belt1 = mkBelt();
    const droppedBelt = G.map.dropItem(Math.round(me.gx), Math.round(me.gy), belt1);
    G.map.takeItem(Math.round(me.gx), Math.round(me.gy), droppedBelt);
    row("a lit torch in the slots of a belt that is dropped is out", droppedBelt.slots[0] && droppedBelt.slots[0].lit === false, `lit ${droppedBelt.slots[0] && droppedBelt.slots[0].lit}`);
    const belt2 = mkBelt();
    const z0 = G.zombies.find((z) => !z.dead && !z.corpse) || G.zombies[0];
    const body = { ...z0, worn: { ...z0.worn, waist: belt2 }, hands: { main: null, off: null }, corpse: false }; // a copy: the fall is over for this one only
    G.dressCorpse(body);
    row("a lit torch on a belt on a body that falls is out, and stays out when looted", belt2.slots[0].lit === false, `lit ${belt2.slots[0].lit}`);

  } finally {
    off();
    W.torchHeldLife = life0.held;
    W.torchWallLife = life0.wall;
    for (const r of restore.reverse()) r();
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    if (belt && belt0) belt.splice(0, belt.length, ...belt0);
    Object.assign(me, health0);
    G.rules.set({ zombieAggro: aggro0 });
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, ...(kept ? { kept } : {}) };
}
