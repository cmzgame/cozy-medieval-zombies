// The poses the game lacked (docs/32): what each item adds to the sheets and when it plays. From the console,
// on a fresh boot:
//   await __game.check("poses")
// Items 1 and 2 so far: the held-out pose (`present`, the player's alone; a book in the main hand presents in
// the idle and the walk; eating and drinking present for `presentTime`) and the halberd's thrust (`attack_alt`
// from the `thrust` style, only on the sheet of a figure whose weapon's `alt` names it); and docs/43 section 7's wave (the player's alone, G
// and /wave as the snapshot's key event, for `waveSeconds`, ended by walking) and cowering (a villager's alone); and the off hand's
// swing (#423: `attack_off`, the off arm swinging, on every player's sheet). It pauses the loop,
// puts things in the player's hands, hides the title for the keys, and gives back what was there.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const p = G.player;
  const hands0 = { main: p.hands.main, off: p.hands.off };
  const hunger0 = p.hunger;
  const stamina0 = p.stamina;
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
    // 9. The off hand's swing (#423): `attack_off` on the player's sheet alone, the sheet the same size with one weapon or
    // two; the off arm swinging (its hand away from the idle's, the main swing's hand mirrored) and the main arm held; and
    // the left button's second click, the off hand's turn, playing it to the end.
    {
      hold("sword");
      const oneWidth = sheet().image ? sheet().image.width : 0;
      p.hands.off = G.items.makeEntry("mace", 1);
      step(2);
      const twoWidth = sheet().image ? sheet().image.width : 0;
      const ao = sheet().animations.attack_off;
      const vAo = v ? !!assets.getSheet(v.sprite).animations.attack_off : false;
      const zAo = z ? !!assets.getSheet(z.sprite).animations.attack_off : false;
      row("the off hand's swing is on the player's sheet alone, the same size with one weapon or two", !!ao && ao.frames === 4 && !ao.loop && !vAo && !zAo && oneWidth > 0 && oneWidth === twoWidth, `${ao ? `${ao.frames} frames at ${ao.fps} fps, active ${ao.activeFrame}` : "none"}; a villager's ${vAo}, the dead's ${zAo}; ${oneWidth} px with a sword, ${twoWidth} px with a sword and a mace`);
      const J = sheet().joints || {};
      const idleJ = J.idle_s_0, offJ = J.attack_off_s_0, mainJ = J.attack_s_0;
      const ok = !!idleJ && !!offJ && !!mainJ;
      const offMoved = ok ? Math.hypot(offJ.off.x - idleJ.off.x, offJ.off.y - idleJ.off.y) : 0;
      const mainMoved = ok ? Math.hypot(offJ.main.x - idleJ.main.x, offJ.main.y - idleJ.main.y) : 99;
      const mirrored = ok && Math.abs(offJ.off.x + mainJ.main.x) <= 1 && Math.abs(offJ.off.y - mainJ.main.y) <= 1;
      const held = G.figure.pose("player", "attack_off", 1, { main: true, off: true }, "one_handed");
      const swing = G.figure.pose("player", "attack", 1, { main: true, off: true }, "one_handed");
      row("the off hand's swing moves the off arm, mirroring the main's, and holds the main arm", ok && offMoved >= 10 && mainMoved <= 2 && mirrored && held.armPitch[0] === swing.armPitch[1] && held.armPitch[1] === swing.armPitch[0], ok ? `facing s, the wind-up: the off hand ${offMoved.toFixed(1)} px from the idle's (${offJ.off.x}, ${offJ.off.y}), the main swing's main hand (${mainJ.main.x}, ${mainJ.main.y}); the main hand ${mainMoved.toFixed(1)} px; frame 1's arms ${held.armPitch.join(", ")} against the main swing's ${swing.armPitch.join(", ")}` : "no joints for idle_s_0, attack_s_0, or attack_off_s_0");
      p.attackCooldown = 0;
      p.offCooldown = 0;
      p.swingLock = 0;
      p.shoveCooldown = 0;
      p.stamina = 100;
      const first = combat.swingFromLeft(p, []);
      const firstAnim = p.anim.name;
      step(Math.ceil(0.5 * combat.DUAL.lockout * 60) + 1); // past the lockout, the main hand still recovering
      const second = combat.swingFromLeft(p, []);
      const offRun = [p.anim.name, ...step(40)];
      row("the left button's second click swings the off hand and plays attack_off to the end", first !== null && second !== null && p.lastHand === "off" && firstAnim === "attack" && count(offRun, "attack_off") >= 18 && offRun[offRun.length - 1] === "idle", `the first click ${first !== null ? firstAnim : "refused"}, the second ${second !== null ? `the ${p.lastHand} hand` : "refused"}; attack_off ${count(offRun, "attack_off")} steps, then ${offRun[offRun.length - 1]}`);
      p.hands.off = null;
      p.attackCooldown = 0;
      p.offCooldown = 0;
      p.swingLock = 0;
      p.exposedFor = 0;
    }
    // 10. The wave and the cowering (docs/43 section 7): the wave on the player's sheet alone, the cowering on a villager's alone, each from its style in the data.
    hold(null);
    const wv = sheet().animations.wave;
    const vSheet = v ? assets.getSheet(v.sprite).animations : {};
    const zSheet = z ? assets.getSheet(z.sprite).animations : {};
    const styles = G.figure.poseStyles();
    row("the wave is on the player's sheet alone and the cowering on a villager's alone", !!wv && wv.frames === 2 && wv.loop && !sheet().animations.cower && !!vSheet.cower && !vSheet.wave && !zSheet.wave && !zSheet.cower && styles.includes("wave") && styles.includes("cower"), `player wave ${wv ? `${wv.frames} frames at ${wv.fps} fps` : "none"}; villager cower ${vSheet.cower ? vSheet.cower.frames : "none"}, wave ${!!vSheet.wave}; the dead ${!!zSheet.wave}/${!!zSheet.cower}`);
    const w0 = G.figure.pose("player", "wave", 0);
    const w1 = G.figure.pose("player", "wave", 1);
    const held = G.figure.pose("player", "wave", 0, { main: true, off: false });
    const cw = G.figure.pose("player", "cower", 0);
    row("the wave raises the main arm and moves the hand side to side; the cowering raises both arms", w0.armPitch[1] >= 110 && w0.armPitch[1] === w1.armPitch[1] && w0.armOut[1] !== w1.armOut[1] && w0.armPitch[0] < 30 && held.armPitch[1] === w0.armPitch[1] && cw.armPitch[0] >= 110 && cw.armPitch[1] >= 110, `wave arm ${w0.armPitch[1]}, hand out ${w0.armOut[1]} then ${w1.armOut[1]}, off arm ${w0.armPitch[0]}; held still waves ${held.armPitch[1]}; cower arms ${cw.armPitch.join(", ")}`);
    // G is a key event in the snapshot, performed by the world's step (a guest's the same way): the wave for its seconds, then the idle.
    const screen0 = G.screens.currentScreen();
    if (screen0) G.screens.hide();
    try {
      p.waveFor = 0;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyG", bubbles: true }));
      const first = step(2);
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyG", bubbles: true }));
      const rest = step(Math.ceil(G.tuning.player.waveSeconds * 60) + 10);
      const waved = [...first, ...rest].filter((a) => a === "wave").length / 60;
      row("G waves for waveSeconds, then the idle", Math.abs(waved - G.tuning.player.waveSeconds) <= 3 / 60 && rest[rest.length - 1] === "idle", `waved ${waved.toFixed(2)} s against ${G.tuning.player.waveSeconds}; then ${rest[rest.length - 1]}`);
      // /wave in the chat: the same key event in the next snapshot.
      const box = document.getElementById("log-input");
      box.value = "/wave";
      box.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
      const chat = step(3);
      row("/wave in the chat waves too", chat.includes("wave") && p.waveFor > 0, `${chat.join(", ")}; ${p.waveFor.toFixed(2)} s left`);
      // Walking ends it, as it ends the held-out pose.
      const { updatePlayer } = await import("/src/entities/player.js");
      const at = [p.gx, p.gy];
      updatePlayer(p, 1 / 60, { ...G.game.idleSnapshot(), axis: { x: 1, y: 0 } });
      G.teleport(at[0], at[1]);
      row("walking ends the wave", p.waveFor === 0 && p.anim.name !== "wave", `${p.waveFor} left, ${p.anim.name}`);
    } finally {
      p.waveFor = 0;
      if (screen0 && !G.screens.currentScreen()) G.screens.show(screen0);
    }
  } finally {
    p.hands.main = hands0.main;
    p.hands.off = hands0.off;
    p.hunger = hunger0;
    p.stamina = stamina0;
    G.rules.rules.survival = survival0;
    p.presentFor = 0;
    G.loop.advance(1 / 60);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
