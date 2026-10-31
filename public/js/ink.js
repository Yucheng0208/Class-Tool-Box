// 白板手寫算式：把筆畫切成一個個符號，用點雲比對（$P）認出數字和運算符號，再依位置組成算式。
// 同一套手寫字形也拿來把答案「寫」回白板上。全部在瀏覽器裡算，不連網路。

// ---------- 手寫字形 ----------
// 座標以字高為 1：y=0 是數字頂端、y=1 是基線；w 是字寬。c：用曲線連（否則是折線）
const ell = (cx, cy, rx, ry, from = -Math.PI / 2) => {
  const p = [];
  for (let i = 0; i <= 14; i++) { const a = from - (i / 14) * Math.PI * 2; p.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a)); }
  return p;
};
const GLYPHS = {
  0: { w: 0.66, c: 1, s: [ell(0.33, 0.5, 0.27, 0.5)] },
  1: { w: 0.45, s: [[0.1, 0.22, 0.3, 0, 0.3, 1]] },
  2: { w: 0.62, c: 1, s: [[0.06, 0.24, 0.22, 0.04, 0.42, 0, 0.6, 0.1, 0.62, 0.3, 0.45, 0.55, 0.04, 1, 0.62, 1]] },
  3: { w: 0.6, c: 1, s: [[0.06, 0.12, 0.3, 0, 0.53, 0.08, 0.56, 0.28, 0.3, 0.46, 0.58, 0.62, 0.58, 0.85, 0.36, 1, 0.04, 0.9]] },
  4: { w: 0.66, s: [[0.48, 1, 0.48, 0, 0.02, 0.7, 0.66, 0.7]] },
  5: { w: 0.6, c: 1, s: [[0.56, 0, 0.12, 0, 0.08, 0.44, 0.36, 0.38, 0.58, 0.5, 0.6, 0.78, 0.4, 0.98, 0.04, 0.92]] },
  6: { w: 0.62, c: 1, s: [[0.55, 0.04, 0.3, 0.04, 0.1, 0.3, 0.05, 0.66, 0.2, 0.96, 0.42, 1, 0.6, 0.86, 0.6, 0.62, 0.42, 0.48, 0.2, 0.5, 0.06, 0.66]] },
  7: { w: 0.6, s: [[0.02, 0, 0.6, 0, 0.22, 1]] },
  8: { w: 0.62, c: 1, s: [[0.31, 0.48, 0.08, 0.32, 0.1, 0.06, 0.31, 0, 0.53, 0.06, 0.55, 0.32, 0.31, 0.48, 0.04, 0.68, 0.08, 0.94, 0.31, 1, 0.56, 0.94, 0.6, 0.68, 0.31, 0.48]] },
  9: { w: 0.62, c: 1, s: [[0.58, 0.3, 0.42, 0.48, 0.16, 0.46, 0.04, 0.24, 0.2, 0.02, 0.44, 0, 0.6, 0.18, 0.58, 0.6, 0.46, 1]] },
  x: { w: 0.62, s: [[0.04, 0.38, 0.6, 1], [0.6, 0.38, 0.04, 1]] },
  y: { w: 0.62, s: [[0.04, 0.38, 0.34, 0.89], [0.6, 0.38, 0.12, 1.32]] },
  '+': { w: 0.66, s: [[0.06, 0.62, 0.62, 0.62], [0.34, 0.34, 0.34, 0.9]] },
  '-': { w: 0.56, s: [[0.06, 0.62, 0.5, 0.62]] },
  '=': { w: 0.66, s: [[0.06, 0.5, 0.6, 0.5], [0.06, 0.76, 0.6, 0.76]] },
  '.': { w: 0.3, s: [[0.12, 0.96, 0.15, 1]] },
  ',': { w: 0.32, s: [[0.18, 0.92, 0.06, 1.16]] },
  '/': { w: 0.5, s: [[0.46, 0, 0.04, 1]] },
  '(': { w: 0.4, c: 1, s: [[0.34, -0.06, 0.1, 0.3, 0.08, 0.7, 0.34, 1.08]] },
  ')': { w: 0.4, c: 1, s: [[0.06, -0.06, 0.3, 0.3, 0.32, 0.7, 0.06, 1.08]] },
  '≈': { w: 0.66, c: 1, s: [[0.04, 0.54, 0.2, 0.44, 0.44, 0.58, 0.62, 0.46], [0.04, 0.8, 0.2, 0.7, 0.44, 0.84, 0.62, 0.72]] },
  '√': { w: 0.7, s: [[0, 0.62, 0.12, 0.54, 0.3, 1, 0.66, -0.02]] },
  '✓': { w: 0.8, s: [[0.04, 0.55, 0.3, 0.92, 0.78, 0.02]] },
  '✗': { w: 0.8, s: [[0.06, 0.1, 0.74, 0.95], [0.74, 0.1, 0.06, 0.95]] },
  ' ': { w: 0.32, s: [] },
};
export const canWrite = (s) => [...s].every((ch) => GLYPHS[ch]);

// Catmull-Rom：穿過每個控制點的平滑曲線
function smooth(p, per = 6) {
  const n = p.length / 2;
  if (n < 3) return p.slice();
  const P = (i) => { const k = Math.max(0, Math.min(n - 1, i)); return [p[k * 2], p[k * 2 + 1]]; };
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = P(i - 1), [x1, y1] = P(i), [x2, y2] = P(i + 1), [x3, y3] = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push(0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3),
        0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3));
    }
  }
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}
// 直線段補點，筆畫看起來才像一筆一筆寫的
function dense(p, per = 5) {
  const out = [];
  for (let i = 0; i < p.length - 2; i += 2) for (let k = 0; k < per; k++) out.push(p[i] + ((p[i + 2] - p[i]) * k) / per, p[i + 1] + ((p[i + 3] - p[i + 1]) * k) / per);
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}
const glyphStrokes = (g) => g.s.map((s) => (g.c ? smooth(s) : dense(s)));

// 把一串字「寫」成筆畫：x、top 是左上角，size 是字高；回傳 { strokes: [點陣列…], w }
export function handwrite(str, x, top, size) {
  const strokes = [];
  let cx = x;
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (!g) continue;
    // 每個字稍微不一樣：一點傾斜、大小和上下的晃動
    const slant = 0.08 + (Math.random() - 0.5) * 0.06, k = size * (0.95 + Math.random() * 0.1), dy = (Math.random() - 0.5) * size * 0.05;
    for (const s of glyphStrokes(g)) {
      const pts = [];
      for (let i = 0; i < s.length; i += 2) {
        const gx = s[i] + (1 - s[i + 1]) * slant, gy = s[i + 1];
        pts.push(Math.round((cx + gx * k + (Math.random() - 0.5) * size * 0.012) * 10) / 10, Math.round((top + dy + gy * k + (Math.random() - 0.5) * size * 0.012) * 10) / 10);
      }
      strokes.push(pts);
    }
    cx += (g.w + 0.12) * size;
  }
  return { strokes, w: cx - x };
}

// ---------- $P 點雲辨識 ----------
const NP = 32;
function cloud(strokes) {
  // 所有筆畫接起來沿路徑等距取 NP 個點
  const pts = [];
  strokes.forEach((s, id) => { for (let i = 0; i < s.length; i += 2) pts.push({ x: s[i], y: s[i + 1], id }); });
  let len = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].id === pts[i - 1].id) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const I = len / (NP - 1) || 1, out = [pts[0]];
  let D = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].id !== pts[i - 1].id) continue;
    let d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    while (D + d >= I && d > 0) {
      const t = (I - D) / d, q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y), id: pts[i].id };
      out.push(q); pts[i - 1] = q; d = Math.hypot(pts[i].x - q.x, pts[i].y - q.y); D = 0;
      if (out.length >= NP) break;
    }
    if (out.length >= NP) break;
    D += d;
  }
  while (out.length < NP) out.push(pts[pts.length - 1]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  out.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
  const sc = Math.max(x1 - x0, y1 - y0) || 1;
  const cx = out.reduce((a, p) => a + p.x, 0) / NP, cy = out.reduce((a, p) => a + p.y, 0) / NP;
  return { p: out.map((q) => ({ x: (q.x - cx) / sc, y: (q.y - cy) / sc })), ar: Math.log(((x1 - x0) || 1e-3) / ((y1 - y0) || 1e-3)), n: strokes.length };
}
function cloudDist(a, b, start) {
  const used = new Uint8Array(NP);
  let sum = 0, i = start;
  do {
    let min = Infinity, idx = 0;
    for (let j = 0; j < NP; j++) if (!used[j]) { const d = (a[i].x - b[j].x) ** 2 + (a[i].y - b[j].y) ** 2; if (d < min) { min = d; idx = j; } }
    used[idx] = 1;
    sum += (1 - ((i - start + NP) % NP) / NP) * Math.sqrt(min);
    i = (i + 1) % NP;
  } while (i !== start);
  return sum;
}
function match(a, b) {
  let min = Infinity;
  for (let i = 0; i < NP; i += Math.floor(Math.sqrt(NP))) min = Math.min(min, cloudDist(a.p, b.p, i), cloudDist(b.p, a.p, i));
  return min + Math.abs(a.ar - b.ar) * 0.9; // 長寬比差很多也算不像（例如 1 和 (）
}
// 範本：用上面的字形，再加幾種常見的寫法
const VARIANTS = {
  0: [[ell(0.33, 0.5, 0.27, 0.5, Math.PI / 2)]],
  1: [[[0.3, 0, 0.3, 1]], [[0.1, 0.22, 0.3, 0, 0.3, 1], [0.06, 1, 0.54, 1]], [[0.4, 0, 0.2, 1]]],
  2: [[[0.08, 0.2, 0.3, 0, 0.55, 0.08, 0.58, 0.32, 0.06, 1, 0.62, 0.98]]],
  4: [[[0.48, 0, 0.04, 0.66, 0.66, 0.66], [0.5, 0.3, 0.5, 1]], [[0.14, 0, 0.06, 0.6, 0.66, 0.6], [0.54, 0.2, 0.54, 1]]],
  5: [[[0.12, 0, 0.08, 0.44, 0.36, 0.38, 0.58, 0.5, 0.6, 0.78, 0.4, 0.98, 0.04, 0.92], [0.12, 0, 0.58, 0]]],
  7: [[[0.02, 0, 0.6, 0, 0.22, 1], [0.12, 0.5, 0.5, 0.5]], [[0.02, 0.1, 0.02, 0, 0.6, 0, 0.3, 1]]],
  8: [[ell(0.31, 0.25, 0.22, 0.25), ell(0.31, 0.74, 0.27, 0.26)]],
  9: [[ell(0.33, 0.26, 0.27, 0.26, 0), [0.6, 0.26, 0.6, 1]], [[0.62, 0.04, 0.35, 0, 0.1, 0.06, 0.04, 0.2, 0.2, 0.26, 0.6, 0.18, 0.66, 0.02, 0.6, 0.45, 0.48, 1]], [[0.6, 0.06, 0.34, 0, 0.08, 0.08, 0.06, 0.24, 0.26, 0.28], [0.4, 0.24, 0.66, 0, 0.6, 0.45, 0.48, 1]], [[0.58, 0.24, 0.4, 0.04, 0.14, 0.06, 0.06, 0.3, 0.22, 0.48, 0.58, 0.3, 0.56, 1]]],
  x: [[[0.04, 0.38, 0.6, 1], [0.04, 1, 0.6, 0.38]], [[0.04, 0.4, 0.2, 0.36, 0.32, 0.6, 0.44, 0.98, 0.6, 0.94], [0.56, 0.4, 0.06, 0.98]]],
  y: [[[0.04, 0.38, 0.32, 0.84], [0.6, 0.38, 0.32, 0.84, 0.18, 1.32]], [[0.04, 0.38, 0.34, 0.89], [0.6, 0.38, 0.12, 1.32]], [[0.04, 0.38, 0.08, 0.8, 0.5, 0.8], [0.56, 0.38, 0.5, 1.2, 0.2, 1.3]]],
  '+': [[[0.34, 0.34, 0.34, 0.9], [0.06, 0.62, 0.62, 0.62]]],
};
const TEMPLATES = [];
VARIANTS['√'] = [[[0, 0.6, 0.18, 0.56, 0.32, 1, 0.5, 0.02, 0.7, 0]], [[0.06, 0.66, 0.3, 1, 0.62, 0]]];
for (const k of [...'0123456789xy+()√']) {
  const g = GLYPHS[k];
  TEMPLATES.push({ k, ...cloud(glyphStrokes(g)) });
  (VARIANTS[k] || []).forEach((v) => TEMPLATES.push({ k, ...cloud(v.map((s) => smooth(s))) }));
}
function classify(strokes, all = false) {
  const c = cloud(strokes);
  const b = boxOf(strokes);
  // √ 的形狀：最低點在左半邊、最高點在右邊（不然像 ) 的也會被當成 √）
  let lo = null, hi = null;
  strokes.forEach((s) => { for (let i = 0; i < s.length; i += 2) { if (!lo || s[i + 1] > lo[1]) lo = [s[i], s[i + 1]]; if (!hi || s[i + 1] < hi[1]) hi = [s[i], s[i + 1]]; } });
  let br = 0; // 右下角的筆跡：( 的下端在那裡，√ 沒有
  strokes.forEach((s) => { for (let i = 0; i < s.length; i += 2) if (s[i] > b.x0 + b.w * 0.7 && s[i + 1] > b.y0 + b.h * 0.72) br++; });
  const rootOk = lo && hi && lo[0] < b.x0 + b.w * 0.45 && hi[0] > b.x0 + b.w * 0.72 && b.w > b.h * 0.45 && br < 2;
  const scores = {};
  for (const tp of TEMPLATES) {
    if (tp.k === '√' && !rootOk) continue;
    const d = match(c, tp) + (tp.n === c.n ? 0 : 0.6); // 筆畫數不同的扣一點分
    if (!(tp.k in scores) || d < scores[tp.k]) scores[tp.k] = d;
  }
  const list = Object.entries(scores).map(([k, d]) => ({ k, d })).sort((x, y) => x.d - y.d);
  // 7 和 9 很像：9 上面有一個圈，左上方往下會有筆跡；7 的左邊只有最上面那一橫
  if (list[0] && list[0].k === '7' && scores[9] < list[0].d * 1.6) {
    let loop = 0;
    strokes.forEach((s) => { for (let i = 0; i < s.length; i += 2) if (s[i] < b.x0 + b.w * 0.25 && s[i + 1] > b.y0 + b.h * 0.1 && s[i + 1] < b.y0 + b.h * 0.45) loop++; });
    if (loop >= 3) list.unshift({ k: '9', d: scores[9] });
  }
  return all ? list : list[0];
}

// ---------- 切字、組算式 ----------
const boxOf = (ss) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ss.forEach((s) => { for (let i = 0; i < s.length; i += 2) { x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]); y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]); } });
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const OPERAND = /[0-9xy).]|frac|sqrt/;
function touches(a, b, r) {
  for (let i = 0; i < a.length; i += 2) for (let j = 0; j < b.length; j += 2) if (Math.abs(a[i] - b[j]) < r && Math.abs(a[i + 1] - b[j + 1]) < r) return true;
  return false;
}

// strokes：點陣列的陣列。回傳 [{ s: 符號, box, sup?, frac? }]，sup / frac 裡面又是同樣的陣列；認不出來就 throw
function units(strokes, Hm) {
  const items = strokes.map((s) => ({ s, b: boxOf([s]) }));
  const flat = (it) => it.b.h < Math.max(0.28 * it.b.w, Hm * 0.12) && it.b.w > Hm * 0.25;
  const tiny = (it) => Math.max(it.b.w, it.b.h) < Hm * 0.22;
  const out = [];
  const pool = new Set(items);
  // 根號：一筆寫成（打勾＋上面一條橫線），橫線底下的東西就是根號裡面
  for (const it of [...items].sort((a, b) => b.b.w - a.b.w)) {
    if (!pool.has(it) || flat(it) || it.b.w < Hm * 0.6) continue;
    const { x0, x1, y0, h, w } = it.b, pts = it.s;
    // 上緣 20% 高度內的點，要往右延伸一段（那條橫線）
    let tx0 = Infinity, tx1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) if (pts[i + 1] < y0 + h * 0.2) { tx0 = Math.min(tx0, pts[i]); tx1 = Math.max(tx1, pts[i]); }
    if (!(tx1 - tx0 > Math.max(w * 0.25, Hm * 0.45) && tx1 > x0 + w * 0.7)) continue;
    // 左下角要有往下的勾
    let lowLeft = false;
    for (let i = 0; i < pts.length; i += 2) if (pts[i] < x0 + w * 0.35 && pts[i + 1] > y0 + h * 0.55) lowLeft = true;
    if (!lowLeft) continue;
    // 橫線底下、右半邊要是空的（裡面放的是別的字）；3、2、) 這些右下角都有筆跡
    let rightInk = 0;
    for (let i = 0; i < pts.length; i += 2) if (pts[i] > x0 + w * 0.6 && pts[i + 1] > y0 + h * 0.3) rightInk++;
    if (rightInk > pts.length / 2 * 0.08) continue;
    const inside = items.filter((o) => o !== it && pool.has(o) && o.b.cx > Math.max(x0 + w * 0.3, tx0) && o.b.cx < tx1 + Hm * 0.1 && o.b.cy > y0 + h * 0.1 && o.b.y0 > y0 - Hm * 0.1 && o.b.y1 < y0 + h * 1.15);
    if (!inside.length) continue;
    [it, ...inside].forEach((o) => pool.delete(o));
    const h2 = Math.max(Hm * 0.5, median(inside.map((o) => o.b.h)));
    out.push({ s: 'sqrt', inner: units(inside.map((o) => o.s), h2), box: boxOf([it.s, ...inside.map((o) => o.s)]) });
  }
  // 分數線（含 ÷）：長橫線，正上方和正下方都有東西
  const bars = items.filter((it) => flat(it) && it.b.w > Hm * 0.5).sort((a, b) => b.b.w - a.b.w);
  for (const bar of bars) {
    if (!pool.has(bar)) continue;
    const inX = (it) => it !== bar && pool.has(it) && it.b.cx > bar.b.x0 && it.b.cx < bar.b.x1;
    const above = items.filter((it) => inX(it) && it.b.y1 < bar.b.cy + Hm * 0.08 && bar.b.cy - it.b.y1 < Hm * 1.2);
    const below = items.filter((it) => inX(it) && it.b.y0 > bar.b.cy - Hm * 0.08 && it.b.y0 - bar.b.cy < Hm * 1.2);
    if (!above.length || !below.length) continue;
    // 上下都只是一個點 → 除號 ÷
    if (above.length === 1 && below.length === 1 && tiny(above[0]) && tiny(below[0])) {
      [bar, above[0], below[0]].forEach((it) => pool.delete(it));
      out.push({ s: '/', box: boxOf([bar.s, above[0].s, below[0].s]) });
      continue;
    }
    // 「=」的上面那一橫，下面只有另一條差不多長的橫線，不是分數
    if (above.every(flat) || below.length === 1 && flat(below[0]) && Math.abs(below[0].b.w - bar.b.w) < bar.b.w * 0.4 && above.every((it) => it.b.cx < bar.b.x0 + bar.b.w * 0.2)) continue;
    if (below.length === 1 && flat(below[0])) continue;
    [bar, ...above, ...below].forEach((it) => pool.delete(it));
    const h2 = Math.max(Hm * 0.5, median([...above, ...below].map((it) => it.b.h)));
    out.push({ s: 'frac', num: units(above.map((it) => it.s), h2), den: units(below.map((it) => it.s), h2), box: boxOf([bar.s, ...above.map((i) => i.s), ...below.map((i) => i.s)]) });
  }
  // 剩下的筆畫：左右重疊很多的算同一個字（+、x、=、4、5…）
  const rest = [...pool].sort((a, b) => a.b.x0 - b.b.x0);
  const groups = [];
  for (const it of rest) {
    const g = !tiny(it) && groups.find((gr) => {
      if (gr.tiny || Math.max(gr.b.y0, it.b.y0) - Math.min(gr.b.y1, it.b.y1) > Hm * 0.6) return false;
      const ov = (Math.min(gr.b.x1, it.b.x1) - Math.max(gr.b.x0, it.b.x0)) / Math.min(gr.b.w || 1, it.b.w || 1);
      // 重疊很多；或有一點重疊而且筆畫碰在一起（y、4、5 的兩筆）
      return ov > 0.45 || (ov > 0.25 && gr.ss.some((s2) => touches(s2, it.s, Hm * 0.15)));
    });
    if (g) { g.ss.push(it.s); g.items.push(it); g.b = boxOf(g.ss); } else groups.push({ ss: [it.s], items: [it], b: it.b, tiny: tiny(it) });
  }
  for (const g of groups) {
    let s;
    if (g.tiny) s = '.';
    else if (g.items.length === 2 && g.items.every(flat) && Math.abs(g.items[0].b.cy - g.items[1].b.cy) > Hm * 0.12) s = '=';
    else if (g.items.length === 1 && flat(g.items[0])) s = '-';
    else {
      const r = classify(g.ss);
      if (!r || r.d > 9) throw new Error('?');
      s = r.k;
    }
    out.push({ s, box: g.b, ss: g.ss });
  }
  out.sort((a, b) => a.box.x0 - b.box.x0);
  // 上標（次方）：比前一個字明顯高、明顯小
  const mids = out.filter((u) => /[0-9x(]|frac/.test(u.s) && u.box.h > Hm * 0.55).map((u) => u.box.cy);
  const mid = mids.length ? median(mids) : median(out.map((u) => u.box.cy));
  const res = [];
  for (const u of out) {
    const prev = res[res.length - 1];
    const isSup = prev && u.s !== '=' && u.s !== '.' && u.box.cy < mid - Hm * 0.32 && u.box.y1 < mid + Hm * 0.05 && (u.box.h < Hm * 0.85 || u.box.y1 < prev.box.cy);
    if (isSup && (OPERAND.test(prev.s) || prev.sup)) {
      if (prev.supRun) prev.supRun.push(u);
      else res.push({ s: '^', sup: true, supRun: [u], box: u.box });
    } else res.push(u);
  }
  return res;
}

// 符號陣列 → 算式字串；mul：數字中間的 x 當成乘號
export function toExpr(us, mul = false) {
  let s = '';
  us.forEach((u, i) => {
    if (u.s === 'frac') s += `((${toExpr(u.num, mul)})/(${toExpr(u.den, mul)}))`;
    else if (u.s === 'sqrt') s += `sqrt(${toExpr(u.inner, mul)})`;
    else if (u.s === '√') s += 'sqrt';
    else if (u.sup) s += `^(${toExpr(u.supRun, mul)})`;
    else if (u.s === 'x' && mul) {
      const a = us[i - 1], b = us[i + 1];
      s += a && b && /[0-9).]|frac|sqrt/.test(a.s) && /[0-9(.√]|frac|sqrt/.test(b.s) ? '*' : 'x';
    } else s += u.s;
  });
  return s;
}

// 主程式：一行手寫筆畫 → { units, eq: 最後一個「=」的框, H: 字高 }
export const _classify = (ss) => classify(ss, true).slice(0, 4);
export function readInk(strokes) {
  const bs = strokes.map((s) => boxOf([s]));
  const tall = bs.filter((b) => b.h > Math.max(...bs.map((x) => x.h)) * 0.35).map((b) => b.h);
  const H = Math.max(20, median(tall));
  const us = units(strokes, H);
  const eqs = us.filter((u) => u.s === '=');
  // 答案的字高：用一般大小的數字、x 量（根號、分數會比較高）
  const dh = us.filter((u) => /^[0-9xy]$/.test(u.s)).map((u) => u.box.h);
  return { units: us, eq: eqs[eqs.length - 1] || null, H: dh.length ? Math.max(20, median(dh)) : H, mid: median(us.filter((u) => /[0-9x]/.test(u.s)).map((u) => u.box.cy)) || median(us.map((u) => u.box.cy)) };
}

// 算式裡的每一個數字（連在一起的數字和小數點）：[{ value, units }]，給「調整數字」的滑竿用
export function numbersIn(us, out = []) {
  let run = [];
  const flush = () => { if (run.some((u) => /\d/.test(u.s)) && Number.isFinite(Number(run.map((u) => u.s).join('')))) out.push({ value: Number(run.map((u) => u.s).join('')), units: run }); run = []; };
  for (const u of us) {
    if (/^[0-9.]$/.test(u.s)) { run.push(u); continue; }
    flush();
    if (u.s === 'frac') { numbersIn(u.num, out); numbersIn(u.den, out); } else if (u.s === 'sqrt') numbersIn(u.inner, out);
    else if (u.sup) numbersIn(u.supRun, out);
  }
  flush();
  return out;
}
