// The row of debuffs (#308; src/debuffs.js, ui/debuff-row.js). From the console, on a tab with `?nosave`:
//   await __game.check("debuffs")
// A bite that bleeds shows the drop icon with "12s" and no stack number; another bite makes two stacks and starts the time again; a bandage clears it and the row is empty; a wound of
// 600 seconds reads "10m"; there is no bleed moodle (and no "Not bleeding" line) any more; the row sits at the top right with the bag opening under it; its hover card names it, what
// it does, and what ends it; the host's step runs the timer. On a guest, run after the host has opened a wound on the guest's player (`bleed.apply` on that player in the host's tab):
// the replica's record carries the stacks and the time, and the row shows the same. The wound, the bag, and the health are put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const deb = await import("/src/debuffs.js");
  const rowUi = await import("/src/ui/debuff-row.js");
  const card = await import("/src/ui/hover-card.js");
  const bleed = await import("/src/bleed.js");
  const moodles = await import("/src/moodles.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const me = G.player;
  const role = G.net.status().role;
  const bleed0 = me.bleed ? { ...me.bleed } : null;
  const hp0 = me.hp;
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const counts0 = bag0.map((e) => [e, e.count]);
  const wasPaused = G.loop.isPaused();
  const was = { bag: panel.isBagOpen() };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const show = () => { rowUi.updateDebuffs(me); return rowUi.shownNow(); };
  try {
    G.loop.setPaused(true);
    row("the time reads in minutes from a minute up and in seconds under it", deb.timeLabel(600) === "10m" && deb.timeLabel(61) === "1m" && deb.timeLabel(60) === "1m" && deb.timeLabel(59) === "59s" && deb.timeLabel(34) === "34s" && deb.timeLabel(12) === "12s" && deb.timeLabel(0.2) === "1s" && deb.timeLabel(120) === "2m", "600:10m 61:1m 59:59s 34:34s 12:12s 0.2:1s");
    row("there is no bleed moodle any more, and no Not bleeding line", !moodles.activeMoodles(me).some((m) => m.id === "bleed") && !moodles.activeMoodles(me).some((m) => /bleed/i.test(m.name)), moodles.activeMoodles(me).map((m) => m.id).join(","));
    if (role !== "guest") {
      me.bleed = null;
      row("not bleeding: the row is empty", show().length === 0, `${show().length} debuffs`);
      me.hp = me.maxHp;
      row("a bite that opens a wound makes one stack with 12 seconds", bleed.onBite(me, 8, 0) === true && me.bleed.stacks === 1 && me.bleed.left === bleed.BLEED.duration, JSON.stringify(me.bleed));
      let now = show();
      row("the row shows the bleeding icon with 12s and no stack number", now.length === 1 && now[0].id === "bleed" && now[0].time === "12s" && now[0].stacks === "" && !!document.querySelector("#debuffs .debuff img"), JSON.stringify(now));
      me.bleed.left = 5;
      row("another bite makes two stacks and starts the time again", bleed.onBite(me, 8, 0) === true && me.bleed.stacks === 2 && me.bleed.left === bleed.BLEED.duration, JSON.stringify(me.bleed));
      now = show();
      row("the row shows 12s and the stack number 2", now.length === 1 && now[0].time === "12s" && now[0].stacks === "2", JSON.stringify(now));
      const left0 = me.bleed.left;
      const hpA = me.hp;
      for (let i = 0; i < 120; i++) G.loop.advance(1 / 60);
      row("the host's step runs the timer and the drain: two seconds later the time is shorter and health lower", !!me.bleed && me.bleed.left < left0 - 1.5 && me.hp < hpA, `left ${left0} -> ${me.bleed ? me.bleed.left.toFixed(2) : "gone"}, hp ${hpA.toFixed(1)} -> ${me.hp.toFixed(1)}`);
      me.bleed = { stacks: 3, left: 600 };
      now = show();
      row("a wound of 600 seconds reads 10m, with three stacks", now.length === 1 && now[0].time === "10m" && now[0].stacks === "3", JSON.stringify(now));
      const ic = document.querySelector("#debuffs .debuff").getBoundingClientRect();
      panel.setBagOpen(true);
      panel.renderInventoryPanel(me, bag, null, G.inventory.beltOf(me));
      const bagR = document.querySelector("#inventory .inv-body").getBoundingClientRect();
      row("the row is at the top right, and the bag opens under it", ic.right > innerWidth - 40 && ic.top < 12 && bagR.top >= ic.bottom - 1, `icon ${Math.round(ic.left)},${Math.round(ic.top)} to ${Math.round(ic.right)},${Math.round(ic.bottom)}; bag top ${Math.round(bagR.top)}; window ${innerWidth}`);
      const el = document.querySelector("#debuffs .debuff");
      const ir = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: ir.left + 8, clientY: ir.top + 8, bubbles: true }));
      await wait(150);
      const hc = document.getElementById("hover-card");
      row("its hover card names it, what it does, and what ends it", !hc.hidden && /Bleeding/.test(hc.textContent) && /Debuff/.test(hc.textContent) && /Losing 3\.6 health a second\./.test(hc.textContent) && /A bandage stops it\./.test(hc.textContent) && /×3/.test(hc.textContent), hc.textContent.slice(0, 140));
      el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
      row("the card goes when the pointer leaves", hc.hidden, "hidden");
      me.bleed = { stacks: 2, left: 9 };
      const bandage = G.items.makeEntry("bandage", 1);
      G.inventory.stow(me, bandage);
      const apply = G.interact.itemMenu(me, bandage, bag, null).find((m) => m.label === "Apply");
      apply.onSelect();
      row("a bandage clears the wound and the row is empty", !me.bleed && show().length === 0, `bleed ${JSON.stringify(me.bleed)}, ${show().length} in the row`);
    } else {
      const now = show();
      row("on a guest the replica's record carries the wound and the row shows the same stacks and a time", !!me.bleed && me.bleed.stacks > 0 && now.length === 1 && now[0].id === "bleed" && now[0].stacks === (me.bleed.stacks > 1 ? String(me.bleed.stacks) : "") && /^\d+[sm]$/.test(now[0].time), `${JSON.stringify(me.bleed)} -> ${JSON.stringify(now)}`);
      row("on a guest there is no bleed moodle either", !moodles.activeMoodles(me).some((m) => m.id === "bleed"), moodles.activeMoodles(me).map((m) => m.id).join(","));
    }
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    card.hide();
    if (role !== "guest") {
      me.bleed = bleed0;
      me.hp = hp0;
      bag.items.splice(0, bag.items.length, ...bag0);
      for (const [e, n] of counts0) e.count = n;
      panel.setBagOpen(was.bag);
      G.loop.setPaused(wasPaused);
      rowUi.updateDebuffs(me);
    }
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
