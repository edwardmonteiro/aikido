"""How a villager thinks.

``ClaudeBrain`` shells out to the local ``claude`` CLI in headless mode
(``claude -p``). That runs on the user's Claude subscription — no API key is
read or required. Each call is sandboxed to the agent's own folder with an
explicit tool allow-list and ``--permission-mode dontAsk``, so any tool not
pre-approved is denied rather than prompted for.

``OfflineBrain`` answers deterministically so the village works (and tests
run) on machines without the CLI.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import List, Optional, Protocol

from aikido.village.roster import BASE_TOOLS, BLOCKED_TOOLS, Agent

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
