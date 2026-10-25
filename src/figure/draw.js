// Drawing one frame of the figure (docs/12): the garments as rules on the body's parts, the painted layers
// (tools/layers.html, data/layers), the parts' order, and the sheets a whole figure bakes into.
// Cut from src/figure.js on 2026-10-12 (docs/23a, D3): a move, no number changed; the sheets check proves the pixels.

import { HELD_LEAN_OUT, HELD_TILT, angleIndex } from "./held.js";
import { Frame, facingVectors, hexToRgb, project, tone } from "./raster.js";
import { BODY, FACINGS, FEET_X, FEET_Y, FH, FW, ISO, OUTLINE, WHITE, animsFor, joints, offStyleFor, pose, styleFor } from "./rig.js";

// ---- the outfit ----

// What a slot's garment does to the parts (docs/12, garment rules). An
// outfit is { head, chest, hands, legs, feet, waist, back }, each
// { shape, colours: [hex...] } or null. Colours are the garment's tones in
// order of use; one colour is enough for most.
function col(garment, i = 0, fallback = "#888") {
  const list = (garment && garment.colours) || [];
  return hexToRgb(list[Math.min(i, list.length - 1)] || fallback);
}

// ---- drawing one frame ----

// Hair painted in the editor (tools/hair.html): per facing, pixels relative
// to the head's centre, [dx, dy, "#rrggbb"]. Registered at boot from
// data/hair/index.json; a look's hairStyle may name one.
// Painted layers (tools/layers.html, docs/12 "The next editors"). A layer is
// { name, slot, options, parts: { part: { facing: [[dx, dy, "#hex"], ...] } } },
// pixels relative to the part's anchor joint in the rest frame (idle 0 of
// that facing). "subst" parts only recolour pixels the generated part owns,
// so the standard silhouette holds; "free" parts draw anywhere and follow
// their joint, arms turning with the arm.
export const LAYER_SLOTS = {
  hair: { head: "free" },
  head: { head: "free" },
  chest: { torso: "subst", armL: "free", armR: "free" },
  legs: { legL: "subst", legR: "subst" },
  hands: { handL: "free", handR: "free" },
  feet: { footL: "free", footR: "free" },
  body: { torso: "subst", legL: "subst", legR: "subst", armL: "subst", armR: "subst" },
  beard: { head: "free" }, // facial hair (docs/25): drawn after the face and the hair, so it is never covered
  waist: { torso: "subst" }, // a belt, over the chest's torso pixels
};
const layers = new Map(); // "slot/name" -> layer
export let layersVersion = 0;

export function registerLayer(slot, name, data) {
  // The first hair files were { frames } alone: that is a head part.
  const parts = data.parts || (data.frames ? { head: data.frames } : {});
  layers.set(`${slot}/${name}`, { ...data, name, slot, parts, options: data.options || {}, variant: data.variant || "player" });
  layersVersion++;
}
// Whether a layer is painted in two tones plus the outline over every part and facing (the dye's contract, docs/28),
// worked out once per registered layer.
const twoTone = new WeakMap();
function isTwoTone(L, tonesOf) {
  if (!twoTone.has(L)) {
    const all = Object.values(L.parts || {}).flatMap((part) => Object.values(part).flat());
    twoTone.set(L, tonesOf(all).length <= 2);
  }
  return twoTone.get(L);
}
export function getLayer(slot, name) {
  return (name && layers.get(`${slot}/${name}`)) || null;
}
export function layerNames(slot) {
  const pre = `${slot}/`;
  return [...layers.keys()].filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length));
}
export function registerHair(name, data) {
  registerLayer("hair", name, data);
}
// Bald first, then the generated shapes a painted style has not replaced (the painted
// `long` stands in for the generated one), then every painted style (docs/12).
export function hairStyles() {
  const painted = layerNames("hair").sort(); // the files load in any order; the row is the same every boot
  return ["bald", ...["short", "long"].filter((s) => !painted.includes(s)), ...painted];
}
export function hairIsPainted(name) {
  return !!getLayer("hair", name);
}

// Part ids, for the shading pass.
const PART = { legL: 1, legR: 2, torso: 3, armL: 4, armR: 5, head: 6, hair: 7, bag: 8, hat: 9 };
const SHADE_DYE = 0.16; // how much darker a dyed layer's second tone is than the hair colour (the two-tone rule)
const FAR_ARM_SLIVER = 2; // px: what is left of a far arm shows only if some row of it is wider than this (Michael, 2026-10-12)
const RAISED_ARM = 40; // degrees of pitch from which an arm (holding, swinging) is never judged as hidden

function drawFrame(frame, spec, facing, anim, i) {
  const F = facingVectors(facing);
  const p = pose(spec.variant, anim, i, spec.holding, anim === "attack_alt" ? spec.altStyle : anim === "attack_off" ? offStyleFor(spec) : styleFor(spec)); // the off hand's swing its own weapon's style (#423)
  const J = joints(p);
  const look = spec.look;
  const outfit = spec.outfit || {};
  const B = BODY;
  const flash = p.flash;
  const skin = flash ? WHITE : hexToRgb(look.skin);
  const under = flash ? WHITE : hexToRgb(look.under || "#e9dfc8");
  const hair = flash ? WHITE : hexToRgb(look.hair);
  const paint = (rgb) => (flash ? WHITE : rgb);
  const P = (pt) => {
    const q = project(F, pt[0], pt[1], pt[2]);
    return { x: FEET_X + q.x, y: FEET_Y + q.y, depth: q.depth };
  };
  // The face is drawn front-on (Stardew, Habbo): both eyes toward the viewer,
  // one eye from the side, none from behind.
  const faceFront = F.fy > 0.3; // s, sw, se: both eyes
  const faceSide = !faceFront && F.fy > -0.3; // e, w: one eye
  const hairSide = Math.abs(F.fx) > 0.8; // e, w only; the three-quarter facings keep the front cap, shifted back
  const parts = [];
  const add = (depth, draw) => parts.push({ depth, draw });
  let torsoDrawn = false;
  const farArms = []; // the arms drawn before the torso, behind it
  const along = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  // Painted layers, by slot, and the rest pose their pixels were painted on.
  const painted = spec.painted || {};
  // Each layer's pixels sit on the rest pose of the body they were painted
  // on, player or zombie; the stamp carries them from that pose to this frame.
  const rests = {};
  const restOf = (variant) => (rests[variant] ||= joints(pose(variant, "idle", 0, { main: false, off: false })));
  const restJ = restOf(spec.variant);
  // A worn item's painted layer comes dyed by its entry (dyeWorn, below); hair, beards, and the body are dyed by the look (dye).
  const layerPx = (slot, partName) => {
    const L = painted[slot];
    const pixels = L && L.parts && L.parts[partName] ? L.parts[partName][facing] || null : null;
    return pixels && outfit[slot] ? dyeWorn(slot, pixels) : pixels;
  };
  // Dyeing (docs/25): a hair or beard layer with `options.dye` is painted in
  // the wearer's hair colour: its lightest colour becomes the hair colour, every
  // other its darker tone, and the outline colour stays. A layer without the
  // option keeps the colours it was painted in (Michael's purple).
  const hexOf = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const lum = (h) => { const [r, g, b] = hexToRgb(h); return 0.3 * r + 0.59 * g + 0.11 * b; };
  const tonesOf = (pixels) => [...new Set(pixels.map((p) => p[2]))].filter((c) => c !== hexOf(OUTLINE)).sort((a, b) => lum(b) - lum(a)); // lightest first
  const dyeTo = (pixels, hex) => {
    const base = hexOf(hexToRgb(hex));
    const dark = hexOf(tone(hexToRgb(hex), -SHADE_DYE));
    const map = new Map(tonesOf(pixels).map((c, i) => [c, i === 0 ? base : dark]));
    return pixels.map(([x, y, c]) => [x, y, map.get(c) || c]);
  };
  const dye = (slot, pixels) => {
    const L = painted[slot];
    if (!pixels || !L || !L.options || !L.options.dye) return pixels;
    return dyeTo(pixels, (slot === "beard" && look.beardColour) || look.hair);
  };
  // A painted garment in any slot is dyed by its worn entry (docs/43 section 8; docs/28, "colour is data, not art"; the onion
  // hat first, 2026-10-18): only a dyed entry (`dyed`, from wardrobe.js), only the layer the item names (not a try-on from the
  // settings nor the dead's pool). With `keys` on the item's art, one pair of key tones per region (light, dark), region i's
  // light key becomes the entry's colour i and its dark key that colour's shade; every other tone and the outline are kept.
  // Without keys, the one-region rule hair has: a layer painted in two tones plus the outline takes the first colour as its
  // light tone and its shade as the dark, and a layer of more tones keeps its paint, dyed or not.
  const keyMaps = {}; // slot -> the key tones' replacements, made once a frame
  const keyMapOf = (slot, g) => {
    if (keyMaps[slot]) return keyMaps[slot];
    const m = new Map();
    g.keys.forEach((pair, i) => {
      const c = g.colours[i];
      if (!pair || !c) return;
      const rgb = hexToRgb(c);
      if (pair[0]) m.set(hexOf(hexToRgb(pair[0])), hexOf(rgb));
      if (pair[1]) m.set(hexOf(hexToRgb(pair[1])), hexOf(tone(rgb, -SHADE_DYE)));
    });
    return (keyMaps[slot] = m);
  };
  const dyeWorn = (slot, pixels) => {
    const g = outfit[slot];
    const L = painted[slot];
    if (!pixels || !g || !g.dyed || !L || g.painted !== L.name || !g.colours || !g.colours[0]) return pixels;
    if (Array.isArray(g.keys) && g.keys.length) {
      const m = keyMapOf(slot, g);
      return pixels.map(([x, y, c]) => [x, y, m.get(c) || m.get(String(c).toLowerCase()) || c]);
    }
    return isTwoTone(L, tonesOf) ? dyeTo(pixels, g.colours[0]) : pixels;
  };
  const layerRest = (slot) => restOf(painted[slot] ? painted[slot].variant : spec.variant);
  // Carry pixels painted relative to the rest segment a0 -> b0 onto this
  // frame's segment a -> b: translate, turn, and scale with it. With
  // `allowed`, only pixels the generated part already owns are recoloured.
  const stamp = (pixels, a0, b0, a, b, allowed = null, tag = 0) => {
    if (!pixels || !pixels.length) return;
    const v0x = b0.x - a0.x, v0y = b0.y - a0.y, vx = b.x - a.x, vy = b.y - a.y;
    const l0 = Math.hypot(v0x, v0y), l1 = Math.hypot(vx, vy);
    const sc = l0 < 0.5 || l1 < 0.5 ? 1 : l1 / l0;
    const th = l0 < 0.5 || l1 < 0.5 ? 0 : Math.atan2(vy, vx) - Math.atan2(v0y, v0x);
    const cs = Math.cos(th), sn = Math.sin(th);
    for (const [dx, dy, c] of pixels) {
      const x = Math.round(a.x + (dx * cs - dy * sn) * sc);
      const y = Math.round(a.y + (dx * sn + dy * cs) * sc);
      if (x < 0 || y < 0 || x >= FW || y >= FH) continue;
      const i = y * FW + x;
      if (allowed && (!allowed.has(frame.part[i]) || frame.kind[i] === 1)) continue;
      frame.set(i, flash ? WHITE : hexToRgb(c), 3, allowed ? frame.part[i] : tag);
    }
  };
  const point = (q) => ({ x: q.x, y: q.y });
  const below = (q) => ({ x: q.x, y: q.y + 1 });

  // Legs: each leg is one outlined shape, thigh to foot; breeches, undies,
  // and boots are colour on it, never more outline (docs/02, 2026-10-10:
  // no Michelin rolls).
  const leg = (hip, foot, side, part, rhip, rfoot) => {
    const top = [hip[0], hip[1], hip[2] + 2]; // starts inside the torso
    const a = P(top);
    const b = P(foot);
    const legName = part === PART.legL ? "legL" : "legR";
    const footName = part === PART.legL ? "footL" : "footR";
    const fb = P([foot[0], foot[1] + 1.5, foot[2]]);
    // The legs always draw under the torso (the shirt covers the pants,
    // Michael 2026-10-10), the nearer leg over the farther.
    const raw = (a.depth + b.depth) / 2;
    const depth = Math.min(raw, 0) - 0.003 + raw * 0.0001;
    add(depth, () => {
      const legs = outfit.legs;
      const feet = outfit.feet;
      frame.begin();
      frame.addCapsule(a.x, a.y, b.x, b.y, B.legR);
      frame.addEllipse(fb.x, fb.y + 1, B.footRx, B.footRy);
      frame.outline(part);
      frame.fill(paint(legs ? col(legs) : skin), part);
      if (!legs) {
        const u = along(a, b, 0.4);
        frame.capsule(a.x, a.y, u.x, u.y, B.legR, paint(under), { outline: false, part });
      }
      if (feet) {
        const u = along(a, b, 0.62);
        frame.capsule(u.x, u.y, b.x, b.y, B.legR, paint(col(feet)), { outline: false, part });
        frame.ellipse(fb.x, fb.y + 1, B.footRx, B.footRy, paint(col(feet)), { outline: false, part });
        // The boot's top: one dark row, a seam between two slots.
        frame.capsule(u.x, u.y, u.x, u.y, B.legR - 0.3, OUTLINE, { outline: false, part: 0 });
      } else {
        frame.ellipse(fb.x, fb.y + 1, B.footRx - 0.5, B.footRy, paint(tone(skin, -0.12)), { outline: false, part });
      }
      const own = new Set([part]);
      // A painted leg is relative to the leg's top, two above the hip joint, which is the hipL the sheet's joints report (draw.js, the joints) and the editor and the slicer anchor to.
      const rest = (slot) => { const R = layerRest(slot); const hip = part === PART.legL ? R.hipL : R.hipR; const foot = part === PART.legL ? R.footL : R.footR; return [P([hip[0], hip[1], hip[2] + 2]), P(foot)]; };
      let r = rest("body"); stamp(layerPx("body", legName), r[0], r[1], a, b, own);
      r = rest("legs"); stamp(layerPx("legs", legName), r[0], r[1], a, b, own);
      r = rest("feet"); stamp(layerPx("feet", footName), r[1], below(r[1]), b, below(b));
    });
  };
  leg(J.hipL, J.footL, -1, PART.legL, restJ.hipL, restJ.footL);
  leg(J.hipR, J.footR, 1, PART.legR, restJ.hipR, restJ.footR);

  // Torso: one outlined hull; a tunic colours it, a second colour runs down
  // the front, a belt bands the waist.
  const torsoPts = [];
  const chestLayer = painted.chest || null;
  const longTunic = chestLayer && chestLayer.options.length === "long";
  const hem = outfit.chest ? (longTunic ? 6 : 3) : 2; // shirt length unless the painted layer says long (Michael: not to the knees)
  for (const [l, d, h] of [
    [-B.shoulderL + 1, -B.torsoD, J.shoulderL[2]], [B.shoulderL - 1, -B.torsoD, J.shoulderR[2]],
    [-B.shoulderL + 1, B.torsoD, J.shoulderL[2]], [B.shoulderL - 1, B.torsoD, J.shoulderR[2]],
    [-B.hipL, -B.hipD, J.hip[2] - hem], [B.hipL, -B.hipD, J.hip[2] - hem],
    [-B.hipL, B.hipD, J.hip[2] - hem], [B.hipL, B.hipD, J.hip[2] - hem],
  ]) torsoPts.push(P([l, d + (h > J.hip[2] ? p.lean : p.lean * 0.3), h]));
  add(0.0005, () => {
    const chest = outfit.chest;
    torsoDrawn = true;
    frame.poly(torsoPts, paint(chest ? col(chest) : skin), { part: PART.torso });
    if (chest && chest.colours && chest.colours.length > 1 && faceFront) {
      const top = P([0, B.torsoD + 0.5, J.shoulderL[2] - 1]);
      const bot = P([0, B.hipD + 0.5, J.hip[2] + 2]);
      frame.capsule(top.x, top.y, bot.x, bot.y, 2, paint(col(chest, 1)), { outline: false, part: PART.torso });
    }
    const waist = chestLayer && chestLayer.options.hideBelt ? null : outfit.waist;
    if (waist && !p.lying) {
      const band = [];
      for (const [l, d] of [[-B.hipL - 0.5, -B.hipD], [B.hipL + 0.5, -B.hipD], [-B.hipL - 0.5, B.hipD], [B.hipL + 0.5, B.hipD]]) {
        band.push(P([l, d + p.lean * 0.3, J.hip[2] + 1.6]));
        band.push(P([l, d + p.lean * 0.3, J.hip[2] + 2.4]));
      }
      frame.poly(band, paint(col(waist)), { outline: false, part: PART.torso });
      if (faceFront || faceSide) {
        const buckle = P([0, B.hipD + 0.6, J.hip[2] + 1.8]);
        frame.px(buckle.x, buckle.y, paint(col(waist, 1, "#c8a040")));
      }
    }
    const tn = P(J.neck), th = P(J.hip);
    const own = new Set([PART.torso]);
    for (const slot of ["body", "chest", "waist"]) {
      const R = layerRest(slot);
      stamp(layerPx(slot, "torso"), P(R.neck), P(R.hip), tn, th, own);
    }
  });

  // The bag on the back: behind the body facing the viewer, in front facing away.
  const back = outfit.back;
  if (back && !p.lying) {
    const c = P([0, -B.torsoD - 3.5 + p.lean, J.hip[2] + 8]);
    const big = back.shape === "rucksack" || back.shape === "dev_bag";
    add(c.depth - 0.5, () => {
      const w = big ? 5.5 : 4.5;
      const h = big ? 7 : 5.5;
      frame.poly([{ x: c.x - w, y: c.y - h + 1 }, { x: c.x + w, y: c.y - h + 1 }, { x: c.x + w + 1, y: c.y - h + 2 }, { x: c.x + w + 1, y: c.y + h - 1 }, { x: c.x + w, y: c.y + h }, { x: c.x - w, y: c.y + h }, { x: c.x - w - 1, y: c.y + h - 1 }, { x: c.x - w - 1, y: c.y - h + 2 }], paint(col(back)), { part: PART.bag });
      frame.capsule(c.x - w + 1, c.y - h + 3, c.x + w - 1, c.y - h + 3, 1, paint(col(back, 1, "#5a4a3a")), { outline: false, part: PART.bag });
    });
  }

  // Arms: one outlined shape from shoulder to hand; the sleeve and the glove
  // are colour on it. A bent arm (an elbow's bend, 2026-10-15) is the same shape in two halves, the upper arm and
  // the forearm, joined round at the elbow: the sleeve covers the upper arm, and a painted arm is split at the
  // elbow's place along its rest segment, each half carried with its own segment. A straight arm draws as it always has.
  const arm = (sh, hand, side, part, rsh, rhand, elbow = null) => {
    const a = P(sh);
    const b = P(hand);
    const e = elbow ? P(elbow) : null;
    const armName = part === PART.armL ? "armL" : "armR";
    const handName = part === PART.armL ? "handL" : "handR";
    const depth = (a.depth + b.depth) / 2 + 0.002 * side;
    add(depth, () => {
      const raised = Math.abs(p.armPitch[part === PART.armL ? 0 : 1]) > RAISED_ARM;
      if (!torsoDrawn && !raised) farArms.push({ part, midY: (a.y + b.y) / 2 });
      const chest = outfit.chest;
      const gloves = outfit.hands;
      frame.begin();
      if (e) {
        frame.addCapsule(a.x, a.y, e.x, e.y, B.armR);
        frame.addCapsule(e.x, e.y, b.x, b.y, B.armR);
      } else frame.addCapsule(a.x, a.y, b.x, b.y, B.armR);
      frame.addEllipse(b.x, b.y, B.handR, B.handR);
      frame.outline(part);
      frame.fill(skin, part);
      if (chest) {
        const u = e || along(a, b, 0.5);
        frame.capsule(a.x, a.y, u.x, u.y, B.armR, paint(col(chest)), { outline: false, part });
      }
      if (gloves) frame.ellipse(b.x, b.y, B.handR, B.handR, paint(col(gloves)), { outline: false, part });
      const rest = (slot) => { const R = layerRest(slot); return [P(part === PART.armL ? R.shoulderL : R.shoulderR), P(part === PART.armL ? R.handL : R.handR)]; };
      // A painted arm on a bent arm: the pixels nearer the shoulder than the elbow's place go with the upper arm, the
      // rest with the forearm (the rest pose's arm is straight, so the split is a line across it).
      const stampArm = (pixels, r0, r1, allowed, tag) => {
        if (!e || !pixels || !pixels.length) return stamp(pixels, r0, r1, a, b, allowed, tag);
        const e0 = along(r0, r1, B.elbow);
        const vx = r1.x - r0.x, vy = r1.y - r0.y;
        const l2 = vx * vx + vy * vy || 1;
        const upper = [], lower = [];
        for (const px of pixels) {
          const t = (px[0] * vx + px[1] * vy) / l2;
          if (t < B.elbow) upper.push(px);
          else lower.push([px[0] - (e0.x - r0.x), px[1] - (e0.y - r0.y), px[2]]);
        }
        stamp(upper, r0, e0, a, e, allowed, tag);
        stamp(lower, e0, r1, e, b, allowed, tag);
      };
      let r = rest("body"); stampArm(layerPx("body", armName), r[0], r[1], new Set([part]));
      r = rest("chest"); stampArm(layerPx("chest", armName), r[0], r[1], null, part);
      r = rest("hands"); stamp(layerPx("hands", handName), r[1], below(r[1]), b, below(b), null, part);
    });
    return { a: e || a, b }; // the held thing follows the forearm: from the elbow when the arm is bent
  };
  const armL = arm(J.shoulderL, J.handL, -1, PART.armL, restJ.shoulderL, restJ.handL, J.bentL ? J.elbowL : null);
  const armR = arm(J.shoulderR, J.handR, 1, PART.armR, restJ.shoulderR, restJ.handR, J.bentR ? J.elbowR : null);

  // Head: a rounded square, not an egg. Hair is a helmet of its own worn over
  // it (Michael, 2026-10-10), and any hat replaces it.
  const hc = P(J.head);
  const SQ = 3; // superellipse exponent: squarer than round
  add(hc.depth + 0.01, () => {
    const head = outfit.head;
    const paintedHead = head ? painted.head || null : null; // a painted helm or hat replaces the shape rule and the hair
    const helm = !paintedHead && head && head.shape === "helm";
    frame.begin();
    frame.addSuper(hc.x, hc.y, B.headRx, B.headRy, SQ);
    frame.outline(PART.head);
    frame.fill(paint(helm ? col(head) : skin), PART.head);
    const fromBehind = F.fy < -0.3;
    const paintedHair = !head ? painted.hair || null : null;
    if (!head && !paintedHair && look.hairStyle !== "bald") {
      // The hair helmet: the top of the head, down the back and sides, with
      // a straight fringe across the forehead from the front.
      // The cap's mass sits toward the back of the head, so it turns with the
      // face; its edge curves down from a high centre so the forehead shows
      // and the sides stay thin, to the ears.
      const cxh = hc.x - F.fx * 1.5;
      const rxh = B.headRx + 1;
      frame.begin();
      frame.addSuper(cxh, hc.y - 1, rxh, B.headRy + 1, SQ, (px, py) => {
        const u = (px - cxh) / rxh;
        const fringe = hc.y - 4.5 + u * u * 3.5;
        if (py <= fringe) return true; // the curved cap
        if (fromBehind) return py <= hc.y + 4; // the back of the head
        const forward = (px - hc.x) * F.fx; // positive toward the face
        if (hairSide) return forward < -1 && py <= hc.y + 2; // from the side: down the back only
        return Math.abs(px - hc.x) >= B.headRx - 1.5 && py <= hc.y; // from the front: thin sides to the ears
      });
      if (look.hairStyle === "long") {
        // Down to the shoulders at the sides and the back.
        const s0 = P([-B.headRx + 1, -2, J.head[2] - 2]);
        const s1 = P([B.headRx - 1, -2, J.head[2] - 2]);
        const e0 = P([-B.headRx + 1, -2, J.neck[2] - 5]);
        const e1 = P([B.headRx - 1, -2, J.neck[2] - 5]);
        frame.addCapsule(s0.x, s0.y, e0.x, e0.y, 2.2);
        frame.addCapsule(s1.x, s1.y, e1.x, e1.y, 2.2);
        if (fromBehind) frame.addPoly([{ x: s0.x - 1, y: s0.y }, { x: s1.x + 1, y: s1.y }, { x: e1.x + 1, y: e1.y }, { x: e0.x - 1, y: e0.y }]);
      }
      frame.outline(PART.hair);
      frame.fill(paint(hair), PART.hair);
    }
    if (head && !helm && !paintedHead) {
      if (head.shape === "hood") {
        frame.begin();
        frame.addSuper(hc.x, hc.y - 1, B.headRx + 1.5, B.headRy + 2, SQ);
        const tip = P([0, -3, J.head[2] + B.headRy + 4]);
        frame.addCapsule(hc.x, hc.y - B.headRy, tip.x, tip.y, 2);
        frame.outline(PART.hat);
        frame.fill(paint(col(head)), PART.hat);
        if (faceFront || faceSide) {
          // The face opening.
          frame.begin();
          frame.addSuper(hc.x + F.fx * 1.5, hc.y + 1.5, B.headRx - 3.5, B.headRy - 3, SQ);
          frame.fill(skin, PART.head);
        }
      } else if (head.shape === "cap") {
        frame.begin();
        frame.addSuper(hc.x, hc.y - 1, B.headRx + 1, B.headRy + 1, SQ, (px, py) => py <= hc.y - 3);
        if (faceFront) {
          // From the front the brim is the dome's own lower edge across the forehead, a little toward where the figure
          // looks. It was a short bar at the point forward of the head, which for a figure facing the camera lands at
          // the eyes: a dark monobrow between them (Michael's playtest, 2026-10-13).
          const edge = hc.y - 3;
          const lean = F.fx * 1.5;
          frame.addCapsule(hc.x - (B.headRx - 1.5) + lean, edge, hc.x + (B.headRx - 1.5) + lean, edge, 1.1);
        } else if (faceSide) {
          const brim = P([0, B.headRx - 1, J.head[2] + 2]);
          frame.addCapsule(brim.x - 3, brim.y, brim.x + 3, brim.y, 1.2);
        }
        frame.outline(PART.hat);
        frame.fill(paint(col(head)), PART.hat);
      }
    }
    // The face: whites and pupils, and a small grim mouth. Front-on.
    if (!p.lying && (faceFront || faceSide)) {
      const pupil = flash ? WHITE : spec.variant === "zombie" ? [150, 40, 40] : hexToRgb(look.eyes || "#1c1a22");
      const white = flash ? WHITE : spec.variant === "zombie" ? [200, 200, 170] : [245, 245, 240];
      const ey = Math.round(hc.y) + 3; // the eyes sit low on the face; there is no mouth to make room for
      const shift = Math.round(F.fx * 1.5); // a nudge toward where the figure looks
      if (helm) {
        for (const dx of [-3, 0, 3]) for (const dy of [-1, 0, 1]) frame.px(hc.x + dx + shift, ey + dy, OUTLINE);
      } else if (faceFront) {
        // Two eyes, two wide and three tall, whites with the pupil low on
        // the inner column. No mouth (Michael, 2026-10-10).
        for (const side of [-1, 1]) {
          const outer = Math.round(hc.x) + side * 4 + shift;
          const mid = outer - side;
          const inner = outer - 2 * side;
          for (let dy = -3; dy <= 1; dy++) {
            frame.px(outer, ey + dy, white);
            frame.px(mid, ey + dy, white);
            frame.px(inner, ey + dy, white);
          }
          for (const x of [mid, inner]) for (const dy of [-1, 0, 1]) frame.px(x, ey + dy, pupil);
        }
      } else {
        // From the side: one eye, drawn exactly as a front eye, on the forward
        // side of the face, pupil toward where the figure looks.
        const sgn = Math.sign(F.fx);
        const outer = Math.round(hc.x + F.fx * (B.headRx - 2.5));
        const mid = outer - sgn;
        const inner = outer - 2 * sgn;
        for (let dy = -3; dy <= 1; dy++) {
          frame.px(outer, ey + dy, white);
          frame.px(mid, ey + dy, white);
          frame.px(inner, ey + dy, white);
        }
        for (const x of [outer, mid]) for (const dy of [-1, 0, 1]) frame.px(x, ey + dy, pupil);
      }
    }
    if (paintedHair) { const r = P(layerRest("hair").head); stamp(dye("hair", layerPx("hair", "head")), r, below(r), hc, below(hc)); }
    if (paintedHead) { const r = P(layerRest("head").head); stamp(layerPx("head", "head"), r, below(r), hc, below(hc)); }
    if (painted.beard) { const r = P(layerRest("beard").head); stamp(dye("beard", layerPx("beard", "head")), r, below(r), hc, below(hc)); }
    if (spec.wound && !helm) {
      const w = P([spec.wound[0], spec.wound[1], J.head[2] + spec.wound[2]]);
      if (w.depth >= -1) {
        frame.px(w.x, w.y, [110, 30, 34]);
        frame.px(w.x + 1, w.y, [140, 40, 40]);
        frame.px(w.x, w.y + 1, [140, 40, 40]);
      }
    }
  });

  parts.sort((a, b) => a.depth - b.depth);
  for (const part of parts) part.draw();
  // Michael's two arm rules (2026-10-12, docs/12): a far arm shows a real sliver
  // or nothing, and an arm's outline never doubles another part's in a row;
  // the nearer part's outline wins.
  for (const f of farArms) frame.cullPart(f.part, FAR_ARM_SLIVER, f.midY); // the shoulder's half and the hand's judged apart
  const isArm = (p) => p === PART.armL || p === PART.armR;
  const isFar = (p) => farArms.some((f) => f.part === p);
  frame.mergeOutlines(isArm, (p) => (isFar(p) ? 0 : isArm(p) ? 2 : 1));
  frame.shade();

  // The joints the renderer needs: hand points in frame pixels, with the
  // forearm direction and whether the hand is in front of the body.
  // A held item at rest tilts forward from the hand and a little outward on
  // the hand's own side; in a swing it points along the forearm.
  // A style may stand the held thing otherwise for its frames (`heldTilt`, `heldOut` per arm in the poses data: the cast's
  // staff upright like a pole, its top a little behind; 2026-10-15); otherwise the rest tilt as always.
  const restAxis = (side) => {
    const arm = side < 0 ? 0 : 1; // [left, right], as the pose's arrays are
    const tilt = (p.heldTilt && p.heldTilt[arm] != null ? p.heldTilt[arm] : HELD_TILT) * Math.PI / 180;
    const out = (p.heldOut && p.heldOut[arm] != null ? p.heldOut[arm] : HELD_LEAN_OUT) * Math.PI / 180;
    const st = Math.sin(tilt);
    const so = Math.sin(out);
    return [F.fx * st + side * F.rx * so, -Math.cos(tilt) + (F.fy * st + side * F.ry * so) * ISO];
  };
  // In a swing the thing points along the forearm, cocked up by the pose's wrist (docs/32: the blade stays
  // level as the arm drops at the follow-through instead of dipping with it): the forearm's screen
  // direction is turned toward "up" by that many degrees, whichever side it hangs on.
  const swingAxis = (dir) => {
    if (!p.wrist) return dir;
    const a = Math.atan2(dir[0], -dir[1]); // clockwise from up, as the held angles are counted
    const w = (p.wrist * Math.PI) / 180;
    const b = a > 0 ? Math.max(0, a - w) : Math.min(0, a + w);
    return [Math.sin(b), -Math.cos(b)];
  };
  const hand = (arm, side) => ({
    x: Math.round(arm.b.x) - FEET_X,
    y: Math.round(arm.b.y) - FEET_Y,
    dir: [arm.b.x - arm.a.x, arm.b.y - arm.a.y],
    near: arm.b.depth >= 0,
    ang: angleIndex(restAxis(side)),
    angSwing: angleIndex(swingAxis([arm.b.x - arm.a.x, arm.b.y - arm.a.y])),
    angFace: angleIndex([F.fx, F.fy * ISO]), // the facing on screen, for a thing drawn by it (the bow, held.js)
  });
  const jp = (pt) => {
    const q = P(pt);
    return { x: Math.round(q.x) - FEET_X, y: Math.round(q.y) - FEET_Y };
  };
  return {
    main: hand(armR, 1),
    off: hand(armL, -1),
    head: jp(J.head),
    neck: jp(J.neck),
    hip: jp(J.hip),
    shoulderL: jp(J.shoulderL),
    shoulderR: jp(J.shoulderR),
    handL: jp(J.handL),
    handR: jp(J.handR),
    hipL: jp([J.hipL[0], J.hipL[1], J.hipL[2] + 2]),
    hipR: jp([J.hipR[0], J.hipR[1], J.hipR[2] + 2]),
    footL: jp(J.footL),
    footR: jp(J.footR),
  };
}


// ---- sheets ----

// spec: { variant: "player" | "zombie", look: { skin, hair, hairStyle, eyes, under },
//         outfit: { slot: { shape, colours } }, wound: [l, d, hOffset] | null }
export function generateFigure(spec, only = null) {
  if (only) return generateOneFrame(spec, only);
  const anims = animsFor(spec);
  const animNames = Object.keys(anims);
  const totalFrames = animNames.reduce((n, a) => n + anims[a].frames, 0);
  // A player's sheet keeps room for a second attack's four frames whether its weapon has one or not (docs/32), so
  // picking up the halberd never makes the sheet outgrow its place in the atlas (gl.redrawSheet; 2026-10-14).
  const reserve = !spec.noCarry && !anims.attack_alt ? 4 : 0;
  const canvas = document.createElement("canvas");
  canvas.width = FW * (totalFrames + reserve);
  canvas.height = FH * FACINGS.length;
  const ctx = canvas.getContext("2d");
  const frames = {};
  const jointTable = {};
  const partMaps = spec.partMaps ? {} : null;
  const frame = new Frame();
  FACINGS.forEach((facing, row) => {
    let colIdx = 0;
    for (const anim of animNames) {
      for (let i = 0; i < anims[anim].frames; i++) {
        frame.clear();
        const j = drawFrame(frame, spec, facing, anim, i);
        const ox = colIdx * FW;
        const oy = row * FH;
        frame.blit(ctx, ox, oy);
        const name = `${anim}_${facing}_${i}`;
        frames[name] = [ox, oy, FW, FH];
        jointTable[name] = j;
        if (partMaps) partMaps[name] = new Uint8Array(frame.part);
        colIdx++;
      }
    }
  });
  return {
    image: canvas,
    frames,
    anchor: [FEET_X, FEET_Y],
    animations: anims,
    facings: [...FACINGS],
    mirror: {},
    joints: jointTable,
    partMaps,
  };
}

// The sheet generateFigure would make, less the picture (docs/31/05, item 23):
// the frames' names and places, the anchor, the animations with their active
// frames. What a headless world needs of a figure, and nothing it draws.
export function describeFigure(spec, only = null) {
  const anims = animsFor(spec);
  if (only) {
    const name = `${only.anim}_${only.facing}_${only.frame}`;
    return { image: null, frames: { [name]: [0, 0, FW, FH] }, anchor: [FEET_X, FEET_Y], animations: { [only.anim]: anims[only.anim] }, facings: [only.facing], mirror: {}, one: name };
  }
  const frames = {};
  FACINGS.forEach((facing, row) => {
    let colIdx = 0;
    for (const anim of Object.keys(anims)) {
      for (let i = 0; i < anims[anim].frames; i++) {
        frames[`${anim}_${facing}_${i}`] = [colIdx * FW, row * FH, FW, FH];
        colIdx++;
      }
    }
  });
  return { image: null, frames, anchor: [FEET_X, FEET_Y], animations: anims, facings: [...FACINGS], mirror: {} };
}

// One frame of a figure on a sheet of its own (docs/19): a corpse holds the last
// frame of its fall in the facing it died in, and needs no sheet of a hundred
// and seventy-six frames, so a body can be redrawn as it is stripped.
function generateOneFrame(spec, { anim, frame: index, facing }) {
  const anims = animsFor(spec);
  const canvas = document.createElement("canvas");
  canvas.width = FW;
  canvas.height = FH;
  const f = new Frame();
  f.clear();
  const joints = drawFrame(f, spec, facing, anim, index);
  f.blit(canvas.getContext("2d"), 0, 0);
  const name = `${anim}_${facing}_${index}`;
  return {
    image: canvas,
    frames: { [name]: [0, 0, FW, FH] },
    anchor: [FEET_X, FEET_Y],
    animations: { [anim]: anims[anim] },
    facings: [facing],
    mirror: {},
    joints: { [name]: joints },
    partMaps: null,
  };
}

export { PART };
