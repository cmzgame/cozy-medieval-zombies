// The small-text scan (#321, hardened by #324): reads style.css and the scripts under src/ as text and finds every size at or under the threshold
// (src/ui/small-text.js, SMALL_TEXT_MAX_PX) that is not set in the clear sans-serif (`--font-small`), every absolute size above it whose rule names
// no face of its own (it would inherit a small container's), and every font size the scan cannot classify, so a new form fails until it is taught.
// `tools/check.js` runs it on the real files and on planted snippets ("small text"); the page's computed fonts are `check("smalltext")`'s, in the pane.
// It never throws: anything that would (a size nested thousands deep) is an unclassified failure named by its file and line. A quote the line
// does not close, in the stylesheet, fails by its line too, rather than hiding the rest of the file.
//
// The stylesheet, rule by rule, its blocks read with strings and parentheses respected (so `content: "}"` hides nothing): a rule inside an at-rule
// (@media, @supports ...) is its own; a rule nested inside another rule (native CSS nesting) fails, named by its line, since the scan does not
// read nesting (style.css does not nest).
// - The size is the rule's last `font-size` or `font:` (an `!important` one first), as the cascade reads it; every one of them is classified, and
//   one the scan cannot classify fails. Absolute: px, pt, pc, in, cm, mm, Q, rem (16 px), and the keywords (xx-small 9 px ... xx-large 32, initial
//   16). A size of 0 (`0`, `0px`) shows no text and asks nothing. Relative to the parent: an em or a percent under 1 and `smaller` count as small
//   whatever the parent is (a 0.9em in a 20 px heading is 18 px and is asked for the small font anyway), one at or over 1 and `larger` inherit the
//   parent's face; `inherit`, `unset`, `revert` likewise.
//   The functions (calc, min, max, clamp) and var() are read as a range: a length in a fluid or relative unit (vw, vh, em, % ...) is anything
//   from 0 up; a range wholly at or under the threshold is small, wholly over it is big, and one that straddles it fails. A range over the
//   threshold that a fluid term took part in counts as the parent's face, like a big em, and need not name one: a choice, kept from #323. A
//   viewport size does not scale with its parent, so strictly it is an absolute size of its own and could inherit a small container's face; but
//   the fluid sizes in the game are the wordmark's (`.wm-small`, `.wm-big`, clamp()s from 24 and 58 px up), whose face is named by the class they
//   share (`.wm-line`, the titles' face), and they pass by this rule. A fluid size inside a small container would show in `check("smalltext")`.
//   var(--x) reads every `--x:` the stylesheet declares (and the fallback), the range of them all. A bare fluid size (`1vw`) fails.
// - The shorthand: `font: [style] [variant] [weight] [stretch] size[/line-height] family`, its prefix words skipped (the stretch keywords too),
//   its family the rest; `font: inherit` sets the family to inherited; a system font (`font: menu`) fails.
// - The face is the rule's last `font-family` or the shorthand's family. Small: it starts with var(--font-small). Exempt, at any size: a monospace
//   face first (ui-monospace, monospace, Consolas, Courier New, Menlo, Monaco; the debug corner, codes) or the titles' (Pirata One, var(--font-title)).
//   A mention elsewhere in the rule (a custom property, `content:`) is no face.
//
// The scripts, after their comments are blanked (a small lexer: strings, templates, regular expressions), at each place a size is written:
// - `X.style.fontSize = v`, `X.style["font-size"] = v`, `X.style.setProperty("font-size", v)`, `Object.assign(X.style, { fontSize: v })`:
//   a literal v is classified as the stylesheet's are (a big one passes, `h.style.fontSize = "28px"`; clearing it, `""` or null, passes as
//   removeProperty does); any other needs the small family set on the same element X (its fontFamily, setProperty("font-family"), or the same
//   Object.assign's fontFamily) within two lines, as SMALL_FONT_VAR, smallFamily(), or var(--font-small); a monospace family on X counts only on
//   the sizing line itself.
// - Any other object key `fontSize:` or `"font-size":` (after a `{` or a `,`) needs the small (or a monospace) family in the same object literal;
//   one in a destructuring pattern (`const { fontSize } = getComputedStyle(el)`) is a read.
// - `font-size:` or `font:` inside a string or template (an inline style, cssText): its own declaration block names the small family (the
//   block's font-family: or the shorthand's), or monospace as that family; the block is the `style="..."` attribute round it, or the whole
//   string when it is in none (cssText). A family in another attribute or element, or "monospace" in the text, is no face. A big literal passes.
// - `X.font = v` (a canvas's `ctx.font`), `X.style.font = v`, an object key `font:`, `setProperty("font", v)`: the small family or monospace in
//   the same expression, or a literal big size; a bare variable fails. A canvas cannot resolve a CSS variable, so for a `.font` that is not on a
//   style the small family is smallFamily() alone (SMALL_FONT_VAR or var(--font-small) there would draw in the canvas's default font).
// - Anything else that writes a font size (`s.fontSize = ...` through an alias of a style, a quoted "fontSize" or "font-size" the forms above do
//   not consume) fails as unclassified. Reading one (`getComputedStyle(el).fontSize`, `getPropertyValue("font-size")`) is not writing it.

const KEYWORD_PX = { "xx-small": 9, "x-small": 10, small: 13, medium: 16, large: 18, "x-large": 24, "xx-large": 32, initial: 16 };
const ABS_PX = { px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, rem: 16 };
const REL_UNIT = /^(?:em|%|ex|ch|cap|ic|lh|rlh|r?ex|r?ch|vw|vh|vi|vb|vmin|vmax|[sld]v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))$/;
const STRETCH = "ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded";
const PREFIX = new RegExp(`^(?:normal|italic|oblique|small-caps|bold|bolder|lighter|${STRETCH}|-?[\\d.]+deg|\\d{1,4})$`, "i");
const GLOBAL = /^(?:inherit|unset|revert|revert-layer)$/i;
const SYSTEM_FONT = /^(?:caption|icon|menu|message-box|small-caption|status-bar)$/i;

// Split at top-level separators (outside parentheses and quotes).
function splitTop(s, sep) {
  const out = [];
  let depth = 0, q = null, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && (sep === " " ? /\s/.test(c) : c === sep)) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map((t) => t.trim()).filter((t) => t !== "");
}

// A size expression as a px range { lo, hi, rel } (rel: a fluid or relative term took part), or null when it cannot be read.
function rangeOf(expr, vars, depth = 0) {
  if (depth > 8) return null;
  const toks = expr.match(/-?[\d.]+(?:e-?\d+)?[a-z%]*|[a-z-]+\(|--[\w-]+|[()+\-*/,]|\S/gi) || [];
  let p = 0;
  const peek = () => toks[p];
  const num = (t) => /^-?[\d.]/.test(t);
  const args = () => {
    const list = [];
    for (;;) {
      const v = sum();
      if (!v) return null;
      list.push(v);
      if (peek() === ",") { p++; continue; }
      if (peek() === ")") { p++; return list; }
      return null;
    }
  };
  function atom() {
    const t = toks[p++];
    if (t === undefined) return null;
    if (t === "(") { const v = sum(); if (toks[p++] !== ")") return null; return v; }
    if (t === "-") { const v = atom(); return v && v.scalar ? { ...v, lo: -v.hi, hi: -v.lo } : null; }
    if (num(t)) {
      const m = t.match(/^(-?[\d.]+(?:e-?\d+)?)([a-z%]*)$/i);
      if (!m) return null;
      const n = Number(m[1]), u = m[2].toLowerCase();
      if (u === "") return { lo: n, hi: n, scalar: true };
      if (u in ABS_PX) return { lo: n * ABS_PX[u], hi: n * ABS_PX[u] };
      if (REL_UNIT.test(u)) return { lo: 0, hi: Infinity, rel: true };
      return null;
    }
    const fn = t.toLowerCase();
    if (fn === "calc(") { const v = sum(); return toks[p++] === ")" ? v : null; }
    if (fn === "min(" || fn === "max(" || fn === "clamp(") {
      const a = args();
      if (!a || a.some((v) => v.scalar)) return null;
      const rel = a.some((v) => v.rel);
      const mn = (x, y) => ({ lo: Math.min(x.lo, y.lo), hi: Math.min(x.hi, y.hi) });
      const mx = (x, y) => ({ lo: Math.max(x.lo, y.lo), hi: Math.max(x.hi, y.hi) });
      let r;
      if (fn === "min(") r = a.reduce(mn);
      else if (fn === "max(") r = a.reduce(mx);
      else if (a.length === 3) r = mx(a[0], mn(a[1], a[2]));
      else return null;
      return { ...r, rel };
    }
    if (fn === "var(") {
      const name = toks[p++];
      if (!/^--/.test(name || "")) return null;
      let fallback = null;
      if (peek() === ",") {
        p++;
        const from = p;
        let d = 0;
        while (p < toks.length && !(d === 0 && toks[p] === ")")) { if (/\($/.test(toks[p])) d++; else if (toks[p] === ")") d--; p++; }
        fallback = toks.slice(from, p).join(" ");
      }
      if (toks[p++] !== ")") return null;
      const values = [...(vars[name] || []), ...(fallback ? [fallback] : [])];
      if (values.length === 0) return null;
      const rs = values.map((v) => rangeOf(v, vars, depth + 1));
      if (rs.some((r) => !r || r.scalar)) return null;
      return { lo: Math.min(...rs.map((r) => r.lo)), hi: Math.max(...rs.map((r) => r.hi)), rel: rs.some((r) => r.rel) };
    }
    return null;
  }
  function product() {
    let v = atom();
    while (v && (peek() === "*" || peek() === "/")) {
      const op = toks[p++];
      const w = atom();
      if (!w) return null;
      if (op === "*" && (v.scalar || w.scalar)) {
        const [k, x] = v.scalar ? [v, w] : [w, v];
        if (k.lo !== k.hi || k.lo < 0) return null;
        v = { lo: x.lo * k.lo, hi: x.hi * k.lo, rel: x.rel, scalar: x.scalar };
      } else if (op === "/" && w.scalar && w.lo === w.hi && w.lo > 0) v = { lo: v.lo / w.lo, hi: v.hi / w.lo, rel: v.rel, scalar: v.scalar };
      else return null;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (v && (peek() === "+" || peek() === "-")) {
      const op = toks[p++];
      const w = product();
      if (!w || !!w.scalar !== !!v.scalar) return null;
      v = op === "+" ? { lo: v.lo + w.lo, hi: v.hi + w.hi, rel: v.rel || w.rel, scalar: v.scalar } : { lo: v.lo - w.hi, hi: v.hi - w.lo, rel: v.rel || w.rel, scalar: v.scalar };
    }
    return v;
  }
  const v = sum();
  return v && p === toks.length && !v.scalar ? v : null;
}

// One size value: "small", "big" (absolute, over the threshold: its rule must name a face), "rel" (over it but relative or fluid, or inherited:
// the parent's face), "zero" (no text shows), or null (the scan cannot classify it).
export function sizeOf(value, max, vars = {}) {
  const v = value.replace(/!\s*important\s*$/i, "").trim().toLowerCase();
  if (/^0*\.?0+(?:px|rem|em|pt|%)?$/.test(v)) return "zero"; // no text shows: hiding it, the inline-block gap
  if (v in KEYWORD_PX) return KEYWORD_PX[v] <= max ? "small" : "big";
  if (v === "smaller") return "small";
  if (v === "larger" || GLOBAL.test(v)) return "rel";
  const m = v.match(/^([\d.]+)(em|%)$/);
  if (m) return (m[2] === "%" ? Number(m[1]) / 100 : Number(m[1])) < 1 ? "small" : "rel";
  if (/^[\d.]+[a-z]+$/.test(v) && !(v.replace(/^[\d.]+/, "") in ABS_PX)) return null; // a bare fluid size (1vw), or a unit the scan does not know
  const r = rangeOf(v, vars);
  if (!r) return null;
  if (r.hi === 0) return "zero";
  if (r.hi <= max) return "small";
  if (r.lo > max) return r.rel ? "rel" : "big";
  return null; // straddles the threshold
}

// The shorthand's size and family: { size, family } (family "inherit" for a global keyword), or null when it cannot be read.
export function shorthandOf(value) {
  const v = value.replace(/!\s*important\s*$/i, "").trim();
  if (GLOBAL.test(v) || /^initial$/i.test(v)) return { size: v.toLowerCase(), family: "inherit" };
  if (SYSTEM_FONT.test(v) || /^var\(/i.test(v)) return null;
  const toks = splitTop(v, " ");
  let i = 0;
  while (i < toks.length && PREFIX.test(toks[i]) && i < toks.length - 2) i++;
  if (i >= toks.length) return null;
  let size = toks[i++];
  if (size.includes("/")) size = splitTop(size, "/")[0];
  else if (toks[i] === "/") i += 2;
  else if (toks[i] && toks[i].startsWith("/")) i++;
  const family = toks.slice(i).join(" ");
  return family ? { size, family } : null;
}

// A face: "small", "exempt" (monospace, the titles), "none" (inherited), or "other" (a face of its own).
export function faceOf(family) {
  const f = family.replace(/!\s*important\s*$/i, "").trim();
  if (/^var\(\s*--font-small\s*[,)]/i.test(f)) return "small";
  if (GLOBAL.test(f) || /^initial$/i.test(f)) return "none";
  const first = (splitTop(f, ",")[0] || "").replace(/^["']|["']$/g, "").trim().toLowerCase();
  if (/^(?:ui-monospace|monospace|consolas|courier new|menlo|monaco)$/.test(first) || /^var\(\s*--font-mono\b/.test(first)) return "exempt";
  if (first === "pirata one" || /^var\(\s*--font-title\b/.test(first)) return "exempt";
  return "other";
}

const lineAt = (text) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  const at = (idx) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  at.start = (n) => starts[n - 1]; // where line n begins
  return at;
};

export function scanCss(cssText, max, file = "style.css") {
  const line = lineAt(cssText);
  const rules = [];
  const bad = [], bigNoFace = [], unknown = [];
  // The comments blanked (lengths and lines kept), quotes respected (`content: "/*"` opens no comment). A quote the line does not close ends
  // there, as a browser ends a bad string, and fails by its line rather than hiding the rest of the file.
  const chars = cssText.split("");
  for (let i = 0, q = null, qAt = 0; i <= chars.length; i++) {
    const c = chars[i];
    if (q) {
      if (c === "\\") i++;
      else if (c === q) q = null;
      else if (c === "\n" || c === undefined) { unknown.push(`${file}:${line(qAt)} (an unclosed quote: the line ends inside it)`); q = null; }
      continue;
    }
    if (c === '"' || c === "'") { q = c; qAt = i; }
    else if (c === "/" && chars[i + 1] === "*") {
      const e = cssText.indexOf("*/", i + 2);
      const end = e < 0 ? chars.length : e + 2;
      for (let k = i; k < end; k++) if (chars[k] !== "\n") chars[k] = " ";
      i = end - 1;
    }
  }
  const css = chars.join("");
  // The blocks, one walk: `{` opens a block whose selector is the text since the last boundary, `;` ends a declaration, `}` closes; quotes and
  // parentheses are respected (a `;` in url(data:...), a `}` in content:).
  const stack = [{ sel: "", at: true, decls: [] }];
  let depth = 0, q = null, start = 0;
  const declAt = (frame, a, b) => {
    const d = css.slice(a, b);
    const k = d.indexOf(":");
    if (k > 0 && d.trim()) frame.decls.push({ prop: d.slice(0, k).trim().toLowerCase(), value: d.slice(k + 1).trim(), at: line(a + d.search(/\S/)) });
  };
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (q) { if (c === "\\") i++; else if (c === q || c === "\n") q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (depth > 0) continue;
    else if (c === ";") { declAt(stack[stack.length - 1], start, i); start = i + 1; }
    else if (c === "{") {
      const raw = css.slice(start, i);
      const sel = raw.trim().replace(/\s+/g, " ");
      const parent = stack[stack.length - 1];
      const at = line(start + Math.max(0, raw.search(/\S/)));
      if (!parent.at) unknown.push(`${file}:${at} ${sel} (a rule nested inside ${parent.sel}: the scan does not read CSS nesting)`);
      stack.push({ sel, at: sel.startsWith("@"), decls: [], line: at });
      start = i + 1;
    } else if (c === "}") {
      const frame = stack.length > 1 ? stack.pop() : stack[0];
      declAt(frame, start, i);
      if (frame !== stack[0]) rules.push({ sel: frame.sel, decls: frame.decls, line: frame.line });
      start = i + 1;
    }
  }
  const vars = {};
  for (const r of rules) for (const d of r.decls) if (d.prop.startsWith("--")) (vars[d.prop] ||= []).push(d.value);
  let small = 0;
  const last = (list) => list.filter((d) => /!\s*important\s*$/i.test(d.value)).pop() || list[list.length - 1];
  for (const { sel, decls, line: ruleLine } of rules) {
    try {
      classifyRule(sel, decls);
    } catch (e) {
      unknown.push(`${file}:${ruleLine} ${sel} (the scan threw: ${e.message})`); // never a crash: a named failure
    }
  }
  function classifyRule(sel, decls) {
    const sizes = [], faces = [];
    for (const d of decls) {
      if (d.prop === "font-size") {
        const kind = sizeOf(d.value, max, vars);
        if (kind === null) unknown.push(`${file}:${d.at} ${sel} (font-size: ${d.value})`);
        sizes.push({ ...d, kind });
      } else if (d.prop === "font") {
        const sh = shorthandOf(d.value);
        const kind = sh ? sizeOf(sh.size, max, vars) : null;
        if (kind === null) { unknown.push(`${file}:${d.at} ${sel} (font: ${d.value})`); continue; }
        sizes.push({ ...d, kind });
        faces.push({ ...d, face: faceOf(sh.family) });
      } else if (d.prop === "font-family") faces.push({ ...d, face: faceOf(d.value) });
    }
    if (sizes.length === 0) return;
    const size = last(sizes);
    const face = faces.length ? last(faces).face : "none";
    if (size.kind === "small") {
      small++;
      if (face !== "small" && face !== "exempt") bad.push(`${file}:${size.at} ${sel}`);
    } else if (size.kind === "big" && face === "none") bigNoFace.push(`${file}:${size.at} ${sel}`);
  }
  return { small, bad, bigNoFace, unknown };
}

// The scripts' lexer: the text with its comments blanked (lengths and lines kept), the ranges of its strings and templates (a template whole,
// its ${} parts inside it), and the ranges of literal text alone (a quoted string, a template's text between its ${} parts, a regular expression).
export function lexJs(src) {
  const code = src.split("");
  const strings = [];
  const text = [];
  const open = []; // the templates whose ${} we are inside: { start, depth }
  const KW = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do", "yield", "await", "instanceof"]);
  let depth = 0, i = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (code[k] !== "\n") code[k] = " "; };
  const regexHere = () => {
    let k = i - 1;
    while (k >= 0 && /\s/.test(code[k])) k--;
    if (k < 0) return true;
    if (/[\w$]/.test(code[k])) { let s = k; while (s > 0 && /[\w$]/.test(code[s - 1])) s--; return KW.has(src.slice(s, k + 1)) && code[s - 1] !== "."; } // `x.in / 2` divides
    return !/[)\]"'`]/.test(code[k]);
  };
  const template = (start) => {
    const seg = i - 1; // the opening backtick, or the } that closed a ${}
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { i++; strings.push([start, i]); text.push([seg, i]); return; }
      if (c === "$" && src[i + 1] === "{") { open.push({ start, depth }); depth++; i += 2; text.push([seg, i]); return; }
      i++;
    }
    text.push([seg, src.length]);
  };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "/" && n === "/") { const e = src.indexOf("\n", i); const end = e < 0 ? src.length : e; blank(i, end); i = end; continue; }
    if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); const end = e < 0 ? src.length : e + 2; blank(i, end); i = end; continue; }
    if (c === "'" || c === '"') {
      const s = i++;
      while (i < src.length && src[i] !== c && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      i++;
      strings.push([s, i]);
      text.push([s, i]);
      continue;
    }
    if (c === "`") { const s = i++; template(s); continue; }
    if (c === "/" && regexHere()) {
      const r0 = i++;
      let cls = false;
      while (i < src.length && src[i] !== "\n") {
        const d = src[i];
        if (d === "\\") { i += 2; continue; }
        if (d === "[") cls = true;
        else if (d === "]") cls = false;
        else if (d === "/" && !cls) break;
        i++;
      }
      i++;
      text.push([r0, Math.min(i, src.length)]); // a regular expression is literal text too: its braces are no object's
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      const t = open[open.length - 1];
      if (t && t.depth === depth) { open.pop(); i++; template(t.start); continue; }
    }
    i++;
  }
  return { code: code.join(""), strings, text };
}

const SMALL_JS = /\bSMALL_FONT_VAR\b|\bsmallFamily\s*\(|var\(\s*--font-small\s*\)/;
const MONO_JS = /monospace|Consolas/i;
// An inline declaration and its value: quoted runs (a 'Courier New' inside a double-quoted attribute) and escapes kept whole.
const DECL = /(?<![\w-])(font-size|font-family|font)\s*:\s*((?:\\.|[^;"'`\\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*)/g;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function scanJs(files, max) {
  const badJs = [], unknown = [];
  let sites = 0;
  for (const [name, src] of files) {
    let cur = 0, lineOf = null; // where the scan is, for a throw's file:line
    try {
    const { code, strings, text } = lexJs(src);
    const line = lineAt(code);
    lineOf = line;
    const lines = code.split("\n");
    const used = new Set(); // the indices a form has consumed
    const reads = new Set(); // the indices that are no write (a ternary's arm, a label, a destructuring)
    const inText = new Uint8Array(code.length + 1); // 1 on literal text: a quoted string, a template's text (its ${} braces too), never its ${} code
    for (const [a, b] of text) inText.fill(1, a, b);
    const stringAt = (idx) => {
      // the innermost string or template round idx (called once per match, never per character)
      let best = null;
      for (const r of strings) if (r[0] <= idx && idx < r[1] && (!best || r[1] - r[0] < best[1] - best[0])) best = r;
      return best;
    };
    const literal = (v) => {
      const m = v.trim().match(/^(["'`])([^"'`$]*)\1$/);
      return m ? m[2] : null;
    };
    const reset = (v) => /^(?:(["'`])\1|null|undefined)$/.test(v.trim()); // clearing an inline size, as removeProperty does
    const prevChar = (idx) => {
      let k = idx - 1;
      while (k >= 0 && /\s/.test(code[k])) k--;
      return k >= 0 ? code[k] : "";
    };
    const objectAt = (idx) => {
      // the object literal round idx, from its `{` to its `}`: one walk each way, literal text skipped
      let d = 0, a = idx - 1;
      for (; a >= 0; a--) {
        if (inText[a]) continue;
        if (code[a] === "}") d++;
        else if (code[a] === "{") { if (d === 0) break; d--; }
      }
      if (a < 0) return null;
      let b = idx;
      for (d = 0; b < code.length; b++) {
        if (inText[b]) continue;
        if (code[b] === "{") d++;
        else if (code[b] === "}") { if (d === 0) break; d--; }
      }
      return b < code.length ? [a, b + 1] : null;
    };
    const isPattern = (o) => {
      // a destructuring (a read, not a style object): the object, or one it is nested in, is followed by `=`, `of`, or `in`
      for (let k = 0; o && k < 8; k++) {
        const after = code.slice(o[1], o[1] + 8);
        if (/^\s*(?:=(?![=>])|of\b|in\b)/.test(after)) return true;
        if (!/^\s*[},]/.test(after)) return false;
        o = objectAt(o[0]);
      }
      return false;
    };
    const sizeNeedsFace = (v) => {
      // "ok" (a big literal, zero, a reset), "needs" (small, or not a literal: the small face must be there), "number", or "unknown"
      if (reset(v)) return "ok";
      if (/^\s*[\d.]+\s*$/.test(v)) return "number";
      const lit = literal(v);
      if (lit === null) return "needs";
      const kind = sizeOf(lit, max);
      return kind === null ? "unknown" : kind === "small" ? "needs" : "ok";
    };
    const NUMBER = "a bare number, no unit (a data key, or a size the browser ignores): rename the key, or write the size with its unit";
    const faceOnElement = (recv, at) => {
      const l = line(at);
      const R = `(?<![\\w$.])${esc(recv)}\\.style`;
      const forms = [
        new RegExp(`${R}\\s*(?:\\.fontFamily|\\[\\s*["'\`](?:fontFamily|font-family)["'\`]\\s*\\])\\s*=(?!=)\\s*([^;\\n]*)`, "g"),
        new RegExp(`${R}\\.setProperty\\(\\s*["'\`]font-family["'\`]\\s*,\\s*([^;\\n]*)`, "g"),
      ];
      for (let k = Math.max(1, l - 2); k <= Math.min(lines.length, l + 2); k++) {
        const ln = lines[k - 1];
        for (const re of forms) for (const m of ln.matchAll(re)) if (SMALL_JS.test(m[1]) || (k === l && MONO_JS.test(m[1]))) return true;
        for (const m of ln.matchAll(new RegExp(`Object\\.assign\\(\\s*${esc(recv)}\\.style\\s*,`, "g"))) {
          const o = objectAt(code.indexOf("{", line.start(k) + m.index) + 1);
          const body = o ? code.slice(o[0], o[1]) : "";
          const fam = body.match(/(?:fontFamily|["'`]font-family["'`])\s*:\s*([^,}\n]*)/);
          if (fam && (SMALL_JS.test(fam[1]) || (k === l && MONO_JS.test(fam[1])))) return true;
        }
      }
      return false;
    };
    const report = (list, idx, what) => list.push(`${name}:${line(idx)} (${what})`);
    // 1. Writes on an element's style.
    const RECV = "([\\w$][\\w$.]*(?:\\[[^\\]\\n]*\\])*(?:\\.[\\w$]+)*)";
    for (const m of code.matchAll(new RegExp(`${RECV}\\.style\\s*(?:\\.fontSize\\b|\\[\\s*(["'\`])(?:fontSize|font-size)\\2\\s*\\])\\s*=(?!=)\\s*([^;\\n]*)`, "g"))) {
      cur = m.index;
      if (inText[m.index]) continue;
      used.add(m.index + m[0].search(/fontSize|font-size/));
      const need = sizeNeedsFace(m[3]);
      if (need === "unknown") report(unknown, m.index, `style.fontSize = ${m[3].trim()}`);
      else if (need === "number") report(unknown, m.index, `style.fontSize = ${m[3].trim()}: ${NUMBER}`);
      else if (need === "needs" && !faceOnElement(m[1], m.index)) report(badJs, m.index, `${m[1]}.style.fontSize without the small family on ${m[1]}`);
    }
    for (const m of code.matchAll(new RegExp(`${RECV}\\.style\\.setProperty\\(\\s*(["'\`])(font-size|font)\\2\\s*,\\s*([^;\\n]*)`, "g"))) {
      cur = m.index;
      if (inText[m.index]) continue;
      m[4] = m[4].replace(/\)\s*$/, ""); // the call's own parenthesis
      used.add(m.index + m[0].indexOf(m[3], m[0].indexOf("setProperty")));
      if (m[3] === "font") {
        if (!(SMALL_JS.test(m[4]) || MONO_JS.test(m[4]) || bigFont(m[4]) || reset(m[4]))) report(badJs, m.index, `setProperty("font") without the small family`);
        continue;
      }
      const need = sizeNeedsFace(m[4]);
      if (need === "unknown" || need === "number") report(unknown, m.index, `setProperty("font-size", ${m[4].trim()})${need === "number" ? `: ${NUMBER}` : ""}`);
      else if (need === "needs" && !faceOnElement(m[1], m.index)) report(badJs, m.index, `${m[1]}.style.setProperty("font-size") without the small family on ${m[1]}`);
    }
    // 2. Object keys: fontSize, "font-size" (an Object.assign onto a style, or any other style object), after a `{` or a `,`.
    for (const m of code.matchAll(/(?:(?<![\w$.])fontSize|(["'`])font-size\1)\s*:(?!:)\s*([^,}\n]*)/g)) {
      cur = m.index;
      if (m[1] === undefined ? inText[m.index] : (stringAt(m.index) || [])[0] !== m.index) continue; // inside a string: an inline style's, below
      const key = m.index + (m[1] ? 1 : 0);
      if (!/[{,]/.test(prevChar(m.index))) { reads.add(key); continue; } // `big ? fontSize : 0`, a label: no key
      const o = objectAt(m.index);
      if (o && isPattern(o)) { reads.add(key); continue; } // `const { fontSize: fs } = getComputedStyle(el)`: a read
      used.add(key);
      const need = sizeNeedsFace(m[2]);
      if (need === "unknown") { report(unknown, m.index, `fontSize: ${m[2].trim()}`); continue; }
      if (need === "number") { report(unknown, m.index, `a fontSize key holding ${m[2].trim()}: ${NUMBER}`); continue; }
      if (need === "ok") continue;
      const body = o ? code.slice(o[0], o[1]) : "";
      const fam = body.match(/(?:fontFamily|["'`]font-family["'`])\s*:\s*([^,}\n]*)/);
      if (fam && (SMALL_JS.test(fam[1]) || MONO_JS.test(fam[1]))) continue;
      const before = o ? code.slice(Math.max(0, o[0] - 200), o[0]) : "";
      const assign = before.match(new RegExp(`Object\\.assign\\(\\s*${RECV}\\.style\\s*,\\s*$`));
      if (assign && faceOnElement(assign[1], m.index)) continue;
      report(badJs, m.index, "a fontSize key without the small family in its object");
    }
    // 3. An inline style in a string or template: font-size: or font:, its face read from its own declaration block.
    const asCss = (v) => v.replace(/\$\{\s*(?:SMALL_FONT_VAR|smallFamily\(\s*\))\s*\}/g, "var(--font-small)");
    const unesc = (v) => v.replace(/\\(.)/g, "$1"); // `\'Courier New\'` in a single-quoted string is 'Courier New'
    const blockAt = (s, at) => {
      // the style="..." attribute round `at` (its text between the quotes, ${} parts skipped over), or the whole string when it is in none
      let open = null;
      for (const m of s.slice(0, at).matchAll(/\bstyle\s*=\s*(\\?["'])/gi)) open = m;
      if (open) {
        const qc = open[1];
        let k = open.index + open[0].length, d = 0;
        for (; k < s.length; k++) {
          if (s[k] === "$" && s[k + 1] === "{") { d++; k++; }
          else if (d > 0) { if (s[k] === "{") d++; else if (s[k] === "}") d--; }
          else if (s.startsWith(qc, k)) break;
        }
        const from = open.index + open[0].length;
        if (at < k) return { text: s.slice(from, k), off: from };
      }
      return { text: s.slice(1, -1), off: 1 }; // the string's own delimiters off
    };
    const blockFace = (block) => {
      // the block's last family, from font-family: or a font: shorthand: "small", "exempt", "other", or "none"
      let face = "none";
      for (const m of block.matchAll(DECL)) {
        const v = asCss(unesc(m[2]));
        if (m[1] === "font-family") face = faceOf(v);
        else if (m[1] === "font") { const sh = shorthandOf(v); if (sh) face = faceOf(sh.family); }
      }
      return face;
    };
    for (const [a, b] of strings) {
      const s = code.slice(a, b);
      for (const m of s.matchAll(/(?<![\w-])(font-size|font)\s*:/g)) {
        const at = a + m.index;
        cur = at;
        if (!inText[at] || stringAt(at)[0] !== a) continue; // in a ${} part, or a string inside it: its own turn
        used.add(at);
        const block = blockAt(s, m.index);
        const sticky = new RegExp(DECL.source, "y");
        sticky.lastIndex = m.index - block.off;
        const d = sticky.exec(block.text);
        if (!d) { report(unknown, at, "an inline font size the scan cannot read"); continue; }
        const value = asCss(unesc(d[2])).trim();
        const face = blockFace(block.text);
        const sameFace = face === "small" || face === "exempt";
        if (m[1] === "font") {
          const sh = shorthandOf(value);
          const kind = sh && !/\$\{/.test(sh.size) ? sizeOf(sh.size, max) : "small";
          if (kind === "big" || kind === "rel" || kind === "zero" || sameFace) continue;
          if (kind === null) report(unknown, at, `an inline font: ${value}`);
          else report(badJs, at, "an inline font: without the small family in its own style");
          continue;
        }
        const kind = /\$\{/.test(value) ? "small" : sizeOf(value, max);
        if (kind === null) report(unknown, at, `an inline font-size: ${value}`);
        else if (kind === "small" && !sameFace) report(badJs, at, "an inline font-size without the small family in its own style");
      }
    }
    // 4. A font shorthand written from script: X.font = v (a canvas's, or X.style.font), an object key font:.
    function bigFont(v) {
      const lit = literal(v);
      let sh;
      if (lit === null) {
        const t = v.trim().match(/^`([^`]*)`$/); // a template: its literal size, if it opens with one
        if (!t) return false;
        sh = shorthandOf(t[1].replace(/\$\{[^}]*\}/g, "x"));
        if (sh && /\$\{|^x$/.test(sh.size)) return false;
      } else sh = shorthandOf(lit);
      const kind = sh ? sizeOf(sh.size, max) : null;
      return kind === "big" || kind === "rel" || kind === "zero";
    }
    for (const m of code.matchAll(/(?:\.font\s*=(?!=)|(?<![\w$.-])font\s*:(?!:))\s*([^;\n]*)/g)) {
      cur = m.index;
      if (inText[m.index]) continue;
      const assign = m[0].startsWith(".");
      if (!assign && !/[{,]/.test(prevChar(m.index))) continue; // `big ? font : other`, a label: no key
      used.add(m.index);
      const onStyle = assign && /\.style\s*$/.test(code.slice(Math.max(0, m.index - 16), m.index));
      const canvas = assign && !onStyle; // a canvas cannot resolve a CSS variable: smallFamily() alone
      const rhs = assign ? m[1] : m[1].split(/,(?![^(]*\))(?=\s*[\w$"']+\s*:)/)[0];
      const small = canvas ? /\bsmallFamily\s*\(/.test(rhs) : SMALL_JS.test(rhs);
      if (small || MONO_JS.test(rhs) || bigFont(rhs.replace(/[,}\s]+$/, "")) || (onStyle && reset(rhs))) continue;
      const why = canvas && SMALL_JS.test(rhs) ? "a canvas cannot resolve a CSS variable; use smallFamily()" : "without the small family in the same expression";
      report(badJs, m.index, `font = ${rhs.trim()} ${why}`);
    }
    // 5. The guard: anything else that writes a font size.
    for (const m of code.matchAll(/fontSize\b(?=\s*(?:=(?!=)|:(?!:)))|(["'`])(?:fontSize|font-size)\1/g)) {
      cur = m.index;
      const at = m.index + (m[1] ? 1 : 0);
      if (used.has(at) || used.has(m.index) || reads.has(at)) continue;
      if (m[1]) {
        if ((stringAt(m.index) || [])[0] !== m.index) continue; // a word inside a longer string
        const before = code.slice(Math.max(0, m.index - 40), m.index);
        if (/getPropertyValue\(\s*$|removeProperty\(\s*$/.test(before)) continue; // a read, or taking it away
      } else {
        if (inText[m.index]) continue;
        const o = objectAt(m.index);
        if (o && isPattern(o)) continue; // `const { fontSize = 12 } = opts`: a read with a default
      }
      report(unknown, m.index, "a font size written in a form the scan does not classify");
    }
    sites += used.size;
    } catch (e) {
      unknown.push(`${name}:${lineOf ? lineOf(cur) : 1} (the scan threw: ${e.message})`); // never a crash: a named failure
    }
  }
  return { badJs, unknown, sites };
}

export function scanSmallText(cssText, files, max) {
  const css = scanCss(cssText, max);
  const js = scanJs(files, max);
  return { small: css.small, bad: css.bad, bigNoFace: css.bigNoFace, unknown: [...css.unknown, ...js.unknown], badJs: js.badJs, sites: js.sites };
}
