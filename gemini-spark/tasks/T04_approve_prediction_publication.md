# T04 ④予言問題掲載判定

## 登録値

- Skill: `/approve-prediction-publication`
- Schedule: `毎時 :45（JST）`
- Timezone: `Asia/Tokyo`
- 処理上限: `6`
- 固定Sheet: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`

## Task本文（このまま登録）

```text
Task ID=T04。/approve-prediction-publication を使い、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit の status=CHECK_PASSED を最大6件最終判定する。公開日時・締切日時・結果確認予定をここで確定し、必要なT3 VERIFIED source候補は重複確認後に承認・昇格する。全条件を満たす問題だけAPPROVED_FOR_PUBLISHへ進め、同一git_publish_key処理済みはNOOP。
```

## 運用メモ

- Task本文は「何をするか」に限定し、詳細判定・列所有権・監査・FAIL CLOSED・ログ衝突対策はSkillへ委譲する。
- Schedule時刻は実行順を保証しない。同時刻Taskと相互待機しない。
- 固定Sheet以外へ書き込まない。`gid=` URLは使用しない。
