// Every sheet's pixels hashed (docs/23, step 2: a split of figure.js or a move
// in the art pipeline must change no pixel). From the console, on a fresh
// boot: await __game.check("sheets"); then after the change, reload and run it
// again: `same` says whether every sheet hashed as it did, and `changed` names
// the ones that did not. The hashes are kept in sessionStorage, and they do not depend
// on when the check runs (each sheet is read from a CPU copy, below; #233).

function hashPixels(data) {
  let h = 2166136261;
  for (let i = 0; i < data.length; i += 4) {
    h = Math.imul(h ^ data[i], 16777619);
    h = Math.imul(h ^ data[i + 1], 16777619);
    h = Math.imul(h ^ data[i + 2], 16777619);
    h = Math.imul(h ^ data[i + 3], 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function run(game) {
  const G = game;
  const hashes = {};
  for (const sheet of G.assets.allSheets()) {
    const img = sheet.image;
    // Always from a copy on a canvas that lives on the CPU: a sheet's own canvas, read directly, hands back different low bits for its semi-transparent pixels once the
    // renderer has used it as a texture source (the canvas moves to the GPU, whose readback un-premultiplies differently), so a hash taken at boot and one taken a few
    // seconds into play differed by one in a blue or green channel on the edges of shadows (#233: campfire, flame, hearth, lantern_post, torch_post, tree_apple,
    // tree_apple_bare, wall_fence, dev_chest). The copy hashes the same whenever it is taken.
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
