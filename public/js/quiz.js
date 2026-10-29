// 白板的亂數出題：每題回傳 { q, a }（LaTeX），白板可以畫成公式，也可以只放文字（plain）
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
const neg = (n) => (n < 0 ? `(${n})` : String(n));

// digits：數字位數（1～4）；negative：可以出現負數
function num(digits, negative) {
  const hi = 10 ** digits - 1, lo = digits === 1 ? 1 : 10 ** (digits - 1);
  const n = rnd(lo, hi);
  return negative && Math.random() < 0.4 ? -n : n;
}
function frac(n, d) {
  const g = gcd(n, d);
  n /= g; d /= g;
  if (d < 0) { n = -n; d = -d; }
  if (d === 1) return String(n);
  return `${n < 0 ? '-' : ''}\\frac{${Math.abs(n)}}{${d}}`;
}

const MAKERS = {
  add: (d, ng) => { const a = num(d, ng), b = num(d, ng); return { q: `${a} + ${neg(b)}`, a: String(a + b) }; },
  sub: (d, ng) => {
    let a = num(d, ng), b = num(d, ng);
    if (!ng && b > a) [a, b] = [b, a];
    return { q: `${a} - ${neg(b)}`, a: String(a - b) };
  },
  mul: (d, ng) => { const a = num(d, ng), b = num(Math.max(1, d - (d > 2 ? 1 : 0)), ng); return { q: `${a} \\times ${neg(b)}`, a: String(a * b) }; },
  // 整除：先出商和除數，再乘回去
  div: (d, ng) => { const b = num(Math.max(1, Math.min(2, d)), ng) || 2, c = num(d, ng); return { q: `${b * c} \\div ${neg(b)}`, a: String(c) }; },
  mixed: (d, ng) => {
    const a = num(d, ng), b = num(1, false) + 1, c = num(1, false) + 1, e = num(d, ng);
    const forms = [
      [`${a} + ${b} \\times ${c}`, a + b * c],
      [`(${a} + ${neg(e)}) \\times ${b}`, (a + e) * b],
      [`${a * b} \\div ${b} - ${neg(c)}`, a - c],
      [`${a} - ${neg(e)} + ${b} \\times ${c}`, a - e + b * c],
    ];
    const [q, v] = forms[rnd(0, forms.length - 1)];
    return { q, a: String(v) };
  },
  frac: (d) => {
    const top = Math.max(5, Math.min(12, 3 * d + 3));
    const b = rnd(2, top), e = rnd(2, top), a = rnd(1, b - 1);
    let c = rnd(1, e - 1);
    if (a * e === c * b) c = c === e - 1 ? Math.max(1, c - 1) : c + 1; // 不出「1/2 − 1/2」這種兩個一樣大的
    if (a * e === c * b) return MAKERS.frac(d);
    const plus = Math.random() < 0.5;
    return { q: `\\frac{${a}}{${b}} ${plus ? '+' : '-'} \\frac{${c}}{${e}}`, a: frac(plus ? a * e + c * b : a * e - c * b, b * e) };
  },
  // 一元一次方程式 ax + b = c（解是整數）
  eq: (d, ng) => {
    const x = num(Math.min(2, d), ng), a = rnd(2, 9) * (ng && Math.random() < 0.3 ? -1 : 1), b = num(Math.min(2, d), ng);
    const lhs = `${a === 1 ? '' : a === -1 ? '-' : a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)}`;
    return { q: `${lhs} = ${a * x + b}`, a: `x = ${x}`, eq: true };
  },
  pow: (d) => {
    if (Math.random() < 0.5) { const b = rnd(2, d > 2 ? 15 : 9), e = rnd(2, 3); return { q: `${b}^{${e}}`, a: String(b ** e) }; }
    const r = rnd(2, d > 2 ? 30 : 12);
    return { q: `\\sqrt{${r * r}}`, a: String(r) };
  },
};
export const QUIZ_TYPES = Object.keys(MAKERS);

// 出 count 題，盡量不重複
export function makeQuiz(type, count, digits = 2, negative = false) {
  const out = [], seen = new Set();
  for (let tries = 0; out.length < count && tries < count * 30; tries++) {
    const kind = type === 'random' ? QUIZ_TYPES[rnd(0, QUIZ_TYPES.length - 1)] : type;
    const p = MAKERS[kind](digits, negative);
    if (seen.has(p.q)) continue;
    seen.add(p.q);
    out.push(p);
  }
  return out;
}

// LaTeX → 白板文字（沒有公式引擎時的備用顯示）
export function plain(tex) {
  return tex.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2').replace(/\\times/g, '×').replace(/\\div/g, '÷')
    .replace(/\\sqrt\{([^}]*)\}/g, '√$1').replace(/\^\{([^}]*)\}/g, '^$1').replace(/\\square/g, '□').replace(/[{}]/g, '');
}
