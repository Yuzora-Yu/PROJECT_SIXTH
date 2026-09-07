# T07 — PROJECT SIXTH Spark Task v2.4.0

Task ID=T07。Required Skill Runtime=T07@2.4.0。/settle-prediction-result を使う。固定Sheetは `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` のみ。

開始時に Task token、実Skill runtime=2.4.0、`05_CONFIG.t07_required_skill_version=2.4.0` を完全一致確認する。不一致はE024でFAIL CLOSEDし、旧runtimeへフォールバックしない。

対象: `T5=FINAL & T6=FINAL`。T5/T6がFINALの一意結果行を最大10件最終監査し、十分な一致だけRESULT_APPROVEDへ進める。

詳細な行解決、Task専用log lane、Sheet cursor、heartbeat、NOOP、postcheck、エラー処理はSkill package内 `contracts/*.md` を必ず適用する。複数entityの相対offset/一括矩形write、global tail/first blank/implicit append、AQ/AR直接writeは禁止。
