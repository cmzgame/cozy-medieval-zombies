// The cap on the players in a world (#93, Michael: "4 players in a browser-hosted world, 8 in a server world, both in
// data"): a join over the cap is refused with `full` before anything is made or taken from the save, a returning
// character takes a place like a new one, and a refused guest is never half in. It drives host.joinFor (what net.js
// calls for a join) in this tab's world, with made-up browser hashes, and the host's own step away and back (a guest's
// step away is `net.awayGuestHashes`, tried in two tabs). From the console, on a tab with `?nosave`:
//   await __game.check("cap")
// It adds players to the world and removes them again, and puts the store's owners and dormant records back. It refuses
// to run in a kept world (one chosen on the Worlds screen): it steps the host away and files made-up hashes in the
// world's own store, which is for a `?nosave` test world only.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  if (G.worlds.current) {
    row("this tab is a `?nosave` test world, not a kept one", false, `the world "${G.worlds.current.name}" is kept: run check("cap") on a fresh ?nosave tab`);
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: 0, total: rows.length };
  }
  const store = G.worlds.store || { owners: {}, dormant: {} };
  const owners0 = { ...store.owners };
  const dormant0 = { ...store.dormant };
  const players0 = S.players.map((p) => p.id);
  const corpses0 = S.corpses.length;
  const me0 = G.player;
  let hostHash = null;
  const ident = (name) => ({ name, look: {} });
  const added = () => S.players.filter((p) => !players0.includes(p.id));
  try {
    row("the world remembers fewer browsers than its limit, so a refusal here is the cap's", Object.keys(store.owners).length < 12, `${Object.keys(store.owners).length} owners (MAX_OWNERS 16)`);
    const cap = G.tuning.world.playerCapBrowser;
    const server = G.tuning.world.playerCapServer;
    row("the caps are data: 4 in a browser's world, 8 on a server", cap === 4 && server === 8, `browser ${cap}, server ${server} (data/tuning.json, world)`);
    const base = S.players.length;
    row("a lone world has room", !G.worlds.full(), `${base} of ${cap}`);
    // Fill the world: a guest at each place that is left.
    const hashes = [];
    for (let i = 0; S.players.length < cap; i++) {
      const h = `cap-test-${i}`;
      const r = G.worlds.joinFor(h, ident(`G${i}`));
      if (!r.player) break;
      hashes.push([h, r.player.id]);
    }
    row("guests join up to the cap", S.players.length === cap && G.worlds.full(), `${S.players.length} of ${cap}`);
    // One more is refused, and nothing of it is kept.
    const nOwners = Object.keys(store.owners).length;
    const over = G.worlds.joinFor("cap-test-over", ident("Over"));
    row("a join over the cap is refused with full", over.full === true && !over.player && !over.who, JSON.stringify({ full: over.full, player: !!over.player }));
    row("a refused guest is never half in: no player, no owner, nobody to bury", S.players.length === cap && Object.keys(store.owners).length === nOwners && !store.owners["cap-test-over"] && S.corpses.length === corpses0, `${S.players.length} players, ${Object.keys(store.owners).length} owners, ${S.corpses.length - corpses0} bodies`);
    // A guest already in comes back to the same character, with no place to find.
    const again = G.worlds.joinFor(hashes[0][0], ident("G0 again"));
    row("a guest already in rejoins its own character at the cap", again.player && again.player.id === hashes[0][1] && S.players.length === cap, again.player ? again.player.id : "none");
    // A character resting in the save takes a place when it comes back, as a new one does.
    const [sleeperHash, sleeperId] = hashes[hashes.length - 1];
    G.worlds.dormantNow(sleeperId);
    row("a guest gone dormant gives its place back", S.players.length === cap - 1 && !!store.dormant[sleeperHash], `${S.players.length} of ${cap}`);
    const taker = G.worlds.joinFor("cap-test-taker", ident("Taker"));
    row("a new guest takes the place", !!taker.player && S.players.length === cap, taker.player ? taker.player.id : JSON.stringify(taker));
    const back = G.worlds.joinFor(sleeperHash, ident("Back"));
    row("the dormant one is refused with full, its record still kept", back.full === true && !!store.dormant[sleeperHash] && store.owners[sleeperHash] === sleeperId, JSON.stringify({ full: back.full, kept: !!store.dormant[sleeperHash] }));
    if (taker.player) G.game.removePlayer(taker.player.id);
    delete store.owners["cap-test-taker"];
    const home = G.worlds.joinFor(sleeperHash, ident("Back"));
    row("once a place is free the dormant one comes back to its own character", !!home.player && home.player.id === sleeperId && !store.dormant[sleeperHash], home.player ? home.player.id : JSON.stringify(home));
    // The host keeps its own place while it steps away, so a guest cannot take it and its coming back never goes over.
    const hostId = G.player.id;
    hostHash = Object.keys(store.owners).find((h) => store.owners[h] === hostId) || "cap-test-host"; // the hash awayNow really files it under
    const stepped = G.worlds.awayNow(hostId, hostHash);
    row("the host steps away, out of the world, and the world is still full", stepped && !S.players.some((p) => p.id === hostId) && S.players.length === cap - 1 && G.worlds.full(), `${S.players.length} standing of ${cap}`);
    const taker2 = G.worlds.joinFor("cap-test-taker2", ident("Taker2"));
    row("a guest cannot take the host's place while it is away", taker2.full === true && S.players.length === cap - 1, JSON.stringify({ full: taker2.full }));
    const hostBack = G.worlds.backNow(hostHash);
    if (hostBack) G.game.pickPlayer(hostBack);
    row("the host comes back to its own place, and the world is not over", !!hostBack && S.players.length === cap, `${S.players.length} of ${cap}`);
  } finally {
    // The host back in the world, wherever the run stopped (a step away leaves its record in the store).
    if (hostHash && !S.players.some((p) => p.id === me0.id) && store.dormant[hostHash]) {
      const back = G.worlds.backNow(hostHash);
      if (back) G.game.pickPlayer(back);
    }
    for (const p of added()) G.game.removePlayer(p.id);
    if (me0 && G.player !== me0 && S.players.some((p) => p.id === me0.id)) G.game.pickPlayer(S.players.find((p) => p.id === me0.id));
    for (const k of Object.keys(store.owners)) if (!(k in owners0)) delete store.owners[k];
    for (const k of Object.keys(store.dormant)) if (!(k in dormant0)) delete store.dormant[k];
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
