"""Vendor three.js r186 (only the modules the site uses + their deps), GSAP 3.15 and the Google Fonts into ./vendor."""
import os, re, sys, urllib.request, posixpath

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..")
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36'

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

IMPORT_RE = re.compile(r"""(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]""")

def crawl(base, entries, dest):
    todo, seen = list(entries), set()
    while todo:
        rel = todo.pop()
        if rel in seen:
            continue
        seen.add(rel)
        data = get(base + rel)
        out = os.path.join(dest, *rel.split('/'))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'wb').write(data)
        for a, b in IMPORT_RE.findall(data.decode('utf-8')):
            spec = a or b
            if spec.startswith('.'):
                todo.append(posixpath.normpath(posixpath.join(posixpath.dirname(rel), spec)))
    return sorted(seen)

three = crawl('https://cdn.jsdelivr.net/npm/three@0.186.0/', [
    'build/three.module.js',
    'examples/jsm/postprocessing/EffectComposer.js',
    'examples/jsm/postprocessing/RenderPass.js',
    'examples/jsm/postprocessing/UnrealBloomPass.js',
    'examples/jsm/postprocessing/OutputPass.js',
    'examples/jsm/postprocessing/ShaderPass.js',
    'examples/jsm/postprocessing/FilmPass.js',
    'examples/jsm/shaders/VignetteShader.js',
    'examples/jsm/capabilities/WebGL.js',
    'examples/jsm/geometries/RoundedBoxGeometry.js',
    'examples/jsm/utils/BufferGeometryUtils.js',
], os.path.join(ROOT, 'vendor', 'three'))
open(os.path.join(ROOT, 'vendor', 'three', 'LICENSE'), 'wb').write(get('https://cdn.jsdelivr.net/npm/three@0.186.0/LICENSE'))
print('three', len(three), three)

gsap = crawl('https://cdn.jsdelivr.net/npm/gsap@3.15.0/', ['index.js', 'CustomEase.js'], os.path.join(ROOT, 'vendor', 'gsap'))
open(os.path.join(ROOT, 'vendor', 'gsap', 'README.md'), 'wb').write(get('https://cdn.jsdelivr.net/npm/gsap@3.15.0/README.md'))
print('gsap', gsap)

# ---- fonts: keep only latin + latin-ext subsets ----
fonts_dir = os.path.join(ROOT, 'vendor', 'fonts')
os.makedirs(fonts_dir, exist_ok=True)
css = get('https://fonts.googleapis.com/css2?family=Bungee&family=Manrope:wght@400;600;800&family=Titan+One&display=swap').decode()
blocks = re.findall(r'/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*{[^}]*})', css)
out_css, n = [], 0
for subset, block in blocks:
    if subset not in ('latin', 'latin-ext'):
        continue
    fam = re.search(r"font-family:\s*'([^']+)'", block).group(1)
    weight = re.search(r'font-weight:\s*(\d+)', block).group(1)
    url = re.search(r'url\((https://[^)]+)\)', block).group(1)
    name = f"{fam.lower().replace(' ', '-')}-{weight}-{subset}.woff2"
    path = os.path.join(fonts_dir, name)
    if not os.path.exists(path):
        open(path, 'wb').write(get(url))
    out_css.append(f'/* {subset} */\n' + block.replace(url, name))
    n += 1
emoji_css = get('https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&text=%F0%9F%A5%B2&display=swap').decode()
for block in re.findall(r'@font-face\s*{[^}]*}', emoji_css):
    url = re.search(r'url\((https://[^)]+)\)', block).group(1)
    open(os.path.join(fonts_dir, 'noto-color-emoji-tear.woff2'), 'wb').write(get(url))
    block = re.sub(r"url\(https://[^)]+\)\s*format\('[^']+'\)", "url(noto-color-emoji-tear.woff2) format('woff2')", block)
    block = block.replace('}', '  unicode-range: U+1F972;\n}')
    out_css.append('/* Noto Color Emoji, subset: 🥲 only */\n' + block)
open(os.path.join(fonts_dir, 'fonts.css'), 'w', encoding='utf-8').write('\n'.join(out_css) + '\n')
print('fonts', n, 'faces + emoji')
