# Register (or refresh) Windows Task Scheduler job for Raag music auto-sync.
# Run once: powershell -ExecutionPolicy Bypass -File "d:\music app\scripts\install-music-sync-task.ps1"

$ErrorActionPreference = "Stop"
$ScriptPath = Join-Path $PSScriptRoot "sync-music-to-server.ps1"
if (-not (Test-Path $ScriptPath)) { throw "Missing $ScriptPath" }

$taskName = "RaagMusicSync"
$arg = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg

# Every 15 minutes, start now
$triggerRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 15) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($triggerRepeat, $triggerLogon) `
  -Settings $settings -Principal $principal `
  -Description "Auto-sync D:\Music\Downloads to tejaserver Raag library every 15 minutes" | Out-Null

# Kick off first sync in background
Start-ScheduledTask -TaskName $taskName

Write-Host "Installed scheduled task: $taskName"
Write-Host "  - every 15 minutes"
Write-Host "  - at Windows logon"
Write-Host "  - log: $env:LOCALAPPDATA\Raag\music-sync.log"
Write-Host ""
Write-Host "Check:  schtasks /Query /TN $taskName /V /FO LIST"
Write-Host "Remove: Unregister-ScheduledTask -TaskName $taskName -Confirm:`$false"
