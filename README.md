# Antigravity 中文汉化（运行时注入）

不修改 `app.asar`、不替换任何程序文件。通过 CDP 往渲染进程里注入一层翻译（`MutationObserver`），
界面文字改成中文；关掉注入即恢复，随官方更新也不会坏。

## 适用版本

| 项 | 版本 |
|---|---|
| **开发与验证** | **Antigravity 2.35.1**（Electron 44.9.1 / Chrome 152.0.7977.167，2026-11-25 构建，`app.asar` 6,729,546 B） |
| 也验证过 | Antigravity 2.35.0 |
| 其他版本 | **未验证**。注入用标准 CDP + 文本匹配，小版本升级一般可用；大版本改布局/文案会漏翻或错位，但不会损坏安装 |

换版本后自查：`node probe-update.mjs 9223`，看「翻译层是否安装 / 词典条数 / 还没翻的英文前 25 条」。

## 文件

| 文件 | 作用 |
|---|---|
| `dict.json` | 词典，英文原文 → 中文。**当前 279 条**：菜单栏、侧栏、主界面、设置页七个分区、顶部三个菜单、会话「更多」菜单、模型下拉、项目选择器、自动化空态、输入框左下角的本地权限菜单 |
| `dict-ext.json` | 第二批词条（189 条），已并入 `dict.json`，留档备查 |
| `add-dict.mjs` | 把新采集的 `{原文:译文}` 批量并入 `dict.json`（去重、计数） |
| `inject.mjs` | 注入器。`node inject.mjs [端口] [--watch] [--shot 输出]`。不带 `--watch` 是装一次就走；带了就常驻，页面刷新/导航/换窗口后自动补装，CDP 掉线时自己退出 |
| `launcher/launch-antigravity-proxy.ps1` | 启动器：一条命令起「走代理 + 自动汉化」的实例。`-NoTranslate` 只代理不汉化，`-NoLaunch` 只做自检，`-Proxy "socks5://127.0.0.1:1080"` 手动指定代理 |
| `dist/install.bat` | **安装器入口**（给别人 / 换电脑用）：双击运行，自动找 Antigravity、问代理协议与地址端口、把 `dist/payload` 装到 `%LOCALAPPDATA%\AntigravityZh\`、建「Antigravity 中文」快捷方式 |
| `dump.mjs` | 导出当前界面可见文本节点（建词典用）。`node dump.mjs [端口] > dump.json` |
| `collect.mjs` | 批量采集：依次点开设置分区与菜单，去重后写 `collected.json` |
| `check.mjs` | 覆盖率自检：逐个分区 dump，列出仍含英文且不在词典里的条目，写 `uncovered.json` |
| `verify2.mjs` | 端到端验收：reload → 点「新对话」→ 逐个打开模型下拉/项目选择器/会话菜单/自动化页，统计残留英文 |
| `probe-update.mjs` | 更新后体检：target URL、UA、翻译层是否在、词典条数、残留英文前 25 条 |
| `probe-menu.mjs` | 右键菜单探测：确认右键菜单是否在 DOM 里（结论：不在，是原生菜单） |
| `drive.mjs` | CDP 动作脚本：`dump` / `click:<文本>` / `clicklabel:<子串>` / `rclick:<文本>` / `hover:<文本>` / `key:<Escape|Enter>` / `labels` / `shot:<文件>` / `wait:<毫秒>` / `eval:<js>` |

## 给别人装（一键安装器）

不想碰源码的话，直接下现成的：[Releases · v1.0.0](https://github.com/TH991/antigravity-zh/releases/tag/v1.0.0)
里的 `AntigravityZh-1.0.0.zip`（24 KB），解压后双击 `install.bat`。

用源码里的也行：把 `dist/` 整个拷过去，双击 `install.bat`。它会：

1. 自动找 Antigravity.exe（默认路径 → 注册表卸载项 → 开始菜单快捷方式 → `Programs` 目录扫描）；
2. 检查 node（没有就提示，仍可装，但只能代理不能汉化）；
3. 问代理怎么走 —— **选协议（http / socks5）→ 填 IP → 填端口**，当场用 TCP + 经代理请求 GitHub 验证，
   失败可以重输 / 跳过 / 改成不走代理；
4. 把 `payload` 装到 `%LOCALAPPDATA%\AntigravityZh\`（旧的先改名备份），写 `settings.json`；
5. 在桌面和开始菜单建「Antigravity 中文」快捷方式。

卸载：`dist\uninstall.bat`（只删安装目录和快捷方式，不碰 Antigravity 本体）。

安装器不动系统代理、不改 hosts、不需要管理员权限。想换代理又不想重装，直接改
`%LOCALAPPDATA%\AntigravityZh\payload\settings.json`：

```json
{ "mode": "proxy", "proxy": "http://127.0.0.1:7897" }
```

`"mode": "direct"` 表示只汉化、不走代理。

静默参数（自己写脚本时用）：

```powershell
install.ps1 -Yes -Mode proxy -Proxy "socks5://127.0.0.1:1080" -InstallDir D:\Tools\AntigravityZh -NoShortcut
```

## 怎么用

```powershell
# 一步到位：带代理 + 带汉化（双击桌面「Antigravity 中文」等价于此）
powershell -NoProfile -ExecutionPolicy Bypass -File launcher\launch-antigravity-proxy.ps1

# 只代理、不汉化
powershell ... -File launcher\launch-antigravity-proxy.ps1 -NoTranslate

# 只检查环境，不启动
powershell ... -File launcher\launch-antigravity-proxy.ps1 -NoLaunch
```

启动器做的事：清 `ELECTRON_RUN_AS_NODE` → 读 `settings.json` 决定走不走代理、走哪个
→ 设 `HTTPS_PROXY/HTTP_PROXY/NODE_USE_ENV_PROXY/NO_PROXY`
→ 起 Antigravity（带 `--proxy-server`；要汉化时再加 `--remote-debugging-port=9223`）
→ 等 CDP 就绪（最多 30 秒）→ 后台拉起 `inject.mjs --watch`，日志在
`<安装目录>\payload\logs\inject.log`（源码运行时是项目目录下的 `logs/`）。

手动装一次也行（应用已经用启动器开着的时候）：

```powershell
node inject.mjs 9223 --watch
```

## 已验证（2026-11-25 22:0x）

- 词典 **279 条**。`check.mjs` 扫过设置页七个分区 + 三个顶部菜单，`verify2.mjs` 再扫模型下拉、项目选择器、
  会话「更多」菜单、自动化页：**这些界面已全中文**。
- 模型行的 ⓘ 悬停详情（每行一句能力描述）、`新`／`即将下线`／`注意` 角标、二级「思考强度（低/中/高）」、
  底部「本地权限」四档，均已中文；`probe-tips3.mjs` 可逐行复采悬停文案。
- 剩余英文只剩三类，都是有意保留的：专有名词（`Antigravity`、`Gemini 4 Carbon/Argon/Hydrogen`、`Claude Opus 5.5`、
  `GPT-OSS 120B`、`Google AI Pro`、账户标识、`Ctrl/Shift/Alt`、路径）、自定义市场里的长篇营销文案
  （Firebase/Notion/Stripe 等，几十段，不是界面语）、以及不可见的 `aria-label`。
- 动态文案用正则处理：「You have used some of your 5-hour/weekly limit…」→
  「你已用掉部分 5 小时额度，将在 4 小时 39 分钟后完全恢复。」
- 问候语是随机的，三种变体都接住了：`Welcome back, X. Where should we pick up?` →
  「欢迎回来，X。想从哪儿继续？」
- 拆分文本的上下文规则：自动化空态被 React 拆成 `No` / `automations` / `yet` 三个 `<p>`，
  按 `text-lg` 上下文分别译成 暂无 / 自动化任务 / 空，拼起来读得通。
- `New` 的两种含义按上下文区分：模型行里的 `New` 是角标 → 「新」，按钮 → 「新建」。
- 排除规则生效：Monaco 编辑器、`textarea`、`contenteditable`、`<pre>/<code>`、`.markdown-body`、
  `.chat-message`、`.composer` 不译。
- **持久化注入生效**：`Page.addScriptToEvaluateOnNewDocument` 把翻译层挂到每个新文档上，`Page.reload`
  之后仍是中文，不需要外部再补（实测 reload 前后 `window.__AG_ZH__` 都在）。
- **常驻补装生效**：手动把 `window.__AG_ZH__` 清掉，3 秒内被 `--watch` 装回来；日志里会写
  「检测到翻译层丢失，已补装」。
- **启动器端到端跑通**：`launch-antigravity-proxy.ps1` 起窗后 10 个进程、9223 在听、watcher 在跑、注入成功；
  首次连接可能落在启动画面那个 target，watcher 会在主页面就绪后自动补装一次。
- 官方更新到 **v2.35.1** 后（Electron 44.9.1 未变、`app.asar` 未变）汉化照常工作，只补了一处启动竞态：
  主页面创建慢于调试端口就绪时，注入器会等 20 秒而不是立刻报错。

## 踩过的坑

1. 子进程带 `ELECTRON_RUN_AS_NODE=1` 时，`Antigravity.exe` 会退化成纯 node，任何 `--xxx` 都报 `bad option`。启动前必须清掉。
2. 窗口被挪到屏幕外（`-25600,-25600`，159×27）时，CDP `Page.captureScreenshot` 会**永久挂起**。先 `ShowWindow(SW_RESTORE)` + `SetWindowPos` 摆回可见区域再截。
3. `drive.mjs` 里 `\s` 写在模板字符串里会被吞成 `s`，正则要避开反斜杠（用 `([0-9]+) hours?` 这种写法）。
4. PowerShell 5.1 读 UTF-8 文件必须加 `-Encoding UTF8`，否则中文被按 GBK 解码，`ConvertFrom-Json` 直接报错。
5. `.ps1` 必须存成 **UTF-8 with BOM**：无 BOM 时 PS 5.1 按 GBK 读，双字节字符会把引号吃掉，整个文件报语法错误。
6. `Start-Process -ArgumentList` 传带空格的路径要自己加引号（`"`"$path`""`），否则被拆成两个参数———路径里带空格就会踩。
7. CDP 的 `/json/list` 里通常有多个 page target（启动画面、空白页、真正的主界面）。选目标要按
   `workbench|Antigravity|127.0.0.1:` 过滤，别直接取最后一个。
8. 译文是空字符串时会被 `if (!zh || zh === key) return;` 当成「没翻译」丢掉，导致「yet → 空」这类
   规则失效。判空要写 `zh === undefined`。
9. 同一个英文词在不同位置含义不同：`New` 在模型行是「新」角标、在自动化页是「新建」按钮。
   只靠词典会译错，必须给上下文规则（这里按父节点里有没有 `Gemini|Claude|GPT` 判断）。
10. 右键菜单是**原生 Electron 菜单**，不在 DOM 里，`probe-menu.mjs` 在三处右键都查不到任何
    `[role=menu]`/`context-menu`/`popover` 节点。想翻它得改 Electron 主进程，运行时 DOM 注入做不到。

## 还没做

1. **右键菜单翻不了**（原生菜单，见坑 10）。应用自己的「更多」菜单是 DOM，已经翻了。
2. **自定义市场的长文介绍**没翻（Firebase/Notion/Stripe 等，几十段营销文案，不属于界面语）。
3. **启动器覆盖面**：现在只有双击桌面那个快捷方式才带代理+汉化；开始菜单、任务栏、原快捷方式打开的还是直连、无翻译。
4. **多目标注入**：只注入主渲染进程；以后如果面板/子 webview 也需要汉化，要遍历所有 page target。

## 回滚

什么都不用还原——不跑 `inject.mjs` 就是原样。