// Worlds, identities, characters (docs/31/09): a world made from an identity, left, listed,
// played again as the same character with the mess it left; a second world from a second
// identity; the identity edited and neither character changed; a death and a new character
// in the same world, the body left. From the console, on a tab with `?nosave` (the worlds
// store is in memory there, so Michael's own worlds are never touched):
//   await __game.check("worlds")
// It leaves the pane at the title with the worlds it made in the page's store.

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
    // 0. Out of the test world: nothing runs, the title is up.
    await W.leave();
    row("out of a world nothing runs and the title is up", !W.inWorld && G.screens.currentScreen() === "title", `inWorld ${W.inWorld}, screen ${G.screens.currentScreen()}`);
    // 1. Two identities; a world from the first.
    const a = I.add({ name: "Ada", look: { hairStyle: "short" } });
    const b = I.add({ name: "Bram", look: { hairStyle: "bald" } });
    await W.create("First world", a.id);
    step(2);
    const first = W.current;
    row("a world made from an identity has a character by its name", W.inWorld && !!first && S.player.name === "Ada" && first.owners && Object.values(first.owners).includes(S.player.id), `world ${first && first.name}, player ${S.player.name} ${S.player.id}`);
    // A mess to find again: the plank dropped at the feet.
    const bag = G.inventory.bagOf(S.player);
    const plank = bag.items.find((e) => e.id === "plank");
    const at = [Math.round(S.player.gx), Math.round(S.player.gy)];
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
    row("a second world has its own character from the other identity", S.player.name === "Bram" && second.worldId !== first.worldId && G.save.listWorlds().length === 2, `player ${S.player.name}, ${G.save.listWorlds().length} listed`);
    await W.leave();
    // 3. The first world played again: the same character, the plank where it fell.
    await W.play(first.worldId);
    step(2);
    const floor = G.map.itemsAt(at[0], at[1]).map((e) => e.id);
    row("the first world played again is the same character with the mess it left", W.inWorld && S.player.name === "Ada" && W.current.worldId === first.worldId && floor.includes("plank"), `player ${S.player.name}, floor ${floor.join(",") || "nothing"}`);
    // 4. The identity edited: a stamp, never backfilled.
    I.update(a.id, { name: "Ada the Second" });
    row("an identity edited changes no character already made from it", S.player.name === "Ada" && I.get(a.id).name === "Ada the Second", `character ${S.player.name}, identity ${I.get(a.id).name}`);
    // 5. A death, and a new character in the same world from the other identity; the body stays.
    const deadId = S.player.id;
    G.events.emit("playerHit", { zombie: S.zombies[0], damage: 1000, victim: S.player });
    step(2);
    const deadScreen = G.screens.currentScreen() === "dead";
    await W.respawn(b.id);
    step(2);
    const body = S.players.find((p) => p.id === deadId);
    row("after a death a new character stands in the same world and the body stays", deadScreen && S.player.id !== deadId && S.player.name === "Bram" && !!body && body.dead && W.current.worldId === first.worldId, `dead screen ${deadScreen}, now ${S.player.name} ${S.player.id}, body ${body ? (body.dead ? "dead" : "alive") : "gone"}`);
    await W.leave();
    const after = G.save.listWorlds().find((w) => w.worldId === first.worldId);
    row("the world's row names the new character", !!after && after.myCharacter === "Bram" && !after.dead, after ? `${after.name} as ${after.myCharacter}${after.dead ? " (dead)" : ""}` : "no row");
    await wait(10);
  } finally {
    G.loop.setPaused(false);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
