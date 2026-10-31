// 課堂工具箱：不用登入的抽籤、座位、小遊戲、隨機分組
// 班級與名冊只存在這台電腦的瀏覽器（localdb.js），抽籤等模組與數位學苑共用
import { $, $$, esc, toast, askConfirm, mountChrome } from './common.js';
import { sfx, sound } from './sound.js';
import { initI18n, t } from './i18n.js';
import { S, emit, onChange, loadCourse, sign } from './tstate.js';
import { listClasses, currentClass, setCurrent, createClass, findClassByName, renameClass, deleteClass, setRoster, setSeating, resetScores, normalizeRoster, exportAll, importAll, storageOk } from './localdb.js';

await initI18n();
mountChrome({ sound });
document.title = t('ct.title');
$('#vol').value = sound.volume;
$('#vol').addEventListener('input', (e) => { sound.volume = e.target.value; });
$('#vol').addEventListener('change', () => sfx.coin());

const remember = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* 無痕模式 */ } return null; };
const fileName = (s) => String(s).replace(/[\\/:*?"<>|]/g, '_');

// ================= 分頁 =================
// 選中的分頁底下有一塊漸層色塊，切換時滑過去（手機是格狀，也會上下滑）
const tabsNav = $('.tabs');
const ink = document.createElement('span');
ink.className = 'tab-ink no-anim';
ink.setAttribute('aria-hidden', 'true');
tabsNav.prepend(ink);
function moveInk(animate = true) {
  const cur = $('.tab[aria-selected="true"]', tabsNav);
  if (!cur || !cur.offsetWidth) return;
  ink.classList.toggle('no-anim', !animate);
  Object.assign(ink.style, { width: `${cur.offsetWidth}px`, height: `${cur.offsetHeight}px`, transform: `translate(${cur.offsetLeft}px, ${cur.offsetTop}px)` });
  tabsNav.classList.add('ink-on');
}
// 換語言、視窗大小改變時分頁寬度會變，色塊直接跟上（不播動畫）
new ResizeObserver(() => moveInk(false)).observe(tabsNav);
$$('.tab', tabsNav).forEach((tb) => new ResizeObserver(() => moveInk(false)).observe(tb));
function showTab(tab) {
  const was = $('.tab[aria-selected="true"]')?.dataset.tab;
  $$('.tab').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.tab === tab)));
  $$('.panel').forEach((p) => {
    p.hidden = p.dataset.panel !== tab;
    // 換到別的分頁時內容淡入
    if (!p.hidden && was && was !== tab) { p.classList.remove('panel-in'); void p.offsetWidth; p.classList.add('panel-in'); }
  });
  moveInk(Boolean(was));
  remember('ct-tab', tab);
}
$$('.tab').forEach((tb) => tb.addEventListener('click', () => {
  // 還沒有名單時，抽籤、座位、分組都沒人可抽，先提醒去匯入
  if (tb.dataset.tab !== 'roster' && tb.dataset.tab !== 'fun' && !S.roster.length) toast(t('ct.needRoster'), 'error');
  showTab(tb.dataset.tab);
}));
// 滑鼠滾輪／觸控板在分頁列上滑動：往下是下一頁、往上是上一頁（累積到一定距離才換，換完停一下，觸控板才不會一次跳好幾頁）
let wheelSum = 0, wheelLock = 0, wheelIdle = 0;
tabsNav.addEventListener('wheel', (e) => {
  e.preventDefault();
  clearTimeout(wheelIdle);
  wheelIdle = setTimeout(() => { wheelSum = 0; }, 200);
  if (performance.now() < wheelLock) return;
  wheelSum += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  if (Math.abs(wheelSum) < 40) return;
  const tabs = $$('.tab', tabsNav), i = tabs.findIndex((x) => x.getAttribute('aria-selected') === 'true');
  const next = tabs[Math.max(0, Math.min(tabs.length - 1, i + Math.sign(wheelSum)))];
  wheelSum = 0;
  wheelLock = performance.now() + 280;
  if (next && next !== tabs[i]) next.click();
}, { passive: false });

// ================= 班級 =================
if (!listClasses().length) createClass(t('ct.defaultClass'));
const sel = $('#course-sel');
function fillClasses() {
  const cur = currentClass();
  sel.innerHTML = listClasses().map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  sel.value = cur.id;
  $('#ct-classes').innerHTML = listClasses().map((c) => `<li class="${c.id === cur.id ? 'on' : ''}" data-id="${esc(c.id)}">
      <button class="ct-cname" type="button" data-act="use"><b>${esc(c.name)}</b> <span class="muted small">${esc(t('ct.people', { n: c.roster.length }))}</span></button>
      <button class="btn btn-small icon-btn" type="button" data-act="rename" title="${esc(t('ct.rename'))}" aria-label="${esc(t('ct.rename'))}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
      <button class="btn btn-small icon-btn" type="button" data-act="del" title="${esc(t('ct.delClass'))}" aria-label="${esc(t('ct.delClass'))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></li>`).join('');
}
async function useClass(id) {
  setCurrent(id);
  fillClasses();
  await loadCourse(id);
}
// 重新載入目前班級（名冊改了之後，讓抽籤、座位等模組都拿到新名單）
const reload = () => loadCourse(currentClass().id);
sel.addEventListener('change', () => useClass(sel.value));
$('#ct-classes').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.closest('li').dataset.id;
  const c = listClasses().find((x) => x.id === id);
  if (b.dataset.act === 'use') { await useClass(id); sfx.coin(); }
  if (b.dataset.act === 'rename') {
    // 直接在清單裡改名（有些瀏覽器不支援 prompt）：Enter 或離開欄位就儲存，Esc 取消
    const li = b.closest('li');
    li.innerHTML = `<input type="text" class="ct-rename" maxlength="60" value="${esc(c.name)}" aria-label="${esc(t('ct.rename'))}">`;
    const inp = li.querySelector('input');
    inp.focus(); inp.select();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      const name = inp.value.trim();
      if (ok && name && name !== c.name) { renameClass(id, name); if (id === S.course.code) S.course.name = name; sfx.coin(); }
      fillClasses();
    };
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); finish(true); } if (ev.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    return;
  }
  if (b.dataset.act === 'del') {
    if (!await askConfirm(t('ct.delConfirm', { name: c.name }))) return;
    deleteClass(id);
    if (!listClasses().length) createClass(t('ct.defaultClass'));
    await useClass(currentClass().id);
    toast(t('ct.deleted'), 'ok');
  }
});
$('#ct-new-class').addEventListener('submit', async (e) => {
  e.preventDefault();
  const c = createClass(e.target.name.value);
  e.target.reset();
  await useClass(c.id);
  sfx.powerUp();
  toast(t('ct.created', { name: c.name }), 'ok');
});

// ================= 名冊 =================
function renderRoster() {
  const c = currentClass();
  $('#ct-count').textContent = c.roster.length ? t('ct.count', { n: c.roster.length, name: c.name }) : t('ct.empty');
  $('#ct-tbody').innerHTML = c.roster.map((s, i) => {
    const adj = S.adj[s.id] || 0;
    return `<tr data-i="${i}">
      <td data-label="${esc(t('g.seat'))}"><input type="text" data-f="seat" value="${esc(s.seat)}" maxlength="6" aria-label="seat"></td>
      <td data-label="${esc(t('g.id'))}"><input type="text" data-f="id" value="${esc(s.id)}" maxlength="30" aria-label="id"></td>
      <td data-label="${esc(t('g.name'))}"><input type="text" data-f="name" value="${esc(s.name)}" maxlength="40" aria-label="name"></td>
      <td data-label="${esc(t('ct.score'))}" class="${adj > 0 ? 'plus' : adj < 0 ? 'minus' : 'muted'}">${adj ? sign(adj) : '0'}</td>
      <td><button class="btn btn-small icon-btn" type="button" data-del title="${esc(t('ct.delRow'))}" aria-label="${esc(t('ct.delRow'))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></td></tr>`;
  }).join('');
}
async function saveRoster(list, msg) {
  setRoster(currentClass().id, list);
  fillClasses();
  await reload();
  if (msg) toast(msg, 'ok');
  if (!storageOk) toast(t('ct.noStorage'), 'error');
}
// 直接在表格裡改座號、學號、姓名
$('#ct-tbody').addEventListener('change', (e) => {
  const inp = e.target.closest('input[data-f]');
  if (!inp) return;
  const list = currentClass().roster.map((s) => ({ ...s }));
  const row = list[Number(inp.closest('tr').dataset.i)];
  row[inp.dataset.f] = inp.value;
  if (inp.dataset.f === 'name' && !inp.value.trim()) { inp.value = currentClass().roster[Number(inp.closest('tr').dataset.i)].name; return; }
  saveRoster(list);
});
$('#ct-tbody').addEventListener('click', async (e) => {
  if (!e.target.closest('[data-del]')) return;
  const i = Number(e.target.closest('tr').dataset.i);
  const s = currentClass().roster[i];
  if (!await askConfirm(t('ct.delRowConfirm', { name: s.name }))) return;
  saveRoster(currentClass().roster.filter((_, k) => k !== i));
});
$('#ct-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  saveRoster([...currentClass().roster, { seat: f.seat.value, id: f.id.value, name: f.name.value }]);
  f.reset();
  f.seat.focus();
  sfx.coin();
});
$('#ct-reset-score').addEventListener('click', async () => {
  if (!await askConfirm(t('ct.resetScoreConfirm'))) return;
  resetScores(currentClass().id);
  await reload();
  toast(t('ct.resetScoreDone'), 'ok');
});
$('#ct-clear').addEventListener('click', async () => {
  if (!currentClass().roster.length || !await askConfirm(t('ct.clearConfirm'))) return;
  saveRoster([], t('ct.cleared'));
});

// ---------- 匯入：公版 xlsx（座號、學號、姓名），也接受 csv 與直接貼上 ----------
const HEAD = {
  seat: /^(座號|座位|座位號碼|號碼|seat|seat\s*no\.?|no\.?)$/i,
  id: /^(學號|學生學號|student\s*id|id)$/i,
  name: /^(姓名|學生姓名|名字|name|student\s*name)$/i,
};
function parseRows(rows) {
  rows = rows.map((r) => r.map((v) => String(v ?? '').trim())).filter((r) => r.some(Boolean));
  // 前幾列找標題列（有「姓名」那一列）；找不到就照公版欄位順序：座號、學號、姓名
  let cols = null, start = 0;
  for (let i = 0; i < Math.min(5, rows.length) && !cols; i++) {
    const at = (re) => rows[i].findIndex((v) => re.test(v.replace(/\s+/g, ' ')));
    if (at(HEAD.name) >= 0) { cols = { seat: at(HEAD.seat), id: at(HEAD.id), name: at(HEAD.name) }; start = i + 1; }
  }
  const pick = (r, k) => (k >= 0 ? r[k] || '' : '');
  return rows.slice(start).map((r) => {
    if (cols) return { seat: pick(r, cols.seat), id: pick(r, cols.id), name: pick(r, cols.name) };
    if (r.length >= 3) return { seat: r[0], id: r[1], name: r[2] };
    if (r.length === 2) return /^\d{1,3}$/.test(r[0]) ? { seat: r[0], name: r[1] } : { id: r[0], name: r[1] };
    return { name: r[0] };
  });
}
async function applyImport(list, reloadAfter = true) {
  const clean = normalizeRoster(list);
  if (!clean.length) { sfx.bump(); toast(t('ct.importNone'), 'error'); return false; }
  const c = currentClass();
  if (c.roster.length && !await askConfirm(t('ct.replaceConfirm', { name: c.name, old: c.roster.length, n: clean.length }), { danger: false })) return false;
  if (reloadAfter) { await saveRoster(clean, t('ct.imported', { n: clean.length })); sfx.powerUp(); } else { setRoster(c.id, clean); toast(t('ct.imported', { n: clean.length }), 'ok'); }
  return true;
}
// ---------- 座位表：工作表的樣子就是教室，第 1 列是最前排（靠講台），格子填座號、學號或姓名，空格 = 空位 ----------
const SEAT_SHEET = /\s*[-_－]?\s*(座位表|座位|seating\s*chart|seats?)\s*$/i;
function seatGrid(rows, roster) {
  rows = rows.map((r) => r.map((v) => String(v ?? '').trim()));
  while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
  // 第一列若是「講台」「黑板」之類的標示就略過
  if (rows.length && rows[0].filter(Boolean).length === 1 && /講台|讲台|黑板|白板|board|front/i.test(rows[0].find(Boolean))) rows.shift();
  const cols = Math.max(0, ...rows.map((r) => { let n = r.length; while (n && !r[n - 1]) n--; return n; }));
  const byId = new Map(roster.map((x) => [x.id, x])), byName = new Map(roster.map((x) => [x.name, x])), bySeat = new Map(roster.filter((x) => x.seat).map((x) => [x.seat, x]));
  const cells = {}, miss = [], used = new Set();
  rows.forEach((r, ri) => r.slice(0, cols).forEach((v, ci) => {
    if (!v) return;
    const st = byId.get(v) || byName.get(v) || bySeat.get(v.replace(/^#|號$/g, ''));
    if (st && !used.has(st.id)) { cells[`${ri},${ci}`] = st.id; used.add(st.id); } else miss.push(v);
  }));
  return { rows: rows.length, cols, cells, miss };
}
function applySeatSheet(cls, rows) {
  const g = seatGrid(rows, cls.roster);
  if (!g.rows || !g.cols || g.rows > 15 || g.cols > 15) throw new Error(t('ct.seatBadSize'));
  setSeating(cls.id, g.rows, g.cols, g.cells);
  return g;
}
const sheetRows = (wb, n) => window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' });
const readBook = (buf) => { if (!window.XLSX) throw new Error(t('ct.xlsxMissing')); return window.XLSX.read(buf, { type: 'array', codepage: 65001 }); };

// 一個 Excel 檔可以有好幾個工作表：每個工作表就是一個班級，工作表名稱 = 班級名稱
// 名稱是「座位表」或「○○座位表」的工作表是那個班級的座位表；「說明」之類沒有學生的工作表會略過
const SKIP_SHEET = /^(說明|说明|readme|instructions?|notes?)$/i;
const GENERIC_SHEET = /^(sheet\s*\d*|工作表\s*\d*|名冊|名册|roster|class\s*data)$/i;
async function importWorkbook(buf) {
  const wb = readBook(buf);
  const names = wb.SheetNames.filter((n) => !SKIP_SHEET.test(n.trim()));
  const seatNames = names.filter((n) => SEAT_SHEET.test(n));
  const sheets = names.filter((n) => !SEAT_SHEET.test(n))
    .map((n) => ({ name: n.trim(), list: normalizeRoster(parseRows(sheetRows(wb, n))) }))
    .filter((x) => x.list.length);
  if (!sheets.length) { sfx.bump(); toast(t('ct.importNone'), 'error'); return; }
  let targets;
  if (sheets.length === 1) {
    // 只有一個班級：匯入目前的班級；目前是空的預設班級時，順便改成工作表的名稱
    const cur = currentClass();
    if (!await applyImport(sheets[0].list, false)) return;
    if (!cur.roster.length || cur.name === t('ct.defaultClass')) {
      if (!GENERIC_SHEET.test(sheets[0].name) && cur.name === t('ct.defaultClass')) renameClass(cur.id, sheets[0].name);
    }
    targets = [{ name: sheets[0].name, cls: currentClass() }];
  } else {
    const summary = sheets.map((x) => t('ct.sheetLine', { name: x.name, n: x.list.length })).join('、');
    if (!await askConfirm(t('ct.multiConfirm', { n: sheets.length, list: summary }), { danger: false })) return;
    targets = sheets.map((x) => {
      const c = findClassByName(x.name) || createClass(x.name);
      setRoster(c.id, x.list);
      return { name: x.name, cls: c };
    });
    // 沒有學生的預設班級就不留了
    listClasses().filter((c) => !c.roster.length && c.name === t('ct.defaultClass')).forEach((c) => deleteClass(c.id));
    setCurrent(targets[0].cls.id);
    toast(t('ct.multiDone', { n: sheets.length }), 'ok');
  }
  // 座位表工作表：「一年一班座位表」對應一年一班；只寫「座位表」就對應第一個班級
  let seats = 0;
  for (const n of seatNames) {
    const base = n.replace(SEAT_SHEET, '').trim();
    const tg = (base && targets.find((x) => x.name === base)) || (!base && targets[0]);
    if (!tg) continue;
    try { applySeatSheet(currentClassById(tg.cls.id), sheetRows(wb, n)); seats++; } catch (err) { toast(`${n}：${err.message}`, 'error'); }
  }
  await useClass(currentClass().id);
  if (seats) toast(t('ct.seatImported', { n: seats }), 'ok');
  sfx.powerUp();
  if (!storageOk) toast(t('ct.noStorage'), 'error');
}
const currentClassById = (id) => listClasses().find((c) => c.id === id);

// 座位表頁的「匯入座位表」：單獨一份座位表（xlsx 或 csv，讀第一個工作表）
$('#chart-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const wb = readBook(await file.arrayBuffer());
    const n = wb.SheetNames.find((x) => SEAT_SHEET.test(x)) || wb.SheetNames[0];
    const cls = currentClass();
    if (cls.seating && !await askConfirm(t('ct.seatReplace', { name: cls.name }), { danger: false })) return;
    const g = applySeatSheet(cls, sheetRows(wb, n));
    await reload();
    sfx.powerUp();
    toast(t('ct.seatDone', { n: Object.keys(g.cells).length, rows: g.rows, cols: g.cols }), 'ok');
    if (g.miss.length) toast(t('ct.seatMiss', { list: g.miss.slice(0, 8).join('、') + (g.miss.length > 8 ? '…' : '') }), 'error');
  } catch (err) { sfx.bump(); toast(`${t('ct.importFail')}：${err.message}`, 'error'); }
});

// ---------- 沒有名冊：直接輸入班級人數，建立 1 號～N 號 ----------
$('#ct-quick').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = Math.round(Number(e.target.n.value));
  if (!(n >= 1 && n <= 200)) { sfx.bump(); return; }
  const list = Array.from({ length: n }, (_, i) => ({ seat: String(i + 1), id: String(i + 1), name: t('ct.seatName', { n: i + 1 }) }));
  if (await applyImport(list)) e.target.reset();
});

$('#ct-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try { await importWorkbook(await file.arrayBuffer()); } catch (err) { sfx.bump(); toast(`${t('ct.importFail')}：${err.message}`, 'error'); }
});

// ---------- 線上分享連結：Google 試算表、OneDrive / SharePoint 的 Excel ----------
// 瀏覽器不能直接跨站讀取，交給本站的 /api/sheet 代抓（只代抓這幾個網站，不留存）
const LINK_RE = /^https:\/\/([\w-]+\.)*(docs\.google\.com|1drv\.ms|onedrive\.live\.com|sharepoint\.com)\//i;
$('#ct-link-url').value = remember('ct-link') || '';
$('#ct-link').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('#ct-link-url').value.trim();
  if (!LINK_RE.test(url)) { sfx.bump(); toast(t('ct.linkBad'), 'error'); return; }
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    const res = await fetch(`/api/sheet?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).error || ''; } catch { /* 不是 JSON */ }
      throw new Error(/not shared|HTTP 40[13]/.test(msg) ? t('ct.linkPrivate') : msg || `HTTP ${res.status}`);
    }
    await importWorkbook(await res.arrayBuffer());
    remember('ct-link', url);
  } catch (err) { sfx.bump(); toast(`${t('ct.importFail')}：${err.message}`, 'error'); }
  btn.disabled = false;
});
// ---------- 貼上名單（彈窗）：一行一位，第一行就是 1 號 ----------
// 從 Excel 複製是 Tab 分隔；也接受逗號，或「座號 學號 姓名」用空白隔開；只有名字時照行數編座號
function pasteRows(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    if (l.includes('\t')) return l.split('\t');
    if (/[,，]/.test(l)) return l.split(/[,，]/);
    const m = l.match(/^(\d{1,3})[\s.、．]+(.+)$/);
    if (!m) return [l];
    const m2 = m[2].match(/^([A-Za-z]*\d[\w-]*)\s+(.+)$/);
    return m2 ? [m[1], m2[1], m2[2]] : [m[1], m[2]];
  });
}
function pasteList(text) {
  const rows = pasteRows(text);
  // 全部只有名字：第 1 行 = 1 號
  if (rows.length && rows.every((r) => r.length === 1)) return rows.map((r, i) => ({ seat: String(i + 1), name: r[0] }));
  return parseRows(rows);
}
const pasteBox = $('#ct-paste');
const closePaste = () => pasteBox.classList.remove('open');
$('#ct-paste-btn').addEventListener('click', () => { pasteBox.classList.add('open'); $('#ct-paste-count').textContent = ''; $('#ct-paste-text').focus(); });
$('#ct-paste-cancel').addEventListener('click', closePaste);
pasteBox.addEventListener('click', (e) => { if (e.target === pasteBox) closePaste(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pasteBox.classList.contains('open')) closePaste(); });
$('#ct-paste-text').addEventListener('input', () => {
  const n = normalizeRoster(pasteList($('#ct-paste-text').value)).length;
  $('#ct-paste-count').textContent = n ? t('ct.pasteCount', { n }) : '';
});
$('#ct-paste-ok').addEventListener('click', async () => {
  closePaste();
  if (await applyImport(pasteList($('#ct-paste-text').value))) $('#ct-paste-text').value = '';
  else pasteBox.classList.add('open');
});

// ---------- 匯出名冊（含加減分） ----------
$('#ct-export').addEventListener('click', () => {
  const c = currentClass();
  if (!window.XLSX) { toast(t('ct.xlsxMissing'), 'error'); return; }
  const rows = [[t('g.seat'), t('g.id'), t('g.name'), t('ct.score')], ...c.roster.map((s) => [s.seat, s.id, s.name, S.adj[s.id] || 0])];
  const ws = window.XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 10 }];
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'roster');
  window.XLSX.writeFile(wb, `${fileName(c.name)}_${t('ct.roster')}.xlsx`);
  sfx.coin();
});

// ---------- 備份 / 還原（換電腦時用） ----------
$('#ct-backup').addEventListener('click', () => {
  const blob = new Blob([exportAll()], { type: 'application/json' });
  const d = new Date();
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `classtool_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  sfx.coin();
});
$('#ct-restore').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !await askConfirm(t('ct.restoreConfirm'))) return;
  try {
    importAll(await file.text());
    await useClass(currentClass().id);
    sfx.powerUp();
    toast(t('ct.restored'), 'ok');
  } catch { sfx.bump(); toast(t('ct.restoreFail'), 'error'); }
});

// ================= 啟動 =================
// 抽籤、座位、遊戲模組要等 DOM 就緒再載入；名冊頁跟著 course / adj 更新
onChange((what) => { if (['course', 'adj', 'roster'].includes(what)) renderRoster(); });
await import('./lottery.js');
await import('./seats.js');
await import('./seatchart.js');
// 聚光燈預設開啟（不讓瀏覽器記住上次取消勾選）
$('#fun-spot').checked = true;
await import('./fun.js');
await import('./board.js');
await import('./timer.js');
await import('./circuitboard.js');
fillClasses();
await loadCourse(currentClass().id);
const lastTab = remember('ct-tab');
showTab(S.roster.length && lastTab && $(`.tab[data-tab="${lastTab}"]`) ? lastTab : 'roster');
if (!storageOk) toast(t('ct.noStorage'), 'error');

// 第一次進網站：先說明不用登入、資料只存在這台電腦（按「知道了」之後就不再跳出）
if (remember('ct-welcome') !== '1') {
  const box = $('#ct-welcome');
  box.classList.add('open');
  $('#ct-welcome-ok').focus();
  $('#ct-welcome-ok').addEventListener('click', () => { remember('ct-welcome', '1'); box.classList.remove('open'); sfx.coin(); });
}
