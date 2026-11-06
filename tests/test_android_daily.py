"""The Android daily-capture page must produce exactly what `aikido daily` does."""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from aikido.commands.daily import DAY_TYPES, TAG_KEYWORDS, _derive_tags, _render, week_of

DAILY_JS = Path(__file__).resolve().parent.parent / "android" / "assets" / "daily.js"


def _js_literal(name: str):
    match = re.search(rf"var {name} = (.*?);\n", DAILY_JS.read_text(), re.S)
    assert match, f"{name} not found in {DAILY_JS}"
    return json.loads(match.group(1))


def test_tag_keywords_match():
    assert _js_literal("TAG_KEYWORDS") == TAG_KEYWORDS


def test_day_types_match():
    assert _js_literal("DAY_TYPES") == DAY_TYPES


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_render_week_and_tags_match():
    # Evaluate the pure helpers from daily.js (everything before the DOM wiring).
    src = DAILY_JS.read_text()
    helpers = src[src.index('"use strict";') : src.index("var form =")]
    data = {
        "date": "2027-01-01",  # ISO week belongs to 2026-W53
        "type": "shipping",
        "ships": "Shipped SSO login",
        "blockers": "none",
        "customer": "Acme asked about pricing seats",
        "takeaway": "Burn is fine",
        "people": "solo",
    }
    script = (
        helpers
        + "var d = " + json.dumps(data) + ";"
        + "d.tags = deriveTags(d.ships + ' ' + d.blockers + ' ' + d.customer + ' ' + d.takeaway);"
        + "process.stdout.write(JSON.stringify([render(d), weekOf(d.date), weekOf('2026-07-19')]));"
    )
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    rendered, week, week2 = json.loads(out.stdout)

    expected = dict(data, tags=_derive_tags(" ".join(data[k] for k in ("ships", "blockers", "customer", "takeaway"))))
    assert rendered == _render(expected)
    assert week == week_of("2027-01-01")
    assert week2 == week_of("2026-07-19")
