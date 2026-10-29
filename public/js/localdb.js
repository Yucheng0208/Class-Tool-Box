// 課堂工具箱：沒有後端，班級與名冊都存在這台電腦的瀏覽器（localStorage）
// 這裡模擬原本教師後台的幾個 API，讓抽籤、座位、分組模組不用改就能用
import { mergeConfig } from './calc.js';

const KEY = 'ct-data-v1';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const newId = () => Math.random().toString(36).slice(2, 10);

let mem = null; // 無痕模式等存不了時，至少這次開著的頁面還能用
function read() {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { mem = null; }
  if (!mem || typeof mem !== 'object' || !mem.classes) mem = { classes: {}, order: [], current: '' };
  return mem;
}
export let storageOk = true;
function write() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); storageOk = true; } catch { storageOk = false; }
}

// ---------- 班級 ----------
export function listClasses() { const d = read(); return d.order.map((id) => d.classes[id]).filter(Boolean); }
export function currentClass() {
  const d = read();
  if (!d.classes[d.current]) d.current = d.order[0] || '';
  return d.classes[d.current] || null;
}
export function setCurrent(id) { const d = read(); if (d.classes[id]) { d.current = id; write(); } }
export function createClass(name) {
  const d = read();
  const c = { id: newId(), name: String(name || '').trim().slice(0, 60) || 'Class', roster: [], adj: {}, absent: { date: today(), ids: [] }, config: {}, seating: null };
  d.classes[c.id] = c;
  d.order.push(c.id);
  d.current = c.id;
  write();
  return c;
}
export const findClassByName = (name) => listClasses().find((c) => c.name === String(name).trim());
export function renameClass(id, name) { const c = read().classes[id]; if (c) { c.name = String(name || '').trim().slice(0, 60) || c.name; write(); } }
export function deleteClass(id) {
  const d = read();
  delete d.classes[id];
  d.order = d.order.filter((x) => x !== id);
  if (d.current === id) d.current = d.order[0] || '';
  write();
}

// ---------- 名冊 ----------
// list：[{ seat, id, name }]；學號空白就用座號當代號（抽籤畫面會顯示在名字旁）
export function normalizeRoster(list) {
  const seen = new Set();
  const out = [];
  list.forEach((r, i) => {
    const name = String(r.name ?? '').trim().slice(0, 40);
    if (!name) return;
    const seat = String(r.seat ?? '').trim().replace(/\.0+$/, '').slice(0, 6);
    let id = String(r.id ?? '').trim().slice(0, 30) || seat || String(i + 1);
    while (seen.has(id)) id = `${id}*`;
    seen.add(id);
    out.push({ id, name, seat });
  });
  return out;
}
export function setRoster(classId, list) {
  const c = read().classes[classId];
  if (!c) return;
  c.roster = normalizeRoster(list);
  const ids = new Set(c.roster.map((s) => s.id));
  // 不在名單上的人：加減分、缺席、座位一併拿掉
  c.adj = Object.fromEntries(Object.entries(c.adj || {}).filter(([k]) => ids.has(k)));
  c.absent.ids = (c.absent.ids || []).filter((k) => ids.has(k));
  if (c.seating && c.seating.cells) c.seating.cells = Object.fromEntries(Object.entries(c.seating.cells).filter(([, v]) => ids.has(v)));
  write();
}
// 匯入座位表：cells 是 { 'r,c': 學號 }，r = 0 是最前排（靠講台）
export function setSeating(classId, rows, cols, cells) {
  const c = read().classes[classId];
  if (!c) return;
  c.config = { ...c.config, classroom: { ...((c.config && c.config.classroom) || {}), rows, cols } };
  c.seating = Object.keys(cells).length ? { cells, updated: new Date().toISOString() } : null;
  write();
}
export function resetScores(classId) { const c = read().classes[classId]; if (c) { c.adj = {}; write(); } }

// ---------- 備份：整份資料匯出 / 匯入（換電腦用） ----------
export function exportAll() { return JSON.stringify({ app: 'classtool', v: 1, ...read() }); }
export function importAll(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== 'classtool' || !d.classes) throw new Error('bad file');
  mem = { classes: d.classes, order: d.order || Object.keys(d.classes), current: d.current || '' };
  write();
}

// ---------- 模擬 API ----------
function fail(msg) { const e = new Error(msg); e.status = 400; throw e; }
function absentOf(c) {
  // 缺席只記今天；隔天打開就清空
  if (!c.absent || c.absent.date !== today()) c.absent = { date: today(), ids: [] };
  return { date: c.absent.date, ids: [...c.absent.ids], recorded: false };
}
function data(c) {
  return { course: { code: c.id, name: c.name }, roster: c.roster, status: {}, grades: {}, adj: c.adj || {}, config: mergeConfig(c.config), log: [], absent: absentOf(c), seating: c.seating };
}

export async function localApi(path, { method = 'GET', body } = {}) {
  const url = new URL(path, location.origin);
  const d = read();
  const c = d.classes[(body && body.course) || url.searchParams.get('course')] || null;
  const route = `${method} ${url.pathname}`;
  if (!c) fail('no class');
  switch (route) {
    case 'GET /api/teacher/data':
      return data(c);
    case 'PUT /api/teacher/absent': {
      const ids = new Set(c.roster.map((s) => s.id));
      c.absent = { date: today(), ids: (body.ids || []).filter((x) => ids.has(x)) };
      write();
      return { absent: absentOf(c) };
    }
    case 'POST /api/teacher/adjust': {
      c.adj = c.adj || {};
      const out = {};
      const known = new Set(c.roster.map((x) => x.id));
      for (const id of (body.ids || []).filter((x) => known.has(x))) { // 彩蛋（老師起立…）不記分
        const v = body.set !== undefined ? Number(body.set) : (c.adj[id] || 0) + Number(body.delta || 0);
        c.adj[id] = Math.round(v * 100) / 100;
        out[id] = c.adj[id];
      }
      write();
      return { adj: out };
    }
    case 'PUT /api/teacher/config': {
      const room = (body.config && body.config.classroom) || {};
      c.config = { ...c.config, classroom: { ...((c.config && c.config.classroom) || {}), ...room } };
      write();
      return { config: mergeConfig(c.config) };
    }
    case 'PUT /api/teacher/seating': {
      c.config = { ...c.config, classroom: { ...((c.config && c.config.classroom) || {}), rows: body.rows, cols: body.cols } };
      // 跟伺服器版一樣：座位表清空就回到依座號排列
      c.seating = Object.keys(body.cells || {}).length ? { cells: body.cells, updated: new Date().toISOString() } : null;
      write();
      return { config: mergeConfig(c.config), seating: c.seating };
    }
    default:
      return fail('not available');
  }
}
