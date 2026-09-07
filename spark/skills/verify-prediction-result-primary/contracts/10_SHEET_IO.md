# Deterministic Sheet I/O

- For an existing business entity, retain only its logical key during selection. Immediately before every write, exact-search the authoritative ID column and verify the expected version/key on that same row.
- Never infer a row from search-result position, prior row, contiguous blocks, list order, or relative offsets. Never reuse a cached row for the next entity.
- One entity = one exact-row write. Multi-entity rectangular writes are forbidden for business rows.
- After every business write, exact-search the entity again and directly re-read identity plus all fields just written. A mismatch is fail-closed.
- Rows with blank authoritative IDs may not receive operational non-formula values.
- `06_PREDICTIONS!AQ:AR` are Spreadsheet-formula-owned and must never be directly written by a Skill.
- Before terminal completion, re-count the task's eligible workset from the Sheet. Never claim “remaining 0” from memory or prior search results. A contradictory postcheck is `E025`.
- Heartbeat rows are never resolved by search-result position or arithmetic offset. Use only the Task's literal fixed A1 target and guard defined in the Task text and `05_CONFIG`.
