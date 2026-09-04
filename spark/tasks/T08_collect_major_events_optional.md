# T08 大型イベント早期収集（任意）

## 登録値

- Skill: `/collect-prediction-candidates`
- Schedule: `毎日 06:45（JST）`
- Timezone: `Asia/Tokyo`
- 処理上限: `20`
- 固定Sheet: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`

## Task本文（このまま登録）

```text
Task ID=T08。/collect-prediction-candidates を使い、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit で mode=event_watch を1回実行。1週間〜12か月先の大型イベントを最大20件10_EVENT_WATCHへ補充し、06_PREDICTIONSへ問題本体は作らない。追加0件でも12_RUN_LOGへNOOPを1行記録する。
```

## 運用メモ

- Task本文は「何をするか」に限定し、詳細判定・列所有権・監査・FAIL CLOSED・ログ衝突対策はSkillへ委譲する。
- Schedule時刻は実行順を保証しない。同時刻Taskと相互待機しない。
- 固定Sheet以外へ書き込まない。`gid=` URLは使用しない。
