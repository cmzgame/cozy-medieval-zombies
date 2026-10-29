// The console's handle on the game, window.__game (CLAUDE.md, "Testing from a
// browser console"): live state, every module, the dev kit, and the checks.
// Moved out of main.js on 2026-10-12 (docs/23a, D1). `ctx` gives the state as
// getters and the few functions that are main.js's (pausing, the figure).
// On a guest it reads the replica (docs/31/07 question 14, #102): the helpers below that write the world (give, the kit,
// teleport, walkTo, say, setLook, a bleed or the infection, a shot, a second player, a world restored) are the host's, and
// on a guest they refuse with why, where they would only mislead the replica until the host's next frame put it back. The
// modules stay in reach for reading, and the checks write through them on purpose; the clock keys are the host's (main.js).

import * as iso from "./iso.js";
import * as input from "./input.js";
import * as loop from "./loop.js";
import * as assets from "./assets.js";
import * as events from "./events.js";
import * as map from "./map.js";
import * as camera from "./camera.js";
import * as visibility from "./visibility.js";
import * as clock from "./clock.js";
import * as light from "./light.js";
import * as gl from "./gl.js";
import * as ground from "./ground.js";
import { night } from "./render.js";
import { autoWalk } from "./entities/player.js";
import { say, dressCorpse } from "./entities/character.js";
import { showMessage } from "./ui/prompt.js";
import * as archery from "./archery.js";
import * as burning from "./fire.js";
import * as burn from "./burn.js";
import * as infection from "./infection.js";
import * as bleed from "./bleed.js";
import * as menu from "./ui/context-menu.js";
import * as panel from "./ui/inventory-panel.js";
import * as interact from "./interact.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import * as grid from "./grid.js";
import * as view from "./view.js";
import * as settings from "./settings.js";
import * as screens from "./ui/screens.js";
import * as figure from "./figure.js";
import * as placement from "./placement.js";
import * as combat from "./combat.js";
import * as buildPalette from "./ui/build-palette.js";
import * as rng from "./rng.js";
import * as rules from "./rules.js";
import * as tuning from "./tuning.js";
import * as world from "./world.js"; // the time scale and the id counter (docs/30 step 2)
import * as verbs from "./verbs.js"; // the verb table (docs/31/08, habit 4)
import * as startingKit from "./kit.js"; // the starting kit (#136): `__game.kit`
import * as use from "./use.js"; // Use mode: `use.applyWith` is the host's side of a Use, a guest's too (docs/30 law 2)
import * as stations from "./stations.js"; // the stations and their recipes (docs/30, section 6)
import { client } from "./client.js"; // who I am, the client's (#102)

export function createDevApi(ctx) {
  // The check runner's fresh-page run goes on across its own reloads (tools/checks/all.js), only while its queue is in this tab and only
  // on a `?nosave` page: any other page in the tab (Michael's own world, the title) drops the queue and never runs a check.
  try {
    if (sessionStorage.getItem("cmz-check-all")) {
      if (new URLSearchParams(location.search).has("nosave")) setTimeout(() => import("/tools/checks/all.js").then((m) => m.resume(window.__game)), 0);
      else sessionStorage.removeItem("cmz-check-all");
    }
  } catch { /* a page with no storage: nothing to go on with */ }
  const P = () => ctx.player;
  const host = (name, fn) => (...args) => {
    if (ctx.net && ctx.net.isGuest()) throw new Error(`__game.${name} writes the world, and the world is the host's: a guest's console reads its replica (docs/31/07 question 14)`);
    return fn(...args);
  };
  return {
    get readOnly() { return !!(ctx.net && ctx.net.isGuest()); }, // a guest's console: the writing helpers refuse
    client, // who I am (client.me) and the renderer's and the interface's notes by id (src/client.js, #102)
    bleed: { apply: host("bleed.apply", () => bleed.apply(P())), clear: host("bleed.clear", () => bleed.clear(P())), stacks: () => bleed.stacks(P()), config: bleed.BLEED },
    infection: { infect: host("infection.infect", () => infection.infect(P())), cure: host("infection.cure", () => infection.cure(P())), progress: () => infection.progress(P()), config: infection.INFECTION }, // the infection marker (docs/02 question 29b)
    burning, // the flames (docs/05): burning.tunables, burning.all()
    burn, // burning as a status (#14): burn.ignite(z) in place of the old menu toggle, burn.BURN
    iso, input, loop, assets, events, map, camera, ground, visibility, interact, clock, light, items, inventory, grid, panel, menu, view, settings, screens, figure, placement, buildPalette, combat, gl, rng, rules, tuning, world, verbs, use, stations, kit: startingKit,
    render: { night },
    get player() { return ctx.player; },
    game: ctx.game, // the world's state and step (game.js); hashText for the determinism check
    save: ctx.save, // the worlds store (save.js): snapshot, listWorlds, readWorld, writeWorld, deleteWorld
    worlds: ctx.worlds, // the client's worlds flow (main.js; docs/31/09): create(name, identityId), play(worldId), leave(), respawn(identityId), here(), setOpen(on), save()
    maps: ctx.maps, // the map picker (main.js, maps.js): module, current, goTo, createWorld, setNavigator(fn) (a recorder in place of the reload), followHostMap
    identities: ctx.identities, // identities.js: list, add, update, remove, clientId
    restoreWorld: host("restoreWorld", ctx.restoreWorld), // the world put back from a snapshot, the client refreshed (main.js)
    addPlayer: host("addPlayer", ctx.addPlayer), // a second player at (gx, gy), standing: __game.addPlayer(x, y) (docs/31/03)
    net: ctx.net, // the wire (net.js): status(), setTestSnapshot(s) on a guest
    away: ctx.away, // stepping away (main.js, item 3): after(ms) shortens the idle time, now, step(), back()
    get zombies() { return ctx.zombies; },
    get corpses() { return ctx.corpses; },
    get villagers() { return ctx.villagers; },
    get animals() { return ctx.animals; },
    // The bow's arc, fired from the console (docs/20, step 1). `dir` is a grid
    // direction [dx, dy], `distance` the full-draw distance in tiles, `c` the draw (0 to 1).
    archery: {
      tunables: archery.tunables,
      flying: archery.arrowsInFlight,
      flares: archery.flaresNow,
      projectileLights: archery.projectileLights,
      shootWith: host("archery.shootWith", (dir, distance, c = 1, o = {}) => archery.shoot(P(), dir, distance, c, o)),
      preview: archery.preview,
      setMarker: archery.setMarker,
      shoot: host("archery.shoot", (dir, distance, c = 1) => archery.shoot(P(), dir, distance, c)),
      shootAt: host("archery.shootAt", (gx, gy, c = 1) => archery.shoot(P(), [gx - P().gx, gy - P().gy], Math.hypot(gx - P().gx, gy - P().gy), c)),
      markAt: (gx, gy, c = 1) => {
        const p = archery.preview(P(), [gx - P().gx, gy - P().gy], Math.hypot(gx - P().gx, gy - P().gy), c);
        archery.setMarker(P(), { from: [P().gx, P().gy], full: p.full, land: p.land });
        return p;
      },
      clearMarker: () => archery.setMarker(P(), null),
      // The draw, for scripts: aim somewhere, press, step the game, release.
      bow: () => archery.bowOf(P()),
      setAim: (gx, gy) => archery.setAimOverride(P(), gx == null ? null : [gx, gy]),
      launcher: () => archery.launcherOf(P()),
      press: host("archery.press", () => archery.beginDraw(P(), archery.launcherOf(P()), "script")),
      release: host("archery.release", () => archery.releaseDraw(P(), { mouse: input.getMouse() })),
      cancel: host("archery.cancel", () => archery.cancelDraw(P())),
      drawing: () => archery.drawState(P()),
    },
    dressCorpse: host("dressCorpse", dressCorpse), // a body made (the fall over): its torches go out (#162)
    say: host("say", (text, seconds) => say(P(), text, seconds)), // a bubble over the player, to test the system (docs/19); a guest's chat is the chat box
    get tiles() { return ctx.tiles; },
    get visible() { return ctx.visible; },
    get playerRoom() { return ctx.playerRoom; },
    get info() { return ctx.info; },
    get openBag() { return ctx.openBag; },
    // A check from tools/checks/ by name: __game.check("determinism"), __game.check("ground").
    check(name, opts) { return import(`/tools/checks/${name}.js`).then((m) => m.run(window.__game, opts)); },
    get timing() { return ctx.timing; }, // the step's, sight's, and render's milliseconds (tools/profile.js)
    sound: ctx.sound, // the sounds (docs/40): __game.sound.update(dt) after an advance, reset(), log, audio
    get drawn() { return ctx.drawn; },
    teleport: host("teleport", (gx, gy) => { const p = P(); p.gx = gx; p.gy = gy; p.auto = null; camera.snapTo(gx, gy, p); }),
    walkTo: host("walkTo", (gx, gy) => autoWalk(P(), [gx, gy])),
    setPaused: ctx.setPaused,
    get handlers() { return ctx.handlers; },
    // The look from the console (the character screen is the real way, docs/31/09): skin, hair, hairStyle (short, long, bald), eyes.
    // Always rebakes, so an edit to figure.BODY from the console shows: __game.figure.BODY.hip = 17; __game.setLook({}).
    setLook: host("setLook", (partial) => { Object.assign(P().look, partial); ctx.refreshFigure(true); }),
    // Right- or left-handed from the console, for the checks (the identity screen is the real way; Michael, 2026-10-25).
    setHanded: host("setHanded", (h) => { P().handed = h === "left" ? "left" : "right"; ctx.refreshFigure(true); }),
    // The poses re-read from data/poses.json and the player rebaked (docs/32): edit the file, then __game.reloadPoses().
    async reloadPoses() {
      const json = await (await fetch("/data/poses.json", { cache: "no-store" })).json();
      figure.setPoses(json);
      ctx.refreshFigure(true);
      return Object.keys(json).filter((k) => k !== "note");
    },
    // Put an item in your bag, or at your feet if it does not fit: __game.give("sword").
    give: host("give", (id, count = 1) => {
      const p = P();
      const bag = inventory.bagOf(p);
      const added = bag ? inventory.addItem(bag, id, count) : 0;
      if (added < count) map.dropItem(Math.round(p.gx), Math.round(p.gy), { id, count: count - added }, p.layer || 0);
      return added;
    }),
    // Every weapon, for testing (docs/21): a Developer Bag put on your back (what you carried
    // moves into it), then a sword, hatchet, mace, halberd, stick, three spears, a shield, a bow, and
    // forty arrows. Nothing else is touched; the torch stays in your hand.
    giveKit: host("giveKit", () => {
      const p = P();
      const old = inventory.bagOf(p);
      if (!p.worn.back || p.worn.back.id !== "dev_bag") {
        const dev = { id: "dev_bag", count: 1 };
        const bag = inventory.ensureBag(dev);
        if (old) for (const e of old.items) inventory.addItem(bag, e.id, e.count, { ...(e.fill != null ? { fill: e.fill } : {}), ...(e.clean ? { clean: true } : {}) }); // a skin keeps its water and whether it is clean (docs/44)
        p.worn.back = dev;
      }
      const bag = inventory.bagOf(p);
      const kit = [["sword", 1], ["hatchet", 1], ["mace", 1], ["halberd", 1], ["stick", 1], ["spear", 3], ["shield", 1], ["bow", 1], ["arrow", 40], ["bandage", 5], ["book_of_fire", 1], ["staff_of_fire", 1], ["throwing_knife", 100], ["throwing_axe", 100]];
      const got = {};
      for (const [id, n] of kit) got[id] = inventory.addItem(bag, id, n);
      showMessage("A Developer Bag, with every weapon in it.");
      return got;
    }),
    // The Developer Bag, twelve by eight, at your feet (docs/11). Never loot.
    giveDevBag: host("giveDevBag", () => { const p = P(); map.dropItem(Math.round(p.gx), Math.round(p.gy), { id: "dev_bag", count: 1 }, p.layer || 0); showMessage("A Developer Bag lies at your feet."); }),
  };
}
