// Copied from cozy-zombie-game src/input.js on 2026-10-09. Since: the right and middle buttons with a tap-or-hold
// record (docs/21), held keys dropped on blur, focus, and hidden (2026-10-10), the wheel taken per step.
// Keyboard and mouse state. Mouse coordinates are in internal canvas pixels.

const keys = new Set();
const justPressed = new Set();
// Held keys are dropped when the window loses focus or is hidden, so a lost
// keyup cannot walk the player forever. A watchdog that dropped keys which
// stopped auto-repeating was tried on 2026-10-10 and withdrawn within the
// hour: Windows repeats only the newest key, so holding S and pressing D
// silenced S and the watchdog dropped it, breaking diagonals and stranding
// the player (Michael and his brother).
const mouse = { x: 0, y: 0, inside: false };
let leftDown = false;
let leftJustPressed = false;
let rightJustPressed = false;
let rightDown = false;
let rightReleased = false;
let rightAt = { x: 0, y: 0 }; // where the right button went down: a tap opens its menu there (docs/21)
let middleDown = false;
let middleJustPressed = false;
let wheelDelta = 0;

let canvas = null;
let scale = 1;

const PREVENT = new Set(["Tab", "KeyE", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export function init(targetCanvas) {
  canvas = targetCanvas;

  window.addEventListener("keydown", (e) => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!keys.has(e.code)) justPressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
  });
  const dropAll = () => {
    keys.clear();
    leftDown = false;
    rightDown = false;
    middleDown = false;
  };
  window.addEventListener("blur", dropAll);
  window.addEventListener("focus", dropAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) dropAll();
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / scale;
    mouse.y = (e.clientY - rect.top) / scale;
    mouse.inside = true;
  });
  canvas.addEventListener("mouseleave", () => {
    mouse.inside = false;
  });
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      leftDown = true;
      leftJustPressed = true;
    } else if (e.button === 2) {
      rightJustPressed = true;
      rightDown = true;
      rightAt = { x: mouse.x, y: mouse.y };
    } else if (e.button === 1) {
      e.preventDefault(); // no autoscroll: the middle button is the main hand's other mode (docs/21)
      middleDown = true;
      middleJustPressed = true;
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) leftDown = false;
    else if (e.button === 2 && rightDown) {
      rightDown = false;
      rightReleased = true;
    } else if (e.button === 1) middleDown = false;
  });
  // No browser context menu anywhere in the game, canvas or DOM UI. Right-click
  // is a game input. The debug corner keeps the native menu so Inspect works.
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest("#debug")) return;
    e.preventDefault();
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    wheelDelta += Math.sign(e.deltaY);
  }, { passive: false });
}

export function setScale(s) {
  scale = s;
}

export function isDown(code) {
  return keys.has(code);
}

export function wasPressed(code) {
  return justPressed.has(code);
}

// A key pressed for one step by something other than the keyboard (the navigation row, #295), so it runs the key's own code.
export function tap(code) {
  justPressed.add(code);
}

export function mouseLeftDown() {
  return leftDown;
}

export function mouseLeftPressed() {
  return leftJustPressed;
}

export function mouseRightPressed() {
  return rightJustPressed;
}

export function mouseRightDown() {
  return rightDown;
}

// The right button was let go since the last step (docs/21).
export function mouseRightReleased() {
  return rightReleased;
}

export function mouseRightAt() {
  return rightAt;
}

export function mouseMiddleDown() {
  return middleDown;
}

export function mouseMiddlePressed() {
  return middleJustPressed;
}

export function getMouse() {
  return mouse;
}

export function takeWheel() {
  const d = wheelDelta;
  wheelDelta = 0;
  return d;
}

// Screen-space movement vector from WASD / arrows. Not normalized.
export function moveAxis() {
  let x = 0;
  let y = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  return { x, y };
}

// Call once at the end of each logic step.
export function endStep() {
  justPressed.clear();
  leftJustPressed = false;
  rightJustPressed = false;
  rightReleased = false;
  middleJustPressed = false;
}
