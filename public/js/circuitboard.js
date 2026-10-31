// 課程套件（獨立的一頁，不是白板）：放電路符號、拉導線（直角、貼齊格線）、標註元件名稱與數值，
// 也有白板的畫筆（各種筆、螢光筆、橡皮擦、雷射筆、直線、箭頭、形狀）方便上課說明；
// 右側可以切換符號類別、音樂符號（可換成五線譜背景），或使用「數位邏輯計算」（卡諾圖、真值表、補數、BCD、格雷碼、進位制）
import { $, $$, esc, toast, askConfirm } from './common.js';
import { sfx } from './sound.js';
import { t } from './i18n.js';
import { SYMBOLS, CIRCUIT_GROUPS, symbolSvg } from './circuit.js';
import { BRUSH_W, BRUSHES, INK_TYPES, drawInk, inkBox, inkHit, inkMoved, createLaser } from './draw.js';
import { MUSIC, MUSIC_GROUPS, musicSvg } from './music.js';
import { VARS, truthTable, simplify, kmapLayout, kmapIndex, complement, decComplement, toBCD, fromBCD, toGray, fromGray, convertBase } from './logic.js';

const W = 1600, H = 1000, GRID = 20, KEY = 'ct-circuit-v1';
const INK = '#12232e', ACCENT = '#1b8fd6';
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
const panel = $('[data-panel="circuit"]');
const stage = $('#cb-stage'), cv = $('#cb-canvas'), ctx = cv.getContext('2d'), labelIn = $('#cb-label');

// ---------- 狀態 ----------
let objs = load(), tool = 'select', sel = null, drag = null, draft = null, scale = 1;
// 畫筆的顏色、粗細、形狀
const COLORS = ['#12232e', '#e5484d', '#1b8fd6', '#22a06b', '#e0a800', '#9b5de5'];
let color = COLORS[0], width = 5, shapeKind = 'rect', fillOn = false;
const isInk = (o) => INK_TYPES.includes(o.type);
const DRAW_TOOLS = [...BRUSHES, 'line', 'arrow', 'shape'];
// 背景：點格（畫電路）或五線譜（放音符）
let bgMode = 'grid';
try { if (localStorage.getItem('ct-cb-bg') === 'staff') bgMode = 'staff'; } catch { /* 無痕模式 */ }
const undo = [], redo = [];
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    // 壞掉的導線（座標不是數字）就丟掉
    return Array.isArray(d) ? d.filter((o) => o.type !== 'wire' || [o.x1, o.y1, o.x2, o.y2].every(Number.isFinite)) : [];
  } catch { return []; }
}
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(objs)); } catch { toast(t('wb.tooBig'), 'error'); } }, 300); }
function snapshot() { undo.push(objs.slice()); if (undo.length > 80) undo.shift(); redo.length = 0; }
function restore(from, to) { const s = from.pop(); if (!s) return; to.push(objs.slice()); objs = s; sel = null; save(); render(); sync(); }
const snap = (v, g = GRID) => Math.round(v / g) * g;
const replace = (o, patch) => { const n = { ...o, ...patch }; const i = objs.indexOf(o); if (i >= 0) objs[i] = n; return n; };

// ---------- 符號圖片快取（依顏色） ----------
const imgs = new Map();
function symImg(key) {
  let im = imgs.get(key);
  if (!im) { im = new Image(); im.onload = () => render(); im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(symbolSvg(key, INK))}`; imgs.set(key, im); }
  return im;
}
const picCache = new Map();
function picImg(src) { let im = picCache.get(src); if (!im) { im = new Image(); im.onload = () => render(); im.src = src; picCache.set(src, im); } return im; }

// ---------- 幾何 ----------
const symSize = (o) => { const s = SYMBOLS[o.key]; return { w: (s.w + 8) * (o.s || 1), h: (s.h + 8) * (o.s || 1) }; };
function bbox(o) {
  if (o.type === 'sym') { const { w, h } = symSize(o), r = (o.rot || 0) % 180; const bw = r ? h : w, bh = r ? w : h; return { x: o.x - bw / 2, y: o.y - bh / 2, w: bw, h: bh }; }
  if (o.type === 'wire') return { x: Math.min(o.x1, o.x2) - 4, y: Math.min(o.y1, o.y2) - 4, w: Math.abs(o.x2 - o.x1) + 8, h: Math.abs(o.y2 - o.y1) + 8 };
  if (isInk(o)) return inkBox(o);
  if (o.type === 'text') { ctx.font = `600 ${o.size}px ${FONT}`; return { x: o.x, y: o.y, w: Math.max(20, ctx.measureText(o.text).width), h: o.size * 1.2 }; }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}
// 導線：先水平再垂直（或反過來）
const wirePts = (o) => (o.vh ? [[o.x1, o.y1], [o.x1, o.y2], [o.x2, o.y2]] : [[o.x1, o.y1], [o.x2, o.y1], [o.x2, o.y2]]);
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy, k = l ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0;
  return Math.hypot(px - (x1 + k * dx), py - (y1 + k * dy));
}
function hit(o, x, y, pad = 10) {
  // 選取時點框框裡面也算；橡皮擦只擦到線條附近
  if (isInk(o)) return inkHit(o, x, y, pad, tool !== 'select');
  if (o.type === 'wire') { const p = wirePts(o); return distSeg(x, y, ...p[0], ...p[1]) < 8 || distSeg(x, y, ...p[1], ...p[2]) < 8; }
  const b = bbox(o);
  return x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6;
}
const topAt = (x, y) => [...objs].reverse().find((o) => hit(o, x, y));

// ---------- 畫 ----------
function resize() {
  const w = stage.clientWidth || 800, dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(((w * H) / W) * dpr); cv.style.height = `${(w * H) / W}px`;
  scale = cv.width / W;
  render();
}
const STAFF_TOP = 90, STAFF_STEP = 172;
function drawGrid(g) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  if (bgMode === 'staff') {
    // 五線譜：一格 18px，每組五線之間空 100px（跟白板一樣）
    g.strokeStyle = 'rgba(18,48,63,.55)'; g.lineWidth = 1.4;
    for (let top = STAFF_TOP; top + 72 < H - 40; top += STAFF_STEP) for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(60, top + k * 18); g.lineTo(W - 60, top + k * 18); g.stroke(); }
    return;
  }
  g.fillStyle = 'rgba(18, 48, 63, .18)';
  for (let x = GRID; x < W; x += GRID) for (let y = GRID; y < H; y += GRID) g.fillRect(x - 1, y - 1, 2, 2);
}
// 接點：三條以上導線端點（或端點落在另一條導線中間）就畫實心點
function junctions() {
  const count = new Map(), add = (x, y) => { const k = `${x},${y}`; count.set(k, (count.get(k) || 0) + 1); };
  const wires = objs.filter((o) => o.type === 'wire');
  wires.forEach((w) => { add(w.x1, w.y1); add(w.x2, w.y2); const c = wirePts(w)[1]; if (c[0] !== w.x1 || c[1] !== w.y1) { if (!((c[0] === w.x2) && (c[1] === w.y2))) add(...c); add(...c); } });
  const out = [];
  for (const [k, n] of count) {
    const [x, y] = k.split(',').map(Number);
    const onMid = wires.some((w) => { const p = wirePts(w); return [[p[0], p[1]], [p[1], p[2]]].some(([a, b]) => distSeg(x, y, ...a, ...b) < 0.5 && !(x === a[0] && y === a[1]) && !(x === b[0] && y === b[1])); });
    if (n >= 3 || (n >= 1 && onMid)) out.push([x, y]);
  }
  return out;
}
// 跳線：跟其他導線交叉（但沒有接在一起）的地方畫一個半圓跳過去
const HOP = 11;
function crossings(a, b, o) {
  const out = [];
  const horiz = a[1] === b[1];
  for (const w of objs) {
    if (w === o || w.type !== 'wire') continue;
    // 兩條跳線交叉：只讓後畫的那條跳，才不會兩條都彎
    if (w.hop && objs.indexOf(w) > objs.indexOf(o)) continue;
    const q = wirePts(w);
    for (const [c, d] of [[q[0], q[1]], [q[1], q[2]]]) {
      if (horiz && c[0] === d[0]) {
        const x = c[0], y = a[1];
        if (x > Math.min(a[0], b[0]) + HOP && x < Math.max(a[0], b[0]) - HOP && y > Math.min(c[1], d[1]) && y < Math.max(c[1], d[1])) out.push(x);
      } else if (!horiz && c[1] === d[1]) {
        const y = c[1], x = a[0];
        if (y > Math.min(a[1], b[1]) + HOP && y < Math.max(a[1], b[1]) - HOP && x > Math.min(c[0], d[0]) && x < Math.max(c[0], d[0])) out.push(y);
      }
    }
  }
  return [...new Set(out)];
}
function drawHops(g, o, p) {
  g.beginPath();
  g.moveTo(...p[0]);
  for (const [a, b] of [[p[0], p[1]], [p[1], p[2]]]) {
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const horiz = a[1] === b[1], dir = horiz ? Math.sign(b[0] - a[0]) : Math.sign(b[1] - a[1]);
    const cs = crossings(a, b, o).sort((m, n) => (m - n) * dir);
    for (const c of cs) {
      if (horiz) { g.lineTo(c - dir * HOP, a[1]); g.arc(c, a[1], HOP, dir > 0 ? Math.PI : 0, dir > 0 ? 0 : Math.PI, dir < 0); } else { g.lineTo(a[0], c - dir * HOP); g.arc(a[0], c, HOP, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : -Math.PI / 2, dir < 0); }
    }
    g.lineTo(...b);
  }
  g.stroke();
}
function drawObj(g, o) {
  g.save();
  if (o.type === 'wire') {
    g.strokeStyle = INK; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    const p = wirePts(o);
    if (o.hop) drawHops(g, o, p);
    else { g.beginPath(); g.moveTo(...p[0]); g.lineTo(...p[1]); g.lineTo(...p[2]); g.stroke(); }
  } else if (o.type === 'sym') {
    const im = symImg(o.key), { w, h } = symSize(o);
    g.translate(o.x, o.y); g.rotate(((o.rot || 0) * Math.PI) / 180);
    if (im.complete && im.naturalWidth) g.drawImage(im, -w / 2, -h / 2, w, h);
    g.setTransform(scale, 0, 0, scale, 0, 0);
    if (o.label) {
      const b = bbox(o);
      g.fillStyle = INK; g.font = `600 22px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
      // 橫放：標在上方；直放：標在右邊
      if ((o.rot || 0) % 180) { g.textAlign = 'left'; g.textBaseline = 'middle'; o.label.split('\n').forEach((l, i, a) => g.fillText(l, b.x + b.w + 6, o.y + (i - (a.length - 1) / 2) * 24)); } else o.label.split('\n').reverse().forEach((l, i) => g.fillText(l, o.x, b.y - 2 - i * 24));
    }
  } else if (o.type === 'text') {
    g.fillStyle = INK; g.font = `600 ${o.size}px ${FONT}`; g.textBaseline = 'top'; g.fillText(o.text, o.x, o.y);
  } else if (o.type === 'pic') {
    const im = picImg(o.src);
    if (im.complete && im.naturalWidth) g.drawImage(im, o.x, o.y, o.w, o.h);
  } else if (o.type === 'mu') {
    const im = picImg(musicSrc(o.key, o.c));
    if (im.complete && im.naturalWidth) g.drawImage(im, o.x, o.y, o.w, o.h);
  } else if (isInk(o)) drawInk(g, o, scale);
  g.restore();
}
function paint(g, withSel) {
  drawGrid(g);
  objs.forEach((o) => drawObj(g, o));
  if (draft) drawObj(g, draft);
  g.fillStyle = INK;
  junctions().forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill(); });
  if (withSel) laser.draw(g, scale);
  if (withSel && sel && objs.includes(sel)) {
    const b = bbox(sel);
    g.save(); g.setLineDash([8, 6]); g.strokeStyle = ACCENT; g.lineWidth = 2; g.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12); g.restore();
  }
}
function render() { ctx.setTransform(scale, 0, 0, scale, 0, 0); paint(ctx, true); }
const laser = createLaser(() => render());

// ---------- 指標 ----------
const toBoard = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
cv.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  commitLabel();
  cv.setPointerCapture(e.pointerId);
  const p = toBoard(e);
  if (tool === 'wire' || tool === 'jump') { const x = snap(p.x), y = snap(p.y); draft = { type: 'wire', x1: x, y1: y, x2: x, y2: y, hop: tool === 'jump' }; return; }
  if (tool === 'text') { openLabel({ x: snap(p.x, 10), y: snap(p.y, 10) }); return; }
  if (tool === 'eraser') { snapshot(); drag = { erase: true, any: false }; eraseAt(p); return; }
  if (tool === 'laser') { drag = { laser: true }; laser.add(p); return; }
  if (BRUSHES.includes(tool)) { draft = { type: 'stroke', pts: [p.x, p.y], c: color, w: width * BRUSH_W[tool], brush: tool }; render(); return; }
  if (tool === 'line' || tool === 'arrow') { draft = { type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, c: color, w: width }; return; }
  if (tool === 'shape') { draft = { type: 'shape', kind: shapeKind, fill: fillOn, x1: p.x, y1: p.y, x2: p.x, y2: p.y, c: color, w: width }; return; }
  const o = topAt(p.x, p.y);
  sel = o || null;
  if (o) { snapshot(); drag = { start: p, orig: o, moved: false }; }
  render(); sync();
});
cv.addEventListener('pointermove', (e) => {
  const p = toBoard(e);
  // 雷射筆：滑鼠移過去就有軌跡（觸控要按著畫）
  if (tool === 'laser') { if ((drag && drag.laser) || e.pointerType === 'mouse') laser.add(p); return; }
  if (drag && drag.erase) { eraseAt(p); return; }
  if (draft && draft.type === 'stroke') {
    // 合併 getCoalescedEvents，快速畫線也不會斷成折線
    const co = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of co.length ? co : [e]) { const q = toBoard(ev); draft.pts.push(Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10); }
    render(); return;
  }
  if (draft && draft.type !== 'wire') {
    let { x, y } = p;
    // 按住 Shift：直線鎖 45 度、形狀變成正的
    if (e.shiftKey) {
      const dx = x - draft.x1, dy = y - draft.y1;
      if (draft.type !== 'shape') { const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), r = Math.hypot(dx, dy); x = draft.x1 + r * Math.cos(a); y = draft.y1 + r * Math.sin(a); } else { const m = Math.max(Math.abs(dx), Math.abs(dy)); x = draft.x1 + Math.sign(dx || 1) * m; y = draft.y1 + Math.sign(dy || 1) * m; }
    }
    draft.x2 = x; draft.y2 = y;
    render(); return;
  }
  if (draft) {
    draft.x2 = snap(p.x); draft.y2 = snap(p.y);
    // 起點那段比較長的方向先走
    draft.vh = Math.abs(draft.y2 - draft.y1) > Math.abs(draft.x2 - draft.x1);
    render(); return;
  }
  if (!drag) { cv.style.cursor = tool === 'select' ? (topAt(p.x, p.y) ? 'move' : 'default') : 'crosshair'; return; }
  if (drag.laser) return;
  const dx = p.x - drag.start.x, dy = p.y - drag.start.y, o = drag.orig;
  if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
  let patch;
  if (isInk(o)) patch = inkMoved(o, dx, dy);
  else if (o.type === 'wire') { const sx = snap(dx), sy = snap(dy); patch = { x1: o.x1 + sx, y1: o.y1 + sy, x2: o.x2 + sx, y2: o.y2 + sy }; } else if (o.type === 'sym') patch = { x: snap(o.x + dx), y: snap(o.y + dy) };
  else patch = { x: snap(o.x + dx, 10), y: snap(o.y + dy, 10) };
  sel = replace(sel, patch);
  render();
});
function up() {
  if (drag && drag.laser) { drag = null; return; }
  if (drag && drag.erase) { if (!drag.any) undo.pop(); drag = null; save(); sync(); return; }
  if (draft && draft.type === 'stroke') { const d = draft; draft = null; snapshot(); objs.push(d); save(); render(); sync(); return; }
  if (draft && draft.type !== 'wire') {
    const d = draft; draft = null;
    if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) >= 4) { snapshot(); objs.push(d); save(); }
    render(); sync(); return;
  }
  if (draft) {
    const d = draft; draft = null;
    if ([d.x1, d.y1, d.x2, d.y2].every(Number.isFinite) && (d.x1 !== d.x2 || d.y1 !== d.y2)) { snapshot(); objs.push(d); save(); sfx.tick(); }
    render(); sync(); return;
  }
  if (drag) { if (!drag.moved) undo.pop(); drag = null; save(); sync(); }
}
function eraseAt(p) {
  const before = objs.length;
  objs = objs.filter((o) => !hit(o, p.x, p.y, 14));
  if (objs.length !== before) { drag.any = true; if (sel && !objs.includes(sel)) sel = null; render(); }
}
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('dblclick', (e) => {
  const p = toBoard(e), o = topAt(p.x, p.y);
  if (o && (o.type === 'sym' || o.type === 'text')) { sel = o; openLabel(o.type === 'text' ? { x: o.x, y: o.y } : null, o); }
});

// ---------- 標籤（元件名稱與數值）、文字 ----------
let editing = null;
function openLabel(p, o = null) {
  editing = { p, o };
  const r = cv.getBoundingClientRect(), k = r.width / W;
  const b = o ? bbox(o) : null;
  const x = o && o.type === 'sym' ? b.x + b.w / 2 - 80 : p.x, y = o && o.type === 'sym' ? b.y - 44 : p.y;
  Object.assign(labelIn.style, { left: `${Math.max(0, x * k)}px`, top: `${Math.max(0, y * k)}px` });
  labelIn.value = o ? (o.type === 'sym' ? o.label || '' : o.text) : '';
  labelIn.placeholder = o && o.type === 'sym' ? t('cb.labelPh') : t('cb.textPh');
  labelIn.hidden = false;
  setTimeout(() => labelIn.focus(), 0);
}
function commitLabel() {
  if (!editing) return;
  const { p, o } = editing; editing = null;
  const v = labelIn.value.trim();
  labelIn.hidden = true;
  if (o && o.type === 'sym') { if (v !== (o.label || '')) { snapshot(); sel = replace(o, { label: v }); } } else if (o) { snapshot(); if (v) sel = replace(o, { text: v }); else { objs = objs.filter((x) => x !== o); sel = null; } } else if (v) { snapshot(); objs.push({ type: 'text', x: p.x, y: p.y, text: v, size: 26 }); }
  save(); render(); sync();
}
labelIn.addEventListener('blur', commitLabel);
labelIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); labelIn.blur(); } if (e.key === 'Escape') { labelIn.value = editing && editing.o ? (editing.o.label || editing.o.text || '') : ''; labelIn.blur(); } });

// ---------- 工具列 ----------
function setTool(n) { tool = n; if (n !== 'select') sel = null; sync(); render(); }
function sync() {
  $$('[data-cbtool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cbtool === tool)));
  $('#cb-shape-btn').setAttribute('aria-pressed', String(tool === 'shape'));
  $('#cb-fill').setAttribute('aria-pressed', String(fillOn));
  $$('[data-cbcolor]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cbcolor === color)));
  $('#cb-width').value = width; $('#cb-width-n').textContent = width;
  const dot = $('#cb-width-dot');
  dot.style.width = dot.style.height = `${Math.max(3, Math.min(30, width * (BRUSH_W[tool] || 1) * 0.8))}px`;
  dot.style.background = color;
  cv.dataset.tool = tool;
  $('#cb-staff').setAttribute('aria-pressed', String(bgMode === 'staff'));
  $('#cb-staff').innerHTML = `<i class="fa-solid ${bgMode === 'staff' ? 'fa-xmark' : 'fa-bars'}" aria-hidden="true"></i> <span>${esc(t(bgMode === 'staff' ? 'mu.staffOff' : 'mu.staffBg'))}</span>`;
  $('#cb-undo').disabled = !undo.length; $('#cb-redo').disabled = !redo.length;
  $('#cb-del').disabled = !sel; $('#cb-rot').disabled = !(sel && sel.type === 'sym');
}
$$('[data-cbtool]').forEach((b) => b.addEventListener('click', () => { commitLabel(); setTool(b.dataset.cbtool); }));
// 形狀選單、填滿、顏色、粗細
const shapeMenu = $('#cb-shapes');
$('#cb-shape-btn').addEventListener('click', (e) => { e.stopPropagation(); shapeMenu.hidden = !shapeMenu.hidden; if (tool !== 'shape') setTool('shape'); });
$$('[data-cbshape]').forEach((b) => b.addEventListener('click', () => {
  shapeKind = b.dataset.cbshape; shapeMenu.hidden = true;
  $('#cb-shape-btn').innerHTML = b.innerHTML;
  setTool('shape');
}));
document.addEventListener('click', (e) => { if (!e.target.closest('#cb-shape-btn, #cb-shapes')) shapeMenu.hidden = true; });
$('#cb-fill').addEventListener('click', () => { fillOn = !fillOn; if (sel && sel.type === 'shape') { snapshot(); sel = replace(sel, { fill: fillOn }); save(); render(); } sync(); });
$('#cb-colors').innerHTML = COLORS.map((c) => `<button type="button" class="wb-swatch" data-cbcolor="${c}" style="--c:${c}" aria-label="${c}" title="${c}"></button>`).join('');
function useColor(c) {
  color = c;
  // 選取中的筆畫、音符跟著換顏色
  if (sel && (isInk(sel) || sel.type === 'mu')) { snapshot(); sel = replace(sel, { c }); save(); render(); }
  sync();
}
$('#cb-colors').addEventListener('click', (e) => { const b = e.target.closest('[data-cbcolor]'); if (b) useColor(b.dataset.cbcolor); });
$('#cb-color-in').addEventListener('input', (e) => useColor(e.target.value));
$('#cb-width').addEventListener('input', (e) => { width = Number(e.target.value); sync(); });
$('#cb-undo').addEventListener('click', () => restore(undo, redo));
$('#cb-redo').addEventListener('click', () => restore(redo, undo));
function del() { if (!sel) return; snapshot(); objs = objs.filter((o) => o !== sel); sel = null; save(); render(); sync(); }
function rot() { if (!sel || sel.type !== 'sym') return; snapshot(); sel = replace(sel, { rot: ((sel.rot || 0) + 90) % 360 }); save(); render(); sfx.tick(); }
$('#cb-del').addEventListener('click', del);
$('#cb-rot').addEventListener('click', rot);
$('#cb-clear').addEventListener('click', async () => { if (!objs.length || !await askConfirm(t('cb.clearConfirm'))) return; snapshot(); objs = []; sel = null; save(); render(); sync(); });
$('#cb-png').addEventListener('click', () => {
  // 輸出不含選取框
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  paint(c.getContext('2d'), false);
  c.toBlob((b) => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: 'circuit.png' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
});
$('#cb-full').addEventListener('click', () => { const el = $('.cb'); if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.().catch(() => {}); });
document.addEventListener('fullscreenchange', () => setTimeout(resize, 50));
document.addEventListener('keydown', (e) => {
  if (panel.hidden || e.target.closest('input, textarea, select')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); del(); }
  if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && sel) { e.preventDefault(); rot(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); restore(e.shiftKey ? redo : undo, e.shiftKey ? undo : redo); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); restore(redo, undo); }
});

// ---------- 放東西進來 ----------
let drop = 0;
function addSym(key) {
  snapshot();
  const off = (drop++ % 6) * 40;
  // 放大 4/3 倍：120 寬的元件兩端接腳剛好落在格點上（中心 ± 80）
  const o = { type: 'sym', key, x: snap(W / 2 + off - 100), y: snap(H / 2 + off - 100), rot: 0, label: '', s: 4 / 3 };
  objs.push(o); sel = o; tool = 'select';
  save(); render(); sync(); sfx.coin();
}
function addPic(canvas) {
  snapshot();
  const k = Math.min(1, 700 / canvas.width, 500 / canvas.height), w = canvas.width * k, h = canvas.height * k;
  const o = { type: 'pic', src: canvas.toDataURL('image/png'), x: snap(W - w - 60, 10), y: snap(60 + (drop++ % 5) * 30, 10), w, h };
  objs.push(o); sel = o; tool = 'select';
  save(); render(); sync(); sfx.coin();
  toast(t('cb.placed'), 'ok');
}

// ---------- 右側：類別下拉選單 ----------
const catSel = $('#cb-cat');
catSel.innerHTML = CIRCUIT_GROUPS.map(([g]) => `<option value="${g}">${esc(t(`cs.g.${g}`))}</option>`).join('') + `<option value="music">${esc(t('mu.side'))}</option><option value="digital">${esc(t('cb.digital'))}</option>`;
function showCat() {
  const g = catSel.value, group = CIRCUIT_GROUPS.find(([k]) => k === g);
  $('#cb-syms').hidden = !group;
  $('#cb-music').hidden = g !== 'music';
  $('#cb-digital').hidden = g !== 'digital';
  if (group) $('#cb-syms').innerHTML = group[1].map((k) => `<button type="button" class="wb-sym" data-sym="${k}" title="${esc(t(`cs.${k}`))}"><span>${symbolSvg(k, 'currentColor', 4)}</span><small>${esc(t(`cs.${k}`))}</small></button>`).join('');
  try { localStorage.setItem('ct-cb-cat', g); } catch { /* 無痕模式 */ }
}
catSel.addEventListener('change', showCat);
$('#cb-syms').addEventListener('click', (e) => { const b = e.target.closest('[data-sym]'); if (b) addSym(b.dataset.sym); });

// ---------- 右側：音樂符號（音符、休止符、譜號、記號） ----------
const musicSrc = (k, c) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(musicSvg(k, c))}`;
$('#cb-music-list').innerHTML = MUSIC_GROUPS.map(([g, keys]) => `<h4>${esc(t(`mu.g.${g}`))}</h4><div class="wb-syms wb-music">${keys.map((k) => `<button type="button" class="wb-sym" data-mu="${k}" title="${esc(t(`mu.${k}`))}"><span>${musicSvg(k)}</span><small>${esc(t(`mu.${k}`))}</small></button>`).join('')}</div>`).join('');
// 音樂符號由左往右排在五線譜上（接在上一個符號後面；排滿就換下一行譜）
const NOTE_KEYS = ['half', 'quarter', 'eighth', 'sixteenth', 'dotted', 'beamed', 'beamed16'];
function musicPos(m, k) {
  const last = [...objs].reverse().find((o) => o.type === 'mu');
  let x = 80, top = STAFF_TOP;
  if (last) {
    top = STAFF_TOP + Math.max(0, Math.round((last.y + last.h / 2 - STAFF_TOP - 36) / STAFF_STEP)) * STAFF_STEP;
    x = last.x + last.w + 14;
    if (x + m.w > W - 60) { x = 80; top += STAFF_STEP; }
    if (top + 72 > H - 40) top = STAFF_TOP;
  }
  // 音符的符頭對在第三線；其他符號置中在譜上
  const y = NOTE_KEYS.includes(k) ? top + 36 - 62 : top + 36 - m.h / 2;
  return { x, y };
}
$('#cb-music-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mu]');
  if (!b) return;
  const k = b.dataset.mu, m = MUSIC[k];
  // 第一次放音符時自動換成五線譜背景
  if (bgMode !== 'staff') setBgMode('staff');
  snapshot();
  const o = { type: 'mu', key: k, c: color, w: m.w, h: m.h, ...musicPos(m, k) };
  objs.push(o); sel = o; tool = 'select';
  save(); render(); sync(); sfx.coin();
});
function setBgMode(m) {
  bgMode = m;
  try { localStorage.setItem('ct-cb-bg', m); } catch { /* 無痕模式 */ }
  render(); sync();
}
$('#cb-staff').addEventListener('click', () => { setBgMode(bgMode === 'staff' ? 'grid' : 'staff'); sfx.tick(); });

// ---------- 數位邏輯計算 ----------
const dlSel = $('#dl-tool');
function showTool() { $$('.dl-pane').forEach((p) => { p.hidden = p.id !== `dl-${dlSel.value}`; }); runTool(); }
dlSel.addEventListener('change', showTool);
// 文字結果畫成圖片（放到電路圖用）
function textCanvas(title, lines) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 26, pad = 20;
  g.font = `600 ${fs}px ui-monospace, Consolas, monospace`;
  const w = Math.max(g.measureText(title).width, ...lines.map((l) => g.measureText(l).width)) + pad * 2;
  c.width = Math.ceil(w); c.height = pad * 2 + (lines.length + 1) * fs * 1.45;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#cfe0e6'; g.lineWidth = 2; g.strokeRect(1, 1, c.width - 2, c.height - 2);
  g.fillStyle = ACCENT; g.font = `700 ${fs}px ${FONT}`; g.textBaseline = 'top'; g.fillText(title, pad, pad);
  g.fillStyle = INK; g.font = `600 ${fs}px ui-monospace, Consolas, monospace`;
  lines.forEach((l, i) => g.fillText(l, pad, pad + (i + 1) * fs * 1.45));
  return c;
}
// 表格畫成圖片（真值表）
function tableCanvas(head, rows, hi = () => false) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), cw = 56, rh = 38, pad = 2;
  c.width = head.length * cw + pad * 2; c.height = (rows.length + 1) * rh + pad * 2;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.font = `700 22px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  head.forEach((h, i) => { g.fillStyle = '#e8f4f8'; g.fillRect(pad + i * cw, pad, cw, rh); g.fillStyle = INK; g.fillText(h, pad + i * cw + cw / 2, pad + rh / 2); });
  rows.forEach((r, j) => r.forEach((v, i) => {
    if (hi(j, i)) { g.fillStyle = 'rgba(63,177,248,.18)'; g.fillRect(pad + i * cw, pad + (j + 1) * rh, cw, rh); }
    g.fillStyle = i === r.length - 1 ? ACCENT : INK; g.font = `${i === r.length - 1 ? 700 : 500} 22px ${FONT}`;
    g.fillText(String(v), pad + i * cw + cw / 2, pad + (j + 1) * rh + rh / 2);
  }));
  g.strokeStyle = '#cfe0e6'; g.lineWidth = 1;
  for (let i = 0; i <= head.length; i++) { g.beginPath(); g.moveTo(pad + i * cw, pad); g.lineTo(pad + i * cw, c.height - pad); g.stroke(); }
  for (let j = 0; j <= rows.length + 1; j++) { g.beginPath(); g.moveTo(pad, pad + j * rh); g.lineTo(c.width - pad, pad + j * rh); g.stroke(); }
  return c;
}

// 卡諾圖：點格子切換 0 → 1 → X
let kmN = 3, km = [];
const GCOL = ['#e5484d', '#1b8fd6', '#22a06b', '#e0a800', '#9b5de5', '#f08c3a', '#27aecb', '#f06595'];
const grayLabel = (v, bits) => v.toString(2).padStart(bits, '0');
function kmReset(n) { kmN = n; km = Array(1 << n).fill(0); kmRender(); }
function kmRender() {
  const L = kmapLayout(kmN), vars = VARS.slice(0, kmN), rv = vars.slice(0, L.rowBits).join(''), cvv = vars.slice(L.rowBits).join('');
  let h = `<table class="dl-km"><tr><th class="corner">${rv}\\${cvv}</th>${L.cols.map((c) => `<th>${grayLabel(c, L.colBits)}</th>`).join('')}</tr>`;
  L.rows.forEach((r, ri) => {
    h += `<tr><th>${grayLabel(r, L.rowBits)}</th>`;
    L.cols.forEach((_, ci) => { const m = kmapIndex(kmN, ri, ci), v = km[m]; h += `<td><button type="button" data-m="${m}" class="v${v}">${v === 2 ? 'X' : v}<small>${m}</small></button></td>`; });
    h += '</tr>';
  });
  $('#dl-km-grid').innerHTML = `${h}</table>`;
  const ones = km.map((v, m) => (v === 1 ? m : -1)).filter((m) => m >= 0), dcs = km.map((v, m) => (v === 2 ? m : -1)).filter((m) => m >= 0);
  $('#dl-km-m').value = ones.join(',');
  $('#dl-km-d').value = dcs.join(',');
  const r = simplify(kmN, ones, dcs);
  $('#dl-km-out').innerHTML = `F(${vars.join(',')}) = Σm(${ones.join(',') || '—'})${dcs.length ? ` + d(${dcs.join(',')})` : ''}<br><b>F = ${esc(r.sop)}</b>`;
  return r;
}
$('#dl-km-n').addEventListener('change', (e) => kmReset(Number(e.target.value)));
$('#dl-km-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; const m = Number(b.dataset.m); km[m] = (km[m] + 1) % 3; kmRender(); sfx.tick(); });
const parseList = (s) => String(s).split(/[,，\s]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n));
['#dl-km-m', '#dl-km-d'].forEach((id) => $(id).addEventListener('change', () => {
  const full = (1 << kmN) - 1;
  km = Array(1 << kmN).fill(0);
  parseList($('#dl-km-m').value).forEach((m) => { if (m >= 0 && m <= full) km[m] = 1; });
  parseList($('#dl-km-d').value).forEach((m) => { if (m >= 0 && m <= full && !km[m]) km[m] = 2; });
  kmRender();
}));
$('#dl-km-clear').addEventListener('click', () => kmReset(kmN));
function kmCanvas() {
  const r = kmRender(), L = kmapLayout(kmN), vars = VARS.slice(0, kmN), cs = 70, head = 60, pad = 16;
  const nr = L.rows.length, nc = L.cols.length, c = document.createElement('canvas'), g = c.getContext('2d');
  c.width = head + nc * cs + pad * 2; c.height = head + nr * cs + pad * 2 + 60;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  const X = pad + head, Y = pad + head;
  g.font = `700 20px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
  g.fillText(`${vars.slice(0, L.rowBits).join('')}\\${vars.slice(L.rowBits).join('')}`, pad + head / 2, pad + head / 2);
  L.cols.forEach((cc, i) => g.fillText(grayLabel(cc, L.colBits), X + i * cs + cs / 2, pad + head / 2 + 8));
  L.rows.forEach((rr, j) => g.fillText(grayLabel(rr, L.rowBits), pad + head / 2 + 8, Y + j * cs + cs / 2));
  // 每個化簡出來的群組，在它涵蓋的格子畫一圈不同顏色的框
  r.groups.forEach((ms, gi) => {
    g.strokeStyle = GCOL[gi % GCOL.length]; g.lineWidth = 4;
    L.rows.forEach((_, j) => L.cols.forEach((__, i) => { if (ms.includes(kmapIndex(kmN, j, i))) { const ins = 6 + gi * 5; g.strokeRect(X + i * cs + ins, Y + j * cs + ins, cs - ins * 2, cs - ins * 2); } }));
  });
  g.strokeStyle = INK; g.lineWidth = 2;
  for (let i = 0; i <= nc; i++) { g.beginPath(); g.moveTo(X + i * cs, Y); g.lineTo(X + i * cs, Y + nr * cs); g.stroke(); }
  for (let j = 0; j <= nr; j++) { g.beginPath(); g.moveTo(X, Y + j * cs); g.lineTo(X + nc * cs, Y + j * cs); g.stroke(); }
  g.font = `700 28px ${FONT}`;
  L.rows.forEach((_, j) => L.cols.forEach((__, i) => { const v = km[kmapIndex(kmN, j, i)]; g.fillStyle = v === 1 ? INK : '#9fb3bd'; g.fillText(v === 2 ? 'X' : String(v), X + i * cs + cs / 2, Y + j * cs + cs / 2); }));
  g.textAlign = 'left'; g.fillStyle = ACCENT; g.font = `700 26px ${FONT}`;
  g.fillText(`F = ${r.sop}`, pad, Y + nr * cs + 34);
  return c;
}

function truthRun() {
  const out = $('#dl-tt-out');
  try {
    const tt = truthTable($('#dl-tt-in').value);
    const r = simplify(tt.vars.length, tt.minterms);
    out.innerHTML = `<div class="dl-scroll"><table class="dl-tt"><tr>${tt.vars.map((v) => `<th>${v}</th>`).join('')}<th>F</th></tr>${tt.rows.map((row) => `<tr class="${row.out ? 'on' : ''}">${row.bits.map((b) => `<td>${b}</td>`).join('')}<td>${row.out}</td></tr>`).join('')}</table></div>
      <p>Σm(${tt.minterms.join(',') || '—'})<br><b>${esc(t('cb.simplest'))}：F = ${esc(r.sop)}</b></p>`;
    return { tt, r };
  } catch (e) { out.innerHTML = `<p class="dl-err">${esc(t('cb.exprErr'))}</p>`; return null; }
}
$('#dl-tt-in').addEventListener('input', truthRun);

// 補數、BCD、格雷碼、進位制：結果都是幾行文字
const SIMPLE = {
  comp: () => {
    const lines = [];
    const b = $('#dl-c-bin').value.trim(), bits = $('#dl-c-bits').value, d = $('#dl-c-dec').value.trim();
    if (b) { const r = complement(b, bits); lines.push(`${t('cb.c.orig')}  ${r.x}`, `${t('cb.c.one')}  ${r.one}`, `${t('cb.c.two')}  ${r.two}`, `${t('cb.c.signed')}  ${r.signed}`); }
    if (d) { const r = decComplement(d); lines.push(`${t('cb.c.nine')}  ${r.nine}`, `${t('cb.c.ten')}  ${r.ten}`); }
    return lines;
  },
  bcd: () => {
    const lines = [], d = $('#dl-b-dec').value.trim(), b = $('#dl-b-bcd').value.trim();
    if (d) lines.push(`${d} → BCD  ${toBCD(d)}`);
    if (b) lines.push(`BCD ${b} → ${fromBCD(b)}`);
    return lines;
  },
  gray: () => {
    const lines = [], b = $('#dl-g-bin').value.trim(), g = $('#dl-g-gray').value.trim();
    if (b) lines.push(`${t('cb.g.bin')} ${b} → ${t('cb.g.gray')} ${toGray(b)}`);
    if (g) lines.push(`${t('cb.g.gray')} ${g} → ${t('cb.g.bin')} ${fromGray(g)}`);
    return lines;
  },
  base: () => {
    const v = $('#dl-n-val').value.trim();
    if (!v) return [];
    const r = convertBase(v, Number($('#dl-n-base').value));
    return [`BIN  ${r.bin}`, `OCT  ${r.oct}`, `DEC  ${r.dec}`, `HEX  ${r.hex}`];
  },
};
function simpleRun(k) {
  const out = $(`#dl-${k}-out`);
  try { const lines = SIMPLE[k](); out.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join(''); return lines; } catch (e) { out.innerHTML = `<p class="dl-err">${esc(t('cb.inputErr'))}</p>`; return null; }
}
Object.keys(SIMPLE).forEach((k) => $$(`#dl-${k} input, #dl-${k} select`).forEach((el) => el.addEventListener('input', () => simpleRun(k))));
function runTool() { const k = dlSel.value; if (k === 'km') kmRender(); else if (k === 'tt') truthRun(); else simpleRun(k); }
$('#dl-put').addEventListener('click', () => {
  const k = dlSel.value;
  if (k === 'km') { addPic(kmCanvas()); return; }
  if (k === 'tt') {
    const res = truthRun(); if (!res) { sfx.bump(); return; }
    const { tt, r } = res;
    const tbl = tableCanvas([...tt.vars, 'F'], tt.rows.map((row) => [...row.bits, row.out]));
    // 表格下面加上化簡結果
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = Math.max(tbl.width, 420); c.height = tbl.height + 56;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(tbl, 0, 0);
    g.fillStyle = ACCENT; g.font = `700 24px ${FONT}`; g.textBaseline = 'middle'; g.fillText(`F = ${r.sop}`, 8, tbl.height + 28);
    addPic(c); return;
  }
  const lines = simpleRun(k);
  if (!lines || !lines.length) { sfx.bump(); return; }
  addPic(textCanvas(t(`cb.t.${k}`), lines));
});

// ---------- 啟動 ----------
new ResizeObserver(() => { if (!panel.hidden) resize(); }).observe(stage);
try { const c = localStorage.getItem('ct-cb-cat'); if (c && [...catSel.options].some((o) => o.value === c)) catSel.value = c; } catch { /* 無痕模式 */ }
showCat();
kmReset(3);
showTool();
sync();
