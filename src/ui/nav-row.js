// The navigation row (Michael, 2026-10-19, #295): OSRS's row of buttons, bottom right, one for each panel that otherwise opens by a key.
// A button is its key: it taps the same key into the input (input.tap), so the panel opens and closes by the very code the key runs, and
// nothing about a panel changes. Two have no key of their own: the skills panel (this module's, the fourteen skills of #275 until they are
// built) and Settings; the Menu button opens the pause menu, as Escape does when nothing else is open. A click on the row is the row's, never
// the world's (the canvas never sees it). Its icons are dev art drawn here at boot (the placeholder rule): small pixel pictures with a dark
// outline round them, scaled up crisp.

let root = null;
let skills = null;
let hooks = {};

// Each icon is a 12 by 12 picture: "#" its main colour, "+" its accent, "." empty; the outline is drawn round whatever is filled.
const ICONS = {
  bag: { main: "#b08850", accent: "#7a5a30", art: [
    "....++++....",
    "...+....+...",
    "....++++....",
    "...######...",
    "..########..",
    ".##########.",
    ".##########.",
    ".####++####.",
    ".##########.",
    "..########..",
    "...######...",
    "............"] },
  character: { main: "#7aa0c8", accent: "#e0b890", art: [
    "....++++....",
    "....++++....",
    "....++++....",
    ".....++.....",
    "..########..",
    ".#.######.#.",
    ".#.######.#.",
    "...######...",
    "...##..##...",
    "...##..##...",
    "...##..##...",
    "............"] },
  skills: { main: "#e8c860", accent: "#e8c860", art: [
    ".....##.....",
    ".....##.....",
    "....####....",
    "############",
    ".##########.",
    "..########..",
    "...######...",
    "...######...",
    "..###..###..",
    "..##....##..",
    ".##......##.",
    "............"] },
  map: { main: "#7a5a30", accent: "#e8d8a8", art: [
    "............",
    ".##########.",
    ".#++++++++#.",
    ".#+##+++++#.",
    ".#++##+##+#.",
    ".#+++###++#.",
    ".#+++++##+#.",
    ".#+##+++++#.",
    ".#++###+++#.",
    ".#++++++++#.",
    ".##########.",
    "............"] },
  build: { main: "#8a6038", accent: "#a8b0b8", art: [
    "............",
    ".++++++++...",
    ".++++++++...",
    ".++++++++...",
    "....##......",
    "....##......",
    "....##......",
    "....##......",
    "....##......",
    "....##......",
    "....##......",
    "............"] },
  chat: { main: "#e8e0d0", accent: "#e8e0d0", art: [
    "............",
    ".##########.",
    "############",
    "############",
    "############",
    "############",
    ".##########.",
    "...###......",
    "...##.......",
    "...#........",
    "............",
    "............"] },
  settings: { main: "#a8b0b8", accent: "#a8b0b8", art: [
    ".....##.....",
    "..#.####.#..",
    "..########..",
    ".####..####.",
    "###......###",
    ".###....###.",
    ".###....###.",
    "###......###",
    ".####..####.",
    "..########..",
    "..#.####.#..",
    ".....##....."] },
  menu: { main: "#e8e0d0", accent: "#e8e0d0", art: [
    "............",
    ".##########.",
    ".##########.",
    "............",
    "............",
    ".##########.",
    ".##########.",
    "............",
    "............",
    ".##########.",
    ".##########.",
    "............"] },
};

// The fourteen skills (#275), for the skills panel until they are built.
const SKILLS = [
  ["Combat", ["Melee", "Magic", "Ranged", "Faith"]],
  ["Gathering", ["Woodcutting", "Mining", "Fishing", "Herbalism", "Beastlore"]],
  ["Production", ["Farming", "Cooking", "Blacksmithing", "Crafting", "Potions"]],
];

// The buttons in order: what each opens, and its key (tapped into the input, or a hook).
const BUTTONS = [
  { id: "bag", title: "Bag", key: "Tab", code: "Tab" },
  { id: "character", title: "Character", key: "C", code: "KeyC" },
  { id: "skills", title: "Skills" },
  { id: "map", title: "Map", key: "M", code: "KeyM" },
  { id: "build", title: "Build", key: "N", code: "KeyN" },
  { id: "chat", title: "Chat", key: "Enter", code: "Enter" },
  { id: "settings", title: "Settings" },
  { id: "menu", title: "Menu", key: "Esc" },
];

function iconUrl(name) {
  const { main, accent, art } = ICONS[name];
  const n = 12;
  const c = document.createElement("canvas");
  c.width = n + 2;
  c.height = n + 2;
  const g = c.getContext("2d");
  const filled = (x, y) => y >= 0 && y < n && x >= 0 && x < n && art[y][x] !== ".";
  g.fillStyle = "#1a1410"; // the outline: every empty cell beside a filled one
  for (let y = -1; y <= n; y++) for (let x = -1; x <= n; x++) {
    if (filled(x, y)) continue;
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) g.fillRect(x + 1, y + 1, 1, 1);
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ch = art[y][x];
    if (ch === ".") continue;
    g.fillStyle = ch === "+" ? accent : main;
    g.fillRect(x + 1, y + 1, 1, 1);
  }
  return c.toDataURL();
}

// hooks: tap(code) presses a key for one step; openMenu(), openSettings(); and canAct() is false while a screen is up.
export function initNavRow(h) {
  hooks = h;
  root = document.createElement("div");
  root.id = "nav-row";
  root.innerHTML = BUTTONS.map((b) => `<button type="button" class="kit-button nav-button" data-nav="${b.id}" title="${b.title}${b.key ? ` (${b.key})` : ""}" aria-label="${b.title}"><img src="${iconUrl(b.id)}" alt="" draggable="false"></button>`).join("");
  document.getElementById("ui").appendChild(root);
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-nav]");
    if (!btn) return;
    btn.blur(); // a focused button would take the next Enter or Space itself
    press(btn.dataset.nav);
  });
  skills = document.createElement("div");
  skills.id = "skills-panel";
  skills.className = "inv-column kit-frame";
  skills.hidden = true;
  skills.innerHTML = `<div class="inv-header kit-header"><span class="inv-title">Skills</span><span class="inv-tools"><button class="kit-button inv-close" data-skills-close title="Close">×</button></span></div><div class="kit-well sk-body">${SKILLS.map(([group, names]) => `<div class="sk-group"><div class="sk-group-name">${group}</div>${names.map((s) => `<div class="sk-row"><span>${s}</span><span class="sk-level">1 / 10</span></div>`).join("")}</div>`).join("")}<div class="sk-note">Skills are not built yet; their scope is the game's issue #275.</div></div>`;
  document.getElementById("ui").appendChild(skills);
  skills.addEventListener("mousedown", (e) => e.stopPropagation());
  skills.addEventListener("click", (e) => {
    if (e.target.closest("[data-skills-close]")) closeSkills();
  });
}

function press(id) {
  if (hooks.canAct && !hooks.canAct()) return;
  const b = BUTTONS.find((x) => x.id === id);
  if (id === "skills") skills.hidden = !skills.hidden;
  else if (id === "settings") hooks.openSettings?.();
  else if (id === "menu") hooks.openMenu?.();
  else if (b && b.code) hooks.tap?.(b.code);
}

export function isSkillsOpen() {
  return !!skills && !skills.hidden;
}

// Escape closes the skills panel in the panels' order (main.js handleEscape); true when it was open.
export function closeSkills() {
  if (!isSkillsOpen()) return false;
  skills.hidden = true;
  return true;
}

// Each frame: a button whose panel is open shows pressed.
export function update(open) {
  if (!root) return;
  for (const btn of root.querySelectorAll("[data-nav]")) {
    const on = btn.dataset.nav === "skills" ? isSkillsOpen() : !!open[btn.dataset.nav];
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
  }
}
