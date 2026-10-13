// The whole-world sync check (docs/31/04, "a replica check"; the gate of tier 3): a host's world and
// a guest's replica hashed in parts at the same tick and compared, the map chunk by chunk, the prop
// registry, the fires, the players whole, the dead as the frames carry them, the clock. A mutation
// that bypassed a touch or a record shows up as a part that differs. Two tabs on the loopback, the
// guest joined (CLAUDE.md), then on the host:
//   __game.net.setSyncReports(true)     // the guest hashes after every thirtieth frame and reports
//   ... step both tabs in turn for a few rounds (sixty frames or more each), with some play in it ...
//   await __game.check("sync")          // the guests' latest reports against the host's own at those ticks
// A hidden pane runs no frames, so the rounds are the script's. The reports stay on until
// setSyncReports(false).

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const st = G.net.status();
  if (st.role !== "host") {
    row("this tab is the host", false, `role ${st.role || "none"}: run on the host, with a guest joined and reports on`);
  } else {
    const rep = G.net.syncReport();
    row("a guest has reported", rep.guests.size > 0, rep.guests.size ? `${rep.guests.size} guest${rep.guests.size === 1 ? "" : "s"}` : "none: setSyncReports(true), then step both tabs for sixty frames or more");
    for (const [playerId, g] of rep.guests) {
      const mine = rep.ring.get(g.tick);
      row(`${playerId}'s tick is in the host's ring`, !!mine, mine ? `tick ${g.tick}` : `tick ${g.tick} not kept (the ring holds ${[...rep.ring.keys()].join(", ") || "nothing"}): step the host less far ahead`);
      if (!mine) continue;
      for (const part of ["map", "registry", "fires", "players", "dead", "clock"]) {
        row(`${playerId}: the ${part} agrees at tick ${g.tick}`, mine[part] === g.parts[part], mine[part] === g.parts[part] ? `${mine[part]} (host ${mine.counts})` : `host ${mine[part]} vs guest ${g.parts[part]}; host ${mine.counts}; guest ${g.parts.counts}`);
      }
    }
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
