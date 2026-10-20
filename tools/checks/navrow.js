// The navigation row (#295): the buttons bottom right, each its panel's key. From the console, on a tab with `?nosave` (any map):
//   await __game.check("navrow")
// It clicks each button as a mouse would (mousedown, mouseup, click) and steps the world: the bag, the character screen, the map, and the build
// palette open from their button and close from their real key (a keydown on the window), and the other way round; the button shows pressed while its
// panel is open. A press never takes the focus or reaches the canvas. Chat focuses the chat box and keeps a draft. Skills opens its panel, which sits
// on the screen and clear of the map's Centre and X, and Escape closes it. Menu opens the pause menu over open panels, and Escape closes the menu
// first. Settings opens settings. It puts every panel, screen, and the chat box back as it found them.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail = "") => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const mapPanel = await import("/src/ui/map-panel.js");
  const navRow = await import("/src/ui/nav-row.js");
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  const chat = document.getElementById("log-input");
  const chat0 = chat ? chat.value : "";
  const step = (n = 2) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const btn = (id) => document.querySelector(`#nav-row [data-nav="${id}"]`);
  const click = (id) => {
    const b = btn(id);
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    b.dispatchEvent(down);
    b.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
    b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    return down;
  };
  const key = (code) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true }));
  };
  const closeAll = () => {
    G.panel.closeAll();
    mapPanel.close();
    if (G.buildPalette.isOpen()) G.buildPalette.close();
    navRow.closeSkills();
    if (G.screens.currentScreen()) G.screens.hide();
  };
  try {
    if (screen0) G.screens.hide();
    G.loop.setPaused(true);
    closeAll();
    step();

    const ids = [...document.querySelectorAll("#nav-row [data-nav]")].map((b) => b.dataset.nav);
    row("the row has its eight buttons in order", ids.join() === "bag,character,skills,map,build,chat,settings,menu", ids.join(", "));
    row("each button has its drawn icon", ids.every((id) => btn(id).querySelector("img")?.src.startsWith("data:image/png")));

    // A press is the row's: the focus stays where it was and the mousedown never reaches the canvas.
    let reached = false;
    const canvas = document.querySelector("canvas");
    const spy = () => { reached = true; };
    document.addEventListener("mousedown", spy);
    const before = document.activeElement;
    const down = click("bag");
    document.removeEventListener("mousedown", spy);
    row("a press takes no focus", document.activeElement === before && down.defaultPrevented, `active: ${document.activeElement?.id || document.activeElement?.tagName}`);
    row("a press never reaches the page (or the canvas) beyond the row", !reached && !!canvas);
    step();
    closeAll();
    step();

    // The four that are keys: a button opens and the key closes, the key opens and the button closes.
    const panels = [
      ["bag", "Tab", () => G.panel.isBagOpen()],
      ["character", "KeyC", () => G.panel.isCharacter()],
      ["map", "KeyM", () => mapPanel.isOpen()],
      ["build", "KeyN", () => G.buildPalette.isOpen()],
    ];
    for (const [id, code, isOpen] of panels) {
      closeAll();
      step();
      click(id);
      step();
      const a = isOpen();
      const shownOn = btn(id).classList.contains("on");
      key(code);
      step();
      const b = isOpen();
      key(code);
      step();
      const c = isOpen();
      click(id);
      step();
      const d = isOpen();
      row(`${id}: the button opens, ${code} closes, ${code} opens, the button closes`, a && !b && c && !d, `${a} ${b} ${c} ${d}`);
      row(`${id}: its button shows pressed while open, and not after`, shownOn && !btn(id).classList.contains("on"));
    }

    // Chat focuses the box and keeps what was typed.
    closeAll();
    step();
    chat.value = "half a thought";
    chat.blur();
    click("chat");
    step();
    row("Chat focuses the chat box and keeps a draft", document.activeElement === chat && chat.value === "half a thought", JSON.stringify(chat.value));
    chat.blur();
    chat.value = chat0;

    // Skills: its own panel, on the screen and clear of the map's controls; Escape closes it.
    closeAll();
    step();
    mapPanel.toggle(G.player);
    click("skills");
    step();
    const sk = document.getElementById("skills-panel");
    const r = sk.getBoundingClientRect();
    const clear = [...document.querySelectorAll("#map-panel .mp-x, #map-panel .mp-centre")].every((el) => {
      const m = el.getBoundingClientRect();
      return r.right <= m.left || r.left >= m.right || r.bottom <= m.top || r.top >= m.bottom;
    });
    row("Skills opens its panel, the button pressed", navRow.isSkillsOpen() && btn("skills").classList.contains("on"));
    row("the skills panel is on the screen", r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth, `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} in ${innerWidth}x${innerHeight}`);
    row("the skills panel leaves the map's Centre and X clear", clear);
    row("it lists the fourteen skills", sk.querySelectorAll("[data-skill]").length === 14);
    key("Escape");
    step();
    row("Escape closes the skills panel first (the map stays)", !navRow.isSkillsOpen() && mapPanel.isOpen() && !btn("skills").classList.contains("on"));

    // Menu over open panels: Escape closes the pause menu first, and the panels stay.
    closeAll();
    step();
    click("bag");
    step();
    click("skills");
    click("menu");
    row("Menu opens the pause menu over open panels", G.screens.currentScreen() === "pause");
    key("Escape");
    step();
    row("Escape closes the pause menu first, the panels under it stay", !G.screens.currentScreen() && navRow.isSkillsOpen() && G.panel.isBagOpen());

    // Settings.
    closeAll();
    step();
    click("settings");
    row("Settings opens the settings screen", G.screens.currentScreen() === "settings");
    G.screens.hide();

    // Nothing acts while a screen is up.
    G.screens.show("pause");
    click("bag");
    G.screens.hide();
    step();
    row("a press under a screen does nothing", !G.panel.isBagOpen());
  } catch (e) {
    row("ran without a throw", false, String(e && e.stack || e));
  } finally {
    closeAll();
    if (chat) { chat.value = chat0; chat.blur(); }
    step(1);
    G.loop.setPaused(wasPaused);
    if (screen0) G.screens.show(screen0);
  }
  console.table(rows);
  return rows.every((r) => r.result === "pass") ? "navrow: all pass" : rows.filter((r) => r.result !== "pass");
}
