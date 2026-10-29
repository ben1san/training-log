<script lang="ts">
  import { PART_ORDER, PART_LABEL, patternsOf, PATTERN_BY_ID, type PartId } from './patterns'
  import { addExercise, addSet, voidSet, type Exercise, type SetRecord, type Rir } from './db'
  import { store, exMapOf, lastLiveSet, lastUsedMap, reload } from './store.svelte'
  import { groupByExercise, volumeOf, fmtVol, hhmm, mdShort, mmss, measuredRest } from './derive'
  import { armRest, commitRest } from './timer.svelte'

  let { say }: { say: (m: string) => void } = $props()

  const RIRS: Rir[] = [0, 1, 2, 3, 4]
  const rirLabel = (r: Rir) => (r === 4 ? '4+' : String(r))

  let query = $state('')
  let weight = $state(20)
  let reps = $state(8)
  // Strong が種目の右上に置いている「フォーカス指標」。タップで巡回する。
  // 4つとも既存の列からの導出で、保存する列は増えない。
  // 選択はUIの好みであって訓練データではないので localStorage に置く。
  const FOCUS = [
    { id: 'volume', label: '総挙上量' },
    { id: 'delta', label: '前回比' },
    { id: 'reps', label: '総レップ' },
    { id: 'top', label: '最高重量' }
  ] as const
  type FocusId = (typeof FOCUS)[number]['id']
  const isFocus = (v: string | null): v is FocusId => FOCUS.some((f) => f.id === v)
  let focus = $state<FocusId>(
    isFocus(localStorage.getItem('focusMetric')) ? (localStorage.getItem('focusMetric') as FocusId) : 'volume'
  )
  const cycleFocus = () => {
    const i = FOCUS.findIndex((f) => f.id === focus)
    focus = FOCUS[(i + 1) % FOCUS.length]!.id
    localStorage.setItem('focusMetric', focus)
  }

  let creating = $state(false)
  let newName = $state('')
  let newPattern = $state('')
  let busy = $state(false)

  const exMap = $derived(exMapOf(store.exercises))
  const todaySets = $derived(
    store.sets.filter((s) => s.day === store.today && s.voidedAt === null)
  )
  const todayGroups = $derived(groupByExercise(todaySets, exMap))
  const todayVolume = $derived(volumeOf(todaySets))
  const todayMinutes = $derived(
    todaySets.length > 1
      ? Math.round((todaySets[todaySets.length - 1]!.at - todaySets[0]!.at) / 60000)
      : 0
  )

  const selected = $derived(store.selectedId ? exMap.get(store.selectedId) ?? null : null)
  const setsOfSelected = $derived(
    store.selectedId ? todaySets.filter((s) => s.exerciseId === store.selectedId) : []
  )
  const lastUsed = $derived(lastUsedMap(store.sets))

  /** 「前回」= 当日を含まない直近の有効セット。入力中の参照はここが本体。 */
  const prev = $derived.by(() => {
    if (!store.selectedId) return null
    for (let i = store.sets.length - 1; i >= 0; i--) {
      const s = store.sets[i]!
      if (s.exerciseId === store.selectedId && s.voidedAt === null && s.day !== store.today) return s
    }
    return null
  })

  /** 前回セッション（当日を除く直近の日）のこの種目の挙上量。前回比の分母。 */
  const prevVolume = $derived.by(() => {
    if (!prev || !store.selectedId) return 0
    return volumeOf(
      store.sets.filter(
        (s) => s.exerciseId === store.selectedId && s.voidedAt === null && s.day === prev.day
      )
    )
  })
  const todayVolume2 = $derived(volumeOf(setsOfSelected))
  const focusLabel = $derived(FOCUS.find((f) => f.id === focus)!.label)
  const focusValue = $derived.by(() => {
    if (!setsOfSelected.length) return '—'
    switch (focus) {
      case 'volume':
        return fmtVol(todayVolume2)
      case 'delta': {
        if (!prevVolume) return '—'
        const pct = Math.round((todayVolume2 / prevVolume - 1) * 100)
        return `${pct > 0 ? '+' : ''}${pct}%`
      }
      case 'reps':
        return String(setsOfSelected.reduce((a, s) => a + s.reps, 0))
      case 'top':
        return `${Math.max(...setsOfSelected.map((s) => s.weight))}kg`
    }
  })
  const focusSub = $derived(
    focus === 'delta' && prevVolume ? `前回 ${fmtVol(prevVolume)}` : ''
  )

  const daysAgo = (day: string) => {
    const d = Math.round(
      (new Date(`${store.today}T00:00:00`).getTime() - new Date(`${day}T00:00:00`).getTime()) / 86400000
    )
    return d <= 0 ? '今日' : d === 1 ? '昨日' : `${d}日前`
  }

  // ピッカーは **部位 → パターン → 種目の木**。43件を平坦に並べない。
  // 部位はアコーディオンで開くのは1つだけ。検索中は木を畳んで平坦な結果を出す
  // （検索しているときに階層を辿らせるのは手数が増えるだけなので）。
  let openPart = $state<PartId | null>(null)
  let recentOpen = $state(true)

  const partOf = (e: Exercise) => PATTERN_BY_ID.get(e.patternId)?.part
  const byRecent = (a: Exercise, b: Exercise) =>
    (lastUsed.get(b.ulid) ?? 0) - (lastUsed.get(a.ulid) ?? 0) || a.name.localeCompare(b.name, 'ja')

  const tree = $derived(
    PART_ORDER.map((part) => ({
      part,
      label: PART_LABEL[part],
      count: store.exercises.filter((e) => partOf(e) === part).length,
      groups: patternsOf(part)
        .map((pt) => ({
          pattern: pt,
          items: store.exercises.filter((e) => e.patternId === pt.id).sort(byRecent)
        }))
        .filter((g) => g.items.length)
    })).filter((x) => x.count)
  )

  /** 木の一番上に置く枝。ジムでの最短経路を階層に潰させないため。 */
  const recent = $derived(
    store.exercises.filter((e) => lastUsed.has(e.ulid)).sort(byRecent).slice(0, 8)
  )

  const visible = $derived(
    [...store.exercises]
      .filter((e) => {
        const q = query.trim().toLowerCase()
        if (!q) return true
        return (
          e.name.toLowerCase().includes(q) ||
          (PATTERN_BY_ID.get(e.patternId)?.name ?? '').toLowerCase().includes(q)
        )
      })
      .sort(
        (a, b) =>
          (lastUsed.get(b.ulid) ?? 0) - (lastUsed.get(a.ulid) ?? 0) ||
          a.name.localeCompare(b.name, 'ja')
      )
  )

  async function select(e: Exercise) {
    store.selectedId = e.ulid
    query = ''
    // 当日分があればそれを、なければ前回をプリフィル元にする
    const base = lastLiveSet(store.sets, e.ulid)
    if (base) { weight = base.weight; reps = base.reps }
  }

  // RIR のタップが保存を兼ねる。重量とレップがプリフィルなら 1セット1タップ
  async function record(rir: Rir) {
    if (!store.selectedId || busy) return
    busy = true
    try {
      const saved = await addSet({ exerciseId: store.selectedId, weight, reps, rir })
      // 直前の休憩はこのセットで閉じる。**書き込むのはここだけ。**
      const rest = await commitRest(saved.ulid)
      await reload()
      if (navigator.vibrate) navigator.vibrate(12)
      // このセットを次の区間の錨にする。**時計は動かさない**（開始は手で押す）
      armRest(saved.ulid, store.selectedId)
      say(
        `${weight}kg × ${reps} / RIR ${rirLabel(rir)}` +
          (rest !== null ? `（休憩 ${mmss(rest)} を記録）` : '')
      )
    } finally {
      busy = false
    }
  }

  async function drop(s: SetRecord) {
    await voidSet(s.ulid)
    await reload()
    say('取り消した（行は残る）')
  }

  async function create() {
    if (!newName.trim() || !newPattern) return
    try {
      const e = await addExercise(newName, newPattern)
      newName = ''; newPattern = ''; creating = false
      await reload()
      await select(e)
    } catch {
      say('同じ名前の種目がすでにある')
    }
  }

  const restMin = (sets: SetRecord[], i: number) => {
    const p = sets[i - 1]
    return p ? Math.round((sets[i]!.at - p.at) / 6000) / 10 : null
  }
  const patOf = (e: Exercise | undefined) =>
    e ? PATTERN_BY_ID.get(e.patternId)?.name ?? e.patternId : ''
</script>

<div class="day-bar">
  <strong>{mdShort(store.today)}</strong>
  <span class="dim small">
    {#if todaySets.length}
      {todaySets.length}セット · {fmtVol(todayVolume)}{#if todayMinutes}{' · '}{todayMinutes}分{/if}
    {:else}
      記録なし
    {/if}
  </span>
</div>

{#if selected}
  <section class="entry">
    <div class="ex-head">
      <div class="ex-name grow">{selected.name}</div>
      <button class="ghost" onclick={() => (store.selectedId = null)}>変更</button>
    </div>
    <div class="ex-sub">
      <span class="dim small grow">{patOf(selected)}</span>
      <!-- フォーカス指標。タップで 総挙上量 → 前回比 → 総レップ → 最高重量 を巡回 -->
      <button class="focus" onclick={cycleFocus} aria-label="フォーカス指標を切り替える">
        <span class="dim small">{focusLabel}</span>
        <b>{focusValue}</b>
        {#if focusSub}<span class="dim small">{focusSub}</span>{/if}
      </button>
    </div>

    <!-- 一般アプリが必ず出している「前回」。値を使うだけでなく見せる -->
    <div class="prev">
      {#if prev}
        <span class="dim">前回</span>
        <b>{prev.weight}kg × {prev.reps}</b>
        <span class="dim">RIR {rirLabel(prev.rir)}</span>
        <span class="dim small right">{mdShort(prev.day)}・{daysAgo(prev.day)}</span>
      {:else}
        <span class="dim">この種目の記録は今日が最初</span>
      {/if}
    </div>

    <div class="stepper">
      <button onclick={() => (weight = Math.max(0, Math.round((weight - 2.5) * 100) / 100))}>−2.5</button>
      <button onclick={() => (weight = Math.max(0, Math.round((weight - 1.25) * 100) / 100))}>−1.25</button>
      <div class="val"><input bind:value={weight} type="number" inputmode="decimal" step="0.25" /><span>kg</span></div>
      <button onclick={() => (weight = Math.round((weight + 1.25) * 100) / 100)}>+1.25</button>
      <button onclick={() => (weight = Math.round((weight + 2.5) * 100) / 100)}>+2.5</button>
    </div>

    <div class="stepper">
      <button onclick={() => (reps = Math.max(1, reps - 1))}>−1</button>
      <div class="val"><input bind:value={reps} type="number" inputmode="numeric" step="1" /><span>reps</span></div>
      <button onclick={() => (reps = reps + 1)}>+1</button>
    </div>

    <div class="rir-label">RIR をタップすると記録される</div>
    <div class="rir">
      {#each RIRS as r (r)}
        <button class="rir-btn" disabled={busy} onclick={() => record(r)}>{rirLabel(r)}</button>
      {/each}
    </div>

    {#if setsOfSelected.length}
      <ul class="log">
        {#each setsOfSelected as s, i (s.ulid)}
          {@const m = measuredRest(setsOfSelected, i, store.rests)}
          <li>
            <span class="n">{i + 1}</span>
            <span><b>{s.weight}</b>kg × <b>{s.reps}</b></span>
            <span class="dim">RIR {rirLabel(s.rir)}</span>
            <span class="dim small right">
              {hhmm(s.at)}{#if m !== null}{' · 休 '}{mmss(m)}{:else if restMin(setsOfSelected, i) !== null}{' · 休'}{restMin(setsOfSelected, i)}分{/if}
            </span>
            <button class="x" aria-label="このセットを取り消す" onclick={() => drop(s)}>✕</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else}
  <section class="picker">
    <input bind:value={query} placeholder="種目を検索" autocomplete="off" />

    {#snippet leaf(e: Exercise, showPat: boolean)}
      {@const lp = lastLiveSet(store.sets, e.ulid)}
      <button class="ex-row" onclick={() => select(e)}>
        <span class="grow">
          <span class="ex-row-name">{e.name}</span>
          {#if showPat}<span class="dim small block">{patOf(e)}</span>{/if}
        </span>
        {#if lp}
          <span class="dim small ta-r">{lp.weight}kg × {lp.reps}<br />{daysAgo(lp.day)}</span>
        {:else}
          <span class="dim small ta-r">未記録</span>
        {/if}
      </button>
    {/snippet}

    {#if query.trim()}
      <ul class="leaves flat">
        {#each visible as e (e.ulid)}
          <li>{@render leaf(e, true)}</li>
        {/each}
        {#if !visible.length}<li class="dim small pad">該当なし</li>{/if}
      </ul>
    {:else}
      <div class="tree">
        {#if recent.length}
          <button class="node" onclick={() => (recentOpen = !recentOpen)}>
            <span class="tw">{recentOpen ? '▾' : '▸'}</span>
            <span class="node-name">最近使った</span>
            <span class="dim small">{recent.length}</span>
          </button>
          {#if recentOpen}
            <ul class="leaves">
              {#each recent as e (e.ulid)}<li>{@render leaf(e, true)}</li>{/each}
            </ul>
          {/if}
        {/if}

        {#each tree as p (p.part)}
          <button class="node" onclick={() => (openPart = openPart === p.part ? null : p.part)}>
            <span class="tw">{openPart === p.part ? '▾' : '▸'}</span>
            <span class="node-name">{p.label}</span>
            <span class="dim small">{p.count}</span>
          </button>
          {#if openPart === p.part}
            {#each p.groups as g (g.pattern.id)}
              <div class="node pat">
                <span class="tw"></span>
                <span class="node-name sm">{g.pattern.name}</span>
                <span class="dim small">{g.items.length}</span>
              </div>
              <ul class="leaves deep">
                {#each g.items as e (e.ulid)}<li>{@render leaf(e, false)}</li>{/each}
              </ul>
            {/each}
          {/if}
        {/each}
      </div>
    {/if}

    {#if !creating}
      <button class="ghost wide mk" onclick={() => { creating = true; newName = query }}>
        + 種目を作る
      </button>
    {:else}
      <div class="create">
        <input bind:value={newName} placeholder="種目名" autocomplete="off" />
        <div class="dim small">動作パターンの指定は必須（16枠）</div>
        {#each PART_ORDER as part (part)}
          <div class="pat-row">
            <span class="part">{PART_LABEL[part]}</span>
            <div class="pats">
              {#each patternsOf(part) as pt (pt.id)}
                <button class="pat-chip {newPattern === pt.id ? 'on' : ''}" onclick={() => (newPattern = pt.id)}>
                  {pt.name}
                </button>
              {/each}
            </div>
          </div>
        {/each}
        <div class="create-actions">
          <button class="ghost" onclick={() => { creating = false; newPattern = '' }}>やめる</button>
          <button class="primary" disabled={!newName.trim() || !newPattern} onclick={create}>作る</button>
        </div>
      </div>
    {/if}
  </section>
{/if}

<!-- 今日のワークアウト全体。選択中の種目だけでなく常に全部見える -->
{#if todayGroups.length}
  <section class="today">
    <div class="sec-head">今日のワークアウト</div>
    {#each todayGroups as g (g.exerciseId)}
      <button
        class="tg {g.exerciseId === store.selectedId ? 'on' : ''}"
        onclick={() => { const e = exMap.get(g.exerciseId); if (e) select(e) }}
      >
        <div class="tg-head">
          <span class="tg-name">{g.name}</span>
          <span class="dim small nw">{g.sets.length}セット · {fmtVol(g.volume)}</span>
        </div>
        <div class="dim small tg-sub">{g.partLabel}・{g.patternLabel}</div>
        <div class="tg-sets">
          {#each g.sets as s (s.ulid)}
            <span class="chip">{s.weight}×{s.reps}<i>·{rirLabel(s.rir)}</i></span>
          {/each}
        </div>
      </button>
    {/each}
  </section>
{/if}

<style>
  .day-bar { display: flex; align-items: baseline; gap: 10px; padding: 0 4px; }
  .day-bar strong { font-size: 17px; }
  .grow { flex: 1; min-width: 0; }
  .right { margin-left: auto; }
  .ta-r { text-align: right; line-height: 1.3; }
  .block { display: block; }
  .pad { padding: 10px; }

  .ex-head { display: flex; align-items: center; gap: 10px; }
  .ex-name {
    font-size: 19px; font-weight: 700;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ex-sub { display: flex; align-items: baseline; gap: 10px; margin: 2px 0 10px; }
  .focus {
    display: flex; align-items: baseline; gap: 6px; padding: 4px 8px;
    border-radius: 8px; background: var(--panel2); min-height: 34px;
    font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0;
  }
  .focus b { font-size: 16px; }

  .prev {
    display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px;
    padding: 8px 10px; background: var(--panel2); border-radius: 10px;
    font-variant-numeric: tabular-nums;
  }

  .stepper { display: flex; align-items: stretch; gap: 6px; margin-bottom: 8px; }
  .stepper button {
    flex: 1; background: var(--panel2); border: 1px solid var(--line);
    border-radius: 10px; min-height: 52px; font-variant-numeric: tabular-nums;
  }
  .stepper .val { flex: 1.6; display: flex; align-items: center; justify-content: center; gap: 4px; }
  .stepper .val input {
    text-align: right; font-size: 22px; font-weight: 700; padding: 8px;
    font-variant-numeric: tabular-nums; -moz-appearance: textfield; appearance: textfield;
  }
  .stepper .val span { color: var(--dim); font-size: 13px; }

  .rir-label { color: var(--dim); font-size: 13px; margin: 12px 0 6px; }
  .rir { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .rir-btn {
    background: var(--accent); color: #06121f; font-weight: 800; font-size: 20px;
    border-radius: 12px; min-height: 64px;
  }

  .log { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .log li {
    display: flex; align-items: center; gap: 8px; padding: 6px 4px 6px 10px;
    background: var(--panel2); border-radius: 8px; font-variant-numeric: tabular-nums;
  }
  .log .n { color: var(--dim); min-width: 1.4em; font-size: 13px; }
  .x { color: var(--dim); padding: 8px 10px; font-size: 13px; }

  .tree { max-height: 56vh; overflow: auto; margin-bottom: 10px; }
  .node {
    width: 100%; display: flex; align-items: center; gap: 8px; text-align: left;
    padding: 10px 8px; min-height: 46px; border-radius: 8px;
  }
  .node:not(.pat) { background: var(--panel2); margin-bottom: 4px; }
  .node.pat { min-height: 32px; padding: 6px 8px 2px; }
  .tw { width: 1em; color: var(--dim); font-size: 12px; flex-shrink: 0; }
  .node-name { font-weight: 700; flex: 1; min-width: 0; }
  .node-name.sm { font-weight: 600; font-size: 13px; color: var(--dim); }

  .leaves { list-style: none; margin: 0 0 6px; padding: 0 0 0 20px; display: flex; flex-direction: column; gap: 4px; }
  .leaves.deep { padding-left: 32px; margin-bottom: 8px; }
  .leaves.flat { padding-left: 0; max-height: 56vh; overflow: auto; margin-bottom: 10px; }
  .ex-row {
    width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
    padding: 10px; background: var(--panel2); border-radius: 10px; min-height: 52px;
  }
  .ex-row-name { font-size: 15px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mk { margin-top: 2px; }

  .create { display: flex; flex-direction: column; gap: 8px; }
  .pat-row { display: flex; gap: 8px; align-items: flex-start; }
  .pat-row .part { color: var(--dim); min-width: 1.6em; padding-top: 8px; font-size: 14px; }
  .pats { display: flex; flex-wrap: wrap; gap: 6px; }
  .pat-chip {
    border: 1px solid var(--line); background: var(--panel2);
    border-radius: 999px; padding: 8px 12px; font-size: 14px; min-height: 40px;
  }
  .pat-chip.on { background: var(--accent); color: #06121f; font-weight: 700; border-color: var(--accent); }
  .create-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }

  .sec-head { color: var(--dim); font-size: 13px; margin-bottom: 8px; }
  .today { display: flex; flex-direction: column; gap: 6px; }
  .tg {
    width: 100%; text-align: left; padding: 10px; border-radius: 10px;
    background: var(--panel2); border: 1px solid transparent;
  }
  .tg.on { border-color: var(--accent); }
  .tg-head { display: flex; align-items: baseline; gap: 10px; }
  .tg-name { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tg-sub { margin: 1px 0 6px; }
  .nw { white-space: nowrap; flex-shrink: 0; }
  .tg-sets { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip {
    font-size: 13px; padding: 3px 8px; border-radius: 6px; background: var(--panel);
    color: var(--fg); font-variant-numeric: tabular-nums;
  }
  .chip i { color: var(--dim); font-style: normal; margin-left: 2px; }
</style>
