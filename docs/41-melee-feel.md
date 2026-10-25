# 41 — Melee feel: the bite's wind-up, the flinch, the shove, knockdown, stamina, and bite tokens

**Status, 2026-10-24: built and accepted as the baseline** (Michael, after playing the whole pass with #385's changes, #394, #396, and #397: "in terms of basic mechanics, we are there"; `02`, 2026-10-24, The melee baseline). All six steps, each measured on the one before (#370 to #374, #376; the measurements are in each pull request and section 8's rows are #376's). Fine-tuning goes on with the skills, through the numbers in `42`. Before that: **2026-10-23, a spec; the combat pass of #89, ruled by Michael in session with the Secondary (combat) the same day (`02`, 2026-10-23, The melee feel pass).** Written from `origin/main` at fab664c. Six build steps, one issue each, listed under #89; built in order, each measured by the instrument of step 0 before the next. The research behind it (Zomboid's melee, and how Hades, V Rising, Diablo IV, Darkwood, Dead Island, Dying Light, and Doom handle close combat with free aim) is summarised in section 2 and is not a rule; the rulings are `02`. **Nothing here is finished until hit sounds are in** (section 9).

## 1. Why

Michael, 2026-10-23, after a session: melee feels "very wishy washy", "a lot of random swinging and hoping I am close enough to hit", the dead "walk into and attack you as you are attacking them". He proposed four fixes to start the conversation (a stagger on every hit, a Zomboid shove on Space, knockdown restricted to some weapons, and the turn-rate question) and asked for research first. Reading the code found the three things the research then confirmed matter most, none of them on the list:

- **The bite has no wind-up.** The dead's attack is four frames at 12 fps with the bite on frame 1: the damage lands about 83 ms after the attack begins (`data/poses.json`, `zombie`; `src/entities/zombie.js`, the `attack` state). Nothing can be read before it, and nothing can be cancelled.
- **A hit that does not stagger shows almost nothing.** A sword staggers half the time; the other half the dead one takes a number, a 0.27 tile slide over 150 ms, 45 ms of hit stop and a 3 px camera kick, and no change of pose. The `hurt` pose plays only on a stagger (`damageZombie`).
- **Everyone in reach bites at once.** Every zombie in contact bites on its own 1.2 s clock; there is no limit on how many attack together.

And three smaller things: the shove on Space exists (`combat.tryShove`) but hits only the nearest with Multi-hit off and plays the swing's animation; stamina does not pace melee (regeneration 22 a second against a sword's 12 a second); and the Swing targets outline, which is deterministic (green means the swing lands), is off by default, so the player is left "hoping I am close enough".

## 2. What the research found (a summary, not a rule)

**Zomboid** gets its precision from five rules together: melee has no to-hit roll (a miss is always position or timing); every weapon has a minimum range, and inside it the click is a shove, not a swing; the combat stance costs walking speed (90 to 150 percent by the Nimble skill); the shove is the core loop (no damage, pushes or floors by strength and fatigue, up to three targets with a weapon, then stand on the body and stomp); and the danger is the sides, the back, and the crowd (each extra attacker boosts the bite odds; past a threshold the horde drags you down). What it does badly: its outline is a targeting mark that can lie; aim stays live through the swing and the cursor over the body spins you; Build 42's muscle strain made the shove's cost unreadable mid-fight; a downed zombie is a free kill unless friction is added.

**The twin-stick family** agrees on more than expected: the attack reaches the target (Diablo IV's lunge, Hades' step, V Rising's dash); nobody caps the player's turn rate, the swing's direction is settled when the attack starts and the dash is the only re-aim; the enemy must change state on every hit (Doom's twitch, falter, stagger ladder; Darkwood's players refuse weapons that do not interrupt; Ruiner's "twitch slightly or not at all" is the documented failure); enemy attacks telegraph for 0.4 to 0.5 s (20 frames is unreactable, 30 reliably read); crowds are made fair by tokens that let only a few attack at once (Doom, Spider-Man 2, the battle circle); the push is paid for in the pusher's recovery, not a cooldown bar (Dead Island's "proactive block", Dying Light's dropkick); a downed enemy is not a free kill (invulnerable rising frames and one guaranteed follow-up); hit stop of 50 to 100 ms for both parties, and the hit sound within 12 ms, are among the three features whose absence ruins impact (Lin et al., 2022; Sakurai).

Michael's four ideas against that: the stagger instinct is right and the number wrong (a one second stagger on a 0.5 s cooldown is the stun-lock the 2026-10-12 ruling undid); the fix splits into a flinch on every hit and a cancel of a bite in its wind-up. The shove is right and mostly built. Restricting knockdown is fully supported. The turn rate is not capped anywhere in the genre; commitment is a slowdown through the swing, and spin-clicking is a symptom of everyone biting, which tokens remove.

## 3. The rulings this stands on

`02`, 2026-10-23, The melee feel pass: the six steps adopted "across the board"; **no endurance or muscle strain, ever** ("I really, really do not want those. I am hoping we can balance around not having them"); stamina regeneration has no law and is set here; the dead's health is held until the feel changes land, then set from hit counts; the turn rate is not capped; **melee combat testing is not finished until hit sounds are in** ("HEARING a hit land would be an important signal"); bite tokens are per target. Michael's leaning, not ruled: NPCs invincible by default (it changes nothing here; a villager's crowd has its own pool either way). Earlier rulings this narrows are struck where they sit in `02` (the knockdown 0.3 hold, the spin-click hold, and `interrupts` as the only cancel of a bite under way).

## 4. The laws that bind every step

- **Combat numbers are data** (`CLAUDE.md`): every number below is a default in `data/combat.json`, `data/tuning.json`, `data/poses.json`, or a weapon block in `data/items.json`, and a ruling changes the number, not code.
- **Never harder on a clock:** the token pool is keyed to how many of the dead are in reach, never to time or the day.
- **Multiplayer is live:** every step runs in the world's step on the host; the frame already carries each zombie's position, state, animation, and health (`net.js`, the dead's delta), so a flinch, a wind-up, and a waiting zombie reach a guest as animation and state; the player's record carries the cooldowns and stamina a guest's own prediction needs (the implementer confirms each field named below is in it). Each step ends with the two-tab test and `check("sync")`.
- **The hover card law:** a change to a weapon's stamina cost is a change to what the item does; its card is read in the pane after step 4.
- **The rig's numbers and `src/figure/` are changed only where this doc asks:** the dead's attack pose and a new shove pose in `data/poses.json`, and a `shove` entry beside `attack` in the rig's animation table.

## 5. Step 0: the instrument, `check("melee")`

Before anything changes, a check under `tools/checks/melee.js` that measures what the pass is for, so every step is a number before and after:

- Open ground, the loop paused, Zombie aggro on, Multi-hit off, the Developer sword in the main hand, the player's hands, place, aim, and settings restored in a `finally` (`docs/testing.md`).
- Five of the dead brought in a ring of radius 4 tiles round the player, aggro, chasing; the generator seeded so a trial repeats (`src/rng.js`).
- A scripted player, stepping at 1/60: each step it aims at the nearest living zombie (`player.aim`, as the burn check's `face` does) and swings when a swing is possible; a second policy, **shove when two or more are in reach**, is run as a second set of trials once step 2 exists.
- Each trial runs to 30 s of simulation, or until the dead are all dead or the player is. Counted: bites landed on the player (`playerHit`), seconds to the first bite, kills, swings, shoves, the player's health at the end. Five trials, means and the spread printed as rows.
- The baseline on `origin/main` is recorded in the issue of step 1 before step 1 is built. The reference point from history: on 2026-10-12 a sword spammed at five charging dead landed 7.8 bites a fight.

The check is the acceptance of every step below ("the instrument").

## 6. The six steps

Each step is one issue and one pull request, built in this order, `origin/main` merged before each.

### Step 1: the bite's wind-up, the flinch, hit stop, the outline, the commitment

**The wind-up.** The dead's attack in `data/poses.json` (`zombie`) becomes six frames at 10 fps with `activeFrame` 4: the bite lands at 400 ms (was 83), the whole attack takes 600 ms, the 1.2 s cooldown after it is unchanged. Frames 1 to 3 draw back (arms rising, a lean away), frame 4 is the lunge and the bite, 5 and 6 the recovery. The dead's `attack` state already bites on the active frame and nowhere else, so nothing changes in the state; the figure's `attack` entry in the rig's animation table is the player's and stays at four frames.

**The cancel.** In `damageZombie`: a landed hit on a zombie in the `attack` state whose bite has not yet landed (`attackHit` false) cancels the bite, every weapon, every time: the state goes back to `chase` and `attackCooldown` is set to the bite's cooldown, as `staggerZombie` does today. A bite already landed is past cancelling (the recovery frames play out). **The cancel is a lever** (Michael, 2026-10-23, on Primary's reading that a lone zombie never bites a player who keeps clicking: "let the unconditional cancel stand for now", noted as something "we can tune after some real combat testing"): what a cancelled bite costs the dead one (today the bite's whole cooldown, `zombie.cooldown` in `data/tuning.json`; half of it is the softer setting) and whether every landed hit cancels or only one that staggers (by weight) are the two settings, revisited after real combat testing, and the instrument's lone-zombie row (`check("melee")`, one zombie against the stick) is what they are read by. The weapon field `interrupts` is retired: removed from the mace and the halberd's thrust in `data/items.json`, from the shove in `data/combat.json`, from `damageZombie`'s options, and from the stagger note. The stagger roll, by weight, with 0.6 s immunity, is unchanged and still decides whether the walk stops.

**The flinch.** Every landed hit that neither kills nor floors plays the `hurt` animation (two frames at 10 fps, 0.2 s, the flash on its first frame), whether or not it staggers. A flinch does not stop the walk: the zombie keeps moving while it plays. For that, the dead's `hurt` becomes a one-shot the `walk` and `idle` do not replace until it is done, as the player's `attack` already is (`player.js`, `oneShot`). A staggered zombie plays it as today and stands for the stagger's length.

**Hit stop.** `blow.hitStop` 0.07 (was 0.045), `blow.hitStopKill` 0.12 (was 0.09), in `data/combat.json`. Hit stop is refused on the wire as before; each client freezes its own picture.

**The outline.** `showSwingTargets` defaults to on (`src/settings.js`): a stored setting is kept, a fresh profile gets the outline. The settings screen's help text moves it from "for testing" to a play setting if its group is a testing one.

**The commitment.** The swing resolves on the click, so its direction is already settled at the press (`02`, 2026-10-11); nothing to lock. Two things are added: while the player's `attack` or `attack_alt` animation plays, walking is multiplied by `blow.swingMove` 0.6 (one place decides the speed, `player-controller.js`), and the figure keeps the facing of the swing until the animation ends (the aim and the next swing stay free; only the drawn facing holds). No cap on turning, by ruling.

*Acceptance:* the instrument's bites a fight fall against the baseline and the first bite comes later; a sword hit landed in frames 1 to 3 of a bite leaves the player unbitten and the zombie back in chase with its cooldown set; a hit in frame 5 does not; every hit shows the flinch (Show hit shapes on, step by step); hit stop reads as 0.07 in `combat.effects()`; a fresh profile shows the outline; walking through a swing measures 0.6 of the walk; a guest's zombie plays the wind-up and the flinch from the frame; `check("sync")` passes.

### Step 2: the shove as the crowd tool

In `data/combat.json`, `shove`: `range` 1.0 and `arc` 100 unchanged; `knockback` 0.8 tiles (was 0.53; since 2026-10-24 the push is 0.65 and a tired one 0.45: `docs/42` holds the lever's numbers); `stagger` 0.8 seconds the dead one stands (was 0.6; the shove's chance to stagger is always 1); `knockdown` 0.1 (was 0.25); `stamina` 15 (was 5); `cooldown` 0.5 (was 0.45); new `targets` 3: the shove reaches the three nearest in its wedge whatever the Multi-hit setting (its own cap in `targetsIn`, not the rule). **The recovery:** while `shoveCooldown` runs no swing starts (`tryAttack` refuses, and the guest's predicted swing refuses the same way, so `shoveCooldown` must be in the player's record on the wire). **The pose:** a `shove` animation beside `attack` in the rig's table (12 fps, three frames, `activeFrame` 1) with its frames in `data/poses.json` (both arms out at the shoulder, a lean into it, no held item swung); a sheet that lacks it falls back to `attack` as the player's one-shots do. The shove's hit stop stays at 0.6 of a blow's; the camera kick stays.

*Acceptance:* the instrument's second policy (shove at two or more in reach) lands fewer bites than the first; a shove with three in the wedge moves all three and staggers all three; a swing clicked within 0.5 s of a shove does nothing and the swing timer shows no bar; the shove's stamina shows on the orange bar; the pose plays; a guest's shove shows its pose from the frame and a guest cannot swing through the recovery; `check("sync")` passes.

### Step 3: knockdown restricted; the downed one safe while rising

`blow.knockdownChance` 0 (was 0.3): a weapon with no `knockdown` of its own never floors. The mace's `knockdown` 0.35 (was 0.6); the halberd's thrust gets `knockdown` 0.5 (new, in its `alt` block); the shove's 0.1 is step 2's. In `data/tuning.json`, `zombie.downTime` 0.8 (was 2) and `getUpTime` 0.6 unchanged. **Rising is safe from the finisher:** `FINISHER.mult` applies only while the zombie lies (`downTimer` running); a blow while it rises (`gettingUp`) does its plain damage and nothing else, as a blow on a downed one does today. The third-hit combo stays off. The floating health bar stays the finisher's tell.

*Acceptance:* a hundred sword hits on standing dead floor none; the mace floors about a third; a floored zombie takes one finisher blow at the sword's pace before it rises and plain damage after; the instrument's kills per fight fall and bites change by less than the fall (the free kill is gone, the fight is not longer by much); `check("sync")` passes.

### Step 4: stamina as the one pacer

`player.staminaRegen` 10 (was 22) in `data/tuning.json`. Swing costs in `data/items.json` (`stamina` on each block): sword 10 (was 6), hatchet 10 (6), mace 14 (8), halberd sweep 16 (12) and thrust 20 (15), spear 10 (6), stick 6 (4), plank 7 (5), torch 5 (3), pickaxe, hoe, scythe, shovel, knife, hammer, fishing rod 8 (6); fists 4 (3) in `data/combat.json`. The tired blow stays at half damage, read as a swing the bar cannot pay for (stamina below its cost: with regeneration between swings the bar never reached zero, so a test at zero never fired; `02` 2026-10-11, narrowed 2026-10-24) (`blow.tiredDamage` 0.5); sprint's drain stays at 16 a second; no moodle ladder, no strain, by ruling. What this gives: about ten seconds of full-speed swinging from a full bar, then half damage until a rest; and the bar you fight with is the bar you run with.

*Acceptance:* a sword spammed from full stamina reaches zero in about 10 s and its blows halve; the hover card of every weapon whose cost changed shows the new cost, read in the pane (the law); the instrument's bites and kills recorded; a guest's stamina on the wire follows the host's; `check("sync")` passes.

### Step 5: bite tokens

In `data/tuning.json`, `zombie.biteTokens` 2 and `zombie.biteTokensPer` 3. In the `chase` state of `src/entities/zombie.js`, where a zombie in reach with its cooldown ready begins its attack, it begins only if it may bite:

- **In reach of a target** means within `biteReach` with the target in sight, as the bite already requires.
- **A holder** is a zombie in reach of that target that is in the `attack` state or whose `attackCooldown` is still running, and is not down. So a holder keeps its token through its own cooldown and through a stagger (which sets the cooldown), and loses it when floored, killed, pushed or walked out of reach, or when the target leaves. No new field: the count is read from state the frame already carries.
- **The pool** for a target is `biteTokens` plus `biteTokensPer` for every three more of the dead in reach beyond the first three: three in reach, two bite; six, three; nine, four.
- **Who gets a free token:** a zombie may begin only if the holders are fewer than the pool and no other zombie in reach of the same target that could also begin (cooldown ready, not down) is nearer to it. So a freed token goes to the nearest waiter, who then needs its whole wind-up.
- **Waiters** stand in contact and do what the cooldown branch does today: the idle animation and separation, pressing in. They block movement and take hits as now. Their groans are unchanged.
- **Per target:** a villager's crowd has its own pool, as does each player's. A zombie striking a fence or a door is not biting and needs no token. The siege is unchanged.

*Acceptance:* five in reach, two bite at once and three wait, read from their states step by step; shove a biter out of reach and the nearest waiter begins a wind-up on the next steps; floor a biter and the same; the instrument's bites a fight at a pool of 2, then 1, then 3, recorded in the issue for Michael's reading; a guest sees two winding up and three standing; `check("sync")` passes.

### Step 6: the dead's health, from hit counts

After steps 1 to 5 are merged and the instrument rerun, `zombie.hp` is set from the hits Michael wants a weapon to need. The first trial is 150 (was 100): sword 5 hits (was 3), mace 4 (3), hatchet 5 (4), stick 11 (8), spear stab 5 (4), fists 25 (17), the bow 4 arrows (3). "Two times" was Michael's first thought and is held: with the free knockdown gone kills are slower already, and a longer fight with no commitment is more spin-clicking. The wiki's statistics that read the dead's health (hits to kill on the weapon pages) follow the number.

*Acceptance:* the hit counts above, by script; the instrument's time to kill and bites a fight recorded; the weapon pages of the wiki checked for hits-to-kill lines.

## 7. What is not in this pass

- **Endurance tiers and muscle strain:** never (ruling).
- **A turn-rate cap or a turning cost:** not built; the slowdown through the swing is the commitment (ruling). The 29b question of `02` is closed by this.
- **Zomboid's minimum range** (a click inside it is a shove): a trial for after the pass, if the shove on Space is not enough.
- **The parent's lunge** (the attack carries a step toward the target): a trial for after the pass, if reach still reads wrong with the outline on.
- **A push per hit:** the knockback per weapon stays as it is.
- **Infection's effects, potions, the thrown knife and axe:** #123 and #51, as #89 says.

## 8. Measuring the whole

When the six steps are in, the instrument's two policies against the baseline tell the story in numbers: bites a fight, seconds to the first bite, kills, the player's health at the end. The target in words (Michael): a careful player with the shove takes a bite or two from a crowd of five; a careless one dies. Then Michael plays, and what breaks the feel goes on #89 as the pass's second list.

## 9. Sounds gate the finish

**Melee combat testing is not finished until hit sounds are in** (Michael, 2026-10-23: "HEARING a hit land would be an important signal"). The pass is built and measured without them, and the acceptance above is provisional until `docs/40`'s `hit` sound plays on a landed blow and `swing_light` and `swing_heavy` on the swing, within the 12 ms the research gives for a sound to read as the hit's own. The flinch of step 1 is that sound's visual twin, by the sound ruling of 2026-10-17. #310 is the sounds spec's issue; the pass's acceptance in #89 is reopened for a session with sound on.
