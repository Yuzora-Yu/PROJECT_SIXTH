# Deterministic log lanes — v2.4.1

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

For every fresh audit/run record:
1. Read the Task lane mapping and the task-specific cursor by exact config key. Cursor `0`, missing mapping, or cursor outside the Task lane is `E026`/`E023`.
2. Search **only inside the Task's own lane** for the fresh `audit_id` or `run_id`; require count `0` before writing. Do not use a whole-sheet/global search as the primary write-outcome check.
3. Immediately before writing, directly read the complete target row at the cursor and require the authoritative ID cell A to be blank. If it is nonblank, directly re-read the same cursor config cell once; if the same occupied target remains, return `E023`. Never choose another row, first blank, or global tail.
4. Write exactly one explicit schema row in the Task's own lane: A:P for audit or A:O for run. Never use implicit append, table append, first blank, global tail, or another Task's lane.
5. **Primary success check:** directly re-read the exact row just written and require every written field to match the intended payload.
6. **Secondary uniqueness check:** search only the Task lane for the exact `audit_id`/`run_id` and require count `1`. Count `0`/`>1` is `E023`/`E017`.
7. The Sheet formula cursor advancing immediately by `+1` is **advisory only**, because formula recalculation/read caching can lag. Cursor non-advance by itself is NOT a write failure if steps 5–6 pass.
8. On the next write attempt, an occupied cursor target is handled by step 3. Never compensate to a different row or a different ID.

Existing historical duplicates remain evidence and are not rewritten.
