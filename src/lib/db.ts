import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { monotonicFactory } from 'ulid'

// 同一ミリ秒に2件入ったときの順序をランダム部に任せないため monotonic を使う。
// Vault側は ulid の辞書順だけで追記順を復元できる必要がある。
const ulid = monotonicFactory()

// 記録する列は4つ + 日次体重だけ。**追記のみで、行は物理削除しない。**
// 取り消しは voidedAt を立てるだけにする（旧実装から引き継いだ決定）。
// 同期を後から足したとき、追記のみなら競合しないため。
// 由来: projects/training/記録項目は落とす側で決まった
// 落としたもの: 器具タイプ / 部位 / RPE / レスト時間 / 睡眠・体調・食事
//   部位は patternId から導出する。レストは at の差から導出する。

export type Rir = 0 | 1 | 2 | 3 | 4 // 4 は "4+"

export interface SetRecord {
  ulid: string
  exerciseId: string
  weight: number // kg
  reps: number
  rir: Rir
  at: number // 完了時刻 (epoch ms)。開始時刻は取らない
  day: string // ローカル日 YYYY-MM-DD
  voidedAt: number | null // 取り消し。行は消さない
}

export interface Exercise {
  ulid: string
  name: string
  patternId: string // 16枠への紐付け。必須
  createdAt: number
}

export interface BodyWeight {
  ulid: string
  kg: number
  at: number // 水分変動を事後にフィルタするため時刻を持つ
  day: string
}

interface Schema extends DBSchema {
  sets: {
    key: string
    value: SetRecord
    indexes: { by_exercise: [string, number]; by_day: string }
  }
  exercises: {
    key: string
    value: Exercise
    indexes: { by_pattern: string; by_name: string }
  }
  bodyweight: {
    key: string
    value: BodyWeight
    indexes: { by_day: string }
  }
}

export const localDay = (at: number): string => {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null

export const db = () => {
  dbp ??= openDB<Schema>('training', 1, {
    upgrade(d) {
      const sets = d.createObjectStore('sets', { keyPath: 'ulid' })
      sets.createIndex('by_exercise', ['exerciseId', 'at'])
      sets.createIndex('by_day', 'day')

      const ex = d.createObjectStore('exercises', { keyPath: 'ulid' })
      ex.createIndex('by_pattern', 'patternId')
      ex.createIndex('by_name', 'name', { unique: true })

      const bw = d.createObjectStore('bodyweight', { keyPath: 'ulid' })
      bw.createIndex('by_day', 'day')
    }
  })
  return dbp
}

// --- 種目 ---

export const listExercises = async (): Promise<Exercise[]> =>
  (await (await db()).getAll('exercises')).sort((a, b) => a.name.localeCompare(b.name, 'ja'))

export const addExercise = async (name: string, patternId: string): Promise<Exercise> => {
  const e: Exercise = { ulid: ulid(), name: name.trim(), patternId, createdAt: Date.now() }
  await (await db()).add('exercises', e)
  return e
}

// --- セット ---

/** その種目の直近セット。重量とレップのプリフィル元。 */
export const lastSetOf = async (exerciseId: string): Promise<SetRecord | undefined> => {
  const d = await db()
  let cur = await d
    .transaction('sets')
    .store.index('by_exercise')
    .openCursor(IDBKeyRange.bound([exerciseId, -Infinity], [exerciseId, Infinity]), 'prev')
  while (cur) {
    if (cur.value.voidedAt === null) return cur.value
    cur = await cur.continue()
  }
  return undefined
}

export const addSet = async (
  s: Omit<SetRecord, 'ulid' | 'at' | 'day' | 'voidedAt'> & { at?: number }
): Promise<SetRecord> => {
  const at = s.at ?? Date.now()
  const rec: SetRecord = {
    ulid: ulid(at),
    exerciseId: s.exerciseId,
    weight: s.weight,
    reps: s.reps,
    rir: s.rir,
    at,
    day: localDay(at),
    voidedAt: null
  }
  await (await db()).add('sets', rec)
  return rec
}

/** 取り消し済みを除いた当日のセット。 */
export const setsOfDay = async (day: string): Promise<SetRecord[]> =>
  (await (await db()).getAllFromIndex('sets', 'by_day', day))
    .filter((s) => s.voidedAt === null)
    .sort((a, b) => a.at - b.at)

/** 物理削除しない。voidedAt を立てるだけ。 */
export const voidSet = async (id: string) => {
  const d = await db()
  const tx = d.transaction('sets', 'readwrite')
  const row = await tx.store.get(id)
  if (row && row.voidedAt === null) await tx.store.put({ ...row, voidedAt: Date.now() })
  await tx.done
}

// --- 体重 ---

export const addBodyWeight = async (kg: number): Promise<BodyWeight> => {
  const at = Date.now()
  const rec: BodyWeight = { ulid: ulid(at), kg, at, day: localDay(at) }
  await (await db()).add('bodyweight', rec)
  return rec
}

export const bodyWeightOfDay = async (day: string): Promise<BodyWeight[]> =>
  (await (await db()).getAllFromIndex('bodyweight', 'by_day', day)).sort((a, b) => a.at - b.at)

export const counts = async () => {
  const d = await db()
  return {
    sets: await d.count('sets'),
    exercises: await d.count('exercises'),
    bodyweight: await d.count('bodyweight')
  }
}
