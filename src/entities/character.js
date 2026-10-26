// One model for everyone who walks the world (docs/19): the player, the dead,
// and villagers. The shared fields are here; each kind's creator adds its own
// (the player's stamina and needs, the dead's states, a villager's tether).
// Every character has the player's model: a doll (`worn`) and hands with items
// in them, and the drawing follows what is worn. The dead and villagers also
// carry `pockets`, a small grid of their own, so a body has things without a
// sack on its back.

import * as figure from "../figure.js";
import * as assets from "../assets.js";
import { createHands, rollLoot, douse } from "../items.js";
import * as grid from "../grid.js";
import { dropItem, serializeProp } from "../map.js";
import { createWorn, createBag } from "../inventory.js";
import { createAnimation } from "../sprites.js";
import { nextId } from "../world.js";

export function createCharacter(kind, gx, gy, { id = null, name = null, speed = 1, radius = 0.3, hp = 100, maxHp = hp } = {}) {
  return {
    kind, // "player" | "zombie" | "villager"
    id,
    name, // null for the player and the dead
    sprite: null, // a sheet id, set by dress()
    gx,
    gy,
    layer: 0, // always 0 for now (docs/08)
    facing: "s",
    speed,
    radius,
    hp,
    maxHp,
    dead: false,
    anim: createAnimation("idle"),
    look: { ...figure.DEFAULT_LOOK }, // { skin, hair, hairStyle, eyes, under }
    worn: createWorn(), // head, chest, hands, legs, feet, waist, back
    hands: createHands(), // main, off
    pockets: null, // a grid of their own, for the dead and villagers
    wardrobe: 0, // which wardrobe the dead dress from
    wound: null, // the dead's wound, [l, d, hOffset]
    carrying: null,
    line: null, // { text, until } while a speech bubble shows (docs/19)
    lootTable: null, // the table the pockets roll from on first search
    loot: null, // a body's grid, made on first search: what is still on it (docs/19)
    lodged: {}, // what hit it and stayed in it, by item id (arrows): it comes out in its loot (docs/20)
    lodgedItems: [], // a thrown thing that stayed in it, as itself (a spear, its wear kept): it comes out in its loot
    burning: false, // on fire (burn.js, #14: its timer burnLeft and burnTaken; fire.js draws it)
    burnAcc: 0, // flames owed this step
    corpse: false, // the fall is over and the body is one frame (dressCorpse)
    corpseKey: "", // which worn garments the corpse is drawn in
    searched: false,
  };
}

// ---- a character as data, and back (docs/31/05, item 24) ----
// Everything plain on the character is saved as it is; what points at another
// thing goes by id (the target, a carried prop) and what is transient goes
// (an auto-walk, a timed action, a breach, a bubble). A body's grid holds the
// same entries the body wears, so after the copy they are made one again by uid.

const CH_BY_ID = new Set(["target", "carrying"]);
const CH_DROPPED = new Set(["sprite", "breach", "press", "auto", "action", "line", "netBuf", "swingTarget"]); // swingTarget: an old save's renderer flag, shed (#102)

export function serializeCharacter(ch) {
  const out = {};
  for (const [k, v] of Object.entries(ch)) {
    if (CH_BY_ID.has(k) || CH_DROPPED.has(k) || typeof v === "function") continue;
    out[k] = v;
  }
  out.targetId = ch.target ? ch.target.id : null;
  out.carryingId = ch.carrying ? ch.carrying.id : null;
  out.carried = ch.carrying ? serializeProp(ch.carrying) : null; // the prop itself: lifted, it is on no chunk (a save with something in hand lost it, found 2026-10-13)
  return out;
}

// `makers` gives the creators (createPlayer, createZombie, createVillager), so
// each kind's own fields exist before the saved ones go over them. The target
// and the carried prop are left as ids for the caller to link once everything
// exists (`_targetId`, `_carryingId`).
export function restoreCharacter(data, makers) {
  let ch;
  if (data.kind === "player") ch = makers.player(data.gx, data.gy, { id: data.id });
  else if (data.kind === "zombie") ch = makers.zombie(data.gx, data.gy, { id: data.id });
  else ch = makers.villager(data.gx, data.gy, { id: data.id, name: data.name, line: data.greeting || null, wardrobe: data.wardrobe || 0 });
  const { targetId, carryingId, carried, worn, hands, pockets, loot, ...rest } = data;
  Object.assign(ch, rest);
  // A save from before nobody climbed through a window (2026-10-16) may hold a climb in progress, { from, to, t }: the
  // body is landed at whichever end is nearer (the lengths were 0.9 s for a player, 1.6 s for the dead) and the climb dropped.
  if (ch.climb) {
    const c = ch.climb;
    const at = c.t / (data.kind === "player" ? 0.9 : 1.6) < 0.5 ? c.from : c.to;
    ch.gx = at[0];
    ch.gy = at[1];
  }
  delete ch.climb;
  ch.worn = worn || createWorn();
  ch.pockets = pockets || null;
  ch.loot = loot || null;
  const main = hands ? hands.main : null;
  let off = hands ? hands.off : null;
  if (main && off && main.uid != null && main.uid === off.uid) off = main; // a two-handed thing is one object in both hands
  ch.hands = { main, off };
  if (ch.loot) {
    const byUid = new Map(ch.loot.items.filter((e) => e.uid != null).map((e) => [e.uid, e]));
    for (const slot of Object.keys(ch.worn)) if (ch.worn[slot] && byUid.has(ch.worn[slot].uid)) ch.worn[slot] = byUid.get(ch.worn[slot].uid);
    for (const h of ["main", "off"]) if (ch.hands[h] && byUid.has(ch.hands[h].uid)) ch.hands[h] = byUid.get(ch.hands[h].uid);
    if (ch.pockets) ch.pockets.items = ch.pockets.items.map((e) => (e.uid != null && byUid.get(e.uid)) || e);
  }
  if (data.kind !== "player") ch.sprite = null; // the player keeps the fixed sheet its creator named; dress() names the others' (game.restore)
  ch.target = null;
  ch.carrying = null;
  ch.breach = null;
  ch.auto = null;
  ch.action = null;
  ch.line = null;
  // A state that leans on what the record drops (the opening it breaks, the fence it presses) starts again from the chase: a world saved
  // with one of the dead at a door threw on its first step after the load (found by check("all")'s sweep, 2026-10-25).
  if (["breach", "breachHit", "press", "pressHit"].includes(ch.state)) ch.state = ch.aggro ? "chase" : "idle";
  ch._targetId = targetId || null;
  ch._carryingId = carryingId || null;
  ch._carried = carried || null; // the caller revives it when the id finds nothing on the map (game.js, net.js)
  return ch;
}

// Say a line (docs/19): a speech bubble over the character's head until it has
// been up for `seconds` of game time, longer for longer lines. A new line
// replaces the one showing. `ui/speech.js` draws it; nothing here touches the DOM.
export function say(ch, text, seconds = null) {
  ch.line = { text, left: seconds ?? Math.max(2, text.length * 0.06) };
}

// Dress a character from a wardrobe: its look, its worn entries, its pockets.
export function wardrobeInto(ch, kind, k) {
  const w = figure.wardrobe(kind, k);
  ch.wardrobe = k;
  if (!w) return dress(ch);
  ch.look = { ...w.look };
  ch.wound = w.wound || null;
  ch.worn = Object.assign(createWorn(), figure.wardrobeWorn(w));
  ch.pockets = w.pockets ? createBag(w.pockets[0], w.pockets[1], "pockets") : null;
  ch.lootTable = w.loot || null;
  return dress(ch);
}

// What is left on a body (docs/19). The first search rolls the pockets from the
// wardrobe's loot table and lays everything the body has, its hands' items, every
// worn garment, its pockets' things, a sack and what is in it, out on a grid of
// the body's own. From then on the grid IS the body: a garment taken from it is
// off the body, and the corpse is drawn without it (`refreshCorpse`). Nothing
// that does not fit is lost: it falls to the floor under the body.
export function lootOf(ch) {
  if (ch.loot) return ch.loot;
  const bag = createBag(6, 6, "body");
  ch.loot = bag;
  if (ch.pockets && ch.lootTable) grid.fill(ch.pockets, rollLoot(ch.lootTable));
  const entries = [];
  for (const e of [ch.hands.main, ch.hands.off]) if (e && !entries.includes(e)) entries.push(e);
  for (const e of Object.values(ch.worn)) if (e) entries.push(e);
  if (ch.pockets) entries.push(...ch.pockets.items);
  // The dead's and the villagers' garments and weapons are made as literals, with no instance id; they become
  // items in a bag here, and an item with no uid cannot be named in a guest's command (the drag sends the uid, the
  // host finds nothing and does nothing: a joiner could not take a body's clothes, found 2026-10-13).
  for (const e of entries) if (e.uid == null) e.uid = nextId("e");
  ch.hands.main = null;
  ch.hands.off = null;
  if (ch.pockets) ch.pockets.items = [];
  for (const e of entries) if (!grid.insert(bag, e)) dropItem(Math.round(ch.gx), Math.round(ch.gy), e);
  // What hit it and stayed: arrows by count, stacked, and below them a thrown thing as itself (`lodgedItems`); what did not fit lies at its feet.
  for (const [id, n] of Object.entries(ch.lodged || {})) {
    const put = grid.add(bag, id, n);
    for (let i = put; i < n; i++) dropItem(Math.round(ch.gx), Math.round(ch.gy), { id, count: 1 });
  }
  ch.lodged = {};
  for (const e of ch.lodgedItems || []) {
    if (e.uid == null) e.uid = nextId("e");
    if (!grid.insert(bag, e)) dropItem(Math.round(ch.gx), Math.round(ch.gy), e);
  }
  ch.lodgedItems = [];
  return bag;
}

// The garments a corpse is still wearing: all of them until it is searched,
// then those still in its grid (the same entries, so taking one off the grid
// takes it off the body, and putting it back dresses the body again).
function presentWorn(ch) {
  const here = ch.loot ? new Set(ch.loot.items) : null;
  const worn = {};
  for (const [slot, e] of Object.entries(ch.worn)) worn[slot] = e && (!here || here.has(e)) ? e : null;
  return worn;
}

// A body is one baked frame: the last of its fall, in the facing it died in,
// drawn in what is still on it, down to the undies (docs/19).
export function dressCorpse(ch) {
  const worn = presentWorn(ch);
  ch.corpseKey = Object.keys(worn).filter((s) => worn[s]).join(",");
  ch.corpse = true;
  for (const e of [ch.hands && ch.hands.main, ch.hands && ch.hands.off, ...Object.values(ch.worn || {})]) douse(e); // a body's torches are out, and stay out when looted (#162)
  const inputs = figure.characterInputs({ ...ch, worn, hands: createHands() });
  ch.sprite = assets.sheetFor(inputs, { anim: ch.anim.name, frame: ch.anim.frame, facing: ch.facing });
  return ch;
}

// Redraw a body if what is on it changed. Cheap: only a signature is compared.
export function refreshCorpse(ch) {
  if (!ch.corpse) return;
  const worn = presentWorn(ch);
  if (Object.keys(worn).filter((s) => worn[s]).join(",") !== ch.corpseKey) dressCorpse(ch);
}

// Point a character at the shared sheet for what it wears now. Call again when
// its clothes, hands, or look change.
export function dress(ch) {
  ch.sprite = assets.sheetFor(figure.characterInputs(ch));
  return ch;
}
