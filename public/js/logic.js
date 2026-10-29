// 數位邏輯計算：布林式解析、真值表、卡諾圖化簡（Quine–McCluskey）、補數、BCD、格雷碼、進位制轉換
export const VARS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ---------- 布林式 ----------
// 支援：A' 或 ~A !A ¬A（NOT）、AB A·B A*B A&B（AND）、A+B A|B（OR）、A^B A⊕B（XOR）、括號、0 1
// 優先順序：NOT > AND > XOR > OR
export function parseBool(src) {
  const s = String(src).replace(/\s+/g, '').replace(/[’`´]/g, "'").replace(/[·•∙×]/g, '*').replace(/[∧]/g, '*').replace(/[∨]/g, '+').replace(/[⊕]/g, '^').replace(/[¬]/g, '~');
  let i = 0;
  const vars = new Set();
  const peek = () => s[i];
  function or() { let a = xor(); while (peek() === '+' || peek() === '|') { i++; const l = a, r = xor(); a = (v) => l(v) | r(v); } return a; }
  function xor() { let a = and(); while (peek() === '^') { i++; const l = a, r = and(); a = (v) => l(v) ^ r(v); } return a; }
  // 相鄰的變數或括號 = AND（例如 AB'C、A(B+C)）
  const startsAtom = (c) => c && (/[A-Za-z01(~!]/.test(c));
  function and() {
    let a = not();
    for (;;) {
      if (peek() === '*' || peek() === '&') { i++; const l = a, r = not(); a = (v) => l(v) & r(v); } else if (startsAtom(peek())) { const l = a, r = not(); a = (v) => l(v) & r(v); } else return a;
    }
  }
  function not() {
    if (peek() === '~' || peek() === '!') { i++; const a = not(); return (v) => 1 - a(v); }
    let a = atom();
    while (peek() === "'") { i++; const b = a; a = (v) => 1 - b(v); }
    return a;
  }
  function atom() {
    const c = peek();
    if (c === '(') { i++; const a = or(); if (peek() !== ')') throw new Error(')'); i++; return a; }
    if (c === '0' || c === '1') { i++; const k = Number(c); return () => k; }
    if (c && /[A-Za-z]/.test(c)) { i++; const n = c.toUpperCase(); vars.add(n); return (v) => v[n]; }
    throw new Error(c ? `? ${c}` : 'end');
  }
  if (!s) throw new Error('empty');
  const f = or();
  if (i < s.length) throw new Error(`? ${s[i]}`);
  const names = [...vars].sort();
  if (names.length > 6) throw new Error('max 6 variables');
  return { f, vars: names };
}
// 真值表：rows = [{ bits: [0,1,…], out }]；第一個變數是最高位
export function truthTable(expr) {
  const { f, vars } = parseBool(expr);
  const n = vars.length, rows = [];
  for (let m = 0; m < 1 << n; m++) {
    const v = {}, bits = vars.map((x, k) => { const b = (m >> (n - 1 - k)) & 1; v[x] = b; return b; });
    rows.push({ m, bits, out: f(v) & 1 });
  }
  return { vars, rows, minterms: rows.filter((r) => r.out).map((r) => r.m) };
}

// ---------- 卡諾圖化簡：Quine–McCluskey ＋ 必要質項＋貪婪補齊 ----------
// 回傳 { terms: ['AB\'', …], sop: 'AB\' + C', groups: [[minterm…], …] }
export function simplify(n, ones, dc = []) {
  const vars = VARS.slice(0, n);
  const full = (1 << n) - 1;
  const on = [...new Set(ones)].filter((m) => m >= 0 && m <= full).sort((a, b) => a - b);
  const dcs = [...new Set(dc)].filter((m) => m >= 0 && m <= full && !on.includes(m));
  if (!on.length) return { terms: [], sop: '0', groups: [] };
  if (on.length + dcs.length === 1 << n) return { terms: ['1'], sop: '1', groups: [on] };
  // 每個蘊涵項用 { v: 值, mask: 不在乎的位元 }
  let cur = new Map([...on, ...dcs].map((m) => [`${m}/0`, { v: m, mask: 0, ms: [m] }]));
  const primes = [];
  while (cur.size) {
    const next = new Map(), used = new Set(), list = [...cur.values()];
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const x = list[a], y = list[b];
      if (x.mask !== y.mask) continue;
      const diff = x.v ^ y.v;
      if (diff && !(diff & (diff - 1))) {
        const v = x.v & ~diff, mask = x.mask | diff, key = `${v}/${mask}`;
        if (!next.has(key)) next.set(key, { v, mask, ms: [...new Set([...x.ms, ...y.ms])].sort((p, q) => p - q) });
        used.add(x); used.add(y);
      }
    }
    list.forEach((x) => { if (!used.has(x)) primes.push(x); });
    cur = next;
  }
  // 選質項：先拿必要的，剩下的每次選蓋最多的
  const chosen = [], left = new Set(on);
  for (const m of on) {
    const cover = primes.filter((p) => p.ms.includes(m));
    if (cover.length === 1 && !chosen.includes(cover[0])) chosen.push(cover[0]);
  }
  chosen.forEach((p) => p.ms.forEach((m) => left.delete(m)));
  while (left.size) {
    let best = null, score = -1;
    for (const p of primes) {
      if (chosen.includes(p)) continue;
      const k = p.ms.filter((m) => left.has(m)).length;
      const lits = n - bitCount(p.mask);
      if (k > score || (k === score && best && lits < n - bitCount(best.mask))) { best = p; score = k; }
    }
    chosen.push(best);
    best.ms.forEach((m) => left.delete(m));
  }
  const term = (p) => vars.map((x, k) => { const bit = 1 << (n - 1 - k); if (p.mask & bit) return ''; return p.v & bit ? x : `${x}'`; }).join('') || '1';
  const terms = chosen.map(term);
  return { terms, sop: terms.join(' + '), groups: chosen.map((p) => p.ms) };
}
const bitCount = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };

// 卡諾圖的格子順序（格雷碼）：rowVars 在左邊，colVars 在上面
export const GRAY2 = [0, 1, 3, 2];
export function kmapLayout(n) {
  if (n === 2) return { rowBits: 1, colBits: 1, rows: [0, 1], cols: [0, 1] };
  if (n === 3) return { rowBits: 1, colBits: 2, rows: [0, 1], cols: GRAY2 };
  return { rowBits: 2, colBits: 2, rows: GRAY2, cols: GRAY2 };
}
export const kmapIndex = (n, r, c) => { const L = kmapLayout(n); return (L.rows[r] << L.colBits) | L.cols[c]; };

// ---------- 編碼與轉換 ----------
const clean = (s) => String(s).replace(/[\s_]/g, '');
export function complement(bin, bits) {
  const b = clean(bin);
  if (!/^[01]+$/.test(b)) throw new Error('binary');
  const w = Math.max(b.length, Number(bits) || 0);
  const x = b.padStart(w, '0');
  const one = [...x].map((c) => (c === '0' ? '1' : '0')).join('');
  const two = ((BigInt(`0b${one}`) + 1n) & ((1n << BigInt(w)) - 1n)).toString(2).padStart(w, '0');
  const signed = x[0] === '1' ? -(Number((1n << BigInt(w)) - BigInt(`0b${x}`))) : Number(BigInt(`0b${x}`));
  return { x, one, two, signed };
}
export function decComplement(dec) {
  const d = clean(dec);
  if (!/^\d+$/.test(d)) throw new Error('decimal');
  const nine = [...d].map((c) => 9 - Number(c)).join('');
  const ten = (BigInt(nine) + 1n).toString().padStart(d.length, '0').slice(-d.length);
  return { d, nine, ten };
}
export function toBCD(dec) {
  const d = clean(dec);
  if (!/^\d+$/.test(d)) throw new Error('decimal');
  return [...d].map((c) => Number(c).toString(2).padStart(4, '0')).join(' ');
}
export function fromBCD(bcd) {
  const b = clean(bcd);
  if (!/^[01]+$/.test(b) || b.length % 4) throw new Error('BCD');
  return b.match(/.{4}/g).map((g) => { const v = parseInt(g, 2); if (v > 9) throw new Error(`${g} > 9`); return v; }).join('');
}
export function toGray(bin) {
  const b = clean(bin);
  if (!/^[01]+$/.test(b)) throw new Error('binary');
  return [...b].map((c, i) => (i === 0 ? c : String(Number(c) ^ Number(b[i - 1])))).join('');
}
export function fromGray(g) {
  const s = clean(g);
  if (!/^[01]+$/.test(s)) throw new Error('Gray');
  let prev = 0;
  return [...s].map((c) => { prev ^= Number(c); return String(prev); }).join('');
}
// 進位制：base 2、8、10、16
export function convertBase(val, base) {
  const s = clean(val).toLowerCase();
  const ok = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/ }[base];
  if (!ok || !ok.test(s)) throw new Error('number');
  const n = BigInt(base === 10 ? s : `0${{ 2: 'b', 8: 'o', 16: 'x' }[base]}${s}`);
  const bin = n.toString(2);
  return { bin: bin.padStart(Math.ceil(bin.length / 4) * 4, '0').replace(/(.{4})(?=.)/g, '$1 '), oct: n.toString(8), dec: n.toString(10), hex: n.toString(16).toUpperCase() };
}
