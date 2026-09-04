# T07 ⑦結果監査・掲載判定

## 登録値

- Skill: `/settle-prediction-result`
- Schedule: `毎時 :30（JST）`
- Timezone: `Asia/Tokyo`
- 処理上限: `10`
- 固定Sheet: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`

## Task本文（このまま登録）

```text
Task ID=T07。/settle-prediction-result を使い、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit でT5/T6が両方FINALのprediction_id+versionを最大10件最終監査する。resolution_ruleと両証拠が一致かつ十分ならcomparison=MATCH・t7_decision=APPROVE・RESULT_APPROVEDへ進める。不一致はCONFLICT、証拠不足はHOLD。settlement_keyで二重確定を防ぐ。
```

## 運用メモ

- Task本文は「何をするか」に限定し、詳細判定・列所有権・監査・FAIL CLOSED・ログ衝突対策はSkillへ委譲する。
- Schedule時刻は実行順を保証しない。同時刻Taskと相互待機しない。
- 固定Sheet以外へ書き込まない。`gid=` URLは使用しない。
