# FitnessForHealth auf dem ESP32-C6

Schlanke Variante der App für einen **ESP32-C6**: ein Benutzer, keine Bilder. Das Frontend ist in
die Firmware eingebaut; die Daten liegen im internen Flash (LittleFS) und bleiben bei Neustarts und
Firmware-Updates erhalten.

| Docker-Variante | ESP32-C6-Variante |
| --- | --- |
| mehrere Benutzer, Benutzerauswahl | ein Benutzer, optional mit Passwort |
| Bilder bei Übungen, Profilbild | keine Bilder (Symbole statt Fotos) |
| Workouts für alle freigeben | entfällt |
| Passwort in den Einstellungen änderbar | Passwort wird vor dem Flashen in `secrets.h` festgelegt |

Gleich sind: Übungen, Workouts, Stretchings, Timer mit Pieptönen, Trainingspläne samt Empfehlung,
eigene Aktivitäten, Verlauf, Themes sowie Import und Export. Exportdateien der Docker-Variante lassen
sich importieren; enthaltene Bilder werden dabei weggelassen.

## Hardware

- **ESP32-C6 mit 8 MB Flash** empfohlen, z. B. „ESP32-C6-DevKitC-1-N8“.
- Boards mit 4 MB Flash funktionieren auch, haben aber kaum Reserve für spätere Erweiterungen.
- USB-Kabel mit Datenleitungen (reine Ladekabel funktionieren nicht).
- WLAN mit **2,4 GHz** (der ESP32 kann kein 5 GHz).

## 1. WLAN-Daten eintragen

Im Ordner `esp32/FitnessForHealth/` die Datei `secrets.example.h` nach `secrets.h` kopieren und anpassen:

```c
#define WIFI_SSID "MeinWLAN"
#define WIFI_PASSWORD "MeinWLANPasswort"
#define DEVICE_NAME "fitness"   // App unter http://fitness.local
#define APP_PASSWORD ""         // leer = ohne Anmeldung
#define USER_NAME "Ich"
```

Optional lässt sich in `secrets.h` eine feste IP-Adresse eintragen (die Zeilen sind dort
vorbereitet). `secrets.h` wird nicht ins Git-Repository übernommen.

## 2a. Flashen mit der Arduino-IDE

1. Arduino-IDE 2.x installieren.
2. **Datei → Einstellungen → Zusätzliche Boardverwalter-URLs** eintragen:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. **Werkzeuge → Board → Boardverwalter**, nach „esp32“ suchen und **„esp32 von Espressif Systems“**
   in Version **3.3.0 oder neuer** installieren.
4. **Datei → Öffnen** → `esp32/FitnessForHealth/FitnessForHealth.ino`.
   Falls `secrets.h` noch fehlt: Pfeil rechts oben in der Tab-Leiste → **Neuer Tab** →
   `secrets.h`, Inhalt von `secrets.example.h` hineinkopieren und anpassen.
5. Unter **Werkzeuge** einstellen:
   - Board: **ESP32C6 Dev Module**
   - Flash Size: **8MB (64Mb)** (bzw. 4MB)
   - Partition Scheme: **8M with spiffs (3MB APP/1.5MB SPIFFS)** (bei 4 MB: **Default 4MB with spiffs**)
   - USB CDC On Boot: **Enabled**
   - Port: der Port des Boards
6. **Hochladen** (Pfeil-Button).
7. **Werkzeuge → Serieller Monitor**, 115200 Baud: Dort steht die Adresse der App.

Zusätzliche Bibliotheken sind nicht nötig.

## 2b. Flashen über die Kommandozeile (ohne IDE)

Dafür gibt es das offizielle Kommandozeilenwerkzeug **arduino-cli**.

1. arduino-cli installieren:
   - macOS: `brew install arduino-cli`
   - Linux: `curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh`
   - Windows: `winget install ArduinoSA.CLI`
2. Board per USB anschließen und den Port herausfinden:
   ```bash
   arduino-cli board list
   ```
3. **Linux/macOS:** Skript im Projektordner ausführen (installiert beim ersten Mal die
   ESP32-Unterstützung, baut und flasht):
   ```bash
   ./esp32/flash.sh /dev/ttyACM0
   ```
   Bei einem Board mit 4 MB Flash: `./esp32/flash.sh /dev/ttyACM0 4M`
4. **Windows (PowerShell):** einmalig die ESP32-Unterstützung installieren:
   ```powershell
   arduino-cli core install esp32:esp32@3.3.0 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```
   Danach bauen und flashen (`COM5` durch deinen Port ersetzen):
   ```powershell
   arduino-cli compile --fqbn "esp32:esp32:esp32c6:FlashSize=8M,PartitionScheme=default_8MB,CDCOnBoot=cdc" --upload --port COM5 esp32\FitnessForHealth
   ```
5. Adresse der App anzeigen lassen:
   ```bash
   arduino-cli monitor -p /dev/ttyACM0 -c baudrate=115200
   ```

## 3. App öffnen

Im Browser **http://fitness.local** öffnen (bzw. der in `DEVICE_NAME` gewählte Name). Klappt das
nicht (manche Android-Geräte unterstützen `.local` nicht), die IP-Adresse aus dem seriellen Monitor
oder aus der Geräteliste des Routers verwenden. Tipp: Im Router eine feste IP für den ESP32
reservieren.

## Updates und Datensicherung

- **Firmware aktualisieren:** einfach erneut flashen. Die Daten bleiben erhalten, solange das
  **Partition Scheme gleich bleibt** und „Erase All Flash Before Sketch Upload“ **deaktiviert** ist.
- **Sichern:** Menü → „Export Workouts & Stretching“ und „Export Fortschritt“. Die Dateien lassen
  sich über „Import …“ wieder einspielen, auch in die Docker-Variante.
- Speicherbelegung: `http://fitness.local/api/health` zeigt freien RAM und belegten Speicher.

## Hinweise und Grenzen

- **Bildschirm wachhalten:** Der ESP32 liefert die App über `http://` aus. Die Screen Wake Lock API
  gibt es nur über HTTPS, daher nutzt die App eine Ausweichlösung. Für zuverlässiges Wachhalten die
  automatische Bildschirmsperre am Handy abschalten.
- **Speicher:** etwa 1,5 MB für Daten. Ein Verlaufseintrag braucht rund 200 Byte; mehrere tausend
  Einheiten sind also kein Problem.
- **Gleichzeitige Zugriffe:** Der Webserver beantwortet Anfragen nacheinander. Für ein bis zwei
  Geräte gleichzeitig reicht das gut.
- **Anmeldung:** Sitzungen werden im RAM gehalten; nach einem Neustart des ESP32 ist eine erneute
  Anmeldung nötig (nur wenn `APP_PASSWORD` gesetzt ist).

## Bei Problemen

- **Upload bricht ab / Port fehlt:** Taste **BOOT** gedrückt halten, kurz **RESET** drücken, BOOT
  loslassen, Upload erneut starten.
- **Keine Ausgabe im seriellen Monitor:** „USB CDC On Boot“ muss auf **Enabled** stehen.
- **„WLAN-Verbindung fehlgeschlagen“:** SSID/Passwort in `secrets.h` prüfen; nur 2,4-GHz-Netze.
- **„Dateisystem nicht verfügbar“:** Ein Partition Scheme mit „spiffs“ wählen (siehe oben).

## Für Entwickler

### Frontend neu einbetten

Das Frontend steckt als gzip-Daten in `FitnessForHealth/web_assets.h`. Nach Änderungen im Ordner
`client/` neu erzeugen (Node.js 20+, einmalig `npm install` in `client/`):

```bash
node esp32/tools/build-web.mjs
```

Der Schalter `VITE_TARGET=esp32` blendet dabei Benutzerauswahl, Bilder, Teilen und Passwortänderung aus.

### Host-Simulation (ohne Hardware testen)

`esp32/host/` kompiliert `api.cpp` und `store.cpp` unverändert für Linux/macOS, mit kleinen
Nachbildungen von `WebServer`, `LittleFS` und `String`. Damit läuft die komplette App lokal im Browser
gegen den Firmware-Code. Voraussetzung: g++ und cJSON (`apt install libcjson-dev`).

```bash
make -C esp32/host run
```

Danach `http://localhost:8096` öffnen. Die Daten liegen in `esp32/host/data-host/`.

### Aufbau

```
FitnessForHealth/
  FitnessForHealth.ino  Sketch-Datei (Code liegt in den .cpp-Dateien)
  main.cpp              Start, WLAN, mDNS, Hauptschleife
  api.cpp               REST-API (gleiche Schnittstelle wie der Node-Server)
  store.cpp             Speicherung auf LittleFS; Verlauf als JSON-Lines
  dates.h               Kalenderrechnung für Trainingspläne
  jsonutil.h            Hilfen für cJSON (im ESP32-Core enthalten)
  web_assets.h          eingebettetes Frontend (erzeugt)
  secrets.example.h     Vorlage für WLAN-Daten
```
