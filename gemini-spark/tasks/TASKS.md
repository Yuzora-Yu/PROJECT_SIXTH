# Gemini Spark Tasks

全Taskは次の固定Sheetのみを対象にする。別Sheetへのフォールバック禁止。

- Spreadsheet ID: `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- URL: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit?gid=1764421078#gid=1764421078`

## T01 — ①予言問題案収集

Schedule: hourly, minute :02, Asia/Tokyo

> 固定Sheet `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` に対してのみ `collect-prediction-candidates` Skillを使う。指定Sheetから公開可能性の高い予言問題候補を最大12件収集し、新規情報源はSOURCE_CANDIDATESへ記録する。成功/失敗をRUN_LOGへ追記する。

## T02 — ②選定・加筆修正・選択肢設定

Schedule: hourly, minute :10, Asia/Tokyo

> 固定Sheet `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` に対してのみ `draft-prediction-question` Skillを使う。status=DISCOVEREDを最大8件DRAFT化する。曖昧・未確認はHOLDにし、RUN_LOGへ追記する。

## T03 — ③予言問題チェック

Schedule: hourly, minute :18, Asia/Tokyo

> 固定Sheet `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` に対してのみ `audit-prediction-question` Skillを使う。status=DRAFTEDを最大8件独立監査し、SOURCE_CANDIDATESのPROPOSEDも最大5件検証する。RUN_LOGへ追記する。

## T04 — ④予言問題掲載判定

Schedule: hourly, minute :26, Asia/Tokyo

> 固定Sheet `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` に対してのみ `approve-prediction-publication` Skillを使う。status=CHECK_PASSEDを最大6件最終判定し、公開・締切・結果確認予定を確定する。条件を満たすものだけAPPROVED_FOR_PUBLISHへ進め、RUN_LOGへ追記する。

## T05 — ⑤予言問題結果確認1

Schedule: hourly, minute :36, Asia/Tokyo

> 固定Sheet `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` に対してのみ `verify-prediction-result-primary` Skillを使う。期限到来済みの未確定問題を最大10件一次確認する。未確定はPENDING。最終結果列は変更せずRUN_LOGへ追記する。

## T06 — ⑥予言問題結果確認2

Schedule: hourly, minute :43, Asia/Tokyo

> 固定Sheet `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` に対してのみ `verify-prediction-result-secondary` Skillを使う。期限到来済みの未確定問題を最大10件、T5から独立して確認する。不一致はCONFLICTとして残し、RUN_LOGへ追記する。

## T07 — ⑦結果監査・掲載判定

Schedule: hourly, minute :51, Asia/Tokyo

> 固定Sheet `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` に対してのみ `settle-prediction-result` Skillを使う。T5/T6が両方FINALのものを最大10件監査し、一致かつ証拠十分なものだけRESULT_APPROVEDへ進める。settlement_keyを必ず設定し、RUN_LOG/AUDIT_LOGへ追記する。

## T08 — 大型イベント早期収集（任意）

Schedule: daily 06:20, Asia/Tokyo または Topic Monitor

> 固定Sheet `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` に対してのみ `collect-prediction-candidates` Skillのイベントウォッチモードを使い、1週間〜12か月先の国際的・国民的大イベントをEVENT_WATCHへ最大20件収集する。ここでは予言問題を公開しない。

## 注意

Schedule の時刻は負荷分散用。Task間の完了順を保証するためのものではない。各Taskはstatus/gateだけを依存条件にする。
