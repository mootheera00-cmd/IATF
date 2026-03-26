Write-Host 'Stopping Node.js processes...'
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

Write-Host 'Stopping Python processes on ports 4019 (Plan PT) and 8000 (Plan HUB)...'
foreach ($port in @(4019, 8000)) {
  $pids = (netstat -ano 2>&1 |
    Select-String "LISTENING" |
    Where-Object { $_ -match ":$port\s" } |
    ForEach-Object { ($_ -split '\s+')[-1] }) | Select-Object -Unique
  foreach ($pid in $pids) {
    if ($pid -match '^\d+$') {
      $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
      if ($proc -and $proc.Name -like 'python*') {
        Write-Host "   Stopping $($proc.Name) (PID $pid) on port $port"
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

Write-Host 'Done.'
