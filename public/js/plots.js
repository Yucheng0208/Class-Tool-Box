// 白板自動產生的圖：函數值表格、z = f(x, y) 的 3D 曲面（都畫在 canvas 上再放到白板）
import { compile, fmt } from './mathx.js';

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
// 顯示用：x^(2) → x²
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
export const pretty = (e) => e.replace(/\^(?:\((-?\d+)\)|(\d+))/g, (_, a, b) => [...(a || b)].map((c) => SUP[c]).join('')).replace(/\*/g, '·');
const short = (v) => (Number.isFinite(v) ? fmt(Number(v.toPrecision(4))) : '—');

// y = f(x) 的對照表：x = -3 … 3
export function drawTable(c, expr, onDark, xs = [-3, -2, -1, 0, 1, 2, 3]) {
  const fn = compile(expr);
  const ys = xs.map((x) => { try { return fn({ x, y: 0, deg: false, ans: 0 }); } catch { return NaN; } });
  const cw = 110, ch = 64, head = 90, W = head + cw * xs.length, H = ch * 2;
  c.width = W + 4; c.height = H + 4;
  const g = c.getContext('2d');
  g.translate(2, 2);
  g.fillStyle = onDark ? 'rgba(0,0,0,.35)' : '#ffffff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = onDark ? 'rgba(255,255,255,.12)' : '#eef6fa';
  g.fillRect(0, 0, head, H);
  g.strokeStyle = onDark ? 'rgba(255,255,255,.7)' : '#12232e';
  g.lineWidth = 2;
  g.strokeRect(0, 0, W, H);
  g.beginPath(); g.moveTo(0, ch); g.lineTo(W, ch);
  for (let i = 0; i <= xs.length; i++) { g.moveTo(head + i * cw, 0); g.lineTo(head + i * cw, H); }
  g.stroke();
  g.fillStyle = onDark ? '#ffffff' : '#12232e';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic 700 30px "Times New Roman", serif`;
  g.fillText('x', head / 2, ch / 2); g.fillText('y', head / 2, ch * 1.5);
  xs.forEach((x, i) => {
    g.font = `600 28px ${FONT}`;
    g.fillText(short(x), head + (i + 0.5) * cw, ch / 2);
    const s = short(ys[i]);
    g.font = `600 ${s.length > 6 ? 22 : 28}px ${FONT}`;
    g.fillStyle = onDark ? '#9be15d' : '#1b8fd6';
    g.fillText(s, head + (i + 0.5) * cw, ch * 1.5);
    g.fillStyle = onDark ? '#ffffff' : '#12232e';
  });
}

// 高度 → 顏色（藍 → 青 → 綠 → 黃）
function ramp(t) {
  const stops = [[49, 54, 149], [27, 143, 214], [34, 160, 107], [224, 168, 0]];
  const k = Math.max(0, Math.min(0.999, t)) * (stops.length - 1), i = Math.floor(k), f = k - i;
  const a = stops[i], b = stops[i + 1];
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(',')})`;
}

// z = f(x, y) 的曲面：x、y 在 -r～r，斜上方往下看
export function drawSurface(c, expr, onDark, r = 3) {
  const fn = compile(expr);
  const W = 900, H = 720, N = 30;
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const z = [];
  for (let i = 0; i <= N; i++) {
    z.push([]);
    for (let j = 0; j <= N; j++) {
      const x = -r + (2 * r * i) / N, y = -r + (2 * r * j) / N;
      let v; try { v = fn({ x, y, deg: false, ans: 0 }); } catch { v = NaN; }
      z[i].push(Number.isFinite(v) ? v : NaN);
    }
  }
  // z 的範圍取 2%～98%，避免 1/(x²+y²) 這種爆掉的點把整張圖壓扁
  const all = z.flat().filter(Number.isFinite).sort((a, b) => a - b);
  if (!all.length) throw new Error('no values');
  let z0 = all[Math.floor(all.length * 0.02)], z1 = all[Math.ceil(all.length * 0.98) - 1];
  if (z1 - z0 < 1e-9) { z0 -= 1; z1 += 1; }
  const az = -0.65, el = 0.5, ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  const S = 260, cx = W / 2, cy = H / 2 + 30;
  // 世界座標（x、y 縮到 -1～1，z 縮到 -0.7～0.7）→ 畫面座標與深度
  const proj = (x, y, zz) => {
    const u = x * ca - y * sa, v = x * sa + y * ca;
    return { X: cx + u * S, Y: cy - (zz * ce - v * se) * S, d: v * ce + zz * se };
  };
  const zn = (v) => ((Math.max(z0, Math.min(z1, v)) - z0) / (z1 - z0)) * 1.4 - 0.7;
  const gx = (i) => -1 + (2 * i) / N;
  g.clearRect(0, 0, W, H);
  const ink = onDark ? 'rgba(255,255,255,.85)' : '#12232e', faint = onDark ? 'rgba(255,255,255,.25)' : 'rgba(18,35,46,.25)';
  // 底面方框
  g.strokeStyle = faint; g.lineWidth = 1.5;
  const base = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => proj(x, y, -0.7));
  g.beginPath(); base.forEach((p, i) => (i ? g.lineTo(p.X, p.Y) : g.moveTo(p.X, p.Y))); g.closePath(); g.stroke();
  // 每一小塊依深度由遠到近畫（畫家演算法）
  const quads = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const vs = [z[i][j], z[i + 1][j], z[i + 1][j + 1], z[i][j + 1]];
    if (!vs.every(Number.isFinite)) continue;
    const pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b], k) => proj(gx(a), gx(b), zn(vs[k])));
    quads.push({ pts, d: pts.reduce((s, p) => s + p.d, 0) / 4, t: (vs.reduce((s, v) => s + v, 0) / 4 - z0) / (z1 - z0) });
  }
  quads.sort((a, b) => a.d - b.d);
  g.lineWidth = 0.6;
  g.strokeStyle = onDark ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.45)';
  for (const q of quads) {
    g.beginPath(); q.pts.forEach((p, k) => (k ? g.lineTo(p.X, p.Y) : g.moveTo(p.X, p.Y))); g.closePath();
    g.fillStyle = ramp(q.t); g.fill(); g.stroke();
  }
  // 座標軸與刻度
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 2;
  g.font = `italic 700 30px "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const axis = (a, b, label) => { g.beginPath(); g.moveTo(a.X, a.Y); g.lineTo(b.X, b.Y); g.stroke(); g.fillText(label, b.X + (b.X - a.X) * 0.08, b.Y + (b.Y - a.Y) * 0.08); };
  axis(proj(-1, -1, -0.7), proj(1.15, -1, -0.7), 'x');
  axis(proj(-1, -1, -0.7), proj(-1, 1.15, -0.7), 'y');
  axis(proj(-1, -1, -0.7), proj(-1, -1, 0.9), 'z');
  g.font = `20px ${FONT}`;
  const tk = (p, s) => g.fillText(s, p.X, p.Y);
  tk(proj(1, -1.12, -0.7), String(r)); tk(proj(-1, -1.12, -0.7), String(-r)); tk(proj(-1.12, 1, -0.7), String(r));
  g.textAlign = 'right';
  tk({ ...proj(-1, -1, -0.7), X: proj(-1, -1, -0.7).X - 10 }, short(z0)); tk({ ...proj(-1, -1, 0.7), X: proj(-1, -1, 0.7).X - 10 }, short(z1));
  g.textAlign = 'left'; g.font = `600 30px ${FONT}`; g.fillStyle = onDark ? '#9be15d' : '#1b8fd6';
  g.fillText(`z = ${pretty(expr)}`, 24, 34);
}
