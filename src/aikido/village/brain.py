"""How a villager thinks.

``ClaudeBrain`` shells out to the local ``claude`` CLI in headless mode
(``claude -p``). That runs on the user's Claude subscription — no API key is
read or required. Each call is sandboxed to the agent's own folder with an
explicit tool allow-list and ``--permission-mode dontAsk``, so any tool not
pre-approved is denied rather than prompted for.

``HermesBrain`` gives every agent its own Nous Research Hermes Agent profile
(its own SOUL.md, memory, skills and tool belt) and runs it in one-shot mode.
Hermes one-shot auto-approves tool calls, so the tool belt is the boundary:
only the toolsets in ``roster.HERMES_TOOLSETS`` can ever be switched on.

``OfflineBrain`` answers deterministically so the village works (and tests
run) on machines without the CLI.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Protocol

import yaml

from aikido.village.roster import BASE_TOOLS, BLOCKED_TOOLS, Agent, safe_toolsets

ADVISOR_FLAG = "[ADVISOR]"

GUARDRAILS = """\
## Non-negotiable rules (the Chief Human Officer set these)
1. Emails are ALWAYS saved as drafts. You never send email.
2. You never spend money, credits, or place trades/bookings without explicit human approval.
3. You never publish or post anything publicly.
4. Every deliverable goes to the human review queue before anyone acts on it.
5. Work only inside your own folder. Record anything worth remembering in notes.md.
6. You cannot message other agents or sessions yourself. The village moves people around
   (summons, meetings) for you, so never go looking for other sessions or tools.
"""


def system_prompt(agent: Agent, boss: Optional[Agent], notes_tail: str, org_chart: str) -> str:
    reports = f"{boss.name}, the {boss.title}" if boss else "the Chief Human Officer (the user)"
    advisor = (
        f"\nIf a request is a genuinely complex edge-case you are not confident about, begin your "
        f"reply with {ADVISOR_FLAG} and your best draft; it will be escalated to your advisor.\n"
        if agent.advisor
        else ""
    )
    return (
        f"You are {agent.name}, the {agent.title} in the Agent Village — a small town of AI agents "
        f"who work for the user (the Chief Human Officer). You report to {reports}.\n\n"
        f"## Your domain\n{agent.domain}\n\n"
        f"## The org chart\n{org_chart}\n\n"
        f"{GUARDRAILS}{advisor}\n"
        f"## Your recent notes (long-term memory)\n{notes_tail or '(empty)'}\n\n"
        "Stay in character, be concise and concrete. When the message starts with 'TASK:', reply "
        "with the finished deliverable in Markdown, starting with a '# ' title line. Otherwise "
        "this is a conversation: answer in a few plain sentences."
    )


class Brain(Protocol):
    name: str

    def think(self, agent: Agent, system: str, prompt: str, cwd: Path, model: Optional[str] = None) -> str: ...


class OfflineBrain:
    """No model calls. Plausible, clearly-labelled placeholder replies."""

    name = "offline"

    def think(self, agent: Agent, system: str, prompt: str, cwd: Path, model: Optional[str] = None) -> str:
        first = prompt.strip().splitlines()[0] if prompt.strip() else "(no request)"
        if prompt.startswith("TASK:"):
            task = first[len("TASK:"):].strip()
            return (
                f"# {task[:70] or 'Deliverable'}\n\n"
                f"Prepared by {agent.name} ({agent.title}) — offline draft.\n\n"
                "## Plan\n"
                f"1. Clarify the goal: {task}\n"
                "2. Gather what is already in my notes and folder.\n"
                "3. Draft the deliverable and send it to your review queue.\n\n"
                "## Next step\n"
                "Install the Claude Code CLI (`claude`) and restart the village to have me do this "
                "for real on your subscription.\n"
            )
        return (
            f"({agent.name}, offline) Got it — \"{first[:120]}\". I'm running without the Claude "
            f"CLI right now, so I can only take notes. Start the village with `claude` installed "
            f"and I'll handle this properly."
        )


class ClaudeBrain:
    """Headless Claude Code, one subprocess per thought."""

    name = "claude"

    def __init__(self, binary: str = "claude", timeout: int = 600, extra_dirs: Optional[List[Path]] = None):
        self.binary = binary
        self.timeout = timeout
        self.extra_dirs = extra_dirs or []

    @staticmethod
    def available(binary: str = "claude") -> bool:
        return shutil.which(binary) is not None

    def command(self, agent: Agent, system: str, model: Optional[str] = None) -> List[str]:
        cmd = [
            self.binary,
            "-p",
            "--model", model or agent.model,
            "--append-system-prompt", system,
            "--output-format", "text",
            "--permission-mode", "dontAsk",
            # Only these built-ins exist for the agent at all; connector (MCP)
            # tools still need to be on the allow-list below.
            "--tools", ",".join(BASE_TOOLS),
            "--allowedTools", ",".join(agent.allowed_tools()),
            "--disallowedTools", ",".join(BLOCKED_TOOLS),
        ]
        if agent.id == "knowledge":
            for d in self.extra_dirs:
                cmd += ["--add-dir", str(d)]
        return cmd

    def think(self, agent: Agent, system: str, prompt: str, cwd: Path, model: Optional[str] = None) -> str:
        reply = self._run(agent, system, prompt, cwd, model)
        if agent.advisor and model is None and reply.lstrip().startswith(ADVISOR_FLAG):
            draft = reply.lstrip()[len(ADVISOR_FLAG):].strip()
            reply = self._run(
                agent,
                system,
                f"{prompt}\n\n---\nThe director's draft (they flagged it as a complex edge-case):\n{draft}\n\n"
                "Review it as their senior advisor and return the corrected final answer.",
                cwd,
                agent.advisor,
            )
        return reply

    def _run(self, agent: Agent, system: str, prompt: str, cwd: Path, model: Optional[str]) -> str:
        proc = subprocess.run(
            self.command(agent, system, model),
            input=prompt,
            capture_output=True,
            text=True,
            cwd=str(cwd),
            timeout=self.timeout,
        )
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "claude exited non-zero").strip()[:500])
        return proc.stdout.strip()


# MCP servers Hermes agents can reach. Tokens come from the environment
# (Hermes expands ${VAR}); every server is limited to read-or-draft tools.
DEFAULT_HERMES_MCP: Dict[str, dict] = {
    "github": {
        "url": "https://api.githubcopilot.com/mcp/",
        "headers": {"Authorization": "Bearer ${GITHUB_TOKEN}"},
        "tools": {"include": [
            "list_issues", "issue_read", "list_pull_requests", "pull_request_read",
            "get_file_contents", "list_commits", "search_repositories", "search_code",
        ]},
    },
    # Gmail has no default URL: point "url" at the Gmail MCP server you use.
    "gmail": {
        "url": "",
        "tools": {"include": ["search_threads", "get_thread", "list_drafts", "create_draft"]},
    },
}


class HermesBrain:
    """One Hermes Agent profile per villager, one ``hermes -z`` run per thought."""

    name = "hermes"

    def __init__(self, binary: str = "hermes", provider: str = "anthropic", timeout: int = 900,
                 mcp: Optional[Dict[str, dict]] = None):
        self.binary = binary
        self.provider = provider
        self.timeout = timeout
        self.mcp = {**DEFAULT_HERMES_MCP, **(mcp or {})}

    @staticmethod
    def available(binary: str = "hermes") -> bool:
        return shutil.which(binary) is not None

    def toolsets(self, agent: Agent) -> List[str]:
        """The switched-on toolsets that are on the agent's belt, minus MCP servers with no URL."""
        on = [t for t in safe_toolsets(agent.active_tools) if t in agent.toolbelt]
        return [t for t in on if not t.startswith("mcp-") or self.mcp.get(t[4:], {}).get("url")]

    def write_profile(self, agent: Agent, system: str, home: Path) -> None:
        """HERMES_HOME for this agent: persona, tool config and its MCP servers."""
        home.mkdir(parents=True, exist_ok=True)
        (home / "SOUL.md").write_text(system + "\n")
        (home / "last_usage.json").unlink(missing_ok=True)
        servers = {t[4:]: self.mcp[t[4:]] for t in self.toolsets(agent) if t.startswith("mcp-")}
        config = {
            "toolsets": self.toolsets(agent),
            "approvals": {"mode": "manual", "cron_mode": "deny", "deny": ["*"]},
            "mcp_servers": servers,
        }
        (home / "config.yaml").write_text(yaml.safe_dump(config, sort_keys=False))

    def command(self, agent: Agent, prompt: str, home: Path, model: Optional[str] = None) -> List[str]:
        return [
            self.binary,
            "-z", prompt,
            "--provider", self.provider,
            "-m", model or agent.model,
            "-t", ",".join(self.toolsets(agent)) or "memory",
            "--usage-file", str(home / "last_usage.json"),
        ]

    def think(self, agent: Agent, system: str, prompt: str, cwd: Path, model: Optional[str] = None) -> str:
        home = cwd / "hermes"
        self.write_profile(agent, system, home)
        reply = self._run(agent, prompt, home, model)
        if agent.advisor and model is None and reply.lstrip().startswith(ADVISOR_FLAG):
            draft = reply.lstrip()[len(ADVISOR_FLAG):].strip()
            reply = self._run(
                agent,
                f"{prompt}\n\n---\nThe director's draft (they flagged it as a complex edge-case):\n{draft}\n\n"
                "Review it as their senior advisor and return the corrected final answer.",
                home,
                agent.advisor,
            )
        return reply

    def _run(self, agent: Agent, prompt: str, home: Path, model: Optional[str]) -> str:
        env = {**os.environ, "HERMES_HOME": str(home)}
        proc = subprocess.run(
            self.command(agent, prompt, home, model),
            capture_output=True, text=True, cwd=str(home), env=env, timeout=self.timeout,
        )
        usage = {}
        try:
            usage = json.loads((home / "last_usage.json").read_text())
        except (OSError, ValueError):
            pass
        # Hermes one-shot exits 0 even when the model call fails and prints the
        # error as the answer; the usage report's "failed" flag is the truth.
        ok = proc.returncode == 0 and not usage.get("failed")
        self._log_decision(agent, prompt, proc, model, usage, ok, home)
        if not ok:
            raise RuntimeError((proc.stdout or proc.stderr or "hermes failed").strip()[-500:])
        return proc.stdout.strip()

    def _log_decision(self, agent: Agent, prompt: str, proc, model: Optional[str], usage: dict, ok: bool, home: Path) -> None:
        """Append one line per Hermes run to the agent's decision log."""
        entry = {
            "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "model": model or agent.model,
            "tools": self.toolsets(agent),
            "prompt": prompt[:300],
            "reply": (proc.stdout or "").strip()[:300],
            "ok": ok,
            "api_calls": usage.get("api_calls"),
            "cost_usd": usage.get("estimated_cost_usd"),
        }
        with (home.parent / "decisions.jsonl").open("a") as fh:
            fh.write(json.dumps(entry) + "\n")
