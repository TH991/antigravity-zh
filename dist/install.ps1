#requires -Version 5.1
<#
  Antigravity 中文版 安装器（由 install.bat 调用）
  ---------------------------------------------------------------------------
  做四件事：
    1) 自动找 Antigravity.exe（注册表卸载项 / 开始菜单快捷方式 / 常见路径）
    2) 把 payload（注入器 + 词典 + 启动器）拷到 %LOCALAPPDATA%\AntigravityZh\payload
    3) 问你要不要走代理：选协议（http / socks5）+ 填 IP 和端口，当场验证连通性
    4) 在桌面和开始菜单建「Antigravity 中文」快捷方式

  不改 Antigravity 的安装目录、不改系统代理、不需要管理员权限。
  静默参数（给自动化用）：
    -Yes            全部用默认值，不提问
    -Mode proxy|direct
    -Proxy "http://127.0.0.1:7897"
    -InstallDir <目录>
    -ShortcutDir <目录>   只往这个目录建快捷方式（测试用）
    -NoShortcut
#>
param(
    [string]$DistDir = $PSScriptRoot,
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'AntigravityZh'),
    [ValidateSet('ask','proxy','direct')][string]$Mode = 'ask',
    [string]$Proxy = '',
    [switch]$NoShortcut,
    [switch]$Yes,
    [string]$ShortcutDir = ''
)

$ErrorActionPreference = 'Stop'
$script:LogPath = $null
$script:ExitCode = 0

function Say([string]$text = '') { Write-Host $text }
function Ok([string]$t)   { Write-Host "  [OK]   $t" -ForegroundColor Green }
function Warn([string]$t) { Write-Host "  [警告] $t" -ForegroundColor Yellow }
function Fail([string]$t) { Write-Host "  [失败] $t" -ForegroundColor Red }
function Log([string]$t) {
    if ($script:LogPath) {
        try { Add-Content -LiteralPath $script:LogPath -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $t) -Encoding UTF8 } catch { }
    }
}
function Ask([string]$q, [string]$default = '') {
    if ($Yes) { return $default }
    $hint = if ($default) { " [$default]" } else { '' }
    $a = Read-Host "$q$hint"
    if ([string]::IsNullOrWhiteSpace($a)) { return $default }
    return $a.Trim()
}

function Test-Tcp([string]$h, [int]$p, [int]$ms = 1500) {
    $tcp = New-Object System.Net.Sockets.TcpClient
    try { return ($tcp.ConnectAsync($h, $p).Wait($ms) -and $tcp.Connected) }
    catch { return $false }
    finally { $tcp.Dispose() }
}

function Test-ProxyHttp([string]$url) {
    $old = $env:HTTPS_PROXY; $old2 = $env:HTTP_PROXY
    try {
        $env:HTTPS_PROXY = $url; $env:HTTP_PROXY = $url
        $r = Invoke-WebRequest -Uri 'https://api.github.com/zen' -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        return ($r.StatusCode -eq 200)
    } catch { return $false }
    finally { $env:HTTPS_PROXY = $old; $env:HTTP_PROXY = $old2 }
}

# ============================ 开场 ============================
Say ''
Say '============================================================'
Say '  Antigravity 中文版 · 安装器'
Say '  运行时注入，不改安装文件；不需要管理员权限'
Say '============================================================'
Say ''

# 去掉「下载自网络」的阻断标记
Get-ChildItem -LiteralPath $DistDir -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
    try { Unblock-File -LiteralPath $_.FullName -ErrorAction Stop } catch { }
}

# ============================ 1. 找 Antigravity ============================
Say '[1/5] 查找 Antigravity …'
$exe = $null
$how = ''
$envPaths = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Antigravity\Antigravity.exe'),
    "$env:ProgramFiles\Antigravity\Antigravity.exe",
    "${env:ProgramFiles(x86)}\Antigravity\Antigravity.exe"
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($envPaths) { $exe = $envPaths; $how = '默认安装路径' }

if (-not $exe) {
    foreach ($root in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
                      'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
                      'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall') {
        $hit = Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
            $v = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
            if ($v.DisplayName -match 'Antigravity' -and $v.DisplayIcon) { ($v.DisplayIcon -replace ',\d+$','').Trim('"') }
        } | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
        if ($hit) { $exe = $hit; $how = '注册表卸载项'; break }
    }
}
if (-not $exe) {
    $lnk = @(
        (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Antigravity.lnk'),
        (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Antigravity.lnk')
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($lnk) {
        $ws = New-Object -ComObject WScript.Shell
        $t = $ws.CreateShortcut($lnk).TargetPath
        if ($t -and (Test-Path -LiteralPath $t)) { $exe = $t; $how = '开始菜单快捷方式' }
    }
}
if (-not $exe) {
    $hit = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs') -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like '*Antigravity*' } | ForEach-Object {
            $p = Join-Path $_.FullName 'Antigravity.exe'
            if (Test-Path -LiteralPath $p) { $p }
        } | Select-Object -First 1
    if ($hit) { $exe = $hit; $how = 'Programs 目录扫描' }
}
if (-not $exe) {
    Fail '没找到 Antigravity.exe。'
    Say ''
    Say '  请先安装 Antigravity（https://antigravity.google），装好后再运行本安装器。'
        exit 2
}
Ok "$exe"
Say "      （来源：$how）"
Log "exe=$exe source=$how"

# ============================ 2. 检查运行中 / node ============================
Say ''
Say '[2/5] 检查运行环境 …'
$running = Get-Process -Name Antigravity -ErrorAction SilentlyContinue
if ($running) {
    Warn "Antigravity 正在运行（pid $(($running.Id) -join ', ')）。"
    $a = Ask '  要我现在帮你关掉吗？(y/n)' 'y'
    if ($a -match '^[Yy]') {
        $running | ForEach-Object { try { $_.CloseMainWindow() | Out-Null } catch { } }
        Start-Sleep -Seconds 2
        Get-Process -Name Antigravity -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch { } }
        Start-Sleep -Milliseconds 800
        Ok '已关闭'
    } else {
        Warn '请先手动退出 Antigravity，否则启动器会因为单实例直接返回。'
    }
}

$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if ($nodeExe) {
    $nv = (& $nodeExe -v) -replace '^v',''
    Ok "node $nv（$nodeExe）"
    $major = [int]($nv -split '\.')[0]
    if ($major -lt 22) { Warn 'node 版本偏低（< 22），注入器可能需要更新的 API，建议升级。' }
} else {
    Warn 'PATH 里没有 node.exe —— 可以安装，但「中文翻译」不会生效，只有代理。'
    Say '        下载：https://nodejs.org/en/download'
}
Log "node=$nodeExe"

# ============================ 3. 代理 ============================
Say ''
Say '[3/5] 代理设置 …'
Say '  这里的代理只给 Antigravity 用（--proxy-server + 进程环境变量）。'
Say '  不会改系统代理，也不会改你的 Clash 配置。'
Say ''

$proxyMode = 'direct'
$proxyUrl = ''

if ($Mode -eq 'proxy') { $proxyMode = 'proxy' }
elseif ($Mode -eq 'direct') { $proxyMode = 'direct' }
else {
    Say '  1) 走代理（能访问 Google 等被墙站点，推荐）'
    Say '  2) 不走代理，只装中文界面'
    $c = Ask '  选一个' '1'
    $proxyMode = if ($c -eq '2') { 'direct' } else { 'proxy' }
}

if ($proxyMode -eq 'proxy') {
    $scheme = 'http'
    if (-not $Proxy) {
        Say ''
        Say '  代理协议：'
        Say '    1) http    —— 大多数客户端（Clash / Clash Verge / v2rayN 的 http 端口）'
        Say '    2) socks5  —— 只开了 socks 端口时选这个'
        $c = Ask '  选一个' '1'
        if ($c -eq '2') { $scheme = 'socks5' }
        $defaultPort = if ($scheme -eq 'socks5') { '1080' } else { '7897' }
        $h = Ask '  代理地址（IP 或主机名）' '127.0.0.1'
        $p = Ask '  代理端口' $defaultPort
    } else {
        if ($Proxy -match '^(?<sc>[a-zA-Z0-9]+)://') { $scheme = $Matches['sc'].ToLower() }
        $tmp = $Proxy -replace '^[a-zA-Z0-9]+://',''
        $h = ($tmp -split ':')[0]
        $p = if ($tmp -match ':(\d+)$') { $Matches[1] } else { '7897' }
    }

    $port = 0
    if (-not [int]::TryParse($p, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
        Fail "端口「$p」不合法。"
        exit 6
    }
    $proxyUrl = "${scheme}://${h}:${port}"

    $tryAgain = $true
    while ($tryAgain) {
        Say ''
        Say "  正在验证 $proxyUrl …"
        if (-not (Test-Tcp $h $port)) {
            Warn "连不上 $h`:$port（端口没在监听？）"
        } elseif ($scheme -eq 'http') {
            if (Test-ProxyHttp $proxyUrl) { Ok '代理可用（已用它成功请求 GitHub）'; $tryAgain = $false }
            else { Warn '端口通了，但经它访问 GitHub 失败（节点没连上？规则问题？）' }
        } else {
            Ok '端口可连接（socks5 无法用 .NET 直接验证 HTTP，这里只测 TCP）'
            $tryAgain = $false
        }
        if ($tryAgain) {
            Say '  1) 重新输入  2) 跳过验证，就用这个  3) 改成不走代理'
            $c = Ask '  怎么办' '1'
            if ($c -eq '2') { $tryAgain = $false }
            elseif ($c -eq '3') { $proxyMode = 'direct'; $proxyUrl = ''; $tryAgain = $false }
            else {
                $h = Ask '  代理地址' $h
                $p = Ask '  代理端口' $p
                if (-not [int]::TryParse($p, [ref]$port)) { $port = 7897 }
                $proxyUrl = "${scheme}://${h}:${port}"
            }
        }
    }
}

if ($proxyMode -eq 'direct') {
    Ok '本次安装为「直连 + 中文界面」'
} else {
    Ok "安装后将使用代理 $proxyUrl"
}
Log "proxyMode=$proxyMode proxy=$proxyUrl"

# ============================ 4. 复制文件 ============================
Say ''
Say '[4/5] 安装文件 …'
$srcPayload = Join-Path $DistDir 'payload'
foreach ($need in 'inject.mjs','dict.json','launch-antigravity-proxy.ps1') {
    if (-not (Test-Path -LiteralPath (Join-Path $srcPayload $need))) {
        Fail "安装包不完整：payload\$need 不存在（当前目录 $DistDir）"
        exit 3
    }
}

$dstPayload = Join-Path $InstallDir 'payload'
if (-not (Test-Path -LiteralPath $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }
$script:LogPath = Join-Path $InstallDir 'install.log'
Log "---- 安装开始 exe=$exe mode=$proxyMode proxy=$proxyUrl ----"

if (Test-Path -LiteralPath $dstPayload) {
    $bak = Join-Path $InstallDir ("payload.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Move-Item -LiteralPath $dstPayload -Destination $bak -Force
    Ok "旧版本已备份到 $(Split-Path $bak -Leaf)"
}
Copy-Item -LiteralPath $srcPayload -Destination $dstPayload -Recurse -Force
Ok "文件已安装到 $dstPayload"

# settings.json：启动器每次读它
$settings = [ordered]@{
    mode        = $proxyMode
    proxy       = $proxyUrl
    scheme      = if ($proxyUrl) { ($proxyUrl -split '://')[0] } else { '' }
    installedAt = (Get-Date).ToString('s')
    installDir  = $InstallDir
    exe         = $exe
}
$settingsPath = Join-Path $dstPayload 'settings.json'
$settings | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $settingsPath -Encoding UTF8
Ok "已写入 settings.json（$(if ($proxyUrl) { $proxyUrl } else { '直连' })）"
Log "settings=$settingsPath"

# 旧版（手工版）清理
$legacyDir = Join-Path $env:LOCALAPPDATA 'AntigravityProxy'
$legacyLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Antigravity (Proxy).lnk'
if (-not $Yes -and ((Test-Path -LiteralPath $legacyLnk) -or (Test-Path -LiteralPath $legacyDir))) {
    Say ''
    Say '  检测到这功能更早的手工版：'
    if (Test-Path -LiteralPath $legacyLnk) { Say "    快捷方式  $legacyLnk" }
    if (Test-Path -LiteralPath $legacyDir) { Say "    旧日志目录 $legacyDir" }
    $a = Ask '  要清理掉它们吗？（不影响 Antigravity 本体）(y/n)' 'y'
    if ($a -match '^[Yy]') {
        if (Test-Path -LiteralPath $legacyLnk) { Remove-Item -LiteralPath $legacyLnk -Force; Ok '旧快捷方式已删除' }
        if (Test-Path -LiteralPath $legacyDir) { Remove-Item -LiteralPath $legacyDir -Recurse -Force; Ok '旧日志目录已删除' }
    }
}

# ============================ 5. 快捷方式 ============================
Say ''
Say '[5/5] 创建快捷方式 …'
if ($NoShortcut) {
    Warn '按参数要求跳过快捷方式'
} else {
    $payloadLauncher = Join-Path $dstPayload 'launch-antigravity-proxy.ps1'
    $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $ws = New-Object -ComObject WScript.Shell

    $dirs = @()
    if ($ShortcutDir) { $dirs += $ShortcutDir }
    else {
        $dirs += [Environment]::GetFolderPath('Desktop')
        $dirs += (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')
    }

    foreach ($d in $dirs) {
        if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
        $lnkPath = Join-Path $d 'Antigravity 中文.lnk'
        $sc = $ws.CreateShortcut($lnkPath)
        $sc.TargetPath = $psExe
        $sc.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$payloadLauncher`" -ProjectDir `"$dstPayload`""
        $sc.WorkingDirectory = $dstPayload
        $sc.IconLocation = "$exe,0"
        $sc.Description = 'Antigravity 中文版（代理 + 界面汉化）'
        $sc.WindowStyle = 7
        $sc.Save()
        Ok "$lnkPath"
        Log "lnk=$lnkPath"
    }
}

# ============================ 收尾 ============================
Say ''
Say '============================================================'
Say '  安装完成'
Say '============================================================'
Say ''
Say '  怎么用：双击桌面上的「Antigravity 中文」。'
Say '  注意  ：必须从这个快捷方式启动才有代理和中文；'
Say '          从任务栏 / 开始菜单直接开原版 Antigravity 仍是英文直连。'
Say ''
Say "  安装目录：$InstallDir"
Say "  日志    ：$(Join-Path $InstallDir 'install.log')"
Say "  卸载    ：运行 uninstall.bat"
Say ''
Log '---- 安装成功 ----'
$script:ExitCode = 0
exit 0