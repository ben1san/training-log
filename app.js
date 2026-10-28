import { PATTERNS, PART_ORDER, PART_LABEL, patternById } from './patterns.js';
import * as db from './db.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

// --- 状態 -------------------------------------------------------------
let exercises = [];
let sets = [];
let bw = [];
let sel = null;                      // 選択中の種目
let draft = { weight: 20, reps: 8, rir: null };

// --- 補助 -------------------------------------------------------------
const ymd = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const live = () => sets.filter(s => !s.voidedAt);
const forEx = id => live().filter(s => s.exerciseId === id)
  .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
const rirLabel = r => (r >= 4 ? '4+' : String(r));

function agoText(iso) {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d <= 0) return '今日';
  if (d === 1) return '昨日';
  return `${d}日前`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 1100);
}

async function reload() {
  [exercises, sets, bw] = await Promise.all([
    db.listExercises(), db.listSets(), db.listBodyweight(),
  ]);
  render();
}

// --- タブ -------------------------------------------------------------
const TITLES = { log: '記録', ex: '種目', bw: '体重' };
let tab = 'log';

document.querySelectorAll('nav button').forEach(b => {
  b.onclick = () => {
    tab = b.dataset.tab;
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + tab));
    $('#ttl').textContent = TITLES[tab];
    render();
  };
});

// ======================================================================
// 記録
// ======================================================================
function renderLog() {
  const today = ymd();
  const todaySets = live().filter(s => s.completedAt.slice(0, 10) === today);
  $('#hmeta').textContent = tab === 'log' ? `本日 ${todaySets.length} セット` : '';

  const pick = $('#log-pick'), entry = $('#log-entry');

  if (!sel) {
    entry.hidden = true; pick.hidden = false;
    pick.innerHTML = '';

    if (!exercises.length) {
      pick.append(Object.assign(el('div', 'empty'),
        { innerHTML: '種目がまだない。<br>「種目」タブで追加する。' }));
      return;
    }

    // 最終実施が新しい順。今日やった種目を最上段に。
    const lastAt = {};
    for (const s of live()) {
      if (!lastAt[s.exerciseId] || s.completedAt > lastAt[s.exerciseId]) lastAt[s.exerciseId] = s.completedAt;
    }
    const sorted = [...exercises].sort((a, b) => (lastAt[b.id] || '').localeCompare(lastAt[a.id] || ''));

    for (const ex of sorted) {
      const pat = patternById[ex.patternId];
      const n = todaySets.filter(s => s.exerciseId === ex.id).length;
      const b = el('button', 'pick');
      const L = el('div');
      L.append(el('div', 'nm', ex.name));
      L.append(el('div', 'sub', pat ? `${PART_LABEL[pat.part]} · ${pat.name}` : '未分類'));
      b.append(L);
      b.append(el('div', 'ago', n ? `今日 ${n}セット` : agoText(lastAt[ex.id])));
      b.onclick = () => { selectExercise(ex); };
      pick.append(b);
    }
    return;
  }

  // --- 入力画面 ---
  pick.hidden = true; entry.hidden = false;
  entry.innerHTML = '';

  const pat = patternById[sel.patternId];
  const head = el('div', 'card');
  const hr = el('div', 'rowline');
  const t = el('div');
  t.append(el('div', 'nm', sel.name));
  t.append(el('div', 'sub', pat ? `${PART_LABEL[pat.part]} · ${pat.name}` : '未分類'));
  hr.append(t);
  const back = el('button', 'ghost', '種目を変える');
  back.style.cssText = 'font-size:13px;color:var(--dim);padding:8px 10px;border:1px solid var(--line);border-radius:8px';
  back.onclick = () => { sel = null; render(); };
  hr.append(back);
  head.append(hr);

  // 前回のセッション
  const hist = forEx(sel.id);
  const prevDay = [...new Set(hist.map(s => s.completedAt.slice(0, 10)))].filter(d => d !== today).pop();
  if (prevDay) {
    const prev = hist.filter(s => s.completedAt.slice(0, 10) === prevDay);
    const line = prev.map(s => `${s.weight}×${s.reps} <span style="color:var(--accent)">R${rirLabel(s.rir)}</span>`).join(' / ');
    const p = el('div');
    p.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid var(--line);font-size:14px';
    p.innerHTML = `<span class="muted">前回 ${agoText(prev[0].completedAt)}</span><br>${line}`;
    head.append(p);
  }
  entry.append(head);

  // 入力
  const form = el('div', 'card');
  form.append(mkStepper('重量 (kg)', 'weight', [-2.5, 2.5], 0.5));
  form.append(mkStepper('レップ', 'reps', [-1, 1], 1));

  form.append(Object.assign(el('label', 'fld', 'RIR — あと何回上げられたか'), {}));
  const rir = el('div', 'rir');
  [0, 1, 2, 3, 4].forEach(v => {
    const b = el('button', draft.rir === v ? 'on' : '', rirLabel(v));
    b.onclick = () => { draft.rir = v; render(); };
    rir.append(b);
  });
  form.append(rir);

  const commit = el('button', 'commit', draft.rir == null ? 'RIR を選ぶ' : '記録する');
  commit.disabled = draft.rir == null;
  commit.onclick = async () => {
    await db.addSet({
      exerciseId: sel.id,
      weight: Number(draft.weight),
      reps: Number(draft.reps),
      rir: draft.rir,
    });
    draft.rir = null;                       // RIR は毎セット選び直す
    toast('記録した');
    await reload();
  };
  form.append(commit);
  entry.append(form);

  // 今日のセット
  const mine = hist.filter(s => s.completedAt.slice(0, 10) === today);
  if (mine.length) {
    const c = el('div', 'card');
    c.append(el('div', 'sect', `本日 ${mine.length} セット`));
    mine.forEach((s, i) => {
      const r = el('div', 'setrow');
      r.append(el('div', 'n', String(i + 1)));
      r.append(el('div', 'v', `${s.weight} kg × ${s.reps}`));
      r.append(el('div', 'r', `RIR ${rirLabel(s.rir)}`));
      const x = el('button', 'x', '×');
      x.onclick = async () => { await db.voidSet(s.id); toast('取り消した'); await reload(); };
      r.append(x);
      c.append(r);
    });
    entry.append(c);
  }
}

function mkStepper(label, key, [dn, up], min) {
  const wrap = el('div');
  wrap.append(el('label', 'fld', label));
  const s = el('div', 'stepper');
  const mk = (d, sign) => {
    const b = el('button', '', sign);
    b.onclick = () => {
      draft[key] = Math.max(min, Math.round((Number(draft[key]) + d) * 100) / 100);
      render();
    };
    return b;
  };
  const inp = el('input');
  inp.type = 'number'; inp.inputMode = 'decimal'; inp.value = draft[key];
  inp.oninput = () => { draft[key] = inp.value; };
  s.append(mk(dn, '−'), inp, mk(up, '＋'));
  wrap.append(s);
  return wrap;
}

function selectExercise(ex) {
  sel = ex;
  const h = forEx(ex.id);
  const last = h[h.length - 1];
  draft = { weight: last ? last.weight : 20, reps: last ? last.reps : 8, rir: null };
  render();
}

// ======================================================================
// 種目
// ======================================================================
function renderEx() {
  if (tab === 'ex') $('#hmeta').textContent = `${exercises.length} 種目`;

  const sel2 = $('#ex-pat');
  if (!sel2.options.length) {
    sel2.append(new Option('動作パターンを選ぶ…', ''));
    for (const part of PART_ORDER) {
      const g = document.createElement('optgroup');
      g.label = PART_LABEL[part];
      PATTERNS.filter(p => p.part === part)
        .forEach(p => g.append(new Option(p.name, p.id)));
      sel2.append(g);
    }
  }

  const list = $('#ex-list');
  list.innerHTML = '';
  for (const part of PART_ORDER) {
    const pats = PATTERNS.filter(p => p.part === part);
    const any = exercises.some(e => pats.some(p => p.id === e.patternId));
    if (!any) continue;
    list.append(el('div', 'sect', PART_LABEL[part]));
    const c = el('div', 'card');
    for (const p of pats) {
      const mine = exercises.filter(e => e.patternId === p.id);
      if (!mine.length) continue;
      const r = el('div', 'setrow');
      const L = el('div', 'v');
      L.append(el('div', '', p.name));
      const names = el('div', 'muted', mine.map(m => m.name).join(' / '));
      names.style.marginTop = '2px';
      L.append(names);
      r.append(L);
      if (mine.length > 1) {
        const w = el('div', 'r', `${mine.length}本`);
        w.style.color = 'var(--bad)';
        w.title = '同一パターンに複数。データが薄まる';
        r.append(w);
      }
      c.append(r);
    }
    list.append(c);
  }
}

$('#ex-add').onclick = async () => {
  const name = $('#ex-name').value.trim();
  const pid = $('#ex-pat').value;
  if (!name) return toast('種目名が空');
  if (!pid) return toast('パターン未選択');
  if (exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) return toast('同名がある');
  await db.addExercise(name, pid);
  $('#ex-name').value = ''; $('#ex-pat').value = '';
  toast('追加した');
  await reload();
};

// ======================================================================
// 体重
// ======================================================================
function renderBw() {
  if (tab === 'bw') $('#hmeta').textContent = `${bw.length} 日`;
  const today = bw.find(b => b.date === ymd());
  if (today && !renderBw._touched) $('#bw-val').value = today.weight;
  else if (!renderBw._touched && bw.length) {
    $('#bw-val').value = [...bw].sort((a, b) => a.date.localeCompare(b.date)).pop().weight;
  }

  const list = $('#bw-list');
  list.innerHTML = '';
  const recent = [...bw].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  if (!recent.length) return;
  const c = el('div', 'card');
  c.append(el('div', 'sect', '直近'));
  for (const b of recent) {
    const r = el('div', 'setrow');
    r.append(el('div', 'v', b.date));
    r.append(el('div', 'r', `${b.weight} kg`));
    const t = el('div', 'muted');
    t.textContent = new Date(b.measuredAt).toTimeString().slice(0, 5);
    r.append(t);
    c.append(r);
  }
  list.append(c);
}

document.querySelectorAll('[data-bw]').forEach(b => {
  b.onclick = () => {
    renderBw._touched = true;
    const i = $('#bw-val');
    i.value = (Math.round((Number(i.value) + Number(b.dataset.bw)) * 10) / 10).toFixed(1);
  };
});
$('#bw-val').oninput = () => { renderBw._touched = true; };

$('#bw-save').onclick = async () => {
  const v = Number($('#bw-val').value);
  if (!v || v <= 0) return toast('値が不正');
  await db.putBodyweight(ymd(), v);
  renderBw._touched = false;
  toast('記録した');
  await reload();
};

// ======================================================================
// 書き出し
// ======================================================================
$('#btn-export').onclick = async () => {
  const text = await db.exportJSONL();
  const blob = new Blob([text], { type: 'application/x-ndjson' });
  const name = `training-log-${ymd()}.jsonl`;
  const file = new File([blob], name, { type: 'application/x-ndjson' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { /* キャンセル */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
};

// ======================================================================
function render() {
  renderLog(); renderEx(); renderBw();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    console.warn('Service Worker 未登録。https か localhost でないとオフラインは効かない。');
  });
}

reload();
