// The painted layers' rules (docs/25, docs/23 step 3a): a layer that covers
// the legs hides the leg garment and leaves the feet; a hair layer with the
// dye option takes the wearer's hair colour in two tones, the outline kept.
// From the console: await __game.check("layers"). It registers throwaway
// layers and bakes figures off to the side; the game's own sheets are untouched.

export async function run(game) {
  const G = game;
  const F = G.figure;
  const rows = [];
  const artOf = (id) => (G.items.getItem(id) || {}).art || null;
  const look = { ...F.DEFAULT_LOOK, hairStyle: "bald" };
  const pxAt = (sheet, frame, x, y) => {
    const f = sheet.frames[frame];
    const d = sheet.image.getContext("2d").getImageData(f[0] + x, f[1] + y, 1, 1).data;
    return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
  };
  // A leg pixel: a little below the hip joint on the left leg, facing south.
  const bare = F.generateFigure(F.playerSpec(look, {}, artOf));
  const J = bare.joints.idle_s_0;
  const lx = Math.round(F.FEET_X + J.hipL.x);
  const ly = Math.round(F.FEET_Y + J.hipL.y) + 10; // the thigh: the rows nearer the hip are the torso's hem
  const fx = Math.round(F.FEET_X + J.footL.x);
  const fy = Math.round(F.FEET_Y + J.footL.y) - 1;
  // One garment per question: the boots' seam would sit on the leg's sample row.
  const legsWorn = { legs: { id: "breeches", count: 1 } };
  const feetWorn = { feet: { id: "boots", count: 1 } };
  const legColour = pxAt(F.generateFigure(F.playerSpec(look, legsWorn, artOf)), "idle_s_0", lx, ly);
  const bootColour = pxAt(F.generateFigure(F.playerSpec(look, feetWorn, artOf)), "idle_s_0", fx, fy);
  // A chest layer of one pixel that says it covers the legs.
  F.registerLayer("chest", "zz_dress", { parts: { torso: { s: [[0, 2, "#aa3355"]] } }, options: { covers: ["legs"] } });
  const legUnderDress = pxAt(F.generateFigure(F.playerSpec(look, legsWorn, artOf, null, { chest: "zz_dress" })), "idle_s_0", lx, ly);
  const bootUnderDress = pxAt(F.generateFigure(F.playerSpec(look, feetWorn, artOf, null, { chest: "zz_dress" })), "idle_s_0", fx, fy);
  const skin = pxAt(bare, "idle_s_0", lx, ly);
  rows.push({ check: "the breeches colour the leg; a layer that covers the legs hides them", result: legColour !== skin && legUnderDress === skin ? "pass" : "FAIL", detail: `bare ${skin}, breeches ${legColour}, under the dress ${legUnderDress}` });
  rows.push({ check: "the shoes still show under the dress", result: bootUnderDress === bootColour && bootColour !== skin ? "pass" : "FAIL", detail: `boots ${bootColour}, under the dress ${bootUnderDress}` });
  // A two-tone hair layer with the dye option, worn with red hair.
  const hx = Math.round(F.FEET_X + J.head.x);
  const hy = Math.round(F.FEET_Y + J.head.y) - 6;
  F.registerLayer("hair", "zz_dye", { parts: { head: { s: [[0, -6, "#c0c0c0"], [1, -6, "#606060"], [2, -6, "#1a1420"]] } }, options: { dye: true } });
  const red = F.generateFigure(F.playerSpec({ ...look, hair: "#ff0000", hairStyle: "zz_dye" }, {}, artOf));
  const light = pxAt(red, "idle_s_0", hx, hy);
  const dark = pxAt(red, "idle_s_0", hx + 1, hy);
  const line = pxAt(red, "idle_s_0", hx + 2, hy);
  rows.push({ check: "a dyed hair layer's lightest tone becomes the hair colour", result: light === "#ff0000" ? "pass" : "FAIL", detail: light });
  rows.push({ check: "its other tone becomes the darker shade of it", result: dark !== "#ff0000" && dark !== "#606060" && parseInt(dark.slice(1, 3), 16) > 0x80 ? "pass" : "FAIL", detail: dark });
  rows.push({ check: "the outline colour is kept", result: line === "#1a1420" ? "pass" : "FAIL", detail: line });
  F.registerLayer("hair", "zz_plain", { parts: { head: { s: [[0, -6, "#c0c0c0"]] } }, options: {} });
  const plain = F.generateFigure(F.playerSpec({ ...look, hair: "#ff0000", hairStyle: "zz_plain" }, {}, artOf));
  rows.push({ check: "a layer without the option keeps its painted colour", result: pxAt(plain, "idle_s_0", hx, hy) === "#c0c0c0" ? "pass" : "FAIL", detail: pxAt(plain, "idle_s_0", hx, hy) });
  // The onion hat (2026-10-18): the hood's painted layer, its greens on the player, dyed like hair on a dyed hood, and
  // worn by the dead too. Colours are read over every facing's idle frame.
  const coloursOf = (sheet) => {
    const seen = new Set();
    const ctx = sheet.image.getContext("2d");
    for (const f of ["s", "sw", "w", "nw", "n", "ne", "e", "se"].map((d) => sheet.frames[`idle_${d}_0`])) {
      const d = ctx.getImageData(f[0], f[1], f[2], f[3]).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) seen.add("#" + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join(""));
    }
    return seen;
  };
  const hoodArt = artOf("hood") || {};
  const hasOnion = !!F.getLayer("head", "onion");
  rows.push({ check: "the hood names the painted onion and it is loaded", result: hoodArt.painted === "onion" && hasOnion ? "pass" : "FAIL", detail: `painted ${hoodArt.painted}, loaded ${hasOnion}` });
  const ownSpec = F.playerSpec(look, { head: { id: "hood", count: 1 } }, artOf);
  const own = coloursOf(F.generateFigure(ownSpec));
  rows.push({ check: "worn in its own colours the hat keeps its two greens", result: ownSpec.painted.head && ownSpec.painted.head.name === "onion" && own.has("#5f8a3a") && own.has("#46682a") ? "pass" : "FAIL", detail: `${own.has("#5f8a3a")} ${own.has("#46682a")}` });
  const dyedSet = coloursOf(F.generateFigure(F.playerSpec(look, { head: { id: "hood", count: 1, colour: "#b08a3e" } }, artOf)));
  rows.push({ check: "a dyed hood is dyed like hair: the entry's colour, no green left", result: dyedSet.has("#b08a3e") && !dyedSet.has("#5f8a3a") && !dyedSet.has("#46682a") ? "pass" : "FAIL", detail: `${dyedSet.has("#b08a3e")} ${dyedSet.has("#5f8a3a")} ${dyedSet.has("#46682a")}` });
  const zSpec = F.characterSpec(F.characterInputs({ kind: "zombie", look: F.DEFAULT_LOOK, worn: { head: { id: "hood", count: 1, colour: "#705848" } }, wardrobe: 0 }, artOf));
  const zSet = coloursOf(F.generateFigure(zSpec));
  rows.push({ check: "one of the dead in a hood draws the onion in its own dye", result: zSpec.painted.head && zSpec.painted.head.name === "onion" && zSet.has("#705848") && !zSet.has("#5f8a3a") ? "pass" : "FAIL", detail: `${zSpec.painted.head && zSpec.painted.head.name} ${zSet.has("#705848")}` });
  // A painted hat of three tones (a straw hat's kind) is not hair: it keeps every tone, worn in its own colour or dyed.
  const three = ["#d0c080", "#907040", "#503018"];
  F.registerLayer("head", "zz_three", { parts: { head: { s: three.map((c, i) => [i, -12, c]) } }, options: {} });
  const artThree = (id) => (id === "zz_hat" ? { shape: "hood", colours: ["#888888"], painted: "zz_three" } : artOf(id)); // an item colour none of its tones is, as a delivered hat's may be
  for (const [label, entry] of [["worn undyed", { id: "zz_hat", count: 1 }], ["dyed", { id: "zz_hat", count: 1, colour: "#3355aa" }]]) {
    const set = coloursOf(F.generateFigure(F.playerSpec(look, { head: entry }, artThree)));
    rows.push({ check: `a three-tone painted hat ${label} keeps all three tones`, result: three.every((c) => set.has(c)) && !set.has("#3355aa") ? "pass" : "FAIL", detail: three.map((c) => set.has(c)).join(" ") });
  }
  return { rows, fails: rows.filter((r) => r.result === "FAIL").length };
}
