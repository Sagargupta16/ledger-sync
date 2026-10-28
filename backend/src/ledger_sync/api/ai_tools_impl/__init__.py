"""AI tools implementation subpackage.

Importing this package triggers tool registration in the central REGISTRY
via the side-effect imports of each tool module.
"""

from . import (  # noqa: F401
    aggregate,
    analytics_tools,
    categories_summary,
    tax_history_tools,
    transactions,
    wealth_tools,
)
from .registry import REGISTRY, ToolSpec, register

__all__ = ["REGISTRY", "ToolSpec", "register"]
