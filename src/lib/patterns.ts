// 動作パターン 16枠。
//
// 出典: 筋トレMemo Realm DB（2025/07/10-2026/06/21, 4238セット・121種目）を
// 分類した結果。Vault の projects/training/種目は49本から16本へ畳める.md を参照。
//
// この 16 は固定である。種目は自由に増やせるが、必ずこのどれかに紐付く。
// 判定器はパターン単位で集計するので、枠を増やすとデータが薄まって判定が死ぬ。
//
// 注意: 元の分類器では Leg の 5 枠目が `return "その他"` というフォールバックで、
// 設計されたパターンではなかった。逃げ道になるため `下腿（カーフ）` に置き換えている。
// これは実測ではなく設計判断。
//
// ID と名称は旧実装 (2026-09-03, vanilla JS) から引き継いだもの。変えない。

export type PartId = 'Chest' | 'Back' | 'Shoulder' | 'Arm' | 'Leg' | 'Abdominal'

export interface Pattern {
  id: string
  part: PartId
  name: string
}

export const PATTERNS: Pattern[] = [
  { id: 'chest_press_flat', part: 'Chest', name: '水平プレス' },
  { id: 'chest_press_incline', part: 'Chest', name: '傾斜プレス' },
  { id: 'chest_adduction', part: 'Chest', name: '内転（flye）' },

  { id: 'back_pull_vertical', part: 'Back', name: '垂直プル' },
  { id: 'back_pull_horizontal', part: 'Back', name: '水平プル' },

  { id: 'shoulder_press', part: 'Shoulder', name: '肩プレス' },
  { id: 'shoulder_lateral', part: 'Shoulder', name: '側方挙上' },
  { id: 'shoulder_rear', part: 'Shoulder', name: '後部・アップライト' },

  { id: 'arm_elbow_flexion', part: 'Arm', name: '肘屈曲（カール）' },
  { id: 'arm_elbow_extension', part: 'Arm', name: '肘伸展（三頭）' },

  { id: 'leg_squat', part: 'Leg', name: 'スクワット系' },
  { id: 'leg_hinge', part: 'Leg', name: 'ヒンジ' },
  { id: 'leg_knee_extension', part: 'Leg', name: '膝伸展' },
  { id: 'leg_knee_flexion', part: 'Leg', name: '膝屈曲' },
  { id: 'leg_calf', part: 'Leg', name: '下腿（カーフ）' },

  { id: 'core_flexion', part: 'Abdominal', name: '体幹' }
]

export const PART_ORDER: PartId[] = ['Chest', 'Back', 'Shoulder', 'Arm', 'Leg', 'Abdominal']

export const PART_LABEL: Record<PartId, string> = {
  Chest: '胸',
  Back: '背',
  Shoulder: '肩',
  Arm: '腕',
  Leg: '脚',
  Abdominal: '腹'
}

export const PATTERN_BY_ID = new Map(PATTERNS.map((p) => [p.id, p]))
export const patternsOf = (part: PartId) => PATTERNS.filter((p) => p.part === part)
