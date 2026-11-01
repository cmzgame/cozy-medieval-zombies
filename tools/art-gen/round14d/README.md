# Art round 14d: cave mouths (previews, not wired)

Michael, 2026-10-31: a cave needs a natural opening with rock over it, not the cliff top's straight hard edge. `python gen.py` (about three minutes) imports art round 10's cliff generator unchanged and carves an opening 1, 2, or 3 edges wide through its rock solid, so the strata, lip, moss, and grass lip are the cliff wall's own and a mouth meets a plain cliff edge with no seam.

- **Openings.** Ragged, lower than the stone arches: crowns at 58, 61, and 62 px. Rock teeth hang from the top. The opening flares toward the camera. The jambs and soffit through the wall's thickness are shaded darker the further in they go. The brow over the opening juts up to 3.5 px.
- **Frames.** They follow art round 14a's arches: n runs are 49 + 32(n-1) by 121 + 16(n-1) with the anchor at (8, 100); w runs have the anchor at (40 + 32(n-1), 100). So `render/walls.js` `gateSlice` cuts them unchanged.
- **Files.** `out/wall_cliff_mouth_{1,2,3}_{north,west}.png`, plus the grassy `wall_cliff_grass_mouth_*` set.
- **Previews in `look/`:**
  - `pieces_3x`: the pieces alone.
  - `mouths_rock_n_2x` and `mouths_grass_w_2x`: in a hill.
  - `inside_*_2x`: inside the cave as drawn today, and with the proposed cut (the near walls down to the 8 px stub, the roof hidden).
- **The cut view's far walls** are round 10's own pieces drawn as if the cave were a pit (the plateau all round it). Wiring needs that too: today a cave's inner walls, with plateau on both sides, are buried and drawn as nothing.
