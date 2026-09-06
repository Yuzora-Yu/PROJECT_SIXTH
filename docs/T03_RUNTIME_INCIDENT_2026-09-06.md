# T03 runtime incident — 2026-09-06

## Observed

- T03 v2.3.1 once wrote T3 results two physical rows below their intended predictions.
- T03 v2.3.2 fixed prediction row targeting: the 21:55 run wrote PRED-040..045 to the correct entity rows.
- The same v2.3.2 run nevertheless wrote audit records into historical interior log rows and later wrote the same audit IDs again at the physical tail. This overwrote six older audit records and produced six duplicate audit IDs.
- The v2.3.2 run did not leave a terminal RUN_LOG row.
- PRED-045 inherited E019 from the previous entity even though its actual hold reason was primary-source publication eligibility.
- A later manual T03 invocation at 22:39 logged `skill_version=2.3.1` and NOOP, proving an older runtime could still be selected after the Sheet metadata had been updated.

## v2.3.3 controls

1. Task/runtime handshake: T03 Task carries `Required Skill Runtime=T03@2.3.3`; `05_CONFIG.t3_required_skill_version` must also be `2.3.3`.
2. Prediction writes remain `prediction_id+version` exact-row writes.
3. AUDIT/RUN logs never use first-blank or implicit append. They write one explicit row at the greatest non-empty physical row in column A + 1, ignoring interior gaps.
4. The previous tail is snapshotted and verified unchanged after each log write.
5. A terminal RUN_LOG row is mandatory on SUCCESS, NOOP, or fail-closed ERROR.
6. Error state is reset per entity. Primary-source publication ineligibility uses E022; resolution mismatch uses E019.
7. Historical duplicate audit rows are preserved as evidence; overwritten historical audit rows are restored by ADMIN_REPAIR rather than deleting or rewriting existing rows.
