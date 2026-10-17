// Every sheet's pixels hashed (docs/23, step 2: a split of figure.js or a move
// in the art pipeline must change no pixel). From the console, on a fresh
// boot: await __game.check("sheets"); then after the change, reload and run it
// again: `same` says whether every sheet hashed as it did, and `changed` names
// the ones that did not. The hashes are kept in sessionStorage, and they do not depend
// on when the check runs or on what has read a sheet's canvas before it (they are of the
// stored, premultiplied colours, below; #233).

// The stored colours, not the read-back ones: a canvas keeps each colour already multiplied by its alpha (premultiplied), and `getImageData` divides it out again, rounding
// as it goes; the same stored byte reads back with a different low bit in a semi-transparent pixel depending on how the canvas was last read (a direct read can move the canvas
// between CPU and GPU storage, and the two un-premultiply differently). Multiplying back by alpha gives the stored byte again either way.
function hashPixels(data) {
  let h = 2166136261;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    h = Math.imul(h ^ Math.round((data[i] * a) / 255), 16777619);
    h = Math.imul(h ^ Math.round((data[i + 1] * a) / 255), 16777619);
    h = Math.imul(h ^ Math.round((data[i + 2] * a) / 255), 16777619);
    h = Math.imul(h ^ a, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function run(game) {
  const G = game;
  const hashes = {};
  for (const sheet of G.assets.allSheets()) {
    const img = sheet.image;
    // From a copy on a canvas that lives on the CPU, so this read leaves the sheet's own canvas alone (a direct read is what moves it between CPU and GPU storage; see hashPixels).
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    hashes[sheet.id] = `${img.width}x${img.height}:${hashPixels(ctx.getImageData(0, 0, img.width, img.height).data)}`;
  }
  const key = "cmz.sheets";
  let previous = null;
  try {
    previous = JSON.parse(sessionStorage.getItem(key) || "null");
    sessionStorage.setItem(key, JSON.stringify(hashes));
  } catch {
    // no storage: the hashes are still returned
  }
  const changed = previous ? Object.keys(hashes).filter((id) => previous[id] !== hashes[id]) : [];
  const missing = previous ? Object.keys(previous).filter((id) => !(id in hashes)) : [];
  return { sheets: Object.keys(hashes).length, same: previous === null ? null : changed.length === 0 && missing.length === 0, changed, missing };
}
