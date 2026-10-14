# 09 — Worlds, identities, characters

*Ruled by Michael, 2026-10-13, after his first real join through the relay (`02`). Zomboid's model, named plainly. This replaces the one-identity-per-browser arrangement of `03` and the "You screen" there; the character screen built by the coder agent becomes the identity editor. Scoped for building on the multiplayer branch, before the rest of tier 3 (`06`).*

**Status, 2026-10-13: built (the sixteenth and seventeenth moves, `02`), and the description of the game as it is; where the build settled a detail differently, the text below says so in place.**

## The words

- **A world** is a valley with its state: the map as changed, the dead, the fires, the clock, and every character in it. A world is saved in the browser that made it, one record each, and it is what a host opens to friends. A world keeps its code once it has one.
- **A character** is a survivor in one world: a player record there, with its bag, its wounds, its position, and later its skills, its profession, its story. **A character belongs to its world, full stop.** When the world goes, so does the character. A character is never moved between worlds and never saved apart from its world.
- **An identity** is a name and a look, kept in the browser, reusable. It is the seed a character is made from, and nothing more: once the character exists, the identity is not consulted again. **A stamp** (Michael): an identity edited and saved applies to every character made from it afterwards and never backfills a character already stamped; that character keeps its name and face until it dies. Michael keeps a "Michael Dippold" identity and makes a character from it in every world; no two of those characters are the same character because they share it. Editing an identity changes no character anywhere.
- **A browser id** is a hidden token each browser carries, so a world can remember which browser's character is which. It is not shown and never typed.

## The rules

1. **Each character belongs to a world.** Its bag, its hurt, and everything later hangs from the character, and the character hangs from the world.
2. **Entering a world means making a character for it.** A new world of your own: make a character. Joining a friend's world the first time: make a character. **Character creation is a multi-step process** (Michael): step 1 is the identity (pick one, make one, edit one), step 2 is a placeholder page reading "Step 2 of 2: to come" where skills and a profession will go, with Back and Next as Zomboid has them; Next on the last step makes the character. The steps exist now so that it is plain the identity is one part of a character and not the character.
3. **Identities are kept and reused.** The identities screen lists them, lets you make, edit, and delete them. A new character after a death takes an identity the same way; you make a new identity only if you want a different name or face.
4. **Rejoining a world you have a character in returns you to that character.** The world remembers your browser id (its hash) against your character. No identity is asked for: you were made to make a character the first time, so you have one. If that character died, you make a new character for that world (rule 2), choosing an identity (rule 3); the body stays where it fell. **While you are away** (your leave, or your connection gone) your character stands for sixty seconds of game time, then goes dormant: out of the simulation, not drawn and not hunted, its spot and bag kept, back where it stood when you rejoin (Michael, 2026-10-13, Zomboid's way). The host's own character is never offered to a guest; a newer join from your browser replaces an older connection of yours.
5. **No world runs until you choose one.** The title is a plain screen; nothing is created, stepped, or autosaved behind it. The checks get a fresh world through the test flag on the URL.
6. **A guest never saves a world.** The world is the host's; a guest keeps only a bookmark to it (below).
7. **A world keeps its code, and hosting is a switch** (Michael): "Open to friends", on or off, in the pause menu (as built; the world's row has none), remembered with the world so it is open again the next time it is played. On, the world is registered on the relay under its code and anyone with the code can join; off, the relay drops the room, guests are told the host closed the world, and their characters stand in it, saved. The first time the switch goes on, the code is drawn and saved with the world. A world is a world: one with a code has been open at some point, and the row shows the code; there is no separate kind of save. If the relay reports the code in use, a new one is drawn and saved.
8. **The host's save is never older than the last join or leave.** Hosting saves the world first; a guest joining or leaving saves it again; the autosave runs as before.
9. **The join carries the build's version**, as built the wire's protocol number (`net.PROTOCOL`) and the save's version, each bumped by hand. A host refuses a guest on another with a sentence that says whose is newer; both refresh.

## The screens

**The title.** Worlds, Identities, Settings, Controls. No Play, no New game, no Continue: those live on the Worlds screen, where it is clear which world they mean.

**Worlds.** Two lists and three buttons.
- *My worlds*: one row per world saved in this browser: its name, the day and hour, your character's name there (or that they died), and its code if it has one. Each row: Play (New character when yours is dead) and Delete (Delete asks once); hosting is the pause menu's switch.
- *Friends' worlds*: one row per world this browser has joined or tried to join: the world's name as the host sent it, the host's name, the code, your character's name there, when you were last in it, **and whether it is open right now** (Michael: a green dot), which the relay answers to a plain request for the code (`GET /open?code=…` gives whether a host holds it and how many guests are in), asked every ten seconds while the screen is up; the dot is the confirmation that the world is running in someone's browser and open before Rejoin is pressed. Each row: Rejoin, Forget.
- *New world*: asks for a name (a default offered: the map's and the date) and which identity; creates the world, makes your character from the identity, enters.
- *Join a game*: asks for a code; the join goes out with your browser id; if the host knows no character for it, the host answers "who", the screen asks which identity, and the join goes again with it; then the welcome. The bookmark is written at the first attempt, so a failed join still leaves a row to Rejoin from.
- *Rejoin* on a friend's row: the join with the saved code and your browser id. While the relay answers that no world is open under the code, it keeps trying every few seconds for a minute, with "Waiting for Michael to open the valley" and a Cancel: two friends refreshing at once is the usual case, not a failure.

**Identities.** The list, with New, Edit, Delete. The editor is the character screen as built (the name, the skin, the hair, the colours, the turning preview), renamed for what it edits. Deleting an identity touches no character.

**The pause menu.** Its first lines say where you are: the world's name and your character's name; on the wire, "Hosting, code hazel-tgr, 1 friend" or "In Michael's valley as Whipitgood". Resume, Save world (a host or a player alone), Open to friends (the switch, on or off, with the code and who is in; not on a guest), Character (this world's character: its name, its look, later its skills, shown, not edited), Settings, Controls, Leave world (saves if it is yours, then the Worlds screen).

**The dead screen.** "Whipitgood died." Then New character (choose an identity, a new survivor in this same world; the body stays) or Leave world. The next survivor of `05` item 34, done here.

## The data

- `settings.identities`: `[{ id, name, look }]`, and `settings.lastIdentity`, the one picked last (`src/identities.js`). The current `playerName` and `look` become the first identity on the first boot after this lands, named from `playerName` or "Survivor".
- `settings.clientId`: the browser id, drawn once from `crypto.getRandomValues`.
- A world's save gains `worldId`, `name`, `code` (or null), `created`, `open` (the switch, remembered), `owners: { [hash of clientId]: playerId }` (built as `owners`, since `characters` is the save's own list of them; the hash, `identities.idHash`, so an exported save never hands out the proof), the host's memory of whose character is whose, at most sixteen browsers (`MAX_OWNERS`), `dormant` (the characters of guests away, by the same hash), and `myPlayerId` for the index's row. These ride in the save's wrapper, never in what a guest receives. The host's own entry is in it too, so a world opened in another browser from an exported save behaves the same.
- The store (`src/save.js`): one record per world in IndexedDB (the database `cmz`, the store `worlds`, keyed by `worldId`; Michael, 2026-10-13: moved there at once rather than when the small store bites), and an index `cmz.worlds` in localStorage of `{ worldId, name, mapName, savedAt, created, label, code, myCharacter, dead }` for the list without reading every save. Under `?nosave` both are in memory for the page. The existing single slot per map became a world named "The valley" with no code on first boot.
- `settings.joined`: the friends' worlds, `[{ code, name, hostName, myCharacter, lastAt }]`, the last twenty.

## The wire

- `join { clientId, protocol, version, name, look }`, the name and look only once the host has asked. The host: another protocol or save version, `bye { reason: "version", newer: "host" | "guest" }`. No browser id, `bye { reason: "refused" }`; a seventeenth browser, `bye { reason: "full" }`; an older connection from the same browser, `bye { reason: "replaced" }` to it. A living character for the id's hash, back from dormancy if it went, the welcome with that `playerId`. None and no identity, `who {}`; the guest asks for an identity and joins again (`joinAs`). None and an identity, a new character (the name's length, the hair style, and the colours clamped), the welcome. The host records `owners[hash] = playerId` and saves.
- `leave` and a dropped socket: the character stands for sixty seconds of game time (`net.js` `GRACE_S`), then goes dormant, out of the simulation with its record in the save's wrapper, until the rejoin. A host leaving makes every guest's character dormant before its save.
- The relay carries these as it carries everything, and sends a host's broadcast only to a guest the host has welcomed, closing one the host sends a `bye`; it answers `GET /open?code=` with `{ open, guests }`, at most 120 lookups a minute per address.

## What goes

- The one identity per browser on the join (`03`); `net.setIdentity` becomes the chosen identity for the join in hand.
- The character screen as the first Play's gate; it is the identity editor, reached from Identities and from New world and Join.
- The owed item "change of name or look on a guest after join" (`06`, tier 1's owed): not a thing by design. A character's name and look are what its identity gave it; a new face is a new character.
- The title's Play, New game, Continue, Host a game, Join a game: all on the Worlds screen, against a named world.

## The order

*Step 1 built 2026-10-13 (`02`, the sixteenth move): `check("worlds")` 8 of 8. As built: `?nosave` boots a test world for the checks, with the store and the identities in memory for the page; a guest from the Worlds screen stands in a never-saved world until the host's arrives; `?host=` and `?join=` on the URL are the checks' now.*

*Steps 2 and 3 built 2026-10-13 (`02`, the seventeenth move), with the coder agent's review built in: the join by the browser id with a protocol number and the save's version, the owners as hashes in the save's wrapper, a newer join replacing an older connection, the host's own character never offered, the host clamping a guest's identity; dormancy after sixty seconds of game time with the record in the wrapper (`dormant`); the store on IndexedDB; codes of two words and four letters; the relay's `/open` with a rate limit; the friends' rows' dot; Rejoin polling for a minute. The join sends no identity until the host asks (`who`), so a browser with a character there is never asked.*

**Behind the title (Michael, 2026-10-13):** black until the painting comes; Michael works on the art. A still picture, not a world.

1. Alone: identities, the worlds store and index, the migration of the one slot, the Worlds and Identities screens, the pause menu's first lines, no world behind the title, the dead screen's New character. `check("worlds")`: a world made, left, listed, re-entered as the same character; a second world with a second identity; a death and a new character in the same world; the identity edited and neither character changed.
2. The wire: the browser id and the version on the join, `who`, the characters map and the reconnect, the host saving on join and leave, a world's code kept.
3. Friends' worlds, Rejoin with its minute of trying, Forget.

Then tier 3's remainder over it (`06`).

## Questions for Michael, answered 2026-10-13

1. A world's name: **typed, with a default offered.**
2. A character's look after creation: **fixed.** "If you need a new character, sprint into the dead; that will do it."
3. A dead character's bookmark on a friend's world: **kept; Rejoin leads to New character.**
4. Spectating after a death in a friend's world: **later, with tier 4.**

And, asked back: many single-player worlds at different points in time, revisited freely, **yes**: that is the My worlds list, each row a world at its own hour.
