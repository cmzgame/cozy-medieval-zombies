// The layer audit (docs/53, section 6.5 and step 0): every call in the simulation of a function whose `layer` argument has a default,
// made without that argument. A defaulted layer reads the ground (or, for `tileAt` and `peekTile`, whatever storey the renderer last
// drew), so a sim read that forgets its layer is right on the ground and wrong upstairs, and nothing complains. The scan finds the
// functions itself (an exported function with a parameter named `layer` whose default is the ground or the drawn storey), then every call of one of them that
// passes fewer arguments than the layer's place. The renderer, the interface, and the figure are excused: they draw the storey they
// are told to. `tools/check.js` compares the result with `tools/layer-audit-allow.json`, which names each call known today with the
// step of docs/53 that gives it its layer, so the list only shrinks.
//   node tools/layer-audit.js          prints every layer-less call, by file
//   node tools/layer-audit.js --json   prints them as an allow list would hold them

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.dirname(here);

// What is not the simulation: drawing, the interface, the figure, art made at boot, and the page's own wiring.
const EXCUSED = [/^src\/render\//, /^src\/ui\//, /^src\/figure\//, /^src\/main\.js$/, /^src\/gl\.js$/, /^src\/render[\w-]*\.js$/,
  /-art\.js$/, /^src\/placeholders\.js$/, /^src\/ground\.js$/, /^src\/sprites\.js$/, /^src\/dev\.js$/];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

// Blank out comments and the insides of strings, keeping every offset, so a scan of the code never sees a comma or a paren in prose.
// Template literals keep their `${ }` code.
export function codeOnly(src) {
  const out = src.split("");
  const n = src.length;
  let i = 0;
  const tpl = []; // brace depth at each open template's `${`
  let depth = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  const regexOk = (k) => { // a `/` here starts a regex if the code before it cannot end an operand
    let j = k - 1;
    while (j >= 0 && /\s/.test(out[j])) j--;
    if (j < 0) return true;
    const c = out[j];
    if (/[\w$)\]]/.test(c)) {
      const m = /([A-Za-z_$][\w$]*)$/.exec(out.slice(Math.max(0, j - 12), j + 1).join(""));
      return !!(m && /^(return|typeof|case|in|of|void|delete|throw|new|else|do)$/.test(m[1]));
    }
    return c !== "}" || true;
  };
  const template = () => { // from just after a backtick (or a closing `}` of `${`) to the end of the template's text
    const a = i;
    while (i < n) {
      if (src[i] === "\\") { i += 2; continue; }
      if (src[i] === "`") { blank(a, i); i++; return; }
      if (src[i] === "$" && src[i + 1] === "{") { blank(a, i); tpl.push(depth); depth++; i += 2; return; }
      i++;
    }
    blank(a, i);
  };
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { const a = i; while (i < n && src[i] !== "\n") i++; blank(a, i); continue; }
    if (c === "/" && src[i + 1] === "*") { const a = i; i = src.indexOf("*/", i + 2); i = i < 0 ? n : i + 2; blank(a, i); continue; }
    if (c === "'" || c === '"') {
      const a = ++i;
      while (i < n && src[i] !== c) { if (src[i] === "\\") i++; i++; }
      blank(a, i); i++; continue;
    }
    if (c === "`") { i++; template(); continue; }
    if (c === "/" && regexOk(i)) {
      const a = ++i;
      let cls = false;
      while (i < n && src[i] !== "\n") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false;
        else if (src[i] === "/" && !cls) break;
        i++;
      }
      blank(a, i); i++; continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (tpl.length && tpl[tpl.length - 1] === depth) { tpl.pop(); i++; template(); continue; }
    }
    i++;
  }
  return out.join("");
}

// The arguments of the call whose `(` is at `open`: their count and whether one is a spread (which the scan cannot count).
function argsAt(code, open) {
  let depth = 0;
  let count = 0;
  let seen = false;
  let spread = false;
  for (let k = open; k < code.length; k++) {
    const c = code[k];
    if (c === "(" || c === "[" || c === "{") { depth++; if (depth > 1) seen = true; continue; }
    if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return { count: seen ? count + 1 : 0, spread, end: k };
      continue;
    }
    if (depth === 1) {
      if (c === ",") { count++; seen = false; continue; }
      if (!/\s/.test(c)) { seen = true; if (c === "." && code.startsWith("...", k) && !/[\w$)\]]/.test(code[k - 1] || " ")) spread = true; }
    }
  }
  return { count: seen ? count + 1 : 0, spread, end: code.length };
}

// Every exported function with a defaulted `layer`: its name, its module, and the layer's place among its arguments.
export function layered(root = ROOT) {
  const fns = new Map();
  for (const file of walk(path.join(root, "src"))) {
    const code = codeOnly(fs.readFileSync(file, "utf8"));
    const re = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(code))) {
      const open = m.index + m[0].length - 1;
      const { end } = argsAt(code, open);
      const params = [];
      let depth = 0;
      let cur = "";
      for (let k = open + 1; k < end; k++) {
        const c = code[k];
        if ("([{".includes(c)) depth++;
        if (")]}".includes(c)) depth--;
        if (c === "," && depth === 0) { params.push(cur); cur = ""; } else cur += c;
      }
      if (cur.trim()) params.push(cur);
      const at = params.findIndex((p) => /^\s*layer\s*=\s*(0|undefined|drawLayer)\s*$/.test(p)); // a default read from the thing itself (a prop's, a player's) is no trap, and null means every layer
      if (at >= 0) fns.set(m[1], { name: m[1], file: rel(file), at });
    }
  }
  return fns;
}

// Every call in the simulation of one of those functions without its layer.
export function audit(root = ROOT) {
  const fns = layered(root);
  const found = [];
  const names = [...fns.keys()].sort((a, b) => b.length - a.length).join("|");
  for (const file of walk(path.join(root, "src"))) {
    const r = rel(file);
    if (EXCUSED.some((x) => x.test(r))) continue;
    const src = fs.readFileSync(file, "utf8");
    const code = codeOnly(src);
    const re = new RegExp(`(^|[^\\w$])((?:[A-Za-z_$][\\w$]*\\.)?)(${names})\\s*\\(`, "g");
    let m;
    while ((m = re.exec(code))) {
      const name = m[3];
      const before = code.slice(Math.max(0, m.index - 20), m.index + m[1].length);
      if (/function\s*$/.test(before)) continue; // the definition itself
      if (m[2] && !/^(map|mapMod|M|light|lightMod|vis|visibility|movement|placement|reach|round|setdown|stations|campfire|world)\.$/.test(m[2])) continue; // a method of something else
      const open = m.index + m[0].length - 1;
      const { count, spread, end } = argsAt(code, open);
      re.lastIndex = open + 1;
      if (spread || count > fns.get(name).at) continue;
      const line = src.slice(0, m.index).split("\n").length;
      const call = src.slice(m.index + m[1].length, end + 1).replace(/\s+/g, " ");
      found.push({ file: r, line, name, call });
    }
  }
  return found;
}

// The calls grouped as the allow list holds them: by file and the call's text, with how many there are.
export function grouped(found) {
  const by = new Map();
  for (const f of found) {
    const k = `${f.file}\u0000${f.call}`;
    const g = by.get(k) || { file: f.file, call: f.call, n: 0, lines: [] };
    g.n++;
    g.lines.push(f.line);
    by.set(k, g);
  }
  return [...by.values()].sort((a, b) => a.file.localeCompare(b.file) || a.lines[0] - b.lines[0]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const g = grouped(audit());
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(g.map(({ file, call, n }) => ({ file, call, n, step: 0 })), null, 1));
  } else {
    for (const x of g) console.log(`${x.file}:${x.lines.join(",")}  ${x.call}${x.n > 1 ? `  (x${x.n})` : ""}`);
    console.log(`${g.reduce((s, x) => s + x.n, 0)} layer-less calls in ${new Set(g.map((x) => x.file)).size} files`);
  }
}
