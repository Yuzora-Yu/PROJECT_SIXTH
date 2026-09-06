# Gemini Spark — PROJECT SIXTH Prediction Ops

Current public workbook release: **2.2.0**  
Current Skill package: **2.3.2**  
Current Task package: **2.2.0**  
Contract: `PROJECT_SIXTH_PREDICTION_OPS` / schema `2.0.0`

## Fixed production Spreadsheet

- Spreadsheet ID: `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- Base URL: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`
- Timezone: `Asia/Tokyo`
- GID dependency: `NONE`

All Skills and Tasks must use the base URL above. Do not use a `gid=` URL, search for a similarly named workbook, or create a fallback workbook. If the fixed Sheet is inaccessible or the contract/schema is wrong, fail closed.

## 7 Skills

Readable sources: `skills/<skill-name>/SKILL.md`  
Gemini Spark upload packages: `packages/<skill-name>.zip`

1. `collect-prediction-candidates`
2. `draft-prediction-question`
3. `audit-prediction-question`
4. `approve-prediction-publication`
5. `verify-prediction-result-primary`
6. `verify-prediction-result-secondary`
7. `settle-prediction-result`

The package set is `2.3.2`. `audit-prediction-question` is `2.3.2`, `approve-prediction-publication` is `2.3.1`, and the other five Skills remain `2.3.0`. T03 2.3.2 adds exact `prediction_id|version` row re-resolution, one-entity/one-row writes, replay fencing, and one-entity audit appends. Every upload ZIP contains root `SKILL.md`.

## Tasks / Schedule

Individual copy/paste Task definitions are in `tasks/` using ASCII filenames.

| Time (JST) | Tasks |
|---|---|
| every hour `:00` | T01 / T05 |
| every hour `:15` | T02 / T06 |
| every hour `:30` | T03 / T07 |
| every hour `:45` | T04 |
| daily `06:45` | T08 optional event watch |

Same-slot tasks do not wait for each other. Workflow order is controlled only by Spreadsheet `status` / `gate`.

## Repository mirrors

`gemini-spark/` is the canonical readable copy. The existing `spark/` tree is kept as a compatibility mirror and is overwritten with the same Skills/Tasks/contract in this release. Do not edit the two trees independently.

## Base workbook

- Canonical repository path: `ops/PROJECT_SIXTH_GeminiSpark_Prediction_Ops.xlsx`
- Legacy mirror: `spreadsheet/PROJECT_SIXTH_GeminiSpark_Prediction_Ops_v2.xlsx`

Workbook public release remains `2.2.0`; Skill package versioning is independent.

Static QA boundary: complete (89/89 PASS). Next boundary is Gemini Spark runtime verification.
