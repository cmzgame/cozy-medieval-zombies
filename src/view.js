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

// Zoom (docs/02, 2026-10-10, late): screen pixels per world pixel, continuous
// between these, eased toward a target so a jumpy wheel still moves smoothly.
// Michael asked for about ten percent off either end of 1× to 3×.
export const ZOOM_MIN = 1.1;
export const ZOOM_MAX = 2.7;
export const ZOOM_STEP = 1.18; // per wheel notch, multiplicative
const ZOOM_EASE = 10; // per second

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
let zoom = 1;
let zoomTarget = 1;
const listeners = new Set();

export function init(canvasEl, uiEl) {
  canvas = canvasEl;
  ui = uiEl;
  window.addEventListener("resize", resize);
  settings.onChange((key) => {
    if (key === "uiScale") resize();
    if (key === "worldScale") {
      zoom = zoomTarget = zoomFromSetting();
      resize();
    }
  });
  zoom = zoomTarget = zoomFromSetting();
  resize();
}

function clampZoom(z) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

function autoWorldScale(ww, wh) {
  return Math.max(1, Math.floor(Math.min(ww / BASE_W, wh / BASE_H)));
}

function zoomFromSetting() {
  const ws = settings.get("worldScale");
  return clampZoom(ws === "auto" ? autoWorldScale(window.innerWidth, window.innerHeight) : Number(ws) || 1);
}

// A UI scale that reads on this window: about 85 percent of what the probe
// size would scale to, in quarter steps, never below 1.
function autoUiScale(ww, wh) {
  const fit = Math.min(ww / BASE_W, wh / BASE_H);
  return Math.max(1, Math.round(fit * 0.85 * 4) / 4);
}

// Nudge the zoom target by whole notches; the easing does the rest.
export function zoomBy(notches) {
  zoomTarget = clampZoom(zoomTarget * Math.pow(ZOOM_STEP, notches));
}

export function zoomTargetValue() {
  return zoomTarget;
}

// Each frame: ease toward the target. When it settles, the zoom is kept in
// the world-scale setting so it comes back next run.
export function update(dt) {
  if (zoom === zoomTarget) return;
  const k = Math.min(1, ZOOM_EASE * dt);
  zoom += (zoomTarget - zoom) * k;
  if (Math.abs(zoomTarget - zoom) < 0.003) {
    zoom = zoomTarget;
    settings.set("worldScale", Math.round(zoom * 100) / 100);
  }
  resize();
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
