// Michael's playtest checklist, 2026-10-26 (docs/bugs.md, Fixed). From the console, on a tab with `?nosave&mute`:
//   await __game.check("playtest1")
// The throwing knives and axes taken by every hand belt slot and both hands as their stacks, through the panel's own handlers, a guest's
// slot command, and the off-hand slot's real key; Michael's swap (a bow held, a sword on the main-hand slot, a shield on the off-hand slot):
// the real key 1 puts the bow on the slot it freed, not in the bag, and so does a drag from that slot onto the main hand; with nowhere at all
// what is pushed out lies at the feet and the page says so; the map open on M: the pointer moved over the map turns the character (its aim
// and its facing follow, the event's target the map's own canvas), and this client's marker is a pointer with a round back, gold at its
// point and round behind with no tail, larger than another player's dot. Everything worn, held, carried, the map, the pause, and the
// screen are put back in the finally.
//
// Two tabs (`?nosave&mute&relay=none`): on the host `await __game.check("playtest1", { keep: true })` runs the rows above and then gives
// every other player the leather belt with a sword on its first main-hand slot and a shield on its first off-hand slot, a bow in both hands,
// and twenty throwing knives in its bag where they fit, and returns `kept`; on the guest `await __game.check("playtest1", { guest: <kept> })`
// sends its first main-hand slot's key by its role and waits for the sword in its hand and the bow on that slot, then sends its knives onto
// its second off-hand slot by a slot command and draws them into its off hand by that slot's key; then `await __game.check("sync")` on the
// host, and `await __game.check("playtest1", { stop: true })` there puts the other players back as `{ keep: true }` found them.

const keptBack = [];

export async function run(game, opts = {}) {
  const G = game;
  const inv = G.inventory;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const done = (kept = null) => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, kept };
  };
  const id = (e) => (e ? e.id : "-");
  const mk = (item, n = 1) => G.items.makeEntry(item, n);
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  if (opts.stop) {
    const put = [];
    for (const k of keptBack.splice(0)) {
      const p = G.game.state.players.find((q) => q.id === k.id);
      if (!p) continue;
      p.worn.waist = k.waist;
      p.hands.main = k.hands.main;
      p.hands.off = k.hands.off;
      const b = inv.bagOf(p);
      if (b && k.bag) b.items.splice(0, b.items.length, ...k.bag);
      p.offMemory = k.offMemory;
      put.push(p.id);
    }
    row("the other players' belts, hands, and bags put back as { keep: true } found them", true, put.join(", ") || "nobody kept");
    return done();
  }
  const me = G.player;

  // ---- a guest's side: its swap and its knives, by its snapshot and its slot command, on the host ----
  if (opts.guest) {
    const wasPaused = G.loop.isPaused();
    G.loop.setPaused(true);
    const pump = async (until, ms = 15000) => {
      const t0 = performance.now();
      let last = t0;
      while (!until() && performance.now() - t0 < ms) {
        await yieldOnce();
        if (performance.now() - last >= 1000 / 60) { last = performance.now(); G.loop.advance(1 / 60); }
      }
      return Math.round(performance.now() - t0);
    };
    const tap = (event) => {
      G.net.setTestSnapshot({ axis: { x: 0, y: 0 }, keys: { [event]: true } });
      G.loop.advance(1 / 60);
      G.net.setTestSnapshot(null);
    };
    const screenG = G.screens.currentScreen();
    if (screenG) G.screens.hide(); // a screen up sends nothing pressed, whatever a check says (net.js)
    try {
      // The host's kept state reaches my replica first.
      await pump(() => { const b = inv.beltOf(me); return !!(b && b.length === 5 && b[0] && b[0].id === "sword" && me.hands.main && me.hands.main.id === "bow"); }, 10000);
      let belt = inv.beltOf(me);
      const bow = me.hands.main;
      const sword = belt && belt[0];
      row("on the guest my replica holds the bow in both hands, a sword on my first main-hand slot and a shield on my first off-hand slot", !!belt && id(bow) === "bow" && me.hands.off === bow && id(sword) === "sword" && id(belt[1]) === "shield", belt ? `main ${id(me.hands.main)}, off ${id(me.hands.off)}; belt ${belt.map(id).join(" ")}` : "no belt");
      tap("beltMain1");
      const ms = await pump(() => { const b = inv.beltOf(me); return !!(me.hands.main && sword && me.hands.main.uid === sword.uid && b && b[0] && bow && b[0].uid === bow.uid); });
      belt = inv.beltOf(me);
      const inBag = (u) => !!(inv.bagOf(me) && inv.bagOf(me).items.some((e) => e.uid === u));
      row("my main-hand slot's key (beltMain1) draws the sword on the host, and the bow goes to the slot it freed, not my bag", !!sword && !!bow && me.hands.main && me.hands.main.uid === sword.uid && belt[0] && belt[0].uid === bow.uid && !inBag(bow.uid), `main ${id(me.hands.main)}; belt ${belt.map(id).join(" ")}; ${ms} ms`);
      const knives = inv.bagOf(me) && inv.bagOf(me).items.find((e) => e.id === "throwing_knife");
      if (knives) {
        G.net.sendItem({ op: "slot", uid: knives.uid, src: { kind: "bag", bag: { mine: true } }, slot: "belt:4" });
        await pump(() => { const b = inv.beltOf(me); return !!(b && b[4] && b[4].uid === knives.uid); }, 5000);
        belt = inv.beltOf(me);
        row("my twenty throwing knives sent onto my second off-hand slot by a slot command are taken there, the whole stack", belt[4] && belt[4].uid === knives.uid && belt[4].count === 20, `slot 5 ${id(belt[4])} x${belt[4] ? belt[4].count : 0}`);
        tap("beltOff2");
        await pump(() => !!(me.hands.off && me.hands.off.uid === knives.uid), 5000);
        row("that slot's key (beltOff2) draws the knives into my off hand on the host", me.hands.off && me.hands.off.uid === knives.uid && me.hands.off.count === 20, `off ${id(me.hands.off)} x${me.hands.off ? me.hands.off.count : 0}`);
      } else row("my knives onto a hand slot", opts.guest.knives && opts.guest.knives[me.id] === false, "no knives in my bag (the host found no room)");
    } catch (e) {
      rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
    } finally {
      G.net.setTestSnapshot(null);
      if (screenG) G.screens.show(screenG);
      G.loop.setPaused(wasPaused);
    }
    return done();
  }

  // ---- the host's own (or a world of one's own) ----
  const actionsMod = await import("/src/ui/inventory-actions.js");
  const mp = await import("/src/ui/map-panel.js");
  const iso = await import("/src/iso.js");
  const h = actionsMod.createInventoryActions(() => me);
  const worn0 = { waist: me.worn.waist, back: me.worn.back };
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const bag0 = inv.bagOf(me) ? inv.bagOf(me).items.slice() : null;
  const offMemory0 = me.offMemory;
  const at0 = [me.gx, me.gy];
  const order0 = G.settings.get("beltOrder"); // shared with Michael's browser: put back in the finally
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  const mapOpen0 = mp.isOpen();
  const inp = await import("/src/input.js");
  const use = await import("/src/use.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const look0 = { facing: me.facing, aim: { ...me.aim }, mouse: { ...inp.getMouse() } }; // put back in the finally: the pointer is the page's
  const bagOpen0 = panel.isBagOpen();
  const floor = [];
  let kept = null;
  G.loop.setPaused(true);
  if (screen0) G.screens.hide(); // the title takes the keys
  const key = (code, type = "keydown") => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const press = (code) => { key(code); G.loop.advance(1 / 60); key(code, "keyup"); G.loop.advance(1 / 60); };
  const msgEl = () => document.getElementById("message");
  const message = () => ((msgEl() || {}).textContent || "").trim();
  const clearMessage = () => { const m = msgEl(); if (m) { m.textContent = ""; m.hidden = true; } };
  let belt = null;
  const bag = () => inv.bagOf(me);
  const fresh = () => {
    me.worn.waist = mk("good_belt");
    me.hands.main = null;
    me.hands.off = null;
    me.offMemory = null;
    if (bag()) bag().items.length = 0;
    belt = inv.beltOf(me);
    return belt;
  };
  const where = () => `main ${id(me.hands.main)}, off ${id(me.hands.off)}; belt ${belt.map(id).join(" ")}; bag ${(bag() && bag().items.map(id).join(",")) || "-"}`;
  try {
    if (!bag()) throw new Error("no bag on the back to try the belt with");
    G.settings.set("beltOrder", "sequential");
    // ---- 1. the throwing knives and axes in the hand slots, as stacks ----
    fresh();
    G.grid.insert(bag(), mk("throwing_knife", 20));
    G.grid.insert(bag(), mk("throwing_axe", 10));
    const knives = bag().items.find((e) => e.id === "throwing_knife");
    const axes = bag().items.find((e) => e.id === "throwing_axe");
    const slots = ["belt:0", "belt:1", "belt:2", "belt:3", "belt:4", "hand:main", "hand:off"];
    row("twenty throwing knives and ten throwing axes are taken by every belt slot and both hands, as their whole stacks (they were refused in every hand slot)", slots.every((s) => h.canPlace(knives, s) && h.canPlace(axes, s)), slots.filter((s) => !h.canPlace(knives, s) || !h.canPlace(axes, s)).join(",") || "all seven");
    h.placeInSlot(axes, { kind: "bag", bag: bag() }, "hand:main"); // the drag's handler, as the panel calls it
    row("the axes dragged from the bag onto the main hand are held there, all ten", me.hands.main === axes && axes.count === 10 && !bag().items.includes(axes), where());
    h.placeInSlot(knives, { kind: "bag", bag: bag() }, "belt:1");
    row("the knives dragged onto the off-hand slot sit there, all twenty", belt[1] === knives && knives.count === 20, where());
    press("Digit2");
    row("key 2 draws the knives into the off hand", me.hands.off === knives && !belt[1] && me.hands.main === axes, where());

    // ---- 2. Michael's swap: a bow held, a sword on the main-hand slot, a shield on the off-hand slot; key 1 ----
    fresh();
    let bow = mk("bow");
    me.hands.main = bow;
    me.hands.off = bow;
    belt[0] = mk("sword");
    belt[1] = mk("shield");
    press("Digit1");
    row("Michael's case: a bow held, a sword on slot 1 and a shield on slot 2; key 1 draws the sword and the bow takes slot 1, not the bag", id(me.hands.main) === "sword" && belt[0] === bow && id(belt[1]) === "shield" && !bag().items.includes(bow), where());
    fresh();
    bow = mk("bow");
    me.hands.main = bow;
    me.hands.off = bow;
    belt[0] = mk("sword");
    h.placeInSlot(belt[0], { kind: "slot", id: "belt:0" }, "hand:main"); // a drag from the slot onto the main hand
    row("the same by a drag from slot 1 onto the main hand: the bow onto the slot it freed", id(me.hands.main) === "sword" && belt[0] === bow && !bag().items.includes(bow), where());
    // Nowhere for the shield at all: the feet, and the page says so.
    fresh();
    me.worn.back = null;
    me.hands.main = mk("mace");
    const shield = mk("shield");
    me.hands.off = shield;
    belt[0] = mk("halberd");
    belt[1] = mk("book_of_fire");
    belt[2] = mk("bread");
    belt[4] = mk("book_of_fire");
    clearMessage();
    press("Digit1");
    const tx = Math.round(me.gx), ty = Math.round(me.gy);
    const lies = G.map.itemsAt(tx, ty).some((e) => e.uid === shield.uid);
    if (lies) floor.push([tx, ty, shield.uid]);
    row("with no slot, bag, or utility slot for it, the shield the halberd pushes out lies at the feet, and the page says \"Nowhere to put the wooden shield: it is at your feet.\"", id(me.hands.main) === "halberd" && lies && message() === "Nowhere to put the wooden shield: it is at your feet.", `${where()}; "${message()}"`);
    me.worn.back = worn0.back;

    // ---- 3. the map open on M: the pointer over it turns the character; my marker a pointer with a round back ----
    fresh();
    G.teleport(me.gx, me.gy);
    if (!mp.isOpen()) press("KeyM");
    mp.update({ player: me, players: G.game.state.players, places: [] }); // a hidden pane draws no frame: the panel sizes its canvas when it draws
    const cv = document.querySelector("#map-panel canvas");
    const box = cv.getBoundingClientRect();
    const move = (x, y) => { cv.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true })); G.loop.advance(1 / 60); G.loop.advance(1 / 60); };
    const yMid = box.top + box.height / 2;
    const left = { x: box.left + 12, y: yMid };
    const right = { x: box.right - 12, y: yMid };
    const overMap = [left, right].every((p) => { const el = document.elementFromPoint(p.x, p.y); return !!el && !!el.closest("#map-panel"); });
    move(left.x, left.y);
    const aimL = { ...me.aim };
    const faceL = me.facing;
    move(right.x, right.y);
    const aimR = { ...me.aim };
    const faceR = me.facing;
    row("with the map open, the pointer moved over the map turns the character: its aim points left, then right, and its facing follows", mp.isOpen() && overMap && aimL.sx < 0 && aimR.sx > 0 && faceL !== faceR, `open ${mp.isOpen()}, over the map ${overMap}; aim ${aimL.sx.toFixed(0)},${aimL.sy.toFixed(0)} facing ${faceL}, then ${aimR.sx.toFixed(0)},${aimR.sy.toFixed(0)} facing ${faceR}`);
    // Over the map the pointer is not over the world: `inside` false, so no world hover (the zombie hand, a Use label) reads under it.
    const game = document.getElementById("game");
    game.dispatchEvent(new MouseEvent("mousemove", { clientX: right.x, clientY: right.y, bubbles: true }));
    const insideOnWorld = inp.getMouse().inside;
    move(right.x, right.y);
    row("the pointer over the map is not over the world (input's inside false), and over the world's canvas it is", insideOnWorld === true && inp.getMouse().inside === false, `on the canvas ${insideOnWorld}, over the map ${inp.getMouse().inside}`);
    mp.update({ player: me, players: G.game.state.players, places: (G.game.state.info && G.game.state.info.places) || [] });
    const mine = mp.markers().find((q) => q.self);
    const i = iso.FACINGS.indexOf(me.facing);
    const f = { x: Math.cos((i * Math.PI) / 4), y: Math.sin((i * Math.PI) / 4) };
    const g2 = cv.getContext("2d");
    const pix = (dx, dy) => Array.from(g2.getImageData(Math.round(Math.round(mine.x) + dx), Math.round(Math.round(mine.y) + dy), 1, 1).data); // drawn at whole pixels
    const gold = ([r, g, b]) => r > 180 && g > 140 && b < 130 && r - b > 90; // the gold, or its edge blended at a half pixel
    const P = mp.POINTER;
    const tipIn = gold(pix(f.x * (P.tip - 3), f.y * (P.tip - 3)));
    const backIn = gold(pix(-f.x * (P.r - 1.5), -f.y * (P.r - 1.5)));
    const sideIn = gold(pix(-f.y * (P.r - 1.5), f.x * (P.r - 1.5)));
    const noTail = !gold(pix(-f.x * (P.r + 3), -f.y * (P.r + 3)));
    row("my marker on the map is a pointer with a round back: gold toward my facing out to its point, round behind and to the side, no tail behind, larger than the old dot", !!mine && mine.shape === "pointer" && tipIn && backIn && sideIn && noTail && P.r > 4.5 && P.tip > 12, mine ? `shape ${mine.shape}, facing ${me.facing}; point ${tipIn}, back ${backIn}, side ${sideIn}, no tail ${noTail}; r ${P.r}, point ${P.tip} px` : "no marker of mine");
    // The name beside it is clear of the pointer whichever of the eight ways it turns: the point's reach (tip + 2 with its outline) and the
    // disc's never enter the label's box (x from LABEL_SELF.x, y LABEL_SELF.y above the centre, an 11 px line).
    const L = mp.LABEL_SELF;
    const clear = iso.FACINGS.every((_, k) => {
      const a = (k * Math.PI) / 4;
      for (let t = -(P.r + 1.5); t <= P.tip + 2; t += 0.5) {
        const w = t <= 0 ? Math.sqrt(Math.max(0, (P.r + 1.5) ** 2 - t * t)) : P.r + 1.5; // the disc behind, and no wider than the disc ahead
        for (const s of [-w, 0, w]) {
          const x = Math.cos(a) * t - Math.sin(a) * s;
          const y = Math.sin(a) * t + Math.cos(a) * s;
          if (x >= L.x - 1 && y >= -L.y - 7 && y <= -L.y + 7) return false;
        }
      }
      return true;
    });
    row("my name on the map stands clear of the pointer in all eight facings", clear, `label at +${L.x}, -${L.y}; pointer r ${P.r}, point ${P.tip}`);
    const other = G.game.state.players.find((p) => p !== me && !p.dead);
    if (other) {
      const theirs = mp.markers().find((q) => q.id === other.id);
      row("another player's marker keeps its look, a dot in its colour", !theirs || theirs.shape === "dot", theirs ? theirs.shape : "off the map");
    }
    if (!mapOpen0) press("KeyM");

    // ---- 4. the Use mode with the bag open: over the bag its label names nothing in the world under it ----
    fresh();
    G.grid.insert(bag(), mk("poison"));
    const vial = bag().items.find((e) => e.id === "poison");
    panel.setBagOpen(true);
    panel.renderInventoryPanel(me, bag(), null, inv.beltOf(me));
    // The pointer's event lands on the bag's grid (a hidden pane lays no panel out where a frame would, so the point is the grid's own
    // and the event is sent to it, as the browser sends one over it).
    const bagEl = document.querySelector("#inventory .inv-grid");
    const bagBox = bagEl.getBoundingClientRect();
    const onBag = { x: bagBox.left + bagBox.width / 2, y: bagBox.top + bagBox.height / 2 };
    const overBag = !!bagEl.closest("#inventory") && !document.getElementById("inventory").hidden; // the bag is open, its grid the target
    const label = () => ((document.getElementById("use-label") || {}).textContent || "").trim();
    use.begin(vial, { kind: "bag", bag: bag() });
    game.dispatchEvent(new MouseEvent("mousemove", { clientX: onBag.x, clientY: onBag.y, bubbles: true })); // the world's canvas at that very point
    G.loop.advance(1 / 60);
    const worldLabel = label();
    document.querySelector("#inventory .inv-grid").dispatchEvent(new MouseEvent("mousemove", { clientX: onBag.x, clientY: onBag.y, bubbles: true })); // found again: the step redrew the panel
    G.loop.advance(1 / 60);
    const bagLabel = label();
    use.cancel();
    row("in the Use mode with the bag open, the label over the bag names nothing in the world (\"Use Poison →\"), where the world's canvas at that very point names what is under it", overBag && bagLabel === "Use Poison →" && worldLabel.startsWith("Use Poison → ") && worldLabel.length > bagLabel.length, `over the bag ${overBag}; "${bagLabel}"; on the canvas "${worldLabel}"`);
    panel.setBagOpen(bagOpen0);

    // ---- two tabs: the swap and the knives for every other player ----
    if (opts.keep) {
      const others = G.game.state.players.filter((p) => p !== me);
      const knivesFor = {};
      for (const p of others) {
        keptBack.push({ id: p.id, waist: p.worn.waist, hands: { main: p.hands.main, off: p.hands.off }, bag: inv.bagOf(p) ? inv.bagOf(p).items.slice() : null, offMemory: p.offMemory });
        p.worn.waist = mk("good_belt");
        const b = inv.beltOf(p);
        b[0] = mk("sword");
        b[1] = mk("shield");
        const pb = mk("bow");
        p.hands.main = pb;
        p.hands.off = pb;
        p.offMemory = null;
        knivesFor[p.id] = !!inv.bagOf(p) && G.grid.insert(inv.bagOf(p), mk("throwing_knife", 20));
      }
      kept = others.length ? { players: others.map((p) => p.id), knives: knivesFor } : null;
      row("kept for the guest: every other player holds a bow, with a sword and a shield on its belt's first hand slots and twenty knives in its bag where they fit; `{ stop: true }` puts them back", !!kept, kept ? JSON.stringify(kept) : "no other player");
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    if (!mapOpen0) mp.close();
    if (use.isActive()) use.cancel();
    panel.setBagOpen(bagOpen0);
    me.facing = look0.facing;
    me.aim = look0.aim;
    Object.assign(inp.getMouse(), look0.mouse); // the pointer as the page had it
    for (const [x, y, uid] of floor) { const l = G.map.itemsAt(x, y); const k = l.findIndex((e) => e.uid === uid); if (k >= 0) l.splice(k, 1); G.map.markDirty(x, y); }
    G.settings.set("beltOrder", order0);
    me.worn.waist = worn0.waist;
    me.worn.back = worn0.back;
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    if (bag0 && inv.bagOf(me)) inv.bagOf(me).items.splice(0, inv.bagOf(me).items.length, ...bag0);
    me.offMemory = offMemory0;
    G.teleport(at0[0], at0[1]);
    clearMessage();
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  return done(kept);
}
