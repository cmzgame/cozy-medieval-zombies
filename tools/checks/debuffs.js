// The row of debuffs (#308; src/debuffs.js, ui/debuff-row.js). From the console, on a tab with `?nosave`:
//   await __game.check("debuffs")
// A bite that bleeds shows the drop icon with "12s" and no stack number; another bite makes two stacks and starts the time again; a bandage clears it and the row is empty; a wound of
// 600 seconds reads "10m"; there is no bleed moodle (and no "Not bleeding" line) any more; the row sits at the top right with the bag opening under it; its hover card names it, what
// it does, and what ends it; the host's step runs the timer. Sick (docs/44): a tainted drink under the chance shows its own icon with half a game day, each further tainted drink a
// stack and its time up to three, its card says what it does and how long is left, it sits beside bleeding, and the host's step runs it out; the infection's third stage is Queasy.
// On a guest, run after the host has opened a wound on the guest's player and made it Sick (`bleed.apply` and `sick.apply` on that player in the host's tab): the replica's record
// carries the stacks and the time, and the row shows the same. The wound, Sick, the infection, the bag, and the health are put back.

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
  const sick0 = me.sick ? { ...me.sick } : null;
  const infection0 = me.infection;
  const hp0 = me.hp;
  const bag = G.inventory.bagOf(me);
  const bag0 = bag.items.slice();
  const counts0 = bag0.map((e) => [e, e.count]);
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen(); // the title or pause screen over the panels would take the pointer: hide it for the check, put it back after
  if (screen0) G.screens.hide();
  const was = { bag: panel.isBagOpen() };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const show = () => { rowUi.updateDebuffs(me); return rowUi.shownNow(); };
  const hc0 = () => document.getElementById("hover-card");
  try {
    G.loop.setPaused(true);
    row("the time reads in minutes from a minute up and in seconds under it", deb.timeLabel(600) === "10m" && deb.timeLabel(599) === "10m" && deb.timeLabel(601) === "11m" && deb.timeLabel(90) === "2m" && deb.timeLabel(61) === "2m" && deb.timeLabel(60) === "1m" && deb.timeLabel(59.5) === "1m" && deb.timeLabel(59) === "59s" && deb.timeLabel(34) === "34s" && deb.timeLabel(12) === "12s" && deb.timeLabel(0.2) === "1s" && deb.timeLabel(120) === "2m", "600:10m 599:10m 90:2m 61:2m 60:1m 59:59s 34:34s 12:12s 0.2:1s");
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
      const us = (await import("/src/view.js")).view.uiScale; // the row is 6 UI px from the top and 12 from the right at any interface size
      const ic = document.querySelector("#debuffs .debuff").getBoundingClientRect();
      panel.setBagOpen(true);
      panel.renderInventoryPanel(me, bag, null, G.inventory.beltOf(me));
      const bagR = document.querySelector("#inventory .inv-body").getBoundingClientRect();
      row("the row is at the top right, and the bag opens under it", ic.right > innerWidth - 20 * us && ic.top <= 6 * us + 1 && bagR.top >= ic.bottom - 1, `icon ${Math.round(ic.left)},${Math.round(ic.top)} to ${Math.round(ic.right)},${Math.round(ic.bottom)}; bag top ${Math.round(bagR.top)}; window ${innerWidth}`);
      const zOf = (id) => Number(getComputedStyle(document.getElementById(id)).zIndex);
      row("the row is drawn over the map panel and under the menu", zOf("debuffs") > zOf("map-panel") && zOf("debuffs") < 9, `row ${zOf("debuffs")}, map ${zOf("map-panel")}`);
      const el = document.querySelector("#debuffs .debuff");
      const ir = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: ir.left + 8, clientY: ir.top + 8, bubbles: true }));
      await wait(150);
      const hc = document.getElementById("hover-card");
      row("its hover card names it, what it does, and what ends it", !hc.hidden && /Bleeding/.test(hc.textContent) && /Debuff/.test(hc.textContent) && /Losing 3\.6 health a second\./.test(hc.textContent) && /A bandage stops it\./.test(hc.textContent) && /×3/.test(hc.textContent), hc.textContent.slice(0, 140));
      // A card resting under the pointer follows the row: the time it says is the time the row says, not the one it was built with.
      me.bleed = { stacks: 3, left: 27 };
      show();
      const rowTime = document.querySelector("#debuffs .db-time").textContent;
      row("the card under a resting pointer follows the row: the same time, not the old one", rowTime === "27s" && /27s left/.test(hc.textContent) && !/10m left/.test(hc.textContent), `${rowTime} vs ${hc.textContent.slice(0, 40)}`);
      // A debuff leaving takes only its own card: an item's stays.
      me.bleed = null;
      show();
      row("a debuff leaving takes its own card with it", hc.hidden, "hidden");
      card.show("item|test", () => ({ name: "Test item", kind: "Tool", state: "", lines: [], fine: [] }), 100, 100);
      await wait(150);
      me.bleed = { stacks: 1, left: 5 };
      show();
      me.bleed = null;
      show();
      row("and a debuff leaving does not take an item's card", !hc.hidden && /Test item/.test(hc.textContent), hc.hidden ? "hidden" : hc.textContent.slice(0, 30));
      card.hide();
      me.bleed = { stacks: 3, left: 600 };
      show();
      const ir2 = document.querySelector("#debuffs .debuff").getBoundingClientRect();
      document.querySelector("#debuffs .debuff").dispatchEvent(new PointerEvent("pointermove", { clientX: ir2.left + 8, clientY: ir2.top + 8, bubbles: true }));
      await wait(150);
      document.querySelector("#debuffs .debuff").dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
      row("the card goes when the pointer leaves", hc.hidden, "hidden");
      me.bleed = { stacks: 2, left: 9 };
      const bandage = G.items.makeEntry("bandage", 1);
      G.inventory.stow(me, bandage);
      const apply = G.interact.itemMenu(me, bandage, bag, null).find((m) => m.label === "Apply");
      apply.onSelect();
      row("a bandage clears the wound and the row is empty", !me.bleed && show().length === 0, `bleed ${JSON.stringify(me.bleed)}, ${show().length} in the row`);

      // Sick (docs/44 section 4): a tainted drink's debuff, its own icon in the row; its stacks are only time, half a game day each, up to three.
      const S = await import("/src/sick.js");
      const W = G.tuning.water;
      const half = W.sickDays * G.clock.DAY_LENGTH;
      me.sick = null;
      S.taintedDrink(me, 0, 0.99); // a roll under the chance: Sick
      now = show();
      row("a tainted drink that makes you Sick shows its icon in the row, with half a game day and no stack number", now.length === 1 && now[0].id === "sick" && now[0].name === "Sick" && now[0].stacks === "" && now[0].time === deb.timeLabel(half) && !!document.querySelector('#debuffs .debuff[data-id="sick"] img'), JSON.stringify(now));
      S.taintedDrink(me, 0.99, 0.99); // already Sick: a stack and its time more, whatever the roll
      now = show();
      row("another tainted drink while Sick makes two stacks and adds its time", me.sick.stacks === 2 && me.sick.left === 2 * half && now[0].stacks === "2", JSON.stringify(me.sick));
      S.taintedDrink(me, 0.99, 0.99);
      S.taintedDrink(me, 0.99, 0.99);
      row("three stacks at most, and a game day and a half at most", me.sick.stacks === W.sickMaxStacks && me.sick.left === W.sickMaxStacks * half, JSON.stringify(me.sick));
      const sel = document.querySelector('#debuffs .debuff[data-id="sick"]');
      const sr = sel.getBoundingClientRect();
      sel.dispatchEvent(new PointerEvent("pointermove", { clientX: sr.left + 8, clientY: sr.top + 8, bubbles: true }));
      await wait(150);
      row("its card names it and what it does, and how long is left", !hc.hidden && /Sick/.test(hc.textContent) && /Debuff/.test(hc.textContent) && /Tiredness builds 50% faster\./.test(hc.textContent) && /Food heals 25% less\./.test(hc.textContent) && /×3/.test(hc.textContent) && /18m left/.test(hc.textContent), hc.textContent.slice(0, 160));
      sel.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
      me.bleed = { stacks: 1, left: 30 };
      row("bleeding and Sick show side by side", show().length === 2 && show().some((d) => d.id === "bleed") && show().some((d) => d.id === "sick"), JSON.stringify(show()));
      me.bleed = null;
      me.sick.left = 1;
      for (let i = 0; i < 90; i++) G.loop.advance(1 / 60);
      row("the host's step runs Sick down and it passes: the row is empty", me.sick === null && show().length === 0, `${JSON.stringify(me.sick)}, ${show().length} in the row`);
      // The infection's third stage is Queasy now, never Sick.
      const inf0 = me.infection;
      const I = await import("/src/infection.js");
      me.infection = { since: G.clock.getElapsed() - 0.6 * I.duration() };
      const stage = moodles.activeMoodles(me).find((m) => m.id === "infection");
      row("the infection's third stage is named Queasy", !!stage && stage.stage === 3 && stage.name === "Queasy" && !moodles.MOODLES.find((m) => m.id === "infection").stages.some((s) => s.name === "Sick"), stage ? `${stage.stage} ${stage.name}` : "none");
      me.infection = inf0;
    } else {
      const now = show();
      const bleedNow = now.find((d) => d.id === "bleed"); // Sick may sit beside it (docs/44)
      row("on a guest the replica's record carries the wound and the row shows the same stacks and a time", !!me.bleed && me.bleed.stacks > 0 && !!bleedNow && bleedNow.stacks === (me.bleed.stacks > 1 ? String(me.bleed.stacks) : "") && /^\d+[sm]$/.test(bleedNow.time), `${JSON.stringify(me.bleed)} -> ${JSON.stringify(now)}`);
      row("on a guest there is no bleed moodle either", !moodles.activeMoodles(me).some((m) => m.id === "bleed"), moodles.activeMoodles(me).map((m) => m.id).join(","));
      // Sick (docs/44): the host made the guest's player Sick (`(await import("/src/sick.js")).apply(p)` twice on that player in the host's tab).
      const sickNow = now.find((d) => d.id === "sick");
      row("on a guest the replica's record carries Sick (its stacks and its time) and the row shows it", !!me.sick && me.sick.stacks > 0 && !!sickNow && sickNow.stacks === (me.sick.stacks > 1 ? String(me.sick.stacks) : "") && /^\d+[sm]$/.test(sickNow.time), `${JSON.stringify(me.sick)} -> ${JSON.stringify(sickNow || null)}`);
    }
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    card.hide();
    if (role !== "guest") {
      me.bleed = bleed0;
      me.sick = sick0;
      me.infection = infection0;
      me.hp = hp0;
      bag.items.splice(0, bag.items.length, ...bag0);
      for (const [e, n] of counts0) e.count = n;
      panel.setBagOpen(was.bag);
      rowUi.updateDebuffs(me);
    }
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused); // on a guest too: the check paused the loop whatever the role
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
