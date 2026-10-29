// 扭蛋機、娃娃機（抓蘑菇）、撲克牌：只負責動畫，抽中誰由 lottery.js 決定；過程中一律顯示「?」
import { ICONS } from './common.js';

const COLORS = ['#e52521', '#fbd000', '#2bb24c', '#5c94fc', '#ff8a1c', '#9b30d9', '#1aa3a3', '#ff7ac8'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const capsule = (c) => `<span class="cap" style="--c:${c}"><i></i></span>`;
// 這次所有中獎者的 { main, sub }（lottery.js 傳 opts.all，最多 5 人）；抽幾人動畫就跑幾次
const many = (label, opts = {}) => (opts.all && opts.all.length ? opts.all : [label]);
// 機台下方的名牌列：每抽出一個（扭蛋、娃娃、牌…）就排上一張，顏色對應抽出的東西
function tray(root) {
  const el = document.createElement('div');
  el.className = 'ar-tray';
  root.appendChild(el);
  return {
    clear() { el.innerHTML = ''; },
    add(l = {}, c = '#fbd000', tag = '') {
      const s = document.createElement('span');
      s.className = 'ar-chip';
      s.style.setProperty('--c', c);
      s.innerHTML = `${tag ? '<i></i>' : ''}<b></b><small></small>`;
      if (tag) s.querySelector('i').textContent = tag;
      s.querySelector('b').textContent = l.main || '?';
      s.querySelector('small').textContent = l.sub || '';
      el.appendChild(s);
    },
  };
}

// ---------- 扭蛋機 ----------
// 球裡的扭蛋是真的物理：平常靠重力堆在底部，轉動旋鈕時被攪拌氣流吹得滿球亂滾、互相碰撞
const CAP_N = 14, CAP_R = 19;
export function createGacha(root) {
  root.innerHTML = `<div class="gacha">
    <div class="g-globe"></div>
    <div class="g-body">
      <div class="g-label">GACHA</div>
      <div class="g-knob"><span></span></div>
      <div class="g-chute"><div class="g-out"></div></div>
    </div>
  </div>`;
  const globe = root.querySelector('.g-globe'), knob = root.querySelector('.g-knob'), out = root.querySelector('.g-out');
  let caps = [], mixing = false, raf = 0, t = 0;
  const fill = () => {
    globe.innerHTML = Array.from({ length: CAP_N }, (_, i) => capsule(COLORS[i % COLORS.length])).join('');
    const w = globe.clientWidth || 292;
    caps = [...globe.children].map((el, i) => ({
      el, x: CAP_R + 4 + Math.random() * (w - 2 * CAP_R - 8), y: 20 + (i % 7) * 12 + Math.random() * 10,
      vx: (Math.random() - 0.5) * 2, vy: 0, rot: Math.random() * 360,
    }));
  };
  // 邊界：上半部是橢圓頂，下半部是直的、底部平
  function bound(c, w, h) {
    const cx = w / 2, cy = h * 0.6, rx = w / 2 - CAP_R - 2, ry = h * 0.6 - CAP_R - 2;
    if (c.x < CAP_R + 2) { c.x = CAP_R + 2; c.vx = Math.abs(c.vx) * 0.6; }
    if (c.x > w - CAP_R - 2) { c.x = w - CAP_R - 2; c.vx = -Math.abs(c.vx) * 0.6; }
    if (c.y > h - CAP_R - 2) { c.y = h - CAP_R - 2; c.vy = -Math.abs(c.vy) * 0.45; c.vx *= 0.92; }
    if (c.y < cy) {
      const dx = (c.x - cx) / rx, dy = (c.y - cy) / ry, d = Math.hypot(dx, dy);
      if (d > 1) {
        c.x = cx + (dx / d) * rx; c.y = cy + (dy / d) * ry;
        const nx = dx / d / rx, ny = dy / d / ry, nl = Math.hypot(nx, ny), ux = nx / nl, uy = ny / nl;
        const dot = c.vx * ux + c.vy * uy;
        if (dot > 0) { c.vx -= 1.6 * dot * ux; c.vy -= 1.6 * dot * uy; }
      }
    }
  }
  function tick() {
    raf = 0;
    if (!globe.isConnected || !globe.offsetParent) return; // 看不到就不算
    const w = globe.clientWidth, h = globe.clientHeight, cx = w / 2, cy = h * 0.55;
    t++;
    let energy = 0;
    for (const c of caps) {
      c.vy += 0.45; // 重力
      if (mixing) {
        // 底部往上吹的氣流＋繞中心旋轉
        if (c.y > h * 0.55) c.vy -= 0.9 + Math.random() * 0.9;
        const dx = c.x - cx, dy = c.y - cy;
        c.vx += -dy * 0.006 + (Math.random() - 0.5) * 0.9;
        c.vy += dx * 0.006;
      }
      c.vx *= 0.99; c.vy *= 0.99;
      const sp = Math.hypot(c.vx, c.vy);
      if (sp > 13) { c.vx *= 13 / sp; c.vy *= 13 / sp; }
      c.x += c.vx; c.y += c.vy;
      bound(c, w, h);
    }
    // 扭蛋互撞
    for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) {
      const a = caps[i], b = caps[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = CAP_R * 2;
      if (d < min && d > 0) {
        const nx = dx / d, ny = dy / d, push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { const k = rel * 0.9; a.vx += k * nx; a.vy += k * ny; b.vx -= k * nx; b.vy -= k * ny; }
      }
    }
    for (const c of caps) {
      bound(c, w, h);
      c.rot += c.vx * 3; // 滾動
      energy += Math.abs(c.vx) + Math.abs(c.vy);
      c.el.style.transform = `translate(${c.x - CAP_R}px, ${c.y - CAP_R}px) rotate(${c.rot}deg)`;
    }
    // 靜止下來就停止計算，省電
    if (mixing || energy > caps.length * 0.12 || t < 30) raf = requestAnimationFrame(tick);
  }
  const wake = () => { if (!raf) { t = 0; raf = requestAnimationFrame(tick); } };
  fill();
  new ResizeObserver(wake).observe(globe);
  const got = tray(root.querySelector('.gacha'));
  return {
    reset() { cancelAnimationFrame(raf); raf = 0; out.innerHTML = ''; got.clear(); mixing = false; knob.classList.remove('spin'); fill(); wake(); },
    start() { out.innerHTML = ''; got.clear(); if (caps.length < 4) fill(); mixing = true; knob.classList.add('spin'); wake(); },
    // 停下：抽幾人就轉幾次旋鈕，每次最底下那顆從出口掉出來、打開 → done()
    async stop(done, label = {}, opts = {}) {
      const all = many(label, opts);
      knob.classList.remove('spin');
      mixing = false; wake();
      for (let k = 0; k < all.length; k++) {
        if (caps.length < 2) fill();
        knob.classList.remove('turn'); void knob.offsetWidth; knob.classList.add('turn');
        await wait(k ? 380 : 500);
        knob.classList.remove('turn');
        const low = caps.reduce((m, c) => (c.y > m.y ? c : m), caps[0]);
        const color = low ? low.el.style.getPropertyValue('--c') : COLORS[0];
        if (low) { low.el.remove(); caps = caps.filter((c) => c !== low); wake(); }
        out.innerHTML = `<div class="g-drop">${capsule(color)}</div>`;
        await wait(700);
        out.querySelector('.cap').classList.add('open');
        await wait(k < all.length - 1 ? 300 : 450);
        got.add(all[k], color);
      }
      done();
    },
  };
}

// ---------- 娃娃機：抓蘑菇 ----------
export function createClaw(root) {
  // 獎品：文具與教具（書、鉛筆、蘋果、尺、計算機、地球儀…），每次排列都不一樣
  const PRIZES = ['book', 'pencil', 'apple', 'ruler', 'calc', 'globe', 'flask', 'palette'];
  const pick = () => PRIZES[Math.floor(Math.random() * PRIZES.length)];
  const prizes = Array.from({ length: 9 }, (_, i) => `<div class="prize" style="left:${15 + i * 9.4}%">${ICONS[pick()]}</div>`).join('');
  root.innerHTML = `<div class="claw-box">
    <div class="claw-top"></div>
    <div class="claw" style="left:50%"><div class="claw-cable"></div><div class="claw-head"><i class="l"></i><i class="r"></i></div></div>
    <div class="prizes">${prizes}</div>
    <div class="claw-chute"><span>⬇</span></div>
  </div>`;
  const box = root.querySelector('.claw-box'), claw = root.querySelector('.claw'), cable = root.querySelector('.claw-cable');
  let x = 50, dir = 1, raf = 0, moving = false;
  const got = tray(root);
  const loop = () => {
    x += dir * 0.9;
    if (x > 92) dir = -1;
    if (x < 18) dir = 1;
    claw.style.left = `${x}%`;
    raf = requestAnimationFrame(loop);
  };
  return {
    reset() {
      cancelAnimationFrame(raf); moving = false;
      got.clear(); box.classList.remove('quick');
      claw.classList.remove('grab'); cable.style.height = '';
      root.querySelectorAll('.prize').forEach((p) => {
        // 夾走的那個補一個新的獎品
        if (p.classList.contains('won')) p.innerHTML = ICONS[pick()];
        p.classList.remove('held', 'won'); p.style.transform = ''; p.style.transition = '';
      });
    },
    start() { this.reset(); claw.style.transition = 'none'; moving = true; loop(); },
    // 停下：抽幾人就夾幾次；每次爪子下降、夾住娃娃、升起、移到出口放下 → done()
    // 第一個夾正下方的娃娃，之後隨機挑還沒被夾走的；夾 3 個以上整體加快
    async stop(done, label = {}, opts = {}) {
      cancelAnimationFrame(raf); moving = false;
      const all = many(label, opts);
      const f = all.length > 2 ? 0.65 : 1, ms = (n) => Math.round(n * f);
      box.classList.toggle('quick', f < 1);
      const bw = box.clientWidth;
      for (let k = 0; k < all.length; k++) {
        const ps = [...root.querySelectorAll('.prize:not(.won)')];
        const near = (p) => Math.abs(p.offsetLeft + p.offsetWidth / 2 - (x / 100) * bw);
        const target = k === 0 ? ps.reduce((a, p) => (near(p) < near(a) ? p : a)) : ps[Math.floor(Math.random() * ps.length)];
        // 先對準娃娃
        claw.style.transition = `left ${k ? ms(600) : 350}ms ease`;
        x = ((target.offsetLeft + target.offsetWidth / 2) / bw) * 100;
        claw.style.left = `${x}%`;
        await wait(k ? ms(630) : 380);
        // 爪子要下降的距離：娃娃頂端到爪子底部（用畫面座標，娃娃在 .prizes 裡面）
        const drop = target.getBoundingClientRect().top - claw.getBoundingClientRect().bottom + 14;
        cable.style.height = `${Math.max(20, drop)}px`;
        await wait(ms(750));
        claw.classList.add('grab');
        await wait(ms(300));
        target.classList.add('held');
        cable.style.height = '';
        target.style.transform = `translateY(${-Math.max(20, drop) + 10}px)`;
        await wait(ms(750));
        // 移到左邊出口
        const dx = (0.06 * bw) - (target.offsetLeft + target.offsetWidth / 2);
        target.style.setProperty('--dx', `${dx}px`);
        claw.style.transition = `left ${ms(800)}ms ease`;
        claw.style.left = '8%';
        x = 8;
        target.style.transition = `transform ${ms(800)}ms ease`;
        target.style.transform = `translate(${dx}px, ${-Math.max(20, drop) + 10}px)`;
        await wait(ms(850));
        claw.classList.remove('grab');
        target.classList.add('won');
        got.add(all[k], COLORS[k % COLORS.length]);
        await wait(ms(450));
      }
      done();
    },
    get moving() { return moving; },
  };
}

// ---------- 撲克牌 ----------
// 牌面朝下洗牌；停下時抽出一張翻開（牌面花色隨機），名字在彈窗揭曉
const SUITS = [['♠', '#111'], ['♥', '#e52521'], ['♦', '#e52521'], ['♣', '#111']];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
// 數字牌：幾點就排幾個花色（位置照一般撲克牌，下半部的花色倒過來）；[x%, y%]
const L = 30, M = 50, R = 70;
const PIPS = {
  2: [[M, 18], [M, 82]],
  3: [[M, 18], [M, 50], [M, 82]],
  4: [[L, 18], [R, 18], [L, 82], [R, 82]],
  5: [[L, 18], [R, 18], [M, 50], [L, 82], [R, 82]],
  6: [[L, 18], [R, 18], [L, 50], [R, 50], [L, 82], [R, 82]],
  7: [[L, 18], [R, 18], [M, 34], [L, 50], [R, 50], [L, 82], [R, 82]],
  8: [[L, 18], [R, 18], [M, 34], [L, 50], [R, 50], [M, 66], [L, 82], [R, 82]],
  9: [[L, 18], [R, 18], [L, 39], [R, 39], [M, 50], [L, 61], [R, 61], [L, 82], [R, 82]],
  10: [[L, 18], [R, 18], [M, 29], [L, 39], [R, 39], [L, 61], [R, 61], [M, 71], [L, 82], [R, 82]],
};
function cardFace(rank, suit, color) {
  const corner = (cls) => `<span class="pc-corner ${cls}" style="color:${color}">${rank}<br>${suit}</span>`;
  let mid;
  if (rank === 'A') mid = `<span class="pc-ace" style="color:${color}">${suit}</span>`;
  else if (PIPS[rank]) mid = PIPS[rank].map(([x, y]) => `<span class="pc-pip${y > 50 ? ' flip' : ''}" style="left:${x}%;top:${y}%;color:${color}">${suit}</span>`).join('');
  // J、Q、K：框起來的人頭牌，中間是皇冠和大字母
  else mid = `<span class="pc-court" style="color:${color};border-color:${color}"><i>${{ J: '⚔', Q: '♛', K: '♚' }[rank]}</i><b>${rank}</b><i>${suit}</i></span>`;
  return `${corner('tl')}${mid}${corner('br')}`;
}
export function createCards(root, n = 9) {
  root.innerHTML = `<div class="cards">${Array.from({ length: n }, () => '<div class="pcard"><div class="pc-in"><div class="pc-back"></div><div class="pc-face"></div></div></div>').join('')}</div>`;
  const cards = [...root.querySelectorAll('.pcard')], deck = root.querySelector('.cards');
  const got = tray(root);
  let timer = 0;
  const layout = (order) => order.forEach((c, i) => {
    const mid = (n - 1) / 2;
    c.style.setProperty('--x', `${(i - mid) * 11}%`);
    c.style.setProperty('--rot', `${(i - mid) * 5}deg`);
    c.style.zIndex = i;
  });
  layout(cards);
  return {
    reset() { clearInterval(timer); deck.classList.remove('multi'); got.clear(); cards.forEach((c) => { c.classList.remove('pick', 'flip', 'dim'); c.style.removeProperty('--px'); }); layout(cards); },
    start() {
      this.reset();
      deck.classList.add('shuffling');
      timer = setInterval(() => layout([...cards].sort(() => Math.random() - 0.5)), 160);
    },
    // 抽幾人就抽出幾張牌，一張張翻開；多張時排成一列
    async stop(done, label = {}, opts = {}) {
      clearInterval(timer);
      deck.classList.remove('shuffling');
      layout(cards);
      await wait(250);
      const all = many(label, opts);
      const picks = [...cards].sort(() => Math.random() - 0.5).slice(0, all.length);
      cards.forEach((x) => x.classList.add('dim'));
      deck.classList.toggle('multi', picks.length > 1);
      // 多張牌時每張的水平位置（不超出牌桌，太擠就疊一點）
      const cw = picks[0].offsetWidth, gap = picks.length > 1 ? Math.min(cw * 1.08, (deck.clientWidth - cw) / (picks.length - 1)) : 0;
      for (let k = 0; k < picks.length; k++) {
        const c = picks[k];
        const [suit, color] = SUITS[Math.floor(Math.random() * 4)];
        const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
        c.querySelector('.pc-face').innerHTML = cardFace(rank, suit, color);
        c.style.setProperty('--px', `${(k - (picks.length - 1) / 2) * gap}px`);
        c.style.zIndex = 50 + k;
        c.classList.remove('dim');
        c.classList.add('pick');
        await wait(k ? 300 : 450);
        c.classList.add('flip');
        got.add(all[k], color === '#111' ? '#5c94fc' : color, `${rank}${suit}`);
        await wait(k < picks.length - 1 ? 250 : 650);
      }
      done();
    },
  };
}

// ---------- 刮刮樂 ----------
// 開始：卡片抖動、銀漆重新蓋上；停下：自動刮開銀漆露出名字（也可以用滑鼠 / 手指一起刮）
export function createScratch(root) {
  root.innerHTML = `<div class="scratch">
    <div class="sc-card">
      <div class="sc-title"><span>★</span> SCRATCH &amp; WIN <span>★</span></div>
      <div class="sc-area">
        <div class="sc-prize"><b class="sc-main">?</b><span class="sc-sub"></span><div class="sc-rows"></div></div>
        <canvas class="sc-foil"></canvas>
      </div>
      <div class="sc-coins">${'<i></i>'.repeat(5)}</div>
    </div>
  </div>`;
  const card = root.querySelector('.sc-card'), area = root.querySelector('.sc-area'), cv = root.querySelector('.sc-foil');
  const main = root.querySelector('.sc-main'), sub = root.querySelector('.sc-sub');
  const prize = root.querySelector('.sc-prize'), rows = root.querySelector('.sc-rows');
  // 抽多人：一張卡上開幾個刮獎格，每格一個人
  const setRows = (all) => {
    const multi = all.length > 1;
    prize.classList.toggle('multi', multi);
    area.classList.toggle('multi', multi);
    area.style.setProperty('--n', all.length);
    rows.innerHTML = multi ? all.map(() => '<div class="sc-row"><b></b><small></small></div>').join('') : '';
    if (multi) [...rows.children].forEach((r, k) => { r.querySelector('b').textContent = all[k].main || '?'; r.querySelector('small').textContent = all[k].sub || ''; });
  };
  const ctx = cv.getContext('2d');
  let raf = 0, live = false, watch = 0;
  const paint = () => {
    const r = area.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
    grid = { w: r.width, h: r.height, cells: new Uint8Array(GX * GY) };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, 0, r.width, r.height);
    g.addColorStop(0, '#9fa3ad'); g.addColorStop(0.5, '#e3e5ea'); g.addColorStop(1, '#8b8f99');
    ctx.fillStyle = g; ctx.fillRect(0, 0, r.width, r.height);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let y = 18, row = 0; y < r.height; y += 34, row++) for (let x = 20 + (row % 2) * 22; x < r.width; x += 44) ctx.fillText('?', x, y);
    cv.style.opacity = '1';
    return r;
  };
  // 刮開的面積用一張粗格子記錄（不讀畫布像素，背景分頁也準）
  const GX = 24, GY = 10;
  let grid = null;
  const scratchAt = (x, y, rad = 18) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    if (!grid) return;
    const cw = grid.w / GX, ch = grid.h / GY;
    for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
      if (Math.hypot((gx + 0.5) * cw - x, (gy + 0.5) * ch - y) <= rad) grid.cells[gy * GX + gx] = 1;
    }
  };
  const cleared = () => (grid ? grid.cells.reduce((a, v) => a + v, 0) / grid.cells.length : 0);
  // 手動刮
  let down = false;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => { if (!live) return; down = true; cv.setPointerCapture(e.pointerId); scratchAt(...pos(e)); });
  cv.addEventListener('pointermove', (e) => { if (down && live) scratchAt(...pos(e)); });
  cv.addEventListener('pointerup', () => { down = false; });
  return {
    reset() { cancelAnimationFrame(raf); clearInterval(watch); card.querySelector('.sc-self')?.remove(); live = false; card.classList.remove('shake', 'won'); main.textContent = '?'; sub.textContent = ''; setRows([]); paint(); },
    start() { this.reset(); card.classList.add('shake'); },
    // opts.self：自己刮（刮開超過一半自動揭曉，或按「一鍵刮開」）；否則自動刮開
    async stop(done, label = {}, opts = {}) {
      card.classList.remove('shake');
      main.textContent = label.main || '?';
      sub.textContent = label.sub || '';
      setRows(many(label, opts));
      const r = paint();
      live = true;
      if (opts.self) {
        const bar = document.createElement('div');
        bar.className = 'sc-self';
        bar.innerHTML = `<span>${opts.hint || ''}</span><button type="button" class="btn btn-small btn-yellow">${opts.allLabel || 'OK'}</button>`;
        card.appendChild(bar);
        let finished = false;
        const reveal = async () => {
          if (finished) return;
          finished = true;
          clearInterval(watch);
          bar.remove();
          cv.style.opacity = '0';
          card.classList.add('won');
          await wait(350);
          live = false;
          done();
        };
        // 每 0.25 秒看刮掉多少，超過一半就揭曉
        watch = setInterval(() => {
          if (cleared() > 0.55) reveal();
        }, 250);
        bar.querySelector('button').addEventListener('click', async () => {
          bar.querySelector('button').disabled = true;
          await autoScratch(r, 700);
          reveal();
        });
        return;
      }
      await autoScratch(r, 1600);
      cv.style.opacity = '0';
      card.classList.add('won');
      await wait(350);
      live = false;
      done();
    },
  };
  // 一行一行來回刮開
  function autoScratch(r, dur) {
    const rows = Math.max(3, Math.ceil(r.height / 26)), t0 = performance.now();
    return new Promise((res) => {
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur), n = p * rows;
        for (let k = 0; k <= Math.min(rows - 1, Math.floor(n)); k++) {
          const f = k === Math.floor(n) ? n - k : 1;
          const y = (k + 0.5) * (r.height / rows);
          const xa = k % 2 ? r.width * (1 - f) : 0, xb = k % 2 ? r.width : r.width * f;
          for (let x = xa; x <= xb; x += 8) scratchAt(x, y + Math.sin(x / 9) * 6, 20);
        }
        if (p < 1) raf = requestAnimationFrame(step); else res();
      };
      raf = requestAnimationFrame(step);
    });
  }
}

// ---------- 射飛鏢 ----------
// 開始：鏢靶轉動、準星在靶上晃；停下：飛鏢射向準星，射中的那一格就是中獎者（格子上一律是「?」）
const DART_N = 12;
export function createDarts(root) {
  const seg = (i) => {
    const a0 = (i / DART_N) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / DART_N) * Math.PI * 2 - Math.PI / 2;
    const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
    const wedge = (r0, r1) => `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`;
    const am = (a0 + a1) / 2, odd = i % 2;
    return `<g class="dt-seg" data-i="${i}">
      <path class="dt-in" d="${wedge(16, 78)}" fill="${odd ? '#111' : '#f3e6c2'}"/>
      <path class="dt-ring" d="${wedge(78, 96)}" fill="${odd ? '#2bb24c' : '#e52521'}"/>
      <text x="${(58 * Math.cos(am)).toFixed(1)}" y="${(58 * Math.sin(am)).toFixed(1)}" fill="${odd ? '#fbd000' : '#7a2e06'}">?</text></g>`;
  };
  root.innerHTML = `<div class="darts">
    <div class="dt-board">
      <svg viewBox="-110 -110 220 220" aria-hidden="true"><circle r="106" fill="#111"/><g class="dt-rot">${Array.from({ length: DART_N }, (_, i) => seg(i)).join('')}
        <circle r="16" fill="#2bb24c" stroke="#111" stroke-width="2"/><circle r="7" fill="#e52521"/></g></svg>
      <div class="dt-aim"></div>
      <div class="dt-dart"><i></i></div>
    </div>
    <div class="dt-result"></div>
  </div>`;
  const rot = root.querySelector('.dt-rot'), aim = root.querySelector('.dt-aim'), dart = root.querySelector('.dt-dart'), result = root.querySelector('.dt-result');
  let raf = 0, ang = 0, tt = Math.random() * 10, ax = 50, ay = 50;
  const draw = () => { rot.setAttribute('transform', `rotate(${ang.toFixed(2)})`); aim.style.left = `${ax}%`; aim.style.top = `${ay}%`; };
  const loop1 = (turn = true) => {
    if (turn) ang = (ang + 1.6) % 360;
    tt += 0.035;
    // 準星繞著靶晃動（手抖的感覺），範圍不超出靶面
    ax = 50 + 30 * Math.sin(1.3 * tt) + 4 * Math.sin(5.1 * tt);
    ay = 50 + 30 * Math.sin(1.7 * tt + 1) + 4 * Math.cos(4.3 * tt);
    draw();
  };
  const loop = () => { loop1(); raf = requestAnimationFrame(loop); };
  const resetDart = () => { dart.classList.remove('fly', 'stuck'); dart.style.cssText = ''; };
  return {
    reset() {
      cancelAnimationFrame(raf); resetDart(); root.querySelectorAll('.dt-dart.stay').forEach((d) => d.remove()); result.textContent = '';
      root.querySelectorAll('.dt-seg.hit').forEach((g) => { g.classList.remove('hit'); g.querySelector('text').textContent = '?'; });
      aim.classList.remove('hide'); draw();
    },
    start() { this.reset(); loop(); },
    // 抽幾人就射幾鏢：每鏢之間準星再晃一下，射中的格子插著飛鏢、標上星星
    async stop(done, label = {}, opts = {}) {
      const all = many(label, opts);
      const names = [];
      for (let k = 0; k < all.length; k++) {
        if (k) {
          // 前一鏢留在靶上，換一支新的；之後靶不再轉，插著的飛鏢才會對準射中的格子
          const stay = dart.cloneNode(true);
          stay.classList.add('stay');
          dart.before(stay);
          resetDart();
          aim.classList.remove('hide');
          await new Promise((res) => { const t0 = performance.now(); const go = (now) => { loop1(false); if (now - t0 < 650) raf = requestAnimationFrame(go); else res(); }; raf = requestAnimationFrame(go); });
        }
        cancelAnimationFrame(raf);
        aim.classList.add('hide');
        // 飛鏢從下方飛向準星
        dart.style.left = `${ax}%`; dart.style.top = `${ay}%`;
        void dart.offsetWidth;
        dart.classList.add('fly');
        // 靶在飛鏢飛行時繼續轉一點點再停
        const t0 = performance.now();
        await new Promise((res) => {
          const spin = (now) => { const q = Math.min(1, (now - t0) / 420); if (!k) ang = (ang + 1.6 * (1 - q)) % 360; draw(); if (q < 1) raf = requestAnimationFrame(spin); else res(); };
          raf = requestAnimationFrame(spin);
        });
        dart.classList.add('stuck');
        // 射中哪一格：準星相對靶心的角度，扣掉靶轉過的角度
        const dx = ax - 50, dy = ay - 50;
        let a = (Math.atan2(dy, dx) * 180) / Math.PI + 90 - ang;
        a = ((a % 360) + 360) % 360;
        const g = root.querySelector(`.dt-seg[data-i="${Math.floor(a / (360 / DART_N)) % DART_N}"]`);
        g.classList.add('hit');
        g.querySelector('text').textContent = '★';
        names.push(`${all[k].main || '?'}${all.length === 1 && all[k].sub ? `　${all[k].sub}` : ''}`);
        result.textContent = `🎯 ${names.join('、')}`;
        await wait(k < all.length - 1 ? 350 : 650);
      }
      done();
    },
  };
}

// ---------- 一番賞 ----------
// 籤箱裡一排折起來的籤；開始時在籤之間亂跳，停下時抽幾人就抽出幾張籤、一張張撕開，露出賞別與名字
// （抽過的籤留在箱裡反灰，抽完自動補滿）
const TIERS = [['A', '#e52521', 1], ['B', '#ff8a1c', 2], ['C', '#c9a400', 3], ['D', '#2bb24c', 5], ['E', '#1f6fe5', 6], ['F', '#9b30d9', 8]];
export function createKuji(root, n = 24) {
  root.innerHTML = `<div class="kuji">
    <div class="kj-board">${TIERS.map(([l, c]) => `<span class="kj-tier" style="--c:${c}">${l}賞</span>`).join('')}<span class="kj-tier last">LAST ONE</span></div>
    <div class="kj-box">${Array.from({ length: n }, (_, i) => `<div class="kj-t" style="--c:${COLORS[i % COLORS.length]}"><i></i></div>`).join('')}</div>
    <div class="kj-open hidden"><button type="button" class="kj-x" aria-label="close" title="close">×</button><div class="kj-papers"></div></div>
  </div>`;
  const ts = [...root.querySelectorAll('.kj-t')], open = root.querySelector('.kj-open'), papers = root.querySelector('.kj-papers');
  let timer = 0, at = -1;
  const close = () => { open.classList.add('hidden'); papers.innerHTML = ''; };
  // 叉叉或點旁邊的暗處就關掉籤紙
  open.addEventListener('click', (e) => { if (e.target === open || e.target === papers || e.target.closest('.kj-x')) close(); });
  const left = () => ts.filter((x) => !x.classList.contains('used'));
  const hop = () => {
    const l = left();
    ts.forEach((x) => x.classList.remove('hov'));
    let next = l[Math.floor(Math.random() * l.length)];
    if (l.length > 1 && ts.indexOf(next) === at) next = l[(l.indexOf(next) + 1) % l.length];
    at = ts.indexOf(next);
    next.classList.add('hov');
  };
  // 賞別依權重隨機；箱裡最後一張是 LAST ONE 賞
  const tier = (isLast) => {
    if (isLast) return ['LAST ONE', '#111'];
    let r = Math.random() * TIERS.reduce((a, x) => a + x[2], 0);
    for (const [l, c, w] of TIERS) if ((r -= w) < 0) return [`${l}賞`, c];
    return ['F賞', '#9b30d9'];
  };
  return {
    reset() { clearInterval(timer); ts.forEach((x) => x.classList.remove('hov', 'pick')); close(); },
    start() {
      this.reset();
      if (!left().length) ts.forEach((x) => x.classList.remove('used'));
      hop();
      timer = setInterval(hop, 110);
    },
    // opts.all：這次所有中獎者的 { main, sub }；抽幾人就抽幾張
    async stop(done, label = {}, opts = {}) {
      clearInterval(timer);
      ts.forEach((x) => x.classList.remove('hov'));
      const all = opts.all && opts.all.length ? opts.all : [label];
      const got = [];
      for (let k = 0; k < all.length; k++) {
        if (!left().length) ts.forEach((x) => x.classList.remove('used')); // 箱子抽空了就補滿
        const l = left();
        const tk = k === 0 && ts[at] && !ts[at].classList.contains('used') ? ts[at] : l[Math.floor(Math.random() * l.length)];
        const isLast = l.length === 1;
        tk.classList.add('pick');
        await wait(k === 0 ? 500 : Math.max(90, 260 - all.length * 8));
        tk.classList.remove('pick');
        tk.classList.add('used');
        got.push({ c: tk.style.getPropertyValue('--c'), t: tier(isLast), l: all[k] });
      }
      papers.classList.toggle('many', got.length > 1);
      papers.classList.toggle('lots', got.length > 6);
      papers.innerHTML = got.map(({ c, t: [name, color], l }, k) => `<div class="kj-paper" style="--c:${c};--k:${k}">
        <div class="kj-half l"></div><div class="kj-half r"></div>
        <div class="kj-res"><b class="kj-tierbig" style="color:${color}"></b><span class="kj-main"></span><span class="kj-sub"></span></div></div>`).join('');
      [...papers.children].forEach((p, k) => {
        p.querySelector('.kj-tierbig').textContent = got[k].t[0];
        p.querySelector('.kj-main').textContent = got[k].l.main || '?';
        p.querySelector('.kj-sub').textContent = got[k].l.sub || '';
      });
      open.classList.remove('hidden');
      await wait(450);
      // 一張一張撕開
      const step = got.length > 1 ? Math.max(80, 320 - got.length * 10) : 0;
      for (const p of papers.children) { p.classList.add('torn'); if (step) await wait(step); }
      await wait(700);
      done();
    },
  };
}

// ---------- 賓果 ----------
// 5×5 賓果卡；搖號時號碼球一直跳，卡上慢慢蓋章，按停止時補滿一整條線 → BINGO!
const BINGO_LINES = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
];
export function createBingo(root) {
  root.innerHTML = `<div class="bingo">
    <div class="bg-top"><div class="bg-ball"><span>?</span></div><div class="bg-banner"></div></div>
    <div class="bg-card">
      <div class="bg-head">${[...'BINGO'].map((c) => `<b>${c}</b>`).join('')}</div>
      <div class="bg-grid"></div>
    </div>
  </div>`;
  const grid = root.querySelector('.bg-grid'), ball = root.querySelector('.bg-ball'), num = ball.querySelector('span'), banner = root.querySelector('.bg-banner');
  let nums = [], cells = [], timers = [], line = [], live = false;
  const letter = (i) => 'BINGO'[i % 5];
  const clearT = () => { timers.forEach(clearTimeout); timers.forEach(clearInterval); timers = []; };
  function deal() {
    // 每一欄的號碼範圍：B 1–15、I 16–30、N 31–45、G 46–60、O 61–75
    const col = (c) => [...Array(15)].map((_, k) => c * 15 + k + 1).sort(() => Math.random() - 0.5).slice(0, 5);
    const cols = [0, 1, 2, 3, 4].map(col);
    nums = [...Array(25)].map((_, i) => cols[i % 5][Math.floor(i / 5)]);
    grid.querySelectorAll('.bg-strike').forEach((x) => x.remove());
    grid.innerHTML = nums.map((n, i) => `<div class="bg-cell" data-i="${i}">${n}</div>`).join(''); // 不留空白格，每格都有號碼
    cells = [...grid.children];
  }
  const stamp = (i) => {
    cells[i].classList.add('mark', 'pop');
    setTimeout(() => cells[i].classList.remove('pop'), 300);
    num.textContent = `${letter(i)}${nums[i]}`; ball.classList.remove('roll'); void ball.offsetWidth; ball.classList.add('roll');
  };
  deal();
  return {
    reset() { clearT(); live = false; banner.textContent = ''; root.querySelector('.bingo').classList.remove('win'); num.textContent = '?'; deal(); },
    start() {
      this.reset();
      live = true;
      line = BINGO_LINES[Math.floor(Math.random() * BINGO_LINES.length)];
      // 先蓋這條線上的 3 格，再加幾格不相干的
      const todo = [...line].sort(() => Math.random() - 0.5).slice(0, 3);
      const decoy = [...Array(25).keys()].filter((i) => !line.includes(i)).sort(() => Math.random() - 0.5).slice(0, 4);
      const order = [...todo, ...decoy].sort(() => Math.random() - 0.5);
      // 號碼球亂跳
      timers.push(setInterval(() => { if (live) num.textContent = `${'BINGO'[Math.floor(Math.random() * 5)]}${1 + Math.floor(Math.random() * 75)}`; }, 90));
      order.forEach((i, k) => timers.push(setTimeout(() => stamp(i), 700 + k * 650)));
    },
    // 抽幾人就連成幾條線，每條線一個人
    async stop(done, label = {}, opts = {}) {
      clearT();
      live = false;
      const all = many(label, opts);
      const lines = [line, ...BINGO_LINES.filter((x) => x !== line).sort(() => Math.random() - 0.5)].slice(0, all.length);
      const names = [];
      for (let k = 0; k < lines.length; k++) {
        // 把那條線剩下的格子一格一格補滿
        for (const i of lines[k]) {
          if (cells[i].classList.contains('mark')) continue;
          stamp(i);
          await wait(k ? 260 : 380);
        }
        strikeLine(lines[k], k);
        root.querySelector('.bingo').classList.remove('win');
        void grid.offsetWidth;
        root.querySelector('.bingo').classList.add('win');
        names.push(all[k].main || '?');
        banner.textContent = `${all.length > 1 ? `BINGO ×${k + 1}` : 'BINGO!'} ${names.join('、')}`;
        await wait(k < lines.length - 1 ? 450 : 900);
      }
      done();
    },
  };
  // 連成一線：從頭到尾畫一條線（多條線換顏色）
  function strikeLine(ln, k) {
    const g = grid.getBoundingClientRect(), a = cells[ln[0]].getBoundingClientRect(), z = cells[ln[4]].getBoundingClientRect();
    const x1 = a.left + a.width / 2 - g.left, y1 = a.top + a.height / 2 - g.top, x2 = z.left + z.width / 2 - g.left, y2 = z.top + z.height / 2 - g.top;
    const pad = a.width * 0.42, len = Math.hypot(x2 - x1, y2 - y1) + pad * 2, ang = Math.atan2(y2 - y1, x2 - x1);
    const strike = document.createElement('div');
    strike.className = 'bg-strike';
    strike.style.cssText = `left:${x1 - Math.cos(ang) * pad}px;top:${y1 - Math.sin(ang) * pad}px;width:${len}px;transform:rotate(${ang}rad)`;
    if (k) strike.style.background = COLORS[k % COLORS.length];
    grid.append(strike);
  }
}

// ---------- 摸彩箱 ----------
// 手伸進箱子裡攪一攪，按停止時抓出一張籤、打開來就是中獎者
export function createRaffle(root) {
  root.innerHTML = `<div class="raffle">
    <div class="rf-box"><div class="rf-hole"></div>
      <div class="rf-clip"><div class="rf-arm"><div class="rf-hand"></div><div class="rf-ticket"></div></div></div><div class="rf-papers">${Array.from({ length: 9 }, (_, i) => `<i style="--d:${-i * 0.23}s;--x:${8 + (i * 37) % 80}%;--c:${COLORS[i % COLORS.length]}"></i>`).join('')}</div>
      <div class="rf-label">摸彩箱<small>LUCKY DRAW</small></div></div>
    <div class="rf-open"><div class="rf-paper"><div class="rf-name"></div><div class="rf-sub"></div></div></div>
  </div>`;
  const box = root.querySelector('.raffle'), name = root.querySelector('.rf-name'), sub = root.querySelector('.rf-sub');
  const set = (...c) => { box.classList.remove('dig', 'pull', 'show'); c.forEach((x) => box.classList.add(x)); };
  const got = tray(root);
  return {
    reset() { set(); got.clear(); name.textContent = ''; sub.textContent = ''; },
    start() { this.reset(); void box.offsetWidth; set('dig'); },
    // 抽幾人就伸手抓幾次，每抓一張打開看完就排到下面
    async stop(done, label = {}, opts = {}) {
      const all = many(label, opts);
      for (let k = 0; k < all.length; k++) {
        if (k) { set('dig'); await wait(650); }
        set('pull');
        await wait(800);
        name.textContent = all[k].main || '?';
        sub.textContent = all[k].sub || '';
        set('pull', 'show');
        await wait(k < all.length - 1 ? 700 : 900);
        got.add(all[k], COLORS[k % COLORS.length]);
      }
      done();
    },
  };
}

// ---------- 求籤 ----------
// 搖籤筒，按停止時跳出一支籤，展開成籤詩（依權重隨機）＋中獎者
// 預設最差只到中籤（平平）；勾「包含下籤」才會抽到中下籤、下籤
const OMI_W = [1, 3, 4, 5, 3, 1]; // 上上、上、中上、中、中下、下
const OMI_C = ['#e52521', '#ff8a1c', '#c9a400', '#2bb24c', '#1f6fe5', '#555'];
export function createOmikuji(root) {
  root.innerHTML = `<div class="omi">
    <div class="om-tube"><div class="om-sticks">${Array.from({ length: 11 }, (_, i) => `<i style="--h:${70 + (i * 13) % 26}px;--r:${(i - 5) * 4}deg"></i>`).join('')}</div>
      <div class="om-body"><span>籤</span></div><div class="om-out"></div></div>
    <div class="om-paper"><div class="om-grade"></div><div class="om-name"></div><div class="om-sub"></div></div>
  </div>`;
  const box = root.querySelector('.omi'), grade = root.querySelector('.om-grade'), name = root.querySelector('.om-name'), sub = root.querySelector('.om-sub');
  const set = (...c) => { box.classList.remove('shake', 'pop', 'open'); c.forEach((x) => box.classList.add(x)); };
  const got = tray(root);
  return {
    reset() { set(); got.clear(); grade.textContent = ''; name.textContent = ''; sub.textContent = ''; },
    start() { this.reset(); void box.offsetWidth; set('shake'); },
    // 抽幾人就搖出幾支籤，每支各有籤詩等級
    async stop(done, label = {}, opts = {}) {
      const names = opts.grades && opts.grades.length === OMI_W.length ? opts.grades : ['上上籤', '上籤', '中上籤', '中籤', '中下籤', '下籤'];
      const w = opts.bad ? OMI_W : OMI_W.slice(0, 4);
      const all = many(label, opts);
      for (let k = 0; k < all.length; k++) {
        if (k) { set('shake'); await wait(600); }
        let r = Math.random() * w.reduce((a, b) => a + b, 0), g = 0;
        while ((r -= w[g]) > 0 && g < w.length - 1) g++;
        set('pop');
        await wait(750);
        grade.textContent = names[g];
        box.style.setProperty('--g', OMI_C[g]);
        name.textContent = all[k].main || '?';
        sub.textContent = all[k].sub || '';
        set('pop', 'open');
        await wait(k < all.length - 1 ? 800 : 1000);
        got.add(all[k], OMI_C[g], names[g]);
      }
      done();
    },
  };
}

// ---------- 搶答 ----------
// 一排搶答台，坐著同學頭像，搶著舉手、按鈴、喊「我要回答老師！」；按停止時「叮咚！」只有一台亮起 → 搶到的人
const BUZZ_N = 12;
// 搶答台上的同學：簡單的圓臉頭像（膚色、髮型、髮色組合），不使用任何遊戲角色
const SKIN = ['#f9d3b4', '#eec19c', '#d9a37a', '#b9805a'];
const HAIR = ['#2b2118', '#5a3a22', '#1f2a44', '#7a4a1e', '#3b3b3b'];
const avatar = (k) => {
  const skin = SKIN[k % SKIN.length], hair = HAIR[(k * 3) % HAIR.length], style = k % 4;
  const top = [
    `<path d="M10 22c0-10 6-16 14-16s14 6 14 16c-3-5-8-7-14-7s-11 2-14 7z" fill="${hair}"/>`,
    `<path d="M9 24c0-11 7-18 15-18s15 7 15 18l-3-3c-2-4-6-6-12-6s-10 2-12 6z" fill="${hair}"/><circle cx="24" cy="5" r="4" fill="${hair}"/>`,
    `<path d="M8 30c-2-15 6-24 16-24s18 9 16 24l-3-9c-2-4-7-6-13-6s-11 2-13 6z" fill="${hair}"/>`,
    `<path d="M11 20c2-8 7-12 13-12s11 4 13 12c-4-3-8-4-13-4s-9 1-13 4z" fill="${hair}"/><path d="M14 10l4-5 3 4 3-5 3 5 3-4 4 5" fill="${hair}"/>`,
  ][style];
  return `<svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true">
    <circle cx="24" cy="26" r="15" fill="${skin}"/>${top}
    <circle cx="19" cy="27" r="1.8" fill="#222"/><circle cx="29" cy="27" r="1.8" fill="#222"/>
    <path d="M19 33q5 4 10 0" stroke="#c0504d" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="15.5" cy="31" r="2" fill="#f4a3a3" opacity=".6"/><circle cx="32.5" cy="31" r="2" fill="#f4a3a3" opacity=".6"/></svg>`;
};
const FACES = Array.from({ length: 12 }, (_, k) => avatar(k));
export function createBuzzer(root, { say = ['我要回答老師！'] } = {}) {
  root.innerHTML = `<div class="buzz">
    <div class="bz-title">QUIZ!</div>
    <div class="bz-grid">${Array.from({ length: BUZZ_N }, (_, i) => `<div class="bz-pod" style="--c:${COLORS[i % COLORS.length]}">
      <div class="bz-say"></div><div class="bz-hand">✋</div><div class="bz-head"></div><div class="bz-desk"><i class="bz-btn"></i></div><div class="bz-tag"></div></div>`).join('')}</div>
    <div class="bz-result"></div>
  </div>`;
  const box = root.querySelector('.buzz'), pods = [...root.querySelectorAll('.bz-pod')], result = root.querySelector('.bz-result');
  let timer = 0;
  const clear = () => { clearInterval(timer); timer = 0; };
  // 每次冒出來都隨機換一句踴躍搶答的話
  const line = () => say[Math.floor(Math.random() * say.length)];
  // 每次重來都換一批角色
  const dressUp = () => pods.forEach((p) => { p.querySelector('.bz-head').innerHTML = FACES[Math.floor(Math.random() * FACES.length)]; });
  dressUp();
  return {
    reset() {
      clear(); box.classList.remove('live', 'done');
      pods.forEach((p) => { p.classList.remove('up', 'ring', 'win', 'talk'); p.querySelector('.bz-tag').textContent = ''; });
      result.textContent = '';
    },
    start() {
      this.reset();
      dressUp();
      box.classList.add('live');
      // 舉手、按鈴此起彼落
      timer = setInterval(() => {
        pods.forEach((p) => {
          if (Math.random() < 0.28) p.classList.toggle('up');
          p.classList.toggle('ring', Math.random() < 0.18);
          // 小小的「我要回答老師！」此起彼落
          if (Math.random() < 0.12) {
            if (!p.classList.contains('talk')) p.querySelector('.bz-say').textContent = line();
            p.classList.toggle('talk');
          }
        });
      }, 140);
    },
    async stop(done, label = {}, opts = {}) {
      clear();
      // 最後幾下慢下來
      for (let k = 0; k < 6; k++) {
        pods.forEach((p) => p.classList.toggle('ring', Math.random() < 0.2));
        await wait(120 + k * 40);
      }
      box.classList.remove('live');
      pods.forEach((p) => p.classList.remove('ring', 'up', 'talk'));
      // 抽幾人就有幾台依序「叮咚！」亮起
      const all = many(label, opts);
      const wins = [...pods].sort(() => Math.random() - 0.5).slice(0, all.length);
      box.classList.add('done');
      for (let k = 0; k < wins.length; k++) {
        const win = wins[k];
        win.querySelector('.bz-say').textContent = say[0];
        win.classList.add('up', 'ring', 'win', 'talk');
        win.querySelector('.bz-tag').textContent = all[k].main || '?';
        result.textContent = `${opts.ding || 'DING DONG!'} ${all.length > 1 ? all.slice(0, k + 1).map((l) => l.main || '?').join('、') : `${label.main || '?'}${label.sub ? `　${label.sub}` : ''}`}`;
        await wait(k < wins.length - 1 ? 420 : 900);
      }
      done();
    },
  };
}

// ---------- 拆卡包 ----------
// 卡包排成一圈轉盤：左右滑動（或按箭頭）轉到想要的那一包，點正中間那包就撕開；
// 也可以按「開始抽籤」讓轉盤狂轉，按停止時慢慢停在某一包再拆。
// 抽幾人就噴出幾張卡，一張張翻面：卡上是名字和學號，還有稀有度（N／R／SR／SSR），全部閃閃發光
// 順序要跟 lot.pack.names 對上：國語、數學、自然、社會、英語、美術、音樂、體育
const PACKS = [['book', '#1b8fd6', '#27aecb'], ['calc', '#4c6ef5', '#3fb1f8'], ['flask', '#5cc98a', '#c9d83a'], ['globe', '#27aecb', '#5cc98a'],
  ['cap', '#12303f', '#1b8fd6'], ['palette', '#f06595', '#f7a35c'], ['music', '#9b5de5', '#4c6ef5'], ['ball', '#f08c3a', '#e0a800']];
const PACK_N = PACKS.length, PACK_STEP = 360 / PACK_N;
const RARITY = [['N', 40], ['R', 32], ['SR', 20], ['SSR', 8]];
const rarity = () => { let r = Math.random() * 100; for (const [k, w] of RARITY) if ((r -= w) < 0) return k; return 'N'; };
export function createPack(root, { names = [], hint = '', onPick, onTick } = {}) {
  root.innerHTML = `<div class="pack">
    <div class="pk-stage"><div class="pk-ring">${PACKS.map(([ic, c1, c2], i) => `<button type="button" class="pk" data-i="${i}" style="--c1:${c1};--c2:${c2};--d:${i * -0.3}s">
      <span class="pk-body"><span class="pk-top"></span><span class="pk-foil"></span><span class="pk-art">${ICONS[ic]}</span><b class="pk-title"></b><small>CLASS CARDS</small></span></button>`).join('')}</div></div>
    <div class="pk-nav"><button type="button" class="btn btn-small pk-prev" aria-label="previous">◀</button><p class="pk-hint"></p><button type="button" class="btn btn-small pk-next" aria-label="next">▶</button></div>
    <div class="pk-open hidden"><button type="button" class="kj-x pk-x" aria-label="close" title="close">×</button><div class="pk-cards"></div></div>
  </div>`;
  const box = root.querySelector('.pack'), stage = root.querySelector('.pk-stage'), ring = root.querySelector('.pk-ring');
  const packs = [...root.querySelectorAll('.pk')], open = root.querySelector('.pk-open'), cards = root.querySelector('.pk-cards');
  packs.forEach((p, i) => { p.querySelector('.pk-title').textContent = names[i % (names.length || 1)] || ''; });
  root.querySelector('.pk-hint').textContent = hint;

  let rot = 0, raf = 0, busy = false, spinning = false, vel = 0, lastFront = -1;
  const mod = (x, n) => ((x % n) + n) % n;
  const frontIdx = () => mod(Math.round(rot / PACK_STEP), PACK_N);
  // 依目前角度擺好每一包；越靠後面越暗
  function render() {
    const w = packs[0].offsetWidth || 118;
    const R = Math.round(w * 1.75);
    ring.style.transform = `translateZ(${-R}px) rotateY(${-rot}deg)`;
    const f = frontIdx();
    packs.forEach((p, i) => {
      const a = i * PACK_STEP;
      p.style.transform = `rotateY(${a}deg) translateZ(${R}px)`;
      const cos = Math.cos(((a - rot) * Math.PI) / 180);
      p.style.opacity = String(0.3 + 0.7 * ((cos + 1) / 2));
      p.classList.toggle('front', i === f);
    });
    if (f !== lastFront) { if (lastFront >= 0 && onTick) onTick(); lastFront = f; }
  }
  // 平滑轉到某個角度
  function tween(to, ms = 450) {
    cancelAnimationFrame(raf);
    const from = rot, t0 = performance.now();
    return new Promise((res) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        rot = from + (to - from) * (1 - (1 - k) ** 3);
        render();
        if (k < 1) raf = requestAnimationFrame(step); else res();
      };
      raf = requestAnimationFrame(step);
    });
  }
  // 轉到第 i 包（走最近的方向）
  const goTo = (i) => { let d = mod(i * PACK_STEP - rot, 360); if (d > 180) d -= 360; return tween(rot + d); };
  const snap = () => tween(Math.round(rot / PACK_STEP) * PACK_STEP, 300);
  const turn = (dir) => { if (!busy && !spinning) tween(Math.round(rot / PACK_STEP) * PACK_STEP + dir * PACK_STEP, 320); };
  root.querySelector('.pk-prev').addEventListener('click', () => turn(-1));
  root.querySelector('.pk-next').addEventListener('click', () => turn(1));

  // 拖曳／滑動轉盤；沒怎麼移動就當作點擊
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (busy || spinning || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancelAnimationFrame(raf);
    drag = { x: e.clientX, rot, moved: false, id: e.pointerId };
  });
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    if (drag.moved) { rot = drag.rot - dx * 0.45; render(); }
  });
  addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved) { snap(); return; }
    const p = e.target.closest && e.target.closest('.pk');
    if (!p || !box.contains(p)) return;
    const i = Number(p.dataset.i);
    if (i === frontIdx()) { if (onPick) onPick(i); } else goTo(i);
  });
  // 鍵盤：左右鍵轉、Enter／空白鍵選到某包（轉過去或直接拆）
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); turn(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); turn(1); }
    const p = e.target.closest('.pk');
    if (p && (e.key === 'Enter' || e.key === ' ') && !busy && !spinning) {
      e.preventDefault();
      e.stopPropagation(); // 不要觸發抽籤頁的空白鍵快捷鍵
      const i = Number(p.dataset.i);
      if (i === frontIdx()) { if (onPick) onPick(i); } else goTo(i);
    }
  });
  addEventListener('resize', render);
  requestAnimationFrame(render);

  const close = () => { open.classList.add('hidden'); cards.innerHTML = ''; };
  open.addEventListener('click', (e) => { if (!busy && (e.target === open || e.target === cards || e.target.closest('.pk-x'))) close(); });
  const set = (...c) => { box.classList.remove('live', 'opening'); c.forEach((x) => box.classList.add(x)); };

  return {
    reset() { busy = false; spinning = false; cancelAnimationFrame(raf); set(); close(); packs.forEach((p) => p.classList.remove('chosen', 'torn')); snap(); },
    // 開始：轉盤一直轉，等停止
    start() {
      this.reset();
      void box.offsetWidth;
      set('live');
      spinning = true;
      vel = 9 + Math.random() * 4;
      cancelAnimationFrame(raf);
      const spin = () => { rot += vel; render(); raf = requestAnimationFrame(spin); };
      raf = requestAnimationFrame(spin);
    },
    // opts.pack：老師選的那一包（沒有就慢慢停在隨機一包）；opts.all：這次所有中獎者
    async stop(done, label = {}, opts = {}) {
      busy = true;
      const all = opts.all && opts.all.length ? opts.all : [label];
      let i;
      if (spinning && !Number.isInteger(opts.pack)) {
        // 轉盤減速，停在隨機一包
        i = Math.floor(Math.random() * PACK_N);
        let target = i * PACK_STEP;
        while (target < rot + 360) target += 360;
        spinning = false;
        await tween(target, 1800);
      } else {
        spinning = false;
        i = Number.isInteger(opts.pack) ? opts.pack : frontIdx();
        await goTo(i);
      }
      const pk = packs[i];
      set('opening');
      pk.classList.add('chosen');
      await wait(700);
      pk.classList.add('torn');
      await wait(450);
      const [ic, c1, c2] = PACKS[i];
      cards.classList.toggle('many', all.length > 1);
      cards.innerHTML = all.map((_, k) => {
        const r = rarity();
        return `<div class="pk-card r-${r}" style="--k:${k};--c1:${c1};--c2:${c2}"><div class="pk-in">
          <div class="pk-back">${ICONS[ic]}</div>
          <div class="pk-front"><span class="pk-rar">${r}</span><span class="pk-pic">${ICONS[ic]}</span><b class="pk-main"></b><small class="pk-sub"></small><i class="pk-holo"></i></div></div></div>`;
      }).join('');
      [...cards.children].forEach((c, k) => {
        c.querySelector('.pk-main').textContent = all[k].main || '?';
        c.querySelector('.pk-sub').textContent = all[k].sub || '';
      });
      open.classList.remove('hidden');
      await wait(350);
      // 一張一張翻面
      const step = all.length > 1 ? Math.max(90, 380 - all.length * 12) : 0;
      for (const c of cards.children) { c.classList.add('flip'); if (step) await wait(step); }
      await wait(1100);
      busy = false;
      done();
    },
  };
}
