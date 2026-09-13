# Geh aufs Ganze! – Tor 1, 2 oder 3?

Inoffizielles Fan-Projekt im Stil der Spielshow: drei Tore mit Samtvorhängen, Lauflichtern und Studio-Lichtshow.
Hinter jedem Tor wartet ein Preis, der nach dem Öffnen nach vorn fliegt und sich als 3D-Objekt dreht:

| Tor | Preis |
|-----|-------|
| 1 | Silberschmuck (Kette mit Herzanhänger und Ring) |
| 2 | Der Zonk – mit „Schade, schade! 🥲“ |
| 3 | Hortensien-Blumenkranz |

## Technik

- Statische Seite ohne Build-Schritt – läuft direkt auf GitHub Pages
- [three.js](https://threejs.org/) r186 (WebGL, Bloom, Neutral Tone Mapping) und [GSAP](https://gsap.com/) 3.15 per Import-Map von jsDelivr
- Alle 3D-Objekte werden prozedural im Code erzeugt (keine Modelldateien):
  Vorhänge mit Faltenwurf im Vertex-Shader, Zonk mit Shell-Fell, Kranz aus instanzierten Hortensienblüten
- Synthetische Sounds per Web Audio API (standardmäßig aus)
- Tastatur (`1`, `2`, `3`, `Esc`), Screenreader-Ansagen und `prefers-reduced-motion` werden unterstützt

## Lokal starten

```bash
python -m http.server 8765
```

Dann <http://localhost:8765> öffnen.

## Struktur

```
index.html          Seite, Import-Map, UI
css/style.css       Layout, Logo, Overlays
js/main.js          Renderer, Kamera, Ablauf (Öffnen, Präsentieren, Zurücksetzen)
js/stage.js         Studio, Tore, Vorhang-Shader, Lauflichter, Funken
js/prizes.js        Hilfsfunktionen, Studio-Umgebung, Silberschmuck
js/prize-zonk.js    Zonk
js/prize-wreath.js  Blumenkranz
js/audio.js         Soundeffekte
js/confetti.js      Konfetti
test/               Einzelansichten der Modelle
```

## Hinweis

Nicht verbunden mit Sat.1, kabel eins oder den Rechteinhabern von „Geh aufs Ganze!“. Namen und Figuren gehören ihren jeweiligen Inhabern.
