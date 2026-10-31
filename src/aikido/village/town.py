"""Village state: agents, memory, jobs, the review queue and the hiring pipeline.

Everything persists as plain files under the village root, in the same spirit
as the rest of aikido — no database, no hidden state::

    village/
      village.json            config + hired workers
      review.json             deliverables awaiting / past human review
      agents/<id>/identity.md
      agents/<id>/notes.md    long-term memory
      agents/<id>/deliverables/*.md|*.pdf
"""

from __future__ import annotations

import json
import re
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from aikido.village import roster
from aikido.village.brain import Brain, system_prompt
from aikido.village.pdf import render_pdf

NOTES_TAIL_LINES = 40

CANDIDATE_POOL = [
    ("Avery", "Fast, tidy, loves checklists."),
    ("Bea", "Former analyst; quick with spreadsheets and sources."),
    ("Dev", "Automation nerd; turns repeat chores into scripts."),
    ("Finn", "Calm under deadlines, great at first drafts."),
    ("Gus", "Detail-oriented proof-reader with a nose for errors."),
    ("Juno", "Curious researcher; always cites where things came from."),
    ("Lia", "Organised scheduler; never double-books."),
    ("Nico", "Plain-English writer; turns jargon into briefs."),
    ("Ola", "Patient follow-upper; nothing slips through."),
    ("Quinn", "Numbers-first; double-checks every total."),
]


class GuardrailError(PermissionError):
    """Raised when an action needs a human approval it did not get."""


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:48] or "deliverable"


class Town:
    def __init__(self, root: Path, brain: Brain, chief_name: str = "Matt"):
        self.root = Path(root)
        self.brain = brain
        self.lock = threading.RLock()
        self.pool = ThreadPoolExecutor(max_workers=4)
        self.jobs: Dict[str, dict] = {}
        self.root.mkdir(parents=True, exist_ok=True)
        self.config = self._load_json("village.json", {"chief_name": chief_name, "workers": [], "connector_tools": {}})
        self.agents: List[roster.Agent] = roster.default_roster(self.config.get("chief_name", chief_name))
        for agent in self.agents:
            agent.tools = list(self.config.get("connector_tools", {}).get(agent.id, agent.tools))
        for w in self.config.get("workers", []):
            self.agents.append(roster.make_worker(self.agent(w["reports_to"]), w["index"], w["name"]))
        roster.ensure_folders(self.root, self.agents)
        self._save_json("village.json", self.config)

    # ---------------------------------------------------------------- files
    def _load_json(self, name: str, default):
        path = self.root / name
        return json.loads(path.read_text()) if path.exists() else default

    def _save_json(self, name: str, data) -> None:
        (self.root / name).write_text(json.dumps(data, indent=2) + "\n")

    def folder(self, agent_id: str) -> Path:
        return self.root / "agents" / agent_id

    def agent(self, agent_id: str) -> roster.Agent:
        for a in self.agents:
            if a.id == agent_id:
                return a
        raise KeyError(agent_id)

    def chief(self) -> roster.Agent:
        return self.agent("chief_of_staff")

    def notes_tail(self, agent_id: str) -> str:
        lines = (self.folder(agent_id) / "notes.md").read_text().splitlines()
        return "\n".join(lines[-NOTES_TAIL_LINES:])

    def remember(self, agent_id: str, entry: str) -> None:
        with self.lock:
            with (self.folder(agent_id) / "notes.md").open("a") as fh:
                fh.write(f"- {_now()} {entry.strip()}\n")

    def org_chart(self) -> str:
        lines = ["- Chief Human Officer: the user (final say on everything)"]
        for a in self.agents:
            boss = f" → reports to {self.agent(a.reports_to).name}" if a.reports_to else " → reports to the user"
            lines.append(f"- {a.name}: {a.title} ({a.house.replace('_', ' ')}){boss}")
        return "\n".join(lines)

    # ---------------------------------------------------------------- state
    def state(self) -> dict:
        return {
            "brain": self.brain.name,
            "agents": [a.to_dict() for a in self.agents],
            "houses": [h.to_dict() for h in roster.HOUSES],
            "review": self._load_json("review.json", []),
            "connectors": [
                {"name": "Gmail", "status": "Iris searches, reads and drafts through your claude CLI's Gmail connector"},
                {"name": "GitHub", "status": "Ezra reads repos, issues and PRs through your claude CLI's GitHub MCP server"},
            ],
            "guardrails": [
                "Emails are always saved as drafts — never sent.",
                "No spending money or credits without your approval.",
                "Nothing is published or posted publicly.",
                "Every deliverable passes your review first.",
            ],
        }

    # ---------------------------------------------------------------- thinking
    def _think(self, agent: roster.Agent, prompt: str) -> str:
        boss = self.agent(agent.reports_to) if agent.reports_to else None
        system = system_prompt(agent, boss, self.notes_tail(agent.id), self.org_chart())
        return self.brain.think(agent, system, prompt, self.folder(agent.id))

    def submit(self, kind: str, fn, *args) -> str:
        job_id = uuid.uuid4().hex[:12]
        self.jobs[job_id] = {"id": job_id, "kind": kind, "status": "running", "result": None, "error": None}

        def run():
            try:
                self.jobs[job_id]["result"] = fn(*args)
                self.jobs[job_id]["status"] = "done"
            except Exception as exc:  # surfaced to the UI, never swallowed
                self.jobs[job_id]["status"] = "error"
                self.jobs[job_id]["error"] = str(exc)

        self.pool.submit(run)
        return job_id

    def chat(self, agent_id: str, message: str) -> dict:
        agent = self.agent(agent_id)
        reply = self._think(agent, message)
        self.remember(agent_id, f"Chat with the user. They said: {message[:160]!r}. I replied: {reply[:160]!r}")
        return {"agent": agent_id, "reply": reply}

    def task(self, text: str) -> dict:
        """The to-do widget: the Chief of Staff routes, a director delivers."""
        director = roster.route_task(text, self.agents)
        chief = self.chief()
        self.remember(chief.id, f"Received to-do {text[:160]!r}; routed to {director.name}.")
        body = self._think(director, f"TASK: {text}\n\nProduce the finished deliverable.")
        item = self._file_deliverable(director, text, body)
        self.remember(director.id, f"Delivered {item['title']!r} for to-do {text[:120]!r} (awaiting review).")
        return {"routed_to": director.id, "deliverable": item}

    def meeting(self, agenda: str) -> dict:
        """Town Hall: every director reports, the Chief of Staff writes the briefing."""
        directors = [a for a in self.agents if a.role == "director"]
        statuses = {}
        for d in directors:
            last = [l for l in self.notes_tail(d.id).splitlines() if l.startswith("- ")]
            statuses[d.name] = last[-1][2:] if last else "No activity yet."
        status_block = "\n".join(f"- **{n}:** {s}" for n, s in statuses.items())
        prompt = (
            f"TASK: Town Hall meeting — {agenda}\n\nLatest status from each director:\n{status_block}\n\n"
            "Write the meeting briefing: highlights, blockers, decisions needed from the user."
        )
        body = self._think(self.chief(), prompt)
        if self.brain.name == "offline":
            body += f"\n## Director status\n{status_block}\n"
        item = self._file_deliverable(self.chief(), f"Town Hall: {agenda}", body)
        for d in directors:
            self.remember(d.id, f"Attended Town Hall ({agenda}).")
        return {"attendees": [d.id for d in directors], "deliverable": item}

    def sync(self, a_id: str, b_id: str) -> dict:
        """Two villagers bumped into each other: swap status, write it down. No model call."""
        a, b = self.agent(a_id), self.agent(b_id)

        def status(agent_id):
            entries = [l[2:] for l in self.notes_tail(agent_id).splitlines() if l.startswith("- ")]
            return entries[-1] if entries else "nothing new"

        sa, sb = status(a.id), status(b.id)
        self.remember(a.id, f"Met {b.name} in town. Their status: {sb[:200]}")
        self.remember(b.id, f"Met {a.name} in town. Their status: {sa[:200]}")
        return {"a": a.id, "b": b.id}

    # ---------------------------------------------------------------- review queue
    def _file_deliverable(self, agent: roster.Agent, task: str, body: str) -> dict:
        title = next((l[2:].strip() for l in body.splitlines() if l.startswith("# ")), task[:70])
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        base = self.folder(agent.id) / "deliverables" / f"{stamp}-{_slug(title)}"
        base.with_suffix(".md").write_text(body + "\n")
        base.with_suffix(".pdf").write_bytes(render_pdf(title, body))
        item = {
            "id": uuid.uuid4().hex[:12],
            "agent": agent.id,
            "title": title,
            "task": task,
            "status": "pending_review",
            "created": _now(),
            "md": str(base.with_suffix(".md").relative_to(self.root)),
            "pdf": str(base.with_suffix(".pdf").relative_to(self.root)),
        }
        with self.lock:
            queue = self._load_json("review.json", [])
            queue.append(item)
            self._save_json("review.json", queue)
        return item

    def review(self, item_id: str, decision: str) -> dict:
        if decision not in ("approved", "rejected"):
            raise ValueError("decision must be 'approved' or 'rejected'")
        with self.lock:
            queue = self._load_json("review.json", [])
            for item in queue:
                if item["id"] == item_id:
                    item["status"] = decision
                    item["reviewed"] = _now()
                    self._save_json("review.json", queue)
                    self.remember(item["agent"], f"The user {decision} {item['title']!r}.")
                    return item
        raise KeyError(item_id)

    # ---------------------------------------------------------------- hiring
    def candidates(self, director_id: str, count: int = 3) -> List[dict]:
        director = self.agent(director_id)
        if director.role != "director":
            raise ValueError("only directors hire interns")
        taken = {a.name for a in self.agents}
        free = [c for c in CANDIDATE_POOL if c[0] not in taken]
        self.remember("chief_of_staff", f"Sourced {min(count, len(free))} candidates for {director.name}.")
        return [{"name": n, "pitch": p, "director": director_id} for n, p in free[:count]]

    def hire(self, director_id: str, name: str, approved_by_human: bool) -> dict:
        """Guardrail: a worker only spawns after the user interviews and approves."""
        if not approved_by_human:
            raise GuardrailError("Hiring needs the Chief Human Officer's approval after the interview.")
        director = self.agent(director_id)
        with self.lock:
            index = 1 + sum(1 for w in self.config["workers"] if w["reports_to"] == director_id)
            worker = roster.make_worker(director, index, name)
            self.agents.append(worker)
            self.config["workers"].append({"reports_to": director_id, "index": index, "name": name})
            self._save_json("village.json", self.config)
            roster.ensure_folders(self.root, [worker])
        self.remember(director_id, f"Hired {name} as an intern (approved by the user).")
        return worker.to_dict()
