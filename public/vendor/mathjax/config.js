// MathJax 設定（白板的公式用）：只轉成 SVG，不自動掃描整頁
window.MathJax = {
  tex: { inlineMath: [], displayMath: [] },
  svg: { fontCache: 'none' },
  options: { enableMenu: false },
  startup: { typeset: false },
};
