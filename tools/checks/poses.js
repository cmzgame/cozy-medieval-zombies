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
  } finally {
    p.hands.main = hands0.main;
    p.hands.off = hands0.off;
    p.hunger = hunger0;
    p.presentFor = 0;
    G.loop.advance(1 / 60);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
