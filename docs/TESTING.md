# Testing Guide

## Overview

Ledger Sync includes comprehensive testing for both backend and frontend to ensure code quality and reliability.

## Backend Testing

### Testing Framework

- **pytest** - Unit and integration testing
- **pytest-cov** - Code coverage reporting
- **pytest-mock** - Mocking and patching
- **SQLAlchemy** test fixtures

### Test Structure

```
backend/tests/
├── __init__.py
├── conftest.py          # Shared fixtures
├── unit/               # Unit tests
│   ├── test_hash_id.py
│   ├── test_normalizer.py
│   └── test_validator.py
└── integration/        # Integration tests
    ├── test_reconciler.py
    └── test_api_endpoints.py
```

### Running Tests

```bash
cd backend

# Run all tests
pytest

# Run specific test file
pytest tests/unit/test_hash_id.py

# Run specific test function
pytest tests/unit/test_hash_id.py::test_hash_generation

# Run with verbose output
pytest -v

# Run with coverage
pytest --cov=ledger_sync tests/

# Run with coverage and HTML report
pytest --cov=ledger_sync --cov-report=html tests/

# Run in watch mode (requires pytest-watch)
ptw

# Run only failing tests
pytest --lf

# Run with detailed output
pytest -vv --tb=long
```

### Writing Unit Tests

```python
# tests/unit/test_example.py
import pytest
from ledger_sync.core.calculator import calculate_total_income

class TestCalculator:
    """Test financial calculator"""

    def test_calculate_total_income_with_valid_data(self):
        """Test total income calculation with valid transactions"""
        transactions = [
            {"type": "Income", "amount": 1000},
            {"type": "Income", "amount": 500},
            {"type": "Expense", "amount": 200},
        ]
        result = calculate_total_income(transactions)
        assert result == 1500

    def test_calculate_total_income_with_no_income(self):
        """Test total income calculation with no income transactions"""
        transactions = [
            {"type": "Expense", "amount": 100},
            {"type": "Expense", "amount": 200},
        ]
        result = calculate_total_income(transactions)
        assert result == 0

    def test_calculate_total_income_with_empty_list(self):
        """Test total income calculation with empty transaction list"""
        result = calculate_total_income([])
        assert result == 0

    @pytest.mark.parametrize("amount,expected", [
        (100, 100),
        (0, 0),
        (-100, 0),  # Negative income not counted
    ])
    def test_calculate_income_parametrized(self, amount, expected):
        """Test income calculation with various amounts"""
        transactions = [{"type": "Income", "amount": amount}]
        result = calculate_total_income(transactions)
        assert result == expected
```

### Writing Integration Tests

```python
# tests/integration/test_reconciler.py
import pytest
from ledger_sync.core.reconciler import Reconciler
from ledger_sync.db.models import Transaction

class TestReconciler:
    """Test transaction reconciliation"""

    def test_insert_new_transaction(self, test_db_session, sample_transaction_data):
        """Test inserting a new transaction"""
        reconciler = Reconciler(test_db_session)

        transaction, action = reconciler.reconcile_transaction(
            sample_transaction_data,
            "test.xlsx",
            datetime.now(UTC)
        )

        assert action == "inserted"
        assert transaction.amount == sample_transaction_data["amount"]
        assert transaction.category == sample_transaction_data["category"]

    def test_update_existing_transaction(self, test_db_session, sample_transaction):
        """Test updating an existing transaction"""
        reconciler = Reconciler(test_db_session)

        # Get existing transaction
        existing = test_db_session.query(Transaction).first()
        original_amount = existing.amount

        # Update amount
        updated_data = {
            "date": existing.date,
            "amount": 2000,
            "category": existing.category,
            "account": existing.account,
        }

        transaction, action = reconciler.reconcile_transaction(
            updated_data,
            "test.xlsx",
            datetime.now(UTC)
        )

        assert action == "updated"
        assert transaction.amount == 2000
        assert transaction.amount != original_amount

    def test_skip_unchanged_transaction(self, test_db_session, sample_transaction):
        """Test skipping unchanged transaction"""
        reconciler = Reconciler(test_db_session)

        existing = test_db_session.query(Transaction).first()
        data = {
            "date": existing.date,
            "amount": existing.amount,
            "category": existing.category,
            "account": existing.account,
        }

        transaction, action = reconciler.reconcile_transaction(
            data,
            "test.xlsx",
            datetime.now(UTC)
        )

        assert action == "skipped"
```

### Test Fixtures

```python
# tests/conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction

@pytest.fixture
def test_db():
    """Create test database"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return engine

@pytest.fixture
def test_db_session(test_db):
    """Create test database session"""
    Session = sessionmaker(bind=test_db)
    session = Session()
    yield session
    session.close()

@pytest.fixture
def sample_transaction_data():
    """Sample transaction data"""
    return {
        "date": datetime(2025, 1, 15),
        "amount": 100.50,
        "type": "Expense",
        "category": "Food",
        "account": "Checking",
        "description": "Groceries",
    }

@pytest.fixture
def sample_transaction(test_db_session, sample_transaction_data):
    """Create sample transaction in database"""
    txn = Transaction(**sample_transaction_data)
    test_db_session.add(txn)
    test_db_session.commit()
    return txn
```

### Mocking

```python
from unittest.mock import patch, MagicMock
import pytest

def test_api_call_with_mock():
    """Test API endpoint with mocked database"""
    with patch("ledger_sync.api.analytics.get_filtered_transactions") as mock_get:
        mock_get.return_value = [
            {"type": "Income", "amount": 1000},
        ]

        result = get_overview()
        assert result["total_income"] == 1000
        mock_get.assert_called_once()
```

### Code Coverage

```bash
# Generate coverage report
pytest --cov=ledger_sync --cov-report=html tests/

# View HTML report
open htmlcov/index.html  # macOS
start htmlcov/index.html # Windows
xdg-open htmlcov/index.html # Linux
```

### Continuous Integration

Example GitHub Actions workflow (`.github/workflows/test.yml`):

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2

      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: 3.11

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-dev.txt

      - name: Run tests
        run: pytest --cov=ledger_sync tests/

      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

## Frontend Testing

### Testing Framework

- **Jest** - Unit and integration testing
- **React Testing Library** - Component testing
- **Vitest** - Fast unit test runner (alternative to Jest)

### Test Structure

```
frontend/tests/
├── unit/              # Unit tests
│   └── utils/
├── components/        # Component tests
│   └── ChartComponent.test.tsx
└── integration/       # Integration tests
```

### Running Tests

```bash
cd frontend

# Run all tests
npm test

# Run specific test file
npm test -- ChartComponent.test.tsx

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Update snapshots
npm test -- -u
```

### Writing Component Tests

```typescript
// src/components/__tests__/MyComponent.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MyComponent } from "../MyComponent";

describe("MyComponent", () => {
  it("renders with data", () => {
    render(<MyComponent data="Hello" onAction={() => {}} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("calls onAction when button clicked", async () => {
    const mockAction = jest.fn();
    render(<MyComponent data="Test" onAction={mockAction} />);

    const button = screen.getByRole("button", { name: /action/i });
    await userEvent.click(button);

    expect(mockAction).toHaveBeenCalled();
  });

  it("renders loading state", () => {
    render(<MyComponent data="" onAction={() => {}} isLoading={true} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
```

### Writing Hook Tests

```typescript
// src/hooks/__tests__/useMyHook.test.ts
import { renderHook, act } from "@testing-library/react";
import { useMyHook } from "../useMyHook";

describe("useMyHook", () => {
  it("returns initial value", () => {
    const { result } = renderHook(() => useMyHook("initial"));
    expect(result.current.value).toBe("initial");
  });

  it("updates value when setValue called", () => {
    const { result } = renderHook(() => useMyHook("initial"));

    act(() => {
      result.current.setValue("updated");
    });

    expect(result.current.value).toBe("updated");
  });
});
```

### Mocking API Calls

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { MyComponent } from "../MyComponent";

// Mock the API module
jest.mock("../../services/api", () => ({
  fetchData: jest.fn(),
}));

import { fetchData } from "../../services/api";

describe("MyComponent with API", () => {
  it("fetches and displays data", async () => {
    (fetchData as jest.Mock).mockResolvedValue([{ id: 1, name: "Item 1" }]);

    render(<MyComponent />);

    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });
  });

  it("handles API error", async () => {
    (fetchData as jest.Mock).mockRejectedValue(new Error("API failed"));

    render(<MyComponent />);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});
```

### Snapshot Testing

```typescript
import { render } from "@testing-library/react";
import { MyComponent } from "../MyComponent";

it("matches snapshot", () => {
  const { container } = render(<MyComponent data="Test" onAction={() => {}} />);
  expect(container).toMatchSnapshot();
});
```

Update snapshots after intentional changes:

```bash
npm test -- -u
```

## Performance Testing

### Backend Performance

```python
import time

def test_large_transaction_import_performance():
    """Test importing large number of transactions"""
    transactions = [create_transaction() for _ in range(10000)]

    start = time.time()
    reconciler.reconcile_many(transactions)
    duration = time.time() - start

    # Should process in less than 5 seconds
    assert duration < 5.0
```

### Frontend Performance

```typescript
it("renders chart with 1000 data points in under 1 second", () => {
  const data = generateChartData(1000);

  const start = performance.now();
  render(<Chart data={data} />);
  const duration = performance.now() - start;

  expect(duration).toBeLessThan(1000);
});
```

## E2E Testing (Future)

### Cypress Setup

```bash
npm install --save-dev cypress
npx cypress open
```

### Example E2E Test

```typescript
// cypress/e2e/file-upload.cy.ts
describe("File Upload", () => {
  it("uploads file successfully", () => {
    cy.visit("http://localhost:3000");
    cy.get("[data-testid=file-input]").selectFile("test.xlsx");
    cy.get("[data-testid=upload-button]").click();
    cy.contains("Upload successful").should("be.visible");
  });
});
```

## Test Best Practices

1. **Test Behavior, Not Implementation**

   ```typescript
   // ✅ Good - tests behavior
   expect(screen.getByText("Hello")).toBeInTheDocument();

   // ❌ Bad - tests implementation
   expect(component.state.isVisible).toBe(true);
   ```

2. **Use Descriptive Test Names**

   ```typescript
   // ✅ Good
   it("displays error message when API fails", () => {});

   // ❌ Bad
   it("handles error", () => {});
   ```

3. **Arrange, Act, Assert**

   ```typescript
   it("calculates total correctly", () => {
     // Arrange
     const numbers = [1, 2, 3];

     // Act
     const result = sum(numbers);

     // Assert
     expect(result).toBe(6);
   });
   ```

4. **Keep Tests Isolated**

   - Each test should be independent
   - Clean up after tests (teardown)
   - Don't rely on test execution order

5. **Aim for Good Coverage**
   - Aim for 80%+ code coverage
   - Focus on critical paths
   - Test edge cases and error scenarios

## Debugging Tests

### Backend Debugging

```bash
# Run tests with debugging
pytest -s  # Show print statements
pytest -vv # Very verbose output
pytest --pdb  # Drop into debugger on failure
```

### Frontend Debugging

```bash
# Run tests in watch mode and debug in browser
npm test -- --watch --debug

# Or use VS Code debugger
# Set breakpoint and run in debug mode
```

## Continuous Testing

### Pre-commit Hooks

Use husky to run tests before commit:

```bash
npx husky install
npx husky add .husky/pre-commit "pytest && npm test"
```

### GitHub Actions

Automatically run tests on push/PR to ensure code quality.
