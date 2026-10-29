// 下拉選單：攔下瀏覽器原生清單，改用馬力歐風格的像素選單；選到的值仍寫回原本的 <select>，
// 所以各頁原有的 change 事件、表單送出、程式設定 .value 都照常運作。用事件委派，之後才加入的 <select> 也適用。
import { sfx } from './sound.js';

let menu = null, cur = null, act = -1, typed = '', typedAt = 0;

const usable = (s) => s && s.tagName === 'SELECT' && !s.multiple && !(s.size > 1) && !s.disabled;
const opts = () => [...cur.options];
const ok = (o) => !o.disabled && !o.hidden;

function close(refocus = false) {
  if (!menu) return;
  menu.remove();
  cur.removeAttribute('aria-expanded');
  if (refocus) cur.focus({ preventScroll: true });
  menu = null; cur = null; act = -1;
}

function mark(i, scroll = true) {
  act = i;
  menu.querySelectorAll('.px-opt').forEach((el) => el.classList.toggle('act', +el.dataset.i === i));
  const el = menu.querySelector(`[data-i="${i}"]`);
  if (el && scroll) el.scrollIntoView({ block: 'nearest' });
}

function choose(i) {
  const s = cur, o = s.options[i];
  if (!o || !ok(o)) return;
  close(true);
  if (s.selectedIndex !== i) {
    s.selectedIndex = i;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }
  sfx.coin();
}

function place() {
  const r = cur.getBoundingClientRect();
  const below = innerHeight - r.bottom - 10, above = r.top - 10;
  const up = below < 180 && above > below;
  menu.style.minWidth = `${Math.round(r.width)}px`;
  menu.style.maxHeight = `${Math.max(120, Math.min(340, up ? above : below))}px`;
  menu.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)))}px`;
  menu.style.top = up ? '' : `${Math.round(r.bottom + 4)}px`;
  menu.style.bottom = up ? `${Math.round(innerHeight - r.top + 4)}px` : '';
  menu.classList.toggle('up', up);
}

function open(s) {
  close();
  cur = s;
  menu = document.createElement('div');
  menu.className = 'px-menu';
  menu.setAttribute('role', 'listbox');
  const label = s.labels?.[0]?.querySelector('span')?.textContent || s.getAttribute('aria-label');
  if (label) menu.setAttribute('aria-label', label);
  opts().forEach((o, i) => {
    if (o.hidden) return;
    const d = document.createElement('div');
    d.className = `px-opt${o.selected ? ' on' : ''}${o.disabled ? ' off' : ''}`;
    d.dataset.i = i;
    d.setAttribute('role', 'option');
    d.setAttribute('aria-selected', String(o.selected));
    d.textContent = o.textContent;
    menu.appendChild(d);
  });
  document.body.appendChild(menu);
  s.setAttribute('aria-expanded', 'true');
  place();
  mark(s.selectedIndex >= 0 ? s.selectedIndex : opts().findIndex(ok));
  menu.addEventListener('mousemove', (e) => { const d = e.target.closest('.px-opt:not(.off)'); if (d && +d.dataset.i !== act) mark(+d.dataset.i, false); });
  menu.addEventListener('click', (e) => { const d = e.target.closest('.px-opt'); if (d) choose(+d.dataset.i); });
  s.focus({ preventScroll: true });
}

function step(dir) {
  const list = opts();
  for (let i = act + dir; i >= 0 && i < list.length; i += dir) if (ok(list[i])) return mark(i);
}

// 打字跳到開頭相符的選項
function typeahead(key) {
  const now = Date.now();
  typed = now - typedAt < 700 ? typed + key.toLowerCase() : key.toLowerCase();
  typedAt = now;
  const list = opts(), from = typed.length > 1 ? act : act + 1;
  for (let k = 0; k < list.length; k++) {
    const i = (from + k + list.length) % list.length;
    if (ok(list[i]) && list[i].textContent.trim().toLowerCase().startsWith(typed)) return mark(i);
  }
}

export function mountSelects() {
  document.addEventListener('mousedown', (e) => {
    if (menu && menu.contains(e.target)) { e.preventDefault(); return; }
    const s = e.target.closest?.('select');
    if (e.button === 0 && usable(s)) {
      e.preventDefault();
      if (cur === s) close(true); else open(s);
      return;
    }
    close();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (menu) {
      const k = e.key;
      if (k === 'ArrowDown') step(1);
      else if (k === 'ArrowUp') step(-1);
      else if (k === 'Home') { act = -1; step(1); }
      else if (k === 'End') { act = cur.options.length; step(-1); }
      else if (k === 'PageDown') for (let n = 0; n < 6; n++) step(1);
      else if (k === 'PageUp') for (let n = 0; n < 6; n++) step(-1);
      else if (k === 'Enter' || k === ' ') choose(act);
      else if (k === 'Escape') close(true);
      else if (k === 'Tab') { close(); return; }
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey) typeahead(k);
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    const s = e.target;
    if (usable(s) && (e.key === ' ' || e.key === 'Enter' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')))) {
      e.preventDefault(); e.stopImmediatePropagation();
      open(s);
    }
  }, true);

  addEventListener('resize', () => close());
  addEventListener('scroll', (e) => { if (menu && !menu.contains(e.target)) close(); }, true);
  addEventListener('blur', () => close());
}
