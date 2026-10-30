"""Fail when package and Home Assistant manifest versions diverge."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())
    manifest = json.loads((ROOT / "custom_components/assist_workspace/manifest.json").read_text())
    project_version = project["project"]["version"]
    manifest_version = manifest["version"]
    if project_version != manifest_version:
        raise SystemExit(
            f"Version mismatch: pyproject={project_version}, manifest={manifest_version}"
        )
    print(f"Version {project_version} is consistent")


if __name__ == "__main__":
    main()
