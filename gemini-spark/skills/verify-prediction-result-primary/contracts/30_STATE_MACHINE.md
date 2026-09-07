# State / heartbeat contract — v2.4.1

- Task dependencies use business status/gates only. Same-slot tasks never wait for or assume each other's ordering.
- `04_SCHEDULES` is the execution heartbeat, but the physical heartbeat row is **not searched or inferred**.
- Each Task text contains a literal heartbeat target `04_SCHEDULES!Hn:Nn`, literal guard range `04_SCHEDULES!An:Bn`, and expected guard `SCxx|Txx`. These must match `05_CONFIG.txx_heartbeat_range` and `txx_heartbeat_guard`.
- Before heartbeat write, directly read the literal guard range and require exact `schedule_id|task_id` match. Guard mismatch is `E027`; do not write any adjacent row.
- Write only the literal heartbeat target. Fields are `last_run_id,last_started_at_jst,last_ended_at_jst,last_status,last_rows_seen,last_rows_changed,last_note`.
- After heartbeat write, directly re-read the same literal H:N target and verify the exact payload. Do not inspect neighboring rows as a success check.
- A scheduled pure NOOP with no business-state change writes heartbeat only; it does not consume a RUN_LOG lane row.
- A manual pure NOOP, any run with business changes/holds/errors, and any fail-closed ERROR writes one terminal RUN_LOG row in its Task lane plus heartbeat when the heartbeat guard is valid.
- `scheduled_for_jst` is written only when the platform provides an authoritative scheduled time. Manual/unknown remains blank; never infer nearest quarter-hour.
- SUCCESS/NOOP run rows have blank error fields. ERROR rows may populate them.
