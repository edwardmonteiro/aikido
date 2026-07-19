"""Knowledge-base operations: update, sync, archive, onboard, investor, dashboard.

These commands operate on the flat-file knowledge base. Network integrations
(Notion/Linear/Slack/Stripe) are implemented as pluggable stubs that write
well-formed Markdown so downstream transpilation always has valid targets.
"""

from __future__ import annotations

import tarfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from aikido.commands.weekly import _discover_agents

console = Console()


# --------------------------------------------------------------------------- #
# update
# --------------------------------------------------------------------------- #
def run_update(
    project_root: Path,
    path: str,
    from_source: Optional[str] = None,
    url: Optional[str] = None,
    tickets: Optional[str] = None,
) -> Path:
    """Append/update a domain-knowledge or support-theme file."""
    project_root = Path(project_root)
    dest = project_root / path
    dest.parent.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y-%m-%d")
    header = f"\n\n<!-- updated {stamp}"
    if from_source:
        header += f" from {from_source}"
    if url:
        header += f" ({url})"
    if tickets:
        header += f" tickets={tickets}"
    header += " -->\n"

    body = f"## Update {stamp}\n\n- Source: {from_source or url or tickets or 'manual'}\n"
    existing = dest.read_text() if dest.exists() else f"# {dest.stem.replace('_', ' ').title()}\n"
    dest.write_text(existing + header + body)
    console.print(f"[green]Updated:[/green] {dest}")
    return dest


# --------------------------------------------------------------------------- #
# sync
# --------------------------------------------------------------------------- #
SYNC_TARGETS = {
    "notion": "02_domain_knowledge/product/roadmap.md",
    "linear": "02_domain_knowledge/product/roadmap.md",
    "slack": "03_support_tickets/themes/feature_requests.md",
    "stripe": "02_domain_knowledge/go_to_market/pricing.md",
}


def run_sync(
    project_root: Path,
    from_source: str,
    to_path: Optional[str] = None,
    channel: Optional[str] = None,
    since: Optional[str] = None,
) -> Path:
    """Pull from an external source into the knowledge base (stubbed fetch)."""
    project_root = Path(project_root)
    source = from_source.lower()
    rel = to_path or SYNC_TARGETS.get(source)
    if rel is None:
        raise ValueError(f"Unknown sync source '{from_source}' and no --to-path given")

    dest = project_root / rel
    dest.parent.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y-%m-%d")
    note = (
        f"\n\n## Synced from {from_source} ({stamp})\n\n"
        f"- channel: {channel or 'n/a'}\n"
        f"- since: {since or 'beginning'}\n"
        f"- items: 0 (configure credentials to enable live pull)\n"
    )
    existing = dest.read_text() if dest.exists() else f"# {dest.stem.replace('_', ' ').title()}\n"
    dest.write_text(existing + note)
    console.print(f"[green]Synced {from_source} ->[/green] {dest}")
    return dest


# --------------------------------------------------------------------------- #
# archive
# --------------------------------------------------------------------------- #
def run_archive(project_root: Path, weeks: str, compress: bool = True) -> List[Path]:
    """Move/compress old weekly directories into the archive."""
    project_root = Path(project_root)
    cadence = project_root / "01_weekly_cadence"
    archive_dir = project_root / "07_archive"
    archive_dir.mkdir(parents=True, exist_ok=True)

    week_ids = _expand_weeks(weeks)
    archived: List[Path] = []

    for wk in week_ids:
        wdir = cadence / wk
        if not wdir.is_dir():
            console.print(f"[yellow]No such week: {wk}[/yellow]")
            continue
        if compress:
            out = archive_dir / f"{wk}.tar.gz"
            with tarfile.open(out, "w:gz") as tar:
                tar.add(wdir, arcname=wk)
            archived.append(out)
            console.print(f"[green]Archived {wk} ->[/green] {out}")
        else:
            summary = archive_dir / f"{wk}_summary.md"
            files = sorted(wdir.glob("*.md"))
            summary.write_text(
                f"# Archive summary: {wk}\n\nFiles: {len(files)}\n"
                + "\n".join(f"- {f.name}" for f in files)
                + "\n"
            )
            archived.append(summary)
            console.print(f"[green]Summarized {wk} ->[/green] {summary}")

    return archived


def _expand_weeks(weeks: str) -> List[str]:
    """Expand ``2026-W01..2026-W03`` ranges and comma lists into week ids."""
    result: List[str] = []
    for chunk in weeks.split(","):
        chunk = chunk.strip()
        if ".." in chunk:
            start, end = chunk.split("..")
            sy, sw = _parse_week(start)
            ey, ew = _parse_week(end)
            if sy == ey:
                for w in range(sw, ew + 1):
                    result.append(f"{sy}-W{w:02d}")
            else:
                result.append(start)
                result.append(end)
        elif chunk:
            result.append(chunk)
    return result


def _parse_week(label: str) -> tuple[int, int]:
    year, week = label.split("-W")
    return int(year), int(week)


# --------------------------------------------------------------------------- #
# onboard
# --------------------------------------------------------------------------- #
def run_onboard(
    project_root: Path,
    name: str,
    role: str,
    from_week: Optional[str] = None,
) -> Path:
    project_root = Path(project_root)
    dest_dir = project_root / "06_dist"
    dest_dir.mkdir(parents=True, exist_ok=True)

    control = project_root / "00_control_plane" / "founder_identity.md"
    identity = control.read_text() if control.exists() else "# Founder Identity\n"

    weeks: List[str] = []
    cadence = project_root / "01_weekly_cadence"
    if cadence.is_dir():
        weeks = sorted(p.name for p in cadence.iterdir() if p.is_dir())
    if from_week:
        weeks = [w for w in weeks if w >= from_week]

    brief = f"""# Onboarding Brief: {name} ({role})

{identity}

## What you need to know
- Role: {role}
- Weeks of context available: {', '.join(weeks) or 'none yet'}

## Start here
1. Read the control plane in `00_control_plane/`.
2. Skim the most recent weekly summary in `01_weekly_cadence/`.
3. Ask about the current top priority.
"""
    dest = dest_dir / f"onboarding_{name.lower().replace(' ', '_')}.md"
    dest.write_text(brief)
    console.print(f"[green]Onboarding brief:[/green] {dest}")
    return dest


# --------------------------------------------------------------------------- #
# investor
# --------------------------------------------------------------------------- #
def run_investor(
    project_root: Path,
    brief: bool = True,
    since: str = "last_board_meeting",
    format: str = "email",
) -> Path:
    project_root = Path(project_root)
    dest_dir = project_root / "06_dist"
    dest_dir.mkdir(parents=True, exist_ok=True)

    signals: List[str] = []
    cadence = project_root / "01_weekly_cadence"
    if cadence.is_dir():
        for cs in sorted(cadence.glob("*/customer_signals.md")):
            signals.append(cs.read_text().strip())

    body = "\n\n".join(signals) if signals else "- No customer signals captured yet."
    stamp = datetime.now().strftime("%Y-%m-%d")

    if format == "email":
        content = f"""Subject: Investor Update — {stamp}

Hi all,

Quick update since {since}.

Highlights:
{body}

More soon,
The team
"""
    else:
        content = f"# Investor Update ({stamp})\n\nSince: {since}\n\n## Highlights\n\n{body}\n"

    dest = dest_dir / f"investor_update_{stamp}.md"
    dest.write_text(content)
    console.print(f"[green]Investor update ({format}):[/green] {dest}")
    return dest


# --------------------------------------------------------------------------- #
# dashboard
# --------------------------------------------------------------------------- #
def run_dashboard(
    project_root: Path,
    my_agents: bool = False,
    status: bool = True,
    stale: bool = False,
) -> Dict:
    project_root = Path(project_root)

    weeks = []
    cadence = project_root / "01_weekly_cadence"
    if cadence.is_dir():
        weeks = sorted(p.name for p in cadence.iterdir() if p.is_dir())

    agents = _discover_agents(project_root)
    artifacts = sorted((project_root / "06_dist").glob("*.md")) if (project_root / "06_dist").is_dir() else []

    console.print(Panel.fit("[bold]aikido dashboard[/bold]", title="Knowledge System Health"))

    table = Table(show_header=True, header_style="bold")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    table.add_row("Weeks captured", str(len(weeks)))
    table.add_row("Agents defined", str(len(agents)))
    table.add_row("Artifacts built", str(len(artifacts)))
    table.add_row("Latest week", weeks[-1] if weeks else "—")
    console.print(table)

    if my_agents and agents:
        console.print("\n[bold]Agents:[/bold] " + ", ".join(agents))

    if stale:
        from aikido.commands.validate import run_validate

        result = run_validate(project_root)
        stale_files = [f for f in result["findings"] if f["kind"] == "stale"]
        console.print(f"\n[bold]Stale files:[/bold] {len(stale_files)}")

    return {
        "weeks": weeks,
        "agents": agents,
        "artifacts": [str(a) for a in artifacts],
    }
