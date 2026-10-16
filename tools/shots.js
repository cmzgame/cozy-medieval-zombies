// The site's background pictures (docs/38 step 5, #110): shots of the staging map
// (tools/mapgen/staging.py) taken from the game's own canvas, so nothing of the
// interface is in them (the interface is DOM, never the canvas). In the game's page:
//   http://localhost:8011/?map=staging&nosave&relay=none   (the pane sized first, e.g. 1920 by 1080)
//   const r = await (await import("/tools/shots.js")).run(window.__game); console.log(r)
// Each shot stands the player at a place, sets the hour and the zoom, lets the frame
// settle, and POSTs the canvas to serve.py's /__screenshot/<name>.png (saved under
// screenshots/, which git ignores; the chosen ones are copied to docs/images/site/).
// The test world's dev chest is taken away first (it is read from the settings at
// load, and the settings are Michael's); the hour, the zoom, the pause, and the
// player's place are put back after, and the zoom's setting as it was ("auto" stays
// "auto": view.setZoom writes the setting, and the settings are Michael's, docs/testing.md).

import * as settings from "../src/settings.js";

export const SHOTS = [
  // name, where the player stands, the hour, the zoom (view.ZOOM_LEVELS: 1.1 wide, 1.8 middle, 2.7 close).
  // The clock is Zomboid's (clock.js): full dark from 23:00 to 06:00, an hour's taper either side, so dusk is late.
  { name: "staging_day_wide", at: [22, 27], hour: 10.5, zoom: 1.1 },
  { name: "staging_day_well", at: [20, 26], hour: 15, zoom: 1.8 },
  { name: "staging_dusk_wide", at: [22, 27], hour: 22.6, zoom: 1.1 },
  { name: "staging_night_door", at: [19, 21], hour: 23.6, zoom: 1.8 },
];

const tick = () => new Promise((r) => setTimeout(r, 0)); // a breath for the page; never a frame, which a hidden pane never gives

async function post(canvas, name) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png")); // the bitmap is copied when this is called
  const res = await fetch(`/__screenshot/${name}.png`, { method: "POST", body: blob });
  return { name, ok: res.ok, bytes: blob.size, size: `${canvas.width}x${canvas.height}` };
}

export async function run(game, shots = SHOTS) {
  const G = game;
  const canvas = document.getElementById("game");
  const wasPaused = G.loop.isPaused();
  const hour0 = G.clock.getHour();
  const zoomSetting0 = settings.get("worldScale");
  const at0 = [G.player.gx, G.player.gy];
  const out = [];
  try {
    if (G.screens) G.screens.hide();
    for (const p of G.map.allProps()) if (p.sprite === "dev_chest") G.map.removeProp(p);
    G.loop.setPaused(true);
    for (const s of shots) {
      G.teleport(s.at[0], s.at[1]);
      G.clock.setHour(s.hour);
      G.view.setZoom(s.zoom);
      // Settle: the camera, the sight, the ring's bakes, the light's cache; each advance draws a frame.
      for (let i = 0; i < 40; i++) G.loop.advance(1 / 60);
      await tick();
      G.loop.advance(1 / 60); // drawn, then copied in the same task, before the browser clears the buffer
      out.push(await post(canvas, s.name));
    }
  } finally {
    G.teleport(at0[0], at0[1]);
    G.clock.setHour(hour0);
    settings.set("worldScale", zoomSetting0); // the view's listener resizes to it
    G.loop.setPaused(wasPaused);
  }
  return out;
}
