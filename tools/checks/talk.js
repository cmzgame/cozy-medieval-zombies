// Talk, part 1 (docs/34, #198): the data, the module, the barks, and the guide. From the console, on a tab with `?nosave` (the valley):
//   await __game.check("talk")
// It reads every file under data/talk through the module (every node reachable, every condition evaluated in day, night, dawn, and dusk),
// finds the guide beside the spawn (the valley's and the staging map's), pokes them by day, by night, at dawn, and with the dead near, proves
// the ambient bark's radius and cooldown and that it never comes from a villager who is talking or dead (a wounded one still barks), and that a bark leaves the
// sim's generator where it was. It puts every field it touches back.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const talk = await import("/src/talk.js");
  const { pokeVillager, updateVillager } = await import("/src/entities/villager.js");
  const { createZombie } = await import("/src/entities/zombie.js");
  const logMod = await import("/src/ui/log.js");
  const tp = await import("/src/ui/talk-panel.js");
  const wasPaused = G.loop.isPaused();
  const hour0 = G.clock.getHour();
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const restore = [];
  // With a screen up (the title on a fresh tab) the step skips the talk panel's update and the keys: the check puts the screen away and brings it back.
  const screen0 = G.screens.currentScreen();
  try {
    if (screen0) G.screens.hide();
    G.loop.setPaused(true);
    const ids = talk.ids();
    const want = ["guide", "innkeeper", "guest", "child", "priest", "reeve", "apprentice", "neighbour"];
    row("the guide's file and the seven villagers' are loaded", want.every((i) => ids.includes(i)), ids.join(", "));

    // Every file walked through the module: each node reachable from `start`, every option's goto a node, every `when` evaluated (an unknown condition throws).
    const roster = new Set(S.info.villagers.map((v) => v.talk || String(v.name).toLowerCase()));
    const world = { zombies: S.zombies, villagers: S.villagers, roster };
    const probe = S.villagers.find((v) => v.talk === "guide") || S.villagers[0];
    const problems = [];
    let nodesSeen = 0;
    for (const hour of [12, 23, 6.5, 22.5]) {
      G.clock.setHour(hour);
      const ctx = talk.contextFor(probe, me, world);
      for (const id of ids) {
        const file = talk.get(id);
        for (const g of file.barks) talk.matches(g.when, ctx);
        const seen = new Set();
        const todo = [file.start];
        while (todo.length) {
          const nid = todo.pop();
          if (seen.has(nid)) continue;
          seen.add(nid);
          const n = talk.node(id, nid, ctx);
          if (!n) { problems.push(`${id}/${nid} is not a node`); continue; }
          if (!n.say.length && !n.options.length && !n.end) problems.push(`${id}/${nid} says nothing at hour ${hour}`);
          for (const o of (file.nodes[nid].options || [])) if (o.goto) todo.push(o.goto);
        }
        nodesSeen += seen.size;
        for (const nid of Object.keys(file.nodes)) if (!seen.has(nid)) problems.push(`${id}/${nid} is not reachable`);
      }
    }
    restore.push(() => G.clock.setHour(hour0));
    row("every talk file's every node is reachable and evaluates in day, night, dawn, and dusk", problems.length === 0 && nodesSeen > 40, problems.length ? problems.slice(0, 4).join("; ") : `${nodesSeen} node visits over four times of day`);

    // The guide: one, immune, beside the spawn, on every map the generator makes.
    const guides = S.villagers.filter((v) => v.guide);
    const g = guides[0];
    row("the valley has exactly one guide, immune to the dead, who stands within 3 tiles of the spawn", guides.length === 1 && g.immune && Math.hypot(g.home[0] - S.info.spawn[0], g.home[1] - S.info.spawn[1]) <= 3 && talk.has(g.talk), g ? `${g.name} at ${g.home}, spawn ${S.info.spawn}` : "no guide");
    const staging = await (await fetch("/data/maps/staging.json")).json();
    const sg = staging.villagers.filter((v) => v.guide);
    row("so does the staging map", sg.length === 1 && sg[0].immune && Math.hypot(sg[0].tile[0] - staging.spawn[0], sg[0].tile[1] - staging.spawn[1]) <= 3 && talk.has(sg[0].talk || String(sg[0].name).toLowerCase()), sg[0] ? `${sg[0].name} at ${sg[0].tile}, spawn ${staging.spawn}` : "no guide");
    const topics = talk.get("guide").nodes.hello.options.filter((o) => o.wiki).length;
    row("the guide's questions each carry a wiki link, and a topic exists for every system a new player meets", topics >= 12, `${topics} topics with a link`);

    // Pokes: by day, by night, at dawn, and with the dead near, each a line from the matching group, in turn.
    const saved = { barkTurns: g.barkTurns, barkAt: g.barkAt, line: g.line, state: g.state, pokedAt: g.pokedAt, hp: g.hp, talkTimer: g.talkTimer };
    restore.push(() => Object.assign(g, saved));
    // Any of the dead within eight tiles of the guide are taken off the board for the quiet scenarios, and the check puts them back.
    const nearby = S.zombies.filter((q) => Math.hypot(q.gx - g.gx, q.gy - g.gy) <= 8);
    for (const q of nearby) S.zombies.splice(S.zombies.indexOf(q), 1);
    restore.push(() => { for (const q of nearby) if (!S.zombies.includes(q)) S.zombies.push(q); });
    const z = createZombie(g.gx + 3, g.gy); // made now: a zombie rolls its look, and the generator row below is about the pokes
    const rngBefore = JSON.stringify(G.rng.getState());
    const poke = () => { g.pokedAt = -1e9; g.state = "idle"; pokeVillager(g, me); return g.line && g.line.text; };
    const guideFile = talk.get("guide");
    const group = (pred) => guideFile.barks.find(pred);
    row("the welcome lands: no dead stand within the `deadNear` radius of the spawn or of the guide at the start", nearby.length === 0 && !S.zombies.some((q) => Math.hypot(q.gx - S.info.spawn[0], q.gy - S.info.spawn[1]) <= 8), `${nearby.length} near the guide`);
    G.clock.setHour(12);
    g.barkTurns = {};
    const welcome = poke();
    row("so the first poke at the start of a world is the guide's pointer bark, not a warning", welcome === group((b) => !b.when).lines[0], welcome);
    G.clock.setHour(12);
    g.barkTurns = {};
    const day1 = poke();
    const day2 = poke();
    const fallback = group((b) => !b.when);
    row("a poke by day is the fallback group, its lines in turn", day1 === fallback.lines[0] && day2 === fallback.lines[1], `${day1} / ${day2}`);
    G.clock.setHour(23);
    g.barkTurns = {};
    const n1 = poke();
    const n2 = poke();
    const nightGroup = group((b) => b.when && b.when.time === "night");
    row("a poke by night is the night group", n1 === nightGroup.lines[0] && n2 === nightGroup.lines[1], `${n1} / ${n2}`);
    G.clock.setHour(6.5);
    g.barkTurns = {};
    const dawn = poke();
    row("a poke at dawn is the dawn group", dawn === group((b) => b.when && b.when.time === "dawn").lines[0], dawn);
    G.clock.setHour(12);
    S.zombies.push(z);
    restore.push(() => { const i = S.zombies.indexOf(z); if (i >= 0) S.zombies.splice(i, 1); });
    g.barkTurns = {};
    const dead1 = poke();
    row("a poke with one of the dead near is the dead-near group, first in its order", dead1 === group((b) => b.when && b.when.deadNear).lines[0], dead1);
    S.zombies.splice(S.zombies.indexOf(z), 1);
    row("a bark never shifts the sim's generator: the rng's state is the same before and after the pokes", JSON.stringify(G.rng.getState()) === rngBefore, "state unchanged");

    // A villager with no file says their map line.
    const mute = S.villagers.find((v) => v.name === "Child");
    const prevTalk = mute.talk;
    const muteWas = { state: mute.state, line: mute.line, pokedAt: mute.pokedAt, facing: mute.facing, path: mute.path, talkTimer: mute.talkTimer, barkTurns: mute.barkTurns };
    mute.talk = "nobody";
    mute.pokedAt = -1e9;
    pokeVillager(mute, me);
    row("a villager whose talk id has no file says their map line (or the greeting)", mute.line && mute.line.text === mute.greeting, mute.line && mute.line.text);
    mute.talk = prevTalk;
    Object.assign(mute, muteWas);

    // Each group takes its own turns, and a group not marked ambient is for pokes alone: a probe file with one of each.
    const original = Object.fromEntries(talk.ids().map((id) => [id, talk.get(id)]));
    talk.load({ ...original, probe: { barks: [{ lines: ["a1", "a2"] }, { ambient: true, lines: ["b1", "b2"] }] } });
    restore.push(() => talk.load(original));
    const pv = { talk: "probe", barkTurns: {} };
    const pctx = talk.contextFor(g, null, world);
    const seq = [talk.barkFor(pv, pctx), talk.barkFor(pv, pctx, { ambient: true }), talk.barkFor(pv, pctx), talk.barkFor(pv, pctx, { ambient: true }), talk.barkFor(pv, pctx)];
    talk.load(original);
    row("a poke hears every group and an unprompted bark only the ambient ones, each group taking its own turns", seq.join(",") === "a1,b1,a2,b2,a1", seq.join(","));

    // A line ages in the world's step on the authority (#154): said, it ends on its own, with nobody near to say another.
    G.teleport(g.gx + 30, g.gy);
    g.line = { text: "Hello.", left: 2.04 };
    step(30);
    const midLeft = g.line && g.line.left;
    step(120);
    row("a speech line counts down in the world's step and is gone after its time (a server world never runs the interface)", midLeft > 1 && midLeft < 2.04 && g.line === null, `left ${midLeft && midLeft.toFixed(2)} after half a second, then ${g.line === null ? "gone" : "still up"}`);

    // Ambient barks: radius, cooldown, and never from the talking or the dead; a wounded villager still barks (Michael, 2026-10-18).
    const tick = () => { for (let i = 0; i < 2; i++) updateVillager(g, 1 / 60, S.others, S.players); }; // the villager's own update, not the world's step: a dead one would be turned
    const near = () => { G.teleport(g.gx + 2, g.gy); };
    const resetBark = () => { g.line = null; g.barkAt = null; g.state = "idle"; g.hp = 100; g.dead = false; };
    G.clock.setHour(12);
    resetBark();
    near();
    tick();
    const first = g.line && g.line.text;
    row("with a living player within the radius the guide says an ambient bark", !!first && g.barkAt !== null && guideFile.barks.filter((b) => b.ambient).some((b) => b.lines.includes(first)), String(first));
    const turn1 = JSON.stringify(g.barkTurns);
    g.line = null;
    g.state = "idle";
    g.barkAt = G.loop.simTime() - 30;
    tick();
    row("not twice inside the cooldown", g.line === null && JSON.stringify(g.barkTurns) === turn1, `30 s after the last: ${g.line ? g.line.text : "silent"}`);
    g.barkAt = G.loop.simTime() - 61;
    tick();
    row("but again once it has passed", !!g.line && JSON.stringify(g.barkTurns) !== turn1, g.line ? g.line.text : "silent");
    resetBark();
    G.teleport(g.gx + 8, g.gy);
    tick();
    row("not with the player past the radius", g.line === null, g.line ? g.line.text : "silent at 8 tiles");
    near();
    for (const [label, apply] of [["talking", () => { g.state = "talk"; g.talkTimer = 99; }], ["dead", () => { g.dead = true; }]]) {
      resetBark();
      apply();
      tick();
      row(`never from a villager who is ${label}`, g.line === null, g.line ? g.line.text : "silent");
    }
    resetBark();

    // ---- Conversations (docs/34, part 2): the menu's Talk, the panel, its endings, and "talk writes nothing" ----
    resetBark();
    G.clock.setHour(12);
    const panel = () => document.getElementById("talk");
    const shown = () => !!panel() && !panel().hidden && panel().innerHTML.length > 0;
    const click = (sel) => { const el = panel() && panel().querySelector(sel); if (el) el.click(); return !!el; };
    const textOf = () => (panel() ? panel().innerText : "");
    const freeze = () => { for (const q of nearbyAgain) if (S.zombies.includes(q)) S.zombies.splice(S.zombies.indexOf(q), 1); };
    const nearbyAgain = S.zombies.filter((q) => Math.hypot(q.gx - g.gx, q.gy - g.gy) <= 9);
    freeze();
    restore.push(() => { for (const q of nearbyAgain) if (!S.zombies.includes(q)) S.zombies.push(q); });
    const talkLabel = (v) => G.interact.actionsForTarget({ kind: "character", id: v.id }, me).find((a) => /^Talk to/.test(a.label));
    near();
    step();
    const entry = talkLabel(g);
    row("a villager's menu offers Talk to <name>, a simple action (so E does it), beside Poke", !!entry && entry.simple === true && entry.enabled !== false && G.interact.actionsForTarget({ kind: "character", id: g.id }, me).some((a) => /^Poke/.test(a.label)), entry ? entry.label : "none");
    G.teleport(g.gx + 0.3, g.gy); // in the villager's own tile: nearer than the window and the door beside the yard
    step();
    const nearest = G.interact.nearestSimpleAction(me);
    row("E with a villager the nearest thing in reach is Talk to them, and the prompt names them", !!nearest && /^Talk to Wyn/.test(nearest.label), nearest ? nearest.label : "none");
    const started = G.interact.performByLabel(me, { kind: "character", id: g.id }, entry.label);
    for (let i = 0; i < 100 && me.action; i++) G.interact.updateAction(me, 0.1);
    row("Talk stops the villager and turns them to the talker, who is added to talkingWith; the panel opens on the first line", started === true && g.state === "talk" && g.talkingWith.includes(me.id) && shown() && /Oh, hello|Quick words|Up late/.test(textOf()), `${g.state} with ${g.talkingWith.join(",")}; panel ${shown() ? textOf().slice(0, 50).replace(/\n/g, " ") : "shut"}`);
    row("the panel is click-only (no field, no key handler): Continue between lines, then buttons", !!panel().querySelector("[data-continue]") && !panel().querySelector("input, textarea") && !panel().onkeydown && !panel().onkeypress, `${panel().querySelectorAll("button").length} buttons`);
    click("[data-continue]");
    const topicCount = panel().querySelectorAll("[data-opt]").length;
    row("after the lines come the topics, each with its wiki link", topicCount >= 10 && panel().querySelectorAll("a.tk-wiki").length >= 10 && /wiki\/water\.html|cmz-wiki\/water/.test(panel().innerHTML), `${topicCount} topics, ${panel().querySelectorAll("a.tk-wiki").length} links; target ${(panel().querySelector("a.tk-wiki") || {}).target}`);
    row("each line the villager says is in the talker's own log, in their name", /Wyn: /.test(logMod.lines().slice(-1)[0] || "") || logMod.lines().slice(-4).some((l) => /Wyn/.test(l)), logMod.lines().slice(-1)[0]);
    const optionTexts = () => [...panel().querySelectorAll("[data-opt]")].map((b) => b.textContent);
    row("an option whose `when` fails is not shown: nothing is said of the dead while none is in the world", S.zombies.length === 0 ? !optionTexts().includes("What happened to everyone?") : true, `${optionTexts().length} options, ${S.zombies.length} dead`);
    S.zombies.push(createZombie(g.gx + 40, g.gy + 40)); // one of the dead, far: the topic appears
    restore.push(() => { S.zombies.pop(); });
    click("[data-bye]");
    row("That's all for now closes it and the villager wanders again", !shown() && !g.talkingWith.length && g.state === "idle", `${g.state}, panel ${shown() ? "open" : "shut"}`);
    G.interact.performByLabel(me, { kind: "character", id: g.id }, entry.label);
    click("[data-continue]");
    const deadTopic = optionTexts().includes("What happened to everyone?");
    row("with one of the dead in the world the same topic is offered", deadTopic, optionTexts().join(" | ").slice(0, 100));
    S.zombies.pop();
    // Every path of the guide's file, by the panel's own buttons, depth first; the world's text before and after.
    const strip = (txt) => { const w = JSON.parse(txt); for (const v of w.characters.villagers) { for (const k of ["state", "facing", "talkingWith", "barkTurns", "barkAt", "idleTimer", "path", "anim", "talkTimer", "pokedAt", "stuckTime", "repathTimer", "lastGoal", "pathFailed"]) delete v[k]; } return JSON.stringify(w); };
    const worldText = () => strip(JSON.stringify(G.game.serialize()));
    const firstDiff = (a, b, path = "") => {
      if (a === b) return null;
      if (a && b && typeof a === "object" && typeof b === "object") {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; }
        return null;
      }
      return `${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
    };
    const before = worldText();
    const seen = new Set();
    const walk = (depth) => {
      if (depth > 6 || !shown()) return;
      for (let guard = 0; guard < 8 && panel().querySelector("[data-continue]"); guard++) click("[data-continue]");
      const key = panel().querySelector(".tk-say") ? panel().querySelector(".tk-say").textContent : "";
      if (seen.has(key)) return;
      seen.add(key);
      const n = panel().querySelectorAll("[data-opt]").length;
      for (let k = 0; k < n && shown(); k++) {
        const btn = panel().querySelectorAll("[data-opt]")[k];
        if (!btn) break;
        const text = btn.textContent;
        if (/Something else/.test(text)) continue;
        click(`[data-opt="${k}"]`);
        walk(depth + 1);
        if (!shown()) break;
        // back to the questions to try the next one
        for (let guard = 0; guard < 8 && panel().querySelector("[data-continue]"); guard++) click("[data-continue]");
        const back = [...panel().querySelectorAll("[data-opt]")].findIndex((b) => /Something else/.test(b.textContent));
        if (back >= 0) click(`[data-opt="${back}"]`);
        for (let guard = 0; guard < 8 && panel().querySelector("[data-continue]"); guard++) click("[data-continue]");
      }
    };
    walk(0);
    click("[data-close]");
    const after = worldText();
    row("talk writes nothing: every question of the guide asked through the panel, and the world's text is the same but for the villager's own state", seen.size >= 14 && before === after, `${seen.size} distinct lines seen; ${before === after ? "identical" : "DIFFERS at " + firstDiff(JSON.parse(before), JSON.parse(after))}`);
    // The endings: walking away, the villager struck, Escape.
    G.interact.performByLabel(me, { kind: "character", id: g.id }, entry.label);
    G.teleport(g.gx + 8, g.gy);
    step(3);
    tp.update(me);
    step(2);
    row("walking out of reach (and a tile) ends it: the host drops the talker, the panel closes, and the villager wanders again", !g.talkingWith.length && g.state !== "talk" && !shown(), `${g.state}; talkingWith ${g.talkingWith.join(",") || "none"}`);
    G.teleport(g.gx + 1.2, g.gy);
    step();
    G.interact.performByLabel(me, { kind: "character", id: g.id }, entry.label);
    g.hp = 60;
    g.state = "hurt";
    g.hurtTimer = 0.3;
    step(2);
    tp.update(me);
    row("the villager struck ends it", !g.talkingWith.length && !shown(), `${g.state}`);
    g.hp = 100;
    g.state = "idle";
    G.teleport(g.gx + 1.2, g.gy);
    step();
    G.interact.performByLabel(me, { kind: "character", id: g.id }, entry.label);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    row("Escape closes it, ahead of the pause menu", !shown() && !g.talkingWith.length, `panel ${shown() ? "open" : "shut"}`);
    // A wounded villager still talks (Michael, 2026-10-18): Talk is offered, enabled, and opens the panel.
    g.hp = 50;
    g.state = "idle";
    G.teleport(g.gx + 1.2, g.gy);
    step();
    const woundedEntry = talkLabel(g);
    G.interact.performByLabel(me, { kind: "character", id: g.id }, woundedEntry ? woundedEntry.label : "Talk to Wyn");
    row("a wounded villager still talks: Talk is offered and enabled, and the panel opens", !!woundedEntry && woundedEntry.enabled !== false && !/hurt/.test(woundedEntry.label) && g.talkingWith.includes(me.id) && shown(), woundedEntry ? woundedEntry.label : "no Talk entry");
    click("[data-close]");
    g.hp = 100;
    g.state = "idle";
    // The dead close by: a bark, not a conversation.
    const z2 = createZombie(g.gx + 3, g.gy);
    S.zombies.push(z2);
    G.interact.performByLabel(me, { kind: "character", id: g.id }, entry.label);
    row("with the dead within five tiles they bark instead of talking", !g.talkingWith.length && !shown() && !!g.line, g.line ? g.line.text : "silent");
    S.zombies.splice(S.zombies.indexOf(z2), 1);
    // A villager whose talk id has no file has no conversation.
    const child = S.villagers.find((v) => v.name === "Child");
    const childTalk = child.talk;
    child.talk = "nobody";
    G.teleport(child.gx + 1.2, child.gy);
    step();
    const noFile = G.interact.performByLabel(me, { kind: "character", id: child.id }, "Talk to Child");
    row("a villager with no file has no conversation (a bark: their map line)", noFile === true && !child.talkingWith.length && !shown(), "map line");
    child.talk = childTalk;
    child.state = "idle";
    child.line = null;

    // ---- The review of #230: a wall, a second villager, the world running with the panel open, and every villager's file ----
    const vmod = await import("/src/entities/villager.js");
    const stand = (v) => { G.teleport(v.gx + 1.2, v.gy); step(); };
    // A wall between the talker and the villager: Talk is not offered, and startTalk refuses (no panel, no hold).
    const gx0 = Math.round(g.gx);
    const gy0 = Math.round(g.gy);
    G.teleport(gx0 - 1 + 0.1, gy0 + 0.1);
    G.map.buildWall(gx0, gy0, "w", "wall", "wall_wood");
    restore.push(() => G.map.destroyWall(gx0, gy0, "w"));
    const offered = G.interact.actionsForTarget({ kind: "character", id: g.id }, me).some((a) => /^Talk to/.test(a.label));
    const refused = vmod.startTalk(g, me);
    row("through a wall Talk is not offered and startTalk refuses it (no hold, no panel)", !offered && refused === false && !g.talkingWith.length && !shown(), `offered ${offered}; startTalk ${refused}; ${g.state}`);
    G.map.destroyWall(gx0, gy0, "w");
    // A second villager's talk ends the first one on the host.
    const second = S.villagers.find((v) => v !== g && talk.has(v.talk) && v.hp >= (v.maxHp ?? 100));
    const at2 = [second.gx, second.gy];
    restore.push(() => { second.gx = at2[0]; second.gy = at2[1]; second.state = "idle"; second.talkingWith = []; });
    second.gx = g.gx + 0.8;
    second.gy = g.gy + 1.1;
    G.teleport(g.gx + 1.2, g.gy);
    step();
    g.hp = g.maxHp ?? 100;
    G.interact.performByLabel(me, { kind: "character", id: g.id }, `Talk to ${g.name}`);
    const firstHeld = g.talkingWith.includes(me.id) && shown();
    G.interact.performByLabel(me, { kind: "character", id: second.id }, `Talk to ${second.name}`);
    row("talking to a second villager ends the first conversation on the host, and the panel is the second's", firstHeld && !g.talkingWith.length && g.state !== "talk" && second.talkingWith.includes(me.id) && shown() && textOf().toLowerCase().includes(String(second.name).toLowerCase()), `${g.name}: ${g.state} with ${g.talkingWith.join(",") || "no one"}; ${second.name}: ${second.state} with ${second.talkingWith.join(",")}`);
    // The world runs with the panel open: only the pause menu stops the game.
    const t0 = G.loop.simTime();
    const belt = G.inventory.beltOf(me);
    const hand0 = me.hands.main;
    const slot0 = belt[0];
    const torch = G.items.makeEntry("hammer", 1); // anything that is not a consumable swaps with the hand
    belt[0] = torch;
    me.hands.main = G.items.makeEntry("hatchet", 1);
    restore.push(() => { belt[0] = slot0; me.hands.main = hand0; });
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1" }));
    step(60);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit1" }));
    row("with the panel open the world runs and the belt keys still act (the clock advances, 1 swaps the belt's slot into the hand)", shown() && G.loop.simTime() > t0 + 0.9 && me.hands.main === torch, `clock +${(G.loop.simTime() - t0).toFixed(2)} s; panel ${shown() ? "open" : "shut"}; main hand ${me.hands.main ? me.hands.main.id : "empty"}`);
    click("[data-close]");
    // Every villager's file, asked through the panel's own buttons: the world's text is the same afterwards but for the villager's own state.
    const zs = S.zombies.splice(0);
    restore.push(() => { S.zombies.push(...zs); });
    const walked = [];
    let allSame = true;
    for (const v of S.villagers) {
      if (!talk.has(v.talk)) continue;
      v.hp = v.maxHp ?? 100;
      v.state = "idle";
      v.talkingWith = [];
      for (const [dx, dy] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) { // a side of them with a clear line (one may be a wall)
        if (!G.map.isWalkableTile(Math.round(v.gx + dx), Math.round(v.gy + dy)) || G.map.wallBetween(Math.round(v.gx), Math.round(v.gy), Math.round(v.gx + dx), Math.round(v.gy + dy))) continue;
        G.teleport(v.gx + dx, v.gy + dy);
        break;
      }
      step();
      if (!G.interact.performByLabel(me, { kind: "character", id: v.id }, `Talk to ${v.name}`) || !shown()) { walked.push(`${v.name}: no panel`); continue; }
      const beforeV = worldText();
      seen.clear();
      walk(0);
      click("[data-close]");
      const same = worldText() === beforeV;
      if (!same) allSame = false;
      walked.push(`${v.name} ${seen.size}${same ? "" : " DIFFERS"}`);
    }
    row("every villager's file asked through the panel leaves the world's text the same, the generator included", allSame && walked.length >= 8 && !walked.some((w) => /no panel/.test(w)), walked.join(", "));
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const r of restore.reverse()) r();
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
    if (screen0 && !G.screens.currentScreen()) G.screens.show(screen0);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
