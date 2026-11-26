/**
 * 对鸿蒙设备/模拟器上的 ArkWeb 页面执行 JS。
 *
 * ArkWeb 没有直接的 adb shell 调试入口，靠 DevTools socket 转发：
 *
 *   1) 查 webview 进程号（可用 hdc shell ps -ef | grep <包名>）
 *   2) hdc fport tcp:9222 localabstract:webview_devtools_remote_<pid>
 *   3) node scripts/arkweb_devtools.js "<js 表达式>"
 *
 * 常用表达式：
 *   node scripts/arkweb_devtools.js "window.__diag()"
 *   node scripts/arkweb_devtools.js "document.querySelector('#scr-map').className"
 *   node scripts/arkweb_devtools.js "document.querySelectorAll('#choices .choice')[1].click(); 'ok'"
 *
 * 注意：本脚本只用 Runtime.evaluate。Page.captureScreenshot 在 ArkWeb 上会让
 * DevTools 连接被掐断（没有任何返回），截图请走 hdc shell snapshot_display。
 */
const expr = process.argv[2] || '1';
const PORT = process.env.ARKWEB_PORT || '9222';

(async () => {
  try {
    const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
    const page = list.find(x => x.type === 'page');
    if (!page) { console.log('NO_PAGE'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0; const pend = {};
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
    };
    const send = (me, p) => new Promise(r => {
      const i = ++id; pend[i] = r;
      ws.send(JSON.stringify({ id: i, method: me, params: p || {} }));
    });
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    });
    if (r.result && r.result.exceptionDetails) {
      console.log('EXC ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    } else if (r.result && r.result.result) {
      const v = r.result.result.value;
      console.log(typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
    } else {
      console.log('EMPTY ' + JSON.stringify(r).slice(0, 300));
    }
    ws.close();
  } catch (e) {
    console.log('ERR ' + (e && e.message));
  }
})();
