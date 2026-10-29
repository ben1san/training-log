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

/**
 * 計測した休憩。**`at` の差からは出せないので列ではなくストアを足した。**
 * 差には「前のセットを終えてから次のセットを終えるまで」が入るのでセットの
 * 実行時間が混ざる。ストップウォッチが測るのはそこを除いた休憩そのもの。
 *
 * **必ずセットとセットに挟まれた区間である。**両端のセットULIDを持ち、
 * どちらかが欠ける区間は記録しない。確定するのは次のセットを保存した瞬間で、
 * 終了ボタンは計測を止めるだけ（止めた時刻が endedAt になる）。
 *
 * 種目は fromSetUlid から引けるので列に持たない（導出できるものは導出する）。
 */
export interface RestRecord {
  ulid: string
  /** この休憩の前のセット */
  fromSetUlid: string
  /** この休憩を閉じたセット。ここに紐づく「直前の休憩」になる */
  toSetUlid: string
  startedAt: number
  endedAt: number
  day: string
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
  rests: {
    key: string
    value: RestRecord
    indexes: { by_day: string; by_to: string }
  }
}

export const localDay = (at: number): string => {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null

export const db = () => {
  // v2 で rests を足した。既存のv1は oldVersion で分岐して作り足すだけ。
  dbp ??= openDB<Schema>('training', 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        const sets = d.createObjectStore('sets', { keyPath: 'ulid' })
        sets.createIndex('by_exercise', ['exerciseId', 'at'])
        sets.createIndex('by_day', 'day')

        const ex = d.createObjectStore('exercises', { keyPath: 'ulid' })
        ex.createIndex('by_pattern', 'patternId')
        ex.createIndex('by_name', 'name', { unique: true })

        const bw = d.createObjectStore('bodyweight', { keyPath: 'ulid' })
        bw.createIndex('by_day', 'day')
      }
      if (oldVersion < 2) {
        const rests = d.createObjectStore('rests', { keyPath: 'ulid' })
        rests.createIndex('by_day', 'day')
        // セットから直前の休憩を引くための索引
        rests.createIndex('by_to', 'toSetUlid', { unique: true })
      }
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

/**
 * プリセットの一括追加。**同名が既にあるものは飛ばす。**
 * by_name が一意索引なので、重複は作れない。似た名前（「ベンチプレス」と
 * 「バーベルベンチプレス」）は別物として両方残るので、畳むのは手でやる。
 */
export const addExercisesMissing = async (
  list: { name: string; patternId: string }[]
): Promise<{ added: number; skipped: number }> => {
  const d = await db()
  const have = new Set((await d.getAll('exercises')).map((e) => e.name))
  const tx = d.transaction('exercises', 'readwrite')
  let added = 0
  for (const x of list) {
    if (have.has(x.name)) continue
    await tx.store.add({ ulid: ulid(), name: x.name, patternId: x.patternId, createdAt: Date.now() })
    have.add(x.name)
    added++
  }
  await tx.done
  return { added, skipped: list.length - added }
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

// --- 全件読み (閲覧面) ---
//
// 4238行規模で全走査は数ms。索引を増やさず、閲覧側の集計は derive.ts の
// 純関数で行う。**列もストアも増やさない**という設計 (記録項目は落とす側で
// 決まった) を閲覧面にも通すため、セッション・部位・挙上量はすべて導出。

export const allSets = async (): Promise<SetRecord[]> =>
  (await (await db()).getAll('sets')).sort((a, b) => a.at - b.at)

export const allBodyWeight = async (): Promise<BodyWeight[]> =>
  (await (await db()).getAll('bodyweight')).sort((a, b) => a.at - b.at)

export const allRests = async (): Promise<RestRecord[]> =>
  (await (await db()).getAll('rests')).sort((a, b) => a.endedAt - b.endedAt)

/**
 * セット間の休憩を1件追記する。**両端のセットが揃ったときにだけ書く。**
 * 1秒未満は誤爆とみなして捨てる。
 */
export const addRest = async (
  fromSetUlid: string,
  toSetUlid: string,
  startedAt: number,
  endedAt: number
): Promise<RestRecord | null> => {
  if (endedAt - startedAt < 1000) return null
  const rec: RestRecord = {
    ulid: ulid(endedAt),
    fromSetUlid,
    toSetUlid,
    startedAt,
    endedAt,
    day: localDay(startedAt)
  }
  try {
    await (await db()).add('rests', rec)
  } catch {
    return null // by_to が一意。同じセットに二重に紐づけない
  }
  return rec
}

// --- 訂正 ---
//
// 過去のセットを直す唯一の経路。**列を1つも足さない**ために
// 「元を void して、同じ at で新しい行を追記する」形にしてある。
// supersedes 列を持たせる案は捨てた。Vault 側は既に voidedAt を見て
// 間引くので、追加の解釈規則が要らない。
//
// 新しい行の ULID は **現在時刻**で振る (at ではなく)。ULID の辞書順が
// 表すのは追記順であり、訂正は今おこなわれた追記だから。イベント時刻は
// at が持つ。by_exercise = [exerciseId, at] なので時系列上は正しい位置に入る。

export const reviseSet = async (
  id: string,
  patch: { weight: number; reps: number; rir: Rir }
): Promise<SetRecord | undefined> => {
  const d = await db()
  const old = await d.get('sets', id)
  if (!old || old.voidedAt !== null) return undefined
  const rec: SetRecord = {
    ...old,
    ulid: ulid(), // 追記順。at は引き継ぐ
    weight: patch.weight,
    reps: patch.reps,
    rir: patch.rir
  }
  const tx = d.transaction('sets', 'readwrite')
  await tx.store.put({ ...old, voidedAt: Date.now() })
  await tx.store.add(rec)
  await tx.done
  return rec
}

/** 過去日に対する追記。日付を手で入れて記録を補う。 */
export const addSetAt = async (
  s: { exerciseId: string; weight: number; reps: number; rir: Rir; at: number }
): Promise<SetRecord> => {
  const rec: SetRecord = {
    ulid: ulid(),
    exerciseId: s.exerciseId,
    weight: s.weight,
    reps: s.reps,
    rir: s.rir,
    at: s.at,
    day: localDay(s.at),
    voidedAt: null
  }
  await (await db()).add('sets', rec)
  return rec
}

export const renameExercise = async (id: string, name: string) => {
  const d = await db()
  const e = await d.get('exercises', id)
  if (e) await d.put('exercises', { ...e, name: name.trim() })
}

export const counts = async () => {
  const d = await db()
  return {
    sets: await d.count('sets'),
    exercises: await d.count('exercises'),
    bodyweight: await d.count('bodyweight'),
    rests: await d.count('rests')
  }
}
