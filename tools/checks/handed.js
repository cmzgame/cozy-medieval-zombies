// Handedness (Michael, 2026-10-25): right- or left-handed, chosen once on the identity screen, stamped on the character
// (`player.handed`), never ambidextrous, right by default. Visual and a label alone: the character screen's hand slots say which
// hand is which, the belt's icons (the belt-roles PR) read the same helper (`handed.js` handSideOf), and the figure draws the main
// hand's thing in the left arm of a left-handed character with every pose on that side; the sim, combat, the belt, and the mouse
// buttons stay main and off. From the console, on a tab with `?nosave&mute`:
//   await __game.check("handed")
// Solo: the default; the identity screen's choice read on the page and saved with the identity; the character screen's labels and
// the hand slots' places, right and left; the sheets, a left-handed figure's main and off joints the right-handed one's mirrored
// (within a pixel or two) in the idle, the main swing, the off hand's swing, the thrust, the held-out pose, and the wave, facing
// s, n, and each side against its mirror; the right-handed sheet the same pixels with the field and without it; the world's own
// sheet following `setHanded`. Everything it changes is put back.
// Two tabs (`?nosave&mute&relay=none` on both; the guest's URL adds `&as=Lefty&handed=left`, so its identity is left-handed and its
// join carries it): `{ guest: true }` on the guest reads its own player left-handed, its own character screen's labels, and the
// host's player on its replica; `{ host: true }` on the host reads every other player's hand and the side its sheet draws the main
// hand on. Then `check("sync")` on the host after both tabs have stepped (the players' part carries the hand).

const MIRROR = { s: "s", n: "n", se: "sw", sw: "se", e: "w", w: "e", ne: "nw", nw: "ne" };

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const H = await import("/src/handed.js");
  const me = G.player;
  const side = (sheet, frame) => {
    const j = sheet && sheet.joints && sheet.joints[frame];
    return j && j.main ? (j.main.x > 0 ? "left" : j.main.x < 0 ? "right" : "middle") : "none"; // facing s, the figure's right is the screen's left
  };
  const sheetOf = (p) => { try { return G.assets.getSheet(p.sprite); } catch { return null; } };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const sideOnPanel = async (who) => {
    const panel = G.panel;
    const was = panel.isCharacter();
    panel.setCharacterOpen(true);
    panel.renderInventoryPanel(who, G.inventory.bagOf(who), null, G.inventory.beltOf(who));
    await wait(0);
    const main = document.querySelector(".doll-slot[data-slot='hand:main']");
    const off = document.querySelector(".doll-slot[data-slot='hand:off']");
    const out = { main: main ? main.dataset.label : null, off: off ? off.dataset.label : null, mainArea: main ? main.getAttribute("style") : null, offArea: off ? off.getAttribute("style") : null, mainText: main ? main.textContent.trim() : null };
    panel.setCharacterOpen(was);
    return out;
  };

  // ---- two tabs ----
  if (opts.guest) {
    const P = G.player;
    row("this guest's own player is left-handed, from the join (`&handed=left`)", P && P.handed === "left", `${P && P.id} ${P && P.handed}`);
    const labels = await sideOnPanel(P);
    row("this guest's own character screen calls its left hand the main hand", labels.main === "Main hand (left)" && labels.off === "Off-hand (right)" && /grid-area:\s*off/.test(labels.mainArea || ""), JSON.stringify(labels));
    row("this guest's own sheet draws the main hand on the left arm (idle, facing the camera)", side(sheetOf(P), "idle_s_0") === "left", `${P.sprite}: ${side(sheetOf(P), "idle_s_0")}`);
    const others = G.game.state.players.filter((q) => q !== P);
    row("the host's player on the replica keeps its own hand, and is drawn by it", others.length > 0 && others.every((q) => side(sheetOf(q), "idle_s_0") === H.handSideOf(q, "main")), others.map((q) => `${q.id} ${q.handed} drawn ${side(sheetOf(q), "idle_s_0")}`).join(", ") || "no other player");
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  }
  if (opts.host) {
    const others = G.game.state.players.filter((q) => q !== me);
    row("a guest joined left-handed is left-handed on the host", others.some((q) => q.handed === "left"), others.map((q) => `${q.id} ${q.name} ${q.handed}`).join(", ") || "no guest");
    row("and the host's replica draws each guest by its hand (the main hand's joint on that side, idle, facing the camera)", others.length > 0 && others.every((q) => side(sheetOf(q), "idle_s_0") === H.handSideOf(q, "main")), others.map((q) => `${q.sprite} ${side(sheetOf(q), "idle_s_0")}`).join(", "));
    row("the host stays right-handed", H.handedOf(me.handed) === "right", me.handed);
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  }

  // ---- solo ----
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const handed0 = me.handed;
  const screen0 = G.screens.currentScreen();
  const ids0 = G.identities.list().map((i) => i.id);
  const wasPaused = G.loop.isPaused();
  try {
    G.loop.setPaused(true);
    // The default.
    const extra = G.game.addPlayer(me.gx + 1, me.gy, {});
    row("the default is right-handed: a player made with no choice", extra.handed === "right" && H.handSideOf(extra, "main") === "right", extra.handed);
    G.game.removePlayer(extra.id);
    row("the world's own player is right-handed (this page's identity chose nothing else)", new URLSearchParams(location.search).get("handed") === "left" || H.handedOf(me.handed) === "right", me.handed);

    // The identity screen: the choice on the page, right by default, saved with the identity.
    G.screens.show("identities");
    await wait(0);
    const newBtn = document.querySelector("button[data-go='identity-new']");
    newBtn && newBtn.click();
    await wait(0);
    const sel = document.querySelector("select[data-handed]");
    const opts0 = sel ? [...sel.options].map((o) => `${JSON.parse(o.value)}:${o.textContent}`) : [];
    row("the identity screen offers Right-handed and Left-handed, and nothing else (never ambidextrous)", G.screens.currentScreen() === "identity" && opts0.join() === "right:Right-handed,left:Left-handed", opts0.join(", ") || "no choice on the page");
    row("the choice starts at Right-handed", !!sel && JSON.parse(sel.value) === "right", sel ? sel.value : "none");
    const name = document.querySelector("input[data-name]");
    if (name) { name.value = "Lefty Check"; name.dispatchEvent(new Event("input", { bubbles: true })); }
    if (sel) { sel.value = JSON.stringify("left"); sel.dispatchEvent(new Event("change", { bubbles: true })); }
    await wait(0);
    const sel2 = document.querySelector("select[data-handed]");
    row("picked, it reads Left-handed after the redraw", !!sel2 && JSON.parse(sel2.value) === "left", sel2 ? sel2.value : "none");
    const save = document.querySelector("button[data-go='identity-save']");
    save && save.click();
    await wait(0);
    const made = G.identities.list().find((i) => !ids0.includes(i.id));
    row("saved, the identity is left-handed", !!made && made.handed === "left" && made.name === "Lefty Check", made ? JSON.stringify({ name: made.name, handed: made.handed }) : "no identity made");
    const rowText = [...document.querySelectorAll(".row-item")].map((e) => e.textContent).find((t) => /Lefty Check/.test(t)) || "";
    row("the identities list says it: left-handed", /left-handed/.test(rowText), rowText.replace(/\s+/g, " ").trim().slice(0, 80));
    if (made) {
      const editBtn = document.querySelector(`button[data-go='identity-edit'][data-identity='${made.id}']`);
      editBtn && editBtn.click();
      await wait(0);
      const sel3 = document.querySelector("select[data-handed]");
      row("editing it shows its choice (a character already made keeps its own)", !!sel3 && JSON.parse(sel3.value) === "left", sel3 ? sel3.value : "none");
      const cancel = document.querySelector("button[data-go='identity-cancel']");
      cancel && cancel.click();
      await wait(0);
    }
    row("an identity made with no choice is right-handed", G.identities.add({ name: "Righty Check", look: {} }).handed === "right", "identities.add");

    // The character screen: the labels and the places, right and left.
    G.screens.hide();
    me.handed = "right";
    const r = await sideOnPanel(me);
    row("right-handed: Main hand (right) in the doll's left column, Off-hand (left) in its right", r.main === "Main hand (right)" && r.off === "Off-hand (left)" && /grid-area:\s*main/.test(r.mainArea || "") && /grid-area:\s*off/.test(r.offArea || ""), JSON.stringify(r));
    me.handed = "left";
    const l = await sideOnPanel(me);
    row("left-handed: Main hand (left) in the doll's right column, Off-hand (right) in its left", l.main === "Main hand (left)" && l.off === "Off-hand (right)" && /grid-area:\s*off/.test(l.mainArea || "") && /grid-area:\s*main/.test(l.offArea || ""), JSON.stringify(l));
    me.handed = handed0;

    // The sheets: a sword in each hand, baked right- and left-handed.
    me.hands.main = G.items.makeEntry("sword", 1);
    me.hands.off = G.items.makeEntry("sword", 1);
    const F = G.figure;
    const bake = (handed, extraIn = {}) => F.generateFigure(F.characterSpec(F.characterInputs({ ...me, handed }, undefined, {}, null, { offStyle: "one_handed", ...extraIn })));
    const R = bake("right");
    const L = bake("left");
    const near = (a, b) => a && b && Math.abs(a.x + b.x) <= 2 && Math.abs(a.y - b.y) <= 1 && a.near === b.near;
    const misses = [];
    let compared = 0;
    for (const anim of ["idle", "walk", "attack", "attack_off", "present", "wave"]) {
      const n = R.animations[anim] ? R.animations[anim].frames : 0;
      for (let i = 0; i < n; i++) {
        for (const facing of Object.keys(MIRROR)) {
          const a = R.joints[`${anim}_${facing}_${i}`];
          const b = L.joints[`${anim}_${MIRROR[facing]}_${i}`];
          if (!a || !b) { misses.push(`${anim}_${facing}_${i} missing`); continue; }
          if (anim === "walk") { if (!near(a.main, b.main)) misses.push(`walk_${facing}_${i} main ${a.main.x},${a.main.y} vs ${b.main.x},${b.main.y}`); } // the walk's free arm swings with the legs, by side
          else if (!near(a.main, b.main) || !near(a.off, b.off)) misses.push(`${anim}_${facing}_${i} main ${a.main.x},${a.main.y} vs ${b.main.x},${b.main.y}; off ${a.off.x},${a.off.y} vs ${b.off.x},${b.off.y}`);
          compared++;
        }
      }
    }
    row("a left-handed figure's main and off hands are the right-handed one's mirrored, facing each way against its mirror, within a pixel or two: idle, the walk's held arm, the main swing, the off hand's swing, the held-out pose, the wave", compared > 100 && misses.length === 0, `${compared} frames; ${misses.slice(0, 4).join(" | ") || "every one mirrored"}`);
    row("facing the camera, the right-handed main hand is on the screen's left and the left-handed one's on its right (idle and the swing's active frame)", side(R, "idle_s_0") === "right" && side(L, "idle_s_0") === "left" && side(R, "attack_s_1") === "right" && side(L, "attack_s_1") === "left", `${side(R, "idle_s_0")}/${side(L, "idle_s_0")}, ${side(R, "attack_s_1")}/${side(L, "attack_s_1")}`);
    const RT = bake("right", { altStyle: "thrust" });
    const LT = bake("left", { altStyle: "thrust" });
    const thrustOk = [0, 1, 2, 3].every((i) => near(RT.joints[`attack_alt_se_${i}`].main, LT.joints[`attack_alt_sw_${i}`].main) && near(RT.joints[`attack_alt_se_${i}`].off, LT.joints[`attack_alt_sw_${i}`].off));
    row("the halberd's thrust mirrors too", thrustOk, `attack_alt se/sw`);
    // The default is the drawing it always was: a right-handed character's sheet is the same pixels as one with no field at all.
    const px = (sheet) => { const c = sheet.image; const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data; let h = 2166136261; for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619); return (h >>> 0).toString(16); };
    const plainCh = { ...me };
    delete plainCh.handed;
    const plain = F.generateFigure(F.characterSpec(F.characterInputs(plainCh, undefined, {}, null, { offStyle: "one_handed" })));
    row("the right-handed sheet is the same pixels and key as a character with no hand at all; the left-handed one differs in both", px(R) === px(plain) && px(L) !== px(R) && F.specKey(F.characterSpec(F.characterInputs({ ...me, handed: "right" }))) === F.specKey(F.characterSpec(F.characterInputs(plainCh))) && F.specKey(F.characterSpec(F.characterInputs({ ...me, handed: "left" }))) !== F.specKey(F.characterSpec(F.characterInputs(plainCh))), `right ${px(R)}, none ${px(plain)}, left ${px(L)}`);

    // The world's own sheet follows the player's hand.
    G.setHanded("left");
    const worldLeft = side(sheetOf(me), "idle_s_0");
    G.setHanded("right");
    const worldRight = side(sheetOf(me), "idle_s_0");
    row("the world's own sheet follows the hand (setHanded rebakes it)", worldLeft === "left" && worldRight === "right", `${me.sprite}: left ${worldLeft}, right ${worldRight}`);
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    try { G.setHanded(handed0 || "right"); } catch { me.handed = handed0; }
    for (const i of G.identities.list()) if (!ids0.includes(i.id)) G.identities.remove(i.id);
    if (screen0) G.screens.show(screen0);
    else G.screens.hide();
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
