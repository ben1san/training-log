// 研究でよく使われる種目のプリセット。
//
// 出典: 以下2本のシステマティックレビュー／メタ分析の、採用研究の
// トレーニングプロトコルに **実際に名前が出ている種目** だけを採った。
//
//   [A] Superset Versus Traditional Resistance Training Prescriptions:
//       A Systematic Review and Meta-analysis (PMC12011898)
//   [B] Comparison of Traditional and Advanced Resistance Training Paradigms
//       on Muscle Hypertrophy in Trained Individuals (PMC11022786)
//
// 追加の2件は上記の外で、出典を個別に持つ:
//   ヒップスラスト        … 臀筋肥大のSR/MA (PMC12018462)
//   ノルディックハムカール … Nordic vs stiff-leg deadlift RCT (medRxiv 2024)
//
// **意図的に入れていないもの。**懸垂（チンニング）とブルガリアンスクワットは
// 実際の訓練では定番だが、上の2本のレビューの種目リストに現れなかったため
// 落としてある。「研究でよく使われる」という基準に厳密に従った結果で、
// 良い種目ではないという判断ではない。
//
// patternId は16枠（patterns.ts）への紐付けで必須。枠を増やしてはいない。
// 種目を増やしても回復判定は16枠で集計するので薄まらない。薄まるのは
// 種目タブ側の個別履歴だけである。

export interface Preset { name: string; patternId: string; src: 'A' | 'B' | 'AB' | 'other' }

export const PRESETS: Preset[] = [
  // 胸 — 水平プレス
  { name: 'ベンチプレス', patternId: 'chest_press_flat', src: 'AB' },
  { name: 'ダンベルベンチプレス', patternId: 'chest_press_flat', src: 'A' },
  { name: 'マシンチェストプレス', patternId: 'chest_press_flat', src: 'AB' },
  { name: 'ディップス', patternId: 'chest_press_flat', src: 'B' },
  // 胸 — 傾斜プレス
  { name: 'インクラインベンチプレス', patternId: 'chest_press_incline', src: 'AB' },
  { name: 'インクラインダンベルプレス', patternId: 'chest_press_incline', src: 'B' },
  // 胸 — 内転（flye）
  { name: 'ダンベルフライ', patternId: 'chest_adduction', src: 'A' },
  { name: 'ペックデックフライ', patternId: 'chest_adduction', src: 'B' },
  { name: 'ケーブルクロスオーバー', patternId: 'chest_adduction', src: 'B' },

  // 背 — 垂直プル
  { name: 'ラットプルダウン', patternId: 'back_pull_vertical', src: 'AB' },
  { name: 'プルオーバー', patternId: 'back_pull_vertical', src: 'B' },
  // 背 — 水平プル
  { name: 'シーテッドロー', patternId: 'back_pull_horizontal', src: 'AB' },
  { name: 'ベントオーバーロー', patternId: 'back_pull_horizontal', src: 'A' },
  { name: 'ワンハンドダンベルロー', patternId: 'back_pull_horizontal', src: 'B' },

  // 肩 — 肩プレス
  { name: 'バーベルショルダープレス', patternId: 'shoulder_press', src: 'AB' },
  { name: 'ダンベルショルダープレス', patternId: 'shoulder_press', src: 'A' },
  // 肩 — 側方挙上
  { name: 'サイドレイズ', patternId: 'shoulder_lateral', src: 'B' },
  // 肩 — 後部・アップライト
  { name: 'リアレイズ', patternId: 'shoulder_rear', src: 'A' },
  { name: 'アップライトロー', patternId: 'shoulder_rear', src: 'AB' },

  // 腕 — 肘屈曲（カール）
  { name: 'バーベルカール', patternId: 'arm_elbow_flexion', src: 'B' },
  { name: 'ダンベルカール', patternId: 'arm_elbow_flexion', src: 'AB' },
  { name: 'プリーチャーカール', patternId: 'arm_elbow_flexion', src: 'B' },
  // 腕 — 肘伸展（三頭）
  { name: 'トライセプスプレスダウン', patternId: 'arm_elbow_extension', src: 'B' },
  { name: 'ライイングトライセプスエクステンション', patternId: 'arm_elbow_extension', src: 'A' },
  { name: 'オーバーヘッドトライセプスエクステンション', patternId: 'arm_elbow_extension', src: 'AB' },

  // 脚 — スクワット系
  { name: 'バーベルスクワット', patternId: 'leg_squat', src: 'AB' },
  { name: 'スミスマシンスクワット', patternId: 'leg_squat', src: 'A' },
  { name: 'レッグプレス', patternId: 'leg_squat', src: 'AB' },
  { name: 'ダンベルランジ', patternId: 'leg_squat', src: 'B' },
  // 脚 — ヒンジ
  { name: 'デッドリフト', patternId: 'leg_hinge', src: 'A' },
  { name: 'ルーマニアンデッドリフト', patternId: 'leg_hinge', src: 'A' },
  { name: 'スティッフレッグデッドリフト', patternId: 'leg_hinge', src: 'B' },
  { name: 'トラップバーデッドリフト', patternId: 'leg_hinge', src: 'A' },
  { name: 'ヒップスラスト', patternId: 'leg_hinge', src: 'other' },
  // 脚 — 膝伸展
  { name: 'レッグエクステンション', patternId: 'leg_knee_extension', src: 'AB' },
  // 脚 — 膝屈曲
  { name: 'シーテッドレッグカール', patternId: 'leg_knee_flexion', src: 'AB' },
  { name: 'ライイングレッグカール', patternId: 'leg_knee_flexion', src: 'A' },
  { name: 'ノルディックハムストリングカール', patternId: 'leg_knee_flexion', src: 'other' },
  // 脚 — 下腿（カーフ）
  { name: 'シーテッドカーフレイズ', patternId: 'leg_calf', src: 'B' },
  { name: 'スタンディングカーフレイズ', patternId: 'leg_calf', src: 'B' },

  // 腹 — 体幹
  { name: 'クランチ', patternId: 'core_flexion', src: 'B' },
  { name: 'シットアップ', patternId: 'core_flexion', src: 'B' },
  { name: 'アブドミナルマシン', patternId: 'core_flexion', src: 'B' }
]
