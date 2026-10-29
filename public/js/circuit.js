// 電路符號：電機、電子、邏輯閘。每個符號是一段 SVG（線條用 currentColor），放到白板時換成目前的顏色
// 兩端接腳都對齊 10 的倍數，方便用「導線」工具（會貼齊格線）接起來
const S = (w, h, d, extra = '') => ({ w, h, d, extra });
const arrowHead = (x, y, ang, L = 9) => {
  const a = (ang * Math.PI) / 180;
  const p = (da) => `${(x - L * Math.cos(a + da)).toFixed(1)} ${(y - L * Math.sin(a + da)).toFixed(1)}`;
  return `<path d="M${x} ${y}L${p(0.45)}L${p(-0.45)}Z" fill="currentColor" stroke="none"/>`;
};
const label = (x, y, txt, size = 22) => `<text x="${x}" y="${y}" font-size="${size}" font-family="Arial, Helvetica, sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="currentColor" stroke="none">${txt}</text>`;
const meter = (txt) => S(120, 60, 'M0 30H40M80 30H120', `<circle cx="60" cy="30" r="20"/>${label(60, 31, txt)}`);

export const SYMBOLS = {
  // ---------- 基本元件 ----------
  res: S(120, 60, 'M0 30H30L35 18L45 42L55 18L65 42L75 18L85 42L90 30H120'),
  resIec: S(120, 60, 'M0 30H30M90 30H120', '<rect x="30" y="20" width="60" height="20"/>'),
  pot: S(120, 60, 'M0 30H30L35 18L45 42L55 18L65 42L75 18L85 42L90 30H120M38 50L82 10', arrowHead(82, 10, -42)),
  cap: S(120, 60, 'M0 30H54M54 10V50M66 10V50M66 30H120'),
  capE: S(120, 60, 'M0 30H54M54 10V50M74 10Q62 30 74 50M68 30H120M38 12H48M43 7V17'),
  ind: S(120, 60, 'M0 30H25Q33.75 8 42.5 30Q51.25 8 60 30Q68.75 8 77.5 30Q86.25 8 95 30H120'),
  bat: S(120, 60, 'M0 30H50M50 8V52M60 20V40M70 8V52M80 20V40M80 30H120M36 10H44M40 6V14'),
  dc: S(120, 60, 'M0 30H40M80 30H120M52 30H60M56 26V34M64 30H70', '<circle cx="60" cy="30" r="20"/>'),
  ac: S(120, 60, 'M0 30H40M80 30H120M47 30Q53.5 16 60 30Q66.5 44 73 30', '<circle cx="60" cy="30" r="20"/>'),
  gnd: S(60, 60, 'M30 0V30M10 30H50M18 39H42M25 48H35'),
  sw: S(120, 60, 'M0 30H37M43 28L80 12M86 30H120', '<circle cx="40" cy="30" r="3.5"/><circle cx="83" cy="30" r="3.5"/>'),
  push: S(120, 60, 'M0 30H37M86 30H120M34 20H86M60 20V6M50 6H70', '<circle cx="40" cy="30" r="3.5"/><circle cx="83" cy="30" r="3.5"/>'),
  lamp: S(120, 60, 'M0 30H40M80 30H120M46 16L74 44M74 16L46 44', '<circle cx="60" cy="30" r="20"/>'),
  fuse: S(120, 60, 'M0 30H120', '<rect x="30" y="22" width="60" height="16"/>'),
  dot: S(20, 20, '', '<circle cx="10" cy="10" r="5" fill="currentColor"/>'),
  // ---------- 電子元件 ----------
  diode: S(120, 60, 'M0 30H48M72 12V48M72 30H120', '<path d="M48 12L72 30L48 48Z" fill="currentColor"/>'),
  led: S(120, 60, 'M0 30H48M72 12V48M72 30H120M60 12L72 0M70 18L82 6', `<path d="M48 12L72 30L48 48Z" fill="currentColor"/>${arrowHead(72, 0, -45, 7)}${arrowHead(82, 6, -45, 7)}`),
  zener: S(120, 60, 'M0 30H48M66 8L72 12V48L78 52M72 30H120', '<path d="M48 12L72 30L48 48Z" fill="currentColor"/>'),
  npn: S(100, 100, 'M0 50H38M38 26V74M38 40L70 20V0M38 60L70 80V100', `<circle cx="52" cy="50" r="32"/>${arrowHead(70, 80, 32)}`),
  pnp: S(100, 100, 'M0 50H38M38 26V74M38 40L70 20V0M38 60L70 80V100', `<circle cx="52" cy="50" r="32"/>${arrowHead(42, 62, 212)}`),
  nmos: S(100, 100, 'M0 60H30M30 30V70M40 26V38M40 44V56M40 62V74M40 32H70V0M40 68H70V100M40 50H70V68', arrowHead(42, 50, 180, 8)),
  pmos: S(100, 100, 'M0 60H24M30 30V70M40 26V38M40 44V56M40 62V74M40 32H70V0M40 68H70V100M40 50H70V68', `<circle cx="27" cy="60" r="3.5"/>${arrowHead(68, 50, 0, 8)}`),
  opamp: S(120, 100, 'M0 30H30M0 70H30M100 50H120', `<path d="M30 10L30 90L100 50Z"/>${label(42, 30, '−', 20)}${label(42, 70, '+', 20)}`),
  spk: S(80, 80, 'M0 30H24M0 50H24', '<rect x="24" y="26" width="14" height="28"/><path d="M38 26L60 8V72L38 54"/>'),
  mic: S(100, 60, 'M0 30H30M30 8V52M60 30H100', '<circle cx="50" cy="30" r="20"/>'),
  // ---------- 電機、量測 ----------
  motor: meter('M'),
  gen: meter('G'),
  volt: meter('V'),
  amp: meter('A'),
  ohm: meter('Ω'),
  tf: S(100, 100, 'M0 10H30Q14 20 30 30Q14 40 30 50Q14 60 30 70Q14 80 30 90H0M100 10H70Q86 20 70 30Q86 40 70 50Q86 60 70 70Q86 80 70 90H100M46 6V94M54 6V94'),
  relay: S(120, 60, 'M0 30H40M80 30H120M40 44L80 16', '<rect x="40" y="16" width="40" height="28"/>'),
  // ---------- 邏輯閘 ----------
  and: S(120, 80, 'M0 25H20M0 55H20M85 40H120', '<path d="M20 10H55A30 30 0 0 1 55 70H20Z"/>'),
  or: S(120, 80, 'M0 25H26M0 55H26M88 40H120', '<path d="M18 10Q60 10 88 40Q60 70 18 70Q34 40 18 10Z"/>'),
  not: S(120, 80, 'M0 40H25M92 40H120', '<path d="M25 15L25 65L80 40Z"/><circle cx="86" cy="40" r="6"/>'),
  buf: S(120, 80, 'M0 40H25M80 40H120', '<path d="M25 15L25 65L80 40Z"/>'),
  nand: S(120, 80, 'M0 25H20M0 55H20M97 40H120', '<path d="M20 10H55A30 30 0 0 1 55 70H20Z"/><circle cx="91" cy="40" r="6"/>'),
  nor: S(120, 80, 'M0 25H26M0 55H26M100 40H120', '<path d="M18 10Q60 10 88 40Q60 70 18 70Q34 40 18 10Z"/><circle cx="94" cy="40" r="6"/>'),
  xor: S(120, 80, 'M0 25H30M0 55H30M94 40H120M12 10Q28 40 12 70', '<path d="M24 10Q66 10 94 40Q66 70 24 70Q40 40 24 10Z"/>'),
  xnor: S(120, 80, 'M0 25H30M0 55H30M106 40H120M12 10Q28 40 12 70', '<path d="M24 10Q66 10 94 40Q66 70 24 70Q40 40 24 10Z"/><circle cx="100" cy="40" r="6"/>'),
};
export const CIRCUIT_GROUPS = [
  ['basic', ['res', 'resIec', 'pot', 'cap', 'capE', 'ind', 'bat', 'dc', 'ac', 'gnd', 'sw', 'push', 'lamp', 'fuse', 'dot']],
  ['elec', ['diode', 'led', 'zener', 'npn', 'pnp', 'nmos', 'pmos', 'opamp', 'spk', 'mic']],
  ['power', ['motor', 'gen', 'tf', 'relay', 'volt', 'amp', 'ohm']],
  ['logic', ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor', 'buf']],
];

// 完整的 SVG 字串；color 是線條顏色
export function symbolSvg(key, color = 'currentColor', stroke = 3) {
  const s = SYMBOLS[key];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${s.w + 8} ${s.h + 8}" width="${s.w + 8}" height="${s.h + 8}" color="${color}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${s.d ? `<path d="${s.d}"/>` : ''}${s.extra}</svg>`;
}
