// 老師後台共用狀態（目前選擇的課程）
import { api } from './common.js';
import { mergeConfig } from './calc.js';

export const S = {
  course: null,
  roster: [],      // 在學（不含退選 / 休退學）
  allRoster: [],   // 全部修課名單
  status: {},      // 學號 → { type: drop|suspend|withdraw, date, note }
  grades: {},
  adj: {},
  config: mergeConfig(null),
  log: [],
  absent: { date: '', ids: [], recorded: false },
  seating: null, // { cells: { 'r,c': 學號 } }；null = 依座號排列
  global: {},
  schools: [],
  listeners: new Set(),
};

export const sign = (v) => (v > 0 ? `+${v}` : String(v));
export const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
export const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const isAbsent = (id) => S.absent.ids.includes(id);
export const present = () => S.roster.filter((s) => !isAbsent(s.id));

export function onChange(fn) { S.listeners.add(fn); }
export function emit(what) { S.listeners.forEach((fn) => fn(what)); }

export async function loadCourse(code) {
  const d = await api(`/api/teacher/data?course=${encodeURIComponent(code)}`);
  Object.assign(S, {
    course: d.course, allRoster: d.roster, status: d.status || {}, grades: d.grades, adj: d.adj,
    config: mergeConfig(d.config), log: d.log, absent: d.absent, seating: d.seating || null,
  });
  S.roster = S.allRoster.filter((s) => !S.status[s.id]);
  emit('course');
}

export const isDropped = (id) => !!S.status[id];

// 加/扣分（ids 可多人）；set 用於成績管理直接修改
export async function adjust(ids, { delta, set, note } = {}) {
  const r = await api('/api/teacher/adjust', { method: 'POST', body: { course: S.course.code, ids, delta, set, note } });
  Object.assign(S.adj, r.adj);
  emit('adj');
  return r;
}

// 座位 → 學生：有座位表就用座位表，否則依座號推算
export function seatMap(seatToCell) {
  const { rows, cols } = S.config.classroom;
  const m = new Map();
  const cells = S.seating && S.seating.cells;
  if (cells && Object.keys(cells).length) {
    const byId = new Map(S.roster.map((s) => [s.id, s]));
    for (const [k, id] of Object.entries(cells)) {
      const [r, c] = k.split(',').map(Number);
      if (r < rows && c < cols && byId.has(id)) m.set(k, byId.get(id));
    }
  } else {
    for (const s of S.roster) {
      const cell = seatToCell(s.seat, S.config.classroom);
      if (cell) m.set(`${cell.r},${cell.c}`, s);
    }
  }
  return m;
}
