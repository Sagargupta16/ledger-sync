# Migration Notes

## Rollback Limitations
Migrations from 2026-02-03 onward have empty `downgrade()` functions.
Rolling back past the analytics tables migration (20260203_1700) is not supported.

If rollback is needed, restore from a database backup taken before the migration was applied.

## SQLite-Specific SQL
Several data migrations use raw SQLite-specific SQL in `op.execute()`.
If migrating to PostgreSQL, these migrations may need adjustment.
