// 共用：API、主題（深/淺色）、語言、煙火、像素圖示、頁尾
// 課堂工具箱版：沒有後端，api() 改由 localdb.js 存在瀏覽器
import { sfx } from './sound.js';
import { localApi } from './localdb.js';
import { mountSelects } from './pixelselect.js';
import { mountDates } from './pixeldate.js';
import { t, LANGS, lang, setLang, icon } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 無痕模式 */ } },
};

export async function api(path, opts = {}) {
  return localApi(path, opts);
}

// 確認視窗（取代瀏覽器的 confirm：有些瀏覽器會擋掉或直接回答「取消」，看起來就像按了沒反應）
export function askConfirm(msg, { ok = '確定', cancel = '取消', danger = true } = {}) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const box = document.createElement('div');
    box.className = 'modal open ask-modal';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = `<div class="modal-box ask-box"><div class="modal-body ask-msg"></div>
      <footer><button class="btn" type="button" data-a="0"></button><button class="btn ${danger ? 'btn-primary' : 'btn-green'}" type="button" data-a="1"></button></footer></div>`;
    box.querySelector('.ask-msg').textContent = msg;
    const [no, yes] = box.querySelectorAll('[data-a]');
    no.textContent = t('common.cancel') || cancel;
    yes.textContent = t('common.ok') || ok;
    const done = (v) => { box.remove(); document.removeEventListener('keydown', key, true); prevFocus && prevFocus.focus && prevFocus.focus(); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(false); } };
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) done(b.dataset.a === '1'); else if (e.target === box) done(false); });
    document.addEventListener('keydown', key, true);
    document.body.append(box);
    yes.focus();
  });
}

export function toast(msg, type = 'info') {
  let box = $('#toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  // 同一句話還在畫面上就不再疊一張，只重新計時
  const same = [...box.children].find((x) => x.dataset.msg === `${type}|${msg}` && !x.classList.contains('out'));
  if (same) { clearTimeout(same._t1); clearTimeout(same._t2); arm(same); return; }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.dataset.msg = `${type}|${msg}`;
  const ic = { error: 'fa-triangle-exclamation', ok: 'fa-circle-check' }[type] || 'fa-circle-info';
  el.innerHTML = `<span class="toast-ic">${icon(ic)}</span><span class="toast-msg"></span>`;
  el.querySelector('.toast-msg').textContent = msg;
  box.appendChild(el);
  arm(el);
}
function arm(el) {
  el._t1 = setTimeout(() => el.classList.add('out'), 3200);
  el._t2 = setTimeout(() => el.remove(), 3500);
}

// ---------- Cloudflare Turnstile ----------
let tsPromise = null;
function loadTurnstile() {
  if (tsPromise) return tsPromise;
  tsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => reject(new Error(t('err.turnstileLoad')));
    document.head.appendChild(s);
  });
  return tsPromise;
}

export async function mountTurnstile(el, siteKey) {
  const ts = await loadTurnstile();
  let token = '';
  const id = ts.render(el, {
    sitekey: siteKey,
    language: lang.toLowerCase(),
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    size: innerWidth < 345 ? 'compact' : 'flexible', // flexible 最小寬 300px，太窄的手機改用 compact
    callback: (v) => { token = v; },
    'expired-callback': () => { token = ''; },
    'error-callback': () => { token = ''; },
  });
  return {
    get token() { return token; },
    reset() { token = ''; ts.reset(id); },
  };
}

// ---------- 閒置自動登出（學生頁使用） ----------
// 偵測滑鼠移動（以及觸控、鍵盤、捲動，讓手機也適用）
export function startIdleLogout(seconds, redirectTo) {
  const bar = document.createElement('div');
  bar.id = 'idle-bar';
  bar.innerHTML = '<span id="idle-text"></span><div id="idle-fill"></div>';
  document.body.appendChild(bar);
  document.body.classList.add('has-idle');
  const text = $('#idle-text', bar);
  const fill = $('#idle-fill', bar);

  let last = Date.now();
  let done = false;
  const reset = () => { last = Date.now(); };
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'wheel', 'scroll'].forEach((ev) =>
    window.addEventListener(ev, reset, { passive: true }));

  const timer = setInterval(async () => {
    const left = Math.max(0, seconds - (Date.now() - last) / 1000);
    fill.style.width = `${(left / seconds) * 100}%`;
    text.textContent = t('idle.countdown', { n: Math.ceil(left) });
    bar.classList.toggle('warn', left <= 10);
    if (left <= 0 && !done) {
      done = true;
      clearInterval(timer);
      await logout(redirectTo, 'idle');
    }
  }, 250);
}

export async function logout(redirectTo, reason = '') {
  sfx.pipe();
  try { await api('/api/logout', { method: 'POST' }); } catch { /* 無論如何都離開 */ }
  setTimeout(() => { location.href = redirectTo + (reason ? `?reason=${reason}` : ''); }, 450);
}

// ---------- 深色 / 淺色模式 ----------
export function initTheme() {
  const pref = store.get('theme', 'auto');
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  return pref;
}
initTheme();

// ---------- 滑鼠特效：游標是問號磚塊，點一下跳出金幣（慶祝時仍用煙火 burst） ----------
// 慶祝煙火一律開啟（系統設定「減少動態效果」時關閉）
const fxOn = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const FX_COLORS = ['#fbd000', '#e52521', '#2bb24c', '#5c94fc', '#ff7ac8', '#ffffff', '#ff9f1c'];
let canvas, cx, parts = [], raf = 0;

function fxLoop() {
  cx.clearRect(0, 0, canvas.width, canvas.height);
  const dpr = window.devicePixelRatio || 1;
  parts = parts.filter((p) => p.life > 0);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.985; p.life -= p.decay;
    if (p.coin) { drawCoin(p, dpr); continue; }
    cx.globalAlpha = Math.max(0, p.life);
    cx.fillStyle = p.c;
    const s = p.size * dpr;
    cx.fillRect(p.x * dpr - s / 2, p.y * dpr - s / 2, s, s); // 方形粒子 = 像素風
  }
  cx.globalAlpha = 1;
  raf = parts.length ? requestAnimationFrame(fxLoop) : 0;
}
function spawn(x, y, n, speed, size, g) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g, size: size * (0.6 + Math.random() * 0.6), life: 1, decay: 0.012 + Math.random() * 0.02, c: FX_COLORS[(Math.random() * FX_COLORS.length) | 0] });
  }
  if (parts.length > 600) parts.splice(0, parts.length - 600);
  if (!raf) raf = requestAnimationFrame(fxLoop);
}
export function burst(x, y, n = 46) { if (fxOn && canvas) spawn(x, y, n, 6, 5, 0.12); }

// 金幣精靈圖（8×8 像素，畫在離屏 canvas 上供重複使用）
const COIN_ROWS = ['..KKKK..', '.KYYYYK.', 'KYYWYYYK', 'KYYWYYYK', 'KYYWYYYK', 'KYYWYYYK', '.KYYYYK.', '..KKKK..'];
let coinSprite = null;
function getCoinSprite() {
  if (coinSprite) return coinSprite;
  coinSprite = document.createElement('canvas');
  coinSprite.width = 8; coinSprite.height = 8;
  const c = coinSprite.getContext('2d');
  const col = { K: '#000', Y: '#fbd000', W: '#fff' };
  COIN_ROWS.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) { c.fillStyle = col[ch]; c.fillRect(x, y, 1, 1); } }));
  return coinSprite;
}
function drawCoin(p, dpr) {
  const size = 26 * dpr;
  const sx = Math.max(0.12, Math.abs(Math.cos(p.spin += 0.35))); // 旋轉：左右縮放
  cx.save();
  cx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
  cx.imageSmoothingEnabled = false;
  cx.translate(p.x * dpr, p.y * dpr);
  cx.scale(sx, 1);
  cx.drawImage(getCoinSprite(), -size / 2, -size / 2, size, size);
  cx.restore();
  // 到最高點附近閃一下
  if (!p.sparked && p.vy > -0.5) { p.sparked = true; spawn(p.x, p.y, 8, 2.2, 4, 0.02); }
}
export function coinPop(x, y) {
  if (!fxOn || !canvas) return;
  parts.push({ coin: true, x, y: y - 14, vx: 0, vy: -9.5, g: 0.42, life: 1, decay: 0.022, spin: 0 });
  if (!raf) raf = requestAnimationFrame(fxLoop);
}

// 游標：問號磚塊；點下去的瞬間變成「撞過的」咖啡色磚塊
// 簡約版：游標維持系統預設
function applyCursor() {}

function initFireworks() {
  canvas = document.createElement('canvas');
  canvas.id = 'fx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  cx = canvas.getContext('2d');
  const size = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  };
  size();
  addEventListener('resize', size);
  applyCursor();
  // 簡約版：點畫面不跳金幣（慶祝煙火保留）
}

// ---------- 頂部工具列（語言 / 主題 / 煙火 / 音效）與頁尾 ----------
export function mountChrome({ sound } = {}) {
  const box = $('#chrome');
  if (box) {
    const langMenu = `<div class="pop-menu" id="lang-menu">
        <button class="btn btn-small icon-btn" id="lang-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Language" title="Language"><i class="fa-solid fa-globe" aria-hidden="true"></i></button>
        <div class="menu" role="menu" hidden>${LANGS.map((l) => `<button type="button" role="menuitemradio" aria-checked="${l.code === lang}" data-lang="${l.code}">${l.code === lang ? `${icon('fa-check')} ` : ''}${l.label}</button>`).join('')}</div>
      </div>`;
    box.innerHTML = `${langMenu}
      <button class="btn btn-small icon-btn" id="theme-btn" type="button"></button>
      ${sound ? '<button class="btn btn-small icon-btn" id="sound-btn" type="button"></button>' : ''}`;
    const lbtn = $('#lang-btn'), lmenu = $('#lang-menu .menu');
    const closeMenu = () => { lmenu.hidden = true; lbtn.setAttribute('aria-expanded', 'false'); };
    lbtn.addEventListener('click', (e) => { e.stopPropagation(); lmenu.hidden = !lmenu.hidden; lbtn.setAttribute('aria-expanded', String(!lmenu.hidden)); });
    lmenu.addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    const themeBtn = $('#theme-btn');
    const drawTheme = () => {
      const pref = store.get('theme', 'auto');
      themeBtn.innerHTML = icon({ auto: 'fa-circle-half-stroke', light: 'fa-sun', dark: 'fa-moon' }[pref]);
      themeBtn.title = t(`theme.${pref}`);
      themeBtn.setAttribute('aria-label', t(`theme.${pref}`));
    };
    themeBtn.addEventListener('click', () => {
      const order = ['auto', 'light', 'dark'];
      const next = order[(order.indexOf(store.get('theme', 'auto')) + 1) % 3];
      store.set('theme', next);
      initTheme();
      drawTheme();
    });
    drawTheme();

    if (sound) renderSoundToggle($('#sound-btn'), sound);
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', initTheme);
  initFireworks();
  renderFooter();
  mountToTop();
  mountSelects();
  mountDates();
  mountReveal();
}

// 帳號密碼欄位：預設隱藏，旁邊的眼睛點一下才顯示
function mountReveal() {
  document.querySelectorAll('input[data-reveal]').forEach((inp) => {
    if (inp.parentElement.classList.contains('reveal-wrap')) return;
    const wrap = document.createElement('span');
    wrap.className = 'reveal-wrap';
    inp.before(wrap);
    wrap.append(inp);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'reveal-btn';
    const isPw = inp.type === 'password';
    const set = (shown) => {
      if (isPw) inp.type = shown ? 'text' : 'password';
      else inp.classList.toggle('masked', !shown);
      b.innerHTML = `<i class="fa-solid ${shown ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
      b.setAttribute('aria-pressed', String(shown));
      b.setAttribute('aria-label', t(shown ? 'common.hide' : 'common.show'));
      b.title = b.getAttribute('aria-label');
    };
    let shown = false;
    set(false);
    b.addEventListener('mousedown', (e) => e.preventDefault()); // 不搶走輸入框焦點
    b.addEventListener('click', (e) => { e.preventDefault(); shown = !shown; set(shown); sfx.click?.(); });
    // 送出或切換登入/註冊後回到隱藏
    inp.form?.addEventListener('submit', () => { shown = false; set(false); });
    wrap.append(b);
  });
}

// 回到最上面：往下捲動後出現，點一下回到頁首
function mountToTop() {
  const b = document.createElement('button');
  b.id = 'to-top';
  b.type = 'button';
  b.className = 'btn';
  b.title = t('common.toTop');
  b.setAttribute('aria-label', t('common.toTop'));
  b.innerHTML = icon('fa-arrow-up');
  document.body.appendChild(b);
  b.addEventListener('click', () => { sfx.jump(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  const toggle = () => b.classList.toggle('show', window.scrollY > 300);
  addEventListener('scroll', toggle, { passive: true });
  toggle();
}

export function renderFooter() {
  const f = $('footer.ground');
  if (!f) return;
  const year = new Date().getFullYear();
  f.innerHTML = `<div class="copy-pill"><span>© ${year}</span><a href="https://www.yucheng208.net" target="_blank" rel="noopener">${esc(t('footer.owner'))}</a><span>${esc(t('footer.rights'))}</span></div>`;
}

// 網站 LOGO：public/img/logo.png 存在時，取代左上角與頁尾的問號方塊，並當作分頁圖示；沒有就維持問號方塊
export const LOGO_SRC = '/img/classtool-logo.png';
let logoOk = null; // null = 還沒檢查
function applyLogo() {
  if (logoOk === false) return;
  const put = () => {
    $$('.brand .qblock, .copy-pill .qblock').forEach((el) => {
      if (el.classList.contains('logo-mark')) return;
      el.classList.add('logo-mark');
      el.innerHTML = `<img src="${LOGO_SRC}" alt="">`;
    });
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    if (!link.href.endsWith(LOGO_SRC)) { link.type = 'image/png'; link.href = LOGO_SRC; }
  };
  if (logoOk) { put(); return; }
  const img = new Image();
  img.onload = () => { logoOk = true; put(); };
  img.onerror = () => { logoOk = false; };
  img.src = LOGO_SRC;
}

export function renderSoundToggle(el, sound) {
  const draw = () => {
    el.innerHTML = icon(sound.enabled ? 'fa-volume-high' : 'fa-volume-xmark');
    el.title = t(sound.enabled ? 'sound.on' : 'sound.off');
    el.setAttribute('aria-pressed', sound.enabled ? 'true' : 'false');
  };
  el.addEventListener('click', () => { sound.enabled = !sound.enabled; draw(); if (sound.enabled) sfx.coin(); });
  draw();
}

// ---------- 像素圖 ----------
const PALETTE = {
  K: '#000', W: '#fff', R: '#e52521', G: '#2bb24c', P: '#7b2fbe', D: '#3b0f5c', S: '#f8d8a8',
  Y: '#fbd000', O: '#ff8a1c', B: '#6b3a1e', N: '#1d3c8f', C: '#a8d8ff', Q: '#c84c0c',
};
export function pixelSvg(rows, size = 4) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  let r = '';
  rows.forEach((line, y) => [...line].forEach((ch, x) => {
    if (PALETTE[ch]) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${PALETTE[ch]}"/>`;
  }));
  return `<svg viewBox="0 0 ${w} ${h}" width="${w * size}" height="${h * size}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}

// ---------- 圖示：課堂工具箱一律用 Font Awesome 的通用圖示（不使用任何遊戲角色） ----------
// 名稱沿用數位學苑（抽籤、拉霸等模組照舊呼叫 ICONS.star 之類），內容換成中性的圖示
const fa = (name, color) => `<i class="ic fa-solid ${name}" style="--ic:${color}" aria-hidden="true"></i>`;
export const ICONS = {
  mushroom: fa('fa-thumbs-up', '#22a06b'),   // 加分
  poison: fa('fa-thumbs-down', '#e5484d'),   // 扣分
  mark: fa('fa-circle-question', '#3fb1f8'),
  oneup: fa('fa-heart', '#f06595'),
  coin: fa('fa-coins', '#e0a800'),
  star: fa('fa-star', '#f5b800'),
  flower: fa('fa-seedling', '#2fb67c'),
  shell: fa('fa-gem', '#4c8df6'),
  qbox: fa('fa-gift', '#9b5de5'),
  runnerA: fa('fa-person-running', '#3fb1f8'),
  runnerB: fa('fa-person-walking', '#3fb1f8'),
  // 學校主題：卡包、娃娃機獎品、拉霸圖案
  book: fa('fa-book', '#1b8fd6'),
  pencil: fa('fa-pencil', '#e0a800'),
  cap: fa('fa-graduation-cap', '#12303f'),
  globe: fa('fa-earth-asia', '#27aecb'),
  flask: fa('fa-flask', '#5cc98a'),
  palette: fa('fa-palette', '#f06595'),
  music: fa('fa-music', '#9b5de5'),
  ball: fa('fa-basketball', '#f08c3a'),
  apple: fa('fa-apple-whole', '#e5484d'),
  ruler: fa('fa-ruler', '#c9a400'),
  calc: fa('fa-calculator', '#4c6ef5'),
  bag: fa('fa-school', '#22a06b'),
};

// ---------- 虛擬角色：在畫面角落說話（歡迎、祝福、心情小語） ----------
// 角色圖片放在 /img/runner.svg；若檔案不存在會改用小跑者圖示
export const MASCOT_SRC = '/img/runner.svg'; // 課堂工具箱的原創吉祥物
const MOOD_COUNT = 12;
let mascotEl = null;
let mascotTimer = null;
let mascotQueue = [];
let mascotIdx = 0;

// prefix：學生頁用 mood（心情小語），老師頁用 tmood（上班小語）
// ---------- 小幫手可以按住拖到別的位置；對話框跟著角色，角色在左半邊時改到右邊 ----------
const MASCOT_POS_KEY = 'mascot-pos';
let mascotDragged = false;
function placeMascot(x, y, save = false) {
  const el = mascotEl;
  const w = el.offsetWidth, h = el.offsetHeight;
  x = Math.max(4, Math.min(innerWidth - w - 4, x));
  y = Math.max(4, Math.min(innerHeight - h - 4, y));
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, right: 'auto', bottom: 'auto' });
  el.classList.toggle('flip', x + w / 2 < innerWidth / 2);
  el.classList.toggle('below', y < 170);
  if (save) { try { localStorage.setItem(MASCOT_POS_KEY, JSON.stringify({ x: x / innerWidth, y: y / innerHeight })); } catch { /* 無痕模式 */ } }
}
function dragMascot(handle) {
  let start = null;
  // 擋掉瀏覽器內建的圖片拖放、選取文字
  handle.addEventListener('dragstart', (e) => e.preventDefault());
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.pointerType === 'mouse') e.preventDefault();
    const r = mascotEl.getBoundingClientRect();
    start = { px: e.clientX, py: e.clientY, x: r.left, y: r.top, moved: false, id: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.px, dy = e.clientY - start.py;
    if (!start.moved && Math.hypot(dx, dy) < 6) return;
    if (!start.moved) { start.moved = true; mascotEl.classList.add('dragging'); try { handle.setPointerCapture(e.pointerId); } catch { /* 忽略 */ } }
    e.preventDefault();
    placeMascot(start.x + dx, start.y + dy);
  }, { passive: false });
  const end = () => {
    if (!start) return;
    if (start.moved) {
      mascotDragged = true;
      setTimeout(() => { mascotDragged = false; }, 0);
      const r = mascotEl.getBoundingClientRect();
      placeMascot(r.left, r.top, true);
      mascotEl.classList.remove('dragging');
    }
    start = null;
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  // 上次放的位置（依視窗比例），視窗大小改變時保持在畫面內
  try {
    const p = JSON.parse(localStorage.getItem(MASCOT_POS_KEY) || 'null');
    if (p) requestAnimationFrame(() => placeMascot(p.x * innerWidth, p.y * innerHeight));
  } catch { /* 無痕模式 */ }
  window.addEventListener('resize', () => { if (mascotEl.style.left) { const r = mascotEl.getBoundingClientRect(); placeMascot(r.left, r.top); } });
}

export function mountMascot(lines = [], { prefix = 'mood', count = MOOD_COUNT } = {}) {
  const moods = Array.from({ length: count }, (_, i) => `${prefix}.${i + 1}`).sort(() => Math.random() - 0.5);
  mascotQueue = [...lines, ...moods.map((k) => t(k))];
  mascotIdx = 0;
  if (!mascotEl) {
    mascotEl = document.createElement('div');
    mascotEl.id = 'mascot';
    mascotEl.innerHTML = `<div class="bubble" role="status" aria-live="polite"><span class="bubble-text"></span><button class="bubble-x" type="button" aria-label="close">×</button></div>
      <div class="mascot-body"><button class="mascot-btn" type="button" aria-label="${esc(t('mascot.click'))}" title="${esc(t('mascot.click'))}"></button>
      <button class="mascot-x" type="button" aria-label="${esc(t('mascot.hide'))}" title="${esc(t('mascot.hide'))}">×</button></div>`;
    document.body.appendChild(mascotEl);
    const btn = $('.mascot-btn', mascotEl);
    const img = new Image();
    img.alt = '';
    img.draggable = false; // 不然瀏覽器會把圖片當成拖放檔案，角色就拖不動
    img.onload = () => { btn.innerHTML = ''; btn.appendChild(img); };
    img.onerror = () => { btn.innerHTML = `<span class="mascot-fallback">${ICONS.runnerA}</span>`; };
    img.src = MASCOT_SRC;
    btn.addEventListener('click', (e) => {
      if (mascotDragged) { mascotDragged = false; e.preventDefault(); return; } // 剛拖完不算點擊
      sfx.coin(); mascotNext();
    });
    dragMascot(btn);
    $('.bubble-x', mascotEl).addEventListener('click', () => mascotEl.classList.add('quiet'));
    // 覺得礙眼可以關掉整個角色；只在這次瀏覽隱藏，下次開啟頁面會再出現
    $('.mascot-x', mascotEl).addEventListener('click', () => {
      clearTimeout(mascotTimer);
      mascotEl.classList.add('gone');
      setTimeout(() => { mascotEl.hidden = true; }, 250);
    });
  }
  mascotNext();
}

function mascotNext() {
  if (!mascotQueue.length) return;
  mascotSay(mascotQueue[mascotIdx % mascotQueue.length]);
  mascotIdx++;
}

export function mascotSay(text, { hold = 9000 } = {}) {
  if (!mascotEl || mascotEl.hidden || mascotEl.classList.contains('gone')) return;
  mascotEl.classList.remove('quiet');
  const b = $('.bubble', mascotEl);
  $('.bubble-text', mascotEl).textContent = text;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
  $('.mascot-btn', mascotEl).classList.remove('wiggle');
  void mascotEl.offsetWidth;
  $('.mascot-btn', mascotEl).classList.add('wiggle');
  clearTimeout(mascotTimer);
  mascotTimer = setTimeout(mascotNext, hold);
}
