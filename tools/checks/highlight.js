// Object Highlight (#301; src/highlight.js). From the console, on a tab with `?nosave`:
//   await __game.check("highlight")
// What a right-click would act on first is found under the cursor and nothing else: a tree, a chest, an item lying on the ground, a villager, and one of the world's crops are
// each found; bare grass, a decoration prop with no action, and a living zombie (the cursor's hand and the swing outline are its) are not; a target out of sight is not; the
// setting off, a mode, a cursor off the world, and something carried each make none; the answer is held while the mouse stands still. A mushroom a tile behind a tree, under
// its crown, is found at a covered point by the click (and swayed), Object Highlight, and the menu's first, while a crown point with nothing behind it and the trunk are still the
// tree (interact.interactableAt's one rule, bugs.md 2026-10-25). On a guest it reads the replica: the same
// tree, chest, crop, and bare grass. Everything the check makes is put back, and the setting restored, in the finally.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const hl = await import("/src/highlight.js");
  const rhl = await import("/src/render/highlight.js");
  const { tileKey } = await import("/src/visibility.js");
  const { objectHighlight: T } = await import("/src/tuning.js");
  const me = G.player;
  const role = G.net.status().role;
  const setting0 = G.settings.get("objectHighlight");
  const meAt = [me.gx, me.gy];
  const wasPaused = G.loop.isPaused();
  const made = [];
  const items = [];
  const moved = [];
  // The first target found at the tile's point, trying a few heights up the sprite (a tree's trunk, a chest's lid, a body's middle).
  const probe = (gx, gy, visible = null) => {
    for (const up of [4, 8, 12, 20, 30, 44]) {
      const s = G.iso.toScreen(gx, gy);
      const t = hl.targetAt(s.x, s.y - up, me, visible);
      if (t) return t;
    }
    return null;
  };
  const labelsOf = (prop) => G.interact.actionsForProp(prop, me).filter((a) => a.kind !== "walk").map((a) => a.label);
  try {
    G.loop.setPaused(true);
    row("the setting is a testing setting, on by default, and its colour and refresh are data", G.settings.REGISTRY.some((e) => e.key === "objectHighlight" && e.group === "testing") && G.settings.DEFAULTS.objectHighlight === true && /^#[0-9a-f]{6}$/i.test(T.color) && T.refreshMs > 0, `${T.color}, every ${T.refreshMs} ms`);
    G.map.ensureAround(me.gx, me.gy, 3);
    // A patch of bare grass: a row of six tiles with nothing on or round them.
    let at = null;
    for (let dy = -14; dy <= 14 && !at; dy++) for (let dx = -14; dx <= 14 && !at; dx++) {
      const x = Math.round(meAt[0]) + dx;
      const y = Math.round(meAt[1]) + dy;
      let ok = true;
      for (let ay = -1; ay <= 1 && ok; ay++) for (let ax = -1; ax <= 6 && ok; ax++) { const t = G.map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w && G.map.isWalkableTile(x + ax, y + ay) && !(t.items && t.items.length); }
      if (ok) at = [x, y];
    }
    if (!at) throw new Error("no bare grass for the check");
    const [x, y] = at;
    G.teleport(x - 0.9, y + 0.1);
    if (role !== "guest") {
      const put = (sprite, tx, ty) => { const p = G.map.createProp({ sprite, tile: [tx, ty] }); G.map.placeProp(p, tx, ty); made.push(p); return p; };
      const tree = put("tree_oak_m", x + 1, y);
      const chest = put("chest", x + 2, y);
      let decor = null;
      for (const sprite of ["headstone", "maypole", "marketcross", "noticeboard", "stocks", "haystack"]) {
        const p = G.map.createProp({ sprite, tile: [x + 5, y + 1] });
        if (labelsOf(p).length === 0) { G.map.placeProp(p, x + 5, y + 1); made.push(p); decor = p; break; }
      }
      const entry = G.items.makeEntry("log", 1);
      G.map.dropItem(x + 3, y, entry);
      items.push([x + 3, y, entry]);
      const v = S.villagers.find((q) => !q.dead);
      if (v) moved.push([v, v.gx, v.gy]); // brought in for its own row, after the props beside its place are tried
      const z = S.zombies.find((q) => !q.dead && !q.corpse);
      if (z) { moved.push([z, z.gx, z.gy]); z.gx = x + 6; z.gy = y; }
      const t1 = probe(x + 1, y);
      row("a tree is found (its menu offers a real action)", !!t1 && t1.kind === "prop" && t1.id === tree.id, JSON.stringify(t1) + " " + labelsOf(tree).join(", "));
      // The bare ground and leaf litter inside the tree's sprite rectangle, beside the trunk, are art, not the tree: the menu lists the tree there, the highlight does not.
      let litter = null;
      const ts = G.iso.toScreen(x + 1, y);
      for (let dy = -4; dy <= 12 && !litter; dy += 4) for (let dx = -44; dx <= 44 && !litter; dx += 4) {
        if (Math.abs(dx) < 10) continue;
        const sx = ts.x + dx;
        const sy = ts.y + dy;
        const onTile = G.iso.toGrid(sx, sy);
        if (Math.round(onTile.gx) === x + 1 && Math.round(onTile.gy) === y) continue;
        if (!G.interact.interactableAt(sx, sy, () => true) && G.interact.actionsAt(sx, sy, me).some((a) => a.target && a.target.kind === "prop" && a.target.id === tree.id)) litter = [sx, sy];
      }
      row("bare ground beside the trunk, inside the tree's sprite rectangle, is not the tree (though the menu lists it)", !!litter && hl.targetAt(litter[0], litter[1], me, null) === null, litter ? `at ${Math.round(litter[0] - ts.x)},${Math.round(litter[1] - ts.y)} from the trunk: ${JSON.stringify(hl.targetAt(litter[0], litter[1], me, null))}` : "no such point found");
      // The slice the player is seen through is not outlined (the hole would fill): the frame's decision, read from the drawable.
      const rprops = await import("/src/render/props.js");
      const all = [];
      rhl.set({ kind: "prop", id: tree.id });
      rprops.propDrawables([[x + 1, y]], new Set([tileKey(x + 1, y)]), all);
      const lit = all.find((o) => o.outlined);
      const slice = all.find((o) => o.key === (x + 1 + y) * 1000 + 1);
      const before = lit ? lit.outlined.length : -1;
      if (slice) slice.occluder = true;
      const after = lit ? lit.outlined.length : -1;
      rhl.set(null);
      row("the slice that is the see-through occluder this frame is not outlined", before === 1 && after === 0, `${before} slices outlined, ${after} once it is the occluder`);
      const mush = G.map.createProp({ sprite: "mushroom_0", tile: [x + 6, y + 1] });
      G.map.placeProp(mush, x + 6, y + 1);
      made.push(mush);
      const tm = probe(x + 6, y + 1);
      row("a mushroom (interactable, sways on a click) is found", !!mush.interactable && !!tm && tm.kind === "prop" && tm.id === mush.id, `${JSON.stringify(tm)} interactable ${!!mush.interactable}`);
      const t2 = probe(x + 2, y);
      row("a chest is found", !!t2 && t2.kind === "prop" && t2.id === chest.id, JSON.stringify(t2) + " " + labelsOf(chest).join(", "));
      const t3 = probe(x + 3, y);
      row("an item lying on the ground is found, by its uid", !!t3 && t3.kind === "item" && t3.uid === entry.uid, JSON.stringify(t3));
      row("bare grass is not", probe(x + 5, y - 1) === null, JSON.stringify(probe(x + 5, y - 1)));
      const td = decor ? probe(x + 5, y + 1) : "none";
      row("a decoration prop with no action is not (only art)", !!decor && td === null, decor ? `${decor.sprite}: ${JSON.stringify(td)}` : "no decoration sprite without an action was found");
      const tz = z ? probe(x + 6, y) : null;
      row("a living zombie is left to the cursor's hand and the swing outline", !!z && tz === null, z ? JSON.stringify(tz) : "no zombie");
      if (v) { v.gx = x + 4; v.gy = y; }
      const t4 = v ? probe(x + 4, y) : null;
      row("a villager is found", !!v && !!t4 && t4.kind === "character" && t4.id === v.id, v ? JSON.stringify(t4) : "no villager");
      if (v) { v.gx = moved.find((m) => m[0] === v)[1]; v.gy = moved.find((m) => m[0] === v)[2]; }
      row("a target out of my sight is not found", probe(x + 1, y, new Set()) === null && probe(x + 1, y, new Set([tileKey(x + 1, y)])) !== null, "the tree, with no tiles seen and with its own");
      // The crop, one of the world's own.
      const crop = [...G.map.allProps()].filter((q) => q.crop && labelsOf(q).length > 0).sort((a, b) => Math.hypot(a.tile[0] - me.gx, a.tile[1] - me.gy) - Math.hypot(b.tile[0] - me.gx, b.tile[1] - me.gy))[0];
      if (crop) {
        G.teleport(crop.tile[0] - 0.9, crop.tile[1] + 0.1);
        G.map.ensureAround(me.gx, me.gy, 3);
        const tc = probe(crop.tile[0], crop.tile[1]);
        row("a crop is found", !!tc && tc.kind === "prop" && tc.id === crop.id, `${crop.sprite}: ${JSON.stringify(tc)} (${labelsOf(crop).join(", ")})`);
        G.teleport(x - 0.9, y + 0.1);
      } else row("a crop is found", false, "no crop with an action in the world");
      // update(): the setting, the modes, the cursor, the cache.
      const s = G.iso.toScreen(x + 1, y);
      const mouse = { x: s.x, y: s.y - 12, inside: true };
      const args = { enabled: true, blocked: false, mouse, player: me, visible: null, now: 1e6 };
      const on = hl.update(args);
      row("update finds the tree under the mouse", !!on && on.kind === "prop" && on.id === tree.id, JSON.stringify(on));
      row("the answer is held while the mouse and the camera stand still, and asked again after the refresh", hl.update({ ...args, now: 1e6 + 10 }) === on && hl.update({ ...args, now: 1e6 + T.refreshMs + 1 }) !== on, "the same object, then a fresh one");
      row("the setting off, a mode (placement, Use), a cursor off the world, and a carried thing each make none", hl.update({ ...args, enabled: false, now: 2e6 }) === null && hl.update({ ...args, blocked: true, now: 2.1e6 }) === null && hl.update({ ...args, mouse: { ...mouse, inside: false }, now: 2.2e6 }) === null && (() => { me.carrying = {}; const r = hl.update({ ...args, now: 2.3e6 }); me.carrying = null; return r === null; })(), "off, blocked, outside, carrying");
      hl.clear();
      rhl.set(hl.targetAt(s.x, s.y - 12, me, null));
      row("the drawing knows its target: isProp, isItem, isCharacter", rhl.isProp(tree.id) && !rhl.isProp(chest.id) && !rhl.isItem("x") && !rhl.isCharacter("x"), "the tree and nothing else");
      rhl.set(null);
      // A gatherable behind a tree's crown (bugs.md, 2026-10-25): a mushroom a tile behind the tree, straight up the screen into its crown. The
      // covered points are the mushroom's own solid pixels where the frontmost hit is the tree's crown (interact.hitsAt, frontmost first).
      // Canvas points move with the camera, and a render can move it (an await lets the page draw, and loop.advance renders), so one step is
      // taken first (the sim clock past 0 too: a stamp at sim 0 reads as none, `!prop.pokedAt`), then every point is read fresh and every row
      // that reads one runs before the next render; the click's lean, which steps the loop, is last.
      const hid = G.map.createProp({ sprite: "mushroom_0", tile: [x, y - 1] });
      G.map.placeProp(hid, x, y - 1);
      made.push(hid);
      G.teleport(x - 0.9, y + 0.1);
      G.loop.advance(1 / 60);
      const tf = G.iso.toScreen(x + 1, y); // the tree's foot, read now
      const covered = [];
      const hr = G.placement.propRect(hid, x, y - 1);
      for (let py = 0; py < hr.h; py++) for (let px = 0; px < hr.w; px++) {
        const sx = hr.x + px + 0.5;
        const sy = hr.y + py + 0.5;
        const hits = G.interact.hitsAt(sx, sy, () => true);
        const behind = hits.find((h) => !h.crown); // the first thing behind the crown that is not a crown: the one that may win
        if (hits.length >= 2 && hits[0].prop === tree && hits[0].crown && behind && behind.prop === hid) covered.push([sx, sy]);
      }
      row("a mushroom a tile behind a tree has points its crown covers (the frontmost pixel there is the crown, not the trunk)", covered.length > 0, `${covered.length} covered points of the mushroom's`);
      // A crown pixel with nothing small behind it is still the tree; so is its trunk.
      let bare = null;
      for (let up = 40; up <= 130 && !bare; up += 2) for (const side of [0, -16, 16, -30, 30]) {
        const hits = G.interact.hitsAt(tf.x + side, tf.y - up, () => true);
        if (hits.length === 1 && hits[0].prop === tree && hits[0].crown) { bare = [tf.x + side, tf.y - up]; break; }
      }
      const tBare = bare ? hl.targetAt(bare[0], bare[1], me, null) : null;
      const firstBare = bare ? G.interact.menuActions(bare[0], bare[1], me, G.interact.interactableAt(bare[0], bare[1])).find((a) => a.target && a.target.kind === "prop") : null;
      row("a crown pixel with nothing behind it still names the tree: the click, Object Highlight, and the menu's first", !!bare && G.interact.interactableAt(bare[0], bare[1]) === tree && !!tBare && tBare.id === tree.id && !!firstBare && firstBare.target.id === tree.id, bare ? `at ${Math.round(bare[0] - tf.x)},${Math.round(bare[1] - tf.y)}: ${JSON.stringify(tBare)}, menu first ${firstBare && firstBare.label}` : "no bare crown point found");
      const foot = G.interact.hitsAt(tf.x, tf.y - 8, () => true);
      row("the trunk is the trunk (not the crown) and names the tree", foot.length > 0 && foot[0].prop === tree && foot[0].crown === false && G.interact.interactableAt(tf.x, tf.y - 8) === tree, JSON.stringify(foot.map((h) => [h.prop.sprite, h.crown])));
      if (covered.length) {
        const [cx, cy] = covered[Math.floor(covered.length / 2)];
        const where = `at ${Math.round(cx - tf.x)},${Math.round(cy - tf.y)} from the tree's foot`;
        const byClick = G.interact.interactableAt(cx, cy);
        const byAny = G.interact.interactableAt(cx, cy, () => true);
        row("there the pixel hit names the mushroom, not the crown (the click's and Use mode's test alike)", byClick === hid && byAny === hid, `${where}: ${byClick && byClick.sprite}, ${byAny && byAny.sprite}`);
        const tHid = hl.targetAt(cx, cy, me, null);
        row("there Object Highlight's target is the mushroom", !!tHid && tHid.kind === "prop" && tHid.id === hid.id, JSON.stringify(tHid));
        const menuThere = G.interact.menuActions(cx, cy, me, G.interact.interactableAt(cx, cy));
        const firstProp = menuThere.find((a) => a.target && a.target.kind === "prop");
        row("there the right-click menu's first target is the mushroom (its Forage), addressed by its id for a guest", !!firstProp && firstProp.target.id === hid.id, menuThere.map((a) => `${a.label} -> ${a.target ? a.target.id || a.target.kind : "none"}`).join(", "));
        hid.pokedAt = undefined;
        const sim0 = G.loop.simTime() * 1000;
        const poked = G.interact.pokeAt(cx, cy, me);
        const stampedAt = hid.pokedAt;
        let lean = 0;
        for (let i = 0; i < 12; i++) { G.loop.advance(1 / 60); lean = Math.max(lean, Math.abs(rprops.swayOf(hid, 22))); }
        row("a click there sways the mushroom (its stamp on the sim clock, the renderer leaning it), and the tree is not stamped", poked === hid && stampedAt > 0 && Math.abs(stampedAt - sim0) < 100 && lean > 0 && !Number.isFinite(tree.pokedAt), `poked ${poked && poked.sprite}, pokedAt ${stampedAt} at sim ${Math.round(sim0)}, max lean ${lean} px, tree pokedAt ${tree.pokedAt}`);
        hid.pokedAt = undefined;
      }
    } else {
      // A guest: the replica's own tree, chest, crop, and bare grass.
      const near = (pred) => [...G.map.allProps()].filter(pred).sort((a, b) => Math.hypot(a.tile[0] - me.gx, a.tile[1] - me.gy) - Math.hypot(b.tile[0] - me.gx, b.tile[1] - me.gy))[0];
      for (const [name, pred] of [["a tree", (q) => q.wood && labelsOf(q).length > 0], ["a chest", (q) => q.container && labelsOf(q).length > 0], ["a crop", (q) => q.crop && labelsOf(q).length > 0]]) {
        const p = near(pred);
        if (!p) { row(`on a guest ${name} is found`, false, "none in the replica"); continue; }
        G.teleport(p.tile[0] - 0.9, p.tile[1] + 0.1);
        G.map.ensureAround(me.gx, me.gy, 3);
        const t = probe(p.tile[0], p.tile[1]);
        row(`on a guest ${name} is found`, !!t && t.kind === "prop" && t.id === p.id, `${p.sprite}: ${JSON.stringify(t)}`);
      }
      G.teleport(x - 0.9, y + 0.1);
      row("on a guest bare grass is not", probe(x + 3, y - 1) === null, JSON.stringify(probe(x + 3, y - 1)));
    }
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    G.settings.set("objectHighlight", setting0 === undefined ? true : setting0);
    hl.clear();
    rhl.set(null);
    if (role !== "guest") {
      for (const [ax, ay, entry] of items) G.map.takeItem(ax, ay, entry);
      for (const p of made) { const t = G.map.propById(p.id); if (t) G.map.removeProp(t); }
      for (const [c, cx, cy] of moved) { c.gx = cx; c.gy = cy; }
      me.carrying = null;
    }
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
