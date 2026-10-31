// 白板和電路圖共用的畫筆：筆畫（原子筆、鉛筆、毛筆、水彩、螢光筆）、直線、箭頭、形狀、雷射筆，
// 以及點選／橡皮擦用的碰撞判斷。g 是 canvas 的 2D context，scale 是畫布縮放（水彩的暈開要用）
export const BRUSH_W = { pen: 1, pencil: 0.8, brush: 1.8, water: 3, hl: 4 };
export const BRUSHES = Object.keys(BRUSH_W);
export const INK_TYPES = ['stroke', 'line', 'arrow', 'shape', 'rect', 'ellipse'];

// 用中點畫二次曲線，線條比較圓滑
export function strokePath(g, p) {
  g.beginPath();
  g.moveTo(p[0], p[1]);
  if (p.length === 2) g.lineTo(p[0] + 0.1, p[1]);
  for (let i = 2; i < p.length - 2; i += 2) g.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
  if (p.length > 2) g.lineTo(p[p.length - 2], p[p.length - 1]);
}
export function drawStroke(g, o, scale = 1) {
  const p = o.pts, kind = o.brush || (o.hl ? 'hl' : 'pen');
  if (kind === 'brush' && p.length > 4) {
    // 毛筆：寫得快線條細、慢就粗；起筆、收筆尖尖的
    const n = p.length / 2;
    let lw = o.w;
    for (let i = 2; i < p.length; i += 2) {
      const d = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]), k = i / 2 / n;
      const taper = Math.min(1, k * 5 + 0.2, (1 - k) * 5 + 0.12);
      lw = lw * 0.75 + o.w * Math.max(0.3, Math.min(1.4, 1.45 - d / 22)) * taper * 0.25;
      g.lineWidth = Math.max(0.8, lw);
      g.beginPath(); g.moveTo(p[i - 2], p[i - 1]); g.lineTo(p[i], p[i + 1]); g.stroke();
    }
    return;
  }
  if (kind === 'pencil') {
    // 鉛筆：淡一點，再疊兩條錯開的細線做出筆芯顆粒感
    g.globalAlpha = 0.78; strokePath(g, p); g.stroke();
    g.globalAlpha = 0.28; g.lineWidth = Math.max(0.8, o.w * 0.45);
    g.translate(0.9, 0.7); strokePath(g, p); g.stroke();
    g.translate(-1.8, -1.4); strokePath(g, p); g.stroke();
    return;
  }
  if (kind === 'water') {
    // 水彩：半透明、邊緣暈開，重疊的地方會比較深
    g.globalAlpha = 0.2; g.shadowColor = o.c; g.shadowBlur = o.w * scale * 0.9;
    strokePath(g, p); g.stroke();
    g.shadowBlur = 0; g.globalAlpha = 0.16; g.lineWidth = o.w * 0.55;
    strokePath(g, p); g.stroke();
    return;
  }
  g.globalAlpha = kind === 'hl' ? 0.35 : 1;
  strokePath(g, p);
  g.stroke();
}
// 形狀的路徑：在拖出來的方框裡畫三角形、星星…（按住 Shift 會是正的）
export function shapePath(g, o) {
  const x0 = Math.min(o.x1, o.x2), y0 = Math.min(o.y1, o.y2), w = Math.abs(o.x2 - o.x1), h = Math.abs(o.y2 - o.y1);
  const cx = x0 + w / 2, cy = y0 + h / 2;
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  const regular = (n, inner = 0) => {
    const pts = [];
    const m = inner ? n * 2 : n;
    for (let i = 0; i < m; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / m, r = inner && i % 2 ? inner : 1;
      pts.push([cx + (w / 2) * r * Math.cos(a), cy + (h / 2) * r * Math.sin(a)]);
    }
    poly(pts);
  };
  switch (o.kind) {
    case 'ellipse': g.beginPath(); g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'tri': poly([[cx, y0], [x0 + w, y0 + h], [x0, y0 + h]]); break;
    case 'rtri': poly([[x0, y0], [x0, y0 + h], [x0 + w, y0 + h]]); break;
    case 'diamond': poly([[cx, y0], [x0 + w, cy], [cx, y0 + h], [x0, cy]]); break;
    case 'pent': regular(5); break;
    case 'hex': regular(6); break;
    case 'star': regular(5, 0.42); break;
    case 'heart':
      g.beginPath();
      g.moveTo(cx, y0 + h * 0.3);
      g.bezierCurveTo(cx, y0, x0, y0, x0, y0 + h * 0.33);
      g.bezierCurveTo(x0, y0 + h * 0.62, cx, y0 + h * 0.78, cx, y0 + h);
      g.bezierCurveTo(cx, y0 + h * 0.78, x0 + w, y0 + h * 0.62, x0 + w, y0 + h * 0.33);
      g.bezierCurveTo(x0 + w, y0, cx, y0, cx, y0 + h * 0.3);
      g.closePath();
      break;
    case 'para': { const k = w * 0.22; poly([[x0 + k, y0], [x0 + w, y0], [x0 + w - k, y0 + h], [x0, y0 + h]]); break; }
    case 'trap': { const k = w * 0.22; poly([[x0 + k, y0], [x0 + w - k, y0], [x0 + w, y0 + h], [x0, y0 + h]]); break; }
    default: g.beginPath(); g.rect(x0, y0, w, h);
  }
}
// 筆畫類的物件（筆畫、直線、箭頭、形狀）；呼叫前後自己 save / restore
export function drawInk(g, o, scale = 1) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = o.c; g.fillStyle = o.c; g.lineWidth = o.w;
  if (o.type === 'stroke') drawStroke(g, o, scale);
  else if (o.type === 'line' || o.type === 'arrow') {
    g.beginPath(); g.moveTo(o.x1, o.y1); g.lineTo(o.x2, o.y2); g.stroke();
    if (o.type === 'arrow') {
      const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = 14 + o.w * 2.5;
      g.beginPath();
      g.moveTo(o.x2, o.y2);
      g.lineTo(o.x2 - L * Math.cos(a - 0.45), o.y2 - L * Math.sin(a - 0.45));
      g.lineTo(o.x2 - L * Math.cos(a + 0.45), o.y2 - L * Math.sin(a + 0.45));
      g.closePath(); g.fill();
    }
  } else if (o.type === 'shape') {
    shapePath(g, o);
    if (o.fill) { g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1; }
    g.stroke();
  } else if (o.type === 'rect') {
    g.strokeRect(Math.min(o.x1, o.x2), Math.min(o.y1, o.y2), Math.abs(o.x2 - o.x1), Math.abs(o.y2 - o.y1));
  } else if (o.type === 'ellipse') {
    g.beginPath();
    g.ellipse((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2, Math.abs(o.x2 - o.x1) / 2, Math.abs(o.y2 - o.y1) / 2, 0, 0, Math.PI * 2);
    g.stroke();
  }
}
export function inkBox(o) {
  if (o.type === 'stroke') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < o.pts.length; i += 2) { x0 = Math.min(x0, o.pts[i]); x1 = Math.max(x1, o.pts[i]); y0 = Math.min(y0, o.pts[i + 1]); y1 = Math.max(y1, o.pts[i + 1]); }
    const p = o.w / 2;
    return { x: x0 - p, y: y0 - p, w: x1 - x0 + 2 * p, h: y1 - y0 + 2 * p };
  }
  return { x: Math.min(o.x1, o.x2) - o.w, y: Math.min(o.y1, o.y2) - o.w, w: Math.abs(o.x2 - o.x1) + 2 * o.w, h: Math.abs(o.y2 - o.y1) + 2 * o.w };
}
export function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
  const k = l ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0;
  return Math.hypot(px - (x1 + k * dx), py - (y1 + k * dy));
}
// edgeOnly：沒填滿的形狀只有點到框線才算（框框裡面還可以繼續畫）
export function inkHit(o, x, y, pad = 10, edgeOnly = true) {
  if (o.type === 'stroke') {
    for (let i = 0; i < o.pts.length - 2; i += 2) if (distSeg(x, y, o.pts[i], o.pts[i + 1], o.pts[i + 2], o.pts[i + 3]) < o.w / 2 + pad) return true;
    return o.pts.length === 2 && Math.hypot(x - o.pts[0], y - o.pts[1]) < o.w / 2 + pad;
  }
  if (o.type === 'line' || o.type === 'arrow') return distSeg(x, y, o.x1, o.y1, o.x2, o.y2) < o.w / 2 + pad;
  const b = inkBox(o);
  const inX = x > b.x - pad && x < b.x + b.w + pad, inY = y > b.y - pad && y < b.y + b.h + pad;
  if ((o.type === 'shape' && o.fill) || !edgeOnly) return inX && inY;
  const nearEdge = Math.abs(x - b.x) < pad + o.w || Math.abs(x - b.x - b.w) < pad + o.w || Math.abs(y - b.y) < pad + o.w || Math.abs(y - b.y - b.h) < pad + o.w;
  return inX && inY && nearEdge;
}
export function inkMoved(o, dx, dy) {
  if (o.type === 'stroke') return { pts: o.pts.map((v, i) => v + (i % 2 ? dy : dx)) };
  return { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
}

// 雷射筆：軌跡 0.9 秒後淡出；redraw 是畫布重畫的函式
export function createLaser(redraw) {
  const MS = 900;
  let pts = [], raf = 0;
  const loop = () => {
    const now = performance.now();
    pts = pts.filter((q) => now - q.t < MS);
    redraw();
    raf = pts.length ? requestAnimationFrame(loop) : 0;
  };
  return {
    add(p) { pts.push({ x: p.x, y: p.y, t: performance.now() }); if (!raf) raf = requestAnimationFrame(loop); },
    draw(g, scale = 1) {
      if (!pts.length) return;
      const now = performance.now();
      g.save();
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.shadowColor = '#ff2d2d'; g.shadowBlur = 14 * scale;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], k = 1 - (now - b.t) / MS;
        if (Math.hypot(b.x - a.x, b.y - a.y) > 200) continue; // 換位置時不要連線
        g.strokeStyle = `rgba(255, 45, 45, ${Math.max(0, k)})`;
        g.lineWidth = 3 + 7 * k;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      const h = pts[pts.length - 1];
      if (now - h.t < 300) { g.fillStyle = '#fff'; g.beginPath(); g.arc(h.x, h.y, 6, 0, Math.PI * 2); g.fill(); }
      g.restore();
    },
  };
}
