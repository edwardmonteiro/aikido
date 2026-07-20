"""Interactive daily capture and weekly aggregation of daily logs."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, Prompt

console = Console()

# Tag keyword map: a tag is attached when any of its keywords appears.
TAG_KEYWORDS: Dict[str, List[str]] = {
    "pricing": ["pricing", "price", "seat"],
    "sso": ["sso", "auth"],
    "onboarding": ["onboard", "signup"],
    "churn": ["churn", "cancel"],
    "enterprise": ["enterprise", "sales"],
    "revenue": ["revenue", "mrr"],
    "runway": ["runway", "burn"],
}


def week_of(date: str) -> str:
    """Return the ISO week label (``YYYY-Www``) for a ``YYYY-MM-DD`` date."""
    dt = datetime.strptime(date, "%Y-%m-%d")
    return f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"


def _derive_tags(text: str) -> str:
    lowered = text.lower()
    tags = [f"#{tag}" for tag, kws in TAG_KEYWORDS.items() if any(k in lowered for k in kws)]
    return " ".join(tags) if tags else "#daily"


def _render(data: Dict[str, str]) -> str:
    return f"""## Daily Log: {data['date']}
### Type
{data['type']}
### Ships
{data['ships']}
### Blockers
{data['blockers']}
### Customer Moment
{data['customer']}
### Takeaway
{data['takeaway']}
### People
{data['people']}
### Tags
{data['tags']}"""


class DailyCapture:
    """Guided capture of a single day and aggregation of a week's logs."""

    def __init__(self, project_root: Path):
        self.project_root = Path(project_root)

    # ------------------------------------------------------------------ #
    # Capture
    # ------------------------------------------------------------------ #
    def guided(self, retroactive: Optional[str] = None) -> Path:
        date = retroactive or datetime.now().strftime("%Y-%m-%d")
        week = week_of(date)
        week_dir = self.project_root / "01_weekly_cadence" / week
        week_dir.mkdir(parents=True, exist_ok=True)

        console.print(Panel.fit(f"[bold]Daily Capture: {date}[/bold]", title="aikido"))

        data = {
            "date": date,
            "type": Prompt.ask(
                "Day type",
                choices=["meeting-heavy", "shipping", "firefighting", "planning", "research"],
                default="shipping",
            ),
            "ships": Prompt.ask("Shipped today (or 'none')", default="none"),
            "blockers": Prompt.ask("Blockers (or 'none')", default="none"),
            "customer": Prompt.ask("Customer moment (or 'none')", default="none"),
            "takeaway": Prompt.ask("One sentence takeaway:"),
            "people": Prompt.ask("People involved (or 'solo')", default="solo"),
            "tags": "",
        }

        all_text = f"{data['ships']} {data['blockers']} {data['customer']} {data['takeaway']}"
        data["tags"] = _derive_tags(all_text)

        preview = _render(data)
        console.print(Panel(preview, title="Preview"))

        if Confirm.ask("Save?", default=True):
            path = week_dir / f"{date}_daily.md"
            path.write_text(preview)
            console.print(f"[green]Saved: {path}[/green]")
            return path
        return self.guided(retroactive)

    def from_transcript(
        self,
        transcript_path: Path,
        meeting_title: Optional[str] = None,
        date: Optional[str] = None,
    ) -> Dict:
        """Build a scope-disciplined daily prompt from a meeting transcript.

        aikido produces the *prompt* (the LLM runs it to yield the daily). The
        transcript is inlined into the ``daily_from_transcript`` agent, which
        separates today's shippable scope from deep threads that must be parked.
        """
        from aikido.core.transpiler import AikidoTranspiler

        transcript_path = Path(transcript_path)
        text = transcript_path.read_text(encoding="utf-8")
        date = date or datetime.now().strftime("%Y-%m-%d")
        week = week_of(date)

        transpiler = AikidoTranspiler(self.project_root)
        return transpiler.build(
            "daily_from_transcript",
            week=week,
            transcript=text,
            meeting_title=meeting_title or transcript_path.stem,
            date=date,
        )

    def save(self, data: Dict[str, str]) -> Path:
        """Non-interactive save (used by tests / scripted capture)."""
        date = data["date"]
        week = week_of(date)
        week_dir = self.project_root / "01_weekly_cadence" / week
        week_dir.mkdir(parents=True, exist_ok=True)
        data.setdefault("people", "solo")
        all_text = f"{data.get('ships','')} {data.get('blockers','')} {data.get('customer','')} {data.get('takeaway','')}"
        data.setdefault("tags", _derive_tags(all_text))
        path = week_dir / f"{date}_daily.md"
        path.write_text(_render(data))
        return path

    # ------------------------------------------------------------------ #
    # Aggregation
    # ------------------------------------------------------------------ #
    def aggregate(self, week: str) -> Dict[str, Path]:
        week_dir = self.project_root / "01_weekly_cadence" / week
        files = sorted(week_dir.glob("*_daily.md"))

        decisions: List[str] = []
        blockers: List[str] = []
        signals: List[str] = []
        summaries: List[str] = []

        for f in files:
            c = f.read_text()
            d = f.stem.replace("_daily", "")

            m = re.search(r"### Ships\n(.+?)(?=\n###)", c, re.DOTALL)
            if m and m.group(1).strip() != "none":
                decisions.append(f"- [{d}] Shipped: {m.group(1).strip()}")

            m = re.search(r"### Blockers\n(.+?)(?=\n###)", c, re.DOTALL)
            if m and m.group(1).strip() != "none":
                blockers.append(f"- [{d}] {m.group(1).strip()}")

            m = re.search(r"### Customer Moment\n(.+?)(?=\n###)", c, re.DOTALL)
            if m and m.group(1).strip() != "none":
                signals.append(f"- [{d}] {m.group(1).strip()}")

            m = re.search(r"### Takeaway\n(.+?)(?=\n###)", c, re.DOTALL)
            if m:
                summaries.append(f"- **{d}:** {m.group(1).strip()}")

        week_dir.mkdir(parents=True, exist_ok=True)
        (week_dir / "decisions.md").write_text(
            f"## Decisions This Week\n\n{chr(10).join(decisions) or '- None'}\n"
        )
        (week_dir / "blockers.md").write_text(
            f"## Blockers This Week\n\n{chr(10).join(blockers) or '- None'}\n"
        )
        (week_dir / "customer_signals.md").write_text(
            f"## Customer Signals This Week\n\n{chr(10).join(signals) or '- None'}\n"
        )
        (week_dir / "daily_summary.md").write_text(
            f"## Daily Takeaways Summary\n\n{chr(10).join(summaries) or '- None'}\n"
        )

        return {
            "decisions": week_dir / "decisions.md",
            "blockers": week_dir / "blockers.md",
            "customer_signals": week_dir / "customer_signals.md",
            "daily_summary": week_dir / "daily_summary.md",
        }
