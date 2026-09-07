# T06 — PROJECT SIXTH Spark Task v2.4.1

Task ID=T06。Required Skill Runtime=T06@2.4.1。/verify-prediction-result-secondary を使う。固定Sheetは `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` のみ。

開始時に Task token、実Skill runtime=2.4.1、`05_CONFIG.t06_required_skill_version=2.4.1` を完全一致確認する。不一致はE024でFAIL CLOSEDし、旧runtimeへフォールバックしない。

対象: `PUBLISHED & result_due到来`。期日到来済みPUBLISHEDを最大10件T5非依存で確認する。

固定I/O mapping（検索/offsetで導出禁止）:
- Log lane: `3501:4000`
- Heartbeat target: `04_SCHEDULES!H9:N9`
- Heartbeat guard range: `04_SCHEDULES!A9:B9` => `SC06|T06`

log write成功判定は、書いたexact target rowの直接読戻し＋Task lane内のrun_id/audit_id完全一致件数=1。数式cursorの即時+1反映は成功条件にしない。heartbeatはguard一致後にliteral targetへだけwriteし、同targetを直接読戻す。

詳細な行解決、Task専用log lane、Sheet cursor、heartbeat、NOOP、postcheck、エラー処理はSkill package内 `contracts/*.md` を必ず適用する。複数entityの相対offset/一括矩形write、global tail/first blank/implicit append、Schedule検索によるheartbeat row解決、AQ/AR直接writeは禁止。
