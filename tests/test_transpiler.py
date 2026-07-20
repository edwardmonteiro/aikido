import json

import pytest

from aikido.core.transpiler import AikidoTranspiler


def _make_project(tmp_path):
    (tmp_path / "00_control_plane").mkdir()
    (tmp_path / "00_control_plane/founder_identity.md").write_text("# Me")
    (tmp_path / "01_weekly_cadence/2026-W29").mkdir(parents=True)
    (tmp_path / "01_weekly_cadence/2026-W29/decisions.md").write_text("## Decisions\n- Shipped")
    (tmp_path / "04_contracts").mkdir()
    (tmp_path / "04_contracts/test.json").write_text(
        '{"job_id": "test", "version": "1.0.0", "objective": {"job": "Test", "user": "Me", '
        '"context": "Testing", "success_feeling": "Done"}, "definition_of_done": {"outputs": '
        '[{"id": "result", "format": "single_sentence", "criteria": "Short"}], "constraints": '
        '["word_count < 10"]}, "validation": {"auto_checks": ["word_count"], "human_review": '
        '["Looks good?"]}, "template": {"system_prompt_ref": "test.prompt.md", "input_schema": '
        '{"week": "string"}, "output_schema": {"result": "string"}}}'
    )
    (tmp_path / "05_agents").mkdir()
    (tmp_path / "05_agents/test.prompt.md").write_text(
        '{% set contract = load_json("04_contracts/test.json") %}'
        '{% include "00_control_plane/founder_identity.md" ignore missing %}'
        "{{ week }} result"
    )
    (tmp_path / "06_dist").mkdir()


def test_transpile_full(tmp_path):
    _make_project(tmp_path)
    t = AikidoTranspiler(tmp_path)
    r = t.build("test", week="2026-W29")

    assert r["success"], r
    assert "2026-W29" in r["artifact"]
    assert r["word_count"] < 10


def test_missing_include_fails_pre_transpile(tmp_path):
    _make_project(tmp_path)
    (tmp_path / "05_agents/test.prompt.md").write_text(
        '{% include "00_control_plane/missing.md" %}{{ week }} result'
    )
    t = AikidoTranspiler(tmp_path)
    r = t.build("test", week="2026-W29")
    assert not r["success"]
    assert r["stage"] == "pre_transpile"
    assert any("missing.md" in e for e in r["errors"])


def test_contract_output_must_be_referenced(tmp_path):
    _make_project(tmp_path)
    # Template no longer mentions the "result" output id.
    (tmp_path / "05_agents/test.prompt.md").write_text("{{ week }} only")
    t = AikidoTranspiler(tmp_path)
    r = t.build("test", week="2026-W29")
    assert not r["success"]
    assert any("result" in e for e in r["errors"])


def test_constraint_word_count_violation(tmp_path):
    _make_project(tmp_path)
    (tmp_path / "05_agents/test.prompt.md").write_text(
        "result " + " ".join(["word"] * 20)
    )
    t = AikidoTranspiler(tmp_path)
    r = t.build("test", week="2026-W29")
    assert not r["success"]
    assert r["stage"] == "post_transpile"


def test_parse_dependencies(tmp_path):
    _make_project(tmp_path)
    t = AikidoTranspiler(tmp_path)
    deps = t.parse_dependencies("05_agents/test.prompt.md")
    assert "00_control_plane/founder_identity.md" in deps["includes"]
    assert "week" in deps["variables"]
