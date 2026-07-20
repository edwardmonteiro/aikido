#!/usr/bin/env python3
"""Generate docs/commands.html from the live aikido CLI.

The command reference is a build artifact of the tool itself: this script
introspects the actual Typer app (so option names, defaults, and the
Typer-generated ``--no-`` negations can never drift from the code), merges in
curated prose/examples from ``docs/commands.meta.json``, and renders the page
through aikido's OWN transpiler (``AikidoTranspiler``) — the same Jinja2 engine
that builds agents.

Usage:
    python scripts/gen_docs.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Make ``src/`` importable when run from a source checkout.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

import typer.main  # noqa: E402
from typer.core import TyperArgument  # noqa: E402

from aikido.cli import app  # noqa: E402
from aikido.core.transpiler import AikidoTranspiler  # noqa: E402

DOCS = ROOT / "docs"
META_PATH = DOCS / "commands.meta.json"
TEMPLATE = "_templates/commands.html.j2"
OUTPUT = DOCS / "commands.html"

_CODE = re.compile(r"`([^`]+)`")


def md_inline(text: str) -> str:
    """Convert inline `code` spans to <code> so descriptions render as HTML."""
    return _CODE.sub(r"<code>\1</code>", text or "")


def summary_of(command, meta_cmd) -> str:
    if meta_cmd.get("summary"):
        return md_inline(meta_cmd["summary"])
    first = (command.help or "").strip().split("\n")[0]
    return md_inline(first)


def default_str(param, override):
    if override is not None:
        return override
    if isinstance(param, TyperArgument):
        return ""
    if getattr(param, "is_flag", False):
        # Boolean flag with a --x / --no-x pair.
        return param.opts[0] if param.default else "false"
    if param.default in (None, ""):
        return ""
    return str(param.default)


def primary_key(param) -> str:
    """The meta key for a param: arg name, or its first long option."""
    if isinstance(param, TyperArgument):
        return param.name
    return param.opts[0]


def build_command(name, command, meta_cmd):
    params = []
    param_meta = meta_cmd.get("params", {})
    default_overrides = meta_cmd.get("defaults", {})
    for p in command.params:
        opts = list(p.opts) + list(getattr(p, "secondary_opts", []))
        display = p.name if isinstance(p, TyperArgument) else " / ".join(opts)
        key = primary_key(p)
        params.append(
            {
                "display": display,
                "default": default_str(p, default_overrides.get(key)),
                "desc": md_inline(param_meta.get(key, "")),
                "required": bool(p.required) and isinstance(p, TyperArgument),
            }
        )
    return {
        "name": name,
        "summary": summary_of(command, meta_cmd),
        "examples": meta_cmd.get("examples", []),
        "params": params,
        "note": md_inline(meta_cmd.get("note", "")),
    }


def main() -> int:
    meta = json.loads(META_PATH.read_text())
    group = typer.main.get_command(app)
    cli_commands = group.commands

    commands = []
    for name in meta["order"]:
        if name not in cli_commands:
            print(f"warning: '{name}' in meta order but not in CLI", file=sys.stderr)
            continue
        commands.append(build_command(name, cli_commands[name], meta["commands"].get(name, {})))

    # Flag any CLI command missing from the docs so they can't silently drift.
    for name in cli_commands:
        if name not in meta["order"]:
            print(f"warning: CLI command '{name}' missing from commands.meta.json", file=sys.stderr)

    # Render through aikido's own transpiler (docs/ as the project root).
    transpiler = AikidoTranspiler(DOCS)
    html = transpiler.transpile(TEMPLATE, {"commands": commands})
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({len(commands)} commands, {len(html.split())} words)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
