"""Stdlib HTTP server: serves the village web app and its JSON API.

Bound to 127.0.0.1 only — the village is a local app, never exposed.

    GET  /api/state                     agents, houses, review queue, guardrails
    POST /api/chat     {agent, message} → {job}
    POST /api/task     {text}           → {job}   (Chief of Staff routes it)
    POST /api/meeting  {agenda}         → {job}
    POST /api/sync     {a, b}           → immediate (no model call)
    POST /api/review   {id, decision}   → approve / reject a deliverable
    POST /api/candidates {director}     → interview shortlist
    POST /api/hire     {director, name, approved_by_human}
    GET  /api/jobs/<id>
    GET  /files/<path>                  deliverables (md / pdf) under the village root
"""

from __future__ import annotations

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
from pathlib import Path
from typing import Tuple

from aikido.village.town import GuardrailError, Town

STATIC = Path(str(resources.files("aikido.village") / "static"))


def make_handler(town: Town):
    class Handler(BaseHTTPRequestHandler):
        server_version = "AgentVillage/0.1"

        def log_message(self, fmt, *args):  # keep the terminal quiet
            pass

        # ------------------------------------------------------------ helpers
        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code: int, data) -> None:
            self._send(code, json.dumps(data).encode(), "application/json")

        def _file(self, base: Path, rel: str) -> None:
            path = (base / rel).resolve()
            if not path.is_file() or base.resolve() not in path.parents:
                return self._json(404, {"error": "not found"})
            ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if path.suffix == ".md":
                ctype = "text/markdown; charset=utf-8"
            self._send(200, path.read_bytes(), ctype)

        def _body(self) -> dict:
            length = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(length) or b"{}")

        # ------------------------------------------------------------ routes
        def do_GET(self):
            path = self.path.split("?", 1)[0]
            if path == "/api/state":
                return self._json(200, town.state())
            if path.startswith("/api/jobs/"):
                job = town.jobs.get(path.rsplit("/", 1)[-1])
                return self._json(200, job) if job else self._json(404, {"error": "no such job"})
            if path.startswith("/files/"):
                return self._file(town.root, path[len("/files/"):])
            return self._file(STATIC, "index.html" if path == "/" else path.lstrip("/"))

        def do_POST(self):
            # Same-origin only: a page on another site can't drive your agents.
            origin = self.headers.get("Origin")
            if origin and origin != f"http://{self.headers.get('Host')}":
                return self._json(403, {"error": "cross-origin request refused"})
            try:
                code, data = self._route(self.path, self._body())
            except GuardrailError as exc:
                code, data = 403, {"error": str(exc), "guardrail": True}
            except (KeyError, ValueError) as exc:
                code, data = 400, {"error": str(exc)}
            self._json(code, data)

        def _route(self, path: str, body: dict) -> Tuple[int, dict]:
            if path == "/api/chat":
                return 202, {"job": town.submit("chat", town.chat, body["agent"], str(body["message"]))}
            if path == "/api/task":
                return 202, {"job": town.submit("task", town.task, str(body["text"]))}
            if path == "/api/meeting":
                return 202, {"job": town.submit("meeting", town.meeting, str(body.get("agenda") or "morning briefing"))}
            if path == "/api/sync":
                return 200, town.sync(body["a"], body["b"])
            if path == "/api/review":
                return 200, town.review(body["id"], body["decision"])
            if path == "/api/candidates":
                return 200, {"candidates": town.candidates(body["director"])}
            if path == "/api/hire":
                return 200, town.hire(body["director"], body["name"], body.get("approved_by_human") is True)
            return 404, {"error": "unknown endpoint"}

    return Handler


def serve(town: Town, port: int = 8765) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("127.0.0.1", port), make_handler(town))
