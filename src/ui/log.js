// The text log (Michael, 2026-10-12): the one place written results go, as in
// OSRS or WoW. Messages the game shows ("Nothing interesting happens.", "The
// bleeding stops.") land here as well as in the floating message, and every
// line a character says aloud within sight is copied here as "Name: line", so
// it is a chat log with one player in it, which is the shape a second player
// slots into later (the co-op law: the log is a list of lines, not a view of
// anyone's state). Bottom-left above the HUD, the last lines showing, the wheel
// scrolls it; two hundred lines kept. DOM in the UI layer, never the canvas.

import * as settings from "../settings.js";

const KEEP = 200;
let root = null;
let pinned = true; // following the newest line until the user scrolls up
let input = null;
let onSay = null; // main.js: a line typed is said by your player (docs/31/03: the log is the chat)
let onCommand = null; // a line beginning with a slash, the slash stripped; nothing behind it yet

// The chat box focused with the cursor ready, from a key (T; a slash types the slash first; Michael, 2026-10-13).
export function focusChat(prefix = "") {
  if (!input) return;
  input.value = prefix;
  input.focus();
  input.setSelectionRange(prefix.length, prefix.length);
}

export function initLog(handlers = {}) {
  onSay = handlers.onSay || null;
  onCommand = handlers.onCommand || null;
  root = document.createElement("div");
  root.id = "log";
  document.getElementById("ui").appendChild(root);
  // The chat: a line typed here is said by your player, a bubble over your head and a line in every
  // log that could see you (docs/31/03). Enter sends; Escape leaves the box; keys in it never reach the game.
  input = document.createElement("input");
  input.id = "log-input";
  input.type = "text";
  input.maxLength = 200;
  input.placeholder = "Say something…";
  input.autocomplete = "off";
  input.spellcheck = false;
  document.getElementById("ui").appendChild(input);
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.code === "Enter") {
      const text = input.value.trim();
      input.value = "";
      // A line beginning with a slash is a command, not a thing said (Michael, 2026-10-13: the hook
      // for commands, nothing behind it yet); anything else is said.
      if (text.startsWith("/")) {
        if (onCommand) onCommand(text.slice(1).trim());
        else push("Commands are not here yet.", "info");
      } else if (text && onSay) onSay(text);
      input.blur();
    } else if (e.code === "Escape") input.blur();
  });
  input.addEventListener("keyup", (e) => e.stopPropagation());
  input.addEventListener("mousedown", (e) => e.stopPropagation());
  root.addEventListener("scroll", () => {
    pinned = root.scrollTop + root.clientHeight >= root.scrollHeight - 4;
  });
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  // Resizable by its corner (CSS `resize`), the size remembered (Michael, 2026-10-12).
  const size = settings.get("logSize");
  if (size && size.w && size.h) {
    root.style.width = `${size.w}px`;
    root.style.height = `${size.h}px`;
  }
  let timer = 0;
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const w = Math.round(root.offsetWidth);
      const h = Math.round(root.offsetHeight);
      const cur = settings.get("logSize");
      if (!cur || cur.w !== w || cur.h !== h) settings.set("logSize", { w, h });
    }, 250);
  }).observe(root);
}

// `kind`: info (the game), result (an action's outcome), say (a character's
// line), warn (something to act on). `who` names the speaker for `say`.
export function push(text, kind = "info", who = null) {
  if (!root || !text) return;
  const line = document.createElement("div");
  line.className = `log-line log-${kind}`;
  if (who) {
    const name = document.createElement("b");
    name.textContent = `${who}: `;
    line.appendChild(name);
  }
  line.appendChild(document.createTextNode(text));
  root.appendChild(line);
  while (root.childElementCount > KEEP) root.firstElementChild.remove();
  if (pinned) root.scrollTop = root.scrollHeight;
}

export function lines() {
  return root ? [...root.children].map((el) => el.textContent) : [];
}
