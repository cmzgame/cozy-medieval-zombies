// This browser's side of a world (docs/31/05, items 7 and 26, #102): who I am, and what my renderer and interface note about
// the world's objects, kept here and never written on them. The world (game.js) never reads it. A server world and tools/world.js
// load it through net.js, and its listener follows their picks, but nothing on an authority's path reads `client.me`.
// `me` follows the world's own picks (`game.setPlayer`, `pickPlayer`, the `playerPicked` event: a world made, restored, played
// again as my character, a new character after a death, a step away and back); a guest's is the player its welcome named, kept
// by id through every frame (net.js); and while the dead screen is up it is my body. Nothing in the step reads it.

import * as events from "./events.js";

export const client = {
  me: null, // my player: the host's own, or the guest's from its welcome; my body while the dead screen is up
  behind: new Set(), // the ids of the figures a tall prop stood in front of in the last drawn frame (render/scene.js), for what floats over them
  targets: new Set(), // the ids the next swing would hit (combat.markTargets), for the renderer's outline (docs/14)
};

// Me, set by the client: a guest's own player, my body for the dead screen.
export function setMe(p) {
  client.me = p || null;
}

// A guest after a frame: the replica keeps each character's object by id, so mine is found again only when it is not
// the one the frame's list holds under my id (a new character, my record arriving after a death).
export function refind(players, id) {
  if (id == null) return;
  if (client.me && client.me.id === id && players.includes(client.me)) return;
  const p = players.find((q) => q.id === id);
  if (p) client.me = p;
}

events.on("playerPicked", ({ player }) => setMe(player));
