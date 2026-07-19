"""Project discovery and ``.aikido/config.yaml`` management."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

import yaml

CONFIG_DIRNAME = ".aikido"
CONFIG_FILENAME = "config.yaml"


def find_project_root(start: Optional[Path] = None) -> Optional[Path]:
    """Walk upward from ``start`` looking for a ``.aikido`` directory."""
    current = Path(start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / CONFIG_DIRNAME).is_dir():
            return candidate
    return None


def config_path(project_root: Path) -> Path:
    return Path(project_root) / CONFIG_DIRNAME / CONFIG_FILENAME


def load_config(project_root: Path) -> Dict[str, Any]:
    path = config_path(project_root)
    if not path.exists():
        return {}
    with open(path) as f:
        return yaml.safe_load(f) or {}


def save_config(project_root: Path, config: Dict[str, Any]) -> Path:
    path = config_path(project_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        yaml.safe_dump(config, f, default_flow_style=False, sort_keys=True)
    return path


def get_config_value(project_root: Path, key: str) -> Any:
    """Read a dotted key path (e.g. ``git.remote``) from config."""
    config = load_config(project_root)
    node: Any = config
    for part in key.split("."):
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            return None
    return node


def set_config_value(project_root: Path, key: str, value: Any) -> Path:
    """Set a dotted key path, creating intermediate dicts as needed."""
    config = load_config(project_root)
    parts = key.split(".")
    node = config
    for part in parts[:-1]:
        if part not in node or not isinstance(node[part], dict):
            node[part] = {}
        node = node[part]
    node[parts[-1]] = value
    return save_config(project_root, config)
