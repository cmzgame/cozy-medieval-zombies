# 31.03 — The game with more than one player in it

**Status, 2026-10-16: play with friends as built, system by system; the wiki's "Playing with friends" and every "With friends" section cite this page.** The multiplayer core has been Done since 2026-10-15 (`02`). Everything below runs over the relay (`server/relay.js`, `wss://cmz-relay.fly.dev`) in a world hosted by one browser or by a server world (`server/world.js`); the wire is `04`, the model of worlds, identities, and characters is `09`, and the rulings are `02`'s Multiplayer heading. Not built, and said so where it lands: a dead player turning into one of the dead, spectating, the bounded rewind for a guest's swing, an interest region (every guest is told the whole world), a cap on the players in a world, and any limit on a guest's `__game` (the open ones become issues in wave 4 of #70). The plan this page was rewritten from, with its options and its brackets, is `docs/history/31-multiplayer-record.md` (`03` as it stood).

## What a world with friends is

Several friends in one persistent valley, each with their own character, their own view, their own needs, and their own death, joining and leaving while the others play, with everything in the world shared: the dead, the fires, the crops, the stations, the walls they build, the chests they fill. The single-player game is the same game with one person in it; nothing is "the multiplayer version" of a feature, and every change is built for a guest in the same commit (`CLAUDE.md`, the two rules of shipping). A friend joins by a code and an identity (`09`). There is no versus, no teams, no shared screen, no voice (the text log is the chat), no accounts, no matchmaking. Nothing caps the players in a world; a world remembers the characters of sixteen browsers (`MAX_OWNERS`, `src/host.js`), which is a different number.

## Characters and identities

- Every player is a character on the one model (`19`): kind `player`, an id from the world's counter (`P<n>`, never the literal `"player"`), a name, a look, what is worn and held, needs, and combat fields. The dead and the villagers are the same whatever the count of players.
- A character is made from an identity, a name and a look kept in the browser, and keeps them for life (`09`); the character screen edits identities, not characters.
- Each player has a figure sheet of their own (`player_<id>`), baked by every client from that player's look and worn list when the player is first seen, so N players cost N sheets whatever they wear. Four fit in the atlas's free rows; the second atlas page (`23`) waits for a group that needs it.
- Another player's name floats over their head while they are in your sight, placed as the speech bubble is; your own is not shown; the setting "Names over heads" hides them (`ui/names.js`). The portrait in the HUD is your own.

## Sight, light, and the view

- Each client sees from its own player: the sight cast from your own tile, the fog, the hole in the canopies, the translucent near walls, the night pool, the zoom, the camera, the swing-target outlines, the ghost, and the aim marker are yours alone, and none of it travels. There is no shared sight: a friend in the inn does not let you see into the inn.
- Another player is drawn when in your sight like any character, never through walls; the renderer's exemption for the one always drawn is "is me", not "is a player".
- Light is shared because it is world state: every fire, every mounted torch, every carried torch, every lit window lights the ground and lures the dead for everyone. The carried lights are a list with an owner each (`light.setCarriers`); a friend's torch lights your way and gives you both away.

## The dead

- One zombie has one target, one position, and one health, decided by the host. The dead hunt the nearest player in sight, players preferred, and with the setting on a villager when no player is in sight (`entities/zombie.js`); memory, search, and give-up are as in single player.
- A carried flame is a sighting of its carrier: a zombie drawn to a torch walks to where the player holding it stands.
- The dead think in the box round every player (`game.nearPlayer` over the players list), and chunks grow only round players (`map.ensureAround` per player), never from what a client's window shows. When the records milestone (`03-world-model.md`) is built, the active region is the union of every player's region (`05`, item 36).
- Bites and damage are the host's; a bite names its victim.

## Needs, moodles, health

Each player has their own hunger, thirst, tiredness, health, stamina, bleeding, and infection, ticked by the host and drawn on their own client. Nothing is shared and nothing travels but the player's record.

## Sleep

Sleep is possible and optional with friends. The world's time scale is computed each step from who is asleep (`game.timeScaleNow`): the sleep speed (`sleepTimeScale` in `data/tuning.json`, sixty) only while every living player in the world is in bed, ordinary time otherwise. A dormant player is out of the list and a dead one is skipped, so neither blocks nor forces the skip. A sleeper alone in bed while a friend is awake sleeps at ordinary speed, rested and regenerating at the sleeping rate, and is told "Time will pass faster once everyone in the world is asleep." (the last one into bed hears "The night goes on without you."). A sleeper is never woken by anyone else's doing, not by damage either: they get up when rested and it is morning, or when the bed is gone from under them. A sleeping player never steps away (below). Ruled 2026-10-13 (`02`, "Sleep in a world with friends").

## Pause, menus, and real time

- On the wire the world never pauses, as a host or a guest, with guests or not (`02`, 2026-10-13). Escape opens the pause menu over a running world; the bag, a container, a body, a station, the character screen, and the map are panels over a running world, and you can still fight through them (`02`, 2026-10-15, "Only the pause menu stops the game"). Only a world played off the wire pauses.
- A world with friends in it never stops while its host's tab is open, hidden, minimised, or covered: the host's loop steps from a Worker's timer when the browser's frames stop (`loop.setBackgroundDriver`). A solo world stops while its tab is hidden, as single player always has. A hosted world with no guest in it whose host has stepped away is held: nothing moves, the wire still answers, and a friend's join starts it again.
- In a world with friends in it, a player with no input for five minutes of real time steps away: the character leaves the world, safe, as a guest's does after sixty seconds disconnected, and comes back where it stood on the next key, click, or mouse movement. Each client measures its own idle time; stepping away and back are commands the host performs. Never in a solo world, and never a sleeper (`02`, 2026-10-13).
- Hit-stop is refused on the wire (`loop.setFreezeAllowed`): the host never freezes, and a friend fighting across the square does not stutter your world. A client's own hold on its interpolation for the hit-stop's length is later work (`05-someday.md`).

## Death and the next character

- Death keeps the world running. Control stops, the fall plays, and the body lies where it fell, a body like the dead's, searchable by anyone with E or the menu (`02`, 2026-10-14): your next character can get your things back, and so can your friends.
- The dead screen is your own: "<name> died", then New character (a new survivor in this same world, from any identity, at the spawn; `09`) or Leave world. With everyone dead the world runs on until someone takes a new character.
- Not built: the body rising as one of the dead in your clothes (the parent's image, still wanted), the respawn by turn at the inn, the toll house, or the croft (`30` 3.5), and spectating (a dead player seeing what their body sees until they choose; `05-someday.md`).

## Chat and speech

The text log is the chat: Enter opens the box at the log's foot, and a line typed there is said by your character, a speech bubble over your head within sight of others and a "Name: line" in every log that could see it, as a villager's line is. A guest's line goes to the host as a `say` command. Out of sight it is not heard; there is no global channel. A message (`showMessage`) is for one player and never travels except as the host's word to the guest it is for (`net.messageTo`). No emotes, no pings.

## Containers and items

- Everything is shared, nothing is owned: any player opens any chest, loots any body, takes from any pile, including a friend's dropped bag. Trade is "drop it" or "put it in the chest"; there is no trade window.
- A guest's bag and panels are a view on its replica. Every drag, drop, double-click, and menu entry a guest makes is a command by uid, slot, and bag address, run on the host by the same handlers the host's own clicks use (`ui/inventory-actions.js`); the host tells the guest what it opened (`opened`). A container open on two screens shows both the same grid, live, from the frame.
- The grid's rules are the client's preview and the host's law: a drag that was legal when it started and is not when it arrives is refused with the panel's own word. Stacks merge on the host only.
- A body's grid is the body (`19`): two players stripping one corpse see it undress by both their hands.

## Building, placement, carrying

- The ghost, the build palette, and the removal highlight are each client's own. Placing a prop, building and destroying a wall, and removing a prop are commands (`place`), performed on the host by `placement.performPlacement` with the reach and the cost checked there; two players building on one edge: the first command wins, the second is refused.
- A carried prop is off the map and on the player (`player.carrying`); it travels in the player's record, so others see the chair on their head.
- The Free building rule is the world's (`rules`), the host's.

## Stations, fires, farming

- A station's queue is state on the prop, ticked by the host, sent in the frame when it changes, drawn by any client with the panel open; two players may queue at one station. A craft is a `craft` command.
- A fire's fuel is a number on the prop; feeding it is a command; a lit fire lights the room for everyone. A guest's copy of the fuel refreshes at every whole unit burned, when the chunk travels.
- A crop's planted hour is on the tile, and the tile travels with its chunk; two players water one plot, and the second pour finds it wet.
- Durability is on the entry; kills are the host's. Interactions (`interactions.json`) resolve on the host with the same rows; "Nothing interesting happens" goes to the one who tried. A Use from a guest's bag is a `use` command.

## Combat

- A guest's clicks, buttons, aim (as a vector and a ground point), and key events ride in its input snapshot every step, numbered for the host's acknowledgement; the host holds at most ten of a guest's inputs (`MAX_BACKLOG`) and applies one a step. The swing resolves on the host at the host's tick, with no rewind: the bounded rewind (a hit judged where things were when the guest saw them, up to 150 ms back) is later work (`05-someday.md`).
- A guest's own swing plays at once (the animation is cosmetic, `14`); the hit comes from the host a round trip later, with the camera kick (`net.kickTo`) and the "spent" word sent to the striking client.
- The block and the brace are stances in the snapshot; the host applies the block to the bites it resolves. The exposure, the swing timer, and the combo clock are the player's fields, on the sim's clock, drawn by their own client.
- Players do not hurt players, and nothing shot or cast hits a villager or a player (`02`, 2026-10-15, "No friendly fire"): a swing finds the dead only, an arrow and the fireball likewise.
- Stagger, knockback, down, and the finisher are the host's and arrive as the character's state.

## The bow, the spear, the fireball

The draw is a stance on the player, started and released from the snapshot; a guest draws and looses on the host at the ground point it sends. A projectile is launched by the host, and the arrows in flight travel by position in every frame; the host alone decides the landing, the lodging, and the floor item. The fireball is cast the same way and bursts only ahead of where it was cast.

## The world with nobody in it

- A browser host's world lives while the host's page does: close the tab and the world stops, saved. A host leaving makes every guest's character dormant before the save.
- A server world (`server/world.js`, ruled 2026-10-14) is on while anyone is in it and held when it empties: nothing moves, the clock stands, the wire still answers so a join wakes it; after ten minutes empty and saved it exits. Everyone in a server world is a guest, the owner included. The clock law survives a server: a fire you left lit is lit when you return, and nothing runs out while nobody plays.

## Saves, the host, and joining

- The world is the host's. A browser host's lives in that browser's worlds store (`src/save.js`, IndexedDB); hosting saves it first, a guest joining or leaving saves it again, and the autosave runs as before. A server world's lives on the server's disk. There is no save export.
- A guest never saves a world; it keeps a bookmark (the code, the world's name, its character there) to Rejoin from (`09`).
- Joining is loading: the welcome is the whole save (`game.serialize`), gzipped, then frames. There is no interest region; every guest is told the whole world.
- Reconnecting: your character stands where it was for sixty seconds of game time (`GRACE_S`), then goes dormant, out of the world and never hunted, until you rejoin, when it is back where it stood (`09`).
- The host's rules bind the guests: the world's rules travel in every frame and set the guest's, and a guest's Settings shows them as the host set them, not to be changed there (`ui/screens.js`). The viewer's settings (the zoom, names over heads) stay the guest's own.
- Versions: the join carries the wire's protocol (`net.PROTOCOL`, 4) and the save's version, each bumped by hand; a host refuses a guest on another with a sentence saying whose is newer, and a server world refuses a page of another build ("The game was updated").
- The dev console: the host's `__game` is the world; a guest's is its replica's, and nothing limits it yet (open; a `needs-michael` issue in wave 4 of #70).
