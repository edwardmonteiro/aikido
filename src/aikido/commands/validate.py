"""``aikido validate`` — check the knowledge base for integrity problems."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

from rich.console import Console
from rich.table import Table

from aikido.core.transpiler import AikidoTranspiler

console = Console()

STALE_DAYS = 30


def run_validate(project_root: Path, path: Optional[str] = None, fix: bool = False) -> Dict:
    project_root = Path(project_root)
    transpiler = AikidoTranspiler(project_root)

    agents_dir = project_root / "05_agents"
    contracts_dir = project_root / "04_contracts"

    findings: List[Dict[str, str]] = []

    templates = sorted(agents_dir.glob("*.prompt.md")) if agents_dir.is_dir() else []
    if path:
        templates = [t for t in templates if str(t).endswith(path) or t.name == path]

    for tpl in templates:
        rel = tpl.relative_to(project_root).as_posix()
        name = tpl.name[: -len(".prompt.md")]

        # Broken static includes.
        try:
            for err in transpiler.validate_includes(rel, {}):
                findings.append({"file": rel, "kind": "include", "detail": err})
        except Exception as e:  # noqa: BLE001
            findings.append({"file": rel, "kind": "parse", "detail": str(e)})

        # Contract mismatches (only for non-partial templates with a contract).
        contract_path = contracts_dir / f"{name}.json"
        if not name.startswith("_") and contract_path.exists():
            crel = contract_path.relative_to(project_root).as_posix()
            try:
                for err in transpiler.validate_contract(rel, crel):
                    findings.append({"file": rel, "kind": "contract", "detail": err})
            except Exception as e:  # noqa: BLE001
                findings.append({"file": rel, "kind": "contract", "detail": str(e)})

        # Undefined variables (informational — dynamic includes are expected).
        try:
            deps = transpiler.parse_dependencies(rel)
            known = {"contract", "job", "week", "focus_area", "emergency", "load_json"}
            for var in deps["variables"]:
                if var not in known:
                    findings.append(
                        {"file": rel, "kind": "variable", "detail": f"Undeclared variable: {var}"}
                    )
        except Exception:  # noqa: BLE001
            pass

    # Stale files across the knowledge base.
    cutoff = datetime.now() - timedelta(days=STALE_DAYS)
    for md in project_root.rglob("*.md"):
        if "06_dist" in md.parts or "07_archive" in md.parts:
            continue
        try:
            mtime = datetime.fromtimestamp(md.stat().st_mtime)
        except OSError:
            continue
        if mtime < cutoff:
            findings.append(
                {
                    "file": md.relative_to(project_root).as_posix(),
                    "kind": "stale",
                    "detail": f"Not modified since {mtime:%Y-%m-%d}",
                }
            )

    _render(findings)
    return {"ok": len([f for f in findings if f["kind"] != "stale"]) == 0, "findings": findings}


def _render(findings: List[Dict[str, str]]) -> None:
    if not findings:
        console.print("[green]Validation passed: no issues found.[/green]")
        return
    table = Table(title="Validation Findings")
    table.add_column("File", style="cyan")
    table.add_column("Kind", style="magenta")
    table.add_column("Detail")
    for f in findings:
        table.add_row(f["file"], f["kind"], f["detail"])
    console.print(table)
