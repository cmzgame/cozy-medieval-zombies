// A multi-tile prop across a chunk's edge (#341; src/map.js): a prop is recorded whole with its anchor's chunk, and each of its tiles on a
// neighbour is named in the neighbour's record (`parts`, by the prop's id), so the neighbour installed alone (a guest's frame that carries
// only it) stands it again from the registry, and the sync check's map part sees a tile that lost it; the placement marks the neighbour
// too, so it goes to a guest and is never evicted (a wild chunk dropped and grown again would grow without the prop's tiles).
// From the console, on a tab with `?nosave`:
//   await __game.check("edge")                       // solo: the host's rows, and the bed and the rug taken away again
// Two tabs (`?nosave&relay=none` on both, the guest joined by `__game.net.open({ join })`, both loops paused):
//   host:  __game.net.setSyncReports(true)
//          const kept = (await __game.check("edge", { keep: true })).kept   // a bed across an x edge and a rug across a y edge, left standing,
//                                                                          // sent, and then each neighbour touched alone and sent again
//   guest: await __game.check("edge", { guest: <kept, copied across> })      // steps its own tab until the frames are in, then reads the replica
//   then both tabs stepped in turn for sixty frames or more, and on the host: await __game.check("sync")
// On main (before #341) the guest's replica loses the neighbour's tiles once that chunk arrives alone, and the map part cannot see it: the
// guest's rows "every tile holds it" and "the replica's map part sees a tile that lost it" fail there.

const C = 16;

export async function run(game, opts = {}) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const role = G.net.status().role;
  const wasPaused = G.loop.isPaused();
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); r(); }; ch.port2.postMessage(0); });
  const chunkOf = (x, y) => [Math.floor(x / C), Math.floor(y / C)];
  const chunkAt = (x, y) => { const [cx, cy] = chunkOf(x, y); return map.getChunk(cx, cy, false); };
  const slotOf = (k) => (k.rug ? "rug" : "prop");
  const holdsAll = (p, slot) => !!p && p.tiles.every(([x, y]) => { const t = map.peekTile(x, y); return !!t && t[slot] === p; });
  // The tiles of a footprint in the anchor's chunk's neighbour, and that neighbour's [cx, cy].
  const beyond = (k) => k.tiles.filter(([x, y]) => { const [cx, cy] = chunkOf(x, y); const [ax, ay] = chunkOf(k.tile[0], k.tile[1]); return cx !== ax || cy !== ay; });
  let kept = null;
  const made = [];
  try {
    G.loop.setPaused(true);

    if (opts.guest) {
      // ---- a guest's side: the replica holds every tile of what the host kept ----
      const k = opts.guest;
      if (role !== "guest") row("this tab is a guest", false, `role ${role || "none"}`);
      // The frames the host sent wait in the inbox until this tab steps: step until both props are in by id (a few seconds of steps at most).
      let n = 0;
      for (; n < 600 && !(k.props || []).every((q) => map.propById(q.id)); n++) { await yieldOnce(); G.loop.advance(1 / 60); }
      for (let i = 0; i < 30; i++) { await yieldOnce(); G.loop.advance(1 / 60); } // and the frame after, which carried each neighbour alone
      row("the host's bed and rug arrived on the replica by id", (k.props || []).length === 2 && k.props.every((q) => map.propById(q.id)), `${(k.props || []).map((q) => `${q.id} ${map.propById(q.id) ? "here" : "missing"}`).join(", ")} after ${n} steps`);
      for (const q of k.props || []) {
        const p = map.propById(q.id);
        const slot = slotOf(q);
        const on = beyond(q);
        row(`the ${q.kind}: at the host's tiles, across ${q.edge}`, !!p && p.tile[0] === q.tile[0] && p.tile[1] === q.tile[1] && JSON.stringify(p.tiles) === JSON.stringify(q.tiles), p ? `${p.sprite} at ${p.tile} with ${p.tiles.length} tiles (host ${q.tiles.length}), ${on.length} beyond its anchor's chunk` : "missing");
        row(`the ${q.kind}: every tile holds it on the replica, the neighbours' too, after each came alone in a frame`, holdsAll(p, slot), p ? p.tiles.map(([x, y]) => { const t = map.peekTile(x, y); return `${x},${y} ${t ? (t[slot] === p ? "holds it" : t[slot] ? `holds ${t[slot].id}` : "empty") : "not loaded"}`; }).join("; ") : "-");
        // The host's record of each neighbour, installed alone here as a frame installs it: every tile still holds it.
        for (const nb of q.neighbours) {
          const rec = JSON.parse(JSON.stringify(nb.record));
          map.installChunk(rec);
          for (const d of rec.props) map.installProp(d);
          map.rebuildBrackets();
          G.light.forgetAll();
          const after = map.propById(q.id);
          row(`the ${q.kind}: the host's record of ${nb.at} installed alone on the replica keeps its tiles (it names them: ${JSON.stringify(rec.parts || [])})`, holdsAll(after, slot) && (rec.parts || []).some((r) => r[2] === q.id), after ? `${after.tiles.filter(([x, y]) => map.peekTile(x, y)[slot] === after).length} of ${after.tiles.length} tiles hold it` : "gone from the registry");
        }
        const after = map.propById(q.id);
        // The sync check's map part on the replica sees a tile that lost it (main's did not: nothing in the neighbour's record named it).
        if (after && on.length) {
          const [fx, fy] = on[0];
          const before = G.game.syncParts().map;
          map.peekTile(fx, fy)[slot] = null;
          const lost = G.game.syncParts().map;
          map.peekTile(fx, fy)[slot] = after;
          const back = G.game.syncParts().map;
          row(`the ${q.kind}: the replica's map part sees a tile that lost it, and agrees again once it is back`, lost !== before && back === before, `${before} whole, ${lost} with ${fx},${fy} empty, ${back} back`);
        }
      }
      throw Object.assign(new Error("guest done"), { guestDone: true });
    }

    // ---- the host's side (or solo) ----
    const me = G.player;
    map.ensureAround(me.gx, me.gy, 3);
    const busy = new Set([...map.allProps()].filter((q) => (q.fire && q.fire.lit) || (q.queue && q.queue.length)).map((q) => chunkOf(q.tile[0], q.tile[1]).join(",")));
    const bodies = [...G.game.state.players, ...G.game.state.zombies, ...G.game.state.villagers].map((c) => [Math.round(c.gx), Math.round(c.gy)]);
    // A spot whose w by h footprint crosses an edge along `axis` (the anchor on the chunk's last column, or two rows short of its last row),
    // the footprint and a ring round it bare walkable ground with no prop, rug, wall, or body, in chunks with no lit fire or job at work
    // (a fire's or a job's own touch would send the anchor's chunk again and hide the neighbour sent alone).
    const spot = (w, h, axis, taken) => {
      for (let r = 0; r <= 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(me.gx) + dx;
        const y = Math.round(me.gy) + dy;
        if (axis === "x" ? ((x % C) + C) % C !== C - 1 : ((y % C) + C) % C !== C - 2) continue;
        let ok = true;
        for (let ay = -1; ay <= h && ok; ay++) for (let ax = -1; ax <= w && ok; ax++) {
          const tx = x + ax, ty = y + ay;
          const t = map.peekTile(tx, ty);
          ok = !!t && !t.prop && !t.rug && !t.n && !t.w && map.isWalkableTile(tx, ty) && !busy.has(chunkOf(tx, ty).join(",")) && !bodies.some(([bx, by]) => bx === tx && by === ty) && !taken.has(`${tx},${ty}`);
        }
        if (ok) return [x, y];
      }
      return null;
    };
    const taken = new Set();
    const placed = [];
    for (const [kind, sprite, fp, axis, facing] of [["bed", "bed", [2, 1], "x", "x"], ["rug", "rug_regal_red", [2, 3], "y", "y"]]) {
      const at = spot(fp[0], fp[1], axis, taken);
      if (!at) { row(`bare ground for the ${kind} across a chunk's ${axis} edge`, false, "none within 40 tiles"); continue; }
      const [x, y] = at;
      const p = map.createProp({ sprite, tile: [x, y], footprint: fp, facing, ...(kind === "rug" ? { solid: false } : {}) });
      if (kind === "rug") p.rugItem = "rug_regal_red"; // as rugs.placeRug lays it; the census counts it one placed rug
      map.placeProp(p, x, y);
      made.push(p);
      for (let ay = -1; ay <= fp[1]; ay++) for (let ax = -1; ax <= fp[0]; ax++) taken.add(`${x + ax},${y + ay}`);
      placed.push({ kind, p, axis });
    }
    for (const { kind, p, axis } of placed) {
      const slot = kind === "rug" ? "rug" : "prop";
      const on = beyond(p);
      const A = chunkAt(p.tile[0], p.tile[1]);
      // Each neighbour it stands on (a rug may cross two edges at once and stand on four chunks), with its tiles there.
      const nbs = [];
      for (const [x, y] of on) {
        const c = chunkAt(x, y);
        let nb = nbs.find((n) => n.c === c);
        if (!nb) nbs.push((nb = { c, at: `${c.cx},${c.cy}`, tiles: [] }));
        nb.tiles.push([x, y]);
      }
      row(`the ${kind} stands across a chunk's ${axis} edge, on its anchor's chunk and its neighbour's`, holdsAll(p, slot) && nbs.length > 0, nbs.length ? `${p.id} at ${p.tile}: ${p.tiles.length - on.length} tiles on ${A.cx},${A.cy}, ${nbs.map((n) => `${n.tiles.length} on ${n.at}`).join(", ")}` : "on one chunk");
      if (!nbs.length) continue;
      row(`the ${kind}: the placement marked every neighbour, so each is sent and never evicted`, A.dirty && nbs.every((n) => n.c.dirty), `anchor's dirty ${A.dirty}; ${nbs.map((n) => `${n.at} dirty ${n.c.dirty}${n.c.wild ? " (wild)" : ""}`).join(", ")}`);
      const recA = map.serializeChunk(A);
      for (const nb of nbs) nb.record = JSON.parse(JSON.stringify(map.serializeChunk(nb.c)));
      const named = nbs.every((nb) => !nb.record.props.some((d) => d.id === p.id) && nb.tiles.every(([x, y]) => (nb.record.parts || []).some(([lx, ly, id]) => lx === x - nb.c.cx * C && ly === y - nb.c.cy * C && id === p.id)));
      row(`the ${kind}: recorded whole with its anchor's chunk, its tiles on each neighbour named in that neighbour's record`, recA.props.some((d) => d.id === p.id) && named, nbs.map((nb) => `${nb.at} parts ${JSON.stringify(nb.record.parts || [])}`).join("; "));
      // The sync check's map part sees a tile that lost it.
      const [fx, fy] = on[0];
      const before = G.game.syncParts().map;
      map.peekTile(fx, fy)[slot] = null;
      const lost = G.game.syncParts().map;
      map.peekTile(fx, fy)[slot] = p;
      row(`the ${kind}: the map part sees a tile that lost it`, lost !== before && G.game.syncParts().map === before, `${before} whole, ${lost} with ${fx},${fy} empty`);
      kept = kept || { props: [] };
      kept.props.push({ id: p.id, kind, sprite: p.sprite, tile: [...p.tile], tiles: p.tiles.map((t) => [...t]), rug: kind === "rug", edge: `${axis}: ${A.cx},${A.cy} and ${nbs.map((n) => n.at).join(", ")}`, neighbours: nbs.map((n) => ({ at: n.at, record: n.record, c: n.c })) });
    }
    // With a guest: send the props, then the neighbours touched without their anchors' chunks and sent again (the frame a replica on main
    // lost the tiles in).
    if (role === "host" && kept) {
      for (let i = 0; i < 9; i++) G.loop.advance(1 / 60); // a frame or more: the anchors' chunks and the neighbours, with the props
      const touchedAt = [];
      for (const q of kept.props) for (const nb of q.neighbours) {
        // A tile of the neighbour away from the prop: marked as any change to it is, so the frame carries the neighbour and not the anchor's.
        let t = null;
        for (let i = 0; i < C * C && !t; i++) { const x = nb.c.cx * C + (i % C), y = nb.c.cy * C + Math.floor(i / C); if (!q.tiles.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 3)) t = [x, y]; }
        touchedAt.push(t.join(","));
        map.markDirty(t[0], t[1]);
      }
      for (let i = 0; i < 9; i++) G.loop.advance(1 / 60);
      row("with a guest: the props sent, and then the neighbours touched alone and sent again", G.net.status().guests.length > 0, `${G.net.status().guests.length} guest(s); the neighbours touched at ${touchedAt.join(", ")}`);
    }
    if (kept) for (const q of kept.props) for (const nb of q.neighbours) delete nb.c;
  } catch (err) {
    if (!err.guestDone) row("the check ran to its end", false, err.stack || String(err));
  } finally {
    if (!opts.keep && !opts.guest) for (const p of made) if (map.propById(p.id) === p) map.removeProp(p);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, ...(opts.keep && kept ? { kept } : {}) };
}
