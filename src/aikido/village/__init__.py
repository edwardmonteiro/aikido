"""Agent Village — a local, top-down RPG town where your AI agents live and work.

The village is a dependency-free web app (``static/``) served by a small
stdlib HTTP server (``server.py``). Every agent "thinks" through the local
``claude`` CLI in headless mode, so it runs on your existing Claude
subscription — no API keys, no pay-per-use fees. Without the CLI the village
falls back to an offline brain so the world is always explorable.

Guardrails are enforced in code, not just in prompts:

1. Emails are only ever saved as drafts.
2. Nothing spends money or credits without explicit human approval.
3. Nothing is published or posted publicly.
4. Every deliverable lands in a human review queue first.
"""
