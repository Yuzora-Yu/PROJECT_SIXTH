# T05 ⑤結果確認1

## 登録値

- Skill: `/verify-prediction-result-primary`
- Schedule: `毎時 :00（JST）`
- Timezone: `Asia/Tokyo`
- 処理上限: `10`
- 固定Sheet: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`

## Task本文（このまま登録）

```text
Task ID=T05。/verify-prediction-result-primary を使い、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit の status=PUBLISHED かつ result_due_at_jst 到来済み・未確定の問題を最大10件、primary sourceで独立確認する。09_RESULTSはprediction_id+versionを一意キーとしてT5列だけ更新し、確定はFINAL、未確定はPENDING、source障害はERROR。final_result/T7列は変更しない。
```

## 運用メモ

- Task本文は「何をするか」に限定し、詳細判定・列所有権・監査・FAIL CLOSED・ログ衝突対策はSkillへ委譲する。
- Schedule時刻は実行順を保証しない。同時刻Taskと相互待機しない。
- 固定Sheet以外へ書き込まない。`gid=` URLは使用しない。
