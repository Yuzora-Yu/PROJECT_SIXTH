# PROJECT SIXTH Spark Runtime 2.4.1 — Exact Readback / Fixed Heartbeat

Public prediction catalog release remains **2.2.0** and workbook schema remains **2.0.0**. Runtime/Skill/Task package is **2.4.1**. Log-lane contract is **2.1.0**.

## Why 2.4.1 exists

A controlled manual T05 v2.4.0 NOOP exposed two independent runtime weaknesses:

1. `12_RUN_LOG!3001` was actually written correctly, but Spark's later global search / cursor read concluded the run row did not exist and treated the successful write as `E023`.
2. T05 heartbeat data was written one physical row too low into the T06 schedule row. The Task had conceptually resolved T05 but derived the physical schedule row incorrectly.

No result/business row was changed by that probe. 2.4.1 hardens only the deterministic I/O layer.

## Log write success

For Task Txx:

1. use only its dedicated lane and Sheet-owned cursor;
2. require the cursor target A cell blank immediately before write;
3. write one explicit A:P audit row or A:O run row;
4. directly re-read that exact physical row and require full payload equality;
5. search only the Task lane for the exact ID and require count 1;
6. treat formula cursor `+1` as advisory, not the write-success criterion.

If the next invocation still sees a cursor pointing at an occupied row, directly re-read the same cursor cell once. If it remains occupied, fail closed with E023. Never select a different row.

## Heartbeat mapping

Heartbeat rows are literal, not searched:

| Task | Target | Guard |
|---|---|---|
| T01 | `04_SCHEDULES!H4:N4` | `A4:B4 = SC01 / T01` |
| T02 | `04_SCHEDULES!H5:N5` | `A5:B5 = SC02 / T02` |
| T03 | `04_SCHEDULES!H6:N6` | `A6:B6 = SC03 / T03` |
| T04 | `04_SCHEDULES!H7:N7` | `A7:B7 = SC04 / T04` |
| T05 | `04_SCHEDULES!H8:N8` | `A8:B8 = SC05 / T05` |
| T06 | `04_SCHEDULES!H9:N9` | `A9:B9 = SC06 / T06` |
| T07 | `04_SCHEDULES!H10:N10` | `A10:B10 = SC07 / T07` |
| T08 | `04_SCHEDULES!H11:N11` | `A11:B11 = SC08 / T08` |

Before heartbeat write, the literal guard range must match exactly. A mismatch or exact-target readback mismatch is **E027 HEARTBEAT_TARGET_MISMATCH**. Adjacent rows are never a fallback.

## Deployment order

1. keep schedules paused;
2. replace all seven Skills with 2.4.1 packages;
3. replace T01–T08 Task text and reselect/save the newest Skill on every Scheduled Task;
4. apply the repository overwrite diff and pass `npm run spark:sync:check` + `npm run check`;
5. overwrite repair Sheet -> production;
6. controlled manual T05 NOOP probe;
7. production -> repair copy and inspect T05 run lane / fixed heartbeat before resuming schedules.
