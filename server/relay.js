// The relay (docs/31/04, the transport; ruled 2026-10-13, docs/02): a small Node process the host
// and its guests connect to over WebSocket, so friends anywhere join a world hosted in a browser
// tab with nothing but the site's URL and the host's code. It is the lobby and the pipe: the host
// registers a code, guests name it, and from then on everything the host sends goes to its guests
// (to one of them when the message names `to`) and everything a guest sends goes to its host, with
// `from` stamped here so a guest is who the relay says it is. The relay reads none of it. The same
// shapes cross the two-tab loopback (src/net.js), so the game does not know which it is on.
//
// No dependency: the WebSocket handshake and framing are the hundred lines below (RFC 6455), in the
// repo's own style, as docs/31/05 allowed. Text frames only, since the game speaks JSON.
//
//   node server/relay.js            on port 8012 (or $PORT, which hosting tiers set)
//   node server/relay.js 9000       on another port
//
// The GitHub Pages site is https, so a browser there opens only wss://: run this behind something
// that gives TLS (a hosting tier's own front door, or a tunnel from a machine), and put that
// address in src/net.js RELAY_URL or on the URL as ?relay=wss://... (docs/31/07, question 20).
// A plain GET answers with the room count, which is also how a hosting tier's health check sees it.

import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || process.argv[2] || 8012);
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE = 16 * 1024 * 1024; // the welcome is a whole save, under a megabyte today
const PING_EVERY_MS = 30000;
const LOOKUPS_PER_MINUTE = 120; // per address: /open answers and refused joins (nohost, taken), so a code cannot be scanned (the review, 2026-10-13); a Worlds screen asks for every bookmarked code every ten seconds, so thirty was too few, and at 120 a scan of the code space takes years

const lookups = new Map(); // address -> { count, since }

// The address a client cannot choose: Fly's own header, else the last hop a proxy appended (the first
// X-Forwarded-For value is whatever the client sent, and would let a scan start afresh with every request),
// else the socket's.
function addressOf(req) {
  const fly = req.headers["fly-client-ip"];
  if (fly) return String(fly).trim();
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return fwd.length ? fwd[fwd.length - 1] : req.socket.remoteAddress || "";
}

function overLimit(address) {
  const now = Date.now();
  let l = lookups.get(address);
  if (!l || now - l.since > 60000) {
    l = { count: 0, since: now };
    lookups.set(address, l);
  }
  l.count++;
  return l.count > LOOKUPS_PER_MINUTE;
}

const DEAD_AFTER_MS = 90000;

const rooms = new Map(); // code -> { host: Conn, guests: Map<id, Conn> }
let nextId = 1;

// ---- framing ----

// One WebSocket frame on the wire to a client (unmasked, as a server sends).
function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

class Conn {
  constructor(socket) {
    this.id = `c${nextId++}`;
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragments = null; // a message arriving in pieces: { opcode, parts }
    this.role = null; // "host" | "guest" once the first message says
    this.code = null;
    this.lastSeen = Date.now();
    this.closed = false;
  }

  sendText(text) {
    if (this.closed) return;
    this.socket.write(frame(0x1, Buffer.from(text, "utf8")));
  }

  sendJson(obj) {
    this.sendText(JSON.stringify(obj));
  }

  ping() {
    if (!this.closed) this.socket.write(frame(0x9, Buffer.alloc(0)));
  }

  close(code = 1000) {
    if (this.closed) return;
    this.closed = true;
    const body = Buffer.alloc(2);
    body.writeUInt16BE(code, 0);
    try {
      this.socket.write(frame(0x8, body));
    } catch {
      // the socket may be gone already
    }
    this.socket.end();
    leave(this);
  }

  // Bytes in: frames out, as many as are whole.
  feed(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const b = this.buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let at = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return this.close(1009);
        len = Number(big);
        at = 10;
      }
      if (!masked) return this.close(1002); // a client must mask (RFC 6455, 5.1)
      if (b.length < at + 4 + len) return;
      const mask = b.subarray(at, at + 4);
      const payload = Buffer.from(b.subarray(at + 4, at + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buffer = b.subarray(at + 4 + len);
      this.lastSeen = Date.now();
      if (opcode === 0x8) return this.close(1000);
      if (opcode === 0x9) {
        if (!this.closed) this.socket.write(frame(0xa, payload));
        continue;
      }
      if (opcode === 0xa) continue; // a pong: lastSeen is enough
      if (opcode === 0x0) {
        if (!this.fragments) return this.close(1002);
        this.fragments.parts.push(payload);
      } else {
        if (this.fragments) return this.close(1002);
        this.fragments = { opcode, parts: [payload] };
      }
      const total = this.fragments.parts.reduce((n, p) => n + p.length, 0);
      if (total > MAX_MESSAGE) return this.close(1009);
      if (!fin) continue;
      const { opcode: op, parts } = this.fragments;
      this.fragments = null;
      if (op !== 0x1) continue; // binary is not the game's
      onMessage(this, Buffer.concat(parts).toString("utf8"));
    }
  }
}

// ---- rooms ----

function onMessage(conn, text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return conn.close(1007);
  }
  if (!msg || typeof msg !== "object") return;
  if (!conn.role) {
    // The first message says who this is: a host registering a code, or a guest naming one.
    const code = typeof msg.code === "string" ? msg.code.trim().toLowerCase().slice(0, 32) : "";
    if (!code) return conn.close(1008);
    if (msg.type === "host") {
      if (rooms.has(code)) {
        overLimit(conn.address);
        return conn.sendJson({ type: "error", reason: "taken" }), conn.close(1008);
      }
      conn.role = "host";
      conn.code = code;
      rooms.set(code, { host: conn, guests: new Map() });
      conn.sendJson({ type: "relay", role: "host", id: conn.id, code });
      log(`host ${conn.id} opened ${code}`);
    } else if (msg.type === "guest") {
      const room = rooms.get(code);
      if (!room) {
        if (overLimit(conn.address)) return conn.close(1008); // scanned: no word at all
        return conn.sendJson({ type: "error", reason: "nohost" }), conn.close(1008);
      }
      conn.role = "guest";
      conn.code = code;
      room.guests.set(conn.id, conn);
      conn.sendJson({ type: "relay", role: "guest", id: conn.id, code });
      log(`guest ${conn.id} joined ${code} (${room.guests.size} in the room)`);
    } else conn.close(1008);
    return;
  }
  const room = rooms.get(conn.code);
  if (!room) return conn.close(1011);
  if (conn.role === "host") {
    // To one guest when named, else to every guest the host has welcomed. `from` is the host's id, stamped
    // here. A connection the host refused or has not admitted (a wrong version, a world full, no browser
    // id) hears only what is addressed to it, never the world's frames (found reviewing the worlds move).
    const out = JSON.stringify({ ...msg, from: conn.id });
    if (msg.to) {
      const g = room.guests.get(msg.to);
      if (g) {
        g.sendText(out);
        if (msg.type === "welcome") g.admitted = true;
        else if (msg.type === "bye") g.close(1000); // the host let this one go: the relay does too
      }
    } else for (const g of room.guests.values()) if (g.admitted) g.sendText(out);
  } else {
    // A guest speaks only to its host, and only as itself.
    room.host.sendText(JSON.stringify({ ...msg, from: conn.id, to: undefined }));
  }
}

function leave(conn) {
  if (!conn.role) return;
  const room = rooms.get(conn.code);
  if (!room) return;
  if (conn.role === "host") {
    rooms.delete(conn.code);
    for (const g of room.guests.values()) {
      g.sendJson({ type: "hostLeft" });
      g.close(1001);
    }
    log(`host ${conn.id} closed ${conn.code}`);
  } else if (room.guests.delete(conn.id)) {
    room.host.sendJson({ type: "leave", from: conn.id }); // the shape a guest's own leave has (src/net.js)
    log(`guest ${conn.id} left ${conn.code}`);
  }
  conn.role = null;
}

function log(line) {
  console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
}

// ---- the server ----

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://relay");
  const address = addressOf(req);
  // "Is this world open?" for a code: { open, guests }. Rate-limited per address, as a refused join is.
  if (url.pathname === "/open") {
    if (overLimit(address)) {
      res.writeHead(429, { "content-type": "application/json", "access-control-allow-origin": "*" });
      return res.end('{"error":"slow down"}');
    }
    const code = (url.searchParams.get("code") || "").trim().toLowerCase().slice(0, 32);
    const room = rooms.get(code);
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
    return res.end(JSON.stringify({ open: !!room, guests: room ? room.guests.size : 0 }));
  }
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" });
  let guests = 0;
  for (const r of rooms.values()) guests += r.guests.size;
  res.end(`cmz relay: ${rooms.size} world${rooms.size === 1 ? "" : "s"} open, ${guests} guest${guests === 1 ? "" : "s"}\n`);
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || (req.headers.upgrade || "").toLowerCase() !== "websocket") {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const conn = new Conn(socket);
  conn.address = addressOf(req);
  // A socket that never says who it is (host or guest, which code) is let go: only room members are pinged.
  setTimeout(() => { if (!conn.role) conn.close(1008); }, 10000).unref();
  socket.on("data", (chunk) => conn.feed(chunk));
  socket.on("close", () => { conn.closed = true; leave(conn); });
  socket.on("error", () => { conn.closed = true; leave(conn); socket.destroy(); });
});

setInterval(() => {
  const now = Date.now();
  for (const [a, l] of lookups) if (now - l.since > 60000) lookups.delete(a); // the table does not grow with every address ever seen
  for (const room of rooms.values()) {
    for (const c of [room.host, ...room.guests.values()]) {
      if (now - c.lastSeen > DEAD_AFTER_MS) c.close(1001);
      else c.ping();
    }
  }
}, PING_EVERY_MS).unref();

server.listen(PORT, () => log(`cmz relay listening on ${PORT}`));
