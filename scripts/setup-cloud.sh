#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/cloud-env.sh
mkdir -p "$AVILES_TOOLS_ROOT" "$ANDROID_USER_HOME" "$GRADLE_USER_HOME" /workspace/.cache/downloads
task_downloads=/workspace/.cache/downloads
node -e "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"

# Install a full JDK in the writable workspace; the cloud base image has only a JRE.
if [ ! -x "$JAVA_HOME/bin/javac" ]; then
  task_repo=https://packages.microsoft.com/repos/microsoft-debian-bookworm-prod
  curl -fsSL https://packages.microsoft.com/keys/microsoft.asc -o "$task_downloads/microsoft.asc"
  mkdir -p /workspace/.cache/gnupg
  chmod 700 /workspace/.cache/gnupg
  gpg --homedir /workspace/.cache/gnupg --batch --yes --dearmor --output "$task_downloads/microsoft.gpg" "$task_downloads/microsoft.asc"
  gpg --homedir /workspace/.cache/gnupg --batch --no-default-keyring --keyring "$task_downloads/microsoft.gpg" --with-colons --fingerprint > "$task_downloads/microsoft.fingerprint"
  python3 - "$task_downloads" <<'PY'
from pathlib import Path
import sys
fingerprints=Path(sys.argv[1], 'microsoft.fingerprint').read_text()
assert 'BC528686B50D79E339D3721CEB3E94ADBE1229CF' in fingerprints, 'Unexpected Microsoft signing key'
PY
  curl -fsSL "$task_repo/dists/bookworm/InRelease" -o "$task_downloads/InRelease"
  gpg --homedir /workspace/.cache/gnupg --batch --no-default-keyring --keyring "$task_downloads/microsoft.gpg" --verify "$task_downloads/InRelease"
  curl -fsSL "$task_repo/dists/bookworm/main/binary-amd64/Packages.gz" -o "$task_downloads/Packages.gz"
  python3 - "$task_downloads" <<'PY'
from pathlib import Path
import gzip,hashlib,sys
d=Path(sys.argv[1]); package_index=d/'Packages.gz'
checksum=hashlib.sha256(package_index.read_bytes()).hexdigest()
entry=[checksum, str(package_index.stat().st_size), 'main/binary-amd64/Packages.gz']
assert any(line.strip().split()==entry for line in (d/'InRelease').read_text().splitlines()), 'Unsigned package index'
packages=gzip.decompress(package_index.read_bytes()).decode().split('\n\n')
package=next(p for p in packages if p.startswith('Package: msopenjdk-21\n') and '\nVersion: 21.0.12.1-1\n' in p)
assert '\nSHA256: 80a1d94617caa47fd4b7efef61d5ad19423cb1a6a2ffcbd170b1f39ebe230c8e\n' in package
PY
  curl -fsSL "$task_repo/pool/main/m/msopenjdk-21/msopenjdk-21_21.0.12.1-1_amd64.deb" -o "$task_downloads/jdk21.deb"
  python3 - "$task_downloads/jdk21.deb" <<'PY'
import hashlib,sys
with open(sys.argv[1],'rb') as file: checksum=hashlib.file_digest(file,'sha256').hexdigest()
assert checksum=='80a1d94617caa47fd4b7efef61d5ad19423cb1a6a2ffcbd170b1f39ebe230c8e', 'JDK checksum mismatch'
PY
  mkdir -p "$AVILES_TOOLS_ROOT/jdk21"
  dpkg-deb -x "$task_downloads/jdk21.deb" "$AVILES_TOOLS_ROOT/jdk21"
fi

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip -o "$task_downloads/android-tools.zip"
  python3 - "$task_downloads/android-tools.zip" "$ANDROID_HOME" <<'PY'
import hashlib,sys,zipfile,os
from pathlib import Path
archive=Path(sys.argv[1]); root=Path(sys.argv[2])/'cmdline-tools'
with archive.open('rb') as file: checksum=hashlib.file_digest(file,'sha1').hexdigest()
# Checksum published in Google's HTTPS repository2-1.xml.
assert checksum=='e025545c62a8e64c7559119566a569fb1dec5f60', 'Android tools checksum mismatch'
root.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as zip: zip.extractall(root/'extract')
(root/'extract'/'cmdline-tools').rename(root/'latest')
for script in (root/'latest'/'bin').iterdir(): script.chmod(0o755)
PY
fi

# Java does not automatically use HTTPS_PROXY. Reuse its host/port without copying credentials.
python3 - <<'PY'
import os
from pathlib import Path
from urllib.parse import urlsplit
proxy=urlsplit(os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') or '')
if proxy.hostname:
    if proxy.username or proxy.password: raise RuntimeError('Use platform-managed proxy authentication; do not save proxy credentials.')
    path=Path(os.environ['GRADLE_USER_HOME'])/'gradle.properties'
    content=path.read_text() if path.exists() else ''
    keys=('systemProp.https.proxyHost=', 'systemProp.https.proxyPort=', 'systemProp.http.proxyHost=', 'systemProp.http.proxyPort=')
    content='\n'.join(line for line in content.splitlines() if not line.startswith(keys))
    content+=f'\nsystemProp.https.proxyHost={proxy.hostname}\nsystemProp.https.proxyPort={proxy.port or 80}\nsystemProp.http.proxyHost={proxy.hostname}\nsystemProp.http.proxyPort={proxy.port or 80}\n'
    path.write_text(content)
PY

if [ ! -d "$ANDROID_HOME/platforms/android-36" ] || [ ! -d "$ANDROID_HOME/build-tools/36.0.0" ] || [ ! -d "$ANDROID_HOME/platform-tools" ]; then
  # Accept the Android SDK license agreements needed to compile this project.
  set +e
  set +o pipefail
  yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses > "$task_downloads/sdk-licenses.log" 2>&1
  task_sdk_result=${PIPESTATUS[1]}
  set -o pipefail
  set -e
  if [ "$task_sdk_result" -ne 0 ]; then cat "$task_downloads/sdk-licenses.log"; exit "$task_sdk_result"; fi
  sdkmanager --sdk_root="$ANDROID_HOME" 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
fi

npm ci --no-audit --no-fund
npm run android:sync
npm test
java -version
javac -version
echo 'Cloud dependencies prepared. Services must be started separately; see the saved start instructions.'
