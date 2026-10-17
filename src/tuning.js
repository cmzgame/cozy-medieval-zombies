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
  hp: 100,
  repath: 0.3, // seconds between repaths while chasing
  radius: 0.3, // the body, in tiles
  searchTime: 10, // seconds spent looking around the last sighting
  breachDamage: 5, // per hit into an opening's stack (docs/09)
  groanText: "Braaaains", // what the dead say now and then (docs/19)
  groanMin: 20, // seconds between groans
  groanMax: 60,
  stagger: 0.3, // seconds a hit stops it (docs/14)
  downTime: 2, // seconds on the floor after a knockdown
  getUpTime: 0.6, // seconds to rise, the fall played backwards
  knockTime: 0.15, // a push is spread over this long, not a teleport
  breachReach: 1.1, // tiles from the edge midpoint to hit it
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
  sprintMult: 1.75,
  // The parent drained 40 per second: a sprint lasted 2.5 s, about a third of a
  // screen. Michael wanted longer (2026-10-09): 16 per second is just over 6 s,
  // about a screen and a half at 5.25 tiles per second.
  sprintDrain: 16,
  staminaRegen: 22,
  sprintRecoverAt: 20, // stamina needed to sprint again once winded
  aimY: 22, // aim originates from the chest, this many pixels above the feet
  // Slow needs (docs/10): the cozy parent's drains, to be retuned with farming.
  // Hunger empties in eighteen real minutes, thirst in twelve; at zero they take health. The same as data/tuning.json,
  // which wins (the wiki census, 2026-10-15: the code's defaults had gone stale behind the data).
  hungerMax: 100,
  thirstMax: 100,
  hungerDrainSeconds: 1080, // seconds from full to empty
  thirstDrainSeconds: 720,
  // Tiredness and sleep (docs/30 step 2), regeneration, and the needs' hold on stamina.
  tiredMax: 100,
  tiredDrainSeconds: 900,
  sleepRestoreSeconds: 240,
  sleepTimeScale: 60,
  wakeHour: 6,
  healthRegenPerMinute: 1,
  sleepRegenPerMinute: 4,
  needsStaminaRegenMult: 0.5,
  tiredStaminaRegenMult: 0.75,
  starveDamage: 1.5, // hp per second at zero
  dehydrateDamage: 2,
  drinkSip: 50, // per drink from a waterskin
  autoDrinkStage: 2, // the thirst moodle's stage a carried waterskin sips by itself at ("Thirsty"; docs/02, 2026-10-16)
  presentTime: 0.6, // seconds the held-out pose shows for a bite or a sip (docs/32, item 1)
};

export const villager = {
  speed: 1.4, // tiles per second: an amble, between the dead (1.0) and the player (3.0)
  radius: 0.3,
  wanderRadius: 4, // tiles from home a wander may reach
  talkTime: 2, // seconds a poked villager stands and faces you, at least
  pokeCooldownMs: 600, // a second poke inside this does nothing
  hurtTime: 0.35, // seconds a bitten villager flinches
};

export const world = {
  activeTiles: 40, // the dead beyond this many tiles from the player do not think
  evictChunks: 8, // wild chunks farther than this from the player are dropped, their dead asleep on record (docs/23a, B2)
  containerCloseDist: 2.0, // tiles: an open container closes when you walk away
  beltLight: 0.5, // a lit torch on the belt gives this much of its light (docs/02)
  twoTorches: 1.35, // a torch in each hand: this much of one torch's light, and seen from this much further
};

// How many of the dead a world starts with, by its Starting population rule (docs/38 and `02`, #130): the factor that
// scales the dead the map places (its places' authored dead, and the wild's dead per chunk). Standard is the map's own.
export const population = { none: 0, low: 0.4, standard: 1, high: 2.5 };

const sections = { zombie, player, villager, world, population };

// Lay a file's numbers over the defaults; a missing file or section changes nothing.
export function load(json) {
  for (const [name, values] of Object.entries(json || {})) {
    if (sections[name] && values && typeof values === "object") Object.assign(sections[name], values);
  }
}
