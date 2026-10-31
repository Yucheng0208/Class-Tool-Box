// 白板的計算機與函數圖形共用：安全的算式解析（不用 eval）
// 支援 + − × ÷ ^ % !、括號、隱含乘法（2x、3(4+1)、2π）、常數 π e、ans、變數 x y，
// 函數 sin cos tan asin acos atan sqrt √ cbrt abs ln log log2 exp floor ceil round
const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
};
const TRIG = new Set(['sin', 'cos', 'tan']);
const ATRIG = new Set(['asin', 'acos', 'atan']);

function tokenize(src) {
  const s = String(src)
    .replace(/[×＊·]/g, '*').replace(/[÷／]/g, '/').replace(/[−–—]/g, '-').replace(/[（]/g, '(').replace(/[）]/g, ')')
    .replace(/√/g, 'sqrt').replace(/π/g, 'pi').replace(/，/g, ',').replace(/\s+/g, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const num = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
    if (num) { out.push({ t: 'n', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = s.slice(i).match(/^[a-z]+\d?/i);
    if (id) {
      let w = id[0].toLowerCase();
      // 「sinx」「2pix」這類黏在一起的：先找最長的函數／常數名稱
      const known = ['asin', 'acos', 'atan', 'sqrt', 'cbrt', 'log2', 'floor', 'ceil', 'round', 'sin', 'cos', 'tan', 'abs', 'exp', 'log', 'ln', 'ans', 'pi', 'e', 'x', 'y'];
      const k = known.find((n) => w.startsWith(n));
      if (!k) throw new Error(`?${w}`);
      w = k;
      out.push(FUNCS[w] ? { t: 'f', v: w } : { t: 'id', v: w });
      i += w.length;
      continue;
    }
    if ('+-*/^%!(),'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error(`?${c}`);
  }
  // 隱含乘法：數字、常數、右括號、! 後面接 數字、常數、函數、左括號
  const res = [];
  for (const tk of out) {
    const prev = res[res.length - 1];
    const endsVal = prev && (prev.t === 'n' || prev.t === 'id' || prev.t === ')' || prev.t === '!' || prev.t === '%');
    const startsVal = tk.t === 'n' || tk.t === 'id' || tk.t === 'f' || tk.t === '(';
    if (endsVal && startsVal) res.push({ t: '*' });
    res.push(tk);
  }
  return res;
}

// 遞迴下降解析 → 回傳 (scope) => number
export function compile(src) {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p], eat = (t) => { if (tk[p] && tk[p].t === t) { p++; return true; } return false; };
  const need = (t) => { if (!eat(t)) throw new Error(`missing ${t}`); };
  function expr() {
    let a = term();
    for (;;) {
      if (eat('+')) { const l = a, r = term(); a = (s) => l(s) + r(s); } else if (eat('-')) { const l = a, r = term(); a = (s) => l(s) - r(s); } else return a;
    }
  }
  function term() {
    let a = unary();
    for (;;) {
      if (eat('*')) { const l = a, r = unary(); a = (s) => l(s) * r(s); } else if (eat('/')) { const l = a, r = unary(); a = (s) => l(s) / r(s); } else return a;
    }
  }
  function unary() {
    if (eat('-')) { const a = unary(); return (s) => -a(s); }
    if (eat('+')) return unary();
    return power();
  }
  function power() {
    const base = postfix();
    if (eat('^')) { const ex = unary(); return (s) => base(s) ** ex(s); } // 右結合：2^3^2 = 2^9
    return base;
  }
  function postfix() {
    let a = atom();
    for (;;) {
      if (eat('!')) { const l = a; a = (s) => fact(l(s)); } else if (eat('%')) { const l = a; a = (s) => l(s) / 100; } else return a;
    }
  }
  function atom() {
    const t = peek();
    if (!t) throw new Error('end');
    if (t.t === 'n') { p++; return () => t.v; }
    if (t.t === 'id') {
      p++;
      if (t.v === 'pi') return () => Math.PI;
      if (t.v === 'e') return () => Math.E;
      if (t.v === 'x') return (s) => s.x;
      if (t.v === 'y') return (s) => s.y ?? 0;
      return (s) => s.ans ?? 0;
    }
    if (t.t === 'f') {
      p++;
      const name = t.v, fn = FUNCS[name];
      // 括號可省略：sin30、sqrt2
      let arg;
      if (eat('(')) { arg = expr(); need(')'); } else arg = power();
      if (TRIG.has(name)) return (s) => fn(s.deg ? (arg(s) * Math.PI) / 180 : arg(s));
      if (ATRIG.has(name)) return (s) => (s.deg ? (fn(arg(s)) * 180) / Math.PI : fn(arg(s)));
      return (s) => fn(arg(s));
    }
    if (eat('(')) { const a = expr(); need(')'); return a; }
    throw new Error(`? ${t.t}`);
  }
  const f = expr();
  if (p < tk.length) throw new Error(`? ${tk[p].t}`);
  return f;
}

function fact(n) {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function evaluate(src, scope = {}) { return compile(src)({ deg: false, ans: 0, x: 0, ...scope }); }

// 顯示用：去掉浮點誤差（0.1+0.2 → 0.3），太大太小用科學記號
export function fmt(v) {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : (v > 0 ? '∞' : '−∞');
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e15 || a < 1e-9) return v.toExponential(8).replace(/\.?0+e/, 'e');
  return String(Number(v.toPrecision(12)));
}

// 小數 → 分數（連分數逼近，分母不超過 10000）；不是有理數就回傳 null
export function toFraction(v) {
  if (!Number.isFinite(v) || Number.isInteger(v)) return null;
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, x = v;
  for (let i = 0; i < 32; i++) {
    const a = Math.floor(x);
    [h1, h0] = [a * h1 + h0, h1];
    [k1, k0] = [a * k1 + k0, k1];
    if (k1 > 10000) return null;
    if (Math.abs(v - h1 / k1) < 1e-10) return k1 === 1 ? null : { n: h1, d: k1 };
    x = 1 / (x - a);
    if (!Number.isFinite(x)) break;
  }
  return null;
}
