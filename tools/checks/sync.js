// The whole-world sync check (docs/31/04, "a replica check"; the gate of tier 3): a host's world and
// a guest's replica hashed in parts at the same tick and compared, the map chunk by chunk, the prop
// registry, the fires, the players whole, the dead as the frames carry them, the animals (docs/45), the clock,
// and every item in the world counted (game.itemCensus, #101). A mutation that bypassed a touch or a record
// shows up as a part that differs. Two tabs on the loopback, the guest joined (CLAUDE.md), then on the host:
//   __game.net.setSyncReports(true)     // the host marks every tenth frame; both sides hash it and the guest reports
//   ... step both tabs in turn for a few rounds (sixty frames or more each), with some play in it ...
//   await __game.check("sync")          // the guests' latest reports against the host's own at those ticks
// A hidden pane runs no frames, so the rounds are the script's. The reports stay on until
// setSyncReports(false). A walking guest's own player is its prediction, ahead of the host's record by the
// inputs not yet applied: let the guest stand still and the frames catch up before the check (the coder
// agent's caution, 2026-10-13).
//
// The duplication count (#101, tier 3 of docs/history/31-06-the-order.md): a part that differs catches a divergence, not a count
// that drifted the same way on both sides. So every run also says that no item's uid is held in two places at once, in the host's
// world now and in each guest's replica at its tick; and the count is kept across play:
//   await __game.check("sync", { mark: true })   // after the reports are flowing: the host's census now and each guest's
//                                                // `items` part are the mark (kept in this module, and returned as `mark`)
//   ... a minute of two players moving things between bags, containers, the belt, their hands, and the ground, both tabs stepped ...
//   await __game.check("sync")                   // every item's count on the host and on each replica is the mark's
// (`{ since: mark }` compares with a mark returned earlier.) The minute is moving only: eating, burning, making, a first search of a
// container or a body (its loot is rolled then), a kill's arrows, the wild growing or the dead going to sleep with a player far off,
// and a guest going dormant all change counts honestly; the row names each item whose count moved and by whom it is held.

let lastMark = null;

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const st = G.net.status();
  let mark = null;
  if (st.role !== "host") {
    row("this tab is the host", false, `role ${st.role || "none"}: run on the host, with a guest joined and reports on`);
  } else {
    const rep = G.net.syncReport();
    row("a guest has reported", rep.guests.size > 0, rep.guests.size ? `${rep.guests.size} guest${rep.guests.size === 1 ? "" : "s"}` : "none: setSyncReports(true), then step both tabs for sixty frames or more");
    for (const [playerId, g] of rep.guests) {
      const mine = rep.ring.get(g.tick);
      row(`${playerId}'s tick is in the host's ring`, !!mine, mine ? `tick ${g.tick}` : `tick ${g.tick} not kept (the ring holds ${[...rep.ring.keys()].join(", ") || "nothing"}): step the host less far ahead`);
      if (!mine) continue;
      for (const part of ["map", "chart", "registry", "fires", "players", "dead", "animals", "clock", "rules", "items"]) {
        const what = part === "items" ? "every item's count" : `the ${part}`;
        const detail = part === "items" ? `host ${mine.census}; guest ${g.parts.census}` : `host ${mine.counts}`;
        row(`${playerId}: ${what} agrees at tick ${g.tick}`, mine[part] === g.parts[part], mine[part] === g.parts[part] ? `${mine[part]} (${detail})` : `host ${mine[part]} vs guest ${g.parts[part]}; ${detail}${part === "items" ? "" : `; guest ${g.parts.counts}`}`);
      }
    }

    // Nothing held twice: the host's world now, with where each copy is; each replica at its tick, from its report.
    const now = G.game.itemCensus();
    row("no item is held in two places in the host's world", now.dups.length === 0, now.dups.length ? now.dups.slice(0, 4).map((d) => `${d.id} ${d.uid} at ${d.places.join(" and ")}`).join("; ") + (now.dups.length > 4 ? `; and ${now.dups.length - 4} more` : "") : now.summary);
    for (const [playerId, g] of rep.guests) {
      const m = /(\d+) held twice/.exec(g.parts.census || "");
      row(`no item is held in two places in ${playerId}'s replica at tick ${g.tick}`, !!m && m[1] === "0", m ? g.parts.census : "the report carries no census: a guest of an older build");
    }

    // The count kept across play: against the mark, the host's census whole and each guest's items part.
    if (opts.mark) {
      mark = { tick: Math.max(0, ...[...rep.ring.keys()]), host: { text: now.text, totals: new Map(now.totals), groups: copyGroups(now.groups), summary: now.summary }, guests: new Map([...rep.guests].map(([id, g]) => [id, { tick: g.tick, items: g.parts.items, census: g.parts.census }])) };
      lastMark = mark;
      row("the mark is taken", rep.guests.size > 0, `the host's ${now.summary}; ${[...mark.guests].map(([id, g]) => `${id} at tick ${g.tick}: ${g.census}`).join("; ") || "no guest"}`);
    } else {
      const since = opts.since || lastMark;
      if (since) {
        const same = now.text === since.host.text;
        row("the host's world holds as many of every item as at the mark", same, same ? `${now.summary}, as at the mark` : drift(since.host, now));
        for (const [playerId, g] of rep.guests) {
          const then = since.guests.get(playerId);
          if (!then) { row(`${playerId}'s replica holds as many of every item as at the mark`, false, "no report from this guest at the mark"); continue; }
          if (g.tick <= then.tick) { row(`${playerId}'s replica holds as many of every item as at the mark`, false, `no report since the mark (tick ${g.tick}, the mark's ${then.tick}): step both tabs`); continue; }
          row(`${playerId}'s replica holds as many of every item as at the mark`, g.parts.items === then.items, g.parts.items === then.items ? `${g.parts.census} at tick ${g.tick}, as at the mark's ${then.tick}` : `items ${then.items} at the mark (${then.census}) and ${g.parts.items} at tick ${g.tick} (${g.parts.census})`);
        }
      }
    }
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, ...(mark ? { mark } : {}) };
}

function copyGroups(groups) {
  const out = {};
  for (const [k, m] of Object.entries(groups)) out[k] = new Map(m);
  return out;
}

// Which items' counts moved since the mark, and where: "-1 apple (players -1); +2 plank (map +3, players -1)".
function drift(then, now) {
  const ids = [...new Set([...then.totals.keys(), ...now.totals.keys()])].sort();
  const out = [];
  for (const id of ids) {
    const d = (now.totals.get(id) || 0) - (then.totals.get(id) || 0);
    if (!d) continue;
    const by = Object.keys(now.groups).map((k) => [k, (now.groups[k].get(id) || 0) - (then.groups[k].get(id) || 0)]).filter(([, n]) => n).map(([k, n]) => `${k} ${n > 0 ? "+" : ""}${n}`);
    out.push(`${d > 0 ? "+" : ""}${d} ${id} (${by.join(", ")})`);
  }
  return `${out.join("; ")}; the mark's ${then.summary}, now ${now.summary}`;
}
