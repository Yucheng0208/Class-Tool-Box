// 抽籤：問號磚塊 / 拉霸機 / 幸運輪盤 / 打彈珠，跑者動畫，今日缺席
import { $, $$, api, esc, toast, askConfirm, ICONS, MASCOT_SRC, burst, mascotSay } from './common.js';
import { sfx, bgm } from './sound.js';
import { t, ti } from './i18n.js';
import { computeTotal } from './calc.js';
import { S, sign, rand, shuffle, isAbsent, present, onChange, emit, adjust } from './tstate.js';
import { createPinball, MAX_POCKETS } from './pinball.js';
import { createGacha, createClaw, createCards, createScratch, createKuji, createDarts, createBingo, createRaffle, createOmikuji, createBuzzer, createPack } from './arcade.js';

const drawBtn = $('#draw-btn');
// 問號磚塊：一排磚塊，跑者停在哪一塊下面就跳起來撞，撞出抽中的人
const BLOCKS = 6;
const blockRow = $('#block-row');
blockRow.innerHTML = Array.from({ length: BLOCKS }, () => '<div class="qblock mini-block idle"><span class="name">?</span><span class="sub"></span></div>').join('');
const blocks = [...blockRow.children];
const blockAt = (x) => Math.max(0, Math.min(BLOCKS - 1, Math.floor((x / 100) * BLOCKS)));
const blockCenter = (i) => ((i + 0.5) / BLOCKS) * 100;
function resetBlocks() {
  blocks.forEach((b) => { b.className = 'qblock mini-block idle'; b.querySelector('.name').textContent = '?'; b.querySelector('.sub').textContent = ''; });
}
let rolling = false;
let stopping = false;
let autoTimer = null; // 勾選「自動停止」時，4～10 秒後自動暫停
let timer = null;
let packPick = null; // 拆卡包：老師自己點的那一包
let runId = 0;        // 每次開始／中斷抽籤 +1；舊的動畫回呼就不會再算數
let seq = [];         // 一次抽多人時，依序撞磚塊／轉輪盤／拉霸的計時器
let current = null;   // 抽中的第一位（或 { number }）
let winners = [];     // 這次抽中的所有人
let shown = null;     // 滾動中畫面上顯示的項目
let drawn = new Set();
const history = [];

const content = () => $('#lot-content').value;
const MAX_PICK = 5; // 一次最多抽 5 人，每種樣式的動畫都會跑出同樣的數量
const style = () => $('#lot-style').value;
const isNumber = () => content() === 'number';

function pool() {
  if (isNumber()) {
    const lo = Math.ceil(Number($('#num-min').value)), hi = Math.floor(Number($('#num-max').value));
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo || hi - lo > 100000) return [];
    const all = [];
    for (let n = lo; n <= hi && all.length < 5000; n++) all.push({ number: n, id: `#${n}` });
    return $('#no-repeat').checked ? all.filter((x) => !drawn.has(x.id)) : all;
  }
  // 彩蛋：勾選後「老師起立」「老師回答」這些籤也會混在名單裡
  const list = $('#lot-egg').checked ? [...present(), ...eggs()] : present();
  return $('#no-repeat').checked ? list.filter((s) => !drawn.has(s.id)) : list;
}
const eggs = () => t('lot.eggs').split('|').filter(Boolean).map((name, i) => ({ id: `__egg${i}`, name, seat: '', egg: true }));

function labels(item) {
  if (!item) return { main: '?', sub: '' };
  if (item.number !== undefined) return { main: String(item.number), sub: '' };
  if (item.egg) return { main: item.name, sub: t('lot.eggTag') };
  const seat = item.seat ? `#${item.seat}` : '';
  // 一律姓名大、學號小；也可以只顯示其中一種
  if (content() === 'id') return { main: item.id, sub: '' };
  if (content() === 'name') return { main: item.name, sub: '' };
  return { main: item.name, sub: item.id };
}

function updatePoolInfo() {
  const total = isNumber() ? pool().length + (($('#no-repeat').checked && drawn.size) || 0) : present().length + ($('#lot-egg').checked ? eggs().length : 0);
  $('#pool-info').textContent = t('lot.pool', { left: pool().length, total });
}

// ---------- 跑者 ----------
const runner = $('#runner');
let runX = 50, runDir = 1, runFrame = 0, runRaf = 0, useImg = false;
(function initRunner() {
  const img = new Image();
  img.alt = '';
  img.onload = () => { useImg = true; runner.innerHTML = ''; runner.appendChild(img); };
  img.onerror = () => { runner.innerHTML = `<span class="mascot-fallback">${ICONS.runnerA}</span>`; };
  img.src = MASCOT_SRC;
})();
function runLoop() {
  runX += runDir * 0.9;
  if (runX > 92) runDir = -1;
  if (runX < 8) runDir = 1;
  runner.style.left = `${runX}%`;
  runner.classList.toggle('flip', runDir < 0);
  const over = blockAt(runX);
  blocks.forEach((b, i) => b.classList.toggle('over', i === over));
  if (!useImg && ++runFrame % 6 === 0) {
    runner.innerHTML = `<span class="mascot-fallback">${(runFrame / 6) % 2 ? ICONS.runnerB : ICONS.runnerA}</span>`;
  }
  runRaf = requestAnimationFrame(runLoop);
}
function runStart() { cancelAnimationFrame(runRaf); runner.style.transition = 'none'; runner.classList.add('running'); runLoop(); }
function runJump(x = 50, ms = 180) {
  cancelAnimationFrame(runRaf);
  runner.classList.toggle('running', ms > 180); // 跑去比較遠的磚塊時邊跑邊擺動
  runner.style.transition = `left ${ms}ms linear`;
  runner.style.left = `${x}%`;
  runner.classList.toggle('flip', x < runX);
  runX = x;
  setTimeout(() => {
    runner.classList.remove('running', 'flip');
    runner.classList.remove('jump');
    void runner.offsetWidth;
    runner.classList.add('jump');
  }, 180);
}

// ---------- 樣式切換 ----------
function applyStyle() {
  $('#track').classList.toggle('hidden', style() !== 'block');
  $('#scratch-self-field').classList.toggle('hidden', style() !== 'scratch');
  $('#omi-bad-field').classList.toggle('hidden', style() !== 'omikuji');
  ['block', 'slot', 'wheel', 'pinball', 'gacha', 'claw', 'cards', 'scratch', 'kuji', 'darts', 'bingo', 'raffle', 'omikuji', 'buzzer', 'pack'].forEach((s) => $(`#style-${s}`).classList.toggle('hidden', style() !== s));
  if (MACHINES[style()]) MACHINES[style()].reset();
  if (style() === 'wheel') drawWheel();
  if (style() === 'pinball') showPockets();
  $('#slot-result').textContent = '';
}

// ---------- 打彈珠 ----------
// 從名單隨機挑最多 7 人放進下方口袋，彈珠落在哪格就抽中誰
let pockets = [];
const pin = createPinball($('#pinball'), {
  onPeg: () => sfx.tick(),
  onBall: () => sfx.coin(),
  onRepeat: () => sfx.bump(),
  onHole: () => sfx.powerDown(),
  onLand: (list) => { if (!rolling) return; sfx.coin(); finish(list[0], list.slice(1)); },
});
// ---------- 扭蛋機 / 哇哇機 / 撲克牌：過程中只顯示「?」，停下後由這裡隨機決定中獎者 ----------
// 自動停止預設開啟（避免瀏覽器還原成上次沒勾的狀態）
$('#lot-auto').checked = true;

const MACHINES = {
  gacha: createGacha($('#gacha-stage')),
  claw: createClaw($('#claw-stage')),
  cards: createCards($('#cards-stage')),
  scratch: createScratch($('#scratch-stage')),
  kuji: createKuji($('#kuji-stage')),
  darts: createDarts($('#darts-stage')),
  bingo: createBingo($('#bingo-stage')),
  raffle: createRaffle($('#raffle-stage')),
  omikuji: createOmikuji($('#omikuji-stage')),
  buzzer: createBuzzer($('#buzzer-stage'), { say: t('lot.buzzSay').split('|') }),
  // 點一包就直接拆（還沒開始也可以）
  pack: createPack($('#pack-stage'), {
    names: t('lot.pack.names').split('|'),
    hint: t('lot.pack.hint'),
    onTick: () => sfx.tick(),
    onPick: (i) => { if (stopping) return; packPick = i; if (!rolling) start(); if (rolling) stop(); },
  }),
};

function showPockets() {
  if (rolling) return;
  pockets = shuffle(pool()).slice(0, MAX_POCKETS);
  pin.show(pockets);
  $('#pin-result').textContent = '';
}

// ---------- 拉霸機 ----------
const SYMBOLS = ['book', 'pencil', 'star', 'cap'];
let slotL = 'star', slotR = 'coin';
function setReel(el, sym) { $('.reel-item', el).innerHTML = ICONS[sym]; }

// ---------- 輪盤 ----------
const wheel = $('#wheel');
const wctx = wheel.getContext('2d');
let wRot = 0, wVel = 0, wItems = [], wRaf = 0, wTarget = null, lastSeg = -1;
let wGot = [], wNeed = 1; // 抽多人：轉幾次輪盤就抽幾人，抽中的人從輪盤拿掉再轉
const WHEEL_COLORS = ['#e52521', '#fbd000', '#2bb24c', '#5c94fc', '#ff8a1c', '#9b30d9', '#1aa3a3', '#ff7ac8'];
function segAt(rot) {
  const n = wItems.length;
  const seg = (Math.PI * 2) / n;
  const a = ((-Math.PI / 2 - rot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor(a / seg) % n;
}
function drawWheel() {
  if (!rolling) wItems = pool();
  const n = wItems.length;
  const W = wheel.width, R = W / 2 - 12;
  wctx.clearRect(0, 0, W, W);
  wctx.save();
  wctx.translate(W / 2, W / 2);
  if (!n) {
    wctx.fillStyle = '#ccc'; wctx.beginPath(); wctx.arc(0, 0, R, 0, Math.PI * 2); wctx.fill();
    wctx.restore();
    return;
  }
  const seg = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a0 = wRot + i * seg;
    wctx.beginPath(); wctx.moveTo(0, 0); wctx.arc(0, 0, R, a0, a0 + seg); wctx.closePath();
    wctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
    if (n % WHEEL_COLORS.length === 1 && i === n - 1) wctx.fillStyle = WHEEL_COLORS[3];
    wctx.fill();
    wctx.lineWidth = 3; wctx.strokeStyle = '#000'; wctx.stroke();
    if (n <= 60) {
      wctx.save();
      wctx.rotate(a0 + seg / 2);
      wctx.fillStyle = '#000';
      wctx.font = `900 ${Math.max(14, Math.min(34, 520 / n))}px "Noto Sans TC", sans-serif`;
      wctx.textAlign = 'right'; wctx.textBaseline = 'middle';
      wctx.fillText(labels(wItems[i]).main.slice(0, 8), R - 18, 0);
      wctx.restore();
    }
  }
  wctx.beginPath(); wctx.arc(0, 0, 46, 0, Math.PI * 2); wctx.fillStyle = '#fbd000'; wctx.fill();
  wctx.lineWidth = 6; wctx.strokeStyle = '#000'; wctx.stroke();
  wctx.fillStyle = '#c84c0c'; wctx.font = '900 44px system-ui, sans-serif'; wctx.textAlign = 'center'; wctx.textBaseline = 'middle';
  wctx.fillText('?', 2, 4);
  wctx.beginPath(); wctx.arc(0, 0, R, 0, Math.PI * 2); wctx.lineWidth = 10; wctx.stroke();
  wctx.restore();
}
function wheelLoop() {
  wRot += wVel;
  if (wTarget !== null) {
    wVel *= wGot.length ? 0.972 : 0.985; // 第二輪之後停得快一點
    if (wVel < 0.002) {
      wVel = 0;
      cancelAnimationFrame(wRaf);
      drawWheel();
      wheelLanded(wItems[segAt(wRot)]);
      return;
    }
  }
  const s = segAt(wRot);
  if (s !== lastSeg) { lastSeg = s; sfx.tick(); $('#wheel-result').textContent = [...wGot, wItems[s]].map((x) => labels(x).main).join('、'); }
  drawWheel();
  wRaf = requestAnimationFrame(wheelLoop);
}

function wheelSpin() {
  wVel = 0.32 + Math.random() * 0.08;
  wTarget = null;
  lastSeg = -1;
  cancelAnimationFrame(wRaf);
  wheelLoop();
}
function wheelLanded(w) {
  wGot.push(w);
  if (wGot.length >= wNeed || wItems.length < 2) { finish(wGot[0], wGot.slice(1)); return; }
  sfx.coin();
  $('#wheel-result').textContent = wGot.map((x) => labels(x).main).join('、');
  const id = runId;
  later(() => {
    if (id !== runId) return;
    wItems = wItems.filter((x) => x !== w);
    sfx.jump();
    wheelSpin();
    later(() => { if (id === runId) wTarget = 1; }, 600 + rand(500));
  }, 900);
}

// ---------- 開始 / 暫停 ----------
function start() {
  const list = pool();
  if (!list.length) { sfx.bump(); toast(t('lot.empty'), 'error'); return; }
  rolling = true;
  runId++;
  current = null;
  sfx.jump();
  bgm.start();
  if (style() === 'block') runStart(); // 只有問號磚塊模式有跑者撞磚塊
  $('#after-draw').classList.remove('show');
  drawBtn.innerHTML = ti('fa-pause', 'lot.pause');
  drawBtn.classList.replace('btn-primary', 'btn-yellow');
  clearTimeout(autoTimer);
  // 拆卡包要讓老師自己挑一包，不自動停
  if ($('#lot-auto').checked && style() !== 'pinball' && style() !== 'pack') autoTimer = setTimeout(stop, 1000 + rand(4001));

  if (MACHINES[style()]) { MACHINES[style()].start(); return; }
  if (style() === 'pinball') {
    // 彈珠自己會落下；過程中按鈕變成「推一下」（最多 3 次）
    // 抽幾人就連發幾顆；人數多時口袋最多加到 10 格
    pockets = shuffle(list).slice(0, Math.max(MAX_POCKETS, Math.min(10, wantCount())));
    $('#pin-result').textContent = '';
    drawBtn.innerHTML = ti('fa-hand-back-fist', 'lot.nudge');
    pin.launch(pockets, isNumber() ? 1 : wantCount());
    return;
  }
  if (style() === 'wheel') {
    wItems = list;
    wGot = [];
    wNeed = need(list);
    $('#wheel-result').textContent = '';
    wheelSpin();
    return;
  }
  if (style() === 'slot') {
    slotSpin();
    $('#slot-result').textContent = '';
  } else {
    resetBlocks();
  }
  rollNames(list);
}
function slotSpin() {
  $$('.reel').forEach((r) => { r.classList.add('spin'); r.classList.remove('stopped'); });
  $('#slot').classList.remove('win');
}
// 拉霸、問號磚塊滾動中：名字一直換
function rollNames(list) {
  clearTimeout(timer);
  let i = rand(list.length);
  const tick = () => {
    i = (i + 1 + rand(Math.max(1, list.length - 1))) % list.length;
    shown = list[i];
    const l = labels(shown);
    if (style() === 'slot') {
      $('#slot-main').textContent = l.main; $('#slot-sub').textContent = l.sub;
      if (!$('#reel-l').classList.contains('stopped')) setReel($('#reel-l'), SYMBOLS[rand(4)]);
      setReel($('#reel-r'), SYMBOLS[rand(4)]);
    }
    sfx.tick();
    timer = setTimeout(tick, 70);
  };
  tick();
}

function stop() {
  clearTimeout(autoTimer);
  if (stopping || !rolling) return;
  // 停下的動畫要一點時間；這段時間內若換了樣式（runId 變了）就不再算結果
  const id = runId;
  const finish = (...a) => { if (id === runId) finishDraw(...a); };
  if (style() === 'pinball') { if (pin.nudge()) sfx.jump(); else sfx.tick(); return; }
  bgm.stop();
  if (MACHINES[style()]) {
    stopping = true;
    sfx.tick();
    // 先決定這次所有中獎者，一番賞、拆卡包會一次拆出全部的人
    const list = pool();
    const wins = shuffle(list).slice(0, need(list));
    const pick = packPick;
    packPick = null;
    MACHINES[style()].stop(() => { sfx.coin(); finish(wins[0], wins.slice(1)); }, labels(wins[0]),
      { self: $('#scratch-self').checked, hint: t('lot.scratchHint'), allLabel: t('lot.scratchAll'),
        grades: t('lot.omi.grades').split('|'), bad: $('#omi-bad').checked, ding: t('lot.buzzDing'),
        all: wins.map(labels), pack: pick });
    return;
  }
  if (style() === 'wheel') {
    stopping = true;
    wTarget = 1; // 開始減速，停下時呼叫 finish
    sfx.tick();
    return;
  }
  // 拉霸、問號磚塊：先決定這次所有中獎者，抽幾人就停幾輪／撞幾塊
  const list = pool();
  const wins = shuffle(list).slice(0, need(list));
  if (style() === 'slot') {
    stopping = true;
    const got = [];
    // 三個轉輪依序停下；還有下一位就再轉一輪
    const round = (k) => {
      if (id !== runId) return;
      slotL = SYMBOLS[rand(4)];
      slotR = Math.random() < 0.3 ? slotL : SYMBOLS[rand(4)];
      const stopReel = (el, sym) => { el.classList.remove('spin'); if (sym) setReel(el, sym); el.classList.remove('stopped'); void el.offsetWidth; el.classList.add('stopped'); sfx.tick(); };
      stopReel($('#reel-l'), slotL);
      later(() => {
        clearTimeout(timer);
        const l = labels(wins[k]);
        $('#slot-main').textContent = l.main; $('#slot-sub').textContent = l.sub;
        stopReel($('#reel-m'));
        got.push(l.main);
        if (wins.length > 1) $('#slot-result').textContent = got.join('、');
      }, 380);
      later(() => {
        stopReel($('#reel-r'), slotR);
        if (slotL === slotR) { $('#slot').classList.add('win'); setTimeout(() => sfx.coin(), 150); toast(t('lot.jackpot'), 'ok'); }
        if (k + 1 >= wins.length) { finish(wins[0], wins.slice(1)); return; }
        // 下一輪
        later(() => {
          if (id !== runId) return;
          sfx.jump();
          slotSpin();
          rollNames(list.filter((x) => !wins.slice(0, k + 1).includes(x)));
          later(() => round(k + 1), 900);
        }, 800);
      }, 760);
    };
    round(0);
    return;
  }
  // 問號磚塊：跑到最近的磚塊下面跳起來撞；抽幾人就撞幾塊（之後跑去別的磚塊）
  clearTimeout(timer);
  stopping = true;
  const first = blockAt(runX);
  const hits = [first, ...shuffle([...Array(BLOCKS).keys()].filter((i) => i !== first))].slice(0, wins.length);
  const hit = (k) => {
    if (id !== runId) return;
    const idx = hits[k], b = blocks[idx];
    const ms = k ? Math.max(220, Math.abs(runX - blockCenter(idx)) * 9) : 180;
    runJump(blockCenter(idx), ms);
    later(() => {
      sfx.bump();
      const l = labels(wins[k]);
      blocks.forEach((x) => x.classList.remove('over'));
      b.classList.remove('idle');
      b.classList.add('used', 'bumped');
      b.querySelector('.name').textContent = l.main;
      b.querySelector('.sub').textContent = l.sub;
      setTimeout(() => b.classList.remove('bumped'), 300);
      if (k + 1 < wins.length) later(() => hit(k + 1), 450);
      else finish(wins[0], wins.slice(1));
    }, ms + 150);
  };
  hit(0);
}

const wantCount = () => Math.max(1, Math.min(MAX_PICK, Math.round(Number($('#lot-count').value) || 1)));
// 這次要抽出幾人（抽數字一次一個；名單不夠就全部）
const need = (list) => (isNumber() ? 1 : Math.min(wantCount(), list.length));
const later = (fn, ms) => seq.push(setTimeout(fn, ms));
$('#lot-count').addEventListener('change', () => { $('#lot-count').value = wantCount(); });
// extra：動畫自己決定的其他中獎者（例如打彈珠連發）
// 抽到一半換樣式：立刻中斷目前的動畫，不算結果
function abortDraw() {
  runId++;
  clearTimeout(autoTimer); clearTimeout(timer);
  seq.forEach(clearTimeout); seq = [];
  cancelAnimationFrame(wRaf); cancelAnimationFrame(runRaf);
  pin.stop();
  bgm.stop();
  runner.classList.remove('running', 'jump');
  $$('.reel').forEach((r) => r.classList.remove('spin'));
  rolling = false;
  stopping = false;
  drawBtn.innerHTML = ti('fa-play', 'lot.start');
  drawBtn.classList.replace('btn-yellow', 'btn-primary');
}

const finish = (...a) => finishDraw(...a);
function finishDraw(item, extra = []) {
  rolling = false;
  stopping = false;
  current = item;
  drawn.add(item.id);
  // 一次抽多人：第一位由動畫決定，其餘從剩下名單隨機補足
  winners = [item, ...extra];
  extra.forEach((x) => drawn.add(x.id));
  if (item.number === undefined) {
    const rest = shuffle(pool().filter((x) => !winners.some((w) => w.id === x.id))).slice(0, wantCount() - winners.length);
    rest.forEach((x) => drawn.add(x.id));
    winners.push(...rest);
  }
  const l = labels(item);
  if (style() === 'wheel') { $('#wheel-result').textContent = winners.length > 1 ? winners.map((w) => labels(w).main).join('、') : `${l.main}${l.sub ? `　${l.sub}` : ''}`; sfx.coin(); }
  if (style() === 'pinball') { bgm.stop(); $('#pin-result').textContent = winners.map((w) => labels(w).main).join('、'); }
  const r = $('.stage').getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + 120, 60);
  drawBtn.innerHTML = ti('fa-rotate-right', 'lot.again');
  drawBtn.classList.replace('btn-yellow', 'btn-primary');
  const at = new Date();
  if (item.number === undefined) {
    $('#after-draw').classList.add('show');
    renderPicks();
    winners.forEach((w) => history.unshift({ name: w.name, id: w.id, delta: null, at }));
  } else {
    history.unshift({ name: `#${item.number}`, id: '', delta: null, at });
  }
  renderHistory();
  updatePoolInfo();
  showWinModal(winners);
}

// ---------- 恭喜中獎彈窗 ----------
// 每位中獎者各一個彈窗，排成一排不重疊（依序跳出），加上彩花與煙火
function showWinModal(list) {
  $('#win-names').innerHTML = list.map((w, i) => {
    const l = labels(w);
    return `<div class="win-card" style="animation-delay:${i * 0.12}s">
      <button class="win-x" type="button" aria-label="close">×</button>
      <div class="win-title"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> ${esc(t('lot.winTitle'))}</div>
      <div class="win-name"><b>${esc(l.main)}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</div></div>`;
  }).join('');
  $('#win-modal').classList.toggle('many', list.length > 1);
  $('#win-modal').classList.remove('hidden');
  sfx.coin();
  celebrate();
  setTimeout(() => $('#win-close').focus(), 50);
}
function celebrate() {
  // 彩花：從畫面上方飄落
  const box = $('#confetti');
  const colors = ['#e52521', '#fbd000', '#2bb24c', '#5c94fc', '#ff8a1c', '#ff7ac8', '#ffffff'];
  box.innerHTML = Array.from({ length: 120 }, () => {
    const c = colors[rand(colors.length)];
    return `<i style="left:${rand(100)}%;background:${c};animation-duration:${2.2 + Math.random() * 1.8}s;animation-delay:${Math.random() * 0.6}s;--sway:${rand(120) - 60}px;--spin:${rand(720) - 360}deg;${rand(3) ? '' : 'border-radius:50%;'}"></i>`;
  }).join('');
  clearTimeout(celebrate.t);
  celebrate.t = setTimeout(() => { box.innerHTML = ''; }, 4600);
  // 煙火：在畫面各處連續綻放
  for (let k = 0; k < 6; k++) {
    setTimeout(() => burst(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.15 + Math.random() * 0.45), 50), k * 220);
  }
}
$('#win-names').addEventListener('click', (e) => {
  const x = e.target.closest('.win-x');
  if (!x) return;
  x.closest('.win-card').remove();
  if (!$('#win-names').children.length) hideWinModal();
});
function hideWinModal() { $('#win-modal').classList.add('hidden'); }
$('#win-close').addEventListener('click', hideWinModal);
$('#win-modal').addEventListener('click', (e) => { if (e.target.id === 'win-modal') hideWinModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideWinModal(); }, true);

// ---------- 抽中名單：每個人各自加 / 扣分 ----------
export function renderPickList(el, list) {
  el.innerHTML = list.map((s) => {
    const adj = S.adj[s.id] || 0;
    return `<li data-id="${esc(s.id)}"><span class="pk-name"><b>${esc(s.name)}</b> <small>${esc(s.id)}</small></span>
      <span class="pk-adj small ${adj > 0 ? 'plus' : adj < 0 ? 'minus' : 'muted'}">${esc(t('lot.adjNow', { adj: sign(adj) }))}</span>
      <button class="btn btn-small btn-green" type="button" data-give="up" title="${esc(t('lot.plus'))}"><i class="fa-solid fa-thumbs-up" aria-hidden="true"></i> +${stepValue()}</button>
      <button class="btn btn-small btn-purple" type="button" data-give="down" title="${esc(t('lot.minus'))}"><i class="fa-solid fa-thumbs-down" aria-hidden="true"></i> −${stepValue()}</button></li>`;
  }).join('');
}
function renderPicks() {
  renderPickList($('#lot-picks'), winners);
  $('#lot-all-btns').classList.toggle('hidden', winners.length < 2);
}

function updateCurBonus() {
  if (winners.length && winners[0].number === undefined) renderPicks();
}

export function popEffect(up, delta, anchor = $('.stage')) {
  const pop = $('#pop');
  if (pop.parentElement !== anchor) anchor.appendChild(pop);
  pop.className = `pop ${up ? 'up' : 'down'}`;
  pop.innerHTML = `${up ? ICONS.mushroom : ICONS.poison}<span class="delta">${sign(delta)}</span>`;
  void pop.offsetWidth;
  if (!up) { anchor.classList.add('shake-x'); setTimeout(() => anchor.classList.remove('shake-x'), 400); }
}

// 每次加扣分的分數，用「設定」裡的抽籤預設加扣分
export function stepValue() { return Math.abs(Number(S.config.step) || 1); }

// ids 不給就是這次抽中的全部人
async function give(up, ids) {
  if (!current || rolling || current.number !== undefined) return;
  const targets = ids ? winners.filter((w) => ids.includes(w.id)) : winners;
  if (!targets.length) return;
  const delta = up ? stepValue() : -stepValue();
  up ? sfx.powerUp() : sfx.gameOver();
  popEffect(up, delta);
  try {
    await adjust(targets.map((x) => x.id), { delta, note: t('lot.note') });
    for (const tg of targets) {
      const h = history.find((x) => x.id === tg.id && x.delta === null);
      if (h) h.delta = delta; else history.unshift({ name: tg.name, id: tg.id, delta, at: new Date() });
    }
    renderHistory();
    renderPicks();
    mascotSay(t(up ? 'mascot.plus' : 'mascot.minus', { name: targets.map((x) => x.name).join('、') }), { hold: 5000 });
  } catch (e) { toast(e.message, 'error'); }
}
$('#lot-picks').addEventListener('click', (e) => {
  const b = e.target.closest('[data-give]');
  if (b) give(b.dataset.give === 'up', [b.closest('li').dataset.id]);
});

// ---------- 本節課紀錄：儲存（下載 CSV）/ 重置 ----------
$('#hist-save').addEventListener('click', () => {
  if (!history.length) { toast(t('lot.noHistory')); return; }
  const pad = (n) => String(n).padStart(2, '0');
  const ts = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['時間', '學號', '姓名', '加扣分'].join(','), ...[...history].reverse().map((h) => [h.at ? ts(h.at) : '', h.id, h.name, h.delta ?? ''].map(cell).join(','))];
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${S.course.name}_本節課紀錄_${ts(new Date()).replace(/[: ]/g, '-')}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  sfx.coin();
});
$('#hist-reset').addEventListener('click', async () => {
  if (history.length && !await askConfirm(t('lot.histResetConfirm'))) return;
  history.length = 0;
  renderHistory();
  sfx.pipe();
});

function renderHistory() {
  const ul = $('#session-history');
  ul.innerHTML = history.length
    ? history.map((h) => `<li><span>${esc(h.name)} <span class="muted small">${esc(h.id)}</span></span>
      ${h.delta === null ? '<span class="muted">—</span>' : `<span class="${h.delta > 0 ? 'plus' : 'minus'}">${sign(h.delta)}</span>`}</li>`).join('')
    : `<li class="muted">${esc(t('lot.noHistory'))}</li>`;
}

// ---------- 今日缺席 ----------
function renderAbsent() {
  $('#abs-date').textContent = S.absent.date;
  $('#absent-grid').innerHTML = S.roster.map((s) => `<label><input type="checkbox" value="${esc(s.id)}" ${isAbsent(s.id) ? 'checked' : ''}> ${s.seat ? `#${esc(s.seat)} ` : ''}${esc(s.name)}</label>`).join('');
  $('#abs-status').textContent = t('abs.count', { n: S.absent.ids.length });
}
// 課堂工具箱：缺席只記今天，用來把沒來的人排除在抽籤之外
async function saveAbsent() {
  const ids = $$('#absent-grid input:checked').map((i) => i.value);
  try {
    const r = await api('/api/teacher/absent', { method: 'PUT', body: { course: S.course.code, ids } });
    S.absent = r.absent;
    renderAbsent();
    updatePoolInfo();
    if (style() === 'wheel') drawWheel();
    emit('absent');
    sfx.coin();
    toast(t('abs.saved'), 'ok');
  } catch (e) { toast(e.message, 'error'); }
}
$('#absent-grid').addEventListener('change', () => {
  S.absent.ids = $$('#absent-grid input:checked').map((i) => i.value);
  $('#abs-status').textContent = t('abs.unsaved', { n: S.absent.ids.length });
  updatePoolInfo();
  emit('absent');
  if (style() === 'wheel') drawWheel();
});
$('#abs-save').addEventListener('click', () => saveAbsent());

// ---------- 事件 ----------
drawBtn.addEventListener('click', () => (rolling ? stop() : start()));
$('#plus-btn').addEventListener('click', () => give(true));
$('#minus-btn').addEventListener('click', () => give(false));
$('#no-repeat').addEventListener('change', () => { updatePoolInfo(); if (style() === 'wheel') drawWheel(); });
$('#lot-egg').addEventListener('change', () => { updatePoolInfo(); if (style() === 'wheel') drawWheel(); if (style() === 'pinball') showPockets(); sfx.tick(); });
$('#lot-style').addEventListener('change', () => { if (rolling) abortDraw(); applyStyle(); });
$('#lot-content').addEventListener('change', () => {
  $('#num-range').classList.toggle('hidden', !isNumber());
  drawn = new Set();
  updatePoolInfo();
  if (style() === 'wheel') drawWheel();
});
['#num-min', '#num-max'].forEach((s) => $(s).addEventListener('input', () => { updatePoolInfo(); if (style() === 'wheel') drawWheel(); }));
$('#reset-pool').addEventListener('click', () => {
  if (rolling) return;
  drawn = new Set(); current = null;
  resetBlocks();
  $('#slot-main').textContent = '?'; $('#slot-sub').textContent = '';
  $('#after-draw').classList.remove('show');
  sfx.coin();
  updatePoolInfo();
  if (style() === 'wheel') drawWheel();
});
document.addEventListener('keydown', (e) => {
  if ($('[data-panel=lottery]').hidden || e.target.matches('input, textarea, select')) return;
  if (e.code === 'Space') { e.preventDefault(); drawBtn.click(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); give(true); }
  if (e.key === 'ArrowDown') { e.preventDefault(); give(false); }
});

onChange((what) => {
  if (what === 'course') {
    drawn = new Set(); history.length = 0; current = null; winners = [];
    renderHistory(); renderAbsent(); updatePoolInfo();
    $('#after-draw').classList.remove('show');
    applyStyle();
  }
  if (what === 'roster') {
    renderAbsent(); updatePoolInfo(); applyStyle();
  }
  if (what === 'adj') updateCurBonus();
});

setReel($('#reel-l'), 'star');
setReel($('#reel-r'), 'coin');
