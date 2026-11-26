/* ============================================================
   余烬纪 · game.js
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.prototype.slice.call(r.querySelectorAll(s));

  const KEY_AUTO = 'yhj_auto_v1';
  const KEY_SLOT = 'yhj_slot_';

  const ENTRY = { qidao: 'q01', k101: 'k01', yx: 'y01', sui: 's01', yuetai: 't01' };
  const PLACE_TINT = { qidao: '', k101: 'tint-warm', yx: 'tint-warm', sui: 'tint-cold', yuetai: '' };

  const FLAG_LABEL = {
    note17: '「别去七道」——十七',
    knowRelay: '第七道的灯，是人点亮的',
    sawLogo: '车头上被油漆盖住的「方舟」',
    disguise: '一身白雨衣，K.V. 编号',
    pulledTube: '你拔掉过一根软管',
    sawChen: '老陈的皮肤还是温的',
    metKelan: '督查 柯兰·维斯特',
    knowCaptain: '那张铜票，本来是队长的',
    heardKelan: '「她说她不想再签了」',
    sawRoutine: '每三十七天一次的例行检查',
    knowList: '「名单外」的含义',
    knowNest: '归巢：感染者会自己找地方等',
    hasKey: '信号房钥匙',
    hasLever: '道岔杆',
    threwSwitch: '道岔已压到底',
    noSwitch: '道岔没有动',
    noLever: '你没有碰道岔',
    kelanLetters: '柯兰写给队长的信',
    kelanTold: '秤爷替柯兰保管的东西',
    wroteReport: '四十七页的报告',
    pathOfficial: '让它在纸上死一次',
    kelanAllied: '柯兰站在你这边',
    soldTicket: '铜票，卖给了秤爷',
    soldNames: '卖掉六个名字，六十点',
    gaveNames: '把六个名字讲给了那个男孩',
    kindToOld: '一个老太太的谢',
    liedToOld: '你骗了一个等儿子的人',
    taxCleared: '路税已清',
    signedProtocol: '签了《环线维护协议》',
    becomeKV: '工作证 K.V.-07',
    grieved: '在信号房坐了一会儿',
    darkWalk: '摸黑走过整条隧道'
  };

  const STAT_LABEL = { hp: '体力', san: '精神', sup: '物资', cred: '信用', inf: '感染' };

  let S = null;
  let typing = false;
  let skipping = false;
  let typeToken = 0;

  /* ============================================================
     存档
     ============================================================ */
  const safeLS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  function newState(regionId) {
    return {
      v: 1, region: regionId, node: null, screen: 'play',
      hp: 100, san: 100, sup: 35, cred: 0, inf: 0,
      flags: {}, items: [], visited: {}, done: {},
      startedAt: Date.now(), updatedAt: Date.now(), ended: null
    };
  }
  function saveAuto() {
    if (!S) return;
    S.updatedAt = Date.now();
    safeLS.set(KEY_AUTO, JSON.stringify(S));
    refreshContinue();
  }
  function saveSlot(i) {
    if (!S) return;
    S.updatedAt = Date.now();
    safeLS.set(KEY_SLOT + i, JSON.stringify(S));
    toast('已存档 · 槽位 ' + i);
  }
  function readSave(k) {
    const raw = safeLS.get(k);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function refreshContinue() {
    const a = readSave(KEY_AUTO);
    const b = $('#btn-continue');
    if (!b) return;
    if (a && a.node) {
      b.disabled = false;
      b.textContent = '继续上回 · ' + (PLACES[a.node] ? PLACES[a.node].name : '西陆平原');
    } else {
      b.disabled = true;
      b.textContent = '继续上回（暂无存档）';
    }
  }

  /* ============================================================
     基础工具
     ============================================================ */
  function show(id) {
    $$('.screen').forEach(s => s.classList.remove('on'));
    const el = $('#' + id);
    if (el) el.classList.add('on');
    if (window.Map3D && id !== 'scr-map') Map3D.hide();
  }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function toast(msg, kind) {
    const w = $('#toast-wrap');
    const d = document.createElement('div');
    d.className = 'toast' + (kind ? ' ' + kind : '');
    d.textContent = msg;
    w.appendChild(d);
    setTimeout(() => d.remove(), 2200);
  }
  // 给 region.js / drama.js 这类旁挂模块共用
  window.toast = toast;

  /* ============================================================
     富文本 + 打字机
     ============================================================ */
  function parseRich(str) {
    const runs = [];
    let i = 0;
    while (i < str.length) {
      if (str[i] === '*' && str[i + 1] === '*') {
        const j = str.indexOf('**', i + 2);
        if (j > -1) { runs.push({ b: true, t: str.slice(i + 2, j) }); i = j + 2; continue; }
      }
      let k = str.indexOf('**', i + 1);
      if (k === -1) k = str.length;
      runs.push({ b: false, t: str.slice(i, k) });
      i = k;
    }
    return runs;
  }

  function typeRuns(p, runs, token, speed) {
    return new Promise(resolve => {
      const els = runs.map(r => {
        const e = document.createElement(r.b ? 'b' : 'span');
        if (r.b) e.className = 'hl';
        p.appendChild(e);
        return e;
      });
      let ri = 0, ci = 0, timer = null, finished = false;

      function flush() {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        runs.forEach((r, i) => { els[i].textContent = r.t; });
        resolve();
      }
      function step() {
        if (finished) return;
        if (token !== typeToken) { flush(); return; }
        if (skipping) { flush(); return; }
        if (ri >= runs.length) { flush(); return; }
        const r = runs[ri];
        ci += 1;
        els[ri].textContent = r.t.slice(0, ci);
        if (ci >= r.t.length) { ri += 1; ci = 0; }
        const ch = r.t.charAt(ci - 1);
        const pause = (ch === '。' || ch === '？' || ch === '！' || ch === '…') ? speed * 4 : speed;
        timer = setTimeout(step, pause);
      }
      step();
    });
  }

  async function playText(paras) {
    const token = ++typeToken;
    const narr = $('#narr');
    narr.innerHTML = '';
    typing = true;
    $('#tap-hint').classList.add('on');
    for (let i = 0; i < paras.length; i++) {
      if (token !== typeToken) { typing = false; return; }
      const raw = paras[i];
      const p = document.createElement('p');
      if (/^「[^」]*」$/.test(raw.trim())) p.className = 'quote';
      narr.appendChild(p);
      const speed = raw.length > 60 ? 15 : 20;
      await typeRuns(p, parseRich(raw), token, speed);
      await wait(70);
    }
    typing = false;
    $('#tap-hint').classList.remove('on');
  }

  /* ============================================================
     序章
     ============================================================ */
  let proIndex = 0, proAfter = null, proTimer = null, proFinished = false;

  function startPrologue(after) {
    proAfter = after;
    proIndex = 0;
    proFinished = false;
    clearTimeout(proTimer);
    $('#pro-text').innerHTML = '';
    $('#pro-next').innerHTML = '继续 <span>›</span>';
    show('scr-prologue');
    if (window.SceneImages) setProBg(SceneImages.forPrologueLine(0));
    proTimer = setTimeout(proTick, 420);
  }

  /* 序章背景：与正文共用双层交叉淡入，解码完成再上屏，同一张图不重复切换 */
  function setProBg(url) {
    const pbg = $('.pro-bg');
    if (!pbg || !url) return;
    fadeLayers(pbg, url, proState);
  }

  function addLine(line) {
    const box = $('#pro-text');
    const p = document.createElement('p');
    p.className = 'pro-line' + (/^——/.test(line) ? ' em' : '');
    p.textContent = line;
    box.appendChild(p);
    requestAnimationFrame(() => p.classList.add('on'));
    box.scrollTop = box.scrollHeight;
    // 序章按行换背景：医院 -> 熄灯 -> 方舟 -> 西陆平原（proIndex 已自增，故 -1）
    if (window.SceneImages) setProBg(SceneImages.forPrologueLine(proIndex - 1));
  }

  function proTick() {
    if (proIndex >= PROLOGUE.length) { proFinished = true; return; }
    addLine(PROLOGUE[proIndex++]);
    proTimer = setTimeout(proTick, 1000);
  }

  function proSkip() {
    clearTimeout(proTimer);
    while (proIndex < PROLOGUE.length) addLine(PROLOGUE[proIndex++]);
    proFinished = true;
  }

  function proAct() {
    if (!proFinished) { proSkip(); return; }
    const cb = proAfter;
    proAfter = null;
    if (cb) cb();
  }

  /* ============================================================
     大地图 · 3D 地形（不支持 WebGL 时回退手绘纸图）
     ============================================================ */
  let map3dReady = false;
  let map3dBusy = false;

  function regionMarkers() {
    return REGIONS.map(r => ({
      id: r.id,
      name: r.name,
      en: r.en,
      open: !!r.open,
      u: (r.mapUV && r.mapUV[0]) || 0.5,
      v: (r.mapUV && r.mapUV[1]) || 0.5
    }));
  }

  /* ---------- 区域详情卡 ---------- */
  let cardRegion = null;

  function openMapCard(rid) {
    const r = REGIONS.find(x => x.id === rid);
    if (!r) return;
    const card = $('#map-card');
    if (!card) return;
    cardRegion = rid;
    const idx = REGIONS.findIndex(x => x.id === rid);
    const no = String(idx + 1).padStart(2, '0');

    const set = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
    set('#mc-no', no);
    set('#mc-region', 'REGION ' + no + ' · ' + (r.tagline || r.ruler || ''));
    set('#mc-name', r.name);
    set('#mc-en', r.en || '');
    set('#mc-coord', r.coord || '');
    set('#mc-desc', r.hook || r.intro || '');
    const cov = $('#mc-cover');
    if (cov) cov.style.backgroundImage = "url('" + r.img + "')";

    const stats = $('#mc-stats');
    if (stats) {
      stats.innerHTML =
        '<div class="mc-stat"><i>势力</i><b>' + esc(r.ruler || '—') + '</b></div>' +
        '<div class="mc-stat"><i>气候</i><b>' + esc(r.climate || '—') + '</b></div>' +
        '<div class="mc-stat"><i>时长</i><b>' + esc(r.duration || '—') + '</b></div>' +
        '<div class="mc-stat"><i>状态</i><b>' + (r.open ? '已启封' : '封存') + '</b></div>';
    }
    const go = $('#mc-go');
    if (go) {
      go.disabled = !r.open;
      go.innerHTML = r.open ? '启封剧本 <span class="ar">→</span>' : '剧本封存中';
    }

    card.classList.add('on');
    card.setAttribute('aria-hidden', 'false');
    const hint = $('#map-hint');
    if (hint) hint.textContent = r.name + ' · ' + (r.tagline || r.climate || '');
    if (window.Map3D) Map3D.focus(rid, 900);
    $$('.mi').forEach(b => b.classList.toggle('on', b.dataset.region === rid));
  }

  function closeMapCard(keepCam) {
    const card = $('#map-card');
    if (card) {
      card.classList.remove('on');
      card.setAttribute('aria-hidden', 'true');
    }
    if (!cardRegion) return;
    cardRegion = null;
    $$('.mi').forEach(b => b.classList.remove('on'));
    const hint = $('#map-hint');
    if (hint) hint.textContent = '拖动旋转 · 滚轮缩放 · 点击地标';
    if (!keepCam && window.Map3D) Map3D.reset();
  }

  function stepCard(dir) {
    if (!cardRegion) return;
    const i = REGIONS.findIndex(x => x.id === cardRegion);
    const n = REGIONS.length;
    openMapCard(REGIONS[(i + dir + n) % n].id);
  }

  function onPickRegion(rid) {
    if (!rid) { closeMapCard(true); return; }
    openMapCard(rid);
  }

  /* 「地区」页签下 showMap 会跳过 3D 初始化，切回「世界」时要能补上，
     所以把这个内部函数挂出去给 region.js 用 */
  window.ensureMap3D = ensureMap3D;

  async function ensureMap3D() {
    if (map3dReady) return true;
    if (map3dBusy) return false;
    if (!window.Map3D || !Map3D.supported()) return false;
    map3dBusy = true;
    const ld = $('#map-loading');
    if (ld) ld.classList.add('on');
    await new Promise(r => setTimeout(r, 80));
    try {
      await Map3D.init($('#map3d'), regionMarkers(), onPickRegion);
      map3dReady = true;
      bindMarkerIndex();
      const box = $('#map3d');
      if (box) box.classList.add('on');
      const aw = $('#atlas-wrap');
      if (aw) aw.hidden = true;
      return true;
    } catch (err) {
      console.warn('[map3d] init failed', err);
      return false;
    } finally {
      map3dBusy = false;
      if (ld) ld.classList.remove('on');
    }
  }

  /* 地标悬停 -> 索引联动 */
  function bindMarkerIndex() {
    const box = $('#map-index');
    if (!box) return;
    $$('#map3d .mk').forEach(function (el) {
      const mi = $('.mi[data-region="' + el.dataset.id + '"]', box);
      if (!mi) return;
      el.addEventListener('mouseenter', function () { mi.classList.add('lit'); });
      el.addEventListener('mouseleave', function () { mi.classList.remove('lit'); });
    });
  }

  function showMap(reset) {
    closeMapCard(true);
    show('scr-map');
    // 「地区」页签下不初始化 3D：模拟器/低端机省一次 WebGL 上下文，也避免画布盖住剧本列表
    if (window.RegionTab && window.RegionTab.isRegion()) {
      window.RegionTab.apply();
      return;
    }
    const scr = $('#scr-map');
    const hint = $('#map-hint');
    if (hint) hint.textContent = '拖动旋转 · 滚轮缩放 · 点击地标';
    ensureMap3D().then(ok => {
      if (!ok) {
        // 纸图模式：比例尺、复位视角这些只对 3D 有意义，收起来
        if (scr) scr.classList.add('map-fallback');
        const aw = $('#atlas-wrap');
        if (aw) aw.hidden = false;
        if (hint) hint.textContent = '选择一片区域 · 点击纸上的地名';
        return;
      }
      if (scr) scr.classList.remove('map-fallback');
      requestAnimationFrame(() => {
        Map3D.resize();
        Map3D.show();
        if (reset) Map3D.reset();
      });
    });
  }

  function renderMapIndex() {
    const box = $('#map-index');
    if (!box || box.dataset.done) return;
    box.dataset.done = '1';
    box.innerHTML = '<div class="mi-head">四境索引 · INDEX</div>' +
      REGIONS.map(function (r, i) {
        return '<button class="mi' + (r.open ? ' open' : '') + '" data-region="' + r.id + '">' +
          '<span class="mi-no">0' + (i + 1) + '</span>' +
          '<span class="mi-body">' +
            '<span class="mi-name">' + esc(r.name) + '</span>' +
            '<span class="mi-en">' + esc(r.en || '') + '</span>' +
          '</span>' +
          '<span class="mi-st">' + (r.open ? '已启封' : '封存') + '</span>' +
        '</button>';
      }).join('');

    $$('.mi', box).forEach(function (b) {
      const rid = b.dataset.region;
      b.addEventListener('mouseenter', function () { if (window.Map3D) Map3D.highlight(rid, true); });
      b.addEventListener('mouseleave', function () { if (window.Map3D) Map3D.highlight(rid, false); });
      b.addEventListener('click', function () { onPickRegion(rid); });
    });
  }

  function bindMap() {
    renderMapIndex();

    // ---- 3D：复位视角 ----
    const rb = $('#map-reset');
    if (rb) rb.addEventListener('click', () => { if (window.Map3D) Map3D.reset(); closeMapCard(true); });

    // ---- 区域详情卡 ----
    const card = $('#map-card');
    if (card) {
      const x1 = $('#mc-x'), x2 = $('#mc-close2');
      if (x1) x1.addEventListener('click', () => closeMapCard());
      if (x2) x2.addEventListener('click', () => closeMapCard());
      const go = $('#mc-go');
      if (go) go.addEventListener('click', () => {
        if (!cardRegion) return;
        const r = REGIONS.find(x => x.id === cardRegion);
        if (!r || !r.open) { toast(r ? r.name + ' · 剧本封存中' : '尚未启封'); return; }
        const rid = cardRegion;
        closeMapCard(true);
        showScenario(rid);
      });
      const pv = $('#mc-prev'), nx = $('#mc-next');
      if (pv) pv.addEventListener('click', () => stepCard(-1));
      if (nx) nx.addEventListener('click', () => stepCard(1));
      card.addEventListener('click', e => e.stopPropagation());
    }

    // ---- 回退：手绘纸图的悬停预览 ----
    const pv = $('#map-preview');
    const atlas = $('#atlas-wrap');

    function showPreview(rid) {
      if (!pv || !atlas) return;
      const r = REGIONS.find(x => x.id === rid);
      if (!r) return;
      const i = REGIONS.findIndex(x => x.id === rid);
      $('#mp-no').textContent = 'REGION 0' + (i + 1);
      const st = $('#mp-state');
      st.textContent = r.open ? '已启封' : '封存中';
      st.className = 'mp-state' + (r.open ? '' : ' lock');
      $('#mp-name').textContent = r.name;
      $('#mp-en').textContent = r.en;
      $('#mp-hook').textContent = r.hook;
      $('#mp-ruler').textContent = r.ruler;
      $('#mp-climate').textContent = r.climate;
      pv.classList.add('on');
      const lab = $('.atlas-pin[data-region="' + rid + '"]');
      if (lab) lab.classList.add('lit');
    }
    function hidePreview() {
      if (pv) pv.classList.remove('on');
      $$('.atlas-pin').forEach(l => l.classList.remove('lit'));
    }
    function placePreview(e) {
      if (!pv) return;
      const w = pv.offsetWidth || 258;
      const h = pv.offsetHeight || 250;
      const pad = 18;
      let x = e.clientX + 26;
      let y = e.clientY - h / 2;
      if (x + w > window.innerWidth - pad) x = e.clientX - w - 26;
      if (x < pad) x = pad;
      y = Math.max(pad, Math.min(window.innerHeight - h - pad, y));
      pv.style.left = x + 'px';
      pv.style.top = y + 'px';
    }

    // ---- 纸图上的区域热区（位图版，位置由 HTML 里的 % 定位决定）----
    $$('.atlas-pin').forEach(g => {
      g.addEventListener('mouseenter', e => { showPreview(g.dataset.region); placePreview(e); });
      g.addEventListener('mousemove', e => { if (pv && pv.classList.contains('on')) placePreview(e); });
      g.addEventListener('mouseleave', hidePreview);
      g.addEventListener('click', () => {
        const rid = g.dataset.region;
        if (!REGIONS.find(x => x.id === rid)) return;
        hidePreview();
        openMapCard(rid);
      });
    });
  }

  /* ============================================================
     剧本详情
     ============================================================ */
  let currentRegionId = null;

  function showScenario(rid) {
    const r = REGIONS.find(x => x.id === rid);
    if (!r) return;
    currentRegionId = rid;
    const cover = window.SceneImages && SceneImages.cover(rid);
    const scBg = $('#sc-bg');
    scBg.style.backgroundImage = `url('${cover || r.img}')`;
    scBg.classList.toggle('has-scene', !!cover);
    $('#sc-kicker').innerHTML = '<span class="line"></span>' + r.en + ' / ' + (r.climate || '');
    $('#sc-name').textContent = r.name;
    $('#sc-sub').textContent = r.tagline || r.ruler;
    $('#sc-hook').textContent = r.hook;
    $('#sc-desc').textContent = r.intro || r.note || '';

    const meta = [
      { k: '立场', v: r.ruler },
      { k: '预计时长', v: r.duration || '——' },
      { k: '推理难度', v: r.difficulty || '——' }
    ];
    $('#sc-meta').innerHTML = meta.map(m => `<div class="m"><div class="k">${m.k}</div><div class="v">${esc(m.v)}</div></div>`).join('');

    const quote = r.excerpt || [r.hook, r.note || ''];
    $('#sc-quote').innerHTML = quote.filter(Boolean).map(t => `<p>${t}</p>`).join('');

    const idx = REGIONS.findIndex(x => x.id === r.id) + 1;
    const idxEl = $('#sc-idx');
    if (idxEl) idxEl.textContent = '0' + idx;
    const stEl = $('#sc-state');
    if (stEl) {
      stEl.textContent = r.open ? '已启封' : '封存中';
      stEl.className = 'sc-state' + (r.open ? '' : ' lock');
    }

    const enter = $('#sc-enter');
    const hasProgress = !!(S && S.region === r.id && S.node);
    enter.disabled = !r.open;
    enter.innerHTML = !r.open
      ? '剧本封存中'
      : (hasProgress ? '继续进度 <span class="ar">→</span>' : '进入剧本 <span class="ar">↓</span>');
    const rs = $('#sc-restart');
    rs.style.display = (r.open && hasProgress) ? 'inline-flex' : 'none';
    $('#sc-note').textContent = !r.open
      ? '※ 这个世界已经写好了，只是还没轮到它开口。'
      : (hasProgress
        ? '※ 已有一份进度。选择「继续进度」接着上一次，或者重新开始（会覆盖自动存档）。'
        : '※ 本章包含 5 个子地图、8 个结局。选择会被记录，进度自动保存。');

    show('scr-scenario');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /* ============================================================
     章节卡
     ============================================================ */
  function chapterCard(kicker, title, sub) {
    $('#cc-kicker').textContent = kicker;
    $('#cc-title').textContent = title;
    $('#cc-sub').textContent = sub;
    const cc = $('#chapter-card');
    cc.classList.add('on');
    return new Promise(res => setTimeout(() => {
      cc.classList.remove('on');
      setTimeout(res, 550);
    }, 1900));
  }

  /* ============================================================
     游戏主循环
     ============================================================ */
  /* 双层交叉淡入：新图先预解码，再在原位淡入并把旧层淡出。
     任何时刻都至少有一层是有图的，所以永远不会露出黑底。 */
  function fadeLayers(box, url, state) {
    const layers = box.querySelectorAll('.pb-layer');
    if (!layers.length) {
      box.style.backgroundImage = `url('${url}')`;
      return;
    }

    // 单层模式（鸿蒙 ArkWeb 用）：两层全屏背景图叠在一起时，软件合成器会把
    // 下半屏的 tile 丢掉不画。图片已经过 decode 预热，直接换 background-image
    // 不会出现黑帧，所以这里退化成单层直切，稳得多。
    if (window.__HM_NO_XFADE) {
      const nextUrlOnly = `url('${url}')`;
      if (box.style.backgroundImage === nextUrlOnly) return;
      layers.forEach(l => { l.classList.remove('on'); l.style.backgroundImage = ''; });
      box.style.backgroundImage = nextUrlOnly;
      return;
    }

    const cur = layers[state.i];
    const nextUrl = `url('${url}')`;
    // 当前可见层已经是这张图：什么都不用做（相邻节点大量复用同图）
    if (cur.style.backgroundImage === nextUrl) return;

    const nextIdx = state.i ^ 1;
    const next = layers[nextIdx];
    next.style.backgroundImage = nextUrl;

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      next.classList.add('on');
      cur.classList.remove('on');
      state.i = nextIdx;
    };
    // ArkWeb 上 decode() 有可能一直不 resolve，加超时兜底，避免新图永不显示
    setTimeout(reveal, 420);
    const img = new Image();
    img.onload = () => { (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(reveal); };
    img.onerror = reveal;
    img.src = url;
  }

  const pbState = { i: 0 };
  const proState = { i: 0 };

  function setPlayBg(node) {
    const place = node.place;
    const region = REGIONS.find(r => r.id === (S ? S.region : 'xilu'));
    const bg = $('#play-bg');
    // 优先用分场插画；该幕还没出图时回退到区域封面
    const scene = window.SceneImages && SceneImages.forNode(curNodeId);
    const url = scene || (region ? region.img : '');
    if (!url) return;

    // 只在类名真的变化时才改，避免每次重置 className 把 filter 过渡重跑一遍（那会闪）
    let want = 'play-bg';
    if (scene) {
      want += ' has-scene';
    } else {
      const tint = node.bg === 'cabin' ? 'tint-red' : (PLACE_TINT[place] || '');
      if (tint) want += ' ' + tint;
    }
    if (bg.className !== want) bg.className = want;

    fadeLayers(bg, url, pbState);
  }

  function updateHud(node) {
    const pl = PLACES[node.place];
    $('#hud-place').textContent = pl ? pl.name : '';
    $('#hud-time').textContent = node.time || (pl ? pl.hour : '');
    const hpP = clamp(S.hp, 0, 100);
    const sanP = clamp(S.san, 0, 100);
    const bar = (v, color) => `<div class="bar"><i style="transform:scaleX(${v / 100});background:${color}"></i></div>`;
    const infTxt = S.inf >= 80 ? '皮肤下有东西在动' : S.inf >= 50 ? '高热' : S.inf >= 20 ? '低烧' : '';
    $('#hud-stats').innerHTML = `
      <div class="stat ${hpP < 35 ? 'warn' : ''}"><span>体力</span>${bar(hpP, hpP < 35 ? '#b5543a' : '#8a7d5e')}<span class="num">${Math.round(hpP)}</span></div>
      <div class="stat ${sanP < 35 ? 'warn' : ''}"><span>精神</span>${bar(sanP, sanP < 35 ? '#b5543a' : '#7a6f8a')}<span class="num">${Math.round(sanP)}</span></div>
      <div class="stat"><span>物资</span><span class="num">${S.sup}</span></div>
      <div class="stat"><span>信用</span><span class="num">${S.cred}</span></div>
      ${infTxt ? `<div class="stat warn"><span>体征</span><span class="num" style="min-width:auto">${infTxt}</span></div>` : ''}
    `;
  }

  function applyFx(fx) {
    if (!fx) return;
    const diffs = [];
    Object.keys(fx).forEach(k => {
      const v = fx[k];
      if (k.indexOf('flag') === 0) { if (v) S.flags[v] = true; return; }
      if (!(k in S)) return;
      const before = S[k];
      if (k === 'hp' || k === 'san') S[k] = clamp(before + v, 0, 100);
      else S[k] = Math.max(0, before + v);
      const d = S[k] - before;
      if (d !== 0) diffs.push({ k: k, d: d });
    });
    diffs.forEach(o => {
      const sign = o.d > 0 ? '+' : '';
      toast(`${STAT_LABEL[o.k] || o.k} ${sign}${o.d}`, o.d > 0 ? 'up' : 'down');
    });
  }

  function addItems(list) {
    if (!list) return;
    list.forEach(it => {
      if (S.items.indexOf(it) === -1) {
        S.items.push(it);
        toast('获得 · ' + it);
      }
    });
  }

  function checkReq(req) {
    if (!req) return true;
    if (req.flag && !S.flags[req.flag]) return false;
    if (req.item && S.items.indexOf(req.item) === -1) return false;
    if (req.visited && !S.visited[req.visited]) return false;
    if (req.anyFlag) {
      let ok = false;
      req.anyFlag.forEach(f => { if (S.flags[f]) ok = true; });
      if (!ok) return false;
    }
    if (req.min) {
      for (const k in req.min) { if ((S[k] || 0) < req.min[k]) return false; }
    }
    return true;
  }

  function checkDeath() {
    if (S.hp <= 0) return 'dead_hp';
    if (S.san <= 0) return 'dead_san';
    if (S.inf >= 100) return 'dead_inf';
    return null;
  }

  let curNodeId = null;

  async function setNode(id) {
    const n = NODES[id];
    if (!n) { console.warn('missing node', id); return; }
    curNodeId = id;
    S.node = id;
    S.screen = 'play';
    S.visited[n.place] = true;
    skipping = false;
    $('#tap-hint').classList.remove('on');

    show('scr-play');
    setPlayBg(n);
    updateHud(n);
    $('#choices').innerHTML = '';
    $('#choices').classList.remove('on');
    $('.stage').scrollTop = 0;
    saveAuto();

    await playText(n.text);

    if (n.end) {
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = '<span class="idx">→</span><span>（继续）</span>';
      b.addEventListener('click', () => {
        S.done[n.place] = true;
        saveAuto();
        showPlaces();
      });
      const wrap = $('#choices');
      wrap.appendChild(b);
      wrap.classList.add('on');
      return;
    }
    renderChoices(n);
  }

  function renderChoices(n) {
    const wrap = $('#choices');
    wrap.innerHTML = '';
    const avail = (n.choices || []).filter(c => checkReq(c.req));
    avail.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = `<span class="idx">${String(i + 1).padStart(2, '0')}</span><span>${esc(c.t)}</span>`;
      b.addEventListener('click', () => pick(c));
      wrap.appendChild(b);
    });
    wrap.classList.add('on');
    window.__avail = avail;
  }

  function pick(c) {
    if (typing) return;
    applyFx(c.fx);
    addItems(c.items);
    saveAuto();
    const dead = checkDeath();
    if (dead) { setTimeout(() => showEnding(dead), 320); return; }
    if (!c.to) return;
    if (c.to.indexOf('e_') === 0) { setTimeout(() => showEnding(c.to), 260); return; }
    setNode(c.to);
  }

  /* ============================================================
     子地图
     ============================================================ */
  function placeState(pid) {
    if (!S) return 'lock';
    if (pid === 'qidao') return S.done.qidao ? 'done' : 'open';
    if (pid === 'k101' || pid === 'yx') {
      if (!S.done.qidao) return 'lock';
      return S.done[pid] ? 'done' : 'open';
    }
    if (pid === 'sui') {
      if (!S.done.qidao) return 'lock';
      if (S.flags.hasKey || S.flags.disguise) return S.done.sui ? 'done' : 'open';
      return 'need';
    }
    if (pid === 'yuetai') {
      if (S.visited.sui) return S.done.yuetai ? 'done' : 'open';
      return 'lock';
    }
    return 'lock';
  }

  function showPlaces() {
    if (!S) return;
    S.screen = 'places';
    saveAuto();
    const region = REGIONS.find(r => r.id === S.region) || REGIONS[1];
    $('#places-bg').style.backgroundImage = `url('${region.img}')`;

    const order = ['qidao', 'k101', 'yx', 'sui', 'yuetai'];
    const labelOf = {
      open: '可进入', done: '已探明', lock: '未解锁', need: '缺少门禁'
    };
    const hintOf = {
      lock: '需要先完成上一处',
      need: '需要钥匙，或者一身白雨衣'
    };

    $('#place-grid').innerHTML = order.map((pid, i) => {
      const p = PLACES[pid];
      const st = placeState(pid);
      const disabled = (st !== 'open');
      return `<button class="place-card ${st === 'lock' || st === 'need' ? 'lock' : ''}" data-pid="${pid}" ${disabled ? 'disabled' : ''}>
        <div class="pc-no">SECTOR 0${i + 1}</div>
        <div class="pc-name">${esc(p.name)}</div>
        <div class="pc-en">${esc(p.en)}</div>
        <div class="pc-desc">${esc(p.desc)}</div>
        <div class="pc-state ${st}"><i></i>${labelOf[st]}${hintOf[st] ? ' · ' + hintOf[st] : ''}</div>
      </button>`;
    }).join('');

    $$('.place-card').forEach(b => {
      b.addEventListener('click', () => {
        const pid = b.dataset.pid;
        if (placeState(pid) !== 'open') return;
        setNode(ENTRY[pid]);
      });
    });

    show('scr-places');
  }

  /* ============================================================
     结局
     ============================================================ */
  function showEnding(key) {
    const e = ENDINGS[key];
    if (!e) { showPlaces(); return; }
    S.ended = key;
    S.screen = 'ending';
    saveAuto();

    const region = REGIONS.find(r => r.id === (S ? S.region : 'xilu'));
    $('#end-bg').style.backgroundImage = `url('${region ? region.img : ''}')`;
    $('#end-no').textContent = e.no;
    $('#end-title').textContent = e.title;
    $('#end-en').textContent = e.en;
    $('#end-text').innerHTML = e.text.map(t => `<p>${t}</p>`).join('');
    $('#end-text').scrollTop = 0;
    show('scr-ending');
    $('#scr-ending').scrollTop = 0;
  }

  /* ============================================================
     档案 / 存档 UI
     ============================================================ */
  function openModal(title, html) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html;
    $('#modal').classList.add('on');
  }
  function closeModal() { $('#modal').classList.remove('on'); }

  function openJournal() {
    if (!S) return;
    const items = S.items.length
      ? `<ul>${S.items.map(i => `<li><span>CARRY</span><span>${esc(i)}</span></li>`).join('')}</ul>`
      : '<div class="empty-hint">你身上什么也没有。</div>';
    const flags = Object.keys(S.flags).filter(k => FLAG_LABEL[k]);
    const clues = flags.length
      ? `<ul>${flags.map(k => `<li><span>KNOWN</span><span>${esc(FLAG_LABEL[k])}</span></li>`).join('')}</ul>`
      : '<div class="empty-hint">你还什么都不知道。</div>';
    openModal('调查档案', `
      <h4>体力 / 精神 / 物资 / 信用</h4>
      <p>${Math.round(S.hp)} / ${Math.round(S.san)} / ${S.sup} / ${S.cred}
      ${S.inf > 0 ? '　·　<span style="color:#b5543a">体温偏高</span>' : ''}</p>
      <h4>随身物品</h4>${items}
      <h4>已知线索</h4>${clues}
    `);
  }

  function openSave(mode) {
    let html = '';
    for (let i = 1; i <= 3; i++) {
      const d = readSave(KEY_SLOT + i);
      const meta = d ? (PLACES[d.node] ? PLACES[d.node].name : '—') + ' · 纪历一〇七一年十一月六日' : '空槽位';
      html += `<div class="slot">
        <div class="s-info"><div class="s-name">存档 ${i}</div><div class="s-meta">${esc(meta)}</div></div>
        <div class="s-act">
          ${mode === 'save'
        ? `<button data-do="w" data-i="${i}">写入</button>`
        : (d ? `<button data-do="r" data-i="${i}">读取</button><button data-do="x" data-i="${i}">删除</button>` : '')}
        </div>
      </div>`;
    }
    openModal(mode === 'save' ? '保存进度' : '读取存档', html);

    $$('#modal-body [data-do]').forEach(b => {
      b.addEventListener('click', () => {
        const act = b.dataset.do;
        const i = b.dataset.i;
        if (act === 'w') { saveSlot(i); openSave('save'); }
        if (act === 'x') { safeLS.del(KEY_SLOT + i); openSave('load'); }
        if (act === 'r') {
          const d = readSave(KEY_SLOT + i);
          if (!d) return;
          S = d;
          closeModal();
          resume();
        }
      });
    });
  }

  function resume() {
    if (!S) return;
    refreshContinue();
    if (S.screen === 'ending' && S.ended) { showEnding(S.ended); return; }
    if (S.node && NODES[S.node]) { setNode(S.node); return; }
    if (S.screen === 'places') { showPlaces(); return; }
    showPlaces();
  }

  /* ============================================================
     流程入口
     ============================================================ */
  function startNewScenario(rid) {
    S = newState(rid);
    S.node = ENTRY.qidao;
    curNodeId = null;
    skipping = false;
    saveAuto();
    chapterCard('CHAPTER 01 / 第一幕', '锈轨黄昏', '西陆平原 · 纪历一〇七一年十一月六日')
      .then(() => setNode('q01'));
  }

  /* ============================================================
     事件绑定
     ============================================================ */
  function bind() {
    // 标题页
    $$('#scr-title [data-act]').forEach(b => {
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'new') {
          startPrologue(() => { showMap(true); });
        }
        if (a === 'continue') {
          const d = readSave(KEY_AUTO);
          if (!d) return;
          S = d; resume();
        }
        if (a === 'load') { openSave('load'); }
        if (a === 'world') {
          startPrologue(() => show('scr-title'));
        }
      });
    });

    // 序章
    $('#pro-next').addEventListener('click', proAct);
    $('#scr-prologue').addEventListener('click', e => {
      if (e.target.closest('#pro-next')) return;
      proAct();
    });

    // 剧本详情
    $('#sc-back').addEventListener('click', () => { showMap(true); });
    $('#sc-enter').addEventListener('click', () => {
      const r = REGIONS.find(x => x.id === currentRegionId);
      if (!r || !r.open) return;
      if (S && S.region === r.id && S.node) { resume(); return; }
      startNewScenario(r.id);
    });
    $('#sc-restart').addEventListener('click', () => {
      const r = REGIONS.find(x => x.id === currentRegionId);
      if (!r || !r.open) return;
      openModal('重新开始', `
        <p>从第一幕重新开始，当前进度与自动存档会被覆盖。这个操作无法撤销。</p>
        <div class="slot" style="margin-top:18px">
          <div class="s-info"><div class="s-name">${esc(r.name)} · ${esc(r.tagline || '')}</div><div class="s-meta">自动存档将被覆盖</div></div>
          <div class="s-act"><button id="cfm-restart">确定重开</button></div>
        </div>`);
      const btn = $('#cfm-restart');
      if (btn) btn.addEventListener('click', () => { closeModal(); startNewScenario(r.id); });
    });

    // 游戏内舞台点击 = 跳过打字
    $('.stage').addEventListener('click', () => {
      if (typing) skipping = true;
    });

    // HUD
    $$('.hud [data-act]').forEach(b => {
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'journal') openJournal();
        if (a === 'places') showPlaces();
        if (a === 'save') openSave('save');
        if (a === 'menu') {
          openModal('暂停', `
            <div class="slot"><div class="s-info"><div class="s-name">回到大地图</div><div class="s-meta">进度已自动保存</div></div><div class="s-act"><button data-go="map">前往</button></div></div>
            <div class="slot"><div class="s-info"><div class="s-name">回到标题</div><div class="s-meta">本回合的所有状态会保留在自动存档</div></div><div class="s-act"><button data-go="title">前往</button></div></div>
          `);
          $$('#modal-body [data-go]').forEach(x => x.addEventListener('click', () => {
            closeModal();
            if (x.dataset.go === 'map') { showMap(true); }
            if (x.dataset.go === 'title') { refreshContinue(); show('scr-title'); }
          }));
        }
      });
    });

    // 子地图 footer
    $$('#scr-places [data-act]').forEach(b => {
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'casefile') openJournal();
        if (a === 'save') openSave('save');
        if (a === 'toMap') { showMap(true); }
      });
    });

    // 结局页
    $$('#scr-ending [data-act]').forEach(b => {
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'toMap') { showMap(true); }
        if (a === 'restart') { showScenario('xilu'); setVB({ ...VB0 }); }
      });
    });

    // 弹窗
    $('#modal').addEventListener('click', e => {
      if (e.target.id === 'modal') closeModal();
    });
    $$('[data-act="closeModal"]').forEach(b => b.addEventListener('click', closeModal));

    // 键盘
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if ($('#modal') && $('#modal').classList.contains('on')) { closeModal(); return; }
        if ($('#scr-scenario').classList.contains('on')) { showMap(true); return; }
      }
      if ($('#scr-play').classList.contains('on')) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (typing) { skipping = true; return; }
          const avail = window.__avail || [];
          if (avail.length === 1) pick(avail[0]);
        }
        if (/^[1-9]$/.test(e.key)) {
          const avail = window.__avail || [];
          const c = avail[parseInt(e.key, 10) - 1];
          if (c && !typing) pick(c);
        }
      }
      if ($('#scr-prologue').classList.contains('on') && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault(); proAct();
      }
    });
  }

  /* ============================================================
     启动
     ============================================================ */
  function boot() {
    if (window.__yhjBooted) return;
    window.__yhjBooted = true;
    bindMap();
    bind();
    refreshContinue();
    show('scr-title');
    setTimeout(() => document.body.classList.add('ready'), 60);
  }

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
