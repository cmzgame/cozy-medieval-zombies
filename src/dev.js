// The console's handle on the game, window.__game (CLAUDE.md, "Testing from a
// browser console"): live state, every module, the dev kit, and the checks.
// Moved out of main.js on 2026-10-12 (docs/23a, D1). `ctx` gives the state as
// getters and the few functions that are main.js's (pausing, the figure).

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
import { say } from "./entities/character.js";
import { showMessage } from "./ui/prompt.js";
import * as archery from "./archery.js";
import * as burning from "./fire.js";
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
import * as stations from "./stations.js"; // the stations and their recipes (docs/30, section 6)

export function createDevApi(ctx) {
  const P = () => ctx.player;
  return {
    bleed: { apply: () => bleed.apply(P()), clear: () => bleed.clear(P()), stacks: () => bleed.stacks(P()), config: bleed.BLEED },
    infection: { infect: () => infection.infect(P()), cure: () => infection.cure(P()), progress: () => infection.progress(P()), config: infection.INFECTION }, // the infection marker (docs/02 question 29b)
    burning, // the fire test (docs/05): burning.tunables, burning.all()
    iso, input, loop, assets, events, map, camera, ground, visibility, interact, clock, light, items, inventory, grid, panel, menu, view, settings, screens, figure, placement, buildPalette, combat, gl, rng, rules, tuning, world, verbs, stations,
    render: { night },
    get player() { return ctx.player; },
    get zombies() { return ctx.zombies; },
    get corpses() { return ctx.corpses; },
    get villagers() { return ctx.villagers; },
    // The bow's arc, fired from the console (docs/20, step 1). `dir` is a grid
    // direction [dx, dy], `distance` the full-draw distance in tiles, `c` the draw (0 to 1).
    archery: {
      tunables: archery.tunables,
      flying: archery.arrowsInFlight,
      preview: archery.preview,
      setMarker: archery.setMarker,
      shoot: (dir, distance, c = 1) => archery.shoot(P(), dir, distance, c),
      shootAt: (gx, gy, c = 1) => archery.shoot(P(), [gx - P().gx, gy - P().gy], Math.hypot(gx - P().gx, gy - P().gy), c),
      markAt: (gx, gy, c = 1) => {
        const p = archery.preview(P(), [gx - P().gx, gy - P().gy], Math.hypot(gx - P().gx, gy - P().gy), c);
        archery.setMarker({ from: [P().gx, P().gy], full: p.full, land: p.land });
        return p;
      },
      clearMarker: () => archery.setMarker(null),
      // The draw, for scripts: aim somewhere, press, step the game, release.
      bow: () => archery.bowOf(P()),
      setAim: (gx, gy) => archery.setAimOverride(gx == null ? null : [gx, gy]),
      launcher: () => archery.launcherOf(P()),
      press: () => archery.beginDraw(P(), archery.launcherOf(P()), "script"),
      release: () => archery.releaseDraw(P(), input.getMouse()),
      cancel: () => archery.cancelDraw(P()),
      drawing: archery.drawState,
    },
    say: (text, seconds) => say(P(), text, seconds), // a bubble over the player, to test the system (docs/19)
    get tiles() { return ctx.tiles; },
    get visible() { return ctx.visible; },
    get playerRoom() { return ctx.playerRoom; },
    get info() { return ctx.info; },
    get openBag() { return ctx.openBag; },
    // A check from tools/checks/ by name: __game.check("determinism"), __game.check("ground").
    check(name, opts) { return import(`/tools/checks/${name}.js`).then((m) => m.run(window.__game, opts)); },
    get timing() { return ctx.timing; }, // the step's, sight's, and render's milliseconds (tools/profile.js)
    get drawn() { return ctx.drawn; },
    teleport(gx, gy) { const p = P(); p.gx = gx; p.gy = gy; p.auto = null; camera.snapTo(gx, gy); },
    walkTo(gx, gy) { return autoWalk(P(), [gx, gy]); },
    setPaused: ctx.setPaused,
    get handlers() { return ctx.handlers; },
    // Customisation from the console until the creation screen: skin, hair, hairStyle (short, long, bald), eyes.
    // Always rebakes, so an edit to figure.BODY from the console shows: __game.figure.BODY.hip = 17; __game.setLook({}).
    setLook(partial) { Object.assign(P().look, partial); ctx.refreshFigure(true); },
    // Put an item in your bag, or at your feet if it does not fit: __game.give("sword").
    give(id, count = 1) {
      const p = P();
      const bag = inventory.bagOf(p);
      const added = bag ? inventory.addItem(bag, id, count) : 0;
      if (added < count) map.dropItem(Math.round(p.gx), Math.round(p.gy), { id, count: count - added });
      return added;
    },
    // Every weapon, for testing (docs/21): a Developer Bag put on your back (what you carried
    // moves into it), then a sword, hatchet, mace, halberd, stick, three spears, a shield, a bow, and
    // forty arrows. Nothing else is touched; the torch stays in your hand.
    giveKit() {
      const p = P();
      const old = inventory.bagOf(p);
      if (!p.worn.back || p.worn.back.id !== "dev_bag") {
        const dev = { id: "dev_bag", count: 1 };
        const bag = inventory.ensureBag(dev);
        if (old) for (const e of old.items) inventory.addItem(bag, e.id, e.count, e.fill != null ? { fill: e.fill } : {});
        p.worn.back = dev;
      }
      const bag = inventory.bagOf(p);
      const kit = [["sword", 1], ["hatchet", 1], ["mace", 1], ["halberd", 1], ["stick", 1], ["spear", 3], ["shield", 1], ["bow", 1], ["arrow", 40], ["bandage", 5], ["book_of_fire", 1], ["staff_of_fire", 1], ["throwing_knife", 100], ["throwing_axe", 100]];
      const got = {};
      for (const [id, n] of kit) got[id] = inventory.addItem(bag, id, n);
      showMessage("A Developer Bag, with every weapon in it.");
      return got;
    },
    // The Developer Bag, twelve by eight, at your feet (docs/11). Never loot.
    giveDevBag() { const p = P(); map.dropItem(Math.round(p.gx), Math.round(p.gy), { id: "dev_bag", count: 1 }); showMessage("A Developer Bag lies at your feet."); },
  };
}
