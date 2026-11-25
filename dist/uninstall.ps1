#requires -Version 5.1
<#
  Antigravity 中文版 卸载器（由 uninstall.bat 调用）
  ---------------------------------------------------------------------------
  只删本工具装的东西：
    - 桌面 / 开始菜单的「Antigravity 中文」快捷方式
    - %LOCALAPPDATA%\AntigravityZh\ 整个目录
  完全不碰 Antigravity 本体，也不碰系统代理设置。
#>
param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'AntigravityZh'),
    [switch]$Yes,
    [switch]$KeepLog
)

$ErrorActionPreference = 'Stop'

function Say([string]$t = '') { Write-Host $t }
function Ok([string]$t)   { Write-Host "  [OK]   $t" -ForegroundColor Green }
function Warn([string]$t) { Write-Host "  [警告] $t" -ForegroundColor Yellow }

Say ''
Say '============================================================'
Say '  Antigravity 中文版 · 卸载'
Say '============================================================'
Say ''

if (-not $Yes) {
    Say "  将删除：$InstallDir"
    Say '  将删除：桌面 / 开始菜单里的「Antigravity 中文」快捷方式'
    Say ''
    Say '  Antigravity 本体不会被改动。'
    $a = Read-Host '  继续？(y/n) [y]'
    if ($a -and $a -notmatch '^[Yy]') { Say '  已取消。'; exit 0 }
}

# 停掉常驻注入器（node 进程，命令行里带本安装目录的 inject.mjs）
$killed = 0
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*inject.mjs*' -and $_.CommandLine -like "*$InstallDir*" } |
    ForEach-Object {
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; $killed++ } catch { }
    }
if ($killed -gt 0) { Ok "已停止 $killed 个注入进程" }

# 快捷方式
$lnks = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Antigravity 中文.lnk'),
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Antigravity 中文.lnk')
)
foreach ($l in $lnks) {
    if (Test-Path -LiteralPath $l) { Remove-Item -LiteralPath $l -Force; Ok "已删除 $l" }
}

# 安装目录
if (Test-Path -LiteralPath $InstallDir) {
    if ($KeepLog) {
        $log = Join-Path $InstallDir 'install.log'
        if (Test-Path -LiteralPath $log) {
            $keep = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AntigravityZh-install.log'
            Copy-Item -LiteralPath $log -Destination $keep -Force
            Ok "日志已保留到 $keep"
        }
    }
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
    Ok "已删除 $InstallDir"
} else {
    Warn "目录不存在：$InstallDir"
}

Say ''
Say '  卸载完成。Antigravity 本体未受影响，仍可正常使用（英文直连）。'
Say ''
exit 0