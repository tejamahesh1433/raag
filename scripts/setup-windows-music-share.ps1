# Run in elevated PowerShell (Right-click -> Run as administrator)
# Creates a LAN SMB share so tejaserver can mount D:\Music\Downloads live.

$shareName = "RaagMusic"
$path = "D:\Music\Downloads"

if (-not (Test-Path $path)) { throw "Missing $path" }

if (-not (Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue)) {
  New-SmbShare -Name $shareName -Path $path -Description "Raag shared music" -FullAccess "Everyone"
} else {
  Write-Host "Share already exists"
}

Grant-SmbShareAccess -Name $shareName -AccountName "Everyone" -AccessRight Full -Force | Out-Null
Enable-NetFirewallRule -DisplayGroup "File and Printer Sharing" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Share ready: \\$env:COMPUTERNAME\$shareName"
Write-Host "From this PC LAN IP (Wi-Fi): 192.168.4.209"
Write-Host ""
Write-Host "On tejaserver (needs sudo once), run:"
Write-Host "  sudo mkdir -p /mnt/raag-music"
Write-Host "  sudo mount -t cifs //192.168.4.209/RaagMusic /mnt/raag-music -o guest,uid=1000,gid=1000,iocharset=utf8,file_mode=0644,dir_mode=0755"
Write-Host "Then set MUSIC_LIBRARY_HOST_PATH=/mnt/raag-music in ~/apps/raag/.env and recreate the container."
