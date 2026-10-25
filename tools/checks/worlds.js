// Worlds, identities, characters (docs/31/09): a world made from an identity, left, listed,
// played again as the same character with the mess it left; a second world from a second
// identity; the identity edited and neither character changed; a death and a new character
// in the same world, the body left; the world rule Village stations made with a world and kept (docs/43 section 5). From the console, on a tab with `?nosave` (the worlds
// store is in memory there, so Michael's own worlds are never touched):
//   await __game.check("worlds")
// It leaves the pane in a fresh world of its own (#432), with the worlds it made in the page's store.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const S = G.game.state;
  const step = (n) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const W = G.worlds;
  const I = G.identities;
  try {
    G.loop.setPaused(true);
    // 0. Out of the test world: nothing runs, the Worlds screen is up (docs/31/09; the title until 2026-10-15).
    await W.leave();
    row("out of a world nothing runs and the Worlds screen is up", !W.inWorld && G.screens.currentScreen() === "worlds", `inWorld ${W.inWorld}, screen ${G.screens.currentScreen()}`);
    // 1. Two identities; a world from the first.
    const a = I.add({ name: "Ada", look: { hairStyle: "short" } });
    const b = I.add({ name: "Bram", look: { hairStyle: "bald" } });
    await W.create("First world", a.id);
    step(2);
    const first = W.current;
    row("a world made from an identity has a character by its name", W.inWorld && !!first && G.player.name === "Ada" && first.owners && Object.values(first.owners).includes(G.player.id), `world ${first && first.name}, player ${G.player.name} ${G.player.id}`);
    // A mess to find again: the plank dropped at the feet.
    const bag = G.inventory.bagOf(G.player);
    const plank = bag.items.find((e) => e.id === "plank");
    const at = [Math.round(G.player.gx), Math.round(G.player.gy)];
    G.grid.remove(bag, plank);
    G.map.dropItem(at[0], at[1], plank);
    step(2);
    await W.leave();
    const listed = G.save.listWorlds();
    row("left, the world is listed with my character's name", !W.inWorld && listed.length === 1 && listed[0].name === "First world" && listed[0].myCharacter === "Ada", `${listed.length} listed: ${listed.map((w) => `${w.name} as ${w.myCharacter}`).join(", ")}`);
    // 2. A second world from the second identity.
    await W.create("Second world", b.id);
    step(2);
    const second = W.current;
    row("a second world has its own character from the other identity", G.player.name === "Bram" && second.worldId !== first.worldId && G.save.listWorlds().length === 2, `player ${G.player.name}, ${G.save.listWorlds().length} listed`);
    await W.leave();
    // 3. The first world played again: the same character, the plank where it fell.
    await W.play(first.worldId);
    step(2);
    const floor = G.map.itemsAt(at[0], at[1]).map((e) => e.id);
    row("the first world played again is the same character with the mess it left", W.inWorld && G.player.name === "Ada" && W.current.worldId === first.worldId && floor.includes("plank"), `player ${G.player.name}, floor ${floor.join(",") || "nothing"}`);
    // 4. The identity edited: a stamp, never backfilled.
    I.update(a.id, { name: "Ada the Second" });
    row("an identity edited changes no character already made from it", G.player.name === "Ada" && I.get(a.id).name === "Ada the Second", `character ${G.player.name}, identity ${I.get(a.id).name}`);
    // 5. A death, and a new character in the same world from the other identity; the body stays.
    const deadId = G.player.id;
    G.events.emit("playerHit", { zombie: S.zombies[0], damage: 1000, victim: G.player });
    step(2);
    const deadScreen = G.screens.currentScreen() === "dead";
    await W.respawn(b.id);
    step(2);
    const body = S.players.find((p) => p.id === deadId);
    row("after a death a new character stands in the same world and the body stays", deadScreen && G.player.id !== deadId && G.player.name === "Bram" && !!body && body.dead && W.current.worldId === first.worldId, `dead screen ${deadScreen}, now ${G.player.name} ${G.player.id}, body ${body ? (body.dead ? "dead" : "alive") : "gone"}`);
    await W.leave();
    const after = G.save.listWorlds().find((w) => w.worldId === first.worldId);
    row("the world's row names the new character", !!after && after.myCharacter === "Bram" && !after.dead, after ? `${after.name} as ${after.myCharacter}${after.dead ? " (dead)" : ""}` : "no row");
    await wait(10);
    // 6. A world left open to friends is open again when it is played (Michael, 2026-10-13); one closed stays closed.
    // The two-tab loopback stands in for the relay, so the check never goes out to the network.
    const prevRelay = G.net.status().relay;
    G.net.setRelay("none");
    try {
      await W.play(first.worldId);
      step(2);
      W.setOpen(true);
      const code = G.net.status().code;
      const wasOpen = G.net.status().role === "host" && !!W.current.open;
      await W.save();
      await W.leave();
      const closedOnLeave = G.net.status().role === null;
      await W.play(first.worldId);
      await wait(20);
      const again = G.net.status();
      row("a world left open is open again when it is played, under the same code", wasOpen && closedOnLeave && again.role === "host" && again.code === code && !!W.current.open, `open ${wasOpen}, closed on leave ${closedOnLeave}, played again: ${again.role} ${again.code} (was ${code})`);
      W.setOpen(false);
      await W.save();
      await W.leave();
      await W.play(first.worldId);
      row("a world closed to friends stays closed when it is played", G.net.status().role === null && !W.current.open, `role ${G.net.status().role}, flag ${W.current.open}`);
      await W.leave();
    } finally {
      if (prevRelay) G.net.setRelay(prevRelay);
    }
    // The world rule Village stations (docs/43 section 5): a Sandbox choice, Fixed by default, chosen when the world is made and kept in its
    // save; on, the village's stations are carried and made. The remembered choice is put back after.
    {
      const was = G.settings.get("villageStations");
      try {
        const entry = G.settings.REGISTRY.find((e) => e.key === "villageStations");
        const rulesMod = await import("/src/rules.js");
        row("Village stations is a world rule of the Sandbox step, chosen when the world is made, Fixed by default", !!entry && entry.group === "rules" && entry.fixed === true && rulesMod.DEFAULTS.villageStations === false && rulesMod.FIXED.includes("villageStations"), entry ? `${entry.label}: ${entry.choices.map((c) => c[1]).join(" / ")}` : "no row");
        const c = I.add({ name: "Cai", look: { hairStyle: "short" } });
        await W.create("Stations world", c.id, { rules: { villageStations: true } });
        step(2);
        const on = rulesMod.rules.villageStations;
        const anvil = [...G.map.allProps()].find((q) => q.sprite === "anvil");
        const movable = !!anvil && G.placement.canCarry(anvil);
        const listed = G.stations.recipesFor("workbench").some((r) => r.id === "forge");
        W.setWorldRules({ villageStations: false });
        const still = rulesMod.rules.villageStations;
        const made = W.current;
        await W.save();
        await W.leave();
        await W.play(made.worldId);
        step(2);
        const kept = rulesMod.rules.villageStations;
        row("made with it on, the village's anvil is carried and the forge is made at the workbench; the host cannot change it after; the save keeps it", on === true && movable && listed && still === true && kept === true, `on ${on}, anvil carried ${movable}, forge listed ${listed}, after a change ${still}, played again ${kept}`);
        await W.leave();
        await W.create("Fixed world", c.id, { rules: { villageStations: false } });
        step(2);
        const anvil2 = [...G.map.allProps()].find((q) => q.sprite === "anvil");
        const fixed = !!anvil2 && !G.placement.canCarry(anvil2);
        const hidden = !G.stations.recipesFor("workbench").some((r) => r.id === "forge");
        row("made with it off, the village's stations stay where they stand and none is made (the rows hidden)", rulesMod.rules.villageStations === false && fixed && hidden, `carried ${!fixed}, listed ${!hidden}`);
        await W.leave();
      } finally {
        G.settings.set("villageStations", was);
      }
    }
    // The checks after this one in the page need a world (#432: build ran with none): it ends in a fresh one of its own, made as the
    // Sandbox step's last choices make one, so nothing remembered changes.
    await W.create("Checks' world", a.id);
    step(2);
    row("it ends in a fresh world, so the checks after it in the page have one", W.inWorld && !!G.player, `in a world ${W.inWorld}`);
  } finally {
    G.loop.setPaused(false);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
