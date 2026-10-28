import { db } from './db'
import type { SetRecord, Exercise, BodyWeight } from './db'

// 同期経路は未決 (LAN / git API直接コミット / 手動エクスポート)。
// 差し替えコストはこのファイルの2点に閉じ込めてある:
//   1. exportJSONL — ストアからJSONL文字列を作る純関数。経路を変えても不変
//   2. ship       — 唯一の搬出先。経路を差し替えるときに書き換わるのはここだけ
// ULIDを振っているのは、期間の重なった手動エクスポートが必ず重複行を生むため。
// Vault側は ulid で一意化でき、しかも時刻順が保たれる。
// 由来: projects/training/技術選定は同期の差し替え可能性で決まった

type Line =
  | ({ type: 'exercise' } & Exercise)
  | ({ type: 'set' } & SetRecord)
  | ({ type: 'bodyweight' } & BodyWeight)

/** [from, to) の記録をJSONLにする。参照された種目は範囲外でも必ず同梱する。 */
export const exportJSONL = async (from = 0, to = Number.MAX_SAFE_INTEGER): Promise<string> => {
  const d = await db()
  const inRange = <T extends { at: number }>(r: T) => r.at >= from && r.at < to

  // 取り消し済み (voidedAt) の行も出す。追記のみなので間引くのはVault側の仕事
  const sets = (await d.getAll('sets')).filter(inRange)
  const bw = (await d.getAll('bodyweight')).filter(inRange)

  const need = new Set(sets.map((s) => s.exerciseId))
  const exercises = (await d.getAll('exercises')).filter(
    (e) => need.has(e.ulid) || (e.createdAt >= from && e.createdAt < to)
  )

  const lines: Line[] = [
    ...exercises.map((e) => ({ type: 'exercise' as const, ...e })),
    ...sets.map((s) => ({ type: 'set' as const, ...s })),
    ...bw.map((b) => ({ type: 'bodyweight' as const, ...b }))
  ]
  lines.sort((a, b) => (a.ulid < b.ulid ? -1 : a.ulid > b.ulid ? 1 : 0))

  return lines.map((l) => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : '')
}

export const exportFilename = (now = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `training-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.jsonl`
}

export type ShipResult = 'share' | 'download' | 'clipboard' | 'empty'

/** 唯一の搬出先。経路の差し替えはこの関数の中だけで済む。 */
export const ship = async (from?: number, to?: number): Promise<ShipResult> => {
  const text = await exportJSONL(from, to)
  if (!text) return 'empty'
  const name = exportFilename()

  // iOS Safari に File System Access API はないので共有シート経由で出す
  const file = new File([text], name, { type: 'application/x-ndjson' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'share'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') throw e
    }
  }

  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return 'download'
  } catch {
    await navigator.clipboard.writeText(text)
    return 'clipboard'
  }
}
