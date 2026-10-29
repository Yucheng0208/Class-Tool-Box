// 多語系：依瀏覽器語言自動選擇，也可手動切換（記在 localStorage）
export const LANGS = [
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ms', label: 'Bahasa Melayu' },
];
const FALLBACK = 'zh-TW';

let dict = {};
let base = {};
export let lang = FALLBACK;

function stored() {
  try { return localStorage.getItem('lang'); } catch { return null; }
}

export function detectLang() {
  const s = stored();
  if (s && LANGS.some((l) => l.code === s)) return s;
  for (const raw of navigator.languages || [navigator.language || '']) {
    const l = raw.toLowerCase();
    if (/^zh-(tw|hk|mo)|^zh-hant/.test(l)) return 'zh-TW';
    if (l.startsWith('zh')) return 'zh-CN';
    for (const code of ['en', 'ja', 'vi', 'hi', 'ms']) if (l === code || l.startsWith(`${code}-`)) return code;
    if (l.startsWith('id')) return 'ms';
  }
  return 'en';
}

async function load(code) {
  try {
    const r = await fetch(`/i18n/${code}.json`, { cache: 'no-cache' });
    return r.ok ? await r.json() : {};
  } catch { return {}; }
}

export async function initI18n() {
  lang = detectLang();
  base = await load(FALLBACK);
  dict = lang === FALLBACK ? base : await load(lang);
  document.documentElement.lang = lang === 'zh-TW' ? 'zh-Hant-TW' : lang === 'zh-CN' ? 'zh-Hans-CN' : lang;
  applyI18n();
}

export function t(key, vars) {
  let s = dict[key] ?? base[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return s;
}

// HTML 內用 data-i18n="key"（文字）、data-i18n-html（含標籤，只用於字典內容）、
// data-i18n-ph（placeholder）、data-i18n-aria（aria-label）、data-i18n-title（title）
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    if (el.dataset.icon) el.innerHTML = `${icon(el.dataset.icon)} <span>${escHtml(t(el.dataset.i18n))}</span>`;
    else el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}

export function setLang(code) {
  try { localStorage.setItem('lang', code); } catch { /* 無痕模式 */ }
  location.reload();
}

// Font Awesome 圖示（純裝飾，對螢幕閱讀器隱藏）
export const icon = (name, style = 'solid') => `<i class="fa-${style} ${name}" aria-hidden="true"></i>`;
// 圖示＋翻譯文字（回傳 HTML）
export const ti = (iconName, key, vars) => `${icon(iconName)} <span>${escHtml(t(key, vars))}</span>`;
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const fmtDate = (iso) => new Date(iso).toLocaleString(lang, { hour12: false });

// 「114-1」拆成學年度與學期；格式不符時整串當學年度
export function termParts(term) {
  const s = String(term || '').trim();
  const m = /^(\d{2,4})-(\d)$/.exec(s);
  return m ? { year: m[1], sem: m[2] } : { year: s, sem: '' };
}

// 學期代碼「114-1」→「114 學年度第 1 學期」；其他格式原樣顯示，空白 = 未分學期
export function termLabel(term) {
  const m = /^(\d{2,4})-(\d)$/.exec(String(term || '').trim());
  if (m) return t('term.label', { year: m[1], sem: m[2] });
  return term || t('term.none');
}

// 公告的發佈對象 → 「龍華科技大學・日間部・全部課程」或單一課程名稱
export function annTargetLabel(tg, courseName) {
  tg = tg || {};
  if (tg.code && tg.code !== '*') return courseName || tg.code;
  const on = (k) => tg[k] && tg[k] !== '*';
  const parts = [on('school') && tg.school, on('division') && tg.division, on('className') && tg.className,
    on('year') && (/^\d+$/.test(tg.year) ? t('term.year', { year: tg.year }) : tg.year), on('sem') && t('term.sem', { sem: tg.sem })].filter(Boolean);
  return [...parts, t('ann.allCourses')].join('・');
}

// 課程補充資訊：部別・科系・班級・學分・學年度學期
export const courseMeta = (c) => [c.division, c.department, c.className, c.credits && t('course.credits', { n: c.credits }), c.term && termLabel(c.term)].filter(Boolean).join('・');
