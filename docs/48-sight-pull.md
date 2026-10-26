# 48 — Sight-pull: one of the dead drawn in brings the ones that see it

**Status, 2026-10-25: a spec, ruled by Michael in session (`02`, 2026-10-25, Sight-pull ruled); not built.** Written from `origin/main` at 6c9e740 or later. One build step, one issue. A **default** is Primary's, Michael's to overrule; the rest is his ruling.

## 1. Why, in Michael's words

Project Zomboid draws the dead by sound; this game does not, and stays so: "I think sound never being an aggro thing is probably the right call but who knows in the future" (the Noise someday stays in `docs/05`). What sound does there, sight does here: "I think we need sight-pull to replace Zomboid's sound-pull. And I think this is especially crucial for long range weapons that go further than any other way a zombie could find you, so it's a safe attack on one zombie at a time. If you have social aggro, it stops being safe and adds some of the pressure back that not caring about sound is getting us."

Of the two ways to build it Primary laid out (a pulled one broadcasting once, or the idle dead watching for a chase and following it), Michael chose the first: "Let's do the one time broadcast to nearby then no further chain reaction as you suggested."

## 2. Before

The dead notice three things only (`src/entities/zombie.js`): a player they see (`canSee`: `zombie.sight` 8 tiles, scaled by the light on the player, a clear line), a flame at night (`nearestFlame`), and a blow (`damageZombie`'s `from`: it learns where the blow came from). A pulled one brings no one; pulling from the edge of a group always works.

## 3. The rule

**When one of the dead first turns to hunt a player, it calls once to the dead near it that can see it, and those join the hunt. The ones it calls never call others.**
- **The moment:** a dead one that was not hunting (`aggro` false) begins to, **first-hand**: it sees a player (the sight check in `updateZombie`), or a player's blow lands on it (`damageZombie` with `from`). That turn, and only that one, is **the pull**. A villager it hunts, a flame it walks to, and one spawned already hunting (`createZombie`'s `aggro`) are no pull (*default*: sight-pull is about players drawing the dead).
- **Who hears it:** every other dead one that is not already hunting, not down, and not dead, within **`zombie.pullRadius` 4 tiles** (*default*) of the pulled one, with a clear line of sight to it (`lineOfSight`, the walls and shut doors and shutters that stop a player's sight). **The light counts as it does for a player:** the radius is scaled by the light on the pulled one, by the rule `canSee` uses (`sightDarkFraction` 0.35 in the dark, the whole of it lit), so a pull in the dark draws fewer (about 1.4 tiles unlit), as Michael's "safe" asks of a careful player (*default*).
- **What they do:** each joins the hunt as if it had been struck from where the pulled one learnt of the player: `aggro` true, `lastSeen` the pulled one's `lastSeen` (the player's place when seen, or where the blow came from), `sincePlayer` 0, and from idle or wander it turns to the chase on its next step, as `updateZombie` already does for a dead one with `aggro`. It knows where to go, not who it is hunting: its own sight check then finds the player, or it reaches the spot and searches, as the dead already do.
- **No chain:** a dead one drawn in by a pull is marked (`pulled: true` on it) and turns to the hunt **second-hand**, so its own turn is no pull: it calls no one, now or later in that hunt, even when it then sees the player itself (it is already hunting; only a turn from not hunting is a pull). The mark goes when it gives up (`giveUp`: `aggro` false, `pulled` cleared), and a later first-hand turn is a pull again.
- **Once:** the call is made on the step of the turn and never repeated while that hunt lasts; a pulled one walking past another group calls no one (Michael's choice: "one time broadcast to nearby").
- **The setting:** nothing when Zombie aggro is off (the dead hunt no one, so no turn happens); a world rule to switch sight-pull off is not added (*default*; a lever in `42`, `zombie.pullRadius` 0 switches it off for tuning).

**What it means in play:** a long throw or arrow at one at the edge of a group, out of the others' line or in the dark, is still a safe pull of one; the same shot into the middle of a group brings everyone round it that can see it. Bring a pack on yourself and that was your choice: no danger here rises with time (the clock law).

## 4. Seen

**A tell, so a player can read what a pull did** (*default*): the pulled one shows a short call over its head (a speech bubble, "Hrraagh!", from the dead's lines, `say`), and each dead one it draws in shows a small mark over its head for a second (a "!" in the dead's bubble style), drawn by every client from the dead's records (a `pulledAt` stamp of the sim clock on each, the one it called included). If a sound is added for the call it gets the bubble as its twin (`docs/40`), heard from where the pulled one stands; it is heard by players only, and it draws no one (sound is never aggro).

## 5. Inside the laws, and the guest's side

- **The clock law:** nothing grows with time; a pull is a player's act.
- **Determinism:** the pull reads the dead in the order the world holds them and rolls nothing; it runs in the host's step (`updateZombie`, `damageZombie`), never in a client.
- **The guest's side:** the dead's state (`aggro`, the chase) is the host's, reaching a guest in the dead's delta as it does today; the new `pulled` mark and the `pulledAt` stamp ride in the dead's record (the tell is drawn from `pulledAt`), are kept in the save with the rest of a dead one's record, and `pulled` joins the `dead` part of `game.syncParts`. A guest's blow is resolved on the host, so a guest's pull is the host's, by the same rule. Bump `net.PROTOCOL` if the dead's record changes shape (merged on review, `02`, 2026-10-25).

## 6. Build step

1. **Sight-pull** (#\_\_): the pull in `zombie.js` (the turn first-hand, the call within `zombie.pullRadius` scaled by the light and the line, the joined ones' `aggro` and `lastSeen`, `pulled` and its clearing in `giveUp`), the tell (`pulledAt`, the call's bubble, the mark), the lever in `data/tuning.json` and `42`. `check("pull")`: one struck at the edge of a group out of the others' line brings none; one struck in the middle brings those within the radius that see it and none beyond; a drawn-in one that then sees the player calls no one; a pull in the dark reaches less far than by day; with `pullRadius` 0 nothing joins; the guest sees the joined ones chase and the tell, and `check("sync")` passes in two tabs.
