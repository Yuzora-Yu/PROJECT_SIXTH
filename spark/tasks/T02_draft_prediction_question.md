# T02 ②選定・加筆修正・選択肢

## 登録値

- Skill: `/draft-prediction-question`
- Schedule: `毎時 :15（JST）`
- Timezone: `Asia/Tokyo`
- 処理上限: `8`
- 固定Sheet: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`

## Task本文（このまま登録）

```text
Task ID=T02。/draft-prediction-question を使い、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit の status=DISCOVERED のみ最大8件処理。採否を判断して問題文・選択肢・resolution_rule・承認済みsourceを整え、必要条件が揃う行だけDRAFTEDへ進める。より適切な未登録sourceを見つけた場合は候補化だけ行い、不明はHOLD。公開日時・締切日時・結果確認予定は設定しない。
```

## 運用メモ

- Task本文は「何をするか」に限定し、詳細判定・列所有権・監査・FAIL CLOSED・ログ衝突対策はSkillへ委譲する。
- Schedule時刻は実行順を保証しない。同時刻Taskと相互待機しない。
- 固定Sheet以外へ書き込まない。`gid=` URLは使用しない。
