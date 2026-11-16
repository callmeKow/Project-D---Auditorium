$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $RepoRoot

$Host.UI.RawUI.WindowTitle = 'Virtual Music World (API + Web)'

$NodeDir = 'C:\Program Files\nodejs'
if ((Test-Path $NodeDir) -and ($env:PATH -notlike "*$NodeDir*")) {
  $env:PATH = "$NodeDir;$env:PATH"
}

function Test-PortOpen([int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(250, $false)
    if ($ok) {
      $client.EndConnect($iar)
      $client.Close()
      return $true
    }
    $client.Close()
  } catch {}
  return $false
}

$webRunning = Test-PortOpen 5173
$apiRunning = Test-PortOpen 4000

if ($webRunning -and $apiRunning) {
  Write-Host '[VMW] Web & API da chay san. Dang mo trinh duyet http://localhost:5173/ ...' -ForegroundColor Green
  Start-Process 'http://localhost:5173/'
  Start-Sleep -Seconds 2
  exit 0
}

if ($webRunning -or $apiRunning) {
  Write-Host '[VMW] Phat hien port cu bi ket (4000/5173), dang don dep truoc khi khoi dong...' -ForegroundColor Yellow
  Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -like '*Project D - Auditorium*' -or
    $_.CommandLine -like '*tools\scripts\dev.mjs*' -or
    $_.CommandLine -like '*tsx watch src/server.ts*'
  } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 500
}

if (-not (Test-Path 'node_modules')) {
  Write-Host '[VMW] Dang cai dat thu vien (npm ci)...' -ForegroundColor Yellow
  & npm.cmd ci
}

Start-Job -ScriptBlock {
  for ($i = 0; $i -lt 50; $i++) {
    try {
      $c = New-Object System.Net.Sockets.TcpClient
      $iar = $c.BeginConnect('127.0.0.1', 5173, $null, $null)
      if ($iar.AsyncWaitHandle.WaitOne(250, $false)) {
        $c.EndConnect($iar)
        $c.Close()
        Start-Process 'http://localhost:5173/'
        break
      }
      $c.Close()
    } catch {}
    Start-Sleep -Milliseconds 400
  }
} | Out-Null

Write-Host '[VMW] Dang khoi dong Virtual Music World...' -ForegroundColor Cyan
Write-Host '      Web: http://localhost:5173/   |   API: http://localhost:4000' -ForegroundColor Green
Write-Host '      (Giu cua so nay mo khi su dung app. Nhan Ctrl+C hoac tat cua so de dung server)' -ForegroundColor DarkGray
& npm.cmd run dev
