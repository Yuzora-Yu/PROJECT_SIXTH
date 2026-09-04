# T06 ⑥結果確認2

## 登録値

- Skill: `/verify-prediction-result-secondary`
- Schedule: `毎時 :15（JST）`
- Timezone: `Asia/Tokyo`
- 処理上限: `10`
- 固定Sheet: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`

## Task本文（このまま登録）

```text
Task ID=T06。/verify-prediction-result-secondary を使い、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit の status=PUBLISHED かつ result_due_at_jst 到来済み・未確定の問題を最大10件、T5に依存せずsecondary sourceまたは独立経路で確認する。09_RESULTSはprediction_id+versionを一意キーとしてT6列だけ更新し、確定はFINAL、未確定はPENDING、source障害はERROR。不一致は修正せず残す。
```

## 運用メモ

- Task本文は「何をするか」に限定し、詳細判定・列所有権・監査・FAIL CLOSED・ログ衝突対策はSkillへ委譲する。
- Schedule時刻は実行順を保証しない。同時刻Taskと相互待機しない。
- 固定Sheet以外へ書き込まない。`gid=` URLは使用しない。
