// 成績計算共用模組：前端（老師頁面）與後端（Worker）都會引用同一份邏輯。

export const ITEMS = [
  { key: 'usual', label: '平時成績' },
  { key: 'attendance', label: '出席' },
  { key: 'midterm', label: '期中考' },
  { key: 'final', label: '期末考' },
  { key: 'quiz', label: '小考' },
  { key: 'bonus', label: '加分' },
];

export const BASE_KEYS = ['usual', 'attendance', 'midterm', 'final', 'quiz'];

// 每門課的設定
export const DEFAULT_CONFIG = {
  weights: { usual: 20, attendance: 10, midterm: 25, final: 30, quiz: 15, bonus: 0 },
  passScore: 60,
  capAt100: true,          // 總成績上限 100
  published: true,         // 是否開放學生查詢
  queryFrom: '',           // 學生查詢開始時間（ISO，空 = 不限）
  queryUntil: '',          // 學生查詢截止時間（ISO，空 = 不限）；老師端不受限制
  showRank: true,          // 是否顯示排名
  showDistribution: true,  // 是否顯示班級落點
  step: 1,                 // 抽籤加/扣分預設分數
  announcement: '',        // 課程公告（顯示在學生成績頁）
  warnings: { absenceLimit: 3, attendanceMin: 60, midtermMin: 60, totalMin: 55 },
  classroom: { rows: 6, cols: 6, seatOrder: 'col' }, // seatOrder: col=座號由前往後直排, row=由左往右橫排
};

// 全站設定
// teacherEmail：預設 Email；schoolEmails：{ 學校名稱: [Email, …] }（每校可設多個），學生依所屬學校顯示
// teacherHomepage：老師個人網頁（顯示在學生頁）
export const DEFAULT_GLOBAL = { idleSeconds: 30, teacherEmail: '', schoolEmails: {}, teacherHomepage: '' };

export function mergeConfig(cfg) {
  const c = { ...DEFAULT_CONFIG, ...(cfg || {}) };
  for (const k of ['weights', 'warnings', 'classroom']) c[k] = { ...DEFAULT_CONFIG[k], ...((cfg && cfg[k]) || {}) };
  return c;
}
export function mergeGlobal(g) {
  const out = { ...DEFAULT_GLOBAL, ...(g || {}) };
  // 舊資料一校只有一個 Email（字串），統一轉成陣列
  out.schoolEmails = Object.fromEntries(Object.entries(out.schoolEmails || {})
    .map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).filter(Boolean)]).filter(([, v]) => v.length));
  return out;
}

// 成績分級：<55 觀察名單、55-59 有機會補救、60 以上依級距
export const TIERS = [
  { key: 'watch', min: -Infinity, color: '#e52521' },
  { key: 'remedial', min: 55, color: '#f08a00' },
  { key: 'pass', min: 60, color: '#b39200' },
  { key: 'good', min: 70, color: '#2bb24c' },
  { key: 'great', min: 80, color: '#1f6fe5' },
  { key: 'excellent', min: 90, color: '#9b30d9' },
];
export function tierOf(total) {
  let t = TIERS[0];
  for (const x of TIERS) if (total >= x.min) t = x;
  return t;
}

// 課程預警
export function computeWarnings(scores, result, cfg) {
  const w = cfg.warnings;
  const s = scores || {};
  const out = [];
  if (num(s.absences) !== null && s.absences >= w.absenceLimit) out.push({ code: 'absence', value: s.absences, limit: w.absenceLimit });
  if (num(s.attendance) !== null && s.attendance < w.attendanceMin) out.push({ code: 'attendance', value: s.attendance, limit: w.attendanceMin });
  if (num(s.midterm) !== null && s.midterm < w.midtermMin) out.push({ code: 'midterm', value: s.midterm, limit: w.midtermMin });
  if (result && result.total < w.totalMin) out.push({ code: 'total', value: result.total, limit: w.totalMin });
  return out;
}

// 座號 ↔ 教室座位（row 0 = 最前排，col 0 = 最左邊）
export function seatToCell(seat, room) {
  const n = parseInt(seat, 10);
  if (!Number.isFinite(n) || n < 1 || n > room.rows * room.cols) return null;
  return room.seatOrder === 'row'
    ? { r: Math.floor((n - 1) / room.cols), c: (n - 1) % room.cols }
    : { r: (n - 1) % room.rows, c: Math.floor((n - 1) / room.rows) };
}

export const round1 = (n) => Math.round(n * 10) / 10;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// 加分比例為 0%：其他五項需合計 100%，加分直接加在總成績。
// 加分比例 > 0%：六項（含加分）需合計 100%。
export function validateWeights(w) {
  const bonusMode = (Number(w.bonus) || 0) === 0 ? 'add' : 'weighted';
  const keys = bonusMode === 'add' ? BASE_KEYS : ITEMS.map((i) => i.key);
  for (const k of ITEMS.map((i) => i.key)) {
    const v = Number(w[k]);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      return { ok: false, bonusMode, sum: NaN, message: '比例必須是 0～100 的數字' };
    }
  }
  const sum = round1(keys.reduce((s, k) => s + Number(w[k] || 0), 0));
  if (sum !== 100) {
    const msg = bonusMode === 'add'
      ? `加分比例為 0%（直接加總），其餘五項需合計 100%，目前為 ${sum}%`
      : `加分比例 > 0%，六項需合計 100%，目前為 ${sum}%`;
    return { ok: false, bonusMode, sum, message: msg };
  }
  return { ok: true, bonusMode, sum, message: '' };
}

export function hasAnyScore(scores) {
  return !!scores && ITEMS.some((i) => num(scores[i.key]) !== null);
}

// scores: { usual, attendance, ... }（未登錄可為 null）；adj：抽籤累積的加/扣分
export function computeTotal(scores, adj, cfg) {
  const w = cfg.weights;
  const s = scores || {};
  const bonusRaw = num(s.bonus) ?? 0;
  const lottery = Number(adj) || 0;
  const bonusTotal = round1(bonusRaw + lottery);
  const bonusMode = (Number(w.bonus) || 0) === 0 ? 'add' : 'weighted';

  let total = 0;
  const parts = {};
  for (const k of BASE_KEYS) {
    const p = ((num(s[k]) ?? 0) * Number(w[k] || 0)) / 100;
    parts[k] = round1(p);
    total += p;
  }
  if (bonusMode === 'add') {
    parts.bonus = bonusTotal;
    total += bonusTotal;
  } else {
    const b = Math.max(0, Math.min(100, bonusTotal));
    parts.bonus = round1((b * Number(w.bonus)) / 100);
    total += (b * Number(w.bonus)) / 100;
  }
  if (cfg.capAt100) total = Math.min(100, total);
  total = Math.max(0, total);
  return { total: round1(total), bonusRaw, lottery, bonusTotal, bonusMode, parts };
}

export function classStats(totals, passScore) {
  const arr = [...totals].sort((a, b) => a - b);
  const n = arr.length;
  if (!n) return null;
  const sum = arr.reduce((a, b) => a + b, 0);
  const avg = sum / n;
  const median = n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2;
  const std = Math.sqrt(arr.reduce((a, b) => a + (b - avg) ** 2, 0) / n);
  const passCount = arr.filter((t) => t >= passScore).length;
  return {
    count: n,
    avg: round1(avg),
    median: round1(median),
    max: round1(arr[n - 1]),
    min: round1(arr[0]),
    std: round1(std),
    passCount,
    passRate: round1((passCount / n) * 100),
  };
}

export const BIN_LABELS = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90-100'];

export function binIndex(t) {
  return Math.max(0, Math.min(9, Math.floor(t / 10)));
}

export function distribution(totals) {
  const bins = new Array(10).fill(0);
  for (const t of totals) bins[binIndex(t)]++;
  return bins;
}

// 學生查詢期間：'before' 尚未開始、'after' 已結束、'' 在期間內
export function queryState(cfg, now = Date.now()) {
  if (cfg.queryFrom && now < Date.parse(cfg.queryFrom)) return 'before';
  if (cfg.queryUntil && now > Date.parse(cfg.queryUntil)) return 'after';
  return '';
}


// 部別固定順序；其他名稱排在後面
export const DIVISIONS = ['日間部', '進修部', '假日班', '寒修', '暑修'];
export const divisionOrder = (a, b) => {
  const ia = DIVISIONS.indexOf(a), ib = DIVISIONS.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a).localeCompare(String(b));
};
