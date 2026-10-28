// Safari はスクリプト書き込みストレージを7日間の未使用で破棄する。
// ホーム画面にインストールしたPWAはこの対象外、という前提に全体が乗っている。
// **実機で未確認。**外れると検証期間中のデータが丸ごと消える。
// 由来: projects/training/技術選定は同期の差し替え可能性で決まった (来歴)

export interface StorageState {
  persisted: boolean
  standalone: boolean
  /** インストールされておらず永続化もされていない = 破棄の射程にいる */
  atRisk: boolean
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true

export const ensurePersisted = async (): Promise<StorageState> => {
  const standalone = isStandalone()
  let persisted = false
  try {
    persisted =
      (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false
  } catch {
    persisted = false
  }
  return { persisted, standalone, atRisk: !persisted && !standalone }
}
