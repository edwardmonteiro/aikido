"""Scaffolding: turn packaged default data into a project directory tree."""

from __future__ import annotations

from importlib import resources
from pathlib import Path
from typing import Dict, List

# The canonical aikido directory layout. Each entry is created on ``init``.
PROJECT_DIRS: List[str] = [
    "00_control_plane",
    "01_weekly_cadence",
    "02_domain_knowledge/product",
    "02_domain_knowledge/go_to_market",
    "03_support_tickets/themes",
    "04_contracts",
    "05_agents",
    "06_dist",
    "07_archive",
]

# Files placed only when they are absent, keyed by destination-relative path.
# Content is pulled from the packaged ``aikido.data`` tree.
CONTROL_PLANE_FILES = [
    "founder_identity.md",
    "tone_voice.md",
    "safety_guardrails.md",
]

TEMPLATE_FILES = [
    "_base.prompt.md",
    "founder_weekly_review.prompt.md",
    "daily_from_transcript.prompt.md",
]

CONTRACT_FILES = [
    "founder_weekly_review.json",
    "daily_from_transcript.json",
]

# Seed knowledge-base files so focus-area includes and validate() have targets.
DOMAIN_SEED: Dict[str, str] = {
    "02_domain_knowledge/product/roadmap.md": "# Product Roadmap\n\n- TODO: fill in.\n",
    "02_domain_knowledge/product/architecture.md": "# Architecture\n\n- TODO: fill in.\n",
    "02_domain_knowledge/go_to_market/pricing.md": "# Pricing\n\n- TODO: fill in.\n",
    "02_domain_knowledge/go_to_market/personas.md": "# Personas\n\n- TODO: fill in.\n",
    "03_support_tickets/themes/feature_requests.md": "# Feature Requests\n\n- TODO: fill in.\n",
    "03_support_tickets/themes/onboarding_friction.md": "# Onboarding Friction\n\n- TODO: fill in.\n",
}


def _read_data(*parts: str) -> str:
    """Read a text file from the packaged ``aikido.data`` resources."""
    resource = resources.files("aikido.data")
    for part in parts:
        resource = resource.joinpath(part)
    return resource.read_text(encoding="utf-8")


def scaffold_project(root: Path) -> List[Path]:
    """Create the full directory tree and default files under ``root``.

    Existing files are never overwritten so re-running ``init`` is safe.
    Returns the list of paths that were created.
    """
    root = Path(root)
    created: List[Path] = []

    for rel in PROJECT_DIRS:
        d = root / rel
        d.mkdir(parents=True, exist_ok=True)

    # Control plane
    for name in CONTROL_PLANE_FILES:
        dest = root / "00_control_plane" / name
        if not dest.exists():
            dest.write_text(_read_data("control_plane", name), encoding="utf-8")
            created.append(dest)

    # Agent templates
    for name in TEMPLATE_FILES:
        dest = root / "05_agents" / name
        if not dest.exists():
            dest.write_text(_read_data("templates", name), encoding="utf-8")
            created.append(dest)

    # Contracts
    for name in CONTRACT_FILES:
        dest = root / "04_contracts" / name
        if not dest.exists():
            dest.write_text(_read_data("contracts", name), encoding="utf-8")
            created.append(dest)

    # Domain knowledge / support seeds
    for rel, content in DOMAIN_SEED.items():
        dest = root / rel
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content, encoding="utf-8")
            created.append(dest)

    # Keep otherwise-empty dirs in git.
    for rel in ["01_weekly_cadence", "06_dist", "07_archive"]:
        keep = root / rel / ".gitkeep"
        if not keep.exists():
            keep.write_text("", encoding="utf-8")
            created.append(keep)

    return created
