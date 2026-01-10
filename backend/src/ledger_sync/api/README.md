# Ledger Sync API

FastAPI-based REST API for Excel file ingestion and database reconciliation.

## 🚀 Quick Start

```powershell
# Install dependencies
pip install -r requirements.txt

# Start server
python -m uvicorn ledger_sync.api.main:app --reload

# Access API
# - Base URL: http://localhost:8000
# - API Docs: http://localhost:8000/docs
# - ReDoc: http://localhost:8000/redoc
```

## 📋 Endpoints

### Health Check

**GET /**

```bash
curl http://localhost:8000/
```

Response:

```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

### Health Status

**GET /health**

```bash
curl http://localhost:8000/health
```

Response:

```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

### Upload Excel File

**POST /api/upload**

Upload and process an Excel file.

**Parameters:**

- `file` (form-data, required): Excel file (.xlsx or .xls)
- `force` (query, optional): Force re-import if file was previously imported (default: false)

**Example using curl:**

```bash
curl -X POST \
  http://localhost:8000/api/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@MoneyManager.xlsx" \
  -F "force=false"
```

**Example using PowerShell:**

```powershell
$file = Get-Item "MoneyManager.xlsx"
$form = @{
    file = $file
}
Invoke-WebRequest -Uri "http://localhost:8000/api/upload?force=false" -Method Post -Form $form
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Successfully processed MoneyManager.xlsx",
  "stats": {
    "processed": 150,
    "inserted": 10,
    "updated": 5,
    "deleted": 2,
    "unchanged": 133
  },
  "file_name": "MoneyManager.xlsx"
}
```

**Error Response (400) - Invalid File Type:**

```json
{
  "detail": "Invalid file type. Expected .xlsx or .xls, got document.pdf"
}
```

**Error Response (409) - File Already Imported:**

```json
{
  "detail": "File already imported at 2026-01-10 12:00:00. Use --force to re-import."
}
```

**Error Response (500) - Processing Error:**

```json
{
  "detail": "Error processing file: [error message]"
}
```

## 🔧 Configuration

### CORS Settings

By default, the API allows requests from:

- `http://localhost:3000` (Next.js default)
- `http://localhost:5173` (Vite default)

To modify CORS settings, edit `src/ledger_sync/api/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://your-domain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Environment Variables

No environment variables required for basic operation. The API uses the existing database configuration from the main application.

## 📊 Response Models

### UploadResponse

```typescript
{
  success: boolean; // Operation success status
  message: string; // Human-readable message
  stats: {
    processed: number; // Total rows processed
    inserted: number; // New records added
    updated: number; // Records updated
    deleted: number; // Records soft-deleted
    unchanged: number; // Records unchanged
  }
  file_name: string; // Original filename
}
```

### HealthResponse

```typescript
{
  status: string; // "healthy" or error message
  version: string; // API version
}
```

## 🐛 Error Handling

The API returns standard HTTP status codes:

| Status Code | Meaning                                       |
| ----------- | --------------------------------------------- |
| 200         | Success                                       |
| 400         | Bad Request (invalid file type, missing file) |
| 409         | Conflict (file already imported)              |
| 500         | Internal Server Error                         |

All errors return a JSON response with a `detail` field containing the error message.

## 🔍 Interactive Documentation

FastAPI automatically generates interactive API documentation:

### Swagger UI

Visit http://localhost:8000/docs

Features:

- Interactive API explorer
- Try out requests directly in browser
- View request/response schemas
- Download OpenAPI specification

### ReDoc

Visit http://localhost:8000/redoc

Features:

- Clean, professional documentation
- Easy to navigate
- Code samples
- Search functionality

## 🧪 Testing the API

### Using curl

```bash
# Health check
curl http://localhost:8000/health

# Upload file
curl -X POST \
  http://localhost:8000/api/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test.xlsx"
```

### Using Python requests

```python
import requests

# Health check
response = requests.get("http://localhost:8000/health")
print(response.json())

# Upload file
with open("test.xlsx", "rb") as f:
    files = {"file": f}
    response = requests.post(
        "http://localhost:8000/api/upload",
        files=files,
        params={"force": False}
    )
    print(response.json())
```

### Using Postman

1. Create new request
2. Method: POST
3. URL: `http://localhost:8000/api/upload`
4. Body → form-data
5. Key: `file` (type: File)
6. Value: Select your Excel file
7. Params: Add `force` = `false`
8. Send

## 🚀 Production Deployment

### Using Uvicorn (Development)

```bash
uvicorn ledger_sync.api.main:app --reload --host 0.0.0.0 --port 8000
```

### Using Gunicorn (Production)

```bash
pip install gunicorn
gunicorn ledger_sync.api.main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

### Environment-Specific Settings

```python
# For production, modify main.py:
app = FastAPI(
    title="Ledger Sync API",
    description="Production API",
    version="1.0.0",
    docs_url=None,  # Disable docs in production
    redoc_url=None  # Disable redoc in production
)
```

## 📝 Logging

The API logs all operations using the existing logging configuration:

```python
from ledger_sync.utils.logging import logger

logger.info("Processing uploaded file: filename.xlsx")
logger.error("Error processing file", exc_info=True)
```

Logs are written to:

- Console (stdout)
- Log files (if configured)

## 🔒 Security Considerations

### Current Implementation

- ✅ File type validation
- ✅ Temporary file cleanup
- ✅ CORS configuration
- ✅ Error message sanitization

### Production Recommendations

- 🔐 Add authentication (JWT, OAuth2)
- 🔐 Implement rate limiting
- 🔐 Add file size limits
- 🔐 Use HTTPS only
- 🔐 Validate file content
- 🔐 Add request ID tracking
- 🔐 Implement API keys

## 📚 Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Uvicorn Documentation](https://www.uvicorn.org/)
- [Pydantic Documentation](https://docs.pydantic.dev/)

## 🆘 Troubleshooting

### Port already in use

```bash
# Use different port
uvicorn ledger_sync.api.main:app --reload --port 8001
```

### Module not found

```bash
# Reinstall dependencies
pip install -r requirements.txt
```

### CORS errors

Check that your frontend URL is in the `allow_origins` list in `main.py`.

### Database errors

Ensure database is initialized:

```bash
alembic upgrade head
```

---

**API Version:** 1.0.0
**Last Updated:** January 2026
