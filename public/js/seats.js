// 座位抽籤：圖案（大叉叉、小叉叉、大十字、小十字、全班起立、全班坐下）與座標象限
import { $, $$, esc, toast, api, burst } from './common.js';
import { sfx, bgm } from './sound.js';
import { t, ti } from './i18n.js';
import { seatToCell, mergeConfig } from './calc.js';
import { S, rand, isAbsent, onChange, emit, adjust, seatMap as sharedSeatMap } from './tstate.js';
import { popEffect, stepValue, renderPickList } from './lottery.js';

const PATTERNS = ['bigX', 'smallX', 'bigCross', 'smallCross', 'standAll', 'sitAll'];
const COORD_PATTERNS = ['bigX', 'smallX', 'bigCross', 'smallCross'];
const QUADS = { 1: [1, 1], 2: [-1, 1], 3: [-1, -1], 4: [1, -1] };
let mode = 'pattern';
let origin = null;      // { r, c }
let picking = false;
let picked = [];        // 抽中的學生
let busy = false;
let catching = false;   // 圖案抽完後：點選「第一個／最後起立」的同學
let catchRule = 'last'; // 'first' | 'last'（選「隨機」時抽完才決定）

const room = () => S.config.classroom;
const key = (r, c) => `${r},${c}`;

// 座位 → 學生（座位表優先）
const seatMap = () => sharedSeatMap(seatToCell);

// 自動停止預設開啟（避免瀏覽器還原成上次沒勾的狀態）
$('#seat-auto').checked = true;

function render() {
  const { rows, cols } = room();
  const map = seatMap();
  const el = $('#room');
  el.style.gridTemplateColumns = `repeat(${cols}, auto)`;
  el.style.setProperty('--cols', cols);
  let html = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = map.get(key(r, c));
      const cls = ['seat', !s && 'empty', s && isAbsent(s.id) && 'absent', origin && origin.r === r && origin.c === c && 'origin'].filter(Boolean).join(' ');
      html += `<button type="button" class="${cls}" data-r="${r}" data-c="${c}" title="${s ? esc(`${s.seat} ${s.name}${isAbsent(s.id) ? ` (${t('abs.short')})` : ''}`) : esc(t('seat.empty'))}">
        <span class="no">${s ? esc(s.seat) : ''}</span><b>${s ? esc(s.name) : '—'}</b></button>`;
    }
  }
  el.innerHTML = html;
  el.classList.toggle('pick', picking);
  markQuadrant();
}

function cellsEl() { return $$('#room .seat'); }
function cellEl(r, c) { return $(`#room .seat[data-r="${r}"][data-c="${c}"]`); }
function clearMarks() { cellsEl().forEach((e) => e.classList.remove('hit', 'flash')); }

function hint() {
  $('#seat-hint').textContent = mode === 'pattern' ? t('seat.hint.pattern') : t('seat.hint.coord');
}

// ---------- 圖案 ----------
function patternCells(name, r0, c0) {
  const { rows, cols } = room();
  const out = [];
  const inb = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols;
  const add = (r, c) => { if (inb(r, c) && !out.some((x) => x.r === r && x.c === c)) out.push({ r, c }); };
  if (name === 'standAll' || name === 'sitAll') {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) add(r, c);
  } else if (name === 'bigCross') {
    for (let c = 0; c < cols; c++) add(r0, c);
    for (let r = 0; r < rows; r++) add(r, c0);
  } else if (name === 'smallCross') {
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => add(r0 + dr, c0 + dc));
  } else if (name === 'smallX') {
    [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(([dr, dc]) => add(r0 + dr, c0 + dc));
  } else if (name === 'bigX') {
    // 兩條對角線，以 (r0,c0) 為交點延伸到教室邊界
    for (let k = -Math.max(rows, cols); k <= Math.max(rows, cols); k++) { add(r0 + k, c0 + k); add(r0 + k, c0 - k); }
  }
  return out;
}

let spinning = false;
let stopReq = false;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function setSpinButtons(on) {
  ['#pattern-btn', '#coord-btn'].forEach((s) => {
    const b = $(s);
    b.innerHTML = on ? ti('fa-pause', 'lot.pause') : ti('fa-play', 'lot.start');
    b.classList.toggle('btn-yellow', on);
    b.classList.toggle('btn-primary', !on);
  });
}

// frame() 每一格畫一次並回傳目前畫面上的結果；停下時回傳最後一格
async function spin(frame) {
  spinning = true;
  stopReq = false;
  setSpinButtons(true);
  sfx.jump();
  bgm.start();
  const auto = $('#seat-auto').checked;
  const dur = auto ? 1000 + rand(4001) : Infinity;
  const t0 = performance.now();
  let last = null;
  while (!stopReq) {
    const elapsed = performance.now() - t0;
    if (elapsed >= dur) break;
    last = frame();
    // 老師彩蛋：講台偶爾也會跟著閃
    podium().classList.toggle('flash', teacherOn() && Math.random() < 0.12);
    sfx.tick();
    const remain = dur - elapsed;
    await sleep(auto && remain < 1500 ? 80 + (1500 - remain) / 5 : 80); // 自動停止前逐漸變慢
  }
  spinning = false;
  bgm.stop();
  setSpinButtons(false);
  return last;
}

// ---------- 老師彩蛋：講台也是一個「座位」，抽到講台就請老師回答 ----------
const podium = () => $('#seat-draw-sec .board');
const teacherOn = () => $('#seat-egg').checked;
// 機率跟一個學生差不多（候選人數＋老師），至少 1/12
const teacherLucky = (n) => teacherOn() && rand(Math.max(2, Math.min(12, n + 1))) === 0;
function showTeacher() {
  clearMarks();
  podium().classList.remove('flash');
  podium().classList.add('hit');
  picked = [];
  $('#pattern-name').textContent = t('seat.podium');
  $('#coord-result').textContent = t('seat.teacherTurn');
  $('#seat-after').classList.add('show');
  $('#seat-picked').textContent = t('seat.teacherTurn');
  $('#seat-picks').innerHTML = '';
  $('#seat-plus').disabled = true; $('#seat-minus').disabled = true;
  sfx.powerUp();
  const r = podium().getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, 70);
}
const resetPodium = () => podium().classList.remove('hit', 'flash');

async function drawPattern() {
  if (spinning) { stopReq = true; return; }
  if (busy) return;
  busy = true;
  hideAfter();
  resetPodium();
  $('#coord-result').textContent = '';
  const { rows, cols } = room();
  const res = await spin(() => {
    const f = { p: PATTERNS[rand(PATTERNS.length)], r0: rand(rows), c0: rand(cols) };
    clearMarks();
    patternCells(f.p, f.r0, f.c0).forEach(({ r, c }) => cellEl(r, c)?.classList.add('flash'));
    $('#pattern-name').textContent = t(`pat.${f.p}`);
    return f;
  });
  if (teacherLucky(seatMap().size)) { showTeacher(); busy = false; return; }
  // 停在畫面上最後顯示的圖案
  const final = res.p, fr = res.r0, fc = res.c0;
  clearMarks();
  const cells = patternCells(final, fr, fc);
  cells.forEach(({ r, c }) => cellEl(r, c)?.classList.add('hit'));
  sfx.bump();
  const map = seatMap();
  picked = cells.map(({ r, c }) => map.get(key(r, c))).filter((s) => s && !isAbsent(s.id));
  $('#pattern-name').textContent = `${t(`pat.${final}`)}${final === 'standAll' || final === 'sitAll' ? ' 🙋' : ''}`;
  showAfter();
  // 倒數 3、2、1 → 起立！老師點選最後起立的同學
  if (picked.length > 1 && final !== 'sitAll') {
    for (let n = 3; n >= 1; n--) {
      $('#coord-result').textContent = t('seat.countdown', { n });
      sfx.tick();
      await new Promise((res) => setTimeout(res, 800));
    }
    sfx.jump();
    const want = $('#seat-catch').value;
    catchRule = want === 'first' || want === 'last' ? want : (rand(2) ? 'first' : 'last');
    // 隨機：先喊起立賣個關子，再揭曉要抓第一個還是最後一個
    if (want === 'random') {
      $('#coord-result').textContent = t('seat.standMystery');
      await new Promise((res) => setTimeout(res, 1500));
      sfx.coin();
    }
    $('#coord-result').textContent = t(catchRule === 'first' ? 'seat.standFirst' : 'seat.standNow');
    $('#seat-hint').textContent = t(catchRule === 'first' ? 'seat.catchHintFirst' : 'seat.catchHint');
    catching = true;
  }
  busy = false;
}

function catchStudent(r, c) {
  const s = seatMap().get(key(r, c));
  const el = cellEl(r, c);
  if (!s || !el || !el.classList.contains('hit') || isAbsent(s.id)) return;
  cellsEl().forEach((e) => e.classList.remove('caught'));
  el.classList.add('caught');
  picked = [s];
  sfx.bump();
  $('#coord-result').textContent = t(catchRule === 'first' ? 'seat.caughtFirst' : 'seat.caught', { name: s.name });
  showAfter();
}

// ---------- 座標 ----------
function rel(r, c) { return { x: c - origin.c, y: origin.r - r }; } // 往講台（上）為 y+、往右為 x+
function inQuad(r, c, q) {
  const { x, y } = rel(r, c);
  const [sx, sy] = QUADS[q];
  return x !== 0 && y !== 0 && Math.sign(x) === sx && Math.sign(y) === sy;
}
function markQuadrant() {
  cellsEl().forEach((e) => e.classList.remove('quad'));
  const q = Number($('#quadrant').value);
  if (mode !== 'coord' || !origin || !q) return;
  cellsEl().forEach((e) => { if (inQuad(Number(e.dataset.r), Number(e.dataset.c), q)) e.classList.add('quad'); });
}

function setOrigin(r, c) {
  origin = { r, c };
  picking = false;
  sfx.coin();
  render();
  $('#coord-result').textContent = t('seat.originSet', { r: r + 1, c: c + 1 });
}

async function drawCoord() {
  if (spinning) { stopReq = true; return; }
  if (busy) return;
  if (!origin) { sfx.bump(); toast(t('seat.needOrigin'), 'error'); return; }
  let q = Number($('#quadrant').value);
  const map = seatMap();
  const candidatesIn = (qq) => [...map.entries()].map(([k, s]) => { const [r, c] = k.split(',').map(Number); return { r, c, s }; })
    .filter(({ r, c, s }) => !isAbsent(s.id) && inQuad(r, c, qq));
  if (!q) {
    const ok = [1, 2, 3, 4].filter((qq) => candidatesIn(qq).length);
    if (!ok.length) { sfx.bump(); toast(t('seat.noCandidates'), 'error'); return; }
    q = ok[rand(ok.length)];
  }
  const cands = candidatesIn(q);
  if (!cands.length) { sfx.bump(); toast(t('seat.noCandidatesQ', { q }), 'error'); return; }
  busy = true;
  hideAfter();
  resetPodium();
  $('#pattern-name').textContent = t(`seat.q.${q}`);
  // 圖案：單一座位，或以抽中的座位為中心畫大十字、小叉叉…（隨機＝每一格換一種）
  const cp = $('#coord-pattern').value;
  const pickP = () => (cp === 'rand' ? COORD_PATTERNS[rand(COORD_PATTERNS.length)] : cp);
  const cellsOf = (p, r, c) => (p === 'single' ? [{ r, c }] : patternCells(p, r, c));
  let prev = -1;
  const final = await spin(() => {
    let i = rand(cands.length);
    if (cands.length > 1 && i === prev) i = (i + 1) % cands.length;
    prev = i;
    const p = pickP();
    clearMarks();
    cellsOf(p, cands[i].r, cands[i].c).forEach(({ r, c }) => cellEl(r, c)?.classList.add('flash'));
    $('#pattern-name').textContent = `${t(`seat.q.${q}`)}${p === 'single' ? '' : `・${t(`pat.${p}`)}`}`;
    return { ...cands[i], p };
  });
  if (teacherLucky(cands.length)) { showTeacher(); busy = false; return; }
  clearMarks();
  const hits = cellsOf(final.p, final.r, final.c);
  hits.forEach(({ r, c }) => cellEl(r, c)?.classList.add('hit'));
  sfx.bump();
  const { x, y } = rel(final.r, final.c);
  picked = hits.map(({ r, c }) => map.get(key(r, c))).filter((st) => st && !isAbsent(st.id));
  const who = final.p === 'single' ? final.s.name : t('seat.nPeople', { n: picked.length });
  $('#coord-result').textContent = `(x, y) = (${x > 0 ? '+' : ''}${x}, ${y > 0 ? '+' : ''}${y})　→　${who}`;
  showAfter();
  busy = false;
}

// ---------- 加扣分 ----------
// 抽中的每個人列出來，各自加 / 扣分；也可以全部一起
function showAfter() {
  $('#seat-after').classList.add('show');
  if (!picked.length) { $('#seat-picked').textContent = t('seat.nobody'); $('#seat-picks').innerHTML = ''; $('#seat-plus').disabled = true; $('#seat-minus').disabled = true; return; }
  $('#seat-plus').disabled = false; $('#seat-minus').disabled = false;
  $('#seat-picked').textContent = t('seat.pickedN', { n: picked.length });
  renderPickList($('#seat-picks'), picked);
}
function hideAfter() { $('#seat-after').classList.remove('show'); picked = []; catching = false; cellsEl().forEach((e) => e.classList.remove('caught')); }

async function give(up, ids) {
  const targets = ids ? picked.filter((x) => ids.includes(x.id)) : picked;
  if (!targets.length || busy) return;
  const delta = up ? stepValue() : -stepValue();
  up ? sfx.powerUp() : sfx.gameOver();
  popEffect(up, delta, $('[data-panel=seats] .stage'));
  try {
    await adjust(targets.map((s) => s.id), { delta, note: t('seat.note') });
    renderPickList($('#seat-picks'), picked);
    toast(t('seat.given', { n: targets.length, d: (delta > 0 ? '+' : '') + delta }), 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- 事件 ----------
$$('[data-seatmode]').forEach((b) => b.addEventListener('click', () => {
  if (spinning || busy) return;
  mode = b.dataset.seatmode;
  $$('[data-seatmode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('#seat-pattern-bar').classList.toggle('hidden', mode !== 'pattern');
  $('#seat-coord-bar').classList.toggle('hidden', mode !== 'coord');
  $('#pattern-name').textContent = ''; $('#coord-result').textContent = '';
  hideAfter(); clearMarks(); hint(); markQuadrant();
}));
$('#pattern-btn').addEventListener('click', drawPattern);
$('#coord-btn').addEventListener('click', drawCoord);
$('#origin-pick').addEventListener('click', () => { picking = true; $('#room').classList.add('pick'); toast(t('seat.clickToPick')); });
$('#origin-rand').addEventListener('click', () => { const { rows, cols } = room(); setOrigin(rand(rows), rand(cols)); });
$('#quadrant').addEventListener('change', markQuadrant);
$('#room').addEventListener('click', (e) => {
  const b = e.target.closest('.seat');
  if (b && picking) setOrigin(Number(b.dataset.r), Number(b.dataset.c));
  else if (b && catching) catchStudent(Number(b.dataset.r), Number(b.dataset.c));
});
// 教室大小：直接在座位抽籤這裡改排數 / 每排座位數（多出來的位子就是空位）
function fillSize() { const { rows, cols } = room(); $('#seat-rows').value = rows; $('#seat-cols').value = cols; }
$('#seat-size-apply').addEventListener('click', async () => {
  const rows = Math.round(Number($('#seat-rows').value)), cols = Math.round(Number($('#seat-cols').value));
  if (!(rows >= 1 && rows <= 15 && cols >= 1 && cols <= 15)) { sfx.bump(); toast(t('chart.badSize'), 'error'); return; }
  if (busy) return;
  const out = [...seatMap().keys()].filter((k) => { const [r, c] = k.split(',').map(Number); return r >= rows || c >= cols; }).length;
  try {
    const r = await api('/api/teacher/config', { method: 'PUT', body: { course: S.course.code, config: { classroom: { rows, cols } } } });
    S.config = mergeConfig(r.config);
    emit('config');
    sfx.coin();
    toast(out ? t('seat.outside', { n: out }) : t('set.saved'), out ? 'info' : 'ok');
  } catch (err) { sfx.bump(); toast(err.message, 'error'); }
});
$('#seat-plus').addEventListener('click', () => give(true));
$('#seat-minus').addEventListener('click', () => give(false));
$('#seat-picks').addEventListener('click', (e) => {
  const b = e.target.closest('[data-give]');
  if (b) give(b.dataset.give === 'up', [b.closest('li').dataset.id]);
});

onChange((what) => {
  if (what === 'course' || what === 'config' || what === 'absent' || what === 'seating' || what === 'roster') {
    const { rows, cols } = room();
    if (origin && (origin.r >= rows || origin.c >= cols)) origin = null;
    hideAfter(); render(); hint(); fillSize();
  }
});
export const renderSeats = render;
