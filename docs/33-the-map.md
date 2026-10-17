# 33 — The map on M

**Status, 2026-10-18: built whole (#203: the chart, its save and sync part, the wire; #204: the panel).** Scoped 2026-10-13 with Michael (his choices in `02`, "The map's choices, and the long arc"). #203 added `src/chart.js` (cells: surface index in the low byte, the `n` wall's kind in bits 8 to 11 and the `w` wall's in 12 to 15, +8 for a built one; `mapColor` on every floor, tree, and rock sprite, `defIdsWith`), the reveal in `game.begin` (`chart.step`, `world.chartRadius` 24, `visibility.tileVisible`, `p.chartTile`), the re-chart of touched chunks (`map.setTouchHook` from `markDirty`), `chart` in the save (`save.VERSION` 3) and the welcome, the frame's `chart` (changed chunks whole, `net.PROTOCOL` 6; since #237 only the cells that changed, `[cx, cy, [index, cell, ...]]` per chunk, with whole chunks in the welcome, `net.PROTOCOL` 7), and the sync part. #204 added `src/ui/map-panel.js` (`M` toggles it; a panel on the kit with one canvas; each chart chunk drawn once to a canvas of its own at the current zoom and again only when its `v` rises; walls as one-pixel lines along their edges, a built one lighter; a marker per living player at the exact projection, yours gold with an arrow for your facing, the others white, each with a name; three zooms on the wheel about the pointer, a drag pans, the Centre button or a double-click follows you again; the compass; the names of the map's named sets (`info.places`, from `map.loadMap`) once any tile of one is charted, one that would sit on another left out), the Controls screen's M line, the guide's map topic, and `check("chart")` whole (21 rows). Measured (the review of #234): the first reveal in open uncharted land costs 1.4 to 3.8 ms (the spec's bracketed default was under 1 ms, so it is over: a one-off spike inside a 16 ms frame, paid once on arriving in uncharted land); after that a change of tile costs 0.2 to 0.5 ms, about every fifteenth step at walking pace, and standing still costs nothing. A frame carries whole chart chunks and the frontier touches four to six of them each tile, so one walking player is about 14 KB/s to every guest (nothing standing still, and no `chart` field at all in a frame with nothing to say); sending only the changed cells is a follow-up. Two tabs: the guest's walk grows the host's chart and the guest's replica matches, and `check("sync")` passes with the `chart` part. Read `CLAUDE.md` ("Implementing from a spec", and the multiplayer rule first among the rules), then this whole doc, then the files it names, before writing code. The doc decides; a default in brackets is Michael's to overrule, not the implementer's.

## What it is

Press `M` and see the valley: the land, the water, the roads, the buildings, and where every player in the world is right now. It is drawn from the same angle as the screen, the way Zomboid's map is, so **map north is up and to the right**: "I'm map east of you" means the same on every screen. It is low fidelity on purpose (Minecraft's map: one simple colour per tile), and **accurate before pretty**: when you move, your marker moves the same distance in the same direction.

It shows only what has been seen, **by anyone in the world**, and the world keeps it: a friend logging in finds the map you filled in, a new character after a death sees all of it, and nothing is wiped. It never shows the dead or villagers. It shows player-built walls. The world keeps running while it is open, alone as with friends: browsing the map is a risk.

## The rules

Michael's seven are `02` 2026-10-13, "The map's choices, and the long arc", with their reasons; this spec adds to them only its defaults: a built wall [drawn a shade lighter than an authored wall of the same kind]; [a dormant or dead player is not shown]; and the projection it draws in (`iso.toScreen`: `x = (gx - gy) * w/2`, `y = (gx + gy) * h/2`, so the world's north, `-y`, the `n` wall slot, is up and to the right, as on screen). Zoom and pan are in this scope (below); pins, notes, and a death marker are someday, wanted.

## How it works

### The chart (world state)

The world keeps a **chart**: for every tile anyone has seen, what it looks like on the map. It lives beside the map, not in the chunks, because a seen wild chunk far behind is dropped (`map.evictFar`) and the chart must outlive it.

- **Per chunk, sparse:** a chunk with nothing charted has no entry. A charted chunk holds 256 cells. [A cell is two bytes: a surface index (0 is unseen) and the two walls the tile owns, `n` and `w`, four bits each for the wall's kind.]
- **The surface index** comes from a palette built at load from the definitions that carry a new field, **`mapColor`** (`"#rrggbb"`), in a fixed order (sorted by definition id) so host and guest build the same palette from the same data. What a cell shows, in order: a prop whose definition has a `mapColor` (trees, rocks; [furniture, crops, and the rest carry none and show the floor beneath]), else the floor's `mapColor`. Every floor definition gets one (`data/sprites/floor_*.json`: grass, dirt, cobble, farm both ways, water, shallow, wood, stone), and so do the trees and rocks. [A missing `mapColor` on a floor is a validation error; on a prop it means "not on the map".]
- **The wall kinds** [none, wall, door, window, see-through (fence, bars), and a built flag]: read from the edge's wall (`wallBetween`, the wall definition's `seeThrough`, the opening's kind, `wall.built`).
- **Charting a tile** is one function on the chart module that reads the tile through `map.tileAt` and the two walls it owns, writes the cell, and marks the chart chunk changed. Nothing else writes the chart.

### Revealing (on the authority, in the step)

Sight on screen is the client's (`main.js` casts `visibility.computeVisible` over the viewport for the fog), and the host does not know a guest's window or zoom. So the chart is revealed by its own cast, in the world's step, on the host, for every player alike:

- In `game.begin`, after `map.ensureAround` for each player: if the player's tile has changed since their last reveal (a field on the player, [`p.chartTile`]), cast `visibility.lineOfSight` from their tile to every **not yet charted** tile within [24 tiles, `tuning.json` `world.chartRadius`: about the widest zoom's reach], with the same four-corner rule `computeVisible` uses (export `tileVisible`, or reuse `computeVisible` over the uncharted tiles), and chart each tile that passes. [Light is ignored: a tile in line of sight is charted by night as by day.] The radius sits well inside the four-chunk growth ring, so the cast never reads an ungrown chunk (reading never grows; `check("growth")`).
- **Already charted tiles are kept current by their changes, not by recasting:** when a mutator touches a tile (`map.touch`), its chunk's charted cells are re-charted at the next `begin`. `map.touch` already names the chunk for the wire's touched set; give the chart its own set fed by the same call (the wire's set is drained by `net.hostAfterStep`, and in a lone world it is drained with nobody to tell). So a wall built, a door opened, a field tilled, a tree felled, a rock mined shows on the map without anyone recasting. [A change in a charted place nobody is looking at still shows: the map is the world as it is wherever it has been seen, not a snapshot of when.]
- **A wall is charted when a tile on either side of it has been seen** (#234): a cell holds the walls its tile owns (`n`, `w`), but a building's north and west faces belong to tiles inside it, which are seen from outside only across the face, so a seen tile also charts the two faces it shares with the tiles south and east of it, and the cell of an unseen tile may hold walls with surface 0 (`chart.refresh`). A face is never charted for a tile on neither side of which anyone has looked. **A change within reach looks again:** a player recasts when their tile changes **or when a map chunk within `ceil(chartRadius / 16)` chunks of theirs was touched** since the last step (a door opened, shutters, a wall taken down, standing still), so what the opening shows is charted at once.
- Once a region is charted, the cast checks nothing there: the cost falls to near zero in explored land. Measure the cast with the debug corner's step cost and `tools/profile.js`: [under 1 ms for a reveal with everything round the player uncharted].
- A dormant player reveals nothing; a dead one reveals nothing.

### What travels (the guest's side, rule 3 of `31/08`)

- **The save:** `game.serialize` gains `chart` (the charted chunks, [each as one compact string, base64 of its cells]), and `restore` puts it back. Bump the save's version (`save.js`) and `net.PROTOCOL` by hand, as the checklist says. Measure a save's size before and after.
- **The welcome** is the save, so a guest arrives with the whole chart.
- **The frame:** the chart cells changed since the last frame, as a new field [`chart`] (per chunk `[cx, cy, [index, cell, index, cell, ...]]`, #237; the whole chunk is the save's and the welcome's), sent when there are any. Read the bytes it adds from `net.status().wire` while a guest walks open, uncharted land and when standing still (it should be nothing).
- **The sync check:** `game.syncParts` gains a `chart` part (the charted chunks sorted, hashed).
- **The guest's own map** draws from its replica's chart and its replica's players. It never charts anything itself.
- **Players' positions:** a guest has every player today (`frame.players`, the whole world is sent). When interest regions are built (`31/04`, not built), every player's position must still reach every guest for the map: [a list of ids and positions, a few bytes each, in every frame]. Note this beside the interest work; nothing to build now.

### The panel (the client)

`src/ui/map-panel.js`, DOM over the world as every panel is (never drawn into the world's canvas, `CLAUDE.md`): a 2D `<canvas>` inside a panel on the kit (`ui/kit.js`, the stone frame, a header "MAP" with the X), [centred, about four fifths of the window].

- **`M` toggles it.** Escape closes it, in the Escape order before the pause menu and after every other panel (**built: the map sits under the bag, the stations, and the build palette, `z-index` 6 against their 7, so what is opened over it is seen, and Escape closes that first**; #235). Movement keys still walk the player while it is open (the risk is the point); the mouse over the panel goes to the map, not the world.
- **Drawing:** each tile a diamond `w` by `h` pixels in its surface colour at the map's zoom (three steps, [`h` = 2, 4, 8, so 4 by 2 to 16 by 8 pixels a tile; the valley is 2048 by 1024 at the middle step]); each wall a line along its edge (`n` is the diamond's up-right side, `w` its up-left) in its kind's colour; unseen tiles the panel's dark. Draw a chart chunk to its own small canvas once and redraw only the chunks that changed (the chart module says which), then compose. No smoothing anywhere (`imageSmoothingEnabled = false`, `image-rendering: pixelated`).
- **Markers:** a dot for each player at their exact position (fractional, through the same projection), with their name beside it (`names.js` has the name); your own in gold with a small arrow for your facing, the others in white [colours to taste]. Updated every frame from the replica (on the host, from the world).
- **Zoom and pan:** the wheel over the map zooms between the three steps about the cursor; a drag pans (never past the charted land and a margin of eight tiles; a drag released outside the window stops); it opens centred on you, and a "Centre" button in the header (or a double-click on the map) brings you back; **`Space` is not bound, it is the shove** (built: the world runs and the player can still fight with the map open).
- **A compass:** a small "N" arrow in a corner pointing up and to the right, so "map north" is never a guess (Michael's brother).
- **Place names:** a set in the map file has a `name` ("your cottage", the inn, the chapel); [the name is drawn at the set's centre once any tile of it is charted, in the kit's font, small]. Nothing else is labelled.

## Build order

Each step verified in the browser pane through `window.__game` with `loop.setPaused(true)` and `loop.advance(1/60)` before the next; `?nosave` on the URL; `node --check` on every touched module.

1. **The chart, alone.** `mapColor` on the floors, trees, and rocks; the palette; `src/chart.js` (no DOM, runs under `node tools/world.js`) with the cells, chart one tile, the changed set, serialize and restore; the reveal in `game.begin`; the re-chart on touch. Verify from the console: walk, read cells; stand outside a shut cottage and find its inside uncharted; open the door and find the room charted as you look in; build a wall in sight and find its cell; `node tools/world.js` hash unchanged (the chart is not in `hashText`).
2. **The save and the sync check.** `chart` in `serialize` and `restore`, the version bumps; `syncParts` gains `chart`; `node tools/world.js --roundtrip` still proves the save.
3. **The wire.** The changed chart chunks in the frame; the guest applies them to its replica's chart. Two tabs (`?nosave&relay=none`, `__game.net.open({ join })`, both stepped in turn): the guest walks into uncharted land, the host's chart grows, the guest's matches; `check("sync")` passes; the bytes read.
4. **The panel.** `M`, the drawing, the markers, the zoom and pan, the compass, the names. Verify in both tabs: each sees both players' markers move; the world's clock advances while the map is open in a lone world.
5. **The check and the docs.** `tools/checks/chart.js` (below), `CLAUDE.md` (the code map, the key, the check), `README` (the key), `TODO.md`, and any ruling the build forced in `02`.

## Acceptance (`await __game.check("chart")`, plus the two-tab rows by hand as `check("sync")` is)

1. A fresh `?nosave` world has charted the spawn's surroundings after one step and nothing beyond the radius.
2. A tile behind a shut wall is not charted; opened, the tiles now in line of sight are.
3. A wall built in a charted place changes its cell on the next step, with the built flag; removing it changes it back.
4. A tilled tile and a felled tree change their cells.
5. A wild chunk dropped by eviction keeps its chart, and the chart is unchanged when the chunk grows back.
6. `serialize`, `restore`, `serialize` gives the same chart; a new character made after a death in the same world has the whole chart (it is the world's).
7. With the map open in a lone world, `loop.simTime()` advances; the player walks on keys.
8. A marker's position on the panel equals the projection of the player's `gx, gy` at the current zoom and pan, within a pixel, standing and after walking.
9. No marker is drawn for any of the dead or any villager.
10. Two tabs: the guest's walk reveals on the host and the guest's replica chart matches; `check("sync")` passes with the `chart` part; each tab shows the other player's marker moving; the frame's added bytes are reported.
11. The reveal's cost in open uncharted land is reported from the profile.

## Not in this scope

Pins and notes, a death marker, a map as an item you carry, other players' sight shown, the dead ever shown, fog by light, a minimap on the HUD.
