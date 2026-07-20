"""Transcript -> scoped daily, via aikido's prompt + Claude structured output.

aikido builds the *prompt* (the ships-today / parked-deep agent). This module
runs that prompt through Claude and returns a validated daily, then renders it
as an aggregation-compatible Markdown log.
"""

from __future__ import annotations

import pathlib
import tempfile
from typing import List, Optional

import anthropic
from pydantic import BaseModel

from aikido.commands.daily import DailyCapture

# Always use the latest, most capable Claude model for the extraction.
MODEL = "claude-opus-4-8"


class ParkedThread(BaseModel):
    thread: str
    why_parked: str
    next_step: str


class DailyExtract(BaseModel):
    day_type: str
    ships_today: List[str]
    parked_deep: List[ParkedThread]
    blockers: List[str]
    customer_moment: str
    takeaway: str
    tags: List[str]


def build_prompt(transcript: str, title: Optional[str], date: str) -> str:
    """Scaffold a throwaway knowledge base and build the transcript-daily prompt."""
    from aikido.core.scaffold import scaffold_project

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="aikido-kb-"))
    scaffold_project(tmp)
    tfile = tmp / "transcript.txt"
    tfile.write_text(transcript, encoding="utf-8")

    result = DailyCapture(tmp).from_transcript(tfile, meeting_title=title, date=date)
    if not result["success"]:
        raise RuntimeError(f"prompt build failed at {result['stage']}: {result['errors']}")
    return result["artifact"]


def extract_daily(transcript: str, title: Optional[str], date: str) -> DailyExtract:
    """Run the aikido prompt through Claude and return a validated daily."""
    prompt = build_prompt(transcript, title, date)
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment
    response = client.messages.parse(
        model=MODEL,
        max_tokens=16000,
        messages=[{"role": "user", "content": prompt}],
        output_format=DailyExtract,
    )
    return response.parsed_output


def render_daily(daily: DailyExtract, date: str, attendees: Optional[str] = None) -> str:
    """Render the daily as Markdown that `aikido weekly` can still aggregate.

    Keeps the canonical `### Ships` / `### Blockers` / `### Customer Moment` /
    `### Takeaway` headers the weekly aggregator reads, and adds a `### Parked`
    section for the deep threads.
    """
    ships = "\n".join(f"- {s}" for s in daily.ships_today) or "none"
    parked = (
        "\n".join(
            f"- **{p.thread}** — {p.why_parked} → next: {p.next_step}"
            for p in daily.parked_deep
        )
        or "- none"
    )
    blockers = "\n".join(f"- {b}" for b in daily.blockers) or "none"
    tags = " ".join(daily.tags) if daily.tags else "#daily"

    return f"""## Daily Log: {date}
### Type
{daily.day_type}
### Ships
{ships}
### Parked (deep threads)
{parked}
### Blockers
{blockers}
### Customer Moment
{daily.customer_moment or 'none'}
### Takeaway
{daily.takeaway}
### People
{attendees or 'solo'}
### Tags
{tags}
"""
