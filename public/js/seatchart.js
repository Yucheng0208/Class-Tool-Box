// 座位表管理：依座號 / 隨機 / 手動（座號或姓名搜尋放入、拖拉對調）
import { $, $$, esc, api, toast, burst, askConfirm } from './common.js';
import { sfx } from './sound.js';
import { t, ti, fmtDate, termParts } from './i18n.js';
import { mergeConfig, seatToCell } from './calc.js';
import { S, shuffle, isAbsent, onChange, emit, seatMap } from './tstate.js';

let rows = 6, cols = 6;
let cells = new Map();   // 'r,c' → 學號（編輯中的版本）
let saved = '';          // 已儲存版本的快照
let sel = null;          // 目前選取的座位 'r,c'

const key = (r, c) => `${r},${c}`;
const byId = () => new Map(S.roster.map((s) => [s.id, s]));
const snap = () => JSON.stringify({ rows, cols, cells: [...cells.entries()].sort() });
const dirty = () => snap() !== saved;
const keys = () => { const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(key(r, c)); return out; };
const cellOf = (id) => { for (const [k, v] of cells) if (v === id) return k; return null; };
const posLabel = (k) => { const [r, c] = k.split(',').map(Number); return t('chart.pos', { r: r + 1, c: c + 1 }); };

// 從伺服器狀態載入（沒有座位表時，以目前座號推算的位置為起點）
function load() {
  ({ rows, cols } = S.config.classroom);
  cells = new Map([...seatMap(seatToCell).entries()].map(([k, s]) => [k, s.id]));
  saved = snap();
  sel = null;
  $('#chart-q').value = '';
  render();
}

function render() {
  $('#chart-rows').value = rows; $('#chart-cols').value = cols;
  const students = byId();
  const room = $('#chart-room');
  room.style.gridTemplateColumns = `repeat(${cols}, auto)`;
  room.style.setProperty('--cols', cols);
  room.innerHTML = keys().map((k) => {
    const s = students.get(cells.get(k));
    const cls = ['seat', !s && 'empty', s && isAbsent(s.id) && 'absent', sel === k && 'sel'].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-k="${k}" title="${esc(s ? `${s.seat} ${s.name}（${s.id}）` : `${posLabel(k)}・${t('seat.empty')}`)}">
      <span class="no">${s ? esc(s.seat) : ''}</span><b>${s ? esc(s.name) : '—'}</b></button>`;
  }).join('');
  const placed = new Set(cells.values());
  const pool = S.roster.filter((s) => !placed.has(s.id));
  $('#chart-pool-n').textContent = pool.length;
  $('#chart-pool').innerHTML = pool.length
    ? pool.map((s) => `<button type="button" class="chip${isAbsent(s.id) ? ' absent' : ''}" data-id="${esc(s.id)}" title="${esc(s.id)}"><span class="no">${esc(s.seat)}</span> ${esc(s.name)}</button>`).join('')
    : `<span class="small muted">${esc(t('chart.poolEmpty'))}</span>`;
  $('#chart-sel-label').innerHTML = sel ? ti('fa-location-dot', 'chart.selected', { pos: posLabel(sel) }) : esc(t('chart.noSel'));
  const st = $('#chart-status');
  st.className = `small ${dirty() ? 'sum-bad' : 'muted'}`;
  st.textContent = dirty() ? t('chart.unsaved')
    : S.seating ? t('chart.savedAt', { time: fmtDate(S.seating.updated) }) : t('chart.auto');
  suggest();
}

// ---------- 放置 / 對調 ----------
function swap(a, b) {
  const va = cells.get(a), vb = cells.get(b);
  vb ? cells.set(a, vb) : cells.delete(a);
  va ? cells.set(b, va) : cells.delete(b);
}
// 把學生放到座位 k：原本已有座位就和 k 的人對調；k 原本的人回到「尚未安排」
function place(id, k) {
  const from = cellOf(id);
  if (from) swap(from, k); else cells.set(k, id);
}
function nextEmpty(after) {
  const all = keys();
  const i = after ? all.indexOf(after) : -1;
  return [...all.slice(i + 1), ...all.slice(0, i + 1)].find((k) => !cells.has(k)) || null;
}
function placeAndAdvance(id) {
  const k = sel || nextEmpty(null);
  if (!k) { sfx.bump(); toast(t('chart.full'), 'error'); return; }
  place(id, k);
  sfx.coin();
  const el = $(`#chart-room .seat[data-k="${k}"]`);
  if (el) { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 24); }
  sel = nextEmpty(k);
  $('#chart-q').value = '';
  render();
  $('#chart-q').focus();
}

// ---------- 搜尋（座號 / 學號 / 姓名） ----------
function matches(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const exact = S.roster.filter((s) => String(s.seat) === q || s.id.toLowerCase() === q);
  const part = S.roster.filter((s) => !exact.includes(s) && (s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)));
  return [...exact, ...part].slice(0, 8);
}
function suggest() {
  const list = matches($('#chart-q').value);
  $('#chart-suggest').innerHTML = list.map((s, i) => {
    const at = cellOf(s.id);
    return `<button type="button" role="option" class="${i === 0 ? 'first' : ''}" data-pick="${esc(s.id)}">
      <span class="no">${esc(s.seat)}</span> <b>${esc(s.name)}</b> <span class="muted">${esc(s.id)}</span>
      <span class="small ${at ? 'muted' : 'sum-ok'}">${esc(at ? posLabel(at) : t('chart.unplaced'))}</span></button>`;
  }).join('');
  $('#chart-suggest').classList.toggle('show', list.length > 0);
}
$('#chart-q').addEventListener('input', suggest);
$('#chart-q').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const first = matches(e.target.value)[0];
  if (first) placeAndAdvance(first.id);
  else if (e.target.value.trim()) { sfx.bump(); toast(t('chart.notFound'), 'error'); }
});
$('#chart-suggest').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pick]');
  if (b) placeAndAdvance(b.dataset.pick);
});

// ---------- 拖拉（滑鼠與觸控皆可；拖到座位 = 對調，拖到下方 = 移出座位） ----------
let drag = null; // { src, x, y, ghost, el }
function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const seat = el.closest('#chart-room .seat');
  if (seat) return { k: seat.dataset.k, el: seat };
  const pool = el.closest('#chart-pool');
  return pool ? { pool: true, el: pool } : null;
}
function onDown(e) {
  if (e.button !== 0) return;
  const seat = e.target.closest('#chart-room .seat');
  const chip = e.target.closest('#chart-pool .chip');
  if (!seat && !chip) return;
  drag = { src: seat ? { k: seat.dataset.k } : { id: chip.dataset.id }, x: e.clientX, y: e.clientY, el: seat || chip, ghost: null };
  if (seat && !cells.has(seat.dataset.k)) drag.noDrag = true; // 空位只能點選
}
function onMove(e) {
  if (!drag || drag.noDrag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.ghost = drag.el.cloneNode(true);
    drag.ghost.classList.add('drag-ghost');
    document.body.appendChild(drag.ghost);
    drag.el.classList.add('dragging');
  }
  e.preventDefault();
  drag.ghost.style.left = `${e.clientX}px`;
  drag.ghost.style.top = `${e.clientY}px`;
  $$('.drop-over').forEach((x) => x.classList.remove('drop-over'));
  dropTarget(e.clientX, e.clientY)?.el.classList.add('drop-over');
}
function onUp(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  $$('.drop-over').forEach((x) => x.classList.remove('drop-over'));
  if (!d.ghost) { // 單純點一下
    if (d.src.k) { sel = sel === d.src.k ? null : d.src.k; sfx.tick(); render(); $('#chart-q').focus({ preventScroll: true }); }
    else placeAndAdvance(d.src.id);
    return;
  }
  d.ghost.remove();
  d.el.classList.remove('dragging');
  const tgt = dropTarget(e.clientX, e.clientY);
  if (!tgt) return;
  if (tgt.pool) { if (d.src.k) { cells.delete(d.src.k); sfx.pipe(); } }
  else if (d.src.k) { if (d.src.k !== tgt.k) { swap(d.src.k, tgt.k); sfx.jump(); } }
  else { place(d.src.id, tgt.k); sfx.coin(); }
  render();
}
const area = $('#seat-chart-sec');
area.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove, { passive: false });
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', () => { if (drag?.ghost) { drag.ghost.remove(); drag.el.classList.remove('dragging'); } drag = null; });

// ---------- 自動排列 ----------
function fill(list) {
  cells = new Map();
  const all = keys();
  list.slice(0, all.length).forEach((s, i) => cells.set(all[i], s.id));
  const left = list.length - all.length;
  if (left > 0) toast(t('chart.overflow', { n: left }), 'error');
}
$('#chart-byseat').addEventListener('click', () => {
  cells = new Map();
  const room = { ...S.config.classroom, rows, cols };
  const rest = [];
  for (const s of S.roster) {
    const c = seatToCell(s.seat, room);
    if (c && !cells.has(key(c.r, c.c))) cells.set(key(c.r, c.c), s.id); else rest.push(s);
  }
  for (const s of rest) { const k = nextEmpty(null); if (!k) break; cells.set(k, s.id); }
  sel = null; sfx.coin(); render();
});
$('#chart-random').addEventListener('click', async () => {
  const skip = $('#chart-skip-absent').checked;
  const list = shuffle(S.roster.filter((s) => !skip || !isAbsent(s.id)));
  // 洗牌動畫：快速亂排幾次再定位
  for (let i = 0; i < 8; i++) { fill(shuffle(list)); render(); sfx.tick(); await new Promise((r) => setTimeout(r, 70)); }
  fill(list);
  sel = null; sfx.powerUp(); render();
  const rect = $('#chart-room').getBoundingClientRect();
  burst(rect.left + rect.width / 2, rect.top + 20, 50);
});
$('#chart-clear').addEventListener('click', async () => {
  if (cells.size && !await askConfirm(t('chart.confirmClear'))) return;
  cells = new Map(); sel = null; sfx.pipe(); render();
});
$('#chart-revert').addEventListener('click', () => { load(); sfx.tick(); });
$('#chart-apply').addEventListener('click', () => {
  const nr = Math.round(Number($('#chart-rows').value)), nc = Math.round(Number($('#chart-cols').value));
  if (!(nr >= 1 && nr <= 15 && nc >= 1 && nc <= 15)) { sfx.bump(); toast(t('chart.badSize'), 'error'); return; }
  rows = nr; cols = nc;
  let moved = 0;
  for (const k of [...cells.keys()]) {
    const [r, c] = k.split(',').map(Number);
    if (r >= rows || c >= cols) { cells.delete(k); moved++; }
  }
  if (sel && !keys().includes(sel)) sel = null;
  if (moved) toast(t('chart.outside', { n: moved }));
  sfx.coin(); render();
});
$('#chart-save').addEventListener('click', async () => {
  try {
    const r = await api('/api/teacher/seating', { method: 'PUT', body: { course: S.course.code, rows, cols, cells: Object.fromEntries(cells) } });
    S.config = mergeConfig(r.config);
    S.seating = r.seating;
    emit('config'); emit('seating');
    load();
    sfx.coin();
    toast(t('chart.saved'), 'ok');
  } catch (err) { sfx.bump(); toast(err.message, 'error'); }
});
$('#chart-print').addEventListener('click', () => {
  document.body.classList.add('print-chart');
  $('#chart-print-area').dataset.title = S.course.name;
  window.print();
  setTimeout(() => document.body.classList.remove('print-chart'), 300);
});

// 未儲存就換課程 / 離開頁面時提醒
document.addEventListener('change', (e) => {
  if (['course-sel', 'school-sel', 'div-sel', 'dept-sel', 'year-sel', 'sem-sel', 'class-sel'].includes(e.target.id) && dirty() && !confirm(t('chart.leaveUnsaved'))) {
    e.stopImmediatePropagation();
    e.target.value = { 'course-sel': S.course.code, 'school-sel': S.course.school || '', 'div-sel': S.course.division || '', 'dept-sel': S.course.department || '', 'year-sel': termParts(S.course.term).year, 'sem-sel': termParts(S.course.term).sem, 'class-sel': S.course.className || '' }[e.target.id];
  }
}, true);
window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

// ---------- 座位抽籤／座位表 切換（同一頁） ----------
// 座位抽籤用的是「已儲存」的座位表；切回抽籤時若還沒儲存，先問要不要存
function showSeatView(v) {
  $$('[data-seatview]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seatview === v)));
  $('#seat-draw-sec').hidden = v !== 'draw';
  $('#seat-chart-sec').hidden = v !== 'chart';
}
$$('[data-seatview]').forEach((b) => b.addEventListener('click', async () => {
  const v = b.dataset.seatview;
  if (v === 'draw' && dirty()) {
    if (await askConfirm(t('chart.saveBeforeDraw'), { danger: false })) {
      $('#chart-save').click();
      await new Promise((r) => { const w = () => (dirty() ? setTimeout(w, 100) : r()); setTimeout(w, 100); setTimeout(r, 4000); });
    }
  }
  showSeatView(v);
  sfx.tick();
}));

onChange((what) => {
  if (what === 'course') load();
  else if (what === 'roster') {
    // 退選 / 休退學的同學從座位表移除
    const ok = new Set(S.roster.map((s) => s.id));
    const wasClean = !dirty();
    for (const [k, id] of [...cells]) if (!ok.has(id)) cells.delete(k);
    if (wasClean) saved = snap();
    render();
  }
  else if (what === 'absent') render();
});
