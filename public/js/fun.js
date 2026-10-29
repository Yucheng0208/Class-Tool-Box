// 擲骰子、擲硬幣、隨機分組
import { $, $$, esc, toast, burst, ICONS } from './common.js';
import { sfx } from './sound.js';
import { t, icon } from './i18n.js';
import { S, rand, shuffle, present } from './tstate.js';

// 九宮格點位（0~8）
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
// 3D 骰子：六個面（前 1、後 6、右 3、左 4、上 2、下 5），轉到指定角度讓那一面朝前
const FACES = [[1, 'front'], [6, 'back'], [3, 'right'], [4, 'left'], [2, 'top'], [5, 'bottom']];
const SHOW = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const face = (n, side) => `<div class="die-face ${side}">${
  Array.from({ length: 9 }, (_, i) => (PIPS[n].includes(i) ? `<i class="${n === 1 ? 'red' : ''}"></i>` : '<span></span>')).join('')}</div>`;
const dieHtml = () => `<div class="die3d" role="img" aria-label="1"><div class="cube">${FACES.map(([n, side]) => face(n, side)).join('')}</div><div class="die-shadow"></div></div>`;

// 聚光燈舞台：把骰子列／硬幣列暫時搬到全螢幕的暗幕中間，擲完再放回原位
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function spotlight(row, run) {
  if (!$('#fun-spot').checked) return run(() => {});
  const ph = document.createElement('div');
  ph.style.height = `${row.offsetHeight}px`;
  row.before(ph);
  const ov = document.createElement('div');
  ov.className = 'spot-ov';
  ov.innerHTML = '<div class="spot-beam"></div><div class="spot-stage"></div><div class="spot-result" aria-live="polite"></div>';
  ov.querySelector('.spot-stage').append(row);
  document.body.append(ov);
  document.documentElement.classList.add('spot-lock');
  // 放大到剛好塞得進螢幕：手機上骰子／硬幣太多就換行，再依寬高縮放，不會跑出畫面
  const stage = ov.querySelector('.spot-stage');
  const fit = () => {
    stage.style.transform = 'none';
    row.style.maxWidth = `${innerWidth - 24}px`;
    const w = row.offsetWidth || 1, h = row.offsetHeight || 1;
    const s = Math.min(1.7, (innerWidth - 24) / w, (innerHeight * 0.5) / h);
    stage.style.transform = `scale(${s})`;
    stage.style.margin = `${Math.max(0, (s - 1) * h / 2) + 40}px 0`;
  };
  fit();
  addEventListener('resize', fit);
  void ov.offsetWidth;
  ov.classList.add('on');
  await wait(350);
  let skip = null;
  const back = new Promise((r) => { skip = r; });
  await run((text) => { ov.querySelector('.spot-result').textContent = text; });
  ov.classList.add('done');
  // 停留一下讓大家看清楚，點一下可以提早回去
  ov.addEventListener('click', () => skip(), { once: true });
  await Promise.race([wait(1800), back]);
  ov.classList.remove('on');
  await wait(380);
  removeEventListener('resize', fit);
  row.style.maxWidth = '';
  ph.replaceWith(row);
  ov.remove();
  document.documentElement.classList.remove('spot-lock');
}

let diceBusy = false;
let dice = []; // { el, cube, rx, ry }
// 選幾顆就先擺幾顆、全部 1 點朝前
function renderDice() {
  const n = Number($('#dice-count').value);
  $('#dice-row').innerHTML = Array.from({ length: n }, dieHtml).join('');
  dice = [...$('#dice-row').querySelectorAll('.die3d')].map((el) => ({ el, cube: el.querySelector('.cube'), rx: 0, ry: 0 }));
  $('#dice-sum').textContent = '';
}
$('#dice-count').addEventListener('change', () => { if (!diceBusy) renderDice(); });

const ROLL_MS = 1500;
$('#dice-btn').addEventListener('click', async () => {
  if (diceBusy) return;
  diceBusy = true;
  if (dice.length !== Number($('#dice-count').value)) renderDice();
  $('#dice-sum').textContent = '';
  const vals = dice.map(() => 1 + rand(6));
  let text = '';
  await spotlight($('#dice-row'), async (say) => {
  sfx.jump();
  dice.forEach((d, i) => {
    const [tx, ty] = SHOW[vals[i]];
    // 從目前角度再多翻 2～4 圈，最後停在要顯示的那一面
    const spin = (cur, target) => Math.ceil(cur / 360) * 360 + 360 * (2 + rand(3)) + target;
    d.rx = spin(d.rx, tx); d.ry = spin(d.ry, ty);
    d.cube.style.transitionDuration = `${ROLL_MS - 200 + rand(400)}ms`;
    d.cube.style.transform = `rotateX(${d.rx}deg) rotateY(${d.ry}deg)`;
    d.el.classList.remove('hop'); void d.el.offsetWidth; d.el.classList.add('hop');
    d.el.style.animationDelay = `${i * 60}ms`;
    d.el.setAttribute('aria-label', String(vals[i]));
  });
  const tk = setInterval(() => sfx.tick(), 110);
  await new Promise((r) => setTimeout(r, ROLL_MS + 250));
  clearInterval(tk);
  dice.forEach((d) => { d.el.classList.remove('hop'); d.el.style.animationDelay = ''; }); // 回到待機的波浪舞
  sfx.bump();
  const sum = vals.reduce((a, b) => a + b, 0);
  text = vals.length > 1 ? t('fun.sum', { sum }) : String(sum);
  say(text);
  const r = $('#dice-row').getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, 40);
  });
  $('#dice-sum').textContent = text;
  if (vals.length > 1 && vals.every((v) => v === vals[0])) { sfx.powerUp(); toast(t('fun.allSame'), 'ok'); }
  diceBusy = false;
});
renderDice();

// ---- 擲筊：兩片筊杯，平面朝上的數量決定結果（一平一凸＝聖筊、兩平＝笑筊、兩凸＝陰筊） ----
const jiaoHtml = () => `<div class="jiao3d"><div class="jiao-spin"><div class="jf flat"></div><div class="jf round"></div></div><div class="coin-shadow"></div></div>`;
$('#jiao-row').innerHTML = jiaoHtml() + jiaoHtml();
const jiao = [...$('#jiao-row').querySelectorAll('.jiao3d')].map((el, i) => ({ el, spin: el.querySelector('.jiao-spin'), rot: i ? 180 : 0 }));
jiao.forEach((j) => { j.spin.style.transform = `rotateX(${j.rot}deg)`; });
let jiaoBusy = false;
$('#jiao-btn').addEventListener('click', async () => {
  if (jiaoBusy) return;
  jiaoBusy = true;
  $('#jiao-result').textContent = ''; $('#jiao-mean').textContent = '';
  const flat = jiao.map(() => rand(2) === 0);
  const n = flat.filter(Boolean).length;
  const key = n === 1 ? 'holy' : n === 2 ? 'laugh' : 'yin';
  let text = '';
  await spotlight($('#jiao-row'), async (say) => {
    sfx.jump();
    jiao.forEach((j, i) => {
      // 平面朝上停在 360 的倍數，凸面朝上多半圈
      j.rot = Math.ceil(j.rot / 360) * 360 + 360 * (3 + rand(3)) + (flat[i] ? 0 : 180);
      j.spin.style.transform = `rotateX(${j.rot}deg)`;
      j.el.classList.remove('toss'); void j.el.offsetWidth; j.el.classList.add('toss');
      j.el.style.animationDelay = `${i * 90}ms`;
    });
    await new Promise((r) => setTimeout(r, TOSS_MS + 250));
    jiao.forEach((j) => { j.el.classList.remove('toss'); j.el.style.animationDelay = ''; });
    text = t(`fun.jiao.${key}`);
    say(text);
    key === 'holy' ? sfx.powerUp() : key === 'laugh' ? sfx.coin() : sfx.bump();
    const r = $('#jiao-row').getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 30);
  });
  $('#jiao-result').textContent = text;
  $('#jiao-mean').textContent = t(`fun.jiao.${key}Mean`);
  jiaoBusy = false;
});

// ---- 猜拳：我們 vs 電腦。每一局的勝率都不一樣（隨機 20%～60%），不是固定的 ----
// 兩種玩法：猜拳（剪刀贏布、布贏石頭、石頭贏剪刀）、比大小（剪刀 2、石頭 0、布 5，數字大的贏）
const RPS = ['✌️', '✊', '✋']; // 0 剪刀、1 石頭、2 布
const RPS_VAL = [2, 0, 5];
let rpsMode = 'rps';
// a 對 b：1 贏、0 平、-1 輸
const rpsJudge = (a, b) => (rpsMode === 'num'
  ? Math.sign(RPS_VAL[a] - RPS_VAL[b])
  : a === b ? 0 : (a - b + 3) % 3 === 1 ? 1 : -1);
const rpsFace = (i) => `${RPS[i]}${rpsMode === 'num' ? `<b class="rps-num">${RPS_VAL[i]}</b>` : ''}`;
function setRpsMode(m) {
  rpsMode = m;
  $$('[data-rps-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rpsMode === m)));
  $$('[data-rps] .rps-lbl').forEach((s, i) => { s.textContent = m === 'num' ? `${t(`fun.rps.${i}`)} ${RPS_VAL[i]}` : t(`fun.rps.${i}`); });
  Object.assign(rpsScore, { w: 0, l: 0, d: 0 });
  renderRpsScore();
  $('#rps-result').textContent = '';
  $$('#rps-row .rps-hand').forEach((h) => h.classList.remove('reveal', 'win', 'lose'));
}
$$('[data-rps-mode]').forEach((b) => b.addEventListener('click', () => { if (!rpsBusy) { setRpsMode(b.dataset.rpsMode); sfx.tick(); } }));
let rpsBusy = false;
const rpsScore = { w: 0, l: 0, d: 0 };
const renderRpsScore = () => { $('#rps-score').textContent = t('fun.rpsScore', rpsScore); };
renderRpsScore();
$$('[data-rps]').forEach((b) => b.addEventListener('click', async () => {
  if (rpsBusy) return;
  rpsBusy = true;
  $$('[data-rps]').forEach((x) => { x.disabled = true; x.classList.toggle('on', x === b); });
  const me = Number(b.dataset.rps);
  // 這一局：贏、平、輸的機率每局重新隨機
  const pWin = 0.2 + Math.random() * 0.4, pDraw = 0.15 + Math.random() * 0.2;
  const r = Math.random();
  const outcome = r < pWin ? 'w' : r < pWin + pDraw ? 'd' : 'l';
  // 找一個符合這次結果的電腦出拳；比大小時石頭（0）贏不了、布（5）輸不了，就從可能的結果裡隨機
  const want = { w: 1, d: 0, l: -1 }[outcome];
  const fits = [0, 1, 2].filter((c) => rpsJudge(me, c) === want);
  const cpu = fits.length ? fits[rand(fits.length)] : rand(3);
  const res = rpsJudge(me, cpu);
  const final = res > 0 ? 'w' : res < 0 ? 'l' : 'd';
  const hands = [...$('#rps-row').querySelectorAll('.rps-hand')];
  hands.forEach((h) => { h.classList.remove('reveal', 'win', 'lose'); h.querySelector('.front').textContent = '✊'; });
  hands[0].querySelector('.back').innerHTML = rpsFace(me);
  hands[1].querySelector('.back').innerHTML = rpsFace(cpu);
  $('#rps-result').textContent = '';
  let text = '';
  await spotlight($('#rps-row'), async (say) => {
    // 剪刀、石頭、布！三下上下揮拳，最後一起翻出來
    const chant = t('fun.rpsChant').split('|');
    for (let k = 0; k < 3; k++) {
      say(chant[k] || '');
      hands.forEach((h) => { h.classList.remove('pump'); void h.offsetWidth; h.classList.add('pump'); });
      sfx.tick();
      await wait(420);
    }
    hands.forEach((h) => h.classList.add('reveal'));
    sfx.jump();
    await wait(650);
    rpsScore[final]++;
    if (final !== 'd') { hands[0].classList.add(final === 'w' ? 'win' : 'lose'); hands[1].classList.add(final === 'w' ? 'lose' : 'win'); }
    text = t(`fun.rpsRes.${final}`);
    if (rpsMode === 'num') text = `${RPS_VAL[me]} vs ${RPS_VAL[cpu]}　${text}`;
    say(text);
    final === 'w' ? sfx.powerUp() : final === 'l' ? sfx.bump() : sfx.coin();
    if (final === 'w') { const rc = hands[0].getBoundingClientRect(); burst(rc.left + rc.width / 2, rc.top + rc.height / 2, 40); }
  });
  $('#rps-result').textContent = text;
  renderRpsScore();
  $$('[data-rps]').forEach((x) => { x.disabled = false; });
  rpsBusy = false;
}));
$('#rps-reset').addEventListener('click', () => {
  Object.assign(rpsScore, { w: 0, l: 0, d: 0 });
  renderRpsScore();
  $('#rps-result').textContent = '';
  $$('#rps-row .rps-hand').forEach((h) => h.classList.remove('reveal', 'win', 'lose'));
  $$('[data-rps]').forEach((x) => x.classList.remove('on'));
});

let coinBusy = false;
// 硬幣：正面蘑菇、反面毒菇；還沒擲之前顯示 M 徽章。最多同時擲 4 枚，往上拋、在空中 3D 翻轉後落下
const coinHtml = () => `<div class="coin3d"><div class="coin-spin"><div class="cf front">${ICONS.mark}</div><div class="cf back">${ICONS.mark}</div><div class="coin-edge"></div></div><div class="coin-shadow"></div></div>`;
let coins = [];
function renderCoins() {
  const n = Number($('#coin-count').value);
  $('#coin-row').innerHTML = Array.from({ length: n }, coinHtml).join('');
  coins = [...$('#coin-row').querySelectorAll('.coin3d')].map((el) => ({ el, spin: el.querySelector('.coin-spin'), rot: 0 }));
  $('#coin-result').textContent = '';
}
$('#coin-count').addEventListener('change', () => { if (!coinBusy) renderCoins(); });
const TOSS_MS = 1300;
$('#coin-btn').addEventListener('click', async () => {
  if (coinBusy) return;
  coinBusy = true;
  if (coins.length !== Number($('#coin-count').value)) renderCoins();
  $('#coin-result').textContent = '';
  const heads = coins.map(() => rand(2) === 0);
  let text = '';
  await spotlight($('#coin-row'), async (say) => {
  sfx.jump();
  coins.forEach((c, i) => {
    // 拋起時換上蘑菇／毒菇兩面
    c.el.querySelector('.front').innerHTML = ICONS.mushroom;
    c.el.querySelector('.back').innerHTML = ICONS.poison;
    c.el.classList.remove('poison');
    // 翻 4～6 圈，正面朝上停在 360 的倍數、反面多半圈
    c.rot = Math.ceil(c.rot / 360) * 360 + 360 * (4 + rand(3)) + (heads[i] ? 0 : 180);
    c.spin.style.transform = `rotateX(${c.rot}deg)`;
    c.el.classList.remove('toss'); void c.el.offsetWidth; c.el.classList.add('toss');
    c.el.style.animationDelay = `${i * 70}ms`;
  });
  await new Promise((r) => setTimeout(r, TOSS_MS + 100 + coins.length * 70));
  coins.forEach((c) => { c.el.classList.remove('toss'); c.el.style.animationDelay = ''; });
  coins.forEach((c, i) => c.el.classList.toggle('poison', !heads[i]));
  const h = heads.filter(Boolean).length;
  text = coins.length === 1 ? t(heads[0] ? 'fun.headsMush' : 'fun.tailsPoison') : t('fun.coinTally', { h, p: coins.length - h });
  say(text);
  h >= coins.length - h ? sfx.powerUp() : sfx.bump();
  const r = $('#coin-row').getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, 36);
  });
  $('#coin-result').textContent = text;
  coinBusy = false;
});
renderCoins();

// 組數、每組人數可擇一或都填：
//  只填組數 → 平均分配；只填每組人數 → 自動算組數；兩個都填 → 抽出 組數×人數 位，其餘列為未分組
// ---- 隨機分組：表格顯示、每組隨機一位組長；按「編輯小組」可以改組長、替每個人寫工作、填貢獻比例（合計 100%），結果可下載 CSV ----
let groups = [];       // [{ title, members: [學生], leader: 學號, jobs: { 學號: 工作 }, pct: { 學號: 貢獻 % } }]
let ungrouped = [];
let editingGroup = -1; // 正在編輯的組別
const pickLeader = (g) => { g.leader = g.members.length ? g.members[rand(g.members.length)].id : ''; };
const pctSum = (g) => Math.round(g.members.reduce((a, s) => a + (Number(g.pct[s.id]) || 0), 0) * 10) / 10;
const hasPct = (g) => g.members.some((s) => g.pct[s.id] !== undefined && g.pct[s.id] !== '');
const sortLead = (g) => [...g.members].sort((x, y) => (x.id === g.leader ? -1 : y.id === g.leader ? 1 : 0));
function renderGroups() {
  const table = (g, gi) => {
    const editing = gi === editingGroup;
    const showPct = gi >= 0 && (editing || hasPct(g));
    const rows = sortLead(g).map((s) => {
      const lead = s.id === g.leader;
      const job = (g.jobs && g.jobs[s.id]) || '';
      const role = editing
        ? `<label class="gp-lead-pick"><input type="radio" name="gp-lead-${gi}" value="${esc(s.id)}" ${lead ? 'checked' : ''} aria-label="${esc(t('fun.leader'))}"> ${esc(t('fun.leader'))}</label>
           <input type="text" class="gp-job" data-gp="${gi}" data-id="${esc(s.id)}" value="${esc(job)}" maxlength="30" placeholder="${esc(t('fun.jobPh'))}" aria-label="${esc(t('fun.job'))}">`
        : `${lead ? `<span class="gp-crown">${icon('fa-crown')} ${esc(t('fun.leader'))}</span>` : esc(t('fun.member'))}${job ? ` <span class="gp-jobtag">${esc(job)}</span>` : ''}`;
      const pct = !showPct ? '' : editing
        ? `<td><input type="number" class="gp-pct" data-gp="${gi}" data-id="${esc(s.id)}" value="${esc(g.pct[s.id] ?? '')}" min="0" max="100" step="1" aria-label="%"></td>`
        : `<td>${g.pct[s.id] !== undefined && g.pct[s.id] !== '' ? `${esc(g.pct[s.id])}%` : '—'}</td>`;
      return `<tr class="${lead ? 'gp-lead' : ''}"><td class="gp-role">${role}</td>
        <td>${esc(s.seat || '')}</td><td>${esc(s.id)}</td><td class="gp-name">${esc(s.name)}</td>${pct}</tr>`;
    }).join('');
    const sum = pctSum(g);
    const foot = showPct ? `<tfoot><tr><td colspan="4" class="gp-sum-label">${esc(t('fun.pctTotal'))}
        ${editing ? `<button class="btn btn-small" type="button" data-gp-even="${gi}">${icon('fa-scale-balanced')} ${esc(t('fun.pctEven'))}</button>` : ''}</td>
        <td class="gp-sum ${sum === 100 ? 'ok' : 'bad'}">${sum}%</td></tr></tfoot>` : '';
    return `<div class="card gp-card${editing ? ' editing' : ''}">
      <div class="gp-head"><b>${esc(g.title)}</b> <span class="muted small">${esc(t('fun.nPeople', { n: g.members.length }))}</span>
        ${gi >= 0 ? `<button class="btn btn-small${editing ? ' btn-primary' : ''}" type="button" data-gp-edit="${gi}">${icon(editing ? 'fa-check' : 'fa-pen')} ${esc(t(editing ? 'fun.leaderDone' : 'fun.leaderEdit'))}</button>` : ''}</div>
      <div class="tbl-wrap"><table class="tbl gp-tbl"><thead><tr><th>${esc(t('fun.role'))}</th><th>${esc(t('fun.seatNo'))}</th><th>${esc(t('fun.stuId'))}</th><th>${esc(t('fun.stuName'))}</th>${showPct ? `<th>${esc(t('fun.pct'))}</th>` : ''}</tr></thead><tbody>${rows}</tbody>${foot}</table></div>
      ${editing && sum !== 100 && hasPct(g) ? `<p class="small gp-warn">${esc(t('fun.pctWarn', { n: sum }))}</p>` : ''}
    </div>`;
  };
  $('#groups').innerHTML = groups.map(table).join('')
    + (ungrouped.length ? table({ title: t('fun.ungrouped'), members: ungrouped, leader: '', jobs: {}, pct: {} }, -1) : '');
  $('#group-leaders').classList.toggle('hidden', !groups.length);
  $('#group-dl').classList.toggle('hidden', !groups.length);
}
$('#groups').addEventListener('click', (e) => {
  const even = e.target.closest('[data-gp-even]');
  if (even) {
    // 平均分配：100 除以人數，餘數給前面幾位，合計剛好 100
    const g = groups[Number(even.dataset.gpEven)], n = g.members.length, base = Math.floor(100 / n);
    sortLead(g).forEach((s, i) => { g.pct[s.id] = base + (i < 100 - base * n ? 1 : 0); });
    sfx.coin();
    renderGroups();
    return;
  }
  const b = e.target.closest('[data-gp-edit]');
  if (!b) return;
  const gi = Number(b.dataset.gpEdit);
  // 按「完成」時貢獻比例不是 100% 就提醒（還是可以先完成）
  if (editingGroup === gi && hasPct(groups[gi]) && pctSum(groups[gi]) !== 100) toast(t('fun.pctWarn', { n: pctSum(groups[gi]) }), 'error');
  editingGroup = editingGroup === gi ? -1 : gi;
  sfx.tick();
  renderGroups();
});
$('#groups').addEventListener('change', (e) => {
  const r = e.target.closest('input[type=radio][name^="gp-lead-"]');
  if (r) { groups[Number(r.name.slice(8))].leader = r.value; sfx.coin(); renderGroups(); return; }
  const job = e.target.closest('.gp-job');
  if (job) { groups[Number(job.dataset.gp)].jobs[job.dataset.id] = job.value.trim(); return; }
});
// 貢獻比例：邊打邊更新合計（不重畫整張表，游標才不會跳掉）
$('#groups').addEventListener('input', (e) => {
  const inp = e.target.closest('.gp-pct');
  if (!inp) return;
  const g = groups[Number(inp.dataset.gp)];
  const v = inp.value === '' ? '' : Math.max(0, Math.min(100, Number(inp.value)));
  g.pct[inp.dataset.id] = v;
  const sum = pctSum(g), cell = inp.closest('table').querySelector('.gp-sum');
  cell.textContent = `${sum}%`;
  cell.classList.toggle('ok', sum === 100);
  cell.classList.toggle('bad', sum !== 100);
});
$('#group-leaders').addEventListener('click', () => { groups.forEach(pickLeader); editingGroup = -1; sfx.powerUp(); renderGroups(); });
$('#group-dl').addEventListener('click', () => {
  const cell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
  const head = [t('fun.groupCol'), t('fun.role'), t('fun.job'), t('fun.seatNo'), t('fun.stuId'), t('fun.stuName'), t('fun.pct')];
  const lines = [head.map(cell).join(',')];
  const add = (g, roleOf) => sortLead(g).forEach((s) => lines.push([g.title, roleOf(s), (g.jobs && g.jobs[s.id]) || '', s.seat || '', s.id, s.name,
    g.pct && g.pct[s.id] !== undefined && g.pct[s.id] !== '' ? `${g.pct[s.id]}%` : ''].map(cell).join(',')));
  groups.forEach((g) => add(g, (s) => t(s.id === g.leader ? 'fun.leader' : 'fun.member')));
  if (ungrouped.length) add({ title: t('fun.ungrouped'), members: ungrouped, leader: '' }, () => '');
  const base = `${S.course.name}${S.course.className ? `_${S.course.className}` : ''}`.replace(/[\\/:*?"<>|]/g, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `${base}_分組_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  sfx.coin();
});

$('#group-btn').addEventListener('click', () => {
  const num = (sel) => { const v = Math.round(Number($(sel).value)); return Number.isFinite(v) && v > 0 ? v : 0; };
  let n = num('#group-n');
  const size = num('#group-size');
  let list = shuffle(present());
  if (!n && !size) { sfx.bump(); toast(t('fun.needInput'), 'error'); return; }
  const both = n && size;
  if (!n) n = Math.ceil(list.length / size);
  let rest = [];
  if (both) {
    if (n * size > list.length) { sfx.bump(); toast(t('fun.notEnough', { need: n * size, have: list.length }), 'error'); return; }
    rest = list.slice(n * size);
    list = list.slice(0, n * size);
  }
  if (list.length < n) { sfx.bump(); toast(t('fun.tooFew'), 'error'); return; }
  const g = Array.from({ length: n }, () => []);
  list.forEach((s, i) => g[i % n].push(s));
  groups = g.map((members, i) => ({ title: t('fun.groupN', { n: i + 1 }), members, leader: '', jobs: {}, pct: {} }));
  groups.forEach(pickLeader);
  ungrouped = rest;
  editingGroup = -1;
  renderGroups();
  sfx.powerUp();
});

