"""Azure Functions app: receive a meeting transcript, open a scoped-daily PR.

POST a transcript (Microsoft Teams via Power Automate, or a manual paste) and
the function builds the aikido transcript-daily prompt, runs it through Claude,
and opens a pull request adding `01_weekly_cadence/{week}/{date}_daily.md`.

Required application settings (env vars):
  ANTHROPIC_API_KEY   Claude API key
  GITHUB_TOKEN        GitHub PAT with `repo` (contents + pull_requests) scope
  GITHUB_REPO         "owner/name" of the knowledge-base repo
  WEBHOOK_SECRET      shared secret; callers must send it as X-Aikido-Secret
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import azure.functions as func

from aikido.commands.daily import week_of
from aikido_daily.github_pr import open_daily_pr
from aikido_daily.payload import parse_payload
from aikido_daily.pipeline import extract_daily, render_daily

app = func.FunctionApp()


@app.route(route="transcript", auth_level=func.AuthLevel.FUNCTION)
def transcript(req: func.HttpRequest) -> func.HttpResponse:
    secret = os.environ.get("WEBHOOK_SECRET")
    if secret and req.headers.get("X-Aikido-Secret") != secret:
        return func.HttpResponse("unauthorized", status_code=401)

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse("invalid JSON body", status_code=400)

    transcript_text, title, date, attendees = parse_payload(body)
    if not transcript_text:
        return func.HttpResponse("no transcript found in payload", status_code=400)

    date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        daily = extract_daily(transcript_text, title, date)
        markdown = render_daily(daily, date, attendees)
        pr_url = open_daily_pr(
            repo=os.environ["GITHUB_REPO"],
            token=os.environ["GITHUB_TOKEN"],
            date=date,
            week=week_of(date),
            markdown=markdown,
            title=title or "Meeting",
        )
    except KeyError as e:
        return func.HttpResponse(f"missing app setting: {e}", status_code=500)
    except Exception as e:  # surface a readable error to the caller / Power Automate
        return func.HttpResponse(
            json.dumps({"ok": False, "error": str(e)}),
            status_code=500,
            mimetype="application/json",
        )

    return func.HttpResponse(
        json.dumps(
            {
                "ok": True,
                "pr_url": pr_url,
                "date": date,
                "ships_today": daily.ships_today,
                "parked_deep": [p.model_dump() for p in daily.parked_deep],
            }
        ),
        mimetype="application/json",
    )
