import json
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from aikido.village import roster
from aikido.village.brain import ClaudeBrain, HermesBrain, OfflineBrain
from aikido.village.pdf import render_pdf
from aikido.village.server import serve
from aikido.village.town import GuardrailError, Town


def _wait(town, job_id, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = town.jobs[job_id]
        if job["status"] != "running":
            return job
        time.sleep(0.02)
    raise AssertionError("job did not finish")


def test_roster_shape():
    agents = roster.default_roster()
    assert [a.role for a in agents].count("chief_of_staff") == 1
    assert [a.role for a in agents].count("director") == 7
    assert all(a.model == roster.OPUS and a.advisor == roster.ADVISOR for a in agents if a.role == "director")
    assert len(roster.HOUSES) == 10


def test_routing_picks_best_director_and_falls_back_to_chief():
    agents = roster.default_roster()
    assert roster.route_task("Plan a trip to Lisbon with hotel ideas", agents).id == "travel"
    assert roster.route_task("Draft a reply to the email from the bank", agents).id in {"inbox", "finance"}
    assert roster.route_task("Check our loan covenant headroom", agents).id == "finance"
    assert roster.route_task("Hmm, surprise me", agents).id == "chief_of_staff"


def test_unsafe_tools_are_never_granted():
    agent = roster.default_roster()[1]
    agent.tools = ["mcp__Gmail__create_draft", "mcp__Gmail__send_message", "Bash", "mcp__Drive__share_file"]
    allowed = agent.allowed_tools()
    assert "mcp__Gmail__create_draft" in allowed
    assert not {"mcp__Gmail__send_message", "Bash", "mcp__Drive__share_file"} & set(allowed)


def test_default_connectors_are_read_or_draft_only():
    by_id = {a.id: a for a in roster.default_roster()}
    inbox, eng = by_id["inbox"].allowed_tools(), by_id["engineering"].allowed_tools()
    assert set(roster.GMAIL_TOOLS) <= set(inbox) and set(roster.GITHUB_TOOLS) <= set(eng)
    assert by_id["inbox"].connectors == ["Gmail"] and by_id["engineering"].connectors == ["GitHub"]
    assert roster.route_task("Summarise the open issues in our GitHub repo", list(by_id.values())).id == "engineering"


def test_claude_command_is_sandboxed(tmp_path):
    agent = roster.default_roster()[1]
    cmd = ClaudeBrain().command(agent, "sys")
    assert cmd[:2] == ["claude", "-p"]
    assert cmd[cmd.index("--permission-mode") + 1] == "dontAsk"
    assert cmd[cmd.index("--model") + 1] == roster.OPUS
    assert "Bash" in cmd[cmd.index("--disallowedTools") + 1]


def test_task_files_deliverable_for_review(tmp_path):
    town = Town(tmp_path, OfflineBrain())
    job = _wait(town, town.submit("task", town.task, "Plan a 3-day trip to Porto"))
    assert job["status"] == "done", job
    item = job["result"]["deliverable"]
    assert job["result"]["routed_to"] == "travel"
    assert item["status"] == "pending_review"
    assert (tmp_path / item["pdf"]).read_bytes().startswith(b"%PDF-1.4")
    assert "Porto" in (tmp_path / "agents" / "travel" / "notes.md").read_text()

    reviewed = town.review(item["id"], "approved")
    assert reviewed["status"] == "approved"
    assert json.loads((tmp_path / "review.json").read_text())[0]["status"] == "approved"


def test_hiring_requires_human_approval(tmp_path):
    town = Town(tmp_path, OfflineBrain())
    cands = town.candidates("research")
    assert len(cands) == 3
    with pytest.raises(GuardrailError):
        town.hire("research", cands[0]["name"], approved_by_human=False)
    worker = town.hire("research", cands[0]["name"], approved_by_human=True)
    assert worker["model"] == roster.SONNET and worker["reports_to"] == "research"
    # Hired workers persist across restarts.
    again = Town(tmp_path, OfflineBrain())
    assert any(a.id == worker["id"] for a in again.agents)


def test_sync_and_meeting_write_memory(tmp_path):
    town = Town(tmp_path, OfflineBrain())
    a = town.hire("finance", "Quinn", True)["id"]
    b = town.hire("finance", "Bea", True)["id"]
    town.sync(a, b)
    assert "Met Bea" in (tmp_path / "agents" / a / "notes.md").read_text()
    result = town.meeting("morning briefing")
    assert len(result["attendees"]) == 7
    assert "Attended Town Hall" in (tmp_path / "agents" / "inbox" / "notes.md").read_text()


def test_pdf_is_multipage_for_long_text():
    pdf = render_pdf("Long", "\n".join(f"Line {i} (with parens)" for i in range(200)))
    assert pdf.count(b"/Type /Page ") >= 3
    assert pdf.rstrip().endswith(b"%%EOF")


def test_http_api(tmp_path):
    town = Town(tmp_path, OfflineBrain())
    httpd = serve(town, port=0)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"

    def post(path, body, headers=None):
        req = urllib.request.Request(base + path, json.dumps(body).encode(),
                                     {"Content-Type": "application/json", **(headers or {})})
        return json.loads(urllib.request.urlopen(req).read())

    try:
        state = json.loads(urllib.request.urlopen(base + "/api/state").read())
        assert state["brain"] == "offline" and len(state["agents"]) == 8
        assert b"Agent Village" in urllib.request.urlopen(base + "/").read()

        job = post("/api/chat", {"agent": "chief_of_staff", "message": "hello"})["job"]
        assert _wait(town, job)["status"] == "done"

        with pytest.raises(urllib.error.HTTPError) as err:
            post("/api/hire", {"director": "inbox", "name": "Lia"})
        assert err.value.code == 403

        with pytest.raises(urllib.error.HTTPError) as err:
            post("/api/sync", {"a": "x", "b": "y"}, {"Origin": "http://evil.example"})
        assert err.value.code == 403

        # behind an HTTPS reverse proxy the browser sends an https Origin for the same host
        host = f"127.0.0.1:{httpd.server_address[1]}"
        assert post("/api/sync", {"a": "chief_of_staff", "b": "finance"}, {"Origin": f"https://{host}"})["a"] == "chief_of_staff"

        with pytest.raises(urllib.error.HTTPError) as err:
            urllib.request.urlopen(base + "/files/../../etc/passwd")
        assert err.value.code == 404
    finally:
        httpd.shutdown()
        httpd.server_close()



FAKE_HERMES = """#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
usage = args[args.index("--usage-file") + 1]
json.dump({"api_calls": 2, "estimated_cost_usd": 0.01}, open(usage, "w"))
home = os.environ["HERMES_HOME"]
soul = open(os.path.join(home, "SOUL.md")).read()
print("# Plan\\n" + ("persona-ok " if "Money Director" in soul else "") + "tools=" + args[args.index("-t") + 1])
"""


def _fake_hermes(tmp_path):
    exe = tmp_path / "hermes"
    exe.write_text(FAKE_HERMES)
    exe.chmod(0o755)
    return str(exe)


def test_hermes_tool_belt_is_the_boundary():
    by_id = {a.id: a for a in roster.default_roster()}
    penny = by_id["finance"]
    penny.active_tools = ["memory", "web", "terminal", "code_execution", "mcp-github"]
    assert HermesBrain().toolsets(penny) == ["memory", "web"]  # off-belt and unsafe toolsets never pass
    iris = by_id["inbox"]
    assert "mcp-gmail" not in HermesBrain().toolsets(iris)  # no Gmail URL configured yet
    assert "mcp-gmail" in HermesBrain(mcp={"gmail": {"url": "https://example.test/mcp"}}).toolsets(iris)
    cmd = HermesBrain().command(by_id["engineering"], "hi", Path("/tmp/x"))
    assert cmd[:3] == ["hermes", "-z", "hi"] and "--provider" in cmd and "anthropic" in cmd
    assert "mcp-github" in cmd[cmd.index("-t") + 1]


def test_hermes_brain_runs_profile_and_logs_decisions(tmp_path):
    town = Town(tmp_path / "v", HermesBrain(binary=_fake_hermes(tmp_path)))
    job = _wait(town, town.submit("task", town.task, "Build a cash flow forecast for Q1"))
    assert job["status"] == "done", job
    assert job["result"]["routed_to"] == "finance"
    body = (tmp_path / "v" / job["result"]["deliverable"]["md"]).read_text()
    assert "persona-ok" in body and "tools=memory,todo,skills,web" in body
    home = tmp_path / "v" / "agents" / "finance" / "hermes"
    config = __import__("yaml").safe_load((home / "config.yaml").read_text())
    assert config["toolsets"] == ["memory", "todo", "skills", "web"] and config["mcp_servers"] == {}
    log = town.decisions("finance")
    assert log[0]["ok"] and log[0]["api_calls"] == 2 and log[0]["cost_usd"] == 0.01


def test_tool_toggles_persist_and_stay_on_the_belt(tmp_path):
    town = Town(tmp_path, OfflineBrain())
    assert "web" not in town.set_tool("finance", "web", False)["active_tools"]
    with pytest.raises(GuardrailError):
        town.set_tool("finance", "terminal", True)
    with pytest.raises(GuardrailError):
        town.set_tool("finance", "mcp-gmail", True)  # Gmail is Iris's tool, not Penny's
    again = Town(tmp_path, OfflineBrain())
    assert "web" not in again.agent("finance").active_tools
    assert town.set_tool("finance", "web", True)["active_tools"] == ["memory", "todo", "skills", "web"]


def test_hermes_failure_with_exit_zero_is_an_error(tmp_path):
    exe = tmp_path / "hermes"
    exe.write_text("""#!/usr/bin/env python3
import json, sys
args = sys.argv[1:]
json.dump({"api_calls": 1, "failed": True}, open(args[args.index("--usage-file") + 1], "w"))
print("HTTP 401: OAuth access token is invalid.")
""")
    exe.chmod(0o755)
    town = Town(tmp_path / "v", HermesBrain(binary=str(exe)))
    job = _wait(town, town.submit("chat", town.chat, "finance", "hello"))
    assert job["status"] == "error" and "401" in job["error"]
    assert town.decisions("finance")[0]["ok"] is False


def _fake_hermes_server():
    """A tiny stand-in for the Hermes runs API: one run that asks for approval, then completes."""
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    seen = {"choice": None, "auth": None, "profile": None, "approved": threading.Event()}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _json(self, code, data):
            body = json.dumps(data).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/health":
                return self._json(200, {"status": "ok"})
            if self.path.endswith("/events"):
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                ask = {"event": "approval.request", "command": "rm -rf /tmp/scratch", "choices": ["once", "session", "always", "deny"]}
                self.wfile.write(f"data: {json.dumps(ask)}\n\n".encode()); self.wfile.flush()
                seen["approved"].wait(5)
                done = {"event": "run.completed", "output": f"done ({seen['choice']})", "usage": {"api_calls": 3}}
                self.wfile.write(f"data: {json.dumps(done)}\n\n".encode()); self.wfile.flush()
                return
            self._json(404, {})

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            if self.path.endswith("/v1/runs"):
                seen["auth"] = self.headers.get("Authorization")
                seen["profile"] = self.path.split("/")[2]
                return self._json(202, {"run_id": "run_1", "status": "started"})
            if self.path.endswith("/approval"):
                seen["choice"] = body["choice"]
                seen["approved"].set()
                return self._json(200, {"ok": True})
            self._json(404, {})

    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, seen


def test_remote_hermes_pauses_for_the_users_approval(tmp_path):
    from aikido.village.brain import RemoteHermesBrain

    srv, seen = _fake_hermes_server()
    try:
        url = f"http://127.0.0.1:{srv.server_address[1]}"
        town = Town(tmp_path, RemoteHermesBrain(url, "secret"))
        job_id = town.submit("chat", town.chat, "finance", "Tidy the scratch folder")
        deadline = time.time() + 5
        while not town.state()["approvals"] and time.time() < deadline:
            time.sleep(0.02)
        pending = town.state()["approvals"]
        assert len(pending) == 1 and "rm -rf" in pending[0]["what"] and "always" not in pending[0]["choices"]
        with pytest.raises(ValueError):
            town.resolve_approval(pending[0]["id"], "always")  # permanent allow is never offered
        town.resolve_approval(pending[0]["id"], "once")
        job = _wait(town, job_id)
        assert job["status"] == "done" and job["result"]["reply"] == "done (once)"
        assert seen["auth"] == "Bearer secret" and seen["profile"] == "finance"
        log = town.decisions("finance")[0]
        assert log["ok"] and log["approvals"][0]["choice"] == "once" and log["api_calls"] == 3
    finally:
        srv.shutdown()


def test_server_setup_bundle(tmp_path):
    import yaml as _yaml

    from aikido.village.hermes_setup import export_bundle

    out = export_bundle(tmp_path / "b")
    names = sorted(p.name for p in (out / "profiles").iterdir())
    assert names == sorted(a.id for a in roster.default_roster())
    eng = _yaml.safe_load((out / "profiles" / "engineering" / "village.yaml").read_text())
    assert eng["approvals"]["mode"] == "manual" and "github" in eng["mcp_servers"]
    assert "terminal" not in eng["platform_toolsets"]["api_server"]
    fin = _yaml.safe_load((out / "profiles" / "finance" / "village.yaml").read_text())
    assert fin["platform_toolsets"]["api_server"] == ["memory", "todo", "skills", "web"] and fin["mcp_servers"] == {}
    assert "Money Director" in (out / "profiles" / "finance" / "SOUL.md").read_text()
    assert "API_SERVER_KEY" in (out / "install.sh").read_text()
    village = (out / "village_install.sh").read_text()
    assert "basic_auth" in village and "127.0.0.1:8765" in village and "--brain hermes-remote" in village
    assert (out / "aikido-src.tar.gz").exists()
