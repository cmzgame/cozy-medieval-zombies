# 38 — The menus and the site: a game menu, not a modal over a game

**Status: a scope, 2026-10-16, for Michael to rule (#16). Not built.** Each question below has options and a recommendation; his answers go to `docs/02` under the day's date, then the build order becomes issues under the milestone "The menus and the site". The two fixes found while scoping are pull request #80 (the world left no longer shows behind the menus; a key held into a screen's field is let go). Read `CLAUDE.md` first; nothing here changes a ruling until Michael makes it.

## What it is

Everything outside a world: the title, the Worlds screen, identities and character creation, settings, controls, the owner's screens, the dead screen, and the page the game sits in. Michael's complaint (2026-10-15): it reads as a modal laid over a game, a semi-transparent panel over the world or over nothing, and dying and backing out to the menu he still saw the game behind it. The goal is Project Zomboid's line, whatever else its interface does badly: **you know when you are loading into a game and when you have left one.**

## What already stands (rulings this scope keeps)

- **The words and the flow** (`31-multiplayer/09`): a world is chosen on the Worlds screen, never assumed; the title offers Worlds, Identities, Settings, Controls and no Play; entering a world means making a character for it, in steps; the pause menu says where you are; the dead screen offers New character or Leave world.
- **Behind the title: black until the painting comes; a still picture, not a world** (Michael, 2026-10-13, `31/09`). Michael works on that art.
- **No world runs until you choose one** (`31/09` rule 5): nothing created, stepped, or autosaved behind the title.
- **Only the pause menu stops the game** (`CLAUDE.md`'s laws; `02` 2026-10-15), and on the wire not even that: a screen stands this client's player still.
- **The stone on three things only** (`02` 2026-10-12): the bag, the character screen, and the belt; "the screens, the menu, the build list, the prompt, the message, and the moodle tips keep their dark translucent look"; the timber buttons everywhere. Question 2 asks whether the out-of-world screens may leave that look.
- **The font is Pixelify Sans** (`23`, Q4c), Segoe the fallback.
- **The sandbox settings screen's shape is pinned** (`10`, "Pinned"): a registry in `settings.js` (key, label, group, kind), groups as tabs or sections, the world's rules told apart from the personal ones.
- **Spectating is wanted someday** (`05`, the later three of multiplayer): "keep the dead screen a screen over a world still drawn." So the dead screen stays an in-world screen here, never a page that ends the world's picture.
- **The Steam build is Electron** (`35`): a Quit button, fullscreen, and a resolution choice come with it; nothing here should make them awkward to add.
- **The private half of infrastructure day** (`TODO.md`): the game's name, a domain, and the game's own site are Michael's and Primary's, off the repository. "The site" in this scope is the page the game runs in, nothing more (question 9).

## The screens today

Screenshots from the pane at 1024 by 768 (`images/38-the-menus-and-the-site/`). The out-of-world ones are taken as #80 leaves them: the canvas black, the debug corner and the chat box hidden.

**In a world** (over the world, which keeps running on the wire):

- **Pause** (`images/38-the-menus-and-the-site/pause.jpg`): Resume, Save world, Open to friends, Character, Settings, Controls, Leave world; its first lines say where you are. The panel is narrow and centred, the world at half dim behind it, the debug text drawn over the panel's top lines.
- **Settings** (`settings.jpg`): seventeen rows in one scrolling list, mixing the world's rules (aggro, survival, free building, multi-hit), the personal ones (interface size, zoom, cursor, names), and the testing ones (combat testing, dev chest, swing targets, hit shapes, the debug corner, the square's surface), then the hair row and one row per painted layer. **The chosen answer cannot be read:** a selected button differs from the others only by the timber button's "down" picture (`style.css`, `.setting .choices button.on`), the same picture a button shows while pressed.
- **Controls** (`controls.jpg`): twenty-five keys in one list in no order; R appears twice (turn what you place; rotate what you drag); the debug keys sit among the play keys.
- **Dead** (`dead.jpg`): "P6444 died", the day and hour, New character, Leave world. Over the world, as `05` wants.
- **Character, Open to friends, the owner's screen, Stepped away**: small panels of the same kind.

**Out of a world** (over black since #80; over the frozen last frame before it):

- **Title** (`title.jpg`): the name, one line, four buttons, in the same small box as the pause menu. Nothing else on the screen.
- **Worlds** (`worlds.jpg`): a box with My worlds (one row each: name, day and hour, your character; Play, Delete), the friends' worlds with their green dot, the server worlds of yours, then New world, Join a game, and, with the creator key, "A world of mine on the server".
- **New world, Join a game**: one field and Next. The join screen prints the relay's address ("Through the relay at wss://cmz-relay.fly.dev").
- **A character for …** (`create.jpg`): step 1 of 2, the identity list, New identity; step 2 a placeholder.
- **The identity editor** (`identity.jpg`): name, skin, the dead's skins, hair, hair colour, eyes, a turning preview; Save, Cancel, and "Reload hair", a tool for painted hair in a player's screen. The swatches show their choice with a gold outline; the hair styles show it with the same unreadable "down" picture.
- **The server's screens**: the creator key, the owner key shown once, a world of mine on the server, Rejoin's wait. Plain boxes of fields and long sentences.

## The problems

1. **The world left showed behind the menus.** The step stopped but the canvas kept its last frame, so the Worlds screen sat over a frozen village. Fixed by #80 (`gl.blank()` while no world is in).
2. **In a world and out of one look the same.** The same small dark box, the same buttons, the same place on the screen, over a world or over black. Nothing says "you have left".
3. **No moment of entering.** A world is made in about 90 ms and the screen simply changes; the first two seconds after entry held one frame of about a second (measured once in the pane, 2026-10-16, a new world: the ground and the first sight baking in view). Leaving is as abrupt: the save runs and the Worlds screen appears.
4. **A guest stands in a fake world while joining.** `main.js` `joinWorld` boots a stand-in world (a fresh valley, never saved) so the client has something to step while the host's world is on its way; the guest sees a valley that is not the one they are joining, then it swaps.
5. **The settings are one long list**, the rules, the personal, and the testing mixed, and the chosen answer is unreadable (above). The rules screen's hard-to-read choice was ruled to be fixed here (`02` 2026-10-15).
6. **The debug corner draws over the screens** (`pause.jpg`, `settings.jpg`): `#debug` is outside `#ui`, so the screens' `z-index` does not lift them over it.
7. **The screens explain little** and leak the plumbing: the relay's address, "creator key", "owner key", a "Reload hair" button for players.
8. **No wiki link anywhere**, though the wiki is the game's manual.
9. **Controls in no order**, a duplicate, the debug keys among the play keys.

## Questions for Michael

**Q1. What is behind the out-of-world screens?**
- (a) Black, as ruled until the painting comes, with the menus' own frame doing the work.
- (b) A still placeholder picture made at boot from art already in the game (a cottage, trees, a fire, the goobers, the fireball's glow on a night ground), generated through the same interface as real sprite sheets (a sprite definition with a `placeholder.kind`), so Michael's painting replaces it by saving a drawn one, with no code change.
- (c) A live view of a world, stepped or not.

**Recommended: (b).** It honours the ruling's letter (a still picture, not a world), follows the law that placeholder art is generated through the real interface, and makes the title look like a game from the first build. (c) is ruled out by `31/09` rule 5.

**Q2. The look of the out-of-world screens: may they leave the dark translucent box?** The ruling of 2026-10-12 keeps the screens on the dark translucent look.
- (a) Keep the box, made opaque and larger.
- (b) **Full-screen pages** out of a world: the name as a wordmark at the top over the backdrop, a column of timber buttons down one side (Worlds, Identities, Settings, Controls, Wiki), and the chosen page's content in a dark panel beside it, the way Zomboid and Minecraft lay out their menus. In a world, the screens stay boxes over the dimmed world, as today.
- (c) Put the out-of-world pages on the stone kit.

**Recommended: (b).** The difference in layout is itself the line between in a world and out of one: a page that fills the window means no world, a box over a dimmed world means a world is running. It keeps the dark panel and the timber buttons, so the stone ruling holds for everything it was about; only the out-of-world screens change shape.

**Q3. How is "in a world" marked?**
- (a) As now: the world at half dim behind any screen.
- (b) A world behind a screen always shows dimmed and never fully covered; a full-screen page never appears over a world; the debug corner sits under the screens; the pause menu names the world and the character at its top, as now, in larger type.

**Recommended: (b).** Problem 6 is fixed here, and the rule is simple enough for every later screen to keep.

**Q4. A screen for entering and leaving a world?**
- (a) None; the world appears.
- (b) **The loading screen for worlds too:** the boot shell's screen (`index.html` `#loading`, `boot.js`) shown while a world is read, restored, and its first ring baked, with its stages named ("Reading Ashford", "Waking the valley", "The ground round you"), closed only when the first frame is under budget; leaving shows "Saving Ashford" until the save is written, then the Worlds page. For a guest: "Joining oak-abc…" with Cancel, covering the stand-in world until the welcome, then the same stages.
- (c) A fade to black and back.

**Recommended: (b).** It is the line Michael asked for, it hides the one-second stall, and it covers the stand-in world without restructuring `main.js` (the stand-in stays underneath; only what is drawn changes, which keeps `31/08`'s rule not to restructure `main`, `loop`, and the rest). [The screen shows at least half a second so it never flickers.]

**Q5. Settings: which tabs, and where do the world's rules live?**
- (a) Tabs on one Settings screen, generated from a registry in `settings.js` (key, label, group, kind, a line of explanation each), as `10`'s pin says: **World rules** (zombie aggro, zombies attack villagers, survival, free building, multi-hit; shown as the host's and locked on a guest, as now), **Display** (interface size, zoom, cursor, names over heads, swing timer, bow aim guide), **Testing** (combat testing, dev chest, swing targets, hit shapes, the debug corner, the square's surface, hair and the painted layers). Where Electron comes, Display gains fullscreen and the resolution.
- (b) As (a), and the world's rules move into the world: chosen as a "Sandbox" step of New world (Zomboid's way) and changed by the host from the pause menu, carried in the save.

**Recommended: (a) now, (b) as its own ruling later.** (b) is better design but touches the save and `rules.js` (a browser's world reads the settings today; a server world already carries its rules in its save), so it needs Michael's word on the save format and is its own issue.

**Q6. How is the chosen answer shown?**
- (a) The chosen button gold: the gold outline the identity editor's swatches (`--gold`) and the chosen identity in character creation (`.row-item.on`, `#c9a24a`) already use for "chosen", with gold text, the others dimmed.
- (b) Two-choice rows as a switch and long ones as a dropdown (`10`'s pin).

**Recommended: (a)**, one language for "chosen" across every screen, and the smallest change that makes it readable; (b) can follow for rows that grow long (the cursor, the interface size).

**Q7. The Testing settings and the debug corner for players?**
- (a) Shown, as the last tab, labelled Testing.
- (b) Hidden unless the URL says `?dev`.

**Recommended: (a)** while the game is in development and Michael plays with them on; hidden in the Steam build later, a one-line change when it comes.

**Q8. The spartan screens.**
- Worlds: each row a little card: the name, the character and whether they live, the day and hour, when last played, the code if it has one, a small "on the server" mark; Play the main button, Delete behind a smaller one.
- Join: one sentence ("Type the code your friend gave you"); the relay's address goes to the Testing tab.
- The server's screens: one plain sentence each on what the key is and who has it; [unchanged in what they do].
- The identity editor: "Reload hair" moves to the Testing tab.
- Controls: grouped (Moving, Fighting, Building, Your things, Talking, Testing), the duplicate R written once as "R: turn what you place or drag".
- **Recommended: all of the above**, as one issue; nothing in it changes what a screen does.

**Q9. The wiki, and "the site".**
- The wiki (`cmzgame.github.io/cmz-wiki`) opens in a new tab from a Wiki button on the title's column and a line at the foot of Controls. [Not in the pause menu.]
- "The site" here is only the page the game runs in: its tab title, an icon, and the loading screen's look matched to the menus. The game's own site, its name, and a domain stay with the private half of infrastructure day, off the repository.
- **Recommended: both**, and Michael to say if "the site" meant more.

## The build order (issues to file once ruled)

Each step is a pull request, verified in the pane through `window.__game` with `check("worlds")` passing before and after; none touches the save, the wire, or `net.PROTOCOL` unless Q5 (b) is chosen.

1. **The two fixes.** #80 (the canvas blank with no world in; a key held into a field let go). Open now.
2. **In a world, out of one** (Q3): the debug corner under the screens; the screens over a world always dimmed, never covering; the pause menu's where-you-are in larger type. Small.
3. **Settings in tabs** (Q5 a, Q6, Q7): the registry in `settings.js`, the tabs generated from it, a line of explanation per row, the chosen answer gold everywhere (the hair styles included).
4. **The out-of-world pages** (Q1, Q2): the full-screen layout for the title, Worlds, Identities, the identity editor, New world, Join, and creation; the backdrop as a generated placeholder picture with Michael's painting its replacement.
5. **Entering and leaving** (Q4): the loading screen for a world, a guest's join covered until the welcome, leaving saved behind "Saving …". Tried with a guest in two tabs (`?nosave&relay=none`), `check("sync")` passing.
6. **The screens explained** (Q8, Q9): Worlds rows, Join, the server's screens, Controls grouped, the wiki linked, the page's title and icon.
7. **The world's rules in the world** (Q5 b), only if ruled; its own scope first.

## The guest's side

The menus are each client's own: nothing here is world state, so nothing joins the save, the frame, or `game.syncParts`. What must keep working, and be as clear for a guest as for a host: the Worlds screen's friends' rows and Rejoin, Join a game, the host's "who" (choose an identity), the dead screen's New character as a rejoin, the pause menu's where-you-are on a guest, the world's rules shown as the host's and locked. Step 5 changes what a guest sees while joining and is tried in two tabs; every other step is tried once as a guest in the pane to see the screens read right.
