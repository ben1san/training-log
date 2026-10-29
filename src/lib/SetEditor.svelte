<script lang="ts">
  import { untrack } from 'svelte'
  import { reviseSet, voidSet, type SetRecord, type Rir } from './db'
  import { reload } from './store.svelte'
  import { hhmm, mdShort } from './derive'

  // 過去セットの訂正。**列を足さずに**「元を void して同じ at で追記」する。
  // 一般アプリは行を上書きするが、それをやると追記のみの前提が崩れて
  // 同期を後から足せなくなる。

  let {
    target, name, say, close
  }: { target: SetRecord; name: string; say: (m: string) => void; close: () => void } = $props()

  const RIRS: Rir[] = [0, 1, 2, 3, 4]
  const rirLabel = (r: Rir) => (r === 4 ? '4+' : String(r))

  // 編集対象は ulid キーで再マウントされるので初期値は一度だけ読む
  let w = $state(untrack(() => target.weight))
  let r = $state(untrack(() => target.reps))
  let rir = $state<Rir>(untrack(() => target.rir))
  let busy = $state(false)

  const dirty = $derived(w !== target.weight || r !== target.reps || rir !== target.rir)

  async function save() {
    if (!dirty || busy) return
    busy = true
    try {
      await reviseSet(target.ulid, { weight: w, reps: r, rir })
      await reload()
      say('訂正した（元の行は void で残る）')
      close()
    } finally { busy = false }
  }

  async function remove() {
    busy = true
    try {
      await voidSet(target.ulid)
      await reload()
      say('取り消した（行は残る）')
      close()
    } finally { busy = false }
  }
</script>

<div class="ed">
  <div class="ed-head">
    <div>
      <div class="ed-name">{name}</div>
      <div class="dim small">{mdShort(target.day)} {hhmm(target.at)} のセットを訂正</div>
    </div>
    <button class="ghost" onclick={close}>閉じる</button>
  </div>

  <div class="row">
    <button onclick={() => (w = Math.max(0, Math.round((w - 1.25) * 100) / 100))}>−1.25</button>
    <div class="val"><input bind:value={w} type="number" inputmode="decimal" step="0.25" /><span>kg</span></div>
    <button onclick={() => (w = Math.round((w + 1.25) * 100) / 100)}>+1.25</button>
  </div>
  <div class="row">
    <button onclick={() => (r = Math.max(1, r - 1))}>−1</button>
    <div class="val"><input bind:value={r} type="number" inputmode="numeric" step="1" /><span>reps</span></div>
    <button onclick={() => (r = r + 1)}>+1</button>
  </div>
  <div class="rirs">
    {#each RIRS as v (v)}
      <button class="rb {rir === v ? 'on' : ''}" onclick={() => (rir = v)}>{rirLabel(v)}</button>
    {/each}
  </div>

  <div class="acts">
    <button class="del" disabled={busy} onclick={remove}>このセットを取り消す</button>
    <button class="primary" disabled={!dirty || busy} onclick={save}>訂正を保存</button>
  </div>
</div>

<style>
  .ed { background: var(--panel2); border: 1px solid var(--accent); border-radius: 12px; padding: 12px; margin: 6px 0; }
  .ed-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
  .ed-head .ghost { margin-left: auto; }
  .ed-name { font-weight: 700; }
  .row { display: flex; gap: 6px; margin-bottom: 6px; }
  .row button {
    flex: 1; background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; min-height: 48px; font-variant-numeric: tabular-nums;
  }
  .val { flex: 1.6; display: flex; align-items: center; justify-content: center; gap: 4px; }
  .val input {
    text-align: right; font-size: 20px; font-weight: 700; padding: 8px;
    font-variant-numeric: tabular-nums; appearance: textfield;
  }
  .val span { color: var(--dim); font-size: 13px; }
  .rirs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 8px 0 12px; }
  .rb {
    min-height: 48px; border-radius: 10px; background: var(--panel);
    border: 1px solid var(--line); font-weight: 700;
  }
  .rb.on { background: var(--accent); color: #06121f; border-color: var(--accent); }
  .acts { display: flex; align-items: center; gap: 10px; }
  .del { color: var(--danger); font-size: 14px; }
  .acts .primary { margin-left: auto; }
</style>
