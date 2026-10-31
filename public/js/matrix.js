// 白板公式的矩陣運算：A + B、A − B、kA、AB、Aⁿ、Aᵀ、A⁻¹、det A、|A|
// 公式裡的 \begin{bmatrix}…\end{bmatrix} 先拿出來算成數字陣列，剩下的部分再用小小的遞迴下降解析
export const hasMatrix = (tex) => /\\begin\{[bpvBV]?matrix\}/.test(tex);

const isM = (v) => Array.isArray(v);
const dims = (m) => `${m.length}×${m[0].length}`;
function err(key, vars) { const e = new Error(key); e.key = key; e.vars = vars; return e; }

function add(a, b, k = 1) {
  if (isM(a) !== isM(b)) throw err('wb.mx.mixAdd');
  if (!isM(a)) return a + k * b;
  if (a.length !== b.length || a[0].length !== b[0].length) throw err('wb.mx.dimAdd', { a: dims(a), b: dims(b) });
  return a.map((r, i) => r.map((v, j) => v + k * b[i][j]));
}
function mul(a, b) {
  if (!isM(a) && !isM(b)) return a * b;
  if (!isM(a)) return b.map((r) => r.map((v) => a * v));
  if (!isM(b)) return a.map((r) => r.map((v) => v * b));
  if (a[0].length !== b.length) throw err('wb.mx.dimMul', { a: dims(a), b: dims(b) });
  return a.map((r) => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)));
}
const square = (m) => { if (m.length !== m[0].length) throw err('wb.mx.square', { a: dims(m) }); };
const eye = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
// 高斯消去：同時算行列式和反矩陣
function gauss(m) {
  square(m);
  const n = m.length, a = m.map((r, i) => [...r, ...eye(n)[i]]);
  let det = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return { det: 0, inv: null };
    if (p !== c) { [a[p], a[c]] = [a[c], a[p]]; det = -det; }
    const pv = a[c][c];
    det *= pv;
    for (let j = 0; j < 2 * n; j++) a[c][j] /= pv;
    for (let r = 0; r < n; r++) if (r !== c && a[r][c]) { const f = a[r][c]; for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j]; }
  }
  return { det, inv: a.map((r) => r.slice(n)) };
}
const det = (m) => (isM(m) ? gauss(m).det : m);
function inv(m) {
  if (!isM(m)) return 1 / m;
  const { inv: r } = gauss(m);
  if (!r) throw err('wb.mx.singular');
  return r;
}
function pow(a, n) {
  if (!isM(a)) return a ** n;
  if (!Number.isInteger(n)) throw err('wb.mx.powInt');
  square(a);
  let base = n < 0 ? inv(a) : a, r = eye(a.length);
  for (let k = Math.abs(n); k > 0; k >>= 1) { if (k & 1) r = mul(r, base); base = mul(base, base); }
  return r;
}
const tr = (m) => (isM(m) ? m[0].map((_, j) => m.map((r) => r[j])) : m);

// tex：整條公式；num：把一格（LaTeX）算成數字。回傳數字或二維陣列
export function matrixCalc(tex, num) {
  const mats = [];
  let s = tex.replace(/\\begin\{([bpvBV]?matrix)\}([\s\S]*?)\\end\{\1\}/g, (_, kind, body) => {
    const rows = body.split(/\\\\/).map((r) => r.trim()).filter(Boolean).map((r) => r.split('&').map((c) => {
      const v = num(c.trim() || '0');
      if (!Number.isFinite(v)) throw err('wb.mx.cell', { c: c.trim() });
      return v;
    }));
    if (!rows.length || rows.some((r) => r.length !== rows[0].length)) throw err('wb.mx.ragged');
    mats.push(kind === 'vmatrix' || kind === 'Vmatrix' ? det(rows) : rows);
    return ` @${mats.length - 1} `;
  });
  s = s.replace(/=\s*$/, '').replace(/\\left|\\right/g, '').replace(/\\[,;:! ]|\\quad|\\qquad/g, ' ')
    .replace(/\\times|\\cdot/g, '*').replace(/\\div/g, '/').replace(/\\det|\\operatorname\{det\}|\\mathrm\{det\}/g, ' det ')
    .replace(/\^\s*\{\s*(T|\\top|t)\s*\}|\^\s*(T|\\top)/g, '^T').replace(/\\pi/g, ' pi ').replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
    .replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'));
  const tk = s.match(/@\d+|\d+\.?\d*|\.\d+|det|pi|\^T|[-+*/^()|]|\S/g) || [];
  let p = 0;
  const peek = () => tk[p], eat = (t) => (tk[p] === t ? (p++, true) : false);
  const need = (t) => { if (!eat(t)) throw err('wb.mx.syntax'); };
  const startsAtom = (t) => t && (t[0] === '@' || /^[\d.]/.test(t) || t === 'det' || t === 'pi' || t === '(' || t === '|');
  function expr() {
    let a = term();
    for (;;) { if (eat('+')) a = add(a, term()); else if (eat('-')) a = add(a, term(), -1); else return a; }
  }
  function term() {
    let a = unary();
    for (;;) {
      if (eat('*')) a = mul(a, unary());
      else if (eat('/')) { const b = unary(); if (isM(b)) throw err('wb.mx.divM'); a = mul(a, 1 / b); } else if (startsAtom(peek())) a = mul(a, power()); // AB、2A：直接相鄰就是相乘
      else return a;
    }
  }
  function unary() { if (eat('-')) return mul(-1, unary()); if (eat('+')) return unary(); return power(); }
  function power() {
    let a = atom();
    for (;;) {
      if (eat('^T')) a = tr(a);
      else if (eat('^')) {
        const e = eat('(') ? (() => { const v = expr(); need(')'); return v; })() : eat('-') ? -atom() : atom();
        if (isM(e)) throw err('wb.mx.syntax');
        a = pow(a, e);
      } else return a;
    }
  }
  function atom() {
    const t = tk[p++];
    if (t === undefined) throw err('wb.mx.syntax');
    if (t[0] === '@') return mats[Number(t.slice(1))];
    if (/^[\d.]/.test(t)) return Number(t);
    if (t === 'pi') return Math.PI;
    if (t === 'det') return det(power());
    if (t === '|') { const v = expr(); need('|'); return det(v); }
    if (t === '(') { const v = expr(); need(')'); return v; }
    throw err('wb.mx.syntax');
  }
  const v = expr();
  if (p < tk.length) throw err('wb.mx.syntax');
  return v;
}
export const mxText = (v, f) => (isM(v) ? `[${v.map((r) => r.map(f).join(' ')).join('; ')}]` : f(v));
export const mxTex = (v, f) => (isM(v) ? `\\begin{bmatrix} ${v.map((r) => r.map(f).join(' & ')).join(' \\\\ ')} \\end{bmatrix}` : f(v));
