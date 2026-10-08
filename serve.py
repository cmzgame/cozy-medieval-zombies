# Copied from cozy-zombie-game serve.py on 2026-10-09. Serves its own directory.
"""Static dev server with caching disabled, so edited modules always reload.

Usage: python serve.py [port]
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self):
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
    ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
