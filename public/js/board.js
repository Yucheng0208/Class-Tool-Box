// 白板：畫筆、螢光筆、橡皮擦、直線、箭頭、方框、圓形、文字、圖片、公式（LaTeX）；
// 旁邊有計算機、函數圖形、亂數出題，結果都可以放到白板上。
// 白板內容（含多頁）存在這台電腦的瀏覽器
import { $, $$, esc, toast, askConfirm } from './common.js';
import { sfx } from './sound.js';
import { t } from './i18n.js';
import { compile, evaluate, fmt, toFraction } from './mathx.js';
import { makeQuiz, plain } from './quiz.js';
import { musicSvg } from './music.js';
import { readInk, toExpr, handwrite, canWrite, numbersIn } from './ink.js';
import { drawTable, drawSurface, pretty } from './plots.js';
import { BRUSH_W, BRUSHES, drawStroke as drawStrokeOn, shapePath as shapePathOn, createLaser } from './draw.js';
import { hasMatrix, matrixCalc, mxText, mxTex } from './matrix.js';

const W = 1600, H = 1000; // 白板的邏輯尺寸（16:10），畫面上依寬度縮放
const KEY = 'ct-board-v1';
const COLORS = ['#12232e', '#e5484d', '#1b8fd6', '#22a06b', '#e0a800', '#9b5de5', '#ffffff'];
const COLOR_KEY = 'ct-board-colors'; // 老師自己釘選的顏色
const BOARDS = { white: '#ffffff', black: '#1f2428', green: '#234d3a' };
// 舊資料的背景是字串（white／grid／lines／chalk），轉成 { c: 顏色, p: 線條 }
function normBg(b) {
  if (b && typeof b === 'object' && /^#[0-9a-f]{6}$/i.test(b.c)) {
    const pat = PATTERNS.includes(b.p) ? b.p : 'none';
    const img = typeof b.img === 'string' && b.img.startsWith('data:image/') ? b.img : '';
    return { c: b.c, p: b.date && pat === 'none' ? 'tw' : pat, duty: String(b.duty || '').slice(0, 12), img, imgDark: !!b.imgDark };
  }
  return { c: b === 'chalk' ? BOARDS.green : BOARDS.white, p: b === 'grid' ? 'grid' : b === 'lines' ? 'lines' : 'none' };
}
const PATTERNS = ['none', 'tw', 'lines', 'vlines', 'grid', 'staff', 'nine', 'four', 'box']; // tw：台灣限定（空白＋右邊直式日期欄）
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';

const panel = $('[data-panel="board"]');
const stage = $('#wb-stage'), cv = $('#wb-canvas'), ctx = cv.getContext('2d'), txt = $('#wb-text');

// ---------- 狀態 ----------
let state = load();
let tool = 'pen', color = COLORS[0], width = 6;
// 文字與公式的大小、字型（工具列的「文字」那一組）
let textSize = 42, fontKey = 'sans';
const fontPx = () => textSize;
const FONTS = {
  sans: FONT_FAMILY,
  serif: '"Noto Serif TC", "PMingLiU", "MingLiU", "Songti TC", "Times New Roman", serif',
  kai: '"DFKai-SB", "BiauKai", "Kaiti TC", "STKaiti", "KaiTi", serif',
  round: '"jf-openhuninn", "Yuanti TC", "Arial Rounded MT Bold", "Microsoft JhengHei", sans-serif',
  hand: '"Segoe Print", "Comic Sans MS", "Bradley Hand", "Chalkboard SE", cursive',
  mono: 'ui-monospace, Consolas, "Courier New", monospace',
};
const fontOf = (o) => `${o.size}px ${FONTS[o.font] || FONT_FAMILY}`;
// 形狀工具目前選的形狀、要不要填滿
let shapeKind = 'rect', fillOn = false;
// 各種筆的實際線寬
let sel = null;              // 選取中的物件
let draft = null;            // 畫到一半的筆畫／圖形
let drag = null;             // 移動或縮放中的狀態
const undo = [], redo = [];
const page = () => state.pages[state.cur];
const dark = () => (page().bg.img ? page().bg.imgDark : lum(page().bg.c) < 0.45);

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && Array.isArray(d.pages) && d.pages.length) return { pages: d.pages.map((pg) => ({ objs: pg.objs || [], bg: normBg(pg.bg) })), cur: Math.min(d.cur || 0, d.pages.length - 1) };
  } catch { /* 沒存過或壞掉 */ }
  return { pages: [{ bg: normBg('white'), objs: [] }], cur: 0 };
}
let saveTimer = 0, warned = false;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {
      // 圖片太多會超過瀏覽器的儲存空間；白板照常可以用，只是重新整理後不會保留
      if (!warned) { warned = true; toast(t('wb.tooBig'), 'error'); }
    }
  }, 400);
}
// 每次改動前呼叫：記住目前這頁，給「復原」用
function snapshot() {
  undo.push({ cur: state.cur, objs: page().objs.slice(), bg: page().bg });
  if (undo.length > 80) undo.shift();
  redo.length = 0;
}
function restore(from, to) {
  const s = from.pop();
  if (!s) return;
  if (s.cur !== state.cur) { state.cur = Math.min(s.cur, state.pages.length - 1); }
  to.push({ cur: state.cur, objs: page().objs.slice(), bg: page().bg });
  page().objs = s.objs; page().bg = s.bg;
  sel = null;
  save(); render(); syncBar();
}

// ---------- 座標 ----------
let scale = 1;
function resize() {
  const w = stage.clientWidth || 800;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round((w * H / W) * dpr);
  cv.style.height = `${(w * H) / W}px`;
  scale = cv.width / W;
  render();
}
const toBoard = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };

// ---------- 圖片快取（公式、函數圖形也是圖片） ----------
const imgs = new Map();
function imgOf(src) {
  let im = imgs.get(src);
  if (!im) { im = new Image(); im.onload = () => render(); im.src = src; imgs.set(src, im); }
  return im;
}

// ---------- 畫 ----------
// 台灣黑板右邊的直式日期欄：中華民國 ○○○ 年 ○○ 月 ○○ 日（○） 值日生 ○○○（日期自動抓今天）
function drawDateColumn(bg) {
  const d = new Date(), roc = d.getFullYear() - 1911;
  const tokens = ['中', '華', '民', '國', String(roc), '年', String(d.getMonth() + 1), '月', String(d.getDate()), '日', '︵', '日一二三四五六'[d.getDay()], '︶'];
  const duty = [...(bg.duty || '')];
  const x = W - 62, fs = 38, step = 46;
  ctx.save();
  ctx.fillStyle = dark() ? 'rgba(255,255,255,.92)' : '#12232e';
  ctx.strokeStyle = dark() ? 'rgba(255,255,255,.35)' : 'rgba(18,48,63,.25)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W - 116, 30); ctx.lineTo(W - 116, H - 30); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let y = 56;
  const put = (tk) => {
    // 數字橫著擠在一格裡（縱中橫）
    const digits = /^\d+$/.test(tk);
    ctx.font = `600 ${digits && tk.length > 2 ? fs * 0.72 : digits && tk.length === 2 ? fs * 0.86 : fs}px "Noto Serif TC", "PMingLiU", "MingLiU", "DFKai-SB", serif`;
    ctx.fillText(tk, x, y);
    y += step;
  };
  tokens.forEach(put);
  y += step * 0.6;
  ['值', '日', '生'].forEach(put);
  if (duty.length) duty.forEach(put);
  else { ctx.beginPath(); ctx.moveTo(x, y - step / 2); ctx.lineTo(x, Math.min(H - 40, y + step * 3)); ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();
}
function drawBg() {
  const bg = page().bg;
  ctx.fillStyle = bg.c;
  ctx.fillRect(0, 0, W, H);
  // 自己上傳的底圖（已裁成白板的比例）
  if (bg.img) { const im = imgOf(bg.img); if (im.complete && im.naturalWidth) ctx.drawImage(im, 0, 0, W, H); }
  ctx.lineWidth = 1;
  const lineC = dark() ? 'rgba(255,255,255,.14)' : 'rgba(18,48,63,.12)';
  if (bg.p === 'grid') {
    ctx.strokeStyle = lineC;
    for (let x = 50; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 50; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  } else if (bg.p === 'lines') {
    ctx.strokeStyle = lineC;
    for (let y = 80; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke(); }
  } else if (bg.p === 'vlines') {
    // 直線：直式書寫用，從右邊開始每 64px 一條
    ctx.strokeStyle = lineC;
    for (let x = W - 80; x > 0; x -= 64) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, H - 40); ctx.stroke(); }
  } else if (bg.p === 'staff') {
    // 五線譜：一格 18px，每組五線之間空 100px
    ctx.strokeStyle = dark() ? 'rgba(255,255,255,.45)' : 'rgba(18,48,63,.55)';
    ctx.lineWidth = 1.4;
    for (let top = 90; top + 72 < H - 40; top += 72 + 100) for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(60, top + k * 18); ctx.lineTo(W - 60, top + k * 18); ctx.stroke(); }
  } else if (bg.p === 'nine' || bg.p === 'four' || bg.p === 'box') {
    // 國字練習格：九宮格（右邊附注音格）、四宮格（田字格）、方框
    const S = 120, Z = bg.p === 'nine' ? 40 : 0, gapX = bg.p === 'nine' ? 0 : 14, gapY = 22;
    const cols = Math.floor((W - 80 + gapX) / (S + Z + gapX)), rows = Math.floor((H - 80 + gapY) / (S + gapY));
    const x0 = (W - (cols * (S + Z + gapX) - gapX)) / 2, y0 = (H - (rows * (S + gapY) - gapY)) / 2;
    const solid = dark() ? 'rgba(255,255,255,.55)' : 'rgba(229,72,77,.75)', dash = dark() ? 'rgba(255,255,255,.28)' : 'rgba(229,72,77,.4)';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = x0 + c * (S + Z + gapX), y = y0 + r * (S + gapY);
      ctx.setLineDash([]); ctx.strokeStyle = solid; ctx.lineWidth = 2;
      ctx.strokeRect(x, y, S, S);
      if (Z) ctx.strokeRect(x + S, y, Z, S);
      ctx.setLineDash([6, 6]); ctx.strokeStyle = dash; ctx.lineWidth = 1.4;
      const line = (a, b, c2, d) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c2, d); ctx.stroke(); };
      if (bg.p === 'nine') {
        line(x + S / 3, y, x + S / 3, y + S); line(x + (2 * S) / 3, y, x + (2 * S) / 3, y + S);
        line(x, y + S / 3, x + S, y + S / 3); line(x, y + (2 * S) / 3, x + S, y + (2 * S) / 3);
        line(x + S, y + S / 3, x + S + Z, y + S / 3); line(x + S, y + (2 * S) / 3, x + S + Z, y + (2 * S) / 3);
      } else if (bg.p === 'four') {
        line(x + S / 2, y, x + S / 2, y + S); line(x, y + S / 2, x + S, y + S / 2);
      }
    }
    ctx.setLineDash([]);
  }
  if (bg.p === 'tw') drawDateColumn(bg);
}
function textLines(o) { return String(o.text).split('\n'); }
function textBox(o) {
  ctx.font = fontOf(o);
  const lines = textLines(o);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width), 10);
  return { x: o.x, y: o.y, w, h: lines.length * o.size * 1.25 };
}
function bbox(o) {
  if (o.type === 'stroke') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < o.pts.length; i += 2) { x0 = Math.min(x0, o.pts[i]); x1 = Math.max(x1, o.pts[i]); y0 = Math.min(y0, o.pts[i + 1]); y1 = Math.max(y1, o.pts[i + 1]); }
    const p = o.w / 2;
    return { x: x0 - p, y: y0 - p, w: x1 - x0 + 2 * p, h: y1 - y0 + 2 * p };
  }
  if (o.type === 'text') return textBox(o);
  if (o.type === 'image') {
    // 轉 90° / 270° 時，外框的寬高對調（以中心為準）
    if ((o.rot || 0) % 180 === 0) return { x: o.x, y: o.y, w: o.w, h: o.h };
    return { x: o.x + (o.w - o.h) / 2, y: o.y + (o.h - o.w) / 2, w: o.h, h: o.w };
  }
  return { x: Math.min(o.x1, o.x2) - o.w, y: Math.min(o.y1, o.y2) - o.w, w: Math.abs(o.x2 - o.x1) + 2 * o.w, h: Math.abs(o.y2 - o.y1) + 2 * o.w };
}
// 筆畫、形狀的畫法在 draw.js（電路圖也用同一套）
const drawStroke = (o) => drawStrokeOn(ctx, o, scale);
const shapePath = (o) => shapePathOn(ctx, o);
function drawObj(o) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = o.c; ctx.fillStyle = o.c; ctx.lineWidth = o.w;
  if (o.type === 'stroke') {
    drawStroke(o);
  } else if (o.type === 'line' || o.type === 'arrow') {
    ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
    if (o.type === 'arrow') {
      const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = 14 + o.w * 2.5;
      ctx.beginPath();
      ctx.moveTo(o.x2, o.y2);
      ctx.lineTo(o.x2 - L * Math.cos(a - 0.45), o.y2 - L * Math.sin(a - 0.45));
      ctx.lineTo(o.x2 - L * Math.cos(a + 0.45), o.y2 - L * Math.sin(a + 0.45));
      ctx.closePath(); ctx.fill();
    }
  } else if (o.type === 'wire') {
    ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
  } else if (o.type === 'shape') {
    shapePath(o);
    if (o.fill) { ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.stroke();
  } else if (o.type === 'rect') {
    ctx.strokeRect(Math.min(o.x1, o.x2), Math.min(o.y1, o.y2), Math.abs(o.x2 - o.x1), Math.abs(o.y2 - o.y1));
  } else if (o.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2, Math.abs(o.x2 - o.x1) / 2, Math.abs(o.y2 - o.y1) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (o.type === 'text') {
    ctx.font = fontOf(o);
    ctx.textBaseline = 'top';
    textLines(o).forEach((l, i) => ctx.fillText(l, o.x, o.y + i * o.size * 1.25));
  } else if (o.type === 'image') {
    const im = imgOf(o.src);
    if (im.complete && im.naturalWidth) {
      if (o.rot) {
        ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
        ctx.rotate((o.rot * Math.PI) / 180);
        ctx.drawImage(im, -o.w / 2, -o.h / 2, o.w, o.h);
      } else ctx.drawImage(im, o.x, o.y, o.w, o.h);
    }
  }
  ctx.restore();
}
const laser = createLaser(() => render());
function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawBg();
  for (const o of page().objs) drawObj(o);
  if (draft) drawObj(draft);
  laser.draw(ctx, scale);
  if (sel && page().objs.includes(sel)) {
    const b = bbox(sel);
    ctx.save();
    ctx.setLineDash([10, 8]); ctx.lineWidth = 2; ctx.strokeStyle = '#1b8fd6';
    ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    ctx.setLineDash([]);
    if (resizable(sel)) { ctx.fillStyle = '#1b8fd6'; ctx.fillRect(b.x + b.w + 6 - 9, b.y + b.h + 6 - 9, 18, 18); }
    ctx.restore();
  }
}
const resizable = (o) => o.type === 'image' || o.type === 'text';
const snap = (p) => ({ x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 });

// ---------- 點選與橡皮擦 ----------
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
  const k = l ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0;
  return Math.hypot(px - (x1 + k * dx), py - (y1 + k * dy));
}
function hit(o, x, y, pad = 10) {
  if (o.type === 'stroke') {
    for (let i = 0; i < o.pts.length - 2; i += 2) if (distSeg(x, y, o.pts[i], o.pts[i + 1], o.pts[i + 2], o.pts[i + 3]) < o.w / 2 + pad) return true;
    return o.pts.length === 2 && Math.hypot(x - o.pts[0], y - o.pts[1]) < o.w / 2 + pad;
  }
  if (o.type === 'line' || o.type === 'arrow') return distSeg(x, y, o.x1, o.y1, o.x2, o.y2) < o.w / 2 + pad;
  if (o.type === 'wire') return Math.min(distSeg(x, y, o.x1, o.y1, o.x2, o.y1), distSeg(x, y, o.x2, o.y1, o.x2, o.y2)) < o.w / 2 + pad;
  const b = bbox(o);
  if (o.type === 'shape' && o.fill) return x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad;
  if (o.type === 'rect' || o.type === 'ellipse' || o.type === 'shape') {
    // 框線附近才算點到（點框框裡面可以繼續畫）
    const inX = x > b.x - pad && x < b.x + b.w + pad, inY = y > b.y - pad && y < b.y + b.h + pad;
    const nearEdge = Math.abs(x - b.x) < pad + o.w || Math.abs(x - b.x - b.w) < pad + o.w || Math.abs(y - b.y) < pad + o.w || Math.abs(y - b.y - b.h) < pad + o.w;
    return inX && inY && (nearEdge || tool === 'select');
  }
  return x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad;
}
const topAt = (x, y) => [...page().objs].reverse().find((o) => hit(o, x, y));
function onHandle(x, y) {
  if (!sel || !resizable(sel)) return false;
  const b = bbox(sel);
  return Math.abs(x - (b.x + b.w + 6)) < 22 && Math.abs(y - (b.y + b.h + 6)) < 22;
}
// 物件改了位置或大小：換一個新物件（舊的留在復原紀錄裡）
function replaceObj(o, patch) {
  const n = { ...o, ...patch };
  const i = page().objs.indexOf(o);
  if (i >= 0) page().objs[i] = n;
  return n;
}
function moved(o, dx, dy) {
  if (o.type === 'stroke') return { pts: o.pts.map((v, i) => v + (i % 2 ? dy : dx)) };
  if (o.type === 'text' || o.type === 'image') return { x: o.x + dx, y: o.y + dy };
  return { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
}

// ---------- 指標事件 ----------
cv.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  clearTimeout(inkTimer);
  commitText();
  cv.setPointerCapture(e.pointerId);
  const p = toBoard(e);
  if (tool === 'select') {
    if (onHandle(p.x, p.y)) { snapshot(); drag = { mode: 'resize', start: p, orig: sel, box: bbox(sel) }; return; }
    const o = topAt(p.x, p.y);
    sel = o || null;
    if (o) { snapshot(); drag = { mode: 'move', start: p, orig: o }; }
    render(); syncBar();
    return;
  }
  if (tool === 'eraser') { snapshot(); drag = { mode: 'erase', any: false }; eraseAt(p); return; }
  if (tool === 'text') { e.preventDefault(); openText(p); return; }
  if (tool === 'laser') { drag = { mode: 'laser' }; laser.add(p); return; }
  if (BRUSHES.includes(tool)) draft = { type: 'stroke', pts: [p.x, p.y], c: color, w: width * BRUSH_W[tool], brush: tool };
  else if (tool === 'wire') { const g = snap(p); draft = { type: 'wire', x1: g.x, y1: g.y, x2: g.x, y2: g.y, c: color, w: Math.max(2, Math.min(width, 6)) }; }
  else if (tool === 'shape') draft = { type: 'shape', kind: shapeKind, fill: fillOn, x1: p.x, y1: p.y, x2: p.x, y2: p.y, c: color, w: width };
  else draft = { type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, c: color, w: width };
  render();
});
cv.addEventListener('pointermove', (e) => {
  const p = toBoard(e);
  if (tool === 'select' && !drag) { cv.style.cursor = onHandle(p.x, p.y) ? 'nwse-resize' : topAt(p.x, p.y) ? 'move' : 'default'; return; }
  // 雷射筆：滑鼠移過去就有軌跡（觸控要按著畫）
  if (tool === 'laser') { if (drag || e.pointerType === 'mouse') laser.add(p); return; }
  if (drag && drag.mode === 'erase') { eraseAt(p); return; }
  if (drag && drag.mode === 'move') {
    sel = replaceObj(sel, moved(drag.orig, p.x - drag.start.x, p.y - drag.start.y));
    render(); return;
  }
  if (drag && drag.mode === 'resize') {
    const o = drag.orig, b = drag.box;
    const k = Math.max(0.1, Math.max((p.x - b.x) / b.w, (p.y - b.y) / b.h));
    sel = replaceObj(sel, o.type === 'image' ? { w: o.w * k, h: o.h * k } : { size: Math.max(12, Math.round(o.size * k)) });
    render(); return;
  }
  if (!draft) return;
  if (draft.type === 'stroke') {
    // 合併 getCoalescedEvents，快速畫線也不會斷成折線
    const co = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const evs = co.length ? co : [e];
    for (const ev of evs) { const q = toBoard(ev); draft.pts.push(Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10); }
  } else {
    let { x, y } = p;
    // 按住 Shift：直線鎖 45 度、方框和圓形變正方形和正圓
    if (e.shiftKey) {
      const dx = x - draft.x1, dy = y - draft.y1;
      if (draft.type === 'line' || draft.type === 'arrow') { const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), r = Math.hypot(dx, dy); x = draft.x1 + r * Math.cos(a); y = draft.y1 + r * Math.sin(a); } else { const m = Math.max(Math.abs(dx), Math.abs(dy)); x = draft.x1 + Math.sign(dx || 1) * m; y = draft.y1 + Math.sign(dy || 1) * m; }
    }
    if (draft.type === 'wire') ({ x, y } = snap(p));
    draft.x2 = x; draft.y2 = y;
  }
  render();
});
function endPointer() {
  if (drag) {
    if (drag.mode === 'erase' && !drag.any) undo.pop(); // 什麼都沒擦到就不留紀錄
    if (drag.mode === 'move' && sel === drag.orig) undo.pop();
    if (drag.mode === 'laser') { drag = null; return; }
    drag = null; save(); syncBar(); return;
  }
  if (!draft) return;
  const d = draft;
  draft = null;
  const tiny = d.type !== 'stroke' && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 4;
  if (!tiny) { snapshot(); page().objs.push(d); save(); syncBar(); }
  render();
  if (!tiny && auto.hw && isInk(d)) inkTimer = setTimeout(() => { const r = solveInk(d); if (r) showAdjust(r); }, 1300);
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
function eraseAt(p) {
  const before = page().objs.length;
  page().objs = page().objs.filter((o) => !hit(o, p.x, p.y, 14));
  if (page().objs.length !== before) { drag.any = true; if (sel && !page().objs.includes(sel)) sel = null; render(); }
}
// 雙擊公式、文字：重新編輯
cv.addEventListener('dblclick', (e) => {
  const p = toBoard(e);
  const o = topAt(p.x, p.y);
  if (!o) return;
  if (o.type === 'text') { sel = o; openText({ x: o.x, y: o.y }, o); }
  else if (o.type === 'image' && o.tex) { sel = o; openFormula(o); }
});

// ---------- 文字 ----------
let editingText = null;
function openText(p, existing = null) {
  const r = cv.getBoundingClientRect(), k = r.width / W;
  editingText = { p, existing };
  const fs = existing ? existing.size : fontPx();
  Object.assign(txt.style, { left: `${p.x * k}px`, top: `${p.y * k}px`, fontSize: `${fs * k}px`, fontFamily: FONTS[existing ? existing.font : fontKey] || FONT_FAMILY, color: existing ? existing.c : color, minWidth: `${Math.max(120, 300 * k)}px` });
  txt.value = existing ? existing.text : '';
  txt.classList.remove('hidden');
  txt.classList.toggle('on-dark', dark());
  setTimeout(() => txt.focus(), 0);
}
function commitText() {
  if (!editingText) return;
  const { p, existing } = editingText;
  editingText = null;
  const value = txt.value.replace(/\s+$/, '');
  txt.classList.add('hidden');
  if (existing) {
    snapshot();
    if (value) sel = replaceObj(existing, { text: value }); else { page().objs = page().objs.filter((o) => o !== existing); sel = null; }
  } else if (value) {
    snapshot();
    const o = { type: 'text', x: p.x, y: p.y, text: value, c: color, size: fontPx(), font: fontKey };
    page().objs.push(o);
    // 一行算式（例如 2x+3=7、3(2+5)^2、y=x^2）
    if (!value.includes('\n') && looksMath(value)) autoExtras(analyze(value.replace(/\s*=\s*\?*\s*$/, '')), textBox(o));
  }
  save(); render(); syncBar();
}
txt.addEventListener('blur', commitText);
txt.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { txt.value = editingText && editingText.existing ? editingText.existing.text : ''; txt.blur(); }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) txt.blur();
});

// ---------- 放東西到白板（圖片、公式、圖形、文字） ----------
let dropAt = 0; // 連續放好幾個時往右下錯開
function place(w, h) {
  const k = Math.min(1, (W * 0.8) / w, (H * 0.8) / h);
  w *= k; h *= k;
  const off = (dropAt++ % 6) * 40;
  return { x: (W - w) / 2 + off, y: (H - h) / 2 + off, w, h };
}
function addImage(src, natW, natH, extra = {}) {
  snapshot();
  const o = { type: 'image', src, ...place(natW, natH), ...extra };
  page().objs.push(o);
  sel = o;
  setTool('select');
  save(); render(); syncBar();
  sfx.coin();
}
function addText(text, extra = {}) {
  snapshot();
  const o = { type: 'text', text, c: dark() && color === COLORS[0] ? '#ffffff' : color, size: fontPx(), font: fontKey, x: 0, y: 0, ...extra };
  const b = textBox(o);
  const pos = place(b.w, b.h);
  o.x = pos.x; o.y = pos.y;
  page().objs.push(o);
  sel = o;
  setTool('select');
  save(); render(); syncBar();
  sfx.coin();
}
// 圖片縮到最長邊 1600px 以內再存，避免白板資料太大
function readImage(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1600 / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        res({ src: c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85), w: c.width, h: c.height });
      };
      im.onerror = rej;
      im.src = fr.result;
    };
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
$('#wb-img').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { const r = await readImage(f); addImage(r.src, r.w, r.h); } catch { toast(t('wb.imgFail'), 'error'); }
});
// 直接貼上圖片（截圖後 Ctrl+V）
document.addEventListener('paste', async (e) => {
  if (panel.hidden || e.target.closest('input, textarea')) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  try { const r = await readImage(item.getAsFile()); addImage(r.src, r.w, r.h); } catch { toast(t('wb.imgFail'), 'error'); }
});

// ---------- 公式：MathJax 轉成 SVG 圖片（第一次用才載入） ----------
let mjReady = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
function loadMath() {
  if (!mjReady) {
    mjReady = loadScript('/vendor/mathjax/config.js')
      .then(() => loadScript('/vendor/mathjax/tex-svg-full.js'))
      .then(() => window.MathJax.startup.promise)
      .catch((e) => { mjReady = null; throw e; });
  }
  return mjReady;
}
// LaTeX → { src, w, h }；px 是字的大小
async function texImage(tex, c, px) {
  await loadMath();
  const node = window.MathJax.tex2svg(tex, { display: true });
  const svg = node.querySelector('svg');
  if (!svg || node.querySelector('[data-mjx-error], merror')) throw new Error(t('wb.texErr'));
  const ex = px / 2; // MathJax 用 ex 當單位，約為字高的一半
  const w = parseFloat(svg.getAttribute('width')) * ex, h = parseFloat(svg.getAttribute('height')) * ex;
  svg.setAttribute('width', w); svg.setAttribute('height', h);
  svg.setAttribute('color', c);
  svg.style.cssText = '';
  const s = new XMLSerializer().serializeToString(svg);
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`, w, h };
}
// LaTeX → 計算機看得懂的算式（只處理常見寫法；看不懂就回傳 null）
function texToExpr(tex) {
  let s = tex.replace(/\\left|\\right/g, '').replace(/\\[,;:!]|\\quad|\\qquad|\\ /g, ' ')
    .replace(/\\cdot|\\times/g, '*').replace(/\\div/g, '/').replace(/\\pi/g, 'pi').replace(/\\infty/g, 'Infinity')
    .replace(/\\(arcsin|arccos|arctan)/g, (m, f) => ({ arcsin: 'asin', arccos: 'acos', arctan: 'atan' }[f]))
    .replace(/\\(sin|cos|tan|ln|log|exp)/g, '$1').replace(/\\%/g, '%').replace(/\^\{\\circ\}|°/g, '*pi/180');
  // 由內往外換掉 \frac{a}{b}、\sqrt[n]{a}、\sqrt{a}
  for (let k = 0; k < 20; k++) {
    const before = s;
    s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
      .replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, '(($2)^(1/($1)))')
      .replace(/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)');
    if (s === before) break;
  }
  s = s.replace(/[{}]/g, (c) => (c === '{' ? '(' : ')')).replace(/\\[a-z]+/gi, (m) => { throw new Error(m); });
  return s;
}
const latexNum = (v) => {
  const f = toFraction(v);
  if (f) return `${f.n < 0 ? '-' : ''}\\frac{${Math.abs(f.n)}}{${f.d}}`;
  return fmt(v).replace('e', '\\times 10^{').replace(/(\{[-+]?\d+)$/, '$1}');
};
// 解 f(x) = 0：在 -100～100 找變號的地方再二分逼近
function solve(fn) {
  const roots = [], a = -100, b = 100, N = 8000;
  const f = (x) => { try { return fn({ x, deg: false, ans }); } catch { return NaN; } };
  let px = a, pv = f(a);
  const push = (x) => {
    const r = Math.abs(x - Math.round(x)) < 1e-7 ? Math.round(x) : x;
    if (!roots.some((y) => Math.abs(y - r) < 1e-6)) roots.push(r);
  };
  for (let i = 1; i <= N && roots.length < 6; i++) {
    const x = a + ((b - a) * i) / N, v = f(x);
    if (Number.isFinite(v) && Math.abs(v) < 1e-12) push(x);
    else if (Number.isFinite(v) && Number.isFinite(pv) && pv * v < 0) {
      let lo = px, hi = x, flo = pv;
      for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2, fm = f(m); if (flo * fm <= 0) hi = m; else { lo = m; flo = fm; } }
      const r = (lo + hi) / 2;
      if (Math.abs(f(r)) < 1e-6 * Math.max(1, Math.abs(pv), Math.abs(v))) push(r); // 排除 1/x 這種跳過去的
    }
    px = x; pv = v;
  }
  return roots.sort((x, y) => x - y);
}
// 看公式是什麼：純數字 → 算出答案；有 x 的方程式 → 解出 x；y = …（或只有 x 的式子）→ 可以畫圖、列表；
// z = …（有 x 和 y）→ 3D 曲面；有矩陣 → 矩陣運算
const hasV = (e, v) => new RegExp(`(^|[^a-z])${v}([^a-z]|$)`, 'i').test(e);
function analyze(tex) {
  if (hasMatrix(tex)) {
    if (/=\s*\S/.test(tex.replace(/=\s*$/, '').replace(/^[^=]*[A-Za-z]\s*=/, ''))) return null;
    try {
      const v = matrixCalc(tex.replace(/^\s*[A-Za-z]\s*=/, ''), (c) => evaluate(texToExpr(c), { deg: false }));
      return { text: `= ${mxText(v, fmt)}`, ansTex: `= ${mxTex(v, latexNum)}` };
    } catch (e) { return { text: t(e.key || 'wb.mx.syntax', e.vars) }; }
  }
  let expr;
  try { expr = texToExpr(tex); } catch { return null; }
  const sides = expr.split('=');
  if (sides.length > 2) return null;
  const hasX = (e) => hasV(e, 'x'), hasY = (e) => hasV(e, 'y');
  try {
    if (sides.length === 1) {
      if (hasX(expr) && hasY(expr)) { compile(expr); return { surface: expr }; }
      if (hasX(expr)) { compile(expr); return { graph: expr, table: expr }; }
      if (hasY(expr)) return null;
      const v = evaluate(expr, { deg: false });
      return Number.isFinite(v) ? { value: v, text: `= ${fmt(v)}${toFraction(v) ? `（${toFraction(v).n}/${toFraction(v).d}）` : ''}`, tex: `${tex} = ${latexNum(v)}` } : null;
    }
    const [l, r] = sides.map((x) => x.trim());
    if (/^(z|f\(x,y\))$/i.test(l) && r && !hasV(r, 'z')) { compile(r); return { surface: r }; }
    if (/^(y|f\(x\))$/i.test(l) && r && !hasY(r)) { compile(r); return { graph: r, table: r }; }
    if (hasY(l) || hasY(r)) return null;
    if (!hasX(l) && !hasX(r)) {
      const ok = Math.abs(evaluate(l) - evaluate(r)) < 1e-9 * Math.max(1, Math.abs(evaluate(l)));
      return { ok, text: ok ? '✓' : '✗', tex: `${tex} \\quad ${ok ? '\\checkmark' : '\\times'}` };
    }
    const fl = compile(l || '0'), fr = compile(r || '0');
    const rs = solve((sc) => fl(sc) - fr(sc));
    if (!rs.length) return { text: t('wb.noRoot'), graph: `(${l})-(${r})` };
    return { text: `x = ${rs.map(fmt).join(', ')}`, tex: `${tex} \;\\Rightarrow\; x = ${rs.map(latexNum).join(',\\ ')}`, graph: `(${l})-(${r})`, roots: rs };
  } catch { return null; }
}
const fBox = $('#wb-formula'), fSrc = $('#wb-tex'), fView = $('#wb-tex-view');
let fInfo = null; // 目前公式的分析結果
function showAnswer() {
  fInfo = fSrc.value.trim() ? analyze(fSrc.value.trim()) : null;
  $('#wb-tex-ans').textContent = fInfo && fInfo.text ? `${t('wb.answer')}：${fInfo.text}` : fInfo && fInfo.graph ? t('wb.canGraph') : fInfo && fInfo.surface ? t('wb.can3d') : '';
}
let fEditing = null;
let fTimer = 0;
function openFormula(existing = null) {
  fEditing = existing;
  fSrc.value = existing ? existing.tex : '';
  fBox.classList.add('open');
  fView.innerHTML = `<span class="muted small">${esc(t('wb.loadingMath'))}</span>`;
  loadMath().then(preview).catch(() => { fView.textContent = t('wb.mathFail'); });
  showAnswer();
  setTimeout(() => fSrc.focus(), 50);
}
function preview() {
  clearTimeout(fTimer);
  fTimer = setTimeout(async () => {
    const tex = fSrc.value.trim();
    if (!tex) { fView.innerHTML = `<span class="muted small">${esc(t('wb.texEmpty'))}</span>`; return; }
    try { const r = await texImage(tex, dark() ? '#ffffff' : '#12232e', 40); fView.innerHTML = `<img alt="" src="${r.src}" style="max-width:100%">`; } catch (e) { fView.innerHTML = `<span class="small" style="color:#e5484d">${esc(e.message)}</span>`; }
  }, 200);
}
fSrc.addEventListener('input', () => { preview(); showAnswer(); });
$$('[data-tex]').forEach((b) => b.addEventListener('click', () => {
  // 插入範本；範本裡的「□」是游標要停的位置
  const tpl = b.dataset.tex, at = tpl.indexOf('□');
  const s0 = fSrc.selectionStart, s1 = fSrc.selectionEnd;
  const ins = tpl.replace('□', fSrc.value.slice(s0, s1));
  fSrc.setRangeText(ins, s0, s1, 'end');
  if (at >= 0) { const pos = s0 + at + (s1 - s0); fSrc.setSelectionRange(pos, pos); }
  fSrc.focus();
  preview();
  showAnswer();
}));
// 進階：矩陣（自訂幾乘以幾），格子填好再插入到公式
const mxGrid = $('#wb-mx-grid');
function mxSize() {
  const n = (id) => Math.max(1, Math.min(8, Math.round(Number($(id).value)) || 1));
  return { r: n('#wb-mx-r'), c: n('#wb-mx-c') };
}
function mxBuild(fill) {
  const { r, c } = mxSize();
  const old = $$('input', mxGrid).reduce((m, i) => { m[i.dataset.rc] = i.value; return m; }, {});
  mxGrid.style.gridTemplateColumns = `repeat(${c}, auto)`;
  let html = '';
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) {
    const v = fill ? fill(i, j) : (old[`${i},${j}`] ?? '');
    html += `<input type="text" inputmode="decimal" data-rc="${i},${j}" value="${esc(String(v))}" aria-label="${i + 1},${j + 1}" placeholder="0">`;
  }
  mxGrid.innerHTML = html;
}
['#wb-mx-r', '#wb-mx-c'].forEach((id) => $(id).addEventListener('input', () => mxBuild()));
$('#wb-mx-eye').addEventListener('click', () => mxBuild((i, j) => (i === j ? 1 : 0)));
$('#wb-mx-zero').addEventListener('click', () => mxBuild(() => ''));
$('#wb-mx-ins').addEventListener('click', () => {
  const { r, c } = mxSize(), kind = $('#wb-mx-kind').value;
  const cell = (i, j) => $(`input[data-rc="${i},${j}"]`, mxGrid)?.value.trim() || '0';
  const rows = Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => cell(i, j)).join(' & ')).join(' \\\\ ');
  fSrc.setRangeText(`\\begin{${kind}} ${rows} \\end{${kind}}`, fSrc.selectionStart, fSrc.selectionEnd, 'end');
  fSrc.focus();
  preview(); showAnswer();
});
mxBuild();
const closeFormula = () => { fBox.classList.remove('open'); fEditing = null; };
$('#wb-tex-cancel').addEventListener('click', closeFormula);
fBox.addEventListener('click', (e) => { if (e.target === fBox) closeFormula(); });
// ---------- 寫完公式或算式：自動放上答案、函數圖形（工具列的「答案」「圖表」可以關掉） ----------
const AUTO_KEY = 'ct-board-auto';
let auto = { ans: true, graph: true, hw: true };
try { auto = { ...auto, ...JSON.parse(localStorage.getItem(AUTO_KEY) || '{}') }; } catch { /* 沒存過 */ }
function setAuto(k) {
  auto[k] = !auto[k];
  try { localStorage.setItem(AUTO_KEY, JSON.stringify(auto)); } catch { /* 無痕模式 */ }
  syncBar();
  sfx.tick();
}
$('#wb-auto-ans').addEventListener('click', () => setAuto('ans'));
$('#wb-auto-graph').addEventListener('click', () => setAuto('graph'));
$('#wb-auto-hw').addEventListener('click', () => setAuto('hw'));
// 文字看起來是算式才算（有運算符號或函數），一般句子、單純數字都不算
const looksMath = (v) => /[+\-*/^×÷=√]|\b(sin|cos|tan|log|ln|sqrt)\b/i.test(v) && /\d|x/i.test(v) && !/[\u3400-\u9fff]/.test(v);
// box：公式或文字在白板上的位置；答案放在右邊，圖表放在下面
function autoExtras(info, box) {
  if (!info) return;
  const c = dark() ? '#9be15d' : '#22a06b';
  if (auto.ans && info.ansTex) {
    // 矩陣的答案也排成公式，放在右邊
    texImage(info.ansTex, c, fontPx() * 1.1).then((r) => {
      page().objs.push({ type: 'image', src: r.src, tex: info.ansTex, c, nw: r.w, w: r.w, h: r.h, x: Math.min(box.x + box.w + 24, W - r.w), y: box.y + box.h / 2 - r.h / 2 });
      save(); render();
    }).catch(() => { /* 算得出來但排不出公式就算了 */ });
  } else if (auto.ans && info.text) {
    page().objs.push({ type: 'text', text: info.text, c, size: Math.round(Math.min(box.h, fontPx() * 1.4) * 0.8), font: fontKey, x: box.x + box.w + 24, y: box.y + Math.max(0, box.h / 2 - fontPx() * 0.5) });
  }
  autoImages(info, box).forEach((o) => page().objs.push(o));
}
// 函數圖形、對照表、3D 曲面：回傳要放上白板的圖片（放在 box 下面，放不下就放上面）
function autoImages(info, box, extra = {}) {
  if (!auto.graph || !info) return [];
  const out = [];
  const put = (cvs, w, h) => {
    const below = box.y + box.h + 20;
    let x = Math.min(Math.max(0, box.x), W - w), y = below + h > H ? Math.max(0, box.y - h - 20) : below;
    // 同一次產生的第二張圖排在第一張右邊
    const prev = out[out.length - 1];
    if (prev) { x = prev.x + prev.w + 20; y = prev.y; if (x + w > W) { x = Math.max(0, W - w); y = Math.min(H - h, prev.y + prev.h + 12); } }
    out.push({ type: 'image', src: cvs.toDataURL('image/png'), x, y, w, h, ...extra });
  };
  try {
    if (info.surface) { const cvs = document.createElement('canvas'); drawSurface(cvs, info.surface, dark()); put(cvs, 450, 360); }
    if (info.graph) {
      const rs = info.roots || [];
      let x0 = -10, x1 = 10;
      if (rs.length) { const lo = Math.min(...rs), hi = Math.max(...rs), pd = Math.max(3, (hi - lo) * 0.4); x0 = Math.floor(lo - pd); x1 = Math.ceil(hi + pd); }
      const cvs = document.createElement('canvas');
      graphTo(cvs, 900, 600, dark(), { fns: [{ s: info.graph, c: '#1b8fd6' }], x0, x1, y0: NaN, y1: NaN, roots: rs });
      put(cvs, 480, 320);
    }
    if (info.table) { const cvs = document.createElement('canvas'); drawTable(cvs, info.table, dark()); put(cvs, cvs.width * 0.62, cvs.height * 0.62); }
  } catch { /* 畫不出來就不放 */ }
  return out;
}

// ---------- 手寫算式：用筆寫完停一下，就自動辨識、把答案寫在「=」後面（工具列的「手寫」可以關掉） ----------
const INK_BRUSHES = ['pen', 'pencil', 'brush', 'water'];
let inkTimer = 0;
const isInk = (o) => o.type === 'stroke' && !o.hw && INK_BRUSHES.includes(o.brush || 'pen');
const boxHit = (a, b, pad = 0) => a.x - pad < b.x + b.w && b.x - pad < a.x + a.w && a.y - pad < b.y + b.h && b.y - pad < a.y + a.h;
// 從剛寫的那一筆往左右找同一行的筆畫（太大的筆畫是畫圖，不算）
function inkLine(seed) {
  const cand = page().objs.filter((o) => isInk(o) && (() => { const b = bbox(o); return b.h < 360 && b.w < 600; })());
  const sb = bbox(seed);
  const near = cand.map(bbox).filter((b) => Math.abs(b.y + b.h / 2 - (sb.y + sb.h / 2)) < 300 && b.h > 18).map((b) => b.h).sort((a, b) => a - b);
  const Href = Math.max(40, Math.min(200, near.length ? near[Math.floor(near.length / 2)] : sb.h));
  const line = [seed], seen = new Set(line);
  for (let i = 0; i < line.length && line.length < 80; i++) {
    const b = bbox(line[i]), ex = { x: b.x - Href * 0.9, y: b.y - Href * 0.3, w: b.w + Href * 1.8, h: b.h + Href * 0.6 };
    for (const o of cand) if (!seen.has(o) && boxHit(ex, bbox(o))) { seen.add(o); line.push(o); }
  }
  return line;
}
// 答案的寫法：分數算不盡就寫成上下的分數，其他寫成小數（最多 6 位）
function answerText(v) {
  const f = toFraction(v), d = fmt(v);
  if (f && d.replace(/[-.]/g, '').length > 6) return { frac: f };
  if (Math.abs(v) >= 1e9 || (v !== 0 && Math.abs(v) < 1e-6)) return null;
  const r = Number(v.toFixed(4));
  return { s: `${r !== v ? '≈' : ''}${fmt(r)}`.replace('≈-', '≈ -') };
}
function inkWrite(str, x, mid, H, c, w, src) {
  const { strokes, w: tw } = handwrite(str, x, mid - H / 2, H);
  return { objs: strokes.map((pts) => ({ type: 'stroke', pts, c, w, brush: 'pen', hw: 1, hwSrc: src })), w: tw };
}
// quiet：從滑竿呼叫（不播音效、不重建滑竿）
function solveInk(seed, quiet = false) {
  if (!auto.hw || !page().objs.includes(seed)) return null;
  const line = inkLine(seed);
  let res;
  try { res = readInk(line.map((o) => o.pts)); } catch { return null; }
  if (!res.eq) return null;
  const lb = line.map(bbox).reduce((a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), x2: Math.max(a.x2, b.x + b.w), y2: Math.max(a.y2, b.y + b.h) }), { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity });
  const box = { x: lb.x, y: lb.y, w: lb.x2 - lb.x, h: lb.y2 - lb.y };
  const src = [box.x, box.y, box.w, box.h];
  const us = res.units, eqAt = us.findIndex((u) => u === res.eq);
  const trailing = eqAt === us.length - 1 && us.filter((u) => u.s === '=').length === 1;
  let expr = toExpr(trailing ? us.slice(0, -1) : us, trailing);
  if (!trailing) {
    // 寫 z = …：手寫的 z 很像 2，等號左邊只有一個「2」、右邊有 y 就當成 z
    const [l, r] = expr.split('=');
    if (l === '2' && /y/.test(r || '')) expr = `z=${r}`;
  }
  const info = analyze(expr);
  if (!info) return null;
  // 同一行之前自動寫的答案、圖先拿掉（改寫之後重算）
  page().objs = page().objs.filter((o) => !(o.hwSrc && boxHit({ x: o.hwSrc[0], y: o.hwSrc[1], w: o.hwSrc[2], h: o.hwSrc[3] }, box, 4)));
  const c = dark() ? '#9be15d' : '#22a06b', pw = Math.max(3, Math.min(8, seed.w)), Hh = res.H, mid = res.mid;
  let ax = trailing ? res.eq.box.x1 + Hh * 0.35 : box.x + box.w + Hh * 0.9;
  const add = [];
  if (auto.ans) {
    if (info.value !== undefined && trailing) {
      const a = answerText(info.value);
      if (a && a.s) add.push(...inkWrite(a.s, ax, mid, Hh, c, pw, src).objs);
      else if (a && a.frac) {
        // 上下分數：分子、分數線、分母
        const n = `${Math.abs(a.frac.n)}`, d = `${a.frac.d}`, sz = Hh * 0.62;
        let x0 = ax;
        if (a.frac.n < 0) { add.push(...inkWrite('-', ax, mid, Hh, c, pw, src).objs); x0 += Hh * 0.6; }
        const wn = handwrite(n, 0, 0, sz).w, wd = handwrite(d, 0, 0, sz).w, bw = Math.max(wn, wd) + sz * 0.3;
        add.push(...inkWrite(n, x0 + (bw - wn) / 2, mid - sz * 0.62, sz, c, pw, src).objs);
        add.push({ type: 'stroke', pts: [x0, mid, x0 + bw / 2, mid + 1, x0 + bw, mid], c, w: pw, brush: 'pen', hw: 1, hwSrc: src });
        add.push(...inkWrite(d, x0 + (bw - wd) / 2, mid + sz * 0.68, sz, c, pw, src).objs);
      }
    } else if (info.ok !== undefined) add.push(...inkWrite(info.ok ? '✓' : '✗', ax, mid, Hh, c, pw, src).objs);
    else if (info.roots) {
      const str = `x = ${info.roots.map((r) => (Number.isInteger(r) ? String(r) : `${toFraction(r) && fmt(r).length > 7 ? '≈' : ''}${fmt(Number(r.toFixed(4)))}`)).join(', ')}`;
      if (canWrite(str)) add.push(...inkWrite(str, ax, mid, Hh, c, pw, src).objs);
    } else if (info.text && !info.graph && !info.surface) {
      add.push({ type: 'text', text: info.text, c, size: Math.round(Hh * 0.8), font: 'hand', x: ax, y: mid - Hh * 0.5, hwSrc: src });
    }
  }
  add.push(...autoImages(info, box, { hwSrc: src }));
  page().objs.push(...add);
  save(); render(); syncBar();
  if (!quiet) sfx.coin();
  // 這一行裡的數字（z = … 左邊那個當成 z 的 2 不算）
  const byPts = new Map(line.map((o) => [o.pts, o]));
  const nums = numbersIn(res.units).filter((n) => !(info.surface && n.units[0] === res.units[0]))
    .map((n) => ({ value: n.value, dec: (String(n.units.map((u) => u.s).join('')).split('.')[1] || '').length, units: n.units, objs: n.units.flatMap((u) => (u.ss || []).map((p) => byPts.get(p)).filter(Boolean)) }))
    .filter((n) => n.objs.length);
  return { nums, seed };
}

// ---------- 調整數字：手寫算式算完後，拖滑竿改裡面的數字，答案和圖跟著變 ----------
// 懸浮視窗：拖標題列移動（記住位置）；放在 .wb 裡面，白板全螢幕時也看得到。用筆點它不會畫到白板
const adjBox = document.createElement('div');
adjBox.className = 'wb-adjust';
adjBox.hidden = true;
adjBox.setAttribute('role', 'dialog');
$('.wb').appendChild(adjBox);
let adj = null, adjSnap = false, adjPos = null;
try { adjPos = JSON.parse(localStorage.getItem('ct-board-adjpos') || 'null'); } catch { adjPos = null; }
function placeAdjust() {
  const r = adjBox.getBoundingClientRect(), s2 = stage.getBoundingClientRect();
  // 第一次：放在白板右上角
  let { x, y } = adjPos || { x: s2.right - r.width - 14, y: s2.top + 14 };
  x = Math.max(4, Math.min(innerWidth - r.width - 4, x)); y = Math.max(4, Math.min(innerHeight - r.height - 4, y));
  Object.assign(adjBox.style, { left: `${x}px`, top: `${y}px` });
}
function showAdjust(r) {
  adj = r;
  if (!r || !r.nums.length) { adjBox.hidden = true; return; }
  const row = (n, i) => {
    const max = Math.max(10, Math.ceil(Math.abs(n.value) * 2)), step = n.dec ? 10 ** -n.dec : 1;
    return `<label class="wb-adj-row"><b>${esc(fmt(n.value))}</b><input type="range" min="0" max="${max}" step="${step}" value="${n.value}" data-adj="${i}" aria-label="${esc(fmt(n.value))}"><input type="number" min="0" step="${step}" value="${n.value}" data-adjn="${i}" aria-label="${esc(fmt(n.value))}"></label>`;
  };
  adjBox.innerHTML = `<div class="wb-adj-head" title="${esc(t('wb.adjDrag'))}"><span><i class="fa-solid fa-grip-vertical wb-adj-grip" aria-hidden="true"></i> <i class="fa-solid fa-sliders" aria-hidden="true"></i> ${esc(t('wb.adjust'))}</span><button type="button" class="wb-adj-x" aria-label="${esc(t('wb.adjClose'))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>${r.nums.slice(0, 6).map(row).join('')}`;
  adjBox.hidden = false;
  placeAdjust();
  syncBar();
}
// 把第 i 個數字改成 v：擦掉原本的筆跡，用同樣的顏色、粗細「寫」新的數字，再重算
function setNumber(i, v) {
  const n = adj && adj.nums[i];
  if (!n || !Number.isFinite(v) || v < 0 || !n.objs.every((o) => page().objs.includes(o))) { adjBox.hidden = true; return; }
  if (!adjSnap) { snapshot(); adjSnap = true; }
  // 第一次調整時記住數字的位置和大小，之後都寫在同一個地方（不然每次重量會越寫越大、越寫越右邊）
  if (!n.anchor) {
    const b = n.units.map((u) => u.box).reduce((a, c) => ({ x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1) }));
    const digits = n.units.filter((u) => u.s !== '.');
    const pad = Math.max(...n.objs.map((o) => o.w)) / 2; // 框量到的是含線寬的外框
    n.anchor = { x0: b.x0 + pad, top: Math.min(...digits.map((u) => u.box.y0)) + pad, size: Math.max(...digits.map((u) => u.box.h)) - pad * 2, w: b.x1 - b.x0 - pad * 2 };
  }
  const A = n.anchor;
  const str = v.toFixed(n.dec).replace(/^-/, '');
  const hw = handwrite(str, A.x0, A.top, A.size);
  // 數字變長（或變短）：後面的字整個往右（左）移，跨過去的根號橫線、分數線拉長
  const newW = hw.w - A.size * 0.12, edge = A.x0 + A.w, delta = newW - A.w;
  const line = inkLine(n.objs[0]).filter((o) => !n.objs.includes(o));
  const shift = (pts) => pts.map((q, j) => (j % 2 || q <= edge ? q : Math.round((q + delta) * 10) / 10));
  for (const o of line) { const i2 = page().objs.indexOf(o); if (i2 >= 0) page().objs[i2] = { ...o, pts: shift(o.pts) }; }
  A.w = newW;
  adj.nums.forEach((m) => { if (m !== n && m.anchor && m.anchor.x0 > edge) m.anchor.x0 += delta; });
  const proto = n.objs[0];
  const fresh = hw.strokes.map((pts) => ({ type: 'stroke', pts, c: proto.c, w: proto.w, brush: proto.brush }));
  page().objs = page().objs.filter((o) => !n.objs.includes(o));
  page().objs.push(...fresh);
  const keep = adj;
  const r = solveInk(fresh[0], true);
  // 重算後把新的筆畫接回滑竿（數字的個數一樣就不重建，拖到一半才不會斷）
  if (r && r.nums.length === keep.nums.length) { r.nums.forEach((m, j) => { m.anchor = keep.nums[j].anchor; }); keep.nums = r.nums; adj = keep; adj.seed = r.seed; adjBox.querySelectorAll('.wb-adj-row b')[i].textContent = fmt(v); } else showAdjust(r);
}
adjBox.addEventListener('input', (e) => {
  const el = e.target, i = Number(el.dataset.adj ?? el.dataset.adjn), v = Number(el.value);
  if (!Number.isInteger(i) || el.value === '') return;
  const other = adjBox.querySelector(el.dataset.adj !== undefined ? `[data-adjn="${i}"]` : `[data-adj="${i}"]`);
  if (other) { if (other.type === 'range' && v > Number(other.max)) other.max = String(v); other.value = String(v); }
  setNumber(i, v);
});
adjBox.addEventListener('change', () => { adjSnap = false; sfx.tick(); });
adjBox.addEventListener('click', (e) => { if (e.target.closest('.wb-adj-x')) { adjBox.hidden = true; syncBar(); } });
// 拖標題列移動視窗
adjBox.addEventListener('pointerdown', (e) => {
  const head = e.target.closest('.wb-adj-head');
  if (!head || e.target.closest('button')) return;
  e.preventDefault();
  const r = adjBox.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
  head.setPointerCapture(e.pointerId);
  const move = (ev) => { adjPos = { x: ev.clientX - dx, y: ev.clientY - dy }; placeAdjust(); };
  const end = () => {
    head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', end); head.removeEventListener('pointercancel', end);
    try { localStorage.setItem('ct-board-adjpos', JSON.stringify(adjPos)); } catch { /* 無痕模式 */ }
  };
  head.addEventListener('pointermove', move); head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
});
addEventListener('resize', () => { if (!adjBox.hidden) placeAdjust(); });
// 工具列的「調整」：重新打開上一次的調整視窗
$('#wb-adjust-btn').addEventListener('click', () => {
  if (!adjBox.hidden) { adjBox.hidden = true; syncBar(); return; }
  if (adj && adj.nums.length && adj.nums.every((n) => n.objs.every((o) => page().objs.includes(o)))) { adjBox.hidden = false; placeAdjust(); syncBar(); } else toast(t('wb.adjNone'));
});
async function putFormula() {
  const tex = fSrc.value.trim();
  if (!tex) { closeFormula(); return; }
  try {
    const c = fEditing ? fEditing.c : (dark() && color === COLORS[0] ? '#ffffff' : color);
    const r = await texImage(tex, c, fontPx() * 1.1);
    if (fEditing) {
      snapshot();
      // 保持原本的字體大小比例
      const k = fEditing.w / fEditing.nw;
      sel = replaceObj(fEditing, { src: r.src, tex, w: r.w * k, h: r.h * k, nw: r.w });
      save(); render();
    } else {
      addImage(r.src, r.w, r.h, { tex, c, nw: r.w });
      autoExtras(analyze(tex), bbox(sel));
      save(); render();
    }
    closeFormula();
  } catch (e) { toast(e.message || t('wb.mathFail'), 'error'); }
}
$('#wb-tex-ok').addEventListener('click', putFormula);
fSrc.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#wb-tex-ok').click(); if (e.key === 'Escape') closeFormula(); });

// ---------- 工具列 ----------
function setTool(name) {
  tool = name;
  if (tool !== 'select') sel = null;
  cv.dataset.tool = tool;
  cv.style.cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
  syncBar(); render();
}
function syncBar() {
  $$('[data-wbtool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wbtool === tool)));
  $$('[data-wbcolor]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wbcolor === color)));
  wIn.value = width;
  $('#wb-auto-ans').setAttribute('aria-pressed', String(auto.ans));
  $('#wb-auto-graph').setAttribute('aria-pressed', String(auto.graph));
  $('#wb-auto-hw').setAttribute('aria-pressed', String(auto.hw));
  $('#wb-adjust-btn').setAttribute('aria-pressed', String(!adjBox.hidden));
  $('#wb-shape-btn').setAttribute('aria-pressed', String(tool === 'shape'));
  $('#wb-fill').setAttribute('aria-pressed', String(fillOn));
  fsIn.value = textSize;
  fontSel.value = fontKey;
  // 選到文字時，工具列顯示那段文字的大小和字型
  if (sel && sel.type === 'text') { fsIn.value = sel.size; fontSel.value = sel.font || 'sans'; }
  $('#wb-width-n').textContent = width;
  const dot = $('#wb-width-dot');
  dot.style.width = dot.style.height = `${Math.max(3, Math.min(30, width * (BRUSH_W[tool] || 1) * 0.8))}px`;
  dot.style.background = color;
  if ($('#wb-color-in').value.toLowerCase() !== color.toLowerCase() && /^#[0-9a-f]{6}$/i.test(color)) $('#wb-color-in').value = color;
  const bg = page().bg, preset = Object.keys(BOARDS).find((k) => BOARDS[k] === bg.c);
  $('#wb-bgc').value = preset || 'custom';
  $('#wb-bgcolor').value = bg.c;
  $('#wb-pat').value = bg.p;
  $('#wb-duty').hidden = bg.p !== 'tw';
  $('#wb-bgimg-del').hidden = !bg.img;
  if (document.activeElement !== $('#wb-duty')) $('#wb-duty').value = bg.duty || '';
  $('#wb-page').textContent = `${state.cur + 1} / ${state.pages.length}`;
  $('#wb-undo').disabled = !undo.length;
  $('#wb-redo').disabled = !redo.length;
  $('#wb-del').disabled = !sel;
  $('#wb-rot').disabled = !(sel && sel.type === 'image');
  $('#wb-prev').disabled = state.cur === 0;
  stage.classList.toggle('chalk', dark());
}
let pinned = [];
try { pinned = JSON.parse(localStorage.getItem(COLOR_KEY) || '[]').filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 10); } catch { pinned = []; }
// 釘選的顏色排在最前面；雙擊釘選的顏色可以移除
function renderPalette() {
  const sw = (c, pin) => `<button type="button" class="wb-swatch${pin ? ' pinned' : ''}" data-wbcolor="${c}" style="--c:${c}" aria-label="${c}" title="${pin ? esc(t('wb.pinnedTip')) : c}"></button>`;
  $('#wb-colors').innerHTML = pinned.map((c) => sw(c, true)).join('') + COLORS.filter((c) => !pinned.includes(c)).map((c) => sw(c, false)).join('');
  syncBar();
}
function useColor(c) {
  color = c;
  // 選取中的物件跟著換顏色（圖片除外）
  if (sel && sel.type !== 'image') { snapshot(); sel = replaceObj(sel, { c: color }); save(); render(); }
  else if (sel && sel.mu) { snapshot(); sel = replaceObj(sel, { c: color, src: musicSrc(sel.mu, color) }); save(); render(); }
  syncBar();
}
$('#wb-colors').addEventListener('click', (e) => { const b = e.target.closest('[data-wbcolor]'); if (b) useColor(b.dataset.wbcolor); });
$('#wb-colors').addEventListener('dblclick', (e) => {
  const b = e.target.closest('.wb-swatch.pinned');
  if (!b) return;
  pinned = pinned.filter((c) => c !== b.dataset.wbcolor);
  try { localStorage.setItem(COLOR_KEY, JSON.stringify(pinned)); } catch { /* 無痕模式 */ }
  renderPalette();
});
$('#wb-color-in').addEventListener('input', (e) => useColor(e.target.value));
$('#wb-pin').addEventListener('click', () => {
  pinned = [color, ...pinned.filter((c) => c !== color)].slice(0, 10);
  try { localStorage.setItem(COLOR_KEY, JSON.stringify(pinned)); } catch { /* 無痕模式 */ }
  renderPalette();
  sfx.coin();
  toast(t('wb.pinned'), 'ok');
});
// 粗細滑桿
const wIn = $('#wb-width');
wIn.addEventListener('input', () => { width = Number(wIn.value); syncBar(); bubble(wIn, 'width'); });
// 調粗細、字體大小時，在控制項上方跳出圓形泡泡，預覽畫在白板上的實際大小
const bub = document.createElement('div');
bub.className = 'wb-bubble';
bub.setAttribute('aria-hidden', 'true');
document.body.append(bub);
let bubT = 0;
function bubble(anchor, kind) {
  const k = cv.getBoundingClientRect().width / W || 1;
  if (kind === 'width') {
    const d = Math.max(2, width * (BRUSH_W[tool] || 1) * k);
    bub.innerHTML = `<i style="width:${d}px;height:${d}px;background:${color};opacity:${tool === 'hl' ? 0.35 : tool === 'water' ? 0.4 : 1}"></i><b>${width}</b>`;
  } else {
    const f = Math.max(8, textSize * k);
    bub.innerHTML = `<span style="font-size:${Math.min(f, 64)}px;font-family:${FONTS[fontKey].replace(/"/g, "'")};color:${color === '#ffffff' ? '#12232e' : color}">字A</span><b>${textSize}px</b>`;
  }
  const r = anchor.getBoundingClientRect();
  bub.style.left = `${r.left + r.width / 2}px`;
  bub.style.top = `${r.top}px`;
  bub.classList.add('show');
  clearTimeout(bubT);
  bubT = setTimeout(() => bub.classList.remove('show'), 1100);
}
$$('[data-wbtool]').forEach((b) => b.addEventListener('click', () => { commitText(); setTool(b.dataset.wbtool); }));
const shapeMenu = $('#wb-shapes');
$$('[data-shape]').forEach((b) => b.addEventListener('click', () => {
  shapeKind = b.dataset.shape;
  $('#wb-shape-btn').innerHTML = b.innerHTML;
  shapeMenu.hidden = true;
  setTool('shape');
}));
$('#wb-shape-btn').addEventListener('click', (e) => { e.stopPropagation(); shapeMenu.hidden = !shapeMenu.hidden; if (tool !== 'shape') setTool('shape'); });
document.addEventListener('click', (e) => { if (!e.target.closest('.wb-shape-wrap')) shapeMenu.hidden = true; });
$('#wb-fill').addEventListener('click', () => {
  fillOn = !fillOn;
  if (sel && sel.type === 'shape') { snapshot(); sel = replaceObj(sel, { fill: fillOn }); save(); render(); }
  syncBar();
});
// 文字大小、字型：選取中的文字跟著改
const fsIn = $('#wb-fsize'), fontSel = $('#wb-font');
fsIn.addEventListener('input', () => { const v = Math.round(Number(fsIn.value)); if (v >= 12 && v <= 200) { textSize = v; bubble(fsIn, 'text'); } });
fsIn.addEventListener('change', () => {
  textSize = Math.max(12, Math.min(200, Math.round(Number(fsIn.value)) || 42));
  if (sel && sel.type === 'text') { snapshot(); sel = replaceObj(sel, { size: textSize }); save(); render(); }
  syncBar();
});
fontSel.addEventListener('change', () => {
  fontKey = fontSel.value;
  if (sel && sel.type === 'text') { snapshot(); sel = replaceObj(sel, { font: fontKey }); save(); render(); }
  if (editingText) txt.style.fontFamily = FONTS[fontKey];
  syncBar();
  bubble(fontSel, 'text');
});
function setBg(patch) {
  snapshot();
  const was = dark();
  page().bg = { ...page().bg, ...patch };
  // 換到深色板子時，深色筆自動換白色（反之亦然）
  if (!was && dark() && color === COLORS[0]) color = '#ffffff';
  if (was && !dark() && color === '#ffffff') color = COLORS[0];
  save(); render(); syncBar();
}
$('#wb-bgc').addEventListener('change', (e) => {
  if (e.target.value === 'custom') { $('#wb-bgcolor').click(); syncBar(); return; }
  setBg({ c: BOARDS[e.target.value], img: '', imgDark: false });
});
$('#wb-bgcolor').addEventListener('input', (e) => setBg({ c: e.target.value, img: '', imgDark: false }));
$('#wb-pat').addEventListener('change', (e) => setBg({ p: e.target.value }));
// 上傳底圖：裁成 16:10 填滿白板，順便算平均亮度決定筆的預設顏色
$('#wb-bgimg').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f); });
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), k = Math.max(W / im.width, H / im.height), w = im.width * k, h = im.height * k;
    g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
    const px = g.getImageData(0, 0, W, H).data;
    let sum = 0, n = 0;
    for (let i = 0; i < px.length; i += 4 * 97) { sum += (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255; n++; }
    setBg({ img: c.toDataURL('image/jpeg', 0.82), imgDark: sum / n < 0.45 });
    sfx.coin();
  } catch { toast(t('wb.imgFail'), 'error'); }
});
$('#wb-bgimg-del').addEventListener('click', () => setBg({ img: '', imgDark: false }));
$('#wb-duty').addEventListener('change', (e) => setBg({ duty: e.target.value.trim().slice(0, 12) }));
$('#wb-undo').addEventListener('click', () => restore(undo, redo));
$('#wb-redo').addEventListener('click', () => restore(redo, undo));
function delSel() {
  if (!sel) return;
  snapshot();
  page().objs = page().objs.filter((o) => o !== sel);
  sel = null;
  save(); render(); syncBar();
}
$('#wb-del').addEventListener('click', delSel);
$('#wb-clear').addEventListener('click', async () => {
  if (!page().objs.length || !await askConfirm(t('wb.clearConfirm'))) return;
  snapshot();
  page().objs = [];
  sel = null;
  save(); render(); syncBar();
});
$('#wb-clearall').addEventListener('click', async () => {
  if (!await askConfirm(t('wb.clearAllConfirm', { n: state.pages.length }))) return;
  state = { pages: [{ bg: { ...page().bg }, objs: [] }], cur: 0 };
  undo.length = 0; redo.length = 0;
  sel = null;
  save(); render(); syncBar();
  sfx.powerDown();
});
$('#wb-prev').addEventListener('click', () => { if (state.cur > 0) { commitText(); state.cur--; sel = null; save(); render(); syncBar(); } });
$('#wb-next').addEventListener('click', () => {
  commitText();
  // 最後一頁再按「下一頁」就新增一頁
  if (state.cur === state.pages.length - 1) state.pages.push({ bg: { ...page().bg }, objs: [] });
  state.cur++;
  sel = null;
  save(); render(); syncBar();
});
$('#wb-delpage').addEventListener('click', async () => {
  if (state.pages.length === 1) { $('#wb-clear').click(); return; }
  if (!await askConfirm(t('wb.delPageConfirm', { n: state.cur + 1 }))) return;
  state.pages.splice(state.cur, 1);
  state.cur = Math.min(state.cur, state.pages.length - 1);
  undo.length = 0; redo.length = 0;
  sel = null;
  save(); render(); syncBar();
});
$('#wb-formula-btn').addEventListener('click', () => openFormula());
$('#wb-png').addEventListener('click', () => {
  const keep = sel;
  sel = null; render();
  cv.toBlob((b) => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: `whiteboard_${state.cur + 1}.png` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  sel = keep; render();
});
$('#wb-full').addEventListener('click', () => {
  const el = $('.wb');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
});
document.addEventListener('fullscreenchange', () => setTimeout(resize, 50));
document.addEventListener('keydown', (e) => {
  if (panel.hidden || e.target.closest('input, textarea, select') || fBox.classList.contains('open')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); delSel(); }
  if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && sel && sel.type === 'image') { e.preventDefault(); rotateSel(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); restore(e.shiftKey ? redo : undo, e.shiftKey ? undo : redo); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); restore(redo, undo); }
});

// ---------- 右側：計算機 ----------
let ans = 0, deg = true;
const calcIn = $('#wb-calc-in'), calcOut = $('#wb-calc-out'), calcHist = $('#wb-calc-hist');
const hist = [];
function calcLive() {
  const s = calcIn.value.trim();
  if (!s) { calcOut.textContent = ''; return; }
  try { const v = evaluate(s, { ans, deg }); calcOut.textContent = `= ${fmt(v)}`; calcOut.classList.remove('err'); } catch { calcOut.textContent = ''; }
}
function calcRun() {
  const s = calcIn.value.trim();
  if (!s) return;
  try {
    const v = evaluate(s, { ans, deg });
    const f = toFraction(v);
    ans = v;
    hist.unshift({ s, v: fmt(v), f: f ? `${f.n}/${f.d}` : '' });
    hist.length = Math.min(hist.length, 30);
    renderHist();
    calcIn.value = '';
    calcOut.textContent = `= ${fmt(v)}`;
    sfx.tick();
  } catch { calcOut.textContent = t('wb.calcErr'); calcOut.classList.add('err'); sfx.bump(); }
}
function renderHist() {
  calcHist.innerHTML = hist.map((h, i) => `<li><button type="button" class="wb-hist" data-i="${i}" title="${esc(t('wb.reuse'))}"><span>${esc(h.s)}</span><b>= ${esc(h.v)}${h.f ? ` <small>(${esc(h.f)})</small>` : ''}</b></button>
    <button type="button" class="btn btn-small icon-btn" data-put="${i}" title="${esc(t('wb.toBoard'))}" aria-label="${esc(t('wb.toBoard'))}"><i class="fa-solid fa-share-from-square" aria-hidden="true"></i></button></li>`).join('');
}
calcIn.addEventListener('input', calcLive);
calcIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); calcRun(); } });
$('#wb-keys').addEventListener('click', (e) => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  const k = b.dataset.k;
  if (k === '=') calcRun();
  else if (k === 'C') { calcIn.value = ''; calcOut.textContent = ''; }
  else if (k === 'BS') calcIn.value = calcIn.value.slice(0, -1);
  else calcIn.setRangeText(k, calcIn.selectionStart ?? calcIn.value.length, calcIn.selectionEnd ?? calcIn.value.length, 'end');
  calcLive();
  if (matchMedia('(pointer: fine)').matches) calcIn.focus();
});
$('#wb-deg').addEventListener('click', () => { deg = !deg; $('#wb-deg').textContent = deg ? 'DEG' : 'RAD'; calcLive(); });
calcHist.addEventListener('click', (e) => {
  const re = e.target.closest('.wb-hist'), put = e.target.closest('[data-put]');
  if (re) { calcIn.value = hist[re.dataset.i].s; calcLive(); calcIn.focus(); }
  if (put) { const h = hist[put.dataset.put]; addText(`${h.s} = ${h.v}`); }
});

// ---------- 右側：函數圖形 ----------
const GC = ['#1b8fd6', '#e5484d', '#22a06b'];
const gPrev = $('#wb-graph-cv');
function panelGraph() {
  const num = (id, d) => { const v = Number($(id).value); return Number.isFinite(v) && $(id).value !== '' ? v : d; };
  return { fns: $$('.wb-fx').map((i, k) => ({ s: i.value.trim(), c: GC[k] })).filter((f) => f.s), x0: num('#wb-gx0', -10), x1: num('#wb-gx1', 10), y0: num('#wb-gy0', NaN), y1: num('#wb-gy1', NaN) };
}
function graphTo(c, wPx, hPx, onDark, opt = panelGraph()) {
  const g = c.getContext('2d');
  c.width = wPx; c.height = hPx;
  let { x0, x1 } = opt;
  if (!(x1 > x0)) [x0, x1] = [-10, 10];
  const fns = opt.fns.map((f) => {
    try { return { ...f, fn: compile(f.s.replace(/^y\s*=\s*/i, '')) }; } catch { return { ...f, bad: true }; }
  });
  // y 範圍：有填就用，沒填就依函數值自動決定
  let { y0, y1 } = opt;
  const N = Math.round(wPx);
  const vals = fns.map((f) => (f.bad ? [] : Array.from({ length: N + 1 }, (_, i) => { const x = x0 + ((x1 - x0) * i) / N; try { return f.fn({ x, deg: false, ans }); } catch { return NaN; } })));
  if (!Number.isFinite(y0) || !Number.isFinite(y1) || y1 <= y0) {
    const all = vals.flat().filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (all.length) { y0 = all[Math.floor(all.length * 0.02)]; y1 = all[Math.ceil(all.length * 0.98) - 1]; } else { y0 = -10; y1 = 10; }
    if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
  }
  const X = (x) => ((x - x0) / (x1 - x0)) * wPx, Y = (y) => hPx - ((y - y0) / (y1 - y0)) * hPx;
  g.clearRect(0, 0, wPx, hPx); // 透明底：放到白板不會蓋住下面的東西
  const step = (lo, hi) => { const r = (hi - lo) / 8, p = 10 ** Math.floor(Math.log10(r)), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
  const sx = step(x0, x1), sy = step(y0, y1);
  const fs = Math.round(hPx / 32);
  g.font = `${fs}px ${FONT_FAMILY}`;
  g.lineWidth = 1;
  g.strokeStyle = onDark ? 'rgba(255,255,255,.15)' : '#e6eef1';
  g.fillStyle = onDark ? 'rgba(255,255,255,.7)' : '#5f707b';
  for (let x = Math.ceil(x0 / sx) * sx; x <= x1; x += sx) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), hPx); g.stroke(); }
  for (let y = Math.ceil(y0 / sy) * sy; y <= y1; y += sy) { g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(wPx, Y(y)); g.stroke(); }
  // 座標軸
  g.strokeStyle = onDark ? '#ffffff' : '#12232e';
  g.lineWidth = Math.max(1.5, hPx / 300);
  const ax = Math.min(Math.max(Y(0), 0), hPx), ay = Math.min(Math.max(X(0), 0), wPx);
  g.beginPath(); g.moveTo(0, ax); g.lineTo(wPx, ax); g.moveTo(ay, 0); g.lineTo(ay, hPx); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let x = Math.ceil(x0 / sx) * sx; x <= x1; x += sx) if (Math.abs(x) > sx / 2) g.fillText(fmt(Number(x.toPrecision(6))), X(x), Math.min(ax + 4, hPx - fs - 2));
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let y = Math.ceil(y0 / sy) * sy; y <= y1; y += sy) if (Math.abs(y) > sy / 2) g.fillText(fmt(Number(y.toPrecision(6))), Math.max(ay - 6, fs * 2.5), Y(y));
  // 函數曲線（跳太大的地方斷開，例如 tan、1/x）
  g.lineWidth = Math.max(2.5, hPx / 160);
  fns.forEach((f, k) => {
    if (f.bad) return;
    g.strokeStyle = f.c;
    g.beginPath();
    let pen = false;
    vals[k].forEach((v, i) => {
      if (!Number.isFinite(v)) { pen = false; return; }
      const px = (i / N) * wPx, py = Y(v);
      if (pen && Math.abs(py - Y(vals[k][i - 1])) > hPx * 2) pen = false;
      if (pen) g.lineTo(px, py); else { g.moveTo(px, py); pen = true; }
    });
    g.stroke();
    // 方程式的解：在 x 軸上畫點並標數字
    (opt.roots || []).forEach((r) => {
      g.beginPath(); g.arc(X(r), Y(0), Math.max(5, hPx / 110), 0, Math.PI * 2); g.fillStyle = '#e5484d'; g.fill();
      g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(`x = ${fmt(r)}`, X(r), Y(0) - hPx / 60);
    });
    g.fillStyle = f.c; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(`y = ${pretty(f.s.replace(/^y\s*=\s*/i, ''))}`, fs, fs * (0.6 + k * 1.3));
  });
  return fns.some((f) => f.bad);
}
function graphPreview() {
  const bad = graphTo(gPrev, 600, 400, false);
  $('#wb-graph-err').textContent = bad ? t('wb.graphErr') : '';
}
$$('#wb-graph input').forEach((i) => i.addEventListener('input', graphPreview));
$('#wb-graph-put').addEventListener('click', () => {
  if (!$$('.wb-fx').some((i) => i.value.trim())) { sfx.bump(); return; }
  const c = document.createElement('canvas');
  graphTo(c, 1200, 800, dark());
  addImage(c.toDataURL('image/png'), 900, 600);
});

// ---------- 右側：亂數出題 ----------
let quiz = [];
function renderQuiz() {
  const show = $('#wb-q-ans').checked;
  $('#wb-q-list').innerHTML = quiz.map((q, i) => `<li><span class="muted">(${i + 1})</span> ${esc(plain(q.q))}${q.eq ? '' : ' ='}${show ? ` <b>${esc(plain(q.a))}</b>` : ''}</li>`).join('');
  $('#wb-q-put').disabled = !quiz.length;
  $('#wb-q-put-ans').disabled = !quiz.length;
}
$('#wb-q-make').addEventListener('click', () => {
  quiz = makeQuiz($('#wb-q-type').value, Number($('#wb-q-n').value) || 5, Number($('#wb-q-d').value) || 2, $('#wb-q-neg').checked);
  renderQuiz();
  sfx.jump();
});
$('#wb-q-ans').addEventListener('change', renderQuiz);
// 整組題目做成一個公式放到白板；公式引擎載入失敗就改放文字
async function putQuiz(withAns) {
  if (!quiz.length) return;
  const rows = quiz.map((q, i) => `(${i + 1})\\;& ${q.q}${q.eq ? (withAns ? `\\quad \\Rightarrow\\; ${q.a}` : '') : ` = ${withAns ? q.a : '\\underline{\\qquad}'}`}`);
  const cols = quiz.length > 6 ? 2 : 1;
  let tex;
  if (cols === 1) tex = `\\begin{aligned}${rows.join('\\\\[6pt]')}\\end{aligned}`;
  else {
    const half = Math.ceil(rows.length / 2);
    const lines = Array.from({ length: half }, (_, i) => `${rows[i]} & \\qquad ${rows[i + half] ? rows[i + half].replace('\\;&', '\\;&') : ''}`);
    tex = `\\begin{aligned}${lines.join('\\\\[6pt]')}\\end{aligned}`;
  }
  try {
    const c = dark() && color === COLORS[0] ? '#ffffff' : color;
    const r = await texImage(tex, c, fontPx());
    addImage(r.src, r.w, r.h, { tex, c, nw: r.w });
  } catch {
    addText(quiz.map((q, i) => `(${i + 1}) ${plain(q.q)}${q.eq ? (withAns ? `  → ${plain(q.a)}` : '') : ` = ${withAns ? plain(q.a) : '____'}`}`).join('\n'));
  }
}
$('#wb-q-put').addEventListener('click', () => putQuiz(false));
$('#wb-q-put-ans').addEventListener('click', () => putQuiz(true));

// 選取的圖片轉 90°
function rotateSel() {
  if (!sel || sel.type !== 'image') return;
  snapshot();
  sel = replaceObj(sel, { rot: ((sel.rot || 0) + 90) % 360 });
  save(); render(); sfx.tick();
}
$('#wb-rot').addEventListener('click', rotateSel);

// 以前放在白板上的音樂符號（現在改到「課程套件」）：換顏色時要重畫
const musicSrc = (k, c) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(musicSvg(k, c))}`;

// ---------- 右側分頁 ----------
$$('[data-wbside]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-wbside]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $$('.wb-pane').forEach((p) => { p.hidden = p.id !== `wb-${b.dataset.wbside}`; });
  if (b.dataset.wbside === 'graph') graphPreview();
}));

// ---------- 啟動 ----------
// 白板分頁第一次顯示時才量尺寸（隱藏時寬度是 0）
new ResizeObserver(() => { if (!panel.hidden) resize(); }).observe(stage);
if (COLORS.includes(color) && dark()) color = '#ffffff';
renderPalette();
setTool('pen');
syncBar();
