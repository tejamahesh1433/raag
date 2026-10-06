# Incremental auto-sync: D:\Music\Downloads -> teja@192.168.4.43:~/apps/raag/library
# Safe to run repeatedly. Only uploads new/changed files, then triggers a Raag scan if needed.

$ErrorActionPreference = "Continue"
$LocalRoot = "D:\Music\Downloads"
$Remote = "teja@192.168.4.43"
$RemoteDir = "/home/teja/apps/raag/library"
$LogDir = Join-Path $env:LOCALAPPDATA "Raag"
$LogFile = Join-Path $LogDir "music-sync.log"
$AudioExt = @(".mp3", ".flac", ".m4a", ".mp4", ".aac", ".ogg", ".oga", ".opus", ".wav", ".wma", ".aiff", ".aif", ".wv")

function Write-Log([string]$msg) {
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Add-Content -Path $LogFile -Value $line
}

if (-not (Test-Path $LocalRoot)) {
  Write-Log "SKIP: local folder missing: $LocalRoot"
  exit 0
}

try {
  ssh -o BatchMode=yes -o ConnectTimeout=8 $Remote "mkdir -p '$RemoteDir'" 2>$null
  if ($LASTEXITCODE -ne 0) { throw "SSH failed (is the server reachable?)" }

  # Remote inventory: relative path <TAB> size
  $remoteRaw = ssh -o BatchMode=yes $Remote "find '$RemoteDir' -type f -printf '%P\t%s\n' 2>/dev/null"
  $remoteMap = @{}
  foreach ($line in ($remoteRaw -split "`n")) {
    $t = $line.Trim()
    if (-not $t) { continue }
    $parts = $t -split "`t", 2
    if ($parts.Count -eq 2) { $remoteMap[$parts[0].Replace('\', '/')] = [int64]$parts[1] }
  }

  $localFiles = Get-ChildItem -Path $LocalRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $AudioExt -contains $_.Extension.ToLowerInvariant() }

  $uploaded = 0
  foreach ($f in $localFiles) {
    $rel = $f.FullName.Substring($LocalRoot.Length).TrimStart('\', '/').Replace('\', '/')
    $remoteSize = $remoteMap[$rel]
    if ($null -ne $remoteSize -and $remoteSize -eq $f.Length) { continue }

    $remoteParent = Split-Path $rel -Parent
    if ($remoteParent -and $remoteParent -ne ".") {
      $remoteParentUnix = $remoteParent.Replace('\', '/')
      ssh -o BatchMode=yes $Remote "mkdir -p '$RemoteDir/$remoteParentUnix'" 2>$null | Out-Null
    }
    $dest = "${Remote}:$RemoteDir/$rel"
    # scp preserves file; quote carefully
    scp -o BatchMode=yes -q "$($f.FullName)" $dest 2>$null
    if ($LASTEXITCODE -eq 0) {
      $uploaded++
      Write-Log "UP  $rel ($([math]::Round($f.Length/1MB, 2)) MB)"
    } else {
      Write-Log "ERR failed: $rel"
    }
  }

  if ($uploaded -gt 0) {
    Write-Log "Uploaded $uploaded file(s); triggering library scan"
    ssh -o BatchMode=yes $Remote "curl -sS -X POST http://127.0.0.1:8765/api/library/scan >/dev/null" 2>$null
  } else {
    Write-Log "OK — already in sync ($($localFiles.Count) local audio files)"
  }
  exit 0
} catch {
  Write-Log "FAIL: $($_.Exception.Message)"
  exit 1
}
