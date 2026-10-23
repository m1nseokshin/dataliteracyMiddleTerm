#!/usr/bin/env python3
"""캐시를 끈 로컬 서버: python3 scripts/serve.py [포트]  → http://localhost:포트/src/index.html
(브라우저가 예전 CSS/JS를 붙들고 있어 수정이 안 보이는 일을 막는다)"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
root = Path(__file__).resolve().parent.parent
ThreadingHTTPServer(("", port), partial(NoCache, directory=str(root))).serve_forever()
