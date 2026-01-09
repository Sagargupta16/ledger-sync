"""Command-line interface."""

import sys
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from ledger_sync import __version__
from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.db.session import SessionLocal, init_db
from ledger_sync.ingest.validator import ValidationError
from ledger_sync.utils.logging import logger, setup_logging

app = typer.Typer(
    name="ledger-sync",
    help="Production-ready Excel ingestion and reconciliation engine for Money Manager Pro",
    add_completion=False,
)
console = Console()


def version_callback(value: bool) -> None:
    """Print version and exit."""
    if value:
        console.print(f"ledger-sync version {__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: Optional[bool] = typer.Option(
        None,
        "--version",
        "-v",
        help="Show version and exit",
        callback=version_callback,
        is_eager=True,
    ),
) -> None:
    """Ledger Sync - Excel ingestion and reconciliation engine."""
    pass


@app.command()
def import_file(
    file_path: Path = typer.Argument(
        ...,
        help="Path to Excel file to import",
        exists=True,
        file_okay=True,
        dir_okay=False,
        readable=True,
    ),
    force: bool = typer.Option(
        False,
        "--force",
        "-f",
        help="Force re-import even if file was previously imported",
    ),
    verbose: bool = typer.Option(
        False,
        "--verbose",
        help="Enable verbose logging",
    ),
) -> None:
    """Import Excel file and synchronize with database.

    This command loads an Excel export from Money Manager Pro and synchronizes
    it with the local database. The operation is idempotent - importing the
    same file twice will result in no changes.
    """
    # Setup logging
    log_level = "DEBUG" if verbose else "INFO"
    setup_logging(log_level)

    try:
        # Initialize database
        console.print("[bold blue]Initializing database...[/bold blue]")
        init_db()

        # Create session
        session = SessionLocal()

        try:
            # Create sync engine and import
            engine = SyncEngine(session)

            console.print(f"[bold blue]Importing {file_path}...[/bold blue]")
            stats = engine.import_file(file_path, force=force)

            # Display results in a nice table
            table = Table(title="Import Results", show_header=True, header_style="bold magenta")
            table.add_column("Metric", style="cyan", width=20)
            table.add_column("Count", justify="right", style="green", width=10)

            table.add_row("Rows Processed", str(stats.processed))
            table.add_row("Inserted", str(stats.inserted), style="green")
            table.add_row("Updated", str(stats.updated), style="yellow")
            table.add_row("Soft Deleted", str(stats.deleted), style="red")
            table.add_row("Skipped (Unchanged)", str(stats.skipped), style="dim")

            console.print()
            console.print(table)
            console.print()
            console.print("[bold green]✓ Import completed successfully![/bold green]")

        finally:
            session.close()

    except ValidationError as e:
        console.print(f"[bold red]Validation Error:[/bold red] {e}")
        logger.error(f"Validation error: {e}")
        raise typer.Exit(code=1)

    except ValueError as e:
        console.print(f"[bold yellow]Warning:[/bold yellow] {e}")
        logger.warning(str(e))
        raise typer.Exit(code=0)  # Not an error, just already imported

    except Exception as e:
        console.print(f"[bold red]Error:[/bold red] {e}")
        logger.exception("Unexpected error during import")
        raise typer.Exit(code=1)


@app.command()
def init() -> None:
    """Initialize database (create tables).

    This command creates all necessary database tables. It's safe to run
    multiple times - existing tables won't be affected.
    """
    try:
        console.print("[bold blue]Initializing database...[/bold blue]")
        init_db()
        console.print("[bold green]✓ Database initialized successfully![/bold green]")
    except Exception as e:
        console.print(f"[bold red]Error:[/bold red] {e}", err=True)
        logger.exception("Error initializing database")
        raise typer.Exit(code=1)


@app.command(name="import")
def import_command(
    file_path: Path = typer.Argument(
        ...,
        help="Path to Excel file to import",
        exists=True,
        file_okay=True,
        dir_okay=False,
        readable=True,
    ),
    force: bool = typer.Option(
        False,
        "--force",
        "-f",
        help="Force re-import even if file was previously imported",
    ),
    verbose: bool = typer.Option(
        False,
        "--verbose",
        help="Enable verbose logging",
    ),
) -> None:
    """Import Excel file (alias for import-file command)."""
    import_file(file_path, force, verbose)


if __name__ == "__main__":
    app()
