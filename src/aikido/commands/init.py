"""``aikido init`` — scaffold a new project and initialise git."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from rich.console import Console

from aikido.core import config as cfg
from aikido.core.scaffold import scaffold_project

console = Console()

GITIGNORE = """# aikido
06_dist/*.md
!06_dist/.gitkeep
.aikido/cache/
__pycache__/
*.pyc
"""


def run_init(
    name: str,
    template: str = "default",
    git: bool = True,
    remote: Optional[str] = None,
) -> Path:
    root = Path.cwd() / name
    root.mkdir(parents=True, exist_ok=True)

    created = scaffold_project(root)

    # Write config + gitignore.
    config = {
        "project": {"name": name, "template": template},
        "git": {"enabled": git, "remote": remote},
        "defaults": {"agent": "founder_weekly_review", "focus_area": None},
    }
    cfg.save_config(root, config)

    gitignore = root / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(GITIGNORE)

    readme = root / "README.md"
    if not readme.exists():
        readme.write_text(f"# {name}\n\nAn aikido knowledge base.\n")

    console.print(f"[green]Initialized aikido project:[/green] {root}")
    console.print(f"  Created {len(created)} files across the knowledge tree.")

    if git:
        _init_git(root, remote)

    console.print("\nNext steps:")
    console.print("  cd " + name)
    console.print("  aikido daily        # capture today")
    console.print("  aikido weekly       # aggregate + build agents")
    return root


def _init_git(root: Path, remote: Optional[str]) -> None:
    try:
        from git import Repo  # imported lazily so init works without gitpython at import time

        repo = Repo.init(root)
        repo.git.add(A=True)
        repo.index.commit("chore: initialize aikido knowledge base")
        if remote:
            repo.create_remote("origin", remote)
        console.print("[green]  git repository initialized.[/green]")
    except Exception as e:  # noqa: BLE001 - git is best-effort
        console.print(f"[yellow]  git init skipped: {e}[/yellow]")
