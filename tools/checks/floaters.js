// The floating numbers over heads (#294). From the console, on a tab with `?nosave`:
//   await __game.check("floaters")
// On the host (or alone) it makes the four things happen by their real paths, a hit on one of the dead, a hit taken, a heal (food), and a gather (a chop), draws the numbers
// (`ui/floaters.js` `update`, since a hidden pane runs no frames) and reads what is on screen: one number each, of the right colour and text (red -X twice, green +X, a
// skill icon with a +N in white or black), the setting off showing none, and a number over a body I cannot see hidden. On a guest, run it after the host's did, within the
// same second of the host's game, with both tabs stepped (`check("sync")`'s recipe): it reads that the same four numbers arrived in the frame and are drawn here. The
// health, the bag, the tree, and the drawn numbers are put back.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const ui = await import("/src/ui/floaters.js");
  const fl = await import("/src/floaters.js");
  const icons = await import("/src/ui/skill-icons.js");
  const { floaters: T } = await import("/src/tuning.js");
  const chars = () => [...S.players, ...S.zombies, ...S.villagers, ...S.corpses];
  const me = G.player;
  const role = G.net.status().role;
  const draw = (visible = null) => ui.update(0, chars(), visible, me);
  const hex = (c) => { const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(c); return m ? `#${[1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, "0")).join("")}` : c; };
  const setting0 = G.settings.get("floaters");
  const hp0 = me.hp;
  const hunger0 = me.hunger;
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const meAt = [me.gx, me.gy];
  const wasPaused = G.loop.isPaused();
  const made = [];
  const aggro0 = G.rules.rules.zombieAggro;
  try {
    G.settings.set("floaters", true);
    if (role === "guest") {
      draw();
      const now = ui.shown();
      const kinds = now.map((n) => n.kind).sort().join(",");
      row("on a guest the host's four numbers arrived in the frame and are drawn: two red hits, a green heal, a gather", now.length >= 4 && kinds.includes("0,0,1,2"), `${now.length} on screen: ${now.map((n) => `${n.text}${n.skill ? " " + n.skill : ""} ${hex(n.color)}`).join(" | ")}`);
      const g = now.find((n) => n.skill);
      row("the gather shows its skill's icon and its number, white or black", !!g && icons.skillIds().includes(g.skill) && [T.gatherLight, T.gatherDark].includes(hex(g.color)) && /^\+\d+$/.test(g.text), g ? `${g.skill} ${g.text} ${hex(g.color)}` : "none");
      row("a guest records none of its own (the host is the authority)", (() => { fl.damage(me, 5); return fl.takeForFrame().length === 0; })(), "damage() on a guest recorded nothing");
    } else {
      G.loop.setPaused(true);
      G.rules.rules.zombieAggro = false;
      fl.reset();
      ui.clear();
      const { damageZombie } = await import("/src/entities/zombie.js");
      const { damagePlayer, eat } = await import("/src/entities/player.js");
      // A hit on one of the dead.
      const z = S.zombies.find((q) => !q.dead && !q.corpse);
      draw();
      damageZombie(z, 9);
      // A hit taken.
      damagePlayer(me, 6);
      // A heal: food, from below full.
      me.hp = Math.max(1, me.maxHp - 30);
      me.hunger = Math.min(me.hunger, me.maxHunger - 30);
      const hp1 = me.hp;
      eat(me, { hunger: 10, heal: 4 });
      const gained = Math.round(me.hp - hp1);
      // A gather: a tree chopped with a hatchet by its verb, on a patch of bare grass.
      G.map.ensureAround(me.gx, me.gy, 3);
      let at = null;
      for (let dy = -14; dy <= 14 && !at; dy++) for (let dx = -14; dx <= 14 && !at; dx++) {
        const x = Math.round(meAt[0]) + dx;
        const y = Math.round(meAt[1]) + dy;
        let ok = true;
        for (let ay = -1; ay <= 1 && ok; ay++) for (let ax = -1; ax <= 2 && ok; ax++) { const t = G.map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w && G.map.isWalkableTile(x + ax, y + ay); }
        if (ok) at = [x, y];
      }
      if (!at) throw new Error("no bare grass for the check");
      G.teleport(at[0] + 0.1, at[1] + 0.1);
      const tx = at[0] + 1;
      const ty = at[1];
      const tree = G.map.createProp({ sprite: "tree_oak_m", tile: [tx, ty] });
      G.map.placeProp(tree, tx, ty);
      made.push(tree);
      me.hands.main = G.items.makeEntry("hatchet", 1);
      const r = G.verbs.run("chop", G.world, me, { prop: tree.id });
      draw();
      const now = ui.shown();
      const byKind = (k) => now.filter((n) => n.kind === k);
      const hit = byKind(fl.DAMAGE);
      row("a hit on one of the dead makes a red -X over it, and a hit taken one over me", hit.length === 2 && hit.every((n) => hex(n.color) === T.damageColor) && hit.some((n) => n.text === "-9" && n.id === z.id) && hit.some((n) => n.text === "-6" && n.id === me.id), hit.map((n) => `${n.text} over ${n.id}`).join(" | "));
      const heals = byKind(fl.HEAL);
      row("food makes a green +X of what was gained", heals.length === 1 && hex(heals[0].color) === T.healColor && heals[0].text === `+${gained}` && gained > 0, heals.map((n) => `${n.text} ${hex(n.color)}`).join(" ") || "none");
      const gat = byKind(fl.GATHER);
      row("a chop makes the woodcutting icon with +logs, in white or black", r.ok === true && gat.length === 1 && gat[0].skill === "woodcutting" && /^\+\d+$/.test(gat[0].text) && [T.gatherLight, T.gatherDark].includes(hex(gat[0].color)), gat.map((n) => `${n.skill} ${n.text} ${hex(n.color)}`).join(" ") || `none (the chop said ${JSON.stringify(r).slice(0, 80)})`);
      row("natural regeneration shows nothing (health coming back by itself is a trickle, not an event)", (() => { fl.takeForFrame(); me.hp = me.maxHp - 20; for (let i = 0; i < 120; i++) G.loop.advance(1 / 60); return fl.takeForFrame().length === 0; })(), "120 steps of healing, no event");
      // The frame carries them: what a guest would be sent.
      fl.reset();
      fl.damage(z, 3);
      fl.heal(me, 2);
      fl.gather(me, "mining", 4);
      const wire = fl.takeForFrame();
      const copy = JSON.parse(JSON.stringify(wire));
      row("the frame's form is small arrays, taken once", wire.length === 3 && JSON.stringify(wire) === JSON.stringify([[0, z.id, 3], [1, me.id, 2], [2, me.id, 4, "mining"]]) && fl.takeForFrame().length === 0, JSON.stringify(wire));
      // The setting off: nothing is shown, and nothing waits.
      ui.clear();
      fl.reset();
      G.settings.set("floaters", false);
      fl.damage(me, 2);
      draw();
      row("the setting off shows no numbers", ui.shown().length === 0, `${ui.shown().length} on screen`);
      G.settings.set("floaters", true);
      // Over a body I cannot see: hidden.
      fl.reset();
      ui.clear();
      fl.damage(z, 2);
      draw(new Set());
      const hid = ui.shown();
      row("a number over a body outside my sight is hidden, never shown through a wall or the dark", hid.length === 1 && hid[0].hidden === true, hid.map((n) => `${n.text} hidden ${n.hidden}`).join(""));
      // The night (#88): a zombie far off in the dark, in my line of sight but unseen, has no number; by day the same one has.
      const sightMod = await import("/src/sight.js");
      const { tileKey } = await import("/src/visibility.js");
      const hour0 = G.clock.getHour();
      const zAt = [z.gx, z.gy];
      try {
        G.loop.setPaused(true);
        G.clock.setHour(1);
        for (let i = 0; i < 5; i++) G.loop.advance(1 / 60); // the light eases to the hour over a few steps
        const dark = [[15, 0], [-15, 0], [0, 15], [0, -15], [12, 12], [-12, -12]].find(([dx, dy]) => { z.gx = me.gx + dx; z.gy = me.gy + dy; return !sightMod.seen(me, z); });
        const sawAtNight = dark ? sightMod.seen(me, z) : null;
        ui.clear();
        fl.reset();
        fl.damage(z, 2);
        draw(new Set([tileKey(Math.round(z.gx), Math.round(z.gy))]));
        const night = ui.shown();
        row("at night a number over a dead one far off in the dark, in my line of sight but unseen, is hidden", !!dark && sawAtNight === false && night.length === 1 && night[0].hidden === true, dark ? `1 a.m., ${Math.round(Math.hypot(z.gx - me.gx, z.gy - me.gy))} tiles off: seen ${sawAtNight}, hidden ${night.map((n) => n.hidden).join("")}` : "no dark spot found");
        G.clock.setHour(12);
        for (let i = 0; i < 5; i++) G.loop.advance(1 / 60); // the light eases to the hour over a few steps
        ui.clear();
        fl.reset();
        fl.damage(z, 2);
        draw(new Set([tileKey(Math.round(z.gx), Math.round(z.gy))]));
        const noon = ui.shown();
        row("by day the same number, in sight, is shown", noon.length === 1 && noon[0].hidden === false, noon.map((n) => `${n.text} hidden ${n.hidden}`).join(""));
      } finally {
        z.gx = zAt[0];
        z.gy = zAt[1];
        G.clock.setHour(hour0);
      }
      // Only the dead fade in the dark: a villager far enough off to be beyond the dark radius, at night, is drawn whole and so is the number over it.
      try {
        const v = S.villagers.find((q) => !q.dead && q.kind !== "zombie");
        if (!v) row("at night a villager's number, 4+ tiles off, is shown", false, "no villager");
        else {
          const vAt = [v.gx, v.gy];
          G.loop.setPaused(true);
          G.clock.setHour(1);
          for (let i = 0; i < 5; i++) G.loop.advance(1 / 60);
          const spot = [[5, 0], [-5, 0], [0, 5], [0, -5], [6, 6], [-6, -6]].find(([dx, dy]) => { v.gx = me.gx + dx; v.gy = me.gy + dy; return !sightMod.seen(me, v); });
          ui.clear();
          fl.reset();
          fl.damage(v, 4);
          draw(new Set([tileKey(Math.round(v.gx), Math.round(v.gy))]));
          const vs = ui.shown();
          row("at night a villager's number, 4+ tiles off in the dark, is shown (only the dead fade)", !!spot && vs.length === 1 && vs[0].hidden === false, spot ? `unseen by the dead's rule, ${Math.round(Math.hypot(v.gx - me.gx, v.gy - me.gy))} tiles off: hidden ${vs.map((n) => n.hidden).join("")}` : "no dark spot found");
          v.gx = vAt[0];
          v.gy = vAt[1];
        }
      } finally {
        G.clock.setHour(hour0);
      }
      // A frame is a guest's input: a skill that is not one of the fourteen is ignored, never put in the page, and a late number is dropped.
      ui.clear();
      fl.reset();
      fl.receive([[2, me.id, 3, '"><img src=x onerror="window.__floaterXss=1">'], [2, me.id, 3, "mining"], [0, me.id, 4, "mining"]]);
      draw();
      const htmlOf = document.getElementById("floaters").innerHTML;
      row("a skill name that is not one of the fourteen is dropped and never reaches the page; a real one is drawn", ui.shown().length === 2 && !window.__floaterXss && !htmlOf.includes("onerror") && ui.shown().some((n) => n.skill === "mining"), `${ui.shown().map((n) => `${n.text}${n.skill ? " " + n.skill : ""}`).join(" | ")}`);
      ui.clear();
      fl.reset();
      fl.damage(me, 3);
      const late = fl.takeForDraw(performance.now() + T.life * 1000 + 100); // the draw as of a moment after the number's life, given as a time so a visible pane's own drawing cannot take it first
      fl.receive([[0, me.id, 1e309], [0, me.id, NaN]]);
      row("a number that waited longer than its life (a hidden tab) is dropped, not shown late; an infinite amount is ignored", late.length === 0 && !fl.pending(), `${late.length} late numbers taken, ${fl.pending() ? "something" : "nothing"} pending`);
      // Receive: the guest's side of the same arrays.
      ui.clear();
      fl.reset();
      fl.receive(copy);
      draw();
      row("a frame's arrays drawn as received (what a guest does): the same three numbers", ui.shown().map((n) => n.text).join(" ") === "-3 +2 +4", ui.shown().map((n) => n.text).join(" "));
    }
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    G.settings.set("floaters", setting0 === undefined ? true : setting0);
    if (role !== "guest") {
      for (const q of made) { const t = G.map.propById(q.id); if (t) G.map.removeProp(t); }
      me.hp = hp0;
      me.hunger = hunger0;
      bag.items.splice(0, bag.items.length, ...bag0);
      me.hands.main = hands0.main;
      me.hands.off = hands0.off;
      G.rules.rules.zombieAggro = aggro0;
      G.teleport(meAt[0], meAt[1]);
      G.loop.setPaused(wasPaused);
      ui.clear();
      fl.reset();
    }
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
