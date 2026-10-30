// The WebGL2 core (docs/08-renderer.md). One texture atlas of every sprite
// sheet, one interleaved vertex buffer rebuilt each frame in sort order, and
// one shader. Every vertex carries the world point its light is read from,
// so a floor pixel reads its own point, a standing thing its foot, and a wall
// face a point along its foot line; the fragment shader samples the light,
// ambient, and fog textures there. Raw WebGL, no library (Michael, 2026-10-09).
//
// Vertex: pos (2, screen px), uv (2, atlas) and page (1, the atlas layer), world (2, grid), height (1, px
// above the foot), color (4, multiplier), flags (1), depth (1). Flag bits: 1 unlit (a
// flame), 2 occluder (fades in the holes), 4 sky (lit by outdoors only),
// 8 unfogged.
//
// The depth buffer (docs/51): the frame sorts per pixel. Every vertex carries its own depth, the style bible's X + Y + Z
// toward the camera (a tile is 32 units, a pixel of height one), computed here on the CPU from the depth surface its
// drawable set (`surface`): a vertical plane through true geometry, `depth = A * sx - sy + C` at screen point (sx, sy),
// or a ridge, two such planes meeting at a column (a prop's two front faces, split at its footprint's front corner),
// across which a quad is cut in two. `a_world` and `a_height` go on serving the light and are never the depth. Quads
// go to five passes, drawn in this order: flat (the ground and what lies on it; no depth written or tested), opaque
// (depth tested and written, alpha under a half discarded), translucent (tested, not written: a quad with a colour
// alpha under 1, an occluder, or one from a soft sheet, per quad), a faded storey (PASS_FADE, below), and on top (no test: the ghosts, the marker, the hit
// shapes). Within a drawable each quad sits a small step nearer than the one emitted before it, so a drawable's own
// layering (a cap over its face, a flame over its hearth, a held sword over the hand) stands; an outline's copies sit a
// step behind their base.

export const FLAG_UNLIT = 1;
export const FLAG_OCCLUDER = 2;
export const FLAG_SKY = 4;
export const FLAG_NOFOG = 8;
export const FLAG_STANDING = 16; // a prop or a character: takes the legibility floor
export const FLAG_SOLID = 32; // the quad's colour, flat, keeping the sprite's shape: an outline (docs/14)
export const FLAG_UPPER = 64; // a storey's (docs/49 section 6): lit, shaded, and fogged by its own set of area textures; with the next two bits (128, 256) a set number 1 to 7 (`setFlags`)
// The storeys' own sets of area textures (docs/53 section 6.4): up to STOREY_SETS, stacked one under another in the second textures, a
// storey's quads carrying their set's number in three bits of the flags; a storey past the cap is lit as the open sky (a default).
export const STOREY_SETS = 6;
export const setFlags = (n) => (n >= 1 && n <= STOREY_SETS ? n * FLAG_UPPER : FLAG_SKY);

// The passes (docs/51 section 4). PASS_STAND is what a standing drawable asks for: its quads go to the opaque pass, or
// to the translucent one by the rule above (`route`); PASS_TRANS is that store's index, never asked for by an emitter.
export const PASS_FLAT = 0;
export const PASS_STAND = 1;
export const PASS_TRANS = 2;
export const PASS_TOP = 3;
// A faded storey (docs/49 section 6, "a storey you stand behind fades"): while `setFade` is on, a standing quad that would be opaque goes
// here instead, drawn after the translucent pass twice: first its depth alone (the alpha test at a half, no colour), so each pixel keeps
// the storey's nearest surface, then its colour where it is that nearest surface, at the fade's alpha, writing no more depth. The storey
// is laid over what is behind it as one sheet at the near-wall fade's alpha, never its walls, floor, and caps stacked one through
// another, and a body behind it, drawn opaque in pass 1, shows through. A quad of it that is translucent already goes to the translucent
// pass with its alpha times the fade's.
export const PASS_FADE = 4;
// Seen but covered (docs/53 section 6.2, mechanism 4): a body the viewer sees, drawn again flat in one colour where something nearer covers it,
// and only there: tested with the depth reversed (a fragment drawn where the stored surface is nearer), nothing written, after the translucent
// pass, so its own visible pixels (its own depth, the quad a step nearer) are left as they are and the covered ones show its shape.
export const PASS_XRAY = 5;

// The depth range follows the camera (docs/51 section 5): a vertex stores its depth less the camera's own
// ((cam.gx + cam.gy) * 32), and the clip z is 1 - 2 (depth - base) / 8192 with base the camera's depth less 4096,
// which is -relative / 4096: the whole of clip space over +-4096 units round the camera, nearer the smaller z.
export const DEPTH_HALF_RANGE = 4096;
const DEPTH_CENTRE_STEP = 256; // the depth range's centre moves in these steps (begin)
const ALPHA_TEST = 0.5; // the opaque pass discards a fragment whose alpha is under this
const ALPHA_FLOOR = 0.004; // every other pass discards only what is all but clear, as before

const STRIDE = 14; // floats per vertex
let ATLAS = 2048; // raised to 4096 in init when the GPU allows: the figures' sheets are large (docs/12)

export let gl = null;
let lost = false; // the WebGL context is gone until the browser restores it (docs/23a, A2)
let areaEpoch = 0; // bumped when the area textures must be uploaded afresh (a restored context)
export function getAreaEpoch() {
  return areaEpoch;
}
const restoreHooks = [];
let program = null;
let vao = null;
let vbo = null;
// One vertex store per pass (PASS_FLAT, the opaque, the translucent, PASS_TOP, PASS_FADE), each in emit order; `verts` and `count` are the one being
// written, swapped in by `useBucket`. The ground's quads are the first of the flat store.
const buckets = [0, 1, 2, 3, 4, 5].map(() => ({ verts: new Float32Array(1 << 15), count: 0 }));
let cur = 0;
let verts = buckets[0].verts;
let count = 0; // floats written to the current store
let upload = new Float32Array(1 << 17); // the stores end to end, for the one buffer upload of a frame
let lastPassCounts = [0, 0, 0, 0, 0]; // vertices in each pass last frame (check("depth"), the cost row)
let lastRoomStep16 = 0; // the last frame's quads whose step would have passed their kind's room at 16 bits (check("depth"))

// ---- the depth surface (docs/51 section 3) ----
let depthBits = 16; // what the context gave, read in setup(); 16 is all WebGL promises
let depthStepSize = 0.25; // the emit-order step in depth units: two steps of the buffer, or more (sized in setup)
let pass = PASS_FLAT;
let sA = 0; // the surface: depth = sA * sx - sy + sC (a plane), or, with sX a number, the ridge
let sC = 0; //   sC - sy - 1.5 |sx - sX| (two planes meeting at the column sX)
let sB = -1; // a plane's coefficient of sy: -1 for every vertical plane, +2 for a lifted floor (docs/49 section 6)
let sX = NaN;
let sFloorN = 0; // a surface's floor planes (render/depth.js againstWalls), its depth the most of its own and theirs: how many,
const sFloorA = new Float64Array(2); //   and each one's A and C (depth = A * sx - sy + C)
const sFloorC = new Float64Array(2);
let sBias = 0; // the drawable's kind bias (scene.js DEPTH_BIAS)
let order = 0; // quads emitted on the surface so far: each sits `depthStepSize` nearer than the last
let maxOrder = Infinity; // the most steps the surface's quads may climb: under its kind's room (surface), so at 16 bits a drawable never reaches the next kind
let layerTop = -1; // the highest layer used since the last `layer(null)`: the count goes on after it
let layerAt = -1; // >= 0: the quads that follow take this step of the order, whatever came before (`layer`), and do not count
let behind = false; // an outline's copies: a step behind the quad they outline, not counted
let held = 0; // > 0: quads share one step (bees: a figure of many pixels is one layer), stepped once when released
let heldUsed = false;
let center = 0; // the camera's depth this frame: vertices store depth less it
let frameNo = 0; // frames begun: what a per-frame cache keys on (render/walls.js's posts)
let roomStep16 = 0; // quads this frame whose step would pass their kind's room at 16 bits' step (check("depth")): the layering's own need, unclamped
const STEP_16 = (2 * 2 * DEPTH_HALF_RANGE) / 2 ** 16;
let fadeA = 0; // > 0 while a faded storey emits (setFade): its alpha
let fadeDraw = 1; // the alpha the fade pass is drawn at this frame
let mark = null; // check("depth")'s probe: [r, g, b] every quad is drawn in, flat, unlit, and unfogged, its alpha and its pass kept
let whiteUV = null;
let emptyUV = null; // a transparent patch: what a sprite that could not be placed draws as (a last resort now: a sheet larger than a page, or a page the GPU refused)
let atlasWarned = 0; // 0: nothing yet, 2: a sheet was refused (larger than a page, or the GPU gave no more pages)
let currentWhite = [0, 0, 0, 0];

// ---- atlas ----
// The sprite atlas is a stack of pages (docs/23, Performance; #353): each page is a 4096 by 4096 canvas on the CPU (the pages live there and survive a context loss) and a layer of one
// `sampler2DArray` on the GPU. Page 0 is made at init; a sheet that fits no page's shelves opens the next one, so nothing is ever skipped for want of room and a game that fits in one pays
// for one (64 MB on the GPU, 64 MB on the CPU, each). A texture per page would have broken the one draw of a frame wherever the sorted stream changed page (props, walls, and the dead
// interleave their sheets by depth); an array keeps it one draw, the page being a vertex attribute. The array is made with as many layers as there are pages and made again, every page
// re-uploaded from its canvas, when a page opens (once per page, never in a frame that opens none); a dirty page is uploaded alone.
const pages = []; // { canvas, ctx, shelfX, shelfY, shelfH, dirty }
let gpuLayers = 0; // layers the GPU array has now
let pageCap = Infinity; // pages the GPU would give: the array's limit, or fewer if it refused one
let maxLayers = 256; // gl.MAX_ARRAY_TEXTURE_LAYERS, read in init
let pagesOpened = 0; // pages opened after the first, for the log
let atlasTex = null;
let stageTex = null; // the one staging texture a page goes up through, made at the first dirty upload and kept (64 MB of GPU, on purpose: see uploadAtlas)
let stageFbo = null; // the framebuffer it is read through, with it attached
const placed = new WeakMap(); // sheet -> { page, ax, ay, w, h }

function openPage() {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const page = { canvas, ctx: canvas.getContext("2d"), shelfX: 0, shelfY: 0, shelfH: 0, dirty: true };
  pages.push(page);
  return page;
}

// Where a w by h sheet would go on a page (its shelf position), or null if it does not fit. A shelf's sheets are a pixel apart, but a sheet that starts a shelf may be as wide as the page:
// a sheet no larger than the page in both ways always fits an empty one (`place` sends only the larger ones to the empty patch).
function slotOn(page, w, h) {
  let x = page.shelfX;
  let y = page.shelfY;
  let sh = page.shelfH;
  if (x > 0 && x + w + 1 > ATLAS) {
    x = 0;
    y += sh + 1;
    sh = 0;
  }
  if (y + h > ATLAS) return null;
  return { x, y, sh };
}

function place(sheet) {
  let p = placed.get(sheet);
  if (p) return p;
  const img = sheet.image;
  const w = img.width;
  const h = img.height;
  if (w > ATLAS || h > ATLAS) {
    if (atlasWarned < 2) console.warn(`sprite sheet ${w}x${h} is larger than an atlas page (${ATLAS}): not drawn`);
    atlasWarned = 2;
    return null;
  }
  // The first page with room, so a small sheet late in the day still fills the tail of an earlier page.
  let at = null;
  let page = null;
  for (let i = 0; i < pages.length && !at; i++) {
    at = slotOn(pages[i], w, h);
    if (at) page = pages[i];
  }
  if (!at) {
    if (pages.length >= Math.min(pageCap, maxLayers)) {
      if (atlasWarned < 2) console.warn(`sprite atlas full at ${pages.length} pages: ${w}x${h} sheet not drawn (the GPU refused another page)`);
      atlasWarned = 2;
      return null;
    }
    page = openPage();
    at = slotOn(page, w, h);
    if (!at) {
      pages.pop(); // cannot happen for a sheet within the page's size; never leave an empty page open
      return null;
    }
    pagesOpened++;
    console.info(`sprite atlas page ${pages.length} opened for a ${w}x${h} sheet (the first page held ${pages[0].shelfY + pages[0].shelfH} of ${ATLAS} rows)`);
  }
  if (at.x === 0 && at.y !== page.shelfY) {
    page.shelfY = at.y;
    page.shelfH = 0;
  }
  page.shelfX = at.x;
  page.ctx.drawImage(img, at.x, at.y);
  p = { page: pages.indexOf(page), ax: at.x, ay: at.y, w, h }; // the slot's size: a redraw never paints outside it
  placed.set(sheet, p);
  page.shelfX += w + 1;
  page.shelfH = Math.max(page.shelfH, h);
  page.dirty = true;
  return p;
}

// Pack a sheet now rather than at its first draw: boot packs every sheet, so the
// one full upload happens behind the loading screen (docs/23, step 1).
export function placeSheet(sheet) {
  return place(sheet);
}

// How full the atlas is: its side, the pages, each page's rows used so far (px) and fraction, and the totals (`usedRows` over all pages, `fraction` of all the rows there are).
export function atlasInfo() {
  const list = pages.map((pg) => {
    const used = pg.shelfY + pg.shelfH;
    return { usedRows: used, fraction: +(used / ATLAS).toFixed(3) };
  });
  const used = list.reduce((n, p) => n + p.usedRows, 0);
  return { size: ATLAS, pages: list.length, perPage: list, usedRows: used, fraction: +(used / (ATLAS * Math.max(1, list.length))).toFixed(3) };
}

// One texel of a page as the GPU has it, [r, g, b, a] (for check("atlas"): the upload put each page in its own layer). Reads the layer through a throwaway framebuffer.
export function atlasTexel(page, x, y) {
  if (!gl || lost || !atlasTex || page >= gpuLayers) return null;
  uploadAtlas();
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
  gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, atlasTex, 0, page);
  const px = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  return [...px];
}

// Redraw a sheet whose image changed (the player's clothes) at its place.
// A sheet that grew past its slot (the player's: a weapon with a second attack adds frames, docs/32) gets a new slot, on whatever page has room;
// redrawn in the old one it painted over its neighbours on the shelf, the newest body's frame among them, which then
// showed a standing player where a zombie had died (Michael's playtest, 2026-10-14). The old slot is left empty: a
// sheet grows to the widest it is ever drawn at and stays there, so this costs one slot per growth.
export function redrawSheet(sheet) {
  const p = placed.get(sheet);
  if (!p) return;
  const page = pages[p.page];
  if (sheet.image.width > p.w || sheet.image.height > p.h) {
    page.ctx.clearRect(p.ax, p.ay, p.w, p.h);
    placed.delete(sheet);
    place(sheet); // packs and draws it at a new slot, on this page or another
    page.dirty = true;
    return;
  }
  page.ctx.clearRect(p.ax, p.ay, p.w, p.h);
  page.ctx.drawImage(sheet.image, p.ax, p.ay);
  page.dirty = true;
}

// Atlas coordinates of a frame, in texels, and its page: [u0, v0, u1, v1, page, soft].
export function frameUV(sheet, name) {
  const f = sheet.frames[name];
  if (!f) return null;
  const p = place(sheet.sliceOf || sheet); // a slice of a wider picture (render/walls.js gateSlice) shares its whole sheet's place in the atlas
  if (!p || p.page >= pageCap) return emptyUV;
  return [p.ax + f[0], p.ay + f[1], p.ax + f[0] + f[2], p.ay + f[1] + f[3], p.page, sheet.soft ? 1 : 0]; // the sixth: a soft sheet's frame, drawn in the translucent pass (docs/51)
}

// ---- shaders ----
const VS = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
in float a_page;
in vec2 a_world;
in float a_height;
in vec4 a_color;
in float a_flags;
in float a_depth; // X + Y + Z toward the camera, less the camera's own (docs/51)
uniform vec2 u_res;
uniform vec2 u_texSize; // the bound texture's size in texels: the atlas, or a chunk's ground (docs/15)
uniform float u_depthHalf; // half the depth range: 4096 units either side of the camera
out vec2 v_uv;
flat out float v_page;
out vec2 v_world;
out float v_height;
out vec4 v_color;
flat out float v_flags;
out vec2 v_screen;
void main() {
  v_uv = a_uv / u_texSize;
  v_page = a_page;
  v_world = a_world;
  v_height = a_height;
  v_color = a_color;
  v_flags = a_flags;
  v_screen = a_pos;
  vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
  // z_ndc = 1 - 2 (depth - base) / 8192, base the camera's depth less 4096: the nearer, the smaller, which LEQUAL keeps.
  gl_Position = vec4(clip.x, -clip.y, -a_depth / u_depthHalf, 1.0);
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
flat in float v_page;
in vec2 v_world;
in float v_height;
in vec4 v_color;
flat in float v_flags;
in vec2 v_screen;
out vec4 o;
uniform highp sampler2DArray u_tex; // the atlas, a page a layer
uniform sampler2D u_ground; // a chunk's ground picture, when u_isGround
uniform int u_isGround;
uniform sampler2D u_light;
uniform sampler2D u_ambient;
uniform sampler2D u_fog;
uniform sampler2D u_light2; // the storeys' own light, ambient, and fog (docs/53 section 6.4), STOREY_SETS of them stacked, read by a vertex's set number
uniform sampler2D u_ambient2;
uniform sampler2D u_fog2;
uniform int u_hasUpper;
uniform vec2 u_areaOrigin;
uniform vec2 u_areaTiles;
uniform float u_nightFloor;
uniform float u_nightAlpha;
uniform vec3 u_tint;
uniform float u_outdoor;
uniform vec2 u_player;
uniform float u_pool;
uniform float u_poolStrength;
uniform float u_climb;
uniform vec3 u_fogColor;
uniform float u_fogAlpha;
uniform vec2 u_holes[8];
uniform int u_holeCount;
uniform float u_holeInner;
uniform float u_holeOuter;
uniform float u_minStanding;
uniform float u_softLight;
uniform int u_debug;
uniform float u_alphaCut; // the opaque pass's alpha test (a half); the others' near-clear floor
uniform float u_fade; // the faded storey's alpha in its colour draw (PASS_FADE); 1 otherwise
const float STOREY_SETS_F = 6.0; // gl.js STOREY_SETS

// The player's own weak night vision: the cozy parent's gradient stops.
float poolAt(vec2 p) {
  float t = distance(p, u_player) / u_pool;
  float s = u_poolStrength;
  if (t >= 1.0) return 0.0;
  if (t < 0.35) return s - (s - s * 0.8) * (t / 0.35);
  if (t < 0.7) return s * 0.8 - (s * 0.8 - s * 0.35) * ((t - 0.35) / 0.35);
  return s * 0.35 * (1.0 - (t - 0.7) / 0.3);
}

void main() {
  vec4 tex = (u_isGround == 1 ? texture(u_ground, v_uv) : texture(u_tex, vec3(v_uv, v_page))) * v_color;
  if (tex.a < u_alphaCut) discard;
  float f = v_flags;
  bool unlit = mod(f, 2.0) >= 1.0;
  bool occ = mod(floor(f / 2.0), 2.0) >= 1.0;
  bool sky = mod(floor(f / 4.0), 2.0) >= 1.0;
  bool nofog = mod(floor(f / 8.0), 2.0) >= 1.0;
  bool standing = mod(floor(f / 16.0), 2.0) >= 1.0;
  bool solid = mod(floor(f / 32.0), 2.0) >= 1.0;
  float setN = mod(floor(f / 64.0), 8.0); // a storey's set, 1 to STOREY_SETS, or 0 the ground's
  bool upper = u_hasUpper == 1 && setN >= 1.0;
  // Texel i of the tile textures covers [origin + i - 0.5, origin + i + 0.5);
  // the light texture spans the same area at more texels per tile.
  vec2 tileUV = (v_world - u_areaOrigin + 0.5) / u_areaTiles;
  vec2 setUV = vec2(tileUV.x, (clamp(tileUV.y, 0.5 / u_areaTiles.y, 1.0 - 0.5 / u_areaTiles.y) + setN - 1.0) / STOREY_SETS_F); // its own band of the stacked storey textures, half a tile inside it so no read reaches the next (the review of #605)
  vec3 rgb = solid ? v_color.rgb : tex.rgb;
  // Debug views (docs/08): the light, ambient, or fog texture as grey over the
  // world, read at the fragment's own sample point.
  if (u_debug == 1) { o = vec4(vec3(texture(u_light, tileUV).r), 1.0); return; }
  if (u_debug == 2) { o = vec4(vec3(texture(u_ambient, tileUV).r), 1.0); return; }
  if (u_debug == 3) { o = vec4(vec3(texture(u_fog, tileUV).r), 1.0); return; }
  if (!unlit) {
    float amb = sky ? u_outdoor : upper ? texture(u_ambient2, setUV).r : texture(u_ambient, tileUV).r;
    float st = sky ? 0.0 : upper ? texture(u_light2, setUV).r : texture(u_light, tileUV).r;
    // A pool climbs a wall or a tree from its foot and fades with height.
    if (u_climb > 0.0) st *= max(0.0, 1.0 - v_height / u_climb);
    // The sum, capped: where ambient alone is near full, a pool's climb running
    // out draws a line across the wall. Soft: the two combine like two lamps,
    // never capped, so the pool fades out smoothly (a knob, 2026-10-12).
    float light = u_softLight > 0.5 ? 1.0 - (1.0 - amb) * (1.0 - st) : min(1.0, amb + st);
    if (standing) light = max(light, u_minStanding);
    float dark = clamp((1.0 - light) / (1.0 - u_nightFloor), 0.0, 1.0) * u_nightAlpha;
    dark *= 1.0 - poolAt(v_screen);
    rgb *= mix(vec3(1.0), u_tint, dark);
  }
  float a = tex.a;
  if (occ) {
    for (int i = 0; i < 8; i++) {
      if (i >= u_holeCount) break;
      a *= smoothstep(u_holeInner, u_holeOuter, distance(v_screen, u_holes[i]));
    }
  }
  if (!nofog) {
    float vis = upper ? texture(u_fog2, setUV).r : texture(u_fog, tileUV).r;
    if (vis < 0.5) rgb = mix(rgb, u_fogColor, u_fogAlpha);
  }
  o = vec4(rgb * a, a) * u_fade;
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

const uniforms = {};

export function init(canvas) {
  gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true, alpha: false });
  if (!gl) throw new Error("WebGL2 is not available");
  // The atlas canvas lives on the CPU and survives a context loss; everything on
  // the GPU is made in setup(), which runs again when the context comes back.
  ATLAS = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048);
  maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) || 256;
  if (!pages.length) {
    const first = openPage();
    first.ctx.fillStyle = "#fff";
    first.ctx.fillRect(0, 0, 4, 4);
    first.shelfX = 10;
    first.shelfH = 4;
  }
  whiteUV = [1, 1, 3, 3, 0];
  emptyUV = [6, 1, 8, 3, 0]; // x 5 to 9 of the first row is left transparent
  setup();
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault(); // without it the browser never restores the context
    lost = true;
    console.warn("WebGL context lost; drawing stops until the browser restores it (docs/23a, A2)");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    setup();
    lost = false;
    areaEpoch++;
    for (const fn of restoreHooks) fn();
    console.warn("WebGL context restored: the atlas re-uploaded, the ground re-baked");
  });
}

export function isLost() {
  return lost;
}

// Called after a restored context has its program and textures again; the
// ground registers one to mark its chunks for re-baking (its textures are gone).
export function onRestore(fn) {
  restoreHooks.push(fn);
}

function setup() {
  program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  for (const name of ["u_res", "u_texSize", "u_tex", "u_ground", "u_isGround", "u_light", "u_ambient", "u_fog", "u_light2", "u_ambient2", "u_fog2", "u_hasUpper", "u_areaOrigin", "u_areaTiles", "u_nightFloor", "u_nightAlpha", "u_tint", "u_outdoor", "u_player", "u_pool", "u_poolStrength", "u_climb", "u_fogColor", "u_fogAlpha", "u_holes", "u_holeCount", "u_holeInner", "u_holeOuter", "u_minStanding", "u_softLight", "u_debug", "u_depthHalf", "u_alphaCut", "u_fade"]) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const bytes = STRIDE * 4;
  const attr = (name, size, offset) => {
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, bytes, offset * 4);
  };
  attr("a_pos", 2, 0);
  attr("a_uv", 2, 2);
  attr("a_page", 1, 4);
  attr("a_world", 2, 5);
  attr("a_height", 1, 7);
  attr("a_color", 4, 8);
  attr("a_flags", 1, 12);
  attr("a_depth", 1, 13);
  // The atlas texture (the canvas behind it is kept across a loss) and the area textures.
  atlasTex = null; // made in end() with a layer for every page
  gpuLayers = 0;
  stageTex = null;
  stageFbo = null;
  pageCap = Infinity; // a restored context starts without the cap an earlier one met
  groundTex.clear(); // a lost context took the ground's textures with it; the ground re-bakes
  gl.uniform1i(uniforms.u_tex, 0);
  gl.uniform1i(uniforms.u_ground, 4);
  gl.uniform1i(uniforms.u_light, 1);
  gl.uniform1i(uniforms.u_ambient, 2);
  gl.uniform1i(uniforms.u_fog, 3);
  gl.uniform1i(uniforms.u_light2, 5);
  gl.uniform1i(uniforms.u_ambient2, 6);
  gl.uniform1i(uniforms.u_fog2, 7);
  lightTex = makeTexture(gl.LINEAR);
  ambientTex = makeTexture(gl.NEAREST);
  fogTex = makeTexture(gl.NEAREST);
  lightTex2 = makeTexture(gl.LINEAR);
  ambientTex2 = makeTexture(gl.NEAREST);
  fogTex2 = makeTexture(gl.NEAREST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  // The depth buffer (docs/51 section 5), set here so it survives a lost context: the test on, LEQUAL (the default LESS
  // gives a tie to the first drawn, the wrong way for every bias), the whole window range, and the mask on for the clear.
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthRange(0, 1);
  gl.clearDepth(1);
  gl.depthMask(true);
  gl.uniform1f(uniforms.u_depthHalf, DEPTH_HALF_RANGE);
  gl.uniform1f(uniforms.u_alphaCut, ALPHA_FLOOR);
  depthBits = readDepthBits();
  // The emit-order step: two steps of the buffer at the least (16 bits over 8192 units is 0.125 a step, so 0.25), and never under 1/32 of a
  // unit, so a deeper buffer's step stays well clear of the float rounding of two triangles on one plane.
  depthStepSize = Math.max((2 * 2 * DEPTH_HALF_RANGE) / 2 ** depthBits, 1 / 32);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
}

// The depth buffer's bits (docs/51 section 5: WebGL promises 16, most browsers give 24). DEPTH_BITS where the context answers it, else the
// default framebuffer's depth attachment, else the promise.
function readDepthBits() {
  let bits = 0;
  try {
    bits = gl.getParameter(gl.DEPTH_BITS) || 0;
  } catch {
    bits = 0;
  }
  while (gl.getError() !== gl.NO_ERROR); // a context that refuses DEPTH_BITS queues an error: drain it, or a later check reads it as its own
  if (!bits) {
    try {
      bits = gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER, gl.DEPTH, gl.FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE) || 0;
    } catch {
      bits = 0;
    }
    while (gl.getError() !== gl.NO_ERROR);
  }
  return bits || 16;
}

// What the depth buffer gave and the steps sized from it, for check("depth").
export function depthInfo() {
  return { bits: depthBits, step: depthStepSize, halfRange: DEPTH_HALF_RANGE, unitsPerBufferStep: (2 * DEPTH_HALF_RANGE) / 2 ** depthBits, passes: [...lastPassCounts], pastRoomAt16: lastRoomStep16 };
}

// The emit-order step in depth units (scene.js sizes nothing from it; the outline and the checks read it).
export function depthStep() {
  return depthStepSize;
}

function makeTexture(filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

let lightTex = null;
let ambientTex = null;
let fogTex = null;
let lightTex2 = null; // the storeys' sets, stacked (docs/53 section 6.4), units 5 to 7
let ambientTex2 = null;
let fogTex2 = null;
let hasUpper = 0; // the second set holds a storey this frame
export function setUpperSet(on) {
  hasUpper = on ? 1 : 0;
}
// The flags every quad that follows carries besides its own (FLAG_UPPER while a storey lit by the second set emits).
let extraFlags = 0;
export function setExtraFlags(f) {
  extraFlags = f || 0;
}
export function getExtraFlags() {
  return extraFlags;
}

// Linear sampling of the light texture gives the parent's soft pools; nearest
// gives the per-cell look (Michael's backburner): one call.
export function setLightSampling(linear) {
  const f = linear ? gl.LINEAR : gl.NEAREST;
  for (const [unit, tex] of [[gl.TEXTURE1, lightTex], [gl.TEXTURE5, lightTex2]]) {
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  }
}

// The three small textures: light (R8, cells), ambient and fog (R8, tiles).
// The three area textures upload apart, each only when it changed (docs/23a, B6).
// `set` 1 is the second set, a storey's (docs/49 section 6).
// A storey's set (1 to STOREY_SETS) goes into its band of the stacked texture, which is made at its full height the first time a set of that
// size arrives (a new size, a restored context).
const stackSize = new Map(); // texture -> "w x h" it was made at
function uploadStacked(tex, unit, data, w, h, set) {
  gl.activeTexture(unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const k = `${w}x${h}`;
  if (stackSize.get(tex) !== k) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h * STOREY_SETS, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    stackSize.set(tex, k);
  }
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, h * (set - 1), w, h, gl.RED, gl.UNSIGNED_BYTE, data);
}
export function uploadLight(light, lw, lh, set = 0) {
  if (set) return uploadStacked(lightTex2, gl.TEXTURE5, light, lw, lh, set);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lightTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, lw, lh, 0, gl.RED, gl.UNSIGNED_BYTE, light);
}

export function uploadAmbient(ambient, aw, ah, set = 0) {
  if (set) return uploadStacked(ambientTex2, gl.TEXTURE6, ambient, aw, ah, set);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, ambientTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, aw, ah, 0, gl.RED, gl.UNSIGNED_BYTE, ambient);
}

export function uploadFog(fog, aw, ah, set = 0) {
  if (set) return uploadStacked(fogTex2, gl.TEXTURE7, fog, aw, ah, set);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, fogTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, aw, ah, 0, gl.RED, gl.UNSIGNED_BYTE, fog);
}

export function uploadArea(light, lw, lh, ambient, fog, aw, ah) {
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lightTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, lw, lh, 0, gl.RED, gl.UNSIGNED_BYTE, light);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, ambientTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, aw, ah, 0, gl.RED, gl.UNSIGNED_BYTE, ambient);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, fogTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, aw, ah, 0, gl.RED, gl.UNSIGNED_BYTE, fog);
}

// ---- the ground (docs/15) ----
// One texture per chunk, baked on the CPU. Ground quads are the first thing in
// the batch; end() draws each with its own texture, then the rest with the atlas.

const groundTex = new Map(); // chunk key -> { tex, w, h }
const groundRanges = []; // { rec, first }: six vertices each, from the start of the buffer
let groundFloats = 0; // floats written by ground quads this frame

export function uploadGround(key, image) {
  let rec = groundTex.get(key);
  gl.activeTexture(gl.TEXTURE4); // the ground's own unit: unit 0 holds the atlas array
  if (!rec) {
    rec = { tex: makeTexture(gl.NEAREST), w: image.width, h: image.height };
    groundTex.set(key, rec);
  }
  gl.bindTexture(gl.TEXTURE_2D, rec.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  rec.w = image.width;
  rec.h = image.height;
  return rec;
}

export function deleteGround(key) {
  const rec = groundTex.get(key);
  if (!rec) return;
  gl.deleteTexture(rec.tex);
  groundTex.delete(key);
}

export function groundTextures() {
  return groundTex.size;
}

// A chunk's ground picture at screen (x, y), its whole texture, with the grid
// point under each corner (TL, TR, BR, BL) for the light, the night, and the fog.
// The ground is the first of the flat pass: it writes no depth (docs/51 section 4).
export function groundQuad(rec, x, y, world) {
  useBucket(PASS_FLAT);
  if (pass !== PASS_FLAT || count !== groundFloats) throw new Error("ground quads must come before everything else in the frame");
  groundRanges.push({ rec, first: count / STRIDE });
  quad(x, y, rec.w, rec.h, [0, 0, rec.w, rec.h], { world });
  groundFloats = count;
}

// ---- the batch ----

// A frame begins in the flat pass with no surface; `cameraDepth` is the camera's own depth ((cam.gx + cam.gy) * 32), which every vertex's
// depth is stored relative to (docs/51 section 5).
export function begin(cameraDepth = 0) {
  for (const b of buckets) b.count = 0;
  cur = 0;
  verts = buckets[0].verts;
  count = 0;
  groundFloats = 0;
  groundRanges.length = 0;
  frameNo++;
  roomStep16 = 0;
  // The centre moves in whole steps of 256 units, never with the camera's fraction of a tile: every depth on a wall, a post, or a
  // prop's slice is then a multiple of 1/32 of a unit less a multiple of 256, which a float holds exactly, so two quads on one plane
  // come out the same wherever the camera stands, and walking flips nothing (Michael's playtest, 2026-10-27: the walls flickered as he
  // walked). The range keeps 4096 - 128 either side of the camera, past what a 4K window shows (docs/51 section 5).
  center = Math.round(cameraDepth / DEPTH_CENTRE_STEP) * DEPTH_CENTRE_STEP;
  pass = PASS_FLAT;
  surface({ A: 0, C: cameraDepth }, 0);
}

// The frame being drawn, by number: a cache of what the frame reads of the world keys on it.
export function frameId() {
  return frameNo;
}

// Which pass the quads that follow are for: PASS_FLAT (lying on the ground: no depth), PASS_STAND (standing: opaque or translucent by
// the quad), PASS_TOP (over everything, no test). A standing drawable's emit runs in PASS_STAND (scene.js sets it).
export function setPass(p) {
  pass = p;
}

export function getPass() {
  return pass;
}

// Run `fn` with its quads in pass `p` (a lying arrow inside a pile of items: flat, in the pile's place in the order), then back.
export function withPass(p, fn) {
  const was = pass;
  pass = p;
  try {
    fn();
  } finally {
    pass = was;
  }
}

// The depth surface of the drawable about to emit (render/depth.js makes them): `{ A, C }` a plane, depth = A * sx - sy + C at screen
// point (sx, sy); `{ C, xF }` a ridge, depth = C - sy - 1.5 |sx - xF|, its quads cut at the column xF; either may carry floor planes
// (`floorL`, `floorR`: render/depth.js againstWalls). `bias` is its kind's (scene.js DEPTH_BIAS). The emit order starts again: its first
// quad at the bias, each after a step nearer. `room` (scene.js DEPTH_ROOM) is how far above its bias its quads may climb: the gap to the
// next kind that can share its plane (a prop held on a wall's face sits 1 over it), so the order's steps stop short of it, whatever the
// buffer's depth (at 16 bits a step is a quarter of a unit: a wall's fifth quad would reach a prop's bias). The drawables lay out their
// layers to fit (`layer`, `holdOrder`); a quad past the room takes the room's last step, after the one before it.
export function surface(s, bias = 0, room = Infinity) {
  setPlane(s);
  sBias = bias;
  order = 0;
  maxOrder = Number.isFinite(room) ? Math.max(0, Math.ceil(room / depthStepSize - 1e-9) - 1) : Infinity;
  roomOf = room;
  layerAt = -1;
  layerTop = -1;
  behind = false;
  held = 0;
  heldUsed = false;
}

// Another plane for the quads that follow, the drawable's bias and emit order kept (a door's leaf, square to its wall, between the
// wall's own quads).
export function setPlane(s) {
  sFloorN = 0;
  for (const f of [s.floorL, s.floorR]) {
    if (!f) continue;
    sFloorA[sFloorN] = f.A;
    sFloorC[sFloorN] = f.C;
    sFloorN++;
  }
  if (s.xF === undefined || Number.isNaN(s.xF)) {
    sA = s.A;
    sX = NaN;
  } else {
    sA = 0;
    sX = s.xF;
  }
  sB = s.B === undefined ? -1 : s.B; // a vertical plane's depth falls a unit a pixel up the screen; a lifted floor's rises two a pixel down (render/depth.js floorPlane)
  sC = s.C;
}

// A storey's lift (docs/49 section 6): every standing vertex that follows sits `px` deeper, a storey's height above the ground (STOREY a
// layer, and a body's rise up a stair), while render/storeys.js has the screen origin lifted as much, so a lifted thing sorts per pixel
// against everything by its true X + Y + Z. 0 on the ground; the scene puts it back after each storey.
let liftD = 0;
export function setLift(px) {
  liftD = px || 0;
}
export function getLift() {
  return liftD;
}

// An outline's copies (Object Highlight, the swing outline, an item's halo): on the surface, a step behind the quad they outline (the
// next counted one), and not counted, so it is in front where they overlap and they show round it.
export function setBehind(on) {
  behind = !!on;
}

// The quads that follow take step `n` of the surface's order and do not count, until `layer(null)`, after which the count goes on from
// the step after the highest layer used (a wall lays out its face, its cap and what hangs on it, what sits over that, and a flame, in
// four steps, whatever it carries: render/walls.js). Quads in one layer must not overlap one another, as held ones.
export function layer(n) {
  if (n == null) {
    if (layerTop >= 0) order = Math.max(order, layerTop + 1);
    layerAt = -1;
    layerTop = -1;
    return;
  }
  layerAt = n;
  layerTop = Math.max(layerTop, n);
}

// While held, the quads that follow share one step of the emit order (a bee's pixels, which never overlap one another); released, the
// order steps once for them all.
export function holdOrder(on) {
  if (on) {
    held++;
    return;
  }
  if (held > 0 && --held === 0 && heldUsed) {
    order++;
    heldUsed = false;
  }
}

// The last frame's vertices of pass `p` (a copy, STRIDE floats each: pos, uv, page, world, height, colour, flags, depth less the camera's), and
// the stride: check("depth") reads the range from them.
export function passData(p) {
  const n = p === cur ? count : buckets[p].count;
  return { stride: STRIDE, data: (p === cur ? verts : buckets[p].verts).slice(0, n) };
}

// The vertices written to pass `p` so far this frame (scene.js counts the drawables that drew in the translucent pass).
export function passVertices(p) {
  return (p === cur ? count : buckets[p].count) / STRIDE;
}

function useBucket(b) {
  if (b === cur) return;
  keepBucket();
  cur = b;
  verts = buckets[b].verts;
  count = buckets[b].count;
}

// The store being written keeps what has been written to it (its array, which grow() may have replaced, and its count).
function keepBucket() {
  buckets[cur].verts = verts;
  buckets[cur].count = count;
}

// The pass a quad goes to: the flat and top passes as asked; a standing quad to the translucent pass when it is forced there, its
// colour is not opaque (a faded near wall and its cuts, a post faded with them, the dead dimmed by the dark, smoke and dust, a ghost's
// wash), it fades in the holes (an occluder), or its sheet is soft (docs/51 section 4: per quad, so a wall's bracket torch and a
// figure's carried torch send their halos there and the rest of the wall or the figure stays opaque); else the opaque pass.
function route(alpha, flags, soft) {
  if (pass === PASS_FLAT || pass === PASS_TOP || pass === PASS_XRAY) return pass;
  if (alpha < 1 || flags & FLAG_OCCLUDER || soft) return PASS_TRANS;
  return fadeA ? PASS_FADE : PASS_STAND;
}

// A faded storey's quads follow (render/scene.js, docs/49 section 6): `alpha` the fade's (the near-wall fade's), 0 or null to stop.
export function setFade(alpha) {
  fadeA = alpha || 0;
  if (fadeA) fadeDraw = fadeA;
}

// The probe's mark (scene.js `probe.mark`, check("depth")): while set, every quad that follows is drawn in this one colour, flat (its
// sprite's shape and alpha kept), unlit, and unfogged, in the pass and at the depth it would have had; null in play.
export function setMark(rgb) {
  mark = rgb;
}

// The step the next quad takes: its layer, or the count so far; an outline's a step behind that; never past the room.
let roomOf = Infinity; // the room the surface was given, in units (for the 16-bit count)
function slotNow() {
  const s = (layerAt >= 0 ? layerAt : order) - (behind ? 1 : 0);
  if (s > 0 && s * STEP_16 >= roomOf - 1e-9) roomStep16++;
  return s > maxOrder ? maxOrder : s;
}

function biasNow() {
  return sBias + slotNow() * depthStepSize;
}

function stepOrder() {
  if (behind || layerAt >= 0) return;
  if (held) heldUsed = true;
  else order++;
}

function grow(need) {
  if (count + need <= verts.length) return;
  let n = verts.length * 2;
  while (n < count + need) n *= 2;
  const v = new Float32Array(n);
  v.set(verts.subarray(0, count));
  verts = v;
}

function vertex(x, y, u, v, page, wx, wy, h, c, flags, d) {
  const i = count;
  verts[i] = x;
  verts[i + 1] = y;
  verts[i + 2] = u;
  verts[i + 3] = v;
  verts[i + 4] = page;
  verts[i + 5] = wx;
  verts[i + 6] = wy;
  verts[i + 7] = h;
  verts[i + 8] = c[0];
  verts[i + 9] = c[1];
  verts[i + 10] = c[2];
  verts[i + 11] = c[3];
  verts[i + 12] = flags;
  verts[i + 13] = d;
  count += STRIDE;
}

// A convex polygon of `n` vertices [x, y, u, v, wx, wy, h] (P[0] to P[n - 1]), fanned from its first, its depth from the plane (A, C)
// and the bias, stored less the camera's; `C` null for a pass that has no depth (flat, top: a constant inside the range, so nothing is
// clipped). Each corner's depth is worked out once (`fanDepth`), and the triangles written from the corners, with no array made per
// vertex: the frame emits thousands of these.
const fanDepth = new Float64Array(16);
function fan(P, n, pg, c, flags, A, C, bias, B = -1) {
  if (n < 3) return;
  grow(STRIDE * 3 * (n - 2));
  const k = C === null ? 0 : C + bias - center + liftD;
  const D = n <= fanDepth.length ? fanDepth : new Float64Array(n);
  for (let j = 0; j < n; j++) D[j] = C === null ? 0 : A * P[j][0] + B * P[j][1] + k;
  const p0 = P[0];
  for (let i = 1; i < n - 1; i++) {
    const p1 = P[i];
    const p2 = P[i + 1];
    vertex(p0[0], p0[1], p0[2], p0[3], pg, p0[4], p0[5], p0[6], c, flags, D[0]);
    vertex(p1[0], p1[1], p1[2], p1[3], pg, p1[4], p1[5], p1[6], c, flags, D[i]);
    vertex(p2[0], p2[1], p2[2], p2[3], pg, p2[4], p2[5], p2[6], c, flags, D[i + 1]);
  }
}

// Scratch polygons, kept between calls and grown when a polygon needs more corners: every quad that crosses a ridge's column is cut
// (every wall face, most props), and the cut writes into these instead of making arrays (the review of #530: a frame made thousands).
// A corner: a plain array of seven numbers, as quad's own corners are, so the fan reads one kind of array (a typed array here made it
// slower than the arrays it saves).
const corner7 = () => [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
function scratch(n = 16) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(corner7());
  return a;
}
function room(P, n) {
  while (P.length < n) P.push(corner7());
  return P;
}
const PIN = scratch(); // texQuad's and poly's corners
const CUT_A = scratch(); // a cut's two sides, and an envelope's piece
const CUT_B = scratch();

// The part of polygon P (n corners) on one side of the vertical line x = X (`left`: x <= X; else x >= X) into `out`, a corner on the
// line in both, each new corner's attributes carried along the edge it was cut from; returns its corner count.
function clipSide(P, n, X, left, out) {
  room(out, n + 1);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const a = P[i];
    const b = P[i + 1 === n ? 0 : i + 1];
    if (left ? a[0] <= X : a[0] >= X) {
      const o = out[m++];
      for (let j = 0; j < 7; j++) o[j] = a[j];
    }
    if ((a[0] < X && b[0] > X) || (a[0] > X && b[0] < X)) {
      const t = (X - a[0]) / (b[0] - a[0]);
      const o = out[m++];
      o[0] = X;
      for (let j = 1; j < 7; j++) o[j] = a[j] + (b[j] - a[j]) * t;
    }
  }
  return m;
}

// One primitive onto its pass with its depth: a plane's whole, or a ridge's two sides, cut at its column where it crosses it (docs/51
// section 3: a prop's left half on its footprint's south-west face, its right on the south-east).
function emitPoly(P, n, pg, c, flags, soft) {
  flags |= extraFlags;
  const b = route(c[3], flags, soft);
  if (fadeA && b === PASS_TRANS) c = [c[0], c[1], c[2], c[3] * fadeA]; // a faded storey's own translucent quad, fainter with it
  if (mark) {
    c = [mark[0], mark[1], mark[2], c[3]];
    flags |= FLAG_UNLIT | FLAG_NOFOG | FLAG_SOLID;
  }
  useBucket(b);
  if (b === PASS_FLAT || b === PASS_TOP) {
    fan(P, n, pg, c, flags, 0, null, 0);
    return;
  }
  const bias = biasNow();
  let lo = Infinity;
  let hi = -Infinity;
  if (sFloorN || !Number.isNaN(sX)) {
    for (let j = 0; j < n; j++) {
      const x = P[j][0];
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
  }
  if (sFloorN) emitEnvelope(P, n, pg, c, flags, bias, lo, hi);
  else if (Number.isNaN(sX)) fan(P, n, pg, c, flags, sA, sC, bias, sB);
  else {
    const cl = sC - 1.5 * sX; // the left face: depth = 1.5 sx - sy + cl
    const cr = sC + 1.5 * sX; // the right: -1.5 sx - sy + cr
    if (hi <= sX) fan(P, n, pg, c, flags, 1.5, cl, bias);
    else if (lo >= sX) fan(P, n, pg, c, flags, -1.5, cr, bias);
    else {
      fan(CUT_A, clipSide(P, n, sX, true, CUT_A), pg, c, flags, 1.5, cl, bias);
      fan(CUT_B, clipSide(P, n, sX, false, CUT_B), pg, c, flags, -1.5, cr, bias);
    }
  }
  stepOrder();
}

// A surface with floor planes (render/depth.js againstWalls): the depth at each column the most of the surface's own there (a plane's,
// or a ridge's side) and the floors', a piecewise plane, so the polygon is cut at every column where the topmost line changes and each
// piece fanned on its own line. The lines and the cuts are kept in fixed arrays: at most a ridge's two sides and two floors.
const lineA = new Float64Array(4);
const lineC = new Float64Array(4);
const cutX = new Float64Array(8);
let topA = 0;
let topC = 0;
function topAt(x, nBase) {
  // The surface's own line at x (a ridge's side by the column), then the floors over it.
  let k = nBase === 2 && x > sX ? 1 : 0;
  let best = lineA[k] * x + lineC[k];
  for (let i = nBase; i < nBase + sFloorN; i++) {
    const d = lineA[i] * x + lineC[i];
    if (d > best) {
      best = d;
      k = i;
    }
  }
  topA = lineA[k];
  topC = lineC[k];
}
let nCut = 0;
function addCut(x, lo, hi) {
  if (!(x > lo && x < hi)) return;
  let i = nCut++;
  while (i > 0 && cutX[i - 1] > x) {
    cutX[i] = cutX[i - 1];
    i--;
  }
  cutX[i] = x;
}
function emitEnvelope(P, n, pg, c, flags, bias, lo, hi) {
  let nBase = 1;
  if (Number.isNaN(sX)) {
    lineA[0] = sA;
    lineC[0] = sC;
  } else {
    lineA[0] = 1.5;
    lineC[0] = sC - 1.5 * sX;
    lineA[1] = -1.5;
    lineC[1] = sC + 1.5 * sX;
    nBase = 2;
  }
  const nl = nBase + sFloorN;
  for (let i = 0; i < sFloorN; i++) {
    lineA[nBase + i] = sFloorA[i];
    lineC[nBase + i] = sFloorC[i];
  }
  // The columns where the topmost line can change, inside the polygon, in order.
  nCut = 0;
  if (nBase === 2) addCut(sX, lo, hi);
  for (let i = 0; i < nl; i++) {
    for (let j = i + 1; j < nl; j++) {
      const dA = lineA[i] - lineA[j];
      if (Math.abs(dA) > 1e-9) addCut((lineC[j] - lineC[i]) / dA, lo, hi);
    }
  }
  let a = lo;
  for (let i = 0; i <= nCut; i++) {
    const b = i < nCut ? cutX[i] : hi;
    if (b - a >= 1e-6) {
      let piece = P;
      let m = n;
      if (a > lo) {
        m = clipSide(piece, m, a, false, CUT_A);
        piece = CUT_A;
      }
      if (b < hi) {
        m = clipSide(piece, m, b, true, CUT_B);
        piece = CUT_B;
      }
      topAt((a + b) / 2, nBase);
      fan(piece, m, pg, c, flags, topA, topC, bias);
    }
    a = b;
  }
}

// The depth a standing quad's point would take on the current surface, the bias included, in the world's units (not less the camera's):
// for check("depth").
export function depthAt(sx, sy) {
  const bias = sBias + Math.min(layerAt >= 0 ? layerAt : order, maxOrder) * depthStepSize;
  let d = Number.isNaN(sX) ? sA * sx + sC : sC - 1.5 * Math.abs(sx - sX);
  for (let i = 0; i < sFloorN; i++) d = Math.max(d, sFloorA[i] * sx + sFloorC[i]);
  return d - sy + bias;
}

const WHITE = [1, 1, 1, 1];

// A textured quad at (x, y, w, h) on screen from atlas rect uv. `world` is
// one [gx, gy] for every corner or four, in the order TL, TR, BR, BL;
// `heights` likewise one number or four.
// `skew` leans the quad: its top edge moves that many pixels sideways while the
// bottom stays put (a clicked thing's sway; docs/02, question 27).
// `uv`'s sixth is 1 for a soft sheet's frame (frameUV): such a quad goes to the translucent pass.
// The corners of the quad being emitted, kept between calls (emitPoly is done with them before quad is called again).
const QUAD = [corner7(), corner7(), corner7(), corner7()];
function corner(q, x, y, u, v, w, h) {
  q[0] = x;
  q[1] = y;
  q[2] = u;
  q[3] = v;
  q[4] = w[0];
  q[5] = w[1];
  q[6] = h;
}
export function quad(x, y, w, h, uv, { world, heights = 0, color = WHITE, flags = 0, flip = false, skew = 0 } = {}) {
  const u0 = flip ? uv[2] : uv[0];
  const u1 = flip ? uv[0] : uv[2];
  const v0 = uv[1];
  const v1 = uv[3];
  const pg = uv[4] || 0; // the atlas page the rect is on
  const one = typeof world[0] === "number";
  const flat = typeof heights === "number";
  const x1 = x + w;
  const y1 = y + h;
  corner(QUAD[0], x + skew, y, u0, v0, one ? world : world[0], flat ? heights : heights[0]);
  corner(QUAD[1], x1 + skew, y, u1, v0, one ? world : world[1], flat ? heights : heights[1]);
  corner(QUAD[2], x1, y1, u1, v1, one ? world : world[2], flat ? heights : heights[2]);
  corner(QUAD[3], x, y1, u0, v1, one ? world : world[3], flat ? heights : heights[3]);
  emitPoly(QUAD, 4, pg, color, flags, uv[5] === 1);
}

// A textured convex quad with any four screen corners and their own atlas
// texel coordinates, in order around it (docs/17: a drawn wall's cap redrawn
// on the sky). `world` is one [gx, gy] or four; `heights` likewise.
export function texQuad(pts, uvs, { world, heights = 0, color = WHITE, flags = 0, page = 0, soft = false } = {}) {
  const one = typeof world[0] === "number";
  const flat = typeof heights === "number";
  const n = pts.length;
  room(PIN, n);
  for (let k = 0; k < n; k++) {
    const q = PIN[k];
    const w = one ? world : world[k];
    q[0] = pts[k][0];
    q[1] = pts[k][1];
    q[2] = uvs[k][0];
    q[3] = uvs[k][1];
    q[4] = w[0];
    q[5] = w[1];
    q[6] = flat ? heights : heights[k];
  }
  // `page`: the atlas page the texel coordinates are on (frameUV's fifth)
  emitPoly(PIN, n, page, color, flags, soft);
}

// A flat-coloured convex polygon, fanned from its first point. `world` is one
// [gx, gy] for all points or one per point; `heights` likewise.
export function poly(points, color, { world, heights = 0, flags = 0 } = {}) {
  if (points.length < 3) return;
  const u = (whiteUV[0] + whiteUV[2]) / 2;
  const v = (whiteUV[1] + whiteUV[3]) / 2;
  const one = typeof world[0] === "number";
  const flat = typeof heights === "number";
  const n = points.length;
  room(PIN, n);
  for (let k = 0; k < n; k++) {
    const q = PIN[k];
    const w = one ? world : world[k];
    q[0] = points[k][0];
    q[1] = points[k][1];
    q[2] = u;
    q[3] = v;
    q[4] = w[0];
    q[5] = w[1];
    q[6] = flat ? heights : heights[k];
  }
  emitPoly(PIN, n, 0, color, flags, false);
}

// The canvas to black, with nothing drawn: with no world in, a canvas left alone keeps the last frame of the
// world just left behind the menus (#16).
export function blank() {
  if (!gl || lost) return;
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.depthMask(true); // the clear honours the mask, which the translucent pass leaves off
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

// The atlas on the GPU: an array with a layer for every page, made again (every page re-uploaded from its canvas) when a page has opened since, and a dirty page uploaded alone. If the GPU
// is out of memory for the layers (the only error that caps the pages), the array is made with one fewer, the page that did not fit is dropped from drawing (its sheets draw as the empty patch), and no more are opened.
function uploadAtlas() {
  gl.activeTexture(gl.TEXTURE0);
  const want = Math.min(pages.length, pageCap);
  if (!atlasTex || gpuLayers !== want) {
    if (atlasTex) gl.deleteTexture(atlasTex);
    for (let n = want; n >= 1; n--) {
      atlasTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlasTex);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      while (gl.getError() !== gl.NO_ERROR); // getError gives the oldest queued error: drain it, or one from elsewhere reads as this call's
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, ATLAS, ATLAS, n);
      const err = gl.getError();
      if (err === gl.NO_ERROR) {
        gpuLayers = n;
        break;
      }
      gl.deleteTexture(atlasTex);
      atlasTex = null;
      if (err !== gl.OUT_OF_MEMORY) {
        console.warn(`an atlas array of ${n} pages failed with GL error ${err}; trying again next frame`); // not a refusal of the pages: nothing is capped
        return;
      }
      pageCap = n - 1;
      console.warn(`the GPU is out of memory for an atlas array of ${n} pages; drawing with ${n - 1}`);
    }
    for (const pg of pages) pg.dirty = true;
  }
  if (!atlasTex) return;
  pages.forEach((pg, i) => {
    if (!pg.dirty || i >= gpuLayers) return;
    // Each page goes up as a 2D texture first, the one path the atlas always took (texImage2D from the canvas), and is copied into its layer on the GPU: uploading the canvas straight
    // into a layer converts the canvas's premultiplied colours another way and moved a few hundred pixels of a frame by one level (check("frame") reads the bytes). The staging texture is
    // made once, at the first dirty upload, and kept, attached to its framebuffer: 64 MB of GPU held on purpose, because a dirty frame (a figure redrawn when its owner dresses) would
    // otherwise allocate and free it, 1 to 2 ms each time, and deleting a texture still attached to a framebuffer does not free it anyway.
    if (!stageTex) {
      stageTex = makeTexture(gl.NEAREST);
      stageFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, stageFbo);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, stageTex, 0);
    } else {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, stageFbo);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stageTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pg.canvas);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlasTex);
    gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, 0, 0, ATLAS, ATLAS);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    pg.dirty = false;
  });
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlasTex);
}

// Draw everything pushed since begin() with these uniforms.
export function end(u) {
  keepBucket(); // the store being written keeps its count, whichever it is: a frame whose last quad lies flat (nothing standing in it) included
  for (let b = 0; b < buckets.length; b++) lastPassCounts[b] = buckets[b].count / STRIDE;
  lastRoomStep16 = roomStep16;
  if (lost) return; // nothing to draw to; the batch is dropped
  uploadAtlas();
  // The viewport is the whole buffer while u_res is the world's size in its
  // own pixels: the difference is the zoom, applied by the GPU (view.js).
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(u.clear[0], u.clear[1], u.clear[2], 1);
  gl.depthMask(true); // the clear honours the mask, which the translucent pass leaves off
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniform2f(uniforms.u_res, u.w, u.h);
  gl.uniform2f(uniforms.u_areaOrigin, u.areaOrigin[0], u.areaOrigin[1]);
  gl.uniform2f(uniforms.u_areaTiles, u.areaTiles[0], u.areaTiles[1]);
  gl.uniform1f(uniforms.u_nightFloor, u.nightFloor);
  gl.uniform1f(uniforms.u_nightAlpha, u.nightAlpha);
  gl.uniform3f(uniforms.u_tint, u.tint[0], u.tint[1], u.tint[2]);
  gl.uniform1f(uniforms.u_outdoor, u.outdoor);
  gl.uniform2f(uniforms.u_player, u.player[0], u.player[1]);
  gl.uniform1f(uniforms.u_pool, u.pool);
  gl.uniform1f(uniforms.u_poolStrength, u.poolStrength);
  gl.uniform1f(uniforms.u_climb, u.climb);
  gl.uniform3f(uniforms.u_fogColor, u.fogColor[0], u.fogColor[1], u.fogColor[2]);
  gl.uniform1f(uniforms.u_fogAlpha, u.fogAlpha);
  const holes = new Float32Array(16);
  for (let i = 0; i < Math.min(8, u.holes.length); i++) {
    holes[i * 2] = u.holes[i][0];
    holes[i * 2 + 1] = u.holes[i][1];
  }
  gl.uniform2fv(uniforms.u_holes, holes);
  gl.uniform1i(uniforms.u_holeCount, Math.min(8, u.holes.length));
  gl.uniform1f(uniforms.u_holeInner, u.holeInner);
  gl.uniform1f(uniforms.u_holeOuter, u.holeOuter);
  gl.uniform1f(uniforms.u_minStanding, u.minStanding);
  gl.uniform1f(uniforms.u_softLight, u.softLight || 0);
  gl.uniform1i(uniforms.u_debug, u.debug);
  gl.uniform1f(uniforms.u_fade, 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlasTex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lightTex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, ambientTex);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, fogTex);
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, lightTex2);
  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D, ambientTex2);
  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_2D, fogTex2);
  gl.uniform1i(uniforms.u_hasUpper, hasUpper);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  // The passes' stores end to end in one upload.
  let total = 0;
  for (const b of buckets) total += b.count;
  if (upload.length < total) {
    let n = upload.length;
    while (n < total) n *= 2;
    upload = new Float32Array(n);
  }
  const first = [];
  let off = 0;
  for (const b of buckets) {
    upload.set(b.verts.subarray(0, b.count), off);
    first.push(off / STRIDE);
    off += b.count;
  }
  gl.bufferData(gl.ARRAY_BUFFER, upload.subarray(0, total), gl.DYNAMIC_DRAW);
  const span = (b) => buckets[b].count / STRIDE;
  // Pass 0, the flat: the ground, then what lies on it, in order; no depth tested or written (docs/51 section 4).
  gl.depthFunc(gl.ALWAYS);
  gl.depthMask(false);
  gl.uniform1f(uniforms.u_alphaCut, ALPHA_FLOOR);
  gl.uniform1i(uniforms.u_isGround, 1);
  gl.activeTexture(gl.TEXTURE4);
  for (const r of groundRanges) {
    gl.bindTexture(gl.TEXTURE_2D, r.rec.tex);
    gl.uniform2f(uniforms.u_texSize, r.rec.w, r.rec.h);
    gl.drawArrays(gl.TRIANGLES, r.first, 6);
  }
  gl.uniform1i(uniforms.u_isGround, 0);
  gl.uniform2f(uniforms.u_texSize, ATLAS, ATLAS);
  const g = groundFloats / STRIDE;
  if (span(PASS_FLAT) > g) gl.drawArrays(gl.TRIANGLES, first[PASS_FLAT] + g, span(PASS_FLAT) - g);
  // Pass 1, the opaque: tested and written, alpha under a half discarded.
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.uniform1f(uniforms.u_alphaCut, ALPHA_TEST);
  if (span(PASS_STAND)) gl.drawArrays(gl.TRIANGLES, first[PASS_STAND], span(PASS_STAND));
  // Pass 2, the translucent: tested, not written, in the sorted order.
  gl.depthMask(false);
  gl.uniform1f(uniforms.u_alphaCut, ALPHA_FLOOR);
  if (span(PASS_TRANS)) gl.drawArrays(gl.TRIANGLES, first[PASS_TRANS], span(PASS_TRANS));
  // A faded storey (PASS_FADE): its nearest surface's depth, then its colour there at the fade's alpha.
  if (span(PASS_FADE)) {
    gl.uniform1f(uniforms.u_alphaCut, ALPHA_TEST);
    gl.colorMask(false, false, false, false);
    gl.depthMask(true);
    gl.drawArrays(gl.TRIANGLES, first[PASS_FADE], span(PASS_FADE));
    gl.colorMask(true, true, true, true);
    gl.depthMask(false);
    gl.uniform1f(uniforms.u_fade, fadeDraw);
    gl.drawArrays(gl.TRIANGLES, first[PASS_FADE], span(PASS_FADE));
    gl.uniform1f(uniforms.u_fade, 1);
  }
  // Seen but covered (PASS_XRAY): drawn only where the stored surface is nearer than its own, nothing written.
  if (span(PASS_XRAY)) {
    gl.depthFunc(gl.GREATER);
    gl.depthMask(false);
    gl.uniform1f(uniforms.u_alphaCut, ALPHA_TEST);
    gl.drawArrays(gl.TRIANGLES, first[PASS_XRAY], span(PASS_XRAY));
    gl.uniform1f(uniforms.u_alphaCut, ALPHA_FLOOR);
  }
  // On top: the ghosts, the hit shapes, the marker; no test.
  gl.depthFunc(gl.ALWAYS);
  if (span(PASS_TOP)) gl.drawArrays(gl.TRIANGLES, first[PASS_TOP], span(PASS_TOP));
  gl.depthFunc(gl.LEQUAL);
  return total / STRIDE;
}

// Colours: "#rrggbb" or "rgb(r,g,b)" (what shade() returns) to [r, g, b, a],
// cached.
const rgbCache = new Map();
export function rgb(color, alpha = 1) {
  const key = color + alpha;
  let c = rgbCache.get(key);
  if (c) return c;
  if (color[0] === "#") {
    const n = parseInt(color.slice(1), 16);
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
  } else {
    const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    c = m ? [m[1] / 255, m[2] / 255, m[3] / 255, alpha] : [1, 0, 1, alpha];
  }
  rgbCache.set(key, c);
  return c;
}
