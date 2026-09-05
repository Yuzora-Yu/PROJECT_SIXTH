# T05

- Skill: `/verify-prediction-result-primary`
- Schedule: `毎時 :00` (Asia/Tokyo)
- Release: `2.2.0`

## Task text

```text
Task ID=T05。/verify-prediction-result-primary を使い、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit の status=PUBLISHED かつ result_due_at_jst 到来済み・未確定の問題を最大10件、primary sourceで独立確認する。09_RESULTSはprediction_id+versionを一意キーとしてT5列だけ更新し、確定はFINAL、未確定はPENDING、source障害はERROR。final_result/T7列は変更しない。
```
