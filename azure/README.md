# aikido daily webhook (Azure Functions)

Turns each **Microsoft Teams** meeting transcript (or a manual paste) into a
scope-disciplined daily log and opens it as a **pull request** on the knowledge
base — so a session that drifts deep gets captured without eating the day.

```
Teams meeting ends
  → Power Automate flow POSTs the transcript to this function →
     1. build the aikido daily_from_transcript prompt
     2. Claude (claude-opus-4-8) → { ships_today, parked_deep, ... }
     3. render 01_weekly_cadence/{week}/{date}_daily.md
     4. open a PR you review and merge
```

This path does **not** depend on GitHub Actions — it commits with a normal
token, so it works regardless of the repo's Actions setting.

## Endpoint

`POST /api/transcript` — send the shared secret as the `X-Aikido-Secret` header.

Body (canonical; use this from Power Automate and for manual posts):

```json
{
  "transcript": "Ana: ...\nBruno: ...",
  "title": "Friday experiment sync",
  "date": "2026-07-17",
  "attendees": ["Ana", "Bruno", "Carla"],
  "format": "text"
}
```

- `format: "vtt"` (or a transcript containing WebVTT `-->` cues) is flattened to plain text — that's Teams' native export shape.
- `date` is optional (defaults to today, UTC).

Response: `{ "ok": true, "pr_url": "...", "ships_today": [...], "parked_deep": [...] }`.

## Application settings (secrets)

| Setting | What |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `GITHUB_TOKEN` | GitHub PAT with `repo` scope (contents + pull requests) |
| `GITHUB_REPO` | `owner/name` of the knowledge-base repo (e.g. `edwardmonteiro/aikido`) |
| `WEBHOOK_SECRET` | Long random string; callers must send it as `X-Aikido-Secret` |

## Run locally

```bash
cd azure
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp local.settings.json.example local.settings.json   # fill in the secrets
func start
# then:
curl -s http://localhost:7071/api/transcript \
  -H "X-Aikido-Secret: <WEBHOOK_SECRET>" -H "content-type: application/json" \
  -d '{"transcript":"Ana: ship the export today. Bruno: but the pipeline needs a big rearchitecture.","title":"Sync"}'
```

## Deploy to Azure

```bash
# one-time: create the resources (or use the Portal)
az group create -n aikido-rg -l eastus
az storage account create -n aikidostore$RANDOM -g aikido-rg -l eastus --sku Standard_LRS
az functionapp create -g aikido-rg --consumption-plan-location eastus \
  --runtime python --runtime-version 3.11 --functions-version 4 \
  --name aikido-daily --storage-account <storage-account-name> --os-type Linux

# set the secrets
az functionapp config appsettings set -g aikido-rg -n aikido-daily --settings \
  ANTHROPIC_API_KEY=... GITHUB_TOKEN=... GITHUB_REPO=edwardmonteiro/aikido WEBHOOK_SECRET=...

# publish (from the azure/ folder)
func azure functionapp publish aikido-daily
```

The function URL + its function key are shown after publish:
`https://aikido-daily.azurewebsites.net/api/transcript?code=<function-key>`.

## Wire up Microsoft Teams (Power Automate)

1. In [Power Automate](https://make.powerautomate.com), create an **automated cloud flow**.
2. Trigger: **When a Teams meeting transcript is available** (Microsoft Teams / Graph connector), or a **Recurrence** that reads recent transcripts via the *Get meeting transcript* action.
3. (Optional) Add a *Get meeting transcript* action to fetch the `.vtt` content.
4. Action: **HTTP → POST** to the function URL (include `?code=<function-key>`), with:
   - Header `X-Aikido-Secret: <WEBHOOK_SECRET>`
   - Header `content-type: application/json`
   - Body:
     ```json
     {
       "transcript": "@{body('Get_meeting_transcript')}",
       "format": "vtt",
       "title": "@{triggerOutputs()?['body/subject']}",
       "attendees": "@{triggerOutputs()?['body/participants']}"
     }
     ```
5. Save. Each meeting transcript now opens a daily PR automatically.

Manual paste works too — just POST the canonical body yourself (or build a tiny internal form that does).
