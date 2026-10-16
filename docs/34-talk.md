# 34 — Talk: barks and conversations

**Status: scoped 2026-10-13 with Michael (the rulings in `02`, "What this game is": talk never gates). Scoped for implementation by another model. Not built. Its two open decisions were ruled by Michael on 2026-10-16 (`02`, "The needs-michael queue"): the guide is a villager beside the spawn on every map (#90), and the panel is entirely click-based (#91).** Read `CLAUDE.md` ("Implementing from a spec", and the multiplayer rule first among the rules), `04-npcs.md`, `19-characters.md` (step 3, villagers v0.1), then this whole doc, then the files it names. The doc decides; a default in brackets is Michael's to overrule, not the implementer's.

## What it is

Villagers talk. Two kinds:

- **A bark** is one line in a bubble over a villager's head, heard by everyone near and written in the log: what they say when poked, and now and then when someone is near. The "Hey!" a poke gives today is the bark's floor, the "nothing interesting happens" of people.
- **A conversation** is a panel on the talker's own screen: the villager's lines one after another, and the player's choices between them (OSRS's dialogue, its personality and not its quests). It is how you learn the world: who these people are, what happened at the chapel, how a field is tilled, what the witch is like.

## The law: talk reads the world and never writes it (Michael, `02` 2026-10-13, "What this game is")

The ruling and its reasons are `02`: nothing is gated by talk, and talk changes nothing in the world, though it may read the world and change with it. For this spec that means: no item, door, recipe, place, or ending depends on a conversation, and a line may teach but nothing may be learnable only by talking; a conversation has no outcome (no item given, no flag set, no villager sent anywhere), while its lines change with what it reads (once the dead have come to a world that began without them, the townsfolk speak of them; at night they say night things; when the priest is dead the others say so).

- **So it is cheap for multiplayer:** a conversation is a panel on the talker's screen with nothing to sync and nothing to save. The only world effects are the ones villagers have now: standing still and turning to whoever talks to them, and a bark's bubble.
- **Made mechanical:** the talk data has no field that could write (the validator rejects any key it does not know), and the talk module imports nothing that mutates the world.

## Who talks

The seven villagers of the valley (`tools/mapgen/valley.py`, the `villager` calls; `data/maps/valley.json`): the Innkeeper, the Guest, the Child, the Priest, the Reeve, the Apprentice, the Neighbour; and the guide, placed beside the spawn (below). Each gains a **talk id** in the map file (`talk`, [default: the name lowercased]) naming its file in `data/talk/`; `createVillager` keeps it on the villager as `talk`, and the save keeps it (`serializeCharacter` keeps every field it does not drop). The id, not the name, ties a villager to their words, so names can be given later (`29/11` Q4) without touching the data. A villager whose talk id has no file barks their map `line` as today and has no conversation. The proving ground's villagers (`?map=square`) need nothing.

## The data: `data/talk/<id>.json`

```
{
  "name": "Innkeeper",
  "barks": [
    { "when": { "deadNear": true }, "lines": ["Inside! Now!", "Shut that door behind you."] },
    { "when": { "time": "night" }, "lines": ["Bar's shut. Mind the door."] },
    { "lines": ["Shut that behind you.", "Mind the step."] }
  ],
  "start": "hello",
  "nodes": {
    "hello": {
      "say": ["You look like you've walked a long way.", "Sit by the fire a while."],
      "options": [
        { "text": "What happened here?", "goto": "what" },
        { "text": "How do I keep a fire going?", "goto": "fire" },
        { "text": "Ask about the chapel.", "goto": "chapel", "when": { "villagerAlive": "priest" } },
        { "text": "Goodbye.", "end": true }
      ]
    }
  }
}
```

- **`barks`:** groups in order; the first group whose `when` matches is used, and within it the lines take turns (below). A group with no `when` is the fallback, and a file without one falls back to the villager's map `line`.
- **`nodes`:** each has `say` (one or more lines from the villager, shown one at a time) and `options` (the player's choices, each a `text` and a `goto` or `end`, each with an optional `when`), or `end: true` to close after its lines. A node's `say` may itself be a list of `{ "when", "lines" }` variants, the first matching used, so one node changes with the world without a branch for every case.
- **`when`** is an object of conditions, all of which must hold. The vocabulary is fixed in code and small, and every condition reads only what both the host and a guest's replica have:
  - `time`: `"day"`, `"night"`, `"dawn"`, `"dusk"` (`clock.js`).
  - `deadNear`: true or false, any of the dead within [8 tiles] of the villager.
  - `deadInWorld`: true or false, any of the dead anywhere in the world [`state.zombies.length > 0`; the quiet first day of `02`'s long arc will read this, or a world flag its scripted arrival sets, `05`].
  - `villagerAlive` / `villagerDead`: a talk id.
  - `indoors`: the villager's tile is in a room (`map.roomAt`).
  - `hurt`: the villager is below full health.
  - `holding`: an item id or tag in the talker's hands (barks: the poker; conversations: the talker).
  - `hungry`, `thirsty`, `tired`, `bleeding`: the talker's moodle past its second stage.
  - **Nothing remembers what was said, in 1.0** (Michael, 2026-10-13). Every conversation starts at `start`. Memory is wanted later ("oh, you again"), as a per-character record of what was heard, kept on the player, in the save and the sync check; **keep it cheap to add:** node ids are stable names, never indexes or generated, and a node is addressed as `<talk id>/<node id>`, so a later `heard` condition and set can name them without touching a file's shape.

`python -I tools/validate-data.py` checks every talk file: every `goto` names a node, `start` exists, every condition name is known and its value the right type, every talk id in `villagerAlive` and `villagerDead` exists, no unknown key anywhere, and a bark line is at most [70 characters] so the bubble stays a bubble.

## The guide: one villager who explains the rules (Michael, `02` 2026-10-13, "The guide")

The ruling is `02`: one chosen villager, safe from the dead, whom a new player can always find and ask how the game works, the choices being their questions. The build:

- **Who and where (Michael, 2026-10-16, #90):** "a Guide beside the spawn on every map, given a reason to be there and written like anyone else." The guide is a villager who stands beside the player's spawn **on every map, as a rule**: the map generator places them (`tools/mapgen/mapgen.py`, beside the spawn it is given, so the valley, the staging map, and any map to come all have one; `guide: true` on the villager, kept like `talk`). They have **a reason to be there** (an old neighbour who lives by the spawn, a traveller sheltering in your yard: the writer's choice) and **a name and a voice like any villager**, never a sign or a tutorial box. On the valley they stand by your cottage.
- **Immune to the dead, whatever the settings** (Michael, 2026-10-13: simpler and safer than fighting the map for a safe spawn): the dead never target, bite, or turn the guide, with Zombies attack villagers on or off. One check in the dead's choice of target (`entities/zombie.js`, where villagers are picked) and in any damage to a villager skips a villager with `guide`. Where they stand is then a matter of finding them, not of safety, and beside the spawn they are found at once; their wander stays on a short tether (villagers already keep to their own side of the walls, `movement.roomOf`).
- **The topics are the game's systems as they are built:** [water (the wells and any water, the waterskin, drinking and filling); food and cooking (eating, any lit fire that cooks, the oven); fire (fuel, feeding, the hours); sleep (a bed indoors, and with friends, everyone in bed); shelter (doors and shutters on `E`, boards on `B`, the dead breaking in); fighting (the three buttons, the weapons, wear by kills); making things (the stations, their recipes, the ingredients reached in the bag and nearby containers); healing (bleeding and bandages); building and carrying (`N`, `X`, furniture on your head); the bag, the belt, and the character screen]. Farming, the map, and each system to come join the list when they are built. **[A rule with it: every new system adds its question to the guide's file in the same commit, as every change carries the guest's side.]** An answer is a few short lines, then back to the questions; a topic may have a follow-up or two. **Every topic carries a wiki link** to its page (Michael, 2026-10-16, #91): opened in a new tab, or copied if leaving the game for a new window is awkward.
- **It is still talk:** it teaches, it gates nothing, and everything it says is also learnable by playing (the Controls screen, the menus, the prompts). The guide's file is written whole by the implementer from the game as built, checked against the code, and Michael tunes the voice.
- **Their bark points the way:** poked, the guide says something like "Ask me anything, if you're stuck." [in the fallback group].

## How it works

### The module (`src/talk.js`, no DOM, runs headless)

Loads `data/talk/` at boot (the manifest lists it, `tools/manifest.py`), and offers: `matches(when, ctx)`, `barkFor(villager, ctx)`, `node(talkId, nodeId, ctx)` (the node's lines and the options whose `when` holds). `ctx` is built by one function from the world state the conditions name, the villager, and the talker, on whichever side calls it.

### Barks (on the authority)

- **Poked:** `pokeVillager` (`entities/villager.js`) says `talk.barkFor(...)` in place of `v.greeting` (a villager with no talk file keeps its greeting). It runs where it runs today: the host's step, from a left click or the menu's Poke.
- **Unprompted:** in `updateVillager`, a villager who is idle or wandering with a living player within [6 tiles] and whose last bark was more than [60 seconds of game time] ago says a bark [and turns toward the nearest player]. [Only groups marked `"ambient": true` are said unprompted, so a poke's answer and a passing remark can differ; a group without the mark is for pokes alone.]
- **Taking turns, without the generator:** within a group the lines go in turn by a counter on the villager ([`v.barkTurn`], saved with it as any field is); the counter is bookkeeping that nothing reads, not world state talk could change anything by. [No `rng` roll, so a bark never shifts the sim's generator and the determinism hash on a fresh boot is unchanged.]
- **The bubble already reaches a guest:** `say` sets `ch.line`, which rides in the villager's record in the frame (`net.js`, the record's `line`), and the guest's speech module draws it and writes it in the log. Nothing new on the wire.
- **The guest's left click on a villager** already reaches the host by the villager's id (`net.sendPokeVillager`, built 2026-10-14; the menu's Poke goes the same way) and the host checks the reach; talk's poke rides that path.

### Conversations (the panel on the talker's screen)

- **Starting one** (Michael, 2026-10-16, #91): **`E` when a villager is the nearest thing within reach** ("E: talk to <name>"), and **the right-click menu's "Talk to <name>" as the backup**, beside Poke; the left click still pokes. **Which thing `E` means** (Michael agreed a rule is needed, 2026-10-14): `E` already opens the nearest door or shutter, and villagers stand by doors (the Innkeeper by the inn's). [The nearest thing wins, measured from the player's feet to the villager's feet and to an opening's edge midpoint; the prompt names it ("E: talk to the Innkeeper" or "E: open the door"), so the player always sees which before pressing.] Its `perform` runs on the host, as every menu entry does (a guest's goes as the existing command by address and label): it checks the reach and that the villager is not hurt, dead, or with the dead within [5 tiles] (then they bark instead: [their `deadNear` group]); it sets the villager to `talk`, facing the talker, with the talker's id added to `v.talkingWith` (a list of player ids; the villager stays in `talk` while it is not empty); and it opens the panel for the talker: on the host's own player directly, on a guest through a message like the station's (`net.js` `opened`, `main.js` `opened`: a new `talk` kind naming the villager's id), and the guest opens the panel on its replica.
- **The panel** (`src/ui/talk-panel.js`, on the kit like the station panel: the villager's name in the header with the X, bottom centre [above the belt]): **entirely click-based** (Michael, 2026-10-16, #91): the panel opens on the villager's **default message**, with the **topics** to explore as buttons, each with its **wiki link**; when the villager has more to say the only button is **Continue…**; when replies are offered they are buttons; and **"That's all for now"** is always there to close it, as well as the X, as every panel has. **No key binds inside the panel:** `E`, `Space`, and 1 to 9 keep their world meanings, since only the pause menu stops the game and a fight mid-conversation must never be lost (Escape closes it in the panels' Escape order, as for any panel). Everything it shows is computed on the talker's own side from the talk data and its own world (the replica, for a guest): **nothing in a conversation crosses the wire.** [Each villager line also goes in the talker's own log, in the villager's name, so it can be read back.]
- **Ending one:** "That's all for now", an `end` node, the X, Escape, walking out of [reach plus a tile], or the villager hurt, turned, or dead. The panel tells the host the talker has left (a host function for its own player, a small command for a guest [`net.sendTalkEnd(villagerId)`]); the host removes the id from `v.talkingWith`, and when it is empty the villager goes back to idle. The host also drops a talker who walks away or goes dormant, so a lost message cannot hold a villager for ever.
- **Two players with one villager:** both have their own panel, the villager faces whoever spoke last, and nothing either says reaches the other.

### The guest's side, item by item (`31/08`)

1. Barks run in the host's step; the conversation's world effects (the villager stopping and turning) run on the host through the menu entry's `perform`.
2. A guest reaches both by the same paths: the menu's Talk and Poke as commands by address, the left click's poke by the villager's id, `E` as the existing key event.
3. A bark reaches a guest in the villager's record (`line`); `talk`, `talkingWith`, `barkTurn`, and the state ride in the save and the record; the panel's contents are computed locally and never sent.
4. The sync check's `dead` part already hashes a villager's state and facing; add `talkingWith` to it [as a sorted list].
5. No module-level state for one player: the open conversation lives in the panel's client state; the bark clock and turn live on the villager; time from `loop.simTime()`.
6. Tried in two tabs, with `check("sync")` passing during and after a guest's conversation, and the frame's bytes unchanged by a conversation.

## The words

1.0's villagers are pre-authored and fixed (Michael, 2026-10-13): the richest have several topics, a lot to say, and several paths; the player picks from a few set options at each turn, OSRS style; there for the player to explore, never required.

The engine is small; the writing is the work. The implementer writes **one whole file, the guide's** (barks for the dead near, night, poked, and ambient; a conversation with the guide's questions, above, plus who they are, why they are by your cottage, the valley, and one about the dead that shows only when `deadInWorld`), and **stub files for the other seven** (their map `line` as the fallback bark, one ambient group, a two-node conversation in their voice), so every path is exercised. Michael, or a writing session he starts, fills the rest. The voice (Michael, 2026-10-16, #91): **warm and slightly cheeky, the OSRS formula, and welcoming**, since the guide may be a new player's first conversation in the game; and from `00`: short plain lines; cute and gloomy together, never resolved; deaths said plainly; people referred to as they and them; no line that tells the player they must do something.

## Build order

Each step verified in the browser pane through `window.__game` with `loop.setPaused(true)` and `loop.advance(1/60)` before the next; `?nosave` on the URL; `node --check` on every touched module.

1. **The data and the module.** `data/talk/` with the guide's file and the seven stubs, the talk ids in `valley.py`, the guide placed beside the spawn by `mapgen.py` for every map (rerun the generators: `python -I tools/mapgen/valley.py`, and `staging.py`) and on the villagers, the guide skipped by the dead's targeting and immune to their bite, `src/talk.js`, the validator's rows, the manifest. Verify headless: every node of every file reachable, every condition evaluated against a world from `node tools/world.js`.
2. **Barks.** The poke's bark, the ambient barks, the turns. Verify: poke the Innkeeper by day and by night (`]` moves the clock) and with a zombie placed near; stand near and wait out the cooldown; the determinism hash on a fresh boot unchanged.
3. **The guest's poke by id.** Two tabs: the guest left-clicks a villager, the host's villager barks, both logs show the line.
4. **Conversations.** The menu entry and `E`, the host's `perform`, `talkingWith`, the panel, the endings, the guest's `talk` message and `sendTalkEnd`. Two tabs: each player talks to the same villager at once; the villager stands while either panel is open and wanders when both close; `check("sync")` passes throughout.
5. **The check and the docs.** `tools/checks/talk.js` (below), `CLAUDE.md` (the code map, the check), `04` (what is built), `TODO.md`, and any ruling the build forced in `02`.

## Acceptance (`await __game.check("talk")`, plus the two-tab rows by hand)

1. Every talk file validates; every node is reachable from `start`.
1. The guide: exactly one villager is marked; with Zombies attack villagers on and one of the dead placed beside them, the dead never target or hurt them while another villager in reach is hunted; every topic of the guide's file names a system that exists in the code.
2. A poke by day, by night, and with the dead near each gives a line from the matching group, in turn.
3. An ambient bark comes only with a player within the radius and not twice inside the cooldown; never from a villager who is hurt, talking, or dead.
4. Talk to a villager (E, or the right-click menu): they stop and face the talker; options whose `when` fails are not shown; every step is a click (Continue…, a topic, a reply), and `E`, `Space`, and 1 to 9 still act in the world with the panel open; each topic's wiki link opens in a new tab; "That's all for now", the X, Escape, and walking away each end it and the villager wanders again.
5. **Talk writes nothing:** the world's `serialize` text is the same before and after walking every path of every conversation headless, apart from the villager's `state`, `facing`, and `talkingWith` while the conversation is open, which are back as they were once it ends [and `barkTurn`, which only barks advance].
6. The determinism hash on a fresh boot is unchanged.
7. Two tabs: a guest's left-click poke barks on the host and shows on both; a guest's conversation opens on its replica and holds the villager on the host; two players talking to one villager release it only when both have left; `check("sync")` passes; a conversation adds no bytes to the frames beyond the villager's state.

## Not in this scope

Memory of what was said (wanted after 1.0, `05`), quests, anything a conversation gives or sets, barter, villager routines and following (`04`), scripted scenes (`05`), voiced lines, the dead speaking (they groan, `19`), player-to-villager lines typed into the chat.
