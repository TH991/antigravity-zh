#requires -Version 5.1
<#
  Antigravity 启动器（代理 + 中文化）
  ---------------------------------------------------------------------------
  只影响本进程树：Chromium 走 --proxy-server，内置 Node 走 NODE_USE_ENV_PROXY。
  不改系统代理、不改 TUN、不改 Clash 配置、不动 hosts。

  代理端口 7897 = 本机 Clash Verge mixed-port。
  翻译：起窗后带 --remote-debugging-port，等 CDP 就绪，再拉起 inject.mjs --watch
        常驻补装（页面刷新/导航后自动生效）。纯运行时注入，不改安装文件。

  注意三点：
    1) 必须清掉 ELECTRON_RUN_AS_NODE。agent 环境里它常是 1，
       Electron 看到就退化成纯 Node，所有 Chromium 开关都会被当成非法参数。
    2) Antigravity 单实例。已有一个没走代理的实例在跑时，再启动只会聚焦它，
       新参数不生效——所以这里先检测并提示退出。
    3) 调试端口只绑 127.0.0.1；-NoTranslate 时完全不开这个端口。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File launch-antigravity-proxy.ps1
    powershell ... -File launch-antigravity-proxy.ps1 -NoTranslate   # 只代理，不汉化
    powershell ... -File launch-antigravity-proxy.ps1 -NoLaunch      # 只做检查
#>
param(
    [switch]$NoLaunch,
    [switch]$NoTranslate,
    [string]$ProxyHost = '127.0.0.1',
    [int]$ProxyPort = 7897,
    [int]$DebugPort = 9223,
    [string]$ProjectDir = ''
)

# 默认项目目录在 Show-Box 定义之后再解析（见下方）
$ProjectDirGiven = [bool]$ProjectDir

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null

function Show-Box([string]$text, [string]$title, [string]$kind = 'Warning') {
    $icon = if ($kind -eq 'Error') { 'Error' } else { 'Warning' }
    [void][System.Windows.Forms.MessageBox]::Show($text, $title, 'OK', $icon)
}

# 默认项目目录：脚本在项目根里直接用；放在 launcher/ 子目录就取上一级；都不行就要求 -ProjectDir
if (-not $ProjectDirGiven) {
    $parent = Split-Path $PSScriptRoot -Parent
    $grand = Split-Path $parent -Parent
    $ProjectDir = @($PSScriptRoot, $parent, $grand) |
        Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'inject.mjs')) } |
        Select-Object -First 1
    if (-not $ProjectDir) {
        Show-Box "找不到 inject.mjs。`n`n请用 -ProjectDir 指定项目目录（含 inject.mjs 与 dict.json 的那个）。" 'Antigravity 启动器' 'Error'
        exit 4
    }
}

$proxy = "http://${ProxyHost}:${ProxyPort}"

# ---- 1. 找 exe（先常规位置，再兜底扫用户级 Programs） ----
$candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Antigravity\Antigravity.exe'),
    "$env:ProgramFiles\Antigravity\Antigravity.exe",
    "${env:ProgramFiles(x86)}\Antigravity\Antigravity.exe"
)
$exe = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $exe) {
    Show-Box "没找到 Antigravity.exe。`n`n找过：`n$($candidates -join "`n")" 'Antigravity 启动器' 'Error'
    exit 1
}

# ---- 2. 翻译组件检查（缺了就退化成「只代理」，不报错） ----
$injector = Join-Path $ProjectDir 'inject.mjs'
$dictFile = Join-Path $ProjectDir 'dict.json'
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
$translate = -not $NoTranslate
$translateNote = ''
if ($translate) {
    if (-not (Test-Path -LiteralPath $injector) -or -not (Test-Path -LiteralPath $dictFile)) {
        $translate = $false
        $translateNote = "翻译组件缺失（$injector），本次只走代理"
    } elseif (-not $nodeExe) {
        $translate = $false
        $translateNote = 'PATH 里没有 node.exe，本次只走代理'
    }
}

# ---- 3. 代理端口得在听，否则问要不要直连启动 ----
$tcp = New-Object System.Net.Sockets.TcpClient
$ok = $false
try {
    $ok = $tcp.ConnectAsync($ProxyHost, $ProxyPort).Wait(1500) -and $tcp.Connected
} catch { $ok = $false } finally { $tcp.Dispose() }

if (-not $ok) {
    $answer = [System.Windows.Forms.MessageBox]::Show(
        "代理 $proxy 没有在监听（Clash Verge 没开？）。`n`n是 = 照常启动，但这次不走代理`n否 = 取消，等你先把 Clash 打开",
        'Antigravity 启动器', 'YesNo', 'Warning')
    if ($answer -ne 'Yes') { exit 2 }
    $proxy = $null
}

# ---- 4. 清掉会让 Electron 退化成 Node 的变量，再设代理变量 ----
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
$env:HTTP_PROXY = $proxy
$env:HTTPS_PROXY = $proxy
$env:ALL_PROXY = $null            # 避免给 Go/gRPC 侧引入意料之外的行为
$env:NODE_USE_ENV_PROXY = '1'
$env:NO_PROXY = 'localhost,127.0.0.1,::1'

if ($NoLaunch) {
    Write-Output "exe           : $exe"
    Write-Output "proxy         : $(if ($proxy) { $proxy } else { '(未使用，将直连)' })"
    Write-Output "translate     : $translate $(if ($translateNote) { "($translateNote)" } else { '' })"
    Write-Output "debug port    : $(if ($translate) { $DebugPort } else { '(不开)' })"
    Write-Output "injector      : $injector"
    Write-Output "node          : $nodeExe"
    Write-Output "HTTPS_PROXY   : $env:HTTPS_PROXY"
    Write-Output "NODE_USE_ENV  : $env:NODE_USE_ENV_PROXY"
    Write-Output "ERUN_AS_NODE  : [$([Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE','Process'))]"
    Write-Output "running       : $((Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Measure-Object).Count)"
    Write-Output '检查通过，未启动。'
    exit 0
}

# ---- 5. 单实例检查（-NoLaunch 只是自检，不需要这一步） ----
$running = Get-Process -Name Antigravity -ErrorAction SilentlyContinue
if ($running) {
    Show-Box ("Antigravity 已经在运行（pid {0}）。`n`n它用的是启动时那套设置，现在再启动只会聚焦它、不会换代理。`n`n请先完全退出 Antigravity，再运行本启动器。" -f (($running.Id) -join ', ')) 'Antigravity 启动器'
    exit 3
}

# ---- 6. 起 Antigravity ----
$argList = @()
if ($proxy) { $argList += "--proxy-server=$proxy" }
if ($translate) { $argList += "--remote-debugging-port=$DebugPort" }
Start-Process -FilePath $exe -ArgumentList $argList | Out-Null

if (-not $translate) {
    exit 0
}

# ---- 7. 等 CDP 就绪，再拉起常驻注入器 ----
$ready = $false
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$DebugPort/json/version" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
}
if (-not $ready) {
    Show-Box "Antigravity 已启动，但 $DebugPort 端口 30 秒内没就绪，汉化没装上。`n`n可以稍后手动跑：`nnode `"$injector`" $DebugPort --watch" 'Antigravity 启动器'
    exit 4
}

# 避免重复常驻：已有 watcher 就复用
$existing = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*inject.mjs*' -and $_.CommandLine -like "*$DebugPort*" }
if ($existing) {
    exit 0
}

# 常驻注入器：隐藏窗口，独立进程，Antigravity 关掉后自己退
$logDir = Join-Path $env:LOCALAPPDATA 'AntigravityProxy'
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir 'inject.log'
Start-Process -FilePath $nodeExe -ArgumentList @("`"$injector`"", $DebugPort, '--watch') -WindowStyle Hidden `
    -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err" | Out-Null

exit 0