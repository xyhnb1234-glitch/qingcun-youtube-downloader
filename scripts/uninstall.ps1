$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$expectedManifest = Join-Path $projectRoot 'helper\com.qingcun.youtube.json'
foreach ($browserKey in @('Google\Chrome','Microsoft\Edge','Chromium')) {
    $registryPath = "HKCU:\Software\$browserKey\NativeMessagingHosts\com.qingcun.youtube"
    if (Test-Path $registryPath) {
        $current = (Get-Item $registryPath).GetValue('')
        if ($current -eq $expectedManifest) { Remove-Item -LiteralPath $registryPath -Force }
    }
}
Write-Host '本地助手连接已注销。请在浏览器扩展管理页移除插件。下载文件和历史记录均保留。'
