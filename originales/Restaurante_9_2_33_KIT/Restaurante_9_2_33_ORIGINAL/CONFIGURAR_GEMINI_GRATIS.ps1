Write-Host "Configuracion de Gemini API (solo nivel gratuito)" -ForegroundColor Cyan
Write-Host "Genera tu clave en https://aistudio.google.com/apikey en un proyecto SIN facturacion activada."
Write-Host "MODO VISIBLE: los caracteres que escribas o pegues se mostraran en pantalla." -ForegroundColor Yellow
$apiKey = Read-Host "Pega tu clave API aqui y presiona ENTER"
Write-Host ""
Write-Host "Texto recibido (visible para comprobarlo):" -ForegroundColor Cyan
Write-Host "[$apiKey]" -ForegroundColor Yellow
Write-Host ("Caracteres recibidos: " + $apiKey.Length)
if ([string]::IsNullOrWhiteSpace($apiKey)) {
  Write-Host "Entrada vacia. No se modifico la clave anterior." -ForegroundColor Red
  exit 1
}
$apiKey = $apiKey.Trim()
if ($apiKey -cnotmatch '^[A-Za-z0-9._-]{20,200}$') {
  Write-Host "Formato invalido. Asegurate de pegar solo la clave, no el nombre del proyecto ni asteriscos." -ForegroundColor Red
  Write-Host "No se guardo ni modifico la clave anterior." -ForegroundColor Yellow
  exit 1
}
[Environment]::SetEnvironmentVariable('RESTAURANTE_GEMINI_API_KEY', $apiKey, 'User')
Write-Host "Clave guardada para este usuario de Windows." -ForegroundColor Green
Write-Host "Esto solo valida el formato; NO confirma que Google acepte la clave." -ForegroundColor Yellow
Write-Host "Cierra y vuelve a abrir Restaurante. No actives facturacion si deseas gastar cero."
