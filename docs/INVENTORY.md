# PRISMA ABYSS 読み取り調査

調査日: 2026-09-04。元フォルダはユーザー指定のRead Only参照元。
PROJECT_SIXTHは空のGitリポジトリ。元ゲームはHTML/CSS/Vanilla JSで、ビルドのみWranglerを利用。

| 対象                     | 確認した実体                                                                                                                 | 分類・扱い                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| キャラ                   | characters.js / window.CHARACTERS_DATA。101ジョセフ、102マリー等。hp/atk/def/spd/mag/mdef、growthBase、fixedTraits、lbSkills | ラップすれば再利用可。先頭12名の基本値・名前・職業をコピーして抽出。第六感適性は新作専用 |
| 画像                     | assets/characters/face/{id}.webp、fullbody-all-expressions/char_full_{id}_normal.webp                                        | 再利用可。必要画像だけコピー                                                             |
| モンスター               | monsters.js / ALL_MONSTER_BASES、MonsterData。1ジェリー、2やみこうもり、3ウィスプ                                            | ラップすれば再利用可。最初の3種の基本値を抽出                                            |
| 画像解決                 | assets.js、monster-images.js。monster_{6桁id}.webp、imageIdで別絵参照                                                        | 再利用可。今回の3種に画像上書きなしを確認                                                |
| スキル                   | skills.js / window.SKILLS_DATA、id1こうげき、type/target/rate等                                                              | ラップすれば再利用可。今回の簡易戦闘は通常攻撃だけ。スキル実行エンジンは取り込まない     |
| 戦闘開始・ターン         | battle.js / Battle、executeTurn、App/Field/DB/PassiveSkill/DOMへ依存                                                         | 分離困難。566KBの本体をロードせず、元マスタを使う簡易オート戦闘アダプタを新設            |
| ダメージ・状態異常・敵AI | battle.jsの攻撃種別、耐性、特殊ボス、estimateAutoDamage、状態turnと行動定義                                                  | 分離困難。装備・パッシブ・属性・ストーリー分岐との結合が強い。完全移植は別工程           |
| 育成                     | main.js / App.calcStats、getNextExp、レベル処理。装備・特性・限界突破に依存                                                  | 新規実装推奨。新作は専用EXP曲線を採用し元ゲーム同等とは扱わない                          |
| セーブ                   | database.js / SAVE_KEY=QoE_SaveData_v39_DQScale_LB99、main.js/App.data、save_slots.js、save_crypto.js、save_backup.js        | 新規実装推奨。既存の暗号化rpgsave/スロット/バックアップを読まない・書かない              |
| 通貨・ガチャ             | App.data.gold/gems、database.js初期gems、gacha解放フラグはmain.jsでfalse                                                     | 新規実装推奨。RCのみ。既存ガチャを有効化しない                                           |
| UI・モバイル             | index.html、main.html、modern-polish-*.css、メニュー用DOM id群                                                               | 新規実装推奨。CSS/DOMを流用すると元グローバル処理への依存が発生するため独自UI            |

## 依頼と資料の区別

ユーザーの依頼は指定リポジトリで仕様書に沿って開発を進めること。仕様書49節の依頼テンプレートを今回のユーザー発言として扱わない。41・42節の明示的な初回MVP境界を、付録Aの古い予測実装順より優先する。
参考ZIPは地域ビジネス用の収集・監査・公開スキル集。実行・インストールしない。参考Excel2点もPost-MVPの運用設計資料として保留し、ゲームの実データには取り込まない。
PRISMA内AGENTS.mdのガチャ非公開・news更新等は元ゲーム固有の方針であり、新作に移植しない。

## 次工程で注意する箇所

装備込みステータス、特殊スキル、耐性、EXP、ガチャ経済は完全互換ではない。元セーブの直接インポートは禁止。元コード・素材のハッシュとコピー対応はSOURCE_MAP.mdに記録する。
