// The WebGL2 core (docs/08-renderer.md). One texture atlas of every sprite
// sheet, one interleaved vertex buffer rebuilt each frame in sort order, and
// one shader. Every vertex carries the world point its light is read from,
// so a floor pixel reads its own point, a standing thing its foot, and a wall
// face a point along its foot line; the fragment shader samples the light,
// ambient, and fog textures there. Raw WebGL, no library (Michael, 2026-10-09).
//
// Vertex: pos (2, screen px), uv (2, atlas), world (2, grid), height (1, px
// above the foot), color (4, multiplier), flags (1). Flag bits: 1 unlit (a
// flame), 2 occluder (fades in the holes), 4 sky (lit by outdoors only),
// 8 unfogged.

export const FLAG_UNLIT = 1;
export const FLAG_OCCLUDER = 2;
export const FLAG_SKY = 4;
export const FLAG_NOFOG = 8;
export const FLAG_STANDING = 16; // a prop or a character: takes the legibility floor
export const FLAG_SOLID = 32; // the quad's colour, flat, keeping the sprite's shape: an outline (docs/14)

const STRIDE = 12; // floats per vertex
let ATLAS = 2048; // raised to 4096 in init when the GPU allows: the figures' sheets are large (docs/12)

export let gl = null;
let program = null;
let vao = null;
let vbo = null;
let verts = new Float32Array(1 << 17);
let count = 0; // floats written
let whiteUV = null;
let emptyUV = null; // a transparent patch: what a sprite that did not fit in the atlas draws as
let atlasWarned = 0; // 0: no warning yet, 1: nearly full, 2: full
let currentWhite = [0, 0, 0, 0];

// ---- atlas ----
const atlasCanvas = document.createElement("canvas");
atlasCanvas.width = ATLAS;
atlasCanvas.height = ATLAS;
const atlasCtx = atlasCanvas.getContext("2d");
let atlasTex = null;
let atlasDirty = false;
let shelfX = 0;
let shelfY = 0;
let shelfH = 0;
const placed = new WeakMap(); // sheet -> { ax, ay }

function place(sheet) {
  let p = placed.get(sheet);
  if (p) return p;
  const img = sheet.image;
  const w = img.width;
  const h = img.height;
  if (shelfX + w + 1 > ATLAS) {
    shelfX = 0;
    shelfY += shelfH + 1;
    shelfH = 0;
  }
  if (shelfY + h > ATLAS) {
    // Full: that sprite is not drawn (one warning), but the frame is, instead of an error every frame.
    if (atlasWarned < 2) console.warn(`sprite atlas full: ${w}x${h} sheet not drawn (docs/19: the atlas is the budget)`);
    atlasWarned = 2;
    return null;
  }
  atlasCtx.drawImage(img, shelfX, shelfY);
  p = { ax: shelfX, ay: shelfY };
  placed.set(sheet, p);
  shelfX += w + 1;
  shelfH = Math.max(shelfH, h);
  atlasDirty = true;
  if (atlasWarned < 1 && (shelfY + shelfH) / ATLAS > 0.85) {
    atlasWarned = 1;
    console.warn("sprite atlas over 85% full (docs/19: the atlas is the budget)");
  }
  return p;
}

// Pack a sheet now rather than at its first draw: boot packs every sheet, so the
// one full upload happens behind the loading screen (docs/23, step 1).
export function placeSheet(sheet) {
  return place(sheet);
}

// How full the atlas is: its side, the rows used so far (px), and the fraction.
export function atlasInfo() {
  const used = shelfY + shelfH;
  return { size: ATLAS, usedRows: used, fraction: +(used / ATLAS).toFixed(3) };
}

// Redraw a sheet whose image changed (the player's clothes) at its place.
export function redrawSheet(sheet) {
  const p = placed.get(sheet);
  if (!p) return;
  atlasCtx.clearRect(p.ax, p.ay, sheet.image.width, sheet.image.height);
  atlasCtx.drawImage(sheet.image, p.ax, p.ay);
  atlasDirty = true;
}

// Atlas coordinates of a frame, in texels: [u0, v0, u1, v1].
export function frameUV(sheet, name) {
  const f = sheet.frames[name];
  if (!f) return null;
  const p = place(sheet);
  if (!p) return emptyUV;
  return [p.ax + f[0], p.ay + f[1], p.ax + f[0] + f[2], p.ay + f[1] + f[3]];
}

// ---- shaders ----
const VS = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
in vec2 a_world;
in float a_height;
in vec4 a_color;
in float a_flags;
uniform vec2 u_res;
uniform vec2 u_texSize; // the bound texture's size in texels: the atlas, or a chunk's ground (docs/15)
out vec2 v_uv;
out vec2 v_world;
out float v_height;
out vec4 v_color;
flat out float v_flags;
out vec2 v_screen;
void main() {
  v_uv = a_uv / u_texSize;
  v_world = a_world;
  v_height = a_height;
  v_color = a_color;
  v_flags = a_flags;
  v_screen = a_pos;
  vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec2 v_world;
in float v_height;
in vec4 v_color;
flat in float v_flags;
in vec2 v_screen;
out vec4 o;
uniform sampler2D u_tex;
uniform sampler2D u_light;
uniform sampler2D u_ambient;
uniform sampler2D u_fog;
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
  vec4 tex = texture(u_tex, v_uv) * v_color;
  if (tex.a < 0.004) discard;
  float f = v_flags;
  bool unlit = mod(f, 2.0) >= 1.0;
  bool occ = mod(floor(f / 2.0), 2.0) >= 1.0;
  bool sky = mod(floor(f / 4.0), 2.0) >= 1.0;
  bool nofog = mod(floor(f / 8.0), 2.0) >= 1.0;
  bool standing = mod(floor(f / 16.0), 2.0) >= 1.0;
  bool solid = mod(floor(f / 32.0), 2.0) >= 1.0;
  // Texel i of the tile textures covers [origin + i - 0.5, origin + i + 0.5);
  // the light texture spans the same area at more texels per tile.
  vec2 tileUV = (v_world - u_areaOrigin + 0.5) / u_areaTiles;
  vec3 rgb = solid ? v_color.rgb : tex.rgb;
  // Debug views (docs/08): the light, ambient, or fog texture as grey over the
  // world, read at the fragment's own sample point.
  if (u_debug == 1) { o = vec4(vec3(texture(u_light, tileUV).r), 1.0); return; }
  if (u_debug == 2) { o = vec4(vec3(texture(u_ambient, tileUV).r), 1.0); return; }
  if (u_debug == 3) { o = vec4(vec3(texture(u_fog, tileUV).r), 1.0); return; }
  if (!unlit) {
    float amb = sky ? u_outdoor : texture(u_ambient, tileUV).r;
    float st = sky ? 0.0 : texture(u_light, tileUV).r;
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
    float vis = texture(u_fog, tileUV).r;
    if (vis < 0.5) rgb = mix(rgb, u_fogColor, u_fogAlpha);
  }
  o = vec4(rgb * a, a);
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
  program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  for (const name of ["u_res", "u_texSize", "u_tex", "u_light", "u_ambient", "u_fog", "u_areaOrigin", "u_areaTiles", "u_nightFloor", "u_nightAlpha", "u_tint", "u_outdoor", "u_player", "u_pool", "u_poolStrength", "u_climb", "u_fogColor", "u_fogAlpha", "u_holes", "u_holeCount", "u_holeInner", "u_holeOuter", "u_minStanding", "u_softLight", "u_debug"]) {
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
  attr("a_world", 2, 4);
  attr("a_height", 1, 6);
  attr("a_color", 4, 7);
  attr("a_flags", 1, 11);
  // The atlas, with a white texel for flat polygons.
  ATLAS = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048);
  atlasCanvas.width = ATLAS;
  atlasCanvas.height = ATLAS;
  atlasCtx.fillStyle = "#fff";
  atlasCtx.fillRect(0, 0, 4, 4);
  shelfX = 10;
  shelfH = 4;
  whiteUV = [1, 1, 3, 3];
  emptyUV = [6, 1, 8, 3]; // x 5 to 9 of the first row is left transparent
  atlasTex = makeTexture(gl.NEAREST);
  atlasDirty = true;
  gl.uniform1i(uniforms.u_tex, 0);
  gl.uniform1i(uniforms.u_light, 1);
  gl.uniform1i(uniforms.u_ambient, 2);
  gl.uniform1i(uniforms.u_fog, 3);
  lightTex = makeTexture(gl.LINEAR);
  ambientTex = makeTexture(gl.NEAREST);
  fogTex = makeTexture(gl.NEAREST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
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

// Linear sampling of the light texture gives the parent's soft pools; nearest
// gives the per-cell look (Michael's backburner): one call.
export function setLightSampling(linear) {
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lightTex);
  const f = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
}

// The three small textures: light (R8, cells), ambient and fog (R8, tiles).
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
  gl.activeTexture(gl.TEXTURE0);
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
export function groundQuad(rec, x, y, world) {
  if (count !== groundFloats) throw new Error("ground quads must come before everything else in the frame");
  groundRanges.push({ rec, first: count / STRIDE });
  quad(x, y, rec.w, rec.h, [0, 0, rec.w, rec.h], { world });
  groundFloats = count;
}

// ---- the batch ----

export function begin() {
  count = 0;
  groundFloats = 0;
  groundRanges.length = 0;
}

function grow(need) {
  if (count + need <= verts.length) return;
  let n = verts.length * 2;
  while (n < count + need) n *= 2;
  const v = new Float32Array(n);
  v.set(verts);
  verts = v;
}

function vertex(x, y, u, v, wx, wy, h, c, flags) {
  const i = count;
  verts[i] = x;
  verts[i + 1] = y;
  verts[i + 2] = u;
  verts[i + 3] = v;
  verts[i + 4] = wx;
  verts[i + 5] = wy;
  verts[i + 6] = h;
  verts[i + 7] = c[0];
  verts[i + 8] = c[1];
  verts[i + 9] = c[2];
  verts[i + 10] = c[3];
  verts[i + 11] = flags;
  count += STRIDE;
}

const WHITE = [1, 1, 1, 1];

// A textured quad at (x, y, w, h) on screen from atlas rect uv. `world` is
// one [gx, gy] for every corner or four, in the order TL, TR, BR, BL;
// `heights` likewise one number or four.
// `skew` leans the quad: its top edge moves that many pixels sideways while the
// bottom stays put (a clicked thing's sway; docs/02, question 27).
export function quad(x, y, w, h, uv, { world, heights = 0, color = WHITE, flags = 0, flip = false, skew = 0 } = {}) {
  grow(STRIDE * 6);
  const u0 = flip ? uv[2] : uv[0];
  const u1 = flip ? uv[0] : uv[2];
  const v0 = uv[1];
  const v1 = uv[3];
  const W = typeof world[0] === "number" ? [world, world, world, world] : world;
  const H = typeof heights === "number" ? [heights, heights, heights, heights] : heights;
  const x1 = x + w;
  const y1 = y + h;
  vertex(x + skew, y, u0, v0, W[0][0], W[0][1], H[0], color, flags);
  vertex(x1 + skew, y, u1, v0, W[1][0], W[1][1], H[1], color, flags);
  vertex(x1, y1, u1, v1, W[2][0], W[2][1], H[2], color, flags);
  vertex(x + skew, y, u0, v0, W[0][0], W[0][1], H[0], color, flags);
  vertex(x1, y1, u1, v1, W[2][0], W[2][1], H[2], color, flags);
  vertex(x, y1, u0, v1, W[3][0], W[3][1], H[3], color, flags);
}

// A textured convex quad with any four screen corners and their own atlas
// texel coordinates, in order around it (docs/17: a drawn wall's cap redrawn
// on the sky). `world` is one [gx, gy] or four; `heights` likewise.
export function texQuad(pts, uvs, { world, heights = 0, color = WHITE, flags = 0 } = {}) {
  grow(STRIDE * 6);
  const W = typeof world[0] === "number" ? [world, world, world, world] : world;
  const H = typeof heights === "number" ? [heights, heights, heights, heights] : heights;
  for (const k of [0, 1, 2, 0, 2, 3]) vertex(pts[k][0], pts[k][1], uvs[k][0], uvs[k][1], W[k][0], W[k][1], H[k], color, flags);
}

// A flat-coloured convex polygon, fanned from its first point. `world` is one
// [gx, gy] for all points or one per point; `heights` likewise.
export function poly(points, color, { world, heights = 0, flags = 0 } = {}) {
  const n = points.length;
  if (n < 3) return;
  grow(STRIDE * 3 * (n - 2));
  const u = (whiteUV[0] + whiteUV[2]) / 2;
  const v = (whiteUV[1] + whiteUV[3]) / 2;
  const W = typeof world[0] === "number" ? null : world;
  const H = typeof heights === "number" ? null : heights;
  const wOf = (i) => (W ? W[i] : world);
  const hOf = (i) => (H ? H[i] : heights);
  for (let i = 1; i < n - 1; i++) {
    for (const k of [0, i, i + 1]) {
      const p = points[k];
      const w = wOf(k);
      vertex(p[0], p[1], u, v, w[0], w[1], hOf(k), color, flags);
    }
  }
}

// Draw everything pushed since begin() with these uniforms.
export function end(u) {
  if (atlasDirty) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    atlasDirty = false;
  }
  // The viewport is the whole buffer while u_res is the world's size in its
  // own pixels: the difference is the zoom, applied by the GPU (view.js).
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(u.clear[0], u.clear[1], u.clear[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
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
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lightTex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, ambientTex);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, fogTex);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, count), gl.DYNAMIC_DRAW);
  gl.activeTexture(gl.TEXTURE0);
  for (const r of groundRanges) {
    gl.bindTexture(gl.TEXTURE_2D, r.rec.tex);
    gl.uniform2f(uniforms.u_texSize, r.rec.w, r.rec.h);
    gl.drawArrays(gl.TRIANGLES, r.first, 6);
  }
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.uniform2f(uniforms.u_texSize, ATLAS, ATLAS);
  const first = groundFloats / STRIDE;
  if (count > groundFloats) gl.drawArrays(gl.TRIANGLES, first, count / STRIDE - first);
  return count / STRIDE;
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
