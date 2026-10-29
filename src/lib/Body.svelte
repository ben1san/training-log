<script lang="ts">
  import { addBodyWeight } from './db'
  import { store, reload } from './store.svelte'
  import { bwByDay, movingAvg, fmtKg, hhmm, mdShort } from './derive'
  import Chart from './Chart.svelte'

  // 体重はイベントではなく**測定**で、表示形式がセット記録と違う（時系列が主役、
  // 一覧は従）。だから記録面に常駐させず独立タブにしてある。
  //
  // 読む量は7日移動平均。日次の生値は水分変動が支配するので、生値は
  // 同系列の未平滑化として薄く重ねるだけにする（別色相を与えない）。

  let { say }: { say: (m: string) => void } = $props()

  let input = $state('')
  let range = $state<30 | 90 | 0>(90)
  let showAll = $state(false)
  let busy = $state(false)

  const pts = $derived(bwByDay(store.bw))
  const cut = $derived(range === 0 ? 0 : Date.now() - range * 86400000)
  const inRange = $derived(pts.filter((p) => p.t >= cut))
  const avg = $derived(movingAvg(pts, 7).filter((p) => p.t >= cut))
  const raw = $derived(inRange.map((p) => ({ t: p.t, v: p.kg })))
  const main = $derived(avg.map((p) => ({ t: p.t, v: p.kg })))

  const latest = $derived(pts.length ? pts[pts.length - 1] : null)
  const latestAvg = $derived(avg.length ? avg[avg.length - 1] : null)
  /** 7日平均の28日前との差。生値同士の差は水分で意味をなさない */
  const delta = $derived.by(() => {
    const a = movingAvg(pts, 7)
    if (a.length < 2) return null
    const now = a[a.length - 1]!
    const target = now.t - 28 * 86400000
    const past = [...a].reverse().find((p) => p.t <= target)
    return past ? now.kg - past.kg : null
  })

  async function save() {
    const kg = Number(input)
    if (!kg || kg <= 0 || busy) return
    busy = true
    try {
      await addBodyWeight(kg)
      input = ''
      await reload()
      if (navigator.vibrate) navigator.vibrate(12)
      say('体重を記録した')
    } finally { busy = false }
  }

  const todayRows = $derived(store.bw.filter((b) => b.day === store.today))
</script>

<section class="in">
  <div class="in-row">
    <input bind:value={input} type="number" inputmode="decimal" step="0.1" placeholder="kg"
      onkeydown={(e) => { if (e.key === 'Enter') save() }} />
    <button class="primary" disabled={!Number(input) || busy} onclick={save}>記録</button>
  </div>
  {#if todayRows.length}
    <div class="dim small">
      今日: {todayRows.map((b) => `${fmtKg(b.kg)}kg ${hhmm(b.at)}`).join(' / ')}
      {#if todayRows.length > 1}<br />複数ある日は<b>最後の入力</b>をその日の値として使う（打ち間違いは入れ直して訂正する）{/if}
    </div>
  {/if}
</section>

{#if latest}
  <!-- 単一の見出し数値は図より速い。平均と生値を混ぜて読ませない -->
  <section class="tiles">
    <div>
      <span class="dim small">7日平均</span>
      <b>{latestAvg ? fmtKg(latestAvg.kg) : '—'}<i>kg</i></b>
    </div>
    <div>
      <span class="dim small">直近の実測</span>
      <b>{fmtKg(latest.kg)}<i>kg</i></b>
      <span class="dim small">{mdShort(latest.day)}</span>
    </div>
    <div>
      <span class="dim small">28日の変化</span>
      <b>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${fmtKg(delta)}`}{#if delta !== null}<i>kg</i>{/if}</b>
      <span class="dim small">平均同士の差</span>
    </div>
  </section>

  <section>
    <div class="c-head">
      <span class="sec-head">7日移動平均・点が生値</span>
      <div class="seg">
        {#each [30, 90, 0] as r (r)}
          <button class={range === r ? 'on' : ''} onclick={() => (range = r as 30 | 90 | 0)}>
            {r === 0 ? '全期間' : `${r}日`}
          </button>
        {/each}
      </div>
    </div>
    <Chart {main} {raw} unit="kg" height={170} fmt={fmtKg} />
  </section>

  <section>
    <div class="sec-head">記録（新しい順）</div>
    <ul class="list">
      {#each (showAll ? [...pts].reverse() : [...pts].reverse().slice(0, 14)) as p (p.day)}
        <li>
          <span class="d">{mdShort(p.day)}</span>
          <b>{fmtKg(p.kg)}kg</b>
          {#if p.all.length > 1}<span class="dim small">他 {p.all.length - 1}件</span>{/if}
          <span class="dim small right">{hhmm(p.all[p.all.length - 1]!.at)}</span>
        </li>
      {/each}
    </ul>
    {#if pts.length > 14}
      <button class="ghost wide more" onclick={() => (showAll = !showAll)}>
        {showAll ? '折りたたむ' : `残り ${pts.length - 14} 日を見る`}
      </button>
    {/if}
    <p class="dim small note">
      体重の行は物理削除できない（<code>bodyweight</code> に void 列を持たせていない）。
      訂正は同じ日に正しい値を入れ直す。
    </p>
  </section>
{:else}
  <section class="hollow"><p class="dim">体重の記録がまだない。</p></section>
{/if}

<style>
  .in-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  .in-row input { flex: 1; font-size: 20px; font-weight: 700; text-align: right; appearance: textfield; }
  .tiles { display: flex; gap: 10px; }
  .tiles > div { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .tiles b { font-size: 22px; font-variant-numeric: tabular-nums; }
  .tiles b i { font-size: 13px; font-weight: 400; font-style: normal; color: var(--dim); margin-left: 2px; }
  .c-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .sec-head { color: var(--dim); font-size: 13px; }
  .c-head .seg { margin-left: auto; }
  .seg { display: flex; gap: 2px; background: var(--panel2); padding: 3px; border-radius: 9px; }
  .seg button { padding: 5px 10px; border-radius: 7px; color: var(--dim); font-size: 13px; min-height: 32px; white-space: nowrap; }
  .seg button.on { background: var(--panel); color: var(--fg); font-weight: 700; }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .list li {
    display: flex; align-items: baseline; gap: 10px; padding: 8px 10px;
    background: var(--panel2); border-radius: 8px; font-variant-numeric: tabular-nums;
  }
  .list .d { color: var(--dim); min-width: 3.4em; font-size: 13px; }
  .right { margin-left: auto; }
  .more { margin-top: 8px; }
  .note { margin: 10px 0 0; line-height: 1.5; }
  code { background: var(--panel2); padding: 1px 4px; border-radius: 4px; font-size: 12px; }
  .hollow p { margin: 0; }
</style>
