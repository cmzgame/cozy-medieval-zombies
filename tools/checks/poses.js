// The poses the game lacked (docs/32): what each item adds to the sheets and when it plays. From the console,
// on a fresh boot:
//   await __game.check("poses")
// Items 1 and 2 so far: the held-out pose (`present`, the player's alone; a book in the main hand presents in
// the idle and the walk; eating and drinking present for `presentTime`) and the halberd's thrust (`attack_alt`
// from the `thrust` style, only on the sheet of a figure whose weapon's `alt` names it). It pauses the loop,
// puts things in the player's hands, and gives back what was there.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const p = G.player;
  const hands0 = { main: p.hands.main, off: p.hands.off };
  const hunger0 = p.hunger;
  const survival0 = G.rules.rules.survival;
  const assets = await import("/src/assets.js");
  const combat = await import("/src/combat.js");
  const { eat } = await import("/src/entities/player.js");
  const step = (n = 1) => { const out = []; for (let i = 0; i < n; i++) { G.loop.advance(1 / 60); out.push(p.anim.name); } return out; };
  const sheet = () => assets.getSheet(p.sprite);
  const hold = (id) => {
    const e = id ? G.items.makeEntry(id, 1) : null;
    const def = id ? G.items.getItem(id) : null;
    p.hands.main = e;
    p.hands.off = def && def.hands === "both" ? e : null;
    step(2); // the sheet follows the hands at the next step (main.js refreshFigure)
  };
  try {
    G.loop.setPaused(true);
    // 1. The held-out pose: one frame on the player's sheet, none on the dead's or a villager's.
    hold(null);
    const mine = sheet().animations.present;
    const z = G.zombies.find((q) => !q.corpse);
    const v = G.villagers[0];
    const zHas = z ? !!assets.getSheet(z.sprite).animations.present : false;
    const vHas = v ? !!assets.getSheet(v.sprite).animations.present : false;
    row("the held-out pose is on the player's sheet alone", !!mine && mine.frames === 1 && !zHas && !vHas, `player ${mine ? mine.frames + " frame" : "none"}, a zombie ${zHas}, a villager ${vHas}`);
    // 2. A book in the main hand presents in the idle and the walk; a sword is held at the hold's pitch.
    const book = G.figure.pose("player", "idle", 0, { main: true, off: false, mainPose: "present" }).armPitch[1];
    const walkBook = G.figure.pose("player", "walk", 1, { main: true, off: false, mainPose: "present" }).armPitch[1];
    const sword = G.figure.pose("player", "idle", 0, { main: true, off: false }).armPitch[1];
    const presentPitch = G.figure.pose("player", "present", 0).armPitch[1];
    hold("book_of_fire");
    const bookItem = G.items.getItem("book_of_fire").held.pose === "present";
    row("a book in the main hand is presented in the idle and the walk", bookItem && book === presentPitch && walkBook === presentPitch && sword !== presentPitch, `the book's arm ${book} idle and ${walkBook} walking, the present pose ${presentPitch}, a sword's ${sword}`);
    // 3. Eating presents for presentTime, standing, then the idle.
    hold(null);
    p.hunger = 0; // a hungry body, with the world's Survival on, as in play
    G.rules.rules.survival = true;
    eat(p, G.items.getItem("bread") || { hunger: 0 });
    const ate = step(60);
    const shown = ate.filter((a) => a === "present").length / 60;
    row("eating holds the pose out for its time, then the idle", Math.abs(shown - G.tuning.player.presentTime) <= 2 / 60 && ate[ate.length - 1] === "idle", `present for ${shown.toFixed(2)} s against ${G.tuning.player.presentTime}`);
    // 4. The halberd's bearer has the thrust; a sword's bearer does not.
    hold("sword");
    const swordAlt = !!sheet().animations.attack_alt;
    const swordWidth = sheet().image ? sheet().image.width : 0;
    hold("halberd");
    const alt = sheet().animations.attack_alt;
    const halberdWidth = sheet().image ? sheet().image.width : 0;
    // The sheet keeps room for the thrust, so picking the halberd up never outgrows its atlas slot (a grown sheet once
    // painted over the newest body's frame: a standing player where a zombie died; Michael's playtest, 2026-10-14).
    row("picking up the halberd keeps the player's sheet the same size", swordWidth > 0 && swordWidth === halberdWidth, `${swordWidth} px with a sword, ${halberdWidth} px with the halberd`);
    const style = G.figure.poseStyles().includes("thrust");
    row("the thrust is on the halberd bearer's sheet alone", !!alt && alt.frames === 4 && alt.activeFrame === 1 && !swordAlt && style, alt ? `${alt.frames} frames at ${alt.fps} fps, active ${alt.activeFrame}; a sword's sheet ${swordAlt ? "has it" : "has none"}` : "none on the halberd's sheet");
    // 5. The middle button's attack plays the thrust and the left's the swing, each back to the idle.
    p.attackCooldown = 0;
    p.swingLock = 0;
    combat.tryAttack(p, [], "main", "alt");
    const thrust = step(40);
    p.attackCooldown = 0;
    combat.tryAttack(p, [], "main");
    const swing = step(40);
    const count = (a, n) => a.filter((x) => x === n).length;
    row("the thrust plays attack_alt and the swing attack, each to the end", count(thrust, "attack_alt") >= 18 && thrust[thrust.length - 1] === "idle" && count(swing, "attack") >= 18 && !swing.includes("attack_alt"), `thrust ${count(thrust, "attack_alt")} steps, swing ${count(swing, "attack")} steps`);
    // 6. A sheet one rebake behind (the thrust asked of a sheet without it) ends at once rather than hold.
    hold("sword");
    p.anim.name = "attack_alt";
    p.anim.done = false;
    const stale = step(2);
    row("an animation the sheet lacks ends at once", stale[1] !== "attack_alt", stale.join(", "));
    // 7. The bow (Michael, 2026-10-14): held at rest with both hands in front, the off one at the string, not hanging;
    // drawn upright by the facing, so the frame toward the camera is the same stave whatever the forearm does.
    hold("bow");
    const rest = G.figure.pose("player", "idle", 0, { main: true, off: true, mainPose: "bow_rest" });
    const plain = G.figure.pose("player", "idle", 0, { main: true, off: true });
    const bowSheet = assets.getSheet("held_bow");
    const j = sheet().joints && sheet().joints.idle_s_0;
    const ja = sheet().joints && sheet().joints.attack_s_2;
    row("the bow is held at rest with both hands and drawn upright by the facing", G.items.getItem("bow").held.pose === "bow_rest" && rest.armPitch[0] !== plain.armPitch[0] && rest.armOut[0] < 0 && !!bowSheet.byFacing && !!j && !!ja && j.main.angFace === 8 && ja.main.angFace === 8, `off arm ${rest.armPitch[0]} out ${rest.armOut[0]} (a plain hold ${plain.armPitch[0]}); the sheet ${bowSheet.byFacing ? "by facing" : "turned with the arm"}; toward the camera frame ${j && j.main.angFace} at rest and ${ja && ja.main.angFace} drawn`);
    // 8. The cast (docs/32 item 3, #6): its style by which hand holds the staff, none for either alone, and its own
    // rhythm as data (`at`), the bow's left at the default.
    const mk = (id) => G.items.makeEntry(id, 1);
    p.hands.main = mk("staff_of_fire"); p.hands.off = mk("book_of_fire");
    const staffMain = combat.styleOf(p);
    p.hands.main = mk("book_of_fire"); p.hands.off = mk("staff_of_fire");
    const bookMain = combat.styleOf(p);
    p.hands.off = null;
    const bookAlone = combat.styleOf(p);
    const castAt = G.figure.poseAt("cast_staff");
    const bowAt = G.figure.poseAt("bow");
    row("the cast's pose follows the staff's hand, with its own rhythm", staffMain === "cast_staff" && bookMain === "cast_book" && bookAlone !== "cast_book" && bookAlone !== "cast_staff" && castAt[0] === 0.3 && castAt[1] === 0.7 && bowAt[0] === 0.35 && bowAt[1] === 0.8, `staff in the main hand ${staffMain}, book in the main hand ${bookMain}, the book alone ${bookAlone}; the cast at ${castAt.join(", ")}, the bow at ${bowAt.join(", ")}`);
  } finally {
    p.hands.main = hands0.main;
    p.hands.off = hands0.off;
    p.hunger = hunger0;
    G.rules.rules.survival = survival0;
    p.presentFor = 0;
    G.loop.advance(1 / 60);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
