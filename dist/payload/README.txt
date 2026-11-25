Antigravity 中文补丁（非官方）
================================

非官方项目：与 Google 无任何关联或授权，不包含其代码与资源，仅供个人学习研究。
使用代理绕过地区限制属于你自己的选择，风险自担。详见项目根目录 NOTICE.md。

这个目录里的东西被「Antigravity 中文」快捷方式调用，日常不需要手动运行。

适用版本
--------
Antigravity 2.35.1（Electron 44.9.1 / Chrome 152）。也验证过 2.35.0。
其他版本未验证：注入走 CDP + 文本匹配，小版本一般可用；大版本改布局/文案会漏翻，
但不会损坏安装（不改 app.asar）。换版本后可跑：
    node inject.mjs 9223        （看是否 installed、词条数）
    node probe-update.mjs 9223  （看残留英文前 25 条）

文件说明
--------
inject.mjs                     词典注入器（连接 Antigravity 的调试端口，往页面里装翻译层）
dict.json                      词表（约 280 条 + 若干正则规则）
launch-antigravity-proxy.ps1   启动器（清环境变量 → 设代理 → 起 Antigravity → 拉起注入器）
settings.json                  安装时写入的配置，启动器每次启动都会读它

改代理
------
1) 双击桌面「Antigravity 中文」之前，先确认代理已开；
2) 想换地址/端口，直接编辑 settings.json：

   {
     "mode": "proxy",                       // 或 "direct" 表示不走代理
     "proxy": "http://127.0.0.1:7897",      // 也支持 socks5://127.0.0.1:1080
     "scheme": "http"
   }

3) 也可以重新运行 install.bat，走一遍问答。

为什么必须从快捷方式启动
------------------------
代理是通过 --proxy-server 参数和进程环境变量注入的，只在启动那一刻生效。
从任务栏/开始菜单直接打开原版 Antigravity，走的是它自己的默认设置：不代理、不汉化。
两者不会互相干扰。

出问题怎么看
------------
logs\inject.log        注入器日志（注入结果、词条数、补装记录）
logs\inject.log.err    注入器的错误输出
install.log            安装日志

常见现象
--------
- 界面没变中文：看 logs\inject.log 最后几行；多半是 Antigravity 不是从快捷方式起的，
  或者 9223 端口没起来（被别的程序占用时换 -DebugPort）。
- 界面是英文但能上网：翻译组件没加载，检查 PATH 里有没有 node.exe。
- 能汉化但上不了网：代理没开，或 settings.json 里的端口写错了。
- 右键菜单仍是英文：那是 Antigravity 的原生菜单，不在网页 DOM 里，注入改不到，属已知限制。

卸载
----
运行 uninstall.bat：只删快捷方式和本目录，不动 Antigravity 本体。