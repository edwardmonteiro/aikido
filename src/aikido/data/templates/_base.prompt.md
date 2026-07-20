{% set contract = load_json("04_contracts/" + job + ".json") %}
{% include "00_control_plane/founder_identity.md" ignore missing %}
{% include "00_control_plane/tone_voice.md" ignore missing %}
{% include "00_control_plane/safety_guardrails.md" ignore missing %}

## Job: {{ contract.objective.job }}
**For:** {{ contract.objective.user }}
**Context:** {{ contract.objective.context }}
**Success Feeling:** {{ contract.objective.success_feeling }}

{% block context %}{% endblock %}

## Definition of Done
{% for output in contract.definition_of_done.outputs %}
### {{ loop.index }}. {{ output.id }}
- **Format:** {{ output.format }}
{% if output.get('values') %}- **Values:** {{ output.get('values') | join(", ") }}{% endif %}
{% if output.get('count') %}- **Count:** {{ output.get('count') }}{% endif %}
- **Criteria:** {{ output.criteria }}
{% endfor %}

## Constraints
{% for constraint in contract.definition_of_done.constraints %}
- {{ constraint }}
{% endfor %}

## Validation Rules
{% for check in contract.validation.auto_checks %}
- [ ] {{ check }}
{% endfor %}
{% for question in contract.validation.human_review %}
- {{ question }}
{% endfor %}

{% block task %}{% endblock %}
