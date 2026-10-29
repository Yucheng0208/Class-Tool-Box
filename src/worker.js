// 課堂工具箱：靜態網站＋一個小小的代理，讓老師用「線上分享連結」匯入名冊
// 只代抓 Google 試算表、OneDrive、SharePoint（Excel 線上）的檔案；不儲存任何內容
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_HOPS = 6;
const ALLOW = [
  /^docs\.google\.com$/, /(^|\.)googleusercontent\.com$/,
  /^1drv\.ms$/, /^onedrive\.live\.com$/, /^api\.onedrive\.com$/, /(^|\.)livefilestore\.com$/, /(^|\.)files\.1drv\.com$/,
  /(^|\.)sharepoint\.com$/,
];
const allowed = (u) => u.protocol === 'https:' && ALLOW.some((re) => re.test(u.hostname));

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// 分享連結 → 可以直接下載檔案的網址（可能有好幾個，依序嘗試）
function candidates(raw) {
  const u = new URL(raw);
  const out = [];
  if (u.hostname === 'docs.google.com') {
    // 發佈到網路的連結：/spreadsheets/d/e/<id>/pubhtml → 整本 xlsx
    let m = u.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)/);
    if (m) out.push(`https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=xlsx`);
    // 一般分享連結：/spreadsheets/d/<id>/edit → 匯出 xlsx（需設成「知道連結的任何人」可檢視）
    m = u.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/);
    if (m && m[1] !== 'e') out.push(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`);
  } else if (/(^|\.)sharepoint\.com$/.test(u.hostname)) {
    // 學校 Microsoft 365：分享連結加 download=1 就會直接下載（需設成「任何人」可檢視）
    u.searchParams.set('download', '1');
    out.push(u.toString());
  } else if (u.hostname === '1drv.ms' || u.hostname === 'onedrive.live.com') {
    const d = new URL(raw);
    d.searchParams.set('download', '1');
    out.push(d.toString());
    // 個人 OneDrive：分享 API
    const b64 = btoa(raw).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    out.push(`https://api.onedrive.com/v1.0/shares/u!${b64}/root/content`);
  }
  return out;
}

// 自己跟隨轉址，每一站都檢查網域，避免被轉到別的地方
async function fetchFile(url) {
  let cur = new URL(url);
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (!allowed(cur)) throw new Error('redirected to an unsupported site');
    const res = await fetch(cur.toString(), { redirect: 'manual', headers: { 'user-agent': 'classtool-roster-import' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { cur = new URL(res.headers.get('location'), cur); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('file too large');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) throw new Error('file too large');
    const type = res.headers.get('content-type') || '';
    // xlsx 是 zip（PK 開頭）；csv 是純文字。拿到 HTML 代表是登入頁或沒有公開分享
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
    if (!isZip && /html/i.test(type)) throw new Error('not shared publicly');
    return { buf, type: isZip ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8' };
  }
  throw new Error('too many redirects');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/sheet') {
      if (req.method !== 'GET') return json({ error: 'method' }, 405);
      // 只接受本站頁面發出的請求
      const site = req.headers.get('sec-fetch-site');
      if (site && site !== 'same-origin') return json({ error: 'forbidden' }, 403);
      let target;
      try { target = new URL(url.searchParams.get('url') || ''); } catch { return json({ error: 'bad url' }, 400); }
      if (!allowed(target)) return json({ error: 'unsupported' }, 400);
      let last = 'not found';
      for (const c of candidates(target.toString())) {
        try {
          const { buf, type } = await fetchFile(c);
          return new Response(buf, { headers: { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
        } catch (e) { last = e.message; }
      }
      return json({ error: last }, 502);
    }
    return env.ASSETS.fetch(req);
  },
};
