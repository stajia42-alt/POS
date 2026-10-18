$Name='Aviles Restaurante 9.2.33'
Write-Host 'RESTAURANTE 9.2.33 - ESTADO LOCAL' -ForegroundColor Cyan
$Task=Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
if($Task){Write-Host ('Inicio automatico: '+$Task.State)}else{Write-Host 'Inicio automatico: SIN REGISTRAR'}
try {
 $r=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/estado' -TimeoutSec 4
 Write-Host ('Servidor responde: '+$r.correcto+' (version interna: '+$r.version+')')
} catch {Write-Host ('Servidor no responde: '+$_.Exception.Message)}
$Cloud=Get-Service cloudflared -ErrorAction SilentlyContinue
if($Cloud){Write-Host ('Cloudflare: '+$Cloud.Status)}else{Write-Host 'Cloudflare: sin configurar'}
Write-Host 'Registros: C:\ProgramData\AvilesRestaurante933\logs'
Read-Host 'Presiona Enter para salir' | Out-Null
