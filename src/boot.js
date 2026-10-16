// The loading shell (docs/23, step 1). index.html shows the screen before any
// script runs; this runs boot as a plan of named, weighted stages, moves the bar
// and the line, names the stage and the file when one fails, and records each
// stage's milliseconds on window.__boot. `?boot` in the URL keeps the screen up
// with the timings until a click. The same screen is the crash screen (23a, A1).

// A page without the loading screen (the tools import assets.js, which imports
// this) gets a shell that draws nothing: every element below may be null.
const root = typeof document === "undefined" ? null : document.getElementById("loading"); // no document at all under Node (tools/world.js)
const q = (sel) => (root ? root.querySelector(sel) : null);
const fill = q(".fill");
const line = q(".line");
const errorBox = q(".error");
const errorMsg = errorBox ? errorBox.querySelector(".msg") : null;
if (errorBox) errorBox.querySelector("button").addEventListener("click", () => window.location.reload());

export const timings = {};

// The next animation frame, so the bar paints between slices of work. A hidden
// tab gets no frames, so a short timer stands in: boot never waits on a frame
// that is not coming (measured 2026-10-12: 7 s of stalls in a backgrounded pane).
export function nextFrame() {
  // Hidden, there is no bar to paint and the browser throttles timers to one a
  // second (16 outfits took 7.9 s that way): no wait at all.
  if (typeof document === "undefined" || document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 40);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// Run `fn` over `items` with at most `limit` in flight (the server's queue is
// 128; a dozen keeps well under it with each item's own fan-out), calling
// `onEach` as each finishes. Results in the items' order.
export async function inBatches(items, fn, limit = 12, onEach = null) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
      if (onEach) onEach(results[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function show(label, fraction) {
  if (!root) return;
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
  line.textContent = `${label}…`;
}

function fail(stage, err) {
  if (!root) return;
  root.hidden = false; // the site may be up in front of a boot still running (#111): a failure always shows
  errorMsg.textContent = `Failed while ${stage.label.toLowerCase()} (stage "${stage.name}"): ${err.message}`;
  errorBox.hidden = false;
  line.textContent = "";
}

// Stages: [{ name, label, weight, run(progress) }], run in order; `progress(0..1)`
// moves the bar within the stage. A throw stops the plan, shows the stage and the
// error, and is rethrown for the console.
export async function run(stages) {
  const total = stages.reduce((n, s) => n + s.weight, 0);
  let done = 0;
  const t0 = performance.now();
  for (const s of stages) {
    show(s.label, done / total);
    await nextFrame();
    const t = performance.now();
    try {
      await s.run((f) => show(s.label, (done + s.weight * Math.max(0, Math.min(1, f))) / total));
    } catch (err) {
      fail(s, err);
      throw err;
    }
    timings[s.name] = +(performance.now() - t).toFixed(1);
    done += s.weight;
    show(s.label, done / total);
  }
  timings.total = +(performance.now() - t0).toFixed(1);
  window.__boot = { timings, stages: stages.map((s) => s.name) };
}

// The game is up: hide the screen, or, with `?boot`, show the timings until a click.
export async function finish() {
  if (!root) return;
  if (new URLSearchParams(window.location.search).has("boot")) {
    const parts = Object.entries(timings).filter(([k]) => k !== "total").map(([k, v]) => `${k} ${v}`);
    line.textContent = `Booted in ${timings.total} ms: ${parts.join(", ")}\nClick to continue.`;
    await new Promise((resolve) => root.addEventListener("click", resolve, { once: true }));
  }
  root.hidden = true;
  if (sub && !worldOn) sub.textContent = subText;
}

// ---- the same screen for entering and leaving a world (docs/38, #107) ----
// `worldBegin(title)` shows it with the title under the name ("Reading Ashford", "Joining oak-abc") and, given a
// `cancel`, a Cancel button; `worldStage(label, fraction)` moves the bar and the line; `worldEnd()` hides it once it
// has been up half a second, so it never flickers. A hidden tab shows nothing and waits for nothing.
const sub = q(".sub");
const subText = sub ? sub.textContent : "";
let worldShownAt = 0;
let worldOn = false;
let cancelBtn = null;

export function worldBegin(title, { cancel = null } = {}) {
  if (!root) return;
  worldOn = true;
  worldShownAt = performance.now();
  if (sub) sub.textContent = title;
  if (errorBox) errorBox.hidden = true;
  if (!cancelBtn) {
    cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "cancel";
    cancelBtn.textContent = "Cancel";
    q(".box").appendChild(cancelBtn);
  }
  cancelBtn.hidden = !cancel;
  cancelBtn.onclick = cancel;
  show(title, 0);
  root.hidden = false;
}

export function worldStage(label, fraction) {
  if (worldOn) show(label, fraction);
}

export function worldShowing() {
  return worldOn;
}

// Hidden at once: a screen of the game's own takes its place (the host asking which identity to join as).
export function worldHide() {
  if (!root || !worldOn) return;
  worldOn = false;
  root.hidden = true;
  if (sub) sub.textContent = subText;
}

export async function worldEnd() {
  if (!root || !worldOn) return;
  const left = 500 - (performance.now() - worldShownAt);
  if (left > 0 && !document.hidden) await new Promise((r) => setTimeout(r, left));
  worldHide();
}

// The game stopped (an exception in the loop, 23a A1): the screen comes back with the message.
export function crash(err) {
  if (!root) return;
  errorMsg.textContent = `The game stopped: ${err && err.message ? err.message : err}`;
  errorBox.hidden = false;
  line.textContent = "";
  fill.style.width = "100%";
  root.hidden = false;
}
