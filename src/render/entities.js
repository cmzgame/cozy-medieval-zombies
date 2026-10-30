// Characters and what flies (docs/12, 14, 20): the arrows and the landing marker, the swing's outline, the
// burning's particles, the figures with their held things and the shield's flash, and where they stand beside walls.
// Cut from src/render.js on 2026-10-12 (docs/23a, D5): a move, no rule changed; the frame check proves the pixels.

import { tunables as archeryTunables, spinFrame, SPLASH_SECONDS } from "../archery.js";
import * as iso from "../iso.js";
import { getSheet, getDef, idleFrame } from "../assets.js";
import { resolveFacing, frameName } from "../sprites.js";
import * as map from "../map.js";
import { tileKey } from "../visibility.js";
import { getItem } from "../items.js";
import * as gl from "../gl.js";
import { DEPTH_BIAS, DEPTH_ROOM, flameFrame, frameQuad, probe } from "./scene.js";
import * as depth from "./depth.js"; // a figure's billboard through its front, an arrow's through its ground point (docs/51)
import { seenAlpha } from "../sight.js";
import { sight as sightTuning, cover as coverTuning, objectHighlight as highlightTuning } from "../tuning.js";
import * as hl from "./highlight.js"; // Object Highlight (#301)
import { client } from "../client.js"; // the swing's targets, the client's own (#102)
import { tintOf as poisonTintOf } from "../poison.js"; // a poisoned body's green (docs/47 section 6)
import { structureCovers, hiderFor, flatHere } from "./storeys.js"; // what covers a body, for its seen-but-covered shape (docs/53 section 6.2)

export function projectileSheet(id) {
  try {
    return getSheet(id);
  } catch {
    return null;
  }
}

// The arrows in flight (docs/20): the arrow, drawn above its ground point by its
// height, and a shadow at the ground point that shrinks and fades as it rises.
// Both sort by the ground point, as the figures do, so a high arrow is drawn over
// what it flies above and behind what is in front of its ground point.
export function arrowDrawables(arrows, visible, out) {
  if (!arrows || !arrows.length) return;
  for (const a of arrows) {
    const sheet = projectileSheet(a.projectile || "arrow");
    if (!sheet) continue;
    if (!visible.has(tileKey(Math.round(a.gx), Math.round(a.gy)))) continue;
    const p = iso.toScreen(a.gx, a.gy);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const h = Math.min(1, a.z / 160);
    const rx = Math.max(2, Math.round(archeryTunables.shadowRx * (1 - 0.4 * h)));
    const ry = Math.max(1, Math.round(archeryTunables.shadowRy * (1 - 0.4 * h)));
    const alpha = archeryTunables.shadowAlpha * (1 - 0.6 * h);
    const world = [a.gx, a.gy];
    const key = (a.gx + a.gy) * 1000;
    const surf = depth.billboard(a.gx, a.gy); // the plane through its ground point: its picture z above it is z nearer (docs/51)
    out.push({
      key: key + 0.2,
      kind: "arrowShadow",
      emit() {
        // On the ground: the flat pass, in its place in the order (docs/51 section 4); on a storey, on its floor (docs/53 section 6.4).
        flatHere(() => gl.poly([[x - rx, y], [x - rx / 2, y - ry], [x + rx / 2, y - ry], [x + rx, y], [x + rx / 2, y + ry], [x - rx / 2, y + ry]], gl.rgb("#000000", alpha), { world, flags: gl.FLAG_UNLIT | gl.FLAG_NOFOG }));
      },
    });
    out.push({
      key: key + 3,
      kind: "arrow",
      emit() {
        gl.surface(surf, 0);
        // A projectile drawn to flicker (the fireball: three frames a direction) loops them by the wall clock, as flames do.
        const fl = sheet.flicker ? `_${Math.floor(performance.now() / 90) % sheet.flicker}` : "";
        // A thrown knife or axe turns along its arc (docs/24 section 1): its step by its own age, not the way it points.
        const name = sheet.spin ? `${a.projectile}_${spinFrame(a, sheet.spin)}` : `${a.projectile || "arrow"}_${a.frame}${fl}`;
        const flags = sheet.flicker ? gl.FLAG_STANDING | gl.FLAG_NOFOG | gl.FLAG_UNLIT : gl.FLAG_STANDING | gl.FLAG_NOFOG;
        const k = sheet.scale | 0;
        if (k > 1) {
          // A projectile drawn larger than painted (the fireball, a whole-number scale so its pixels stay square).
          const f = sheet.frames[name];
          if (f) gl.quad(x - sheet.anchor[0] * k, y - Math.round(a.z) - sheet.anchor[1] * k, f[2] * k, f[3] * k, gl.frameUV(sheet, name), { world, heights: 0, flags });
        } else frameQuad(sheet, name, x, y - Math.round(a.z), { world, heights: 0, flags });
      },
    });
  }
}

// A thrown potion's or poison's splash where it shatters (docs/47 section 7): a burst of its colour fading fast, and a stain lingering on
// the ground for `archery.SPLASH_SECONDS`, both client-only (not in the world's hash; `archery.splashesNow()`), flat on the ground as an
// arrow's shadow is.
export function splashDrawables(splashes, visible, out) {
  if (!splashes || !splashes.length) return;
  for (const s of splashes) {
    if (!(s.t >= 0)) continue; // not yet in the drawn time (a guest's, stepFlights)
    if (!visible.has(tileKey(Math.round(s.gx), Math.round(s.gy)))) continue;
    const p = iso.toScreen(s.gx, s.gy);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const u = Math.min(1, s.t / SPLASH_SECONDS);
    const stainAlpha = (1 - u) * 0.5;
    const burstAlpha = Math.max(0, 1 - s.t / 0.35);
    const world = [s.gx, s.gy];
    const octagon = (rx, ry) => [[x, y - ry], [x + rx * 0.7, y - ry * 0.7], [x + rx, y], [x + rx * 0.7, y + ry * 0.7], [x, y + ry], [x - rx * 0.7, y + ry * 0.7], [x - rx, y], [x - rx * 0.7, y - ry * 0.7]];
    out.push({
      key: (s.gx + s.gy) * 1000 + 0.1,
      kind: "splash",
      emit() {
        flatHere(() => {
          if (stainAlpha > 0.01) gl.poly(octagon(14, 7), gl.rgb(s.color, stainAlpha), { world, flags: gl.FLAG_UNLIT | gl.FLAG_NOFOG });
          if (burstAlpha > 0.01) gl.poly(octagon(20 + 10 * u, 10 + 5 * u), gl.rgb(s.color, burstAlpha), { world, flags: gl.FLAG_UNLIT | gl.FLAG_NOFOG });
        });
      },
    });
  }
}

// The landing marker (docs/20): a ring on the ground where the current draw
// would come down, a fainter one where a full draw would, and a dotted line out
// to it, unlit and unfogged so it reads at night.
export function emitMarker(m) {
  const flags = gl.FLAG_NOFOG | gl.FLAG_UNLIT;
  // The line leaves the archer's floor and the rings lie on the floor aimed at (docs/53 step 2), each lifted by its storey.
  const liftFrom = map.STOREY * (m.fromLayer || 0);
  const liftTo = map.STOREY * (m.layer ?? m.fromLayer ?? 0);
  const ring = (g, rx, ry, k, color) => {
    const p = iso.toScreen(g[0], g[1]);
    const x = Math.round(p.x);
    const y = Math.round(p.y - liftTo);
    const O = [[x, y - ry], [x + rx, y], [x, y + ry], [x - rx, y]];
    const I = O.map(([px, py]) => [Math.round(x + (px - x) * k), Math.round(y + (py - y) * k)]);
    for (let i = 0; i < 4; i++) gl.poly([O[i], O[(i + 1) % 4], I[(i + 1) % 4], I[i]], color, { world: g, flags });
  };
  if (m.from && m.full) {
    const a = iso.toScreen(m.from[0], m.from[1]);
    const b = iso.toScreen(m.full[0], m.full[1]);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.floor(len / 10);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const gx = m.from[0] + (m.full[0] - m.from[0]) * t;
      const gy = m.from[1] + (m.full[1] - m.from[1]) * t;
      const px = Math.round(a.x + (b.x - a.x) * t);
      const py = Math.round(a.y + (b.y - a.y) * t - liftFrom - (liftTo - liftFrom) * t);
      gl.poly([[px - 1, py - 1], [px + 1, py - 1], [px + 1, py + 1], [px - 1, py + 1]], gl.rgb("#ffffff", 0.35), { world: [gx, gy], flags });
    }
  }
  if (m.full) ring(m.full, 8, 4, 0.55, gl.rgb("#ffffff", 0.35));
  if (m.land) ring(m.land, 11, 5.5, 0.6, gl.rgb("#ffffff", 0.95));
}

const SWING_OUTLINE = [0.38, 1, 0.38, 1];
const SWING_OUTLINE_OFFSETS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

// A burning figure's flames, embers, and smoke (fire.js): each a small sprite at
// a height above a world point, unlit (fire is its own light) and unfogged,
// sorted just after the figure. The flames ride the figure; the rest stay put.
export function fireDrawables(particles, visible, out) {
  if (!particles || !particles.length) return;
  for (const p of particles) {
    const gx = p.ch ? p.ch.gx : p.gx;
    const gy = p.ch ? p.ch.gy : p.gy;
    if (!visible.has(tileKey(Math.round(gx), Math.round(gy)))) continue;
    const s = iso.toScreen(gx, gy);
    const x = Math.round(s.x + p.ox);
    const y = Math.round(s.y - p.z - ((p.ch ? p.ch.rise : p.rise) || 0)); // a burning body on a stair burns at its rise, its embers and smoke with it (its storey is the pass's lift)
    const u = p.t / p.life;
    let name;
    let color;
    if (p.kind === "flame") {
      name = `flame_${Math.min(3, Math.floor(u * 4))}`;
    } else if (p.kind === "splinter") {
      name = `splinter_${(Math.floor(p.t * 14) + p.f) % 4}`; // tumbling as it falls
      color = [1, 1, 1, u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3];
    } else if (p.kind === "ember" || p.kind === "spark") {
      name = "ember";
      color = [1, 1, 1, u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4];
    } else {
      name = u < 0.5 ? "smoke_0" : "smoke_1";
      color = [1, 1, 1, 0.8 * (1 - u)];
    }
    const world = [gx, gy];
    const surf = depth.figure(gx, gy); // the burning body's own surface, a little nearer than the body (docs/51 section 3)
    out.push({
      key: (gx + gy) * 1000 + 2.5, // the depth buffer orders it against the walls (docs/51); the key orders the translucent pass
      kind: "fire",
      emit() {
        gl.surface(surf, DEPTH_BIAS.figure + DEPTH_BIAS.particle + depth.across(gx, gy) * gl.depthStep()); // over its body, which is as far across
        frameQuad(getSheet("burn"), name, x, y, { world, heights: 0, color, flags: gl.FLAG_UNLIT | gl.FLAG_NOFOG });
      },
    });
  }
}

// The wash on a burning figure: an orange pulse, multiplied in (fire.js).
function burnTint() {
  const t = performance.now() / 1000;
  const a = Math.sin(t * 11) * 0.5 + 0.5;
  const b = Math.sin(t * 17.3 + 1.1) * 0.5 + 0.5;
  const k = 0.35 + 0.65 * a * b;
  return [1, 0.72 + 0.16 * k, 0.4 + 0.2 * k, 1];
}

// The colour a figure's body is drawn with: a burning one's orange pulse, a poisoned one's green pulsing with its stacks (poison.js `tintOf`,
// from the record's tier and stacks, so a guest's replica draws it as the host does; docs/47 section 6), both multiplied together when it is
// both, and the dark's fade; undefined for none.
export function bodyTint(e, dim = null) {
  const pt = e.poison && !e.dead ? poisonTintOf(e.poison, performance.now() / 1000) : null;
  let c = e.burning ? burnTint() : dim;
  if (pt) c = c ? c.map((v, i) => v * pt[i]) : pt;
  return c || undefined;
}

// The viewer's room, [layer, id], whose near walls are cut to the stub and so cover nothing (structureCovers); kept for the frame.
let roomKept = { frame: -1, room: null };
function viewerRoom(me) {
  if (roomKept.frame !== gl.frameId()) roomKept = { frame: gl.frameId(), room: [me.layer || 0, map.roomAt(Math.round(me.gx), Math.round(me.gy), me.layer || 0)] };
  return roomKept.room;
}

// The seen-but-covered shape's colour: Object Highlight's, at the cover rule's opacity (tuning.js `cover.seenAlpha`).
let xrayRgb = null;
function xrayColor() {
  if (!xrayRgb) xrayRgb = gl.rgb(highlightTuning.color, 1);
  return [xrayRgb[0], xrayRgb[1], xrayRgb[2], coverTuning.seenAlpha];
}

const SHIELD_FLASH = [1, 0.95, 0.7, 1]; // a blow blocked
const SHIELD_BROKEN = [1, 0.3, 0.25, 1]; // the guard broken

export function entityDrawables(entities, visible, out, drawAll, me = null) {
  for (const e of entities) {
    const vis = e === me || drawAll || visible.has(tileKey(Math.round(e.gx), Math.round(e.gy))); // another player is seen like anyone, never through a wall (docs/31/03)
    if (!vis) continue; // the dead you cannot see are not drawn, full stop
    // In the dark the dead fade to hidden past a short radius unless they stand in light (sight.js, #88): premultiplied, so
    // the whole picture, held things and all, goes down together. Not for a debug draw-all, your own player, or a fallen body.
    const fade = me && !drawAll && e.kind === "zombie" && !e.dead ? seenAlpha(me, e) : 1;
    if (fade < sightTuning.drawCutoff) continue; // too faint to draw (data/tuning.json sight, #158)
    const dim = fade < 1 ? [fade, fade, fade, fade] : null;
    const sheet = getSheet(e.sprite);
    const p = iso.toScreen(e.gx, e.gy);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const r = resolveFacing(sheet, e.facing);
    let name = frameName(sheet, e.anim.name, r.facing, e.anim.frame);
    if (!sheet.frames[name]) name = frameName(sheet, "idle", r.facing, 0); // a sheet one rebake behind the animation (docs/32)
    const f = sheet.frames[name];
    const rect = f ? { x: x - sheet.anchor[0], y: y - sheet.anchor[1], w: f[2], h: f[3] } : null;
    // Held items sit at the hand joints the figure's sheet reports (docs/12):
    // a far hand draws before the body, a near hand after; an item with fire
    // gets the flame at its tip.
    const joints = sheet.joints ? sheet.joints[name] : null;
    const held = [];
    if (e.hands && joints) {
      const seen = new Set();
      for (const slot of ["main", "off"]) {
        const entry = e.hands[slot];
        if (!entry || seen.has(entry)) continue;
        seen.add(entry);
        const def = getItem(entry.id);
        if (!def.held) continue;
        // A raised guard (docs/21): the shield comes up before the chest, toward where the player
        // aims, in front of the body when that is toward the camera and behind it when away.
        if (slot === "off" && def.shield && e.blocking && e.aim) {
          let gs = null;
          try { gs = getSheet("held_shield_guard"); } catch { gs = null; }
          if (gs) {
            const n = Math.hypot(e.aim.sx, e.aim.sy) || 1;
            const ax = e.aim.sx / n;
            const ay = e.aim.sy / n;
            // Facing away, the shield is behind the body; it is pushed out to the side so its rim still shows.
            const sx = ay > 0 ? Math.round(ax * 9) : (ax >= 0 ? 12 : -12);
            held.push({ sheet: gs, k: 0, x: x + sx, y: y - 24 + Math.round(ay * 5), near: ay > 0, tip: null, flash: e.blockFlash > 0 ? (e.flashBroken ? SHIELD_BROKEN : SHIELD_FLASH) : null });
            continue;
          }
        }
        let hs = null;
        try { hs = getSheet(`held_${entry.id}`); } catch { continue; }
        const j = joints[slot];
        // In a swing the swinging hand's thing points along its forearm: the main hand's in `attack` and `attack_alt`, the off
        // hand's in `attack_off` (#423); the other hand's is held at rest.
        const swingHand = e.anim.name === "attack" || e.anim.name === "attack_alt" ? "main" : e.anim.name === "attack_off" ? "off" : null;
        const along = slot === swingHand && def.held.swing !== false;
        const k = hs.byFacing ? (j.angFace ?? j.ang) : along ? j.angSwing : j.ang; // a bow is upright by the facing (held.js)
        held.push({ sheet: hs, k, x: x + j.x, y: y + j.y, near: j.near, tip: def.fire && (!def.fire.burnsDown || entry.lit) ? hs.tips[k] : null }); // the flame only on a lit torch
      }
    }
    const carried = e.carrying || null;
    const carrySheet = carried ? getSheet(carried.sprite, carried.tiles.length) : null;
    const lift = joints && joints.main ? Math.max(24, -joints.main.y + 2) : 30;
    // Its depth (docs/51 section 3): a billboard through the front of its body, (gx + r, gy + r), over the ground by the figure's bias; its
    // held things, its torch's flame, and what it carries on the same surface, each a step nearer in the order drawn.
    const surf = depth.figure(e.gx, e.gy);
    // Whose shape shows where it is covered: a player (yours, a friend's), and any body on another storey than yours that you see; the dead
    // on your own floor behind a tree or a wall stay hidden (the forest gives no laser vision, Michael 2026-10-11).
    const xray = !drawAll && !!me && !probe.noCover && fade >= sightTuning.seenAt && (e.kind === "player" || (e.layer || 0) !== (me.layer || 0)) && !e.dead && structureCovers(e, viewerRoom(me), hiderFor(me));
    out.push({
      key: (e.gx + e.gy) * 1000 + (e.dead ? 0 : 2), // where it stands: the depth buffer orders it against the walls and posts (docs/51)
      kind: "entity",
      entity: e,
      rect,
      vis: true,
      occluded: false,
      emit() {
        // A little nearer by where it stands across its diagonal, so two side by side on one never tie (render/depth.js across).
        gl.surface(surf, DEPTH_BIAS.figure + depth.across(e.gx, e.gy) * gl.depthStep(), DEPTH_ROOM.figure);
        const world = [e.gx, e.gy];
        const target = client.targets.has(e.id) && fade >= sightTuning.seenAt;
        if (target) {
          // The next swing would hit this one (docs/14): a one-pixel outline, eight copies of the
          // sprite flat green just behind it, unlit and unfogged so it reads at night (a step behind its surface, docs/51).
          gl.setBehind(true);
          for (const [ox, oy] of SWING_OUTLINE_OFFSETS) {
            frameQuad(sheet, name, x + ox, y + oy, { world, heights: f ? [f[3], f[3], 0, 0] : 0, color: SWING_OUTLINE, flags: gl.FLAG_NOFOG | gl.FLAG_UNLIT | gl.FLAG_SOLID }, r.flip);
          }
          gl.setBehind(false);
        }
        if (hl.isCharacter(e.id) && !target) hl.outline(sheet, name, x, y, { world, heights: f ? [f[3], f[3], 0, 0] : 0 }, r.flip); // Object Highlight: the one under the cursor that can be acted on (#301) // the green swing outline wins: it says this swing lands (docs/41; the review of #390)
        const drawHeld = (h) => {
          // A shield that just met a blow is flat bright for a moment (docs/21).
          frameQuad(h.sheet, `held_${h.k}`, h.x, h.y, h.flash ? { world, heights: 40, color: h.flash, flags: gl.FLAG_NOFOG | gl.FLAG_UNLIT | gl.FLAG_SOLID } : { world, heights: 40, color: dim || undefined, flags: gl.FLAG_NOFOG | gl.FLAG_STANDING });
          if (h.tip) frameQuad(getSheet("flame"), `flame_${flameFrame(1)}`, h.x + h.tip[0], h.y + h.tip[1] - 2, { world, flags: gl.FLAG_UNLIT | gl.FLAG_NOFOG });
        };
        for (const h of held) if (!h.near) drawHeld(h);
        frameQuad(sheet, name, x, y, { world, heights: f ? [f[3], f[3], 0, 0] : 0, color: bodyTint(e, dim), flags: gl.FLAG_NOFOG | gl.FLAG_STANDING }, r.flip);
        for (const h of held) if (h.near) drawHeld(h);
        if (carried) {
          // Each footprint slice at its offset from the anchor, lifted over the head.
          const [cw, ch] = carried.footprint;
          gl.holdOrder(true); // its slices side by side: one step
          let i = 0;
          for (let dy = 0; dy < ch; dy++) {
            for (let dx = 0; dx < cw; dx++, i++) {
              const o = iso.toScreen(e.gx + dx - (cw - 1) / 2, e.gy + dy - (ch - 1) / 2);
              const cn = idleFrame(carrySheet, carried, i);
              const cf = carrySheet.frames[cn];
              frameQuad(carrySheet, cn, Math.round(o.x), Math.round(o.y) - lift, { world, heights: cf ? [cf[3] + lift, cf[3] + lift, lift, lift] : lift, flags: gl.FLAG_NOFOG | gl.FLAG_STANDING });
            }
          }
          gl.holdOrder(false);
        }
        if (xray) {
          // Seen but covered (docs/53 section 6.2, mechanism 4): its shape again, the last of its pieces and so a step nearer than all of them
          // (its body, what it holds, what it carries), in the seen-but-covered pass, which draws it only where something nearer than that
          // covers it (a wall it stands behind, a cliff, a plateau): never over its own sword (the review of #603).
          gl.setPass(gl.PASS_XRAY);
          frameQuad(sheet, name, x, y, { world, heights: f ? [f[3], f[3], 0, 0] : 0, color: xrayColor(), flags: gl.FLAG_NOFOG | gl.FLAG_UNLIT | gl.FLAG_SOLID }, r.flip);
          gl.setPass(gl.PASS_STAND);
        }
      },
    });
  }
}
