# Sync local Raag music folder -> tejaserver library (run anytime after adding songs)
# Usage: powershell -File sync-music-to-server.ps1

$ErrorActionPreference = "Stop"
$LocalRoot = "D:\Music\Downloads"
$Remote = "teja@192.168.4.43"
$RemoteDir = "~/apps/raag/library"

if (-not (Test-Path $LocalRoot)) {
  throw "Local music folder not found: $LocalRoot"
}

Write-Host "Syncing $LocalRoot -> ${Remote}:$RemoteDir ..."
ssh $Remote "mkdir -p $RemoteDir"
cmd /c "tar -cf - -C `"$LocalRoot`" . | ssh $Remote `"tar -xf - -C $RemoteDir`""
if ($LASTEXITCODE -ne 0) { throw "Sync failed (exit $LASTEXITCODE)" }

$remoteCount = ssh $Remote "find $RemoteDir -type f | wc -l"
Write-Host "Done. Remote file count: $remoteCount"
Write-Host "Trigger a library scan from Raag Settings (or: curl -X POST http://192.168.4.43:8765/api/library/scan)"
