// Immunity is a flag on each villager (Michael, 2026-10-18, #180: "any villager who teaches a skill is immune to the dead, like the
// guide; everyone else can die... on top of the steady villagers, there needs to be some redshirts who are there to be at risk"): the
// dead neither target nor harm an immune villager whatever the world's rules, and an at-risk one is hunted and hurt when the rule is on.
// From the console, on a tab with `?nosave`:
//   await __game.check("immune")
// It makes two villagers on open ground (one immune), sets one of the dead on them with "Zombies attack villagers" on, and takes them
// away and puts the rule and the dead back. Then the cowering (docs/43 section 7): an immune villager with one of the dead pinned two tiles
// off cowers, arms up, with a "!", for its seconds, runs, stands wary, and walks back to its spot when the dead one is gone; an at-risk one does not.

export async function run(game) {
  const G = game;
  const needs0 = (({ hunger, thirst, tired }) => ({ hunger, thirst, tired }))(G.player); // put back in the finally: its steps drain them (the order-independence of the checks, check("all"))
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const S = G.game.state;
  const { createVillager } = await import("/src/entities/villager.js");
  const wasPaused = G.loop.isPaused();
  const rules0 = { zombieAggro: G.rules.rules.zombieAggro, zombiesAttackVillagers: G.rules.rules.zombiesAttackVillagers };
  const hour0 = G.clock.getHour();
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const restore = [];
  try {
    G.loop.setPaused(true);
    row("the valley has villagers who cannot be harmed and villagers who can", S.villagers.some((v) => v.immune) && S.villagers.filter((v) => !v.immune).length >= 3, `${S.villagers.filter((v) => v.immune).length} immune, ${S.villagers.filter((v) => !v.immune).length} at risk`);
    G.clock.setHour(12);
    let c = null;
    for (let y = 120; y < 240 && !c; y += 3) {
      for (let x = 30; x < 230 && !c; x += 3) {
        G.map.ensureAround(x, y, 2);
        let clear = true;
        for (let dy = -5; dy <= 5 && clear; dy++) for (let dx = -6; dx <= 6 && clear; dx++) clear = G.map.isWalkableTile(x + dx, y + dy) && G.map.tileAt(x + dx, y + dy).room === 0 && !G.map.tileAt(x + dx, y + dy).n && !G.map.tileAt(x + dx, y + dy).w && !G.map.tileAt(x + dx, y + dy).prop;
        if (clear) c = [x, y];
      }
    }
    if (!c) {
      row("open ground was found", false, "none in the loaded map");
      return finish();
    }
    const [cx, cy] = c;
    G.teleport(cx + 25, cy + 25); // near enough that the dead here think (`activeTiles`), far enough that they do not see the player: the villagers are the only prey
    G.rules.set({ zombieAggro: true, zombiesAttackVillagers: true });
    const z = S.zombies.find((q) => !q.dead && !q.corpse);
    const z0 = { gx: z.gx, gy: z.gy, state: z.state, aggro: z.aggro };
    restore.push(() => Object.assign(z, z0, { path: [], target: null, lastSeen: null, siege: null }));
    for (const o of S.zombies) if (o !== z && !o.dead && Math.hypot(o.gx - cx, o.gy - cy) < 60) { const keep = { gx: o.gx, gy: o.gy, aggro: o.aggro }; restore.push(() => Object.assign(o, keep, { path: [] })); o.aggro = false; o.gx = cx + 90; o.gy = cy + 90; }
    const safe = createVillager(cx - 2, cy, { id: "vt_immune", name: "Teacher", immune: true });
    const prey = createVillager(cx + 2, cy, { id: "vt_prey", name: "Redshirt" });
    S.villagers.push(safe, prey);
    // What the test made is taken away by identity: a villager the dead killed has already left the list (it turned), and the zombie it
    // became, with anything else the run added to the dead, goes too.
    const dead0 = new Set(S.zombies);
    const takeVillager = (v) => { const i = S.villagers.indexOf(v); if (i >= 0) S.villagers.splice(i, 1); };
    restore.push(() => {
      takeVillager(safe);
      takeVillager(prey);
      for (let i = S.zombies.length - 1; i >= 0; i--) if (!dead0.has(S.zombies[i])) S.zombies.splice(i, 1);
    });
    z.gx = cx;
    z.gy = cy + 3;
    z.path = [];
    z.state = "idle";
    z.aggro = true;
    z.target = null;
    z.siege = null;
    z.noWay = 0;
    let everTargeted = false; // sampled every step: the dead never so much as target the immune one
    for (let i = 0; i < 60 * 25; i++) {
      step(1);
      if (z.target === safe) everTargeted = true;
    }
    row("the dead hunt and hurt an at-risk villager", prey.hp < prey.maxHp, `Redshirt ${prey.hp.toFixed(0)} of ${prey.maxHp}${prey.dead ? ", dead" : ""}`);
    row("and never an immune one: it is neither targeted (at any step) nor harmed", safe.hp === safe.maxHp && !safe.dead && !everTargeted, `Teacher ${safe.hp} of ${safe.maxHp}`);
    G.events.emit("villagerHit", { zombie: z, villager: safe, damage: 50 });
    row("a blow that reaches an immune villager does nothing", safe.hp === safe.maxHp, `Teacher ${safe.hp}`);
    G.rules.set({ zombiesAttackVillagers: false });
    const spare = createVillager(cx + 1, cy + 1, { id: "vt_spare", name: "Spare" }); // the first redshirt is dead by now
    S.villagers.push(spare);
    restore.push(() => takeVillager(spare));
    z.state = "idle";
    z.target = null;
    z.gx = cx;
    z.gy = cy + 3;
    z.path = [];
    step(60 * 8);
    row("with the world's rule off, the dead leave an at-risk villager alone too", spare.hp === spare.maxHp && !spare.dead, `Spare ${spare.hp.toFixed(0)} of ${spare.maxHp}`);

    // The cowering (docs/43 section 7): an immune villager that sees one of the dead within `cowerRadius` cowers about `cowerSeconds`, arms up, a
    // "!" over its head, runs about `fleeTiles` away, stands wary, and walks back to its spot once none of the dead is within `cowerClearRadius`.
    // The states ride in the villager's record (state, anim, line); a guest's replica draws them (the two-tab run reads them there).
    const VT = G.tuning.villager;
    const { pokeVillager } = await import("/src/entities/villager.js");
    // Every other one of the dead off the ground (the redshirt the rows above let die has got up as one): only the pinned one is near.
    for (const o of S.zombies) if (o !== z && !o.dead && Math.hypot(o.gx - cx, o.gy - cy) < 40) { const keep = { gx: o.gx, gy: o.gy }; if (dead0.has(o)) restore.push(() => Object.assign(o, keep, { path: [] })); o.gx = cx + 90; o.gy = cy + 95; o.path = []; o.target = null; }
    const timid = createVillager(cx - 4, cy - 2, { id: "vt_cower", name: "Timid", immune: true });
    S.villagers.push(timid);
    restore.push(() => takeVillager(timid));
    const home = [...timid.home];
    const pinAt = [timid.gx + 2, timid.gy];
    const pin = () => { z.gx = pinAt[0]; z.gy = pinAt[1]; z.path = []; z.target = null; z.state = "idle"; };
    pin();
    const d0 = Math.hypot(timid.gx - z.gx, timid.gy - z.gy);
    step(1);
    pin();
    const sheetHas = !!(G.assets.getSheet(timid.sprite).animations || {}).cower;
    row("an immune villager who sees one of the dead near cowers, arms up, a ! over its head", d0 <= VT.cowerRadius && timid.state === "cower" && timid.anim.name === "cower" && sheetHas && !!timid.line && timid.line.text === VT.cowerBubble, `${d0.toFixed(1)} tiles (cowerRadius ${VT.cowerRadius}): ${timid.state}, ${timid.anim.name}, the sheet ${sheetHas ? "has" : "lacks"} the pose, bubble "${timid.line ? timid.line.text : ""}"`);
    const answered = pokeVillager(timid, me);
    row("a poke while it cowers is not answered", answered === false && timid.state === "cower", `answered ${answered}, ${timid.state}`);
    // Talk while it cowers or runs (docs/43 section 7) is not answered either, by the menu's label as a guest's command runs it on the host:
    // with a talk file and the dead one moved past `talkDeadRadius` for the call, so only the fright refuses it (not a bark for the dead near).
    let talkStarts = 0;
    const heard = () => { talkStarts++; };
    G.events.on("talkStarted", heard);
    restore.push(() => G.events.off("talkStarted", heard));
    const talkWhile = () => {
      const at = [me.gx, me.gy];
      const zAt = [z.gx, z.gy];
      timid.talk = "neighbour";
      z.gx = timid.gx + VT.talkDeadRadius + 2;
      z.gy = timid.gy;
      G.teleport(timid.gx + 1, timid.gy + 1);
      const before = timid.state;
      const entry = G.interact.actionsForTarget({ kind: "character", id: timid.id }, me).find((a) => /^Talk to/.test(a.label));
      if (entry) G.interact.performByLabel(me, { kind: "character", id: timid.id }, entry.label);
      const out = { offered: !!entry, before, after: timid.state, talking: timid.talkingWith.length };
      timid.talk = null;
      G.teleport(at[0], at[1]);
      z.gx = zAt[0];
      z.gy = zAt[1];
      return out;
    };
    const t1 = talkWhile();
    row("Talk while it cowers is not answered: no conversation, still cowering", t1.offered && t1.before === "cower" && t1.after === "cower" && t1.talking === 0 && talkStarts === 0, JSON.stringify({ ...t1, talkStarts }));
    let t2 = null;
    let cowered = 1;
    const seen = ["cower"];
    for (let i = 0; i < 60 * 6 && timid.state !== "wary"; i++) {
      step(1);
      pin();
      if (timid.state === "cower") cowered++;
      if (seen[seen.length - 1] !== timid.state) seen.push(timid.state);
      if (!t2 && timid.state === "flee") t2 = talkWhile();
    }
    row("Talk while it runs, the dead one past talkDeadRadius, is not answered: the flight goes on", !!t2 && t2.offered && t2.before === "flee" && t2.after === "flee" && t2.talking === 0 && talkStarts === 0, JSON.stringify({ ...t2, talkStarts }));
    row("it cowers about its seconds, then runs", Math.abs(cowered / 60 - VT.cowerSeconds) <= 3 / 60 && seen[1] === "flee", `${(cowered / 60).toFixed(2)} s against ${VT.cowerSeconds}; then ${seen.slice(1).join(", ")}`);
    const fled = Math.hypot(timid.gx - z.gx, timid.gy - z.gy);
    row("it runs about fleeTiles from the dead one and stands wary", timid.state === "wary" && fled >= d0 + VT.fleeTiles - 1.5, `${timid.state}, ${d0.toFixed(1)} tiles to ${fled.toFixed(1)} (fleeTiles ${VT.fleeTiles})`);
    z.gx = cx + 90; // the dead one gone off
    z.gy = cy + 90;
    let nearest = Infinity;
    const after = [];
    for (let i = 0; i < 60 * 15; i++) {
      step(1);
      nearest = Math.min(nearest, Math.hypot(timid.gx - home[0], timid.gy - home[1]));
      if (after[after.length - 1] !== timid.state) after.push(timid.state);
      if (nearest < 0.5 && timid.state === "idle") break;
    }
    row("with none of the dead near it walks back to its spot", nearest < 1 && !after.includes("cower") && !after.includes("flee"), `${after.join(", ")}; came within ${nearest.toFixed(2)} of its spot`);
    // An at-risk villager is not one of these: it does not cower (it is the ground for the flight of docs/04, not built).
    const plain = createVillager(cx - 4, cy + 3, { id: "vt_plain", name: "Plain" });
    S.villagers.push(plain);
    restore.push(() => takeVillager(plain));
    pinAt[0] = plain.gx + 2;
    pinAt[1] = plain.gy;
    const plainStates = new Set();
    for (let i = 0; i < 60 * 2; i++) { pin(); step(1); plainStates.add(plain.state); }
    row("an at-risk villager does not cower", !plainStates.has("cower") && !plainStates.has("flee") && !plainStates.has("wary"), [...plainStates].join(", "));
  } finally {
    Object.assign(G.player, needs0); // the hunger, thirst, and tiredness its steps drained
    for (const r of restore.reverse()) r();
    G.rules.set(rules0);
    G.clock.setHour(hour0);
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  return finish();

  function finish() {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  }
}
