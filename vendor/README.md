# Mitgelieferte Bibliotheken

Lokale Kopien, damit die Seite ohne CDN und offline (als installierte App) läuft.

| Ordner | Quelle | Lizenz |
|--------|--------|--------|
| `three/` | [three.js](https://github.com/mrdoob/three.js) 0.186.0 – nur die genutzten Module | MIT (siehe `three/LICENSE`) |
| `gsap/` | [GSAP](https://gsap.com/) 3.15.0 – Core, CSSPlugin, CustomEase | GSAP Standard License, kostenlos (siehe `gsap/README.md`) |
| `fonts/` | Google Fonts: Bungee, Manrope, Titan One, Noto Color Emoji (nur 🥲) – Latin/Latin-Ext | SIL Open Font License 1.1 |

Neu laden: `python tools/vendor.py .` im Projektordner ausführen,
danach `python tools/precache.py` ausführen.
