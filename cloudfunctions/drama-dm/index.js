/**
 * 剧本杀 DM 云函数（CloudBase · HTTP 访问）
 * ------------------------------------------------------------
 * 作用：把「规则判定」留在本地/服务端脚本骨架里，只让模型改写叙述口吻。
 *      模型拿到的是一句已经判定好的 say，任务只有「换个人话说一遍」，
 *      不能新增线索、人名、地点、结论 —— 这样 AI 再飘也改不动剧情骨架。
 *
 * 请求（POST JSON）：
 *   {
 *     scriptId: 'valan-lower',
 *     actId: 'A1',
 *     text: '检查阀门',                       // 玩家原话
 *     action: { who: 'narrator', say: '……', give: ['C02'], next: null },
 *     npcs: { narrator: {name:'旁白',role:''}, ... },
 *     got: ['C01']                            // 已拿到的线索 id
 *   }
 *
 * 响应（JSON）：
 *   { ok: true, say: '……', source: 'llm' | 'fallback' }
 *
 * 环境变量（在云函数配置页里加，不要写进仓库）：
 *   LLM_BASE   https://api.deepseek.com/v1        （OpenAI 兼容即可）
 *   LLM_KEY    sk-xxxx
 *   LLM_MODEL  deepseek-chat
 *   LLM_TIMEOUT_MS  8000（可选）
 *
 * 任何一步失败都退化成 action.say 原文，前端永远拿得到一句能显示的话。
 */
'use strict';

const https = require('https');
const { URL } = require('url');

const MAX_SAY = 420;

function json(statusCode, obj) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(obj)
  };
}

function pickBody(event) {
  if (!event) return {};
  if (event.body) {
    var raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }
  return event;
}

function postJson(urlStr, headers, payload, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var u = new URL(urlStr);
    var body = Buffer.from(JSON.stringify(payload), 'utf8');
    var req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': body.length
      }, headers || {})
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('LLM HTTP ' + res.statusCode + ' ' + text.slice(0, 200)));
        }
        try { resolve(JSON.parse(text)); }
        catch (e) { reject(new Error('LLM 返回不是 JSON: ' + text.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, function () {
      req.destroy(new Error('LLM timeout'));
    });
    req.write(body);
    req.end();
  });
}

function cleanSay(s, fallback) {
  if (typeof s !== 'string') return fallback;
  var t = s.replace(/\r/g, '').replace(/^\s+|\s+$/g, '');
  // 模型爱加旁白标签，去掉
  t = t.replace(/^(旁白|DM|主持人)\s*[：:]\s*/, '');
  t = t.replace(/\n{2,}/g, '\n');
  if (!t) return fallback;
  if (t.length > MAX_SAY) t = t.slice(0, MAX_SAY) + '…';
  return t;
}

const SYSTEM = [
  '你是一个末世文字冒险的 DM（主持人），语气冷、克制、具体，短句为主。',
  '你只会收到一条已经判定好的「原始叙述」，你的唯一任务是把它换一种说法重写。',
  '硬规则：',
  '1. 不得新增任何人物、地点、线索、数字、因果结论；不得改变谁说了什么。',
  '2. 不得透露凶手、结局、后续剧情；不得评价玩家的推理。',
  '3. 保留原叙述里的全部关键信息（物品、方位、动作结果）。',
  '4. 长度不超过原文的 1.6 倍，不加标题、不加引号包裹、不写「旁白：」。',
  '5. 只输出重写后的正文，不要任何解释。'
].join('\n');

async function rewrite(payload) {
  var base = (process.env.LLM_BASE || '').replace(/\/+$/, '');
  var key = process.env.LLM_KEY || '';
  var model = process.env.LLM_MODEL || 'deepseek-chat';
  var timeout = parseInt(process.env.LLM_TIMEOUT_MS || '8000', 10);
  if (!base || !key) throw new Error('LLM_BASE / LLM_KEY 未配置');

  var who = payload.action && payload.action.who;
  var npc = (payload.npcs && payload.npcs[who]) || null;
  var speaker = who === 'narrator' || !npc
    ? '旁白（第三人称，不出现「你听到」这类转述）'
    : npc.name + '（' + (npc.role || '') + '，第一人称说话，用引号）';

  var user = [
    '场景：' + (payload.actId || '') + ' · ' + (payload.scriptId || ''),
    '说话人：' + speaker,
    '玩家刚刚做的是：「' + String(payload.text || '').slice(0, 80) + '」',
    '原始叙述：',
    String((payload.action && payload.action.say) || ''),
    '',
    '把它重写一遍，保持信息完全一致。'
  ].join('\n');

  var r = await postJson(base + '/chat/completions', {
    'Authorization': 'Bearer ' + key
  }, {
    model: model,
    temperature: 0.8,
    max_tokens: 400,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user }
    ]
  }, timeout);

  var txt = r && r.choices && r.choices[0] && r.choices[0].message
    ? r.choices[0].message.content
    : '';
  if (!txt) throw new Error('LLM 空返回');
  return txt;
}

exports.main = async function (event) {
  var method = (event && (event.httpMethod || event.requestContext && event.requestContext.httpMethod)) || 'POST';
  if (method === 'OPTIONS') return json(200, { ok: true });

  var body = pickBody(event);
  var action = body.action;
  var fallback = (action && typeof action.say === 'string') ? action.say : '';

  if (!action || !fallback) {
    return json(400, { ok: false, error: 'missing action.say' });
  }

  // 只接受「改写」请求，不接受客户端直接指定线索 / 幕次
  var safe = {
    scriptId: String(body.scriptId || '').slice(0, 40),
    actId: String(body.actId || '').slice(0, 12),
    text: String(body.text || '').slice(0, 80),
    action: {
      who: String(action.who || 'narrator').slice(0, 20),
      say: String(fallback).slice(0, 600)
    },
    npcs: body.npcs && typeof body.npcs === 'object' ? body.npcs : {}
  };

  try {
    var txt = await rewrite(safe);
    return json(200, { ok: true, say: cleanSay(txt, fallback), source: 'llm' });
  } catch (e) {
    return json(200, {
      ok: true,
      say: fallback,
      source: 'fallback',
      note: String(e && e.message || e).slice(0, 160)
    });
  }
};
