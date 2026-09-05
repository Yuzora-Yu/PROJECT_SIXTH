# T06

- Skill: `/verify-prediction-result-secondary`
- Schedule: `毎時 :15` (Asia/Tokyo)
- Release: `2.2.0`

## Task text

```text
Task ID=T06。/verify-prediction-result-secondary を使い、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit の status=PUBLISHED かつ result_due_at_jst 到来済み・未確定の問題を最大10件、T5に依存せずsecondary sourceまたは独立経路で確認する。09_RESULTSはprediction_id+versionを一意キーとしてT6列だけ更新し、確定はFINAL、未確定はPENDING、source障害はERROR。不一致は修正せず残す。
```
