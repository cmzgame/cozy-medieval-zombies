# Copied from cozy-zombie-game serve.py on 2026-10-09. Serves its own directory.
"""Static dev server with caching disabled, so edited modules always reload.

Usage: python serve.py [port]
"""
import json
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class ServerWithRoom(ThreadingHTTPServer):
    # The game asks for a hundred or more images at once at boot; the default
    # listen queue of 5 refused the overflow ("connection refused", a failed
    # boot now and then). 2026-10-11.
    request_queue_size = 128
    daemon_threads = True


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self):
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
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
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
            self.send_response(204)
            self.end_headers()
            return
        # Dev only: POST /__screenshot/<name>.png saves the body under screenshots/.
        if not self.path.startswith("/__screenshot/"):
            self.send_error(404)
            return
        name = os.path.basename(self.path)
        if not name.endswith(".png"):
            self.send_error(400)
            return
        os.makedirs("screenshots", exist_ok=True)
        length = int(self.headers.get("Content-Length", "0"))
        with open(os.path.join("screenshots", name), "wb") as f:
            f.write(self.rfile.read(length))
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        # Keep the console quiet; errors still surface via status codes.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    # Serve this repo whatever the current directory is, so it can be launched from elsewhere.
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Serving on http://localhost:{port} (no-cache)")
    ServerWithRoom(("127.0.0.1", port), NoCacheHandler).serve_forever()
