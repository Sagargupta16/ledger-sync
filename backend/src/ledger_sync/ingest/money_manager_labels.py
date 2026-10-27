"""Text and category labels both Money Manager readers derive the same way.

The transaction reader (``money_manager``) and the repeat-rule and budget
reader (``money_manager_planning``) share these, so a rule names its category
exactly as the transactions it generates do.
"""

from __future__ import annotations

UNCATEGORIZED = "Uncategorized"


def clean_text(value: object) -> str:
    """A column's value as stripped text; NULL becomes an empty string."""
    return str(value).strip() if value is not None else ""


def category_labels(name: object, parent: object) -> tuple[str, str | None]:
    """The (category, subcategory) pair an export gives a ZCATEGORY name and its parent's.

    A category with a parent is a subcategory of that parent; a row with no
    category at all is Uncategorized.
    """
    parent_label = clean_text(parent)
    if parent_label:
        return parent_label, clean_text(name)
    return clean_text(name) or UNCATEGORIZED, None
