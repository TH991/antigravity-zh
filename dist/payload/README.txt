Antigravity 中文版（运行时注入）
================================

这个目录里的东西被「Antigravity 中文」快捷方式调用，日常不需要手动运行。

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