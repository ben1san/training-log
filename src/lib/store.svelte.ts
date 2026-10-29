import {
  listExercises, allSets, allBodyWeight, allRests, localDay, addExercisesMissing,
  type Exercise, type SetRecord, type BodyWeight, type RestRecord
} from './db'
import { PRESETS } from './presets'

// 全件をメモリに置く。4238行規模で全走査は数msなので、閲覧面のために
// 索引を増やさない（記録面の索引 by_exercise / by_day は入力の手数要件から
// 決まっているもので、そのまま触らない）。

export const store = $state({
  exercises: [] as Exercise[],
  sets: [] as SetRecord[],
  bw: [] as BodyWeight[],
  rests: [] as RestRecord[],
  today: localDay(Date.now()),
  /** 選択中の種目。タブを跨いでも保つのでストアに置く */
  selectedId: null as string | null,
  ready: false
})

export const exMapOf = (xs: Exercise[]) => new Map(xs.map((e) => [e.ulid, e]))

export async function reload() {
  store.today = localDay(Date.now())
  const [ex, sets, bw, rests] = await Promise.all([
    listExercises(), allSets(), allBodyWeight(), allRests()
  ])
  store.exercises = ex
  store.sets = sets
  store.bw = bw
  store.rests = rests
  store.ready = true
}

/** その種目の直近の有効セット。重量・レップのプリフィル元かつ「前回」表示の元。 */
export const lastLiveSet = (sets: SetRecord[], exerciseId: string): SetRecord | undefined => {
  for (let i = sets.length - 1; i >= 0; i--) {
    const s = sets[i]!
    if (s.exerciseId === exerciseId && s.voidedAt === null) return s
  }
  return undefined
}

/** 種目ID -> 最終使用時刻。ピッカーの並び順（直近使用順）。 */
export const lastUsedMap = (sets: SetRecord[]) => {
  const m = new Map<string, number>()
  for (const s of sets)
    if (s.voidedAt === null && (m.get(s.exerciseId) ?? 0) < s.at) m.set(s.exerciseId, s.at)
  return m
}

/**
 * 起動時に一度だけ走る。**プリセットは黙って入る**（ボタンを出さない）。
 * addExercisesMissing は同名を飛ばすので、何度走っても増えない。
 */
export async function bootstrap() {
  await addExercisesMissing(PRESETS)
  await reload()
}
