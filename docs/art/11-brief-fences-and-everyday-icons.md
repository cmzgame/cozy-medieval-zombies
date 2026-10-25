# Art brief for Claude Design: a rickety fence with a gate, and the everyday items

*A brief, written 2026-10-19 for #309 and not yet sent. Michael pastes this whole file into Claude Design. Every size and name in it was read from the game's code and data on that day.*

Hello again. This is a request for two sets of art, in the style of the village and items you drew before. Michael's words: "Fence art in the style of walls that will allow for building it and corners getting handled and etc. I prefer the rickety kind of fence that you can see through. A door with an open animation is also needed", and "in-bag or in-inventory art for some of the most basic items that you see on every play. Apple. Log. Plank. Torch (lit and unlit), etc." The purpose, also his: getting rid of the worst of the dev art he looks at every time he plays ("we're overdue for a log art").

Please read the whole brief before drawing. Near the end are four questions; answer them first if you can, or draw and say what you chose.

**What Michael attaches with this brief** (the files it points at, in case you no longer have them): your style bible, `docs/art/01-style-bible.md`; your village generators and anchors, `tools/art-gen/village/` with `anchors_walls.json`; the board overlays (`data/art/village/boards_*.png`), the rocks (`data/art/ground/rock_0` to `rock_3`), and the crops (`data/art/crops/`), for the palettes asked to match; the four outfit paintings (`data/art/character/layers/chest_tunic_long.png`, `legs_breeches.png`, `feet_boots.png`, `waist_rope.png`); and your round-2 `data/art/items/items.json`, the shape of the JSON to return.

## The game and the style, in short

Cozy Medieval Zombies: a cosy, slightly spooky medieval village overrun by the dead, in 2:1 isometric pixel art. Muted autumn colours, never neon. Your own rulebook, `docs/art/01-style-bible.md`, still holds in full. The parts that matter most here:

- Hard pixels only: every pixel alpha 0 or 255.
- Light from the top left. Three or four flat shades per material, a darkest-of-its-own-colour edge on the lower or outer side, no gradients, no dither.
- Anything the player uses or picks up has a 1 px `#2b2522` outline all the way round. Walls (and so the fence itself) have none; the gate does, as the doors do.
- Flat, unlit art. No baked ground shadow, glow, flame light, or halo. Anything that emits light is a separate frame the engine draws unlit.
- Drawn at final size. The game shows one art pixel per screen pixel and zooms the whole frame (at 1.1, 1.8, and 2.7); nothing you draw is ever scaled by the engine.
- Tiles are 64 by 32 diamonds. Walls are 80 px tall. The character is about 55 px tall with hair and 26 wide, in a 48 by 72 frame with the feet at (24, 66). (Older briefs said 48 px tall; that is stale.) A hand hangs about 14 px above the feet and 9 to 10 px out from the body.

Two things changed since your last delivery that touch this one. Your generators are kept in the repository as an archive under `tools/art-gen/` (`village/village.py` has the wall dimensions and `iso3d.py`; `village/placement_preview.py` assembled the placement tests); they are never run by the game, so if you no longer have them, Michael can attach them. And the night is now lit in a shader: a sprite is lit per pixel, and anything drawn with the engine's unlit flag (every flame) glows through the night. Neither changes what you draw.

## Part A: the fence and its gate

### What the fence is in the game

- **A wall material.** The fence is stored and drawn exactly as the stone, log, and wood walls are: one segment on one tile edge, standing alone, continuing a line, turning a corner, or meeting a building's wall. Today fences are laid by the map (the valley's yards and fields); the player's build list will take it, one segment at a time as the log wall goes up now, so every segment must look right alone and beside any other. The art is a set of wall pieces, read by the same renderer as the walls you drew.
- **See-through.** Sight and light pass through a fence, and through a shut gate too. Bodies do not pass. A fence bounds no room, so a fenced yard stays outdoors. In the art, "see-through" means gaps: posts and two or three rails (or whatever rickety construction you choose), with daylight between them, so the ground, a character's legs, and the dead behind it all read through. Keep the gaps at least 2 px at 1x so they stay open at the smallest zoom (the staff's claws closed into a ring at 1 px).
- **Rickety.** Weathered, a little crooked: posts that lean a pixel, rails that sag, a lashing or a split end. One caution: the engine has one picture per side and state, so the same segment repeats along every run. Make the ricketiness read when repeated; avoid one striking flaw (a single snapped rail) that turns into a pattern every 32 px. If you think two or three variants of the plain segment would make a real difference, say so and show it in a preview; the engine picks floor variants by a hash and could do the same for fence segments after a small change, but draw only the one plain segment per side unless Michael asks.
- **Not outlined.** The fence is a wall: no `#2b2522` outline. Give it its own darkest edge so it stands off the grass (about `#4b5f3d`) and the dirt and soil (about `#3a2a1d`).
- **The gate is the fence's door.** The engine calls it a door in a fence: a door can be built over a fence segment, a window cannot (so there is no window variant). The gate is used by the player, so it is outlined, as the house doors are.
- **The dead strike a fence down.** One of the dead wears a segment down slowly, a crowd faster, and at nothing left the segment bursts into splinters and is gone. Each strike jolts the segment a pixel. The jolt and the splinters are the engine's (particles); you draw neither, and there is no damaged look. Please list the fence's three or four wood tones in your notes, so the splinters can be matched to them.
- **Never translucent.** Because a fence bounds no room, it is never one of the near walls the engine draws translucent when a player is indoors. It needs no cut pieces and no far-side leaves.

### Size

- A segment is one tile edge long: 32 px across and 16 px up or down the screen along the diamond's edge, **centred on the edge line**, as your walls are.
- The dev fence is 36 px tall (to the tops of the posts) and 6 px thick (the depth of a post). That is about two thirds of the 55 px character: waist to chest high. Keep about 36, or propose another height between about 30 and 40; please tell us the height and thickness you used, because they are two numbers in the fence's definition.
- The engine redraws a thin band at the very top of a wall (the parallelogram at the wall's full height, a pixel past the thickness on each side, so the thickness plus 2 across, and a pixel past both ends) with the sky's light, so a wall's cap is not lit by the room it faces. On a fence that band holds only the post tops and perhaps the top rail's upper face. Nothing special is needed beyond setting the height to the top of your posts.

### Orientation

The trap from the first village brief, again: **north** is the tile edge from its top vertex to its right vertex, running `\` on screen (a room's back-right wall); **west** is from its top vertex to its left vertex, running `/` (the back-left wall). Each segment's **far end** is its top vertex (nearer the top of the screen); its **near end** is the right vertex of a north segment and the left vertex of a west segment. Draw both orientations; do not mirror (the light falls differently).

### How the engine handles posts, corners, ends, and joins

This is the part that decides how the pieces fit, so here is exactly what the code does (`src/render/walls.js`, `postAt` and `makePost`):

- **A post is drawn at a grid vertex** wherever the edges meeting there are: one segment ending (a run's end, or both ends of a lone segment); two at an angle (an L corner, of any of the four kinds: back, front, left, right); three (a T); four (a cross); or two in a straight line that are different materials.
- **No post is drawn** where two segments of the same material continue in a straight line. A gate counts as the same material as the fence it stands in, so there is no post between a gate and the fence beside it either.
- **There is one post picture for every case.** The end, the L, the T, and the cross all use the same `post_fence` sprite. There are no separate corner, T, cross, or end pieces in the engine; the post and the segments' own art must make every case look right.
- **Where a fence meets a building's wall**, the building's post stands there and not the fence's: the heavier material wins (stone over log over wood), and the fence is the lightest of all.
- **So the posts along a straight run must be in the segments' own art.** Each segment should carry one post, at one of its two ends.

**The draw order** (the painter's order, back to front), so your placement previews can be assembled the way the game draws them:

1. The two segments that **arrive** at a vertex from behind (the north segment coming down from its upper left, the west segment coming down from its upper right; at that vertex they end with their near ends).
2. The post at that vertex, if one stands there.
3. The two segments that **leave** that vertex toward the camera (they start there with their far ends).

So a post is drawn over the near ends of the segments behind it and under the far ends of the segments in front of it.

**Our suggestion, yours to overrule:** each segment carries its post at its **near end**, drawn identically (same pixels, same spot) to `post_fence`. Then a straight run shows a post at every vertex; at a corner or an end, `post_fence` lands exactly on the segment's own post and changes nothing; and where a fence runs into a building's corner from behind, the building's post covers the fence's own post cleanly. The consequence: at every vertex the leaving segment's rails are drawn in front of the post (rails nailed across the post's face) and the arriving segment's rails end behind it. If you find the far end works better, say why; the previews below are the test either way.

### The gate

- **Shut:** `wall_fence_<north|west>_door_shut`. The gate fills the span between the posts. How wide is yours to choose (Question 2), with this in mind: the engine opens the whole tile edge for walking whatever the gate's width.
- **Open:** `wall_fence_<north|west>_door_open` is the segment with the span empty (posts and nothing else, no threshold), plus the open gate leaf as a separate sprite, `door_open_fence_<north|west>`, as the house doors' leaves are: swung 90 degrees, hinged on the post at the **far end** (the one nearer the top of the screen, so the leaf never covers the opening), standing out toward the camera. A fence's gate always swings to the near side (toward the camera); there is never a far-side leaf to draw.
- **Hinge the gate a little in from the far post.** A leaf hinged exactly on the far post and swung 90 degrees lies exactly along the line of the other fence that leaves that post: in the corner tile of a yard's back side, a north gate's open leaf lands on the same tile's west fence, and a west gate's on its north fence. A tile's north and west segments share a draw key, with the north one drawn first, so the west fence is drawn over a north gate's leaf, and a west gate's leaf is drawn over the north fence. Either way the leaf and the fence lie on one line. The house doors avoid this by hinging about 0.18 of the edge (about 6 px along it) in from the far end; the gate should do the same, or as much as clears the fence's thickness. The preview below includes this case.
- **The open leaf is drawn with the fence segment**, just after it and before anything standing in the tile in front. So anyone standing beside an open leaf in that tile is drawn over it, as happens with the house doors. A longer leaf makes that more visible: the house door's leaf is 20 px wide, and a leaf much wider reaches most of the way across the tile in front.
- **The opening animation.** Today the engine has two states and nothing between: shut (the `door_shut` segment) and open (the `door_open` segment plus the 90 degree leaf), switched instantly, for every door in the game. The in-between frames are new; a small engine change will play them, shut, then the frames, then open, over a fraction of a second, and the same frames backwards to close. Please draw **two in-between leaves per orientation**, the gate swung about **30 and 60 degrees** from shut: `door_open_fence_<north|west>_30` and `door_open_fence_<north|west>_60`. During the swing the segment beneath is the `door_open` one (the empty span), so each in-between leaf is drawn whole, including the part still inside the span. If you think three in-betweens (22.5, 45, 67.5) read clearly better, draw three and say so.
- **Optional, small: boards across a gate.** The game lets a player nail planks over any door, a gate included, and today it would draw the house door's board overlays, sized for a 48 px doorway in an 80 px wall, sticking out above a 36 px fence. If you have room: `boards_gate_<north|west>_<1|2|3>`, one, two, or three planks across the shut gate, in the same weathered grey-tan as the house boards (`#b5a27e` lit, `#8d7b5f` shade), outlined, anchored like the segment. The engine can use them by data alone.

### Palette

Weathered wood, greyed by the weather, apart from the door wood (`#5e4028`), the warm log walls (`#8a5e36`), the grass, and the soil. The dev fence's single colour is `#9a7a50`; the house boards' grey-tan above was chosen because it stands apart from every wall and the grass, and is a good neighbour to start from. The gate may be the same weathered wood with dark iron strap hinges and a latch (`#2b2a32`, highlight `#4a4952`), outlined `#2b2522`. Your call.

### The fence pieces, as files

All anchored on the **tile's top vertex at ground level** (your wall convention; an anchor may lie outside the PNG or be negative), except the post:

- `wall_fence_north_plain.png`, `wall_fence_north_door_shut.png`, `wall_fence_north_door_open.png`
- `wall_fence_west_plain.png`, `wall_fence_west_door_shut.png`, `wall_fence_west_door_open.png`
- `post_fence.png`: anchored on **its own centre at ground level**, which the engine places on the grid vertex.
- `door_open_fence_north.png`, `door_open_fence_west.png` (the gate at 90 degrees)
- `door_open_fence_north_30.png`, `door_open_fence_north_60.png`, `door_open_fence_west_30.png`, `door_open_fence_west_60.png`
- Optional: `boards_gate_<north|west>_<1|2|3>.png` (six)
- `anchors_fence.json`: for every file above, `anchor_px` and `size`, as in your `anchors_walls.json`; plus the fence's `height` and `thickness` as you drew them.

That is thirteen pieces (nineteen with the boards).

### The fence previews (the acceptance pictures)

Assembled purely from the PNGs and the anchors, in the draw order above, at 1x and 3x, on grass:

- Every piece alone, both orientations.
- A straight run of four segments each way.
- A lone segment, and a lone gate (shut and open), with nothing either side.
- A rectangular yard about 4 by 3 tiles, so all four corner kinds show, with a gate on each side: two shut, two open.
- A T join and a cross join.
- A fence running into a corner of a stone, a log, and a wood building, both arriving from behind and leaving toward the camera (the building's post stands at the join).
- A gate beside a corner and a gate at the end of a run.
- An open gate in the corner tile of a yard's back side, in both orientations: the case where a leaf hinged on the corner post would lie on the other fence.
- The swing strip: shut, 30, 60, open, both orientations.
- The 55 px character and one of the dead standing behind a fence and behind a shut gate (the see-through test), and in front of each.

If any of these needs a piece the engine does not have (above), say so plainly rather than drawing it; it would be engine work, and Michael decides.

## Part B: the everyday items

### How an item's art works in the game

**The law (Michael, 2026-10-12): item art comes as a pair**, the in-world picture and the bag icon from one design, and for anything held or worn a 38 by 38 portrait for the character screen's slots, from the same design. A delivery that lacks any of them is flagged on arrival. In practice, for each item:

- **`<id>_world.png`, the world picture, always with a grip pixel.** The item upright, tightly cropped, with its `grip_px` (from the PNG's top left): where a hand would take it, **on every world picture, even for an item no hand holds today**. The reason is the game's: an item's world picture is loaded as its held picture, which cannot load without a grip, and the data check counts an icon without a world picture as half a pair and fails it. The world picture is what the hand shows; items lying on the ground stay coloured boxes for a while (Michael: basement priority), but the world picture is wanted for every item.
- **`<id>_icon.png`, the bag icon.** The bag is a Tetris-like grid, **19 px a cell in the art**, always shown at exactly 2x (38 px a cell). The icon's canvas is the item's footprint exactly: a 1 by 1 item is 19 by 19, a 1 by 2 (one column, two rows) is 19 by 38, a 1 by 3 is 19 by 57, a 2 by 3 is 38 by 57. Drawn upright on transparency; the game turns it when the item is turned in the bag. Your convention so far: the icon is the world drawing pixel for pixel, centred unscaled on the canvas (the book's closed icon the one exception). See Question 3 for the long thin items.
- **`<id>_portrait.png`, the portrait, 38 by 38**, for the character screen's slots (the hands, the worn slots) and the belt's two slots: the thing as a thing (a torch upright, boots side by side). A square icon stands in where no portrait exists: a 1 by 1 icon (shown at 2x) and a 2 by 2 icon (already 38 by 38). So a portrait is owed for the held and worn items whose icon is not square, and is optional for the rest; each item below says which.

What the bag draws itself, so it is not in the art:

- The cell's background: a mid-grey stone cutout (about `#5a5654`) with a dark inset edge along its top and left and a light one along its bottom and right, a pixel or two at 1x. The `#2b2522` outline reads on it; keep a pixel of margin inside the canvas.
- A stack's count, in white bold numerals in the **lower right** of the item's box (about the lower-right 8 by 7 art pixels). Leave that corner quiet on anything that stacks.
- A **wear bar**, a thin bar across the bottom 2 or 3 art pixels, on the tools and weapons that wear (the torch, the plank, the stick).
- A **fill level** on the waterskin: a blue band rising from the bottom of the item's box, drawn **behind** the icon, so it shows only through the icon's transparent pixels.

Nothing below has drawn art yet. The four items that do (the book of fire, the staff of fire, the throwing knife, the throwing axe, in `data/art/items/`) are not asked again; they are the style reference for this round.

### The items, roughly in the order a play meets them (the log first: it is the one Michael called overdue)

**1. Log** (`log`)
- Footprint 2 by 3: icon 38 by 57. Does not stack.
- What a felled tree drops; fuel for a hearth; splits into three planks; a log wall costs one. Not held: no hand takes a log today, so no portrait.
- Wanted: `log_world.png` with `grip_px`, `log_icon.png`.
- A neighbour of your log walls (`#8a5e36`, cut ends with growth rings), so the log you carry is the log you build with. A log is a fat thing: it may fill its 2 by 3 well.

**2. Apple** (`apple`)
- Footprint 1 by 1: icon 19 by 19. Stacks to 5: keep the lower-right corner quiet.
- Eaten from the bag or the belt; not held in a hand. The belt shows the icon at 2x, so no portrait is needed.
- Wanted: `apple_world.png` with `grip_px`, `apple_icon.png`.
- Picked from the orchard's apple trees (still generated art) and found in chests; the first thing a player eats.

**3. Plank** (`plank`)
- Footprint 1 by 3: icon 19 by 57. Does not stack.
- Held in either hand and swung as a club (it wears: a wear bar); rides the belt; is the material for doors and windows and the board a player nails over an opening.
- Wanted: `plank_world.png` with `grip_px`, held angles (below), `plank_icon.png`, `plank_portrait.png`.
- Today's generated plank in the hand is about 26 px long and 4 to 5 wide, held at its middle; a club is more naturally held near one end, and the grip pixel is yours. The house board overlays you drew are weathered grey-tan (`#b5a27e`, `#8d7b5f`); matching them would make the plank you carry the plank you nail.

**4. Torch, unlit and lit** (`torch`)
- Footprint 1 by 2: icon 19 by 38. Does not stack.
- Held in either hand (a new character starts with it in the main hand; also swung as a weak club, so it wears: a wear bar); rides the belt, where a lit one gives a little over half its light. Each torch is lit or unlit and burns down when lit; the player lights it with the tinderbox (the T key).
- Wanted: `torch_world.png` (unlit) with `grip_px` and `flame_px` (below), held angles (below), `torch_icon.png` (unlit), `torch_lit_icon.png`, `torch_portrait.png` (unlit), `torch_lit_portrait.png`.
- **In the world, the torch is drawn unlit**, a stick with a wrapped, pitch-dark head; the engine draws the flame over it, unlit, from its own flame frames. So mark `flame_px`, the pixel at the top of the head where the flame's base sits, in each held angle's file. (The game knows that point for its generated torch only; reading yours is a small engine change that lands together with this art.)
- **In the bag and the slots, the lit torch carries its flame in the picture.** The bag and the character screen are interface, not lit by the engine, so a drawn flame there is right; still hard pixels and no glow halo. The game shows one icon per item today; showing the lit one for a lit torch is also a small engine change that comes with this art.
- Today's generated torch is about 20 px long with a 5 px head, held at mid-shaft.
- **Optional: the flame itself.** The flame on a torch in the hand and in a wall bracket is one generated sheet of three unlit flicker frames on a 28 by 32 cell, its base at (14, 28). (The torch post draws a flame of its own.) If you have room, draw it: `flame_torch_0.png` to `flame_torch_2.png`, unlit, no halo, each with its base pixel in the JSON (your fireplace flames, 18 by 16, are the precedent). It would replace the generated flame in the hand and the bracket.

**5. Loaf of bread** (`bread`)
- Footprint 1 by 1: icon 19 by 19. Does not stack.
- Food, eaten from the bag or the belt. No portrait needed.
- Wanted: `bread_world.png` with `grip_px`, `bread_icon.png`.

**6. Waterskin** (`waterskin`)
- Footprint 1 by 2: icon 19 by 38. Does not stack. Holds 100 of water.
- Drunk from and filled at wells and water; rides the belt. Not held in a hand. The belt's slot is square and the icon is not, so a portrait is owed.
- Wanted: `waterskin_world.png` with `grip_px`, `waterskin_icon.png`, `waterskin_portrait.png`.
- The bag's blue fill level rises **behind** the icon and shows only where the icon is transparent. So draw the skin a little narrower than its 19 by 38 canvas, leaving a few columns clear on each side, so the level reads round it.

**7. Tinderbox** (`tinderbox`)
- Footprint 1 by 1: icon 19 by 19. Does not stack, never wears out.
- Rides the belt; lights a torch, a hearth, a campfire. No portrait needed.
- Wanted: `tinderbox_world.png` with `grip_px`, `tinderbox_icon.png`.

**8. Stick** (`stick`)
- Footprint 1 by 3: icon 19 by 57. Does not stack.
- Held in either hand as a club (wears: a wear bar); rides the belt.
- Wanted: `stick_world.png` with `grip_px`, held angles (below), `stick_icon.png`, `stick_portrait.png`.
- Today's generated stick is about 26 px long and 3 wide, with a knot or two. It should read as a found branch, apart from the sawn plank.

**9. Bandage** (`bandage`)
- Footprint 1 by 1: icon 19 by 19. Stacks to 5.
- Applied from the bag; not held. No portrait.
- Wanted: `bandage_world.png` with `grip_px`, `bandage_icon.png`.

**10. Stone** (`stone`)
- Footprint 1 by 1: icon 19 by 19. Stacks to 20.
- Mined from the rocks you drew (`data/art/ground/rock_0` to `rock_3`) with a pickaxe; the material the stone walls players build will use. No portrait.
- Wanted: `stone_world.png` with `grip_px`, `stone_icon.png`, from the rocks' palette.

**11. The six seeds** (`potato_seed`, `cabbage_seed`, `garlic_seed`, `pumpkin_seed`, `rye_seed`, `flax_seed`)
- Each 1 by 1: icon 19 by 19. Each stacks to 20.
- Planted on tilled soil; a harvest gives two back. Not held. No portraits.
- Wanted: `<id>_world.png` with `grip_px` and `<id>_icon.png` for each, twelve files.
- The six must tell apart at 19 px (Question 4). Your crops in the field (`data/art/crops/`, three stages each) cover potato, cabbage, garlic, pumpkin, and rye; flax has no field art yet.

**12. The starting outfit** (lower priority than everything above; draw them if the round has room)
- Every new character wears these. Each is worn, so each owes a world picture, a bag icon, and a portrait.
- **Draw them from the paintings you delivered in round 1 of the characters** (`data/art/character/layers/`), their design and colours. Those paintings are not yet installed in the game: the figure still wears its generated shapes. So the painting is not the item's world picture; each garment needs its own.
- **The world picture is the garment as a thing, folded or laid flat**, with a `grip_px` like every other world picture (a dropped garment will one day show it).
- `tunic` (Linen tunic): 2 by 2, icon 38 by 38, worn on the chest. The painting is `chest_tunic_long.png` (your notes call it the starting outfit's long tunic). The 38 by 38 icon can serve as its portrait; draw a separate portrait only if the slot wants another view (hung rather than folded), and say which.
- `breeches` (Linen breeches): 2 by 2, icon 38 by 38, legs; `legs_breeches.png`. Icon as portrait, as the tunic.
- `boots` (Hobnail boots): 1 by 2, icon 19 by 38, feet; `feet_boots.png`. A portrait is owed.
- `belt` (Rope belt): 2 by 1, icon 38 by 19, waist. The kit's belt is the rope one, painted as `waist_rope.png` (your layer notes named `waist_belt.png` as the starting belt, but the game's kit carries the rope belt). **A mismatch to flag, not to settle:** the item's colours in the data (`#5e4028`, `#8a7a60`) are the plain belt's dark brown, not the rope painting's tan (`#b8a67c`, `#8f7f5c`). Draw the rope as you painted it; Michael rules on the colour. A portrait is owed.
- `small_sack` (Burlap sack): 2 by 2, icon 38 by 38, worn on the back; the starting bag, holding 6 by 4 cells. It has no painting (there is no painted back slot yet); draw it fresh. The icon can serve as its portrait.
- Files: `<id>_world.png` with `grip_px`, `<id>_icon.png`, and `<id>_portrait.png` where one is drawn.

**13. Optional: the home chest's hatchet and shovel**
- The chest in the player's home is opened on every play and always holds a hatchet, a shovel, a loaf of bread, and a bucket. The hatchet is how a log is got. If the round has room after everything above, these two would be welcome; draw them only then.
- `hatchet` (Hatchet): 1 by 2, icon 19 by 38; held in either hand, chops trees and fights. `shovel` (Shovel): 1 by 3, icon 19 by 57; held in either hand.
- Each: the world picture in the five held angles (below) with grips, `<id>_icon.png`, `<id>_portrait.png`.

### Held angles for the plank, the stick, and the torch (and the hatchet and shovel, if drawn)

The game turns a held picture to sixteen angles, 0 (straight up) and every 22.5 degrees clockwise. It has three modes: `fixed` (one picture, never turned: the book), `rotate` (the one upright picture turned by nearest pixel: the throwing knife and axe, acceptable at 5 and 9 px wide), and `angles` (your hand-drawn tilts at 0, 22.5, 45, 67.5, and 90 degrees clockwise, the rest made by flips: the staff). At 20 to 26 px long, a plank, a stick, or a torch turned by nearest pixel will break into stairs, so please draw each in the five angles, as the staff: `<id>_world.png` (0, upright), `<id>_world_22_5.png`, `<id>_world_45.png`, `<id>_world_67_5.png`, `<id>_world_90.png`, each with its own `grip_px` (and the torch's `flame_px`). The flips mirror the grip (and the flame point) for you: 90 to 180 degrees is the tilt at 180 minus the angle flipped vertically, 180 to 270 the tilt at the angle minus 180 flipped both ways, 270 to 360 the tilt at 360 minus the angle flipped horizontally. Fifteen files for the three. If you judge `rotate` acceptable for any of them, say so and send the one upright picture. The items no hand holds today (the log, the food, the seeds, the garments) need only the one upright world picture, with its grip.

### The file count for Part B

- Sections 1 to 11: 16 items, 32 world and icon files, 12 more held angles (three items, four tilts each), the lit torch's icon and portrait, and portraits for the plank, the stick, the torch, and the waterskin: 50 files, plus 3 optional flame frames.
- The starting outfit: 5 world pictures, 5 icons, and 2 to 5 portraits (the boots and the belt owed, the rest optional).
- The optional hatchet and shovel: 14 files (five angles, an icon, and a portrait each).

### The item previews

At 1x and 3x unless said:

- **The starting bag at 2x:** the burlap sack's 6 by 4 grid on the grey cutout, holding what a new character starts with (a waterskin, a loaf of bread, two apples with the count "2" in their corner, a plank, a tinderbox), and the torch in the main hand. This is what Michael sees first every time.
- Every icon in its footprint at 2x, the stack-count corner and the wear bar's place marked, and the waterskin with its blue level showing round it at full, half, and empty.
- Every portrait in a 38 px slot at 1x and 2x, the lit and unlit torch side by side.
- The 55 px character holding the plank, the stick, and the lit torch (flame placed at `flame_px`) at several of the sixteen angles, facing the camera and away, at 3x.

## The return

One zip, `fences_and_icons.zip`, laid out so Michael can copy it in as it stands:

- `README.md`: the notes. What is in the zip and what is not; every PNG's size; the anchors and grips (also in the JSON); the palettes, including the fence's three or four tones for the splinters; your answers to the four questions; and anywhere you bent this brief and why (the precedents: the knife 5 px wide, the staff's head 16 px, the book's icon closed). If anything asked for is missing, say so plainly in the first lines.
- `village/`: the fence pieces of Part A and `anchors_fence.json`.
- `items/`: every `_world`, `_icon`, and `_portrait` PNG of Part B, the held angles, the optional flame frames, and `items.json` in the shape of your round-2 `items.json`: per world file its `size`, `grip_px` (every world file, held or not), and tilt (and the torch's `flame_px`); per icon its `slot_cols_rows`, `size`, and stack limit; per portrait its `size`; per flame frame its base pixel.
- `previews/`: the fence placement previews and the item previews above, at 1x and 3x.
- `generators/`, if you like: your scripts. They are kept as an archive and never run, so everything the game needs must be in the PNGs and the JSON, not only in a script.

What happens to it, so you know what will be checked (`docs/27-art-integration.md`): the zip is treated as data, read and never run. Each PNG's header is read by script and compared with this brief and your README: sizes, counts, anchors, grips, alpha 0 or 255 only. Every item is checked for its full set (world, icon at its exact footprint, portrait where owed), and a missing or wrongly sized file is reported, not fixed quietly. Then it is landed through the game's own definitions and checked in the game: the fence built in the shapes of your previews, the gate opened and shut, each icon in the bag at 2x, each held item in the hand at all sixteen angles. Your previews are the acceptance pictures; the game should match them.

## What not to do (the lessons of the earlier rounds)

- **Do not leave out half of a pair.** The first item round came back three icons short and was flagged. If you skip an item or a file, say so first in the README.
- **Do not size an icon to anything but its footprint** at 19 px a cell. A 1 by 2 is 19 by 38, never 19 by 19 or 38 by 38.
- **Do not draw small and scale up.** The first tree sheet was drawn small, enlarged by the loader, and blurred, and had to be redrawn. Draw at the size it ships; put extra pixels into detail.
- **Do not build tiny things from geometry.** Procedural shapes turned the cursors and the 14 px book to mush. Hand-pixel anything under about 20 px: every icon here.
- **Do not rotate pixels.** Nearest-pixel rotation of pixel art looks broken. Draw each held angle fresh, as the staff was; flips are fine.
- **Do not bake light.** No glow round the torch's head in the world, no shadow under the fence. The engine lights and shadows everything; a baked glow is darkened at night and sits wrong.
- **Mind the orientation names.** North is `\` (top vertex to right vertex), west is `/`. The first village brief had them swapped; you caught it.
- **Do not let a colour vanish into its neighbour.** The first warm-brown boards disappeared on the log walls, and a green slime drip vanished on green skin. The fence stands on grass and dirt; the icons sit on a grey cutout.
- **Do not describe the engine as fact.** Your notes are the authority on your art; earlier notes about the engine (whole-number zooms, a cursor drawn into the canvas, a 2D night layer) were inferences that were wrong. Where the look depends on something you cannot see (the draw order, the light, the bag's CSS), say "this is an engine question" and leave it to Michael.
- **Do not keep anything in one copy.** The stubs and the willow exist only in a zip in Michael's downloads. Put every PNG, the JSON, the previews, and the README in the one zip.
- **Keep the README and the JSON in agreement.** The staff's flip rule was wrong in one README and had to be corrected after the fact.

## Four questions, before or while you draw

1. **Which end of a segment carries its post?** We suggest the near end, drawn identically to `post_fence`, for the reasons in Part A. Does that work for your construction, or would you do it another way?
2. **How wide is the gate, and where is its hinge?** The whole span between the posts, or a narrower gate with the open leaf kept to about 20 px? How far in from the far post does it hinge, so the open leaf clears a fence leaving that post (the house doors hinge about 6 px in)? What reads best in the swing frames?
3. **The long thin icons.** By your pixel-for-pixel convention, a 26 px plank or stick sits small in its 19 by 57 canvas (the knife and axe look small in theirs, and that was accepted). Michael's law asks for one design, not one size. Would you keep the convention, or draw the icon as a larger rendering of the same design, as the book's icon differs from its world picture? Please show both for the plank in the bag preview, so Michael can choose.
4. **The seeds.** One shared form (a small cloth pouch with each crop's mark or colour) or six different heaps of the seed itself (a seed potato, a garlic clove, flat pumpkin seeds, rye grains, tiny round cabbage seeds, glossy flax seeds)? Whichever reads apart at 19 px.

## After delivery (for the coding side; nothing here for you to draw)

- `data/sprites/wall_fence.json` becomes a drawn wall (`images` and `anchors` with `anchorVertex: "top"`, frames `<side>_plain`, `<side>_door_shut`, `<side>_door_open`), its `wall` block keeping `seeThrough` and `fence` and gaining `material: "fence"`, `post: "post_fence"`, `parts: "wall_parts_fence"` (frames `leaf_<side>` and the in-betweens), and `boards` if the gate boards come; the height and thickness from the delivery. Every fence in the valley takes the new art at once, the graveyard's wall included until it gets a low stone wall of its own.
- Engine work this art asks for:
  - Playing the gate's in-between leaves. It is cosmetic and runs on every client from the `open` flip that already reaches the frame, in sim time, so a guest sees the swing as the host does. The house doors keep snapping until they get frames of their own.
  - Reading `flame_px` from a drawn torch. Drawn held sheets carry `tips: []`, and the hand draws a flame only where a tip exists, so a lit drawn torch would keep its light but show no flame: this change lands in the same commit as the torch art.
  - The lit torch's icon and portrait.
  - If the flame frames come: they replace the shared `flame` sheet, which only the hand and the wall bracket draw; the torch post (`generateTorchPost`) draws its own and would follow only if wired to it.
  - Drawing the waterskin's fill band over the icon instead, if Michael wants it there rather than round the skin.
- The fence is not yet in the player's build list (`data/build.json` has the log wall, the door, and the window); building it is a data change that can come with the art.
- Items: `held`, `icon`, and `portrait` on each row of `data/items.json`. Every item given an icon needs `held.image` (or `held.angles`) with its grip too, the food, seeds, and garments included: `tools/validate-data.py`'s pair rule fails an icon alone as half a pair, and `heldSheetFromImage` has no default grip.
- The rope belt's data colours (`#5e4028`, `#8a7a60`) are the plain belt's, not the rope painting's tan; Michael rules which the item keeps.
