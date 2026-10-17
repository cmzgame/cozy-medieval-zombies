// The conversation panel (docs/34, #202): a villager's lines one after another, then the topics and replies, on the talker's own screen, on the kit,
// bottom centre above the belt. **Entirely click-based** (Michael, 2026-10-16, #91): Continue... between lines, the topics as buttons each with its wiki
// link, the replies, and the panel's own "That's all for now"; no key binds inside it (E, Space, and 1 to 9 keep their world meanings: only the pause menu
// stops the game), Escape closes it in the panels' order. Everything it shows is computed here from the talk data (src/talk.js) and this side's own world, the
// replica's for a guest: nothing of a conversation crosses the wire but who is talking (`talkingWith`) and a guest's "I have left". Each line the villager says
// also goes in the talker's own log. It ends with "That's all for now", an `end` node, the X, Escape, walking out of reach, or the villager hurt, turned, or dead.

import * as talk from "../talk.js";
import * as log from "./log.js";
import { talkContext, endTalk } from "../entities/villager.js";

const WIKI = "https://cmzgame.github.io/cmz-wiki/";
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); // the wiki's own slugify (lib/markdown.js)
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let root = null;
let open = null; // { vid, talkId, nodeId, node, i, said }
let lastHtml = "";
let getPlayer = () => null;
let getVillagers = () => [];
let ender = null; // on a guest: tells the host the panel closed (net.sendTalkEnd)

export function setEnder(fn) {
  ender = fn;
}

export function initTalkPanel(playerGetter, villagersGetter) {
  getPlayer = playerGetter;
  getVillagers = villagersGetter;
  root = document.createElement("div");
  root.id = "talk";
  root.className = "inv-column kit-frame";
  root.hidden = true;
  document.getElementById("ui").appendChild(root);
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  root.addEventListener("click", (e) => {
    if (!open) return;
    if (e.target.closest("[data-close]") || e.target.closest("[data-bye]")) return void close();
    if (e.target.closest("[data-wiki]")) return; // a link: the browser opens it in a new tab
    if (e.target.closest("[data-continue]")) {
      open.i += 1;
      sayLine();
      lastHtml = "";
      render();
      return;
    }
    const opt = e.target.closest("[data-opt]");
    if (opt) {
      const o = open.node.options[Number(opt.dataset.opt)];
      if (!o) return;
      if (o.end) return void close();
      enter(o.goto);
    }
  });
}

export function isOpen() {
  return !!open;
}

const villagerOf = () => (open ? getVillagers().find((v) => v.id === open.vid) || null : null);

// The panel on this screen for a conversation the host has begun with my player (villager.js startTalk), on the host's own screen or a guest's replica.
export function openFor(v, player) {
  const file = talk.get(v.talk);
  if (!file || !root) return false;
  if (open) closeQuietly();
  open = { vid: v.id, talkId: v.talk, nodeId: null, node: null, i: 0, said: "" };
  root.hidden = false;
  enter(file.start, player);
  return true;
}

function enter(nodeId, player = getPlayer()) {
  const v = villagerOf();
  if (!v) return void close();
  const node = talk.node(open.talkId, nodeId, talkContext(v, player));
  if (!node) return void close();
  open.nodeId = nodeId;
  open.node = node;
  open.i = 0;
  sayLine();
  lastHtml = "";
  render();
}

// Each line goes in the log once, in the villager's name, as it is shown.
function sayLine() {
  const v = villagerOf();
  const line = open.node.say[open.i];
  if (!v || line === undefined) return;
  const key = `${open.nodeId}:${open.i}`;
  if (open.said === key) return;
  open.said = key;
  log.push(line, "say", v.name || "Villager");
}

function render() {
  if (!open) return;
  const v = villagerOf();
  if (!v) return void close();
  const n = open.node;
  const last = open.i >= n.say.length - 1;
  const line = n.say[open.i] ?? "";
  let body;
  if (!last) body = `<div class="tk-say">${esc(line)}</div><div class="tk-options"><button class="kit-button" data-continue>Continue…</button></div>`;
  else {
    const opts = n.options.map((o, k) => `<div class="tk-opt"><button class="kit-button" data-opt="${k}">${esc(o.text)}</button>${o.wiki ? `<a class="tk-wiki" data-wiki href="${WIKI}${slug(o.wiki)}.html" target="_blank" rel="noopener" title="${esc(o.wiki)} on the wiki">${esc(o.wiki)}</a>` : ""}</div>`).join("");
    body = `<div class="tk-say">${esc(line)}</div><div class="tk-options">${opts}<button class="kit-button tk-bye" data-bye>That's all for now</button></div>`;
  }
  const html = `<div class="inv-header kit-header"><span class="inv-title">${esc(v.name || "Villager")}</span><span class="inv-tools"><button class="kit-button inv-close" data-close title="Close">×</button></span></div><div class="tk-body kit-well">${body}</div>`;
  if (html !== lastHtml) {
    root.innerHTML = html;
    lastHtml = html;
  }
}

// Each step: close when the villager is gone, hurt, turned, or no longer holds me (the host dropped me: I walked away), or I am gone.
export function update(player) {
  if (!open) return;
  const v = villagerOf();
  if (!v || v.dead || v.state !== "talk" || !player || player.dead || !(v.talkingWith || []).includes(player.id)) return void closeQuietly();
  render();
}

// Closing tells the host the panel is gone: the host's own player directly, a guest by a command.
export function close() {
  if (!open) return false;
  const v = villagerOf();
  const player = getPlayer();
  if (ender) ender(open.vid);
  else if (v && player) endTalk(v, player.id);
  closeQuietly();
  return true;
}

function closeQuietly() {
  open = null;
  lastHtml = "";
  if (root) {
    root.hidden = true;
    root.innerHTML = "";
  }
}
