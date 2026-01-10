.PHONY: help install test lint format type-check clean run init

help:
	@echo "ledger-sync - Development Commands"
	@echo ""
	@echo "Available commands:"
	@echo "  make install      - Install dependencies with Poetry"
	@echo "  make test         - Run tests with pytest"
	@echo "  make test-cov     - Run tests with coverage report"
	@echo "  make lint         - Run ruff linter"
	@echo "  make format       - Format code with black"
	@echo "  make type-check   - Run mypy type checker"
	@echo "  make quality      - Run all quality checks (lint, format, type-check)"
	@echo "  make clean        - Remove generated files"
	@echo "  make init         - Initialize database"
	@echo "  make shell        - Activate Poetry shell"

install:
	poetry install

test:
	poetry run pytest -v

test-cov:
	poetry run pytest --cov=src/ledger_sync --cov-report=html --cov-report=term-missing

lint:
	poetry run ruff check src/ tests/

format:
	poetry run black src/ tests/

format-check:
	poetry run black --check src/ tests/

type-check:
	poetry run mypy src/

quality: lint format-check type-check
	@echo "✓ All quality checks passed!"

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name htmlcov -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name ".coverage" -delete
	rm -f ledger_sync.db 2>/dev/null || true

init:
	poetry run ledger-sync init

shell:
	poetry shell

# Development workflow
dev: install quality test
	@echo "✓ Development setup complete!"

# Pre-commit checks
pre-commit: format lint type-check test
	@echo "✓ Pre-commit checks passed!"
