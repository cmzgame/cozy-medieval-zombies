# The docs: an index

One line per doc, with its kind (`CLAUDE.md`, "What a doc is"): a **rule** (binding; `00` and `02`), a **reference** (describes the game as it is; kept true in place), a **spec** (built, partly built, or not built; a built spec's status block at its top is the live part and its body the plan it was built from), a **brief** (a request to the design agent), or a **record** (history; read for the why, never for the what). The sweep's wave 3 (#70) moves the records under `docs/history/` and trims the rest; until then this index is where a reader learns which is which.

## Rules

- `00-vision.md` — **rule.** The idea, the tone, the pillars, the laws, what this game is (2026-10-13). The tiebreaker for every design question. Four lines read single-player and are Michael's to reword.
- `02-decisions.md` — **rule.** Every ruling with its reason, newest first, with a topic index at its top; an overturned ruling is struck where it sits naming what overturned it; the open questions at its end are only the open ones. The build records are `history/02-build-log.md`.

## References

- `05-someday.md` — **reference.** Ideas that must not be foreclosed cheaply, one line each (several of its entries are built or ruled and come out in wave 3a).
- `06-art.md` — **reference.** The art direction and the dev palette's rules.
- `26-art-owed.md` — **reference.** The item art still owed, each as a pair and a portrait.
- `27-art-integration.md` — **reference (process).** How the design agent's work comes in: the delivery checklist, the audit; section D's corrections were applied 2026-10-16.
- `28-painting-for-the-slicer.md` — **reference.** The rules a character part is painted by and what the slicer does with a file; the artist-facing page.
- `31-multiplayer/08-for-the-coder-agent.md` — **reference.** The six habits every change follows (the checklist's one home is `CLAUDE.md`'s multiplayer rule; this is the why).
- `31-multiplayer/09-worlds-identities-characters.md` — **reference.** Worlds, identities, characters, dormancy, the rejoin: the model as built.
- `31-multiplayer/03-the-game-with-more-than-one-player.md` — **reference.** The rule for each system with more than one player; the wiki's "With friends" source.
- `31-multiplayer/04-the-architecture.md` — **reference (its status block).** The wire as built; the body is the plan.
- `31-multiplayer/05-the-seams.md` — **reference (a numbered table).** The 37 seams, each with its build status; the numbers are cited across the docs.
- `testing.md` — **reference.** The instruments, the pane, its quirks, two tabs.
- `bugs.md` — **reference (process).** Unverified bugs under Open; a reproduced one becomes an issue (`github.md` 6); Fixed and Closed are its record.
- `art/01-style-bible.md` — **reference.** The rulebook for the drawn art; the first page for a commissioned artist. `art/README.md` indexes the folder; its other pages are the record of each delivery and the agent's open items (`11`).

## Specs

Built (the status block is live, the body is the plan): `03-world-model.md` (its Rooms and Authoring sections are the living reference), `04-npcs.md` (villagers v0.1; flee, follow, stay not built), `07-lighting.md` (the light model's only prose), `08-renderer.md`, `09-openings.md` (every number still matches), `10-interface.md`, `11-character.md`, `12-figure.md` (the rig's rationale), `13-placement.md`, `14-combat.md` (the current state of combat is `21`), `15-ground.md`, `17-village-art-plumbing.md` (its loader field reference becomes `sprite-definitions.md` in wave 3b), `19-characters.md`, `20-archery.md`, `21-combat-buttons.md` (read-this-first block at its top), `23-engine-upgrade.md`.

Partly built: `24-throwables-and-fire-magic.md` (the fireball built; the throw not), `30-the-big-pass-spec.md` (steps 0 to 3 built; step 4, farming, pickable as it stands; 5 to 9 need a scope each), `32-better-animations.md` (items 1 to 3, 10, 11 built; "Where we left off" is the pointer), `29-world/` (the valley's village, river, roads, and your cottage built by `tools/mapgen/valley.py`; `03` the castle, `05` the farms, `06` the forest are the map half of `30`'s steps 4 to 7; `09` is the live art backlog; `10` and `11` fold into `30` in wave 3c).

Not built: `33-the-map.md`, `34-talk.md` (two decisions are Michael's: the guide's who and where; the talk panel's keys), `36-the-horde-demo.md` (held by Michael until final art), `38-the-menus-and-the-site.md` (a scope with nine questions for Michael; #16). Each is a milestone on GitHub.

## Briefs (delivered; records in wave 3b)

`15a-ground-brief-source.md`, `15b-art-requests.md`, `16-village-art-brief.md`, `18-building-art-brief.md`, `25-character-art-brief.md` (its contract folds into `28`).

## Records

`01-parents.md` (what the two parents offered), `22-the-big-pass.md` (superseded by `30`), `23a-review.md` (the code review behind the engine upgrade; three open items become an issue), `31-multiplayer/01-the-breadcrumbs.md`, `02-the-audit.md`, `06-the-order.md` (the build diary), `07-questions-for-michael.md` (two still open, to issues), `37-the-wiki.md` (the wiki's plan; the reference is `cmz-wiki/CLAUDE.md`, `README.md`, `WRITING.md`), `35-steam-and-the-free-demo.md` (the business plan, kept vague by ruling), `art/02` to `12` (the deliveries). `history/` holds what the sweep archives: `history/todo-2026-10-08-to-15.md` (the old `TODO.md` whole), `history/github-2026-10-15.md` (the old `github.md` whole: why the process exists, its setup, what it decided), and `history/02-build-log.md` (the build, merge, fix, and measurement entries of `02`, moved whole with their dated headings, and the answered open questions).
