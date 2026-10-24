// The sprite atlas in pages (#353; docs/23, Performance; src/gl.js). From the console, on a fresh page (`?nosave`):
//   await __game.check("atlas")
// The atlas is a stack of 4096 pages, a page a layer of one array texture, opened when a sheet fits none. This check overflows page 0 with filler sheets and proves what the bug (#353: the
// player's body gone when the atlas was full) needs: every sheet there is, the player's figure among them, has frames on a real page; a later small sheet fills the tail of page 0 instead of
// opening another; each page is in its own layer on the GPU (a texel read back from the layer is the canvas's); the player's figure sheet re-placed after the fill lands on a later page and the
// frame is the frame it was (a body drawn from page 1 is the body drawn from page 0; see the fifth row for the one allowance); a sheet that outgrows its slot is placed anew on whatever page has room; and only a sheet
// larger than a page itself draws as nothing. The pages the check opens (two or three) stay until the page is reloaded (a page is never given back). The player's sheet is put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const gl = G.gl;
  const wasPaused = G.loop.isPaused();
  const me = G.player;
  const id = `player_${me.id}`;
  const own = G.assets.getSheet(id);
  const networked = G.net.status().role !== null; // a hosted or joined world's frame is not a fixed one (a replica follows the host's frames, a host's has a guest in it), so there this row judges the page and the coordinates only; the body drawn from page 1 on a guest is in the PR's screenshot
  const realNow = performance.now.bind(performance);
  const isEmpty = (uv) => !uv || (uv[0] === 6 && uv[1] === 1 && uv[2] === 8 && uv[3] === 3);
  const colour = (w, h, css) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const k = c.getContext("2d"); k.fillStyle = css; k.fillRect(0, 0, w, h); return c; };
  const sheetOf = (img) => ({ image: img, frames: { a: [0, 0, img.width, img.height] }, anchor: [0, 0] });
  const grab = () => {
    const gl2 = gl.gl;
    const px = new Uint8Array(gl2.canvas.width * gl2.canvas.height * 4);
    gl2.readPixels(0, 0, gl2.canvas.width, gl2.canvas.height, gl2.RGBA, gl2.UNSIGNED_BYTE, px);
    return px;
  };
  const hashOf = (px) => {
    let h = 2166136261;
    for (let i = 0; i < px.length; i++) h = Math.imul(h ^ px[i], 16777619);
    return (h >>> 0).toString(16);
  };
  // Two frames compared pixel by pixel: how many differ, and how many of those took the colour a neighbour had (above, below, left,
  // right). At the world's zooms (none a whole number) a pixel's centre now and then lands exactly between two texels, and nearest
  // sampling breaks that tie by the float rounding of the interpolated coordinate, which depends on where in the atlas the sheet sits:
  // the same sheet on another slot, of page 0 or any other, can draw such a pixel from the neighbouring texel (#392: seven pixels of one
  // row of the figure, each the colour of the pixel beside it). A tie is no missing body; anything else would be.
  const compare = (A, B, w) => {
    const same = (i, j) => A[j] === B[i] && A[j + 1] === B[i + 1] && A[j + 2] === B[i + 2] && A[j + 3] === B[i + 3];
    let differ = 0;
    let ties = 0;
    for (let i = 0; i < A.length; i += 4) {
      if (same(i, i)) continue;
      differ++;
      if ([4 * w, -4 * w, 4, -4].some((o) => i + o >= 0 && i + o < A.length && same(i, i + o))) ties++;
    }
    return { differ, ties };
  };
  try {
    G.loop.setPaused(true);
    performance.now = () => 1234567.5; // the flames and sways animate on the wall clock: frozen, or no two renders are alike
    G.loop.advance(1 / 60);
    G.loop.advance(0);
    const beforePx = grab();
    const before = hashOf(beforePx);
    const info0 = gl.atlasInfo();
    // 1. Overflow page 0: a filler too tall for what is left of it opens the next page.
    const left0 = info0.size - info0.perPage[0].usedRows;
    const big = sheetOf(colour(4096, Math.max(200, left0 + 40), "#ff00ff"));
    const uvBig = gl.frameUV(big, "a");
    const info1 = gl.atlasInfo();
    row("a sheet too big for what is left of page 0 opens a second page and is placed on it, not skipped", info1.pages >= 2 && !isEmpty(uvBig) && uvBig[4] >= 1, `${info0.pages} page(s) with ${left0} rows left on the first; then ${info1.pages}; the filler on page ${uvBig && uvBig[4]}`);
    // 2. A small sheet afterwards fills the first page's tail when it fits there (first fit across pages).
    const small = sheetOf(colour(120, Math.max(1, Math.min(60, left0 - 1)), "#00ffff"));
    const uvSmall = gl.frameUV(small, "a");
    row("a small sheet placed after the overflow goes to the first page with room (page 0's tail), so pages fill in order", left0 > 1 ? uvSmall[4] === 0 : true, `${left0} rows left on page 0; the small sheet on page ${uvSmall && uvSmall[4]}`);
    // 3. Every sheet there is has frames on a real page, the player's figure among them.
    const bad = [];
    let n = 0;
    for (const sheet of G.assets.allSheets()) {
      if (!sheet.image) continue;
      for (const name of Object.keys(sheet.frames)) {
        const uv = gl.frameUV(sheet, name);
        n++;
        if (isEmpty(uv) || uv[4] >= gl.atlasInfo().pages) bad.push(`${sheet.id}/${name}`);
        if (bad.length > 4) break;
      }
      if (bad.length > 4) break;
    }
    const fig = gl.frameUV(own, Object.keys(own.frames)[0]);
    row("every frame of every sheet has coordinates on a page that exists, none the empty patch, the player's figure among them", bad.length === 0 && !isEmpty(fig), `${n} frames; ${bad.length ? "missing: " + bad.join(", ") : "none missing"}; the figure's first frame on page ${fig && fig[4]}`);
    // 4. The GPU has each page in its own layer: a texel read back is the canvas's.
    G.loop.advance(0); // a render uploads what is dirty
    const t1 = gl.atlasTexel(uvBig[4], uvBig[0] + 3, uvBig[1] + 3);
    const t0 = gl.atlasTexel(0, 1, 1); // page 0's white patch
    row("each page is in its own layer on the GPU: the filler's magenta is on its layer and page 0's white patch on layer 0", !!t1 && t1[0] === 255 && t1[1] === 0 && t1[2] === 255 && t1[3] === 255 && !!t0 && t0[0] === 255 && t0[1] === 255 && t0[2] === 255 && t0[3] === 255, `layer ${uvBig[4]}: ${JSON.stringify(t1)}; layer 0: ${JSON.stringify(t0)}`);
    // 5. The body: the figure's sheet, a new object of the same pixels, is placed after the fill (so on a later page) and the frame is the frame it was.
    const clone = { ...own, image: (() => { const c = document.createElement("canvas"); c.width = own.image.width; c.height = own.image.height; c.getContext("2d").drawImage(own.image, 0, 0); return c; })() };
    // The original's own slot is blanked meanwhile, so a frame that still shows the body is drawn from the copy on the later page and from nothing else.
    const ownImage = own.image;
    own.image = colour(ownImage.width, ownImage.height, "rgba(0,0,0,0)");
    gl.redrawSheet(own);
    G.loop.advance(0);
    const gonePx = grab(); // the control: with the slot blank and nothing else drawn, the body is gone from the frame
    const gone = hashOf(gonePx);
    G.assets.registerSheet(id, clone, own.source);
    const uvClone = gl.frameUV(clone, Object.keys(clone.frames)[0]);
    G.loop.advance(0);
    const afterPx = grab();
    const after = hashOf(afterPx);
    own.image = ownImage;
    gl.redrawSheet(own);
    const w = gl.gl.canvas.width;
    const body = compare(beforePx, gonePx, w).differ; // the pixels the body covers
    const moved = compare(beforePx, afterPx, w);
    const sameFrame = body > 0 && moved.differ === moved.ties && moved.differ <= Math.max(1, Math.floor(body * 0.02));
    row("the player's figure placed after the fill lands on a later page, not as nothing, and the frame is the frame it was, but for sampling ties (in a hosted or joined world, the page only)", uvClone[4] >= 1 && !isEmpty(uvClone) && (networked || sameFrame), `figure ${ownImage.width}x${ownImage.height} on page ${uvClone[4]}; the body covers ${body} pixels (blank: ${gone}); the page-${uvClone[4]} copy's frame ${after === before ? "byte for byte the same" : `differs in ${moved.differ}, ${moved.ties} of them ties`} (${before}, ${after})`);
    G.assets.registerSheet(id, own, own.source);
    // 6. A sheet that outgrows its slot is placed anew, across pages.
    const grow = sheetOf(colour(300, 100, "#ffff00"));
    const g0 = gl.frameUV(grow, "a");
    grow.image = colour(1300, 700, "#00ff00");
    grow.frames.a = [0, 0, 1300, 700];
    gl.redrawSheet(grow);
    const g1 = gl.frameUV(grow, "a");
    G.loop.advance(0);
    const gt = gl.atlasTexel(g1[4], g1[0] + 5, g1[1] + 5);
    row("a sheet that outgrew its slot is placed anew (on whatever page has room) and the new picture is there on the GPU", !isEmpty(g1) && (g1[0] !== g0[0] || g1[1] !== g0[1] || g1[4] !== g0[4]) && !!gt && gt[0] === 0 && gt[1] === 255 && gt[2] === 0, `slot ${JSON.stringify(g0)} then ${JSON.stringify(g1)}; texel ${JSON.stringify(gt)}`);
    // 7. Only a sheet larger than a page draws as nothing.
    const pagesBefore = gl.atlasInfo().pages;
    const huge = sheetOf(colour(4097, 8, "#ffffff"));
    const uvHuge = gl.frameUV(huge, "a");
    row("a sheet wider than a page, which no page could hold, is the one case that draws as the empty patch, and it opens no page", isEmpty(uvHuge) && gl.atlasInfo().pages === pagesBefore, `${JSON.stringify(uvHuge)}; pages ${pagesBefore} then ${gl.atlasInfo().pages}`);
    // 8. A sheet exactly a page wide fits (the shelf's gutter is for its neighbours): it is placed, on a page that has the room, and nothing throws.
    let uvWide = null;
    let wideErr = "";
    try {
      uvWide = gl.frameUV(sheetOf(colour(4096, 8, "#0000ff")), "a");
    } catch (e) {
      wideErr = e.message;
    }
    row("a sheet exactly 4096 wide is placed (no page left open for nothing, no throw)", !wideErr && !!uvWide && !isEmpty(uvWide) && uvWide[2] - uvWide[0] === 4096 && gl.atlasInfo().pages <= pagesBefore + 1, wideErr || `${JSON.stringify(uvWide)}; pages ${pagesBefore} then ${gl.atlasInfo().pages}`);
    // 9. An error queued from elsewhere is not a refusal: with one waiting, a page-sized sheet opens another page, which the GPU has in its own layer, and nothing is capped.
    const pagesNow = gl.atlasInfo().pages;
    gl.gl.enable(9999); // queues INVALID_ENUM: getError would hand it to the next call that asks
    const full = sheetOf(colour(4096, 4096, "#ff8800"));
    const uvFull = gl.frameUV(full, "a");
    G.loop.advance(0);
    const tf = gl.atlasTexel(uvFull[4], uvFull[0] + 10, uvFull[1] + 10);
    const info2 = gl.atlasInfo();
    row("a stale queued GL error is not read as the GPU refusing a page: a sheet as big as a page opens page " + (pagesNow + 1) + " and its layer holds it", info2.pages === pagesNow + 1 && !isEmpty(uvFull) && uvFull[4] === pagesNow && !!tf && tf[0] === 255 && tf[1] === 136 && tf[2] === 0, `pages ${pagesNow} then ${info2.pages}; the sheet on page ${uvFull[4]}; texel ${JSON.stringify(tf)}`);
    const info = gl.atlasInfo();
    row("the atlas reports its pages and each one's fill", info.pages === info.perPage.length && info.perPage.every((p) => p.fraction >= 0 && p.fraction <= 1) && info.usedRows === info.perPage.reduce((s, p) => s + p.usedRows, 0), JSON.stringify(info.perPage));
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    performance.now = realNow;
    if (G.assets.getSheet(id) !== own) G.assets.registerSheet(id, own, own.source);
    G.loop.advance(1 / 60);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
