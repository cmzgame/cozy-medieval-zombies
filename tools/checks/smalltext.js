// Small text (#321; src/ui/small-text.js). From the console, on a tab with `?nosave`:
//   await __game.check("smalltext")
// Every piece of text on the page that is drawn at or under the threshold (15 UI px) is set in the clear sans-serif and every piece above it is not: the HUD, the open bag and the
// character screen, the Settings screen and the Controls screen, a hover card, the debuff row, the floating numbers. The font a piece of text computes to is read from the page itself,
// so a nested rule that inherits the wrong family (a big heading inside a small container) shows here. Then the Display setting: Pixel points the small text back at the pixel font and
// Clear returns it; the setting is restored in the finally. The screens, panels, and the setting are put back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const st = await import("/src/ui/small-text.js");
  const panel = await import("/src/ui/inventory-panel.js");
  const debuffRow = await import("/src/ui/debuff-row.js");
  const card = await import("/src/ui/hover-card.js");
  const me = G.player;
  const setting0 = G.settings.get("smallText");
  const screen0 = G.screens.currentScreen();
  const was = { bag: panel.isBagOpen(), character: panel.isCharacter() };
  const bleed0 = me.bleed ? { ...me.bleed } : null;
  const wasPaused = G.loop.isPaused();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const MAX = st.SMALL_TEXT_MAX_PX;
  // The text on the page now: [{ text, px, family, cls }] for every visible element that has a text node of its own.
  const audit = () => {
    const out = [];
    for (const el of document.querySelectorAll("#ui *, #screens *, #loading *")) {
      if (el.closest("[hidden]") || el.offsetParent === null && getComputedStyle(el).position !== "fixed") continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (!own) continue;
      const cs = getComputedStyle(el);
      out.push({ text: el.textContent.trim().slice(0, 24), px: parseFloat(cs.fontSize), family: cs.fontFamily, cls: `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}` });
    }
    return out;
  };
  const isMono = (f) => /monospace|Consolas|Courier/i.test(f);
  const isSmallFace = (f) => /^system-ui/i.test(f.trim());
  const wrong = (list) => list.filter((t) => !isMono(t.family) && !/Pirata/i.test(t.family) && (t.px <= MAX ? !isSmallFace(t.family) : isSmallFace(t.family)));
  try {
    G.loop.setPaused(true);
    if (screen0) G.screens.hide();
    G.settings.set("smallText", "clear");
    await wait(100);
    row("the setting is a Display setting, Clear by default", G.settings.REGISTRY.some((e) => e.key === "smallText" && e.group === "display") && G.settings.DEFAULTS.smallText === "clear" && getComputedStyle(document.documentElement).getPropertyValue("--font-small").includes("system-ui"), getComputedStyle(document.documentElement).getPropertyValue("--font-small").trim().slice(0, 40));
    // The HUD, the panels, the row, a card.
    me.bleed = { stacks: 3, left: 34 };
    debuffRow.updateDebuffs(me);
    panel.setBagOpen(true);
    panel.setCharacterOpen(true);
    panel.renderInventoryPanel(me, G.inventory.bagOf(me), null, G.inventory.beltOf(me));
    const item = document.querySelector(".inv-item");
    if (item) {
      const r = item.getBoundingClientRect();
      item.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + 4, clientY: r.top + 4, bubbles: true }));
      await wait(150);
    }
    const world = audit();
    const wWrong = wrong(world);
    row("in the world (HUD, bag, character screen, debuff row, hover card) every small piece is clear and every large one is not", world.length > 20 && wWrong.length === 0, `${world.length} pieces; wrong: ${wWrong.slice(0, 5).map((t) => `${t.cls} "${t.text}" ${t.px}px ${t.family.slice(0, 20)}`).join(" | ") || "none"}`);
    const time = document.querySelector("#debuffs .db-time");
    const stacks = document.querySelector("#debuffs .db-stacks");
    // Every digit in the clear face at any size (#325), and a digit never makes its line taller (the face's metrics are Pixelify's).
    {
      await document.fonts.ready;
      const box = (txt, size, weight) => { const e = document.createElement("div"); e.textContent = txt; e.style.cssText = `position:absolute;left:-9999px;top:0;font-family:var(--font-ui);font-size:${size}px;font-weight:${weight};white-space:nowrap`; document.body.appendChild(e); const r = e.getBoundingClientRect(); e.remove(); return r; };
      const bad = [];
      for (const [size, weight] of [[28, 400], [17, 700], [16, 400]]) {
        const letters = box("ABCD", size, weight), digits = box("3838", size, weight);
        if (Math.abs(letters.height - digits.height) > 0.5) bad.push(`${size}px ${weight}: ${letters.height} vs ${digits.height}`);
      }
      row("a line with digits is no taller than one without (28, 17 bold, and 16 px)", bad.length === 0, bad.join(" | ") || "same heights");
    }
    row("the bleed's time and stack number are clear sans-serif, 15 and 14 px", !!time && !!stacks && isSmallFace(getComputedStyle(time).fontFamily) && isSmallFace(getComputedStyle(stacks).fontFamily) && getComputedStyle(time).fontSize === "15px" && getComputedStyle(stacks).fontSize === "14px", `${time && getComputedStyle(time).fontFamily.slice(0, 20)} ${time && getComputedStyle(time).fontSize}`);
    card.hide();
    panel.setBagOpen(false);
    panel.setCharacterOpen(false);
    // The screens.
    for (const name of ["settings", "controls"]) {
      G.screens.show(name);
      await wait(100);
      const list = audit();
      const bad = wrong(list);
      row(`the ${name} screen: every small piece is clear and every large one is not`, list.length > 10 && bad.length === 0, `${list.length} pieces; wrong: ${bad.slice(0, 5).map((t) => `${t.cls} "${t.text}" ${t.px}px ${t.family.slice(0, 20)}`).join(" | ") || "none"}`);
      G.screens.hide();
    }
    // The text boxes the screens make (#world-name and the key and code boxes had no rule: the browser's Arial at 13.33 px) follow the setting: the clear sans, or monospace for a code.
    const boxes = [];
    for (const name of ["newworld", "join", "creatorkey", "ownerkey", "addowned"]) {
      try { G.screens.show(name, name === "newworld" ? { name: "A world" } : {}); } catch { continue; }
      await wait(100);
      for (const f of document.querySelectorAll("#screens input[type=text], #screens input[type=password]")) {
        const cs = getComputedStyle(f);
        boxes.push({ screen: name, id: f.id || f.className, family: cs.fontFamily, px: parseFloat(cs.fontSize) });
      }
      G.screens.hide();
    }
    const stray = boxes.filter((b) => !isMono(b.family) && !isSmallFace(b.family));
    row("every text box on the screens is in the clear sans (or monospace for a code), the World name box included", boxes.some((b) => b.id === "world-name") && stray.length === 0, `${boxes.length} boxes; stray: ${stray.map((b) => `${b.screen}/${b.id} ${b.family.slice(0, 16)} ${b.px}px`).join(" | ") || "none"}`);
    // The setting flips it.
    G.settings.set("smallText", "pixel");
    await wait(100);
    const pixelSmall = getComputedStyle(document.querySelector("#debuffs .db-time") || document.body).fontFamily;
    row("Pixel puts the small text back in the pixel font, and Clear returns it", /Pixelify/i.test(pixelSmall) && (G.settings.set("smallText", "clear"), true) && (await wait(100), isSmallFace(getComputedStyle(document.querySelector("#debuffs .db-time")).fontFamily)), `pixel: ${pixelSmall.slice(0, 24)}`);
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    G.settings.set("smallText", setting0 === undefined ? "clear" : setting0);
    card.hide();
    me.bleed = bleed0;
    debuffRow.updateDebuffs(me);
    panel.setBagOpen(was.bag);
    panel.setCharacterOpen(was.character);
    if (screen0) G.screens.show(screen0);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
