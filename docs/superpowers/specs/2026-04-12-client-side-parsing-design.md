# Client-Side File Parsing Design

## Goal

Move Excel/CSV parsing from the backend to the frontend so the server receives structured JSON instead of raw files. Eliminates Vercel serverless timeout issues and provides instant client-side validation.

## Architecture

**Current flow:** Frontend sends raw file -> Backend parses (pandas/openpyxl) -> normalizes -> hashes -> reconciles -> analytics

**New flow:** Frontend parses (SheetJS) -> validates columns -> sends JSON rows -> Backend validates (Pydantic) -> normalizes (category corrections, transfer resolution) -> hashes -> reconciles -> analytics

The split: frontend handles file I/O and column mapping. Backend remains the authority on normalization rules (category corrections, account standardization, transfer from/to logic), hashing (includes user_id), dedup, and DB operations.

## Frontend Changes

### New dependency: `xlsx` (SheetJS)

- npm package `xlsx` for Excel/CSV parsing in the browser
- Lazy-loaded via dynamic `import('xlsx')` to avoid bloating the initial bundle (~200KB gzipped)

### New module: `lib/fileParser.ts`

Accepts a `File` object, returns structured data:

```ts
interface ParsedTransaction {
  date: string         // ISO 8601: "2024-01-15"
  amount: number       // positive, 2 decimal places
  currency: string     // default "INR"
  type: string         // "Income" | "Expense" | "Transfer-In" | "Transfer-Out"
  account: string
  category: string
  subcategory?: string
  note?: string
}

interface ParseResult {
  rows: ParsedTransaction[]
  fileName: string
  fileHash: string     // SHA-256 hex of raw file bytes
}
```

Responsibilities:
1. Read file as ArrayBuffer
2. Compute SHA-256 file hash via `crypto.subtle.digest()`
3. Parse with SheetJS (`XLSX.read()`) into row objects
4. Map flexible column names to standard fields (same list as backend settings.py):
   - date: "Period", "Date", "date", "period"
   - account: "Accounts", "Account", "account", "accounts"
   - category: "Category", "category"
   - amount: "Amount / INR", "Amount", "amount", "Amount/INR"
   - type: "Income/Expense", "Type", "type", "Transaction Type"
   - note (optional): "Note", "note", "Notes", "notes", "Description"
   - subcategory (optional): "Subcategory", "subcategory", "Sub Category"
   - currency (optional): "Currency", "currency"
5. Validate: throw user-friendly errors for missing required columns, non-numeric amounts, unparseable dates, empty file
6. Format dates to ISO 8601, amounts to 2dp numbers, trim strings
7. Return ParseResult

### Updated: `services/api/upload.ts`

- Remove FormData construction
- Send JSON body to `POST /api/upload`:
  ```ts
  { file_name: string, file_hash: string, rows: ParsedTransaction[], force: boolean }
  ```
- Remove the 90s timeout (JSON payload processes in <5s)
- Keep onUploadProgress for the network transfer phase

### Updated: `hooks/api/useUpload.ts`

- Accept parsed data instead of raw File
- Types updated to match new payload

### Updated: `pages/UploadSyncPage.tsx`

- Three-phase progress: "Parsing file..." -> "Uploading data..." -> "Processing..."
- Client-side validation errors shown immediately (before any network call)
- Parse errors displayed inline with row numbers
- Dropzone accepts .xlsx, .xls, AND .csv (backend already supported CSV, dropzone didn't)

### Updated: `constants/columns.ts` (new)

Shared column name mappings extracted to a constant so they're easy to update:

```ts
export const COLUMN_MAPPINGS = {
  date: ['Period', 'Date', 'date', 'period'],
  account: ['Accounts', 'Account', 'account', 'accounts'],
  category: ['Category', 'category'],
  amount: ['Amount / INR', 'Amount', 'amount', 'Amount/INR'],
  type: ['Income/Expense', 'Type', 'type', 'Transaction Type'],
  note: ['Note', 'note', 'Notes', 'notes', 'Description'],
  subcategory: ['Subcategory', 'subcategory', 'Sub Category'],
  currency: ['Currency', 'currency'],
}
```

## Backend Changes

### New Pydantic schema: `schemas/upload.py`

```python
class TransactionRow(BaseModel):
    date: str            # ISO 8601
    amount: float        # positive
    currency: str = "INR"
    type: str            # Income, Expense, Transfer-In, Transfer-Out
    account: str
    category: str
    subcategory: str | None = None
    note: str | None = None

class TransactionUploadRequest(BaseModel):
    file_name: str
    file_hash: str
    rows: list[TransactionRow]
    force: bool = False
```

### Replaced: `api/upload.py`

- Endpoint signature changes from `UploadFile` to `TransactionUploadRequest` JSON body
- Removes: temp file creation, chunked reading, magic byte validation, file size limit (JSON has its own size limit via request body size)
- Keeps: file_hash dedup check against ImportLog, SyncEngine orchestration
- SyncEngine gets a new method `import_rows(rows, file_name, file_hash, force)` that accepts pre-parsed dicts instead of a file path

### Updated: `core/sync_engine.py`

New method `import_rows()`:
1. Check file_hash against ImportLog (same dedup as `import_file`)
2. Convert each TransactionRow dict into the normalized format that `normalize_row` produces (date as datetime, amount as Decimal, type as TransactionType enum, etc.). This bypasses the pandas Series path -- instead, a new `normalize_from_dict(row_dict)` method on DataNormalizer accepts a plain dict with already-typed fields and applies only the category corrections, account standardization, transfer from/to resolution, and note cleaning. No column mapping or date/amount parsing needed since the frontend already handled that.
3. Run Reconciler batches (same as today)
4. Log import, run analytics

The existing `import_file()` method stays for potential CLI use but is no longer called from the API.

### Kept as-is

- `ingest/normalizer.py` -- still called by SyncEngine for category corrections, transfer logic
- `ingest/hash_id.py` -- still called by Reconciler for SHA-256 transaction hashes
- `core/reconciler.py` -- unchanged
- `core/analytics_engine.py` -- unchanged
- `ingest/excel_loader.py`, `ingest/csv_loader.py`, `ingest/validator.py` -- kept for `import_file()` CLI path, no longer called from API

### Removed from API path

- Temp file creation/cleanup
- Magic byte validation
- Chunked file reading
- pandas/openpyxl dependency for the API endpoint (still used by import_file CLI path)

## Error Handling

| Error | Where caught | User sees |
|-------|-------------|-----------|
| Missing required column | Frontend (fileParser) | "Missing required column 'Date'. Expected one of: Period, Date, date, period" |
| Non-numeric amount | Frontend (fileParser) | "Row 5: Amount must be a number, got 'abc'" |
| Unparseable date | Frontend (fileParser) | "Row 12: Could not parse date 'not-a-date'" |
| Empty file | Frontend (fileParser) | "File contains no data rows" |
| Invalid file format | Frontend (SheetJS) | "Could not read file. Ensure it's a valid .xlsx, .xls, or .csv file" |
| File already imported | Backend (409) | Same conflict UI as today |
| Pydantic validation fail | Backend (422) | Toast with field-level errors |
| Server processing error | Backend (500) | Toast with error message |

## Testing

- **Frontend**: Unit tests for `fileParser.ts` -- column mapping, date parsing, amount validation, error cases. Use fixtures with mock ArrayBuffers or small test files.
- **Backend**: Update existing upload API tests to send JSON instead of files. Add tests for `import_rows()` on SyncEngine. Existing normalizer/reconciler tests unchanged.

## Migration

This is a breaking API change (file upload -> JSON body). Since only the frontend calls this endpoint, both sides deploy together. No data migration needed -- the database schema is unchanged.
