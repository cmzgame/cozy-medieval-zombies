// The rig (docs/12): the frame's size, the facings, the animations and the attack keyframes as data, the body's
// proportions (BODY), the projection, and the poses with their joints. The numbers here are Michael's and change
// only when docs/12 says.
// Cut from src/figure.js on 2026-10-12 (docs/23a, D3): a move, no number changed; the sheets check proves the pixels.

export const FW = 48;
export const FH = 72;
export const FEET_X = 24;
export const FEET_Y = 66;
export const ISO = 0.5; // ground-plane foreshortening

export const FACINGS = ["s", "sw", "w", "nw", "n", "ne", "e", "se"];
export const FACING_ANGLE = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };

export const ANIMS = {
  idle: { fps: 2, loop: true, frames: 2 },
  walk: { fps: 8, loop: true, frames: 4 },
  attack: { fps: 12, loop: false, frames: 4, activeFrame: 1 },
  hurt: { fps: 10, loop: false, frames: 2 },
  die: { fps: 8, loop: false, frames: 4 },
  carry_idle: { fps: 2, loop: true, frames: 2 },
  carry_walk: { fps: 8, loop: true, frames: 4 },
  // The held-out pose (docs/32, item 1): one frame, the player's alone (the noCarry pattern), played while
  // eating or drinking; a book in the main hand takes its arm for the idle and the walk as well.
  present: { fps: 1, loop: true, frames: 1 },
};

// ---- the attack keyframes, as data (docs/14) ----
//
// data/poses.json, handed in through setPoses() before any sheet is made. A
// style is { fps, activeFrame, frames: [{ pitch, out, lean, bob, offPitch?,
// offOut? }] }: `pitch` is the main arm's forward angle (0 hanging, 180 straight
// up), `out` the main hand's lateral offset from its shoulder (negative
// across the body), `lean` and `bob` move the body, and `offPitch` and
// `offOut` pose the other arm when the style needs it (the dead use both).
// These defaults are what the file holds, so a missing file is not fatal.
const DEFAULT_POSES = {
  // The walk (docs/32, item 10): `stride` and `lift` per leg [left, right], `arms` the pitch per arm, `bob`
  // (positive down), `lean`, `headD`. These are the numbers the walk had in code until 2026-10-13.
  walk: {
    frames: [
      { stride: [4, -4], lift: [2, 0], arms: [-28, 28], bob: -1 },
      { stride: [0, 0], lift: [0, 0], arms: [0, 0], bob: 0 },
      { stride: [-4, 4], lift: [0, 2], arms: [28, -28], bob: -1 },
      { stride: [0, 0], lift: [0, 0], arms: [0, 0], bob: 0 },
    ],
  },
  throw: {
    fps: 12,
    activeFrame: 3,
    frames: [
      { pitch: -50, out: 3, lean: -0.5 },
      { pitch: -95, out: 4, lean: -1 },
      { pitch: -130, out: 5, lean: -1.5 },
      { pitch: 105, out: -4, lean: 2.5 },
    ],
  },
  bow: {
    fps: 12,
    activeFrame: 3,
    frames: [
      { pitch: 95, offPitch: 85, offOut: 2, lean: 0.5 },
      { pitch: 98, offPitch: 62, offOut: 4, lean: 1 },
      { pitch: 100, offPitch: 38, offOut: 6, lean: 1.5 },
      { pitch: 96, offPitch: 75, offOut: 3, lean: 0.5 },
    ],
  },
  one_handed: {
    fps: 12,
    activeFrame: 1,
    frames: [
      { pitch: -110, out: 4, lean: 0, bob: 0 },
      { pitch: 75, out: -2, lean: 2, bob: 0 },
      { pitch: 105, out: -6, lean: 2.5, bob: 1 },
      { pitch: 30, out: 0, lean: 1, bob: 0 },
    ],
  },
  // The held-out pose (docs/32, item 1): the main arm forward at chest height, the thing presented in front.
  present: { pitch: 90, out: 2, headD: 1 },
  // The halberd's thrust (docs/32, item 2), the second attack animation `attack_alt` of a weapon whose `alt`
  // names it: a draw back, the lunge (the active frame), held, and back. Both hands on the shaft (`offPitch`).
  thrust: {
    fps: 12,
    activeFrame: 1,
    frames: [
      { pitch: 20, out: 1, offPitch: 10, offOut: 1, lean: -1 },
      { pitch: 95, out: 0, offPitch: 80, offOut: 0.5, lean: 3, bob: 1 },
      { pitch: 90, out: 0, offPitch: 78, offOut: 0.5, lean: 2, bob: 1 },
      { pitch: 60, out: 1, offPitch: 50, offOut: 1, lean: 0.5 },
    ],
  },
  zombie: {
    fps: 12,
    activeFrame: 1,
    frames: [
      { pitch: 40, offPitch: 40, lean: 0 },
      { pitch: 95, offPitch: 90, lean: 2 },
      { pitch: 105, offPitch: 95, lean: 2.5 },
      { pitch: 60, offPitch: 55, lean: 1 },
    ],
  },
};
let POSES = DEFAULT_POSES;

// Replace the styles with those in a loaded file; a style the file lacks keeps its default.
export function setPoses(data) {
  POSES = { ...DEFAULT_POSES, ...(data || {}) };
}

export function poseStyles() {
  return Object.keys(POSES);
}

// The style a figure's attack uses: the spec's, else the dead's own or the one-handed swing.
export function styleFor(spec) {
  const fallback = spec.variant === "zombie" ? "zombie" : "one_handed";
  return spec.style && POSES[spec.style] ? spec.style : fallback;
}

// The animation table for a figure: the shared one, with the attack taking its
// speed, active frame, and length from the style, so a style may be longer.
export function animsFor(spec) {
  const st = POSES[styleFor(spec)];
  let out = ANIMS;
  if (st && st.frames && st.frames.length) out = { ...ANIMS, attack: { ...ANIMS.attack, fps: st.fps ?? ANIMS.attack.fps, activeFrame: st.activeFrame ?? ANIMS.attack.activeFrame, frames: st.frames.length } };
  // The main hand's other attack (docs/32, item 2): only on the sheet of a figure whose weapon's `alt` names a style,
  // so the atlas pays for the halberd's bearer alone.
  const alt = spec.altStyle && POSES[spec.altStyle];
  if (alt && alt.frames && alt.frames.length) out = { ...out, attack_alt: { fps: alt.fps ?? ANIMS.attack.fps, loop: false, frames: alt.frames.length, activeFrame: alt.activeFrame ?? ANIMS.attack.activeFrame } };
  // Only the player carries furniture: for everyone else the six carry frames are
  // left off, which makes the sheet 27 percent narrower and so five fit across the
  // atlas where three did (docs/19: the atlas is the budget).
  if (spec.noCarry) {
    const { carry_idle, carry_walk, present, ...rest } = out; // the held-out pose is the player's alone too (docs/32)
    out = rest;
  }
  return out;
}

// The chunky proportion (docs/12): the head about a third of the height,
// shoulders no wider than the head, limbs against the body.
export const BODY = {
  hip: 17, // heights above the feet (15 until 2026-10-12: Michael wanted the body a smidge smaller and the legs longer)
  shoulder: 28,
  neck: 30,
  head: 38, // centre; the top of the head is at about 48, so the head is two fifths of the height
  headRx: 8.5, // narrower than tall (Michael: too wide read as a scared frog)
  headRy: 9.5,
  shoulderL: 8, // lateral offsets; the shoulders stay inside the head's width
  hipL: 7,
  torsoD: 3, // forward half-thickness at the shoulders: the arm's width, so no neck block shows wider than the arm from the side (4 until 2026-10-12)
  hipD: 3.4, // a hair over the legs' radius, so the legs start inside the hips and never jut past them (3 until 2026-10-12)
  legL: 3.5,
  legR: 3.3, // limb radii
  armR: 2.9,
  armLen: 14,
  handR: 2.7,
  footRx: 4,
  footRy: 2.4,
};

export const OUTLINE = [26, 20, 32];
export const WHITE = [255, 255, 255];

// ---- poses ----

// A pose is the small set of numbers the keyframes change. Everything else
// comes from BODY. Angles in degrees; arm pitch is forward positive, 0 hanging,
// 180 straight up. Leg stride is the foot's forward offset.
function restPose() {
  return {
    bob: 0, // body down by this many px
    lean: 0, // whole upper body forward by this many body units
    armPitch: [0, 0], // [left, right]
    armOut: [1.5, 1.5], // lateral spread: hands hang beside the hips, not over them
    stride: [0, 0], // [left, right] forward offsets of the feet
    lift: [0, 0], // knee lift in height units
    headD: 0, // head forward
    crouch: 1, // scale on heights above the feet
    lying: false,
    flash: false,
    wrist: 0, // degrees the held thing is cocked up from the forearm in a swing (docs/32): the blade stays level as the arm drops
  };
}

// A hand that holds something raises its arm forward (Michael, 2026-10-10:
// not strapped to the side) and does not swing in the walk; the main hand
// still swings in the attack.
const HOLD_PITCH = 55;
const HOLD_OUT = 1.5;

export function pose(variant, anim, i, holding = { main: false, off: false }, style = null) {
  const p = restPose();
  const zombie = variant === "zombie";
  const swing = [1, 0, -1, 0][i % 4];
  switch (anim) {
    case "idle":
      p.bob = i === 1 ? 1 : 0;
      if (zombie) {
        p.armPitch = [60, 55];
        p.lean = 1.5;
        p.headD = 1;
      } else {
        p.armPitch = [i === 1 ? 2 : 0, i === 1 ? 2 : 0];
      }
      break;
    case "walk":
      if (zombie) {
        // The shamble: arms out, a lean, a short limping stride.
        p.armPitch = [80, 70];
        p.lean = 2;
        p.headD = 1;
        p.stride = [3 * swing, -1.5 * swing];
        p.lift = [swing > 0 ? 2 : 0, 0];
        p.bob = i % 2 === 0 ? 0 : 1;
      } else {
        // The walk's four keyframes are data (docs/32, item 10): contact, passing, contact, passing.
        const f = (POSES.walk || DEFAULT_POSES.walk).frames[i % 4];
        p.stride = [...f.stride];
        p.lift = [...f.lift];
        p.armPitch = [...f.arms];
        p.bob = f.bob ?? 0;
        p.lean = f.lean ?? 0;
        p.headD = f.headD ?? 0;
      }
      break;
    case "attack":
    case "attack_alt": {
      const f = (POSES[style || (zombie ? "zombie" : "one_handed")] || DEFAULT_POSES.one_handed).frames[i];
      if (f) {
        p.offOwn = f.offPitch != null; // the style moves the off arm itself (the bow's string hand): holding does not override it
        p.armPitch = [f.offPitch ?? 0, f.pitch];
        p.armOut = [f.offOut ?? p.armOut[0], f.out ?? p.armOut[1]];
        p.lean = f.lean ?? 0;
        p.bob = f.bob ?? 0;
        p.wrist = f.wrist ?? 0;
        p.headD = f.headD ?? 0;
      }
      break;
    }
    case "present":
      presentArm(p);
      p.headD = (POSES.present || DEFAULT_POSES.present).headD ?? 0;
      break;
    case "hurt":
      p.lean = -2;
      p.flash = i === 0;
      p.armPitch = [20, 20];
      break;
    case "die":
      if (i < 2) {
        p.crouch = [0.72, 0.42][i];
        p.lean = [1, 2][i];
        p.armPitch = [30, 30];
      } else {
        p.lying = true;
      }
      break;
    case "carry_idle":
      p.bob = i === 1 ? 1 : 0;
      p.armPitch = [170, 170];
      p.armOut = [2, 2];
      break;
    case "carry_walk":
      p.stride = [4 * swing, -4 * swing];
      p.lift = [swing > 0 ? 2 : 0, swing < 0 ? 2 : 0];
      p.armPitch = [170, 170];
      p.armOut = [2, 2];
      p.bob = i % 2 === 0 ? -1 : 0;
      break;
  }
  // Holding: the arm comes forward and stays there, except the main arm in
  // the attack and both arms when carrying or dying.
  const fixed = anim === "die" || anim.startsWith("carry");
  if (holding.off && !fixed && !p.offOwn) {
    p.armPitch[0] = HOLD_PITCH;
    p.armOut[0] = HOLD_OUT;
  }
  const swinging = anim === "attack" || anim === "attack_alt";
  if (holding.main && !fixed && !swinging && anim !== "present") {
    // A thing held out by its nature (the book: `held.pose: "present"`, docs/32 item 1) is presented in the idle
    // and the walk; anything else is held forward at the hold's pitch.
    if (holding.mainPose === "present") presentArm(p);
    else {
      p.armPitch[1] = HOLD_PITCH;
      p.armOut[1] = HOLD_OUT;
    }
  }
  return p;
}

// The main arm held out in front at chest height (docs/32, item 1), from the poses data.
function presentArm(p) {
  const f = POSES.present || DEFAULT_POSES.present;
  p.armPitch[1] = f.pitch ?? 90;
  p.armOut[1] = f.out ?? 2;
}

// The joints of a pose in body coordinates (l, d, h).
export function joints(p) {
  const B = BODY;
  const c = p.crouch;
  const lean = p.lean;
  const j = {};
  if (p.lying) {
    // On the ground, face down, head forward of the hips.
    j.hipL = [-B.legL, 0, 3];
    j.hipR = [B.legL, 0, 3];
    j.footL = [-B.legL - 1, -13, 2];
    j.footR = [B.legL + 1, -12, 2];
    j.shoulderL = [-B.shoulderL, 13, 4];
    j.shoulderR = [B.shoulderL, 13, 4];
    j.handL = [-B.shoulderL - 4, 22, 2];
    j.handR = [B.shoulderL + 4, 20, 2];
    j.neck = [0, 15, 4];
    j.head = [0, 22, 5];
    j.hip = [0, 0, 3];
    return j;
  }
  const hipH = B.hip * c - p.bob;
  const shH = B.shoulder * c - p.bob;
  j.hip = [0, 0, hipH];
  j.hipL = [-B.legL, 0, hipH];
  j.hipR = [B.legL, 0, hipH];
  j.footL = [-B.legL, p.stride[0], p.lift[0]];
  j.footR = [B.legL, p.stride[1], p.lift[1]];
  j.shoulderL = [-B.shoulderL, lean, shH];
  j.shoulderR = [B.shoulderL, lean, shH];
  j.neck = [0, lean, B.neck * c - p.bob];
  j.head = [0, lean + p.headD, B.head * c - p.bob];
  const arm = (sh, pitch, out, side) => {
    const a = (pitch * Math.PI) / 180;
    return [sh[0] + out * side, sh[1] + Math.sin(a) * B.armLen, sh[2] - Math.cos(a) * B.armLen];
  };
  j.handL = arm(j.shoulderL, p.armPitch[0], p.armOut[0], -1);
  j.handR = arm(j.shoulderR, p.armPitch[1], p.armOut[1], 1);
  return j;
}
