// The view: how the window is divided between the world and the interface
// (docs/02, 2026-10-10 night; re-decides the 960×540 probe viewport).
//
// The world fills the window at the zoom, a continuous scale the GPU applies
// to the world's pixels (the canvas buffer is the window; the renderer draws
// world pixels and the viewport scales them with nearest sampling). The
// interface is DOM and takes its own, fractional scale, like a web page, so it
// reads well on any screen regardless of what the world is doing.
//
// Three coordinate spaces meet here:
//   world pixels   the canvas's own pixels (what iso.toScreen gives), w × h
//   UI pixels      the #ui layer's pixels, uiW × uiH, scaled by uiScale
//   client pixels  the browser's, as mouse events report them
// Everything that places a DOM element over a world point goes through toUi.

import * as input from "./input.js";
import * as settings from "./settings.js";

// The size the probe was designed at; "auto" zoom is the largest integer at
// which this still fits the window, clamped to the zoom range.
export const BASE_W = 960;
export const BASE_H = 540;

// Zoom (docs/02, 2026-10-10, late): screen pixels per world pixel, one of
// three levels, snapped. A smooth zoom was tried and withdrawn the same
// night: the world sliding under the cursor spun the player and jerked the
// view. Wide is the whole-window view, close is a close-up.
export const ZOOM_LEVELS = [1.1, 1.8, 2.7];
export const ZOOM_MIN = ZOOM_LEVELS[0];
export const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

export const view = {
  w: BASE_W, // world pixels across the window
  h: BASE_H,
  bufW: BASE_W, // the canvas buffer, which is the window
  bufH: BASE_H,
  worldScale: 1, // screen pixels per world pixel: the zoom
  uiScale: 1, // screen pixels per UI pixel
  uiW: BASE_W, // UI pixels across the window
  uiH: BASE_H,
};

let canvas = null;
let ui = null;
let zoom = ZOOM_MIN;
const listeners = new Set();

export function init(canvasEl, uiEl) {
  canvas = canvasEl;
  ui = uiEl;
  window.addEventListener("resize", resize);
  settings.onChange((key) => {
    if (key === "uiScale") resize();
    if (key === "worldScale") {
      zoom = zoomFromSetting();
      resize();
    }
  });
  zoom = zoomFromSetting();
  resize();
}

// The level nearest a value.
function nearestLevel(z) {
  let best = ZOOM_LEVELS[0];
  for (const l of ZOOM_LEVELS) if (Math.abs(l - z) < Math.abs(best - z)) best = l;
  return best;
}

function autoWorldScale(ww, wh) {
  return Math.max(1, Math.floor(Math.min(ww / BASE_W, wh / BASE_H)));
}

// "auto" is the level nearest the integer scale the window fits: wide on a
// 1080p window, middle on a 4K one.
function zoomFromSetting() {
  const ws = settings.get("worldScale");
  return nearestLevel(ws === "auto" ? autoWorldScale(window.innerWidth, window.innerHeight) : Number(ws) || 1);
}

// A UI scale that reads on this window: about 85 percent of what the probe
// size would scale to, in quarter steps, never below 1.
function autoUiScale(ww, wh) {
  const fit = Math.min(ww / BASE_W, wh / BASE_H);
  return Math.max(1, Math.round(fit * 0.85 * 4) / 4);
}

export function zoomIndex() {
  return ZOOM_LEVELS.indexOf(nearestLevel(zoom));
}

// Snap to a level and keep it in the setting.
export function setZoom(z) {
  const level = nearestLevel(z);
  if (level === zoom) return;
  zoom = level;
  settings.set("worldScale", level); // the listener above resizes
  resize();
}

// One level in or out; `wrap` cycles from close back to wide (the Z key).
export function zoomStep(dir, wrap = false) {
  let i = zoomIndex() + Math.sign(dir);
  if (wrap) i = (i + ZOOM_LEVELS.length) % ZOOM_LEVELS.length;
  else i = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i));
  setZoom(ZOOM_LEVELS[i]);
}

export function update() {}

// The bag's and the character screen's cell in UI pixels (docs/23 step 4). A
// growth with the window was built and withdrawn the same night (Michael,
// 2026-10-12: the character screen came out far too big; Minecraft's size or a
// hair bigger). One place to change if it comes back; the icons are 19 px a
// cell and a portrait 38 px a slot, so a factor keeps to half steps.
export const BASE_CELL = 38;
export function panelCell() {
  return BASE_CELL;
}

export function resize() {
  const ww = Math.max(1, window.innerWidth);
  const wh = Math.max(1, window.innerHeight);
  const s = zoom;
  const w = ww / s;
  const h = wh / s;
  if (canvas.width !== ww || canvas.height !== wh) {
    canvas.width = ww;
    canvas.height = wh;
  }
  canvas.style.width = `${ww}px`;
  canvas.style.height = `${wh}px`;
  input.setScale(s);

  const us = settings.get("uiScale");
  const u = us === "auto" ? autoUiScale(ww, wh) : us;
  const uw = Math.ceil(ww / u);
  const uh = Math.ceil(wh / u);
  ui.style.left = "0px";
  ui.style.top = "0px";
  ui.style.width = `${uw}px`;
  ui.style.height = `${uh}px`;
  ui.style.transform = `scale(${u})`;
  ui.style.transformOrigin = "0 0";

  Object.assign(view, { w, h, bufW: ww, bufH: wh, worldScale: s, uiScale: u, uiW: uw, uiH: uh });
  for (const fn of listeners) fn(view);
}

// Called with the view after every resize.
export function onResize(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// World pixels to UI pixels. The canvas sits at the window's origin, so the
// two spaces share it and differ only by the two scales.
export function toUi(x, y) {
  const k = view.worldScale / view.uiScale;
  return { x: x * k, y: y * k };
}

// Browser client pixels to UI pixels.
export function clientToUi(clientX, clientY) {
  const r = ui.getBoundingClientRect();
  return { x: (clientX - r.left) / view.uiScale, y: (clientY - r.top) / view.uiScale };
}
