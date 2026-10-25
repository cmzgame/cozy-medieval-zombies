// Herbs, clay, and salt (docs/46 step 2, #448). From the console, on a tab with `?nosave` (the valley):
//   await __game.check("herbs")
// Each herb kind stands to its count on its ground (the mana herb by water, nightshade and wolfsbane near trees, the graveyard's inside its
// wall), clay banks by the river, salt rocks in the ore area; every node is a gatherable whose sheet is hard-pixelled and outlined all the way
// round, the herbs and mushrooms walked through and the bank and the salt rock solid; every new item has its icon made at boot from its
// design (an herb's the very pixels of its node), registered as its picture on the floor, and its card on the page over the bag says its full
// name and its kind and no use that is not built (every card's text is in the row's detail, for reading); an herb is gathered by the menu's
// label a guest sends, after its bar, to the bag, the node gone and a debt owed; a mushroom foraged; the graveyard's refused and greyed by
// day and gathered at night; clay dug only with a shovel carried; salt mined with a pickaxe; past their days each comes back elsewhere in its
// area (salt rising, the graveyard's only at night), its chunk marked. The world is put back from its own save at the end (run it solo).
//
// Two tabs (`?nosave&relay=none`): on the host `await __game.check("herbs", { keep: true })` skips the world's restore, stands every other
// player beside a nettle, grows a sage elsewhere, and returns `kept`; on the guest `await __game.check("herbs", { guest: <kept> })` reads the
// grown sage on the replica (arrived in its touched chunk), offers Gather nettle on the replica's menu, sends that label to the host and
// waits for the nettle in its own bag and the node gone from its replica, and reads the nettle's card; then `await __game.check("sync")`.

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const resources = await import("/src/resources.js");
  const info = await import("/src/item-info.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const art = await import("/src/gather-art.js");
  const RES = G.tuning.resources;
  const HERBS = ["sage", "nettle", "feverfew", "yarrow", "woad", "madder", "weld", "mana_herb", "nightshade", "wolfsbane", "grave_moss"];
  const ITEMS = [...HERBS, "mushroom", "clay", "salt"];
  const KIND = { woad: "Dye plant", madder: "Dye plant", weld: "Dye plant", mushroom: "Mushroom", clay: "Material", salt: "Material" };
  const me = G.player;
  const cardText = (id) => info.textOf(info.cardFor(G.items.makeEntry(id))).join(" | ");
  let kept = null;
  const done = () => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, kept };
  };

  // ---- a guest's side: the sage the host grew, and a nettle gathered through the host by the menu's label ----
  if (opts.guest) {
    const k = opts.guest;
    const wasPaused = G.loop.isPaused();
    G.loop.setPaused(true);
    try {
      const grown = G.map.propById(k.grown.id);
      row("on the guest the sage the host grew is there by its id, at the host's tile, arrived in its touched chunk", !!grown && grown.sprite === k.grown.sprite && grown.tile[0] === k.grown.tile[0] && grown.tile[1] === k.grown.tile[1] && G.map.tileAt(k.grown.tile[0], k.grown.tile[1]).prop === grown, grown ? `${grown.id} at ${grown.tile}` : `no prop ${k.grown.id}`);
      const node = G.map.propById(k.node.id);
      const labels = node ? G.interact.actionsForTarget({ kind: "prop", id: node.id }, me).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}`) : [];
      row("on the guest the replica's nettle beside me offers Gather nettle", labels.includes("Gather nettle"), labels.join(", ") || "no node");
      const bagNow = () => G.inventory.bagOf(me);
      const nettles = () => (bagNow() ? bagNow().items.filter((e) => e.id === "nettle").length : 0);
      const n0 = nettles();
      G.net.sendAct({ kind: "prop", id: k.node.id }, "Gather nettle");
      const t0 = performance.now();
      let last = t0;
      while (!(nettles() > n0 && !G.map.propById(k.node.id)) && performance.now() - t0 < 15000) {
        await yieldOnce();
        if (performance.now() - last >= 1000 / 60) { last = performance.now(); G.loop.advance(1 / 60); }
      }
      row("the label goes to the host, which runs the bar and the verb: the nettle in my bag on the replica and the node gone from it", nettles() === n0 + 1 && !G.map.propById(k.node.id) && !G.map.tileAt(k.node.tile[0], k.node.tile[1]).prop, `${n0} -> ${nettles()} nettles, node ${G.map.propById(k.node.id) ? "still there" : "gone"}, ${Math.round(performance.now() - t0)} ms`);
      row("on the guest the nettle's card says its name and kind", /^Nettle \| Herb/.test(cardText("nettle")), cardText("nettle"));
    } catch (e) {
      rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
    } finally {
      G.loop.setPaused(wasPaused);
    }
    return done();
  }

  const keep = !!opts.keep;
  const wasPaused = G.loop.isPaused();
  const clean = keep ? null : G.save.snapshot("check");
  const meAt = [me.gx, me.gy];
  const bag = G.inventory.bagOf(me);
  const bag0 = bag ? bag.items.slice() : [];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const clock0 = G.clock.getElapsed();
  const screen0 = G.screens.currentScreen();
  const was = { bag: panel.isBagOpen() };
  const json = await (await fetch("/data/maps/valley.json", { cache: "no-store" })).json();
  const kindOf = (n) => G.map.resourceKind(n);
  const nodesOf = (k) => G.map.allProps().filter((p) => k.sprites[p.sprite] !== undefined && G.map.inResourceArea(k, p.tile[0], p.tile[1]));
  const count = (id) => (G.inventory.bagOf(me) ? G.inventory.bagOf(me).items.filter((e) => e.id === id).reduce((s, e) => s + e.count, 0) : 0);
  const labelsOf = (p) => G.interact.actionsForTarget({ kind: "prop", id: p.id }, me).map((a) => `${a.label}${a.enabled === false ? " [off]" : ""}`);
  const standBy = (p) => { G.map.ensureAround(p.tile[0], p.tile[1], 1); G.teleport(p.tile[0] + 0.9, p.tile[1] + 0.3); me.auto = null; G.loop.advance(1 / 60); };
  const finish = () => { for (let i = 0; i < 600 && me.action; i++) G.loop.advance(1 / 60); };
  try {
    G.loop.setPaused(true);
    if (!G.info || G.info.name !== json.name) throw new Error(`the valley's check, and this world is ${G.info && G.info.name}`);
    if (screen0) G.screens.hide();

    // ---- the areas, the counts, the ground ----
    const kinds = Object.fromEntries([...HERBS, "clay", "salt", "mushrooms"].map((n) => [n, kindOf(n)]));
    const split = HERBS.map((n) => `${n} ${kinds[n] ? kinds[n].count : "?"}`).join(", ");
    const total = HERBS.reduce((s, n) => s + (kinds[n] ? kinds[n].count : 0), 0);
    row("the herbs are 120 in all, split by kind as the map's resources block has it (docs/42's lever); clay 8, salt 4", total === 120 && kinds.clay && kinds.clay.count === 8 && kinds.salt && kinds.salt.count === 4, `${split}; clay ${kinds.clay && kinds.clay.count}, salt ${kinds.salt && kinds.salt.count}`);
    const short = [...HERBS, "clay", "salt"].filter((n) => G.map.resourceCensus(kinds[n]) + resources.owed(n).length !== kinds[n].count);
    row("each kind's nodes standing and owed are its count", short.length === 0, short.length ? short.map((n) => `${n} ${G.map.resourceCensus(kinds[n])}+${resources.owed(n).length}/${kinds[n].count}`).join(", ") : "all");
    const wet = nodesOf(kinds.mana_herb).every((p) => G.map.waterNear(p.tile[0], p.tile[1], 2));
    const river = nodesOf(kinds.clay).every((p) => G.map.waterNear(p.tile[0], p.tile[1], 2, "river"));
    const gy = json.resources.grave_moss.rects[0];
    const inYard = nodesOf(kinds.grave_moss).every((p) => p.tile[0] >= gy[0] && p.tile[1] >= gy[1] && p.tile[0] < gy[0] + gy[2] && p.tile[1] < gy[1] + gy[3]);
    const ore = kindOf("ore");
    const salty = nodesOf(kinds.salt).every((p) => G.map.inResourceArea(ore, p.tile[0], p.tile[1]));
    row("each on its ground: the mana herb within two tiles of water, clay banks of the river, the graveyard's inside its wall, salt in the ore area", wet && river && inYard && salty, `mana ${wet}, clay ${river}, graveyard ${inYard}, salt ${salty}`);

    // ---- the art: the nodes' sheets, the items' icons ----
    const sheetPixels = (sheet) => {
      const f = sheet.frames.idle_0;
      const c = document.createElement("canvas");
      c.width = f[2];
      c.height = f[3];
      const ctx = c.getContext("2d");
      ctx.drawImage(sheet.image, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
      return ctx.getImageData(0, 0, f[2], f[3]);
    };
    const outlinedHard = (img) => {
      const { width: w, height: h, data } = img;
      let soft = 0;
      let bare = 0;
      const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]);
      const out = parseInt(art.OUTLINE.slice(1), 16);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const al = a(x, y);
        if (al !== 0 && al !== 255) soft++;
        if (al !== 255) continue;
        const edge = !a(x + 1, y) || !a(x - 1, y) || !a(x, y + 1) || !a(x, y - 1);
        const i = (y * w + x) * 4;
        if (edge && ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) !== out) bare++;
      }
      return { soft, bare };
    };
    const nodeSprites = ["clay_bank", "salt_rock", ...HERBS.map((n) => `herb_${n}`)];
    const badSheets = [];
    for (const sid of nodeSprites) {
      const def = G.assets.getDef(sid);
      const sheet = G.assets.getSheet(sid);
      const r = outlinedHard(sheetPixels(sheet));
      if (!def.interactable || !sheet.image || r.soft || r.bare) badSheets.push(`${sid}: interactable ${!!def.interactable}, ${r.soft} soft, ${r.bare} edge pixels not the outline`);
    }
    row("every node's sheet is generated from its design, a gatherable, hard-pixelled, with the dark outline all the way round", badSheets.length === 0, badSheets.join("; ") || `${nodeSprites.length} sheets`);
    for (const sid of ["mushroom_0", "clay_bank", "salt_rock", "herb_sage"]) {
      const p = nodesOf(G.map.resourceKindOf(sid))[0];
      if (p) row(`a ${sid.replace(/_\d$/, "")} is ${sid === "clay_bank" || sid === "salt_rock" ? "solid (walked round, swayed by a click)" : "walked through (swayed by a body, the law's non-solid gatherable)"}`, p.interactable && p.solid === (sid === "clay_bank" || sid === "salt_rock"), `${p.id}: interactable ${p.interactable}, solid ${p.solid}`);
    }
    const badIcons = [];
    for (const id of ITEMS) {
      const def = G.items.getItem(id);
      let sheet = null;
      try { sheet = G.assets.getSheet(`icon_${id}`); } catch { sheet = null; }
      if (!def.icon || !/^data:image\/png/.test(def.icon.src || "") || !sheet || sheet.image.width !== 19 || sheet.image.height !== 19) { badIcons.push(`${id}: src ${def.icon && def.icon.src ? def.icon.src.slice(0, 15) : "none"}, sheet ${sheet ? `${sheet.image.width}x${sheet.image.height}` : "none"}`); continue; }
      const r = outlinedHard(sheetPixels(sheet));
      if (r.soft || r.bare) badIcons.push(`${id}: ${r.soft} soft, ${r.bare} not outlined`);
      if (HERBS.includes(id)) {
        // The herb's icon is its node's picture, pixel for pixel, centred.
        const n = sheetPixels(G.assets.getSheet(`herb_${id}`));
        const ic = sheetPixels(sheet);
        const ox = Math.floor((19 - n.width) / 2);
        const oy = Math.floor((19 - n.height) / 2);
        let diff = 0;
        for (let y = 0; y < n.height; y++) for (let x = 0; x < n.width; x++) for (let c = 0; c < 4; c++) if (n.data[(y * n.width + x) * 4 + c] !== ic.data[((y + oy) * 19 + x + ox) * 4 + c]) diff++;
        if (diff) badIcons.push(`${id}: icon differs from its node by ${diff} values`);
      }
    }
    row("every new item's icon is made at boot from its design (an herb's its node's own pixels), 19 by 19, outlined, and registered as its picture on the floor", badIcons.length === 0, badIcons.join("; ") || `${ITEMS.length} icons`);

    // ---- the cards on the page, over the bag ----
    for (const e of [...bag.items]) bag.items.splice(bag.items.indexOf(e), 1);
    for (const id of ITEMS) G.inventory.stow(me, G.items.makeEntry(id, 1));
    panel.setBagOpen(true);
    panel.renderInventoryPanel(me, bag, null, G.inventory.beltOf(me));
    const { hoverCard: T } = await import("/src/tuning.js");
    const cardEl = () => document.getElementById("hover-card");
    const read = [];
    const wrong = [];
    for (const id of ITEMS) {
      const i = bag.items.findIndex((e) => e.id === id);
      const el = document.querySelector(`.inv-item[data-bag="inv"][data-index="${i}"]`);
      if (!el) { wrong.push(`${id}: not in the bag`); continue; }
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
      await wait(T.delayMs + 60);
      const c = cardEl();
      const text = c && !c.hidden ? c.textContent.replace(/\s+/g, " ").trim() : "(no card)";
      read.push(`${id}: ${text}`);
      const name = G.items.getItem(id).name;
      const kind = KIND[id] || "Herb";
      const img = el.querySelector("img.inv-icon");
      if (!text.startsWith(name) || !text.includes(kind) || /Use|Eat|Goes into|Made at/.test(text) || !img || !/^data:image\/png/.test(img.getAttribute("src"))) wrong.push(`${id}: "${text}", icon ${img ? "drawn" : "none"}`);
    }
    (await import("/src/ui/hover-card.js")).hide();
    row("over the bag each new item shows its icon and its card: its full name and its kind, and no use that is not built", wrong.length === 0, wrong.length ? wrong.join("; ") : read.join(" || "));
    panel.setBagOpen(was.bag);
    for (const e of [...bag.items]) bag.items.splice(bag.items.indexOf(e), 1);

    // ---- gathering ----
    G.clock.setHour(12);
    const nettle = nodesOf(kinds.nettle)[0];
    standBy(nettle);
    const nLabels = labelsOf(nettle);
    const ran = G.interact.performByLabel(me, { kind: "prop", id: nettle.id }, "Gather nettle");
    const timed = !!me.action && me.action.action.duration === G.assets.getDef(nettle.sprite).gather.seconds;
    finish();
    row("an herb is gathered by the menu's label a guest sends, after its bar: the herb in the bag, the node gone, its debt owed", nLabels.includes("Gather nettle") && ran && timed && count("nettle") === 1 && !G.map.propById(nettle.id) && resources.owed("nettle").length >= 1, `menu ${nLabels.join(", ")}; bar ${timed}; ${count("nettle")} nettle; owed ${resources.owed("nettle").length}`);
    const [ncx, ncy] = G.map.chunkCoord(nettle.tile[0], nettle.tile[1]);
    const nch = G.map.getChunk(ncx, ncy, false);
    row("its chunk is marked for the wire and its saved copy dropped", !!nch && nch.dirty === true && nch.saved === null, nch ? `dirty ${nch.dirty}, saved ${nch.saved === null ? "dropped" : "kept"}` : "no chunk");
    const shroom = nodesOf(kinds.mushrooms)[0];
    standBy(shroom);
    G.interact.performByLabel(me, { kind: "prop", id: shroom.id }, "Forage mushroom");
    finish();
    row("a mushroom is foraged by its label (Herbalism 3, open to all): a mushroom in the bag, a debt on the mushrooms' record", count("mushroom") === 1 && !G.map.propById(shroom.id), `${count("mushroom")} mushroom; menu ${labelsOf(shroom).join(", ") || "(gone)"}`);
    const moss = nodesOf(kinds.grave_moss)[0];
    standBy(moss);
    const byDay = G.verbs.run("gather", G.world, me, { prop: moss.id });
    const dayLabels = labelsOf(moss);
    G.clock.setHour(1);
    const nightLabels = labelsOf(moss);
    const byNight = G.verbs.run("gather", G.world, me, { prop: moss.id });
    row("the graveyard's grave moss is refused and greyed by day, and gathered at night", !byDay.ok && dayLabels.includes("Gather grave moss (only at night) [off]") && nightLabels.includes("Gather grave moss") && byNight.ok && count("grave_moss") === 1, `day: ${byDay.reason}, ${dayLabels.join(", ")}; night: ${nightLabels.join(", ")}, ${byNight.ok}`);
    G.clock.setHour(12);
    const bank = nodesOf(kinds.clay)[0];
    standBy(bank);
    const noShovel = G.verbs.run("dig", G.world, me, { prop: bank.id });
    const greyed = labelsOf(bank);
    G.inventory.stow(me, G.items.makeEntry("shovel", 1));
    G.interact.performByLabel(me, { kind: "prop", id: bank.id }, "Dig clay");
    finish();
    row("a clay bank needs a shovel carried (refused and greyed without), and is dug by its label for clay", !noShovel.ok && noShovel.reason === "You need a shovel." && greyed.includes("Dig clay (need a shovel) [off]") && count("clay") >= 1 && !G.map.propById(bank.id), `${noShovel.reason}; ${greyed.join(", ")}; ${count("clay")} clay`);
    const salt = nodesOf(kinds.salt)[0];
    standBy(salt);
    me.hands.main = null;
    me.hands.off = null;
    const saltLabels = labelsOf(salt);
    me.hands.main = G.items.makeEntry("pickaxe", 1);
    G.interact.performByLabel(me, { kind: "prop", id: salt.id }, "Mine salt");
    finish();
    me.hands.main = hands0.main;
    row("a salt rock is mined with a pickaxe in hand (Mine salt) for salt, and goes", saltLabels.includes("Mine salt (need a pickaxe) [off]") && count("salt") >= 1 && !G.map.propById(salt.id), `${saltLabels.join(", ")}; ${count("salt")} salt`);

    // ---- the comeback ----
    const ids0 = new Set(G.map.allProps().map((p) => p.id));
    const taken = { nettle: nettle.tile, clay: bank.tile, salt: salt.tile, grave_moss: moss.tile };
    const due = Math.max(...Object.keys(taken).flatMap((n) => resources.owed(n).map((d) => d.due)));
    G.clock.setElapsed(Math.ceil(due / G.clock.DAY_LENGTH) * G.clock.DAY_LENGTH + G.clock.DAY_LENGTH / 2); // noon, the day after the last falls due
    const byDayKinds = ["nettle", "clay", "salt"];
    let looks = 0;
    for (; looks < 30 && byDayKinds.some((n) => resources.owed(n).length); looks++) { G.game.begin(0); G.clock.setElapsed(G.clock.getElapsed() + RES.checkSeconds); }
    const grownOf = (n) => G.map.allProps().find((p) => !ids0.has(p.id) && kinds[n].sprites[p.sprite] !== undefined && G.map.inResourceArea(kinds[n], p.tile[0], p.tile[1]));
    const back = byDayKinds.map((n) => [n, grownOf(n)]);
    row("past their days a nettle, a clay bank, and a salt rock stand at new spots in their areas, each where the rule allows", back.every(([n, p]) => p && (p.tile[0] !== taken[n][0] || p.tile[1] !== taken[n][1])), back.map(([n, p]) => `${n} ${p ? p.tile.join(",") : "none"}`).join("; ") + ` after ${looks} looks`);
    const salt2 = grownOf("salt");
    const clay2 = grownOf("clay");
    row("the salt rock rose (its stamp on the sim clock), the herb simply appeared, the clay bank stands by the river", !!salt2 && Number.isFinite(salt2.risenAt) && grownOf("nettle") && grownOf("nettle").risenAt === undefined && !!clay2 && G.map.waterNear(clay2.tile[0], clay2.tile[1], 2, "river"), `salt risenAt ${salt2 && salt2.risenAt}, clay at ${clay2 && clay2.tile}`);
    const mossOwedByDay = resources.owed("grave_moss").length;
    G.clock.setHour(23.5);
    for (let i = 0; i < 12 && resources.owed("grave_moss").length; i++) { G.game.begin(0); G.clock.setElapsed(G.clock.getElapsed() + RES.checkSeconds); }
    row("the graveyard's waits for night to come back, and comes back at night inside the wall", mossOwedByDay === 1 && !resources.owed("grave_moss").length && !!grownOf("grave_moss"), `owed by day ${mossOwedByDay}, at night ${resources.owed("grave_moss").length}; ${grownOf("grave_moss") ? grownOf("grave_moss").tile : "none"}`);

    // ---- two tabs: a nettle beside every other player, and a sage grown for the guest to read ----
    if (keep) {
      const nettle2 = nodesOf(kinds.nettle).find((p) => p.id !== nettle.id);
      const sage = resources.grow(kinds.sage, []);
      for (const p of G.game.state.players) {
        if (p === me || !nettle2) continue;
        G.map.ensureAround(nettle2.tile[0], nettle2.tile[1], 1);
        p.gx = nettle2.tile[0] + 0.9;
        p.gy = nettle2.tile[1] + 0.3;
        p.auto = null;
      }
      if (nettle2 && sage) kept = { node: { id: nettle2.id, tile: [...nettle2.tile] }, grown: { id: sage.id, sprite: sage.sprite, tile: [...sage.tile] } };
      row("kept for the guest: a nettle beside every other player and a sage grown", !!kept, kept ? JSON.stringify(kept) : "none");
    }
  } catch (e) {
    rows.push({ check: "ran to the end", result: "FAIL", detail: e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e) });
  } finally {
    (await import("/src/ui/hover-card.js")).hide();
    panel.setBagOpen(was.bag);
    me.action = null;
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    if (keep) {
      if (bag) bag.items.splice(0, bag.items.length, ...bag0);
      G.clock.setElapsed(clock0);
      G.teleport(meAt[0], meAt[1]);
    } else {
      try { await G.restoreWorld(clean); } catch (e) { rows.push({ check: "put back", result: "FAIL", detail: e.message }); }
    }
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  return done();
}
