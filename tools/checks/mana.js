// Mana (docs/47 section 5 and step 1, #480). From the console, on a tab with `?nosave&mute` (the valley):
//   await __game.check("mana")
// The levers in the data (`player.mana` 100, `player.manaRegen` 0.333, `potions.praySeconds` 3, the Fireball's `mana` 20); the bar on the page in
// blue under stamina with its points; the host's step regenerating it on the sim clock, a point every three seconds, and never past the top;
// with the staff and the Book of Fire, a cast the bar cannot pay for refused before its draw starts, with "Not enough mana." on the page, the
// bar's flash (its `short` class) and its sound (`mana_short`), nothing spent; a cast paid for spending its 20 on the release alone, never on a
// cancelled draw or a dry one; the altar in the chapel offering Pray, a bar of praySeconds by the label a guest sends, the bars untouched until
// its end and then mana and stamina full, its line on the page and its sound (`pray`); refused out of reach; the book's hover card on the page
// saying its cost; the sync part moving with mana. Everything moved is put back in the finally (the hands, the bars, the place, the loop, the
// sound setting).
//
// Two tabs (`?nosave&mute&relay=none`): on the host `await __game.check("mana", { keep: true })` runs the rows above and then stands every other
// player beside the altar with the staff and the book in its hands and 10 mana, and returns `kept`; on the guest
// `await __game.check("mana", { guest: <kept> })` reads its replica's bar from the host's record, its HUD, and its book's card; clicks to cast
// through its snapshot and sees its own bar flash on that very step with no draw of its own, the host's line reach it, and no draw ever come
// back; then sends Pray by its label (`net.sendAct`) and waits for its bars to fill from the host's step; then `await __game.check("sync")` on
// the host, and `await __game.check("mana", { stop: true })` there puts the other players back as `{ keep: true }` found them.

const keptBack = []; // the other players as `{ keep: true }` found them (the module is cached by the page)

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const done = (kept = null) => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, kept };
  };
  if (opts.stop) {
    const put = [];
    for (const k of keptBack.splice(0)) {
      const p = G.game.state.players.find((q) => q.id === k.id);
      if (!p) continue;
      p.hands.main = k.main;
      p.hands.off = k.off;
      p.gx = k.gx;
      p.gy = k.gy;
      p.auto = null;
      p.mana = k.mana;
      put.push(p.id);
    }
    row("the other players' hands, places, and mana put back as { keep: true } found them", true, put.join(", ") || "nobody kept");
    return done();
  }
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mana = await import("/src/mana.js");
  const hud = await import("/src/ui/hud.js");
  const info = await import("/src/item-info.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const card = await import("/src/ui/hover-card.js");
  const tuning = await import("/src/tuning.js");
  const snd = G.sound;
  const me = G.player;
  const msgEl = () => document.getElementById("message");
  const message = () => ((msgEl() || {}).textContent || "").trim();
  const clearMessage = () => { const m = msgEl(); if (m) { m.textContent = ""; m.hidden = true; } };
  const manaEl = () => document.querySelector("#hud .hud-mana");
  const drawHud = () => hud.updateHud({ player: me });
  const heard = (name) => (snd ? snd.log.filter((e) => e.name === name).length : 0);
  const fb = G.items.getItem("book_of_fire").book.spell;
  const costLine = `Costs ${fb.mana} mana a cast, spent when it is released.`;
  const altarNear = () => [...G.map.allProps()].filter((p) => mana.isAltar(p)).sort((a, b) => Math.hypot(a.tile[0] - me.gx, a.tile[1] - me.gy) - Math.hypot(b.tile[0] - me.gx, b.tile[1] - me.gy))[0] || null;
  const wasPaused = G.loop.isPaused();
  const soundOn0 = G.settings.get("soundOn"); // shared with Michael's browser: put back in the finally (the page is muted either way, ?mute)
  const screen0 = G.screens.currentScreen();

  // ---- a guest's side: my bar from the host's record, my refused cast predicted, my prayer ----
  if (opts.guest) {
    G.loop.setPaused(true);
    if (screen0) G.screens.hide();
    const pump = async (until, ms = 15000) => {
      const t0 = performance.now();
      let last = t0;
      while (!until() && performance.now() - t0 < ms) {
        await yieldOnce();
        if (performance.now() - last >= 1000 / 60) { last = performance.now(); G.loop.advance(1 / 60); if (snd) snd.update(1 / 60); }
      }
      return Math.round(performance.now() - t0);
    };
    try {
      if (snd) { G.settings.set("soundOn", true); snd.log.length = 0; }
      const ms0 = await pump(() => !!altarNear() && Math.hypot(altarNear().tile[0] - me.gx, altarNear().tile[1] - me.gy) < 4 && me.mana < 20);
      const altar = altarNear();
      row("on the guest my replica stands by the altar the host stood me at, with the staff and the book in my hands", !!altar && me.hands.main && me.hands.main.id === "staff_of_fire" && me.hands.off && me.hands.off.id === "book_of_fire", `${altar ? `altar ${altar.id} at ${Math.hypot(altar.tile[0] - me.gx, altar.tile[1] - me.gy).toFixed(1)} tiles` : "no altar"}; ${ms0} ms`);
      // The bar from the host's record: the 10 it set, regenerating there, never here alone.
      drawHud();
      const text0 = (manaEl() && manaEl().querySelector(".hud-mana-text").textContent) || "";
      row("my bar is the host's record: 10 mana and rising from the host's step, my maximum 100, and my HUD says so", me.mana >= 10 && me.mana < 14 && me.maxMana === 100 && text0 === `${Math.floor(me.mana + 1e-6)} / 100`, `mana ${me.mana}, max ${me.maxMana}; HUD "${text0}"`);
      // A cast my bar cannot pay for: my prediction flashes the bar on the step itself and draws nothing; the host's line follows; no draw ever comes back.
      clearMessage();
      const flash0 = me.manaFlash || 0;
      G.net.setTestSnapshot({ axis: { x: 0, y: 0 }, clicked: true, leftDown: true, aim: { x: 40, y: 0 } });
      G.loop.advance(1 / 60);
      const predicted = me.manaFlash;
      G.net.setTestSnapshot({ axis: { x: 0, y: 0 }, aim: { x: 40, y: 0 } });
      drawHud();
      const shortNow = manaEl() && manaEl().classList.contains("short");
      row("my click to cast at 10 mana flashes my own bar on that step (its `short` class), before the host answers, and starts no draw here", flash0 === 0 && predicted === mana.FLASH_SECONDS && !!shortNow && !me.draw, `flash ${flash0} -> ${predicted}; short ${shortNow}; draw ${!!me.draw}`);
      let drew = false;
      const ms1 = await pump(() => { drew = drew || !!me.draw; return message() === mana.NOT_ENOUGH; }, 6000);
      await pump(() => { drew = drew || !!me.draw; return false; }, 800);
      row("the host refuses my cast by the same rule: its line \"Not enough mana.\" reaches my screen and no draw of mine ever comes back", message() === mana.NOT_ENOUGH && !drew && me.mana >= 10 && me.mana < 15, `"${message()}"; drew ${drew}; mana ${me.mana}; ${ms1} ms`);
      row("my ear plays `mana_short` with the flash (the sound's twin)", !snd || heard("mana_short") >= 1, snd ? `${heard("mana_short")} logged` : "no __game.sound");
      G.net.setTestSnapshot(null);
      // Pray by its label, as my menu sends it: the host's bar, then my bars full from its record.
      const labels = altar ? G.interact.actionsForTarget({ kind: "prop", id: altar.id }, me).map((a) => a.label) : [];
      row("my replica's menu on the altar offers Pray", labels.includes("Pray"), labels.join(", ") || "none");
      clearMessage();
      let sawBar = false;
      if (altar) G.net.sendAct({ kind: "prop", id: altar.id }, "Pray");
      const ms2 = await pump(() => { sawBar = sawBar || !!(me.actionView && me.actionView.label === "Pray"); return me.mana >= 99.99; }, 12000);
      row("Pray sent by its label runs the host's bar (its view reaches me) and fills my mana and stamina from the host's step, its line reaching me", sawBar && me.mana >= 99.99 && me.stamina >= me.maxStamina - 1e-6 && message() === mana.PRAYED, `bar seen ${sawBar}; mana ${me.mana}, stamina ${Math.round(me.stamina)}; "${message()}"; ${ms2} ms`);
      row("my ear plays `pray` as the bar begins (the bars filling its twin)", !snd || heard("pray") >= 1, snd ? `${heard("pray")} logged` : "no __game.sound");
      const cardText = info.textOf(info.cardFor(G.items.makeEntry("book_of_fire", 1))).join(" | ");
      row("on the guest the book's card says its cost", cardText.includes(costLine), cardText);
    } catch (e) {
      rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
    } finally {
      G.net.setTestSnapshot(null);
      G.settings.set("soundOn", soundOn0);
      if (screen0) G.screens.show(screen0);
      G.loop.setPaused(wasPaused);
    }
    return done();
  }

  // ---- the host's own (or a world of one's own) ----
  const saved = { main: me.hands.main, off: me.hands.off, gx: me.gx, gy: me.gy, mana: me.mana, stamina: me.stamina, winded: me.winded, aggro: G.rules.rules.zombieAggro, aim: me.aimOverride };
  const A = G.archery;
  const step = (n = 1) => { for (let i = 0; i < n; i++) { G.loop.advance(1 / 60); if (snd) snd.update(1 / 60); } };
  let kept = null;
  try {
    G.loop.setPaused(true);
    if (screen0) G.screens.hide();
    G.rules.set({ zombieAggro: false });
    if (snd) { G.settings.set("soundOn", true); snd.log.length = 0; }
    // The levers, in the data.
    const T = tuning.player;
    row("the levers: player.mana 100, player.manaRegen 0.333, potions.praySeconds 3, the Fireball's mana 20 (data)", T.mana === 100 && Math.abs(T.manaRegen - 0.333) < 1e-9 && tuning.potions.praySeconds === 3 && fb.mana === 20, `mana ${T.mana}, regen ${T.manaRegen}, pray ${tuning.potions.praySeconds}, the Fireball ${fb.mana}`);
    // The bar on the page: blue, under stamina, its points.
    me.mana = 100;
    drawHud();
    const el = manaEl();
    const fill = el && el.querySelector(".hud-mana-fill");
    const blue = getComputedStyle(document.documentElement).getPropertyValue("--blue").trim();
    const fillColour = fill ? getComputedStyle(fill).backgroundColor : "";
    const under = el && el.previousElementSibling && el.previousElementSibling.classList.contains("hud-stamina");
    row("the mana bar is on the page under stamina, filled in blue (--blue), saying 100 / 100", !!el && under && fillColour === "rgb(79, 134, 216)" && blue === "#4f86d8" && el.querySelector(".hud-mana-text").textContent === "100 / 100" && el.querySelector(".hud-label").textContent === "Mana", `under stamina ${under}; ${fillColour} (${blue}); "${el ? el.textContent : ""}"`);
    // Regeneration: the host's step, a point every three seconds of the sim clock.
    me.mana = 50;
    step(60 * 30);
    drawHud();
    row("30 s of the sim clock regenerate about ten points (0.333 a second) from 50, and the bar follows", Math.abs(me.mana - (50 + 30 * T.manaRegen)) < 0.02 && fill.style.width === `${Math.round(me.mana)}%`, `mana ${me.mana.toFixed(3)}; width ${fill.style.width}; "${el.querySelector(".hud-mana-text").textContent}"`);
    me.mana = 99.95;
    step(60);
    row("it stops at the top", me.mana === 100, `mana ${me.mana}`);
    // The cast: the staff and the book.
    me.hands.main = G.items.makeEntry("staff_of_fire", 1);
    me.hands.off = G.items.makeEntry("book_of_fire", 1);
    A.setAim(me.gx + 6, me.gy);
    step(30);
    me.mana = 19.5;
    me.manaFlash = 0;
    clearMessage();
    if (snd) snd.log.length = 0;
    const refused = A.press();
    step();
    drawHud();
    row("at 19.5 mana the cast is refused before its draw starts: no draw, nothing spent, \"Not enough mana.\" on the page", refused === false && !A.drawing() && Math.abs(me.mana - 19.5) < 0.01 && message() === mana.NOT_ENOUGH, `press ${refused}; drawing ${!!A.drawing()}; mana ${me.mana.toFixed(3)}; "${message()}"`);
    row("and the bar flashes (its `short` class) and `mana_short` sounds, its twin", manaEl().classList.contains("short") && me.manaFlash > 0 && (!snd || heard("mana_short") === 1), `short ${manaEl().classList.contains("short")}; flash ${me.manaFlash.toFixed(2)}; ${heard("mana_short")} mana_short`);
    step(60);
    drawHud();
    row("the flash runs down in the host's step", me.manaFlash === 0 && !manaEl().classList.contains("short"), `flash ${me.manaFlash}`);
    // Paid: nothing at the start, nothing on a cancel or a dry release, the 20 on a release that flies.
    me.mana = 30;
    me.recover = 0;
    A.press();
    step(20);
    const midDraw = me.mana;
    A.cancel();
    step();
    row("a draw that starts spends nothing, and a cancelled one nothing", !!midDraw && midDraw >= 30 && me.mana >= 30 && me.mana < 30.2, `during ${midDraw.toFixed(3)}, after the cancel ${me.mana.toFixed(3)}`);
    me.mana = 30;
    A.press();
    step(2); // under minDraw
    const dry = A.release();
    step();
    row("a dry release (under the minimum draw) casts nothing and spends nothing", dry === null && me.mana >= 30 && me.mana < 30.1, `release ${dry}; mana ${me.mana.toFixed(3)}`);
    me.recover = 0;
    me.mana = 30;
    if (snd) snd.log.length = 0;
    A.press();
    step(45);
    const before = me.mana;
    const flew = A.release();
    const after = me.mana;
    step(90);
    row("a cast paid for spends its 20 on the release: the Fireball flies and the cast sounds", !!flew && flew.projectile === "fireball" && Math.abs(before - after - fb.mana) < 1e-9 && (!snd || heard("cast") === 1), `${flew ? flew.projectile : "nothing"}; ${before.toFixed(3)} -> ${after.toFixed(3)}; ${heard("cast")} cast`);
    me.hands.main = null;
    me.hands.off = null;
    A.setAim(null);
    // The book's card on the page: a belt slot's hover card.
    const belt = G.inventory.beltOf(me);
    const slotIndex = belt ? belt.findIndex((e) => !e) : -1;
    let hovered = "";
    if (slotIndex >= 0) {
      const book = G.items.makeEntry("book_of_fire", 1);
      belt[slotIndex] = book;
      panel.renderInventoryPanel(me, G.inventory.bagOf(me), null, belt);
      const slot = document.querySelector(`#hotbar .inv-item[data-slot="belt:${slotIndex}"]`);
      if (slot) {
        const r = slot.getBoundingClientRect();
        card.hide();
        slot.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
        await wait(tuning.hoverCard.delayMs + 80);
        hovered = (document.getElementById("hover-card") || {}).textContent || "";
      }
      card.hide();
      belt[slotIndex] = null;
      panel.renderInventoryPanel(me, G.inventory.bagOf(me), null, belt);
    }
    row("the Book of Fire's hover card on the page says its cost", hovered.includes(costLine), hovered || "no card (no free belt slot)");
    // The altar's Pray: the chapel's altar, its bar, its end, its line, its sound.
    // The altar's chunk grown if it is not yet (a ?nosave world is expendable): every authored place's chunks.
    let altar = altarNear();
    if (!altar) for (const pl of G.game.state.info.places || []) { const [x0, y0, w, h] = pl.box; for (let y = y0; y < y0 + h + 16; y += 16) for (let x = x0; x < x0 + w + 16; x += 16) G.map.ensureAround(x, y, 0); }
    altar = altarNear();
    let stand = null;
    if (altar) {
      const pray = G.verbs.get("pray");
      for (let r = 1; r <= 2 && !stand; r++) for (const [x, y] of altar.tiles) for (let dy = -r; dy <= r && !stand; dy++) for (let dx = -r; dx <= r && !stand; dx++) {
        const t = G.map.tileAt(x + dx, y + dy);
        if (!t || t.prop || !G.map.isWalkableTile(x + dx, y + dy)) continue;
        G.teleport(x + dx, y + dy);
        if (pray.validate(null, me, { prop: altar.id }) === true) stand = [x + dx, y + dy];
      }
    }
    row("the chapel's altar has a spot in reach to pray from", !!stand, altar ? `${altar.id} at ${altar.tile}; stand ${stand}` : "no altar");
    if (stand) {
      const onAltar = { kind: "prop", id: altar.id };
      const labels = G.interact.actionsForTarget(onAltar, me).map((a) => a.label);
      row("its menu offers Pray", labels.includes("Pray"), labels.join(", "));
      me.mana = 0;
      me.stamina = 0;
      clearMessage();
      if (snd) snd.log.length = 0;
      const ran = G.interact.performByLabel(me, onAltar, "Pray");
      step(60);
      row("Pray by the label a guest sends starts a bar of praySeconds; a second in, the bars are untouched and `pray` has sounded", ran && me.action && me.action.action.kind === "pray" && me.action.action.duration === tuning.potions.praySeconds && me.mana < 1 && me.stamina < 20 && (!snd || heard("pray") === 1), `ran ${ran}; ${me.action ? `${me.action.action.label} ${me.action.action.duration} s` : "no bar"}; mana ${me.mana.toFixed(2)}, stamina ${me.stamina.toFixed(1)}; ${heard("pray")} pray`);
      step(60 * tuning.potions.praySeconds);
      drawHud();
      row("at its end mana and stamina are full, the HUD says so, and the line is on the page", me.mana === 100 && me.stamina === me.maxStamina && !me.action && message() === mana.PRAYED && manaEl().querySelector(".hud-mana-text").textContent === "100 / 100", `mana ${me.mana}, stamina ${me.stamina}; "${message()}"`);
      G.teleport(stand[0] + 7, stand[1]);
      const far = G.verbs.run("pray", null, me, { prop: altar.id }, { timed: true });
      row("out of reach it is refused with why", !far.ok && /far/i.test(far.reason || ""), far.reason || "allowed");
      G.teleport(stand[0], stand[1]);
    }
    // The sync part carries mana, to the wire's two decimals.
    me.mana = 50;
    const s0 = G.game.syncParts().players;
    me.mana = 50.5;
    row("the players' sync part moves with mana", G.game.syncParts().players !== s0, "50 against 50.5");
    if (opts.keep) {
      const others = G.game.state.players.filter((p) => p !== me);
      for (const p of others) {
        keptBack.push({ id: p.id, main: p.hands.main, off: p.hands.off, gx: p.gx, gy: p.gy, mana: p.mana });
        p.hands.main = G.items.makeEntry("staff_of_fire", 1);
        p.hands.off = G.items.makeEntry("book_of_fire", 1);
        if (stand) { p.gx = stand[0]; p.gy = stand[1]; p.auto = null; }
        p.mana = 10;
      }
      kept = others.length && stand ? { players: others.map((p) => p.id), altar: altar.id } : null;
      row("kept for the guest: every other player beside the altar with the staff and the book in hand and 10 mana; `{ stop: true }` puts them back", !!kept, kept ? JSON.stringify(kept) : "no other player, or no altar");
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    card.hide();
    A.cancel();
    A.setAim(null);
    me.hands.main = saved.main;
    me.hands.off = saved.off;
    if (!opts.keep) G.teleport(saved.gx, saved.gy); // a keep run stays by the altar, so the guest's chunks stay the host's ring
    me.mana = saved.mana;
    me.stamina = saved.stamina;
    me.winded = saved.winded;
    me.manaFlash = 0;
    me.aimOverride = saved.aim;
    G.rules.set({ zombieAggro: saved.aggro });
    G.settings.set("soundOn", soundOn0);
    drawHud();
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  return done(kept);
}
