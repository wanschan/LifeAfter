/* ============================================================
   剧本杀「地区」模块 —— 视图切换 / 剧本选择 / 票据入场动画
   依赖：无（自包含；只调用 window.Map3D.hide/show 做画布让位）
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };

  /* ---------- 剧本清单 ----------
     id 用于存档键与后续 DM 接口的 scriptId；no 是卡片编号；tone 决定封条配色 */
  var DRAMAS = [
    {
      id: 'valan-lower',
      no: '01',
      num: '001',
      name: '瓦兰 西下城区',
      full: '维兰索尔-瓦兰 西下城区',
      en: 'VALAN · LOWER WEST',
      line: '铁轨在北，污水在南。三号水塔下面埋着不该埋的东西。',
      meta: '4-6 人 · 约 150 分钟 · 硬推理',
      tone: 'ash'
    },
    {
      id: 'valan-chapel',
      no: '02',
      num: '002',
      name: '瓦兰大礼拜堂',
      full: '维兰索尔-瓦兰大礼拜堂',
      en: 'VALAN · THE GREAT CHAPEL',
      line: '钟停在十一点零七分。那天的祷告，没有人做完。',
      meta: '5-7 人 · 约 180 分钟 · 阵营',
      tone: 'gold'
    },
    {
      id: 'valan-post',
      no: '03',
      num: '003',
      name: '四方驿站',
      full: '维兰索尔-四方驿站',
      en: 'VALAN · THE CROSSROADS POST',
      line: '四封信，四个方向，只有一个收件人还活着。',
      meta: '3-5 人 · 约 120 分钟 · 本格',
      tone: 'rust'
    }
  ];

  var mode = 'world';       // 'world' | 'region'
  var picked = null;        // 当前选中的剧本
  var timers = [];

  function later(fn, ms) {
    timers.push(setTimeout(fn, ms));
    return timers[timers.length - 1];
  }
  function clearTimers() {
    timers.forEach(function (t) { clearTimeout(t); });
    timers = [];
  }

  function showScreen(id) {
    $$('.screen').forEach(function (s) { s.classList.remove('on'); });
    var el = document.getElementById(id);
    if (el) el.classList.add('on');
    if (window.Map3D && id !== 'scr-map') window.Map3D.hide();
  }

  /* ============================================================
     顶栏切换
     ============================================================ */
  function applyMode(next, animate) {
    mode = next || 'world';
    var scr = $('#scr-map');
    if (!scr) return;

    scr.classList.toggle('mode-region', mode === 'region');
    $$('#map-tabs .mt').forEach(function (b) {
      var on = b.dataset.mode === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    var wrap = $('#region-wrap');
    if (wrap) wrap.hidden = mode !== 'region';

    var hint = $('#map-hint');
    if (hint) hint.textContent = mode === 'region'
      ? '选择一处地点 · 掀开封条'
      : '拖动旋转 · 滚轮缩放 · 点击地标';

    var en = $('#mb-en');
    if (en) en.textContent = mode === 'region'
      ? 'OMEGA CHRONICLE · 维兰索尔 三处地点'
      : 'OMEGA CHRONICLE · 旧大陆 四境图';

    if (mode === 'region') {
      if (window.Map3D) window.Map3D.hide();
      if (animate) {
        var list = $('#rg-list');
        if (list) {
          list.classList.remove('rg-in');
          void list.offsetWidth;
          list.classList.add('rg-in');
        }
      }
    } else if (window.Map3D) {
      // 从「地区」切回来时 3D 可能还没初始化过（进地区时跳过了），这里补一次
      var hasCanvas = document.querySelector('#map3d canvas');
      if (!hasCanvas && window.ensureMap3D) {
        if (animate) {
          window.ensureMap3D().then(function (ok) {
            if (ok) { window.Map3D.resize(); window.Map3D.show(); }
          });
        }
      } else if (animate && window.Map3D.supported && window.Map3D.supported()) {
        requestAnimationFrame(function () {
          window.Map3D.resize();
          window.Map3D.show();
        });
      }
    }
  }

  /* ============================================================
     剧本卡片
     ============================================================ */
  function renderList() {
    var box = $('#rg-list');
    if (!box) return;
    box.innerHTML = DRAMAS.map(function (d) {
      return '' +
        '<button class="rg-card tone-' + d.tone + '" data-id="' + d.id + '">' +
          '<span class="rc-no">' + d.no + '</span>' +
          '<span class="rc-body">' +
            '<span class="rc-name">' + d.full + '</span>' +
            '<span class="rc-en">' + d.en + '</span>' +
            '<span class="rc-line">' + d.line + '</span>' +
            '<span class="rc-meta">' + d.meta + '</span>' +
          '</span>' +
          '<span class="rc-go">掀开封条 <i>&#8594;</i></span>' +
        '</button>';
    }).join('');

    $$('.rg-card', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var d = DRAMAS.filter(function (x) { return x.id === btn.dataset.id; })[0];
        if (d) playTicket(d);
      });
    });
  }

  /* ============================================================
     票据入场动画
     0.06s 票面上浮   0.9s 撕下票根   1.5s 盖章   2.95s 全场淡出
     ============================================================ */
  function playTicket(d) {
    picked = d;
    var scr = $('#scr-enter');
    if (!scr) { openDrama(); return; }

    clearTimers();
    scr.classList.remove('in', 'tear', 'sealed', 'out');

    var setTxt = function (sel, v) {
      var el = $(sel);
      if (el) el.textContent = v;
    };
    setTxt('#tk-brand', '余烬纪 · OMEGA CHRONICLE');
    setTxt('#tk-name', d.name);
    setTxt('#tk-si', d.en);
    setTxt('#tk-no', d.num || d.no);
    setTxt('#tk-line', '点击开启，进入这段故事');

    showScreen('scr-enter');
    void scr.offsetWidth;          // 强制重排，保证每次都能重放动画

    later(function () { scr.classList.add('in'); }, 60);
    later(function () { scr.classList.add('tear'); }, 900);
    later(function () {
      scr.classList.add('sealed');
      setTxt('#tk-line', '欢迎入场，角色已就位…');
    }, 1500);
    later(function () { scr.classList.add('out'); }, 2950);
    later(function () { openDrama(); }, 3480);
  }

  function skipTicket() {
    clearTimers();
    openDrama();
  }

  /* ============================================================
     剧本开始 demo
     ============================================================ */
  function hasScript(id) {
    return !!(window.DRAMA_SCRIPTS && window.DRAMA_SCRIPTS[id]);
  }

  function openDrama() {
    var d = picked || DRAMAS[0];
    var setTxt = function (sel, v) {
      var el = $(sel);
      if (el) el.textContent = v;
    };
    setTxt('#dr-k', d.full);
    setTxt('#dr-en', d.en);
    setTxt('#dr-meta', d.meta);
    setTxt('#dr-p', d.line);

    var ready = hasScript(d.id);
    var go = $('#dr-go');
    if (go) {
      go.innerHTML = (ready ? '进入剧本' : '剧本筹备中') +
        (ready ? ' <span class="ar">&#8594;</span>' : '');
    }
    var em = $('#dr-h-em');
    if (em) em.textContent = ready ? 'play' : 'demo';
    setTxt('#dr-note', ready ? '' : '这一处还在写。先玩《西下城区》。');

    showScreen('scr-drama');
  }

  function backToRegion() {
    clearTimers();
    showScreen('scr-map');
    applyMode('region', true);
  }

  /* ============================================================
     绑定
     ============================================================ */
  function bind() {
    $$('#map-tabs .mt').forEach(function (b) {
      b.addEventListener('click', function () {
        applyMode(b.dataset.mode, true);
      });
    });

    var enter = $('#scr-enter');
    if (enter) enter.addEventListener('click', skipTicket);

    var back = $('#dr-back');
    if (back) back.addEventListener('click', backToRegion);

    var go = $('#dr-go');
    if (go) {
      go.addEventListener('click', function () {
        var d = picked || DRAMAS[0];
        if (!hasScript(d.id)) {
          var note = $('#dr-note');
          if (note) note.textContent = '这一处还在写。先玩《西下城区》。';
          return;
        }
        if (window.Drama) window.Drama.start(d.id);
      });
    }
  }

  function boot() {
    if (window.__regionBooted) return;
    window.__regionBooted = true;
    renderList();
    bind();
    applyMode('world', false);
  }

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();

  window.RegionTab = {
    isRegion: function () { return mode === 'region'; },
    mode: function () { return mode; },
    apply: function () { applyMode(mode, false); },
    set: function (m) { applyMode(m || 'world', true); },
    open: function (m) { showScreen('scr-map'); applyMode(m || 'world', true); },
    dramas: DRAMAS,
    picked: function () { return picked; },
    pickedItem: function () { return picked; },
    play: function () { if (picked) playTicket(picked); }
  };
})();
