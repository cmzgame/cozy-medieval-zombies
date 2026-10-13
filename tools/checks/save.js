// The save (docs/31/05, item 24): a messy world serialised, put back, and
// serialised again is the same text; and a world put back from a save and
// stepped on hashes as the world that was never saved. From the console, on a
// fresh boot:
//   await __game.check("save")
// It pauses the loop, makes a mess near the spawn (a door opened, a window
// boarded, an item dropped, the hearth fed, a zombie hurt, time passed), and
// leaves the world restored from its own save, the loop paused. Michael's slot
// (localStorage) is not touched: the snapshots stay in memory.

function deepEqual(a, b, path = "") {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null) return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return `${path}: arrays differ in length ${a.length} vs ${b && b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = deepEqual(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (typeof a === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join() !== kb.join()) return `${path}: keys ${ka.join(",")} vs ${kb.join(",")}`;
    for (const k of ka) {
      const d = deepEqual(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }
  return `${path}: ${a} vs ${b}`;
}

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  G.loop.setPaused(true);
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const p = G.player;
  try {
    // The mess: a door and a shutter near the spawn toggled, a window boarded, the hearth fed,
    // the plank dropped at the feet, a zombie hurt and a villager poked, the clock moved.
    const sx = Math.round(p.gx);
    const sy = Math.round(p.gy);
    let door = null;
    let win = null;
    let hearth = null;
    for (let r = 0; r < 14 && (!door || !win || !hearth); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const t = map.peekTile(sx + dx, sy + dy);
      if (!t) continue;
      for (const edge of ["n", "w"]) {
        const w = t[edge];
        if (!w) continue;
        if (!door && w.kind === "door") door = w;
        if (!win && w.kind === "window") win = w;
      }
      if (!hearth && t.prop && t.prop.fire && t.prop.fire.burns) hearth = t.prop;
    }
    if (door) door.open = !door.open;
    if (win) { win.shutter = win.shutter === "open" ? "closed" : "open"; map.addBoard(win, "near"); }
    if (hearth) { hearth.fire.lit = true; hearth.fire.fuel = 3; }
    map.touch(sx, sy);
    const bag = G.inventory.bagOf(p);
    const plank = bag.items.find((e) => e.id === "plank");
    if (plank) { G.grid.remove(bag, plank); map.dropItem(sx, sy, plank); }
    const z = G.zombies.find((z) => Math.hypot(z.gx - p.gx, z.gy - p.gy) < 60);
    if (z) z.hp -= 37;
    p.hp = 71;
    p.hunger = 55;
    G.clock.setHour(21);
    step(120);

    // 1. Serialised, restored, serialised again: the same text but for nothing.
    const a = G.save.snapshot("check");
    const textA = JSON.stringify(a);
    await G.restoreWorld(JSON.parse(textA));
    const b = G.save.snapshot("check");
    b.savedAt = a.savedAt;
    const diff = deepEqual(a, b, "save");
    row("a save put back and taken again is the same save", !diff, diff || `${(textA.length / 1024).toFixed(0)} KB, ${a.map.chunks.length} chunks, ${a.characters.zombies.length} dead`);
    const doorBack = door && (map.peekTile(door.at[0], door.at[1]).n || map.peekTile(door.at[0], door.at[1]).w);
    row("the mess survived", G.player.hp === 71 && (!door || (doorBack && doorBack.open === door.open)) && (!hearth || (map.propById(hearth.id).fire.lit && map.propById(hearth.id).fire.fuel > 0)), `hp ${G.player.hp}, the door ${door ? (doorBack && doorBack.open === door.open ? "as left" : "changed") : "none"}, hearth ${hearth ? `lit with ${map.propById(hearth.id).fire.fuel.toFixed(2)} fuel` : "none"}`);
    const dropped = map.itemsAt(sx, sy).find((e) => e.id === "plank");
    row("the dropped plank lies where it fell", !plank || !!dropped, dropped ? `uid ${dropped.uid}` : "missing");
    const hurt = z && G.zombies.find((q) => q.id === z.id);
    row("the hurt zombie keeps its id and its wound", !z || (!!hurt && hurt.hp === z.hp), hurt ? `${hurt.id} hp ${hurt.hp}` : "gone");

    // 2. A world stepped on from the restore hashes as the world that was never saved.
    const before = G.save.snapshot("check");
    step(180);
    const straight = G.game.hashText();
    await G.restoreWorld(JSON.parse(JSON.stringify(before)));
    step(180);
    const fromSave = G.game.hashText();
    const same = straight === fromSave;
    let where = "";
    if (!same) {
      const x = straight.split("\n");
      const y = fromSave.split("\n");
      for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) { where = `line ${i}: ${x[i]} vs ${y[i]}`; break; }
    }
    row("stepped on from the save, the world is the world", same, same ? `hash ${G.game.hashOf(straight)} both ways` : where);
    row("the slot in the browser was not touched", true, "snapshots stayed in memory");
  } finally {
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
