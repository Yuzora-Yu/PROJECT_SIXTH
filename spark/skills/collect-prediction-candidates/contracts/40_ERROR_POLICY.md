# Error policy additions for Spark 2.4.0

Use only error codes defined in `13_ERROR_POLICY`. Important deterministic-I/O codes:

- `E017 LOG_APPEND_COLLISION`: same audit_id/run_id exists more than once or write outcome duplicates.
- `E020 LOG_FIELD_INVALID`: schema/type/URL/error-field rule violation.
- `E023 LOG_LANE_CURSOR_MISMATCH`: lane/cursor/target/pre-post verification mismatch.
- `E024 RUNTIME_VERSION_MISMATCH`: Task token, active runtime, or Sheet required version mismatch.
- `E025 WORKSET_POSTCHECK_MISMATCH`: terminal re-count contradicts the run's claimed remaining eligible workset.
- `E026 LOG_LANE_CAPACITY_EXHAUSTED`: cursor is 0/full or target would leave the Task lane.

On E017/E023/E024/E025/E026, do not choose another row, another ID, another workbook, or another runtime as a workaround. Fail closed.
