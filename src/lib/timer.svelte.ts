// 休憩ストップウォッチ。**カウントダウンではなく計上。開始は手で押す。**
//
// 休憩は「セットとセットに挟まれた区間」としてしか記録しない。
//   セットを保存 → **錨を置くだけ。時計は動かさない**
//   開始を押す   → ここから測る
//   終了を押す   → 止めるだけ（止めた時刻が endedAt）
//   次のセットを保存 → 区間を閉じて1件書き、そのセットを次の錨にする
//
// 開始を一度も押さなければ何も記録されない。測っていないものは書かない。
//
// 経過は「開始時刻からの引き算」で出す。カウンタを足していく実装だと
// バックグラウンドで絞られた分だけ狂うが、開始時刻を持っていれば
// 復帰した瞬間に正しい経過が出る。

import { addRest } from './db'

export const timer = $state({
  /** 区間の始点になるセット。これが無いと測っても記録できない */
  anchorSetUlid: null as string | null,
  /** 計測開始時刻。null なら「錨はあるがまだ押していない」 */
  startedAt: null as number | null,
  /** 終了を押した時刻。非nullなら「止まっているが未確定」 */
  stoppedAt: null as number | null,
  /** 中央値の参照表示に使うだけ。保存はしない */
  exerciseId: null as string | null,
  now: Date.now()
})

let tick: ReturnType<typeof setInterval> | undefined
const run = () => { clearInterval(tick); tick = setInterval(() => (timer.now = Date.now()), 250) }
const halt = () => { clearInterval(tick); tick = undefined }

/** セットを保存したときに呼ぶ。**錨を置くだけで時計は動かさない。** */
export const armRest = (setUlid: string, exerciseId: string | null) => {
  halt()
  timer.anchorSetUlid = setUlid
  timer.startedAt = null
  timer.stoppedAt = null
  timer.exerciseId = exerciseId
}

/** 開始ボタン。止めたあとの測り直しも同じ入口。 */
export const beginRest = () => {
  if (!timer.anchorSetUlid) return
  timer.startedAt = Date.now()
  timer.stoppedAt = null
  timer.now = timer.startedAt
  run()
}

/** 終了ボタン。止めるだけで書き込みはしない。 */
export const stopRest = () => {
  if (!timer.startedAt || timer.stoppedAt) return
  timer.stoppedAt = Date.now()
  timer.now = timer.stoppedAt
  halt()
}

/** 計測だけ捨てる。錨は残るのでもう一度 開始 を押せる。 */
export const discardRest = () => {
  halt()
  timer.startedAt = null
  timer.stoppedAt = null
}

/**
 * 次のセットが来たので区間を閉じる。戻り値は記録した秒数。
 * **開始を押していなければ何も書かない。**
 */
export const commitRest = async (toSetUlid: string): Promise<number | null> => {
  const { startedAt, stoppedAt, anchorSetUlid } = timer
  halt()
  if (!startedAt || !anchorSetUlid || anchorSetUlid === toSetUlid) return null
  const endedAt = stoppedAt ?? Date.now()
  const rec = await addRest(anchorSetUlid, toSetUlid, startedAt, endedAt)
  return rec ? Math.round((endedAt - startedAt) / 1000) : null
}

/** 復帰時に now を合わせ直す */
export const syncRest = () => {
  if (timer.startedAt && !timer.stoppedAt) { timer.now = Date.now(); run() }
}
