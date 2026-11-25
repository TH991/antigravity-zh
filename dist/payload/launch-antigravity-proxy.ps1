#requires -Version 5.1
<#
  Antigravity 启动器（代理 + 中文化）
  ---------------------------------------------------------------------------
  只影响本进程树：Chromium 走 --proxy-server，内置 Node 走 NODE_USE_ENV_PROXY。
  不改系统代理、不改 TUN、不改 Clash 配置、不动 hosts。

  代理从哪来（优先级从高到低）：
    1) 命令行 -Proxy "http://127.0.0.1:7897"（或 socks5://...）
    2) 与本脚本同目录的 settings.json：{"mode":"proxy","proxy":"http://127.0.0.1:7897"}
       或 {"mode":"direct"} 表示不走代理
    3) 都没有就按 http://127.0.0.1:7897 试一次
  端口没在听时会弹窗问「照常启动但不走代理」还是取消。

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
    ... -Proxy "socks5://127.0.0.1:1080"   # 手动指定代理
    ... -NoTranslate                        # 只代理，不汉化
    ... -NoLaunch                           # 只做检查
#>
param(
    [switch]$NoLaunch,
    [switch]$NoTranslate,
    [string]$Proxy = '',
    [string]$ProxyHost = '',
    [int]$ProxyPort = 0,
    [int]$DebugPort = 9223,
    [string]$ProjectDir = ''
)

# ============ 0. 项目目录（脚本所在目录 / 上一级 / 上两级，含 inject.mjs 的那个） ============
$ProjectDirGiven = [bool]$ProjectDir
if (-not $ProjectDirGiven) {
    $parent = Split-Path $PSScriptRoot -Parent
    $grand = Split-Path $parent -Parent
    $found = @($PSScriptRoot, $parent, $grand) |
        Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'inject.mjs')) } |
        Select-Object -First 1
    $ProjectDir = if ($found) { $found } else { $PSScriptRoot }
}

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null

function Show-Box([string]$text, [string]$title, [string]$kind = 'Warning') {
    $icon = if ($kind -eq 'Error') { 'Error' } else { 'Warning' }
    [void][System.Windows.Forms.MessageBox]::Show($text, $title, 'OK', $icon)
}

# ============ 1. 决定代理（参数 > settings.json > 内置默认） ============
$settingsPath = Join-Path $ProjectDir 'settings.json'
$settingsMode = ''
$settingsProxy = ''
if (Test-Path -LiteralPath $settingsPath) {
    try {
        $s = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($s.PSObject.Properties.Name -contains 'mode') { $settingsMode = "$($s.mode)".ToLower() }
        if ($s.PSObject.Properties.Name -contains 'proxy') { $settingsProxy = "$($s.proxy)" }
    } catch {
        Write-Verbose "settings.json 解析失败：$($_.Exception.Message)"
    }
}

$proxy = ''
$proxySource = ''
if ($Proxy) {
    $proxy = $Proxy; $proxySource = '命令行参数'
} elseif ($ProxyHost -and $ProxyPort -gt 0) {
    $proxy = "http://${ProxyHost}:${ProxyPort}"; $proxySource = '命令行 -ProxyHost/-ProxyPort'
} elseif ($settingsMode -eq 'direct') {
    $proxy = ''; $proxySource = 'settings.json 指定直连'
} elseif ($settingsProxy) {
    $proxy = $settingsProxy; $proxySource = 'settings.json'
} else {
    $proxy = 'http://127.0.0.1:7897'; $proxySource = '内置默认值'
}
if ($proxy -and $proxy -notmatch '^[a-zA-Z0-9]+://') { $proxy = "http://$proxy" }

# ============ 2. 找 exe ============
$candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Antigravity\Antigravity.exe'),
    "$env:ProgramFiles\Antigravity\Antigravity.exe",
    "${env:ProgramFiles(x86)}\Antigravity\Antigravity.exe"
)
$exe = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $exe) {
    # 注册表兜底：卸载项里的 DisplayIcon
    foreach ($root in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
                      'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
                      'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall') {
        $hit = Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
            $v = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
            if ($v.DisplayName -match 'Antigravity' -and $v.DisplayIcon) {
                ($v.DisplayIcon -replace ',\d+$','').Trim('"')
            }
        } | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
        if ($hit) { $exe = $hit; break }
    }
}
if (-not $exe) {
    Show-Box "没找到 Antigravity.exe。`n`n找过：`n$($candidates -join "`n")`n以及注册表卸载项。" 'Antigravity 启动器' 'Error'
    exit 1
}

# ============ 3. 翻译组件检查（缺了就退化成「只代理」） ============
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

# ============ 4. 代理可用性（没在听就问：直连启动 or 取消） ============
$scheme = 'http'
$hostPart = '127.0.0.1'
$portPart = 7897
if ($proxy -match '^(?<sc>[a-zA-Z0-9]+)://(?<hp>.+)$') {
    $scheme = $Matches['sc'].ToLower()
    $hp = $Matches['hp']
    if ($hp -match '^\[(?<h>[^\]]+)\]:(?<p>\d+)$') { $hostPart = $Matches['h']; $portPart = [int]$Matches['p'] }
    elseif ($hp -match '^(?<h>[^:]+):(?<p>\d+)$') { $hostPart = $Matches['h']; $portPart = [int]$Matches['p'] }
    else { $hostPart = $hp }
}

$proxyAlive = $false
if ($proxy) {
    $tcp = New-Object System.Net.Sockets.TcpClient
    try { $proxyAlive = $tcp.ConnectAsync($hostPart, $portPart).Wait(1500) -and $tcp.Connected }
    catch { $proxyAlive = $false } finally { $tcp.Dispose() }
}

if ($proxy -and -not $proxyAlive) {
    $answer = [System.Windows.Forms.MessageBox]::Show(
        "代理 $proxy 没有在监听（$proxySource）。`n`n是 = 照常启动，但这次不走代理`n否 = 取消，等你把代理开起来",
        'Antigravity 启动器', 'YesNo', 'Warning')
    if ($answer -ne 'Yes') { exit 2 }
    $proxy = ''
}

# ============ 5. 环境变量 ============
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
if ($proxy) {
    $env:HTTP_PROXY = $proxy
    $env:HTTPS_PROXY = $proxy
    $env:ALL_PROXY = $null            # 避免给 Go/gRPC 侧引入意料之外的行为
    # NODE_USE_ENV_PROXY 只支持 http/https；socks5 时交给 Chromium 处理
    if ($scheme -eq 'http' -or $scheme -eq 'https') {
        $env:NODE_USE_ENV_PROXY = '1'
    } else {
        [Environment]::SetEnvironmentVariable('NODE_USE_ENV_PROXY', $null, 'Process')
    }
    $env:NO_PROXY = 'localhost,127.0.0.1,::1'
} else {
    foreach ($v in 'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY') { [Environment]::SetEnvironmentVariable($v, $null, 'Process') }
    [Environment]::SetEnvironmentVariable('NODE_USE_ENV_PROXY', $null, 'Process')
}

if ($NoLaunch) {
    Write-Output "exe           : $exe"
    Write-Output "project       : $ProjectDir"
    Write-Output "proxy         : $(if ($proxy) { "$proxy  (来源: $proxySource)" } else { '(直连，未使用代理)' })"
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

# ============ 6. 单实例检查 ============
$running = Get-Process -Name Antigravity -ErrorAction SilentlyContinue
if ($running) {
    Show-Box ("Antigravity 已经在运行（pid {0}）。`n`n它用的是启动时那套设置，现在再启动只会聚焦它、不会换代理。`n`n请先完全退出 Antigravity，再运行本启动器。" -f (($running.Id) -join ', ')) 'Antigravity 启动器'
    exit 3
}

# ============ 7. 起 Antigravity ============
$argList = @()
if ($proxy) { $argList += "--proxy-server=$proxy" }
if ($translate) { $argList += "--remote-debugging-port=$DebugPort" }
Start-Process -FilePath $exe -ArgumentList $argList | Out-Null

if (-not $translate) {
    exit 0
}

# ============ 8. 等 CDP 就绪，再拉起常驻注入器 ============
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
if ($existing) { exit 0 }

# 常驻注入器：隐藏窗口，独立进程，Antigravity 关掉后自己退
$logDir = Join-Path $ProjectDir 'logs'
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir 'inject.log'
Start-Process -FilePath $nodeExe -ArgumentList @("`"$injector`"", $DebugPort, '--watch') -WindowStyle Hidden `
    -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err" | Out-Null

exit 0