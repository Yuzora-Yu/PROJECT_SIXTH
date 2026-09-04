# Gemini Spark agents for PROJECT SIXTH

このディレクトリは、現実予測のバックオフィス運用を Gemini Spark へ引き継ぐための登録原本。

## 構成

- `skills/*/SKILL.md`: 7個のSkill原本
- `packages/*.zip`: Gemini SparkへアップロードするSkill package
- `tasks/TASKS.md`: Task prompt と Schedule
- `../ops/PROJECT_SIXTH_GeminiSpark_Prediction_Ops.xlsx`: 編集・監査用Sheet原本
- `../docs/GEMINI_SPARK_OPERATIONS.md`: 全体運用仕様
- `../docs/PREDICTION_SOURCE_POLICY.md`: 情報源ポリシー

## 登録順

1. 本番管理Sheetは Spreadsheet ID `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y` / `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit?gid=1764421078#gid=1764421078` に固定済み。
2. `packages/*.zip` を Gemini Spark Skills に登録。Skill v1.1.0 はこのSheet URLを内包する。
3. 各Taskも同じ固定Sheet URLを明記する。
4. `TASKS.md` の T01〜T07 を作成。
5. 各 Task をまず `Run now` でテストし、担当列以外を変更していないことを確認。
6. Schedule を設定。
7. T08 は任意。最初は daily で十分。

## 不変条件

- Task本文は短く、詳細はSkillへ置く。
- Skillは担当列を限定する。
- 不明ならHOLD。
- RUN_LOG/AUDIT_LOGを消さない。
- 時刻順に依存しない。
- GitHub Actionsはgate=READYしか読まない。

## 固定Spreadsheet

- ID: `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- URL: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit?gid=1764421078#gid=1764421078`
- Skill/TaskはこのSheet以外を操作しない。アクセス不能・schema不一致時はfail closed。
