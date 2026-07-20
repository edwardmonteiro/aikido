"""Jinja2 transpiler: template + contract -> flat Markdown artifact.

The transpiler treats prompts as software artifacts. It resolves includes,
renders Jinja2 templates against JSON contracts, and runs a validation
pipeline (includes present, contract outputs referenced, output constraints
satisfied) before writing a flat Markdown artifact to ``06_dist/``.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import jinja2
from jinja2 import Environment, FileSystemLoader, meta


class AikidoTranspiler:
    """Compile a Jinja2 prompt template + JSON contract into a Markdown artifact."""

    def __init__(self, project_root: Path):
        self.project_root = Path(project_root)
        self.env = Environment(
            loader=FileSystemLoader(str(self.project_root)),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self.env.filters["load_json"] = self._load_json
        self.env.filters["to_json_pretty"] = lambda d: json.dumps(d, indent=2)
        # Expose load_json as a global too so templates can call it directly.
        self.env.globals["load_json"] = self._load_json

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def _load_json(self, path: str) -> Dict:
        with open(self.project_root / path) as f:
            return json.load(f)

    # ------------------------------------------------------------------ #
    # Dependency analysis
    # ------------------------------------------------------------------ #
    def parse_dependencies(self, template_path: str) -> Dict:
        """Return the static includes and undeclared variables of a template."""
        source = (self.project_root / template_path).read_text()
        ast = self.env.parse(source)

        includes: List[str] = []
        for node in ast.find_all(jinja2.nodes.Include):
            if isinstance(node.template, jinja2.nodes.Const):
                includes.append(node.template.value)

        # {% extends %} pulls in a parent template as a dependency too.
        for node in ast.find_all(jinja2.nodes.Extends):
            if isinstance(node.template, jinja2.nodes.Const):
                includes.append(node.template.value)

        variables = meta.find_undeclared_variables(ast)
        return {"includes": includes, "variables": list(variables)}

    # ------------------------------------------------------------------ #
    # Validation
    # ------------------------------------------------------------------ #
    def validate_includes(self, template_path: str, variables: Dict) -> List[str]:
        """Flag static includes/extends that point at files which don't exist."""
        errors: List[str] = []
        deps = self.parse_dependencies(template_path)
        for inc in deps["includes"]:
            # Skip dynamically-constructed include paths (contain expressions).
            if "{{" in inc or "+" in inc:
                continue
            if not (self.project_root / inc).exists():
                errors.append(f"Missing include: {inc}")
        return errors

    def validate_contract(self, template_path: str, contract_path: str) -> List[str]:
        """Ensure every contract output id is referenced somewhere in the template."""
        errors: List[str] = []
        contract = self._load_json(contract_path)
        template_content = (self.project_root / template_path).read_text()
        for output in contract.get("definition_of_done", {}).get("outputs", []):
            if output["id"] not in template_content:
                errors.append(f"Contract output '{output['id']}' not referenced")
        return errors

    def validate_constraints(self, output: str, contract: Dict) -> List[str]:
        """Check rendered output against the contract's constraint rules."""
        errors: List[str] = []
        for constraint in contract.get("definition_of_done", {}).get("constraints", []):
            lowered = constraint.lower()
            if "word_count" in lowered:
                match = re.search(r"word_count\s*<\s*(\d+)", lowered)
                if match:
                    limit = int(match.group(1))
                    if len(output.split()) >= limit:
                        errors.append(f"Word count >= {limit}")
            if "generic" in lowered:
                for phrase in ["focus on", "improve", "better", "leverage", "synergy"]:
                    if phrase in output.lower():
                        errors.append(f"Generic: '{phrase}'")
        return errors

    # ------------------------------------------------------------------ #
    # Rendering
    # ------------------------------------------------------------------ #
    def transpile(self, template_path: str, variables: Dict) -> str:
        template = self.env.get_template(template_path)
        return template.render(**variables)

    def build(self, job: str, week: Optional[str] = None, **kwargs: Any) -> Dict:
        """Run the full pipeline for ``job`` and write the artifact on success."""
        template_path = f"05_agents/{job}.prompt.md"
        contract_path = f"04_contracts/{job}.json"

        variables: Dict[str, Any] = {"job": job}
        if week:
            variables["week"] = week
        variables.update(kwargs)

        errors = self.validate_includes(template_path, variables)
        errors += self.validate_contract(template_path, contract_path)

        if errors:
            return {
                "success": False,
                "stage": "pre_transpile",
                "errors": errors,
                "artifact": None,
            }

        try:
            artifact = self.transpile(template_path, variables)
        except Exception as e:  # noqa: BLE001 - surface any render failure
            return {
                "success": False,
                "stage": "transpile",
                "errors": [str(e)],
                "artifact": None,
            }

        try:
            contract = self._load_json(contract_path)
            c_errors = self.validate_constraints(artifact, contract)
            if c_errors:
                return {
                    "success": False,
                    "stage": "post_transpile",
                    "errors": c_errors,
                    "artifact": artifact,
                }
        except Exception:  # noqa: BLE001 - constraint checking is best-effort
            pass

        output_path = self.project_root / "06_dist" / f"{job}_{week or 'default'}.md"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(artifact)

        return {
            "success": True,
            "stage": "done",
            "path": str(output_path),
            "word_count": len(artifact.split()),
            "artifact": artifact,
            "errors": [],
        }
