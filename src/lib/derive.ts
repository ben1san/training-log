import type { SetRecord, Exercise, BodyWeight, RestRecord } from './db'
import { PATTERN_BY_ID, PART_LABEL } from './patterns'

// 閲覧面が必要とするものはすべてここで**導出する**。ストアも列も増やさない。
// 由来: projects/training/記録項目は落とす側で決まった（導出できるものは導出する）
//
// 一般的な記録アプリは workout = {開始, 終了, セット[]} を明示オブジェクトとして
// 持つが、この実装は持たない。開始・終了・所要は by_day の最初と最後の at から
// 出る。一般アプリが明示オブジェクトを要る理由は「進行中のワークアウト」状態
// （走っているタイマー、未確定のセット行）の保持で、RIRタップで即確定する
// この設計には進行中状態が存在しない。
//
// 総挙上量 = Σ(重量 × レップ)。**モデルではなく実測値の算術**である。
// 推定1RM (Epley 等) はここに置かない — モデル依存の数値をアプリに焼くと
// 来歴が切れる。推定は Vault 側でやる。

export const WDAY = ['日', '月', '火', '水', '木', '金', '土']

export const volumeOf = (sets: SetRecord[]) =>
  sets.reduce((a, s) => a + s.weight * s.reps, 0)

export interface ExGroup {
  exerciseId: string
  name: string
  patternLabel: string
  partLabel: string
  sets: SetRecord[]
  volume: number
  topWeight: number
}

export interface Session {
  day: string
  wday: string
  sets: SetRecord[]
  groups: ExGroup[]
  volume: number
  from: number
  to: number
  /** 最初のセットから最後のセットまで。開始前のウォームアップは含まない */
  minutes: number
}

const nameOf = (m: Map<string, Exercise>, id: string) => m.get(id)?.name ?? '(削除された種目)'

const groupOf = (m: Map<string, Exercise>, id: string, sets: SetRecord[]): ExGroup => {
  const e = m.get(id)
  const pt = e ? PATTERN_BY_ID.get(e.patternId) : undefined
  return {
    exerciseId: id,
    name: nameOf(m, id),
    patternLabel: pt?.name ?? '',
    partLabel: pt ? PART_LABEL[pt.part] : '',
    sets,
    volume: volumeOf(sets),
    topWeight: sets.reduce((a, s) => Math.max(a, s.weight), 0)
  }
}

/** 種目ごとに初出順でまとめる。sets は at 昇順である前提。 */
export const groupByExercise = (sets: SetRecord[], exMap: Map<string, Exercise>): ExGroup[] => {
  const order: string[] = []
  const bag = new Map<string, SetRecord[]>()
  for (const s of sets) {
    if (!bag.has(s.exerciseId)) { bag.set(s.exerciseId, []); order.push(s.exerciseId) }
    bag.get(s.exerciseId)!.push(s)
  }
  return order.map((id) => groupOf(exMap, id, bag.get(id)!))
}

/** 日単位のセッション。新しい日が先。voided は除く。 */
export const sessionsOf = (all: SetRecord[], exMap: Map<string, Exercise>): Session[] => {
  const live = all.filter((s) => s.voidedAt === null)
  const byDay = new Map<string, SetRecord[]>()
  for (const s of live) {
    if (!byDay.has(s.day)) byDay.set(s.day, [])
    byDay.get(s.day)!.push(s)
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, sets]) => {
      sets.sort((a, b) => a.at - b.at)
      const from = sets[0]!.at
      const to = sets[sets.length - 1]!.at
      return {
        day,
        wday: WDAY[new Date(`${day}T00:00:00`).getDay()] ?? '',
        sets,
        groups: groupByExercise(sets, exMap),
        volume: volumeOf(sets),
        from,
        to,
        minutes: Math.round((to - from) / 60000)
      }
    })
}

export interface DayPoint { day: string; t: number; sets: SetRecord[]; volume: number; topWeight: number; topSet: SetRecord }

export interface ExHistory {
  exerciseId: string
  days: DayPoint[] // 古い順（グラフ用）
  /** 全期間の実測の自己記録。推定は含まない */
  pr: {
    weight: SetRecord | null      // 最大重量
    setVolume: SetRecord | null   // 単セット最大挙上量
    dayVolume: DayPoint | null    // 1日の最大挙上量
  }
  total: number // 有効セット数
}

export const historyOf = (all: SetRecord[], exerciseId: string): ExHistory => {
  const live = all
    .filter((s) => s.exerciseId === exerciseId && s.voidedAt === null)
    .sort((a, b) => a.at - b.at)

  const byDay = new Map<string, SetRecord[]>()
  for (const s of live) {
    if (!byDay.has(s.day)) byDay.set(s.day, [])
    byDay.get(s.day)!.push(s)
  }

  const days: DayPoint[] = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, sets]) => {
      const topSet = sets.reduce((a, s) =>
        s.weight > a.weight || (s.weight === a.weight && s.reps > a.reps) ? s : a, sets[0]!)
      return {
        day,
        t: new Date(`${day}T00:00:00`).getTime(),
        sets,
        volume: volumeOf(sets),
        topWeight: topSet.weight,
        topSet
      }
    })

  const prWeight = live.length
    ? live.reduce((a, s) => (s.weight > a.weight || (s.weight === a.weight && s.reps > a.reps) ? s : a), live[0]!)
    : null
  const prSetVol = live.length
    ? live.reduce((a, s) => (s.weight * s.reps > a.weight * a.reps ? s : a), live[0]!)
    : null
  const prDayVol = days.length ? days.reduce((a, d) => (d.volume > a.volume ? d : a), days[0]!) : null

  return { exerciseId, days, pr: { weight: prWeight, setVolume: prSetVol, dayVolume: prDayVol }, total: live.length }
}

// --- 体重 ---
//
// 1日に複数回入力された場合の代表値は **その日の最後の入力** にする。
// 物理削除を持たない (bodyweight に voidedAt 列はない) ので、打ち間違いは
// 正しい値を入れ直すことで訂正される必要がある。朝/夜の水分差を分ける
// フィルタは Vault 側の仕事で、at を列に持っているのはそのため。

export interface BwPoint { day: string; t: number; kg: number; all: BodyWeight[] }

export const bwByDay = (all: BodyWeight[]): BwPoint[] => {
  const byDay = new Map<string, BodyWeight[]>()
  for (const b of all) {
    if (!byDay.has(b.day)) byDay.set(b.day, [])
    byDay.get(b.day)!.push(b)
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, xs]) => {
      xs.sort((a, b) => a.at - b.at)
      return { day, t: new Date(`${day}T00:00:00`).getTime(), kg: xs[xs.length - 1]!.kg, all: xs }
    })
}

/**
 * 後方 window 日のカレンダー移動平均。点数が足りない期間も平均を返す
 * （欠測日を補間しない）。体重の日次生値は水分変動が支配するため、
 * 読める量はこちらで、生値は参照用に重ねるだけ。
 */
export const movingAvg = (pts: BwPoint[], window = 7): { t: number; kg: number }[] => {
  const DAY = 86400000
  return pts.map((p) => {
    const lo = p.t - (window - 1) * DAY
    const inWin = pts.filter((q) => q.t >= lo && q.t <= p.t)
    return { t: p.t, kg: inWin.reduce((a, q) => a + q.kg, 0) / inWin.length }
  })
}

/**
 * その種目の**実測レスト**の中央値（秒）。同日・同種目の連続セット間隔から出す。
 * 10分を超える間隔は種目の切り替えとみなして捨てる。
 * 休憩タイマーの既定値をここから取るので、既定は一般論ではなく自分の実績になる。
 * 15秒刻みに丸める（秒単位の既定に意味はない）。
 */
export const medianRest = (all: SetRecord[], exerciseId: string): number | null => {
  const live = all
    .filter((s) => s.exerciseId === exerciseId && s.voidedAt === null)
    .sort((a, b) => a.at - b.at)
  const gaps: number[] = []
  for (let i = 1; i < live.length; i++) {
    const a = live[i - 1]!
    const b = live[i]!
    if (a.day !== b.day) continue
    const g = (b.at - a.at) / 1000
    if (g > 0 && g <= 600) gaps.push(g)
  }
  if (!gaps.length) return null
  gaps.sort((x, y) => x - y)
  const h = gaps.length / 2
  const m = gaps.length % 2 ? gaps[Math.floor(h)]! : (gaps[h - 1]! + gaps[h]!) / 2
  return Math.max(15, Math.round(m / 15) * 15)
}

/**
 * そのセットの直前の **計測された** 休憩（秒）。無ければ null。
 * 休憩は toSetUlid でセットに紐づいているので、突き合わせは完全一致でよい
 * （endedAt の近さで推測する必要がない）。
 *
 * at の差から出る「休N分」とは別物である。差にはセットの実行時間が入るので
 * 常に計測値より長い。両方を並べて出し、書式で区別する（計測は m:ss、導出は N分）。
 */
export const measuredRest = (
  sets: SetRecord[], i: number, rests: RestRecord[]
): number | null => {
  const cur = sets[i]
  if (!cur) return null
  const r = rests.find((x) => x.toSetUlid === cur.ulid)
  return r ? Math.round((r.endedAt - r.startedAt) / 1000) : null
}

export const mmss = (sec: number) => {
  const n = Math.abs(Math.round(sec))
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}

export const fmtKg = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ja-JP')
export const fmtVol = (n: number) =>
  n >= 10000 ? `${(n / 1000).toFixed(1)}t` : `${Math.round(n).toLocaleString('ja-JP')}kg`
export const hhmm = (at: number) =>
  new Date(at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
export const mdShort = (day: string) => `${+day.slice(5, 7)}/${+day.slice(8, 10)}`
