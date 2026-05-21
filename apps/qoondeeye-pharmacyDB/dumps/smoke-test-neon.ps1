$base = "http://localhost:5555/api"
$pass = "NeonMigrateTest!2026"

function Measure-Request {
  param([string]$Label, [scriptblock]$Action)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $result = & $Action
    $sw.Stop()
    Write-Host ("{0}: {1}ms status={2}" -f $Label, $sw.ElapsedMilliseconds, $result.StatusCode)
    return $result
  } catch {
    $sw.Stop()
    Write-Host ("{0}: {1}ms ERROR {2}" -f $Label, $sw.ElapsedMilliseconds, $_.Exception.Message)
    throw
  }
}

# Prisma / DB: list tenants
Measure-Request "GET /tenants" {
  Invoke-WebRequest -Uri "$base/tenants" -UseBasicParsing
} | Out-Null

# Login (cold)
$loginBody = @{ email = "sadaqelmi.dev@gmail.com"; password = $pass; tenant = "test" } | ConvertTo-Json
$login1 = Measure-Request "POST /auth/login (cold)" {
  Invoke-WebRequest -Uri "$base/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -UseBasicParsing
}
$token = ($login1.Content | ConvertFrom-Json).token
if (-not $token) { throw "No token from login" }

# Login (warm)
Measure-Request "POST /auth/login (warm)" {
  Invoke-WebRequest -Uri "$base/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -UseBasicParsing
} | Out-Null

$headers = @{
  Authorization = "Bearer $token"
  "X-Tenant"    = "test"
}
$qs = "from=2026-01-01&to=2026-05-21"

Measure-Request "GET executive-summary (cold)" {
  Invoke-WebRequest -Uri "$base/reports/executive-summary?$qs" -Headers $headers -UseBasicParsing
} | Out-Null

Measure-Request "GET executive-summary (warm)" {
  Invoke-WebRequest -Uri "$base/reports/executive-summary?$qs" -Headers $headers -UseBasicParsing
} | Out-Null

Measure-Request "GET dashboard-series (cold)" {
  Invoke-WebRequest -Uri "$base/reports/dashboard-series?$qs" -Headers $headers -UseBasicParsing
} | Out-Null

Measure-Request "GET dashboard-series (warm)" {
  Invoke-WebRequest -Uri "$base/reports/dashboard-series?$qs" -Headers $headers -UseBasicParsing
} | Out-Null

Measure-Request "GET profit-loss (warm)" {
  Invoke-WebRequest -Uri "$base/reports/profit-loss?$qs" -Headers $headers -UseBasicParsing
} | Out-Null

# Connection stability: 10 mixed reads
1..5 | ForEach-Object {
  Measure-Request "stability login #$_" {
    Invoke-WebRequest -Uri "$base/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -UseBasicParsing
  } | Out-Null
}
1..5 | ForEach-Object {
  Measure-Request "stability tenants #$_" {
    Invoke-WebRequest -Uri "$base/tenants" -UseBasicParsing
  } | Out-Null
}

Write-Host "Smoke tests completed successfully."
