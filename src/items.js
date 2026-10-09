// Items, minimal and ahead of the inventory port (docs/07-lighting.md). Every
// holdable item has a hands designation (Michael, 2026-10-09): `main`, `off`,
// or `both`. A two-handed item needs both slots; an off-hand item is refused
// while both are full. The torch is item one. Data for everything else is
// written fresh when the inventory arrives.

export const ITEMS = {
  torch: { id: "torch", name: "torch", hands: "off", fire: { radius: 3 } },
};

export function getItem(id) {
  return ITEMS[id] || null;
}

export function createHands() {
  return { main: null, off: null };
}

export function canHold(hands, id) {
  const it = ITEMS[id];
  if (!it) return false;
  if (it.hands === "both") return !hands.main && !hands.off;
  return !hands[it.hands];
}

export function hold(hands, id) {
  if (!canHold(hands, id)) return false;
  const it = ITEMS[id];
  if (it.hands === "both") {
    hands.main = id;
    hands.off = id;
  } else {
    hands[it.hands] = id;
  }
  return true;
}

export function release(hands, id) {
  let did = false;
  if (hands.main === id) {
    hands.main = null;
    did = true;
  }
  if (hands.off === id) {
    hands.off = null;
    did = true;
  }
  return did;
}

export function holding(hands, id) {
  return hands.main === id || hands.off === id;
}

// The fire of a held item, if any: the light you carry.
export function heldFire(hands) {
  for (const slot of ["main", "off"]) {
    const it = hands[slot] && ITEMS[hands[slot]];
    if (it && it.fire) return it.fire;
  }
  return null;
}
