// Copied from cozy-zombie-game src/input.js on 2026-10-09. Unchanged.
// Keyboard and mouse state. Mouse coordinates are in internal canvas pixels.

const keys = new Set();
const justPressed = new Set();
const mouse = { x: 0, y: 0, inside: false };
let leftDown = false;
let leftJustPressed = false;
let rightJustPressed = false;
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
  window.addEventListener("blur", () => {
    keys.clear();
    leftDown = false;
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
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) leftDown = false;
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

export function mouseLeftDown() {
  return leftDown;
}

export function mouseLeftPressed() {
  return leftJustPressed;
}

export function mouseRightPressed() {
  return rightJustPressed;
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
}
