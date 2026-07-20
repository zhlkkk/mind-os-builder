from __future__ import annotations

import shutil
import sys


def _binary(name: str) -> dict[str, object]:
    path = shutil.which(name)
    return {"available": path is not None, "path": path}


def doctor() -> dict[str, dict[str, dict[str, object]]]:
    return {
        "required": {
            "python": {
                "available": sys.version_info >= (3, 11),
                "version": ".".join(map(str, sys.version_info[:3])),
            }
        },
        "optional": {"obsidian": _binary("obsidian"), "opencli": _binary("opencli")},
        "experimental": {"folo": _binary("folocli")},
    }
