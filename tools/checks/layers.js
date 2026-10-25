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
  // Every painted slot dyed by its entry (docs/43 section 8): an item whose art names a painted layer and `keys`, a pair of key tones per region,
  // is recoloured region by region: the light key becomes the entry's colour, the dark key its shade (draw.js SHADE_DYE, 0.16), and a tone that
  // is no key is kept; undyed, the painting keeps its keys. One throwaway layer and item per slot, read at exact pixels of idle_s_0: a substitution
  // part's pixels are found inside the generated part (the bare figure's part map), a free part's beside its joint.
  const raster = await import("/src/figure/raster.js");
  const shadeOf = (hex) => "#" + raster.tone(raster.hexToRgb(hex), -0.16).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const KL = "#c0a080", KD = "#806040", K2L = "#4080c0", K2D = "#205080", KEEP = "#f0f0f0";
  const bareMap = F.generateFigure({ ...F.playerSpec(look, {}, artOf), partMaps: true });
  const pmap = bareMap.partMaps.idle_s_0;
  const BJ = bareMap.joints.idle_s_0;
  const FW = F.FW;
  // Four pixels in a row deep inside a generated part (its neighbours above and below the same part), nearest its middle.
  const inside = (partId) => {
    const all = [];
    for (let y = 1; y < F.FH - 1; y++) for (let x = 1; x < FW - 4; x++) {
      let ok = true;
      for (let k = -1; k <= 4 && ok; k++) for (const dy of [-1, 0, 1]) if (pmap[(y + dy) * FW + x + k] !== partId) ok = false;
      if (ok) all.push([x, y]);
    }
    if (!all.length) return null;
    const mx = all.reduce((s, p) => s + p[0], 0) / all.length, my = all.reduce((s, p) => s + p[1], 0) / all.length;
    return all.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my))[0];
  };
  const at = (j) => [Math.round(F.FEET_X + j.x), Math.round(F.FEET_Y + j.y)];
  const P_TORSO = 3, P_LEGL = 1;
  const slots = [
    { slot: "chest", part: "torso", wear: "chest", shape: "tunic", anchor: at(BJ.neck), spot: inside(P_TORSO), two: true },
    { slot: "waist", part: "torso", wear: "waist", shape: "belt", anchor: at(BJ.neck), spot: inside(P_TORSO) },
    { slot: "legs", part: "legL", wear: "legs", shape: "breeches", anchor: at(BJ.hipL), spot: inside(P_LEGL) },
    { slot: "feet", part: "footR", wear: "feet", shape: "boots", anchor: at(BJ.footR), spot: [at(BJ.footR)[0] + 1, at(BJ.footR)[1] + 1] },
    { slot: "hands", part: "handR", wear: "hands", shape: "gloves", anchor: at(BJ.handR), spot: [at(BJ.handR)[0] + 2, at(BJ.handR)[1]] },
    { slot: "head", part: "head", wear: "head", shape: "hood", anchor: at(BJ.head), spot: [at(BJ.head)[0] - 1, at(BJ.head)[1] - 14] },
  ];
  for (const s of slots) {
    if (!s.spot) { rows.push({ check: `a painted ${s.slot} layer is dyed by its key tones`, result: "FAIL", detail: "no pixel inside the part" }); continue; }
    const [sx, sy] = s.spot;
    const off = (k) => [sx + k - s.anchor[0], sy - s.anchor[1]];
    const tones = s.two ? [KL, KD, K2L, K2D, KEEP] : [KL, KD, KEEP];
    const name = `zz_key_${s.slot}`;
    F.registerLayer(s.slot, name, { parts: { [s.part]: { s: tones.map((c, k) => [...off(k), c]) } }, options: {} });
    const id = `zz_keyed_${s.slot}`;
    const keys = s.two ? [[KL, KD], [K2L, K2D]] : [[KL, KD]];
    const artKeyed = (q) => (q === id ? { shape: s.shape, colours: s.two ? [KL, K2L] : [KL], painted: name, keys } : artOf(q));
    const dyedTo = s.two ? ["#aa2222", "#22aa44"] : ["#aa2222"];
    const sheetDyed = F.generateFigure(F.playerSpec(look, { [s.wear]: { id, count: 1, colours: dyedTo } }, artKeyed));
    const sheetOwn = F.generateFigure(F.playerSpec(look, { [s.wear]: { id, count: 1 } }, artKeyed));
    const got = tones.map((_, k) => pxAt(sheetDyed, "idle_s_0", sx + k, sy));
    const own = tones.map((_, k) => pxAt(sheetOwn, "idle_s_0", sx + k, sy));
    const want = s.two ? [dyedTo[0], shadeOf(dyedTo[0]), dyedTo[1], shadeOf(dyedTo[1]), KEEP] : [dyedTo[0], shadeOf(dyedTo[0]), KEEP];
    rows.push({ check: `a painted ${s.slot} layer is dyed by its key tones${s.two ? ", two regions each its own" : ""}, a tone that is no key kept`, result: got.join() === want.join() ? "pass" : "FAIL", detail: `got ${got.join(" ")}, want ${want.join(" ")}` });
    rows.push({ check: `undyed, the painted ${s.slot} layer keeps its keys`, result: own.join() === tones.join() ? "pass" : "FAIL", detail: own.join(" ") });
  }
  // The onion hat now names its keys: dyed by the keys it draws exactly as it did by its two tones (the wardrobes' dyed hoods unchanged).
  const hoodKeys = (artOf("hood") || {}).keys;
  const viaKeys = coloursOf(F.generateFigure(F.playerSpec(look, { head: { id: "hood", count: 1, colour: "#b08a3e" } }, artOf)));
  const viaTones = coloursOf(F.generateFigure(F.playerSpec(look, { head: { id: "hood", count: 1, colour: "#b08a3e" } }, (q) => (q === "hood" ? { ...artOf("hood"), keys: undefined } : artOf(q)))));
  rows.push({ check: "the onion hat's keys are its two greens, and dyed by them it draws as by its two tones", result: JSON.stringify(hoodKeys) === JSON.stringify([["#5f8a3a", "#46682a"]]) && [...viaKeys].sort().join() === [...viaTones].sort().join() ? "pass" : "FAIL", detail: `${JSON.stringify(hoodKeys)}; ${viaKeys.size} and ${viaTones.size} colours` });
  return { rows, fails: rows.filter((r) => r.result === "FAIL").length };
}
