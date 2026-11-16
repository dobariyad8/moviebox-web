# MovieBox Web → VLC desktop launcher (Windows)
# Run once in PowerShell on your own Windows computer.
# Registers a per-user movieboxvlc:// URL handler; no admin rights required.
$ErrorActionPreference = "Stop"
$folder = Join-Path $env:LOCALAPPDATA "MovieBoxWebVLC"
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$launcher = Join-Path $folder "launch.ps1"
$script = @'
param([string]$InputUri)
$ErrorActionPreference = "Stop"
if ($InputUri -notmatch '^movieboxvlc://open\?url=([^&#]+)$') { exit 1 }
$url = [Uri]::UnescapeDataString($Matches[1])
$parsed = $null
if (-not [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$parsed)) { exit 1 }
if ($parsed.Scheme -notin @("http","https") -or -not $parsed.Host -or $url.Contains('"') -or $url.Contains([char]0)) { exit 1 }
$paths = @(
  (Join-Path $env:ProgramFiles "VideoLAN\VLC\vlc.exe"),
  (Join-Path $env:ProgramW6432 "VideoLAN\VLC\vlc.exe")
)
$vlc = $paths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $vlc) {
  $cmd = Get-Command "vlc.exe" -ErrorAction SilentlyContinue
  if ($cmd) { $vlc = $cmd.Source }
}
if (-not $vlc) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("VLC was not found. Install VLC from videolan.org, then try again.","MovieBox VLC")
  exit 1
}
$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $vlc
$start.Arguments = '"' + $url + '"'
$start.UseShellExecute = $false
[System.Diagnostics.Process]::Start($start) | Out-Null
'@
Set-Content -Path $launcher -Value $script -Encoding UTF8
$base = "HKCU:\Software\Classes\movieboxvlc"
New-Item -Path $base -Force | Out-Null
Set-Item -Path $base -Value "URL:MovieBox VLC Stream"
New-ItemProperty -Path $base -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
$commandKey = "$base\shell\open\command"
New-Item -Path $commandKey -Force | Out-Null
$cmdLine = '"'+(Join-Path $PSHOME "powershell.exe")+'" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$launcher+'" "%1"'
Set-Item -Path $commandKey -Value $cmdLine
Write-Host "MovieBox VLC protocol registered. Restart your browser, then use Open in VLC on MovieBox Web." -ForegroundColor Green
Write-Host "To remove later, run: Remove-Item 'HKCU:\Software\Classes\movieboxvlc' -Recurse -Force"
