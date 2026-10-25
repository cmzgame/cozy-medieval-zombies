// The dye vat's picker (docs/43 section 8, #412). From the console, on a tab with `?nosave` (the valley):
//   await __game.check("dye")                 the host's half: the vats, the picker on the page, Apply, the world's figure
//   await __game.check("dye", { keep: true })  the same, leaving the host's tunic woad and every other player beside the vat, for a guest's half
// On a guest (two tabs, `?nosave&relay=none`, joined by `__game.net.open({ join })`), after the host ran it with `keep` and with the host's tab
// left running (unpaused: it answers in real time on the wire's background driver):
//   await __game.check("dye")                 the replica shows the host's woad tunic; the guest's own picker opens on its replica, and its Apply
//                                             (a command by the vat's id, the entry's uid, and the colours) comes back as its own tunic in madder
// Then `check("sync")` on the host. The verb's refusals, the save, and the guest's command on the host are `node tools/check.js`'s
// ("dye vat"); the painted recolouring by key tones is `check("layers")`'.
// The host's half: the three vats in the weaver's yard each offer "Use the dye vat"; it opens the picker (#dye) on the page, inside the
// window, with the garments the player could dye (the worn tunic first) and a swatch row per region; a swatch changes the turning figure
// and Undyed puts it back; Apply dyes the tunic and is then greyed; the world's figure is rebaked in the colour; a two-region item with
// schemes shows a Scheme row and takes one; Escape's close and walking away shut it. The player, its worn things, its bag, and the
// loop are put back.

const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
// A guest waits on the host's answer in real time (the host's tab runs on the wire's background driver, docs/testing.md): a step of its
// own each sixtieth of a second of the wall clock, yielding through a MessageChannel (a hidden tab's timers are throttled), up to `ms`.
async function stepUntil(G, cond, ms = 5000) {
  const t0 = performance.now();
  let last = t0;
  while (!cond() && performance.now() - t0 < ms) {
    await yieldOnce();
    if (performance.now() - last >= 1000 / 60) { last = performance.now(); G.loop.advance(1 / 60); }
  }
  return cond();
}

function hashCanvas(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const dyePanel = await import("/src/ui/dye-panel.js");
  const stationPanel = await import("/src/ui/station-panel.js");
  const info = await import("/src/item-info.js");
  const me = G.player;
  const role = G.net.status().role;
  const json = await (await fetch("/data/maps/valley.json")).json();
  const wea = (json.sets || []).find((s) => s.name === "the weaver");
  const vatTiles = wea ? wea.props.filter((p) => p.sprite === "dyevat").map((p) => [wea.rect[0] + p.tile[0], wea.rect[1] + p.tile[1]]) : [];
  const vatAt = ([x, y]) => { const t = G.map.peekTile(x, y); return t && t.prop && t.prop.sprite === "dyevat" ? t.prop : null; };
  const root = () => document.getElementById("dye");
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  const pos0 = [me.gx, me.gy];
  const worn0 = { ...me.worn };
  const bag = G.inventory.bagOf(me);
  const bag0 = bag ? bag.items.slice() : [];
  let keep = false;
  try {
    G.loop.setPaused(true);
    if (screen0) G.screens.hide();
    if (role === "guest") {
      // The host's player on my replica wears the woad tunic the host dyed (its record's heavy part carried the entry's colours).
      const host = G.game.state.players.find((p) => p !== me);
      const theirs = host && host.worn.chest;
      row("on a guest the replica of the host's player wears the woad tunic the host dyed", !!theirs && Array.isArray(theirs.colours) && theirs.colours[0] === "#3e5e90", theirs ? JSON.stringify(theirs.colours || null) : "no host player or no tunic");
      // My own picker on my replica: Apply is a command, run on the host as my player.
      const vat = vatTiles.map(vatAt).find(Boolean);
      const mine = me.worn.chest;
      row("on a guest a vat is on the replica and my player stands within its reach (the host's keep run put it there)", !!vat && Math.hypot(me.gx - vat.tile[0], me.gy - vat.tile[1]) < 3, vat ? `${me.gx.toFixed(1)},${me.gy.toFixed(1)} to ${vat.tile}` : "no vat");
      if (vat && mine) {
        // The menu's label, as the guest's menu sends it: the host runs it as my player and tells me (host.js dyeOpened, the `opened` hook).
        G.net.sendAct({ kind: "prop", id: vat.id }, "Use the dye vat");
        await stepUntil(G, () => dyePanel.isOpen());
        row("on a guest Use the dye vat, run on the host, opens the picker on my replica", dyePanel.isOpen(), String(dyePanel.isOpen()));
        if (!dyePanel.isOpen()) dyePanel.openPanel(vat, me);
        dyePanel.update(me);
        const st = dyePanel.state();
        row("on a guest the picker lists my worn tunic first", !!st && st.uid === mine.uid, JSON.stringify(st));
        root().querySelector(`[data-region="0"][data-hex="#a63a2c"]`).click();
        dyePanel.update(me);
        root().querySelector("[data-apply]").click();
        const ok = await stepUntil(G, () => { const c = me.worn.chest; return !!c && Array.isArray(c.colours) && c.colours[0] === "#a63a2c"; });
        row("on a guest Apply goes to the host and comes back: my tunic in madder on my replica", ok, JSON.stringify(me.worn.chest && me.worn.chest.colours));
        dyePanel.close();
      }
      throw Object.assign(new Error("guest done"), { guestDone: true });
    }

    // The three vats.
    if (vatTiles[1]) G.map.ensureAround(vatTiles[1][0], vatTiles[1][1], 2);
    const vats = vatTiles.map(vatAt).filter(Boolean);
    const labels = vats.map((v) => G.interact.actionsForTarget({ kind: "prop", id: v.id }, me).map((a) => a.label));
    row("the weaver's yard has three dye vats, each a station offering Use the dye vat", vats.length === 3 && vats.every((v) => G.stations.stationOf(v).includes("dyevat")) && labels.every((l) => l.includes("Use the dye vat")), `${vats.length} vats; ${labels.map((l) => l.join("/")).join(" | ")}`);
    const vat = vats[1];
    if (!vat) throw new Error("no vat");
    let stand = null;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 1], [-1, 1], [0, 2]]) if (!stand && G.map.isWalkableTile(vat.tile[0] + dx, vat.tile[1] + dy)) stand = [vat.tile[0] + dx, vat.tile[1] + dy];
    G.teleport(stand[0], stand[1]);
    // A fresh tunic worn, undyed; a leather belt in the bag.
    me.worn.chest = G.items.makeEntry("tunic", 1);
    const tunic = me.worn.chest;
    const belt = G.items.makeEntry("good_belt", 1);
    G.inventory.stow(me, belt);

    // The picker, opened by the menu's label as the host's own player.
    G.interact.performByLabel(me, { kind: "prop", id: vat.id }, "Use the dye vat");
    dyePanel.update(me);
    const el = root();
    const r = el && el.getBoundingClientRect();
    const st = dyePanel.state();
    row("Use the dye vat opens the picker on the page, inside the window", dyePanel.isOpen() && !!el && !el.hidden && r.width > 0 && r.left >= 0 && r.right <= window.innerWidth && r.top >= 0, r ? `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}` : "no panel");
    row("it lists the garments I could dye, the worn tunic first, the bag's belt among them, and a Cloth row for the tunic", !!st && st.garments[0] === String(tunic.uid) && st.garments.includes(String(belt.uid)) && st.labels.join() === "Garment,Cloth,Colour" && st.applyDisabled, JSON.stringify(st));
    const swatches = el.querySelectorAll(`[data-region="0"]`).length;
    row("the cloth row is a broad palette: Undyed and sixteen dyes", swatches === 17, `${swatches} swatches`);
    const canvas = el.querySelector(".dy-preview");
    const undyed = hashCanvas(canvas);
    el.querySelector(`[data-region="0"][data-hex="#3e5e90"]`).click();
    dyePanel.update(me);
    const woadView = hashCanvas(canvas);
    row("a swatch changes the turning figure and the colour's name", woadView !== undyed && dyePanel.state().picks[0] === "#3e5e90" && el.querySelector(".dy-picked").textContent === "Woad blue", `${undyed} to ${woadView}; ${el.querySelector(".dy-picked").textContent}`);
    el.querySelector(`[data-region="0"][data-hex="#c9b98e"]`).click();
    dyePanel.update(me);
    row("Undyed puts the figure back", hashCanvas(canvas) === undyed && dyePanel.state().applyDisabled, hashCanvas(canvas));
    el.querySelector(`[data-region="0"][data-hex="#3e5e90"]`).click();
    dyePanel.update(me);
    row("Apply is offered for a new colour, and says it costs nothing", !dyePanel.state().applyDisabled && /Costs nothing/.test(el.querySelector(".dy-apply").textContent), el.querySelector(".dy-apply").textContent);
    const sheet0 = hashCanvas(G.assets.getSheet(me.sprite).image);
    el.querySelector("[data-apply]").click();
    dyePanel.update(me);
    row("Apply dyes the worn tunic woad, and Apply greys out", Array.isArray(tunic.colours) && tunic.colours[0] === "#3e5e90" && dyePanel.state().applyDisabled, JSON.stringify(tunic.colours));
    G.loop.advance(1 / 60);
    const sheet1 = hashCanvas(G.assets.getSheet(me.sprite).image);
    row("the world's figure is rebaked in the colour", sheet1 !== sheet0, `${sheet0} to ${sheet1}`);
    const card = info.textOf(info.cardFor(tunic));
    row("the tunic's card names its colour and what the vat can do", card.some((l) => l.includes("Woad blue")) && card.some((l) => l.includes("Can be dyed at a dye vat: 16 colours.")), card.join(" | "));
    // A two-region item with schemes.
    el.querySelector(`[data-uid="${belt.uid}"]`).click();
    dyePanel.update(me);
    const st2 = dyePanel.state();
    const schemes = el.querySelectorAll("[data-scheme]").length;
    row("the leather belt shows one Scheme row: Undyed and its six schemes", st2.uid === belt.uid && st2.labels.join() === "Garment,Scheme,Colour" && schemes === 7, `${st2.labels.join()}; ${schemes} schemes`);
    el.querySelector(`[data-scheme="#2a2428,#8c8c94"]`).click();
    dyePanel.update(me);
    el.querySelector("[data-apply]").click();
    row("a scheme applies whole: the belt black and iron", Array.isArray(belt.colours) && belt.colours.join() === "#2a2428,#8c8c94", JSON.stringify(belt.colours));
    // Closing: Escape's way (the station panel's close shuts the picker) and walking away.
    row("Escape's close shuts the picker", stationPanel.close() === true && !dyePanel.isOpen() && root().hidden, String(dyePanel.isOpen()));
    dyePanel.openPanel(vat, me);
    G.teleport(stand[0] + 8, stand[1]);
    stationPanel.update(me);
    row("walking out of reach shuts it", !dyePanel.isOpen(), String(dyePanel.isOpen()));
    if (opts.keep) {
      keep = true;
      G.teleport(stand[0], stand[1]);
      for (const p of G.game.state.players) if (p !== me) { p.gx = stand[0] + 1; p.gy = stand[1]; p.auto = null; }
    }
  } catch (e) {
    if (!e.guestDone) rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    dyePanel.close();
    if (role !== "guest" && !keep) {
      for (const slot of Object.keys(me.worn)) me.worn[slot] = worn0[slot] ?? null;
      if (bag) { bag.items.length = 0; for (const e of bag0) bag.items.push(e); }
      G.teleport(pos0[0], pos0[1]);
    }
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, fails: rows.filter((r) => r.result === "FAIL").length };
}
