// A dyed item's drawn pictures in the bag and the slots (Michael, 2026-10-26: "a dyed satchel's bag icon and slot portrait should show
// its dye colours, as the figure does"). The figure swaps a painted garment's two key tones per region (figure/draw.js); a drawn icon or
// portrait shades each region with a whole ramp, so each region of the item's `dye` names the picture's `tones` it owns, and every one of
// them moves to the entry's colour for that region at the same lightness against the item's own colour (lighter or darker by the same
// factor); a tone no region names (the outline, a buckle, a toggle, hobnails) keeps its paint. Client-only: a picture, made once per
// picture and colours from the delivered PNG and cached as a data URL; `version` rises when one is ready, so the panel that showed the
// undyed picture meanwhile draws again. Nothing here reaches the world, the save, or the wire.
import { loadImage, url as assetUrl } from "../assets.js";
import { currentColours, ownColours } from "../dye.js";

const made = new Map(); // `${src}|${colours}` -> data URL, or null while it is being made
let ready = 0;

export function version() {
  return ready;
}

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;

// The tone a painted tone `t` becomes when its region's own colour `own` is dyed `to`: the dye scaled by the tone's lightness against
// the own colour's, darker toward black and lighter toward white.
export function shift(t, own, to) {
  const f = lum(rgbOf(t)) / Math.max(1, lum(rgbOf(own)));
  const d = rgbOf(to);
  const out = f <= 1 ? d.map((v) => v * f) : d.map((v) => v + (255 - v) * Math.min(1, f - 1));
  return out.map((v) => Math.max(0, Math.min(255, Math.round(v))));
}

// The tone map for an entry: painted hex -> [r, g, b], or null when nothing changes (undyed, or no region names its tones).
export function toneMap(def, entry) {
  const regions = def && def.dye && def.dye.regions;
  if (!regions || !regions.some((r) => Array.isArray(r.tones) && r.tones.length)) return null;
  const own = ownColours(def);
  const now = currentColours(entry);
  if (now.every((c, i) => c === own[i])) return null;
  const m = new Map();
  regions.forEach((r, i) => {
    if (!Array.isArray(r.tones) || now[i] === own[i]) return;
    for (const t of r.tones) m.set(t.toLowerCase(), shift(t.toLowerCase(), own[i], now[i]));
  });
  return m.size ? m : null;
}

// The src to show for a drawn picture `pic` ({ src }) of `entry`: its dyed copy once made, the painted one until then (and always
// for an undyed entry).
export function dyedSrc(def, entry, pic) {
  const m = toneMap(def, entry);
  if (!m) return assetUrl(pic.src);
  const key = `${pic.src}|${currentColours(entry).join(",")}`;
  const have = made.get(key);
  if (have) return have;
  if (have === undefined) {
    made.set(key, null);
    loadImage(pic.src).then((img) => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const hex = "#" + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
        const to = m.get(hex);
        if (to) [d[i], d[i + 1], d[i + 2]] = to;
      }
      ctx.putImageData(data, 0, 0);
      made.set(key, c.toDataURL("image/png"));
      ready++;
    }).catch(() => made.delete(key));
  }
  return assetUrl(pic.src);
}
