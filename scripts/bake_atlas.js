/**
 * 把 assets/map3d/atlas-bake.html 里的手绘纸图 SVG 渲染成一张 1600x1000 的 PNG。
 *
 * 为什么要有这一步：
 *   纸图原本是页面里一块 1600x1000 的大 SVG（2 万多条路径 + feDropShadow /
 *   feDisplacementMap 滤镜）。在鸿蒙 ArkWeb 这类软件渲染环境下，合成器会因为
 *   「tile memory limits exceeded」把整条带状的内容丢掉不画，纸图会缺块、错位；
 *   滤镜还会把纸张压成 1/4 尺寸。改成一张预烘焙位图后完全稳定。
 *
 * 用法（由 bake_atlas.py 调用，一般不用直接跑）：
 *   node scripts/bake_atlas.js <bake-page-url> <out.png>
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const CHROME = CHROME_CANDIDATES.find(p => fs.existsSync(p));
const W = 1600, H = 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!CHROME) { console.error('找不到 Chrome / Edge'); process.exit(1); }
  const url = process.argv[2];
  const out = process.argv[3];
  if (!url || !out) { console.error('用法: node bake_atlas.js <url> <out.png>'); process.exit(1); }

  const port = 9231;
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--hide-scrollbars',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--remote-debugging-port=' + port, '--window-size=' + W + ',' + H,
    '--user-data-dir=' + path.join(require('os').tmpdir(), 'cdp-atlas-bake'),
    '--force-device-scale-factor=1', '--mute-audio', 'about:blank'], { stdio: 'ignore' });

  await sleep(1600);
  let list;
  for (let i = 0; i < 15; i++) {
    try { list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); break }
    catch (e) { await sleep(400) }
  }
  const t = list.find(x => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pend = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id] } };
  const send = (me, p) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: me, params: p })) });
  await new Promise(r => ws.onopen = r);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  // 背景透明：纸图自己带纸面，边缘外面应该是空的
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Page.navigate', { url });
  await sleep(4500);

  const box = await send('Runtime.evaluate', {
    expression: '(function(){var s=document.getElementById("atlas");var r=s.getBoundingClientRect();return r.width+"x"+r.height})()',
    returnByValue: true
  });
  console.log('svg 盒子:', box.result.result.value);

  await sleep(1200);
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
    captureBeyondViewport: false
  });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('已输出', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
  proc.kill();
  process.exit(0);
})();
