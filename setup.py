"""Setup script for pip installation."""

from setuptools import setup, find_packages

setup(
    name="ledger-sync",
    version="0.1.0",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    install_requires=[
        "sqlalchemy>=2.0.0",
        "alembic>=1.13.0",
        "pandas>=2.2.0",
        "openpyxl>=3.1.0",
        "typer>=0.12.0",
        "pydantic>=2.7.0",
        "pydantic-settings>=2.2.0",
        "rich>=13.7.0",
    ],
    entry_points={
        "console_scripts": [
            "ledger-sync=ledger_sync.cli.main:app",
        ],
    },
    python_requires=">=3.11",
)
