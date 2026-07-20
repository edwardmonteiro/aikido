"""``aikido weekly`` — aggregate daily logs, then transpile agents."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from rich.console import Console

from aikido.commands.daily import DailyCapture, week_of
from aikido.core.transpiler import AikidoTranspiler

console = Console()


def current_week() -> str:
    now = datetime.now()
    return f"{now.isocalendar()[0]}-W{now.isocalendar()[1]:02d}"


def run_weekly(
    project_root: Path,
    week: Optional[str] = None,
    build: bool = True,
    partial: bool = False,
) -> Dict:
    week = week or current_week()
    console.print(f"[bold]Weekly build for {week}[/bold]")

    capture = DailyCapture(project_root)
    outputs = capture.aggregate(week)
    console.print("[green]Aggregated daily logs:[/green]")
    for label, path in outputs.items():
        console.print(f"  - {label}: {path}")

    result: Dict = {"week": week, "aggregated": {k: str(v) for k, v in outputs.items()}, "builds": []}

    if not build:
        return result

    # Transpile every agent that has both a template and a contract.
    transpiler = AikidoTranspiler(project_root)
    agents = _discover_agents(project_root)
    if not agents:
        console.print("[yellow]No agents found to build.[/yellow]")
    for agent in agents:
        r = transpiler.build(agent, week=week)
        result["builds"].append({"agent": agent, **{k: r.get(k) for k in ("success", "stage", "path", "errors")}})
        if r["success"]:
            console.print(f"[green]Built {agent}:[/green] {r['path']} ({r['word_count']} words)")
        elif partial:
            console.print(f"[yellow]Skipped {agent} ({r['stage']}): {r['errors']}[/yellow]")
        else:
            console.print(f"[red]Failed {agent} ({r['stage']}):[/red] {r['errors']}")

    return result


def _discover_agents(project_root: Path) -> List[str]:
    agents_dir = Path(project_root) / "05_agents"
    contracts_dir = Path(project_root) / "04_contracts"
    if not agents_dir.is_dir():
        return []
    found: List[str] = []
    for p in sorted(agents_dir.glob("*.prompt.md")):
        name = p.name[: -len(".prompt.md")]
        if name.startswith("_"):
            continue  # skip base/partials
        if (contracts_dir / f"{name}.json").exists():
            found.append(name)
    return found
