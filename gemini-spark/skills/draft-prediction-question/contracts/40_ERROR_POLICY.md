# Error policy additions for Spark 2.4.1

Use only error codes defined in `13_ERROR_POLICY`. Important deterministic-I/O codes:

- `E017 LOG_APPEND_COLLISION`: same audit_id/run_id exists more than once inside the Task lane or write outcome duplicates.
- `E020 LOG_FIELD_INVALID`: schema/type/URL/error-field rule violation.
- `E023 LOG_LANE_CURSOR_MISMATCH`: Task lane/cursor missing/out-of-range, target occupied before write after one direct cursor re-read, exact target-row readback mismatch, or Task-lane ID count is not 1. **Cursor +1 non-advance alone is not E023.**
- `E024 RUNTIME_VERSION_MISMATCH`: Task token, active runtime, or Sheet required version mismatch.
- `E025 WORKSET_POSTCHECK_MISMATCH`: terminal re-count contradicts the run's claimed remaining eligible workset.
- `E026 LOG_LANE_CAPACITY_EXHAUSTED`: cursor is 0/full or target would leave the Task lane.
- `E027 HEARTBEAT_TARGET_MISMATCH`: fixed heartbeat guard range does not equal expected `SCxx|Txx`, or direct readback of the literal heartbeat H:N target does not match.

On E017/E023/E024/E025/E026/E027, do not choose another row, another ID, another workbook, another heartbeat row, or another runtime as a workaround. Fail closed.
