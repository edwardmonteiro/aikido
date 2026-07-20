import os

from aikido.commands.daily import DailyCapture
from aikido.commands.weekly import run_weekly
from aikido.core.scaffold import scaffold_project
from aikido.core.transpiler import AikidoTranspiler


def test_scaffold_creates_tree(tmp_path):
    root = tmp_path / "proj"
    scaffold_project(root)

    for d in [
        "00_control_plane",
        "01_weekly_cadence",
        "02_domain_knowledge/product",
        "04_contracts",
        "05_agents",
        "06_dist",
    ]:
        assert (root / d).is_dir()

    assert (root / "00_control_plane/founder_identity.md").exists()
    assert (root / "05_agents/founder_weekly_review.prompt.md").exists()
    assert (root / "04_contracts/founder_weekly_review.json").exists()


def test_end_to_end_weekly_build(tmp_path):
    root = tmp_path / "proj"
    scaffold_project(root)

    cap = DailyCapture(root)
    cap.save(
        {
            "date": "2026-07-13",
            "type": "shipping",
            "ships": "Shipped billing page",
            "blockers": "none",
            "customer": "Customer wants SSO",
            "takeaway": "Momentum on billing",
        }
    )

    result = run_weekly(root, week="2026-W29", build=True)
    build = next(b for b in result["builds"] if b["agent"] == "founder_weekly_review")
    assert build["success"], build

    artifact = root / "06_dist" / "founder_weekly_review_2026-W29.md"
    assert artifact.exists()
    text = artifact.read_text()
    assert "2026-W29" in text
    # Weekly context should have been inlined.
    assert "Shipped billing page" in text


def test_build_agent_directly(tmp_path):
    root = tmp_path / "proj"
    scaffold_project(root)
    DailyCapture(root).aggregate("2026-W29")

    t = AikidoTranspiler(root)
    r = t.build("founder_weekly_review", week="2026-W29")
    assert r["success"], r
    assert "next_week_priorities" in r["artifact"]
