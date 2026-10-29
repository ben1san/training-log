<script lang="ts">
  import Record from './lib/Record.svelte'
  import History from './lib/History.svelte'
  import { store, reload, bootstrap } from './lib/store.svelte'
  import { ensurePersisted, type StorageState } from './lib/storage'
  import RestTimer from './lib/RestTimer.svelte'
  import { timer, syncRest } from './lib/timer.svelte'

  // タブは2枚だけ。分ける理由は使用文脈で、入力はジムで片手・数秒、
  // 閲覧は家で両手・数分。同じ画面に両方を置くと両方が劣化する。
  //
  // **体重はトップレベルに置かない。**Hevy は Profile → Measures の2階層下に
  // 体重・体脂肪・周囲径をまとめており、Strong では身体測定がそもそも有料機能で
  // 無料版に存在しない。トップレベルのタブを1枚割くのは、どの既存アプリよりも
  // 体重を前に出すことになる。ここでは履歴タブの3つ目の切り口として置く。
  //
  // 一般の Workout / History / Exercises / Measure / Profile からは、
  // Profile（1人用で共有先がない）と Exercises（記録面のピッカーで足りる）を
  // 落としてある。
  //
  // **起動時は必ず「記録」から開く。**タブ位置を復元しない（ジムで開いた瞬間に
  // 入力面にいることが要件で、前回どこを見ていたかは要件ではない）。

  type Tab = 'record' | 'history'
  const TABS: { id: Tab; label: string }[] = [
    { id: 'record', label: '記録' },
    { id: 'history', label: '履歴' }
  ]

  let tab = $state<Tab>('record')
  let storage = $state<StorageState | null>(null)
  let toast = $state('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  const say = (m: string) => {
    toast = m
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast = ''), 2200)
  }

  $effect(() => {
    void (async () => {
      await bootstrap()
      storage = await ensurePersisted()
    })()
    // 日付を跨いだまま開き直したときに「今日」がずれないようにする
    const onShow = () => {
      if (document.visibilityState !== 'visible') return
      void reload()
      syncRest() // バックグラウンドで止まっていた分を飛ばして残りを引き直す
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  })
</script>

<main>
  {#if storage?.atRisk}
    <div class="risk">
      ホーム画面に追加していない。<b>Safariは7日の未使用でこのデータを破棄する。</b>
    </div>
  {/if}

  <div class="pane">
    {#if !store.ready}
      <div class="dim pad">読み込み中</div>
    {:else if tab === 'record'}
      <Record {say} />
    {:else}
      <History {say} />
    {/if}
  </div>

  {#if timer.anchorSetUlid || tab === 'record'}<div class="rest-spacer"></div>{/if}
  {#if toast}<div class="toast" class:lifted={timer.anchorSetUlid || tab === 'record'}>{toast}</div>{/if}
</main>

<nav>
  {#if timer.anchorSetUlid || tab === 'record'}
    <RestTimer />
  {/if}
  <div class="tabs">
  {#each TABS as t (t.id)}
    <button class={tab === t.id ? 'on' : ''} aria-current={tab === t.id} onclick={() => (tab = t.id)}>
      {t.label}
    </button>
  {/each}
  </div>
</nav>

<style>
  main {
    max-width: 560px; margin: 0 auto;
    padding: calc(env(safe-area-inset-top) + 12px) 14px
             calc(env(safe-area-inset-bottom) + 76px);
  }
  .pane { display: flex; flex-direction: column; gap: 14px; }
  .pane :global(section) {
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 12px;
  }
  .pane :global(.dim) { color: var(--dim); }
  .pane :global(.small) { font-size: 13px; }
  .pane :global(button.ghost) {
    border: 1px solid var(--line); border-radius: 10px; padding: 9px 13px;
    background: var(--panel2); min-height: 44px;
  }
  .pane :global(button.wide) { width: 100%; }
  .pane :global(button.primary) {
    border-radius: 10px; padding: 10px 18px; background: var(--accent);
    color: #06121f; font-weight: 700; min-height: 44px;
  }
  .pane :global(button:disabled) { opacity: 0.45; }

  .pad { padding: 28px 12px; }
  .risk {
    margin-bottom: 12px; padding: 10px 12px; border-radius: 10px;
    background: #3a2a12; color: var(--warn); font-size: 13px; line-height: 1.4;
  }

  .rest-spacer { height: 58px; }
  nav {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
    display: flex; flex-direction: column; gap: 6px;
    padding: 6px 10px calc(env(safe-area-inset-bottom) + 6px);
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--line);
  }
  nav .tabs { display: flex; gap: 4px; max-width: 560px; width: 100%; margin: 0 auto; }
  nav :global(.rest) { max-width: 560px; width: 100%; margin: 0 auto; }
  nav .tabs button {
    flex: 1; min-height: 50px; border-radius: 12px; color: var(--dim); font-size: 14px;
  }
  nav .tabs button.on { background: var(--panel2); color: var(--fg); font-weight: 700; }

  .toast {
    position: fixed; left: 50%; transform: translateX(-50%);
    bottom: calc(env(safe-area-inset-bottom) + 78px); z-index: 20;
    transition: bottom 0.15s;
    background: #2b3238; border: 1px solid var(--line); color: var(--fg);
    padding: 10px 16px; border-radius: 999px; font-size: 14px; box-shadow: 0 6px 24px #0008;
  }
  /* 休憩タイマーが出ている間はトーストをその上へ逃がす */
  .toast.lifted { bottom: calc(env(safe-area-inset-bottom) + 136px); }
</style>
