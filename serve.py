# Copied from cozy-zombie-game serve.py on 2026-10-09. Serves its own directory. Since (docs/23, step 1,
# 2026-10-12): the manifest regenerated on start and after every save, stamped files cached, and the
# saves checked (the request's origin, a cap on the body, a screenshot that must be a PNG).
"""Static dev server. Source is never cached, so edited modules always reload; a file asked for with
?v=<stamp> (the manifest's stamp, src/boot.js) is cached for a year, since a change gives a new stamp.

Usage: python serve.py [port]
"""
import json
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import manifest as manifest_tool  # noqa: E402  (tools/manifest.py)

MAX_BODY = 8 * 1024 * 1024  # a painted layer is kilobytes, a screenshot a few megabytes
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
PORT = 8000


class ServerWithRoom(ThreadingHTTPServer):
    # The game asks for a hundred or more images at once at boot; the default
    # listen queue of 5 refused the overflow ("connection refused", a failed
    # boot now and then). 2026-10-11.
    request_queue_size = 128
    daemon_threads = True


class NoCacheHandler(SimpleHTTPRequestHandler):
    # Keep-alive: HTTP/1.0 opened a connection per file, and the browser allows six at once,
    # so 200 files took 18 s on 2026-10-12 (docs/23, step 1).
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        if "?v=" in self.path:
            # A stamped file from the manifest: immutable until its stamp changes (docs/23).
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-store, must-revalidate")
            self.send_header("Expires", "0")
        super().end_headers()

    def _origin_ok(self):
        # A browser sends Origin on a cross-site POST; only this server's own pages may save.
        origin = self.headers.get("Origin")
        if origin is None:
            return True
        host = self.headers.get("Host", "")
        return origin in (f"http://{host}", f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}")

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400, "bad Content-Length")
            return None
        if length < 0 or length > MAX_BODY:
            self.send_error(413, f"body over {MAX_BODY} bytes")
            return None
        return self.rfile.read(length)

    def do_POST(self):
        if not self._origin_ok():
            self.send_error(403, "saves come from this server's own pages")
            return
        # Dev only: POST /data/hair/<name>.json saves a painted hair style from
        # tools/hair.html and lists it in data/hair/index.json (docs/12).
        m = re.fullmatch(r"/data/(hair|layers/(?:head|chest|legs|hands|feet|body))/([a-z0-9_-]{1,40})\.json", self.path)
        if self.path.startswith("/data/") and not m:
            self.send_error(400, "paint saves under data/hair or data/layers/<slot>, lowercase names")
            return
        if m:
            folder = os.path.join("data", *m.group(1).split("/"))
            name = m.group(2) + ".json"
            if name == "index.json":
                self.send_error(400, "index is kept by the server")
                return
            os.makedirs(folder, exist_ok=True)
            body = self._body()
            if body is None:
                return
            try:
                json.loads(body)
            except ValueError:
                self.send_error(400, "not JSON")
                return
            with open(os.path.join(folder, name), "wb") as f:
                f.write(body)
            index_path = os.path.join(folder, "index.json")
            try:
                with open(index_path, encoding="utf-8") as f:
                    index = json.load(f)
            except (OSError, ValueError):
                index = {"styles": []}
            style = name[:-5]
            if style not in index.get("styles", []):
                index.setdefault("styles", []).append(style)
                with open(index_path, "w", encoding="utf-8", newline="\n") as f:
                    json.dump(index, f, indent=2)
                    f.write("\n")
            manifest_tool.write(ROOT)  # the saved file gets its stamp, so the next load sees it
            self.send_response(204)
            self.end_headers()
            return
        # Dev only: POST /__screenshot/<name>.png saves the body under screenshots/.
        if not self.path.startswith("/__screenshot/"):
            self.send_error(404)
            return
        name = os.path.basename(self.path.split("?")[0])
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}\.png", name):
            self.send_error(400, "a plain name ending in .png")
            return
        body = self._body()
        if body is None:
            return
        if not body.startswith(PNG_MAGIC):
            self.send_error(400, "not a PNG")
            return
        os.makedirs("screenshots", exist_ok=True)
        with open(os.path.join("screenshots", name), "wb") as f:
            f.write(body)
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        # Keep the console quiet; errors still surface via status codes.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    # Serve this repo whatever the current directory is, so it can be launched from elsewhere.
    os.chdir(ROOT)
    PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    m = manifest_tool.write(ROOT)
    print(f"Serving on http://localhost:{PORT} (source uncached, {len(m['files'])} data files stamped {m['version']})")
    ServerWithRoom(("127.0.0.1", PORT), NoCacheHandler).serve_forever()
