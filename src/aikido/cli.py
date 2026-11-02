"""aikido CLI — AI-native knowledge & decision operations."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from aikido import __version__
from aikido.core import config as cfg

app = typer.Typer(
    help="AI-native knowledge & decision operations",
    rich_markup_mode="markdown",
    no_args_is_help=True,
    add_completion=False,
)
console = Console()


def _require_root() -> Path:
    """Resolve the enclosing aikido project or exit with a helpful message."""
    root = cfg.find_project_root()
    if root is None:
        console.print("[red]Not inside an aikido project.[/red] Run `aikido init <name>` first.")
        raise typer.Exit(code=1)
    return root


def _version_callback(value: bool) -> None:
    if value:
        console.print(f"aikido {__version__}")
        raise typer.Exit()


@app.callback()
def _main(
    version: bool = typer.Option(
        False, "--version", callback=_version_callback, is_eager=True, help="Show version and exit."
    ),
) -> None:
    """AI-native knowledge & decision operations."""


# --------------------------------------------------------------------------- #
@app.command()
def init(
    name: str,
    template: str = "default",
    git: bool = True,
    remote: Optional[str] = None,
) -> None:
    """Initialize project. Create all dirs, default templates, contracts, git init."""
    from aikido.commands.init import run_init

    run_init(name, template=template, git=git, remote=remote)


@app.command()
def daily(
    guided: bool = True,
    retroactive: Optional[str] = None,
    from_transcript: Optional[str] = None,
    title: Optional[str] = None,
    date: Optional[str] = None,
) -> None:
    """Daily capture. Interactive by default, or `--from-transcript` off a meeting.

    Saves to `01_weekly_cadence/{week}/{date}_daily.md` (guided), or builds a
    scope-disciplined daily prompt from a transcript (`--from-transcript`).
    """
    from aikido.commands.daily import DailyCapture

    root = _require_root()
    capture = DailyCapture(root)

    if from_transcript:
        result = capture.from_transcript(from_transcript, meeting_title=title, date=date)
        if result["success"]:
            console.print(f"[green]Built transcript daily prompt[/green] ({result['word_count']} words)")
            console.print(f"  Artifact: {result['path']}")
            console.print("  Run it in your LLM to get the scoped daily (ships-today vs parked-deep).")
        else:
            console.print(f"[red]Build failed at stage '{result['stage']}':[/red]")
            for err in result["errors"]:
                console.print(f"  - {err}")
        return

    if guided:
        capture.guided(retroactive=retroactive)
    else:
        console.print("[yellow]Non-guided capture requires --guided for now.[/yellow]")


@app.command()
def weekly(build: bool = True, partial: bool = False, week: Optional[str] = None) -> None:
    """Aggregate daily logs into weekly summaries, then transpile agents."""
    from aikido.commands.weekly import run_weekly

    root = _require_root()
    run_weekly(root, week=week, build=build, partial=partial)


@app.command()
def update(
    path: str,
    from_source: Optional[str] = None,
    url: Optional[str] = None,
    tickets: Optional[str] = None,
) -> None:
    """Update domain knowledge or support themes."""
    from aikido.commands.knowledge import run_update

    root = _require_root()
    run_update(root, path, from_source=from_source, url=url, tickets=tickets)


@app.command(name="build_agent")
def build_agent(
    agent: str,
    week: Optional[str] = None,
    focus_area: Optional[str] = None,
    emergency: bool = False,
) -> None:
    """Transpile Jinja2 template + contract -> flat Markdown artifact in `06_dist/`."""
    from aikido.commands.build_agent import run_build_agent

    root = _require_root()
    result = run_build_agent(root, agent, week=week, focus_area=focus_area, emergency=emergency)
    if not result["success"]:
        raise typer.Exit(code=1)


@app.command()
def sync(
    from_source: str,
    to_path: Optional[str] = None,
    channel: Optional[str] = None,
    since: Optional[str] = None,
) -> None:
    """Pull from Notion, Linear, Slack, Stripe into knowledge base."""
    from aikido.commands.knowledge import run_sync

    root = _require_root()
    run_sync(root, from_source, to_path=to_path, channel=channel, since=since)


@app.command()
def archive(weeks: str, compress: bool = True) -> None:
    """Compress old weekly files into quarterly summaries."""
    from aikido.commands.knowledge import run_archive

    root = _require_root()
    run_archive(root, weeks, compress=compress)


@app.command()
def onboard(name: str, role: str, from_week: Optional[str] = None) -> None:
    """Generate onboarding brief for new team member."""
    from aikido.commands.knowledge import run_onboard

    root = _require_root()
    run_onboard(root, name, role, from_week=from_week)


@app.command()
def investor(
    brief: bool = True,
    since: str = "last_board_meeting",
    format: str = "email",
) -> None:
    """Generate investor update from knowledge base."""
    from aikido.commands.knowledge import run_investor

    root = _require_root()
    run_investor(root, brief=brief, since=since, format=format)


@app.command()
def dashboard(my_agents: bool = False, status: bool = True, stale: bool = False) -> None:
    """Visual dashboard of knowledge system health."""
    from aikido.commands.knowledge import run_dashboard

    root = _require_root()
    run_dashboard(root, my_agents=my_agents, status=status, stale=stale)


@app.command()
def validate(path: Optional[str] = None, fix: bool = False) -> None:
    """Validate knowledge base: broken includes, undefined variables, contract mismatches, stale files."""
    from aikido.commands.validate import run_validate

    root = _require_root()
    result = run_validate(root, path=path, fix=fix)
    if not result["ok"]:
        raise typer.Exit(code=1)


@app.command()
def village(
    port: int = 8765,
    root: Optional[str] = None,
    offline: bool = False,
    brain: str = "auto",
    hermes_url: Optional[str] = None,
    hermes_setup: Optional[str] = None,
    chief: str = "Matt",
    open_browser: bool = True,
) -> None:
    """Run the Agent Village: a local RPG town where your AI agents live and work.

    Agents think through your local `claude` CLI (your subscription, no API key),
    or with `--brain hermes` each agent runs its own Nous Research Hermes Agent
    profile with its own memory, skills and tool belt.
    Emails stay drafts, nothing is spent or published, and every deliverable
    waits in your review queue.
    """
    import webbrowser

    import os

    from aikido.village.brain import ClaudeBrain, HermesBrain, OfflineBrain, RemoteHermesBrain
    from aikido.village.server import serve
    from aikido.village.town import Town

    project = cfg.find_project_root()
    village_root = Path(root) if root else (project or Path.cwd()) / "village"
    settings = {}
    if (village_root / "village.json").exists():
        import json

        settings = json.loads((village_root / "village.json").read_text()).get("hermes", {})
    if hermes_setup:
        from aikido.village.hermes_setup import export_bundle

        out = export_bundle(Path(hermes_setup), mcp=settings.get("mcp"))
        console.print(f"[green]Hermes server setup written to[/green] {out}")
        console.print(f"Copy it to your server and run `bash install.sh` there. Steps: {out / 'README.md'}")
        return

    choice = "offline" if offline else brain
    if choice not in ("auto", "claude", "hermes", "hermes-remote", "offline"):
        console.print("[red]--brain must be auto, claude, hermes, hermes-remote or offline.[/red]")
        raise typer.Exit(code=1)
    if choice == "hermes-remote":
        url = hermes_url or os.environ.get("HERMES_URL") or settings.get("url")
        key = os.environ.get("HERMES_API_KEY", "")
        if not url or not key:
            console.print("[red]Set HERMES_URL (or --hermes-url) and HERMES_API_KEY for your Hermes server.[/red]")
            raise typer.Exit(code=1)
        if url.startswith("http://") and not any(h in url for h in ("127.0.0.1", "localhost")):
            console.print("[red]Use https:// for a remote Hermes server: the API key would travel in clear text.[/red]")
            raise typer.Exit(code=1)
        mind = RemoteHermesBrain(url, key)
        try:
            mind.health()
        except Exception as exc:  # report and stop: a village with no brain is not useful
            console.print(f"[red]Can't reach the Hermes server at {url}:[/red] {exc}")
            raise typer.Exit(code=1)
    elif choice == "hermes":
        if not HermesBrain.available():
            console.print("[red]`hermes` not found.[/red] Install it with `pip install hermes-agent`.")
            raise typer.Exit(code=1)
        if not (os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or os.environ.get("ANTHROPIC_TOKEN") or os.environ.get("ANTHROPIC_API_KEY")):
            console.print("[yellow]No Claude credential in the environment.[/yellow] Run `claude setup-token` and "
                          "export CLAUDE_CODE_OAUTH_TOKEN before starting the village.")
        mind = HermesBrain(provider=settings.get("provider", "anthropic"), mcp=settings.get("mcp"))
    elif choice in ("auto", "claude") and ClaudeBrain.available():
        mind = ClaudeBrain(extra_dirs=[project] if project else [])
    else:
        if choice != "offline":
            console.print("[yellow]`claude` CLI not found — running the village offline.[/yellow]")
        mind = OfflineBrain()

    town = Town(village_root, mind, chief_name=chief)
    httpd = serve(town, port=port)
    url = f"http://127.0.0.1:{port}/"
    console.print(f"[green]Agent Village is open[/green] at {url}  (brain: {mind.name}, data: {village_root})")
    console.print("Ctrl+C to close the village.")
    if open_browser:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        console.print("\nVillage closed.")
    finally:
        httpd.server_close()


@app.command()
def config(
    key: Optional[str] = None,
    value: Optional[str] = None,
    list_all: bool = False,
) -> None:
    """Manage `.aikido/config.yaml`."""
    root = _require_root()

    if list_all or (key is None and value is None):
        data = cfg.load_config(root)
        table = Table(title="aikido config")
        table.add_column("Key", style="cyan")
        table.add_column("Value")
        _flatten(data, "", table)
        console.print(table)
        return

    if key is not None and value is not None:
        cfg.set_config_value(root, key, value)
        console.print(f"[green]Set[/green] {key} = {value}")
        return

    if key is not None:
        console.print(cfg.get_config_value(root, key))


def _flatten(node, prefix, table) -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            _flatten(v, f"{prefix}.{k}" if prefix else k, table)
    else:
        table.add_row(prefix, str(node))


if __name__ == "__main__":
    app()
