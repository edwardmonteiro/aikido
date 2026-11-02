"""Build the server-side setup for a Hermes Agent server (e.g. a Hostinger VPS).

``export_bundle`` writes a folder you copy to the server and run once:

    hermes-village/
      install.sh           creates one Hermes profile per agent, enables the API server
      merge_config.py      merges each profile's village.yaml into its config.yaml
      profiles/<id>/SOUL.md, village.yaml, DESCRIPTION
      README.md            HTTPS (Caddy) and what to set on your computer

Each profile gets the agent's persona and tool belt, and approvals in
``manual`` mode so risky tool calls pause and wait for you in the village.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import yaml

from aikido.village import roster
from aikido.village.brain import DEFAULT_HERMES_MCP, system_prompt

# Village belt names that are real Hermes toolsets (MCP servers are configured separately).
_NATIVE = {"memory", "todo", "skills", "session_search", "web", "search"}

INSTALL_SH = r"""#!/usr/bin/env bash
# Agent Village: one Hermes profile per agent on this server, plus the API server.
# Run it once as the user that runs your Hermes gateway:   bash install.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HERMES="$(command -v hermes)" || { echo "hermes is not on PATH on this server"; exit 1; }
PY="$(head -1 "$HERMES" | sed 's/^#!//')"
"$PY" -c "import yaml" 2>/dev/null || PY=python3
ROOT="${HERMES_HOME:-$HOME/.hermes}"
if ! "$PY" -c "import aiohttp" 2>/dev/null; then
  echo "Hermes' API server needs aiohttp. Install it into Hermes' Python first:"
  echo "  $PY -m pip install aiohttp"
  exit 1
fi

for dir in "$HERE"/profiles/*/; do
  name="$(basename "$dir")"
  if [ ! -d "$ROOT/profiles/$name" ]; then
    # --clone copies your current model/provider settings and credentials into the new profile
    hermes profile create "$name" --clone --no-alias --description "$(cat "$dir/DESCRIPTION")"
  fi
  cp "$dir/SOUL.md" "$ROOT/profiles/$name/SOUL.md"
  "$PY" "$HERE/merge_config.py" "$ROOT/profiles/$name/config.yaml" "$dir/village.yaml"
  echo "profile $name ready"
done

ENV_FILE="$ROOT/.env"; touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
setkey() { if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi; }
setkey API_SERVER_ENABLED true
setkey API_SERVER_HOST 127.0.0.1
setkey API_SERVER_PORT 8642
setkey GATEWAY_MULTIPLEX_PROFILES true
if ! grep -q "^API_SERVER_KEY=" "$ENV_FILE"; then
  KEY="$(openssl rand -hex 32 2>/dev/null || "$PY" -c 'import secrets; print(secrets.token_hex(32))')"
  setkey API_SERVER_KEY "$KEY"
  echo
  echo "Your village API key (shown once; put it in HERMES_API_KEY on your computer):"
  echo "$KEY"
  echo
fi
echo "Now restart the gateway:  hermes gateway restart   (or run it with: hermes gateway run)"
"""

MERGE_PY = r'''"""Deep-merge the village settings into a Hermes profile's config.yaml."""
import sys
import yaml

target, extra = sys.argv[1], sys.argv[2]
try:
    config = yaml.safe_load(open(target)) or {}
except FileNotFoundError:
    config = {}
patch = yaml.safe_load(open(extra)) or {}


def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            merge(a[k], v)
        else:
            a[k] = v


merge(config, patch)
open(target, "w").write(yaml.safe_dump(config, sort_keys=False))
'''

README = """# Agent Village on your Hermes server

1. Copy this folder to the server (hPanel file manager, `scp -r hermes-village user@server:`), then run:

       cd hermes-village && bash install.sh

   It creates one Hermes profile per agent, turns on the API server on
   127.0.0.1:8642 with profile routing, and prints your API key once.

2. Put HTTPS in front of it. With Caddy, add this to `/etc/caddy/Caddyfile`
   and run `sudo systemctl reload caddy`:

       hermes.YOUR-DOMAIN.com {
           reverse_proxy 127.0.0.1:8642 {
               flush_interval -1
           }
       }

   (Point an A record for hermes.YOUR-DOMAIN.com at the VPS IP first.)
   Never expose port 8642 directly, and never share the API key.

3. Restart the gateway: `hermes gateway restart` (or `hermes gateway run`).

4. On your computer:

       export HERMES_URL=https://hermes.YOUR-DOMAIN.com
       export HERMES_API_KEY=<the key from step 1>
       aikido village --brain hermes-remote

Each agent's tools are in `~/.hermes/profiles/<agent>/config.yaml` under
`platform_toolsets.api_server`. Approvals are in manual mode, so risky tool
calls pause and show up in the village for you to allow or deny.
"""


def profile_config(agent: roster.Agent, mcp: Dict[str, dict]) -> dict:
    tools = [t for t in roster.safe_toolsets(agent.toolbelt) if t in _NATIVE]
    servers = {}
    for t in agent.toolbelt:
        name = t[4:] if t.startswith("mcp-") else None
        if name and mcp.get(name, {}).get("url"):
            servers[name] = mcp[name]
    return {
        "platform_toolsets": {"api_server": tools},
        "approvals": {"mode": "manual", "cron_mode": "deny"},
        "mcp_servers": servers,
    }


def export_bundle(out: Path, agents: Optional[List[roster.Agent]] = None, mcp: Optional[Dict[str, dict]] = None) -> Path:
    """Write the setup folder for the server; returns its path."""
    agents = [a for a in (agents or roster.default_roster()) if a.role != "worker"]
    servers = {**DEFAULT_HERMES_MCP, **(mcp or {})}
    by_id = {a.id: a for a in agents}
    chart = "\n".join(f"- {a.name}: {a.title}" for a in agents)
    out = Path(out)
    (out / "profiles").mkdir(parents=True, exist_ok=True)
    for agent in agents:
        folder = out / "profiles" / agent.id
        folder.mkdir(exist_ok=True)
        boss = by_id.get(agent.reports_to or "")
        (folder / "SOUL.md").write_text(system_prompt(agent, boss, "", chart) + "\n")
        (folder / "village.yaml").write_text(yaml.safe_dump(profile_config(agent, servers), sort_keys=False))
        (folder / "DESCRIPTION").write_text(f"{agent.title}: {agent.domain}"[:300])
    (out / "install.sh").write_text(INSTALL_SH)
    (out / "install.sh").chmod(0o755)
    (out / "merge_config.py").write_text(MERGE_PY)
    (out / "README.md").write_text(README)
    return out
