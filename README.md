<div align="center">

# 合 &nbsp;aikido

### AI-native knowledge &amp; decision operations for startup teams

*Treat prompts as software artifacts — modular Markdown, Jinja2 templates,*
*JSON contracts, build-time validation, and flat artifact output.*

[Getting started](docs/getting-started.html) ·
[Commands](docs/commands.html) ·
[Concepts](docs/concepts.html) ·
[Structure](docs/structure.html) ·
[Documentation site](docs/index.html)

`Python 3.10+` &nbsp;•&nbsp; `Typer` &nbsp;•&nbsp; `Jinja2` &nbsp;•&nbsp; `Pydantic` &nbsp;•&nbsp; `MIT`

</div>

---

You capture what happens day to day, aggregate it weekly, and *transpile*
reusable AI agents (system prompts) from your own knowledge base — every input
and output a plain file you can diff, review, and commit. No database, no hidden
state.

```
  daily logs  ──▶  weekly rollups  ──▶  [ template + contract ]  ──▶  06_dist/*.md
   (capture)        (aggregate)              (transpile)              (flat artifact)
```

📖 **Documentation:** the [`docs/`](docs/) directory is a dependency-free static
site (welcome page, getting started, command reference, concepts). The command
reference is *generated from the live CLI* by `scripts/gen_docs.py`, so it never
drifts from the code. Serve it locally with `python -m http.server -d docs`, or
publish it via GitHub Pages (Settings → Pages → deploy from branch, `/docs`
folder).

## Install

```bash
pip install -e .
aikido --help
```

## Quickstart

```bash
aikido init my-company          # scaffold the knowledge tree + git repo
cd my-company
aikido daily                    # guided capture of today
aikido weekly                   # aggregate the week + build agents
aikido build_agent founder_weekly_review --week 2026-W29
```

The built artifact lands in `06_dist/founder_weekly_review_2026-W29.md` — a flat,
self-contained Markdown system prompt with all includes resolved and its
contract validated.

## Directory layout

```
00_control_plane/     founder identity, tone, safety guardrails
01_weekly_cadence/    per-week daily logs + aggregated summaries
02_domain_knowledge/  product + go-to-market knowledge
03_support_tickets/   support themes
04_contracts/         JSON contracts (definition of done, constraints)
05_agents/            Jinja2 prompt templates (*.prompt.md)
06_dist/              built flat-Markdown artifacts
07_archive/           compressed old weeks
```

## Commands

| Command | What it does |
| --- | --- |
| `aikido init <name>` | Scaffold dirs, default templates/contracts/control plane, git init |
| `aikido daily` | Interactive daily capture → `01_weekly_cadence/{week}/{date}_daily.md` |
| `aikido weekly` | Aggregate daily logs into decisions/blockers/signals/summary, then build agents |
| `aikido build_agent <agent>` | Transpile one template + contract → flat Markdown in `06_dist/` |
| `aikido update <path>` | Update domain knowledge or support themes |
| `aikido sync <source>` | Pull from Notion/Linear/Slack/Stripe into the knowledge base |
| `aikido archive <weeks>` | Compress old weekly files |
| `aikido onboard <name> <role>` | Generate an onboarding brief |
| `aikido investor` | Generate an investor update |
| `aikido dashboard` | Knowledge-system health dashboard |
| `aikido validate` | Check broken includes, undefined variables, contract mismatches, stale files |
| `aikido config` | Manage `.aikido/config.yaml` |

## The transpiler

`AikidoTranspiler` runs a staged pipeline for each agent:

1. **pre_transpile** — every static `{% include %}`/`{% extends %}` target exists;
   every contract output id is referenced in the template.
2. **transpile** — render the Jinja2 template against the contract + variables.
3. **post_transpile** — the rendered output satisfies contract constraints
   (word counts, no generic filler).

On success the artifact is written to `06_dist/{agent}_{week}.md`.

## Development

```bash
pip install -e ".[dev]"
pytest tests/
```

### Transcript → daily webhook (Azure Functions)

`azure/` is a deployable webhook that turns each Microsoft Teams meeting
transcript (or a manual paste) into a scope-disciplined daily and opens it as a
pull request — using the `daily_from_transcript` agent + Claude. See
[`azure/README.md`](azure/README.md) for deploy + Power Automate wiring.

### Regenerating the command reference

`docs/commands.html` is a build artifact — it's rendered through aikido's own
transpiler from the live CLI plus curated prose in `docs/commands.meta.json`.
After adding or changing a command, regenerate it:

```bash
python scripts/gen_docs.py
```

The generator warns if a CLI command is missing from `commands.meta.json` (or
vice versa), so the docs can't silently fall out of sync with the code.

## License

MIT
