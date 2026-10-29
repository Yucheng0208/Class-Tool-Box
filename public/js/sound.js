// 音效：全部由 Web Audio API 即時合成，不需音檔。
// 想換成自己的音檔：把檔案放到 /sounds/，並在這裡填入路徑，例如 powerUp: '/sounds/powerup.mp3'
const CUSTOM_FILES = {
  tick: null,
  coin: null,
  bump: null,
  powerUp: null,
  powerDown: null,
  gameOver: null,   // 扣分；例如 '/sounds/gameover.mp3'
  drawLoop: null,   // 抽籤過程的背景音樂（循環播放）；例如 '/sounds/draw-loop.mp3'
  jump: null,
  pipe: null,
};

let ctx = null;
let master = null;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 無痕模式 */ } },
};
let enabled = store.get('sfx-on', '1') === '1';
let volume = Number(store.get('sfx-vol', '0.6'));

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

function tone(freq, at, dur, { type = 'sine', vol = 0.25, slideTo = null, vibrato = 0, dest = null } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  if (vibrato) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 18;
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur);
  }
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest || master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(at, dur, vol = 0.2, lowpass = 1200) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const fileCache = {};
function playFile(name) {
  const url = CUSTOM_FILES[name];
  if (!url) return false;
  const a = fileCache[name] || (fileCache[name] = new Audio(url));
  a.volume = volume;
  a.currentTime = 0;
  a.play().catch(() => {});
  return true;
}

// 課堂工具箱：有趣的卡通音效（木魚、彈簧、滑音哨、木琴、悲傷長號），全部用 Web Audio 原創合成
const bell = (n, at, dur, vol = 0.16) => { tone(NOTE(n), at, dur, { type: 'sine', vol }); tone(NOTE(n + 12), at, dur * 0.6, { type: 'sine', vol: vol * 0.25 }); };
// 木琴：短促的三角波＋一點泛音
const mallet = (n, at, vol = 0.18) => { tone(NOTE(n), at, 0.22, { type: 'triangle', vol }); tone(NOTE(n + 19), at, 0.08, { type: 'sine', vol: vol * 0.3 }); };
// 滑音哨：頻率連續滑動，帶一點顫音
const whistle = (from, to, at, dur, vol = 0.12) => tone(from, at, dur, { type: 'sine', vol, slideTo: to, vibrato: 6 });
const synth = {
  // 抽籤滾動：木魚「叩」
  tick() { if (bgmOn) return; tone(NOTE(84 + Math.floor(Math.random() * 4)), 0, 0.025, { type: 'triangle', vol: 0.12, slideTo: NOTE(76) }); },
  // 抽中：木琴往上跑＋閃亮一聲
  coin() { [72, 76, 79, 84].forEach((n, i) => mallet(n, i * 0.06)); bell(91, 0.26, 0.4, 0.08); },
  // 撞到、停下：卡通彈簧「啵ㄧㄨㄥ」
  bump() { tone(180, 0, 0.32, { type: 'sine', vol: 0.32, slideTo: 420, vibrato: 30 }); tone(90, 0, 0.12, { type: 'triangle', vol: 0.2, slideTo: 60 }); },
  // 加分：滑音哨往上「咻～」＋叮
  powerUp() { whistle(500, 1600, 0, 0.32); bell(88, 0.3, 0.4, 0.12); },
  // 扣分：滑音哨往下「咻嗚～」
  powerDown() { whistle(1400, 300, 0, 0.5, 0.13); tone(140, 0.45, 0.2, { type: 'triangle', vol: 0.2, slideTo: 90 }); },
  // 悲傷長號：哇・哇・哇・哇～
  gameOver() {
    [[62, 0, 0.32], [61, 0.36, 0.32], [60, 0.72, 0.32]].forEach(([n, at, d]) => tone(NOTE(n), at, d, { type: 'sawtooth', vol: 0.07, slideTo: NOTE(n) * 0.97 }));
    tone(NOTE(59), 1.08, 0.9, { type: 'sawtooth', vol: 0.07, vibrato: 7 });
  },
  // 開始：彈簧跳一下「咚ㄧㄨ」
  jump() { tone(260, 0, 0.18, { type: 'sine', vol: 0.2, slideTo: 820 }); tone(820, 0.16, 0.08, { type: 'sine', vol: 0.08 }); },
  pipe() { whistle(900, 200, 0, 0.4); },
  // 點按：輕輕的泡泡「啵」
  click() { tone(600, 0, 0.06, { type: 'sine', vol: 0.12, slideTo: 1200 }); },
};

export const sfx = new Proxy(synth, {
  get(target, name) {
    return () => {
      if (!enabled) return;
      if (!playFile(name)) target[name] && target[name]();
    };
  },
});

// ---------- 抽籤背景音樂：原創的輕快鐘琴循環（F 大調，四拍一輪） ----------
const STEP = 0.15; // 八分音符長度（秒）
const MELODY = [77, 81, 84, 81, 79, 82, 86, 82, 77, 81, 84, 89, 86, 84, 81, 79];
const BASS = [53, 53, 58, 58, 53, 53, 60, 60]; // 每拍一個
let bgmOn = false;
let bgmTimer = null;
let bgmGain = null;
let bgmAudio = null;
function bgmBar() {
  const c = ac(); if (!c || !bgmOn) return;
  MELODY.forEach((n, i) => tone(NOTE(n), i * STEP, STEP * 1.6, { type: 'sine', vol: 0.09, dest: bgmGain }));
  BASS.forEach((n, i) => tone(NOTE(n), i * STEP * 2, STEP * 1.8, { type: 'triangle', vol: 0.16, dest: bgmGain }));
  bgmTimer = setTimeout(bgmBar, MELODY.length * STEP * 1000 - 30);
}
export const bgm = {
  start() {
    if (!enabled || bgmOn) return;
    bgmOn = true;
    if (CUSTOM_FILES.drawLoop) {
      bgmAudio = bgmAudio || Object.assign(new Audio(CUSTOM_FILES.drawLoop), { loop: true });
      bgmAudio.volume = volume * 0.6;
      bgmAudio.currentTime = 0;
      bgmAudio.play().catch(() => {});
      return;
    }
    const c = ac(); if (!c) { bgmOn = false; return; }
    bgmGain = c.createGain();
    bgmGain.gain.value = 1;
    bgmGain.connect(master);
    bgmBar();
  },
  stop() {
    if (!bgmOn) return;
    bgmOn = false;
    clearTimeout(bgmTimer);
    if (bgmAudio) { bgmAudio.pause(); return; }
    // 已排程的音符隨 gain 一起淡出、斷開
    const g = bgmGain;
    if (g && ctx) { g.gain.setTargetAtTime(0, ctx.currentTime, 0.03); setTimeout(() => g.disconnect(), 300); }
    bgmGain = null;
  },
};

export const sound = {
  get enabled() { return enabled; },
  set enabled(v) { enabled = !!v; store.set('sfx-on', v ? '1' : '0'); if (v) ac(); else bgm.stop(); },
  get volume() { return volume; },
  set volume(v) {
    volume = Math.max(0, Math.min(1, Number(v)));
    store.set('sfx-vol', String(volume));
    if (master) master.gain.value = volume;
  },
  unlock() { ac(); },
};
