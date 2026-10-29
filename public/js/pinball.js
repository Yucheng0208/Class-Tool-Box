// 打彈珠（柏青哥）：彈珠從右側軌道射上去，穿過釘子、彈跳球與旋轉風車，落進下方口袋（全部顯示「?」），落在哪格就抽中誰
// 一次抽幾人就連續發射幾顆；落進已經中過的口袋會自動再補射一顆
// 場上有「OUT 洞」（掉進去就重新發射）、彈弓、左右滑動的擋板、彈跳球、風車等回彈物件
const W = 600, H = 780;
const BALL_R = 11, PEG_R = 7;
const POCKET_H = 120;           // 下方口袋高度
const RAIL = 46;                // 右側發射軌道寬度
const ARC_Y = 140, ARC_RY = 130; // 頂端導軌：橢圓弧，整個都在畫面內
const LAUNCH_GAP = 38;          // 連發間隔（影格）
const COLORS = ['#e52521', '#fbd000', '#2bb24c', '#5c94fc', '#ff8a1c', '#9b30d9', '#1aa3a3'];
export const MAX_POCKETS = 7;

export function createPinball(canvas, { onLand, onPeg, onPocket, onBall, onRepeat, onHole }) {
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  const fieldW = W - RAIL;      // 釘子區寬度（不含發射軌道）
  // 彈跳球（碰到會用力彈開並發亮）與旋轉風車
  const bumpers = [
    { x: fieldW * 0.27, y: 300, r: 22, hit: 0 },
    { x: fieldW * 0.73, y: 300, r: 22, hit: 0 },
    { x: fieldW * 0.5, y: 455, r: 24, hit: 0 },
  ];
  const spinners = [
    { x: fieldW * 0.5, y: 215, len: 52, a: 0, w: 0.05 },
    { x: fieldW * 0.22, y: 545, len: 44, a: 0.7, w: -0.07 },
    { x: fieldW * 0.78, y: 545, len: 44, a: 0.2, w: 0.07 },
  ];
  // OUT 洞：掉進去就被吸走，重新發射一顆
  const holes = [
    { x: fieldW * 0.1, y: 392, r: 17, a: 0 },
    { x: fieldW * 0.9, y: 392, r: 17, a: 0 },
  ];
  // 線段型回彈物件：彈弓（打到會用力彈開）、左右滑動的擋板
  const segs = [
    { x1: 14, y1: 566, x2: 64, y2: 612, kick: 7, hit: 0, color: '#ff7ac8' },
    { x1: fieldW - 14, y1: 566, x2: fieldW - 64, y2: 612, kick: 7, hit: 0, color: '#ff7ac8' },
    { x1: 0, y1: 0, x2: 0, y2: 0, kick: 3, hit: 0, color: '#1aa3a3', mover: { cx: fieldW / 2, y: 384, half: 40, range: fieldW * 0.24, t: 0, w: 0.025 } },
  ];
  const moveSegs = () => {
    for (const g of segs) {
      if (!g.mover) continue;
      const m = g.mover; m.t += m.w;
      const cx = m.cx + Math.sin(m.t) * m.range;
      g.x1 = cx - m.half; g.x2 = cx + m.half; g.y1 = g.y2 = m.y;
    }
  };
  moveSegs();
  const segDist = (x, y, g) => {
    const dx = g.x2 - g.x1, dy = g.y2 - g.y1, l2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((x - g.x1) * dx + (y - g.y1) * dy) / l2));
    const px = g.x1 + dx * k, py = g.y1 + dy * k;
    return { d: Math.hypot(x - px, y - py), px, py };
  };
  // 交錯排列的釘子（避開彈跳球、風車、洞與擋板）
  const pegs = [];
  const clear = (x, y) => bumpers.every((b) => Math.hypot(x - b.x, y - b.y) > b.r + 20) && spinners.every((s) => Math.hypot(x - s.x, y - s.y) > s.len + 14)
    && holes.every((h) => Math.hypot(x - h.x, y - h.y) > h.r + 26)
    && segs.every((g) => (g.mover ? Math.abs(y - g.mover.y) > 30 : segDist(x, y, g).d > 30));
  for (let row = 0; row < 10; row++) {
    const y = 170 + row * 46;
    const n = row % 2 ? 8 : 9;
    const gap = fieldW / 9;
    for (let i = 0; i < n; i++) {
      const x = gap / 2 + (row % 2 ? gap / 2 : 0) + i * gap;
      if (clear(x, y)) pegs.push({ x, y, hit: 0 });
    }
  }
  let items = [];               // 每個口袋對應的候選人
  let balls = [];               // { x, y, vx, vy, phase: 'launch' | 'arc' | 'fall' | 'done', slow }
  let raf = 0, nudges = 0, lastPocket = -1, queued = 0, gap = 0;
  let won = [];                 // 已經有彈珠落進的口袋（依序）

  const pocketW = () => fieldW / Math.max(1, items.length);
  const pocketAt = (x) => Math.max(0, Math.min(items.length - 1, Math.floor(x / pocketW())));

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // 背景與外框
    ctx.fillStyle = '#16205a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1f2f80';
    for (let y = 0; y < H; y += 24) for (let x = (y / 24) % 2 ? 12 : 0; x < W; x += 24) ctx.fillRect(x, y, 4, 4);
    // 頂端弧形導軌
    ctx.strokeStyle = '#c0c0d0'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(W / 2, ARC_Y, W / 2 - 8, ARC_RY, 0, Math.PI, 0); ctx.stroke();
    // 發射軌道
    ctx.fillStyle = '#0d1440'; ctx.fillRect(fieldW, 140, RAIL, H - 140);
    ctx.fillStyle = '#c0c0d0'; ctx.fillRect(fieldW - 4, 200, 6, H - 200);
    // OUT 洞：黑洞＋旋轉的黃色虛線圈
    for (const h of holes) {
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 6, 0, Math.PI * 2); ctx.fillStyle = '#0a0a18'; ctx.fill();
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.a);
      ctx.setLineDash([6, 5]); ctx.lineWidth = 3; ctx.strokeStyle = '#fbd000';
      ctx.beginPath(); ctx.arc(0, 0, h.r + 6, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r - 2, 0, Math.PI * 2); ctx.fillStyle = '#000'; ctx.fill();
      ctx.fillStyle = '#ff5050'; ctx.font = '900 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('OUT', h.x, h.y + 1);
    }
    // 彈弓與滑動擋板
    for (const g of segs) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); ctx.stroke();
      ctx.strokeStyle = g.hit > 0 ? '#fff6a0' : g.color; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); ctx.stroke();
      ctx.lineCap = 'butt';
      if (g.hit > 0) g.hit--;
    }
    // 釘子（金幣色）
    for (const p of pegs) {
      ctx.beginPath(); ctx.arc(p.x, p.y, PEG_R + (p.hit > 0 ? 2 : 0), 0, Math.PI * 2);
      ctx.fillStyle = p.hit > 0 ? '#fff6a0' : '#fbd000'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
      if (p.hit > 0) p.hit--;
    }
    // 彈跳球
    for (const b of bumpers) {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + (b.hit > 0 ? 4 : 0), 0, Math.PI * 2);
      ctx.fillStyle = b.hit > 0 ? '#fff6a0' : '#e52521'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${b.r}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★', b.x, b.y + 1);
      if (b.hit > 0) b.hit--;
    }
    // 旋轉風車（四支葉片）
    for (const s of spinners) {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = k % 2 ? '#5c94fc' : '#2bb24c';
        ctx.fillRect(0, -5, s.len, 10);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(0, -5, s.len, 10);
      }
      ctx.restore();
      ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.fillStyle = '#fbd000'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
    }
    // 口袋
    const pw = pocketW(), top = H - POCKET_H;
    items.forEach((it, i) => {
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.globalAlpha = won.includes(i) ? 1 : lastPocket === i ? 0.85 : 0.55;
      ctx.fillRect(i * pw + 2, top, pw - 4, POCKET_H - 4);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(i * pw + 2, top, pw - 4, POCKET_H - 4);
      // 不顯示名字，一律「?」，抽中才在彈窗揭曉
      ctx.fillStyle = '#000'; ctx.font = `900 ${Math.max(22, Math.min(40, pw / 1.8))}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', i * pw + pw / 2, top + POCKET_H / 2);
      // 中了的口袋：外框亮黃、上方標第幾顆
      if (won.includes(i)) {
        ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 5; ctx.strokeRect(i * pw + 5, top + 3, pw - 10, POCKET_H - 10);
        ctx.fillStyle = '#fff'; ctx.font = `900 14px system-ui, sans-serif`;
        ctx.fillText(`★${won.indexOf(i) + 1}`, i * pw + pw / 2, top + 18);
      }
    });
    // 等待發射的彈珠數
    if (queued > 0) {
      ctx.fillStyle = '#fff'; ctx.font = `900 14px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(`×${queued}`, fieldW + RAIL / 2, H - 60);
    }
    // 隔板
    ctx.fillStyle = '#c0c0d0';
    for (let i = 1; i < items.length; i++) ctx.fillRect(i * pw - 3, top - 30, 6, POCKET_H + 30);
    // 彈珠
    for (const ball of balls) {
      if (ball.phase === 'done') continue;
      const g = ctx.createRadialGradient(ball.x - 4, ball.y - 4, 2, ball.x, ball.y, BALL_R);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c8c8d8'); g.addColorStop(1, '#5a5a6e');
      ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
    }
  }

  const newBall = () => ({ x: fieldW + RAIL / 2, y: H - 30, vx: 0, vy: 0, phase: 'launch', spread: Math.random() * 0.3, slow: 0 });
  function step() {
    for (const s of spinners) s.a += s.w;
    for (const h of holes) h.a += 0.05;
    moveSegs();
    // 連發：發射軌道空出來就射下一顆
    if (queued > 0 && --gap <= 0) { balls.push(newBall()); queued--; gap = LAUNCH_GAP; }
    for (const b of balls) if (b.phase !== 'done') move(b);
    // 彈珠互撞
    const live = balls.filter((b) => b.phase === 'fall');
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], c = live[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy), min = BALL_R * 2;
      if (d < min && d > 0) {
        const nx = dx / d, ny = dy / d, push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
        const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; c.vx -= rel * nx; c.vy -= rel * ny; }
      }
    }
    draw();
    if (queued === 0 && balls.every((b) => b.phase === 'done')) { onLand(won.map((k) => items[k])); return; }
    raf = requestAnimationFrame(step);
  }

  function move(b) {
    if (b.phase === 'launch') {
      // 沿右側軌道往上，再沿頂端弧線進入釘子區
      b.y -= 22;
      if (b.y < ARC_Y) {
        b.phase = 'arc'; b.a = 0;
      }
    } else if (b.phase === 'arc') {
      b.a += 0.09;
      const rx = W / 2 - 8 - BALL_R - 4, ry = ARC_RY - BALL_R - 4;
      b.x = W / 2 + Math.cos(-b.a) * rx; b.y = ARC_Y + Math.sin(-b.a) * ry;
      if (b.a > Math.PI * (0.62 + b.spread)) {
        // 從弧線上離開，往左下落（落點由 spread 與碰撞決定）
        b.phase = 'fall';
        b.vx = -(1 + Math.random() * 5); b.vy = 1;
      }
    } else if (b.phase === 'fall') {
      b.vy += 0.32;
      b.vx *= 0.995;
      b.x += b.vx; b.y += b.vy;
      // 牆
      if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.7; }
      if (b.x > fieldW - BALL_R - 4) { b.x = fieldW - BALL_R - 4; b.vx = -Math.abs(b.vx) * 0.7; }
      // 釘子碰撞
      for (const p of pegs) {
        const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), min = BALL_R + PEG_R;
        if (d < min && d > 0) {
          const nx = dx / d, ny = dy / d;
          b.x = p.x + nx * min; b.y = p.y + ny * min;
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            b.vx -= 1.6 * dot * nx; b.vy -= 1.6 * dot * ny;
            b.vx += (Math.random() - 0.5) * 1.2; // 一點隨機，避免卡住
            if (p.hit === 0) onPeg && onPeg();
            p.hit = 6;
          }
        }
      }
      // 彈跳球：比釘子彈得更用力
      for (const bp of bumpers) {
        const dx = b.x - bp.x, dy = b.y - bp.y, d = Math.hypot(dx, dy), min = BALL_R + bp.r;
        if (d < min && d > 0) {
          const nx = dx / d, ny = dy / d;
          b.x = bp.x + nx * min; b.y = bp.y + ny * min;
          const sp = Math.max(7, Math.hypot(b.vx, b.vy) * 1.1);
          b.vx = nx * sp + (Math.random() - 0.5); b.vy = ny * sp;
          if (bp.hit === 0) onPeg && onPeg();
          bp.hit = 10;
        }
      }
      // 風車：碰到葉片就被打出去（加上葉片轉動的速度）
      for (const s of spinners) {
        for (let k = 0; k < 4; k++) {
          const ang = s.a + (k + 1) * (Math.PI / 2);
          const ex = Math.cos(ang), ey = Math.sin(ang);
          const rx = b.x - s.x, ry = b.y - s.y;
          const tt = Math.max(0, Math.min(s.len, rx * ex + ry * ey));
          const px = s.x + ex * tt, py = s.y + ey * tt;
          const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), min = BALL_R + 5;
          if (d < min && d > 0) {
            const nx = dx / d, ny = dy / d;
            b.x = px + nx * min; b.y = py + ny * min;
            const vbx = -s.w * (py - s.y) * 1.5, vby = s.w * (px - s.x) * 1.5; // 葉片在接觸點的速度
            const rvx = b.vx - vbx, rvy = b.vy - vby, dot = rvx * nx + rvy * ny;
            if (dot < 0) { b.vx -= 1.7 * dot * nx; b.vy -= 1.7 * dot * ny; b.vx += vbx * 0.6; b.vy += vby * 0.6; onPeg && onPeg(); }
          }
        }
      }
      // 彈弓／擋板
      for (const g of segs) {
        const { d, px, py } = segDist(b.x, b.y, g), min = BALL_R + 6;
        if (d < min && d > 0) {
          const nx = (b.x - px) / d, ny = (b.y - py) / d;
          b.x = px + nx * min; b.y = py + ny * min;
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            b.vx -= 1.8 * dot * nx; b.vy -= 1.8 * dot * ny;
            b.vx += nx * g.kick; b.vy += ny * g.kick;
            if (g.hit === 0) onPeg && onPeg();
            g.hit = 10;
          }
        }
      }
      // OUT 洞：靠近會被吸過去，掉進中心就消失、重新發射
      for (const h of holes) {
        const dx = h.x - b.x, dy = h.y - b.y, d = Math.hypot(dx, dy);
        if (d < h.r + 14) { b.vx += dx / d * 0.5; b.vy += dy / d * 0.5; }
        if (d < h.r - 4) {
          b.phase = 'done';
          queued++; gap = Math.min(gap, 20);
          onHole && onHole();
          return;
        }
      }
      // 隔板
      const top = H - POCKET_H, pw = pocketW();
      if (b.y > top - 30) {
        for (let i = 1; i < items.length; i++) {
          const wx = i * pw;
          if (Math.abs(b.x - wx) < BALL_R + 3) { b.x = wx + Math.sign(b.x - wx || 1) * (BALL_R + 3); b.vx = -b.vx * 0.5; }
        }
      }
      // 卡住保險：速度太慢一陣子就輕推
      b.slow = Math.hypot(b.vx, b.vy) < 0.4 ? b.slow + 1 : 0;
      if (b.slow > 40) { b.vx += (Math.random() - 0.5) * 6; b.vy -= 2; b.slow = 0; }
      const k = pocketAt(b.x);
      if (b.y > top - 60 && k !== lastPocket) { lastPocket = k; onPocket && onPocket(items[k]); }
      if (b.y > H - BALL_R - 8) {
        b.y = H - BALL_R - 8;
        b.phase = 'done';
        const k = pocketAt(b.x);
        // 同一格已經中過：再補射一顆
        if (won.includes(k)) { queued++; gap = Math.min(gap, 10); onRepeat && onRepeat(); } else { won.push(k); onBall && onBall(items[k]); }
      }
    }
  }

  return {
    // 待機畫面：顯示候選人口袋
    show(list) { cancelAnimationFrame(raf); items = list; balls = []; won = []; queued = 0; lastPocket = -1; draw(); },
    // n：要抽幾人就發射幾顆（不超過口袋數）
    launch(list, n = 1) {
      cancelAnimationFrame(raf);
      items = list; balls = []; won = []; lastPocket = -1; nudges = 0;
      queued = Math.max(1, Math.min(n, list.length)); gap = 0;
      raf = requestAnimationFrame(step);
    },
    // 推一下（每次最多 3 下）
    nudge() {
      const live = balls.filter((b) => b.phase === 'fall');
      if (!live.length || nudges >= 3) return false;
      nudges++;
      for (const ball of live) { ball.vx += (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3); ball.vy -= 3; }
      canvas.classList.remove('tilt'); void canvas.offsetWidth; canvas.classList.add('tilt');
      return true;
    },
    get running() { return queued > 0 || balls.some((b) => b.phase !== 'done'); },
    stop() { cancelAnimationFrame(raf); },
  };
}
