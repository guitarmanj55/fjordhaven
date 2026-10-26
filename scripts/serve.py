# Dev server for the preview: like `python -m http.server`, but tells the browser not to cache,
# so edited modules load on a plain reload.
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


# PORT (set by the preview when the configured port is taken) wins over the argument.
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
port = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 8131))
http.server.ThreadingHTTPServer(("", port), NoCache).serve_forever()
