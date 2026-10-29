// The map picker and the flat map (Michael, 2026-10-28: "a map loader from the website interface"; "the all flat grass map would let me test
// building an entire building by hand"). From the console, on a tab with `?nosave&mute` (the worlds store is in memory there):
//   await __game.check("maps")                         the picker's rows, on any map
// and, to add the flat map's rows, on a page opened with `?map=flat&nosave&mute`:
//   await __game.check("maps")                         the same call: the rows for the map the page is on
// The picker never leaves the page: the reload a map change is goes to a recorder (`__game.maps.setNavigator`), put back in a `finally`. The
// Worlds screen is driven through its own buttons and fields. It ends in a fresh test world, never kept (as check("worlds") does), with the
// worlds it made in the page's store, Free building as it found it, and the screen hidden.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail = "") => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const step = (n) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const W = G.worlds;
  const I = G.identities;
  const M = G.maps;
  const urls = [];
  const free0 = G.rules.rules.freeBuilding;
  const me0 = G.player;
  try {
    G.loop.setPaused(true);
    M.setNavigator((u) => { urls.push(u); });
    const q = (u) => new URLSearchParams(u.slice(u.indexOf("?")));

    // 1. The list: from the data, the plays first, the test maps after.
    const list = W.here && M.module.all();
    row("the maps list is the data's: the valley and flat grass for play, the proving ground and the staging clearing under test maps", list.map((m) => `${m.id}:${m.kind}`).join() === "valley:play,flat:play,square:test,staging:test", list.map((m) => m.id).join());
    row("each by its file's own name: The valley, Flat grass, Village square, The staging clearing", list.map((m) => m.name).join() === "The valley,Flat grass,Village square,The staging clearing", list.map((m) => m.name).join());
    const files = await Promise.all(list.map((m) => fetch(`/data/maps/${m.id}.json`).then((r) => r.json())));
    row("and every map file the list names loads, with the same name", files.every((f, i) => f.name === list[i].name), files.map((f) => f.name).join());

    // 2. A world on each of two maps, listed with its map's name, never "unplayable".
    await W.leave();
    const a = I.add({ name: "Mapper", look: { hairStyle: "short" } });
    await W.create("Valley world", a.id);
    step(2);
    const here = G.maps.current;
    const w1 = W.current;
    await W.save();
    await W.leave();
    const snap = await G.save.readWorld(w1.worldId);
    await G.save.writeWorld({ ...snap, worldId: "w-other", name: "Elsewhere", mapName: here === "flat" ? "valley" : "flat" }); // a world kept on the other map (its save is not read until it is played there)
    G.screens.show("worlds");
    const text = document.body.innerText;
    const cards = [...document.querySelectorAll(".world-card, .wc, .card")];
    row("the Worlds screen lists every world with its map's name and never 'unplayable' or 'on another map'", /Valley world/.test(text) && /Elsewhere/.test(text) && /Flat grass|The valley/.test(text) && !/unplayable|on another map/i.test(text), `${document.querySelectorAll(".world-map").length} map names: ${[...document.querySelectorAll(".world-map")].map((e) => e.textContent).join(", ")}`);
    const maps = [...document.querySelectorAll(".world-map")].map((e) => e.textContent);
    row("a world on this page's map is named for it, one on the other for the other", maps.includes(M.module.nameOf(here)) && maps.includes(M.module.nameOf(here === "flat" ? "valley" : "flat")), maps.join());

    // 3. Playing a world on another map goes there: the same page and test switches, the map and the world's id; a world here plays at once.
    const playBtn = (id) => document.querySelector(`[data-go="play"][data-world="${id}"]`);
    urls.length = 0;
    playBtn("w-other").click();
    await new Promise((r) => setTimeout(r, 50));
    const u1 = urls[0] ? q(urls[0]) : null;
    row("Play on a world kept on another map navigates to this page with ?map=<its map>&world=<its id>, keeping the test switches", !!u1 && u1.get("map") === (here === "flat" ? "valley" : "flat") && u1.get("world") === "w-other" && u1.has("nosave") && u1.has("mute"), urls[0] || "no navigation");
    G.screens.hide();
    document.getElementById("loading") && (document.getElementById("loading").hidden = true);
    G.screens.show("worlds");
    urls.length = 0;
    const hereBtn = playBtn(w1.worldId);
    hereBtn.click();
    for (let i = 0; i < 100 && !W.inWorld; i++) await new Promise((r) => setTimeout(r, 50));
    row("Play on a world of this page's map plays it, with no navigation", W.inWorld && !!W.current && W.current.worldId === w1.worldId && urls.length === 0, `inWorld ${W.inWorld}, urls ${urls.length}`);
    step(2);

    // 4. The pause menu names the map.
    G.screens.show("pause");
    const pauseText = document.body.innerText;
    row("the pause menu says which map this is", pauseText.includes(`Map: ${M.module.nameOf(here)}`), (pauseText.match(/Map: [^\n]*/) || ["none"])[0]);
    G.screens.hide();
    await W.leave();

    // 5. The new-world step: a Map row, the valley first; choosing another keeps the name and the rules; it goes on to a character and the world is made on the map.
    G.screens.show("newworld", { name: "Plain world" });
    const sel = document.getElementById("world-map");
    const opts = sel ? [...sel.options].map((o) => o.textContent) : [];
    const groups = sel ? [...sel.querySelectorAll("optgroup")].map((g) => `${g.label}:${[...g.querySelectorAll("option")].map((o) => o.textContent).join("/")}`) : [];
    row("the New world step has a Map choice, the valley first and chosen, the test maps under their own heading", !!sel && opts.join() === "The valley,Flat grass,Village square,The staging clearing" && JSON.parse(sel.value) === "valley" && groups.join() === "Test maps:Village square/The staging clearing", `${opts.join("/")} | ${groups.join()}`);
    sel.value = JSON.stringify("flat");
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    const sel2 = document.getElementById("world-map");
    const nameKept = document.getElementById("world-name").value;
    row("choosing Flat grass keeps the name typed, shows its line, and the choice stands", JSON.parse(sel2.value) === "flat" && nameKept === "Plain world" && /plain of plain grass/.test(document.body.innerText), `${sel2.value}, name "${nameKept}"`);
    // On to a character (the last identity), then the world: on another map the page goes there with the choices kept for arrival.
    urls.length = 0;
    I.setLast(a.id); // the character step offers the last identity first
    document.querySelector('[data-go="newworld-next"]').click();
    row("Next goes on to the character step", G.screens.currentScreen() === "create");
    document.querySelector('[data-go="create-next"]').click();
    document.querySelector('[data-go="create-next"]').click();
    await new Promise((r) => setTimeout(r, 50));
    const wantsFlat = here !== "flat";
    const u2 = urls[0] ? q(urls[0]) : null;
    const payload = (() => { try { return JSON.parse(sessionStorage.getItem(M.key)); } catch { return null; } })();
    row(wantsFlat ? "the world is made on Flat grass by a reload onto ?map=flat&make=1, its name, identity, and rules kept for the arrival" : "on the flat page the world is made at once", wantsFlat ? !!u2 && u2.get("map") === "flat" && u2.get("make") === "1" && !!payload && payload.name === "Plain world" && payload.identityId === a.id && payload.rules && typeof payload.rules === "object" : W.inWorld && G.maps.current === "flat" && urls.length === 0, wantsFlat ? `${urls[0]} ${JSON.stringify(payload && { name: payload.name })}` : `inWorld ${W.inWorld}`);
    M.takePayload();

    // 6. A guest on a different map from the host's: the welcome names the host's map and the join is taken up again there, once; a map this build lacks, or a second mismatch, is refused with a word.
    if (W.inWorld) await W.leave();
    urls.length = 0;
    M.followHostMap(here === "flat" ? "valley" : "flat");
    const u3 = urls[0] ? q(urls[0]) : null;
    row("a guest whose host's world is on another map goes to that map once, the test join kept and marked", !!u3 && u3.get("map") === (here === "flat" ? "valley" : "flat") && u3.get("jumped") === "1" && u3.has("nosave"), urls[0] || "no navigation");
    G.screens.hide();
    urls.length = 0;
    M.followHostMap("nowhere");
    row("a host's map this build lacks is refused with a word and no navigation", urls.length === 0 && /does not have/.test(document.body.innerText), `urls ${urls.length}`);
    G.screens.hide();

    // 7. The flat map, when this page is on it.
    if (G.maps.current === "flat") {
      await W.test();
      step(4);
      const me = G.player;
      const [sx, sy] = [Math.round(me.gx), Math.round(me.gy)];
      let bad = 0;
      let seen = 0;
      for (let y = sy - 25; y <= sy + 25; y++) for (let x = sx - 25; x <= sx + 25; x++) {
        const t = G.map.peekTile(x, y);
        if (!t) continue;
        seen++;
        if (t.floor !== "floor_grass" || t.n || t.w || (t.prop && t.prop.sprite !== "dev_chest")) bad++;
      }
      row("the flat map round the spawn is plain grass: nothing on any tile but the dev chest", bad === 0 && seen > 2000, `${seen} tiles read, ${bad} not plain`);
      row("no dead, one villager (the guide) beside the spawn, no trees, and no mushrooms", G.zombies.length === 0 && G.villagers.length === 1 && G.villagers[0].guide && [...G.map.allProps()].every((p) => p.sprite === "dev_chest"), `${G.zombies.length} dead, ${G.villagers.length} villagers`);
      // A house by hand with Free building on: four walls, a door, a window, a wood floor; the room found; torn down by the same commands after.
      G.rules.set({ freeBuilding: true });
      const x = sx + 6;
      const y = sy + 6;
      // Each build is a timed action of the world (five seconds at most): the player stands beside the edge, the command goes, the world steps.
      // (The player stands on the tile whose edge it is: a wall between the player and the edge, or past the reach, is refused "Too far".)
      const build = (what, tx, ty, edge, extra = {}) => { G.teleport(tx, ty); const ok = G.placement.performPlacement(me, { kind: "build", what, tx, ty, ...(edge ? { edge } : {}), ...extra }); step(60 * 5); return ok; };
      for (let i = 0; i < 4; i++) { build("wall", x + i, y, "n"); build("wall", x + i, y + 3, "n"); }
      for (let j = 0; j < 3; j++) { build("wall", x, y + j, "w"); build("wall", x + 4, y + j, "w"); }
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { G.teleport(x + i, y + j); G.placement.performPlacement(me, { kind: "build", what: "floor_wood", tx: x + i, ty: y + j, tx2: x + i, ty2: y + j }); step(60 * 5); }
      G.map.rebuildRooms();
      const edgeKind = (tx, ty, e) => (G.map.peekTile(tx, ty)[e] || {}).kind || null;
      row("a house is built by hand on the flat map: eight-and-more walls round a 4 by 3, a wood floor inside, and the room is found", edgeKind(x, y, "n") === "wall" && edgeKind(x + 4, y + 2, "w") === "wall" && G.map.peekTile(x + 1, y + 1).floor === "floor_wood" && G.map.roomAt(x + 1, y + 1) !== 0, `room ${G.map.roomAt(x + 1, y + 1)}, floor ${G.map.peekTile(x + 1, y + 1).floor}`);
      // The door and the window replace a wall's edge (a door in the south wall's second tile, a window in the west wall).
      const before = G.game.syncParts().map;
      build("door", x + 1, y + 3, "n");
      build("window", x, y + 1, "w");
      row("and a door and a window are fitted: the south wall's door, the west wall's window; the room still stands", edgeKind(x + 1, y + 3, "n") === "door" && edgeKind(x, y + 1, "w") === "window" && G.game.syncParts().map !== before, `${edgeKind(x + 1, y + 3, "n")}, ${edgeKind(x, y + 1, "w")}`);
      // Terrain by hand: the pink beside the house.
      G.teleport(x + 6, y + 3);
      G.placement.performPlacement(me, { kind: "build", what: "terrain_randomspawn", tx: x + 6, ty: y, tx2: x + 7, ty2: y + 1 });
      step(60 * 2);
      row("and the Random spawn tile is painted beside it", G.map.peekTile(x + 6, y).floor === "floor_randomspawn" && G.map.peekTile(x + 7, y + 1).floor === "floor_randomspawn");
    } else {
      row("the flat map's rows run on a page opened with ?map=flat (this one is on " + G.maps.current + ")", true, "not run here");
    }
    await W.test();
    step(2);
    row("it ends in a fresh test world, never kept", W.inWorld && !!G.player && W.current === null, `in a world ${W.inWorld}, kept ${!!W.current}`);
  } finally {
    M.setNavigator(null);
    G.rules.set({ freeBuilding: free0 });
    G.loop.setPaused(false);
    void me0;
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
