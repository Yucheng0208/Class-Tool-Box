// 白板的音樂符號：音符、休止符、譜號、升降記號、拍號、小節線、表情記號
// 以五線譜一格 = 18px 設計（白板的「五線譜」背景也是 18px 一格），放上去剛好對齊
const head = (x, y, fill = true) => `<ellipse cx="${x}" cy="${y}" rx="10.5" ry="7.5" transform="rotate(-22 ${x} ${y})" ${fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke-width="3"'}/>`;
const stem = (x, y1, y2) => `<path d="M${x} ${y1}V${y2}" stroke-width="2.6"/>`;
const flag = (x, y) => `<path d="M${x} ${y}c2 10 14 14 12 30c-1 5-3 8-5 10c3-8 1-18-7-22" fill="currentColor" stroke="none"/>`;
const txt = (x, y, s, size, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" fill="currentColor" stroke="none" ${extra}>${s}</text>`;
const MUSIC_FONT = 'font-family="Segoe UI Symbol, Noto Music, Bravura Text, Apple Symbols, Symbola, serif"';
export const MUSIC = {
  whole: { w: 34, h: 24, b: '<ellipse cx="17" cy="12" rx="13" ry="8.5" fill="none" stroke-width="3.4"/><ellipse cx="17" cy="12" rx="5" ry="7" transform="rotate(35 17 12)" fill="none" stroke-width="2.4"/>' },
  half: { w: 34, h: 72, b: head(13, 62, false) + stem(23, 58, 6) },
  quarter: { w: 34, h: 72, b: head(13, 62) + stem(23, 58, 6) },
  eighth: { w: 46, h: 72, b: head(13, 62) + stem(23, 58, 6) + flag(23, 6) },
  sixteenth: { w: 46, h: 72, b: head(13, 62) + stem(23, 58, 4) + flag(23, 4) + flag(23, 18) },
  dotted: { w: 44, h: 72, b: head(13, 62) + stem(23, 58, 6) + '<circle cx="34" cy="60" r="3.2" fill="currentColor" stroke="none"/>' },
  beamed: { w: 72, h: 72, b: head(13, 62) + stem(23, 58, 8) + head(49, 62) + stem(59, 58, 8) + '<path d="M22 4H60V12H22Z" fill="currentColor" stroke="none"/>' },
  beamed16: { w: 72, h: 72, b: head(13, 62) + stem(23, 58, 6) + head(49, 62) + stem(59, 58, 6) + '<path d="M22 3H60V9H22ZM22 15H60V21H22Z" fill="currentColor" stroke="none"/>' },
  restWhole: { w: 40, h: 30, b: '<path d="M2 4H38" stroke-width="2"/><rect x="10" y="4" width="20" height="9" fill="currentColor" stroke="none"/>' },
  restHalf: { w: 40, h: 30, b: '<path d="M2 22H38" stroke-width="2"/><rect x="10" y="13" width="20" height="9" fill="currentColor" stroke="none"/>' },
  restQuarter: { w: 30, h: 64, b: '<path d="M10 4L20 16L12 26L22 38C16 36 10 40 16 54C6 46 8 36 16 36L8 26L16 16Z" fill="currentColor" stroke="none"/>' },
  restEighth: { w: 30, h: 50, b: '<circle cx="9" cy="12" r="5" fill="currentColor" stroke="none"/><path d="M8 16C14 18 20 14 24 8L12 46" stroke-width="2.6" fill="none"/>' },
  treble: { w: 60, h: 150, b: txt(30, 112, '&#x1D11E;', 120, MUSIC_FONT) },
  bass: { w: 64, h: 80, b: txt(32, 66, '&#x1D122;', 74, MUSIC_FONT) },
  sharp: { w: 30, h: 60, b: '<path d="M10 6V56M20 2V52" stroke-width="2.4"/><path d="M4 22L26 14M4 42L26 34" stroke-width="5.5"/>' },
  flat: { w: 26, h: 64, b: '<path d="M6 2V58" stroke-width="2.6"/><path d="M6 58C26 46 24 30 14 32C10 33 7 36 6 40" fill="none" stroke-width="3.4"/>' },
  natural: { w: 24, h: 64, b: '<path d="M5 2V44M19 20V62" stroke-width="2.4"/><path d="M5 26L19 20M5 44L19 38" stroke-width="5"/>' },
  t44: { w: 30, h: 72, b: txt(15, 32, '4', 40, 'font-weight="900" font-family="Georgia, serif"') + txt(15, 68, '4', 40, 'font-weight="900" font-family="Georgia, serif"') },
  t34: { w: 30, h: 72, b: txt(15, 32, '3', 40, 'font-weight="900" font-family="Georgia, serif"') + txt(15, 68, '4', 40, 'font-weight="900" font-family="Georgia, serif"') },
  t24: { w: 30, h: 72, b: txt(15, 32, '2', 40, 'font-weight="900" font-family="Georgia, serif"') + txt(15, 68, '4', 40, 'font-weight="900" font-family="Georgia, serif"') },
  t68: { w: 30, h: 72, b: txt(15, 32, '6', 40, 'font-weight="900" font-family="Georgia, serif"') + txt(15, 68, '8', 40, 'font-weight="900" font-family="Georgia, serif"') },
  bar: { w: 12, h: 76, b: '<path d="M6 2V74" stroke-width="2.4"/>' },
  dbar: { w: 22, h: 76, b: '<path d="M5 2V74" stroke-width="2.4"/><path d="M15 2V74" stroke-width="2.4"/>' },
  fin: { w: 24, h: 76, b: '<path d="M4 2V74" stroke-width="2.4"/><rect x="12" y="2" width="8" height="72" fill="currentColor" stroke="none"/>' },
  repeat: { w: 38, h: 76, b: '<rect x="2" y="2" width="8" height="72" fill="currentColor" stroke="none"/><path d="M18 2V74" stroke-width="2.4"/><circle cx="29" cy="29" r="3.6" fill="currentColor" stroke="none"/><circle cx="29" cy="47" r="3.6" fill="currentColor" stroke="none"/>' },
  fermata: { w: 50, h: 32, b: '<path d="M4 28C8 2 42 2 46 28C40 12 10 12 4 28Z" fill="currentColor" stroke="none"/><circle cx="25" cy="25" r="3.4" fill="currentColor" stroke="none"/>' },
  dynF: { w: 34, h: 50, b: txt(17, 38, 'f', 44, 'font-style="italic" font-weight="900" font-family="Georgia, Times New Roman, serif"') },
  dynP: { w: 34, h: 50, b: txt(17, 34, 'p', 44, 'font-style="italic" font-weight="900" font-family="Georgia, Times New Roman, serif"') },
  dynMf: { w: 54, h: 50, b: txt(27, 38, 'mf', 40, 'font-style="italic" font-weight="900" font-family="Georgia, Times New Roman, serif"') },
  cresc: { w: 90, h: 34, b: '<path d="M86 4L4 17L86 30" fill="none" stroke-width="2.4"/>' },
  dim: { w: 90, h: 34, b: '<path d="M4 4L86 17L4 30" fill="none" stroke-width="2.4"/>' },
};
export const MUSIC_GROUPS = [
  ['notes', ['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'dotted', 'beamed', 'beamed16']],
  ['rests', ['restWhole', 'restHalf', 'restQuarter', 'restEighth']],
  ['signs', ['treble', 'bass', 'sharp', 'flat', 'natural', 't44', 't34', 't24', 't68']],
  ['marks', ['bar', 'dbar', 'fin', 'repeat', 'fermata', 'dynF', 'dynP', 'dynMf', 'cresc', 'dim']],
];
export function musicSvg(key, color = 'currentColor') {
  const m = MUSIC[key];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.w} ${m.h}" width="${m.w}" height="${m.h}" color="${color}" fill="none" stroke="currentColor" stroke-linecap="round">${m.b}</svg>`;
}
