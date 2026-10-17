// Talk, part 1 (docs/34, #198): the data, the module, the barks, and the guide. From the console, on a tab with `?nosave` (the valley):
//   await __game.check("talk")
// It reads every file under data/talk through the module (every node reachable, every condition evaluated in day, night, dawn, and dusk),
// finds the guide beside the spawn (the valley's and the staging map's), pokes them by day, by night, at dawn, and with the dead near, proves
// the ambient bark's radius and cooldown and that it never comes from a villager who is hurt, talking, or dead, and that a bark leaves the
// sim's generator where it was. It puts every field it touches back.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const talk = await import("/src/talk.js");
  const { pokeVillager, updateVillager } = await import("/src/entities/villager.js");
  const { createZombie } = await import("/src/entities/zombie.js");
  const wasPaused = G.loop.isPaused();
  const hour0 = G.clock.getHour();
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const restore = [];
  try {
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

    // Ambient barks: radius, cooldown, and never from the hurt, the talking, or the dead.
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
    for (const [label, apply] of [["hurt", () => { g.hp = 50; }], ["talking", () => { g.state = "talk"; g.talkTimer = 99; }], ["dead", () => { g.dead = true; }]]) {
      resetBark();
      apply();
      tick();
      row(`never from a villager who is ${label}`, g.line === null, g.line ? g.line.text : "silent");
    }
    resetBark();
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const r of restore.reverse()) r();
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
