"""Parse incoming transcript payloads (Microsoft Teams / Power Automate + manual)."""

from __future__ import annotations

from typing import Optional, Tuple


def _vtt_to_text(vtt: str) -> str:
    """Flatten a WebVTT (.vtt) transcript — Teams' export format — to plain text."""
    out = []
    for line in vtt.splitlines():
        s = line.strip()
        if not s or s == "WEBVTT" or "-->" in s or s.isdigit():
            continue
        out.append(s)
    return "\n".join(out)


def parse_payload(body: dict) -> Tuple[str, Optional[str], Optional[str], Optional[str]]:
    """Return (transcript_text, title, date, attendees) from a request body.

    Canonical shape (recommended for the Power Automate flow and manual posts):
        {"transcript": "...", "title": "...", "date": "YYYY-MM-DD",
         "attendees": ["Ana", "Bruno"], "format": "text" | "vtt"}
    Also tolerates Teams-ish keys (`content`, `meetingSubject`).
    """
    transcript = body.get("transcript") or body.get("content") or ""
    if body.get("format") == "vtt" or "-->" in transcript[:2000]:
        transcript = _vtt_to_text(transcript)

    title = body.get("title") or body.get("meetingSubject") or "Meeting"
    date = body.get("date") or None

    attendees = body.get("attendees")
    if isinstance(attendees, list):
        attendees = ", ".join(str(a) for a in attendees)

    return transcript.strip(), title, date, attendees
