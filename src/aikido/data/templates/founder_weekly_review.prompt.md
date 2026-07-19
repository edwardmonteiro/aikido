{% extends "05_agents/_base.prompt.md" %}

{% block context %}
## This Week's Context ({{ week }})

### Decisions
{% include "01_weekly_cadence/" + week + "/decisions.md" ignore missing %}

### Blockers
{% include "01_weekly_cadence/" + week + "/blockers.md" ignore missing %}

### Customer Signals
{% include "01_weekly_cadence/" + week + "/customer_signals.md" ignore missing %}

### Daily Summary
{% include "01_weekly_cadence/" + week + "/daily_summary.md" ignore missing %}

{% if focus_area == "product" %}
## Product Context
{% include "02_domain_knowledge/product/roadmap.md" ignore missing %}
{% include "02_domain_knowledge/product/architecture.md" ignore missing %}
{% include "03_support_tickets/themes/feature_requests.md" ignore missing %}
{% include "03_support_tickets/themes/onboarding_friction.md" ignore missing %}
{% elif focus_area == "gtm" %}
## Go-to-Market Context
{% include "02_domain_knowledge/go_to_market/pricing.md" ignore missing %}
{% include "02_domain_knowledge/go_to_market/personas.md" ignore missing %}
{% endif %}
{% endblock %}

{% block task %}
## Output Format
Return ONLY JSON:
```json
{
  "next_week_priorities": ["string", "string", "string"],
  "decision_recommendation": "string",
  "risk_flag": "string",
  "investor_snippet": "string"
}
```
{% endblock %}
