# Gemini Spark Tasks — PROJECT SIXTH Prediction Ops v2.0.0

## Contract

- Target Spreadsheet: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`
- Spreadsheet ID: `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- Contract: `PROJECT_SIXTH_PREDICTION_OPS`
- Schema: `2.0.0`
- GID dependency: `NONE`

Taskは簡潔にし、詳細ロジックは指定Skillへ置く。
SparkではTask/Scheduleから `/skill-name` を明示指定する。

| Task | Skill | Schedule (JST) | Prompt |
|---|---|---|---|
| T01 ①予言問題案収集 | `/collect-prediction-candidates` | 毎時 :02 | `/collect-prediction-candidates` を使い、固定Sheet `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` でcandidate modeを実行。予言問題候補を最大12件補充し、新規sourceは候補キューへ。候補0件でもRUN_LOGを残す。 |
| T02 ②選定・加筆修正・選択肢 | `/draft-prediction-question` | 毎時 :10 | `/draft-prediction-question` を使い、固定Sheet `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` のDISCOVEREDを最大8件処理。公開日時・締切日時は決めない。不明はHOLD。 |
| T03 ③予言問題チェック | `/audit-prediction-question` | 毎時 :18 | `/audit-prediction-question` を使い、DRAFTEDを最大8件独立監査し、新規source候補も最大5件検証。不整合はHOLD/FAILのまま残す。 |
| T04 ④予言問題掲載判定 | `/approve-prediction-publication` | 毎時 :26 | `/approve-prediction-publication` を使い、最大6件を最終判定。公開日・締切日・結果確認予定を確定し、条件を満たすものだけAPPROVED_FOR_PUBLISHへ。 |
| T05 ⑤結果確認1 | `/verify-prediction-result-primary` | 毎時 :36 | `/verify-prediction-result-primary` を使い、期限到来済みを最大10件primary sourceで独立確認。未確定はPENDING。 |
| T06 ⑥結果確認2 | `/verify-prediction-result-secondary` | 毎時 :43 | `/verify-prediction-result-secondary` を使い、期限到来済みを最大10件T5と独立確認。不一致はそのまま残す。 |
| T07 ⑦結果監査・掲載判定 | `/settle-prediction-result` | 毎時 :51 | `/settle-prediction-result` を使い、最大10件を最終監査。証拠一致かつ十分なものだけRESULT_APPROVEDへ。settlement_keyで二重処理を防ぐ。 |
| T08 大型イベント早期収集（任意） | `/collect-prediction-candidates` | 毎日 06:20 | `/collect-prediction-candidates` を使い、固定Sheet `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` でevent_watch modeを実行。1週間〜12か月先の大型イベントを最大20件EVENT_WATCHへ補充。 |

## Registration rule

1. 先に7個のSkill ZIPを登録する。
2. T01〜T07を作成し、各Taskで対応Skillを明示指定する。
3. Schedule作成場所/基準はAsia/Tokyo。
4. 各Taskを `Run now` で単体確認してからScheduleを有効化する。
5. T08は任意。最初はdailyでよい。
6. `gid=` 付きURLをTaskへ貼らない。
