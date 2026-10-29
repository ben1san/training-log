<script lang="ts">
  import { timer, beginRest, stopRest, discardRest } from './timer.svelte'
  import { mmss, medianRest } from './derive'
  import { store } from './store.svelte'

  // ナビの上に積む帯。4状態しかない。
  //   錨なし   … セットがまだ無い。測れない
  //   待機     … 錨はある。開始を押せば測り始める
  //   計測中   … 終了で止まる
  //   停止中   … 次のセットで記録される。開始で測り直せる
  const armed = $derived(!!timer.anchorSetUlid)
  const running = $derived(!!timer.startedAt && !timer.stoppedAt)
  const held = $derived(!!timer.startedAt && !!timer.stoppedAt)
  const elapsed = $derived(
    timer.startedAt ? ((timer.stoppedAt ?? timer.now) - timer.startedAt) / 1000 : 0
  )
  /** 目標ではなく参照。その種目の実測レストの中央値 */
  const ref = $derived(timer.exerciseId ? medianRest(store.sets, timer.exerciseId) : null)
  const past = $derived(running && ref !== null && elapsed > ref)
</script>

<div class="rest" class:past class:held class:idle={!armed}>
  <span class="lbl">休憩</span>

  {#if armed}
    <b class="t" class:off={!timer.startedAt}>{mmss(elapsed)}</b>
    {#if held}
      <span class="ref">次のセットで記録</span>
    {:else if ref !== null}
      <span class="ref">中央値 {mmss(ref)}</span>
    {/if}

    {#if running}
      <button class="act" onclick={stopRest}>終了</button>
    {:else}
      <button class="act" onclick={beginRest}>開始</button>
      {#if held}
        <button class="x" onclick={discardRest} aria-label="この計測を捨てる">✕</button>
      {/if}
    {/if}
  {:else}
    <span class="ref">セットを記録すると測れる</span>
  {/if}
</div>

<style>
  .rest {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 6px 8px; border-radius: 12px; background: var(--panel2); min-height: 52px;
  }
  .rest.idle { background: none; }
  .lbl { color: var(--dim); font-size: 13px; }
  .t { font-size: 22px; font-variant-numeric: tabular-nums; min-width: 3.4em; }
  .t.off { color: var(--dim); }
  .rest.past .t { color: var(--warn); }
  .ref { color: var(--dim); font-size: 12px; font-variant-numeric: tabular-nums; }
  .act {
    margin-left: auto; min-height: 40px; padding: 0 18px; border-radius: 9px;
    background: var(--accent); color: #06121f; font-weight: 700; font-size: 15px;
  }
  .rest.held .act { background: var(--panel); color: var(--fg); border: 1px solid var(--line); }
  .x { color: var(--dim); padding: 0 6px; font-size: 13px; }
</style>
