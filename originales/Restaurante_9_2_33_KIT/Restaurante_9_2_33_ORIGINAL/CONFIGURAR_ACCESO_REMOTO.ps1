$ErrorActionPreference = 'Stop'
$Dir = Join-Path $env:ProgramData 'Restaurante'
if ($env:RESTAURANTE_CONFIG_DIR) { $Dir = $env:RESTAURANTE_CONFIG_DIR }
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$File = Join-Path $Dir 'acceso-remoto.txt'
if (!(Test-Path $File)) {
  $Bytes = New-Object byte[] 24
  $Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $Rng.GetBytes($Bytes) } finally { $Rng.Dispose() }
  [Convert]::ToBase64String($Bytes) | Set-Content -Path $File -Encoding ASCII
}
Write-Host 'Acceso remoto: usa tu URL HTTPS del tunel existente.'
Write-Host 'Usuario: restaurante'
Write-Host ('Clave: ' + (Get-Content -Raw $File).Trim())
Write-Host 'Guarda esta clave. No compartas acceso-remoto.txt ni conexion.json.'
Write-Host 'No se instala ni se cambia ningun tunel.'
