# T04 — PROJECT SIXTH Spark Task v2.4.0

Task ID=T04。Required Skill Runtime=T04@2.4.0。/approve-prediction-publication を使う。固定Sheetは `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit` のみ。

開始時に Task token、実Skill runtime=2.4.0、`05_CONFIG.t04_required_skill_version=2.4.0` を完全一致確認する。不一致はE024でFAIL CLOSEDし、旧runtimeへフォールバックしない。

対象: `status=CHECK_PASSED`。CHECK_PASSEDを最大6件最終判定し、全条件を満たす問題だけAPPROVED_FOR_PUBLISHへ進める。

詳細な行解決、Task専用log lane、Sheet cursor、heartbeat、NOOP、postcheck、エラー処理はSkill package内 `contracts/*.md` を必ず適用する。複数entityの相対offset/一括矩形write、global tail/first blank/implicit append、AQ/AR直接writeは禁止。
