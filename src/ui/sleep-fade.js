// The fade to black as this client's player sleeps (Michael, 2026-10-26, The playtest's rulings: "the screen fades to black over about a second
// as you sleep and back in as you wake"; with friends only your own screen fades, and they see you beside the bed with a "Zz", ui/speech.js).
// A CSS overlay over the world and under the rest of the interface (the first child of #ui, so the HUD, the log, and the line "You lie down."
// draw over it), its opacity eased by a transition of `feel.sleepFadeSeconds`. It reads this client's own player's `sleeping` (its record on a
// guest) and writes nothing to the world.

import { feel } from "../tuning.js";

let el = null;

export function init() {
  const ui = document.getElementById("ui");
  if (!ui || el) return;
  el = document.createElement("div");
  el.id = "sleep-fade";
  el.style.transitionDuration = `${feel.sleepFadeSeconds}s`;
  ui.insertBefore(el, ui.firstChild);
}

// Each drawn frame: black while my player sleeps, clear otherwise.
export function update(me) {
  if (!el) return;
  const on = !!(me && me.sleeping && !me.dead);
  if (el.classList.contains("on") !== on) {
    el.style.transitionDuration = `${feel.sleepFadeSeconds}s`;
    el.classList.toggle("on", on);
  }
}

// What the check reads: whether it is fading to black, the opacity the page draws now, and the fade under way (its seconds, from the
// page's own CSS transition: a hidden pane draws no frames, so its clock stands still and the check reads the transition instead).
export function state() {
  const t = el ? el.getAnimations().find((a) => a.transitionProperty === "opacity") : null;
  return { on: !!el && el.classList.contains("on"), opacity: el ? Number(getComputedStyle(el).opacity) : 0, seconds: feel.sleepFadeSeconds, fading: t ? t.effect.getTiming().duration / 1000 : 0, transition: t || null };
}
