param([switch]$UpdateOnly, [switch]$DependenciesOnly)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$helperRoot = Join-Path $projectRoot 'helper'
$runtimeRoot = Join-Path $helperRoot 'runtime'
$stagingRoot = Join-Path $projectRoot ('work-install-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $runtimeRoot,$stagingRoot | Out-Null
function Fetch([string]$Url, [string]$Destination) {
    Write-Host ('正在下载：' + $Url)
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination -TimeoutSec 240
}
function CheckHash([string]$File, [string]$Expected) {
    if ((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -ne $Expected.Trim()) { throw ('文件校验失败：' + $File) }
}
try {
    if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'node.exe'))) {
        $nodeVersion = 'v24.15.0'
        $nodeName = 'node-' + $nodeVersion + '-win-x64.zip'
        $nodeZip = Join-Path $stagingRoot $nodeName
        Fetch "https://nodejs.org/dist/$nodeVersion/$nodeName" $nodeZip
        $nodeHashes = Join-Path $stagingRoot 'node-SHASUMS256.txt'
        Fetch "https://nodejs.org/dist/$nodeVersion/SHASUMS256.txt" $nodeHashes
        $hashLine = Get-Content -LiteralPath $nodeHashes | Where-Object { $_ -match ([regex]::Escape($nodeName) + '$') } | Select-Object -First 1
        if (-not $hashLine) { throw '找不到 Node.js 文件校验值' }
        CheckHash $nodeZip (($hashLine -split '\s+')[0])
        Expand-Archive -LiteralPath $nodeZip -DestinationPath (Join-Path $stagingRoot 'node')
        Copy-Item -LiteralPath (Join-Path $stagingRoot "node\node-$nodeVersion-win-x64\node.exe") -Destination $runtimeRoot
    }
    if ($UpdateOnly -or -not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'yt-dlp.exe'))) {
        $ytFile = Join-Path $stagingRoot 'yt-dlp.exe'
        Fetch 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' $ytFile
        $ytHashes = Join-Path $stagingRoot 'yt-SHA2-256SUMS'
        Fetch 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS' $ytHashes
        $hashLine = Get-Content -LiteralPath $ytHashes | Where-Object { $_ -match '\s+\*?yt-dlp\.exe$' } | Select-Object -First 1
        if (-not $hashLine) { throw '找不到 yt-dlp 文件校验值' }
        CheckHash $ytFile (($hashLine -split '\s+')[0])
        Copy-Item -LiteralPath $ytFile -Destination $runtimeRoot -Force
    }
    if ($UpdateOnly -or -not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'ffmpeg.exe')) -or -not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'ffprobe.exe'))) {
        $ffName = 'ffmpeg-master-latest-win64-lgpl.zip'
        $ffZip = Join-Path $stagingRoot $ffName
        Fetch "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/$ffName" $ffZip
        $ffHashes = Join-Path $stagingRoot 'ff-checksums.sha256'
        Fetch 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256' $ffHashes
        $hashLine = Get-Content -LiteralPath $ffHashes | Where-Object { $_ -match ([regex]::Escape($ffName) + '$') } | Select-Object -First 1
        if (-not $hashLine) { throw '找不到 FFmpeg 文件校验值' }
        CheckHash $ffZip (($hashLine -split '\s+')[0])
        Expand-Archive -LiteralPath $ffZip -DestinationPath (Join-Path $stagingRoot 'ffmpeg')
        foreach ($binaryName in @('ffmpeg.exe','ffprobe.exe')) {
            $binaryFile = Get-ChildItem -LiteralPath (Join-Path $stagingRoot 'ffmpeg') -Recurse -File -Filter $binaryName | Select-Object -First 1
            if (-not $binaryFile) { throw ('下载包中缺少 ' + $binaryName) }
            Copy-Item -LiteralPath $binaryFile.FullName -Destination $runtimeRoot -Force
        }
    }
    foreach ($binaryName in @('node.exe','yt-dlp.exe','ffmpeg.exe','ffprobe.exe')) {
        $binaryPath = Join-Path $runtimeRoot $binaryName
        if ($binaryName -eq 'node.exe') { & $binaryPath --version }
        elseif ($binaryName -eq 'yt-dlp.exe') { & $binaryPath --version }
        else { $versionOutput = & $binaryPath -version; $componentExitCode = $LASTEXITCODE; $versionOutput | Select-Object -First 1; if ($componentExitCode -ne 0) { throw ('组件启动失败：' + $binaryName) } }
        if ($LASTEXITCODE -ne 0) { throw ('组件启动失败：' + $binaryName) }
    }
    if (-not $UpdateOnly -and -not $DependenciesOnly) {
        $extensionManifest = Get-Content -LiteralPath (Join-Path $projectRoot 'extension\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $publicKey = [Convert]::FromBase64String($extensionManifest.key)
        $digest = [Security.Cryptography.SHA256]::Create().ComputeHash($publicKey)
        $extensionId = ''
        for ($index = 0; $index -lt 16; $index++) {
            $extensionId += [char](97 + ($digest[$index] -shr 4))
            $extensionId += [char](97 + ($digest[$index] -band 15))
        }
        $nativeManifestPath = Join-Path $helperRoot 'com.qingcun.youtube.json'
        $nativeManifest = @{name='com.qingcun.youtube';description='QingCun local download helper';path=(Join-Path $helperRoot 'host.cmd');type='stdio';allowed_origins=@("chrome-extension://$extensionId/")}
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [IO.File]::WriteAllText($nativeManifestPath, ($nativeManifest | ConvertTo-Json -Depth 4), $utf8NoBom)
        foreach ($browserKey in @('Google\Chrome','Microsoft\Edge','Chromium')) {
            $registryPath = "HKCU:\Software\$browserKey\NativeMessagingHosts\com.qingcun.youtube"
            New-Item -Path $registryPath -Force | Out-Null
            Set-Item -Path $registryPath -Value $nativeManifestPath
        }
        Write-Host "本地助手安装完成。扩展 ID：$extensionId" -ForegroundColor Green
        Write-Host '在 Chrome/Edge 扩展管理页加载本项目的 extension 文件夹，然后点击插件中的“检查连接”。'
    } else { Write-Host '组件已就绪。' -ForegroundColor Green }
} catch {
    Write-Host ('安装未完成：' + $_.Exception.Message) -ForegroundColor Red
    Write-Host '请确认网络可以访问 GitHub 和 nodejs.org；关闭浏览器后重试。详细步骤见 README.md。'
    exit 1
} finally {
    $resolvedStaging = [IO.Path]::GetFullPath($stagingRoot)
    $resolvedProject = [IO.Path]::GetFullPath($projectRoot).TrimEnd('\') + '\'
    if ($resolvedStaging.StartsWith($resolvedProject,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedStaging).StartsWith('work-install-') -and (Test-Path -LiteralPath $resolvedStaging)) {
        Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
    }
}
