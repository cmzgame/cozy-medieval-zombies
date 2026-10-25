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
// world now and in each guest's replica at its tick, and that the census walked every holder; and the count is kept across play:
//   const { mark } = await __game.check("sync", { mark: true })  // after the reports are flowing: the host's census now and each
//                                                               // guest's parts are the mark (kept here too, and returned)
//   ... a minute of two players moving things between bags, containers, the belt, their hands, the walls, and the ground ...
//   await __game.check("sync", { since: true })                  // or { since: mark }: every item's count is the mark's
// A run without `since` compares nothing with a mark, and a mark is dropped once the reports go off. The minute is moving only: eating,
// burning, making, a first search of a container or a body (its loot is rolled then), a kill's arrows, the wild growing or the dead
// going to sleep with a player far off, a hen laying in a coop or stock eating from a trough (docs/45, on the clock), and a guest going
// dormant all change counts honestly; the row names each item whose count
// moved and by whom it is held. A drift only in the living dead's and villagers' garments (the part `living`) is a note, not a failure.

let lastMark = null;
const REPLICA_PLACES = "for the places, run __game.game.itemCensus().dups (and .deep) in that guest's tab";

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
    if (!rep.on || (lastMark && lastMark.offs !== rep.offs)) lastMark = null; // the reports went off: the mark is stale
    row("a guest has reported", rep.guests.size > 0, rep.guests.size ? `${rep.guests.size} guest${rep.guests.size === 1 ? "" : "s"}` : "none: setSyncReports(true), then step both tabs for sixty frames or more");
    for (const [playerId, g] of rep.guests) {
      const mine = rep.ring.get(g.tick);
      row(`${playerId}'s tick is in the host's ring`, !!mine, mine ? `tick ${g.tick}` : `tick ${g.tick} not kept (the ring holds ${[...rep.ring.keys()].join(", ") || "nothing"}): step the host less far ahead`);
      if (!mine) continue;
      for (const part of ["map", "chart", "registry", "fires", "players", "dead", "animals", "clock", "rules", "items", "living"]) {
        const census = part === "items" || part === "living";
        const what = part === "items" ? "every item's count" : part === "living" ? "the count of what the living dead and the villagers wear" : `the ${part}`;
        const detail = census ? `host ${mine.census}; guest ${g.parts.census}` : `host ${mine.counts}`;
        row(`${playerId}: ${what} agrees at tick ${g.tick}`, mine[part] === g.parts[part], mine[part] === g.parts[part] ? `${mine[part]} (${detail})` : `host ${mine[part]} vs guest ${g.parts[part]}; ${detail}${census ? `; ${REPLICA_PLACES}, and G.game.itemCensus().text here` : `; guest ${g.parts.counts}`}`);
      }
    }

    // Nothing held twice, and every holder walked: the host's world now, with where; each replica at its tick, from its report.
    const now = G.game.itemCensus();
    row("no item is held in two places in the host's world", now.dups.length === 0, now.dups.length ? now.dups.slice(0, 4).map((d) => `${d.id} ${d.uid} at ${d.places.join(" and ")}`).join("; ") + (now.dups.length > 4 ? `; and ${now.dups.length - 4} more` : "") : now.summary);
    row("the census walked every holder in the host's world", now.deep.length === 0, now.deep.length ? `nested past the census's depth at ${now.deep.slice(0, 4).join("; ")}${now.deep.length > 4 ? `; and ${now.deep.length - 4} more` : ""}` : "nothing too deep");
    for (const [playerId, g] of rep.guests) {
      const c = g.parts.census || "";
      const twice = /(\d+) held twice/.exec(c);
      const deep = /(\d+) too deep/.exec(c);
      row(`no item is held in two places in ${playerId}'s replica at tick ${g.tick}`, !!twice && twice[1] === "0", twice ? (twice[1] === "0" ? c : `${c}; ${REPLICA_PLACES}`) : "the report carries no census: a guest of an older build");
      row(`the census walked every holder in ${playerId}'s replica at tick ${g.tick}`, !!deep && deep[1] === "0", deep ? (deep[1] === "0" ? "nothing too deep" : `${c}; ${REPLICA_PLACES}`) : "the report carries no census: a guest of an older build");
    }

    // The count kept across play: taken with { mark: true }, compared with { since }.
    if (opts.mark) {
      mark = { offs: rep.offs, host: { text: now.text, livingText: now.livingText, groups: copyGroups(now.groups), summary: now.summary }, guests: new Map([...rep.guests].map(([id, g]) => [id, { tick: g.tick, items: g.parts.items, living: g.parts.living, census: g.parts.census }])) };
      lastMark = rep.on ? mark : null;
      row("the mark is taken", rep.on && rep.guests.size > 0, rep.on ? `the host's ${now.summary}; ${[...mark.guests].map(([id, g]) => `${id} at tick ${g.tick}: ${g.census}`).join("; ") || "no guest"}` : "the reports are off: setSyncReports(true) first");
    } else if (opts.since) {
      const since = opts.since === true ? lastMark : opts.since;
      if (!since) row("a mark to compare with", false, "none: take one with { mark: true } while the reports are on (a mark goes when they go off)");
      else if (since.offs !== rep.offs) row("a mark to compare with", false, "the reports went off since the mark: take a new one");
      else {
        const same = now.text === since.host.text;
        row("the host's world holds as many of every item as at the mark", same, same ? `${now.summary}, as at the mark` : drift(since.host, now, ["map", "placed", "players", "bodies"]));
        const livingSame = now.livingText === since.host.livingText;
        row("the living dead and the villagers wear as much as at the mark (a note when it moved, not a failure)", true, livingSame ? "the same" : `note: ${drift(since.host, now, ["living"])}`);
        for (const [playerId, g] of rep.guests) {
          const label = `${playerId}'s replica holds as many of every item as at the mark`;
          const then = since.guests.get(playerId);
          if (!then) { row(label, false, "no report from this guest at the mark"); continue; }
          if (g.tick <= then.tick) { row(label, false, `no report since the mark (tick ${g.tick}, the mark's ${then.tick}): step both tabs`); continue; }
          row(label, g.parts.items === then.items, g.parts.items === then.items ? `${g.parts.census} at tick ${g.tick}, as at the mark's ${then.tick}` : `items ${then.items} at the mark (${then.census}) and ${g.parts.items} at tick ${g.tick} (${g.parts.census}); for what moved, compare __game.game.itemCensus().text in that guest's tab with the host's drift above`);
          row(`${playerId}'s replica: the living dead and the villagers wear as much as at the mark (a note, not a failure)`, true, g.parts.living === then.living ? "the same" : `note: ${then.living} at the mark and ${g.parts.living} at tick ${g.tick}`);
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

// Which items' counts moved since the mark among the holders named, and where: "-1 apple (players -1); +2 plank (map +3, players -1)".
function drift(then, now, holders) {
  const sum = (groups, id) => holders.reduce((s, k) => s + ((groups[k] && groups[k].get(id)) || 0), 0);
  const ids = new Set();
  for (const k of holders) for (const g of [then.groups[k], now.groups[k]]) if (g) for (const id of g.keys()) ids.add(id);
  const out = [];
  for (const id of [...ids].sort()) {
    const d = sum(now.groups, id) - sum(then.groups, id);
    if (!d) continue;
    const by = holders.map((k) => [k, ((now.groups[k] && now.groups[k].get(id)) || 0) - ((then.groups[k] && then.groups[k].get(id)) || 0)]).filter(([, n]) => n).map(([k, n]) => `${k} ${n > 0 ? "+" : ""}${n}`);
    out.push(`${d > 0 ? "+" : ""}${d} ${id} (${by.join(", ")})`);
  }
  return `${out.join("; ") || "the counts moved between holders only"}; the mark's ${then.summary}, now ${now.summary}`;
}
