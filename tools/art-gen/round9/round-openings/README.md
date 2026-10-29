# Art round 9: doors and windows in a round stone wall

Drawn on the curve for `docs/50`'s rings, 5 and 7 across, stone. Not wired: for Michael's approval first.

Run `python gen.py` (Python 3, numpy, PIL; deterministic, about 40 s). It writes `out/r5/`, `out/r7/`, `manifest.json`, `preview.png`, `preview_states_5.png`, and `preview_states_7.png`. It reads two files from the repository, and only for the preview: `wall_stone_north_plain.png`, which the engine wraps round the ring, and `floor_stone_*.png`.

## What is drawn

- **The frame** (`frame`): dressed stone in the Fireplace's warm grey, set on the curve with nothing square.
  - Quoins up each jamb, long and short by turns.
  - A seven-stone arch over a door and a five-stone arch over a window, with a taller keystone 3 px proud.
  - A threshold slab under a door, or a deep sill under a window.
  - The stones stand 2 to 3 px proud of the face, so their tops and ends show. The frame is outlined in `#2b2522`.
  - The frame fills the engine's hole, which is a whole tile edge wide, down to a clear opening of 20 px for a door and 16 px for a window (the straight wall's widths). Its stones run past the hole's ends, so they cover the pixel or two where the curve leaves the edge.
  - Its arch has a round head: the springing at 54 (door) or 56 (window), the crown at 64 (`DOOR_TOP`, `WINDOW_TOP`).
- **The reveal** (`reveal`): the wall's 16 px thickness inside the opening. It is the one jamb face the camera can see (a radial plane) plus the opening's floor (the threshold's top, or the sill's). It is the ring's own stone courses.
- **Door**:
  - `shut`: a plank leaf curved with the arc, its top arched, outlined on its inner edge. The camera sees iron straps and a ring pull on the near points (outside), and battens, a Z brace, and a ring pull on the far points (inside).
  - `open`: the leaf swung out square to the curve from the opening's +angle end, standing radially, as `rings.js` places it.
  - `open_a0`: the same leaf hinged at the other end (see "Weak").
  - `broken`: the hinge side's planks torn off jagged, the lowest strap still on, the breaks in fresh wood.
- **Window**:
  - `shut`: two arched shutters on the curve.
  - `open`: near points only. The shutters are folded back flat on the outer face over the jamb stones, showing their battens.
  - `broken`: a stub of each shutter.
- **Boards** (`boards_out_1..3`, `boards_in_1..3`): rough grey-tan planks, straight, tilted, and nailed; `out` on the ring's outer face, `in` on its inner face.
  - Those on the face the camera sees stand 5 px off it, clear of the frame.
  - Those on the other face are drawn too, but only a few pixels of them show through the opening (see "Weak").

## The door points and the faces

The points are **n 270, e 0, s 90, w 180 degrees** (`rings.js` `DOOR_ANGLES`). On screen they are the ellipse's four diagonals: n top right, e bottom right, s bottom left, w top left. The brief's "leftmost, rightmost, topmost, bottommost" are not these points, though its parenthesis ("the screen diagonals") is right. I followed `docs/50` and `rings.js`.

- **e and s** are on the near half. The camera sees their **outer** face, and their pieces fade with the near half when the player is inside (`fades_with_near_half`).
- **n and w** are on the far half. The camera sees their **inner** face, from inside and from outside alike (over the near half, the ring having no roof).
- No other face is ever seen, so none is drawn. The shut leaf sits 2 px in from the face seen, as the straight wall's leaf does.
- Far open shutters would lie on the outside of the wall and can never be seen, so there is no `n_window_open` or `w_window_open`.

## Anchors

`manifest.json` has a row for every PNG:

- `offset` is the PNG's top-left in screen px from **the ring's centre on the ground**: `iso.toScreen(cx, cy)`, the centre tile's centre (a whole pixel). `anchor_px` is the same point inside the PNG (`-offset`).
- To draw a piece, set its top-left at `round(toScreen(cx, cy)) + offset`.
- For the size, point, kind, and state of each piece, read the `size`, `point`, `kind`, and `piece` fields.

## Depth (which plane each piece sits on)

`depth_plane` gives two ground points in tiles from the ring's centre, ready for `depth.planeThrough(cx + x0, cy + y0, cx + x1, cy + y1)`. The preview composites by exactly these planes against a per-pixel copy of the engine's segment planes.

| piece | plane | why |
|---|---|---|
| `reveal` | the jamb face's own radial plane | a body in the doorway stands in front of the far jamb's reveal and behind the near jamb |
| `shut`, `broken` | tangent at the door point, 1 px in front of the leaf | behind the frame, in front of nothing else in the opening |
| `open`, `open_a0` | the leaf's own radial plane, hinge to free edge | as `rings.js` |
| `frame` | tangent at the door point, **3 px outside the outer face** on e and s, **4 px inside the inner face** on n and w | a convex face falls behind its tangent, and a concave face rises toward it only at the frame's ends; at those offsets the plane is in front of the face across the whole frame, so the voussoirs win over the band above the hole |
| `window_open` | tangent, 4.5 px outside the outer face | over the frame's stones |
| `boards_*` | the boards' own straight plane, 5 px off the face | in front of the frame (the keystone is 3 px proud) |

`layer` gives the order within the half's drawable when two pieces tie: reveal 0, leaf 1, open leaf 2, frame 3, open shutters 4, boards 5.

How the pieces map to the engine:

- **Frame and reveal:** drawn for any door or window at a door point, in every state.
- **Shut door:** `shut` when not open and not broken.
- **Open door:** `open` when `open`, not broken, and not boarded (`rings.js`'s rule for the swung leaf).
- **Broken door:** `broken` when broken.
- **Window:** `shut` when `shutter === "closed"` and not broken, `open` when open (near points), `broken` when broken.
- **Boards:** `boards_out_k` and `boards_in_k` from the counts on each side, up to 3. The engine knows which of its near and far lists is the ring's outside.

Light: each piece has its face's tint baked in, the same `rings.js` tint the ring's segments take (1 - 0.18 (1 - cos(look - 90deg)): 1.0 at s and n, 0.82 at e and w). Draw the pieces untinted, or the e and w pieces will be shaded twice. Lighting and fog apply as to any face.

## Weak, or for Michael to rule

- **The east door's open leaf stands across its own doorway.** `rings.js` hinges every leaf at the opening's +angle end. At e that is the left end, and the leaf stands out radially to the lower right, in front of the doorway. At s it swings clear. `open_a0` is the leaf hinged at the other end: it swings clear at e and blocks at s. The best pairing is **e: `open_a0`, s: `open`**. At n and w it hardly matters, since the leaf is outside behind the wall.
- **A far door's swung leaf shows from outside** as a thin dark plank behind the tower's flank, outside the ring's outline: the n leaf at the top right, the w leaf at the top left. It is true to the geometry, but it can read like a stray post.
- **The hidden face's boards barely show.** Seen at an angle through a 16 px wall, a 20 px opening leaves a slit about 4 px wide, so the boards nailed on the face not seen are a sliver. `rings.js` today draws the larger count on the face seen. Both sets are delivered; drawing the seen face's boards for either side reads better.
- **A body standing in the doorway is half hidden by the jambs** at e and s: the wall is 16 thick and the opening 20 wide. This is right for the geometry, and the straight wall does the same at its scale.
- The arched head trims the doorway to 54 px at its sides and 64 at the crown. The figure (55) clears it at the middle.
- The frame is lighter than the ring's stone on purpose, for the chunky Fireplace look. If it reads too pale at e and w, darken `FR` in `gen.py`.
- In the preview, the ground's stepped floor corners poke out past the ring's foot at the diagonals. This is the engine's floor under a ring with no footing (`rings.js`), not these pieces.
- The 55 px figure is preview dev art for scale, not a delivery.
