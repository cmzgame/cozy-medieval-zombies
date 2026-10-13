// The text log (Michael, 2026-10-12): the one place written results go, as in
// OSRS or WoW. Messages the game shows ("Nothing interesting happens.", "The
// bleeding stops.") land here as well as in the floating message, and every
// line a character says aloud within sight is copied here as "Name: line", so
// it is a chat log with one player in it, which is the shape a second player
// slots into later (the co-op law: the log is a list of lines, not a view of
// anyone's state). Bottom-left above the HUD, the last lines showing, the wheel
// scrolls it; two hundred lines kept. DOM in the UI layer, never the canvas.

const KEEP = 200;
let root = null;
let pinned = true; // following the newest line until the user scrolls up

export function initLog() {
  root = document.createElement("div");
  root.id = "log";
  document.getElementById("ui").appendChild(root);
  root.addEventListener("scroll", () => {
    pinned = root.scrollTop + root.clientHeight >= root.scrollHeight - 4;
  });
  root.addEventListener("mousedown", (e) => e.stopPropagation());
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
