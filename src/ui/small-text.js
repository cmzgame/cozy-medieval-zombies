// Small text (#321; Michael, 2026-10-20: "a fallback very readable sans-serif font for very small text ... anything under like 13px +/- a couple just renders in that font for extra
// clarity at the sake of a smidgeon of flavor"). The pixel font (Pixelify Sans) is the game's voice, but under about fifteen pixels it blurs; the system's own sans-serif is hinted
// for small sizes, needs no download, and is what an Electron build would carry. So every rule at or under the threshold below uses `var(--font-small)` (style.css: `:root`), and the
// text sized from JS asks for the same variable; anything above it stays Pixelify Sans, the Pirata One titles stay Pirata One, and monospace stays monospace. The Display setting
// "Small text" (Clear, the default, or Pixel) puts one class on the page that points `--font-small` back at the pixel font, so Michael can flip and compare. Client-only.
//
// THE THRESHOLD, in UI pixels (a rule's `font-size`, or the `fontPx` of the floating numbers): 15. A later change is this one number, and the check that scans style.css
// and src/ui/*.js (tools/check.js, "small text") reads it from here.

import * as settings from "../settings.js";

export const SMALL_TEXT_MAX_PX = 15;
export const SMALL_FONT_VAR = "var(--font-small)";

function apply() {
  document.documentElement.classList.toggle("small-pixel", settings.get("smallText") === "pixel");
}

export function initSmallText() {
  apply();
  settings.onChange((key) => {
    if (key === "smallText") apply();
  });
}

// The font family the small text uses now, for canvas text (which cannot use a CSS variable): the page's `--font-small` as it resolves.
let familyFor = null; // the class list the cached family was read under
let family = "system-ui, sans-serif";
export function smallFamily() {
  const key = document.documentElement.className;
  if (familyFor !== key) {
    familyFor = key;
    family = getComputedStyle(document.documentElement).getPropertyValue("--font-small").trim() || "system-ui, sans-serif";
  }
  return family;
}
