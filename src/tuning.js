// The entities' numbers as data (docs/23a, D9): the dead's, the player's, the
// villagers', and the world's distances, loaded from data/tuning.json at boot
// over these defaults. Every value here is the one the code carried as a
// constant until 2026-10-12, most of them the cozy parent's, never re-decided
// (docs/02, question 19): the ruling, when it comes, is an edit to the file.
// Combat's numbers stay where they are (the weapons on their items,
// data/combat.json).

export const zombie = {
  speed: 1.0, // tiles per second: Romero shamblers
  sight: 8, // tiles, in full light; scaled by the light on the player
  sightDarkFraction: 0.35, // of full range when the player is unlit
  flameRange: 12, // tiles: at full night the dead see a flame this far (docs/07)
  flamePatience: 8, // seconds after seeing the player before a flame can take over (Michael, 2026-10-10)
  stuckTime: 1.5, // seconds of no progress along a path before it is dropped
  contact: 0.7, // tiles: close enough to bite
  damage: 8, // a bite
  cooldown: 1.2, // seconds between bites
  biteTokens: 2, // bite tokens (docs/41 step 5): how many of the dead in reach of one target may bite at once
  biteTokensPer: 3, // one token more for every this many of the dead in reach beyond the first three: three in reach, two bite; six, three; nine, four
  hp: 150, // set from hit counts after the melee feel pass (docs/41 step 6; was 100): the sword 5, the mace 4, the hatchet 5, the stick 11, fists 25, the bow 4 arrows; Michael's to retune
  repath: 0.3, // seconds between repaths while chasing
  radius: 0.3, // the body, in tiles
  searchTime: 10, // seconds spent looking around the last sighting
  breachDamage: 5, // per hit into an opening's stack (docs/09)
  fenceReach: 0.9, // tiles from a fence's middle within which a dead one strikes it (a margin over where the bodies stand: 0.7 to 0.8; #174)
  fenceBiteExtra: 0.5, // tiles a bite reaches further across a fence its dead one is striking (#174; the strikers stand up to `fenceReach` from it)
  fenceStrike: 1, // hit points one strike takes from a fence or gate (world.fenceHp 90, a gate half; #174): a strike every attack and cooldown
  groanText: "Braaaains", // what the dead say now and then (docs/19)
  pullRadius: 4, // tiles: one of the dead turning to a player calls the dead within this that see it, scaled by the light on it as sight is (docs/48); 0 switches it off
  pullText: "Hrraagh!", // the caller's line, said only when one answers (docs/48)
  pullBubble: "!", // over each one drawn in (docs/48), as the cowering villager's
  pullBubbleSeconds: 1,
  groanMin: 20, // seconds between groans
  groanMax: 60,
  stagger: 0.3, // seconds a hit stops it (docs/14)
  downTime: 0.8, // seconds on the floor after a knockdown: one finisher blow at the sword's pace fits, then it rises (docs/41 step 3; was 2)
  getUpTime: 0.6, // seconds to rise, the fall played backwards
  turnDownTime: 2, // seconds a villager the dead have just turned lies before it rises (open to the finisher meanwhile; was a 2 in villager.js)
  burstSpeed: 1.5, // the closing burst (#385, a trial): the dead walk this many times as fast within burstRange of a target they see; 1 is off (docs/42)
  burstRange: 3, // tiles
  knockTime: 0.15, // a push is spread over this long, not a teleport
  breachReach: 1.1, // tiles from the edge midpoint to hit it
  pressGiveUp: 20, // seconds a dead one pressing a fence goes on pressing without seeing the player before it gives up and searches (a held siege never gives up; #147, #167)
  noWayTime: 8, // seconds the dead leave a goal alone (and search) after finding no way in, no door they can reach (#134)
  siegeEndHour: 6, // the dead that know a player is inside wait until the clock next reads this hour, the dawn, and lose interest (#147)
  siegeSwitch: 25, // seconds before one of them tries another opening it knows
  siegeSleepRadius: 14, // tiles: a player cannot sleep while any dead one holding a siege on them is this near (#147)
  searchRadius: 3, // tiles
  wanderIdleMin: 1.5, // seconds standing before wandering again
  wanderIdleMax: 4.0,
  separation: 0.55, // tiles: bodies push apart inside this
  sightCheck: 0.25, // seconds between sight tests
  arrived: 0.6, // tiles: close enough to the last sighting to count as there
  repathFailBackoff: 1.0, // seconds before trying a path again after none was found
};

export const player = {
  speed: 3.0, // tiles per second
  radius: 0.3,
  hp: 100,
  stamina: 100,
  mana: 100, // the mana bar (docs/47 section 5, #480; Michael's): spells cost it (a book's `spell.mana`); raised later by gear and Faith 4
  manaRegen: 0.333, // a second: one point every three seconds of the sim clock, full in five minutes from empty (Michael's)
  sprintMult: 1.75,
  // The parent drained 40 per second: a sprint lasted 2.5 s, about a third of a
  // screen. Michael wanted longer (2026-10-09): 16 per second is just over 6 s,
  // about a screen and a half at 5.25 tiles per second.
  sprintDrain: 16,
  staminaRegen: 10, // a second (22 until docs/41 step 4): with the swing costs raised, the one pacer of melee; no endurance tiers, no strain (Michael, 2026-10-23)
  sprintRecoverAt: 20, // stamina needed to sprint again once winded
  aimY: 22, // aim originates from the chest, this many pixels above the feet
  // Slow needs (docs/10): the cozy parent's drains, to be retuned with farming.
  // Hunger empties in eighteen real minutes, thirst in twelve; at zero they take health. The same as data/tuning.json,
  // which wins (the wiki census, 2026-10-15: the code's defaults had gone stale behind the data).
  hungerMax: 100,
  thirstMax: 100,
  hungerDrainSeconds: 1080, // seconds from full to empty
  fullAt: 90, // hunger at or above this is well fed: health comes back `wellFedRegenMult` times as fast (Michael, 2026-10-18); hunger drains all the time, so "well fed" is a margin, not the exact top
  thirstDrainSeconds: 720,
  // Tiredness and sleep (docs/30 step 2), regeneration, and the needs' hold on stamina.
  tiredMax: 100,
  tiredDrainSeconds: 900,
  sleepRestoreSeconds: 240,
  sleepTimeScale: 20, // the world's speed while everyone sleeps: eight game hours in about twelve real seconds (Michael, 2026-10-26; was 60, four seconds)
  wakeHour: 6,
  healthRegenPerMinute: 1,
  sleepRegenPerMinute: 4,
  wellFedRegenMult: 2, // health comes back this many times as fast when well fed (hunger at fullAt or more), awake or asleep (Michael, 2026-10-18; the number Primary's default)
  needsStaminaRegenMult: 0.5,
  tiredStaminaRegenMult: 0.75,
  starveDamage: 1.5, // hp per second at zero
  dehydrateDamage: 2,
  drinkSip: 50, // per drink from a waterskin
  autoDrinkStage: 2, // the thirst moodle's stage a carried waterskin sips by itself at ("Thirsty"; docs/02, 2026-10-16)
  presentTime: 0.6, // seconds the held-out pose shows for a bite or a sip (docs/32, item 1)
  waveSeconds: 2, // seconds the wave plays, on G or /wave (docs/43 section 7); walking ends it sooner
};

export const villager = {
  speed: 1.4, // tiles per second: an amble, between the dead (1.0) and the player (3.0)
  radius: 0.3,
  wanderRadius: 4, // tiles from home a wander may reach
  talkTime: 2, // seconds a poked villager stands and faces you, at least
  pokeCooldownMs: 600, // a second poke inside this does nothing
  hurtTime: 0.35, // seconds a bitten villager flinches
  regenPerMinute: 1, // health a hurt villager gets back a minute: the player's rate (`healthRegenPerMinute`, docs/30 3.4); they have no needs, so always fed and watered (Michael, 2026-10-18, #236)
  regenPause: 10, // seconds after a hit before it starts again, so health does not climb while the dead are still biting
  barkRadius: 6, // tiles: a villager says an ambient bark only with a living player this near (docs/34, #198)
  barkCooldown: 60, // seconds of game time between a villager's ambient barks
  barkDeadRadius: 8, // tiles: the talk condition `deadNear` means one of the dead within this of the villager
  talkReach: 2.6, // tiles: a conversation starts within this of the villager (the click's reach), and ends past it and talkWalkAway
  talkWalkAway: 1, // tiles beyond talkReach a talker may drift before the conversation ends
  talkIdleSeconds: 1, // seconds a villager stands after a conversation before it wanders (fixed, not rolled: talk never touches the generator)
  talkDeadRadius: 5, // tiles: with the dead this close a villager barks instead of talking (docs/34)
  barkMaxLength: 70, // characters: a bark line is at most this long, so a bubble stays a bubble (the validator's)
  // The cowering (docs/43 section 7): an immune villager (the guide, a teacher) with one of the dead in sight within `cowerRadius` tiles cowers for
  // `cowerSeconds`, arms up, a `cowerBubble` over its head as the visual twin, then runs about `fleeTiles` tiles away at `fleeSpeed` times its walk,
  // and paths back to its spot once none of the dead is within `cowerClearRadius`. Primary's defaults.
  cowerRadius: 3,
  cowerSeconds: 1,
  cowerBubble: "!",
  fleeTiles: 4,
  fleeSpeed: 2,
  cowerClearRadius: 6,
};

export const world = {
  activeTiles: 40, // the dead beyond this many tiles from the player do not think
  evictChunks: 8, // wild chunks farther than this from the player are dropped, their dead asleep on record (docs/23a, B2)
  containerCloseDist: 2.0, // tiles: an open container closes when you walk away
  beltLight: 0.6, // a lit torch on the belt gives this much of its light: 1.8 tiles of a torch's 3, a little over the dark radius's 1.5 so it sees a bit further than no torch (Michael, 2026-10-17, #158; half before)
  twoTorches: 1.35, // a torch in each hand: this much of one torch's light, and seen from this much further
  playerCapBrowser: 4, // the players a world hosted in a browser holds at once, the host's own among them (Michael, #93)
  playerCapServer: 8, // and a server world (raised in one line when the lighter frames of docs/31/05 land)
  torchHeldLife: 1440, // game seconds of burning a torch lasts held in a hand (two game days of continuous light; Michael, 2026-10-17, #156)
  torchWallLife: 2880, // and on the belt, in a bracket, or on a post, the slower "wall" rate
  fireOutRadius: 8, // tiles within which a player is told a fire has gone out (main.js; #177)
  craftDoneRadius: 12, // and within which a craft done is told (main.js, host.js; #177)
  torchSpentRadius: 12, // tiles within which a player is told a mounted torch burnt out (host.js, main.js; #167)
  daylightTiles: 30, // tiles of a room one open shutter or open door lights fully by day (light.js `openness`; Michael, #150): one open window for a small room, more for a large one
  boardTool: "build", // the verb a hammer carries: boarding up, pulling a board, and Remove need it (#215; Free building waives it)
  splitTool: "split", // the verb a hatchet carries: a log split into planks, a plank into sticks (#215)
  chartRadius: 24, // tiles round a player that the chart reveals each time their tile changes (docs/33; inside the four-chunk growth ring, so a cast never reads an ungrown chunk)
  fruitCheckSeconds: 30, // clock seconds between looks at the bare fruit trees (a day is 720): a tree bears again on the first boundary after its day (fruit.js, #190)
  chopSeconds: 3, // a tree or a stump chopped with a hatchet (src/chop.js; was a constant in interact.js, #195)
  stumpSprite: "stump", // what a felled tree leaves (a tree is a prop with a `canopy`)
  pickReach: 1.6, // tiles from a fruit tree's trunk a picker may stand (#190)
  fenceHp: 90, // the hit points of a fence: the dead strike it down, one alone slowly, a crowd faster (Michael, 2026-10-17, #147; 2026-10-18, #174); a gate has `fenceGateFactor` of it
  fenceGateFactor: 0.5, // a gate goes first
};

// How many of the dead a world starts with, by its Starting population rule (docs/38 and `02`, #130): the factor that
// scales the dead the map places (its places' authored dead, and the wild's dead per chunk). Standard is the map's own.
export const population = { none: 0, low: 0.4, standard: 1, high: 2.5 };

// What a player sees of the dead in the dark (docs/07, #88; sight.js): with no light a short radius, fading to hidden over
// the soft edge past it, unless the dead one stands in light (the light at its feet between `litNone` and `litFull`).
export const sight = {
  darkRadius: 1.5, // tiles seen whole with no light at all (a carried torch's own radius, if larger, is the viewer's instead)
  edge: 2, // tiles over which the dead fade from seen to hidden past it
  litNone: 0.3, // the light at a dead one's feet at or below which it is not in light
  litFull: 0.45, // and at or above which it is: between the two it fades in (the night's ambient is 0.22; a torch's pool falls off from 1)
  seenAt: 0.5, // how much of a dead one is seen (`seenAlpha`) before it counts as seen at all: told of, a health bar, a bubble (#158)
  drawCutoff: 0.02, // below this a faded dead one is not drawn at all (render/entities.js; #158)
  groanGap: 20, // sim seconds between two lines "Something groans in the dark." in the log (ui/speech.js; #158, #177: 3 gave a line every few seconds with dozens of the dead about)
  groanRadius: 6, // tiles: a dead one in the dark farther than this from the listener is not heard at all (a builder's default, #177)
};

// How movement feels on screen (#161; docs/02, 2026-10-18): the camera's follow, the draw between steps. Feel numbers, Michael's to tune. There is no input
// acceleration to tune: a held key is instant velocity (the arcade feel), by design and measured (`check("feel")`).
export const feel = {
  cameraFollow: 10, // the camera closes this fraction of its distance to the player per second (a time constant of 1/10 s: it trails a walking player by 0.3 tiles, 19 px); higher is snappier, lower floatier
  blend: true, // draw the movers between sim steps (interp.js): even on a 75, 120, or 144 Hz display and under frame jitter, at up to one step (16.7 ms) of added delay; false draws the last step as it stood
  blendJump: 1.5, // tiles: a mover that moved farther than this in one step (a teleport, a respawn) is drawn where it landed, not blended
  netDelaySteps: 4, // on a guest: remote bodies are drawn this many steps behind the newest host frame, interpolated between the frames either side (netsmooth.js, #248); 3 stalls on a late frame, more only adds delay
  netSlew: 0.1, // the fraction of the gap the guest's draw clock closes toward the frames' per frame that arrives
  netJump: 1.5, // tiles: a remote body that moved farther than this between two frames is put where it landed, not walked there
  sleepFadeSeconds: 1, // the screen's fade to black as this client's player sleeps, and back as it wakes (Michael, 2026-10-26; "about a second", Primary's default)
};

// Floating numbers over heads (#294; docs/39 section 12; ui/floaters.js): how they rise and fade, how they look, and which verbs are a gather of which skill. A number rises about
// a tile (`riseTiles`) over `life` seconds and fades over the last of them, drifting a little sideways (`drift` px, a different side for each so a run of hits does not stack
// on one spot); it starts `startLift` px above the feet (the head's height); the font is the game's pixel font with an outline. A gather shows the skill's icon (ui/skill-icons.js)
// and the number; its text is white where the ground is dark and black where it is light (`lightAbove`, the light at the character), so it is never mistaken for the damage or the heal.
// `gathers`: verb name -> [skill, the field of the verb's result that says how many].
export const floaters = {
  life: 1.1, // seconds a number lives
  fadeFrom: 0.5, // the fraction of its life after which it fades
  riseTiles: 1, // tiles it rises in its life
  drift: 12, // px of sideways drift over its life, a side and a size each its own
  startLift: 80, // world px above the feet it starts (names float at 78)
  fontPx: 15, // the number's size, in UI px
  iconScale: 1, // the skill icon's size beside a gather's number, in whole multiples of its 16 px
  staggerLines: 1.1, // a volley over one body (a hit, a heal, a gather in one frame) starts each number this many font heights above the last
  maxActive: 40, // numbers alive at once; the oldest go first
  damageColor: "#e23b3b",
  healColor: "#43d36b",
  gatherLight: "#ffffff", // a gather's text where the ground is dark
  gatherDark: "#000000", // and where it is light
  lightAbove: 0.5, // the light at the character above which a gather's text is black
  gathers: { chop: ["woodcutting", "logs"], mine: ["mining", "mined"], fish: ["fishing", "caught"], pick: ["farming", "picked"], harvest: ["farming", "harvested"], honey: ["beastlore", "taken"] },
};

// Object Highlight (#301; src/highlight.js, render/highlight.js): the outline round the game object under the cursor. `color` is the flat colour of the one-pixel outline (a soft
// soft near-white, not the swing outline's green nor the Inspect tile mark's gold), `refreshMs` how often the hit test is asked again while the mouse and the camera stand still.
export const objectHighlight = {
  color: "#f4f0e6",
  alpha: 1,
  refreshMs: 100,
};

// The hover card (#262; src/ui/hover-card.js): how long the pointer rests before it shows, and how far it sits from the pointer, in UI px.
export const hoverCard = {
  delayMs: 60,
  gap: 14,
};

// Work at the village's props (docs/43 section 6, #410; src/repair.js, src/hives.js). A made weapon or tool carries one repair count; each repair, at
// either place, uses up the next rung of both ladders: the grindstone sharpens an edged one free up to `grindstone.ceilings[n]` of its condition,
// the anvil repairs anything made up to `anvil.ceilings[n]` for one unit of its material (the item's `repair.with`) with the `uses` tool carried;
// past the last rung it is past repair (Michael, 2026-10-25: "each does inevitably decay down the ladder to death"). The sawpit saws `saw.item`
// into what it splits into, with no hatchet; a hive gives `honey.count` of `honey.item`, and again `honey.days` of the clock later. Seconds are the bar's.
export const work = {
  grindstone: { ceilings: [0.6, 0.4, 0.2], seconds: 4 },
  anvil: { ceilings: [1, 0.8, 0.6], seconds: 6, uses: "smith" },
  saw: { item: "log", seconds: 5 },
  honey: { item: "honey", count: [1, 1], days: 3, seconds: 3 },
  // Burn corpse (docs/43 section 7): on a body of the dead, with a `flame` carried (the item), nothing spent (Michael, 2026-10-26: "no cost but a
  // tinderbox"; a lit torch Used on the body burns it too); it burns `hours` game hours, giving light, then it and everything in it are gone.
  // `seconds` is the bar's. Primary's defaults but the hour (Michael's "about a game hour").
  burnCorpse: { flame: "tinderbox", hours: 1, seconds: 2 },
};

// Water (docs/44; src/water.js, src/sick.js): no fixed source is clean (`clean` lists the sprites of any that are; none), a skin is boiled clean at a lit
// cooking fire within `boilReach` tiles in `boilSeconds`; a tainted drink rolls `sickChance` of Sick and `infectionChance` of the infection; Sick lasts
// `sickDays` of a game day a stack, up to `sickMaxStacks`, drains tiredness `sickTiredMult` times as fast and lets food heal `sickHealMult` of its number.
export const water = {
  clean: [],
  boilSeconds: 30,
  bucketBoilSeconds: 60, // a bucket's bar (Michael, 2026-10-26, The playtest's rulings; the 60 Primary's default)
  boilReach: 2.6, // the click's reach (interact.CLICK_REACH), a station's (stations.REACH)
  sickChance: 0.2,
  sickDays: 0.5,
  sickMaxStacks: 3,
  sickTiredMult: 1.5,
  sickHealMult: 0.75,
  infectionChance: 0.01,
};

// Natural resources (docs/46; src/resources.js, map.js's resource areas): a taken node's replacement falls due `days` of the clock later (a
// game day or two, rolled), its debt looked at once a `checkSeconds` of the clock, on the boundary of its multiples, as the fruit trees are;
// a spot is drawn at random in the area `tries` times a look, then waits for the next; a fill from a spot that stays within `yardCap` tiles
// is a fenced yard or a pen, and nothing grows there; a rock or an ore rock rises out of the ground over `riseSeconds` of the sim clock.
// The counts are the map's (its `resources` block, written by tools/mapgen/valley.py). Primary's defaults, levers in docs/42.
export const resources = {
  days: [1, 2],
  checkSeconds: 30,
  tries: 8,
  yardCap: 300,
  riseSeconds: 1,
};

// Trees: saplings and sticks (docs/46 section 4, step 3; src/trees.js). Felling a tree drops a `sapling.item` at `sapling.chance` (Woodcutting
// `level`, recorded and not enforced until the skills); planted on open grass it shows each of `stages` for an equal share of `days` game days
// of growth, which waits while anyone stands on it, then is the tree `grows` (the round oak). Gather sticks under a standing tree gives
// `sticks.count` of `sticks.item` after a bar of `sticks.seconds`, and that tree has none again until the next game day. The saplings are
// looked at once a `checkSeconds` of the clock, on its boundary, as the fruit trees are. Primary's defaults, levers in docs/42.
export const trees = {
  sapling: { item: "sapling", chance: 0.33, days: 5, stages: ["sapling_0", "sapling_1"], grows: "tree_oak_m", skill: "woodcutting", level: 4 },
  sticks: { item: "stick", count: [1, 2], seconds: 2 },
  checkSeconds: 30,
};

// Potions, poisons, and mana (docs/47; src/mana.js, src/potions.js). Step 1 (#480): the altar's Pray is a bar of `praySeconds` that refills mana
// and stamina. Step 2 (#481): a healing potion gives `heal` health at once, a stamina potion fills the bar and makes it come back `staminaMult`
// times as fast for `staminaSeconds` (the buff `player.buffs.stamina`), a mana potion gives `mana` mana (`player.mana`, up to `maxMana`); after
// any potion the next takes effect only `between` seconds of the sim clock later (`player.potionAt`). Primary's defaults but the mana's 50
// (Michael's), levers in docs/42.
export const potions = {
  praySeconds: 3,
  heal: 40,
  mana: 50,
  staminaMult: 2,
  staminaSeconds: 30,
  between: 10,
};

const sections = { zombie, player, villager, world, population, sight, feel, floaters, objectHighlight, hoverCard, work, water, resources, trees, potions };

// Lay a file's numbers over the defaults; a missing file or section changes nothing.
export function load(json) {
  for (const [name, values] of Object.entries(json || {})) {
    if (sections[name] && values && typeof values === "object") Object.assign(sections[name], values);
  }
}
