// Animals, step 1 (docs/45, #442): the animal character in the world. From the console, on a tab with `?nosave`:
//   await __game.check("animals")
// The seven species and their sheets (every named animation in both drawn facings, the two mirrored, the same shape a drawn sheet
// will have); the valley's homes (game in the woods, the farms' stock in their pens, the hens at Hollow Farm's coop); a hen walking
// plays its walk and stands in one of the four diagonals; a rabbit flees a player and a deer one of the dead, running, and settles
// when nothing is near; the dead ignore them; Object Highlight and the Look at line on an animal under the pointer; the renewal at a
// wild home below its cap (never with a player near, never past the cap); a pen holds its stock with the gate shut, and opened, they
// wander out and drift back toward home; an animal's record and the save. Everything moved is put back; the dead's aggro is off for
// the run and restored.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const wasPaused = G.loop.isPaused();
  const aggro0 = G.rules.rules.zombieAggro;
  const A = await import("/src/entities/animal.js");
  const assets = await import("/src/assets.js");
  const sprites = await import("/src/sprites.js");
  const interact = await import("/src/interact.js");
  const highlight = await import("/src/highlight.js");
  const iso = await import("/src/iso.js");
  const clock = await import("/src/clock.js");
  const { createZombie } = await import("/src/entities/zombie.js");
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const restore = [];
  const added = [];
  const keep = (a) => { const was = { gx: a.gx, gy: a.gy, state: a.state, home: a.home.slice(), path: a.path.slice(), idleTimer: a.idleTimer, facing: a.facing }; restore.push(() => Object.assign(a, was, { path: was.path, home: was.home })); };
  const spawn = (species, gx, gy, home = null) => { const a = A.createAnimal(species, gx, gy, { home: home || [gx, gy] }); S.animals.push(a); added.push(a); return a; };
  const ids0 = new Set(S.animals.map((a) => a.id)); // anything born while the check runs goes with it
  const homes0 = S.animalHomes.map((h) => h.nextAt);
  try {
    G.loop.setPaused(true);
    G.rules.rules.zombieAggro = false;

    // ---- the species and their sheets ----
    const names = A.speciesNames();
    const want = ["hen", "rabbit", "deer", "boar", "cow", "sheep", "pig"];
    row("the seven species are in data/animals.json", want.every((n) => names.includes(n)) && names.length === 7, names.join(", "));
    const sheetProblems = [];
    for (const n of names) {
      const sp = A.speciesOf(n);
      let sheet = null;
      try { sheet = assets.getSheet(A.spriteOf(n)); } catch { sheetProblems.push(`${n}: no sheet`); continue; }
      const anims = Object.keys(sheet.animations);
      for (const a of ["idle", "walk", "eat", "dead"]) if (!anims.includes(a)) sheetProblems.push(`${n}: no ${a}`);
      if (sp.flee && !anims.includes("run")) sheetProblems.push(`${n}: flees with no run`);
      if (n === "boar" && !anims.includes("attack")) sheetProblems.push("boar: no attack");
      if (sheet.facings.join(",") !== "se,ne" || sheet.mirror.sw !== "se" || sheet.mirror.nw !== "ne") sheetProblems.push(`${n}: facings ${sheet.facings} mirror ${JSON.stringify(sheet.mirror)}`);
      if (sheet.animations.idle.frames !== 2 || sheet.animations.walk.frames !== 4 || sheet.animations.dead.frames !== 1 || sheet.animations.eat.frames !== 2) sheetProblems.push(`${n}: frame counts`);
      if (sheet.image) for (const a of anims) for (const f of sheet.facings) for (let i = 0; i < sheet.animations[a].frames; i++) if (!sheet.frames[`${a}_${f}_${i}`]) sheetProblems.push(`${n}: no frame ${a}_${f}_${i}`);
      for (const f of ["se", "sw", "ne", "nw"]) { const r = sprites.resolveFacing(sheet, f); if (r.facing !== (f[0] === "s" ? "se" : "ne") || r.flip !== f.endsWith("w")) sheetProblems.push(`${n}: ${f} resolves to ${r.facing}${r.flip ? " flipped" : ""}`); }
    }
    row("every species' sheet has idle 2, walk 4, eat 2, dead 1 (run for those that flee, attack for the boar), se and ne drawn, sw and nw their mirrors, a frame for each", sheetProblems.length === 0, sheetProblems.slice(0, 4).join("; ") || `${names.length} sheets`);

    // ---- the valley's homes ----
    const homes = S.animalHomes;
    const bySpecies = (sp) => homes.filter((h) => h.species === sp);
    const isValley = (S.info && S.info.name || "").toLowerCase().includes("valley") || homes.length > 0;
    if (isValley) {
      const places = (S.info && S.info.places) || [];
      const placeOf = (name) => places.find((p) => p.name === name);
      const inRect = (pt, r) => pt[0] >= r[0] && pt[0] < r[0] + r[2] && pt[1] >= r[1] && pt[1] < r[1] + r[3];
      const pens = [["cow", "Hollow Farm's byre"], ["pig", "Hollow Farm's pigsty"], ["sheep", "the croft's sheepfold"]];
      const penned = pens.map(([sp, place]) => { const pl = placeOf(place); const hs = bySpecies(sp); return [sp, place, !!pl && hs.length > 0 && hs.every((h) => inRect(h.at, pl.box))]; });
      row("the farms' stock is in its pens: cows in Hollow Farm's byre, pigs in its pigsty, sheep in the croft's sheepfold", penned.every((p) => p[2]), penned.map((p) => `${p[0]} ${p[2] ? "in" : "NOT in"} ${p[1]}`).join("; "));
      const coop = [...G.map.allProps()].find((p) => p.sprite === "chicken_coop" && p.tiles.some(([x, y]) => y > 230));
      const hens = bySpecies("hen");
      row("Hollow Farm's hens are at its coop", !!coop && hens.length > 0 && hens.every((h) => Math.hypot(h.at[0] - coop.tiles[0][0], h.at[1] - coop.tiles[0][1]) <= 3), coop ? `coop at ${coop.tiles[0]}, hens at ${hens.map((h) => h.at).join(" ")}` : "no coop at Hollow Farm");
      const game0 = homes.filter((h) => A.speciesOf(h.species).wild);
      row("game lives in the woods ringing the valley: deer in herds of two to four, rabbits at the edges, boar, each wild home renewed", bySpecies("deer").length >= 4 && bySpecies("deer").every((h) => h.count >= 2 && h.count <= 4) && bySpecies("rabbit").length >= 3 && bySpecies("boar").length >= 1 && game0.every((h) => h.renew && h.cap >= h.count), `${bySpecies("deer").length} herds of deer (${bySpecies("deer").map((h) => h.count).join(",")}), ${bySpecies("rabbit").length} of rabbits, ${bySpecies("boar").length} of boar`);
      const homeTrees = game0.filter((h) => { const t = G.map.peekTile(h.at[0], h.at[1]); return t && t.prop && t.prop.def && t.prop.def.canopy; });
      row("each wild home's spot is a clearing (no tree on it)", homeTrees.length === 0, homeTrees.map((h) => h.id).join(",") || `${game0.length} homes`);
      const counted = homes.reduce((n, h) => n + h.count, 0);
      row("a world's birth makes each home's count, round its spot", S.animals.filter((a) => a.id.startsWith("an")).length === counted && S.animals.filter((a) => a.id.startsWith("an")).every((a) => { const h = homes.find((q) => q.id === a.homeId); return h && Math.hypot(a.home[0] - h.at[0], a.home[1] - h.at[1]) === 0; }), `${counted} counted, ${S.animals.length} animals`);
    }

    // Open ground for what follows: the nearest outdoor spot with five tiles of walkable ground every way (the spawn is indoors).
    const vis = await import("/src/visibility.js");
    let field = null;
    for (let r = 0; r < 40 && !field; r++) {
      for (let dy = -r; dy <= r && !field; dy++) for (let dx = -r; dx <= r && !field; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(me.gx) + dx;
        const y = Math.round(me.gy) + dy;
        let ok = true;
        for (let j = -5; j <= 5 && ok; j++) for (let i = -5; i <= 5 && ok; i++) if (!G.map.isWalkableTile(x + i, y + j) || G.map.tileAt(x + i, y + j).room !== 0) ok = false;
        if (ok) field = [x, y];
      }
    }
    if (field) { G.teleport(field[0], field[1]); step(); }
    row("open ground near the spawn for the walking and the flight", !!field, field ? `at ${field}` : "none within forty tiles");

    // ---- a hen walking: its sheet's walk, the four diagonals ----
    const hen = spawn("hen", me.gx + 2, me.gy + 0.5);
    G.loop.advance(1 / 60);
    hen.idleTimer = 0;
    const facings = new Set();
    const frames = new Set();
    let walked = false;
    for (let i = 0; i < 60 * 30; i++) {
      step();
      facings.add(hen.facing);
      if (hen.state === "wander") { walked = true; frames.add(hen.anim.name + ":" + hen.anim.frame); }
      if (hen.state !== "wander") hen.idleTimer = Math.min(hen.idleTimer, 0.1);
      if (facings.size >= 3 && i > 600) break;
    }
    row("an animal on its way plays its sheet's walk, frame by frame", walked && [...frames].filter((f) => f.startsWith("walk:")).length >= 3, `walked ${walked}, frames ${[...frames].join(" ")}`);
    row("it always stands in one of the four diagonals its sheet has, turning between them as it goes", facings.size >= 2 && [...facings].every((f) => ["se", "sw", "ne", "nw"].includes(f)), [...facings].join(","));
    const settled = [];
    for (let k = 0; k < 40; k++) { hen.state = "wander"; hen.path = []; step(); settled.push(hen.state); }
    row("a stand after a walk is idle, or grazing some of the time (its eat)", settled.every((s) => s === "idle" || s === "eat") && settled.includes("eat") && settled.includes("idle"), `${settled.filter((s) => s === "eat").length} of ${settled.length} grazing`);

    // ---- the flight: a rabbit from a player, a deer from one of the dead ----
    const tx = Math.round(me.gx);
    const ty = Math.round(me.gy);
    let open = null;
    for (const [dx, dy] of [[4, 0], [0, 4], [-4, 0], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3]]) if (G.map.isWalkableTile(tx + dx, ty + dy) && vis.lineOfSight(me.gx, me.gy, tx + dx, ty + dy)) { open = [tx + dx, ty + dy]; break; }
    if (!open) row("open ground beside the player for the flight", false, "none within four tiles");
    else {
      const rab = spawn("rabbit", open[0], open[1]);
      const d0 = Math.hypot(rab.gx - me.gx, rab.gy - me.gy);
      step(20);
      const fled = rab.state === "flee" && rab.anim.name === "run";
      step(90);
      const d1 = Math.hypot(rab.gx - me.gx, rab.gy - me.gy);
      row("a rabbit that sees a player runs (its run, at its run's speed) and gets away", fled && d1 > d0 + 2, `state ${fled ? "flee, run" : rab.state} after a third of a second; ${d0.toFixed(1)} tiles to ${d1.toFixed(1)}`);
      // Far off, nothing near: it stands alert, then settles.
      G.teleport(rab.gx + 18, rab.gy); // past its clear distance, inside the active box (far enough and it would stand frozen mid-flight, unstepped)
      step(60 * 4);
      row("with nothing within its clear distance it settles again", ["idle", "eat", "wander"].includes(rab.state), rab.state);
      G.teleport(meAt[0], meAt[1]);
      step();
      // A deer, the player out of its sight, one of the dead beside it.
      const deer = spawn("deer", open[0], open[1]);
      const zx = open[0] + (open[0] - tx) * 0.5;
      const zy = open[1] + (open[1] - ty) * 0.5;
      G.teleport(open[0] - (open[0] - tx) * 4 - (open[1] - ty) * 4, open[1] - (open[1] - ty) * 4 + (open[0] - tx) * 4); // well back, so the player is not what it runs from
      const meD = Math.hypot(me.gx - deer.gx, me.gy - deer.gy);
      const z = createZombie(deer.gx + 2, deer.gy, { aggro: false });
      z.state = "idle";
      S.zombies.push(z);
      restore.push(() => { const i = S.zombies.indexOf(z); if (i >= 0) S.zombies.splice(i, 1); });
      deer.lookTimer = 0;
      step(20);
      row("a deer flees one of the dead on sight", deer.state === "flee" && deer.anim.name === "run", `state ${deer.state}, anim ${deer.anim.name}; the player ${meD.toFixed(1)} tiles off (its sight ${A.speciesOf("deer").flee.sight})`);
      // The dead ignore them: none of the dead targets an animal or counts it among the living.
      G.rules.rules.zombieAggro = true;
      const z2 = createZombie(hen.gx + 1, hen.gy);
      S.zombies.push(z2);
      restore.push(() => { const i = S.zombies.indexOf(z2); if (i >= 0) S.zombies.splice(i, 1); });
      const henHp = hen.hp;
      let targeted = false;
      for (let i = 0; i < 120; i++) { step(); if (S.zombies.some((q) => q.target && q.target.kind === "animal")) targeted = true; }
      G.rules.rules.zombieAggro = false;
      row("the dead ignore animals: never a target, never one of the living they hunt, never hurt", !targeted && !S.others.some((c) => c.kind === "animal") && hen.hp === henHp, `targeted ${targeted}, in the living ${S.others.some((c) => c.kind === "animal")}, hen hp ${henHp} to ${hen.hp}`);
      G.teleport(meAt[0], meAt[1]);
      step();
    }

    // ---- Object Highlight and the Look at line, on a hen under the pointer ----
    if (typeof document !== "undefined") {
      hen.gx = me.gx + 2;
      hen.gy = me.gy + 1;
      hen.state = "idle";
      hen.path = [];
      hen.idleTimer = 99;
      step();
      const sheet = assets.getSheet(hen.sprite);
      const p = iso.toScreen(hen.gx, hen.gy);
      let at = null;
      for (let dy = 0; dy < sheet.anchor[1] && !at; dy++) for (let dx = -6; dx <= 6 && !at; dx++) { const sx = p.x + dx; const sy = p.y - dy; if (interact.characterAt(sx, sy, me) === hen) at = [sx, sy]; }
      const acts = at ? interact.actionsAt(at[0], at[1], me) : [];
      const look = acts.find((a) => a.label === "Look at the hen");
      const t = at ? highlight.targetAt(at[0], at[1], me, null) : null;
      row("an animal under the pointer is found by its own pixels, not a figure's tall box", !!at && interact.characterAt(p.x, p.y - sheet.anchor[1] - 20, me) !== hen, at ? `at ${at.map(Math.round)}` : "no pixel of it under any point tried");
      row("its menu has Look at the hen, the asking client's own (local)", !!look && look.local === true && look.enabled !== false, acts.map((a) => a.label).join(", ") || "no actions");
      row("Object Highlight outlines it", !!t && t.kind === "character" && t.id === hen.id, JSON.stringify(t));
      const before = document.querySelector("#prompt-message, .message")?.textContent || "";
      if (look) interact.runAction(me, look);
      const line = A.lookLine(hen);
      row("Look at says what it is and what it is doing", /hen/.test(line) && line !== before, line);
    }

    // ---- the renewal at a wild home ----
    {
      const sp = "deer";
      const h = { id: "hcheck", species: sp, at: [10, 10], count: 2, cap: 2, renew: true, nextAt: null };
      const list = [A.createAnimal(sp, 10, 10, { id: "rc1", homeId: "hcheck" })];
      const R = A.renewRule();
      const c0 = clock.getElapsed();
      restore.push(() => clock.setElapsed(c0));
      let born = A.renewHomes([h], list, []);
      const timed = born.length === 0 && h.nextAt !== null && Math.abs(h.nextAt - (c0 + R.seconds)) < 1e-6;
      clock.setElapsed(c0 + R.seconds - 1);
      born = A.renewHomes([h], list, []);
      const early = born.length;
      clock.setElapsed(c0 + R.seconds + 1);
      const near = A.renewHomes([h], list, [{ gx: 12, gy: 10, dead: false }]).length;
      born = A.renewHomes([h], list, []);
      const one = born.length === 1 && born[0].homeId === "hcheck" && born[0].gx === 10 && born[0].gy === 10;
      list.push(...born);
      clock.setElapsed(c0 + R.seconds * 5);
      const past = A.renewHomes([h], list, []).length;
      const tame = { id: "htame", species: "cow", at: [0, 0], count: 2, cap: 2, renew: false, nextAt: null };
      clock.setElapsed(c0 + R.seconds * 9);
      const tameBorn = A.renewHomes([tame], [], []).length;
      clock.setElapsed(c0); // at once: the world's own homes must not see the time jump
      row("a wild home below its cap has one back after its time (renew.seconds of the clock), at its spot", timed && early === 0 && one, `timer ${timed}, early ${early}, then ${one ? "one at the spot" : "not one"}`);
      row("never while a player is within its clear distance, never past the cap, and tame stock is not renewed", near === 0 && past === 0 && tameBorn === 0, `with a player near ${near}, at the cap ${past}, tame ${tameBorn}`);
    }

    // ---- a pen holds its stock with the gate shut; opened, they wander out and drift back ----
    const byre = ((S.info && S.info.places) || []).find((p) => p.name === "Hollow Farm's byre");
    const cows = S.animals.filter((a) => a.species === "cow" && !a.dead);
    if (byre && cows.length) {
      const [rx, ry, rw, rh] = byre.box;
      let gate = null;
      for (let y = ry; y < ry + rh && !gate; y++) for (let x = rx; x <= rx + rw && !gate; x++) { const w = G.map.tileAt(x, y).w; if (w && w.kind === "door") gate = { w, x, y }; }
      for (const c of cows) keep(c);
      G.teleport(rx + rw + 6, ry + rh / 2);
      step(30);
      const inside = (c) => c.gx > rx && c.gx < rx + rw - 1 + 0.5 && c.gy > ry && c.gy < ry + rh - 1 + 0.5;
      let out = 0;
      for (let i = 0; i < 60 * 40; i++) { for (const c of cows) if (c.state === "idle" || c.state === "eat") c.idleTimer = Math.min(c.idleTimer, 0.3); step(); if (cows.some((c) => !inside(c))) out++; }
      row("a pen with its gate shut keeps its stock (forty seconds of walking)", !!gate && !gate.w.open && out === 0, gate ? `gate at ${gate.x},${gate.y}, ${out} steps with one outside` : "no gate found on the byre");
      if (gate) {
        const open0 = gate.w.open;
        restore.push(() => { gate.w.open = open0; });
        gate.w.open = true;
        const c = cows[0];
        c.gx = gate.x + 3;
        c.gy = gate.y;
        c.path = [];
        c.state = "idle";
        c.idleTimer = 0;
        const far0 = Math.hypot(c.gx - c.home[0], c.gy - c.home[1]);
        let nearest = far0;
        for (let i = 0; i < 60 * 40; i++) { if (c.state === "idle" || c.state === "eat") c.idleTimer = Math.min(c.idleTimer, 0.3); step(); nearest = Math.min(nearest, Math.hypot(c.gx - c.home[0], c.gy - c.home[1])); }
        const sp = A.speciesOf("cow");
        row("a cow outside a pen left open wanders toward its home and stays near it", nearest <= sp.wander && Math.hypot(c.gx - c.home[0], c.gy - c.home[1]) <= sp.wander + 1, `${far0.toFixed(1)} tiles from home at first, ${nearest.toFixed(1)} at nearest, ${Math.hypot(c.gx - c.home[0], c.gy - c.home[1]).toFixed(1)} at the end`);
      }
      G.teleport(meAt[0], meAt[1]);
    } else row("the byre and its cows for the pen's test", false, byre ? "no cows" : "no byre (run on the valley)");

    // ---- the record and the save ----
    {
      const a = hen;
      const back = A.restoreAnimal(JSON.parse(JSON.stringify(A.serializeAnimal(a))));
      const same = ["id", "species", "gx", "gy", "state", "facing", "hp", "dead", "homeId"].every((k) => back[k] === a[k]) && back.sprite === a.sprite && back.anim.name === a.anim.name;
      const saved = G.game.serialize();
      row("an animal's record comes back whole, its sheet named again; the save holds every animal and every home", same && saved.characters.animals.length === S.animals.length && saved.animalHomes.length === S.animalHomes.length, `${saved.characters.animals.length} animals, ${saved.animalHomes.length} homes in the save`);
      const parts = G.game.syncParts();
      row("the sync check has an animals part, and the counts name them", typeof parts.animals === "string" && /animals/.test(parts.counts), `${parts.animals} (${parts.counts})`);
    }
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const a of added) { const i = S.animals.indexOf(a); if (i >= 0) S.animals.splice(i, 1); }
    S.animals.splice(0, S.animals.length, ...S.animals.filter((a) => ids0.has(a.id)));
    S.animalHomes.forEach((h, i) => { h.nextAt = homes0[i]; });
    for (const r of restore.reverse()) r();
    G.rules.rules.zombieAggro = aggro0;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
