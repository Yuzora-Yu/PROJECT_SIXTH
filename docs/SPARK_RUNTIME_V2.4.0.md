# PROJECT SIXTH Spark Runtime 2.4.0 — Deterministic I/O

Public Prediction Catalog release remains **2.2.0**. Workbook schema remains **2.0.0**. This release changes Spark runtime/Task/logging behavior only.

## Design boundary

- Spark owns semantic judgement, source verification, state decisions, and logical-key entity processing.
- The Sheet owns publish/final gates and physical log cursors.
- Tasks own task identity, runtime token, filter, and maximum workset size.
- Spark never chooses a global log tail, first blank row, relative entity row, or multi-entity rectangle.

## Runtime binding

Every Task carries `Required Skill Runtime=Txx@2.4.0`. Before operational writes the Skill verifies:

1. Task ID/token,
2. active Skill runtime `2.4.0`,
3. `05_CONFIG.txx_required_skill_version=2.4.0`.

Mismatch is `E024` and fails closed before business writes. After replacing a Skill in Gemini Spark, reopen each Scheduled Task, reselect the newest Skill, and save it.

## Dedicated log lanes

Both `11_AUDIT_LOG` and `12_RUN_LOG` use the same physical lane map:

| Owner | Rows |
|---|---:|
| legacy / ADMIN / GAS / GitHub | 4–1000 |
| T01 | 1001–1500 |
| T02 | 1501–2000 |
| T03 | 2001–2500 |
| T04 | 2501–3000 |
| T05 | 3001–3500 |
| T06 | 3501–4000 |
| T07 | 4001–4500 |
| T08 | 4501–5000 |

Each Task reads only `05_CONFIG.txx_audit_next_write_row` / `txx_run_next_write_row`. These are Sheet formulas and read-only to Skills. Cursor `0` means lane capacity exhausted (`E026`). A Task may not fall back to another lane or the legacy area.

## Log write protocol

1. Verify current Task lane and cursor.
2. Globally exact-search the planned audit/run ID; fresh ID count must be 0.
3. Immediately re-read cursor and complete target row; it must still be the same cursor and blank.
4. Write exactly one explicit schema row in the Task lane.
5. Read it back, require ID count 1, and require cursor to advance by exactly +1.
6. Ambiguous outcome is `E023` / `E017`; never compensate on another row.

Historical duplicate audit IDs remain immutable evidence.

## Entity writes

All mutable business entities are located by their authoritative logical key immediately before each write. `06_PREDICTIONS` uses `(prediction_id, version)`; `09_RESULTS` uses the same composite key. One entity is written to one exact row and read back immediately. Cached rows, list positions, relative offsets, and multi-entity rectangular writes are forbidden. `06_PREDICTIONS!AQ:AR` remain Sheet-formula-owned.

## Heartbeat and NOOP

`04_SCHEDULES!H:N` is the heartbeat for the exact Task row:

`last_run_id,last_started_at_jst,last_ended_at_jst,last_status,last_rows_seen,last_rows_changed,last_note`.

A **scheduled pure NOOP** writes heartbeat only and does not consume a RUN_LOG lane row. A manual NOOP, any business change/HOLD, and any ERROR writes exactly one terminal Task RUN_LOG row plus heartbeat.

## Terminal workset recount

Before terminal completion the Task re-queries its eligible workset from the Sheet. It may not claim “remaining 0” from memory or from the start-of-run snapshot. Contradiction is `E025`.

## New error codes

- `E023 LOG_LANE_CURSOR_MISMATCH`
- `E024 RUNTIME_VERSION_MISMATCH`
- `E025 WORKSET_POSTCHECK_MISMATCH`
- `E026 LOG_LANE_CAPACITY_EXHAUSTED`

## Deployment order

1. Stage and verify repair Sheet 2.4.0.
2. Replace all seven Skill ZIPs.
3. Replace/update T01–T08 Task texts.
4. In every Scheduled Task, reselect the newest Skill and save.
5. Apply repository overwrite diff; run `npm run spark:sync:check` and `npm run check`.
6. Only then overwrite repair Sheet → production Sheet.
7. Run controlled Task tests and copy production → repair for verification.
