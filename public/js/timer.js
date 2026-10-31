// 計時器：倒數計時、碼表、時鐘（都可以全螢幕投影）；在別的分頁時右上角會顯示小計時器
import { $, $$ } from './common.js';
import { sfx } from './sound.js';
import { t, lang } from './i18n.js';

const panel = $('[data-panel="timer"]');
const big = $('#tm-big'), sub = $('#tm-sub'), bar = $('#tm-bar'), card = $('#tm-card'), pill = $('#tm-pill');
let mode = 'down';
const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* 無痕模式 */ } } };

// ---------- 時區：預設自動偵測，也可以從下拉選單選其他國家／地區 ----------
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const ZONES = ['Asia/Taipei', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok',
  'Asia/Ho_Chi_Minh', 'Asia/Jakarta', 'Asia/Manila', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Africa/Cairo', 'Africa/Johannesburg', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage',
  'Pacific/Honolulu', 'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo', 'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland', 'UTC'];
let zone = store.get('ct-tm-zone') || 'auto';
const tz = () => (zone === 'auto' ? LOCAL_TZ : zone);
// 例如「台北時間 (UTC+8)」：用瀏覽器的語言顯示地名
const zoneName = (z) => { try { return new Intl.DateTimeFormat(lang, { timeZone: z, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName').value; } catch { return z; } };
const offsetOf = (z) => { try { return new Intl.DateTimeFormat('en', { timeZone: z, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName').value.replace('GMT', 'UTC'); } catch { return ''; } };
const city = (z) => z.split('/').pop().replace(/_/g, ' ');
function fillZones() {
  const sel = $('#tm-zone');
  const list = [...new Set([LOCAL_TZ, ...ZONES])];
  sel.innerHTML = `<option value="auto">${t('tm.zoneAuto', { z: `${city(LOCAL_TZ)} ${offsetOf(LOCAL_TZ)}` })}</option>`
    + list.map((z) => `<option value="${z}">${city(z)}｜${zoneName(z)} ${offsetOf(z)}</option>`).join('');
  sel.value = list.includes(zone) || zone === 'auto' ? zone : 'auto';
  sel.addEventListener('change', () => { zone = sel.value; store.set('ct-tm-zone', zone); draw(); });
}
// 某個時區現在的時、分、秒（給指針式時鐘用）
function zoneTime(d) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
  return { h: Number(parts.hour), m: Number(parts.minute), s: Number(parts.second) + d.getMilliseconds() / 1000 };
}

// 顯示方式：電子式（數字）或指針式（錶面）
let face = store.get('ct-tm-face') === 'analog' ? 'analog' : 'digital';
const faceEl = $('#tm-face');
const polar = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]; };
// 錶盤刻度與數字；labels：12 個位置的文字
function dial(labels) {
  let out = '<circle cx="100" cy="100" r="96" class="tm-dial"/>';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0, [x1, y1] = polar(major ? 80 : 86, i * 6), [x2, y2] = polar(91, i * 6);
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${major ? 'tm-tick big' : 'tm-tick'}"/>`;
  }
  labels.forEach((l, i) => { const [x, y] = polar(68, i * 30); out += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="tm-num">${l}</text>`; });
  return out;
}
const hand = (deg, len, cls, tail = 12) => { const [x1, y1] = polar(-tail, deg), [x2, y2] = polar(len, deg); return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" class="${cls}"/>`; };
// 從 12 點鐘方向順時針的扇形（倒數剩下的時間）
function sector(deg) {
  if (deg <= 0) return '';
  if (deg >= 359.99) return '<circle cx="100" cy="100" r="78" class="tm-sector"/>';
  const [x, y] = polar(78, deg);
  return `<path d="M100 100L100 22A78 78 0 ${deg > 180 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z" class="tm-sector"/>`;
}
const DIAL_CLOCK = dial(['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
// 24 小時制：內圈再加 13～24
const DIAL_CLOCK24 = DIAL_CLOCK + ['24', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'].map((l, i) => { const [x, y] = polar(50, i * 30); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="tm-num tm-num24">${l}</text>`; }).join('');
// 時鐘顯示 24 小時制或 12 小時制（上午／下午）
let h12 = store.get('ct-tm-h12') === '1';
function setHours(v) {
  h12 = v;
  store.set('ct-tm-h12', h12 ? '1' : '0');
  $$('[data-tm-h]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.tmH === '12') === h12)));
}
const DIAL_MIN = dial(['0', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
function drawFace(ms) {
  let body;
  if (mode === 'clock') {
    const z = zoneTime(new Date()), min = z.m + z.s / 60, hr = (z.h % 12) + min / 60;
    body = (h12 ? DIAL_CLOCK : DIAL_CLOCK24) + hand(hr * 30, 46, 'tm-hand hr') + hand(min * 6, 66, 'tm-hand min') + hand(z.s * 6, 76, 'tm-hand sec', 18);
  } else if (mode === 'sw') {
    // 大指針：秒；小錶盤：分鐘（一圈 30 分）
    const sec = (ms / 1000) % 60, min = (ms / 60000) % 30;
    let small = '<circle cx="100" cy="132" r="20" class="tm-sub-dial"/>';
    for (let i = 0; i < 6; i++) { const a = ((i * 60 - 90) * Math.PI) / 180; small += `<line x1="${(100 + 15 * Math.cos(a)).toFixed(1)}" y1="${(132 + 15 * Math.sin(a)).toFixed(1)}" x2="${(100 + 19 * Math.cos(a)).toFixed(1)}" y2="${(132 + 19 * Math.sin(a)).toFixed(1)}" class="tm-tick"/>`; }
    const a = ((min * 12 - 90) * Math.PI) / 180;
    small += `<line x1="100" y1="132" x2="${(100 + 16 * Math.cos(a)).toFixed(2)}" y2="${(132 + 16 * Math.sin(a)).toFixed(2)}" class="tm-hand min"/>`;
    body = DIAL_MIN + small + hand(sec * 6, 78, 'tm-hand sec', 18);
  } else {
    // 倒數：紅色扇形是剩下的分鐘（一圈 60 分鐘；設定超過 60 分鐘時一圈就是總時間），秒針照走
    const span = Math.max(60 * 60000, down.total);
    body = sector((ms / span) * 360) + DIAL_MIN + hand(((ms / 1000) % 60) * 6, 78, 'tm-hand sec', 18);
  }
  faceEl.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true">${body}<circle cx="100" cy="100" r="5" class="tm-pin"/></svg>`;
}
function setFace(f) {
  face = f;
  store.set('ct-tm-face', f);
  $$('[data-tm-face]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tmFace === f)));
  card.classList.toggle('analog', f === 'analog');
}
$$('[data-tm-face]').forEach((b) => b.addEventListener('click', () => { setFace(b.dataset.tmFace); sfx.tick(); }));
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return s >= 3600 ? `${Math.floor(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}` : `${pad(s / 60)}:${pad(s % 60)}`; };

// ---------- 倒數計時 ----------
const down = { total: 5 * 60000, left: 5 * 60000, end: 0, running: false, done: false };
function setDown(ms) {
  down.total = down.left = Math.max(1000, Math.min(ms, 24 * 3600000));
  down.running = false; down.done = false;
  card.classList.remove('ring');
  draw();
}
function downNow() { return down.running ? Math.max(0, down.end - Date.now()) : down.left; }
function downTick() {
  const left = downNow();
  if (down.running) {
    // 最後 10 秒每秒「叩」一聲
    const sec = Math.ceil(left / 1000);
    if (sec !== down.lastSec) { down.lastSec = sec; if (sec <= 10 && sec > 0) sfx.tick(); }
    if (left <= 0) { down.running = false; down.left = 0; down.done = true; alarm(); }
  }
}
let alarmTimer = 0;
function alarm() {
  card.classList.add('ring');
  let n = 0;
  clearInterval(alarmTimer);
  const ring = () => { sfx.coin(); if (++n >= 6) clearInterval(alarmTimer); };
  ring();
  alarmTimer = setInterval(ring, 700);
}
$$('[data-tm-min]').forEach((b) => b.addEventListener('click', () => { setDown(Number(b.dataset.tmMin) * 60000); sfx.tick(); }));
$('#tm-set').addEventListener('submit', (e) => {
  e.preventDefault();
  const m = Number($('#tm-m').value) || 0, s = Number($('#tm-s').value) || 0;
  if (m * 60 + s <= 0) { sfx.bump(); return; }
  setDown((m * 60 + s) * 1000);
  sfx.tick();
});

// ---------- 碼表 ----------
const sw = { acc: 0, start: 0, running: false, laps: [] };
const swNow = () => sw.acc + (sw.running ? Date.now() - sw.start : 0);
const swFmt = (ms) => `${ms >= 3600000 ? `${Math.floor(ms / 3600000)}:` : ''}${pad((ms % 3600000) / 60000)}:${pad((ms % 60000) / 1000)}.${pad((ms % 1000) / 10)}`;
function renderLaps() {
  $('#tm-laps').innerHTML = sw.laps.map((v, i) => `<li><span>${t('tm.lap', { n: i + 1 })}</span><b>${swFmt(v - (sw.laps[i - 1] || 0))}</b><small>${swFmt(v)}</small></li>`).reverse().join('');
}

// ---------- 開始／暫停／重設 ----------
const running = () => (mode === 'down' && down.running) || (mode === 'sw' && sw.running);
$('#tm-go').addEventListener('click', () => {
  if (mode === 'down') {
    if (down.running) { down.left = downNow(); down.running = false; } else {
      if (down.done || down.left <= 0) setDown(down.total);
      down.end = Date.now() + down.left; down.running = true; down.lastSec = null;
      clearInterval(alarmTimer); card.classList.remove('ring');
    }
  } else if (mode === 'sw') {
    if (sw.running) { sw.acc = swNow(); sw.running = false; } else { sw.start = Date.now(); sw.running = true; }
  }
  sfx.jump();
  draw();
});
$('#tm-reset').addEventListener('click', () => {
  if (mode === 'down') { clearInterval(alarmTimer); setDown(down.total); }
  if (mode === 'sw') { sw.acc = 0; sw.running = false; sw.laps = []; renderLaps(); }
  sfx.tick();
  draw();
});
$('#tm-lap').addEventListener('click', () => { if (sw.running) { sw.laps.push(swNow()); renderLaps(); sfx.tick(); } });

// ---------- 畫面 ----------
function draw() {
  downTick();
  card.dataset.mode = mode;
  let text = '', note = '';
  if (mode === 'down') {
    const left = downNow();
    text = mmss(left);
    note = down.done ? t('tm.timeUp') : t('tm.of', { t: mmss(down.total) });
    bar.style.width = `${(left / down.total) * 100}%`;
    card.classList.toggle('warn', left > 0 && left <= 10000 && down.running);
  } else if (mode === 'sw') {
    text = swFmt(swNow());
    note = sw.laps.length ? t('tm.laps', { n: sw.laps.length }) : '';
  } else {
    const d = new Date();
    text = d.toLocaleTimeString(lang, { timeZone: tz(), hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: h12 });
    note = `${d.toLocaleDateString(lang, { timeZone: tz(), year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}　${zoneName(tz())} ${offsetOf(tz())}`;
  }
  big.textContent = text;
  if (face === 'analog') drawFace(mode === 'down' ? downNow() : mode === 'sw' ? swNow() : 0);
  sub.textContent = note;
  $('#tm-go').innerHTML = `<i class="fa-solid ${running() ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i> <span>${t(running() ? 'tm.pause' : 'tm.start')}</span>`;
  // 不在計時器分頁時，右上角顯示小計時器
  const bg = (down.running || down.done) ? `${mmss(downNow())}` : sw.running ? swFmt(swNow()).slice(0, -3) : '';
  pill.hidden = !bg || !panel.hidden;
  pill.querySelector('span').textContent = bg;
  pill.classList.toggle('ring', down.done);
}
let raf = 0;
const loop = () => { draw(); raf = requestAnimationFrame(loop); };
// 背景分頁 requestAnimationFrame 會停，改用計時器補上（時間是用 Date 算的，不會不準）
setInterval(() => { if (document.hidden) downTick(); }, 500);
raf = requestAnimationFrame(loop);

$$('[data-tm-mode]').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset.tmMode;
  $$('[data-tm-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $$('.tm-only').forEach((el) => { el.hidden = !el.classList.contains(`tm-${mode}`); });
  sfx.tick();
  draw();
}));
$$('[data-tm-h]').forEach((b) => b.addEventListener('click', () => { setHours(b.dataset.tmH === '12'); sfx.tick(); draw(); }));
pill.addEventListener('click', () => { $('.tab[data-tab="timer"]').click(); });
$('#tm-full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else card.requestFullscreen?.().catch(() => {});
});
// 全螢幕時按空白鍵開始／暫停
document.addEventListener('keydown', (e) => {
  if (panel.hidden || e.target.closest('input, textarea, select') || mode === 'clock') return;
  if (e.code === 'Space') { e.preventDefault(); $('#tm-go').click(); }
});
$$('.tm-only').forEach((el) => { el.hidden = !el.classList.contains('tm-down'); });
fillZones();
setHours(h12);
setFace(face);
setDown(down.total);
