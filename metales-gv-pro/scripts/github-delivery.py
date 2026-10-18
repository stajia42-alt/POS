"""Compilación y entrega por GitHub Actions, sin credenciales en el código."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import zipfile

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "metales-gv-pro"
LOGS = ROOT / "ci-logs"
ASSETS = ROOT / "release-assets"
VERSION = json.loads((APP / "package.json").read_text(encoding="utf-8"))["version"]
assert re.fullmatch(r"\d+\.\d+\.\d+", VERSION)
TAG = "metales-gv-pro-v" + VERSION
REPO = os.environ.get("GITHUB_REPOSITORY", "stajia42-alt/POS")
BRANCH = "entrega-metales-gv-pro"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def save(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def command(args, check=True):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and result.returncode:
        raise RuntimeError(f"{args[0]} terminó con código {result.returncode}: {result.stderr[-4000:]}")
    return result


def build():
    LOGS.mkdir(exist_ok=True)
    stages = [
        ("install", ["ci"]), ("syntax", ["run", "check"]), ("backend", ["test"]),
        ("chromium", ["exec", "--", "playwright", "install", "chromium"]),
        ("interface", ["run", "test:ui"]), ("electron_source", ["run", "test:desktop"]),
        ("installer", ["run", "build:win"]), ("package", ["run", "verify:package"]),
        ("electron_packaged", ["run", "test:desktop", "--", "--packaged"]),
    ]
    results = []
    for name, args in stages:
        print(f"::group::{name}", flush=True)
        started = time.monotonic()
        invocation = ["npm", *args]
        # Los argumentos son constantes definidos arriba; no se interpola entrada externa.
        if os.name == "nt":
            invocation = ["cmd.exe", "/d", "/s", "/c", subprocess.list2cmdline(invocation)]
        log = LOGS / f"{name}.log"
        with log.open("w", encoding="utf-8") as stream:
            try:
                result = subprocess.run(invocation, cwd=APP, stdout=stream, stderr=subprocess.STDOUT,
                                        timeout=1200 if name == "installer" else 600)
                code = result.returncode
            except (subprocess.TimeoutExpired, OSError) as exc:
                code = 1
                stream.write("\n" + str(exc))
        content = log.read_text(encoding="utf-8", errors="replace")
        print(content, flush=True)
        results.append({"stage": name, "exit_code": code, "seconds": round(time.monotonic() - started, 2),
                        "tail": content[-10000:] if code else content[-2000:]})
        save(LOGS / "build.json", {"success": code == 0 and len(results) == len(stages), "stages": results})
        print("::endgroup::", flush=True)
        if code:
            raise RuntimeError(f"Falló la etapa {name}; consulta ci-logs/{name}.log")


def prepare_assets():
    ASSETS.mkdir(exist_ok=True)
    original_dir = ROOT / "originales"
    for item in json.loads((original_dir / "SHA256.json").read_text(encoding="utf-8")):
        assert hashlib.sha256((original_dir / item["archivo"]).read_bytes()).hexdigest() == item["sha256"], "Original modificado: " + item["archivo"]
    with zipfile.ZipFile(original_dir / "RESTAURANTE_9_2_33_INSTALADOR_FINAL_SQL_CLOUDFLARE.zip") as original_zip:
        for item in original_zip.infolist():
            if not item.is_dir():
                assert (original_dir / item.filename).read_bytes() == original_zip.read(item), "Original extraído modificado: " + item.filename
    basename = f"METales-GV-Pro-Setup-{VERSION}-x64.exe"
    installer = ASSETS / basename
    source = APP / "dist" / basename
    assert source.stat().st_size > 20 * 1024 * 1024, "Instalador incompleto"
    with source.open("rb") as stream:
        assert stream.read(2) == b"MZ", "No es un ejecutable Windows"
    shutil.copy2(source, installer)
    project = ASSETS / f"METales-GV-Pro-Proyecto-Completo-{VERSION}.zip"
    tracked = command(["git", "ls-files", "-z"]).stdout.split("\0")
    with zipfile.ZipFile(project, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(filter(None, tracked)):
            if name == "docs/entrega-github.json" or name.startswith(("descargas/", "release-assets/", "ci-logs/")):
                continue
            file = ROOT / name
            if file.is_file():
                archive.write(file, "METales-GV-Pro/" + name)
    zipped_installer = ASSETS / f"METales-GV-Pro-Instalador-Windows-{VERSION}.zip"
    with zipfile.ZipFile(zipped_installer, "w", zipfile.ZIP_STORED) as archive:
        archive.write(installer, installer.name)
        archive.writestr("LEEME.txt", "METales-GV Pro\nExtrae y ejecuta en Windows 10/11 x64.\n"
                         "Crea tu administrador al abrir. No hay contraseña predeterminada.\n"
                         "Instalador sin firma digital. Valida tu impresora y el corte físico.\n")
    assets = [installer, zipped_installer, project]
    hashes = [{"name": p.name, "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in assets]
    checksums = ASSETS / "SHA256SUMS.txt"
    checksums.write_text("".join(a["sha256"] + "  " + a["name"] + "\n" for a in hashes), encoding="utf-8")
    assets.append(checksums)
    hashes.append({"name": checksums.name, "bytes": checksums.stat().st_size,
                   "sha256": hashlib.sha256(checksums.read_bytes()).hexdigest()})
    for file in (project, zipped_installer):
        with zipfile.ZipFile(file) as archive:
            assert archive.testzip() is None, "ZIP dañado: " + file.name
    return assets, hashes


def release_info(required=True):
    response = command(["gh", "api", f"repos/{REPO}/releases/tags/{TAG}"], check=False)
    if response.returncode:
        if not required and "HTTP 404" in response.stderr:
            return None
        raise RuntimeError("No se pudo consultar la versión: " + response.stderr[-4000:])
    return json.loads(response.stdout)


def publish():
    sha = os.environ["GITHUB_SHA"]
    assert re.fullmatch(r"[0-9a-f]{40}", sha)
    current = command(["git", "ls-remote", "origin", "refs/heads/" + BRANCH]).stdout.split()[0]
    assert current == sha, "La rama cambió durante la compilación; no se publica una versión anterior."
    assets, hashes = prepare_assets()
    notes = LOGS / "release-notes.md"
    notes.write_text(
        f"METales-GV Pro {VERSION}\n\n"
        "POS independiente para metaleras y recicladoras: SQLite, compras y ventas por kg con tara, "
        "inventario, kardex, caja MXN/USD, gastos, tickets, usuarios, reportes y respaldos.\n\n"
        "El ZIP del proyecto incluye los originales intactos y la documentación. "
        "El instalador incluye el runtime; no necesita Node.js en la PC del usuario.\n\n"
        "Validación automatizada en Windows: 30 pruebas del motor, 7 recorridos de interfaz, "
        "Electron fuente y empaquetado, compilación e integridad del paquete. "
        "Pendiente en una PC del negocio: instalación, actualización/desinstalación, "
        "impresora térmica 58/80 mm, ESC/POS y corte físico. Instalador sin firma Authenticode. "
        "Una estación local; pesaje manual.\n\n"
        f"Entrega automatizada METales-GV Pro. Commit fuente: `{sha}`.\n", encoding="utf-8")
    existing = release_info(required=False)
    if existing:
        assert existing["target_commitish"] == sha, "Ya existe una versión para otro commit; se conserva."
        assert "Entrega automatizada METales-GV Pro" in existing.get("body", ""), "Versión ajena a esta entrega."
        assert existing["draft"], "La versión ya está publicada; no se sobrescribe."
        command(["gh", "release", "upload", TAG, *map(str, assets), "--clobber", "--repo", REPO])
    else:
        command(["gh", "release", "create", TAG, *map(str, assets), "--draft", "--target", sha,
                 "--title", f"METales-GV Pro {VERSION}", "--notes-file", str(notes), "--repo", REPO])
    info = release_info()
    uploaded = {a["name"]: a for a in info["assets"]}
    for expected in hashes:
        actual = uploaded[expected["name"]]
        assert actual["size"] == expected["bytes"], "Tamaño subido incorrecto"
        if actual.get("digest"):
            assert actual["digest"] == "sha256:" + expected["sha256"], "SHA-256 subido incorrecto"
    command(["gh", "release", "edit", TAG, "--draft=false", "--repo", REPO])
    info = release_info()
    assert not info["draft"], "La versión continúa como borrador"
    uploaded = {a["name"]: a for a in info["assets"]}
    save(LOGS / "publication.json", {
        "state": "published", "tag": TAG, "source_commit": sha, "release_url": info["html_url"],
        "assets": [{**a, "download_url": uploaded[a["name"]]["browser_download_url"]} for a in hashes],
    })
    print("Publicación confirmada:", info["html_url"])


def report():
    build_result = json.loads((LOGS / "build.json").read_text(encoding="utf-8")) if (LOGS / "build.json").exists() else None
    published = json.loads((LOGS / "publication.json").read_text(encoding="utf-8")) if (LOGS / "publication.json").exists() else {}
    failure = json.loads((LOGS / "failure.json").read_text(encoding="utf-8")) if (LOGS / "failure.json").exists() else None
    status = {"state": "failed", "source_commit": os.environ["GITHUB_SHA"],
              "build_outcome": os.environ.get("BUILD_OUTCOME"), "publish_outcome": os.environ.get("PUBLISH_OUTCOME"),
              "run_url": f"https://github.com/{REPO}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
              "build": build_result, "failure": failure, **published}
    save(ROOT / "docs/entrega-github.json", status)
    command(["git", "config", "user.name", "github-actions[bot]"])
    command(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"])
    command(["git", "add", "docs/entrega-github.json"])
    command(["git", "commit", "-m", "docs: registrar resultado de entrega en GitHub"])
    command(["git", "push", "origin", f"HEAD:refs/heads/{BRANCH}"])
    print("Resultado registrado:", status["state"])


if __name__ == "__main__":
    try:
        {"build": build, "publish": publish, "report": report}[sys.argv[1]]()
    except Exception as exc:
        save(LOGS / "failure.json", {"action": sys.argv[1], "error": str(exc)})
        print(str(exc), file=sys.stderr)
        sys.exit(1)
