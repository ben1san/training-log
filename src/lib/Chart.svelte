<script lang="ts">
  // 単系列の折れ線。**2つ目の系列は持たない**（二軸は作らない）。
  // 生値は同じ系列の未平滑化なので、色相ではなく濃淡で区別する。
  // 目盛りは実線のヘアライン、直接ラベルは端点と最大値だけ。
  // 数値の読み取りはタップのクロスヘアに任せる。

  interface P { t: number; v: number }

  let {
    main,
    raw = [],
    unit = '',
    height = 150,
    fmt = (n: number) => String(Math.round(n * 10) / 10)
  }: {
    main: P[]
    raw?: P[]
    unit?: string
    height?: number
    fmt?: (n: number) => string
  } = $props()

  let w = $state(0)
  let cursor = $state<number | null>(null) // main の index

  const PAD = { t: 18, r: 8, b: 18, l: 8 }
  const plotW = $derived(Math.max(0, w - PAD.l - PAD.r))
  const plotH = $derived(height - PAD.t - PAD.b)

  const all = $derived([...main, ...raw])
  const tMin = $derived(all.length ? Math.min(...all.map((p) => p.t)) : 0)
  const tMax = $derived(all.length ? Math.max(...all.map((p) => p.t)) : 1)
  const vLo = $derived(all.length ? Math.min(...all.map((p) => p.v)) : 0)
  const vHi = $derived(all.length ? Math.max(...all.map((p) => p.v)) : 1)
  const span = $derived(vHi - vLo || Math.max(1, vHi * 0.04))
  const yLo = $derived(vLo - span * 0.15)
  const yHi = $derived(vHi + span * 0.15)

  const x = (t: number) => PAD.l + (tMax === tMin ? plotW / 2 : ((t - tMin) / (tMax - tMin)) * plotW)
  const y = (v: number) => PAD.t + plotH - ((v - yLo) / (yHi - yLo)) * plotH

  const path = (ps: P[]) =>
    ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')

  const sparse = $derived(main.length <= 30)
  const endp = $derived(main.length ? main[main.length - 1] : null)
  const peakRaw = $derived(
    main.length ? main.reduce((a, p) => (p.v > a.v ? p : a), main[0]!) : null
  )
  // 端点ラベルと重なる・値が同じ最大値は書かない（同じ数字を2回置かない）
  const peak = $derived.by(() => {
    if (!peakRaw || !endp || main.length <= 2) return null
    if (Math.abs(peakRaw.v - endp.v) < (yHi - yLo) * 0.04) return null
    if (Math.abs(x(peakRaw.t) - x(endp.t)) < 54) return null
    return peakRaw
  })
  const active = $derived(cursor !== null ? main[cursor] ?? null : null)

  function locate(ev: PointerEvent) {
    if (!main.length) return
    const box = (ev.currentTarget as SVGElement).getBoundingClientRect()
    const px = ev.clientX - box.left
    let best = 0
    let bd = Infinity
    for (let i = 0; i < main.length; i++) {
      const d = Math.abs(x(main[i]!.t) - px)
      if (d < bd) { bd = d; best = i }
    }
    cursor = best
  }

  const dayLabel = (t: number) => {
    const d = new Date(t)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
</script>

<div class="chart" bind:clientWidth={w} style="height:{height}px">
  {#if w > 0 && main.length}
    <svg
      {height} width={w} role="img"
      aria-label="推移グラフ。数値は下の一覧にある"
      onpointerdown={locate}
      onpointermove={(e) => { if (cursor !== null || e.pressure > 0) locate(e) }}
      onpointerup={() => (cursor = null)}
      onpointerleave={() => (cursor = null)}
    >
      <!-- 目盛りは実線のヘアライン。破線は使わない -->
      {#each [vLo + (vHi - vLo) * 0.5] as g (g)}
        <line x1={PAD.l} x2={w - PAD.r} y1={y(g)} y2={y(g)} class="grid" />
        <text x={w - PAD.r} y={y(g) - 4} class="tick right">{fmt(g)}</text>
      {/each}
      <line x1={PAD.l} x2={w - PAD.r} y1={PAD.t + plotH} y2={PAD.t + plotH} class="axis" />

      <!-- 生値は同じ系列の未平滑化。線で繋ぐと欠測日をまたいで補間したことになるので点で置く -->
      {#each raw as p (p.t)}
        <circle cx={x(p.t)} cy={y(p.v)} r="1.8" class="rawdot" />
      {/each}

      <path d={path(main)} class="main" />

      {#if sparse}
        {#each main as p (p.t)}
          <circle cx={x(p.t)} cy={y(p.v)} r="4.5" class="dot" />
        {/each}
      {/if}

      {#if peak}
        <text x={Math.min(w - PAD.r - 30, Math.max(16, x(peak.t)))} y={y(peak.v) - 8} class="lbl mid">{fmt(peak.v)}</text>
      {/if}
      {#if endp}
        <circle cx={x(endp.t)} cy={y(endp.v)} r="4.5" class="dot end" />
        <text x={w - PAD.r} y={y(endp.v) - 9} class="lbl end">{fmt(endp.v)}{unit}</text>
      {/if}

      <text x={PAD.l} y={height - 4} class="tick">{dayLabel(tMin)}</text>
      {#if tMax !== tMin}
        <text x={w - PAD.r} y={height - 4} class="tick right">{dayLabel(tMax)}</text>
      {/if}

      {#if active}
        <line x1={x(active.t)} x2={x(active.t)} y1={PAD.t} y2={PAD.t + plotH} class="cross" />
        <circle cx={x(active.t)} cy={y(active.v)} r="6" class="dot hit" />
      {/if}
    </svg>

    {#if active}
      <div class="read" style="left:{Math.min(Math.max(x(active.t), 46), w - 46)}px">
        {dayLabel(active.t)} · <b>{fmt(active.v)}{unit}</b>
      </div>
    {/if}
  {:else if w > 0}
    <div class="empty">まだ描けるほどの記録がない</div>
  {/if}
</div>

<style>
  .chart { position: relative; width: 100%; touch-action: pan-y; }
  svg { display: block; overflow: visible; }
  .grid { stroke: var(--line); stroke-width: 1; }
  .axis { stroke: var(--line); stroke-width: 1; }
  .main { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  /* 生値は同系列の未平滑化。別の色相を与えず、濃淡だけで落とす */
  .rawdot { fill: var(--dim); opacity: 0.5; }
  .dot { fill: var(--accent); stroke: var(--panel); stroke-width: 2; }
  .dot.end { stroke-width: 2; }
  .dot.hit { fill: var(--fg); stroke: var(--panel); }
  .cross { stroke: var(--dim); stroke-width: 1; }
  /* 値・ラベルはテキスト色。系列色は点と線だけが担う */
  .lbl { fill: var(--fg); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .lbl.end { text-anchor: end; }
  .lbl.mid { fill: var(--dim); font-weight: 600; text-anchor: middle; }
  .tick { fill: var(--dim); font-size: 11px; }
  .tick.right { text-anchor: end; }
  .read {
    position: absolute; top: -2px; transform: translateX(-50%);
    background: var(--panel2); border: 1px solid var(--line); border-radius: 8px;
    padding: 3px 8px; font-size: 12px; white-space: nowrap; pointer-events: none;
    font-variant-numeric: tabular-nums;
  }
  .empty { color: var(--dim); font-size: 13px; padding: 24px 0; text-align: center; }
</style>
