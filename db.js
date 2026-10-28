// IndexedDB 層。追記のみ。
//
// sets は物理削除しない。取り消しは voidedAt を立てるだけで、行そのものは残る。
// 同期を後から足すとき、追記のみなら競合しないため。

const DB_NAME = 'training-log';
const DB_VERSION = 1;

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // 1セット = 1レコード
      // { id, exerciseId, weight, reps, rir, completedAt, voidedAt }
      if (!db.objectStoreNames.contains('sets')) {
        const s = db.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
        s.createIndex('completedAt', 'completedAt');
        s.createIndex('exerciseId', 'exerciseId');
      }

      // 種目マスタ  { id, name, patternId, createdAt }
      if (!db.objectStoreNames.contains('exercises')) {
        const e2 = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
        e2.createIndex('name', 'name', { unique: true });
        e2.createIndex('patternId', 'patternId');
      }

      // 体重 1日1回  { date: 'YYYY-MM-DD', weight, measuredAt }
      if (!db.objectStoreNames.contains('bodyweight')) {
        db.createObjectStore('bodyweight', { keyPath: 'date' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const all = (store, index) => open().then(db => new Promise((resolve, reject) => {
  const t = db.transaction(store, 'readonly');
  const src = index ? t.objectStore(store).index(index) : t.objectStore(store);
  const req = src.getAll();
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
}));

// --- 種目 -------------------------------------------------------------

export const listExercises = () => all('exercises');

export function addExercise(name, patternId) {
  if (!name || !name.trim()) throw new Error('種目名が空です');
  if (!patternId) throw new Error('動作パターンが未選択です');
  return tx('exercises', 'readwrite', s =>
    s.add({ name: name.trim(), patternId, createdAt: new Date().toISOString() }));
}

export const deleteExercise = (id) => tx('exercises', 'readwrite', s => s.delete(id));

// --- セット -----------------------------------------------------------

export const listSets = () => all('sets');

export function addSet({ exerciseId, weight, reps, rir }) {
  return tx('sets', 'readwrite', s => s.add({
    exerciseId,
    weight,                       // kg
    reps,                         // 回
    rir,                          // 0..4 (4 は 4+ の意味)
    completedAt: new Date().toISOString(),
    voidedAt: null,
  }));
}

// 追記のみ。行は消さず voidedAt を立てる。
export function voidSet(id) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('sets', 'readwrite');
    const st = t.objectStore('sets');
    const g = st.get(id);
    g.onsuccess = () => {
      const row = g.result;
      if (!row) return;
      row.voidedAt = new Date().toISOString();
      st.put(row);
    };
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  }));
}

// --- 体重 -------------------------------------------------------------

export const listBodyweight = () => all('bodyweight');

export function putBodyweight(date, weight) {
  return tx('bodyweight', 'readwrite', s =>
    s.put({ date, weight, measuredAt: new Date().toISOString() }));
}

// --- 書き出し ---------------------------------------------------------

// JSONL。1行1レコード。同期を足すときはこの行をそのまま流す。
export async function exportJSONL() {
  const [sets, exercises, bw] = await Promise.all([
    listSets(), listExercises(), listBodyweight(),
  ]);
  const lines = [];
  for (const e of exercises) lines.push(JSON.stringify({ type: 'exercise', ...e }));
  for (const s of sets)      lines.push(JSON.stringify({ type: 'set', ...s }));
  for (const b of bw)        lines.push(JSON.stringify({ type: 'bodyweight', ...b }));
  return lines.join('\n') + '\n';
}
