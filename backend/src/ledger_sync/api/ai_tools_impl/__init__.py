"""AI tools implementation subpackage.

Importing this package triggers tool registration in the central REGISTRY
via the side-effect imports of each tool module.
"""

from . import analytics_tools, categories_summary, transactions  # noqa: F401
from .registry import REGISTRY, ToolSpec, register

__all__ = ["REGISTRY", "ToolSpec", "register"]
