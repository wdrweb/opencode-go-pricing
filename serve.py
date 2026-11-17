#!/usr/bin/env python3
"""serve.py — same-origin proxy + static server for Model Pricing & Value.

Serves this folder and re-exposes the upstream Go models endpoint on the same
origin, so the page also works from file:// or a plain static server:

    GET /api/mdlc-pricing  -> the upstream models JSON (10-minute cache)
                            or JSON {"source":"snapshot","reason":...} on failure

The payload passes through untouched: app.js maps it with the same
pricing-core.js parser the refresh script uses.

Usage:
    python3 serve.py [port]          # default port 8097, serves this folder
    python3 serve.py 9000            # custom port
"""

import json
import os
import sys
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = os.path.dirname(os.path.abspath(__file__))
UPSTREAM = "https://opencode.ai/inference/go/v1/models"
UPSTREAM_TIMEOUT = 15
CACHE_SECONDS = 600  # 10 minutes, same as the plugin's server half

_cache = None  # (at: float, body: str)


def fetch_upstream_json():
    """Fetch the models payload with a short cache; raises on failure."""
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < CACHE_SECONDS:
        return _cache[1]
    req = Request(UPSTREAM, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=UPSTREAM_TIMEOUT) as res:
        body = res.read().decode("utf-8", "replace")
    _cache = (now, body)
    return body


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path == "/api/mdlc-pricing" or self.path.startswith("/api/mdlc-pricing?"):
            self._pricing()
            return
        super().do_GET()

    def _pricing(self):
        try:
            body = fetch_upstream_json().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(body)
        except (URLError, OSError, ValueError) as exc:
            payload = json.dumps({"source": "snapshot", "models": None,
                                  "reason": "upstream: %s" % exc}).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(payload)

    def log_message(self, fmt, *args):  # quieter logs
        sys.stderr.write("[serve.py] %s\n" % (fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8097
    server = HTTPServer(("127.0.0.1", port), Handler)
    print("Model Pricing & Value — http://127.0.0.1:%d  (Ctrl+C to stop)" % port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()