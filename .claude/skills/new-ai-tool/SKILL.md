---
name: new-ai-tool
description: Use when adding a tool the AI chatbot can call (a new entry in the tool registry). Enforces user-scoping at the FastAPI dependency level (CurrentUser injected — the LLM cannot see another user's data regardless of args), the result-cap pattern (LLM cannot exfiltrate the whole DB), the central limit constants pattern, and the JSON Schema documentation that the LLM reads. Trigger when the user says "new AI tool", "let the chatbot do X", "add a tool to ai_tools.py", or wants to expose data to the LLM.
---

# Adding a new tool to the AI chatbot

## Non-negotiable invariants

1. **User-scoping is enforced at the FastAPI layer**, not at the tool layer. Every tool executor receives `User` (already authenticated) and a `Session` — its query MUST filter `WHERE user_id == user.id`. The LLM cannot bypass this regardless of what arguments it passes.
2. **Read-only.** No tool mutates data. Mutations go through explicit user UI actions. Adding a write-tool is a design discussion, not a routine change.
3. **Capped results.** A runaway LLM can blow the token budget or try to exfiltrate the entire DB. Every list-returning tool clamps `limit` server-side.
4. **JSON Schema is the LLM's only documentation.** Make `description` good — that's what tells the LLM when to call this tool vs another.

## Steps

All work happens in [backend/src/ledger_sync/api/ai_tools.py](backend/src/ledger_sync/api/ai_tools.py).

1. **Add limit constants at module top** if your tool returns a list. Follow the existing pattern:
   ```python
   MY_TOOL_DEFAULT_LIMIT = 20
   MY_TOOL_MAX_LIMIT = 100
   ```
   The executor clamp and the JSON Schema both reference these constants — drift is impossible.

2. **Write the executor function:**
   ```python
   def _exec_my_tool(user: User, db: Session, args: dict[str, Any]) -> Any:
       """One-line description for the docstring."""
       # Parse args defensively
       limit = min(int(args.get("limit", MY_TOOL_DEFAULT_LIMIT)), MY_TOOL_MAX_LIMIT)
       start = _parse_date(args.get("start_date"))  # already exists, raises 400 on bad date
       end = _parse_date(args.get("end_date"))

       # Query — user_id filter is mandatory
       stmt = select(Transaction).where(
           Transaction.user_id == user.id,
           Transaction.is_deleted.is_(False),
           # ... your filters
       ).limit(limit)

       rows = db.execute(stmt).scalars().all()

       # Return shape: serializable JSON (no Decimals, no datetimes — convert)
       return {
           "items": [
               {
                   "date": row.date.date().isoformat(),
                   "amount": _decimal(row.amount),  # already exists, Decimal -> float
                   # ...
               }
               for row in rows
           ],
           "count": len(rows),
           "truncated": len(rows) >= limit,
       }
   ```
   Use existing helpers: `_parse_date`, `_decimal`, `_apply_date_range`. Don't reinvent.

3. **Register the tool:**
   ```python
   _register(
       ToolSpec(
           name="my_tool",
           description=(
               "<2-4 sentences for the LLM. Tell it WHEN to use this. "
               "Mention typical user phrasings: 'when did I last...', "
               "'show me X', 'compare Y'. Don't describe implementation."
           ),
           schema={
               "type": "object",
               "properties": {
                   "start_date": {"type": "string", "description": "YYYY-MM-DD inclusive."},
                   "end_date": {"type": "string", "description": "YYYY-MM-DD inclusive."},
                   "limit": {
                       "type": "integer",
                       "minimum": 1,
                       "maximum": MY_TOOL_MAX_LIMIT,
                       "default": MY_TOOL_DEFAULT_LIMIT,
                   },
               },
               "required": [],
           },
           execute=_exec_my_tool,
       )
   )
   ```

4. **Test it.** Add a unit test in `backend/tests/unit/test_ai_tools.py`:
   - Sanity: it returns the expected shape
   - **Multi-user isolation:** create two users, insert data for both, assert the tool only returns user A's data when called with user A — this is the most important test
   - Limit clamping: passing `limit=999` returns `MY_TOOL_MAX_LIMIT`

5. **Don't add a tool the LLM can't usefully reach for.** Tools that overlap heavily (e.g. another search variant) make the LLM less reliable, not more. Before adding, check the existing 15 tools in `ai_tools.py` — if a small extension to an existing tool's args works, prefer that.

## What NOT to do

- **Don't take `user_id` from args.** Always use `user.id` from the injected `User`. If args contain a `user_id`, that's a security bug.
- **Don't return `Transaction` ORM objects directly** — convert to plain dicts with serializable scalars. `Decimal` and `datetime` need explicit conversion or the JSON encoder breaks.
- **Don't omit the `truncated` flag** on list-returning tools — the LLM uses it to decide whether to call again with a different filter.
- **Don't add a write tool.** If a user feature needs LLM-driven mutation, build a deterministic confirmation step in the UI.

## When you also need a frontend change

The frontend tool list is fetched from `GET /api/ai/tools` ([api/ai_tools.py](backend/src/ledger_sync/api/ai_tools.py) `list_tools` endpoint), so the LLM auto-discovers your new tool on next chat session. **No frontend code change needed for a new tool.**

The execution path is also generic: `POST /api/ai/tools/execute` already routes to whichever tool the LLM picks.

## Definition of done

- [ ] Limit constants at module top (if list-returning)
- [ ] Executor function with `user_id` filter + serializable return shape
- [ ] `_register(ToolSpec(...))` with a description aimed at the LLM, not humans
- [ ] Unit test asserting multi-user isolation
- [ ] Tool-count comment in [CLAUDE.md](CLAUDE.md) bumped (currently "15 read-only tools")
