# Art round 14a: a 1-wide castle gate, and plain stone arches 1, 2 and 3 wide

Michael, 2026-10-29 (#571): "a portcullis that is just 1 wide as well, like a tall arched door, with a not very wide gate. And also on each of the 1/2/3 wide openings minus the gate or gate functionality, it is just a stone arch."

`python gen.py` writes `out/`, `look/`, `manifest.json`, the draft definitions, `preview.png` and the `preview_*` files (numpy and PIL, deterministic, about a second). Nothing is wired. Every PNG is checked for hard alpha (0 or 255).

## How it is drawn

- **Round 12's generator, made general.** `gen.py` is round 12's `gates/gen.py` with the ring's thickness, the keystone's size and the bar pitch as parameters. The generator carves round 12's 2-wide and 3-wide frames again and **asserts they match the repo's approved PNGs byte for byte** (`data/art/village/gate_stone_{2,3}_{north,west}_frame.png`). So the new pieces share the same code, palette, dressed stone, depth bands, arris, soffit and iron.
- **The 1-wide arch** is one segment of `wall_stone_{north,west}_plain.png` (49 by 121) with a tall pointed lancet carved out of it:
  - The opening is u 6 to 26, so 20 across: the style bible's doorway, "like a tall arched door".
  - The piers are 6 px and the voussoir ring is 6 px thick, with 3 voussoirs a side and a wedge keystone that reaches 9 px over the crown.
  - The arch springs at 60 and peaks at the same 78 crown as the 2- and 3-wide.
  - Round 12's 8 px ring with 8 px piers would leave only 16 across, which is narrower than a door, so the ring is 6 here.
  - The cap, the course joints and the 96 px height are the plain wall's own pixels, so it joins `wall_stone` with no seam.
- **The narrow portcullis** is round 12's grille cut to the lancet:
  - 3 verticals at round 12's 7.5 px pitch (offsets 0, 8, 15), 3 px wide, each with its spike.
  - Crossbars every 10 px, with a rivet at each crossing.
  - Same plane (v = +6), iron tones, and west run 14% darker.
  - Same three frames: closed (points at 0), mid (29), raised (58, so the points hang 2 px under the springing and 3 px over a 55 px head).
  - The last bar ends exactly where the far jamb starts hiding the grille, so no crossbar stub pokes out past it.
- **The arches are the gates' stone with no iron.** Round 12 carved no portcullis groove and no slot shadow, so there was nothing to take away. Each `arch_stone_N_<side>.png` is **byte-identical** to the gate frame of the same width: `gate_stone_1_*_frame.png` here, and round 12's `gate_stone_{2,3}_*_frame.png`. What makes an arch read differently in play is that an open gate always shows its raised grille in the arch top, and an arch never does.

## Files (`out/`, each meant for `data/art/village/`)

Anchors are px from the PNG's top-left to the top vertex of the first edge at ground (`wall_stone.json`'s convention). "First edge" means the smallest tx on a north run, or the smallest ty on a west run.

| file | size | anchor |
|---|---|---|
| `gate_stone_1_north_frame.png` | 49 x 121 | 8, 100 |
| `gate_stone_1_west_frame.png` | 49 x 121 | 40, 100 |
| `gate_stone_1_north_leaf_{closed,mid,raised}.png` | 18x79, 18x50, 18x21 | 0,65 (all three) |
| `gate_stone_1_west_leaf_{closed,mid,raised}.png` | 18x79, 18x50, 18x21 | 18,65 (all three) |
| `arch_stone_1_north.png` / `_west.png` | 49 x 121 | 8,100 / 40,100 |
| `arch_stone_2_north.png` / `_west.png` | 81 x 137 | 8,100 / 72,100 |
| `arch_stone_3_north.png` / `_west.png` | 113 x 153 | 8,100 / 104,100 |

The frame names follow round 12:
- **Gate sheet:** `north_gate` and `west_gate`.
- **Parts sheet:** `leaf_<north|west>_<closed|mid|raised>`.
- **Arch sheets:** also `north_gate` and `west_gate`, so `render/walls.js` `gateSlice` (which builds the name `${side}_gate`) cuts them unchanged.

`look/arch_stone_*_opening_mask.png` marks the transparent hole. The 1-wide's see-through is small: a thick wall and a narrow door leave about 4 px of corridor, the same as the stone door's.

**Arch geometry** (world units; the same in both runs; also in `manifest.json`):

| | 1-wide | 2-wide | 3-wide |
|---|---|---|---|
| opening | u 6 to 26 | u 8 to 56 | u 8 to 88 |
| springing / crown | 60 / 78 | 38 / 78 | 34 / 78 |
| radius | 21.2 | 45.33 | 44.2 |
| ring | 6 | 8 | 8 |
| bars | 3 | 7 | 11 |

The previews:
- **`preview.png`** has everything on one sheet.
- **`preview_3x_gate1_{n,w}.png`**: the 1-wide gate shut, halfway and raised, in a run of plain wall.
- **`preview_3x_arches_{n,w}.png`**: the three arches, each with a figure.
- **`preview_3x_gates_shut_{n,w}.png`**: the new gate shut beside round 12's two, shut.
- **`preview_1x_run_{n,w}.png`**: one long wall holding all of it, with round 12's gates raised for comparison.
- **`look/strip_{n,w}.png`**: the pieces alone at 3x.

## Draft definitions (in this folder, not in the repo)

- **`wall_stone_gate_1.json`** and **`wall_parts_gate_stone_1.json`**: round 12's wired sheets with `span: 1`, the new opening, and `tips` [0, 29, 58]. The flags are copied from `wall_stone_gate_2`: `grille`, `deadBreak`, `hp 300`, `bitesPass: false`, `shotsPass`, `fireSpreads: false`, `swing 1.2`. The wired 2/3 sheets say tips [0, 30, 60], but round 12's art was drawn at 0, 29, 58; the numbers here are the drawn ones.
- **`wall_stone_arch_{1,2,3}.json`**: a castle gate with no `parts` and no `leaf`. The `gate` block holds `kind: "arch"`, `span`, `opening`, `name` and **`always: "open"`** (new), plus `deadBreak: false`, `bitesPass: true`, `shotsPass: true` and `fireSpreads: true`.

## Engine support

### The 1-wide gate: data, plus one fix

`map.gateMembers`, `gateStart`, `gateProblem`, `buildGate`, `removeGate` and `setGateOpen` all loop over `span` and work for 1. `walls.js` `gateSlice` with k = 0 takes the whole 49 x 121 frame. `emitGateLeaf` with span 1 has no column cut and draws the whole leaf. What is missing:

1. **`placement.js` `gateRunAt`:** `back = span === 3 ? 1 : along < 0 ? 1 : 0` puts a span-1 gate on the neighbouring edge whenever the cursor is on the edge's first half. It needs `span === 1 ? 0`.
2. **Data:**
   - a `data/build.json` entry `gate_stone_1` (kind `gate`, group Castle, dev, Free building, like the 2 and 3);
   - the two sheets and their `data/manifest.json` lines;
   - the PNGs in `data/art/village/`.
3. **`tools/checks/gates.js`:** it hard-codes `[2, 3]` and `span === i + 2`, so it needs the 1 added.
4. **Comments:** "2 or 3 edges" in `map.js`, `walls.js` and `docs/sprite-definitions.md`.
5. **Michael's lever:** `hp` is 300 an edge, so a 1-wide gate has the same health per edge as the others (the gate gives way whole).

### The arches: proposed as an always-open gate (door kind), not a new wall kind

**Why a door-kind gate.** An arch is N door-kind walls with `gate: { i }`, `open` true, and a rule saying it never shuts. Every path that reads a door then reads it correctly, with no new code:
- **Bodies:** `wayOpen`.
- **Sight and light:** `transmission` is 1.
- **Rooms:** `fillRegion` lists it as an opening, and `roomSealed` sees it open, so a room with an arch is never sealed, which is right by the cell law.
- **The dead:** they path through it; `needsBreaking` is false and `gateHolds` holds.
- **Reach:** `blocksReach` passes.
- **Shots:** they pass under `opening.crown` (`gateShotHeight`, `archery.wallStops`).
- **Building and removal:** `buildGate`, `removeGate` and the "under" wall restored.
- **Drawing and sync:** the per-edge slices, the cut and fade as one unit (walls.js 443), and the post rule (`wall.run`). Save, wire and sync carry `open` already. `emitGateLeaf` returns at once when there is no `parts`.

A new `kind: "arch"` would need a branch in every `kind` switch: `wayOpen`, `transmission`, `wallVariant`, `createWall`'s hp, `fillRegion`, `wallStops`, interact, placement, boards and the save. That is far more surface for the same behaviour.

**What is missing for an always-open gate:**
1. **`map.buildGate`:** set `wall.open = true` when `rule.gate.always === "open"`. Better still, make it rule-driven so no state can go stale: `wayOpen` and `transmission` true for an always-open gate whatever `wall.open` says.
2. **Never shut:**
   - `map.setGateOpen` refuses an always-open gate.
   - `interact.openingActions` offers no "Close gate" for it.
   - `openingsAtScreen` and `openingsNear` should skip it, so E and the hover menu do not treat it as a door.
   - Any other code that shuts doors must leave it alone; I found none besides interact, but grep `open = false` when wiring.
3. **Boards:** none, because `addBoard` already refuses gates. Whether an arch may be boarded up is Michael's call.
4. **Placement and data:** `build.json` entries `arch_stone_{1,2,3}` (kind `gate`, which needs the `gateRunAt` fix above for the 1). The wording "Stone gate" in the hint and menu should read "arch". `sound-cues.js` plays no creak, since `open` never changes.
5. **`tools/checks/gates.js`:** rows for an arch: built open, E does nothing, sight, bodies and the dead pass, a room with one is unsealed, and a guest's build command builds one.
6. **Atlas (optional):** the arch PNGs are byte-identical to the gate frames, so the arch sheets could point at `gate_stone_N_*_frame.png` instead of adding six pictures. I delivered separate files so either can change later without the other.

## Weak points

- **The 1-wide passage is mostly reveal.** In a 16-thick wall a 20-wide opening leaves only about 4 px of see-through, as the stone door does. A figure standing in the middle of the passage is hidden by the reveal (front-plane depth) except for a sliver, so the previews stand it in the mouth. The closed grille therefore shows against dark reveal stone, not the world behind; the iron still reads by its highlight tone.
- **The arch ring is thinner on the 1-wide.** At 6 px against 8, its voussoirs read more quietly at 1x than round 12's. This is the price of a door-width opening in one edge.
- **The arches add no new stonework.** "Minus the slot shadow" is a no-op, because round 12 drew no slot.
- **Mid and raised use round 12's heights.** The 1-wide's raised grille shows only the lancet's top 18 px: one point row and one crossbar. It inherits round 12's single middle frame.
- **The preview figure** is round 12's: the plain body with no hair, 53 px.
