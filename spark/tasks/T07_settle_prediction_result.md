# T07

- Skill: `/settle-prediction-result`
- Schedule: `毎時 :30` (Asia/Tokyo)
- Release: `2.2.0`

## Task text

```text
Task ID=T07。/settle-prediction-result を使い、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit でT5/T6が両方FINALのprediction_id+versionを最大10件最終監査する。resolution_ruleと両証拠が一致かつ十分ならcomparison=MATCH・t7_decision=APPROVE・RESULT_APPROVEDへ進める。不一致はCONFLICT、証拠不足はHOLD。settlement_keyで二重確定を防ぐ。
```
