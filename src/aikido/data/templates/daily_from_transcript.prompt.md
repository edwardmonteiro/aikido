{% extends "05_agents/_base.prompt.md" %}

{% block context %}
## Meeting transcript
**Meeting:** {{ meeting_title | default("(untitled)") }}
**Date:** {{ date }}

<transcript>
{{ transcript }}
</transcript>
{% endblock %}

{% block task %}
## Your task
Read the transcript above and capture the day as a focused daily log.

Your real job is to keep the day **shippable**. Meetings drift — a topic gets
interesting, goes deep, and suddenly the day's deliverable is gone. Separate what
can actually be delivered **today** from threads that are turning deep and must be
**parked** (captured, with a next step, but out of today's scope).

Return ONLY JSON in exactly this shape:

{% raw %}
```json
{
  "day_type": "meeting-heavy | shipping | firefighting | planning | research",
  "ships_today": ["a concrete, deliverable-today item", "..."],
  "parked_deep": [
    {
      "thread": "the deep topic that came up",
      "why_parked": "why it can't ship today (too big / needs input / multi-day)",
      "next_step": "the single smallest concrete next action"
    }
  ],
  "blockers": ["a concrete blocker from the call", "..."],
  "customer_moment": "a specific customer signal, or 'none'",
  "takeaway": "one honest sentence about the day",
  "tags": ["#pricing", "#onboarding"]
}
```
{% endraw %}

Rules:
- Anything that would take more than one working day goes in `parked_deep`, never `ships_today`.
- Never invent work, decisions, or customer quotes the transcript doesn't support.
- If nothing ships today, return an empty `ships_today` and say why in `takeaway`.
{% endblock %}
