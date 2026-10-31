import json
import threading
import time
import urllib.error
import urllib.request

import pytest

from aikido.village import roster
from aikido.village.brain import ClaudeBrain, OfflineBrain
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

        with pytest.raises(urllib.error.HTTPError) as err:
            urllib.request.urlopen(base + "/files/../../etc/passwd")
        assert err.value.code == 404
    finally:
        httpd.shutdown()
        httpd.server_close()
