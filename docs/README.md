# The docs: an index

One line per doc, with its kind (`CLAUDE.md`, "What a doc is"): a **rule** (binding; `00` and `02`), a **reference** (describes the game as it is, kept true in place, one dated status block at its top), a **spec** (not yet built, or partly; what it describes is the plan), or a **record** (`history/`; read for the why, never for the what). Since the sweep of 2026-10-16 (#70) every built spec is a reference and its plan is a record; nothing under `docs/` but `history/` is history.

## Rules

- `00-vision.md` — **rule.** The idea, the tone, the pillars, the laws, what this game is. The tiebreaker for every design question. Its four single-player lines were redrafted by the sweep and ruled by Michael on 2026-10-16 (#113).
- `02-decisions.md` — **rule.** Every ruling with its reason, newest first, a topic index of the standing rulings at its top; an overturned ruling is struck where it sits naming what overturned it; the open questions at its end are only the open ones. The build records are `history/02-build-log.md`.

## References: the game as it is

- `03-world-model.md` — chunks, the active region, rooms by flood fill, the authoring vocabulary (sets, features, padding rings).
- `04-npcs.md` — villagers as built (idle, wander, answer a poke; killable, no weapons) and the ruling; flee, follow, stay are not built.
- `05-someday.md` — ideas that must not be foreclosed cheaply, one line each; the stretch goals and moonshots (their tracking issue comes in wave 4).
- `06-art.md` — the art direction and the dev palette's rules; the sprites themselves are `data/sprites/*.json`.
- `07-lighting.md` — the light model: one function, chunks and rooms, fire as data, who reads light, the look.
- `08-renderer.md` — the WebGL2 renderer's idea and the portal rule.
- `09-openings.md` — an opening as a stack of boards and a leaf; what the dead do to it. Every number matches the data.
- `10-interface.md` — the interface's standing rulings (the grid, right-click, E, the Escape order, containers) and the HUD's bars.
- `11-character.md` — the one rule (everything is a slot) and the places an item can be.
- `12-figure.md` — the figure: the frame, the rig, the paper doll, held items, the body's rules.
- `13-placement.md` — what can be carried, removal, free building, what is left.
- `14-combat.md` — a pointer at `21` plus the two rules that outlived it (legibility; swing targets).
- `15-ground.md` — the ground baked per chunk: the rulings, the bake, the rule in words; `data/ground.json` is the truth.
- `19-characters.md` — one character model for the player, the dead, and villagers, as built.
- `20-archery.md` — the bow and the thrown spear: the idea, the control, the flight as numbers (`data/combat.json`), what an arrow hits, the decisions.
- `21-combat-buttons.md` — **the current state of combat** (read its top first): the buttons, dual wielding, the guard, the swing timer, what is not built.
- `23-engine-upgrade.md` — the engine upgrade's four pillars, its order, and the performance numbers that bind.
- `24-throwables-and-fire-magic.md` — the fireball as built; the throw not built; the open questions (#50, #51).
- `26-art-owed.md` — the pair-and-portrait rule and what has drawn art; the owed lists are issues (milestone Art owed).
- `27-art-integration.md` — how the design agent's work comes in: the delivery checklist, the audit.
- `28-painting-for-the-slicer.md` — the artist-facing page: the character's contract (the frame, the feet, the facings, the eyes) and how a part is painted and sliced.
- `sprite-definitions.md` — the sprite loader's field reference, verified against `src/assets.js`; the format every delivery is written into.
- `testing.md` — the instruments, the pane, its quirks, two tabs.
- `bugs.md` — unverified bugs under Open; a reproduced one becomes an issue (`github.md` 6); Closed holds the rulings that stop a re-file; Fixed up to 2026-10-15 is `history/bugs-fixed-2026-10-15.md`.
- `29-world/` — the 1.0 map: `README` the index and status; `01` geography and `02` water and roads (built where the status says); `04` the village as built, with your cottage; `08` the resource and the dead tables; `09` **the live art backlog**. Its specs are below.
- `30-the-big-pass-spec.md` — the big pass: the needs, every verb, the stations, fire as maintenance, durability, farming (step 4, pickable), the map place by place (steps 5 to 9, each needing a scope), the one engine list (section 12), the open questions (section 15).
- `31-multiplayer/` — `README` the index and status; `03` play with friends, system by system (the wiki's "With friends" source); `04` the wire as built; `05` the 37 seams as a table (the numbers are cited everywhere); `08` the six habits behind `CLAUDE.md`'s multiplayer rule; `09` worlds, identities, characters, dormancy, the rejoin.
- `32-better-animations.md` — the rig's pose data and the poses still to build (items 4 to 9; milestone Better animations).
- `art/README.md` and `art/01-style-bible.md` — the live art reference: the folder's index and the rulebook for drawn art, the first page for a commissioned artist. `art/02` to `10` are the record of each delivery, corrected where the game moved on.

## Specs: not built, or the unbuilt half

- `29-world/03-the-castle.md`, `05-the-farms.md`, `06-the-forest.md` — the map half of `30`'s steps 5, 4, and 6.
- `33-the-map.md` — the map on M (milestone The map; #35, #36).
- `34-talk.md` — barks and conversations (milestone Talk; #37 to #39; Michael's two decisions #90, #91).
- `36-the-horde-demo.md` — one homestead, the dead without end (milestone The horde demo; #40 to #43; held until final art).
- `35-steam-and-the-free-demo.md` — the business and marketing plan, kept vague by ruling; its decisions are #94.

## Records: `history/`

The sweep's archives, each with a banner saying what it is and where the live text lives; never edited. By source: `00-playtest-signals.md`, `00-vision-trimmed.md`, `01-parents.md`, `02-build-log.md` (the build, merge, fix, and measurement entries of `02`, and the answered open questions), `03-world-model-plan.md`, `04-npcs-assessment.md`, `05-someday-done.md`, `05-someday-scopes.md`, `06-art-palette-2026-10-11.md`, `07-lighting-build.md`, `08-renderer-build.md`, `09-openings-build.md`, `10-interface-build.md`, `11-character-build.md`, `12-figure-build.md`, `13-placement-build.md`, `14-combat-build.md`, `15-ground-build.md`, `17-village-art-build.md` (the village art's plumbing; its loader reference became `sprite-definitions.md`), `19-characters-build.md`, `20-archery-build.md`, `21-combat-build.md`, `22-the-big-pass-brain-dump.md` (superseded by `30`), `23-engine-upgrade-build.md`, `23a-review.md` (the code review behind the upgrade; its open items are a wave 4 issue), `24-throwables-answered.md`, `26-art-owed-lists.md`, `27-art-integration-2026-10-13.md`, `29-world-ideation.md` (the ideation's cut text, `07`, `10`, `11`), `30-as-built.md`, `31-01-the-breadcrumbs.md`, `31-02-the-audit.md`, `31-06-the-order.md` (the build diary), `31-multiplayer-record.md` (`07` and the old text of the rest), `32-animations-build.md`, `37-the-wiki-plan.md` (the reference is `cmz-wiki/CLAUDE.md`, `README.md`, `WRITING.md`), `art-08-10-cut.md`, `art-11-open-items.md`, `art-12-characters-from-the-art-side.md`, `art-requests/` (the five delivered briefs: `15a`, `15b`, `16`, `18`, `25`), `bugs-fixed-2026-10-15.md`, `github-2026-10-15.md` (the old `github.md` whole: why the process exists, its setup, what it decided), `todo-2026-10-08-to-15.md` (the old `TODO.md` whole).
