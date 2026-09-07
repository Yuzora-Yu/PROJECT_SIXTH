# Deterministic log lanes

`11_AUDIT_LOG` and `12_RUN_LOG` are append-only evidence, but Spark never chooses a global tail. Each Task owns one physical lane in each log sheet.

- T01: rows 1001–1500
- T02: rows 1501–2000
- T03: rows 2001–2500
- T04: rows 2501–3000
- T05: rows 3001–3500
- T06: rows 3501–4000
- T07: rows 4001–4500
- T08: rows 4501–5000

For Task Txx, read only `05_CONFIG.txx_audit_next_write_row` and `05_CONFIG.txx_run_next_write_row`. The formulas are Sheet-owned and read-only to Skills.

For every audit/run record:
1. Read the lane mapping and cursor. Cursor `0`, cursor outside the lane, or missing mapping is `E026`/`E023`.
2. Exact-search the record ID globally and require count 0 before a fresh write.
3. Immediately before writing, re-read the cursor and the complete target row; require the same cursor and a completely blank target schema row.
4. Write exactly one explicit row range in the Task's own lane. Never use implicit append, table append, first blank, global tail, or another Task's lane.
5. Read back the target row and verify the cursor advanced by exactly +1. Exact-search the record ID and require count 1. Otherwise `E023`/`E017`, no compensating write.
6. Never retry an ambiguous write to a different row or with a different ID.

Audit schema is A:P (16 fields). Run schema is A:O (15 fields). Existing historical duplicates remain evidence and are not rewritten.
