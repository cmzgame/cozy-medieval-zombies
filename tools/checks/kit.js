// The starting kit as data and a world's choice (#136; Michael, 2026-10-16, on #123): data/kit.json is the default (what every world
// started with, plus the tinderbox); a world may add items to it (rule `extraKit`: one `item_id count` a line) and may start wearing
// the Developer Bag in place of the sack (rule `devBag`); a kit that does not fit is refused with a word; a new character, a guest's
// too, is given the world's kit by the host. From the console, on a tab with `?nosave`:
//   await __game.check("kit")
// It makes second players (and takes them away) and sets the two rules (put back in the finally).

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const rules0 = { extraKit: G.rules.rules.extraKit, devBag: G.rules.rules.devBag };
  const made = [];
  const player = (x = 3, y = 3) => { const p = G.addPlayer(x, y); made.push(p); return p; };
  const countOf = (p, id) => (G.inventory.bagOf(p).items || []).filter((e) => e.id === id).reduce((n, e) => n + (e.count || 1), 0);
  try {
    G.rules.set({ extraKit: "", devBag: false });
    const p0 = player();
    const worn = ["chest", "legs", "feet", "waist", "back"].map((s) => p0.worn[s] && p0.worn[s].id).join(",");
    row("the default kit is what a world always started with, in the sack", worn === "tunic,breeches,boots,belt,small_sack" && countOf(p0, "waterskin") === 1 && countOf(p0, "bread") === 1 && countOf(p0, "apple") === 2 && countOf(p0, "plank") === 1 && countOf(p0, "tinderbox") === 1, `worn ${worn}`);
    row("the torch is in the hand, unlit", !!p0.hands.main && p0.hands.main.id === "torch" && !p0.hands.main.lit, `hand ${p0.hands.main && p0.hands.main.id}`);
    const skin = (G.inventory.bagOf(p0).items || []).find((e) => e.id === "waterskin");
    row("the waterskin starts full", !!skin && skin.fill === 100, `fill ${skin && skin.fill}`);

    G.rules.set({ extraKit: "sword\narrow 20, apple 2" });
    const p1 = player(5, 3);
    row("a world's extra items are added to the kit by first fit", countOf(p1, "sword") === 1 && countOf(p1, "arrow") === 20 && countOf(p1, "apple") === 4 && countOf(p1, "tinderbox") === 1, `sword ${countOf(p1, "sword")}, arrow ${countOf(p1, "arrow")}, apple ${countOf(p1, "apple")}`);
    G.rules.set({ extraKit: "" });

    G.rules.set({ devBag: true });
    const p2 = player(7, 3);
    const bag2 = G.inventory.bagOf(p2);
    row("starting with the dev bag wears it in place of the sack, with the kit in it", p2.worn.back.id === "dev_bag" && bag2.cols === 12 && countOf(p2, "bread") === 1 && countOf(p2, "tinderbox") === 1, `back ${p2.worn.back.id}, ${bag2.cols} by ${bag2.rows}`);
    G.rules.set({ devBag: false });

    const K = G.kit;
    row("an empty list is no problem", K.problem("", false) === "", String(K.problem("", false)));
    row("an unknown item is refused by name", /nonesuch/.test(K.problem("nonesuch 2", false)), K.problem("nonesuch 2", false));
    row("a bad count is refused", /whole number/.test(K.problem("sword two", false)) && /whole number/.test(K.problem("sword 0", false)), K.problem("sword two", false));
    const big = "log 10";
    row("a kit that does not fit the sack is refused, with a word, and fits the dev bag", /full/.test(K.problem(big, false)) && K.problem(big, true) === "", `${K.problem(big, false)} / dev bag: ${K.problem(big, true) || "fits"}`);
    G.rules.set({ extraKit: big, devBag: false });
    const p3 = player(9, 3);
    row("and a world that was made with one anyway leaves out what does not fit (the screen refuses it first)", countOf(p3, "log") < 10 && countOf(p3, "bread") === 1, `${countOf(p3, "log")} logs`);
  } finally {
    G.rules.set(rules0);
    for (const p of made) G.game.removePlayer(p.id);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
