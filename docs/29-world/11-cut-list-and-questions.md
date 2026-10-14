# 29.11 — The cut list, and the questions for Michael

The brief was more than enough, so that cutting is the work. Here is the plan sorted by what it costs and what it buys, then the questions only Michael can answer, then the order to build in.

## Keep: the map is not this map without them

- The river, the stone bridge, the ford, and water that stops the dead (`02`, `10` item 1).
- The village: the square and the well, the inn with its boarded windows and its living people, the chapel and the graveyard with the rising, the smithy, the joiner, the weaver, the baker, one noble house with carpets (the merchant's), six cottages, your cottage (`04`, `07`).
- The castle as a ring with a gatehouse, four towers, the great hall at its feast, the kitchens, the barracks and the armoury, the wizard's study (`03`).
- Hollow Farm with the barn, the orchard, the pond, and the pumpkin field; Long Acre with its rye and the mill (`05`).
- The woodcutters, the witch at the mere, the quarry (the three resource places the big pass needs: logs, the cure, stone) (`06`).
- The old road east and its waystone (the hook).

## Nice: each adds a screen worth having, and each can go without a hole

- The croft across the ford (the best base; cut it and the ford loses its reason, so cut the ford with it).
- The manor with its walled garden, the reeve's house.
- The hunter's lodge (the bow's second home; the bandits are the first).
- The bandit camp (loot and a prisoner; the prisoner waits for "follow").
- The charcoal burners and the iron workings (the smith's loop's fuel and ore; cut them and the smith's materials come from the castle's coal bin and the armoury's scrap until they are built).
- The hermitage ruin, the standing stones, the barrow (one hook each; keep one of the three at least, the barrow is the cheapest and the strongest).
- The castle's chapel, stables, kennels, the pleasure garden, the dungeon and treasury towers (the keep and the armoury carry the castle; these are its texture).
- The brook and the footbridge (the second bridge; cut it and the mere's lane crosses nothing).
- The toll house (a one-room cottage with a view; cheap).
- Fences round every field (one engine ask and one art set; fields without them are fine, hedges round them are wrong).
- Seven new crops and four herbs (five crops exist; each new one is a request of six pictures; the herbs matter to the cure).
- Fourteen villagers (six is the handful `04` ruled; the other eight are places' reasons).

## Cut first: the things the plan put in to be cut

- **The hedge maze.** A scene and nothing else; a 14 by 14 block of edge state; an opaque wall material. First to go.
- **The second smithy.** Two anvils is one too many for one smith's loop; keep the village's (it is where the smith's story is) and give the castle's forge a cold hearth and a grindstone.
- **The tannery.** Leather is `05`-someday; the tannery is a loot stop with a smell.
- **The dragon skull, the statue, the fountain, the dovecote, the maypole, the market cross.** Each is one decoration prop; they are the cheapest things on the whole list and the first to cut if the art budget is the limit, and the first to keep if it is not, because decoration is what reads as a place.
- **Fishing.** Not in any doc; a whole small loop; proposed because the map has six waters.
- **Coin, the treasury.** Nothing spends it in 1.0.
- **The paired gate, locked doors.** Two leaves that open one at a time, and an armoury whose door is simply shut and boarded from inside (the dead steward's key becomes a crowbar? no: the door is a door), lose little.
- **Carpet as an autotile.** Rugs as 2 by 2 flat props do most of the job in a solar.
- **The willow's eyes.** A joke about a tree; the plain willow at the pond is the willow.
- **256 by 256.** (Not taken: 256 was ruled, `02`, 2026-10-12.) 192 keeps every place and shortens every forest belt by a third; the plan's coordinates scale by 0.75 and nothing moves relative to anything.

## Questions for Michael (the plan's defaults in brackets)

1. **Does water stop the dead?** The whole shape of the map (a safe west, a dangerous east, the crossings as gates) rests on it; without it the river is a texture and the moat is a look. [Yes, with the ford and the weir as the slow crossings the dead can also use.] **Answered 2026-10-12: yes, sharpened** (`02`, `30` law 8): a tile wholly water stops every entity, the ford and the weir's crest are a shallow kind slow for all; built in step 0.
2. **256 or 192?** [256; the forest should be a place.] **Answered: 256** (`02`, 2026-10-12); built.
3. **Which home?** The end cottage, the toll house, or the croft (`07`). [The end cottage; the other two are the places you discover you could move to.] **Answered: the end cottage** (`02`, "The big pass answered"); built in step 0.
4. **Names.** The village, the river, the castle, the farms, the mere, the villagers. The plan uses none so none have to be unlearned. [Michael's; the docs can carry placeholders until then.] **Open** (`30`, section 15); the built village uses role names.
5. **Where do the staff and the book of fire come from?** The wizard's study in the castle's north-east tower is the plan's answer, and it decides that magic in 1.0 is one dead wizard's leftovers, not a school. [The study.] If Michael wants magic more common (a second book at the witch's, a wand at the hermitage), say so; the room stays the first. **Taken as the default** in `30` (step 5, the study with the staff and the book), which Michael approved as written.
6. **One smithy or two?** [One, the village's; the castle's forge cold.] **Answered: one** (the cut list taken, `02`, 2026-10-12).
7. **The maze?** [Cut, unless he loves it.] **Answered: cut** (`02`, 2026-10-12).
8. **How many villagers?** `04` says six to ten; the plan places fourteen with six core. [Fourteen placed, six given lines and jobs first; the atlas allows it.] **Open**; the village of step 1 places seven, with lines.
9. **Fences everywhere, or only where a gate matters?** [Round every field and garden; the fence set is one request and one small engine change, and fields read as fields.] **Not ruled as such**; the engine change is built (fences as features, step 0) and the village's gardens and yards are fenced.
10. **Which new crops first?** [Turnip, wheat, beans, hops; flax, onion, carrot after; the four herbs with the cure.] **Open** (`30`, section 15, the same default).
11. **Fishing: yes, no, later?** [Later, but the waters are placed as if yes.] **Answered: later** (`02`, 2026-10-12; `30`, step 9).
12. **The gloom's door: east, by the old road past the woodcutters?** It decides which edge of the map the zone system opens first. [East.] **Not ruled**; nothing built depends on it yet.
13. **Animals: none in 1.0, and the pens, folds, coops, and stables read as emptied by the dead?** [None; the emptiness is the story. `05` keeps animals possible.] **Answered otherwise: two animals, chickens and deer**, as the pass's last step (`02`, "The big pass answered"; `30`, step 8).
14. **The castle walls at 112 and the towers at 128, or one height?** [Two heights; it is a definition each.] **Taken as the default** in `30` (step 5, "the taller walls (data)").
15. **Does the plan's "every building has rooms" rule hold for sheds, huts, and the forest cabins?** [No: a shed is a room; the rule is for houses.] **Not ruled**; the village of step 1 followed the default.
16. **The dev chest and the combat-testing mode**: a separate testing map, or a setting that adds them to the real one? [A setting that adds them, so the real map file stays clean.] **Answered: a setting** (`02`); built in step 0 (`devChest`, `combatTesting`).
17. **Authoring: a generator script from this plan, the in-game editor, or both?** [The script first, the editor for Michael's own touches.] **Answered: the script first** (`02`, 2026-10-12); built (`tools/mapgen/`).

## The order to build in (once the questions are answered)

**Superseded as the order by `30`, section 11**, which keeps this sequence with the big pass's pieces placed in it; steps 1 and 2 here are its steps 0 and 1, built 2026-10-12.

Each step is a playable map on the current spawn's pattern: the player starts, walks, and the rest of the world is forest until the next step lands.

1. **The engine's tier 1** (`10`, items 1 to 5) and **the art's tier 1** (`09`, requests 1.1 to 1.5) in parallel; the generator script written against the current format and grown with the asks.
2. **The village**, with your cottage, the lane, the green, the square, the inn, the chapel and graveyard, the trades, and the merchant's house, on the west bank with the river beside it and the bridge to nothing. Play it. This is the Stardew half of the arc and the half that needs the least new engine.
3. **Hollow Farm and Long Acre with the mill**, the roads to them, the first new crops. Play the farming loop between the three.
4. **The castle** and the bridge road: the walls, the gatehouse, the keep, the armoury, the study; the garrison. Play the Zomboid half: the first trip across the water.
5. **The forest places**, one a session: the woodcutters, the witch, the quarry, then the rest by the cut list's order.
6. **The dressing pass**: authored decals, signs, lights, the dead's wardrobes, the barricades, the stories in each room.
7. **The edges**: the old road, the waystone, the drove off the map, the standing stones. Then the big pass (`22`) and the NPC pass (`04`) have their world.
