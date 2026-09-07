# State / heartbeat contract

- Task dependencies use business status/gates only. Same-slot tasks never wait for or assume each other's ordering.
- `04_SCHEDULES` is the execution heartbeat. Exact-search column B for the current Task ID and require exactly one schedule row. Only that row's H:N heartbeat fields may be updated.
- Heartbeat fields: `last_run_id,last_started_at_jst,last_ended_at_jst,last_status,last_rows_seen,last_rows_changed,last_note`.
- A scheduled pure NOOP with no business-state change writes heartbeat only; it does not consume a RUN_LOG lane row.
- A manual pure NOOP, any run with business changes/holds/errors, and any fail-closed ERROR writes one terminal RUN_LOG row in its Task lane plus heartbeat.
- `scheduled_for_jst` is written only when the platform provides an authoritative scheduled time. Manual/unknown remains blank; never infer nearest quarter-hour.
- SUCCESS/NOOP run rows have blank error fields. ERROR rows may populate them.
