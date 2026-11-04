<script lang="ts">
  import { renameExercise, setAlternatesSides, type Exercise } from './db'
  import { reload } from './store.svelte'

  // 種目の名前変更・左右交互切替。**履歴の種目詳細と記録画面の両方から呼ぶ**
  // ため、ロジックを1本にまとめてここに置く。保存は db への書き込み + reload
  // だけで、呼び出し元への通知は無い — store が更新されれば両画面とも
  // $derived で自動的に反映される。

  let { exercise, say }: { exercise: Exercise; say: (m: string) => void } = $props()

  let renaming = $state(false)
  let newName = $state('')
  let renameBusy = $state(false)

  function startRename() {
    newName = exercise.name
    renaming = true
  }

  async function saveRename() {
    if (renameBusy) return
    renameBusy = true
    try {
      await renameExercise(exercise.ulid, newName)
      await reload()
      renaming = false
      say('名前を変更した')
    } catch (e) {
      say(e instanceof DOMException && e.name === 'ConstraintError'
        ? 'その名前は既に使われている' : '変更できなかった')
    } finally {
      renameBusy = false
    }
  }

  /** 作成時に決め損ねた種目を、後から左右交互へ切り替える経路。 */
  async function toggleAlternates(v: boolean) {
    await setAlternatesSides(exercise.ulid, v)
    await reload()
    say(v ? '左右交互に切り替えた（次のセットから左右を選べる）' : '左右交互をやめた')
  }
</script>

<div class="ex-edit">
  {#if renaming}
    <div class="rename-row">
      <input class="rename-input" bind:value={newName} disabled={renameBusy} />
      <button class="ghost" disabled={renameBusy} onclick={() => (renaming = false)}>やめる</button>
      <button class="primary" disabled={renameBusy || !newName.trim()} onclick={saveRename}>保存</button>
    </div>
  {:else}
    <button class="ghost rename-btn" onclick={startRename}>名前を変更</button>
  {/if}
  <label class="alt-check">
    <input
      type="checkbox"
      checked={exercise.alternatesSides}
      onchange={(ev) => toggleAlternates(ev.currentTarget.checked)}
    />
    <span>左右交互の種目</span>
  </label>
</div>

<style>
  .ex-edit {
    display: flex; flex-direction: column; gap: 8px; padding: 10px;
    background: var(--panel2); border: 1px solid var(--line); border-radius: 10px; margin: 6px 0;
  }
  .rename-btn { font-size: 13px; align-self: flex-start; }
  .rename-row { display: flex; align-items: center; gap: 8px; }
  .rename-input {
    flex: 1; min-width: 0; font-size: 16px; font-weight: 700; padding: 8px 10px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  }
  .alt-check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--dim); }
  .alt-check input { width: 16px; height: 16px; flex-shrink: 0; }
</style>
