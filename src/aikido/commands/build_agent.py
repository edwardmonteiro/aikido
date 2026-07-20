"""``aikido build_agent`` — transpile one agent template into an artifact."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from rich.console import Console

from aikido.core.transpiler import AikidoTranspiler

console = Console()


def run_build_agent(
    project_root: Path,
    agent: str,
    week: Optional[str] = None,
    focus_area: Optional[str] = None,
    emergency: bool = False,
) -> dict:
    transpiler = AikidoTranspiler(project_root)
    kwargs = {}
    if focus_area is not None:
        kwargs["focus_area"] = focus_area
    if emergency:
        kwargs["emergency"] = True

    result = transpiler.build(agent, week=week, **kwargs)

    if result["success"]:
        console.print(f"[green]Built {agent}[/green]")
        console.print(f"  Artifact: {result['path']}")
        console.print(f"  Word count: {result['word_count']}")
    else:
        console.print(f"[red]Build failed at stage '{result['stage']}':[/red]")
        for err in result["errors"]:
            console.print(f"  - {err}")
    return result
