/* 通过"按比例丢弃滚动事件"降低滚动量：
 * 不加 delta 修改、不自己滚动元素 —— 放过的都是原生事件(网站/浏览器行为完全不变)，
 * 被丢弃的事件用 preventDefault + stopImmediatePropagation 完全抹掉。
 * 期望通过率 = mult，用一个信用额度保证丢弃均匀。 */
let mult = 0.5;
let credit = 0;

function load() {
  try {
    chrome.storage.sync.get({ mult: 0.5 }, o => {
      const v = parseFloat(o.mult);
      if (!isNaN(v) && v > 0 && v <= 1) mult = v;
    });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (ch.mult) { const v = parseFloat(ch.mult.newValue); if (!isNaN(v) && v > 0 && v <= 1) mult = v; }
    });
  } catch (e) {}
}
load();

addEventListener('wheel', e => {
  if (mult >= 1) return;
  if (e.ctrlKey || e.metaKey) return;      // 缩放/系统手势不动
  if (e.deltaMode !== 0) return;           // 只处理像素为单位(触摸板/高精度滚轮)
  const d = Math.abs(e.deltaY) + Math.abs(e.deltaX);
  if (!d) return;
  credit += d * mult;
  if (credit + 1e-9 >= d) { credit -= d; if (credit < -1e6) credit = 0; return; }  // 放行
  if (credit < 0) credit = 0;
  e.preventDefault();
  e.stopImmediatePropagation();
}, { capture: true, passive: false });
