// Mana (docs/47 section 5, #480; Michael, 2026-10-25): a bar of `player.mana` (data/tuning.json, 100) between health and stamina, regenerating
// `player.manaRegen` a second (two points every three seconds, doubled for the demo pass, Michael 2026-10-26) on the sim clock, in the host's step (game.step), never in updatePlayer, which a
// guest's prediction runs too: nothing a guest predicts spends mana (its draw is the host's, player-controller.js), so its replica's bar is the
// host's record as it arrives. A spell costs `mana` on its book's `spell` (data/items.json; the Fireball 20): a cast is refused before its draw
// starts when the bar cannot pay ("Not enough mana.", and the bar's flash, `manaFlash`, the visual twin of the sound), and the mana is spent when
// the spell is released, never on a cancelled or a dry draw (archery.js). A raised maximum (gear, Faith 4, later) is `maxMana`, in the record's
// heavy part as `maxStamina` is.
//
// Praying at an altar (Faith 1, recorded on the altar's `pray` block and not enforced until the skills): the `pray` verb by the altar's prop id,
// a sprite definition with a `pray` block (data/sprites/altar.json). It is a timed bar of `potions.praySeconds`, built as water.js's boil is:
// `args.timed` starts the bar, whose end runs the verb again, which checks everything afresh and fills mana and stamina; no cooldown, the walk
// to the chapel its cost. The altar's menu entry is the bar itself, so a guest's choice of the label does the same on the host
// (interact.performByLabel).

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import { getDef } from "./assets.js";
import { reachProblem } from "./reach.js";
import { REACH } from "./stations.js"; // the click's reach, as the hive's
import { player as T, potions as PT } from "./tuning.js";
import { world } from "./world.js";
import { rules } from "./rules.js"; // the world's Unlimited mana switch (a dev rule beside Free building, Michael 2026-10-28)
import { showMessage } from "./ui/prompt.js";

export const NOT_ENOUGH = "Not enough mana.";
export const PRAYED = "You pray at the altar. Your mana and stamina are restored.";
export const FLASH_SECONDS = 0.6; // the bar's flash on a refused cast (ui/hud.js): long enough to be seen at a glance

// A player's own maximum (100 until gear or Faith raise it).
export const maxOf = (player) => (Number.isFinite(player.maxMana) ? player.maxMana : T.mana);
export const manaOf = (player) => (Number.isFinite(player.mana) ? player.mana : maxOf(player));

// The cost of what a launcher casts (archery.launcherOf: a spell carries its book's `mana`), 0 for anything else.
export const costOf = (launcher) => (launcher && launcher.kind === "spell" && Number.isFinite(launcher.mana) ? Math.max(0, launcher.mana) : 0);

// The world's Unlimited mana rule (a dev switch beside Free building; Michael, 2026-10-28): on, a cast is never refused and never spends, and the
// bar reads full. It is the world's rule, so a guest's cast follows the host's (the rules ride in the save and in the frames), and a guest's
// own prediction of the refusal flash (player-controller.js) reads the same rule through `canPay`.
export const unlimited = () => !!rules.unlimitedMana;

// Whether the bar can pay `cost` now.
export const canPay = (player, cost) => !(cost > 0) || unlimited() || manaOf(player) >= cost - 1e-9;

// Take `cost` from the bar (the release of a spell). Returns whether it was paid.
export function spend(player, cost) {
  if (!(cost > 0) || unlimited()) return true;
  if (!canPay(player, cost)) return false;
  player.mana = Math.max(0, manaOf(player) - cost);
  return true;
}

// The bar flashes: a guest's prediction sets it on its own replica at once, and the host's record carries it to every client.
export function flash(player) {
  player.manaFlash = FLASH_SECONDS;
}

// A cast the bar cannot pay for: the line, to whoever cast (prompt.js routes it to a guest's screen), and the flash.
export function refuse(player) {
  flash(player);
  showMessage(NOT_ENOUGH);
}

// The host's step, for a living player: the bar regenerates on the sim clock and the flash runs down.
export function update(player, dt) {
  if (player.manaFlash > 0) player.manaFlash = Math.max(0, player.manaFlash - dt);
  const max = maxOf(player);
  const now = manaOf(player);
  if (unlimited()) { // the bar reads full, in the record every client draws from; a potion or the altar changes nothing
    if (player.mana !== max) player.mana = max;
    return;
  }
  if (now < max) player.mana = Math.min(max, now + T.manaRegen * dt);
  else if (player.mana !== now) player.mana = now;
}

// ---- the altar's Pray ----

export function isAltar(prop) {
  if (!prop) return false;
  try { return !!getDef(prop.sprite).pray; } catch { return false; }
}

const propOf = (t) => (typeof t.prop === "string" ? map.propById(t.prop) : t.prop || null);

// The timed bar, the same for the menu and the verb's `timed`: the altar's tiles, the click's reach, `praySeconds`; its end runs the verb.
export function prayAction(player, prop) {
  return {
    kind: "pray",
    label: "Pray",
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1] - 0.6,
    range: REACH,
    duration: PT.praySeconds,
    enabled: true,
    simple: false,
    perform() {
      const r = verbs.run("pray", world, player, { prop: prop.id });
      if (!r.ok) showMessage(r.reason || "Nothing happens.");
      else if (r.message) showMessage(r.message);
      return r.ok;
    },
  };
}

// `pray` (target: { prop: id or prop }; args: { timed }): with `timed`, the bar starts; without it, mana and stamina are filled now (the bar's end).
verbs.define("pray", {
  validate(world, player, target) {
    if (player.dead) return "The dead do not pray.";
    if (player.carrying) return "Your hands are full.";
    const prop = propOf(target);
    if (!isAltar(prop)) return "There is no altar there.";
    return reachProblem(player, prop.tiles, REACH, prop.layer || 0) || true;
  },
  perform(world, player, target, args = {}) {
    const prop = propOf(target);
    if (args.timed) {
      player.action = { action: prayAction(player, prop), elapsed: 0 }; // as interact.startAction starts a timed one
      return { started: true };
    }
    player.mana = maxOf(player);
    player.stamina = player.maxStamina;
    player.winded = false;
    return { message: PRAYED, mana: player.mana, stamina: player.stamina };
  },
});

// The altar's one entry: Pray, the bar.
export function propActions(prop, player, act) {
  if (!isAltar(prop)) return [];
  return [act(prayAction(player, prop))];
}
