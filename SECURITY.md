# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (main branch) | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability in Ledger Sync, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. Email the maintainer directly at the email listed on the GitHub profile
3. Include a description of the vulnerability, steps to reproduce, and potential impact
4. You can expect an initial response within 48 hours

## Security Architecture

### Authentication

- **OAuth 2.0 only** (Google, GitHub) — no password storage
- JWT tokens with configurable expiration (default 30 minutes)
- Token blacklist on logout prevents token reuse
- OAuth secrets stored server-side only; frontend never sees provider tokens

### Data Isolation

- All database tables are scoped by `user_id` foreign key
- Every API endpoint requires JWT authentication via `get_current_user` dependency
- Every database query filters by `current_user.id` — no cross-user data access possible
- User identity is extracted from JWT (not request parameters) — cannot be spoofed

### API Security

- **Rate limiting** via slowapi on all endpoints
- **Security headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **CORS** configured for frontend origin only
- **Input validation** via Pydantic schemas on all request bodies
- **SQL injection protection** via SQLAlchemy ORM (no raw SQL)
- **File upload validation** — only .xlsx/.xls accepted, chunked upload support

### Data Protection

- Transaction deduplication via SHA-256 hashing
- Soft deletes with `is_deleted` flag (audit trail preserved)
- Database: SQLite for development, PostgreSQL for production with connection pooling
- SQLite WAL mode enabled for concurrent read performance

### Account Management

- Account reset requires typing "RESET" to confirm
- Account deletion requires typing "DELETE" to confirm
- Both operations are irreversible and delete all user-scoped data

## Best Practices for Self-Hosting

1. **Use HTTPS** in production (Render provides this automatically)
2. **Set strong JWT secret**: `LEDGER_SYNC_JWT_SECRET_KEY` should be a random 256-bit key
3. **Use PostgreSQL** in production (not SQLite) for proper access controls
4. **Keep dependencies updated**: Run `uv lock --upgrade` and `pnpm update` regularly
5. **Enable database backups** if using a hosted PostgreSQL provider
6. **Do not expose** the database port publicly — only the backend API should access it
