// Burning (#14; Michael, 2026-10-15): a status like bleeding, capped at one. A body is burning or it is not; a new
// source while it burns puts the timer back to full and never stacks. It is a cherry on top, never a way to win a
// fight: `dps` a second for `duration` seconds, and never more than `cap` health over one burn however often it is
// refreshed (Michael: never more than 10 against 100). Only the dead burn (and, when they come, animals; villagers
// once something can reach them): never a player, so nothing needs putting out, and never the land, a wall, a
// container, or a tree. A body that dies burning burns on as a corpse until its timer runs out (fire.js lays the
// flames down with it). The numbers are `burn` in data/combat.json; every source calls `ignite`: a torch's blow by
// its weapon's `ignite` chance (combat.js), the fireball and a fire arrow always (archery.js, their `ignite`).
//
// The state lives on the character (`burning`, `burnLeft`, `burnTaken`), so it is in the save and the welcome as
// every field is, and the frame's `burning` flag (net.js `slim`) is what a guest's replica draws from: the burn
// itself runs only in the world's step, on the host.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import { beltOf, carriedEntry as carried, flameOf, countAll, takeAll } from "./inventory.js";
import { getItem, aName } from "./items.js";
import { burnZombie } from "./entities/zombie.js";
import { reachProblem } from "./reach.js"; // one reach test, distance and a clear line (#208)
import { work as WK } from "./tuning.js"; // Burn corpse's flame, fuel, and hours (docs/43 section 7)

export const BURN = { dps: 0.8, duration: 10, cap: 10 };

export function setBurnData(data) {
  if (data) Object.assign(BURN, data);
}

// Set a body alight, or put a burning one's timer back to full. Returns whether it is burning now.
export function ignite(c) {
  if (!c || c.kind !== "zombie" || c.dead) return false;
  if (!c.burning) c.burnTaken = 0; // a fresh burn: the cap counts from here
  c.burning = true;
  c.burnLeft = BURN.duration;
  return true;
}

// Every step, for everyone the world holds (the living and the fallen): a living body takes its share, up to the cap;
// a corpse only burns down. Out when the timer runs out.
export function update(characters, dt) {
  for (const c of characters) {
    if (!c.burning) continue;
    c.burnLeft = (c.burnLeft ?? 0) - dt;
    if (c.burnLeft <= 0) {
      c.burning = false;
      c.burnLeft = 0;
      continue;
    }
    if (c.dead || c.kind !== "zombie") continue;
    const share = Math.min(BURN.dps * dt, BURN.cap - (c.burnTaken || 0));
    if (share <= 0) continue;
    c.burnTaken = (c.burnTaken || 0) + share;
    burnZombie(c, share);
  }
}

// ---- Burn corpse (docs/43 section 7; Michael, 2026-10-25) ----
// A body of the dead set alight on purpose, with a flame carried (a tinderbox, `work.burnCorpse.flame`) and one log spent (`fuel`): it burns
// `hours` game hours (map.HOUR_SECONDS each), giving light as any burning body does (fire.js), and then it and everything in it are gone, its
// worn, its hands, its pockets, its grid, what lodged in it. The mark is `cremate` on the corpse (saved; in the slim record, so a guest's menu
// greys the search; in the sync check's `dead` part); the burn is its `burning` and `burnLeft`, run down by `update` like any burn; the body
// leaves the corpses when it goes out (game.js, `burnedAway`), and the corpses' roster in the next frame takes it from every guest.

const BODY_REACH = 2.6; // tiles, the click's reach (interact.CLICK_REACH), as a fire's
let findCharacter = () => null; // game.js hands in the lookup by id across the world's lists (as interact's characters are)
export function setCharacters(fn) {
  findCharacter = fn;
}

const article = (name) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);
const itemName = (id) => getItem(id).name.toLowerCase();

// Is this a body that Burn corpse is for: one of the dead's, fallen and lying (a player's body is a friend's to come back for; never offered).
export function isBurnableBody(c) {
  return !!c && c.kind === "zombie" && c.dead && c.corpse;
}

// What a player lacks to burn a body, as the menu's reason, or null: a tinderbox and a log, carried anywhere on them.
export function burnNeed(player) {
  const flame = countAll(player, WK.burnCorpse.flame) > 0;
  const fuel = countAll(player, WK.burnCorpse.fuel) > 0;
  if (flame && fuel) return null;
  const want = [];
  if (!flame) want.push(article(itemName(WK.burnCorpse.flame)));
  if (!fuel) want.push(article(itemName(WK.burnCorpse.fuel)));
  return want.join(" and ");
}

// Set a body alight to burn away. Returns whether it is burning now.
export function burnCorpse(c) {
  if (!isBurnableBody(c) || c.cremate) return false;
  c.cremate = true;
  c.burning = true;
  c.burnTaken = 0;
  c.burnLeft = WK.burnCorpse.hours * map.HOUR_SECONDS;
  return true;
}

// A body burnt to nothing: its fire set by Burn corpse has gone out. The step takes it from the corpses (game.js).
export function burnedAway(c) {
  return !!c && !!c.cremate && !c.burning;
}

// What the menu entry's hover card says (pure, read from the data): the warning in red, what it needs, and what it does.
export function burnCard(player = null) {
  const need = player ? burnNeed(player) : null;
  return {
    name: "Burn corpse",
    kind: "Action",
    state: need ? `needs ${need}` : "",
    lines: [
      [{ t: "Burns the body and everything in it.", k: "warn" }],
      [{ t: `Needs ${article(itemName(WK.burnCorpse.flame))} and ${article(itemName(WK.burnCorpse.fuel))} carried; the ${itemName(WK.burnCorpse.fuel)} is spent.` }],
      [{ t: `It burns about ${WK.burnCorpse.hours === 1 ? "a game hour" : `${WK.burnCorpse.hours} game hours`}, giving light.` }],
    ],
    fine: [],
  };
}

// The target: a character by id (a menu's address, a script's), or the character itself (a Use on the host, `{ kind: "character", ch }`).
function bodyOf(target) {
  if (!target) return null;
  if (target.ch) return target.ch;
  const id = typeof target.character === "string" ? target.character : typeof target.id === "string" ? target.id : null;
  return id ? findCharacter(id) : null;
}

verbs.define("burncorpse", {
  validate(world, player, target) {
    const c = bodyOf(target);
    if (!isBurnableBody(c)) return c && c.kind === "zombie" && !c.dead ? "It is not dead yet." : "There is no body there to burn.";
    if (c.cremate || c.burning) return "It is already burning.";
    { const why = reachProblem(player, [[Math.round(c.gx), Math.round(c.gy)]], BODY_REACH); if (why) return why === "Too far away." ? "Too far from the body." : why; }
    const need = burnNeed(player);
    if (need) return `You need ${need} to burn it.`;
    return true;
  },
  perform(world, player, target) {
    const c = bodyOf(target);
    if (takeAll(player, WK.burnCorpse.fuel, 1) < 1) return false;
    if (!burnCorpse(c)) return false;
    const h = WK.burnCorpse.hours; // read from the data, as the card's line is (burnCard)
    return { ok: true, message: `The body catches. It will burn for about ${h === 1 ? "an hour" : `${h} hours`}, and nothing in it will be left.` };
  },
});

// ---- fire arrows: arrows used on a lit fire (data/interactions.json, the `dip` verb) ----

const DIP_REACH = 2.6; // tiles, the click's reach (interact.CLICK_REACH)

// The whole stack at once, in its place (Michael's default): a fire arrow is an arrow's size and stack, so it stays
// where the arrows were. A target is the prop itself (a Use on the host) or its id (a script). Only arrows you carry
// are dipped (the hands, the belt, the bag): a stack in an open chest is taken out first (the review of #62).
verbs.define("dip", {
  validate(world, player, target, args) {
    const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
    if (!prop || !prop.fire || !prop.fire.burns) return "That is not a fire.";
    if (!prop.fire.lit) return "The fire is out.";
    { const why = reachProblem(player, prop.tiles || [prop.tile], DIP_REACH); if (why) return why === "Too far away." ? "Too far from the fire." : why; } // a wall between refuses it, as the light does
    const e = carried(player, target.entry);
    if (!e) return "Take the arrows out first."; // used from an open chest or a body: only arrows you carry are dipped
    if (e.id !== (args.from || "arrow")) return "You have no arrows.";
    return true;
  },
  perform(world, player, target, args) {
    const e = carried(player, target.entry);
    e.id = args.to || "fire_arrow";
    return { ok: true };
  },
});

// ---- the light verb: a flame used on what is made to be lit (data/interactions.json; #156, Michael, 2026-10-17) ----
// A tinderbox or a lit torch used on an unlit campfire (with fuel), a torch on a post, a torch in a bracket that is out, or an
// unlit torch you carry lights it. Never burns anything else. The target is an address: a prop (an id, or the prop on the host), a
// bracket `{ tx, ty, edge }`, or `onEntry`, an unlit torch's uid; the flame is `entry` (the uid of what was used), else whatever the
// player has (a tinderbox, a lit torch in a hand or on the belt: the right-click menu on a holder).

// What the target is, or why it cannot be lit: { reason } or { light(), at: [x, y] | null }.
function lightTarget(player, target, flame) {
  if (target.onEntry != null) {
    const e = carried(player, target.onEntry);
    const held = e && (player.hands.main === e || player.hands.off === e || (beltOf(player) || []).includes(e)); // a torch in the bag burns nothing and lights nothing: it is lit where it is used
    if (!e || e.id !== "torch" || !held) return { reason: "Only a torch in a hand or on the belt can be lit that way." };
    if (e === flame) return { reason: "That is the flame." };
    if (e.lit) return { reason: "It is already lit." };
    return { light: () => { e.lit = true; return true; }, at: null };
  }
  if (target.bracket) {
    const b = [...map.brackets()].find((q) => q.tx === target.bracket.tx && q.ty === target.bracket.ty && q.edge === target.bracket.edge);
    if (!b) return { reason: "There is nothing there to light." };
    const br = b.wall.bracket;
    if (br.lantern) return br.lit !== false ? { reason: "It is already lit." } : { light: () => map.setLantern(b, true), at: map.bracketPos(b), message: "You light the lantern." }; // put out, lit again (docs/43, section 3)
    if (!br.torch) return { reason: "There is no torch there." };
    if (br.lit !== false) return { reason: "It is already lit." };
    return { light: () => map.lightBracket(b), at: map.bracketPos(b) };
  }
  const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
  const f = prop && prop.fire;
  // A home light is a switch (docs/43, section 3): a fireplace, a hearth, a lantern post, turned on with a flame, burning nothing.
  if (f && f.switch) return f.lit ? { reason: "It is already lit." } : { light: () => map.setFireLit(prop, true), prop, message: `You light the ${map.fireName(prop)}.` };
  if (!f || !(prop.sprite === "campfire" || f.holds)) return { reason: "That cannot be lit." }; // a campfire or a torch: not an oven or a forge
  if (prop.sprite === "campfire") {
    if (f.lit) return { reason: "It is already burning." };
    if (!(f.fuel > 0)) return { reason: "It has nothing to burn." };
  } else {
    if (!f.has) return { reason: "There is no torch there." };
    if (f.lit) return { reason: "It is already lit." };
  }
  return { light: () => map.lightProp(prop), prop, message: prop.sprite === "campfire" ? "You light the campfire." : undefined };
}

// The fire a target is, when it burns: a campfire or any burner that is lit, a torch on a post that is lit, a lit torch in a bracket
// (a bracket torch is a fire source like a post's, #170), or a lantern while it is lit (#175; a switch since docs/43, put out and lit
// again by hand). { prop } or { at: [x, y] }, or null.
function burningFire(target) {
  if (target.bracket) {
    const b = [...map.brackets()].find((q) => q.tx === target.bracket.tx && q.ty === target.bracket.ty && q.edge === target.bracket.edge);
    if (!b) return null;
    if (b.wall.bracket.lantern) return b.wall.bracket.lit === false ? null : { at: map.bracketPos(b), lantern: true }; // a lantern is a flame while lit (Michael, 2026-10-17, #175; put out since docs/43)
    if (!b.wall.bracket.torch || !map.holderState({ kind: "bracket", bracket: b }).lit) return null;
    return { at: map.bracketPos(b) };
  }
  const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
  const f = prop && prop.fire;
  if (prop && prop.sprite === "lantern_post" && f && f.lit) return { prop, lantern: true }; // a lantern post, likewise
  if (!f || !f.lit || !(f.burns || (f.holds && f.has))) return null; // not burning: the ordinary refusal ("no flame")
  return { prop };
}

// An unlit torch in a hand or on the belt used on a burning fire is lit from it (the builder's reading of Michael's "anything with
// fire lights what is made to be lit": a burning fire is a flame). Returns null when this is not that case, else { reason } or
// { light(), fire, message }.
function torchFromFire(player, target) {
  if (target.entry == null || target.onEntry != null) return null;
  const e = carried(player, target.entry);
  if (!e || e.id !== "torch" || e.lit) return null;
  const fire = burningFire(target);
  if (!fire) return null;
  const held = player.hands.main === e || player.hands.off === e || (beltOf(player) || []).includes(e);
  if (!held) return { reason: "Only a torch in a hand or on the belt can be lit that way." };
  return { light: () => { e.lit = true; return true; }, fire, message: fire.lantern ? "You light the torch at the lantern." : "You light the torch at the fire." };
}

// Where a player stands against a prop: the nearest of its tiles (as `dip` measures), and whether a wall is between (sight: a fence
// lets a flame be reached, a wall or a shut door does not).
function reaches(player, prop, at) {
  const tiles = at ? [at] : prop.tiles || [prop.tile];
  return reachProblem(player, tiles, DIP_REACH) || true;
}

// ---- put out and add fuel (docs/43, section 3; Michael, 2026-10-25: "Put out" everywhere, never "douse") ----
// What a target is to put out, or why not: { reason } or { put(), name, at|prop }. A lantern (in a bracket or on a post), a torch in a
// bracket or on a post, a campfire (it keeps its fuel), a fireplace or a hearth. Nothing is needed to put a light out.
function putOutTarget(target) {
  if (target.bracket) {
    const b = [...map.brackets()].find((q) => q.tx === target.bracket.tx && q.ty === target.bracket.ty && q.edge === target.bracket.edge);
    if (!b) return { reason: "There is nothing there to put out." };
    const br = b.wall.bracket;
    if (br.lantern) return br.lit === false ? { reason: "It is already out." } : { put: () => map.setLantern(b, false), name: "lantern", at: map.bracketPos(b) };
    if (!br.torch || br.lit === false) return { reason: "It is already out." };
    return { put: () => map.putOutBracket(b), name: "torch", at: map.bracketPos(b) };
  }
  const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
  const f = prop && prop.fire;
  if (!map.putOutByHand(prop)) return { reason: "That cannot be put out." }; // the stations keep their fuel and their fire (docs/43)
  if (!f.lit) return { reason: "It is already out." };
  return { put: () => map.setFireLit(prop, false), name: f.holds ? "torch" : map.fireName(prop), prop };
}

verbs.define("putout", {
  validate(world, player, target) {
    const t = putOutTarget(target);
    if (t.reason) return t.reason;
    return t.prop ? reaches(player, t.prop) : reaches(player, { tile: t.at, tiles: [t.at] }, t.at);
  },
  perform(world, player, target) {
    const t = putOutTarget(target);
    const ok = !!t.put && t.put();
    return { ok, message: ok ? `You put out the ${t.name}.` : "" };
  },
});

// One unit of a burner's fuel from what the player carries: a log on a campfire, as its menu's Add a log and Use do. A log on a cold
// campfire lights nothing (#168: a flame is needed); on a lit one it keeps it going. A home light takes none (a switch).
verbs.define("feed", {
  validate(world, player, target) {
    const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
    const f = prop && prop.fire;
    if (!f || !f.burns || f.switch) return "That takes no fuel.";
    if (f.fuel >= f.maxFuel) return "It is full.";
    if (countAll(player, f.fuelItem) <= 0) return `You have no ${getItem(f.fuelItem).name.toLowerCase()}.`;
    return reaches(player, prop);
  },
  perform(world, player, target) {
    const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
    const f = prop.fire;
    if (!map.feedFire(prop, prop.sprite !== "campfire")) return { ok: false };
    takeAll(player, f.fuelItem, 1);
    return { ok: true, message: `You add ${aName(f.fuelItem)}${f.lit ? "" : "; it is not lit"}.` };
  },
});

verbs.define("light", {
  validate(world, player, target) {
    const k = torchFromFire(player, target);
    if (k) return k.reason || (k.fire.prop ? reaches(player, k.fire.prop) : reaches(player, { tile: k.fire.at, tiles: [k.fire.at] }, k.fire.at));
    const flame = flameOf(player, target.entry);
    if (!flame) return target.entry != null ? "That gives no flame (a tinderbox, or a lit torch)." : "You have no flame (a tinderbox, or a lit torch).";
    const t = lightTarget(player, target, flame);
    if (t.reason) return t.reason;
    if (t.prop) return reaches(player, t.prop);
    if (t.at) return reaches(player, { tile: t.at, tiles: [t.at] }, t.at);
    return true;
  },
  perform(world, player, target) {
    const k = torchFromFire(player, target);
    if (k) return { ok: k.light(), message: k.message };
    const flame = flameOf(player, target.entry);
    const t = lightTarget(player, target, flame);
    const ok = !!t.light && t.light();
    return ok && t.message ? { ok, message: t.message } : { ok }; // a lantern, a home light, or a campfire names itself, over a row's word
  },
});
