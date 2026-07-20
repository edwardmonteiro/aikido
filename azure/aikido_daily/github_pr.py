"""Commit a generated daily to a new branch and open a pull request."""

from __future__ import annotations

import base64
import re
from typing import Optional

import requests

API = "https://api.github.com"
TIMEOUT = 30


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "meeting").lower()).strip("-")[:40] or "meeting"


def open_daily_pr(
    repo: str,
    token: str,
    date: str,
    week: str,
    markdown: str,
    title: str,
) -> Optional[str]:
    """Create `01_weekly_cadence/{week}/{date}_daily.md` on a branch and open a PR.

    `repo` is "owner/name". Returns the PR URL (or the existing PR's URL).
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    owner = repo.split("/", 1)[0]
    base = requests.get(f"{API}/repos/{repo}", headers=headers, timeout=TIMEOUT)
    base.raise_for_status()
    base_branch = base.json()["default_branch"]

    ref = requests.get(f"{API}/repos/{repo}/git/ref/heads/{base_branch}", headers=headers, timeout=TIMEOUT)
    ref.raise_for_status()
    base_sha = ref.json()["object"]["sha"]

    branch = f"daily/{date}-{_slug(title)}"
    # Create the branch; a 422 means it already exists (idempotent re-runs are fine).
    requests.post(
        f"{API}/repos/{repo}/git/refs",
        headers=headers,
        timeout=TIMEOUT,
        json={"ref": f"refs/heads/{branch}", "sha": base_sha},
    )

    path = f"01_weekly_cadence/{week}/{date}_daily.md"
    existing = requests.get(
        f"{API}/repos/{repo}/contents/{path}", headers=headers, params={"ref": branch}, timeout=TIMEOUT
    )
    file_sha = existing.json().get("sha") if existing.status_code == 200 else None

    put = {
        "message": f"daily: {date} from transcript ({title})",
        "content": base64.b64encode(markdown.encode("utf-8")).decode("ascii"),
        "branch": branch,
    }
    if file_sha:
        put["sha"] = file_sha
    written = requests.put(f"{API}/repos/{repo}/contents/{path}", headers=headers, timeout=TIMEOUT, json=put)
    written.raise_for_status()

    pr = requests.post(
        f"{API}/repos/{repo}/pulls",
        headers=headers,
        timeout=TIMEOUT,
        json={
            "title": f"Daily {date} — {title}",
            "head": branch,
            "base": base_branch,
            "body": (
                "Auto-generated from a meeting transcript by the aikido webhook.\n\n"
                "Review the **ships-today** vs **parked-deep** split before merging — "
                "the parked threads are the ones that would otherwise eat the day."
            ),
        },
    )
    if pr.status_code == 422:  # a PR for this branch already exists
        open_prs = requests.get(
            f"{API}/repos/{repo}/pulls",
            headers=headers,
            params={"head": f"{owner}:{branch}", "state": "open"},
            timeout=TIMEOUT,
        ).json()
        return open_prs[0]["html_url"] if open_prs else None
    pr.raise_for_status()
    return pr.json()["html_url"]
