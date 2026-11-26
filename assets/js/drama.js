/* ============================================================
   剧本杀 · 引擎（本地规则 DM）
   ------------------------------------------------------------
   现在的 DM 是「规则判定」：把玩家输入和 act.actions[].keys 做匹配，
   命中就给叙述 / 线索 / 推进。接口按云端 AI DM 的形状设计——
     Drama.ask(text) -> Promise<{ say, who, clue, next }>
   以后接 CloudBase 云函数只要换掉 ask() 内部实现，界面层不用动。

   对外：window.Drama = { start, ask, exit, state, scripts }
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };

  var SAVE_PREFIX = 'yhj_drama_';

  var S = null;        // 当前局状态
  var SC = null;       // 当前剧本
  var busy = false;

  /* ============================================================
     工具
     ============================================================ */
  function showScreen(id) {
    $$('.screen').forEach(function (s) { s.classList.remove('on'); });
    var el = document.getElementById(id);
    if (el) el.classList.add('on');
    if (window.Map3D && id !== 'scr-map') window.Map3D.hide();
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function scrollBottom() {
    var st = $('#jr-stage');
    if (st) st.scrollTop = st.scrollHeight;
  }

  /* ============================================================
     渲染
     ============================================================ */
  function pushMsg(m) {
    var flow = $('#jr-flow');
    if (!flow) return;
    var d = document.createElement('div');

    if (m.who === 'player') {
      d.className = 'jr-msg jr-me';
      d.innerHTML = '<span class="jr-bubble">' + esc(m.say) + '</span>';
    } else if (m.who === 'clue') {
      d.className = 'jr-msg jr-cluecard';
      d.innerHTML =
        '<span class="jr-cc-k">新线索</span>' +
        '<span class="jr-cc-name">' + esc(m.name) + '</span>' +
        '<span class="jr-cc-text">' + esc(m.say) + '</span>';
    } else {
      var npc = (SC.npcs && SC.npcs[m.who]) || SC.npcs.narrator;
      var isNarr = m.who === 'narrator';
      d.className = 'jr-msg ' + (isNarr ? 'jr-narr' : 'jr-npc');
      d.innerHTML = isNarr
        ? '<p>' + esc(m.say) + '</p>'
        : '<span class="jr-who" style="color:' + npc.color + '">' + esc(npc.name) +
          '<em>' + esc(npc.role) + '</em></span>' +
          '<p>' + esc(m.say) + '</p>';
    }

    flow.appendChild(d);
    requestAnimationFrame(function () { d.classList.add('on'); });
    scrollBottom();
  }

  function clearFlow() {
    var flow = $('#jr-flow');
    if (flow) flow.innerHTML = '';
  }

  function updateHud() {
    if (!S || !SC) return;
    var act = SC.acts[S.act];
    var a = $('#jr-act'); if (a) a.textContent = act ? act.name : '';
    var p = $('#jr-place'); if (p) p.textContent = act ? act.place : '';

    var found = S.clues.length;
    var total = Object.keys(SC.clues).length;
    var cn = $('#jr-clue-n');
    if (cn) cn.textContent = found + '/' + total;

    renderSuggest();
    renderPanel();
  }

  function renderSuggest() {
    var box = $('#jr-suggest');
    if (!box || !S || !SC) return;
    var act = SC.acts[S.act];
    if (!act) { box.innerHTML = ''; return; }
    var hints = (act.hint || []).slice(0, 5);
    box.innerHTML = hints.map(function (h) {
      return '<button class="jr-chip" type="button">' + esc(h) + '</button>';
    }).join('');
    $$('.jr-chip', box).forEach(function (b) {
      b.addEventListener('click', function () { submit(b.textContent); });
    });
  }

  /* ============================================================
     线索 / 人物面板
     ============================================================ */
  function renderPanel() {
    if (!S || !SC) return;

    var cl = $('#jr-panel-clues');
    if (cl) {
      var total = Object.keys(SC.clues).length;
      var gotList = S.clues.filter(function (id) { return !!SC.clues[id]; });
      var html = gotList.map(function (id) {
        var c = SC.clues[id];
        return '<li class="got"><b>' + esc(c.name) + '</b>' +
          '<span>' + esc(c.text) + '</span></li>';
      }).join('');
      var miss = total - gotList.length;
      if (miss > 0) {
        html += '<li class="jr-miss">还有 ' + miss + ' 条线索没有找到</li>';
      }
      cl.innerHTML = html;
    }

    var cast = $('#jr-panel-cast');
    if (cast) {
      cast.innerHTML = Object.keys(SC.npcs).filter(function (k) {
        return k !== 'narrator';
      }).map(function (k) {
        var n = SC.npcs[k];
        return '<li><b style="color:' + n.color + '">' + esc(n.name) +
          '</b><span>' + esc(n.role) + '</span></li>';
      }).join('');
    }
  }

  function openPanel(which) {
    var p = $('#jr-panel');
    if (!p) return;
    p.dataset.tab = which || 'clues';
    $$('.jr-tab', p).forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === p.dataset.tab);
    });
    $$('.jr-pane', p).forEach(function (b) {
      b.classList.toggle('on', b.dataset.pane === p.dataset.tab);
    });
    var k = $('#jr-panel-k');
    if (k) k.textContent = p.dataset.tab === 'cast' ? 'CAST' : 'CASE FILE';
    renderPanel();
    showScreen('scr-sheet');
  }

  function closePanel() {
    if (document.getElementById('scr-sheet') && $('#scr-sheet').classList.contains('on')) {
      showScreen('scr-script');
    }
  }

  /* ============================================================
     判定：规则 DM
     ============================================================ */
  function pickAction(act, text) {
    var best = null, bestScore = 0, bestIdx = -1;
    var list = act.actions || [];

    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var used = S.done.indexOf(S.act + ':' + i) >= 0;
      if (used && a.once !== false) continue;   // once 默认 true

      var sc = 0;
      (a.keys || []).forEach(function (k) {
        if (text.indexOf(k) >= 0 && k.length > sc) sc = k.length;
      });
      if (!sc) continue;

      // 同分时按 order 小的先出（温特先给账本，再给氯仿）
      var ord = a.order || 1;
      if (sc > bestScore ||
          (sc === bestScore && best && ord < (best.order || 1))) {
        best = a; bestScore = sc; bestIdx = i;
      }
    }
    return best ? { action: best, index: bestIdx } : null;
  }

  function giveClue(id) {
    if (!id || S.clues.indexOf(id) >= 0) return false;
    if (!SC.clues[id]) return false;
    S.clues.push(id);
    var c = SC.clues[id];
    pushMsg({ who: 'clue', name: c.name, say: c.text });
    return true;
  }

  function gotoAct(next) {
    S.act = next;
    save();
    updateHud();
    var act = SC.acts[next];
    if (!act) return;
    (act.intro || []).forEach(pushMsg);
  }

  function pickFallback(act) {
    var f = act.fallback || ['这条路走不通。'];
    if (typeof f === 'string') return f;
    return f[Math.floor(Math.random() * f.length)];
  }

  /* ---------- 指认 ---------- */
  function resolveAccuse(text) {
    var hit = null;
    Object.keys(SC.npcs).forEach(function (k) {
      if (k === 'narrator') return;
      var n = SC.npcs[k];
      if (text.indexOf(n.name) >= 0) { hit = k; return; }
    });
    if (!hit) {
      pushMsg({ who: 'narrator', say: '你得说一个名字。「指认 温特」这样。' });
      return;
    }

    var right = hit === SC.culprit;
    var proof = false;
    (SC.solidProof || []).forEach(function (combo) {
      if (combo.every(function (c) { return S.clues.indexOf(c) >= 0; })) proof = true;
    });

    var e = SC.endings[(right && proof) ? 'win' : 'lose'];
    S.over = true;
    S.ending = right && proof ? 'win' : 'lose';
    save();

    pushMsg({
      who: 'narrator',
      say: '你说出了那个名字：' + SC.npcs[hit].name + '。'
    });
    showEnding(e);
  }

  function showEnding(e) {
    var flow = $('#jr-flow');
    if (!flow) return;
    var d = document.createElement('div');
    d.className = 'jr-msg jr-ending';
    d.innerHTML =
      '<span class="jr-end-k">' + esc(e.title) + '</span>' +
      e.lines.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') +
      '<div class="jr-end-actions">' +
        '<button class="btn-ghost" id="jr-end-back">返回地区</button>' +
        '<button class="btn-primary" id="jr-end-again">重开这一局</button>' +
      '</div>';
    flow.appendChild(d);
    requestAnimationFrame(function () {
      d.classList.add('on');
      try { d.scrollIntoView({ block: 'end' }); } catch (e) { /* 老内核没这个参数 */ }
    });
    scrollBottom();
    setTimeout(scrollBottom, 120);
    setTimeout(scrollBottom, 480);

    var back = $('#jr-end-back');
    if (back) back.addEventListener('click', exit);
    var again = $('#jr-end-again');
    if (again) again.addEventListener('click', function () { start(SC.id, true); });

    var form = $('#jr-form');
    if (form) form.style.display = 'none';
    var sug = $('#jr-suggest');
    if (sug) sug.innerHTML = '';
  }

  /* ============================================================
     云端 DM（可选）
     ------------------------------------------------------------
     不开就是纯本地规则，开了也只是把「已判定好的那句话」发给云函数
     换个说法。判定、线索、幕次、结局始终在本地/脚本骨架里，模型改不动。
        Drama.setRemote('https://<env>.service.tcloudbase.com/drama-dm')
     ============================================================ */
  var REMOTE = '';

  function remoteAsk(payload) {
    return new Promise(function (resolve, reject) {
      if (!REMOTE) return reject(new Error('remote off'));
      var ctl = null;
      var timer = null;
      var opt = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      };
      try {
        if (window.AbortController) {
          ctl = new AbortController();
          opt.signal = ctl.signal;
        }
      } catch (e) { ctl = null; }

      timer = setTimeout(function () {
        if (ctl) { try { ctl.abort(); } catch (e) {} }
        reject(new Error('remote timeout'));
      }, 9000);

      fetch(REMOTE, opt).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(resolve).catch(function (e) {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  /* 一条判定落地：说一句、给线索、切幕 */
  function applyHit(a, idx, sayOverride) {
    S.done.push(S.act + ':' + idx);
    var say = sayOverride || a.say;
    var who = a.who || 'narrator';
    pushMsg({ who: who, say: say });
    (a.give || []).forEach(giveClue);
    if (a.next) {
      setTimeout(function () { gotoAct(a.next); }, 420);
    }
    save();
    updateHud();
  }

  /* ============================================================
     主循环
     ============================================================ */
  function submit(raw) {
    if (busy || !S || !SC || S.over) return;
    var text = String(raw || '').trim();
    if (!text) return;

    pushMsg({ who: 'player', say: text });
    var input = $('#jr-say');
    if (input) input.value = '';

    // 随时可以推倒重来（不弹 confirm：ArkWeb 里的 confirm 不一定回得来）
    if (text.indexOf('重开') >= 0 || text.indexOf('重新开始') >= 0) {
      start(SC.id, true);
      return;
    }

    var act = SC.acts[S.act];
    if (!act) return;

    // 第三幕：只认「指认」
    if (act.accuse) {
      resolveAccuse(text);
      save();
      return;
    }

    var hit = pickAction(act, text);

    if (!hit) {
      pushMsg({ who: 'narrator', say: pickFallback(act) });
      save();
      return;
    }

    var a = hit.action;

    if (!REMOTE) {
      applyHit(a, hit.index);
      return;
    }

    // 有云端：先显示「正在想」，拿到改写结果再落地；失败就用原文
    var typing = pushPending();
    busy = true;
    remoteAsk({
      scriptId: SC.id,
      actId: S.act,
      text: text,
      action: { who: a.who, say: a.say, give: a.give || [], next: a.next || null },
      npcs: SC.npcs,
      got: S.clues
    }).then(function (res) {
      dropPending(typing);
      busy = false;
      applyHit(a, hit.index, res && res.say);
    }).catch(function () {
      dropPending(typing);
      busy = false;
      applyHit(a, hit.index);
    });
  }

  /* 云端思考中的占位气泡 */
  function pushPending() {
    var flow = $('#jr-flow');
    if (!flow) return null;
    var d = document.createElement('div');
    d.className = 'jr-msg jr-narr jr-pending';
    d.innerHTML = '<p>· · ·</p>';
    flow.appendChild(d);
    requestAnimationFrame(function () { d.classList.add('on'); });
    scrollBottom();
    return d;
  }

  function dropPending(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  /* ============================================================
     存档
     ============================================================ */
  function save() {
    if (!S) return;
    try {
      localStorage.setItem(SAVE_PREFIX + S.scriptId, JSON.stringify(S));
    } catch (e) { /* 隐私模式下会失败，忽略 */ }
  }

  function load(scriptId) {
    try {
      var raw = localStorage.getItem(SAVE_PREFIX + scriptId);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ============================================================
     启动
     ============================================================ */
  function start(scriptId, fresh) {
    var sc = (window.DRAMA_SCRIPTS || {})[scriptId];
    if (!sc) {
      if (window.toast) window.toast('这个剧本还没有内容');
      return;
    }
    SC = sc;

    var saved = fresh ? null : load(scriptId);
    S = null;
    if (saved && saved.act && sc.acts[saved.act] && !saved.over) {
      S = saved;
    }
    if (!S) {
      S = {
        scriptId: scriptId,
        act: Object.keys(sc.acts)[0],
        clues: [],
        done: [],
        over: false,
        ending: null
      };
    }

    clearFlow();
    closePanel();
    showScreen('scr-script');
    var form = $('#jr-form');
    if (form) form.style.display = '';
    var title = $('#jr-title');
    if (title) title.textContent = sc.full || sc.title;

    updateHud();

    if (S.done.length === 0) {
      (sc.prologue || []).forEach(pushMsg);
      var a1 = sc.acts[S.act];
      (a1.intro || []).forEach(pushMsg);
    } else {
      pushMsg({ who: 'narrator', say: '（接着上一次。）' });
      var act = sc.acts[S.act];
      if (act) (act.intro || []).forEach(pushMsg);
      pushMsg({
        who: 'narrator',
        say: '你已经拿到 ' + S.clues.length + ' 条线索。想从头再来，输入「重开」。'
      });
    }
    save();
  }

  function exit() {
    closePanel();
    if (window.RegionTab) window.RegionTab.open('region');
    else showScreen('scr-map');
  }

  /* ============================================================
     绑定
     ============================================================ */
  function bind() {
    var form = $('#jr-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        submit($('#jr-say').value);
      });
    }

    var bc = $('#jr-clues');
    if (bc) bc.addEventListener('click', function () { openPanel('clues'); });
    var bcast = $('#jr-cast');
    if (bcast) bcast.addEventListener('click', function () { openPanel('cast'); });

    var panel = $('#jr-panel');
    if (panel) {
      $$('.jr-tab', panel).forEach(function (b) {
        b.addEventListener('click', function () { openPanel(b.dataset.tab); });
      });
      var x = $('#jr-panel-x');
      if (x) x.addEventListener('click', closePanel);
    }

    var bk = $('#jr-back');
    if (bk) bk.addEventListener('click', exit);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var sh = $('#scr-sheet');
      if (sh && sh.classList.contains('on')) {
        closePanel();
        e.stopPropagation();
      }
    });
  }

  function boot() {
    if (window.__dramaBooted) return;
    window.__dramaBooted = true;
    bind();
  }

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();

  window.Drama = {
    start: start,
    exit: exit,
    ask: submit,
    state: function () { return S; },
    scripts: function () { return window.DRAMA_SCRIPTS || {}; },
    setRemote: function (url) { REMOTE = String(url || ''); return REMOTE; },
    remote: function () { return REMOTE; }
  };
})();
