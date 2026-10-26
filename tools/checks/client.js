// The client's own side of a world (docs/31/05 items 7 and 26, docs/31/07 question 14; #102). From the console, on a tab
// with `?nosave`:
//   await __game.check("client")
// Alone or on the host: `client.me` is my player and follows the world's picks (a second player picked and me again), and a
// friend joining a world with no pick of its own (a dead host's, played again) takes the world's pick and never `client.me`;
// the swing's targets are ids in a set the client holds, never a flag on a body, and a body's record (the save's and the
// wire's) carries no such flag; no character carries a `behindProp`; a dead speaker's line is left to the world's step,
// never cleared by the bubbles; the host's console writes. On a guest (two tabs, `?nosave&relay=none`, after a join and
// some frames): `client.me` is the player my welcome named and in the replica's list; the console is read-only, every
// writing helper refusing with why and the replica unchanged by the attempts, and its reads still answering. Everything
// moved is put back: the second and third players gone, the zombie where it stood, the hands, and the pick.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const { client } = await import("/src/client.js");
  const { serializeCharacter } = await import("/src/entities/character.js");
  const speech = await import("/src/ui/speech.js");
  const items = await import("/src/items.js");
  const role = G.net.status().role;
  const me = G.player;
  const chars = () => [...S.players, ...S.zombies, ...S.villagers, ...S.corpses, ...S.animals];
  let other = null;
  let joiner = null;
  let moved = null;
  const hands0 = me ? { main: me.hands.main, off: me.hands.off } : null;
  try {
    if (!me) throw new Error("no player: run it in a world");
    if (role === "guest") {
      const st = G.net.status();
      row("on a guest client.me is the player my welcome named, in the replica's list", G.player === client.me && client.me.id === st.myPlayerId && S.players.includes(client.me), `me ${client.me.id}, the welcome's ${st.myPlayerId}, ${st.framesSeen} frames seen; the world's own pick ${S.player ? S.player.id : "none"}`);
      const bag = G.inventory.bagOf(me);
      const before = JSON.stringify({ gx: me.gx, gy: me.gy, look: me.look, bag: bag ? bag.items.map((e) => `${e.id}x${e.count || 1}`) : null, line: me.line, bleed: me.bleed || null, players: S.players.length });
      const tries = {
        give: () => G.give("apple"),
        giveKit: () => G.giveKit(),
        giveDevBag: () => G.giveDevBag(),
        teleport: () => G.teleport(me.gx + 3, me.gy),
        walkTo: () => G.walkTo(me.gx + 3, me.gy),
        say: () => G.say("Hello"),
        setLook: () => G.setLook({ hair: "#ff0000" }),
        addPlayer: () => G.addPlayer(me.gx + 1, me.gy),
        "bleed.apply": () => G.bleed.apply(),
        "infection.infect": () => G.infection.infect(),
        "archery.shoot": () => G.archery.shoot([1, 0], 4),
      };
      const refused = Object.entries(tries).map(([name, fn]) => { try { fn(); return [name, null]; } catch (e) { return [name, e.message]; } });
      const after = JSON.stringify({ gx: me.gx, gy: me.gy, look: me.look, bag: bag ? bag.items.map((e) => `${e.id}x${e.count || 1}`) : null, line: me.line, bleed: me.bleed || null, players: S.players.length });
      const bad = refused.filter(([, why]) => !why || !/the world is the host's/.test(why));
      row("a guest's console is read-only: every helper that writes the world refuses with why", G.readOnly === true && bad.length === 0, bad.length ? `went through: ${bad.map(([n]) => n).join(", ")}` : `${refused.length} refused, e.g. "${refused[0][1]}"`);
      row("and the replica is as it was", before === after, before === after ? "unchanged" : `${before} -> ${after}`);
      row("its reads still answer: the player, the dead, the world's state, the modules", typeof G.player.hp === "number" && Array.isArray(G.zombies) && !!G.game.state && typeof G.map.tileAt === "function", `hp ${G.player.hp}, ${G.zombies.length} of the dead`);
      row("no body in the replica carries the renderer's or the interface's flags", !chars().some((c) => Object.prototype.hasOwnProperty.call(c, "behindProp") || Object.prototype.hasOwnProperty.call(c, "swingTarget")), `${chars().length} bodies`);
    } else {
      row("client.me is my player, the world's own pick", G.player === client.me && S.player === client.me && S.players.includes(client.me), `me ${client.me ? client.me.id : "none"}`);
      other = G.addPlayer(Math.round(me.gx) + 2, Math.round(me.gy));
      G.game.pickPlayer(other);
      const picked = client.me === other;
      G.game.pickPlayer(me);
      row("a pick moves client.me, and back (the world's playerPicked)", picked && client.me === me, `picked ${picked}, back ${client.me === me}`);
      // A dead host's world played again has no pick of its own (its one player a body); a friend who joins then is the world's pick,
      // never the client's (the review of #465). Stood in for here: the world's pick cleared, and a player added as a join adds one.
      const pick0 = S.player;
      S.player = null;
      joiner = G.addPlayer(Math.round(me.gx) + 3, Math.round(me.gy));
      const kept = client.me === me && S.player === joiner;
      S.player = pick0;
      row("a friend joining a world with no pick of its own takes the world's pick, not client.me (a dead host keeps its body's screen)", kept, `client.me ${client.me ? client.me.id : "none"}, the friend ${joiner.id}`);

      // The swing's targets: a zombie stood in reach, the main hand a sword.
      const z = S.zombies.find((q) => !q.dead);
      if (z) {
        moved = { z, gx: z.gx, gy: z.gy, auto: z.auto, aim: { ...me.aim } };
        z.gx = me.gx + 0.9;
        z.gy = me.gy;
        me.hands.main = items.makeEntry("sword", 1);
        // Faced, as the swing's own test needs: an earlier check may leave the aim anywhere (the order-independence of the checks).
        const sz = G.iso.toScreen(z.gx, z.gy);
        const so = G.iso.toScreen(me.gx, me.gy);
        const n = G.iso.normalize(sz.x - so.x, sz.y - so.y);
        me.aim.sx = n.x;
        me.aim.sy = n.y;
        const marks = new Set();
        G.combat.markTargets(me, S.zombies, true, marks);
        const marked = marks.has(z.id);
        const flagged = S.zombies.some((q) => Object.prototype.hasOwnProperty.call(q, "swingTarget"));
        const record = serializeCharacter(z);
        G.combat.markTargets(me, S.zombies, false, marks);
        row("the swing's targets are ids in the client's set, never a flag on a body, and a body's record carries none", marked && !flagged && !("swingTarget" in record) && !("behindProp" in record) && marks.size === 0, `marked ${marked}; a flag on a body ${flagged}; the record's keys ${Object.keys(record).filter((k) => /target|behind/i.test(k)).join(",") || "none of them"}; cleared ${marks.size === 0}`);
      } else row("the swing's targets are ids in the client's set, never a flag on a body", false, "none of the dead in the world");
      row("no character carries behindProp (the renderer's note is client.behind, by id)", !chars().some((c) => Object.prototype.hasOwnProperty.call(c, "behindProp")) && client.behind instanceof Set, `${chars().length} characters; ${client.behind.size} behind a tall prop in the last drawn frame`);

      // A dead speaker's line: the bubbles leave it to the world's step (game.js ageSpeech).
      const body = { id: "client-check-body", kind: "zombie", dead: true, gx: me.gx, gy: me.gy, line: { text: "Hnnngh.", left: 2 } };
      speech.updateSpeech([body], new Set(), me, 1 / 60);
      row("a dead speaker's line is the world's to clear: the bubbles write nothing on it", !!body.line && body.line.left === 2, body.line ? `still ${body.line.left}s` : "cleared by the interface");
      row("the host's console writes (not read-only)", G.readOnly === false, `readOnly ${G.readOnly}`);
    }
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    if (joiner) G.game.removePlayer(joiner.id);
    if (other) { G.game.removePlayer(other.id); if (client.me !== me && S.players.includes(me)) G.game.pickPlayer(me); }
    if (moved) { Object.assign(moved.z, { gx: moved.gx, gy: moved.gy, auto: moved.auto }); Object.assign(me.aim, moved.aim); }
    if (hands0 && role !== "guest") { me.hands.main = hands0.main; me.hands.off = hands0.off; }
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
