<script lang="ts">
  import { PATTERN_BY_ID, PART_ORDER, PART_LABEL, patternsOf } from './lib/patterns'
  import {
    listExercises, addExercise, addSet, setsOfDay, voidSet, lastSetOf,
    addBodyWeight, bodyWeightOfDay, localDay, db,
    type Exercise, type SetRecord, type BodyWeight, type Rir
  } from './lib/db'
  import { ship } from './lib/export'
  import { ensurePersisted, type StorageState } from './lib/storage'

  const RIRS: Rir[] = [0, 1, 2, 3, 4]
  const rirLabel = (r: Rir) => (r === 4 ? '4+' : String(r))

  let exercises = $state<Exercise[]>([])
  let lastUsed = $state<Map<string, number>>(new Map())
  let today = $state(localDay(Date.now()))
  let todaySets = $state<SetRecord[]>([])
  let todayBw = $state<BodyWeight[]>([])
  let selectedId = $state<string | null>(null)
  let query = $state('')
  let weight = $state(20)
  let reps = $state(8)
  let prefilled = $state(false)
  let storage = $state<StorageState | null>(null)
  let toast = $state('')
  let newName = $state('')
  let newPattern = $state('')
  let creating = $state(false)
  let busy = $state(false)

  const selected = $derived(exercises.find((e) => e.ulid === selectedId) ?? null)
  const setsOfSelected = $derived(
    selectedId ? todaySets.filter((s) => s.exerciseId === selectedId) : []
  )
  const visible = $derived(
    [...exercises]
      .filter((e) => {
        if (!query.trim()) return true
        const q = query.trim().toLowerCase()
        return (
          e.name.toLowerCase().includes(q) ||
          (PATTERN_BY_ID.get(e.patternId)?.name ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (lastUsed.get(b.ulid) ?? 0) - (lastUsed.get(a.ulid) ?? 0) ||
                      a.name.localeCompare(b.name, 'ja'))
  )

  const say = (m: string) => {
    toast = m
    setTimeout(() => { if (toast === m) toast = '' }, 2200)
  }

  async function refresh() {
    today = localDay(Date.now())
    exercises = await listExercises()
    todaySets = await setsOfDay(today)
    todayBw = await bodyWeightOfDay(today)
    // 直近使用順。4238行規模の全走査でも数msなので索引を増やさない
    const all = await (await db()).getAll('sets')
    const m = new Map<string, number>()
    for (const s of all)
      if (s.voidedAt === null && (m.get(s.exerciseId) ?? 0) < s.at) m.set(s.exerciseId, s.at)
    lastUsed = m
  }

  $effect(() => {
    void (async () => {
      await refresh()
      storage = await ensurePersisted()
    })()
  })

  async function select(e: Exercise) {
    selectedId = e.ulid
    query = ''
    const last = await lastSetOf(e.ulid)
    prefilled = !!last
    if (last) { weight = last.weight; reps = last.reps }
  }

  // RIRのタップが保存を兼ねる。重量とレップがプリフィルなら1セット1タップ
  async function record(rir: Rir) {
    if (!selectedId || busy) return
    busy = true
    try {
      await addSet({ exerciseId: selectedId, weight, reps, rir })
      await refresh()
      if (navigator.vibrate) navigator.vibrate(12)
      say(`${weight}kg × ${reps} / RIR ${rirLabel(rir)}`)
    } finally {
      busy = false
    }
  }

  async function undoLast() {
    const last = setsOfSelected.at(-1)
    if (!last) return
    await voidSet(last.ulid)
    await refresh()
    say('直前のセットを取り消した（行は残る）')
  }

  async function create() {
    if (!newName.trim() || !newPattern) return
    try {
      const e = await addExercise(newName, newPattern)
      newName = ''; newPattern = ''; creating = false
      await refresh()
      await select(e)
    } catch {
      say('同じ名前の種目がすでにある')
    }
  }

  let bwInput = $state('')
  async function recordBw() {
    const kg = Number(bwInput)
    if (!kg || kg <= 0) return
    await addBodyWeight(kg)
    bwInput = ''
    await refresh()
    say('体重を記録した')
  }

  async function doShip() {
    try {
      const r = await ship()
      say(r === 'empty' ? '搬出するものがない' :
          r === 'share' ? '共有シートへ出した' :
          r === 'download' ? 'ファイルを保存した' : 'クリップボードへ入れた')
    } catch { /* ユーザーが共有をキャンセルした */ }
  }

  const restMin = (s: SetRecord, i: number) => {
    const prev = setsOfSelected[i - 1]
    return prev ? Math.round((s.at - prev.at) / 6000) / 10 : null
  }
  const hhmm = (at: number) =>
    new Date(at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
</script>

<main>
  <header>
    <div class="h-row">
      <strong>{today}</strong>
      <span class="dim">{todaySets.length} セット</span>
      <button class="ghost" onclick={doShip}>搬出</button>
    </div>
    {#if storage?.atRisk}
      <div class="risk">
        ホーム画面に追加していない。<b>Safariは7日の未使用でこのデータを破棄する。</b>
      </div>
    {/if}
  </header>

  <section class="bw">
    <label for="bw">体重</label>
    <input id="bw" bind:value={bwInput} type="number" inputmode="decimal" step="0.1" placeholder="kg" />
    <button class="ghost" onclick={recordBw}>記録</button>
    {#if todayBw.length}
      <span class="dim small">{todayBw.map((b) => `${b.kg}kg ${hhmm(b.at)}`).join(' / ')}</span>
    {/if}
  </section>

  {#if selected}
    <section class="entry">
      <div class="ex-head">
        <div>
          <div class="ex-name">{selected.name}</div>
          <div class="dim small">
            {PATTERN_BY_ID.get(selected.patternId)?.name ?? selected.patternId}
            {#if !prefilled}· 初回{/if}
          </div>
        </div>
        <button class="ghost" onclick={() => (selectedId = null)}>変更</button>
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
            <li>
              <span class="n">{i + 1}</span>
              <span>{s.weight}kg × {s.reps}</span>
              <span class="dim">RIR {rirLabel(s.rir)}</span>
              <span class="dim small right">
                {hhmm(s.at)}{#if restMin(s, i) !== null} · 休 {restMin(s, i)}分{/if}
              </span>
            </li>
          {/each}
        </ul>
        <button class="undo" onclick={undoLast}>直前を取り消す</button>
      {/if}
    </section>
  {:else}
    <section class="picker">
      <input bind:value={query} placeholder="種目を検索" autocomplete="off" />
      <ul class="ex-list">
        {#each visible as e (e.ulid)}
          <li>
            <button class="ex-row" onclick={() => select(e)}>
              <span>{e.name}</span>
              <span class="dim small">{PATTERN_BY_ID.get(e.patternId)?.name ?? e.patternId}</span>
            </button>
          </li>
        {/each}
      </ul>

      {#if !creating}
        <button class="ghost wide" onclick={() => { creating = true; newName = query }}>
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
                  <button
                    class="pat {newPattern === pt.id ? 'on' : ''}"
                    onclick={() => (newPattern = pt.id)}>{pt.name}</button>
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

  {#if toast}<div class="toast">{toast}</div>{/if}
</main>

<style>
  main {
    max-width: 560px; margin: 0 auto;
    padding: calc(env(safe-area-inset-top) + 12px) 14px calc(env(safe-area-inset-bottom) + 28px);
    display: flex; flex-direction: column; gap: 14px;
  }
  .h-row { display: flex; align-items: center; gap: 10px; }
  .h-row .ghost { margin-left: auto; }
  .dim { color: var(--dim); }
  .small { font-size: 13px; }
  .right { margin-left: auto; }
  .risk {
    margin-top: 10px; padding: 10px 12px; border-radius: 10px;
    background: #3a2a12; color: var(--warn); font-size: 13px; line-height: 1.4;
  }
  section { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 12px; }
  .bw { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .bw label { color: var(--dim); font-size: 14px; }
  .bw input { width: 110px; }
  button.ghost {
    border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px;
    background: var(--panel2); min-height: 44px;
  }
  button.wide { width: 100%; }
  button.primary {
    border-radius: 10px; padding: 10px 18px; background: var(--accent);
    color: #06121f; font-weight: 700; min-height: 44px;
  }
  button:disabled { opacity: 0.45; }
  .ex-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
  .ex-head .ghost { margin-left: auto; }
  .ex-name { font-size: 19px; font-weight: 700; }
  .stepper { display: flex; align-items: stretch; gap: 6px; margin-bottom: 8px; }
  .stepper button {
    flex: 1; background: var(--panel2); border: 1px solid var(--line);
    border-radius: 10px; min-height: 52px; font-variant-numeric: tabular-nums;
  }
  .stepper .val {
    flex: 1.6; display: flex; align-items: center; justify-content: center; gap: 4px;
  }
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
  .log { list-style: none; margin: 14px 0 8px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .log li {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    background: var(--panel2); border-radius: 8px; font-variant-numeric: tabular-nums;
  }
  .log .n { color: var(--dim); min-width: 1.4em; font-size: 13px; }
  .undo { color: var(--danger); font-size: 14px; padding: 8px 0; }
  .picker input { margin-bottom: 10px; }
  .ex-list { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 46vh; overflow: auto; }
  .ex-row {
    width: 100%; display: flex; align-items: baseline; gap: 10px; text-align: left;
    padding: 12px 10px; background: var(--panel2); border-radius: 10px; min-height: 48px;
  }
  .ex-row .small { margin-left: auto; }
  .create { display: flex; flex-direction: column; gap: 8px; }
  .pat-row { display: flex; gap: 8px; align-items: flex-start; }
  .pat-row .part { color: var(--dim); min-width: 1.6em; padding-top: 8px; font-size: 14px; }
  .pats { display: flex; flex-wrap: wrap; gap: 6px; }
  .pat {
    border: 1px solid var(--line); background: var(--panel2);
    border-radius: 999px; padding: 8px 12px; font-size: 14px; min-height: 40px;
  }
  .pat.on { background: var(--accent); color: #06121f; font-weight: 700; border-color: var(--accent); }
  .create-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
  .toast {
    position: fixed; left: 50%; transform: translateX(-50%);
    bottom: calc(env(safe-area-inset-bottom) + 18px);
    background: #2b3238; border: 1px solid var(--line); color: var(--fg);
    padding: 10px 16px; border-radius: 999px; font-size: 14px; box-shadow: 0 6px 24px #0008;
  }
</style>
