// Villagers (#236): a hurt villager heals slowly, at the player's rate (Michael, 2026-10-18: "slow refill like players"). From the console, on a tab with `?nosave`:
//   await __game.check("villagers")
// On an at-risk villager beside the player (the dead off for the run): a blow starts a pause in which nothing heals, then health rises at `villager.regenPerMinute`
// (which equals the player's `healthRegenPerMinute`) and stops at the maximum; a second blow starts the pause again; a dead one does not heal. The villager's health, the rules, and the place are put back.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const wasPaused = G.loop.isPaused();
  const aggro0 = G.rules.rules.zombieAggro;
  const { damageVillager } = await import("/src/entities/villager.js");
  const T = G.tuning.villager;
  const advance = (seconds) => { for (let t = 0; t < seconds; t += 0.25) G.loop.advance(0.25); };
  const restore = [];
  try {
    G.loop.setPaused(true);
    G.rules.rules.zombieAggro = false;
    const v = S.villagers.find((q) => !q.immune && !q.dead);
    if (!v) throw new Error("no at-risk villager in the world");
    const hp0 = v.hp;
    const regenAt0 = v.regenAt;
    const state0 = v.state;
    restore.push(() => { v.hp = hp0; v.regenAt = regenAt0; v.state = state0; v.dead = false; });
    G.teleport(v.gx + 1.2, v.gy);
    G.loop.advance(1 / 60);
    v.hp = v.maxHp;
    damageVillager(v, 40);
    const hit = v.hp;
    advance(T.regenPause - 3);
    row("a hit starts a pause in which nothing heals", v.hp === hit, `${hit} after the blow, ${v.hp} ${(T.regenPause - 3).toFixed(0)} s later`);
    advance(3 + 2); // out of the pause (the flinch is over)
    advance(120);
    const gained = v.hp - hit;
    row("then health rises at the configured rate (a minute: regenPerMinute, the player's rate)", T.regenPerMinute === G.tuning.player.healthRegenPerMinute && Math.abs(gained - 2 * T.regenPerMinute) < 0.5, `+${gained.toFixed(2)} in 120 s past the pause (a minute is ${T.regenPerMinute}; the player's ${G.tuning.player.healthRegenPerMinute})`);
    v.hp = v.maxHp - 0.2;
    advance(60);
    row("and stops at the maximum", v.hp === v.maxHp, `${v.hp} of ${v.maxHp}`);
    damageVillager(v, 10);
    const second = v.hp;
    advance(T.regenPause - 3);
    row("a second blow starts the pause again", v.hp === second, `${second} after the blow, ${v.hp} later`);
    // A dead one (a stand-in, so no real villager turns): hurt and dead, it does not heal, whatever the time.
    const { createVillager } = await import("/src/entities/villager.js");
    const zombies0 = S.zombies.length;
    const ghost = createVillager(me.gx + 1.5, me.gy, { id: "vl_ghost", name: "Ghost" });
    ghost.hp = 30;
    ghost.dead = true;
    ghost.state = "dead";
    S.villagers.push(ghost);
    restore.push(() => { const i = S.villagers.indexOf(ghost); if (i >= 0) S.villagers.splice(i, 1); S.zombies.splice(zombies0); });
    advance(T.regenPause + 60);
    row("a dead villager does not heal", ghost.dead && ghost.hp === 30, `dead ${ghost.dead}, hp ${ghost.hp}`);
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const r of restore.reverse()) r();
    G.rules.rules.zombieAggro = aggro0;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
