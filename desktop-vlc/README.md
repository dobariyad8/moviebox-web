# One-click VLC on Windows

The MovieBox Explore page sends a URL of the form `movieboxvlc://open?url=<percent-encoded-http-or-https-stream>`. Windows and Edge/Chrome can open it **only after a desktop protocol handler has been registered**. Installing VLC alone doesn't reliably register this custom scheme.

## One-time setup
1. Install the desktop VLC app from https://www.videolan.org/vlc/.
2. Download `install-windows.ps1` from this folder. Review its code.
3. Open **PowerShell**, change to the downloaded file's folder, and run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1`.
4. Restart the browser, return to MovieBox Web → Watch Now → Select source → **Open in VLC**. If Edge asks permission to open the external app, approve it.

The installer writes a launcher into `%LOCALAPPDATA%\MovieBoxWebVLC\launch.ps1` and registers the scheme under **HKCU** only; it does not request admin rights. The launcher only passes HTTP/HTTPS URLs to a locally installed VLC executable. This is not a media proxy, transcoder, provider resolver, or guarantee that URLs needing cookies, special headers, DRM, or additional resolution will play.

## Removal
Open PowerShell:
```powershell
Remove-Item 'HKCU:\Software\Classes\movieboxvlc' -Recurse -Force
Remove-Item (Join-Path $env:LOCALAPPDATA 'MovieBoxWebVLC') -Recurse -Force
```

For macOS/Linux, the same one-click behavior needs an OS-specific URL handler registered by the user. Until one is provided, use Copy URL in the web app and open the network URL in VLC.
