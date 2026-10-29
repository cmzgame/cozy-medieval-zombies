# Art round 12: two castle gates (2 and 3 tiles wide) in the village's stone wall, with a three-frame portcullis

`python gen.py` writes `out/`, `look/`, `manifest.json`, the draft definitions, `preview.png` and the `preview_*` files (numpy and PIL, deterministic, a few seconds). Nothing is wired. Every PNG is checked for hard alpha (0 or 255).

## How it is drawn

- **The wall piece is the village's own wall.** `wall_stone_{north,west}_plain.png` is composed N segments long (so the cap, face bricks, course joints, end face and 96 px height are the wall's own pixels), and an arch is carved out of that block by a per-pixel ray march in the wall's own space (run u, depth v, height z). Pixels outside the dressed stone and the opening are byte-identical to N plain segments side by side, so the gate joins the neighbouring `wall_stone` with no seam (the cap runs straight over the arch).
- **Carved surfaces** (what the camera sees through the opening): the near jamb's reveal is copied from the wall's own end face and darkened in three depth bands (mouth, middle, back: 1.0, 0.84, 0.70); the arch's underside (the barrel's left half, the only half a camera from above can see) is end-face stone with the voussoirs' joints running across it. The ground and the far side are **transparent** so the world shows through. A dark arris (`#3b3734`, the wall's own outline tone) runs along every edge that borders the hole.
- **Dressed stone** (front face only): jamb quoins (a course per 8 px, aligned to the wall's own course joints, `z = 0.25 + 8k`), an 8 px voussoir ring with radial joints, and a wedge keystone; tones are the wall's own lighter ones (n: `857f78 938d85 99938b`, joint `57524d`, highlight `a19b92`; w, the shaded face: `6b6661 75706a 7b7670`, joint `3b3734`).
- **The portcullis is a separate flat iron grille** 2 px behind the face (plane v = +6; the face is +8), already clipped to what the arch lets be seen, so it is drawn **after** the wall piece with no depth test needed. Bars 3 px (highlight, body, dark: `7a7a86 4c4c58 2d2d36`; the w run 14% darker), a vertical every 7.5 px (7 bars in the 2-wide, 11 in the 3-wide), a crossbar every 10 px (3 px thick, first one 8 px over the points), a rivet where they cross, and every vertical ends in a 3 px taper to a 1 px spike. Open pixels between the bars are alpha 0.

## The arch (world units; same in both runs)

| | 2-wide | 3-wide |
|---|---|---|
| gate run (edges) | 64 (2) | 96 (3) |
| opening | u 8 to 56 (48 wide) | u 8 to 88 (80 wide) |
| jamb piers | 8 each | 8 each |
| springing / crown (intrados) | 38 / 78 | 34 / 78 |
| arch | pointed, radius 45.3 | pointed, radius 44.2 |
| ring / keystone | 8 / wedge to 11 | 8 / wedge to 11 |
| see-through corridor (opening minus the 16 thick wall) | 32 | 64 |

I made the openings 48 and 80, not 56 and 88: the voussoir ring is 8 thick and must fit inside the gate's own picture, so a pier of 8 on each side is the least that works (a 4 px pier would cut the ring off at the springing). The figure is 23 px wide and 55 tall, a door is 20: 48 is generous. The portcullis frames: points at z = 0 (closed, grille fills the arch to the crown), 29 (mid), 58 (raised: points hang 3 px over a 55 px head and 20 under the crown; the grille still fills the arch's top 16 px and shows a crossbar). Note that in the iso view a bar at v = +6 appears about 4 px lower than the same height at v = -2, so a figure standing in the passage has the bar tips visually touching its head; that is the view, not the art.

## Files (`out/`; each is meant for `data/art/village/`)

Anchors are in px from the PNG's top-left to the **top vertex of the gate's first edge at ground** (the convention of `wall_stone.json`; the wall's own anchor is (8,100) n and (40,100) w for one segment; for N segments the w anchor moves to 40 + 32(N-1) because the run grows down-left). "First edge" = smallest tx for n, smallest ty for w.

| file | size | anchor |
|---|---|---|
| `gate_stone_2_north_frame.png` | 81 x 137 | 8, 100 |
| `gate_stone_2_west_frame.png` | 81 x 137 | 72, 100 |
| `gate_stone_3_north_frame.png` | 113 x 153 | 8, 100 |
| `gate_stone_3_west_frame.png` | 113 x 153 | 104, 100 |
| `gate_stone_2_north_leaf_{closed,mid,raised}.png` | 46x85, 46x56, 32x27 | -2,58 / -2,58 / -10,58 |
| `gate_stone_2_west_leaf_{closed,mid,raised}.png` | 46x85, 46x56, 32x27 | 48,58 / 48,58 / 42,58 |
| `gate_stone_3_north_leaf_{closed,mid,raised}.png` | 78x96, 78x67, 56x34 | -2,53 / -2,53 / -11,53 |
| `gate_stone_3_west_leaf_{closed,mid,raised}.png` | 78x96, 78x67, 56x34 | 80,53 / 80,53 / 67,53 |

Both runs are delivered (the engine mirrors nothing, and the n face is lit, the w face shaded, so a mirror would be wrong). `look/*_opening_mask.png` marks the hole (white = transparent opening in the frame picture; 2319 / 2343 / 4632 / 4672 px).

**The opening, for the engine:** the hole is the gate's front-face aperture, u in [8, 56] (2-wide) or [8, 88] (3-wide) along the run from the first edge's start, z from the ground to the arch (springing 38 or 34, crown 78), through the wall's whole 16 thickness. As edges: the opening starts 8 px into the first edge and ends 8 px before the end of the last (2 or 3 edges); the two 8 px piers are solid wall. Its walkable width is the whole gate (every owned edge is a way through when open). The draft sheets carry this in `wall.gate.opening`.

## Draft definitions (in this folder, not in the repo)

`wall_stone_gate_2.json`, `wall_stone_gate_3.json`: shaped like `wall_stone.json` (`anchorVertex: "top"`, `images`, `anchors`, a `wall` block: height 96, thickness 16, material stone, `post: post_stone`, `parts`), with frames `north_gate` and `west_gate` and a new `wall.gate` block (span, opening, leaf plane, frame list). `wall_parts_gate_stone_{2,3}.json`: the parts sheet like `wall_parts_stone.json`, frames `leaf_<north|west>_<closed|mid|raised>`. `wall.run: "wall_stone"` is the new field the post rule needs (below).

## Engine support these need (none of it exists; read from `src/map.js`, `render/walls.js`, `light.js`, `interact.js`)

**1. A gate spans N edges.** Today a wall, door or window is one edge's object and the picture is 49 wide. Precedent: a painting's `span: 2` with a `cover` record on the second segment (`map.nextAlong`, `removeHanging`). Suggest: the gate is N door objects on N consecutive edges of one run, each with `gate: { i, n, sprite }`; the object with `i = 0` draws the whole N-wide picture and the others draw nothing; the build tool places and the removal tool removes all N together (every edge free of props, both tiles walkable as `canBuildWall` requires for a door, `stairEdgeProblem` per edge); `open` is one state for the group, so `interact`'s toggle (`openingActions`: `w.open = !w.open`) sets all N and touches all N chunks; `game.serialize`/`restore`, the chunk delta and `syncParts` carry `gate` on each edge; a guest opens it by the owner edge's address through the same verb.

**2. The renderer draws an N-segment picture.** `emitDrawnWall` assumes a 32-long segment: `emitCapFromFrame` redraws the cap from the frame for one segment's corners (32 + margin), so the cap past the first segment would not get the sky light; `emitCutWall` (the faded near wall, with its cuts at both ends) and `partBelow` (a wall under a floor) and `depth.wallSurface` (the face plane, the end plane at the camera-side end, tile of the last segment) all need a `span`. The gate's near-wall fade is one unit (fade the whole gate together).

**3. No post inside or at the ends of a gate.** `postBase` draws a post wherever two walls of different `sprite` meet (`sameRun`), so a gate beside `wall_stone` would grow a post at each end over the piers, and N=2 or 3 would put one inside the arch. `sameRun` should compare a `wall.run` key (`"wall_stone"` for the gate sprites) instead of `sprite`, and the interior vertices of a gate (same owner) never get a post.

**4. The leaf layer.** Draw `leaf_<side>_<state>` from the parts sheet after the wall piece (as the open door's near leaf is) at the same anchor point; clipped already, so no depth is needed; the grille's true plane is v = +6 (`depth.leaf` style: 2 units behind the face) if a figure should pass in front of it. State by the group's `open` plus the swing: the existing `swingLeaf` plays two in-between leaves for 0.24 s (`leaf_<o>_30`, `_60`); the gate has **one** middle frame, so use `mid` for both steps (or a third frame owed). The closed frame is `open = false`; the raised is `open = true`; mid plays while it moves (about a second would suit a portcullis; the door's 0.24 is fast).

**5. The portcullis is see-through when closed but blocks bodies: new rules.** Doors start closed and block sight and bodies (`transmission`: `wall.open || wallRule(sprite).seeThrough`). The nearest existing thing is a fence gate (`wall.seeThrough: true`, `fence: true`), which passes sight when shut and blocks bodies, but it is the wrong fit in four ways, so the list is:
   - **Sight and light:** a closed portcullis transmits 1 (`transmission`, `blocksSight`; `light.js` portals use `transmission`, so it lets the portal light through). Needs its own rule flag (say `wall.grille: true`), not `seeThrough`, because:
   - **Rooms:** `seeThrough` walls bound no room (`fillRegion`: "a region closed by fences is outdoors"). A castle keep or gatehouse closed by a portcullis should stay a room (sealed room law, cell law), so the flag must pass sight but still bound the fill; it is also an `openings` entry of the room (light portal, `roomSealed` would read it as a shut door).
   - **Bodies:** `blocksMove` stays as a door's (`!wayOpen`: open or broken passes). Pathing, `canStep`, the dead's `fenceAhead`, `breachTarget` already work per edge, so N edges give N blocked cells.
   - **The dead:** every door breaks (`DOOR_HP`) and a fence has `fenceHp`. Michael's call whether the iron grille is breakable. If not: `hp: Infinity`, `needsBreaking` false for it, and the dead's `wayIn` must skip it (they would otherwise path to it and loop; compare a plain wall, which they never target); the dead at a closed grille can still bite a player in reach across it (as at a fence, `fenceBiteExtra`), and a player can fight them through it (a ruling).
   - **Projectiles:** `archery.wallStops` stops a flight at the wall's height for any non-open edge. A closed grille should let arrows, throws and fire pass (or a chance), a ruling; the 78 px opening height above the 24 to 64 band matters here.
   - **Boards:** none (`addBoard` refuses `isFence`; add the grille to that test). No window kind; E toggles it from either side (Michael may want a lever or winch later, `docs/05`).
   - **Law check:** "doors block sight and bodies" becomes "a portcullis blocks bodies, not sight". "Never harder on a clock": nothing here changes with time.

**6. The click target.** `interact.openingsAtScreen` uses a box of about 26 px each side of each edge's midpoint and `WALL_FACE` tall; with N owned edges the boxes already cover u 0 to 64 (and 96), and the 78 px arch is under the 96 face, so each edge answers; the menu should name the gate, not "door" (`openingActions` says door/shutters).

**7. Building one.** The build/placement tool needs a "castle gate (2 wide / 3 wide)" piece that is stamped over N consecutive plain stone edges of one run (like a door stamped over a wall: `canStampOver`, `buildWall` remembers `under` per edge so removal restores N plain walls), and the cost (stone? iron bars?) is a ruling (`docs/42-levers.md` line).

**8. Light and depth maps.** None delivered (docs/52 says the walls carry none); the reveal and the underside are painted on the front-plane depth like the doors' frames.

## Weak points

- The opening is 48 / 80, not Primary's 56 / 88 (reason above); wider means a larger gate than 2 or 3 tiles of ring and pier.
- The barrel's right half and the back arch are not visible from this camera, so only the left half's underside shows (which is physically right).
- One middle frame, not two (the swing mechanism plays two). Say if a second is wanted.
- The raised grille shows only the arch's top 16 px (a point row and one crossbar): lifting the points higher than 58 would put them over the figure's head; lower would touch it. The figures in the preview are the plain skin body (no hair), 53 px.
- In the iso view the leaf at v = +6 is drawn 4 px lower than a figure's head at the same z standing behind it; this is correct occlusion but reads as the bars touching the head in the passage.
- The reveal copies the wall's end-face bricks, so its vertical joints repeat at both jambs; fine at 1x.
- The stone floor under the preview's road is `floor_stone` standing in for cobbles (the cobble is a generated placeholder).
