"""Regenerate the precache list and version hash in sw.js.

Run from anywhere after changing site files:  python tools/precache.py
"""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
INCLUDE = ['index.html', 'manifest.webmanifest', 'css', 'js', 'assets', 'vendor']
SKIP_SUFFIXES = {'.md'}

files = []
for entry in INCLUDE:
    path = ROOT / entry
    items = [path] if path.is_file() else sorted(p for p in path.rglob('*') if p.is_file())
    files += [p for p in items if p.suffix not in SKIP_SUFFIXES and p.name not in ('LICENSE',)]

digest = hashlib.sha256()
size = 0
for p in files:
    data = p.read_bytes()
    digest.update(p.relative_to(ROOT).as_posix().encode())
    digest.update(data)
    size += len(data)

assets = ['./'] + [p.relative_to(ROOT).as_posix() for p in files]
block = (
    '/* precache:start */\n'
    f"const VERSION = '{digest.hexdigest()[:12]}';\n"
    f'const BYTES = {size};\n'
    f'const ASSETS = {json.dumps(assets, indent=2)};\n'
    '/* precache:end */'
)
sw = ROOT / 'sw.js'
text = sw.read_text(encoding='utf-8')
text, n = re.subn(r'/\* precache:start \*/.*?/\* precache:end \*/', lambda _: block, text, flags=re.S)
assert n == 1, 'precache markers not found in sw.js'
sw.write_text(text, encoding='utf-8', newline='\n')
print(f'sw.js: {len(assets)} assets, {size / 1e6:.1f} MB, version {digest.hexdigest()[:12]}')
