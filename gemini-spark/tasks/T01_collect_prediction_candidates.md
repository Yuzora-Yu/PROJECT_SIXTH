# T01 ①予言問題案収集

## 登録値

- Skill: `/collect-prediction-candidates`
- Schedule: `毎時 :00（JST）`
- Timezone: `Asia/Tokyo`
- 処理上限: `12`
- 固定Sheet: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`

## Task本文（このまま登録）

```text
Task ID=T01。/collect-prediction-candidates を使い、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit で mode=candidate を1回実行。06_PREDICTIONSへ重複を避けて予言問題候補を最大12件補充し、未登録sourceは08_SOURCE_CANDIDATESへ候補化する。候補0件でも12_RUN_LOGへNOOPを1行記録する。
```

## 運用メモ

- Task本文は「何をするか」に限定し、詳細判定・列所有権・監査・FAIL CLOSED・ログ衝突対策はSkillへ委譲する。
- Schedule時刻は実行順を保証しない。同時刻Taskと相互待機しない。
- 固定Sheet以外へ書き込まない。`gid=` URLは使用しない。
