// The verb table (docs/31/08, habit 4; docs/30 law 2's other half): every new
// verb is a row keyed by name with `perform(world, player, target, args)` and
// an optional `validate` that returns true or a reason, where `target` is an
// address (a tile, a tile and edge, a prop id, a character id, an entry id and
// where it is), never the object. A menu entry or a key calls `run`; the
// interactions.json resolver of step 3 feeds the same table. A timed action
// stores the verb's name, the target, and the start tick, and `perform`
// re-validates when it fires, so two actors can never fell one tree twice.

const table = new Map();

export function define(name, verb) {
  table.set(name, verb);
}

export function get(name) {
  return table.get(name) || null;
}

export function names() {
  return [...table.keys()];
}

// Run a verb now. Returns { ok, reason? } (or whatever perform returns, with ok set).
export function run(name, world, player, target, args = {}) {
  const v = table.get(name);
  if (!v) return { ok: false, reason: `no verb ${name}` };
  if (v.validate) {
    const r = v.validate(world, player, target, args);
    if (r !== true) return { ok: false, reason: r || "cannot" };
  }
  const out = v.perform(world, player, target, args);
  return out && typeof out === "object" ? { ok: true, ...out } : { ok: out !== false };
}
