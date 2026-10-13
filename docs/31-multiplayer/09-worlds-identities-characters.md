# 09 — Worlds, identities, characters

*Ruled by Michael, 2026-10-13, after his first real join through the relay (`02`). Zomboid's model, named plainly. This replaces the one-identity-per-browser arrangement of `03` and the "You screen" there; the character screen built by the coder agent becomes the identity editor. Scoped for building on the multiplayer branch, before the rest of tier 3 (`06`).*

## The words

- **A world** is a valley with its state: the map as changed, the dead, the fires, the clock, and every character in it. A world is saved in the browser that made it, one record each, and it is what a host opens to friends. A world keeps its code once it has one.
- **A character** is a survivor in one world: a player record there, with its bag, its wounds, its position, and later its skills, its profession, its story. **A character belongs to its world, full stop.** When the world goes, so does the character. A character is never moved between worlds and never saved apart from its world.
- **An identity** is a name and a look, kept in the browser, reusable. It is the seed a character is made from, and nothing more: once the character exists, the identity is not consulted again. Michael keeps a "Michael Dippold" identity and makes a character from it in every world; no two of those characters are the same character because they share it. Editing an identity changes no character anywhere.
- **A browser id** is a hidden token each browser carries, so a world can remember which browser's character is which. It is not shown and never typed.

## The rules

1. **Each character belongs to a world.** Its bag, its hurt, and everything later hangs from the character, and the character hangs from the world.
2. **Entering a world means making a character for it.** A new world of your own: make a character. Joining a friend's world the first time: make a character. The screen for that is one choice, which identity, since the identity carries the name and the look; the world then has a character seeded from it.
3. **Identities are kept and reused.** The identities screen lists them, lets you make, edit, and delete them. A new character after a death takes an identity the same way; you make a new identity only if you want a different name or face.
4. **Rejoining a world you have a character in returns you to that character.** The world remembers your browser id against your character. No identity is asked for: you were made to make a character the first time, so you have one. If that character died, you make a new character for that world (rule 2), choosing an identity (rule 3); the body stays where it fell.
5. **No world runs until you choose one.** The title is a plain screen; nothing is created, stepped, or autosaved behind it. The checks get a fresh world through the test flag on the URL.
6. **A guest never saves a world.** The world is the host's; a guest keeps only a bookmark to it (below).
7. **A world keeps its code.** Hosting a world the first time draws a code and saves it with the world; every later hosting uses the same code, so friends come back with the one they have. If the relay reports the code in use, a new one is drawn and saved.
8. **The host's save is never older than the last join or leave.** Hosting saves the world first; a guest joining or leaving saves it again; the autosave runs as before.
9. **The join carries the build's version.** A host refuses a guest on another build with a sentence that says whose is newer; both refresh.

## The screens

**The title.** Worlds, Identities, Settings, Controls. No Play, no New game, no Continue: those live on the Worlds screen, where it is clear which world they mean.

**Worlds.** Two lists and three buttons.
- *My worlds*: one row per world saved in this browser: its name, the day and hour, your character's name there (or "no survivor" after a death), and its code if it has one. Each row: Play, Host, Delete (Delete asks once).
- *Friends' worlds*: one row per world this browser has joined or tried to join: the world's name as the host sent it, the host's name, the code, your character's name there, when you were last in it. Each row: Rejoin, Forget.
- *New world*: asks for a name (a default offered: the map's and the date) and which identity; creates the world, makes your character from the identity, enters.
- *Join a game*: asks for a code; the join goes out with your browser id; if the host knows no character for it, the host answers "who", the screen asks which identity, and the join goes again with it; then the welcome. The bookmark is written at the first attempt, so a failed join still leaves a row to Rejoin from.
- *Rejoin* on a friend's row: the join with the saved code and your browser id. While the relay answers that no world is open under the code, it keeps trying every few seconds for a minute, with "Waiting for Michael to open the valley" and a Cancel: two friends refreshing at once is the usual case, not a failure.

**Identities.** The list, with New, Edit, Delete. The editor is the character screen as built (the name, the skin, the hair, the colours, the turning preview), renamed for what it edits. Deleting an identity touches no character.

**The pause menu.** Its first lines say where you are: the world's name and your character's name; on the wire, "Hosting, code hazel-tgr, 1 friend" or "In Michael's valley as Whipitgood". Resume, Save world (a host or a player alone), Host this world or Stop hosting, Character (this world's character: its name, its look, later its skills, shown, not edited), Settings, Controls, Leave world (saves if it is yours, then the Worlds screen).

**The dead screen.** "Whipitgood died." Then New character (choose an identity, a new survivor in this same world; the body stays) or Leave world. The next survivor of `05` item 34, done here.

## The data

- `settings.identities`: `[{ id, name, look }]`. The current `playerName` and `look` become the first identity on the first boot after this lands, named from `playerName` or "Survivor".
- `settings.clientId`: the browser id, drawn once.
- A world's save gains `worldId`, `name`, `code` (or null), `created`, and `characters: { [clientId]: playerId }`, the host's memory of whose character is whose. The host's own entry is in it too, so a world opened in another browser from an exported save behaves the same.
- The store: one record per world, `cmz.world.<worldId>`, and an index `cmz.worlds` of `{ worldId, name, mapName, day, savedAt, code, myCharacter }` for the list without reading every save. The existing single slot per map becomes a world named "The valley" with no code on first boot. At about 700 KB a save and five to ten megabytes of browser storage, around eight worlds fit; the browser's larger store (IndexedDB) when that bites, not before.
- `settings.joined`: the friends' worlds, `[{ code, name, hostName, myCharacter, lastAt }]`.

## The wire

- `join { clientId, version, identity? }`. The host: a version other than its own, `error { reason: "version", newer: "host" | "guest" }`. A living character for the client id, the welcome with that `playerId`. None and no identity, `who {}`; the guest asks for an identity and joins again. None and an identity, a new character, the welcome. The host records `characters[clientId] = playerId` and saves.
- `leave` and a dropped socket: the character stays where it stood (the grace period of `07` question 17 applies when the reconnect lands; until then it stands).
- The relay is unchanged: it carries these as it carries everything.

## What goes

- The one identity per browser on the join (`03`); `net.setIdentity` becomes the chosen identity for the join in hand.
- The character screen as the first Play's gate; it is the identity editor, reached from Identities and from New world and Join.
- The owed item "change of name or look on a guest after join" (`06`, tier 1's owed): not a thing by design. A character's name and look are what its identity gave it; a new face is a new character.
- The title's Play, New game, Continue, Host a game, Join a game: all on the Worlds screen, against a named world.

## The order

1. Alone: identities, the worlds store and index, the migration of the one slot, the Worlds and Identities screens, the pause menu's first lines, no world behind the title, the dead screen's New character. `check("worlds")`: a world made, left, listed, re-entered as the same character; a second world with a second identity; a death and a new character in the same world; the identity edited and neither character changed.
2. The wire: the browser id and the version on the join, `who`, the characters map and the reconnect, the host saving on join and leave, a world's code kept.
3. Friends' worlds, Rejoin with its minute of trying, Forget.

Then tier 3's remainder over it (`06`).

## Questions for Michael

1. A world's name: typed with a default offered (the recommendation), or automatic and renamable later.
2. A character's look after creation: fixed (Zomboid; the recommendation), or editable from the pause menu's Character screen. Fixed keeps "a new face is a new character" true.
3. A dead character's bookmark on a friend's world: the row stays and Rejoin leads to New character (the recommendation), or the row is dropped.
4. Spectating after a death in a friend's world (`05` item 33): later, with tier 4; the dead screen's two choices are enough now.
