# T03

- Skill: `/audit-prediction-question`
- Schedule: `毎時 :30` (Asia/Tokyo)
- Public release: `2.2.0`
- Task package: `2.2.1`
- Required Skill Runtime: `T03@2.3.3`

## Task text

```text
Task ID=T03。Required Skill Runtime=T03@2.3.3。/audit-prediction-question を使う。開始時に、このTask本文のRequired Skill RuntimeがT03@2.3.3であること、実際に有効なSkill runtimeが2.3.3であること、固定Sheet https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit の05_CONFIGでt3_required_skill_version=2.3.3であることをすべて確認する。1つでも確認できない、または2.3.1/2.3.2等の旧runtimeが選択されている場合はFAIL CLOSEDとしてSheetへ何も書き込まない。確認後、status=DRAFTEDを最大8件独立監査する。統計・市場・気象データは公式series/field・単位・期間境界・timezoneの意味一致まで確認し、新規source候補も最大5件検証する。不整合はPASSせずHOLD/FAILにする。06_PREDICTIONSはprediction_id+versionで各entityを再検索して1 entity=1 exact-row write。11_AUDIT_LOG/12_RUN_LOGはcolumn Aの最終非空物理行+1だけへ単一行の明示range writeを行い、途中の空白行・implicit append・bulk appendを使用しない。
```
