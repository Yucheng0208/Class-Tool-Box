// 日期 / 時間 / 日期時間欄位：點一下改開馬力歐風格的像素月曆或時間框（原生的無法換樣式）；
// 鍵盤直接在欄位裡打字仍可修改。選好的值寫回原本的 <input>，並觸發 input / change。
import { sfx } from './sound.js';
import { t, lang } from './i18n.js';

let pop = null, cur = null, view = null, pick = null;
const pad = (n) => String(n).padStart(2, '0');
const isDT = () => cur.type === 'datetime-local';
const isT = () => cur.type === 'time';
const hasTime = () => isDT() || isT();
const usable = (el) => el && el.tagName === 'INPUT' && ['date', 'time', 'datetime-local'].includes(el.type) && !el.disabled && !el.readOnly;
const loc = () => document.documentElement.lang || lang;
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function parse(v) {
  const tm = /^(\d{2}):(\d{2})/.exec(v || '');
  if (isT()) { if (!tm) return null; const d = new Date(); d.setHours(+tm[1], +tm[2], 0, 0); return d; }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
}
const fmt = (d) => isT() ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${isDT() ? `T${pad(d.getHours())}:${pad(d.getMinutes())}` : ''}`;

function close(refocus = false) {
  if (!pop) return;
  pop.remove();
  cur.removeAttribute('aria-expanded');
  if (refocus) cur.focus({ preventScroll: true });
  pop = null; cur = null;
}

function commit(d) {
  const inp = cur, v = d ? fmt(d) : '';
  close(true);
  if (inp.value !== v) {
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  sfx.coin();
}

function draw() {
  const y = view.getFullYear(), m = view.getMonth(), today = new Date();
  const title = new Intl.DateTimeFormat(loc(), { year: 'numeric', month: 'long' }).format(view);
  const wd = new Intl.DateTimeFormat(loc(), { weekday: 'narrow' });
  const heads = Array.from({ length: 7 }, (_, i) => `<span class="dp-wd">${wd.format(new Date(2024, 0, 7 + i))}</span>`).join('');
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m, i - first + 1), out = d.getMonth() !== m;
    if (i >= 35 && first + days <= 35) break;
    cells += `<button type="button" class="dp-day${out ? ' out' : ''}${sameDay(d, today) ? ' today' : ''}${sameDay(d, pick) ? ' on' : ''}" data-d="${d.getFullYear()}-${d.getMonth()}-${d.getDate()}">${d.getDate()}</button>`;
  }
  const opt = (n, sel) => Array.from({ length: n }, (_, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${pad(i)}</option>`).join('');
  const p = pick || new Date();
  const time = hasTime() ? `<div class="dp-time"><span>${t('dp.time')}</span><select class="dp-h" aria-label="hour">${opt(24, p.getHours())}</select><b>:</b><select class="dp-m" aria-label="minute">${opt(60, p.getMinutes())}</select></div>` : '';
  const foot = `<div class="dp-foot">
      <button type="button" class="btn btn-small" data-act="clear">${t('dp.clear')}</button>
      <button type="button" class="btn btn-small" data-act="now">${t(hasTime() ? 'dp.now' : 'dp.today')}</button>
      ${hasTime() ? `<button type="button" class="btn btn-small btn-primary" data-act="ok">${t('dp.ok')}</button>` : ''}
    </div>`;
  if (isT()) { pop.innerHTML = time + foot; return; }
  pop.innerHTML = `<div class="dp-head">
      <button type="button" class="dp-nav" data-nav="-1" aria-label="${t('dp.prev')}" title="${t('dp.prev')}">◀</button>
      <b>${title}</b>
      <button type="button" class="dp-nav" data-nav="1" aria-label="${t('dp.next')}" title="${t('dp.next')}">▶</button>
    </div>
    <div class="dp-grid">${heads}${cells}</div>
    ${time}${foot}`;
}

function place() {
  const r = cur.getBoundingClientRect();
  const h = pop.offsetHeight, w = pop.offsetWidth;
  const up = innerHeight - r.bottom < h + 12 && r.top > innerHeight - r.bottom;
  pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - w - 8)))}px`;
  pop.style.top = `${Math.round(up ? Math.max(8, r.top - h - 4) : r.bottom + 4)}px`;
  pop.classList.toggle('up', up);
}

// 時、分改成選單裡的值
function withTime(d) {
  if (!hasTime()) return d;
  const h = pop.querySelector('.dp-h'), m = pop.querySelector('.dp-m');
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), +h.value, +m.value);
}

function open(inp) {
  close();
  cur = inp;
  pick = parse(inp.value);
  view = new Date((pick || new Date()).getFullYear(), (pick || new Date()).getMonth(), 1);
  pop = document.createElement('div');
  pop.className = `dp-pop${isT() ? ' time-only' : ''}`;
  pop.setAttribute('role', 'dialog');
  draw();
  document.body.appendChild(pop);
  place();
  inp.setAttribute('aria-expanded', 'true');
  pop.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]'), day = e.target.closest('[data-d]'), act = e.target.closest('[data-act]');
    if (nav) { view = new Date(view.getFullYear(), view.getMonth() + +nav.dataset.nav, 1); keepTime(); draw(); place(); sfx.tick(); }
    else if (day) {
      const [y, m, d] = day.dataset.d.split('-').map(Number);
      const base = withTime(new Date(y, m, d));
      if (!isDT()) return commit(base);
      pick = base; view = new Date(y, m, 1); draw(); sfx.tick();
    } else if (act) {
      const a = act.dataset.act;
      if (a === 'clear') commit(null);
      else if (a === 'now') { const n = new Date(); n.setSeconds(0, 0); commit(n); }
      else if (a === 'ok') commit(withTime(pick || new Date()));
    }
  });
  pop.addEventListener('change', (e) => { if (e.target.matches('.dp-h, .dp-m')) pick = withTime(pick || new Date()); });
}

// 換月前先記住目前選的時、分
function keepTime() { if (hasTime() && pick) pick = withTime(pick); }

export function mountDates() {
  document.addEventListener('mousedown', (e) => {
    if (pop && (pop.contains(e.target) || e.target.closest?.('.px-menu'))) return;
    const inp = e.target.closest?.('input');
    if (e.button === 0 && usable(inp)) {
      e.preventDefault();
      if (cur === inp) close(true); else { inp.focus({ preventScroll: true }); open(inp); }
      return;
    }
    close();
  }, true);
  // 原生的月曆快捷鍵（Alt+↓、F4）也改開像素月曆
  document.addEventListener('keydown', (e) => {
    if (pop && e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (pop && e.key === 'Tab' && !pop.contains(e.target)) { close(); return; }
    if (usable(e.target) && (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown'))) { e.preventDefault(); open(e.target); }
  }, true);
  addEventListener('resize', () => close());
  addEventListener('scroll', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest?.('.px-menu')) close(); }, true);
}
