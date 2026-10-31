"""The village org chart: who lives where, which model they run, what they may touch.

Hierarchy (top to bottom):

- **Chief Human Officer** — you. Supervisor and human-in-the-loop.
- **Chief of Staff** — runs daily operations, routes your tasks to directors.
- **Directors** — seven department heads, each with their own house + folder.
  Complex edge-cases escalate to an advisor model.
- **Workers** — interns in yellow vests that run routine tasks for a director.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

OPUS = "claude-opus-5-5"
SONNET = "claude-sonnet-5-5"
ADVISOR = "claude-fable-5-1"

# Tools every agent may use inside its own folder. Headless `claude -p` denies
# anything not on the allow-list, so this list *is* the permission boundary.
BASE_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"]

# Tools that send, publish, buy or delete are never granted, whatever a
# connector exposes. ``safe_tools`` enforces this in code: a configured tool
# whose name matches is dropped before it ever reaches the CLI allow-list.
BLOCKED_TOOLS = ["Bash", "WebFetch", "WebSearch"]
_UNSAFE_TOOL = re.compile(
    r"send|publish|post|upload|purchase|pay|checkout|transfer|trade|order|delete|trash|share|forward",
    re.IGNORECASE,
)


def safe_tools(tools: List[str]) -> List[str]:
    """Drop blocked or side-effecting tools (guardrails 1–3)."""
    return [t for t in tools if t not in BLOCKED_TOOLS and not _UNSAFE_TOOL.search(t)]


@dataclass
class Agent:
    id: str
    name: str
    title: str
    role: str  # "chief_of_staff" | "director" | "worker"
    model: str
    house: str
    domain: str
    keywords: List[str] = field(default_factory=list)
    tools: List[str] = field(default_factory=list)
    reports_to: Optional[str] = None
    palette: Dict[str, str] = field(default_factory=dict)
    connectors: List[str] = field(default_factory=list)
    advisor: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)

    def allowed_tools(self) -> List[str]:
        return BASE_TOOLS + safe_tools(self.tools)


@dataclass
class House:
    id: str
    label: str
    theme: str
    owner: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


# Ten buildings around the town square. Town Hall is the HQ / meeting room.
HOUSES: List[House] = [
    House("town_hall", "Town Hall", "hall", "chief_of_staff"),
    House("inbox", "Inbox House", "mail", "inbox"),
    House("studio", "Content Studio", "studio", "content"),
    House("bank", "Money House", "bank", "finance"),
    House("library", "Research Library", "library", "research"),
    House("travel", "Travel Lodge", "travel", "travel"),
    House("workshop", "Code Workshop", "workshop", "engineering"),
    House("archive", "Knowledge Archive", "archive", "knowledge"),
    House("recruiting", "Recruiting Office", "recruiting", None),
    House("home", "Your Home", "home", None),
]


# Connector tools as the `claude` CLI names them: claude.ai connectors appear as
# `mcp__claude_ai_<Name>__<tool>`, a locally added GitHub MCP server as
# `mcp__github__<tool>`. Read and draft only; sending is never on the list.
GMAIL_TOOLS = [
    "mcp__claude_ai_Gmail__search_threads",
    "mcp__claude_ai_Gmail__get_thread",
    "mcp__claude_ai_Gmail__list_drafts",
    "mcp__claude_ai_Gmail__create_draft",
]
GITHUB_TOOLS = [
    "mcp__github__list_issues",
    "mcp__github__issue_read",
    "mcp__github__list_pull_requests",
    "mcp__github__pull_request_read",
    "mcp__github__get_file_contents",
    "mcp__github__list_commits",
    "mcp__github__search_repositories",
    "mcp__github__search_code",
]


def _director(id, name, title, house, domain, keywords, tools, palette, connectors=None) -> Agent:
    return Agent(
        id=id,
        name=name,
        title=title,
        role="director",
        model=OPUS,
        house=house,
        domain=domain,
        keywords=keywords,
        tools=tools,
        reports_to="chief_of_staff",
        palette=palette,
        advisor=ADVISOR,
        connectors=connectors or [],
    )


def default_roster(chief_name: str = "Matt") -> List[Agent]:
    chief = Agent(
        id="chief_of_staff",
        name=chief_name,
        title="Chief of Staff",
        role="chief_of_staff",
        model=OPUS,
        house="town_hall",
        domain="Daily operations: triages the human's to-dos, routes each one to the right "
        "director, chases status and runs Town Hall meetings.",
        palette={"shirt": "#2f3b52", "pants": "#1d2333", "hair": "#4a3426", "skin": "#e0b48c"},
    )
    directors = [
        _director(
            "inbox", "Iris", "Inbox Director", "inbox",
            "Email and calendar: triage, summarise threads, draft replies, propose meeting times. "
            "Can search and read Gmail and save drafts; never sends.",
            ["email", "inbox", "gmail", "reply", "calendar", "meeting", "schedule", "invite", "mail"],
            GMAIL_TOOLS,
            {"shirt": "#c0504d", "pants": "#3b2a2a", "hair": "#1f1a17", "skin": "#c68e6a"},
            ["Gmail"],
        ),
        _director(
            "content", "Cole", "Content Director", "studio",
            "Video and social content: scripts, hooks, titles, thumbnails briefs, posting calendars "
            "(drafts only — never publishes).",
            ["youtube", "video", "script", "content", "thumbnail", "post", "social", "newsletter"],
            [],
            {"shirt": "#e07b39", "pants": "#2b2b3a", "hair": "#a0522d", "skin": "#f1c27d"},
        ),
        _director(
            "finance", "Penny", "Money Director", "bank",
            "Finance and corporate banking: budgets, cash-flow forecasts, covenant and treasury "
            "checks, portfolio notes. Analysis only — never moves money or places trades.",
            ["money", "budget", "invoice", "stock", "trade", "cash", "finance", "bank",
             "covenant", "treasury", "loan", "forecast", "expense"],
            [],
            {"shirt": "#3a7d44", "pants": "#22312a", "hair": "#d9b26f", "skin": "#f3d3b5"},
        ),
        _director(
            "research", "Reed", "Research Director", "library",
            "Deep research: market scans, competitor teardowns, literature reviews, cited reports.",
            ["research", "report", "compare", "analyse", "analyze", "market", "study", "paper"],
            [],
            {"shirt": "#5b5ea6", "pants": "#25263f", "hair": "#2e2e2e", "skin": "#8d5524"},
        ),
        _director(
            "travel", "Tess", "Travel Director", "travel",
            "Trips and logistics: itineraries, packing lists, visa checklists. Proposes bookings, "
            "never books or pays.",
            ["travel", "trip", "flight", "hotel", "itinerary", "vacation", "visa", "packing"],
            [],
            {"shirt": "#2a9d8f", "pants": "#1e3a3a", "hair": "#7b3f00", "skin": "#e8b896"},
        ),
        _director(
            "engineering", "Ezra", "Engineering Director", "workshop",
            "Code and automation: specs, scripts, code reviews, technical plans. Can read GitHub "
            "repositories, issues, pull requests and commits; never pushes, merges or comments.",
            ["code", "bug", "script", "deploy", "github", "pr", "api", "automation", "build",
             "repo", "issue", "issues", "commit", "commits"],
            GITHUB_TOOLS,
            {"shirt": "#6c757d", "pants": "#212529", "hair": "#111111", "skin": "#d1a17a"},
            ["GitHub"],
        ),
        _director(
            "knowledge", "Kai", "Knowledge Director", "archive",
            "The aikido knowledge base: daily logs, weekly rollups, decisions, onboarding briefs, "
            "investor-update drafts.",
            ["daily", "weekly", "notes", "knowledge", "decision", "onboard", "investor", "summary"],
            [],
            {"shirt": "#8e6c8a", "pants": "#2d2330", "hair": "#c9c9c9", "skin": "#f0c8a0"},
        ),
    ]
    return [chief] + directors


def make_worker(director: Agent, index: int, name: str) -> Agent:
    """A yellow-vested intern reporting to ``director``. Routine tasks, Sonnet model."""
    return Agent(
        id=f"{director.id}_worker_{index}",
        name=name,
        title=f"{director.title.replace(' Director', '')} Intern",
        role="worker",
        model=SONNET,
        house=director.house,
        domain=f"Routine tasks delegated by {director.name} ({director.title}).",
        keywords=[],
        tools=[],
        reports_to=director.id,
        palette={"shirt": "#f5d300", "pants": "#3a3a3a", "hair": "#5a3825", "skin": "#e0ac69"},
    )


_WORD = re.compile(r"[a-z]+")


def route_task(text: str, agents: List[Agent]) -> Agent:
    """The Chief of Staff's dispatch rule: best keyword overlap wins; ties and
    misses stay with the Chief of Staff."""
    words = set(_WORD.findall(text.lower()))
    best: Optional[Agent] = None
    best_score = 0
    for agent in agents:
        if agent.role != "director":
            continue
        score = sum(1 for kw in agent.keywords if kw in words)
        if score > best_score:
            best, best_score = agent, score
    if best is None:
        return next(a for a in agents if a.role == "chief_of_staff")
    return best


def identity_markdown(agent: Agent, boss: Optional[Agent]) -> str:
    reports = f"{boss.name} ({boss.title})" if boss else "the Chief Human Officer (the user)"
    return (
        f"# {agent.name} — {agent.title}\n\n"
        f"- **Role:** {agent.role.replace('_', ' ')}\n"
        f"- **Lives in:** {agent.house.replace('_', ' ')}\n"
        f"- **Reports to:** {reports}\n"
        f"- **Model:** {agent.model}"
        + (f" (advisor: {agent.advisor})" if agent.advisor else "")
        + "\n\n"
        f"## Domain\n\n{agent.domain}\n"
    )


def ensure_folders(village_root: Path, agents: List[Agent]) -> None:
    """One folder per agent with identity.md and a persistent notes.md."""
    by_id = {a.id: a for a in agents}
    for agent in agents:
        folder = village_root / "agents" / agent.id
        (folder / "deliverables").mkdir(parents=True, exist_ok=True)
        identity = folder / "identity.md"
        if not identity.exists():
            identity.write_text(identity_markdown(agent, by_id.get(agent.reports_to or "")))
        notes = folder / "notes.md"
        if not notes.exists():
            notes.write_text(f"# {agent.name}'s notes\n\nLong-term memory. Newest entries at the bottom.\n")
