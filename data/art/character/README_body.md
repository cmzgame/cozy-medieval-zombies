# The body, round 4 (2026-10-12)

The drawn character body for `docs/25-character-art-brief.md`, deliverable 1: one agender body, bare, hand-pixelled per part per facing on the rig's template, in canonical tones that the game dyes. It is the base for the player, other players, every villager, and, by a palette swap, the dead, so a villager or the player can turn in place.

## Files

| File | What |
|---|---|
| `character_body_1x.png` | the body on the template layout: eight 48 x 72 frames, four across and two down, `s sw w nw` over `n ne e se` (192 x 144) |
| `character_body_4x.png` | the same at 4x, to lay over `character_template_4x.png` |
| `character_body_partmap_1x.png` | which part owns each pixel, outline included: torso blue `#6a9aff`, legL `#6adf80`, legR `#3ab050`, armL `#ffb060`, armR `#d07030`, head `#d080ff` |
| `character_body_regions_1x.png` | the dye regions: outline `#1a1420`, skin `#f0c8a0`, eye white `#f5f5f0`, pupil `#3c6ea0` |
| `parts/body_<part>_1x.png` | each part complete on the same layout, with its own outline, **including the pixels the other parts cover at rest**, so the rig can swing an arm away from the torso without a hole |
| `character_body.json` | the layout, the tones, the draw order per facing, each part's grid origin relative to its anchor, the joints copied from the template, the skin ramp proposal |
| `preview_old_vs_new_4x.png` | the generated body beside this one, all eight facings |
| `preview_skins_3x.png` | the dye test: the eight living tones and the three dead ones on `s`, `sw`, `w` |

Everything is hard-pixel (alpha 0 or 255), one art pixel per game pixel, light from the top-left.

## The tones, and how the dye works

The body uses exactly five colours. The game replaces them; nothing else needs to change for any skin, any eye colour, or death.

| Region | Canonical | Swap to |
|---|---|---|
| outline | `#1a1420` | never (the figure's own outline tone) |
| skin base | `#f0c8a0` | the chosen skin's base |
| skin shadow | `#caa886` | the chosen skin's base x 0.84 per channel (`tone(rgb, -0.16)`, the engine's rule) |
| eye white | `#f5f5f0` | `#c8c8aa` for the dead |
| pupil | `#3c6ea0` | `look.eyes` for the living; `#963030` for the dead |

**Turning a character into one of the dead is the same swap with a dead tone**, so a killed villager keeps its body, its clothes, and its hair and only changes skin and eyes. The wound layer (deliverable 1's third item) goes on top later.

**The skin ramp, approved by Michael 2026-10-12** (base tones; the shadow follows the rule):

- Living, pale to deep: `#f8dcc0` `#f0c8a0` `#e8b88c` `#d9a070` `#c4875a` `#a86a48` `#8c5a40` `#6b4432`
- Dead: grey-green `#8f9c72`, grey `#908c8a`, bruised blue `#7f879c`

The outline and the eyes read on all eleven (Michael: the darker ones do not lose the outline).

## What changed from the generated body, and why

Four rounds on 2026-10-12, each reviewed by Michael. The upshot: **the generated body's proportion, head, eyes and arms, with new legs, feet and hands, and the rig's torso drawn as a part.** What differs from the generated body is small and deliberate:

- **Head and eyes as generated:** the rounded-square head exactly as `figure.js` draws it, the eyes as they were (whites 3 x 5, a 2 x 3 pupil low and inside). The pupil is a dye region, so eye colour is a choice. No mouth, no nose. Two eyes on `s`, `sw`, `se` (one pixel toward where the figure looks on the three-quarter views), one at the front on `w` and `e`, none from behind. 53 px bald, head two fifths; the frame, the feet anchor (24, 66) and every joint are the template's.
- **Arms as generated, reconstructed from the rig:** a capsule of radius 2.9 from the shoulder joint to the hand joint plus a hand ellipse of radius 2.7 at the hand, pixel-centre tested, which is what `figure.js` draws, on the template's joints; drawn under the torso facing the camera and away, as the generator orders them, so the torso's outline covers their inner edge. Two rules on top: (1) the capsule's top row (a single skin pixel beside the chin that read as a pointed shoulder) is dropped, the slope below it stays; (2) a far arm always shows at least two pixels of skin before its outline meets the torso's (the three-quarter far arm sits one pixel further out; `check_arms()` in `body.py` asserts it on all eight facings).
- **Torso to the hip line** (row 54, the generated length), 11 wide facing the camera, 8 deep in profile (one pixel wider than the legs each side); the hem slants down to the near side at the iso 1:2 on the four three-quarter views, as the generated body's did, and the near leg starts under the slant.
- **Legs are quiet:** 6 wide, a one-pixel gap, straight, the generated length (from row 56).
- **Feet are distinct:** two rows that flare one pixel outward (two pixels of toe, forward, on the profile) and a shaded sole row; the last outline row is 70, as before.
- **Shading is the engine's rule, applied in the art:** the right-hand 40 percent of each row run of skin is the shadow tone (one column on the head; the face never shaded), so every facing, the mirrored ones included, is lit from the top-left.

## For the slicer

- A part's pixels are at `grid_origin_px` in the frame; `origin_minus_anchor` is the offset from the part's anchor (the template's `pixel`), which is what the rig stores.
- Use `parts/body_<part>_1x.png` for the part's pixels (complete, own outline), and `character_body_partmap_1x.png` only to check what the composite shows at rest.
- Draw order per facing is in `character_body.json` (`draw_order`, far to near). Later parts cover earlier ones, which is how the fused outlines come out right.
- The body is symmetric: `e`, `se`, `ne` are mirrors of `w`, `sw`, `nw` with the L/R part names swapped and the shading re-applied so the light stays top-left. Either take all eight as drawn, or take five and mirror; both give the same picture except the shade column on the mirrored three.
- Nothing is drawn below row 70 (the last outline row) or above row 18.

## Not in this delivery

The wound layer, the eye variants (a round, a narrow, a wide-set pair), hair, facial hair, hats and garments. All of those sit on this body and come next, in the brief's order.
