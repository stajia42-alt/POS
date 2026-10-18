"""Comprobacion estatica simple; no sustituye instalar en Windows."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parent.parent
source=root/'Restaurante_9_2_33_ORIGINAL'
m=json.loads((root/'INTEGRIDAD_ORIGINAL.json').read_text(encoding='utf-8'))
for x in m:
    p=source/x['path']
    assert hashlib.sha256(p.read_bytes()).hexdigest()==x['sha256'],f"CAMBIO: {p}"
for f in ['app.js','interfaz.js','gestion.js','menu_seguridad.js','public/index.html','public/style.css','public/app.js']:
    assert (source/f).is_file(),f'Missing {f}'
for f in ['Restaurante933.iss','build.ps1','preinstall.ps1','install.ps1','run-server.ps1','uninstall.ps1','open.vbs','cloudflare.ps1','status.ps1']:
    assert (root/'installer'/f).is_file(), f'Missing installer {f}'
print(f'OK: {len(m)} archivos originales inalterados y scripts presentes')
