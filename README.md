# Geh aufs Ganze! – Tor 1, 2 oder 3?

Inoffizielles Fan-Projekt im Stil der Spielshow: drei Tore mit Samtvorhängen, Lauflichtern und Studio-Lichtshow.
Hinter jedem Tor wartet ein Preis, der nach dem Öffnen nach vorn fliegt und sich als 3D-Objekt dreht:

| Tor | Preis |
|-----|-------|
| 1 | Silberschmuck (Kette mit Herzanhänger und Ring) |
| 2 | Der Zonk – mit „Schade, schade! 🥲“ |
| 3 | Hortensien-Blumenkranz |

**Online:** <https://loom7.github.io/geh-aufs-ganze/>

## Aufs Smartphone laden (offline)

Die Seite ist eine installierbare Web-App. Einmal installiert, startet sie vom Startbildschirm im Vollbild – auch ohne Internet.

1. <https://loom7.github.io/geh-aufs-ganze/> auf dem Handy öffnen.
2. Oben rechts auf **„App laden“** (Download-Symbol) tippen.
3. **Android (Chrome):** „Jetzt installieren“ bzw. Menü ⋮ → „App installieren“.
   **iPhone/iPad (Safari):** Teilen → „Zum Home-Bildschirm“ → „Hinzufügen“.

Sobald im Dialog „✓ Offline verfügbar“ steht, liegen alle Dateien (ca. 3 MB) auf dem Gerät.

## Technik

- Statische Seite ohne Build-Schritt – läuft direkt auf GitHub Pages
- [three.js](https://threejs.org/) r186 (WebGL, Bloom, Neutral Tone Mapping) und [GSAP](https://gsap.com/) 3.15 – lokal in `vendor/`, per Import-Map geladen
- Web-App-Manifest und Service Worker (`sw.js`) für Installation und Offline-Betrieb
- Alle 3D-Objekte werden prozedural im Code erzeugt (keine Modelldateien):
  Vorhänge mit Faltenwurf im Vertex-Shader, Zonk mit Shell-Fell, Kranz aus instanzierten Hortensienblüten
- Synthetische Sounds per Web Audio API (standardmäßig aus)
- Tastatur (`1`, `2`, `3`, `Esc`), Screenreader-Ansagen und `prefers-reduced-motion` werden unterstützt

## Lokal starten

```bash
python -m http.server 8765
```

Dann <http://localhost:8765> öffnen.

Nach Änderungen an Dateien die Offline-Liste neu erzeugen, sonst sehen installierte Apps die alte Version:

```bash
python tools/precache.py
```

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
js/install.js       „App laden“-Dialog, Service-Worker-Registrierung
sw.js               Service Worker (Offline-Cache, Liste von tools/precache.py erzeugt)
manifest.webmanifest  App-Manifest
vendor/             three.js, GSAP, Schriften (siehe vendor/README.md)
tools/              precache.py (Offline-Liste), vendor.py (Bibliotheken neu laden)
test/               Einzelansichten der Modelle
```

## Hinweis

Nicht verbunden mit Sat.1, kabel eins oder den Rechteinhabern von „Geh aufs Ganze!“. Namen und Figuren gehören ihren jeweiligen Inhabern.
