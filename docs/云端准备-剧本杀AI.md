# 剧本杀 AI DM · 云端要准备什么

> 现状：**不准备任何云端东西，游戏也能完整玩完**。
> `assets/js/drama.js` 里跑的是本地规则 DM，判定、线索、结局都在本机完成。
> 下面这份清单只为「让 AI 换着法儿说同一句话」这件事服务。

---

## 一、必须准备的（只有接 AI 才需要）

| # | 要准备的东西 | 放在哪 | 为什么 |
|---|---|---|---|
| 1 | CloudBase 环境 ID | 控制台 → 环境 → 环境 ID，形如 `lifeafter-3g8xxx` | 云函数、HTTP 访问路径都挂在这个环境下；前端要知道往哪儿发请求 |
| 2 | 一个大模型 API Key | **云函数环境变量 `LLM_KEY`**，不要写进仓库、不要写进 HAP | 前端 JS / HAP 里的字符串能被抓包和解包直接读走；放在云函数里，客户端只拿到「改写后的句子」 |
| 3 | 模型地址与型号 | 环境变量 `LLM_BASE` / `LLM_MODEL` | 换供应商（DeepSeek / 通义 / 混元 / OpenAI 兼容网关）只改这两个变量，不动代码 |
| 4 | 云函数的 HTTP 访问地址 | 部署后控制台给的 `https://<env>.service.tcloudbase.com/drama-dm` | 前端 `Drama.setRemote(地址)` 要用 |
| 5 | 云函数超时 ≥ 10 秒 | 函数配置 → 超时时间 | 模型首 token 常有 2~6 秒延迟；默认 3 秒会一批请求直接超时 |

**这一项不用准备**：网络权限。`entry/src/main/module.json5` 里
`ohos.permission.INTERNET` 和 `GET_NETWORK_INFO` 已经在 26w48a 加过了。

---

## 二、可选准备（现在不需要）

| 东西 | 什么时候才需要 | 说明 |
|---|---|---|
| 云数据库（文档型） | 想做「多设备同步进度」「排行榜」「云端存档」 | 现在存档在 `localStorage`，键名 `yhj_drama_<scriptId>`，够单机用 |
| 静态托管 / CDN | 想把网页版挂到自己的域名 | GitHub Pages 已经在用了 |
| 内容安全审核 | 打算开放给陌生人玩 | 自娱自乐不需要 |
| 计费预算告警 | 上线给多人玩 | 单次改写约 400 输出 token，自己玩成本可以忽略 |

---

## 三、已经写好的东西

```
cloudfunctions/drama-dm/index.js     云函数（HTTP 触发，零依赖，只用 node:https）
cloudfunctions/drama-dm/package.json 无第三方依赖，冷启动快
```

它**不判定剧情**。收到的请求长这样（都是前端已经判定完的结果）：

```json
{
  "scriptId": "valan-lower",
  "actId": "A1",
  "text": "检查阀门",
  "action": { "who": "narrator", "say": "检修阀的锁孔边缘没有锈……", "give": ["C02"], "next": null },
  "npcs": { "narrator": { "name": "旁白", "role": "" } },
  "got": ["C01"]
}
```

返回：

```json
{ "ok": true, "say": "锁孔边上没有锈，黄铜倒是被磨亮了……", "source": "llm" }
```

`source: "fallback"` 表示模型调用失败，`say` 是原文——前端照常显示，不会卡住。

为什么这么设计：模型只做「换个说法」，不碰判定。它没法给你一条不存在的线索，
也没法把凶手换人，更没法剧透。判定权始终在 `drama-data.js` 的
`culprit` / `solidProof` 里。

---

## 四、部署命令（tcb CLI）

```powershell
# 1) 登录（浏览器授权）
npx --yes @cloudbase/cli login

# 2) 选环境
npx --yes @cloudbase/cli env:list
npx --yes @cloudbase/cli env:use <ENV_ID>

# 3) 部署云函数（在仓库根目录执行）
npx --yes @cloudbase/cli functions:deploy drama-dm --force

# 4) 配环境变量（在控制台或 CLI 里配，别写进仓库）
#    LLM_BASE   https://api.deepseek.com/v1
#    LLM_KEY    sk-xxxx
#    LLM_MODEL  deepseek-chat
#    LLM_TIMEOUT_MS 8000

# 5) 开 HTTP 访问（控制台 → 云函数 → 函数配置 → HTTP 访问路径）
#    路径填 /drama-dm，拿到完整 URL
```

部署完自测（PowerShell）：

```powershell
$body = @{
  scriptId = 'valan-lower'
  actId    = 'A1'
  text     = '检查阀门'
  action   = @{ who = 'narrator'; say = '检修阀的锁孔边缘没有锈。'; give = @('C02'); next = $null }
  npcs     = @{ narrator = @{ name = '旁白'; role = '' } }
  got      = @()
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Uri 'https://<ENV_ID>.service.tcloudbase.com/drama-dm' `
  -Method Post -ContentType 'application/json; charset=utf-8' `
  -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

正常返回 `ok = True` 且 `source = "llm"`；返回 `"fallback"` 说明 `LLM_*` 没配好，
看云函数日志里的 `note` 字段。

---

## 五、前端怎么打开

网页版在控制台里执行一次，或者写进自己的启动脚本：

```js
window.Drama.setRemote('https://<ENV_ID>.service.tcloudbase.com/drama-dm');
```

鸿蒙版要改 `entry/src/main/resources/rawfile/index.html` 的源头
（也就是 `index.html`），在 `drama.js` 之后加一段：

```html
<script>
  // 想用云端 DM 就填地址；留空 = 纯本地规则
  if (window.Drama) window.Drama.setRemote('');
</script>
```

然后重跑 `python scripts/build_harmony_html.py` + 重新编译 HAP。

`Drama.remote()` 返回当前地址，`Drama.setRemote('')` 就是关掉。
云端挂了、断网了、key 过期了，全部自动退回本地原文，不会玩不下去。

---

## 六、代价与边界（摆明白，自己判断）

- 每按一次「说」，多一次往返：约 1~5 秒。本地规则是 0 秒。
- 每次改写约 300~450 输出 token，成本自己按模型价算。
- 模型只改写法，`say` 上限 420 字，超了截断，防止它写长篇旁白把节奏拖死。
- 想让 AI 真正「自由发挥」剧情，得把判定也交给它，那时候剧本骨架、线索发放、
  结局条件都得改成服务端权威——那是另一个量级的工程，不是加个开关的事。
