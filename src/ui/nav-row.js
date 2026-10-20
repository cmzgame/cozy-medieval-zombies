// The navigation row (Michael, 2026-10-19, #295): OSRS's row of buttons, bottom right, one for each panel that otherwise opens by a key.
// A button is its key: it taps the same key into the input (input.tap), so the panel opens and closes by the very code the key runs, and
// nothing about a panel changes. Two have no key of their own: the skills panel (this module's, the fourteen skills of #275 until they are
// built) and Settings; the Menu button opens the pause menu, as Escape does when nothing else is open. A click on the row is the row's, never
// the world's (the canvas never sees it). Its icons are dev art drawn here at boot (the placeholder rule): small pixel pictures with a dark
// outline round them, scaled up crisp.

import { skillIconHtml } from "./skill-icons.js"; // each skill's picture (#294), the same as over a gatherer's head

let root = null;
let skills = null;
let hooks = {};
let buttons = new Map(); // id -> the button
const shown = {}; // id -> whether its button shows pressed, so a step writes only what changed

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

// The fourteen skills (#275), for the skills panel until they are built; their ids are ui/skill-icons.js's, the names in lower case.
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

const NARROW = 600; // the interface's width, in its own pixels, under which the row is smaller and the skills panel stands above the log

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

// hooks: tap(code) presses a key for one step; openChat() focuses the chat box keeping any draft (Enter would clear it); openMenu(), openSettings();
// and canAct() is false while a screen is up.
export function initNavRow(h) {
  hooks = h;
  root = document.createElement("div");
  root.id = "nav-row";
  root.innerHTML = BUTTONS.map((b) => `<button type="button" class="kit-button nav-button" data-nav="${b.id}" title="${b.title}${b.key ? ` (${b.key})` : ""}" aria-label="${b.title}"><img src="${iconUrl(b.id)}" alt="" draggable="false"></button>`).join("");
  document.getElementById("ui").appendChild(root);
  // A press never takes the focus (a focused button would take the next Enter or Space itself, and the chat box keeps its cursor).
  root.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-nav]");
    if (!btn) return;
    btn.blur();
    // The chat box keeps its cursor through a press (the mousedown took no focus); any other button hands the keys back to the world.
    if (btn.dataset.nav !== "chat" && document.activeElement?.id === "log-input") document.activeElement.blur();
    press(btn.dataset.nav);
  });
  buttons = new Map([...root.querySelectorAll("[data-nav]")].map((b) => [b.dataset.nav, b]));
  skills = document.createElement("div");
  skills.id = "skills-panel";
  skills.className = "inv-column kit-frame";
  skills.hidden = true;
  skills.innerHTML = `<div class="inv-header kit-header"><span class="inv-title">Skills</span><span class="inv-tools"><button class="kit-button inv-close" data-skills-close title="Close">×</button></span></div><div class="kit-well sk-body">${SKILLS.map(([group, names]) => `<div class="sk-group"><div class="sk-group-name">${group}</div>${names.map((s) => `<div class="sk-row" data-skill="${s.toLowerCase()}"><span class="sk-name">${skillIconHtml(s.toLowerCase(), 1)}${s}</span><span class="sk-level">1</span></div>`).join("")}</div>`).join("")}<div class="sk-note">Not built yet: every skill is level 1 of 10 (#275).</div></div>`;
  document.getElementById("ui").appendChild(skills);
  skills.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    if (e.target.closest("button")) e.preventDefault(); // its X takes no focus either
  });
  skills.addEventListener("wheel", (e) => e.stopPropagation()); // its list scrolls on a short screen; the wheel is never the world's zoom
  // On a narrow interface (a small window, or a large interface scale) the row's buttons are smaller, clear of the belt and the moodles, and the
  // skills panel stands above the log (style.css).
  const ui = document.getElementById("ui");
  const fold = () => {
    const narrow = ui.clientWidth < NARROW;
    root.classList.toggle("narrow", narrow);
    skills.classList.toggle("narrow", narrow);
  };
  new ResizeObserver(fold).observe(ui);
  fold();
  skills.addEventListener("click", (e) => {
    if (e.target.closest("[data-skills-close]")) closeSkills();
  });
}

function press(id) {
  if (hooks.canAct && !hooks.canAct()) return;
  const b = BUTTONS.find((x) => x.id === id);
  if (id === "skills") {
    skills.hidden = !skills.hidden;
    paint("skills", !skills.hidden);
  } else if (id === "chat") hooks.openChat?.();
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
  paint("skills", false);
  return true;
}

function paint(id, on) {
  const btn = buttons.get(id);
  if (!btn || shown[id] === on) return;
  shown[id] = on;
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-pressed", String(on));
}

// Each step, after the panels have answered the keys: a button whose panel is open shows pressed.
export function update(open) {
  if (!root) return;
  for (const id of buttons.keys()) paint(id, id === "skills" ? isSkillsOpen() : !!open[id]);
}
