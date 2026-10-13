# 31.03 — The game with more than one player in it

What "the robust, fairly maximalist version" means, system by system, so the architecture in `04` has a target and the questions in `07` have a context. Defaults in brackets are proposals for Michael, written in the style of the other specs: his to overrule, not an implementer's.

## What maximalist means here

Not a mode bolted on, not a second player who shares one screen. **Several friends in one persistent valley**, each with their own character, their own view, their own needs, their own death, able to join and leave while the others play, with everything in the world shared: the dead, the fires, the crops, the stations, the walls they build, the chests they fill. The single-player game is the same game with one person in it; nothing is "the multiplayer version" of a feature. The ceiling is set by the atlas and the screen's worth of dead, not by the design: [a design target of **four** players, a hard ceiling of **eight**].

What it is not: no versus, no teams, no shared screen, no voice (the browser could, later; the text log is the chat), no mods, no matchmaking, no accounts. A friend joins by a link or a code and a name.

## The rule for each system

### Characters and the creation screen

- **Every player is a character on the one model** (`19`), kind `player`, with their own `id` (never the literal `"player"`), `name`, `look`, `worn`, `hands`, needs, and combat fields. The dead and villagers do not change.
- **The creation screen** (pinned in `02`, 2026-10-10: look, hair, facial hair, the painted layers) becomes **the identity screen**: a name and a look, kept in the browser like a setting, shown before Play in single player and before Join in multiplayer, editable later from the pause menu [changes to the look apply at once, as the console's `setLook` does; a name change too]. It is the one screen that travels: the identity is sent on join, and every client bakes that player's sheet from it. Goobers (`00`): no body choices.
- **A player's figure sheet** has a fixed id per player slot (`player_<id>`), redrawn in place as the player's own is today (`main.js:283-297`), never through the shared outfit cache, so N players cost N sheets whatever they wear. The second atlas page (`23` Q2d) is due when the first group dresses differently; four players fit in today's free rows.
- **A name over the head** [shown always for players within sight, as the speech bubble is placed; a setting to hide them], and the portrait in the HUD is one's own.

### Sight, light, and the view

- **Each client sees from its own player.** `visible` is cast from one's own tile; the fog is one's own; the occlusion hole in the canopies is one's own; the translucent near walls are one's own room; the night pool, the zoom, the camera, the swing-target outlines, the ghost, and the aim marker are one's own. None of it is shared and none of it travels. **No shared sight** [no "party vision": a friend in the inn does not let you see into the inn; it keeps pillar 2, sight is the game, and it keeps the fog one function].
- **Another player is drawn when in your sight** like any character, never through walls (the always-drawn exemption at `render/entities.js:184` becomes "is me").
- **Light is shared** because it is world state: every fire, every mounted torch, every carried torch, every lit window lures the dead and lights the ground for everyone. The carried lights are a list, one per player (`light.carriers()` already sums a list). A friend's torch lights your way and gives you both away.

### The dead

- **The dead hunt the nearest visible living thing, players preferred** (`19`'s rule extended): at each sight check, the nearest player in sight, else, with the setting, the nearest villager. Memory, search, and give-up unchanged. One zombie has one target, one position, one health, decided by the authority: the Zomboid flip cannot happen.
- **A carried flame belongs to someone**: a source carries its owner's id, and a zombie drawn to it walks to that player (`zombie.js:389` today sends it to "the player").
- **The thinking box is the union of every player's box** (`activeTiles` round each player; a zombie thinks if any player is near). With the records milestone (`03-world-model.md`), the active region is the union of every player's region, chunks evict by distance to the nearest player, and alarm and lure are per chunk as designed, with no player in them.
- **Spawns** are hash-keyed by position already; growth is triggered by players' positions only, never by what a client's window happens to show (`05` here, growth).
- **Bites and damage** are the authority's; a `playerHit` names its victim.

### Needs, moodles, health

- **Each player has their own** hunger, thirst, tiredness, health, stamina, bleed, infection; their own moodle column and bars; drawn on their own client only. Nothing to share, nothing to decide. The authority ticks them; the client shows what the authority says.

### Sleep

`30` law 6: the clock and the simulation run at sixty times speed, only in a bed indoors, never interrupted. With more than one player the rule needs a veto, and the note in `30` 3.3 says "a second player's presence would veto". Options:

- (a) **Everyone or nobody**: the world fast-forwards when every connected player is in a bed; a player standing up is the veto; the message says who is awake ("Wren is still up"). Valheim's rule.
- (b) **A majority**: more than half in bed, the rest dragged through a night at sixty times speed, awake.
- (c) **Each player sleeps alone**: the sleeper is skipped forward in their own needs while the world runs at normal speed for everyone, which is not law 6's fast-forward and breaks "nothing is poked".

[**(a).** It is the only rule that keeps law 6 as written (the world simulates at that speed; nothing is poked) and keeps the single-player case the same rule with one voter. A sleeper who is bitten is woken by the damage as now, which with (a) means the fast-forward stops for all until they lie down again or die.] The time scale is **a property of the world** set by the authority from the rule, not of the loop (`05` here).

### Pause, menus, and real time

- **With more than one player connected the world never pauses.** Escape opens the local menu over a running world; the bag and the character screen are local panels over a running world (they are already DOM over the world); a hidden tab stops that client's rendering and nothing else. The single-player law ("the game runs in real time while its window is visible, Esc pauses") holds unchanged when one player is alone: a listen server with no guests pauses as today [and a dedicated server with one player in it does not: the world is the server's, and the player who walks away has walked away].
- **Hit-stop is local.** The 45 or 90 ms freeze becomes a hold on the client's own interpolation and its own camera kick; the authority never freezes (`05` here). A friend fighting across the square does not stutter your world.

### Death and the next survivor

- **Death keeps the world running** (`02` 2026-10-08's ruling, the parent's `18`): control stops, the fall plays, the body rises as a zombie in your clothes carrying what you carried (`turnVillager` is that code), and the death card offers **New survivor**: a fresh character at the inn, the toll house, or the croft by turn (`30` 3.5), with the kit, keeping your name and look [and the survivor count on your card]. Your friends see your former self get up, which is the game's tone in one image, and they can loot your body for your things, which is the second player's version of "that is the point" from the parent's doc.
- **A dead player spectates until they choose** [a free camera over what their friends can see? no: **their own body's sight**, which is a corpse on the floor: they see the room they died in, as a body would, until New survivor. Simple, a little cruel, and no new sight rule].
- **A dead world**: with everyone dead, the world runs on until someone takes a new survivor; the dead screen is per player.

### Chat and speech

- **The text log is the chat** (`02`'s note): a line typed in it is a `say` by your character, which is a speech bubble over your head within sight of others and a `Name: line` in every log that could see it, as a villager's line is today. Out of sight, not heard [no global chat; a message system (`showMessage`) is per player and never travels]. One new input: typing into the log.
- **Emotes, pings** are not in 1.0; a pointed-at tile ("look here") is one event away if play wants it.

### Containers and items

- **Everything is shared, nothing is owned** (Zomboid's rule). Any player opens any chest, loots any body, takes from any pile, including a friend's dropped bag. Trade is "drop it" or "put it in the chest". No player-to-player drag (no trade window) [in 1.0; the interface could show a friend's offered item later as a container panel].
- **A container open on two screens at once** shows both players the same grid, live: a move is a command the authority performs and both replicas see. **The grid's placement rules stay the client's preview and the authority's law**: a drag that was legal when it started and is not when it arrives is refused with the panel's own label ("no room"), the parent's rule for a full grid. Stacks merge on the authority only.
- **The one container rule** (`02`, 2026-10-10) is validated on the authority, as every rule is.
- **A body's grid is the body** (`19`); two players stripping one corpse see it undress by both their hands.

### Building, placement, carrying

- **The ghost is per player**, the build palette per player, the removal highlight per player; the placement and the removal are commands (`placeProp`, `buildWall`, `destroyWall`, `removeProp` with a reach and a cost checked on the authority).
- **Two players building on one edge**: the first command wins, the second is refused with the ghost's red ("something is there").
- **A carried prop is off the map and on a player** (`player.carrying`); it travels as part of that player's state so others see the chair on their head.
- **The Free building rule** is the world's (`rules`), not a client's.

### Stations, recipes, fires, farming (the big pass, `30`)

- **A station's queue is state on the prop**, ticked by the authority, drawn by any client with the panel open; two players may queue at one station and both see the queue; the output slot is a container. **A craft in progress is a row with a start tick and a duration**, not a bar on a client.
- **A fire's fuel** is a number on the prop (`map.js:1241-1256`); Feed is a command; a lit fire lights the room for everyone.
- **A crop's planted hour** is on the tile (`30` 8); growth on the clock; two players water one plot, the second pour finds it wet.
- **The bucket** is a carried prop like any.
- **Durability** is on the entry (`wear`); kills are the authority's.
- **Interactions** (`interactions.json`) resolve on the authority with the same rows; "Nothing interesting happens" is a message to the one who tried.

### Combat

- **The swing is a command**: "swing the main hand at this world-space aim at tick T". The swing resolves on the click (`14`'s rule), so it is one message, not a held state; the authority resolves the wedge against its own dead at its own tick [with a short rewind to the sender's tick, bounded at 150 ms, so a client who saw a zombie in reach and clicked is not refused by the dead having shuffled a tenth of a tile: the "lag compensation" of `05`'s tier 4, cheap here because the dead are slow]. The client shows the swing at once (the animation is cosmetic by the same rule) and the hit when the authority says so, a round trip later: `05`'s stated cost.
- **The block and the brace** are stances: "guard up" and "guard down" commands; the authority applies the block to the bites it resolves.
- **The exposure, the swing timer, the combo clock** are the player's fields, ticked by the authority, drawn by their own client.
- **Players do not hurt players**: the swing passes through the living (`19`), the wedge finds the dead only; a thrown spear lands beside a friend, never in them; a friend's arrow likewise [no friendly fire in 1.0, by the villagers' precedent; a setting later if anyone wants the fantasy].
- **Stagger, knockback, down, finisher** are the authority's and arrive as entity state.

### The bow and the spear

- **The draw is a stance on the player** (start, hold, release as commands; `archery.draw` becomes `player.draw`), the aim read from the command's world point.
- **A projectile is launched by the authority** with its launch parameters (`arrowShot` already carries them), and **every client flies it the same way** (the arc is deterministic from the launch; `20`); the authority alone decides the landing (`arrowLanded`): the hit, the lodging, the floor item. The visual trail needs no messages between shot and landing.

### The world with nobody in it

- **A listen server** lives while the host's page does; close the tab and the world stops, saved (below).
- **A dedicated server** lives while the process does. Does the valley run with nobody in it? [No: the world is simulated only where a player is (`03-world-model.md`'s law), and with no player it is simulated nowhere. The clock stops with the last player's leaving and resumes with the first's arrival. A fire you left lit is lit when you return; a crop planted at noon catches up by its planted hour when the chunk wakes, as `30` 8 already designs. This is also the only rule under which the single-player law "nothing shuts off on a timer, things run out because you used them" survives a server.]

### Saves, the host, and joining

- **The save is the authority's** (`04`): a listen server's lives in the host's browser (`localStorage`, one slot, the parent's shape) and can be exported as a file so a friend can host the same valley next time; a dedicated server's lives on its disk, saved on a timer and on the last leave.
- **Joining is loading**: a new client receives the same serialisation a save is, cut to its interest region, then events.
- **Reconnecting** keeps your character where it stood (the authority holds it, standing still, for a grace period [two minutes], then the dead may have it).
- **Settings**: the world's rules are the host's (`rules`, `combatTesting`, `squareSurface`, the data files); a guest's settings screen shows them read-only; the viewer's settings stay the guest's.
- **The dev console** (`window.__game`) exists on the authority only; a guest's `__game` is the replica's, read-only on the world [and the host alone may use `give`, `teleport`, the clock keys].

## What this design keeps from single player, exactly

Everything a single player does is a command to an authority that happens to be in the same page with zero latency. One code path (the loopback transport, `04`), so single player exercises the whole of it every evening, which is how the multiplayer code stays true while nobody is testing it with a friend.
