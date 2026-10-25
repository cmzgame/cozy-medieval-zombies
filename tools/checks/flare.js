// The fireball as a flare (Michael, 2026-10-17, #156): more light in flight, a short light only where it lands (it burns nothing),
// some damage kept, and it lights what is made to be lit: a campfire with fuel, a mounted torch that is out (not through a wall, and not a hearth). From the console, on a
// tab with `?nosave`:
//   await __game.check("flare")
// It casts the Book of Fire's spell on open ground (through archery.shoot, as the cast does), with the dead moved out of range
// and everything it made or moved put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const restore = [];
  const T = G.archery.tunables;
  try {
    G.loop.setPaused(true);
    // Open ground, grown first.
    let c = null;
    for (let y = 120; y < 240 && !c; y += 3) {
      for (let x = 30; x < 230 && !c; x += 3) {
        G.map.ensureAround(x, y, 2);
        let clear = true;
        for (let dy = -3; dy <= 3 && clear; dy++) for (let dx = -3; dx <= 9 && clear; dx++) clear = G.map.isWalkableTile(x + dx, y + dy) && G.map.tileAt(x + dx, y + dy).room === 0 && !G.map.tileAt(x + dx, y + dy).prop && !G.map.tileAt(x + dx, y + dy).n && !G.map.tileAt(x + dx, y + dy).w;
        if (clear) c = [x, y];
      }
    }
    if (!c) {
      row("open ground for the cast was found", false, "none in the loaded map");
      return finish();
    }
    const [cx, cy] = c;
    for (const o of G.zombies) if (!o.dead && Math.hypot(o.gx - cx, o.gy - cy) < 40) { const keep = { gx: o.gx, gy: o.gy, aggro: o.aggro }; restore.push(() => Object.assign(o, keep, { path: [] })); o.aggro = false; o.gx = cx + 90; o.gy = cy + 90; }
    G.teleport(cx, cy);
    const spell = G.items.getItem("book_of_fire").book.spell;
    const cast = (toX, toY) => G.archery.shootWith([toX - me.gx, toY - me.gy], Math.hypot(toX - me.gx, toY - me.gy), 1, { ...spell, flat: true, vanish: true, arcMin: 0, arcMax: 0, shooter: me });
    const lightsNear = (gx, gy) => G.archery.projectileLights().filter((l) => Math.hypot(l.gx - gx, l.gy - gy) < 0.6);

    // In flight: a larger light than the old four tiles.
    cast(cx + 6, cy);
    step(10);
    const inFlight = G.archery.projectileLights();
    row("a fireball in flight throws more light than before (it was 4 tiles)", inFlight.length === 1 && inFlight[0].radius === T.fireballGlow && T.fireballGlow > 4, `${inFlight.length} light, radius ${inFlight[0] && inFlight[0].radius}`);
    // It lands: a flare where it fell, shrinking to nothing, light only.
    for (let i = 0; i < 60 * 3 && G.archery.flying().some((a) => !a.done); i++) step(1);
    step(2);
    const flare0 = lightsNear(cx + 6, cy);
    row("where it lands a flare is left, as wide as `flareRadius`", flare0.length === 1 && flare0[0].radius > T.flareRadius * 0.95, `${flare0.length} light at the landing, radius ${flare0[0] && flare0[0].radius.toFixed(2)}`);
    step(60 * 1.5);
    const mid = lightsNear(cx + 6, cy);
    row("it shrinks as it burns down", mid.length === 1 && mid[0].radius < flare0[0].radius * 0.8 && mid[0].radius > 0, `radius ${mid[0] && mid[0].radius.toFixed(2)} at the middle`);
    step(60 * (T.flareSeconds + 1));
    row("and is gone after `flareSeconds`; nothing was left burning", G.archery.projectileLights().length === 0 && G.archery.flares().length === 0, `${G.archery.flares().length} flares`);
    row("some damage is kept, less than the 70 it was", spell.damage > 0 && spell.damage < 70, `damage ${spell.damage}`);

    // It lights a campfire with fuel in it, and not one with none.
    const fire = G.map.createProp({ sprite: "campfire", tile: [cx + 5, cy], fuel: 2, lit: false });
    G.map.placeProp(fire, cx + 5, cy);
    restore.push(() => G.map.removeProp(fire));
    const dry = G.map.createProp({ sprite: "campfire", tile: [cx + 5, cy + 3], fuel: 0, lit: false });
    G.map.placeProp(dry, cx + 5, cy + 3);
    restore.push(() => G.map.removeProp(dry));
    row("an unlit campfire stands there for the test", !fire.fire.lit && fire.fire.fuel > 0 && !dry.fire.lit, `fuel ${fire.fire.fuel}, lit ${fire.fire.lit}`);
    cast(cx + 5, cy);
    for (let i = 0; i < 60 * 3 && G.archery.flying().some((a) => !a.done); i++) step(1);
    step(2);
    row("a fireball landing on a campfire with fuel lights it", fire.fire.lit === true, `lit ${fire.fire.lit}`);
    G.teleport(cx, cy + 3);
    cast(cx + 5, cy + 3);
    for (let i = 0; i < 60 * 3 && G.archery.flying().some((a) => !a.done); i++) step(1);
    step(2);
    G.teleport(cx, cy);
    row("one with no fuel is not lit (nothing to burn)", dry.fire.lit === false, `lit ${dry.fire.lit}`);

    // Not a hearth or a fireplace (only "a campfire or a torch"; a home light is a switch lit by hand, docs/43), by a real fireball.
    const hearth = G.map.createProp({ sprite: "fireplace", tile: [cx + 5, cy - 2], fuel: 2, lit: false });
    G.map.placeProp(hearth, cx + 5, cy - 2);
    restore.push(() => G.map.removeProp(hearth));
    G.teleport(cx, cy - 2);
    cast(cx + 5, cy - 2);
    for (let i = 0; i < 60 * 3 && G.archery.flying().some((a) => !a.done); i++) step(1);
    step(2);
    row("a fireball landing on a fireplace (a switch) does not light it", hearth.fire.lit === false && hearth.fire.switch === true, `lit ${hearth.fire.lit}, switch ${hearth.fire.switch}`);
    // Nor a lantern put out (docs/43, section 3): it is lit again by hand, with a flame.
    const lamp = G.map.createProp({ sprite: "lantern_post", tile: [cx + 5, cy + 2] });
    G.map.placeProp(lamp, cx + 5, cy + 2);
    restore.push(() => G.map.removeProp(lamp));
    G.map.setFireLit(lamp, false);
    G.teleport(cx, cy + 2);
    cast(cx + 5, cy + 2);
    for (let i = 0; i < 60 * 3 && G.archery.flying().some((a) => !a.done); i++) step(1);
    step(2);
    row("nor a lantern post that was put out", lamp.fire.lit === false, `lit ${lamp.fire.lit}`);
    G.teleport(cx, cy);

    // A torch in a bracket that is out, by a real fireball at the wall: lit from its own side, not through the wall from the other.
    const side = (b, d) => {
      const [bx, by] = G.map.bracketPos(b);
      const s = b.wall.bracket.side;
      return b.edge === "n" ? [bx, by + s * d] : [bx + s * d, by];
    };
    const bracket = [...G.map.brackets()].find((b) => {
      if (b.wall.bracket.torch || b.wall.bracket.lantern) return false;
      const near = side(b, 2.2);
      const far = side(b, -2.2);
      return [near, far].every(([x, y]) => G.map.isWalkableTile(Math.round(x), Math.round(y)) && !G.map.tileAt(Math.round(x), Math.round(y)).prop);
    });
    if (bracket) {
      const target = { kind: "bracket", bracket, mx: bracket.tx, my: bracket.ty };
      G.map.setHolder(target, true, G.items.makeEntry("torch", 1, { lit: false, wear: 0.2 }));
      restore.push(() => G.map.setHolder(target, false));
      const [bx, by] = G.map.bracketPos(bracket);
      const fireAt = (from) => {
        G.teleport(from[0], from[1]);
        cast(bx, by);
        for (let i = 0; i < 60 * 3 && G.archery.flying().some((a) => !a.done); i++) step(1);
        step(2);
      };
      fireAt(side(bracket, -2.2));
      row("a fireball at a wall does not light a torch through it (from the far side)", bracket.wall.bracket.lit === false, `lit ${bracket.wall.bracket.lit}`);
      fireAt(side(bracket, 2.2));
      row("and lights it from its own side", bracket.wall.bracket.lit === true, `lit ${bracket.wall.bracket.lit}`);
    } else row("an empty bracket with room on both sides for the wall test", false, "none in the loaded map");
  } finally {
    for (const r of restore.reverse()) r();
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  return finish();

  function finish() {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  }
}
