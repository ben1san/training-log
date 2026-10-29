<script lang="ts">
  import { store, exMapOf, lastUsedMap } from './store.svelte'
  import { sessionsOf, historyOf, fmtVol, hhmm, mdShort, mmss, measuredRest, type Session } from './derive'
  import { PATTERN_BY_ID } from './patterns'
  import { ship } from './export'
  import { localDay, type SetRecord, type Rir } from './db'
  import Chart from './Chart.svelte'
  import SetEditor from './SetEditor.svelte'
  import Body from './Body.svelte'

  // 閲覧面の切り口は3つ。日付（いつやったか）・種目（伸びているか）・体重。
  // 体重がここにあるのは Hevy の Profile → Measures と同じ階層の置き方で、
  // トップレベルのタブを割かないため。
  //
  // 部位別ボリュームの集計グラフはここに置かない —
  // 分析は Vault 側で、このアプリは記録器である（README の線）。

  let { say }: { say: (m: string) => void } = $props()

  type Mode = 'day' | 'exercise' | 'body'
  let mode = $state<Mode>('day')
  let openDay = $state<string | null>(null)
  let openEx = $state<string | null>(null)
  let editing = $state<SetRecord | null>(null)

  const rirLabel = (r: Rir) => (r === 4 ? '4+' : String(r))
  const exMap = $derived(exMapOf(store.exercises))
  const sessions = $derived(sessionsOf(store.sets, exMap))
  const lastUsed = $derived(lastUsedMap(store.sets))

  const exRows = $derived(
    store.exercises
      .map((e) => {
        const live = store.sets.filter((s) => s.exerciseId === e.ulid && s.voidedAt === null)
        return {
          ex: e,
          sets: live.length,
          last: lastUsed.get(e.ulid) ?? 0,
          days: new Set(live.map((s) => s.day)).size
        }
      })
      .filter((r) => r.sets > 0)
      .sort((a, b) => b.last - a.last)
  )

  const hist = $derived(openEx ? historyOf(store.sets, openEx) : null)
  const chartPoints = $derived(hist ? hist.days.map((d) => ({ t: d.t, v: d.topWeight })) : [])

  const nameOf = (id: string) => exMap.get(id)?.name ?? '(削除された種目)'
  const patOf = (id: string) => {
    const e = exMap.get(id)
    return e ? PATTERN_BY_ID.get(e.patternId)?.name ?? '' : ''
  }

  async function doShip() {
    try {
      const r = await ship()
      say(r === 'empty' ? '搬出するものがない'
        : r === 'share' ? '共有シートへ出した'
        : r === 'download' ? 'ファイルを保存した' : 'クリップボードへ入れた')
    } catch { /* 共有をキャンセルした */ }
  }

  const restMin = (sets: SetRecord[], i: number) => {
    const p = sets[i - 1]
    return p ? Math.round((sets[i]!.at - p.at) / 6000) / 10 : null
  }
  const toggleDay = (s: Session) => { openDay = openDay === s.day ? null : s.day; editing = null }
</script>

<div class="h-top">
  <div class="seg">
    <button class={mode === 'day' ? 'on' : ''} onclick={() => { mode = 'day'; editing = null; openEx = null }}>日付</button>
    <button class={mode === 'exercise' ? 'on' : ''} onclick={() => { mode = 'exercise'; editing = null }}>種目</button>
    <button class={mode === 'body' ? 'on' : ''} onclick={() => { mode = 'body'; editing = null; openEx = null }}>体重</button>
  </div>
  <button class="ghost" onclick={doShip}>搬出</button>
</div>

{#if mode === 'body'}
  <Body {say} />
{/if}

{#if mode === 'day'}
  {#if !sessions.length}
    <section class="hollow">
      <p class="dim">記録がまだない。</p>
      <p class="dim small">
        既存アプリから抽出した 4238セット・121種目はまだこのアプリに入っていない。
        移行はUIの外側の作業として残っている。
      </p>
    </section>
  {/if}
  <ul class="days">
    {#each sessions as s (s.day)}
      <li>
        <button class="day-row" onclick={() => toggleDay(s)}>
          <span class="d-date">{mdShort(s.day)}<i>({s.wday})</i></span>
          <span class="dim small d-meta">
            {s.groups.length}種目 · {s.sets.length}セット · {fmtVol(s.volume)}{#if s.minutes}{' · '}{s.minutes}分{/if}
          </span>
          <span class="dim caret">{openDay === s.day ? '−' : '+'}</span>
        </button>

        {#if openDay === s.day}
          <div class="d-body">
            {#each s.groups as g (g.exerciseId)}
              <div class="g">
                <div class="g-head">
                  <span class="g-name">{g.name}</span>
                  <span class="dim small nw">{g.sets.length}セット · {fmtVol(g.volume)}</span>
                </div>
                <div class="dim small g-sub">{g.partLabel}・{g.patternLabel}</div>
                <ul class="sets">
                  {#each g.sets as st, i (st.ulid)}
                    {@const m = measuredRest(g.sets, i, store.rests)}
                    <li>
                      <button class="set-row" onclick={() => (editing = editing?.ulid === st.ulid ? null : st)}>
                        <span class="n">{i + 1}</span>
                        <span><b>{st.weight}</b>kg × <b>{st.reps}</b></span>
                        <span class="dim">RIR {rirLabel(st.rir)}</span>
                        <span class="dim small right">
                          {hhmm(st.at)}{#if m !== null}{' · 休 '}{mmss(m)}{:else if restMin(g.sets, i) !== null}{' · 休'}{restMin(g.sets, i)}分{/if}
                        </span>
                      </button>
                      {#if editing?.ulid === st.ulid}
                        <SetEditor target={st} name={g.name} {say} close={() => (editing = null)} />
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{:else if mode === 'exercise' && !openEx}
  <ul class="days">
    {#each exRows as r (r.ex.ulid)}
      <li>
        <button class="day-row" onclick={() => { openEx = r.ex.ulid; editing = null }}>
          <span class="grow">
            <span class="d-date sm">{r.ex.name}</span>
            <span class="dim small block">{patOf(r.ex.ulid)}</span>
          </span>
          <span class="dim small ta-r">{r.sets}セット / {r.days}日<br />{mdShort(localDay(r.last))}</span>
        </button>
      </li>
    {/each}
    {#if !exRows.length}
      <li class="dim pad">記録のある種目がまだない。</li>
    {/if}
  </ul>
{:else if mode === 'exercise' && openEx && hist}
  <div class="ex-top">
    <button class="ghost" onclick={() => { openEx = null; editing = null }}>← 種目</button>
    <div class="grow">
      <div class="d-date sm">{nameOf(openEx)}</div>
      <div class="dim small">{patOf(openEx)} · {hist.total}セット / {hist.days.length}日</div>
    </div>
  </div>

  <section>
    <div class="sec-head">その日の最大重量の推移（タップで値）</div>
    <Chart main={chartPoints} unit="kg" height={160} />
  </section>

  <!-- 実測の自己記録だけ。推定1RM はアプリに置かない（モデル依存の数値の来歴が切れる） -->
  <section class="pr">
    <div class="sec-head">自己記録（実測値のみ・推定1RMは出さない）</div>
    <div class="pr-grid">
      <div>
        <span class="dim small">最大重量</span>
        {#if hist.pr.weight}
          <b>{hist.pr.weight.weight}kg</b>
          <span class="dim small">× {hist.pr.weight.reps} · {mdShort(hist.pr.weight.day)}</span>
        {/if}
      </div>
      <div>
        <span class="dim small">単セット最大挙上量</span>
        {#if hist.pr.setVolume}
          <b>{fmtVol(hist.pr.setVolume.weight * hist.pr.setVolume.reps)}</b>
          <span class="dim small">{hist.pr.setVolume.weight}×{hist.pr.setVolume.reps} · {mdShort(hist.pr.setVolume.day)}</span>
        {/if}
      </div>
      <div>
        <span class="dim small">1日の最大挙上量</span>
        {#if hist.pr.dayVolume}
          <b>{fmtVol(hist.pr.dayVolume.volume)}</b>
          <span class="dim small">{hist.pr.dayVolume.sets.length}セット · {mdShort(hist.pr.dayVolume.day)}</span>
        {/if}
      </div>
    </div>
  </section>

  <ul class="days">
    {#each [...hist.days].reverse() as d (d.day)}
      <li>
        <div class="g">
          <div class="g-head">
            <span class="g-name">{mdShort(d.day)}</span>
            <span class="dim small">{d.sets.length}セット</span>
            <span class="dim small right">{fmtVol(d.volume)}</span>
          </div>
          <ul class="sets">
            {#each d.sets as st, i (st.ulid)}
              <li>
                <button class="set-row" onclick={() => (editing = editing?.ulid === st.ulid ? null : st)}>
                  <span class="n">{i + 1}</span>
                  <span><b>{st.weight}</b>kg × <b>{st.reps}</b></span>
                  <span class="dim">RIR {rirLabel(st.rir)}</span>
                  <span class="dim small right">{hhmm(st.at)}</span>
                </button>
                {#if editing?.ulid === st.ulid}
                  <SetEditor target={st} name={nameOf(openEx)} {say} close={() => (editing = null)} />
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .h-top { display: flex; align-items: center; gap: 10px; }
  .seg { display: flex; gap: 4px; background: var(--panel2); padding: 3px; border-radius: 10px; }
  .seg button { padding: 8px 13px; border-radius: 8px; color: var(--dim); min-height: 40px; white-space: nowrap; }
  .seg button.on { background: var(--panel); color: var(--fg); font-weight: 700; }
  .h-top .ghost { margin-left: auto; }

  .grow { flex: 1; min-width: 0; }
  .right { margin-left: auto; }
  .ta-r { text-align: right; line-height: 1.3; }
  .block { display: block; }
  .pad { padding: 12px; }
  .sec-head { color: var(--dim); font-size: 13px; margin-bottom: 8px; }
  .hollow p { margin: 0 0 6px; }

  .days { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .day-row {
    width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
    padding: 12px; background: var(--panel); border: 1px solid var(--line);
    border-radius: 12px; min-height: 56px;
  }
  .d-date { font-weight: 700; font-variant-numeric: tabular-nums; }
  .d-date i { color: var(--dim); font-style: normal; font-weight: 400; font-size: 13px; margin-left: 3px; }
  .d-date.sm { font-size: 16px; }
  .d-meta { margin-left: auto; }
  .caret { width: 1em; text-align: center; }

  .d-body { padding: 6px 0 2px; display: flex; flex-direction: column; gap: 8px; }
  .g { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px; }
  .g-head { display: flex; align-items: baseline; gap: 10px; }
  .g-name { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .g-sub { margin: 1px 0 6px; }
  .nw { white-space: nowrap; flex-shrink: 0; }
  .d-date.sm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .sets { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .set-row {
    width: 100%; display: flex; align-items: center; gap: 8px; text-align: left;
    padding: 9px 10px; background: var(--panel2); border-radius: 8px;
    font-variant-numeric: tabular-nums; min-height: 44px;
  }
  .set-row .n { color: var(--dim); min-width: 1.4em; font-size: 13px; }

  .ex-top { display: flex; align-items: center; gap: 10px; }

  .pr-grid { display: flex; flex-direction: column; gap: 8px; }
  .pr-grid > div { display: flex; align-items: baseline; gap: 8px; }
  .pr-grid > div > span:first-child { min-width: 11em; }
  .pr-grid b { font-size: 17px; font-variant-numeric: tabular-nums; }
</style>
