# FitnessForHealth

Selbst gehostete Webanwendung zum Einrichten und Durchführen von Workouts und Stretching-Einheiten.
Läuft als ein einziger Docker-Container im Heimnetz und wird im Browser auf Smartphone und PC genutzt.

- **Backend:** Node.js + TypeScript (Fastify), REST-API, SQLite (better-sqlite3)
- **Frontend:** React + Vite + TypeScript, wird vom Backend als statische Dateien ausgeliefert
- **Daten:** Datenbank und Bilder liegen unter `/data` im Container (per Volume nach `./data` gemappt)

## Schnellstart

Voraussetzung: Docker mit Compose-Plugin.

```bash
git clone <repo-url> FitnessForHealth
cd FitnessForHealth
docker compose up -d --build
```

Danach im Browser öffnen: `http://<IP-des-Servers>:8095`

Beim ersten Start wird die Datenbank automatisch angelegt. Auf der Startseite legst du mit
„Benutzer hinzufügen“ den ersten Benutzer an.

### Port ändern

Der Port ist über die Umgebungsvariable `PORT` einstellbar (Standard `8095`), z. B. per `.env`-Datei
neben der `docker-compose.yml`:

```dotenv
PORT=9000
```

oder einmalig:

```bash
PORT=9000 docker compose up -d
```

### Weitere Umgebungsvariablen

| Variable     | Standard               | Bedeutung                                           |
| ------------ | ---------------------- | --------------------------------------------------- |
| `PORT`       | `8095`                 | Port des Webservers                                 |
| `DATA_DIR`   | `/data`                | Ablage von Datenbank (`fitness.db`) und `images/`   |
| `TZ`         | `Europe/Berlin`        | Zeitzone des Containers (nur für Logs relevant)     |
| `LOG_LEVEL`  | `warn`                 | `info` protokolliert zusätzlich jede Anfrage        |

## Aktualisieren

```bash
git pull
docker compose up -d --build
```

Die Daten in `./data` bleiben erhalten. Datenbank-Migrationen laufen beim Start automatisch.

## Daten sichern

Alle Daten liegen im Ordner `./data` neben der `docker-compose.yml`:

- `fitness.db` (+ `fitness.db-wal`, `fitness.db-shm`) – die SQLite-Datenbank
- `images/` – die verkleinerten Übungsbilder

**Sicherung (empfohlen, konsistent):** Container kurz stoppen, Ordner archivieren, wieder starten.

```bash
docker compose stop
tar czf fitness-backup-$(date +%F).tar.gz data
docker compose start
```

**Wiederherstellen:**

```bash
docker compose down
rm -rf data
tar xzf fitness-backup-JJJJ-MM-TT.tar.gz
docker compose up -d
```

Zusätzlich kann jeder Benutzer in der App über das Menü seine Workouts & Stretchings sowie seinen
Fortschritt als JSON-Datei exportieren und wieder importieren.

## Bedienung

- **Startseite:** Benutzer auswählen und Passwort eingeben, oder „Benutzer hinzufügen“.
- **Übersicht:** alle Workouts und Stretchings mit „Starten“ und „Bearbeiten“. Oben rechts „+“ für
  „Neues Workout“ / „Neues Stretching“, oben links das Menü.
- **Editoren:** Übungen können direkt aus der Liste ausgewählt oder neu angelegt werden. Die
  Reihenfolge ändert sich am PC per Drag & Drop (Griff ⋮⋮) oder überall mit den Pfeil-Buttons.

### Ablauf eines Workouts

Für jede Runde werden die Einträge der Reihe nach abgearbeitet, jeder Eintrag mit all seinen
Sätzen direkt hintereinander (Zirkel):

1. 5-Sekunden-Countdown „Gleich geht's los“ (Piepton jede Sekunde, höherer langer Ton zum Start)
2. Übung: Zeit läuft herunter (Piepton in den letzten 5 Sekunden) bzw. Wiederholungen + „Next“
3. Pause zwischen Übungen (auch zwischen den Sätzen eines Eintrags); am Rundenende stattdessen
   die Pause zwischen Runden. Pausen mit 0 Sekunden entfallen, nach dem letzten Satz gibt es keine.

„Überspringen“ springt während Countdown oder Übung zur nächsten Pause bzw. Übung, während einer
Pause direkt zum nächsten Countdown. Die angezeigte Gesamtdauer zählt Pausen über den
„Pause“-Button nicht mit.

### Hinweise zu Ton und Bildschirm

- Pieptöne werden per Web Audio API erzeugt. Sie werden beim Tippen auf „Start“ freigeschaltet.
  Auf dem iPhone muss der Stummschalter aus sein.
- Die **Screen Wake Lock API** funktioniert nur in sicheren Kontexten (**HTTPS** oder `localhost`).
  Wird die App im Heimnetz über `http://` geöffnet, nutzt sie eine Ausweichlösung (stummes Video)
  und zeigt einen Hinweis. Für zuverlässiges Wachhalten die App hinter einen Reverse-Proxy mit
  HTTPS stellen (z. B. Caddy, Traefik, Nginx Proxy Manager) oder die automatische Bildschirmsperre
  am Gerät abschalten.
- Der Timer rechnet mit Zeitstempeln. War der Tab kurz im Hintergrund, stimmt die Zeit danach
  trotzdem; verpasste Pieptöne werden nicht nachgeholt.

## Import / Export

Das Format ist JSON mit Versionsnummer (`"version": 1`):

- **Workouts & Stretching** (`"format": "fitnessforhealth-plans"`): Übungen, Stretching-Übungen
  (Bilder als Base64-Data-URL), Workouts und Stretchings. Verweise laufen über `key`.
- **Fortschritt** (`"format": "fitnessforhealth-progress"`): alle Ausführungen des Benutzers.

Beim Import wird die Datei geprüft und eine Vorschau angezeigt. Bei gleichnamigen Einträgen wählst
du „Überschreiben“ oder „Als Kopie“ (Name wird zu „Name (Kopie)“). Fortschritts-Einträge mit
gleichem Typ, Namen und Startzeitpunkt werden übersprungen.

## Entwicklung

Voraussetzung: Node.js 22.

```bash
cd server && npm install
```

```bash
cd client && npm install
```

Backend starten (Port 8095, Daten in `./data` im Projektordner):

```bash
cd server && npm run dev
```

Frontend mit Hot-Reload starten (leitet `/api` an Port 8095 weiter):

```bash
cd client && npm run dev
```

Tests:

```bash
cd client && npm test
```

```bash
cd server && npm test
```

- `client/src/timer/engine.test.ts` – Ablauf-Logik: Reihenfolge von Runden, Sätzen, Pausen und
  Countdowns, Zeitstempel-Rechnung, Pause/Überspringen, Pieptöne
- `server/src/api.test.ts` – Anmeldung, Datentrennung zwischen Benutzern, Bildverkleinerung,
  Import/Export

## Projektstruktur

```
server/src/
  app.ts          Fastify-App, Routen, Sitzungen
  db.ts           SQLite + Migrationen (PRAGMA user_version)
  repo.ts         Datenzugriff
  schemas.ts      Validierung (zod) inkl. Import-Format
  transfer.ts     Import/Export
  images.ts       Bild-Upload, Verkleinerung (sharp → WebP, max. 800 px)
client/src/
  timer/engine.ts Ablauf-Logik des Timers (rein, getestet)
  pages/          Seiten (Übersicht, Editoren, Durchführung, Verlauf, Import)
  audio.ts        Pieptöne (Web Audio API)
  wakeLock.ts     Bildschirm wachhalten
```

## Sicherheit

Gedacht für das Heimnetz. Passwörter werden mit bcrypt gehasht, Sitzungen laufen über ein
HttpOnly-Cookie (30 Tage). Die App nicht ungeschützt ins Internet stellen.
