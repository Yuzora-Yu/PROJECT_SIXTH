# T03 ③予言問題チェック

## 登録値

- Skill: `/audit-prediction-question`
- Schedule: `毎時 :30（JST）`
- Timezone: `Asia/Tokyo`
- 処理上限: `8 + source候補5`
- 固定Sheet: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`

## Task本文（このまま登録）

```text
Task ID=T03。/audit-prediction-question を使い、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit の status=DRAFTED を最大8件、一次情報から独立監査する。08_SOURCE_CANDIDATESの未監査sourceも最大5件検証し、完全ならCHECK_PASSED、重大不整合はCHECK_FAILED、情報不足・競合はHOLDのまま残す。
```

## 運用メモ

- Task本文は「何をするか」に限定し、詳細判定・列所有権・監査・FAIL CLOSED・ログ衝突対策はSkillへ委譲する。
- Schedule時刻は実行順を保証しない。同時刻Taskと相互待機しない。
- 固定Sheet以外へ書き込まない。`gid=` URLは使用しない。
